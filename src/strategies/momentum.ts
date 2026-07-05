/**
 * Strategy #9 — Momentum (ROC 12).
 *
 * Hypothesis: simple rate-of-change momentum — if SOL is up more than
 * `threshold`% over the last 12 bars (3h), be long; if down more than
 * `threshold`%, be flat. The deadband between -threshold and +threshold keeps
 * the current position to reduce churn. Should win when returns autocorrelate
 * (momentum regimes); should lose to HODL when 3h returns mean-revert, since
 * it then systematically buys local tops and sells local bottoms while paying
 * 0.35% round-trip fees + slippage per flip.
 */

import type { Strategy } from '../types.js';
import { DUST_SOL } from '../types.js';

export const momentum: Strategy = {
  id: 'momentum',
  name: 'Momentum (ROC 12)',
  decide({ prices, price, portfolio, params }) {
    const rocPeriod = Number(params.rocPeriod ?? 12);
    const threshold = Number(params.threshold ?? 0.5);

    if (prices.length < rocPeriod + 1) return { action: 'hold' }; // warming up

    const past = prices[prices.length - 1 - rocPeriod]!.mid;
    const roc = (price / past - 1) * 100;

    const isLong = portfolio.sol >= DUST_SOL;

    if (!isLong && roc > threshold) {
      return {
        action: 'buy',
        sizeUsdc: portfolio.usdc,
        reason: `ROC(${rocPeriod}) ${roc.toFixed(2)}% above +${threshold}%`,
      };
    }
    if (isLong && roc < -threshold) {
      return {
        action: 'sell',
        sizeSol: portfolio.sol,
        reason: `ROC(${rocPeriod}) ${roc.toFixed(2)}% below -${threshold}%`,
      };
    }
    return { action: 'hold' }; // inside deadband: keep current position
  },
};
