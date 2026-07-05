/**
 * Builds data/summary.json — the leaderboard the dashboard renders.
 * Equity curves and trade logs are already persisted per-strategy by the
 * engine; this aggregates SOL-denominated performance vs the HODL control.
 */

import type { StrategyEntry } from '../engine/engine.js';
import { loadEquity, loadTrades, writeSummary } from '../engine/state.js';
import type { EngineState, EquityPoint } from '../types.js';

export const MIN_TRADES_FOR_VALIDITY = 30;

function maxDrawdownPct(series: EquityPoint[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const p of series) {
    peak = Math.max(peak, p.equitySol);
    if (peak > 0) maxDd = Math.max(maxDd, (peak - p.equitySol) / peak);
  }
  return maxDd * 100;
}

export interface SummaryRow {
  id: string;
  name: string;
  equitySol: number;
  equityUsdc: number;
  vsHodlPct: number | null;
  closedTrades: number;
  totalOrders: number;
  failedOrders: number;
  winRatePct: number | null;
  maxDrawdownPct: number;
  statisticallyValid: boolean;
  isBenchmark: boolean;
}

export function writeReport(state: EngineState, entries: StrategyEntry[], price: number): void {
  const rows: SummaryRow[] = [];
  let hodlEquity: number | null = null;

  for (const { strategy } of entries) {
    const s = state.strategies[strategy.id];
    if (!s) continue;
    const equity = loadEquity(strategy.id);
    const trades = loadTrades(strategy.id);
    const equitySol = s.portfolio.sol + s.portfolio.usdc / price;
    if (strategy.id === 'hodl') hodlEquity = equitySol;

    rows.push({
      id: strategy.id,
      name: strategy.name,
      equitySol,
      equityUsdc: equitySol * price,
      vsHodlPct: null, // filled below once hodl equity is known
      closedTrades: s.closedTrades,
      totalOrders: trades.length,
      failedOrders: s.failedOrders,
      winRatePct: s.closedTrades > 0 ? (s.wins / s.closedTrades) * 100 : null,
      maxDrawdownPct: maxDrawdownPct(equity),
      statisticallyValid: s.closedTrades >= MIN_TRADES_FOR_VALIDITY,
      isBenchmark: strategy.id === 'hodl' || strategy.id === 'dca',
    });
  }

  for (const row of rows) {
    if (hodlEquity && hodlEquity > 0 && row.id !== 'hodl') {
      row.vsHodlPct = ((row.equitySol - hodlEquity) / hodlEquity) * 100;
    }
  }
  rows.sort((a, b) => b.equitySol - a.equitySol);

  writeSummary({
    generatedAt: Date.now(),
    startedAt: state.startedAt,
    price,
    minTradesForValidity: MIN_TRADES_FOR_VALIDITY,
    strategies: rows,
  });
}
