# model-shootout: Kronos vs TimesFM 3 on live BTC

Does a time-series foundation model forecast Polymarket's Bitcoin Up/Down
markets better than the market itself? Two parts:

1. **Live snapshot** (`snapshot.py` → `score.py`): freeze BTC candles at a
   15-minute window open, run each model 3 times, merge, then wait for the
   horizons to pass and score against Binance and Polymarket's **official**
   resolution, alongside the market's own probability at the snapshot.
2. **Walk-forward backtest** (`backtest.py`): the same comparison over 144
   recent 15-minute windows × 2 decision times (window open, and 5 minutes
   in), plus a simple random-walk baseline and a fee-inclusive trading
   simulation. One snapshot is an anecdote; this is the statistics.

## Setup (CPU is fine)

```bash
cd projects/polymarket-kronos-scalper/experiments/model-shootout
python3 -m venv .venv
.venv/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch==2.14.1
.venv/bin/pip install -r requirements.txt
git clone --depth 1 https://github.com/shiyu-coder/Kronos ../../vendor/Kronos
```

Weights download from Hugging Face on first use: `NeoQuasar/Kronos-base`
(+ `Kronos-Tokenizer-base`) and `google/timesfm-3.0-pytorch`. On 4 CPU cores,
Kronos-base takes ~6 s per sampled 15-step path; TimesFM 3 ~0.4 s per
forecast.

## Run

```bash
.venv/bin/python snapshot.py --start <unix 15-min boundary> --runs 3 --paths 10
.venv/bin/python score.py --start <same>          # waits for each horizon
.venv/bin/python backtest.py --hours 36 --paths 6 # ~45 min on 4 cores
```

## Method notes

- **Data:** Binance BTCUSDT 1m/5m klines via `data-api.binance.vision`
  (`api.binance.com` is geo-blocked here). Only candles that closed before
  the decision time are used. Polymarket's 15-minute markets settle on
  Chainlink's 60 s TWAP, so Binance is a proxy for the model inputs; scoring
  uses Polymarket's official result.
- **Kronos probabilities:** `predict(sample_count=N)` returns the *average* of
  N paths, so we batch the series N times with `sample_count=1` and take the
  share of paths ending above the strike.
- **TimesFM probabilities:** deterministic; decile forecasts → normal fit →
  P(above strike). Three runs are identical by construction (verified).
- **Merged forecast:** equal-weight average of the two probabilities.
- **Baselines:** the market's own price at the decision time
  (`prices-history`) and a driftless random walk scaled by the last hour's
  1-minute volatility.
- **Licence:** TimesFM 3.0 weights are non-commercial/non-production —
  fine for this evaluation, not for a live trading system.

## Results

See `results/report_<start>.md` (live snapshot) and
`results/backtest_summary.json` (walk-forward), summarised in PLAN.md §6.
