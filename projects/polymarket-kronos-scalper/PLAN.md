# Polymarket 5-Minute Scalper — Executable Plan (v2)

> Rewrite of the "I Gave Claude AI a FREE 5-Minute Scalping Strategy" article
> (Andrew Collins, 2026-05-05) into a plan you can actually run — and that
> stops you early if there is no money to be made.
>
> Facts below were checked against primary docs on **2026-10-01**. Anything
> I could not verify is tagged **[VERIFY]** and has an owner in Phase 0.

---

## 0. TL;DR

1. **The article's architecture is a decent skeleton and its economics are
   wrong.** It never mentions fees, treats model "confidence" as a
   probability, includes a Martingale variant, and describes a settlement
   rule Polymarket changed in August 2026.
2. **Money = net edge per dollar × dollars turned over − costs.** A taker at
   50¢ pays ~3.5% of stake in fees, so a *real* 1-point win-rate edge is a
   net **loser** (−1.45% per $). Most of the upside in this plan comes from
   attacking cost (maker-first execution, trading where fees are small) and
   from honest probability modelling — not from a fancier forecaster.
3. **Kronos becomes one feature, not the engine.** The engine is an analytic
   fair-value model for "will the 60-second TWAP at the end beat the strike?",
   a calibrator, and a fee-aware EV/Kelly layer. Kronos stays only if an
   ablation shows it adds out-of-sample value after costs.
4. **Data first.** Order-book history is what makes a backtest honest, and the
   only way to own it is to start recording *now*. The recorder runs from
   Day 2, unattended, while everything else is built.
5. **Pre-registered go/no-go gates** (§5) with a capital ladder (§9). You
   risk $0 until Gate G2 and ≤ $500 until Gate G3. If the edge isn't there,
   you find out in ~4 weeks for the price of a VPS.
6. **Honest expectation:** I cannot promise an edge exists. Prediction
   markets are zero-sum before fees, and taker flow loses fees on average.
   The plan is built so that *if* an edge exists you capture more of it, and
   *if not* you lose almost nothing.

---

## 1. What was wrong with the original (and the fix)

| # | Article says / does | Problem | Fix in this plan |
|---|---------------------|---------|------------------|
| 1 | Kronos-Base has 4,096 context; Large for longer horizons | Kronos README: mini 2,048 ctx (4.1M params), small 512 (24.7M), **base 512** (102.3M), **large 499.2M is *not* open-sourced** | Benchmark mini/small/base on *your* latency budget; pick by OOS log-loss per ms (§6.2) |
| 2 | "Outperformed X by 93%" | Forecast-error benchmarks ≠ tradable edge after fees. Kronos authors call their own backtest "a demonstration… not a production-ready quantitative trading system" | Treat Kronos as a hypothesis to be falsified by ablation (§6.5) |
| 3 | "Up if end price ≥ start price" | Since **Aug 7 2026** (30 s) and **Aug 14 2026** (60 s) 5-min crypto markets settle on a **Chainlink TWAP**, not a spot print | Model the TWAP explicitly (§6.1); label outcomes from Polymarket's result and cross-check with own TWAP |
| 4 | No fees anywhere | Taker fee = `shares × 0.07 × p × (1−p)` on crypto → **$1.75 per 100 shares at 50¢**; break-even win prob **51.75%** at 50¢ | All edge/EV/Kelly math is **fee-inclusive**; fee rate read live per market (§3, `reference/edge_math.py`) |
| 5 | "Confidence > 55%" gate, then Kelly on confidence | Raw model confidence is not a calibrated probability; Kelly on an overstated edge over-bets and compounds losses | Walk-forward calibration, shrink toward market, lower-confidence-bound edge, ¼-Kelly (§6.3, §7) |
| 6 | Variant 4: Kelly + **Martingale** | Doubling after losses turns many small wins into rare ruin and breaks the article's own 5% cap | **Dropped.** Sizing only ever responds to *edge*, never to losses |
| 7 | 5% per-trade cap, 20% daily loss limit | Far too loose for an unproven edge, and BTC/ETH/SOL/XRP 5-min bets are highly correlated | 1% per trade, 5% concurrent, 3% daily, 8% weekly, 15% drawdown halt (§7) |
| 8 | "Download historical Polymarket data" | Price history can't tell you whether you'd have been *filled*. You need L2 book snapshots/deltas + trades | Self-record L2 from Day 2 + backfill from free/paid datasets (§4, Phase 1) |
| 9 | "~15,000 bets, ~7,000 wins, $12,300 profit" | 7,000/15,000 = **46.7% hit rate**; entry prices, fees, fills, bankroll, and slippage aren't disclosed, so the number can't be interpreted | Report net EV per $ staked with confidence bounds, by price bucket and execution mode |
| 10 | "Treat the first 30 days as testing" | A true 1-point win-rate edge (≈2% EV/$) needs **~15,500 independent bets** to detect at 95%/80% power. 30 days of trades can't tell you | Score *probabilities on every window* (far more power than win/loss), cluster-bootstrap, sequential gates (§5) |
| 11 | Pull BTC/ETH data "from Polymarket's API" | Polymarket isn't a spot OHLCV source | Exchange WS (Binance/Coinbase/Kraken, whichever your region can reach) + Polymarket RTDS `price.crypto.twap` channel for settlement-consistent prices |
| 12 | Copy-trading + "smart-money alerts" | Survivorship bias (you only see winners), and by the time you mirror, the price has moved | **Out of scope.** Revisit only with a measured follow-latency study |
| 13 | ADX ≥ 20 and ATR ≥ "[YOUR THRESHOLD]" as hard gates | Thresholds are eyeballed and untested on 5-min Polymarket windows | Gates become *features/regime filters* whose thresholds are fit walk-forward and must survive ablation (§6.4) |
| 14 | Latency never budgeted | Kronos inference time, WS lag, and Polymarket's taker delay (150 ms as of Sep 4 2026, changed several times) all affect fills | Latency budget + measured RTT in Phase 0; paper broker models it (§8) |

**Kept from the article** (good ideas): the dashboard, ATR/ADX as candidate
signals, fractional Kelly, backtest-before-live, Telegram alerts, CSV trade
log, `.env` + `.gitignore`, "log *why* a signal was blocked".

---

## 2. Where the money can actually come from

Ranked by (probability it works) × (size) ÷ effort. Each lever is tested, not
assumed; §5 says when to kill it.

| # | Lever | Why it might pay | Main risk | Test |
|---|-------|------------------|-----------|------|
| L1 | **Maker-first execution** | Makers pay **0 fee** and share **20% of taker fees** pro-rata per market (paid daily). Same signal, ~3.5%-of-stake cheaper at 50¢ | Adverse selection (you fill when you're wrong), non-fill bias | Markout at +5/+30 s; queue-aware fill sim |
| L2 | **Trade where fees are small** | Fee ∝ p(1−p): 1.4% of stake at 80¢, 0.35% at 95¢. Late-window favourites need almost no edge to clear fees | "Pennies in front of a steamroller": a vol spike flips a 97¢ favourite | Edge map by (secs-into-window × price bucket) (§6.6) |
| L3 | **Analytic TWAP fair-value + calibration** | After Aug 2026 the contract is a pricing problem ("will the 60 s TWAP finish above strike?") — settlement sniping is dead, forecasting the running average is not | Gaussian tails are too thin → needs calibration; market may already be efficient | Brier/log-loss vs market mid on **all** windows |
| L4 | **Spot lead–lag** | Polymarket quotes may trail the exchange composite by seconds | Smaller after TWAP + 150 ms taker delay; makers cancel | Quote-staleness metric from recorder |
| L5 | **Kronos as a feature** | Might add information at 1–5 min horizon | Likely ~zero after costs; adds latency and infra | Ablation A3 vs A2 (§6.5) |
| L6 | **Turnover** | More markets × more decision points = more dollars through a positive edge: BTC/ETH/SOL/XRP 5-min (**[VERIFY]** current asset list), plus 15 m / 1 h | Correlated → treat as one risk bucket; thin books cap size | Depth-capped stake sizing |
| L7 | **Sizing discipline** | Quarter-Kelly on a *shrunk, lower-bounded* edge maximises long-run growth without blowing up on model error | Over-shrinking leaves money on the table (acceptable) | Monte-Carlo bankroll sims (Phase 3) |
| L8 | **Cost control** | Fixed costs ~$30–100/mo (VPS, optional GPU/data). Edge must beat that at your bankroll | — | Break-even bankroll calc in dashboard |

**Explicitly rejected:** Martingale (negative skew, ruin), copy-trading,
"always take the ask when confidence > 55%", and any stake larger than 1% of
bankroll before Stage 3 of the ladder (§9).

---

## 3. The economics (numbers you can check)

All produced by `reference/edge_math.py` (stdlib-only, 19 passing tests,
mutation-checked — see `reference/`).

**Taker fee** = `shares × 0.07 × p × (1−p)` (docs.polymarket.com/trading/fees;
crypto rate). The changelog (Jan 2026) cited a 1.56% peak while the current
fees page implies 1.75¢/share at 50¢ — the schedule has evidently moved, so
**read the rate per market from the API, never hard-code** **[VERIFY endpoint]**.

| Price | Fee/share | Fee as % of stake | Taker break-even win prob |
|------:|----------:|------------------:|--------------------------:|
| 0.50 | 1.75¢ | 3.50% | 51.75% |
| 0.60 | 1.68¢ | 2.80% | 61.68% |
| 0.70 | 1.47¢ | 2.10% | 71.47% |
| 0.80 | 1.12¢ | 1.40% | 81.12% |
| 0.90 | 0.63¢ | 0.70% | 90.63% |
| 0.95 | 0.33¢ | 0.35% | 95.33% |

**Worked example (why fees dominate).** Buy "Up" at 50¢ with a true win
probability of 51%: cost = 51.75¢, EV = −0.75¢ per share = **−1.45% per $**.
A 1-point edge *loses money* as a taker. At a true 55%: EV = +3.25¢ = +6.3%
per $. The article's "55% confidence" only works if 55% is *real*.

**How long to know** (one-sided, 95% confidence, 80% power, payoff sd ≈ 1):

| True net edge per $ staked | Independent bets needed |
|---:|---:|
| 5% | 2,474 |
| 3% | 6,870 |
| 2% | 15,457 |
| 1% | 61,826 |

Consequences: (a) win/loss P&L is a very slow instrument; use probability
scores on all 288 windows/day/asset; (b) cluster by time window — BTC and ETH
bets in the same 5 minutes are not independent; (c) small edges are only
confirmed *while* trading small, which is why the capital ladder exists.

**Money model.** `profit/day = net_edge_per_$ × turnover/day − costs/day`,
`turnover/day = bankroll × stake% × trades/day`. Illustrative only:

| Scenario | Net edge/$ | Turnover/day | Profit/day | ≈ per 30 days |
|---|---:|---:|---:|---:|
| Naive taker, real 51% win rate at 50¢ | −1.45% | $3,000 | −$44 | −$1,300 |
| Modest edge, ¼-Kelly, $2k bankroll | +0.5% | $3,000 | +$15 | +$450 |
| Good maker/late-favourite mix | +1% | $3,000 | +$30 | +$900 |
| Strong edge, scaled + multi-asset | +2% | $10,000 | +$200 | +$6,000 |

Nobody knows the P&L distribution of these markets (one industry write-up
says so outright); **assume the first row until measurement says otherwise.**

---

## 4. Target system

```
 Exchange WS (Binance/Coinbase/Kraken) ─┐
 Polymarket RTDS  price.crypto.twap ────┤
 Polymarket CLOB WS (book/price_change/ ├─> Feed handlers ──> Recorder (Parquet, append-only)
   last_trade/best_bid_ask/resolved)    │   (NTP/chrony clock,        │
 Gamma API (market discovery)  ─────────┘    ts_exch + ts_recv)       v
                                                              Research / Backtest / Paper replay
        ┌───────────────────────────────────────────────────────────┘
        v
 Model layer:  fair_value(TWAP) ─> [Kronos P(up)] ─> calibrator ─> fused q (+ uncertainty)
        v
 Edge layer:   all-in cost (fee, spread, depth) ─> net EV/$ ─> pick MAKER vs TAKER vs SKIP
        v
 Sizer:        shrunk, lower-bounded edge ─> ¼-Kelly ─> caps (per-trade, per-window, portfolio, depth)
        v
 Risk gate:    limits + kill switches + data/clock/feed health  (cannot be loosened by config)
        v
 Executor:     PaperBroker | LiveBroker  (identical interface; live needs explicit arming)
        v
 Ledger (CSV+SQLite) ─> Telegram alerts ─> Dashboard (localhost)
```

**Repo layout for the build** (created in Phase 3; if it outgrows this
folder, graduate it to its own repository per the root `CLAUDE.md`):

```
src/pmbot/
  config.py  clock.py
  feeds/      exchange_ws.py  poly_clob_ws.py  poly_rtds.py  gamma.py
  recorder/   writer.py  schema.py  replay.py
  markets/    scheduler.py  labels.py            # windows, strikes, outcomes
  models/     fair_value.py  kronos_adapter.py  calibrate.py  meta.py
  signal/     features.py  ev.py  gates.py       # gates explain every rejection
  sizing/     kelly.py
  risk/       limits.py  killswitch.py  health.py
  exec/       broker.py  paper.py  live.py  orders.py  reconcile.py
  backtest/   engine.py  costs.py  walkforward.py  report.py
  ui/         server.py  static/dashboard.html
  ops/        telegram.py  logging.py
tests/   configs/{paper.yaml,live.yaml}   docker/   scripts/
```

**Stack:** Python 3.11, `asyncio` + `websockets`, `numpy/pandas/pyarrow/duckdb`,
`scikit-learn` (isotonic/logistic), `torch` (Kronos only), the official
Polymarket SDK (`pip install polymarket-client`; classes `PublicClient` /
`SecureClient`, async variants — **[VERIFY]** against
docs.polymarket.com/getting-started/python), FastAPI for the dashboard,
`pytest`, `ruff`. Dependencies live in the project folder, never repo-wide.

---

## 5. Phases, tasks, and gates

Calendar assumes ~10–15 focused hours/week with Claude Code doing most of the
typing. The long poles are *data accumulation* and *paper trading*, not code.

| Phase | Window | Goal | Money at risk |
|---|---|---|---|
| 0 | Days 1–3 | Decide, verify, set up | $0 |
| 1 | Days 2–14 | Data foundation (recorder live 24/7) | $0 |
| 2 | Weeks 2–4 | Find out whether any edge exists | $0 |
| 3 | Weeks 4–9 | Build engine; paper trade ≥ 4 weeks | $0 |
| 4 | Weeks 9–13 | Live micro ($200–$500) | ≤ $500 |
| 5 | Month 4+ | Scale by gates; add assets/strategies | ladder (§9) |

Ready-to-paste Claude Code prompts for each phase: `prompts/PROMPTS.md`.

### Phase 0 — Decide, verify, set up (Days 1–3)

- [ ] **Compliance first.** Check that you may use Polymarket from your
  jurisdiction (`GET https://polymarket.com/api/geoblock`; docs.polymarket.com
  geographic restrictions). Terms of Use prohibit circumventing geoblocks and
  detection can close the account — **do not use a VPN/server location to
  get around a restriction.** If you're in a restricted region, stop here.
- [ ] Fresh **dedicated wallet** holding only the bankroll. Never your main
  wallet. Collateral appears to be **pUSD** in current docs (older sources
  say USDC) **[VERIFY funding path]**.
- [ ] **Verify every [VERIFY] item** (checklist in §11) by calling the real
  APIs read-only. Write results to `docs/verified-facts.md` with timestamps.
- [ ] Spin up a small VPS (2–4 vCPU, 8 GB). Benchmark RTT/p95 to the CLOB from
  2–3 *permitted* regions; pick the lowest. Install `chrony`.
- [ ] Clone Kronos, run the sample predict, then **benchmark** mini/small/base
  on your hardware: latency p50/p95 for `sample_count` ∈ {1, 10, 30}.
  Budget: ≤ 2 s per forecast so it can refresh at t = 0, 60, 120, 180 s.
- [ ] Build a **resolution oracle test**: for ≥ 200 resolved 5-min markets,
  recompute the outcome from the TWAP feed and compare to Polymarket's result.

**Gate G0 (Day 3):** compliance clear · API facts recorded · Kronos latency
known · outcome labels match Polymarket ≥ 99% (every mismatch explained).
*Fail → fix or stop.*

### Phase 1 — Data foundation (Days 2–14)

- [ ] **Recorder v0 on Day 2**, running as a systemd service: for each live
  5-min market (BTC first, then ETH/SOL/XRP) store raw CLOB WS events, trades,
  RTDS TWAP ticks, exchange ticks and market metadata (strike, tokens, start/
  end, fee rate, resolution). Every record carries `ts_exch` **and** `ts_recv`.
- [ ] Reconnect with backoff, `PING` every 10 s (docs), sequence/hash checks to
  detect gaps, gap markers written to the stream (never silently interpolate).
- [ ] Parquet (ZSTD) partitioned by day/asset; measure GB/day in the first 24 h
  and set retention + off-box backup.
- [ ] **Backfill:** free datasets (e.g. marketlens' free sample — 2,278 markets
  across several events incl. BTC 5-min; PolyOrderBooks' 1 s single-market sample) for pipeline development only —
  **[VERIFY]** their snapshot semantics before trusting them for fills. Paid
  archives are optional; your own recorder is the source of truth.
- [ ] Exchange 1-minute OHLCV backfill (≥ 90 days) for Kronos/feature work.
- [ ] Data-quality report: gaps, staleness, clock skew, duplicate events.

**Deliverable:** ≥ 14 days of clean, replayable BTC data by the end of week 2
(and growing). *Everything in Phase 2 runs on this.*

### Phase 2 — Does any edge exist? (Weeks 2–4)

Pre-register **before** looking at the held-out data (write it into
`docs/preregistration.md` and commit it): the variant list (§6.5), the primary
metric (**net EV per $ staked, cluster-bootstrap 95% lower bound**), the
cost model (§8), and the hold-out (last 20% of time, touched exactly once).

- [ ] Replay engine: reconstruct the L2 book at any `ts_recv`; deterministic.
- [ ] Baselines: B0 "always buy Up at the ask" (measures pure fee drag);
  B1 market mid as the forecast.
- [ ] Fair-value model (§6.1) with vol estimators; calibrate (§6.3).
- [ ] Kronos adapter (§6.2): sample-path P(up), cached, latency-logged.
- [ ] Ablation matrix A0–A5 (§6.5) with walk-forward training, purged splits.
- [ ] **Edge map:** net EV/$ by (seconds-into-window × price bucket × taker/
  maker) with bootstrap bounds. This is the central artifact.
- [ ] Markout study for maker fills (+1/+5/+30 s) = adverse-selection cost.

**Gate G1 (end of week 4):** on the untouched hold-out, at least one
pre-registered cell family has **net EV/$ lower bound > 0** with ≥ 500
(cluster-counted) trades under *conservative* fills. Also report model-vs-
market log-loss as a diagnostic.
*Fail → do not build the trading engine.* Options: extend data/horizons,
research market-making only, or stop. Having spent ~$50 is a win.

### Phase 3 — Build the engine and paper trade (Weeks 4–9)

- [ ] Executor interface with `PaperBroker` (live data, simulated fills per §8)
  and `LiveBroker` (**not wired to run** yet).
- [ ] Sizer + risk gate (§7) with unit tests; hard caps are code constants.
- [ ] Gate/reason logging: every skipped signal records `reason_code`.
- [ ] Ledger → CSV + SQLite; Telegram alerts; dashboard (§10).
- [ ] **Chaos drills** (scripted): kill exchange feed, kill CLOB WS, stale
  RTDS, 5xx storm, clock skew +2 s, disk full, process crash mid-order. Each
  must end in "flat or safely cancelled, alert sent".
- [ ] Monte-Carlo bankroll sims: drawdown/ruin distribution under *uncertain*
  edge (draw edge from its posterior, not a point estimate).
- [ ] Paper trade ≥ 4 weeks on live data, all assets you recorded.

**Gate G2 (end of week 9):** ≥ 2,500 cluster-counted paper trades or ≥ 4 weeks;
net EV/$ 95% LB > 0 **or** (for the $200–$500 micro stage only) posterior
P(edge > 0) ≥ 0.90; paper-vs-backtest drift within tolerance (CUSUM, no alarm);
paper max drawdown < 10% at planned sizing; **all chaos drills pass.**

### Phase 4 — Live micro (Weeks 9–13)

- [ ] Arm live with: `LIVE_TRADING=1` **and** `--confirm-live <config-sha>`
  **and** passing pre-flight (geoblock OK, balance, NTP skew < 100 ms, feeds
  fresh, no `KILL` file, heartbeat to CLOB working).
- [ ] Bankroll $200–$500; stake ≤ 1% (≈ $2–5, or the venue's minimum — **[VERIFY]**).
  Purpose: measure fills, slippage, rebates and surprises — *not income.*
- [ ] Daily reconciliation: venue positions/balances vs ledger; any mismatch
  halts trading until explained.
- [ ] Weekly review: realized vs paper edge, fill rates, markouts, rebates.

**Gate G3 (≈4 weeks or ≥ 1,000 live trades):** realized net EV/$ ≥ 50% of the
paper estimate, fill/slippage within 30% of the paper model, zero unreconciled
positions, zero limit breaches. *Fail → back to paper, find the gap.*

### Phase 5 — Scale and extend (Month 4+)

Climb the ladder in §9 only when each gate passes. Extensions, in this order:
1. More assets (ETH → SOL → XRP) as one correlated risk bucket.
2. 15-minute and 1-hour markets (same engine, new fee/TWAP parameters).
3. Quoting engine (two-sided maker with inventory limits) if L1/L4 data
   shows consistent positive markout and rebate capture.
4. News/macro blackout calendar (FOMC/CPI) — simple, reduces tail risk.
5. Only after all that: any copy-trading research (see §1 row 12).

---

## 6. Modelling spec

### 6.1 Analytic fair value (the baseline Kronos must beat)

Let the window end at `T`, settlement price `A1` = average of the price over
the last `L = 60 s` (Chainlink TWAP), strike `K` = the market's "price to
beat" (itself a TWAP per third-party documentation — **[VERIFY in each
market's rules text]**). Model price as driftless Brownian motion with
per-√second price vol `σ`. With `τ = T − t` and `S` the current composite
price:

- `τ > L`: `A1 ~ N(S, σ²·((τ−L) + L/3))`
- `τ ≤ L`: `A1 ~ N((I + τ·S)/L, σ²·τ³/(3L²))` where `I` = ∫ observed so far.
- `P(up) = Φ((mean − K)/sd)`.

Implemented and Monte-Carlo-tested in `reference/edge_math.py::fair_prob_up`.
Vol `σ`: blend of EWMA of 1-second returns (several half-lives), 1-minute
realised vol, and time-of-day seasonality; floor it; add a **vol-of-vol**
feature. Gaussian tails are too thin, so the output is *always* passed through
the calibrator (§6.3).

### 6.2 Kronos adapter

- Input: last ≤ 512 one-minute OHLCV bars (small/base context limit) from the
  same exchange composite as the vol model.
- Output: draw `sample_count` paths (start N = 20, T = 1.0, top_p = 0.9) over
  `pred_len = ceil(secs_remaining / 60)`; `P_kronos(up)` = fraction of paths
  whose end price exceeds the strike reference. **A distribution, not an
  invented "confidence".**
- **[VERIFY]** whether `predict(..., sample_count=N)` returns the *average* of
  the N paths (the README describes it as paths to "generate/average"). If it
  does, get individual paths by calling with `sample_count=1` N times or by
  using the lower-level generation function; otherwise you only get a point
  forecast and cannot build a P(up).
- Refresh at most every 30–60 s; cache; log latency; never block the order
  path (stale-but-labelled beats late).
- Zero-shot first. Fine-tuning is Phase-2b and only if zero-shot shows
  incremental value; fine-tuning on a tiny regime sample is how you overfit.

### 6.3 Calibration and uncertainty

- Walk-forward **isotonic** (or Platt when bucket counts are thin) mapping
  raw P → realised frequency, fit only on data before each test fold.
- `q = shrink(q_cal → p_market, weight)` where `weight` is the OOS slope of
  outcome on (model − market). Expect weights well under 0.5.
- Carry an effective-n per bucket; the sizer uses the **lower bound** of the
  edge (`prob_lower_bound`), not the point estimate.
- Monitor rolling Brier/log-loss vs the market; drift → shrink weight toward 0
  automatically and alert.

### 6.4 Features and "gates"

Candidate features (all computed only from data with `ts_recv ≤ decision time`):
time into window, `(S−K)/σ√τ`, spread, depth imbalance, last-trade side, 1-s
and 1-min realised vol, vol-of-vol, 1-min ATR(14), 1-min ADX(14), exchange-vs-
RTDS basis, hour-of-day, minutes since scheduled macro event.
ATR/ADX are **inputs to a regime filter fitted walk-forward**; "[YOUR
THRESHOLD]" is replaced by a CV-chosen value reported with its spread. Every
skipped decision is logged with a machine-readable `reason_code`
(`LOW_EDGE`, `EDGE_LCB<=0`, `STALE_FEED`, `WIDE_SPREAD`, `LOW_DEPTH`,
`RISK_LIMIT`, `KILL`, …) shown in the dashboard.

### 6.5 Ablation matrix (replaces the article's four variants)

| ID | Model | Execution | Question answered |
|----|-------|-----------|-------------------|
| B0 | always buy Up at ask | taker | pure fee drag baseline |
| A1 | analytic fair value | taker | does simple pricing beat the market? |
| A2 | A1 + calibration + shrink | taker | does calibration help? |
| A3 | A2 + Kronos P as feature | taker | **does Kronos add anything?** |
| A4 | A3 + regime features (ATR/ADX/…) | taker | do the "gates" add anything? |
| A5 | best of A1–A4 | maker / hybrid | how much does fee avoidance add, net of adverse selection? |
| S1 | best of A1–A5 | flat stake vs ¼-Kelly | does sizing improve growth/drawdown? |

Martingale is intentionally absent. The count of variants tried is recorded
and reported next to results (multiple-testing honesty); selection happens on
validation folds, the hold-out is evaluated **once**.

### 6.6 Decision rule

For each market at each decision time compute, for TAKER and MAKER:
`cost` (all-in), `q_LCB`, `EV/$ = (q_LCB − cost)/cost`. Trade the best mode
if `EV/$ ≥ hurdle` (start 1.5% taker / 0.5% maker, tuned on validation),
spread and depth pass, and the edge-map cell is "green". Otherwise skip and
log why.

---

## 7. Sizing and risk spec

Sizing: `stake = min(¼ × Kelly(q_LCB, cost_incl_fee), per_trade_cap,
depth_cap) × bankroll`, with `Kelly = (q − c)/(1 − c)` (derivation and
brute-force check in tests). Never scale up *after losses*.

| Limit | Start | After Stage 3 (earned) | Enforced by |
|---|---:|---:|---|
| Per-trade stake | 1% bankroll | up to 2% | code constant |
| Depth cap | ≤ 20% of displayed best-level size | same | code |
| Per-window exposure (all assets) | 2% | 3% | code |
| Concurrent open exposure | 5% | 6% | code |
| Daily realised loss | 3% → halt for the day | 3% | code |
| Weekly realised loss | 8% → halt, manual restart | 8% | code |
| Peak-to-trough drawdown | 15% → halt, manual review | 15% | code |

Config may only **tighten** these. Loosening requires a code change + review.

**Kill switches (auto-halt + cancel-all + Telegram):** feed stale > N s; clock
skew > 100 ms; CLOB WS down > 10 s; order-reject storm; position mismatch on
reconciliation; realised-vs-expected CUSUM alarm; calibration drift alarm;
`KILL` file present; Telegram `/halt`. Use the CLOB heartbeat (docs describe
5 s intervals) so resting orders are cancelled if the bot dies **[VERIFY
semantics]**.

---

## 8. Backtest / paper realism rules

1. **No look-ahead:** features see only `ts_recv ≤ t`; fit calibrators only on
   earlier folds; label from the venue outcome (cross-checked, §5 Phase 0).
2. **Purged, walk-forward** splits with a gap ≥ one window; hold-out last 20%.
3. **Taker fills:** walk the recorded book at `t + taker_delay (150 ms, as of
   Sep 4 2026 — read live) + measured RTT`, apply the fee schedule in force,
   reject if price moved past your limit.
4. **Maker fills:** assume back-of-queue; fill only when trades print through
   your price or ahead-queue volume trades; then apply the +5/+30 s markout.
   If in doubt, the sim must under-fill.
5. **Costs always on:** fee, spread, rebate (credited only on filled maker
   volume, pro-rata, ≥ $1/day threshold **[VERIFY]**), gas/withdrawal if any.
6. **Cluster everything by time window** for CIs (block bootstrap).
7. Report: net EV/$ with CI, hit rate by price bucket, profit factor, max DD,
   longest losing streak, turnover, fill rate, markout, capacity (stake the
   book could absorb), equity-curve stability, and a **paper-vs-live gap**
   table once live.

---

## 9. Capital ladder

| Stage | Bankroll | Entry condition | Demotion trigger |
|---|---:|---|---|
| 0 Paper | n/a | G0–G1 passed | — |
| 1 Micro | $200–$500 | **G2** | any limit breach, or posterior P(edge>0) < 0.5 |
| 2 Small | $1,000–$2,000 | **G3** | realised EV/$ LB < 0 over rolling 1,000 trades |
| 3 Medium | $5,000 | ≥ 3 months live, 95% LB > 0, DD < 10% | as above |
| 4 Large | ≤ capacity | capacity study shows book depth supports it | as above |

Rule of thumb: stage up only with new *evidence*, never because the equity
curve went up. Withdraw profits on a schedule so the bankroll isn't a number
you can talk yourself into raising. Only risk money you can afford to lose.

---

## 10. Dashboard (kept from the article, reprioritised)

Build **after** Phase 2 so it displays real things. Mock it in Claude Artifacts
from a screenshot as in the article, then wire to data:

- Live price vs strike, TWAP progress bar, seconds remaining.
- Model P (fair value / Kronos / fused) vs market bid/ask/mid; net EV/$ for
  taker & maker; stake and the Kelly inputs (q, LCB, cost, ¼-Kelly, caps).
- Gate panel: pass/fail per rule with `reason_code` for every skip.
- Equity curve (paper vs live), drawdown, daily/weekly loss meters.
- Reliability diagram (calibration) and rolling Brier vs market.
- Execution: fill rate, slippage, markout, rebates, latency p50/p95.
- Health: feed freshness, clock skew, WS state, kill-switch status.

Serve on `127.0.0.1` only (SSH tunnel to view remotely). No order buttons
except "halt".

---

## 11. Ops, security, and the [VERIFY] checklist

**Security:** dedicated hot wallet with bankroll only; keys only in env/secret
store, `.env` in `.gitignore`, secret scanning pre-commit; pin dependencies;
install only the **official** SDK from the docs page — copy-pasted "Polymarket
bot" repos from social media are a classic way to get a wallet drained; run
the bot as a non-root user; logs never contain keys; off-box encrypted backups
of the ledger.

**Compliance/tax:** jurisdiction check (Phase 0), no geoblock circumvention,
keep the CSV ledger and venue statements for tax reporting; talk to a tax
professional. This plan is not financial or legal advice.

**Deploy:** Docker or systemd units for `recorder`, `engine`, `dashboard`;
automatic restart; log rotation; healthcheck pings; alert if the recorder
produces no data for 60 s.

**[VERIFY] on Day 1–3** (docs were incomplete on these when checked):

- [ ] Live per-market **fee-rate** endpoint/field; does it match 0.07 for crypto?
- [ ] Exact 5-min market **strike/"price to beat" definition** and rules text.
- [ ] Gamma/market **discovery** query and slug pattern for 5-min up/down;
  current asset list (BTC/ETH/SOL/XRP/…?).
- [ ] **Order types** (GTC/GTD/FOK/FAK), **post-only** support, tick size,
  minimum order size, rate limits.
- [ ] Credential derivation + signature type for the dedicated wallet.
- [ ] Heartbeat semantics (cancel-on-miss) and current **taker delay**.
- [ ] Kronos `predict()` `sample_count` semantics (average vs individual paths).
- [ ] Maker-rebate accrual details (pro-rata base, payout in pUSD, $1 minimum).
- [ ] RTDS `price.crypto.twap` payload (`source`, symbols, rate).
- [ ] Funding path (USDC vs pUSD) and any withdrawal costs.

---

## 12. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| No edge exists after costs | **High** | Wasted time, tiny $ | Gates G1/G2 stop you before real money |
| Fee/TWAP/taker-delay rules change again (fees Jan & Mar, TWAP Aug 7 & 14, taker delay Sep 4 — all 2026) | High | Edge disappears | Read params live; changelog watch; re-run edge map monthly |
| Adverse selection kills maker edge | Medium | Negative EV | Markout monitor; auto-widen/pause |
| Late-favourite blow-up in vol spike | Medium | Large single loss | Vol-of-vol gate, 1% cap, calendar blackout |
| Thin books cap capacity | High | Can't scale | Depth caps; capacity study before Stage 4 |
| Data gaps corrupt research | Medium | False conclusions | Gap markers, replay QA, quality report |
| Bug sends bad orders | Medium | Real loss | Paper default, arming ritual, caps in code, chaos drills |
| Key theft / malicious dependency | Low–Med | Total loss of hot wallet | Dedicated wallet, official SDK only, pinned deps |
| Overfitting via many variants | High | Fake edge | Pre-registration, hold-out once, report variant count |
| Account restriction (geoblock/ToS) | Low if compliant | Frozen funds | Phase-0 compliance, no circumvention |

---

## 13. Definition of done (per phase)

- **P0:** `docs/verified-facts.md` filled; Kronos latency table; oracle test ≥ 99%.
- **P1:** recorder uptime ≥ 99% over 14 days; data-quality report; replay
  reproduces a recorded market tick-for-tick.
- **P2:** `docs/preregistration.md` committed *before* hold-out; edge map;
  ablation table; G1 verdict written down (go / pivot / stop).
- **P3:** all tests + chaos drills green; 4 weeks paper results; G2 verdict.
- **P4:** weekly paper-vs-live gap reports; G3 verdict.
- **P5:** each ladder step has a written evidence note before bankroll moves.

---

## 14. Sources (checked 2026-10-01)

Primary / official:
- Kronos — https://github.com/shiyu-coder/Kronos (model table, API, MIT license, backtest disclaimer)
- Polymarket fees — https://docs.polymarket.com/trading/fees
- Polymarket changelog (TWAP, fees, taker delay) — https://docs.polymarket.com/changelog/predictions
- Maker rebates — https://docs.polymarket.com/programs/maker-rebates
- Market WebSocket — https://docs.polymarket.com/market-data/websocket/market-channel
- Order management — https://docs.polymarket.com/trading/orders/overview
- Python SDK — https://docs.polymarket.com/getting-started/python
- Geographic restrictions — https://docs.polymarket.com/api-reference/geoblock

Third-party (treat as leads, not facts):
- TWAP settlement write-up — https://tradoxvps.com/polymarket-twap-settlement/
- Market-structure write-up — https://dyutam.com/news/polymarket-5-minute-bitcoin-bets-60m-bots-retail/
- Free order-book dataset — https://github.com/marketlenstrade/polymarket-historical-data
