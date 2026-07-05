# SOLBOT — Paper-Trading Strategy Lab (Phase 1)

[![tick](https://github.com/WesWuy/SOLBOT/actions/workflows/tick.yml/badge.svg)](https://github.com/WesWuy/SOLBOT/actions/workflows/tick.yml)

A SOL/USDC **paper-trading simulator** that tests 12 strategies in parallel
against live Jupiter quote data. Goal: identify (or falsify) a strategy that
outperforms buy-and-hold SOL, **measured in SOL**, after realistic costs.

**Dashboard:** https://weswuy.github.io/SOLBOT/

## ⛔ Evaluation gate (Phase 2 go/no-go)

> **A strategy is a candidate ONLY if, after 60 days AND ≥30 closed trades, it
> outperforms HODL in SOL-denominated terms with max drawdown <20%.
> Otherwise Phase 2 (live trading) does not proceed.**

## Safety constraints (Phase 1)

- **No private keys. No wallet connections. No swap execution. Anywhere.**
- The Jupiter API is used for *quotes only*; nothing is ever signed or sent.

## How it works

Every 15 minutes a GitHub Actions cron run:

1. Quotes SOL→USDC and USDC→SOL on the Jupiter Quote API (v6, with lite-api
   fallback) to get a mid price + spread estimate, appended to `data/prices.json`.
2. Runs every registered strategy (`src/strategies/`) against the full price
   history via one shared engine (`src/engine/`). Each strategy starts with
   1,000 USDC; equity is scored in SOL: `sol + usdc / price`.
3. Pushes every order intent through the **pessimistic fill model**
   (`src/fills/pessimistic.ts`) — no strategy result is valid without it:
   - slippage: quoted price worsened by `max(0.15%, spread estimate)`
   - fee: 0.35% round-trip equivalent (0.175%/side) + fixed 0.0002 SOL tx cost
   - failure: 8% of orders randomly fail (seeded on tick+strategy, logged)
4. Commits equity curves, trade logs and the leaderboard to `/data` with
   `[skip ci]`, which the GitHub Pages dashboard (`/docs`) reads.

## The 12 strategies

| # | Strategy | Status |
|---|----------|--------|
| 1 | UT Bot ATR trail | ✅ live |
| 2 | Stoch RSI mean-reversion | ✅ live |
| 3 | EMA 9/21 cross | ✅ live |
| 4 | Donchian breakout (20) | ✅ live |
| 5 | Bollinger mean-reversion | ✅ live |
| 6 | RSI(14) 30/70 | ✅ live |
| 7 | MACD signal cross | ✅ live |
| 8 | VWAP deviation | ✅ live |
| 9 | Momentum (ROC 12) | ✅ live |
| 10 | Grid (±2% bands, 5 levels) | ✅ live |
| 11 | DCA benchmark (control) | ✅ live |
| 12 | HODL benchmark (control) | ✅ live |

All strategies implement the frozen `Strategy` interface in
[`src/types.ts`](src/types.ts), are pure functions of
`(price history, portfolio, params)`, and load params from
[`config/strategies/`](config/strategies/). Strategies 11–12 are control
groups; all others are ranked against HODL in SOL terms. Every strategy module
documents its hypothesis in a header comment.

## Repo layout

```
src/engine/      one simulation engine: tick loop, portfolio state, order lifecycle
src/fills/       pessimistic fill model (REQUIRED for every fill)
src/price/       Jupiter quote client (quotes only, never swaps)
src/strategies/  strategy modules implementing the common interface
src/report/      writes leaderboard + per-strategy equity/trade JSON to /data
config/          externalized strategy parameters
data/            committed JSON state + history (written each run)
docs/            GitHub Pages dashboard (vanilla JS + Chart.js)
```

## Running locally

```bash
npm ci
npm run tick        # one live tick (fetches a real Jupiter quote)
npm run simulate    # offline sanity checks on synthetic data (no network)
npm run typecheck
```

`DATA_DIR=<path>` redirects all state/output (used by the simulator).

## Operational notes

- Scheduled runs can be delayed by GitHub; the engine timestamps with the
  actual fetch time, so gaps are visible but harmless.
- GitHub disables cron workflows after 60 days without repo activity — the
  tick commits themselves keep the schedule alive.
- Data files are committed with `[skip ci]` to avoid workflow loops.
- The dashboard greys out any strategy with <30 closed trades
  (statistical-validity flag).
