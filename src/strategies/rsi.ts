/**
 * Strategy #6 — RSI(14) 30/70.
 *
 * Hypothesis: the classic Wilder RSI oversold/overbought play — buy fear
 * below 30, sell greed above 70. On 15-min SOL bars it should win in wide,
 * oscillating ranges where deep dips revert and rallies stall. It should lose
 * to HODL in trending regimes: in a strong uptrend RSI rarely dips below 30,
 * leaving the strategy flat while HODL compounds, and it sells "overbought"
 * strength that keeps running; in a downtrend it buys weakness early. Each
 * completed 30/70 round-trip also pays 0.35% fees + slippage, so reversions
 * shallower than costs are net losers.
 *
 * Wilder-smoothed RSI(period) over closes only (15-min mid prices, no
 * OHLC/volume). Enter long when flat and RSI < buyBelow; exit when long and
 * RSI > sellAbove. Level conditions (not crosses) keep entries/exits
 * position-aware so failed orders retry on the next tick.
 */

import type { Strategy } from '../types.js';
import { DUST_SOL } from '../types.js';

/** Wilder-smoothed RSI of the final close; NaN until period+1 closes exist. */
function wilderRsiLast(closes: number[], period: number): number {
  const n = closes.length;
  if (n < period + 1) return NaN;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < n; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export const rsi: Strategy = {
  id: 'rsi',
  name: 'RSI(14) 30/70',
  decide({ prices, portfolio, params }) {
    const period = Number(params.period ?? 14);
    const buyBelow = Number(params.buyBelow ?? 30);
    const sellAbove = Number(params.sellAbove ?? 70);

    if (prices.length < period + 1) return { action: 'hold' }; // warming up

    const closes = prices.map((p) => p.mid);
    const value = wilderRsiLast(closes, period);
    if (Number.isNaN(value)) return { action: 'hold' };

    const isLong = portfolio.sol >= DUST_SOL;

    if (!isLong && value < buyBelow) {
      return {
        action: 'buy',
        sizeUsdc: portfolio.usdc,
        reason: `RSI ${value.toFixed(1)} below ${buyBelow}`,
      };
    }
    if (isLong && value > sellAbove) {
      return {
        action: 'sell',
        sizeSol: portfolio.sol,
        reason: `RSI ${value.toFixed(1)} above ${sellAbove}`,
      };
    }
    return { action: 'hold' };
  },
};
