/**
 * Offline sanity harness (dev only): feeds synthetic price series through the
 * real engine + fill model into a scratch DATA_DIR and asserts:
 *  - the fill model always worsens the price and charges fees
 *  - UT Bot goes long on a sustained uptrend and exits on the downtrend
 *  - HODL buys exactly once (modulo random fill failures)
 *
 * Usage: npm run simulate
 */

import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runTick } from './engine/engine.js';
import { loadState, loadTrades } from './engine/state.js';
import { applyFill, FEE_PER_SIDE_PCT, MIN_SLIPPAGE_PCT } from './fills/pessimistic.js';
import { loadStrategies } from './strategies/index.js';
import type { PricePoint } from './types.js';

// --- 1. Fill model invariants (direct, deterministic checks) ---------------
{
  let filled = 0;
  let failed = 0;
  for (let i = 0; i < 500; i++) {
    const res = applyFill({ side: 'buy', sizeUsdc: 100 }, 150, 0.001, `seed-${i}`);
    if (res.failed) {
      failed++;
      continue;
    }
    filled++;
    assert(res.fillPrice > 150, 'buy fill must be worse (higher) than mid');
    assert(res.slippagePct >= MIN_SLIPPAGE_PCT, 'slippage floor 0.15%');
    assert(res.feeUsdc === 100 * FEE_PER_SIDE_PCT, 'buy fee charged');
    assert(res.txCostSol > 0, 'tx cost charged');
    const sell = applyFill({ side: 'sell', sizeSol: 1 }, 150, 0.001, `seed-s-${i}`);
    if (!sell.failed) {
      assert(sell.fillPrice < 150, 'sell fill must be worse (lower) than mid');
      assert(sell.usdcDelta < 150, 'sell proceeds reduced by slippage+fee');
    }
    // Determinism: same seed, same outcome.
    const again = applyFill({ side: 'buy', sizeUsdc: 100 }, 150, 0.001, `seed-${i}`);
    assert.deepStrictEqual(again, res, 'fill model must be deterministic per seed');
  }
  const failRate = failed / (filled + failed);
  assert(failRate > 0.04 && failRate < 0.12, `failure rate ~8%, got ${failRate}`);
  console.log(`[sim] fill model OK (${filled} fills, ${failed} failures, rate ${(failRate * 100).toFixed(1)}%)`);
}

// --- 2. End-to-end engine run on a synthetic trend ---------------------------
const scratch = mkdtempSync(join(tmpdir(), 'solbot-sim-'));
process.env.DATA_DIR = scratch;

const entries = loadStrategies();
const series: PricePoint[] = [];
const t0 = Date.UTC(2026, 0, 1);
let mid = 100;
for (let i = 0; i < 200; i++) {
  // 60 flat ticks (warm-up), 70 up ~+0.8%/tick, 70 down ~-0.8%/tick
  if (i >= 60 && i < 130) mid *= 1.008;
  else if (i >= 130) mid *= 0.992;
  series.push({ ts: t0 + i * 15 * 60_000, mid, spreadPct: 0.0005 });
}
for (const p of series) runTick(entries, p);

const state = loadState();
const ut = state.strategies['ut-bot']!;
const hodl = state.strategies['hodl']!;
const utTrades = loadTrades('ut-bot').filter((t) => !t.failed);
const hodlTrades = loadTrades('hodl').filter((t) => !t.failed);

assert(hodlTrades.length === 1 && hodlTrades[0]!.side === 'buy', 'HODL buys exactly once');
assert(hodl.portfolio.sol > 0, 'HODL holds SOL');
assert(utTrades.some((t) => t.side === 'buy'), 'UT Bot entered on the uptrend');
assert(utTrades.some((t) => t.side === 'sell'), 'UT Bot exited on the downtrend');
assert(ut.closedTrades >= 1, 'UT Bot closed at least one cycle');
console.log(
  `[sim] engine OK — UT Bot: ${utTrades.length} fills, ${ut.closedTrades} closed, ${ut.wins} wins, ` +
    `${ut.failedOrders} failed orders, final equity ${(ut.portfolio.sol + ut.portfolio.usdc / mid).toFixed(4)} SOL; ` +
    `HODL final equity ${(hodl.portfolio.sol + hodl.portfolio.usdc / mid).toFixed(4)} SOL`,
);

rmSync(scratch, { recursive: true, force: true });
console.log('[sim] all assertions passed');
