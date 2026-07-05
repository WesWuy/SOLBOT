/**
 * Persistence for engine state, price history, equity curves and trade logs.
 * Everything lives under DATA_DIR (default ./data) as plain JSON so the
 * dashboard and Actions commits can consume it directly.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  STATE_VERSION,
  STARTING_USDC,
  type EngineState,
  type EquityPoint,
  type PricePoint,
  type StrategyState,
  type TradeRecord,
} from '../types.js';

/** ~60 days of 15-min samples. */
export const MAX_PRICE_POINTS = 6000;
export const MAX_EQUITY_POINTS = 6000;
export const MAX_TRADE_RECORDS = 2000;

export function dataDir(): string {
  return process.env.DATA_DIR ?? join(process.cwd(), 'data');
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 1) + '\n', 'utf8');
}

export function loadState(): EngineState {
  const state = readJson<EngineState>(join(dataDir(), 'state.json'), {
    version: STATE_VERSION,
    startedAt: null,
    lastRun: null,
    strategies: {},
  });
  // v1 -> v2: win accounting moved from SOL-equity snapshots to per-cycle
  // USDC cashflow (cycleStartEquitySol replaced by spent/received).
  if (state.version < 2) {
    for (const s of Object.values(state.strategies)) {
      const legacy = s as StrategyState & { cycleStartEquitySol?: number | null };
      delete legacy.cycleStartEquitySol;
      s.cycleUsdcSpent ??= 0;
      s.cycleUsdcReceived ??= 0;
    }
    state.version = 2;
  }
  return state;
}

export function initStrategyState(state: EngineState, id: string): StrategyState {
  let s = state.strategies[id];
  if (!s) {
    s = {
      portfolio: { sol: 0, usdc: STARTING_USDC },
      cycleUsdcSpent: 0,
      cycleUsdcReceived: 0,
      closedTrades: 0,
      wins: 0,
      failedOrders: 0,
    };
    state.strategies[id] = s;
  }
  return s;
}

export function saveState(state: EngineState): void {
  mkdirSync(dataDir(), { recursive: true });
  writeJson(join(dataDir(), 'state.json'), state);
}

export function loadPrices(): PricePoint[] {
  return readJson<PricePoint[]>(join(dataDir(), 'prices.json'), []);
}

export function savePrices(prices: PricePoint[]): void {
  mkdirSync(dataDir(), { recursive: true });
  writeJson(join(dataDir(), 'prices.json'), prices.slice(-MAX_PRICE_POINTS));
}

export function appendEquity(id: string, point: EquityPoint): EquityPoint[] {
  const dir = join(dataDir(), 'equity');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.json`);
  const series = readJson<EquityPoint[]>(path, []);
  series.push(point);
  const capped = series.slice(-MAX_EQUITY_POINTS);
  writeJson(path, capped);
  return capped;
}

export function loadEquity(id: string): EquityPoint[] {
  return readJson<EquityPoint[]>(join(dataDir(), 'equity', `${id}.json`), []);
}

export function appendTrade(id: string, trade: TradeRecord): void {
  const dir = join(dataDir(), 'trades');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.json`);
  const trades = readJson<TradeRecord[]>(path, []);
  trades.push(trade);
  writeJson(path, trades.slice(-MAX_TRADE_RECORDS));
}

export function loadTrades(id: string): TradeRecord[] {
  return readJson<TradeRecord[]>(join(dataDir(), 'trades', `${id}.json`), []);
}

export function writeSummary(summary: unknown): void {
  mkdirSync(dataDir(), { recursive: true });
  writeJson(join(dataDir(), 'summary.json'), summary);
}
