/**
 * Strategy #5 — Bollinger mean-reversion.
 *
 * Hypothesis: on 15-min SOL bars, closes more than stdDevMult standard
 * deviations below the 20-period mean are statistically stretched and tend to
 * snap back toward the mean. Buying below the lower band and selling once
 * price reclaims the middle band (SMA) should win in range-bound, volatile
 * chop where dips reliably revert. It should lose to HODL in strong trends:
 * in a persistent downtrend it repeatedly catches falling knives (band walks),
 * in a persistent uptrend it sits flat because price rarely pierces the lower
 * band — and every band round-trip pays 0.35% fees + slippage, so shallow
 * reversions smaller than costs bleed equity versus just holding.
 *
 * Bands over closes only (15-min mid prices, no OHLC/volume):
 *   middle = SMA(period), width = stdDevMult * population std dev.
 * Enter long when flat and close < lower band; exit when long and
 * close >= middle band.
 */

import type { Strategy } from '../types.js';
import { DUST_SOL } from '../types.js';

export const bollinger: Strategy = {
  id: 'bollinger',
  name: 'Bollinger mean-reversion',
  decide({ prices, price, portfolio, params }) {
    const period = Number(params.period ?? 20);
    const stdDevMult = Number(params.stdDevMult ?? 2);

    if (prices.length < period) return { action: 'hold' }; // warming up

    const closes = prices.map((p) => p.mid);
    const window = closes.slice(closes.length - period);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((a, b) => a + (b - mean) * (b - mean), 0) / period;
    const stdDev = Math.sqrt(variance); // population std dev
    const lower = mean - stdDevMult * stdDev;

    const isLong = portfolio.sol >= DUST_SOL;

    // Position-aware level conditions (not crosses): a failed order retries
    // naturally on the next tick while the condition still holds.
    if (!isLong && price < lower) {
      return {
        action: 'buy',
        sizeUsdc: portfolio.usdc,
        reason: `close ${price.toFixed(2)} below lower band ${lower.toFixed(2)}`,
      };
    }
    if (isLong && price >= mean) {
      return {
        action: 'sell',
        sizeSol: portfolio.sol,
        reason: `close ${price.toFixed(2)} at/above middle band ${mean.toFixed(2)}`,
      };
    }
    return { action: 'hold' };
  },
};
