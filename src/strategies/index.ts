/**
 * Strategy registry. Build-order step 2 adds the remaining 10 modules here —
 * the Strategy interface in src/types.ts is frozen.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { StrategyEntry } from '../engine/engine.js';
import type { Strategy } from '../types.js';
import { hodl } from './hodl.js';
import { utBot } from './ut-bot.js';

const REGISTRY: Strategy[] = [utBot, hodl];

function loadParams(id: string): Record<string, unknown> {
  const path = join(process.cwd(), 'config', 'strategies', `${id}.json`);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

export function loadStrategies(): StrategyEntry[] {
  return REGISTRY.map((strategy) => ({ strategy, params: loadParams(strategy.id) }));
}
