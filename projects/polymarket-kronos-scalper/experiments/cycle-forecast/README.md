# cycle-forecast: can dominant-cycle BUY/SELL dates beat random timing?

An open recreation of the idea behind Elcaro's "FM" module (cycle detection →
projected BUY/SELL dates), tested honestly on Bitcoin.

## What's here

| File | What |
|---|---|
| `cycles.py` | Two cycle methods: Ehlers roofing filter + DFT, and detrended FFT; least-squares sine fit projects the next trough (BUY) and peak (SELL) |
| `lastguru.py` | Line-by-line Python port (MPL-2.0) of lastguru's TradingView **DominantCycle** library: MESA/MAMA, Pearson autocorrelation, DFT, phase accumulation |
| `fm_engine.py` | Ensemble consensus across all 6 estimators + SuperTrend trend filter |
| `backtest_fm.py` | Walk-forward test, 6 methods × 1D/4H/1H, vs scrambled-timing baseline and buy-and-hold → `results/fm_report.md` |
| `confidence_fm.py` | Do agreement/trend filters help? Discovery half vs untouched validation half → `results/fm_confidence.json` |
| `test_*.py` | Synthetic-cycle and no-look-ahead tests |

Run with the model-shootout venv:
`../model-shootout/.venv/bin/python -m unittest -v && ../model-shootout/.venv/bin/python backtest_fm.py`

## Findings (2026-10-02)

- Random-timed dates land within ±2 bars of a real BTC turn ~32% of the time;
  the cycle dates landed 27–38%. 4 of 54 tests reached p ≤ 0.05 (≈2.7 expected
  by chance). Trading the dates lagged buy-and-hold in most configurations.
- Confidence filters looked strong in-sample (daily BUY dates with agreement +
  trend: 47% vs 33%, p = 0.03) and vanished out-of-sample (30% vs 32%,
  p = 0.61). Grades built this way measure agreement, not accuracy.
- Claims like "95% of data points hit the bullseye" are easy to produce with a
  loose hit window; always compare with random dates.
