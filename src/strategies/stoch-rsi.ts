/**
 * Strategy #2 — Stoch RSI mean-reversion.
 *
 * Hypothesis: SOL on 15-min bars spends most of its time chopping in a range;
 * the Stochastic of RSI is a fast oscillator that flags short-term exhaustion.
 * Buying a %K/%D bull cross in deep oversold and selling a bear cross in
 * overbought should harvest range-bound swings. It should win in sideways,
 * mean-reverting regimes with swings comfortably larger than costs. It will
 * likely lose to HODL in a sustained uptrend (it sits flat waiting for
 * oversold dips that never come, or exits early into strength) and in choppy
 * markets whose oscillations are smaller than the 0.35% round-trip fees +
 * slippage, where each signal round-trip bleeds cost.
 *
 * Indicator chain (closes only — 15-min mid prices, no OHLC/volume):
 *   Wilder RSI(rsiPeriod) -> Stochastic of RSI over stochPeriod ->
 *   %K = SMA(kSmooth) of raw stoch, %D = SMA(dSmooth) of %K.
 * Enter long when flat and %K is above %D while %D < oversold (covers the
 * cross and retry-after-failed-order cases); exit when long and %K is below
 * %D while %D > overbought.
 */

import type { Strategy } from '../types.js';
import { DUST_SOL } from '../types.js';

/** Wilder-smoothed RSI series; rsi[i] is NaN until index >= period. */
function wilderRsi(closes: number[], period: number): number[] {
  const n = closes.length;
  const rsi: number[] = new Array(n).fill(NaN);
  if (n < period + 1) return rsi;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < n; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
      if (i < period) continue;
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

/** Simple moving average series; NaN while fewer than `period` inputs (NaN inputs propagate). */
function sma(values: number[], period: number): number[] {
  const n = values.length;
  const out: number[] = new Array(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    let sum = 0;
    let ok = true;
    for (let j = i - period + 1; j <= i; j++) {
      const v = values[j]!;
      if (Number.isNaN(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    if (ok) out[i] = sum / period;
  }
  return out;
}

export const stochRsi: Strategy = {
  id: 'stoch-rsi',
  name: 'Stoch RSI mean-reversion',
  decide({ prices, portfolio, params }) {
    const rsiPeriod = Number(params.rsiPeriod ?? 14);
    const stochPeriod = Number(params.stochPeriod ?? 14);
    const kSmooth = Number(params.kSmooth ?? 3);
    const dSmooth = Number(params.dSmooth ?? 3);
    const oversold = Number(params.oversold ?? 20);
    const overbought = Number(params.overbought ?? 80);

    // Warm-up: RSI needs rsiPeriod+1 closes, stoch needs stochPeriod RSI
    // values, then the two SMAs, plus one extra tick so a prev value exists.
    if (prices.length < rsiPeriod + stochPeriod + kSmooth + dSmooth + 1) {
      return { action: 'hold' };
    }

    const closes = prices.map((p) => p.mid);
    const rsi = wilderRsi(closes, rsiPeriod);

    // Raw stochastic of RSI over stochPeriod, scaled 0..100.
    const n = closes.length;
    const rawStoch: number[] = new Array(n).fill(NaN);
    for (let i = rsiPeriod + stochPeriod - 1; i < n; i++) {
      let lo = Infinity;
      let hi = -Infinity;
      let ok = true;
      for (let j = i - stochPeriod + 1; j <= i; j++) {
        const v = rsi[j]!;
        if (Number.isNaN(v)) {
          ok = false;
          break;
        }
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (!ok) continue;
      rawStoch[i] = hi === lo ? 50 : ((rsi[i]! - lo) / (hi - lo)) * 100;
    }

    const kSeries = sma(rawStoch, kSmooth);
    const dSeries = sma(kSeries, dSmooth);

    const i = n - 1;
    const k = kSeries[i]!;
    const d = dSeries[i]!;
    if (Number.isNaN(k) || Number.isNaN(d)) return { action: 'hold' };

    const isLong = portfolio.sol >= DUST_SOL;

    // Position-aware: %K above %D in oversold covers both the fresh cross and
    // the retry-after-failed-order case (mirror on the exit side).
    if (!isLong && k > d && d < oversold) {
      return {
        action: 'buy',
        sizeUsdc: portfolio.usdc,
        reason: `%K ${k.toFixed(1)} above %D ${d.toFixed(1)} in oversold (<${oversold})`,
      };
    }
    if (isLong && k < d && d > overbought) {
      return {
        action: 'sell',
        sizeSol: portfolio.sol,
        reason: `%K ${k.toFixed(1)} below %D ${d.toFixed(1)} in overbought (>${overbought})`,
      };
    }
    return { action: 'hold' };
  },
};
