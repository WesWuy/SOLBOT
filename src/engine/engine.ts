/**
 * The single simulation engine: one tick = fetch/receive a price point, let
 * every registered strategy decide, push intents through the pessimistic fill
 * model, update portfolios, and persist equity curves + trade logs.
 */

import { applyFill } from '../fills/pessimistic.js';
import {
  DUST_SOL,
  MIN_ORDER_USDC,
  type EngineState,
  type PricePoint,
  type Signal,
  type Strategy,
  type StrategyState,
  type TradeRecord,
} from '../types.js';
import {
  appendEquity,
  appendTrade,
  initStrategyState,
  loadPrices,
  loadState,
  savePrices,
  saveState,
} from './state.js';

export interface StrategyEntry {
  strategy: Strategy;
  params: Record<string, unknown>;
}

export interface TickOutcome {
  price: PricePoint;
  events: string[];
}

function equitySol(s: StrategyState, price: number): number {
  return s.portfolio.sol + s.portfolio.usdc / price;
}

/** Clamp a raw signal to what the portfolio can actually afford. */
function normalizeSignal(sig: Signal, s: StrategyState): Signal {
  if (sig.action === 'buy') {
    const size = Math.min(sig.sizeUsdc, s.portfolio.usdc);
    if (!(size >= MIN_ORDER_USDC)) return { action: 'hold' };
    return { ...sig, sizeUsdc: size };
  }
  if (sig.action === 'sell') {
    const size = Math.min(sig.sizeSol, s.portfolio.sol);
    if (!(size >= DUST_SOL)) return { action: 'hold' };
    return { ...sig, sizeSol: size };
  }
  return sig;
}

/**
 * Run one tick against an already-fetched price point.
 * Persists prices, state, equity and trades under DATA_DIR.
 */
export function runTick(entries: StrategyEntry[], price: PricePoint): TickOutcome {
  const state: EngineState = loadState();
  const prices = loadPrices();
  prices.push(price);
  const events: string[] = [];

  if (state.startedAt === null) state.startedAt = price.ts;
  state.lastRun = price.ts;

  for (const { strategy, params } of entries) {
    const s = initStrategyState(state, strategy.id);
    const raw = strategy.decide({
      prices,
      price: price.mid,
      portfolio: { ...s.portfolio },
      params,
    });
    const sig = normalizeSignal(raw, s);

    if (sig.action !== 'hold') {
      const wasFlat = s.portfolio.sol < DUST_SOL;
      const fill = applyFill(
        sig.action === 'buy'
          ? { side: 'buy', sizeUsdc: sig.sizeUsdc }
          : { side: 'sell', sizeSol: sig.sizeSol },
        price.mid,
        price.spreadPct,
        `${price.ts}:${strategy.id}`,
      );

      if (fill.failed) {
        s.failedOrders += 1;
        appendTrade(strategy.id, {
          ts: price.ts,
          side: fill.side,
          mid: price.mid,
          failed: true,
          reason: `${sig.reason} (order failed: ${fill.reason})`,
          portfolioAfter: { ...s.portfolio },
        });
        events.push(`${strategy.id}: ${fill.side} FAILED (${sig.reason})`);
      } else {
        s.portfolio.sol += fill.solDelta;
        s.portfolio.usdc += fill.usdcDelta;
        // tx cost can push a flat portfolio fractionally negative; floor at 0
        if (s.portfolio.sol < 0) s.portfolio.sol = 0;
        if (s.portfolio.usdc < 0) s.portfolio.usdc = 0;

        const isFlat = s.portfolio.sol < DUST_SOL;
        if (fill.side === 'buy') {
          if (wasFlat) {
            // new cycle opens
            s.cycleUsdcSpent = 0;
            s.cycleUsdcReceived = 0;
          }
          s.cycleUsdcSpent += -fill.usdcDelta;
        } else {
          s.cycleUsdcReceived += fill.usdcDelta;
          if (isFlat) {
            // cycle closed: win iff the sells returned more USDC than the buys spent
            s.closedTrades += 1;
            if (s.cycleUsdcReceived > s.cycleUsdcSpent) s.wins += 1;
            s.cycleUsdcSpent = 0;
            s.cycleUsdcReceived = 0;
          }
        }

        appendTrade(strategy.id, {
          ts: price.ts,
          side: fill.side,
          mid: price.mid,
          failed: false,
          fillPrice: fill.fillPrice,
          solDelta: fill.solDelta,
          usdcDelta: fill.usdcDelta,
          feeUsdc: fill.feeUsdc,
          txCostSol: fill.txCostSol,
          slippagePct: fill.slippagePct,
          reason: sig.reason,
          portfolioAfter: { ...s.portfolio },
        });
        events.push(
          `${strategy.id}: ${fill.side} @ ${fill.fillPrice.toFixed(2)} (${sig.reason})`,
        );
      }
    }

    appendEquity(strategy.id, {
      ts: price.ts,
      equitySol: equitySol(s, price.mid),
      price: price.mid,
    });
  }

  savePrices(prices);
  saveState(state);
  return { price, events };
}
