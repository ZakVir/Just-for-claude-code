# Claude Code prompts, one per phase (plan v3)

Paste these in order. Each tells Claude to read the relevant part of
`PLAN.md`. If a gate fails, use the "Gate review" prompt — not the next phase.
Every prompt inherits `../CLAUDE.md` (paper by default, no keys in code, fees
read live, tested maths, no loss-chasing sizing, no geoblock circumvention).

---

## Phase 0 — Venue matrix, verification, setup

```
Read PLAN.md sections 0, 2.3 and 11.

1. Ask me which country/state I trade from. Using primary sources only, fill
   docs/venue-matrix.md: which prediction venues (Polymarket international,
   Polymarket US, Kalshi), options data sources, and hedging venues I may
   lawfully use. Call https://polymarket.com/api/geoblock and report it
   verbatim. If no prediction venue qualifies, STOP.
2. Work through every ⚠️ item in PLAN.md §11 read-only against live
   endpoints/docs. For each: question, URL, short raw evidence, conclusion,
   timestamp. Unverifiable stays UNVERIFIED.
3. Write scripts/rtt_probe.py (CLOB, Deribit, Kalshi as applicable).
Commit as "polymarket-kronos-scalper: phase 0 verification". End with a
Gate G0 table and an honest proceed/stop recommendation.
```

## Phase 1a — Catalogue, rules normaliser, options surface, recorder

```
Read PLAN.md sections 2, 3 (B3), 7 (Phase 1) and 10. Reuse reference/ maths
(edge_math.py, arb.py, pricing.py) and keep their tests passing.

Build src/pmbot/ with tests:
- catalogue/: crawl Gamma for all open crypto events; store markets with
  slug, condition id, token ids, start/end, rules text, resolutionSource,
  negRisk, fee schedule, taker-delay flag.
- rules/: parse each market into a canonical claim
  {source: chainlink_twap|binance_1m|binance_1h|brti, symbol, window_start,
   window_end, operator: touch_up|touch_down|close_gt|close_ge|twap_ge_start,
   threshold}. One template per series; unknown text -> UNPARSED (never
  guess). Unit-test every template against real rules text fixtures.
- relations/: from canonical claims derive implication (B ⊆ A), equivalence
  and partition relations — only when source, symbol and time match exactly.
- options/: Deribit public smiles every 60 s (OKX fallback): per expiry
  forward, strikes, mark IV; DVOL. Interpolate total variance to any time.
- recorder/: Polymarket CLOB books for all crypto markets, Binance 1m,
  Polymarket RTDS TWAP, Deribit snapshots; ts_exch + ts_recv; Parquet.
No order-placing code in this phase.
```

## Phase 1b — Pricing engine, scanner, shadow ledger, historical backtest

```
Read PLAN.md sections 3, 4, 5, 7 (Phase 1) and 10.

- pricing/: fair values per claim type using reference/pricing.py
  (touch_prob_skew, digital_prob_with_skew, bucket = digital difference,
  interp_vol, Binance basis) and reference/edge_math.py (TWAP fair value).
  Every fair value carries an IV±3-point band.
- scanner/: every 10 s evaluate strategies A1, A2, A4, B1, B2, B3, B4, C1
  (if venue matrix allows), D1. Emit candidate trades with executable price,
  size available, fee, edge, lower-bound edge, and reason codes for skips.
- shadow/: a ledger that "takes" candidates at executable prices (takers) or
  conservative maker fills (back of queue, fill on trade-through only),
  marks to official resolution, and reports per-strategy P&L with
  event-block bootstrap CIs, capacity and persistence.
- backtest/historical_pricing.py: for the last 3-6 months of daily "above"
  ladders and monthly touch markets, rebuild fair values from Deribit DVOL
  (flat vol + documented skew proxy) at fixed times, fetch Polymarket
  prices-history, score against Binance outcomes; report edge by moneyness
  and time-to-expiry with CIs.
- reports/daily.md generated every day.
End with the Gate G1 league table: fund / kill per strategy, with evidence.
```

## Phase 2 — Execution, risk, micro-live (only after G1)

```
Read PLAN.md sections 7 (Phase 2), 8, 9 and 11. I confirm G1 passed for:
<list strategies>.

- exec/: post-only maker orders, FAK takers, batch ≤ 15, heartbeat every 5 s
  (orders auto-cancel after 10 s without one), multi-leg orders with
  leg-risk unwind for B1-B3, reconciliation against venue positions.
- risk/: every limit in PLAN.md §8 as a code constant (config can only
  tighten; test that loosening raises), crash/squeeze scenario P&L recomputed
  every minute, kill switches, Telegram alerts and /halt.
- Live trading requires LIVE_TRADING=1 AND --confirm-live <config sha256>
  AND passing pre-flight. Never arm it yourself; print the command for me.
- scripts/chaos.py: kill feeds, stale options surface, WS drop, 5xx storm,
  clock skew, crash mid multi-leg order. Each must end flat or safely hedged
  with an alert.
- reports/paper_vs_live.md weekly.
```

## Phase 3 — Market making and hedging

```
Read PLAN.md sections 3 (A3, D1), 8 and 10.
Build the quoting engine for the strategies that passed G2: quotes around
fair value with inventory skew, wider quotes where no taker delay applies,
cancel on spot/IV moves, markout tracking (+1 min, +10 min), auto-widen or
pause on toxic flow, delta hedging via the hedge venue allowed by
docs/venue-matrix.md (size with reference/pricing.digital_delta). Start in
shadow mode, then micro-live. Report rebates earned and markout-adjusted P&L.
```

## Phase 4 — Allocation and expansion (per ladder step)

```
Read PLAN.md sections 8 and 9. Produce reports/allocation_<date>.md: per
strategy live P&L with bootstrap bounds, capacity, correlation, drawdown,
and a proposed allocation using the PLAN.md §8 rule. Do not change limit
constants; list proposed changes for my review. If evidence is insufficient
for a stage-up, say so and recommend staying.
```

## Gate review (whenever a gate fails)

```
A gate failed (see reports/). Read PLAN.md §7 and the failing report. Do NOT
adjust thresholds, re-slice data, or add variants to rescue the result.
(1) State which criterion failed and by how much; (2) list testable reasons
(data gaps, pricing error, cost model, regime change, no edge); (3) propose
at most 2 experiments with pre-registered success criteria and cost;
(4) give an honest continue / pivot / stop recommendation.
```
