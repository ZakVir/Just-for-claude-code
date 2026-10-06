# Turnpoint

Cycle turn dates (BUY at a projected trough, SELL at a projected crest) for BTC,
ETH, SOL and XRP on the weekly, daily, 4-hour and hourly charts. Every date is
written to a public ledger before it arrives and scored afterwards against
randomly timed dates.

Built as an open alternative to Elcaro's FM / VOL / TREND modules. It aims to
match them feature for feature. Where it goes further is the record: Elcaro
publishes testimonials, while Turnpoint publishes its hit rates, including the
bad ones.

## What it shows

| Module | What it does |
| ------ | ------------ |
| **FM: turn dates** | Six cycle estimators each find the dominant cycle and where "now" sits in it: Ehlers roofing filter + DFT, detrended FFT, and lastguru's MESA/MAMA, Pearson autocorrelation, DFT and phase accumulation. Their phases are averaged on the circle and projected with the median period, so the BUY and SELL dates are always half a cycle apart. |
| **Cycle path** | A dotted line over price: where price would go if only the cycle moved. It is a timing guide, not a price target. A second panel shows the cycle oscillator with rising/falling shading and ±1σ/±2σ bands. |
| **TREND** | ATR trailing stop (SuperTrend-style), drawn green in an uptrend and red in a downtrend. |
| **VOL** | Sigma zones around the 20-bar mean, plus a 1σ/2σ cone of where price lands 68% / 95% of the time under its current EWMA volatility. |
| **Gearbox** | 1W + 1D set the phase, 4H confirms it, 1H times the entry. It also gives an agreement grade, which measures how much the modules agree with one another. It is **not** a probability. |
| **Track record** | Walk-forward backtest per timeframe, next to the same forecasts with their timing scrambled 300 times. |
| **Ledger** | `data/ledger.jsonl`: one line per asset, timeframe and bar. It is append-only and versioned in git, and scored once each date has passed. |
| **Head to head** | `data/rivals.json`: another tool's calls, entered by hand, against Turnpoint re-run on only the candles closed at that moment. Both are scored by the same rule. |

## Scoring rule

A **turn** is a close that is the lowest (or highest) within 5 bars either side.
A date **hits** if a turn of the right kind lands within 2 bars of it. By chance,
a date hits about 31–33% of the time on these charts, so that rate is the bar to
beat.

## Results so far

See `data/backtest.json` and the Track record panel in the app. In summary, on
2018–2026 data (daily) and the most recent 4,400 bars (4H, 1H), the cycle dates
do **not** reliably beat randomly timed dates. Across 4 coins × 3 timeframes ×
BUY/SELL, about as many p-values fall below 0.05 as luck alone would produce.
Holding while the cycle is rising lagged buy-and-hold in most tests. An earlier
study of the same estimators found the same thing
(`projects/polymarket-kronos-scalper/experiments/cycle-forecast` on the
`claude/polymarket-kronos-scalper-plan` branch). In that study, a confidence
filter that looked good in-sample did not hold up out of sample.

## Run

```bash
cd projects/turnpoint
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python engine/build.py              # live forecasts + ledger + app (about 1 min)
.venv/bin/python engine/build.py --backtest   # also recompute backtests (about 6 min)
cd engine && ../.venv/bin/python -m unittest  # tests
```

The build pulls public candles from `data-api.binance.vision` and writes:

- `data/turnpoint.json`
- `data/backtest.json`
- `data/ledger.jsonl`
- `app/turnpoint.html`: the self-contained page, rendered from `app/template.html`, with the data embedded.

## Files

```
engine/
  data.py         Binance klines (closed candles only)
  cycles.py       Ehlers roofing filter, DFT/FFT dominant period, sine fit and projection
  lastguru.py     port of lastguru's DominantCycle estimators (MPL-2.0)
  fm_engine.py    per-method turn offsets and the circular consensus
  signals.py      sigma zones, EWMA vol cone, ATR trend trail
  forecast.py     per-timeframe view and the gearbox
  scoring.py      pivots, hit rates, scrambled-timing baseline, follow-the-cycle P&L
  ledger.py       append-only forecast log and its scoring
  headtohead.py   other tools' calls vs Turnpoint at the same moment
  build.py        runs everything and renders the app
app/template.html the page (data placeholder: /*__TURNPOINT_DATA__*/null)
data/             ledger, backtests, head-to-head inputs, latest build
```

## Notes

- Educational analysis only. There is no trading code here.
- `lastguru.py` swaps lastguru's own high-pass/super-smoother helpers for Ehlers'
  roofing filter (marked `[VERIFY]` in the file).
- The weekly view is too short for a meaningful backtest. It is shown for phase
  context only.
