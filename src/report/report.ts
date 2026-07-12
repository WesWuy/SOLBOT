/**
 * Builds data/summary.json — the leaderboard the dashboard renders.
 * Equity curves and trade logs are already persisted per-strategy by the
 * engine; this aggregates SOL-denominated performance vs the HODL control.
 */

import type { StrategyEntry } from '../engine/engine.js';
import { loadEquity, loadPrices, loadTrades, writeSummary } from '../engine/state.js';
import type { EngineState, EquityPoint } from '../types.js';

export const MIN_TRADES_FOR_VALIDITY = 30;
export const GATE_DAYS = 60;

/**
 * Ticks of price history each strategy needs before it can emit a signal,
 * derived from the default params in config/strategies/*.json. Used only for
 * the dashboard's warm-up badge — the strategies themselves hold until ready.
 */
const WARMUP_TICKS: Record<string, number> = {
  'ut-bot': 12,
  'stoch-rsi': 35,
  'ema-cross': 22,
  donchian: 21,
  bollinger: 20,
  rsi: 15,
  macd: 36,
  vwap: 96,
  momentum: 13,
  grid: 1,
  dca: 1,
  hodl: 1,
};

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
  warmupTicks: number;
  isWarmingUp: boolean;
}

/** Sampling-cadence health over the trailing 24h, for the dashboard. */
export interface TickHealth {
  samplesLast24h: number;
  expectedSamplesPer24h: number;
  medianGapMin: number | null;
}

function tickHealth(now: number): TickHealth {
  const dayAgo = now - 24 * 3_600_000;
  const recent = loadPrices().filter((p) => p.ts >= dayAgo);
  const gaps = recent
    .slice(1)
    .map((p, i) => (p.ts - recent[i]!.ts) / 60_000)
    .sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median =
    gaps.length === 0
      ? null
      : gaps.length % 2
        ? gaps[mid]!
        : (gaps[mid - 1]! + gaps[mid]!) / 2;
  return {
    samplesLast24h: recent.length,
    expectedSamplesPer24h: 96,
    medianGapMin: median === null ? null : Math.round(median * 10) / 10,
  };
}

export function writeReport(state: EngineState, entries: StrategyEntry[], price: number): void {
  const rows: SummaryRow[] = [];
  let hodlEquity: number | null = null;
  const priceCount = loadPrices().length;

  for (const { strategy } of entries) {
    const s = state.strategies[strategy.id];
    if (!s) continue;
    const equity = loadEquity(strategy.id);
    const trades = loadTrades(strategy.id);
    const equitySol = s.portfolio.sol + s.portfolio.usdc / price;
    if (strategy.id === 'hodl') hodlEquity = equitySol;
    const warmupTicks = WARMUP_TICKS[strategy.id] ?? 1;

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
      warmupTicks,
      isWarmingUp: priceCount < warmupTicks,
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
    priceCount,
    gateDays: GATE_DAYS,
    minTradesForValidity: MIN_TRADES_FOR_VALIDITY,
    tickHealth: tickHealth(Date.now()),
    strategies: rows,
  });
}
