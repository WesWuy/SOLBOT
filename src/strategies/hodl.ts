/**
 * Strategy #12 — HODL benchmark (control group).
 *
 * Hypothesis: buying SOL once and never trading is the baseline every active
 * strategy must beat in SOL-denominated terms after costs. Because fills cost
 * fees + slippage and can fail, even HODL pays a small entry cost; any
 * strategy that trades more must overcome proportionally more friction.
 */

import { DUST_SOL, MIN_ORDER_USDC, type Strategy } from '../types.js';

export const hodl: Strategy = {
  id: 'hodl',
  name: 'HODL benchmark',
  decide({ portfolio }) {
    // Buy once with everything; if the (8%-random) fill fails, the engine
    // leaves the portfolio untouched and this retries next tick.
    if (portfolio.sol < DUST_SOL && portfolio.usdc >= MIN_ORDER_USDC) {
      return { action: 'buy', sizeUsdc: portfolio.usdc, reason: 'initial one-time buy' };
    }
    return { action: 'hold' };
  },
};
