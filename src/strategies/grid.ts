/**
 * Strategy #10 — Grid (±2% bands, 5 levels).
 *
 * Hypothesis: a symmetric rebalancing grid monetizes oscillation — buy 10% of
 * equity per 2% step down, sell 10% per 2% step up, centered on an anchor
 * price. Wins in high-volatility sideways regimes where price repeatedly
 * crosses grid levels; loses to HODL in a sustained uptrend (it keeps selling
 * into strength, holding ever more USDC) and bleeds on fees when oscillations
 * are smaller than the 2% step.
 *
 * Implemented as a pure TARGET-ALLOCATION grid so no order bookkeeping is
 * needed: target SOL fraction = 0.5 - steps * (0.5/levels), where steps is the
 * (clamped) number of 2% increments the price sits away from the anchor.
 * A 5%-of-equity deadband suppresses fee churn from tiny drift.
 *
 * ANCHOR NOTE: anchor = first price in history (prices[0].mid). It drifts only
 * once the 6000-point history cap starts trimming old samples (~60 days),
 * which slowly re-centers the grid — acceptable for the Phase 1 window.
 */

import type { Strategy } from '../types.js';
import { DUST_SOL, MIN_ORDER_USDC } from '../types.js';

export const grid: Strategy = {
  id: 'grid',
  name: 'Grid (±2% bands, 5 levels)',
  decide({ prices, price, portfolio, params }) {
    const stepPct = Number(params.stepPct ?? 2);
    const levels = Number(params.levels ?? 5);
    const rebalanceBandFrac = Number(params.rebalanceBandFrac ?? 0.05);

    const anchor = prices[0]!.mid;
    const rawSteps = Math.round((price - anchor) / (anchor * (stepPct / 100)));
    const steps = Math.max(-levels, Math.min(levels, rawSteps));
    const targetFrac = Math.max(0, Math.min(1, 0.5 - steps * (0.5 / levels)));

    const equityUsdc = portfolio.sol * price + portfolio.usdc;
    if (equityUsdc <= 0) return { action: 'hold' };
    const currentFrac = (portfolio.sol * price) / equityUsdc;

    if (currentFrac < targetFrac - rebalanceBandFrac) {
      const sizeUsdc = (targetFrac - currentFrac) * equityUsdc;
      if (sizeUsdc < MIN_ORDER_USDC) return { action: 'hold' };
      return {
        action: 'buy',
        sizeUsdc,
        reason: `grid step ${steps}: SOL ${(currentFrac * 100).toFixed(0)}% -> target ${(targetFrac * 100).toFixed(0)}%`,
      };
    }
    if (currentFrac > targetFrac + rebalanceBandFrac) {
      const sizeSol = ((currentFrac - targetFrac) * equityUsdc) / price;
      if (sizeSol < DUST_SOL) return { action: 'hold' };
      return {
        action: 'sell',
        sizeSol,
        reason: `grid step ${steps}: SOL ${(currentFrac * 100).toFixed(0)}% -> target ${(targetFrac * 100).toFixed(0)}%`,
      };
    }
    return { action: 'hold' };
  },
};
