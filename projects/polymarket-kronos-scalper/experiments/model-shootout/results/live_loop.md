# Live 15-minute forecasts (Kronos-base vs TimesFM 3 vs market)

P = forecast probability of Up at the window open; ✓ = right side of 50%.

| window (UTC) | Kronos | TimesFM 3 | merged | market | result |
|---|---:|---:|---:|---:|---|
| 21:00 | 0.37 ✗ | 0.65 ✓ | 0.51 ✓ | 0.49 ✗ | UP |
| 21:15 | 0.34 | 0.47 | 0.40 | 0.51 | pending |

After 1 scored windows:

| forecaster | hit rate | mean Brier (lower = better) |
|---|---:|---:|
| kronos | 0% (1) | 0.396 |
| timesfm | 100% (1) | 0.124 |
| merged | 100% (1) | 0.241 |
| market | 0% (1) | 0.255 |

A handful of windows is an anecdote: see backtest_report.md for statistics.