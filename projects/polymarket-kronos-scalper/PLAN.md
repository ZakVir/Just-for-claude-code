# Polymarket BTC Edge — Executable Plan (v3: 15-minute to yearly)

> **v3, 2026-10-01.** v2 was one 5-minute directional bot. v3 is a portfolio
> of strategies across every recurring Polymarket BTC market — 15-minute
> Up/Down through yearly "what price will Bitcoin hit" — ordered by how likely
> each is to make money given published evidence and our own live tests.
>
> Tags: ✅ verified today against a primary source or live API · 📄 published
> research (preprints flagged, numbers as reported) · ⚠️ unverified / to check.
> Not financial or legal advice.

---

## 0. TL;DR

1. **Stop trying to predict Bitcoin; price Bitcoin contracts — and check
   every edge against what actually happened.** The literature says takers
   lose, makers win, and 15-minute direction models don't beat the order book
   (§1). So v3 executes as a **maker**, prices contracts off the **options
   market**, and funds only edges that pass a calibration test on resolved
   Polymarket history.
2. **Our own data overturned the headline edge.** Today's scan shows
   Polymarket tails priced *above* options-implied values, as published
   research reports (§5.1). But on resolved 2026 markets, BTC tails were
   priced **fairly or too cheaply**: daily ladders' cheap strikes resolved YES
   as often as priced (116 days), and daily/weekly touch strikes under 2¢ hit
   2.4% / 4.6% of the time vs 0.6% / 0.9% priced (§5.2–5.3). Fading tails
   would have **lost** money. The cheap side was the near-certain favourite:
   95–98¢ ladder strikes won 56/56.
3. **We ran Kronos and TimesFM 3 live and on recent history** (§6). Over 96
   recent 15-minute windows TimesFM 3 was *statistically worse than the
   market's own price* (Brier +0.03, CI excludes zero) and trading on it lost
   ~20% per $. Kronos started 4/5 live in one falling hour; its backtest is
   the deciding test. Research inputs only.
4. **14 strategies in 5 families** (§3). Build order, re-ranked on our data:
   (1) maker-first execution + structural-arbitrage scanner + favourite
   harvesting, (2) carry and fee programs, (3) cross-venue arbitrage (US:
   Kalshi ↔ Polymarket US), (4) options-anchored pricing on touch/ladders
   **only where the calibration test passes** (currently it doesn't for
   daily/weekly tails; monthly/yearly untested), (5) short-horizon maker
   quoting; ML direction stays research-only.
5. **Measure everything at once before risking money.** Two weeks of a
   *shadow ledger* — live prices, simulated fills, $0 at risk — produces a
   league table; only strategies with a positive lower bound get capital (§7).
6. **Venue matrix first.** What you can legally use decides the strategy set:
   US persons are close-only on Polymarket international; they get Kalshi +
   Polymarket US instead (§2.3).
7. **Honest expectation.** These edges are cents per contract, capacity is
   limited, and some are contested by bots. "Lots of money" needs capital,
   several uncorrelated edges, compounding, and time. This plan maximises the
   odds and cuts losers fast; it can't promise profit.

---

## 1. What the evidence says (read this before building anything)

| Finding | Source | Status | So we… |
|---|---|---|---|
| Kalshi prices show a favourite–longshot bias: cheap contracts win far less often than their price implies; makers earn more than takers | Bürgi, Deng & Whelan (CESifo WP, 2025), 300k+ contracts | 📄 ✅ abstract verified | trade as **maker**; **sell longshots** |
| The maker–taker gap is largest in crypto categories | Becker (2026), 72.1M Kalshi trades | 📄 industry ⚠️ | doubly so in BTC markets |
| Polymarket profits are concentrated in few wallets; maker share is the strongest predictor of profit | Akey et al. (2026), $67B volume | 📄 preprint ⚠️ | maker-first everywhere |
| Polymarket BTC strike/touch YES prices sit **above** Deribit-implied values (larger on weekends, long-dated, low-probability) | Fabi et al. (2025 draft); Portnaya (2026) | 📄 preprints ⚠️ | our scan reproduces the gap (§5.1)… |
| …but on resolved 2026 markets, daily-ladder tails were fairly priced and daily/weekly touch tails were **under**-priced; 95–98¢ ladder favourites won 56/56 | **our calibration studies** (116 days ladders; 43 days / 19 weeks touch) | ✅ our data, small samples | **don't fade tails yet**; harvest favourites as maker (§5.2–5.3) |
| Polymarket's implied variance risk premium is far larger than Kalshi's | Lee, Lee & Lee (2026) | 📄 preprint ⚠️ | Polymarket prices too-wide distributions → sell tails |
| A 43-feature model on 15-min BTC markets "does not beat… the probability already implied by Polymarket's own order book"; −0.116 payoff units per trade after fees | Young (2026, arXiv 2607.26245) | 📄 ✅ abstract verified | **no taker direction bot** |
| ~$40M of arbitrage was realised on Polymarket (Apr 2024–Apr 2025), mostly single-market/neg-risk rebalancing | Saguillo et al. (2025, arXiv 2508.03474) | 📄 ✅ abstract verified | arbitrage is real but… |
| …fast violations now close in a median ~16 s; profit per conversion fell ~10× (2024 → 2026) | Gebele, Mutzel & Matthes (2026) | 📄 preprint ⚠️ | run a scanner, capture as maker; don't make it the business |
| 90–99¢ favourites earned ~+0.5–1.7%; crypto favourites ~+0.5%; crypto longshots ~−12.6% | Cardozo & Rivero-Wildemauwe (2026), 588M trades | 📄 preprint ⚠️ | favourites only as maker, options-checked, capped |
| Pre-TWAP 5-min "edge" was settlement manipulation; TWAP (Aug 2026) targeted it | Dai, Jia & Yu (2026); Polymarket changelog | 📄 ⚠️ / ✅ | ignore 5-min "late-window" folklore |
| Liquidity-reward pools on crypto are currently ~$0; rewards are highly concentrated | Polymarket live rewards API; Odaily/Phemex | ✅ / industry | not an income source today; be ready when pools return |

**Translation:** the reliable money in these markets comes from (a) being the
house (maker), (b) pricing better than the crowd using a deeper market
(options), and (c) mechanical consistency (arbitrage) — not from forecasting
BTC direction.

---

## 2. The market map (live, 2026-10-01 ✅)

### 2.1 Recurring Polymarket crypto markets

Fees on all: taker `0.07·p·(1−p)` per share, makers 0, makers get 20% of
taker fees back. Minimum order 5. Tick 0.01 (0.001 near 0/1).

| Market (assets) | Example slug | Settles on | Resolves | Taker delay | Median BTC vol/event |
|---|---|---|---|---|---|
| 15m Up/Down (BTC ETH SOL XRP DOGE BNB HYPE ZEC) | `btc-updown-15m-<unix>` | Chainlink BTC/USD **60 s TWAP**, end ≥ start | auto, ~1 min | 150 ms | $23k |
| 1h Up/Down (7 assets) | `bitcoin-up-or-down-october-2-2026-10am-et` | **Binance BTCUSDT 1h candle** close ≥ open | UMA, ~12 min | 150 ms | $33k |
| 4h Up/Down (8) | `btc-updown-4h-<unix>` | Chainlink 60 s TWAP | auto, ~1 min | **none** | $14k |
| Daily Up/Down (7) | `bitcoin-up-or-down-on-october-2-2026` | Binance 1m noon-ET close vs prior noon | UMA, ~13 min | none | $150k |
| Daily "above ___" ladder (BTC ETH SOL XRP), 11 strikes $2k apart | `bitcoin-above-on-october-2-2026` | Binance 1m candle **opening** 12:00 ET, close > strike | UMA, ~13 min | none | **$1.43M** |
| Hourly "above ___" ladder (BTC ETH), 20 strikes $200 apart | `bitcoin-above-on-october-1-2026-4pm-et` | Binance 1h candle close > strike | UMA, ~12 min | 150 ms | tiny |
| "Price on <date>" range buckets (neg-risk), 11 × $2k | `bitcoin-price-on-october-2-2026` | Binance noon candle | UMA, ~13 min | none | $202k |
| Touch — day / week / month | `what-price-will-bitcoin-hit-in-october-2026` | any Binance 1m **High ≥ ↑K / Low ≤ ↓K** → Yes at once | at touch, else end + ~15 min | none | $249k / $1.64M / **$38.6M** |
| Yearly | `what-price-will-bitcoin-hit-before-2027` | Binance 1m touch | UMA | none | $72M lifetime |

Also listed: 5m Up/Down (excluded from v3 — most bot-contested, highest fee
drag), BTC dominance, ETH/BTC weekly touch, implied-vol index markets (thin).
Weekly/monthly Up/Down and monthly strike ladders are dormant since 2025.

### 2.2 What the map implies

- **Two settlement families.** Chainlink TWAP (15m, 4h) vs Binance candles
  (everything else). Binance BTCUSDT trades ~+4.3 bp over USD indices
  (measured ✅), which matters for strikes priced off options (§4.3).
- **Capacity lives in longer-dated markets.** One daily ladder trades ~60×
  a 15-minute window; the monthly touch market ~1,700×.
- **Makers are protected only on 5m/15m/1h** (150 ms taker delay ✅). On 4h,
  daily, weekly, monthly and yearly markets quotes can be picked off
  instantly — quote wider, cancel faster, or hedge.
- **Binance-settled markets resolve through UMA** (~12–14 min, tails 1–3 h ✅);
  books sometimes stay live after the outcome is known (strategy B4).

### 2.3 Venue matrix (decide in Phase 0)

| You are… | Prediction venues | Fair-value data | Hedging venues |
|---|---|---|---|
| **Non-US**, not in a Polymarket-restricted country | Polymarket international (+ Kalshi where available) | Deribit, OKX (public, no auth ✅) | Polymarket Perps, Deribit, OKX, Hyperliquid (check each venue's restrictions) |
| **US person** | Kalshi + Polymarket US (CFTC-regulated; 15m/60m Up/Down on CF Benchmarks BRTI ✅) — Polymarket international is **close-only** for US ✅ | Deribit/OKX data for pricing only (trading barred ✅) | Kalshi BTC perp (rolling out), Coinbase Derivatives, CME via a futures broker |

Never use a VPN or foreign server to get around a restriction — it violates
the venues' terms and can freeze funds.

---

## 3. Strategy book

Ranked by (evidence × capacity) ÷ effort. "Ref" = tested function in
`reference/`.

| ID | Strategy | Horizon | Edge source | Evidence | Capacity | Build order |
|---|---|---|---|---|---|---|
| A1 | Tail-fade touch markets vs options | day → year | Polymarket YES rich vs options | 📄 + scan, **but our 2026 calibration ✗** | High | 4 (gated) |
| A2 | Price strike ladders & range buckets off calibrated fair values | hours → days | too-wide distributions | scan; calibration: tails fair | High | 4 (gated) |
| A3 | Options-anchored market making on A1/A2 markets | day → month | spread + 20% rebate + fair-value anchor | 📄 makers win | High | 3 |
| **A4** | Favourite harvesting (maker bids on 95–99¢) | day → month | favourites under-priced | 📄 + **our ladders 56/56** | Medium | **1** |
| **B1** | Complete-set arb (YES+NO ≠ $1) | all | mechanical | 📄 ✅ | Low–Med | **1** |
| **B2** | Neg-risk range buckets (Σ ≠ 1) | daily | mechanical | 📄 ✅ | Medium | **1** |
| **B3** | Dominance lattice across linked markets | hours → year | mechanical | 📄 | Low–Med | **1** |
| B4 | Post-close / settled-not-resolved sweeps | 1h → year | known outcome, slow UMA | live observation ✅ | Low | 4 |
| C1 | Same-claim cross-venue (Kalshi ↔ Polymarket US, both BRTI) | 15m, 60m | identical claims, different prices | ✅ settlement match | Medium | 5 (US only) |
| C2 | Near-claim cross-venue (Binance/Chainlink ↔ BRTI) | 15m → day | basis-adjusted mispricing | — | Low | research |
| D1 | Short-horizon fair-value maker quoting | 15m, 1h, 4h | spread + rebate + taker-delay protection | 📄 makers win | Low | 6 |
| D2 | ML direction (Kronos, TimesFM) | 15m → 1h | forecast | 📄 null + our test | — | research only |
| E1 | Carry & fee programs (holding rewards, rebates, taker-rebate tiers, reward pools) | — | program cash flows | ✅ docs | — | with everything |
| E2 | Non-trading: builder fees, data products | — | business | ✅ docs | — | optional |

Rejected: Martingale/loss-chasing, copy-trading, "smart-money" alerts, taker
direction bots on 5m/15m, settlement manipulation.

### A1 — Tail-fade touch markets ("what price will Bitcoin hit")

> **Status: gated — our data says not now.** On resolved 2026 daily and
> weekly touch markets, cheap YES strikes hit *more* often than priced
> (§5.3); buying NO there lost 2–4% per $ after costs. Published evidence
> (2023–2025) and today's options scan point the other way. Monthly and
> yearly touch markets are untested (few independent events). A1 is funded
> only if Phase 1's calibration + shadow ledger show a positive lower bound.

- **What:** day/week/month/year touch markets. For each strike compute the
  options-implied touch probability; where Polymarket's YES is above it by
  more than a margin, **buy NO** (or post NO bids as maker); where YES is
  below, buy YES.
- **Pricing (Ref `pricing.touch_prob_skew`):** barrier-strike implied vol from
  the Deribit/OKX smile, total-variance-interpolated to the market's end
  time; skew-consistent "≈ 2× digital" correction; Binance +4.3 bp basis on
  the barrier. **Ignore the skew and you get the sign wrong on the put wing**
  — that happened in our first scan (§5).
- **Why it should pay:** published Polymarket-vs-Deribit gaps in exactly these
  markets; longshot bias; risk-neutral probabilities already *overstate*
  real-world tail odds (variance risk premium), so fading YES against them is
  conservative.
- **Risks:** you are short tail risk across correlated markets — one crash
  hits every "dip to K" position at once. Mitigate with per-event and
  crash-scenario caps (§8), diversification across strikes/expiries, and
  (non-US) cheap OTM option hedges. Capital is locked until expiry.
- **Bonus carry:** yearly "what price will BTC/ETH/SOL/XRP/HYPE hit in 2026"
  events pay holding rewards (docs say 4.00% annualised; help centre says
  3.25%) ✅⚠️.
- **Kill rule:** shadow P&L lower bound < 0 after the Phase-1 window, or the
  realised touch frequency of faded strikes exceeds the options-implied rate.

### A2 — Strike ladders and range buckets

- **What:** daily "above ___" ladders (11 strikes, noon ET), "price on date"
  ranges (bucket = difference of two digitals), hourly ladders.
- **Pricing (Ref `pricing.digital_prob_with_skew`, `interp_vol`):** Deribit
  expiries are 08:00 UTC; noon ET sits between two of them → interpolate total
  variance; skew-adjusted digital; Binance basis.
- **Today's pattern:** the market's distribution was **wider** than options —
  YES too cheap near the money (84k: 0.745 vs 0.781 fair) and too rich in the
  tails (86k: 0.185 vs 0.127). Against options that looks like "sell the
  wings, buy the body"…
- **…but history says the ladder is already well calibrated (§5.2).** Over
  116 days (3,915 strike snapshots, 20/4/1 h before noon) cheap tails resolved
  YES about as often as priced; buying NO on them **lost** money after fee and
  spread. So the options gap on daily ladders is more likely short-dated
  implied vol understating BTC's realised moves than free money. What *did*
  show up: 95–98¢ favourites won 56/56 (+2.5% per $ in ~20 h after costs).
- **So A2 becomes:** favourite harvesting (A4) plus maker quoting around a
  fair value **calibrated to realised outcomes**, not raw options; options
  serve as a cross-check. Tail-selling here waits for shadow-ledger evidence.
- **Execution:** maker inside the spread first; take only when edge after fee
  exceeds the uncertainty band.
- **Kill rule:** as A1, measured per strike bucket (moneyness × time-to-noon).

### A3 — Options-anchored market making (after A1/A2 pricing is proven)

Quote both sides around fair value; skew quotes by inventory; widen when no
taker delay protects you (daily/weekly/monthly); hedge net BTC delta with
perps when it exceeds a threshold (non-US); earn spread + 20% rebate. Ref
`pricing.digital_delta` sizes the hedge. Measure **markouts** (+1 min, +10 min)
to see whether fills are toxic.

### A4 — Favourite harvesting

Maker bids on 95–99¢ outcomes that options price above the bid (e.g. far-ITM
ladder strikes). Fee at 97¢ is ~0.2%. Tiny edge, negative skew: strict caps,
only where the options fair value clears the bid by more than its error band.

### B1–B3 — Structural arbitrage scanner (one engine)

- **B1 complete sets:** `ask_yes + ask_no + fees < 1` → buy both and merge;
  `bid_yes + bid_no − fees > 1` → split and sell. Ref `arb.complete_set_*`.
  Note: at ~50¢ taker fees eat ~3.5¢ per set — most "arbs" vanish unless one
  leg is a maker fill.
- **B2 neg-risk buckets:** Σ YES asks < 1 (buy all), or NO set < N−1 (buy all
  NO; convert early) ✅ conversion returns N−1. Ref `arb.bucket_*`. Check that
  buckets are exhaustive.
- **B3 dominance lattice:** if event B ⊆ A on the **same source and time**,
  buy YES(A) + NO(B) for < $1 → ≥ $1 back. Relations available here:
  ladder strikes; daily-above(K) ⊆ daily-touch(K) ⊆ monthly-touch(K) when the
  day is in the month; hourly-above vs 1h Up/Down on the **same candle** (the
  hourly ladder's title time is the candle's *end*, Up/Down's is its
  *start*); yearly touch ⊇ monthly touch. Touch strikes added after a period
  starts may only count prices after listing ✅ (yearly) — check each strike's
  listing time before treating a relation as guaranteed. Ref
  `arb.dominance_arb_profit`, `arb.best_ladder_arb`.
- **Reality:** fast arbs close in seconds and bots dominate; the scanner earns
  mostly by resting maker orders at arb-consistent prices and catching
  stale quotes. Small, nearly riskless, worth automating.

### B4 — Post-close and settled-not-resolved sweeps

Binance-settled markets know their outcome at the candle close but resolve
via UMA ~12–14 minutes later; touch markets resolve "Yes at once" but books
can linger. Buy the known winner below $1 **only** when the settlement value
is clear of the strike by a safe margin (rules ambiguity: the noon market uses
the candle *opening* at 12:00 ET ✅). Risks: misread rules, UMA disputes
(bond 250, 600 s liveness ✅). Small, fast capital turnover.

### C1 — Same-claim cross-venue (US persons)

Kalshi `KXBTC15M` and Polymarket US 15-minute Up/Down both settle on the
CF Benchmarks BRTI 60-second average at open and close ✅. When YES on one
venue + NO on the other costs < $1 after both fees, lock the difference.
Verify window boundaries and strike computation match exactly before trading;
use maker on at least one leg (Polymarket US pays makers a rebate ✅).

### D1 — Short-horizon maker quoting (15m, 1h, 4h)

The 150 ms taker delay protects makers on 15m/1h. Quote around a TWAP- or
candle-aware fair value (Ref `edge_math.fair_prob_up`); cancel on spot moves;
never take. Only fund if Phase-1 markouts are positive after rebates.

### D2 — ML direction (research only)

Kronos and TimesFM stay in the research lane (§6). Licence note:
**TimesFM 3.0 weights are non-commercial, non-production only** ✅ —
production use needs Google Cloud (BigQuery ML) or the Apache-2.0 TimesFM
2.5.

### E1–E2 — Programs and adjacent income

- **Maker rebates:** 20% of taker fees, pro-rata, daily ✅. At 50¢ a maker
  fill earns ~0.35¢/share (Ref `arb.maker_rebate_per_share`).
- **Taker rebate program:** 3–50% of fees back by tier; crypto volume counts
  2.3× ✅.
- **Holding rewards:** see A1.
- **Liquidity reward pools:** none active on crypto today ✅; programmes appear
  (e.g. a $1M TWAP pool in Aug 2026) — a ready quoting engine captures them
  early when competition is thin.
- **Builder fees (optional business):** apps can add ≤100 bps taker / ≤50 bps
  maker on top ✅. Building tools others use is a different, lower-variance
  way to earn from these markets.

---

## 4. Economics

### 4.1 Fees and the maker/taker swing

Taker fee per share `0.07·p·(1−p)`: 1.75¢ at 50¢ (3.5% of stake), 0.33¢ at 95¢.
A maker pays nothing and earns ~20% of the fee back, so the swing between
taking and making is **4.2% of stake at 50¢**. Over hundreds of trades this
decides whether the same signal makes or loses money.

### 4.2 Worked examples from today's scan (snapshot, before depth checks)

> These show the *mechanics* of sizing an options-anchored trade. They are not
> current recommendations: resolved 2026 outcomes did not bear out the
> options view on short-dated tails (§5.2–5.3).

| Trade | Price paid (incl. fee) | Options fair | EV / share | EV per $ | ¼-Kelly stake |
|---|---:|---:|---:|---:|---:|
| NO "BTC dips to $82.5k in Oct" (taker) | 0.232 | 0.279 (0.262 at IV+3) | +4.7¢ (+3.0¢) | +20% (+13%) over 30 days | 1.5% (1.0%) |
| NO "BTC above $86k on Oct 2" (taker) | 0.830 | 0.873 (0.854) | +4.3¢ (+2.4¢) | +5.1% (+2.9%) over ~20 h | capped at 1–2% |
| YES "BTC above $84k on Oct 2" | 0.763 | 0.781 (0.761) | +1.8¢ (−0.2¢) | not robust → **skip** | — |

The NO on $82.5k still loses ~72% of the time — positive EV is not a
high hit rate. Size from the lower-bound fair (IV+3), never the point
estimate.

### 4.3 Capital velocity and capacity

Return per dollar per unit time matters as much as edge per trade. A 5% edge
over 20 hours (≈ 2,000% simple APR if repeatable daily) and a 13% edge over 30
days (≈ 160%) are both excellent *if the size exists*; the binding limit is
book depth and correlation, not APR (Ref `arb.simple_apr`). Daily ladders
recycle capital daily; monthly/yearly touch markets offer size but lock it.

### 4.4 How long until you know (one-sided 95%, 80% power)

| True net edge per $ | Independent bets needed |
|---:|---:|
| 5% | 2,474 |
| 3% | 6,870 |
| 2% | 15,457 |

Strike-level bets on the same day are correlated, so count **days/events**,
not strikes. That is why §7 also validates the pricing model historically
(DVOL-based backtest over past months) instead of waiting for live P&L alone.

---

## 5. Testing the edges: live options scan vs resolved history

### 5.1 Live fair-value scan (2026-10-01 20:16 UTC)

`experiments/fair-value-scan/scan.py` (read-only) priced three live families
off the Deribit smile. Full table: `experiments/fair-value-scan/results/`.

- **Monthly touch (October):** YES above fair on 16 of 19 open strikes
  (several only by 0.1–0.3 pts, inside the error band); the largest gaps were
  near-the-money down strikes (82.5k: +6.4 pts, 80k: +4.4, 77.5k: +3.5) and
  mid up strikes (+1–2 pts).
- **Weekly touch:** most far-tail strikes (70k–78k down; 90k–94k up) priced
  1–2.3 pts above fair — small in absolute terms but 1.5–10× the fair
  probability.
- **Daily "above" (Oct 2 noon):** the market's distribution was wider than
  options: 84k YES 3.6 pts cheap, 86k YES 5.8 pts rich, 88k 2.2 pts rich.
- **Method lesson:** our first pass ignored the smile's slope in touch pricing
  and showed the *opposite* sign on the downside. With the skew-consistent
  correction (Ref `touch_prob_skew`, tested) the scan matches the literature.
  Pricing details decide the sign of the trade.
- **Not yet known:** book depth at those prices, persistence over time, and
  real-world vs risk-neutral gap — all Phase-1 measurements.

### 5.2 Historical calibration — does the bias actually pay? (model-free)

Options-implied gaps are a model's opinion. The direct test is whether
Polymarket prices matched what happened. `experiments/fair-value-scan/`
pulled resolved markets and each strike's price before settlement
(`prices-history`), bucketed by price, with day-clustered bootstrap CIs and
returns after taker fee + 0.5¢ half-spread.

**Daily "above" ladders, 116 days, 3,915 strike-snapshots** (`ladder_calibration.md`):

| YES price (20 h before noon) | n | avg price | YES rate | buy YES | buy NO |
|---|---:|---:|---:|---:|---:|
| < 2¢ | 466 | 0.003 | 0.006 | −61% | −0.5% (CI −1.3%, +0.1%) |
| 2–5¢ | 45 | 0.031 | 0.044 | +30% | −2.0% |
| 95–98¢ | 56 | 0.969 | **1.000** | **+2.5%** | −100% |
| ≥ 98¢ | 517 | 0.997 | 1.000 | +0.2% | −100% |

- **No longshot bias to sell** in daily ladders after costs: cheap tails
  resolved YES at least as often as priced. Middle buckets are noisy (CIs
  ±20 pts) — no exploitable pattern at this sample size.
- **Near-certain favourites looked underpriced:** 95–98¢ won 56/56 (+2.5% per $
  in ~20 h). Caveat: 56 straight wins still allow a true loss rate up to ~5%
  (rule of three), which would erase it; treat as a lead for A4, sized small.

### 5.3 Touch markets ("what price will Bitcoin hit"), daily and weekly

`touch_calibration.md`: YES price 3 h (daily) / 12 h (weekly) after the
period opens vs official outcome; unquoted strikes excluded.

| Market | YES price bucket | n | avg price | YES rate | buy NO after costs (95% CI) |
|---|---|---:|---:|---:|---|
| Daily touch (43 days, 662 strikes) | < 2¢ | 383 | 0.006 | **0.024** | **−2.1%** (−4.9%, −0.1%) |
| | 10–20¢ | 43 | 0.147 | **0.256** | **−13.7%** (−27.5%, −1.0%) |
| Weekly touch (19 weeks, 261 strikes) | < 2¢ | 109 | 0.009 | **0.046** | −4.2% (−13.2%, +0.5%) |
| | 20–35¢ | 24 | 0.285 | 0.167 | +12.7% (−9.3%, +30.8%) |

- Cheap touch tails were **under**-priced in 2026: BTC hit far strikes more
  often than the market charged. Fading them lost money. Mid-priced weekly
  strikes leaned the other way but with CIs that include zero.
- **Data trap we hit:** the first run produced a spectacular but **spurious**
  "NO edge" (up to +79% per $): newly listed strikes report the midpoint of an
  empty book (0.50) until someone quotes them. Filtering unquoted snapshots is
  mandatory in any Polymarket history study (first run kept under
  `results/superseded/`).

**Lesson for the plan:** published biases and options gaps are hypotheses;
recent Polymarket BTC ladders were efficient in the tails. Every strategy
must clear the shadow ledger and this kind of calibration test before money.

---

## 6. Model shootout: Kronos vs TimesFM 3 (2026-10-01)

Can the time-series foundation models the original article relied on predict
Polymarket's BTC Up/Down markets better than the market itself? We ran them
on this machine (CPU) three ways. Everything is in
`experiments/model-shootout/` and was committed **before** each market
resolved.

**Setup.** Kronos-base (MIT; sampled paths → share ending above the strike)
and TimesFM 3.0 (Google; deciles → probability; deterministic, so its 3 runs
are identical by construction), on Binance BTCUSDT candles; merged = the
average of the two; baselines = the market's own price, a volatility-scaled
random walk, and (for 4h/daily) Deribit options.

**1. Statistics: walk-forward backtest, last 24 h, 96 windows × 2 decision
times, scored against Polymarket's official results** (`backtest_report.md`).

| Decision | Forecaster | Hit rate | Brier | vs market (95% CI) | naive trading, per $ |
|---|---|---:|---:|---|---|
| window open | market | 51% | 0.252 | — | — |
| | TimesFM 3 | **44%** | 0.280 | **+0.028 (+0.007, +0.050) worse** | −19.6% (−42%, +2%) |
| | random walk | 50% | 0.250 | −0.002 (−0.006, +0.002) | — (23 trades) |
| 5 min in | market | 74% | 0.175 | — | — |
| | TimesFM 3 | 69% | 0.207 | **+0.032 (+0.008, +0.059) worse** | **−21.7% (−40%, −3.5%)** |
| | random walk | 71% | 0.186 | +0.011 (−0.010, +0.035) | −1.3% (−23%, +22%) |
| | Kronos-base | 68% | 0.205 | +0.030 (−0.008, +0.072) worse | −7.4% (−27%, +14%) |
| | merged (Kronos+TimesFM) | 69% | 0.195 | +0.020 (−0.006, +0.049) worse | **−25.1% (−43%, −6.6%)** |
| window open | Kronos-base | _running (CPU-bound); added when complete_ | | | |

TimesFM 3 is **statistically worse than the market price** at both decision
points, and trading on its disagreements lost ~20% per $. Kronos carries real
information mid-window (when it said < 20%, Up happened 21% of the time; > 80%,
100%) but the market prices the same information better, and trading the
merged forecast against the market lost 25% per $ (CI excludes zero). This
replicates the published null result for 15-minute markets (Young 2026).

**2. Live forecasts, frozen before the outcome** (`report_1790885700.md`,
`predictions_1790887500*.md`, `live_loop.md`). Two multi-horizon snapshots
(20:15 and 20:45 UTC) and a rolling loop that predicted every 15-minute
window from 21:00 to 22:30 at its open:

| Session | Kronos | TimesFM 3 | merged | market |
|---|---:|---:|---:|---:|
| Snapshots (4 market calls) | 3/4 | 1/4 | 3/4 | 1/4 |
| Rolling loop (7 windows) — hit rate · Brier | 3/7 · 0.290 | 5/7 · 0.232 | 4/7 · 0.255 | 3/7 · 0.248 |
| **All 11 live market calls** | **6/11** | **6/11** | 7/11 | 4/11 |

The two models swapped places between sessions — exactly what noise looks
like at this sample size. The market's at-the-open price is ~0.50 by design
(Brier ≈ 0.25), so a forecaster has to beat 0.25 *consistently*; over 96
backtest windows neither did. Kronos also leaned bearish on almost every
call during a mostly falling evening and was overconfident (sampled paths
~6 bp wide vs ~19 bp typical moves). The 4-hour, daily and ladder
predictions are scored as they settle (results folder).

**Verdict so far:** don't trade direction on these models. Keep them as
research inputs, test any new model the same way (frozen predictions,
official outcomes, Brier vs the market), and remember the licence: TimesFM
3.0 weights are non-commercial.

---

## 7. Phases, tasks and gates

| Phase | Window | Goal | Money at risk |
|---|---|---|---|
| 0 | Days 1–3 | Venue matrix, compliance, verification, infra | $0 |
| 1 | Weeks 1–2 | Catalogue + options surface + scanner + **shadow ledger for all strategies**; historical pricing backtest | $0 |
| 2 | Weeks 3–5 | Build execution for the top 2–3; micro-live structural ones | ≤ $1,000 |
| 3 | Weeks 5–10 | Market-making engine + hedging; scale winners by ladder | ladder (§9) |
| 4 | Month 3+ | Capital allocation across strategies; add ETH/SOL/XRP; continuous re-validation | ladder |

Copy-paste Claude Code prompts for each phase: `prompts/PROMPTS.md`.

### Phase 0 — Decide, verify, set up (Days 1–3)

- [ ] **Venue matrix (§2.3):** confirm which venues you may use (Polymarket
  geoblock endpoint ✅ `GET https://polymarket.com/api/geoblock`, Kalshi,
  Polymarket US, Deribit/OKX trading vs data-only). Stop if none qualify.
- [ ] Dedicated wallet/accounts holding only the bankroll; collateral is
  **pUSD** on Polymarket ✅.
- [ ] Verify the remaining ⚠️ items (§11); write `docs/verified-facts.md`.
- [ ] VPS + chrony; RTT to CLOB and Deribit from a permitted region.

### Phase 1 — Measure everything (Weeks 1–2, read-only)

- [ ] **Catalogue + rules normaliser:** crawl Gamma for every crypto market;
  parse each into a canonical claim `{source, instrument, time window,
  operator, threshold}` (templates per series; new templates need human
  review). This is what lets B3 find relations automatically.
- [ ] **Options surface:** Deribit (and OKX as backup) smiles every minute;
  forwards; DVOL; store.
- [ ] **Pricing engine:** touch (skew-consistent), digital (skew), buckets,
  TWAP/candle fair values — reuse `reference/` and keep its tests.
- [ ] **Recorder:** Polymarket books (all crypto markets), Binance 1m, RTDS
  TWAP, Deribit — every record with `ts_exch` and `ts_recv`.
- [ ] **Scanner + shadow ledger:** every strategy in §3 posts the trades it
  *would* make at executable prices (taker) or would-be-filled prices (maker,
  conservative queue model), with fees, and marks them to resolution.
- [ ] **Calibration on resolved history (every market family):** the model-free
  version is done for daily ladders and daily/weekly touch (§5.2–5.3; rerun
  monthly). Extend to range buckets, hourly ladders, monthly/yearly touch,
  and add an options-anchored version (DVOL + skew proxy at each snapshot)
  to see whether options-implied gaps ever predicted outcomes. Filter
  unquoted placeholder prices.
- [ ] Daily report: opportunities seen, size available, edge after fees,
  persistence (seconds/minutes), who took them (if visible).

**Gate G1 (end of week 2):** a league table per strategy: shadow net P&L
with time-block bootstrap 95% CI, capacity ($/day at the observed depth),
persistence, correlation with the others. Fund only strategies with
**lower bound > 0** (or, for A1/A2, historical backtest LB > 0 **and** shadow
P&L ≥ 0). Kill the rest — write down why.

### Phase 2 — Build and go micro-live (Weeks 3–5)

- [ ] Executor: post-only maker orders, FAK takers, multi-leg with leg-risk
  unwinds (B1–B3), heartbeat (orders cancel if no heartbeat within 10 s ✅).
- [ ] Risk engine (§8) with code-constant limits.
- [ ] Micro-live: structural strategies (B1–B3) at $300–$1,000 as soon as
  the executor passes chaos drills; A1/A2 at ≤ $1,000 after G1.
- [ ] Weekly paper-vs-live gap report.

**Gate G2 (end of week 5):** live results within the shadow model's error
bars; zero unreconciled positions; zero limit breaches.

### Phase 3 — Market making and hedging (Weeks 5–10)

- [ ] A3 quoting engine on daily ladders and touch markets; inventory skew;
  markout monitoring; auto-widen on toxic flow.
- [ ] Hedge book (non-US: perps/options; US: CME/Coinbase/Kalshi perp).
- [ ] D1 on 15m/1h only if Phase-1 markouts were positive.

### Phase 4 — Allocate, expand, re-validate (Month 3+)

- [ ] Weekly capital allocation: weight = lower-bound edge × capacity, with
  per-family caps; idle capital → holding-reward positions (if permitted) or
  withdrawn.
- [ ] Add ETH, SOL, XRP (same engines; options data for ETH/SOL on Deribit).
- [ ] C1 cross-venue (US) and any new reward pools.
- [ ] Monthly re-run of the historical backtest; retire decaying strategies.

---

## 8. Portfolio risk and capital allocation

| Limit | Start | Enforced by |
|---|---:|---|
| Per-trade stake | ≤ 1% of bankroll (¼-Kelly on lower-bound fair) | code constant |
| Per-event exposure (all strikes of one event) | ≤ 5% | code |
| **Crash scenario** (BTC −15% in 24 h, IV +20 pts) | loss ≤ 10% of bankroll | code, recomputed every minute |
| **Squeeze scenario** (BTC +15% in 24 h) | loss ≤ 10% | code |
| Net BTC delta (USD P&L per 1% move) | ≤ 1.5% of bankroll | code; hedge above |
| Capital in UMA-pending resolution | ≤ 15% | code |
| Per-venue balance | ≤ 50% of total capital | ops |
| Daily / weekly realised loss | 3% → halt day / 8% → halt, manual restart | code |
| Peak-to-trough drawdown | 15% → halt, review | code |

Config may only tighten these. Never size up after losses. Kill switches
(cancel-all + alert): stale feeds, options-surface staleness, clock skew,
reject storms, reconciliation mismatch, realised-vs-expected drift, `KILL`
file, Telegram `/halt`.

**Allocation rule:** each strategy gets `min(cap_family, LB_edge × capacity
share)`; structural (B) can scale faster than model-based (A) because its
risk is operational, not forecast-based; D-family stays smallest.

---

## 9. Capital ladder

| Stage | Bankroll | Entry condition | Demotion trigger |
|---|---:|---|---|
| 0 Shadow | $0 | Phase 0 done | — |
| 1 Micro | $300–$1,000 | G1 league table, executor chaos-tested | any limit breach |
| 2 Small | $2,000–$5,000 | G2 | rolling 4-week LB < 0 for that strategy |
| 3 Medium | $10,000–$25,000 | 3 months live, LB > 0 on ≥ 2 families, DD < 10% | as above |
| 4 Large | ≤ measured capacity | capacity study per market family | as above |

Stage up only on new evidence, never because the equity curve rose. Withdraw
profits on a schedule. Only risk money you can afford to lose.

---

## 10. Realism rules (backtest, shadow, paper)

1. No look-ahead: everything keyed on `ts_recv`; options surfaces as of the
   decision time; outcomes from the venue's official resolution.
2. Taker fills walk the recorded book at decision time + taker delay + RTT;
   maker fills assume back-of-queue and fill only on trade-through.
3. Fees, rebates, spreads always on; rebates credited only on filled maker
   volume.
4. Cluster statistics by event/day (block bootstrap).
5. Pre-register strategy variants and thresholds before looking at hold-out
   data; report how many variants were tried.

---

## 11. Ops, security, compliance, verification

**Security:** dedicated wallets holding only the bankroll; keys in env/secret
store; `.env` git-ignored; pinned dependencies; official SDK only
(`pip install polymarket-client` ✅) — copy-pasted "Polymarket bot" repos are a
common way to get drained; non-root service user; encrypted off-box backups.

**Compliance/tax:** venue matrix (§2.3), no geoblock circumvention, keep the
ledger for tax, talk to a tax professional. Licences: TimesFM 3.0 weights are
non-commercial ✅; Kronos is MIT ✅.

**Resolved since v2 ✅:** fee rate (0.07, all crypto horizons); 15m/4h rules
(Chainlink 60 s TWAP, `eventMetadata.priceToBeat/finalPrice`); 1h/daily/touch
rules (Binance candles); slug patterns; order types (GTC/GTD/FOK/FAK,
post-only, batch ≤ 15, min size 5); heartbeat (cancel after 10 s without
one); taker delay (150 ms, only 5m/15m/1h); rebates (20%, daily, pUSD,
$1 minimum); Kronos `predict(sample_count=N)` averages paths (use
batch-of-1 sampling for distributions).

**Still ⚠️ (Phase 0):**
- [ ] Holding-reward rate (4.00% vs 3.25%) and whether complete sets may be
  parked for it under the Terms.
- [ ] Neg-risk conversion fee (`feeBips`) on BTC range markets.
- [ ] Sell-side fee mechanics (fee in shares vs pUSD) — affects arb maths.
- [ ] Kalshi and Polymarket US 15-minute window alignment and strike
  computation (C1).
- [ ] Chainlink TWAP vs Binance/BRTI basis (feed needs credentials).
- [ ] Your jurisdiction's treatment of prediction-market and derivatives
  income.

---

## 12. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Options-implied "edges" that don't show up in resolved outcomes (already observed for 2026 daily/weekly tails) | **High** | Systematic losses | Calibration test on resolved history before funding; shadow ledger; size from lower bound |
| The options-vs-Polymarket gap is a risk premium you're paid to bear, not a free lunch (crashes) | Medium | Large drawdown | Crash/squeeze scenario caps; diversify expiries; option hedges where legal |
| Pricing model error (skew, interpolation, basis) flips the sign | Medium | Systematic losses | Tested reference maths; IV±3 bands; historical backtest; size from lower bound |
| Rules misread (candle open vs close, tie rules, strikes added later) | Medium | Loss on "sure" trades | Rules normaliser + human-reviewed templates; margin from strike |
| UMA dispute / oracle error | Low | Single-event loss | Cap UMA-pending capital; avoid near-strike post-close sweeps |
| Bots take arbs first | High | Low revenue | Maker-resting scanner; don't depend on B for income |
| Venue rule/fee changes (frequent in 2026) | High | Edge shifts | Read parameters live; changelog watch; monthly re-validation |
| Thin books cap size | High | Can't scale | Capacity study before Stage 4; spread across families/assets |
| Leg risk on multi-leg trades | Medium | Unintended exposure | FAK legs, immediate unwind logic, chaos drills |
| Key theft / malicious dependency | Low–Med | Total loss of hot wallet | Dedicated wallet, official SDK, pinned deps |
| Regulatory/jurisdiction | Low if compliant | Frozen funds | Venue matrix, no circumvention |

---

## 13. Sources

Primary / official ✅: Polymarket docs (fees, maker rebates, liquidity rewards,
holding rewards, order placement/management, perps, geoblock, changelog) —
https://docs.polymarket.com · Gamma/CLOB live APIs · Deribit public API —
https://docs.deribit.com · Kalshi API/series and contract terms —
https://docs.kalshi.com · Polymarket US docs — https://docs.polymarket.us ·
Kronos — https://github.com/shiyu-coder/Kronos · TimesFM —
https://github.com/google-research/timesfm (TimesFM 3.0 licence notice).

Research 📄: Saguillo et al. 2025 https://arxiv.org/abs/2508.03474 · Young 2026
https://arxiv.org/abs/2607.26245 · Bürgi, Deng & Whelan 2025
https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5502658 · Becker 2026
https://www.jbecker.dev/research/prediction-market-microstructure · Akey et al.
2026 (CEPR DP21615) · Fabi et al. 2025 http://www.aifinconf.org/file/2025/7-1.pdf ·
Portnaya 2026 https://arxiv.org/abs/2606.19517 · Lee, Lee & Lee 2026
https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6748186 · Gebele, Mutzel &
Matthes 2026 https://arxiv.org/abs/2608.00666 · Cardozo & Rivero-Wildemauwe 2026
https://arxiv.org/abs/2609.12878 · Dai, Jia & Yu 2026
https://arxiv.org/abs/2606.31675.
