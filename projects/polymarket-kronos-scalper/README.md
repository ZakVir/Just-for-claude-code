# polymarket-kronos-scalper

> An executable, gated plan for a Polymarket 5-minute crypto up/down trading
> bot — a fee-aware, honestly-validated rewrite of a popular "Claude + Kronos
> scalping" article. **Plan + tested reference math only; no trading code yet.**

## What it is

The original article wires a time-series model (Kronos) to Polymarket's
5-minute BTC markets with ATR/ADX gates and Kelly sizing. This project keeps
the good skeleton and fixes what would lose money: it ignores taker fees,
treats model confidence as a probability, includes a Martingale variant, and
predates Polymarket's August 2026 switch to TWAP settlement.

The plan's core ideas:

- Price the contract analytically (TWAP-aware fair value), calibrate it, and make
  Kronos *earn its place* via ablation.
- Cut cost first: maker-first execution, and trade where fees are small.
- Size with ¼-Kelly on a shrunk, lower-bounded, **fee-inclusive** edge; hard
  risk limits in code.
- Record order-book data from Day 2; pre-register tests; go/no-go gates and a
  capital ladder so you risk $0 until the edge is evidenced.

## Contents

| Path | What |
|---|---|
| [`PLAN.md`](./PLAN.md) | The full plan: critique, economics, architecture, phases/gates, model/risk specs, ops, risk register |
| [`prompts/PROMPTS.md`](./prompts/PROMPTS.md) | Copy-paste Claude Code prompts for each phase |
| [`reference/`](./reference) | Stdlib-only fee / Kelly / TWAP fair-value / power-analysis math with 19 tests |
| [`CLAUDE.md`](./CLAUDE.md) | Guardrails for Claude Code in this folder |

## How to run

```bash
cd projects/polymarket-kronos-scalper/reference
python3 -m unittest -v     # 19 tests
python3 edge_math.py       # prints the fee/break-even and sample-size tables
```

Then follow `PLAN.md` §5 starting at Phase 0 (compliance + verification).

## Notes

- Facts were checked against primary docs on 2026-10-01; unverified items are
  tagged **[VERIFY]** and listed in `PLAN.md` §11.
- Not financial or legal advice. Prediction markets are zero-sum before fees;
  there may be no exploitable edge, and the plan is designed to find that out
  cheaply. Check that using Polymarket is permitted where you live, and never
  circumvent geoblocks.
