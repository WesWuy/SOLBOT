/**
 * Pessimistic fill model — REQUIRED for every simulated fill (non-negotiable).
 *
 * Applies, always against the trader:
 *  - slippage: quoted mid worsened by max(0.15%, spread estimate)
 *  - fee: 0.35% round-trip equivalent (0.175% per side) + fixed 0.0002 SOL tx cost
 *  - failure: 8% of orders randomly fail (skipped, logged)
 *
 * The failure roll uses a PRNG seeded on (tick timestamp, strategy id) so a
 * re-run of the same tick reproduces the same outcome.
 */

import type { FillResult } from '../types.js';

export const MIN_SLIPPAGE_PCT = 0.0015; // 0.15%
export const FEE_PER_SIDE_PCT = 0.00175; // 0.35% round-trip equivalent
export const TX_COST_SOL = 0.0002;
export const FAILURE_RATE = 0.08;

/** xmur3 string hash -> 32-bit seed. */
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface OrderIntent {
  side: 'buy' | 'sell';
  /** For buys: USDC to spend. */
  sizeUsdc?: number;
  /** For sells: SOL to sell. */
  sizeSol?: number;
}

/**
 * Simulate an order fill against the current quote.
 * @param seed unique per (tick, strategy), e.g. `${ts}:${strategyId}`
 */
export function applyFill(
  intent: OrderIntent,
  mid: number,
  spreadPct: number,
  seed: string,
): FillResult {
  const rng = mulberry32(hashSeed(seed));
  if (rng() < FAILURE_RATE) {
    return { failed: true, side: intent.side, reason: 'random-failure' };
  }

  const slippagePct = Math.max(MIN_SLIPPAGE_PCT, spreadPct);

  if (intent.side === 'buy') {
    const usdcIn = intent.sizeUsdc ?? 0;
    const fillPrice = mid * (1 + slippagePct); // pay more than mid
    const feeUsdc = usdcIn * FEE_PER_SIDE_PCT;
    const solOut = (usdcIn - feeUsdc) / fillPrice;
    return {
      failed: false,
      side: 'buy',
      fillPrice,
      solDelta: solOut - TX_COST_SOL,
      usdcDelta: -usdcIn,
      feeUsdc,
      txCostSol: TX_COST_SOL,
      slippagePct,
    };
  }

  const solIn = intent.sizeSol ?? 0;
  const fillPrice = mid * (1 - slippagePct); // receive less than mid
  const gross = solIn * fillPrice;
  const feeUsdc = gross * FEE_PER_SIDE_PCT;
  return {
    failed: false,
    side: 'sell',
    fillPrice,
    solDelta: -solIn - TX_COST_SOL,
    usdcDelta: gross - feeUsdc,
    feeUsdc,
    txCostSol: TX_COST_SOL,
    slippagePct,
  };
}
