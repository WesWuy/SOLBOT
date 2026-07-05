/**
 * Entry point for one live tick (run every 15 min by GitHub Actions).
 * Fetches a Jupiter quote, runs all strategies through the engine, and
 * refreshes the summary report. Never touches a wallet or executes a swap.
 */

import { runTick } from './engine/engine.js';
import { loadState } from './engine/state.js';
import { fetchPrice } from './price/jupiter.js';
import { writeReport } from './report/report.js';
import { loadStrategies } from './strategies/index.js';

async function main(): Promise<void> {
  const entries = loadStrategies();
  const price = await fetchPrice();
  console.log(
    `[tick] ${new Date(price.ts).toISOString()} SOL/USDC mid=${price.mid.toFixed(4)} spread=${(price.spreadPct * 100).toFixed(3)}%`,
  );

  const outcome = runTick(entries, price);
  for (const e of outcome.events) console.log(`[trade] ${e}`);
  if (outcome.events.length === 0) console.log('[trade] no orders this tick');

  writeReport(loadState(), entries, price.mid);
  console.log('[tick] report written');
}

main().catch((err) => {
  console.error('[tick] failed:', err);
  process.exit(1);
});
