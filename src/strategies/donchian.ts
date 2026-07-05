/**
 * Strategy #4 — Donchian breakout (20).
 *
 * Hypothesis: a close above the highest close of the previous 20 bars signals
 * a breakout with follow-through (the turtle-trading premise). Exit when price
 * falls back below the channel midpoint. Should win when SOL makes sustained
 * breakout moves; should lose to HODL when breakouts fail — each false
 * breakout buys the local top, exits mid-channel, and pays the 0.35%
 * round-trip fee + slippage. Channel is computed over closes only (15-min mid
 * prices, no OHLC), excluding the current bar so the breakout compares against
 * prior history.
 */

import type { Strategy } from '../types.js';
import { DUST_SOL } from '../types.js';

export const donchian: Strategy = {
  id: 'donchian',
  name: 'Donchian breakout (20)',
  decide({ prices, price, portfolio, params }) {
    const period = Number(params.period ?? 20);

    if (prices.length < period + 1) return { action: 'hold' }; // warming up

    // Channel over the previous `period` closes, excluding the current one.
    let upper = -Infinity;
    let lower = Infinity;
    for (let i = prices.length - 1 - period; i < prices.length - 1; i++) {
      const c = prices[i]!.mid;
      if (c > upper) upper = c;
      if (c < lower) lower = c;
    }
    const midChannel = (upper + lower) / 2;

    const isLong = portfolio.sol >= DUST_SOL;

    if (!isLong && price > upper) {
      return {
        action: 'buy',
        sizeUsdc: portfolio.usdc,
        reason: `close ${price.toFixed(2)} broke above ${period}-bar high ${upper.toFixed(2)}`,
      };
    }
    if (isLong && price < midChannel) {
      return {
        action: 'sell',
        sizeSol: portfolio.sol,
        reason: `close ${price.toFixed(2)} below channel mid ${midChannel.toFixed(2)}`,
      };
    }
    return { action: 'hold' };
  },
};
