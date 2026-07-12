# SOLBOT — Claude Instructions

SOL/USDC **paper-trading strategy lab** (Phase 1). 12 strategies run in parallel against live Jupiter quote data, sampled every ~15 minutes (hourly GitHub Actions job, 4 samples per run — GitHub throttles `*/15` crons; see tick.yml header). Goal: find (or falsify) a strategy that beats buy-and-hold SOL, measured **in SOL**, after realistic costs. Dashboard: https://weswuy.github.io/SOLBOT/

## ⛔ Safety constraints (non-negotiable)
- **No private keys. No wallet connections. No swap execution. Anywhere.**
- Jupiter API is for *quotes only* — nothing is ever signed or sent.
- Do not add live-execution code paths. Phase 2 (live trading) only proceeds if the evaluation gate passes, and that is a separate, explicit decision by Wes.

## Evaluation gate (Phase 2 go/no-go, clock restarted 2026-07-12, ends ~Sept 10)
A strategy is a candidate ONLY if, after 60 days AND ≥30 closed trades, it outperforms HODL in SOL-denominated terms by ≥+5% with max drawdown <20% — and then still beats HODL over a fresh 30-day out-of-sample confirmation window. The margin/confirmation exist because picking the best of 10 strategies inflates the winner's measured edge (see README "Statistical caveats").

## Commands (Node ≥20, tsx)
- `npm run tick` — one cron tick (quote + run all strategies + write data)
- `npm run simulate` — run simulation
- `npm run typecheck` — `tsc --noEmit`; run this before calling any change done

## Layout
- `src/strategies/` — one file per strategy, registered against the shared engine
- `src/engine/` — shared backtest/execution engine (all strategies go through it)
- `src/fills/pessimistic.ts` — **mandatory fill model**; no strategy result is valid without it (slippage `max(0.15%, spread)`, 0.35% round-trip fee + 0.0002 SOL tx, 8% seeded random order failure)
- `src/price/`, `src/report/` — quote fetching and leaderboard/report generation
- `data/` — equity curves, trade logs, leaderboard. **Written by the GitHub Actions cron (`[skip ci]` commits) — never hand-edit.** The GitHub Pages dashboard (`docs/`) reads it.

## Conventions
- Equity is scored in SOL: `sol + usdc / price`; each strategy starts with 1,000 USDC.
- New strategies: add to `src/strategies/`, route all orders through the engine + pessimistic fill model, verify with `npm run typecheck` and a local `npm run simulate`.
- Watch for divergence between local runs and the Actions cron (`.github/workflows/tick.yml`) — the cron is the source of truth for `data/`.
