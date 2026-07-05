/**
 * Core contracts for the SOLBOT paper-trading lab.
 *
 * FROZEN after build-order step 1: the remaining 10 strategies are written
 * against exactly these types. Do not change shapes without bumping
 * STATE_VERSION and migrating data/state.json.
 */

export const STATE_VERSION = 2;

/** One price sample per engine tick (~15 min via Actions cron). */
export interface PricePoint {
  /** Unix ms of the quote fetch. */
  ts: number;
  /** Mid price in USDC per SOL, averaged from both quote directions. */
  mid: number;
  /** Estimated spread as a fraction (0.001 = 0.1%). Never negative. */
  spreadPct: number;
}

export interface PortfolioState {
  sol: number;
  usdc: number;
}

export type Signal =
  | { action: 'buy'; sizeUsdc: number; reason: string }
  | { action: 'sell'; sizeSol: number; reason: string }
  | { action: 'hold' };

export interface TickContext {
  /** Full price history, oldest first, including the current tick (last element). */
  prices: PricePoint[];
  /** Current mid price (== prices[prices.length - 1].mid). */
  price: number;
  portfolio: Readonly<PortfolioState>;
  /** Parameters loaded from config/strategies/<id>.json. */
  params: Record<string, unknown>;
}

export interface Strategy {
  id: string;
  name: string;
  /** Pure decision function: no I/O, no state mutation, no randomness. */
  decide(ctx: TickContext): Signal;
}

/** Result of pushing an order intent through the pessimistic fill model. */
export type FillResult =
  | {
      failed: false;
      side: 'buy' | 'sell';
      /** Price actually paid/received after slippage, USDC per SOL. */
      fillPrice: number;
      /** SOL delta applied to the portfolio (positive on buy, negative on sell). */
      solDelta: number;
      /** USDC delta applied to the portfolio (negative on buy, positive on sell). */
      usdcDelta: number;
      feeUsdc: number;
      txCostSol: number;
      slippagePct: number;
    }
  | { failed: true; side: 'buy' | 'sell'; reason: 'random-failure' };

/** Trade log entry; failed orders are logged too. */
export interface TradeRecord {
  ts: number;
  side: 'buy' | 'sell';
  mid: number;
  failed: boolean;
  fillPrice?: number;
  solDelta?: number;
  usdcDelta?: number;
  feeUsdc?: number;
  txCostSol?: number;
  slippagePct?: number;
  reason: string;
  portfolioAfter: PortfolioState;
}

/**
 * Per-strategy persistent state (data/state.json).
 *
 * Win accounting is USDC-denominated per cycle: a cycle opens when a buy
 * takes the portfolio from flat to long and closes when a sell returns it to
 * flat; it is a win if the sells brought back more USDC than the buys spent.
 * (SOL-denominated equity at the instant a cycle closes is path-independent
 * and always ≈ break-even minus fees, so it cannot define a win.)
 */
export interface StrategyState {
  portfolio: PortfolioState;
  /** USDC spent on buys during the currently open cycle. */
  cycleUsdcSpent: number;
  /** USDC received from sells during the currently open cycle. */
  cycleUsdcReceived: number;
  closedTrades: number;
  wins: number;
  failedOrders: number;
}

export interface EngineState {
  version: number;
  startedAt: number | null;
  lastRun: number | null;
  strategies: Record<string, StrategyState>;
}

export interface EquityPoint {
  ts: number;
  equitySol: number;
  price: number;
}

export const STARTING_USDC = 1000;
/** Below this SOL balance a strategy is considered flat. */
export const DUST_SOL = 0.001;
/** Ignore buy intents below this USDC size. */
export const MIN_ORDER_USDC = 1;
