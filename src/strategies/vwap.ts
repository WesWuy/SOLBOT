/**
 * Strategy #8 — VWAP deviation.
 *
 * Hypothesis: price stretched below the day's average tends to revert to it
 * (institutional execution anchors around VWAP). Buy a >1.5% discount to the
 * trailing 24h average, sell the reversion at the average. Should win in
 * ranging markets with intraday dip-and-recover behavior; should lose to HODL
 * in downtrends (the "discount" keeps growing while the average follows price
 * down) and pays the usual 0.35% round-trip fee + slippage per cycle.
 *
 * PROXY NOTE: the data feed is 15-min mid quotes with NO volume, so true VWAP
 * is not computable. We use the time-weighted average price (plain mean of the
 * trailing `windowTicks` mids, 96 ticks = 24h) as the VWAP stand-in.
 */

import type { Strategy } from '../types.js';
import { DUST_SOL } from '../types.js';

export const vwap: Strategy = {
  id: 'vwap',
  name: 'VWAP deviation',
  decide({ prices, price, portfolio, params }) {
    const windowTicks = Number(params.windowTicks ?? 96);
    const entryDevPct = Number(params.entryDevPct ?? 1.5);

    if (prices.length < windowTicks) return { action: 'hold' }; // warming up

    let sum = 0;
    for (let i = prices.length - windowTicks; i < prices.length; i++) {
      sum += prices[i]!.mid;
    }
    const twap = sum / windowTicks;

    const isLong = portfolio.sol >= DUST_SOL;

    if (!isLong && price < twap * (1 - entryDevPct / 100)) {
      return {
        action: 'buy',
        sizeUsdc: portfolio.usdc,
        reason: `close ${price.toFixed(2)} more than ${entryDevPct}% below 24h TWAP ${twap.toFixed(2)}`,
      };
    }
    if (isLong && price >= twap) {
      return {
        action: 'sell',
        sizeSol: portfolio.sol,
        reason: `close ${price.toFixed(2)} reverted to 24h TWAP ${twap.toFixed(2)}`,
      };
    }
    return { action: 'hold' };
  },
};
