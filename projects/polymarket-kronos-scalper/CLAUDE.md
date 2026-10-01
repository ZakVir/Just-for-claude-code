# Project instructions — polymarket-kronos-scalper

Plan-first project: `PLAN.md` is the source of truth; `prompts/PROMPTS.md` has
the per-phase prompts; `reference/` has tested stdlib math the real code must
match.

## Non-negotiable rules

- **Paper by default.** Never write code that can place a real order unless it
  is behind all of: `LIVE_TRADING=1`, `--confirm-live <config sha256>`, and
  passing pre-flight checks. Never arm live trading yourself.
- **No secrets in the repo.** Keys/tokens only via environment; `.env` stays in
  `.gitignore`; never print or log them. Dedicated hot wallet only.
- **Fees and rules are read live** (fee rate, taker delay, tick size, TWAP
  window). Don't hard-code them outside tests/reference.
- **All EV/Kelly math is fee-inclusive** and uses calibrated, shrunk,
  lower-bounded probabilities. Model "confidence" is not a probability.
- **No Martingale or loss-chasing sizing**, ever. Sizing responds to edge only.
- **Risk limits are code constants**; config may tighten, never loosen.
- **No look-ahead.** Features use only `ts_recv <= decision time`. Pre-register
  variants/metrics before touching the hold-out; evaluate the hold-out once.
- **Don't circumvent geoblocks** or Polymarket's Terms of Use.
- If a result is negative, report it plainly. Don't tune thresholds to rescue a
  failed gate.
- Mark anything unconfirmed as **[VERIFY]**/UNVERIFIED rather than guessing API
  behaviour.

## Run / test

```bash
cd reference && python3 -m unittest -v      # math tests (stdlib only)
python3 edge_math.py                        # fee + power tables
```

When code under `src/` exists: `pytest`, `ruff check .`. Keep dependencies in
this folder only. If the project outgrows this folder, graduate it to its own
repo (root `CLAUDE.md`, "Scope").

Commit style: `polymarket-kronos-scalper: <what>`.
