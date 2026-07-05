/**
 * Strategy registry — all 12 strategies, ordered as in the project brief.
 * The Strategy interface in src/types.ts is frozen.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { StrategyEntry } from '../engine/engine.js';
import type { Strategy } from '../types.js';
import { bollinger } from './bollinger.js';
import { dca } from './dca.js';
import { donchian } from './donchian.js';
import { emaCross } from './ema-cross.js';
import { grid } from './grid.js';
import { hodl } from './hodl.js';
import { macd } from './macd.js';
import { momentum } from './momentum.js';
import { rsi } from './rsi.js';
import { stochRsi } from './stoch-rsi.js';
import { utBot } from './ut-bot.js';
import { vwap } from './vwap.js';

const REGISTRY: Strategy[] = [
  utBot,      // 1
  stochRsi,   // 2
  emaCross,   // 3
  donchian,   // 4
  bollinger,  // 5
  rsi,        // 6
  macd,       // 7
  vwap,       // 8
  momentum,   // 9
  grid,       // 10
  dca,        // 11 (control)
  hodl,       // 12 (control)
];

function loadParams(id: string): Record<string, unknown> {
  const path = join(process.cwd(), 'config', 'strategies', `${id}.json`);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

export function loadStrategies(): StrategyEntry[] {
  return REGISTRY.map((strategy) => ({ strategy, params: loadParams(strategy.id) }));
}
