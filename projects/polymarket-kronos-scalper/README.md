# polymarket-kronos-scalper

> An executable, gated plan for making money on Polymarket's Bitcoin markets
> from 15-minute Up/Down to yearly "what price will Bitcoin hit", plus
> tested reference maths and live experiments. **Plan, maths and read-only
> experiments only; no trading code.**

## What it is

It started as a rewrite of a popular "Claude + Kronos 5-minute scalper"
article (v2: fixed the fee, settlement and sizing mistakes). **v3** re-plans
it around what the evidence says actually makes money in these markets:

- **Price contracts off the options market** (Deribit/OKX implied vol), sell
  what Polymarket overprices, buy what it underprices — strike ladders, range
  buckets and touch markets, day to year.
- **Be the maker**, not the taker (0 fee + 20% rebate vs 3.5% fee at 50¢).
- **Run a structural-arbitrage scanner** (complete sets, neg-risk buckets, a
  dominance lattice across linked markets).
- **Measure every strategy in a shadow ledger first**; fund only the ones
  with a positive lower bound; scale by a capital ladder.
- Kronos / TimesFM direction forecasts stay research-only — we tested them
  live (see `experiments/model-shootout/`).

## Contents

| Path | What |
|---|---|
| [`PLAN.md`](./PLAN.md) | The v3 plan: evidence, market map, venue matrix, 14 strategies, economics, live scan, model shootout, phases/gates, risk, ladder |
| [`prompts/PROMPTS.md`](./prompts/PROMPTS.md) | Copy-paste Claude Code prompts per phase |
| [`reference/`](./reference) | Stdlib-only, tested maths: fees, Kelly, TWAP fair value, arbitrage, options-implied digitals/touch (48 tests) |
| [`experiments/fair-value-scan/`](./experiments/fair-value-scan) | Read-only scan: live Polymarket ladders/touch vs Deribit-implied fair value |
| [`experiments/model-shootout/`](./experiments/model-shootout) | Kronos vs TimesFM 3 on live BTC: snapshot, scoring vs Polymarket resolution, backtest |
| [`CLAUDE.md`](./CLAUDE.md) | Guardrails for Claude Code in this folder |

## How to run

```bash
cd projects/polymarket-kronos-scalper/reference
python3 -m unittest -v        # 48 tests, stdlib only
python3 edge_math.py          # fee / break-even / sample-size tables
```

Experiments need the project-local venv (see
`experiments/model-shootout/README.md`). Then follow `PLAN.md` §7 from
Phase 0 (venue matrix + compliance).

## Notes

- Facts checked against primary docs and live APIs on 2026-10-01; unverified
  items are tagged ⚠️ in `PLAN.md`.
- TimesFM 3.0 weights are licensed for non-commercial, non-production use;
  Kronos is MIT.
- Not financial or legal advice. Check that each venue is permitted where you
  live, and never circumvent geoblocks.
