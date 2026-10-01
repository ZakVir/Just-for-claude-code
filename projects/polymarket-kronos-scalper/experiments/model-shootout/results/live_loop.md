# Live 15-minute forecasts (Kronos-base vs TimesFM 3 vs market)

P = forecast probability of Up at the window open; ✓ = right side of 50%.

| window (UTC) | Kronos | TimesFM 3 | merged | market | result |
|---|---:|---:|---:|---:|---|
| 21:00 | 0.37 ✗ | 0.65 ✓ | 0.51 ✓ | 0.49 ✗ | UP |
| 21:15 | 0.34 ✓ | 0.47 ✓ | 0.40 ✓ | 0.51 ✗ | DOWN |
| 21:30 | 0.27 ✓ | 0.43 ✓ | 0.35 ✓ | 0.51 ✗ | DOWN |
| 21:45 | 0.34 ✗ | 0.40 ✗ | 0.37 ✗ | 0.52 ✓ | UP |
| 22:00 | 0.24 ✗ | 0.40 ✗ | 0.32 ✗ | 0.52 ✓ | UP |
| 22:15 | 0.27 ✓ | 0.37 ✓ | 0.32 ✓ | 0.51 ✗ | DOWN |
| 22:30 | 0.60 ✗ | 0.49 ✓ | 0.54 ✗ | 0.49 ✓ | DOWN |

After 7 scored windows:

| forecaster | hit rate | mean Brier (lower = better) |
|---|---:|---:|
| kronos | 43% (7) | 0.290 |
| timesfm | 71% (7) | 0.232 |
| merged | 57% (7) | 0.255 |
| market | 43% (7) | 0.248 |

A handful of windows is an anecdote: see backtest_report.md for statistics.