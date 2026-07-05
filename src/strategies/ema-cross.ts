/**
 * Strategy #3 — EMA 9/21 cross.
 *
 * Hypothesis: the fast/slow EMA cross is the canonical trend filter — long
 * while short-term momentum (EMA9) is above medium-term (EMA21), flat
 * otherwise. On 15-min SOL bars it should win in clean directional trends by
 * riding them and stepping aside in drawdowns. It should lose to HODL in chop:
 * every whipsawed cross pays the 0.35% round-trip fee + slippage, and the
 * ~2-5h lag of the EMAs gives back the first leg of every reversal.
 *
 * State-based (not cross-only): long state = EMA(fast) > EMA(slow), so a
 * randomly failed order retries next tick while the state persists.
 */

import type { Strategy } from '../types.js';
import { DUST_SOL } from '../types.js';

/** Standard EMA of the final value, seeded with the SMA of the first `period`. */
export function emaLast(values: number[], period: number): number {
  if (values.length < period) return NaN;
  let ema = 0;
  for (let i = 0; i < period; i++) ema += values[i]!;
  ema /= period;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    ema = values[i]! * k + ema * (1 - k);
  }
  return ema;
}

export const emaCross: Strategy = {
  id: 'ema-cross',
  name: 'EMA 9/21 cross',
  decide({ prices, portfolio, params }) {
    const fastPeriod = Number(params.fastPeriod ?? 9);
    const slowPeriod = Number(params.slowPeriod ?? 21);

    if (prices.length < slowPeriod + 1) return { action: 'hold' }; // warming up

    const closes = prices.map((p) => p.mid);
    const fast = emaLast(closes, fastPeriod);
    const slow = emaLast(closes, slowPeriod);
    if (Number.isNaN(fast) || Number.isNaN(slow)) return { action: 'hold' };

    const isLong = portfolio.sol >= DUST_SOL;

    if (!isLong && fast > slow) {
      return {
        action: 'buy',
        sizeUsdc: portfolio.usdc,
        reason: `EMA${fastPeriod} ${fast.toFixed(2)} above EMA${slowPeriod} ${slow.toFixed(2)}`,
      };
    }
    if (isLong && fast < slow) {
      return {
        action: 'sell',
        sizeSol: portfolio.sol,
        reason: `EMA${fastPeriod} ${fast.toFixed(2)} below EMA${slowPeriod} ${slow.toFixed(2)}`,
      };
    }
    return { action: 'hold' };
  },
};
