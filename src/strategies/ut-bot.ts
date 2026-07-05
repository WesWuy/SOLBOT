/**
 * Strategy #1 — UT Bot ATR trailing stop.
 *
 * Hypothesis: an ATR-scaled trailing stop captures sustained SOL trends while
 * limiting give-back on reversals. Expected to beat HODL only in regimes with
 * strong directional trends; in chop, the whipsaw + 0.35% round-trip costs +
 * slippage should make it lose to HODL — which is exactly what this lab is
 * designed to measure.
 *
 * Classic UT Bot (long/flat, spot only — no shorting):
 *   nLoss = keyValue * ATR(atrPeriod)
 *   trailing stop ratchets up under price while long-side, flips when crossed
 *   long when close crosses above trail; flat when close crosses below.
 *
 * Note: price history is 15-min mid quotes (no OHLC), so true range degrades
 * to |close - prevClose| and ATR is a Wilder-smoothed average of that.
 */

import type { PricePoint, Strategy } from '../types.js';
import { DUST_SOL } from '../types.js';

function computeTrailSeries(prices: PricePoint[], atrPeriod: number, keyValue: number) {
  const closes = prices.map((p) => p.mid);
  const n = closes.length;
  // Wilder-smoothed ATR over close-to-close true range.
  const atr: number[] = new Array(n).fill(NaN);
  let sum = 0;
  for (let i = 1; i < n; i++) {
    const tr = Math.abs(closes[i]! - closes[i - 1]!);
    if (i <= atrPeriod) {
      sum += tr;
      if (i === atrPeriod) atr[i] = sum / atrPeriod;
    } else {
      atr[i] = (atr[i - 1]! * (atrPeriod - 1) + tr) / atrPeriod;
    }
  }

  const trail: number[] = new Array(n).fill(NaN);
  for (let i = atrPeriod; i < n; i++) {
    const c = closes[i]!;
    const nLoss = keyValue * atr[i]!;
    const prevTrail = trail[i - 1];
    const prevClose = closes[i - 1]!;
    if (prevTrail === undefined || Number.isNaN(prevTrail)) {
      trail[i] = c - nLoss;
    } else if (c > prevTrail && prevClose > prevTrail) {
      trail[i] = Math.max(prevTrail, c - nLoss); // ratchet up while above
    } else if (c < prevTrail && prevClose < prevTrail) {
      trail[i] = Math.min(prevTrail, c + nLoss); // ratchet down while below
    } else if (c > prevTrail) {
      trail[i] = c - nLoss; // flipped above
    } else {
      trail[i] = c + nLoss; // flipped below
    }
  }
  return { closes, trail };
}

export const utBot: Strategy = {
  id: 'ut-bot',
  name: 'UT Bot ATR trail',
  decide({ prices, portfolio, params }) {
    const atrPeriod = Number(params.atrPeriod ?? 10);
    const keyValue = Number(params.keyValue ?? 1);
    if (prices.length < atrPeriod + 2) return { action: 'hold' }; // warming up

    const { closes, trail } = computeTrailSeries(prices, atrPeriod, keyValue);
    const i = closes.length - 1;
    const c = closes[i]!;
    const prevC = closes[i - 1]!;
    const t = trail[i]!;
    const prevT = trail[i - 1]!;
    if (Number.isNaN(t) || Number.isNaN(prevT)) return { action: 'hold' };

    const crossedAbove = prevC <= prevT && c > t;
    const crossedBelow = prevC >= prevT && c < t;
    const isLong = portfolio.sol >= DUST_SOL;

    // Position-aware: also enter if we're flat but price sits above the trail
    // (covers missed crosses from failed orders or restarts), and exit the
    // mirror case.
    if (!isLong && (crossedAbove || c > t)) {
      return { action: 'buy', sizeUsdc: portfolio.usdc, reason: 'close above ATR trail' };
    }
    if (isLong && (crossedBelow || c < t)) {
      return { action: 'sell', sizeSol: portfolio.sol, reason: 'close below ATR trail' };
    }
    return { action: 'hold' };
  },
};
