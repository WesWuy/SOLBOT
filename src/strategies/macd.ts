/**
 * Strategy #7 — MACD signal cross.
 *
 * Hypothesis: MACD (EMA12 - EMA26) crossing its 9-period signal line detects
 * momentum shifts earlier than a plain EMA cross because it differentiates the
 * two averages. Long while MACD > signal, flat otherwise. Should win in trends
 * with orderly momentum build-ups; should lose to HODL in low-volatility chop
 * where MACD hugs the signal line and each false cross costs the 0.35%
 * round-trip fee + slippage.
 *
 * State-based (not cross-only): long state = MACD > signal, so a randomly
 * failed order retries next tick while the state persists.
 */

import type { Strategy } from '../types.js';
import { DUST_SOL } from '../types.js';

/** Full EMA series; NaN until index >= period - 1. Seeded with SMA of first `period`. */
function emaSeries(values: number[], period: number): number[] {
  const n = values.length;
  const out: number[] = new Array(n).fill(NaN);
  if (n < period) return out;
  let ema = 0;
  for (let i = 0; i < period; i++) ema += values[i]!;
  ema /= period;
  out[period - 1] = ema;
  const k = 2 / (period + 1);
  for (let i = period; i < n; i++) {
    ema = values[i]! * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

export const macd: Strategy = {
  id: 'macd',
  name: 'MACD signal cross',
  decide({ prices, portfolio, params }) {
    const fastPeriod = Number(params.fastPeriod ?? 12);
    const slowPeriod = Number(params.slowPeriod ?? 26);
    const signalPeriod = Number(params.signalPeriod ?? 9);

    if (prices.length < slowPeriod + signalPeriod + 1) return { action: 'hold' }; // warming up

    const closes = prices.map((p) => p.mid);
    const fast = emaSeries(closes, fastPeriod);
    const slow = emaSeries(closes, slowPeriod);

    // MACD line exists from slowPeriod-1 onward; EMA the non-NaN tail.
    const macdLine: number[] = [];
    for (let i = slowPeriod - 1; i < closes.length; i++) {
      macdLine.push(fast[i]! - slow[i]!);
    }
    const signalSeries = emaSeries(macdLine, signalPeriod);
    const m = macdLine[macdLine.length - 1]!;
    const s = signalSeries[signalSeries.length - 1]!;
    if (Number.isNaN(m) || Number.isNaN(s)) return { action: 'hold' };

    const isLong = portfolio.sol >= DUST_SOL;

    if (!isLong && m > s) {
      return {
        action: 'buy',
        sizeUsdc: portfolio.usdc,
        reason: `MACD ${m.toFixed(3)} above signal ${s.toFixed(3)}`,
      };
    }
    if (isLong && m < s) {
      return {
        action: 'sell',
        sizeSol: portfolio.sol,
        reason: `MACD ${m.toFixed(3)} below signal ${s.toFixed(3)}`,
      };
    }
    return { action: 'hold' };
  },
};
