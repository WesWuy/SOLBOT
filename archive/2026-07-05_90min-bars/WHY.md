# Why this data is archived

This directory preserves the JSON state from SOLBOT's first paper-trading week
(2026-07-05 to 2026-07-12), which ran with a broken sampling cadence.

**Defect:** GitHub Actions cron throttling stretched the intended 15-minute
sampling interval to a median gap of ~97 minutes, yielding only 88 samples out
of the ~680 expected for the week.

**Why it's unusable for strategy evaluation:** indicators computed on these
bars are mislabeled (a "15m" RSI/SMA was actually operating on ~90-minute
data), and mean-reversion strategies were starved of trade opportunities by
the sparse sampling — so the week's results say nothing about strategy quality.

**Restart:** the experiment restarted from scratch on 2026-07-12 using an
hourly cron that runs an in-job 15-minute sampling loop, restoring the
designed cadence. This archive is kept for reference only.
