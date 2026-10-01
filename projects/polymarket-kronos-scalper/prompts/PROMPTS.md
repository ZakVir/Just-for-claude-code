# Claude Code prompts, one per phase

Paste these in order. Each assumes `PLAN.md` is in the repo and tells Claude to
read the relevant section first. Don't skip a gate: if a phase's gate fails,
the correct next prompt is the "Gate review" prompt at the bottom, not the next
phase.

Every prompt inherits the rules in `../CLAUDE.md` (paper by default, no keys in
code, fees read live, tests required, no Martingale).

---

## Phase 0 — Verify and set up

```
Read PLAN.md sections 0, 1, 3, 5 (Phase 0) and 11.

Goal: complete Phase 0 and produce docs/verified-facts.md.

Do, in order, READ-ONLY against real endpoints (no orders, no keys needed):
1. GET https://polymarket.com/api/geoblock and report the result verbatim.
   If blocked, STOP and tell me; do not try to work around it.
2. Work through every [VERIFY] checklist item in PLAN.md section 11. For each:
   the question, the exact endpoint/doc URL used, the raw evidence (short
   excerpt), the conclusion, and a timestamp. Anything you cannot verify
   stays marked UNVERIFIED — do not guess.
3. Write scripts/oracle_check.py: for >=200 resolved 5-minute BTC markets,
   recompute the outcome from the TWAP feed and compare to Polymarket's
   resolved outcome. Report agreement % and explain every mismatch.
4. Clone Kronos into ./vendor/Kronos (git-ignored), run its sample predict,
   then write scripts/kronos_bench.py reporting p50/p95 latency for
   mini/small/base x sample_count in {1,10,30} on this machine. State
   whether predict() returns the averaged path or individual paths.
5. Write scripts/rtt_probe.py measuring RTT p50/p95 to the CLOB and WS
   endpoints from this host.

Constraints: stdlib + requests/websockets only for probes; pin versions in
scripts/requirements.txt; never print secrets; commit as
"polymarket-kronos-scalper: phase 0 verification".

Finish with: a Gate G0 table (criterion / result / pass-fail) and your honest
recommendation to proceed or stop.
```

## Phase 1 — Recorder and data foundation

```
Read PLAN.md sections 4, 5 (Phase 1) and 8.

Goal: a 24/7 recorder that captures everything needed to replay a market
tick-for-tick, plus a data-quality report.

Build src/pmbot/{clock.py,feeds/,recorder/} with tests:
- Feeds: exchange WS (Binance public market data, with Coinbase as a
  fallback — use whichever is reachable from this host), Polymarket CLOB
  market WS (book, price_change, last_trade_price, best_bid_ask,
  market_resolved; PING every 10 s; dynamic subscribe/unsubscribe), and the
  RTDS price.crypto.twap channel. Auto-discover each upcoming 5-minute
  BTC market via the Gamma API and subscribe before it opens.
- Every record stores ts_exch AND ts_recv (monotonic + wall clock).
- Reconnect with jittered backoff; detect gaps via book hash/sequence and
  write explicit GAP markers. Never interpolate.
- Writer: append-only Parquet (ZSTD) partitioned by date/asset; flush every
  <=5 s; a crash must lose <=5 s of data.
- recorder/replay.py reconstructs the L2 book at any ts_recv, deterministic.
- scripts/data_quality.py: gaps, staleness, duplicates, clock skew, GB/day.
- docker/ or systemd unit; healthcheck that alerts if no data for 60 s.

Acceptance: a recorded market replays tick-for-tick (unit test with a
fixture); chaos test kills the WS mid-market and shows a GAP marker and clean
resume. Do NOT write any trading or order-placing code in this phase.
```

## Phase 2 — Does any edge exist?

```
Read PLAN.md sections 3, 6, 8 and 5 (Phase 2). Use reference/edge_math.py
as the source of truth for fee, Kelly, fair-value and power math (import or
port it, keeping the tests).

Step 1 (before touching data): write docs/preregistration.md containing the
variant list from section 6.5, the primary metric (net EV per $ staked with a
time-block-bootstrap 95% lower bound), the cost model from section 8, the
hold-out rule (last 20% of time, evaluated exactly once), and the hurdle
values. Commit it. Do not edit it after the hold-out is evaluated.

Step 2: build src/pmbot/{models,signal,backtest}/:
- fair_value.py (TWAP-aware; match edge_math.fair_prob_up, add vol
  estimators + vol-of-vol), calibrate.py (walk-forward isotonic/Platt,
  shrink-to-market with OOS-fitted weight), kronos_adapter.py (sample-path
  P(up), cached, latency logged), features.py.
- backtest/engine.py: deterministic replay from recorded L2; taker fills at
  t + taker_delay + RTT walking the book; maker fills back-of-queue with
  under-fill bias; fees from the schedule in force; purged walk-forward.
- Run ablation B0, A1..A5, S1 exactly as pre-registered.

Step 3: produce reports/edge_map.html (net EV/$ by seconds-into-window x
price bucket x taker/maker, with CI) and reports/ablation.md (variant count
printed next to results). Include model-vs-market log-loss and a maker
markout study.

Rules: no look-ahead (assert it in tests with a poisoned-future fixture);
no peeking at the hold-out until the final run; if results are negative say
so plainly. End with a Gate G1 verdict: GO / PIVOT / STOP, with evidence.
```

## Phase 3 — Engine, risk, paper trading, dashboard

*(Only if G1 = GO.)*

```
Read PLAN.md sections 4, 7, 8, 10 and 5 (Phase 3).

Build src/pmbot/{sizing,risk,exec,ops,ui}/ and wire the engine:
- exec/broker.py interface; PaperBroker (live data, fills per section 8);
  LiveBroker exists but is unreachable unless ALL of: LIVE_TRADING=1,
  --confirm-live <sha256 of live.yaml>, and passing pre-flight (geoblock,
  balance, clock skew <100 ms, feeds fresh, no KILL file, heartbeat OK).
- sizing/kelly.py: stake = min(0.25*Kelly(q_LCB, cost_incl_fee),
  per_trade_cap, depth_cap)*bankroll. Never increase size after a loss.
- risk/limits.py: the limit table in section 7 as code CONSTANTS; config may
  only tighten them (test that loosening raises). Kill switches per section 7.
- Every skipped decision logs a reason_code; every trade logs
  timestamp, market, mode, q, q_LCB, market price, fee, cost, edge, kelly raw/
  fractional/final, stake, fill, outcome, P&L to CSV + SQLite.
- ops/telegram.py: alerts on trade placed, market resolved, any halt;
  /halt command. Token from env only.
- ui/: single-page dashboard (see section 10) served on 127.0.0.1 only,
  SSE updates, no order buttons except Halt. If I give you an HTML mock from
  Claude Artifacts, use it as the visual template.
- scripts/chaos.py runs the section-5 chaos drills against PaperBroker.
- scripts/bankroll_sim.py: Monte-Carlo drawdown/ruin with edge drawn from its
  posterior, at the planned sizing.

Acceptance: pytest + ruff green; every chaos drill ends flat/cancelled with an
alert; secrets scan clean; `python -m pmbot --mode paper` runs for 24 h
unattended. Then start paper trading and STOP — do not enable live.
```

## Phase 4 — Live micro (only after Gate G2 passes)

```
Read PLAN.md sections 5 (Phase 4), 7, 9 and 11. I confirm Gate G2 passed (see
reports/g2_verdict.md) and I will fund a dedicated wallet with $<=500.

Do:
1. Review the LiveBroker end to end as a skeptical code reviewer. List every
   path by which it could place an order unintentionally; fix or document.
2. Add a dry-run mode that signs and validates orders but does not submit.
3. Add daily reconciliation (venue balances/positions vs ledger) that halts
   trading on any mismatch.
4. Write runbook.md: how to arm, how to halt, how to withdraw, what to do on
   each alert.
5. Add scripts/paper_vs_live.py producing the weekly gap table (fill rate,
   slippage, markout, rebates, realised vs expected EV/$).

Do not arm live trading yourself. Print the exact arming command for me to run.
```

## Phase 5 — Scale (per ladder step)

```
Read PLAN.md sections 7 and 9. I am requesting a move from Stage <N> to
Stage <N+1>. Produce reports/stage_<N+1>_evidence.md with: live trade count,
net EV/$ with time-block 95% bounds, drawdown, limit breaches (should be
zero), paper-vs-live gap, capacity estimate from recorded depth, and a clear
recommendation. If evidence is insufficient, say so and recommend staying.
Do not change any limit constant; list proposed changes for my review.
```

## Gate review (use whenever a gate fails)

```
A gate failed (see reports/). Read PLAN.md section 5 and the failing report.
Do NOT adjust thresholds, re-slice data, or add variants to rescue the
result. Instead: (1) state which criterion failed and by how much; (2) list
plausible, testable reasons (data gaps, cost-model error, regime change,
no edge); (3) propose at most 2 next experiments, each with a pre-registered
success criterion and a cost in time/money; (4) give an honest
continue / pivot / stop recommendation.
```
