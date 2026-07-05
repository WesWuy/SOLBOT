/**
 * Strategy #11 — DCA benchmark (control group).
 *
 * Hypothesis: dollar-cost averaging is the "no-skill, no-timing" control —
 * a fixed 16 USDC buy every 24h regardless of price. Any active strategy that
 * cannot beat DCA in SOL terms has no edge beyond averaging in. DCA itself
 * trails HODL in a rising market (later buys get less SOL) and beats it in a
 * falling one (later buys get more), bounding the timing question.
 *
 * Stateless schedule inference (decide() is pure, so no stored trade history):
 *  - buys done = round((STARTING_USDC - usdc) / usdcPerBuy). Exact, because
 *    the engine deducts exactly sizeUsdc from the USDC balance on a buy (fees
 *    come out of the SOL received, tx cost is charged in SOL).
 *  - buys due = floor((now - firstTick) / interval) + 1 (first buy immediately).
 *  - A randomly failed order leaves the balance unchanged, so buysDone stays
 *    short of the schedule and the buy retries next tick automatically.
 *  - Once the 6000-point history cap trims old samples (~60 days),
 *    prices[0].ts drifts forward, which merely stops further catch-up buys —
 *    acceptable for a control whose budget is spent by then anyway.
 */

import type { Strategy } from '../types.js';
import { MIN_ORDER_USDC, STARTING_USDC } from '../types.js';

export const dca: Strategy = {
  id: 'dca',
  name: 'DCA benchmark',
  decide({ prices, portfolio, params }) {
    const usdcPerBuy = Number(params.usdcPerBuy ?? 16);
    const intervalHours = Number(params.intervalHours ?? 24);

    const now = prices[prices.length - 1]!.ts;
    const start = prices[0]!.ts;
    const scheduledBuys = Math.floor((now - start) / (intervalHours * 3_600_000)) + 1;
    const buysDone = Math.round((STARTING_USDC - portfolio.usdc) / usdcPerBuy);

    if (buysDone < scheduledBuys && portfolio.usdc >= MIN_ORDER_USDC) {
      return {
        action: 'buy',
        sizeUsdc: Math.min(usdcPerBuy, portfolio.usdc),
        reason: `scheduled DCA buy #${buysDone + 1}`,
      };
    }
    return { action: 'hold' }; // never sells
  },
};
