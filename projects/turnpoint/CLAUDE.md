# Turnpoint: project instructions

Turnpoint is a cycle-timing dashboard: projected BUY (trough) and SELL (crest)
dates for BTC, ETH, SOL and XRP on 1W/1D/4H/1H, with trend and volatility
context and a public record of how those dates have scored.

## Rules for working here

- **Report results plainly.** The backtests found that the cycle dates do not
  reliably beat randomly timed dates. Copy in the app must never claim or imply
  accuracy the record doesn't show. "Agreement" means the modules agree with one
  another; it is not a probability.
- **The ledger is append-only.** Never edit or delete lines in `data/ledger.jsonl`
  once they are committed. A fix to the engine applies to new forecasts only.
- **No look-ahead.** Every forecast, backtest step and head-to-head re-run may use
  only candles that had closed at that time. `engine/forecast.py` drops the
  forming candle; `engine/headtohead.py` truncates to `as_of`.
- **Don't impersonate other products.** Turnpoint is its own name and design.
  Calls from other tools go in `data/rivals.json`, labelled with their source and
  how they were read.
- `engine/lastguru.py` is a port of lastguru's MPL-2.0 Pine library: keep its
  licence header.
- Educational analysis only: no order placement, no keys, no secrets in the repo.

## Run

```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python engine/build.py              # forecasts + ledger + app, reuses cached backtests
.venv/bin/python engine/build.py --backtest   # also recompute walk-forward backtests (about 6 min)
cd engine && ../.venv/bin/python -m unittest  # tests
```
