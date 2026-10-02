# Dominant-cycle BUY/SELL dates on Bitcoin: walk-forward test

Generated 2026-10-02T17:02Z. Forecast made at every bar from data up to that bar only. A date 'hits' if a real turn (close lowest/highest within ±5 bars) lands within ±2 bars of it. Baseline = the same forecasts with scrambled timing (300 circular shifts); p = share of scrambled runs doing at least as well. Trading: long while the projected cycle is rising, 0.1% fee per side; log returns.

| timeframe / method | BUY hit (scrambled) | p | SELL hit (scrambled) | p | long-only | p | buy & hold |
|---|---|---:|---|---:|---:|---:|---:|
| 1d/ehlers | 32.7% (31.9%) | 0.37 | 33.1% (31.6%) | 0.34 | +0.77 | 0.64 | +2.53 |
| 1d/fft | 33.8% (32.1%) | 0.28 | 34.4% (31.5%) | 0.11 | +0.95 | 0.69 | +3.18 |
| 1d/lastguru-mama | 33.3% (32.8%) | 0.41 | 26.5% (31.5%) | 0.99 | +0.33 | 0.79 | +2.48 |
| 1d/lastguru-pearson | 35.5% (32.9%) | 0.11 | 29.5% (31.7%) | 0.87 | +0.91 | 0.54 | +2.48 |
| 1d/lastguru-dft | 32.8% (32.8%) | 0.49 | 32.0% (31.5%) | 0.39 | +2.08 | 0.10 | +2.48 |
| 1d/lastguru-phase | 33.2% (32.8%) | 0.43 | 36.3% (31.6%) | 0.05 | +1.71 | 0.21 | +2.48 |
| 4h/ehlers | 30.3% (30.8%) | 0.55 | 31.4% (31.7%) | 0.53 | -0.05 | 0.41 | +0.16 |
| 4h/fft | 30.2% (31.0%) | 0.63 | 35.5% (31.5%) | 0.05 | +0.34 | 0.02 | -0.07 |
| 4h/lastguru-mama | 30.9% (30.6%) | 0.42 | 33.1% (31.4%) | 0.13 | -0.49 | 0.71 | +0.24 |
| 4h/lastguru-pearson | 30.2% (30.7%) | 0.60 | 28.6% (31.6%) | 0.96 | -0.51 | 0.76 | +0.24 |
| 4h/lastguru-dft | 28.7% (30.6%) | 0.87 | 32.6% (31.6%) | 0.29 | -0.26 | 0.57 | +0.24 |
| 4h/lastguru-phase | 27.3% (30.7%) | 0.96 | 30.7% (31.3%) | 0.58 | +0.27 | 0.14 | +0.24 |
| 1h/ehlers | 37.2% (33.3%) | 0.06 | 31.5% (32.3%) | 0.62 | -0.12 | 0.38 | +0.17 |
| 1h/fft | 37.9% (33.3%) | 0.03 | 36.2% (32.3%) | 0.08 | +0.06 | 0.30 | +0.18 |
| 1h/lastguru-mama | 33.5% (33.3%) | 0.45 | 34.4% (32.2%) | 0.09 | -0.44 | 0.62 | +0.18 |
| 1h/lastguru-pearson | 35.2% (33.4%) | 0.18 | 29.7% (32.2%) | 0.92 | -0.34 | 0.34 | +0.18 |
| 1h/lastguru-dft | 33.8% (33.4%) | 0.41 | 34.1% (32.4%) | 0.17 | -0.35 | 0.80 | +0.18 |
| 1h/lastguru-phase | 34.1% (33.2%) | 0.33 | 29.6% (32.1%) | 0.84 | -0.40 | 0.98 | +0.18 |

4 of 54 tests reached p ≤ 0.05; about 2.7 would by chance alone.

## Current forecast (for information only)

| timeframe / method | phase | next BUY date (UTC) | next SELL date (UTC) | cycle (bars) |
|---|---|---|---|---:|
| 1d/ehlers | rising (between BUY and SELL) | 2026-11-12 00:00 | 2026-10-18 00:00 | 51 |
| 1d/fft | falling (between SELL and BUY) | 2026-11-07 00:00 | 2027-01-06 00:00 | 120 |
| 1d/lastguru-mama | rising (between BUY and SELL) | 2026-10-20 00:00 | 2026-10-10 00:00 | 19 |
| 1d/lastguru-pearson | rising (between BUY and SELL) | 2026-10-16 00:00 | 2026-10-08 00:00 | 15 |
| 1d/lastguru-dft | falling (between SELL and BUY) | 2026-10-19 00:00 | 2026-11-07 00:00 | 37 |
| 1d/lastguru-phase | rising (between BUY and SELL) | 2026-10-25 00:00 | 2026-10-05 00:00 | 41 |
| 4h/ehlers | falling (between SELL and BUY) | 2026-10-06 00:00 | 2026-10-11 00:00 | 60 |
| 4h/fft | rising (between BUY and SELL) | 2026-10-15 12:00 | 2026-10-08 00:00 | 91 |
| 4h/lastguru-mama | rising (between BUY and SELL) | 2026-10-04 04:00 | 2026-10-02 16:00 | 17 |
| 4h/lastguru-pearson | rising (between BUY and SELL) | 2026-10-06 04:00 | 2026-10-03 08:00 | 35 |
| 4h/lastguru-dft | falling (between SELL and BUY) | 2026-10-04 12:00 | 2026-10-07 00:00 | 30 |
| 4h/lastguru-phase | rising (between BUY and SELL) | 2026-10-08 08:00 | 2026-10-04 20:00 | 43 |
| 1h/ehlers | falling (between SELL and BUY) | 2026-10-03 00:00 | 2026-10-03 19:00 | 38 |
| 1h/fft | falling (between SELL and BUY) | 2026-10-04 15:00 | 2026-10-07 00:00 | 115 |
| 1h/lastguru-mama | falling (between SELL and BUY) | 2026-10-02 21:00 | 2026-10-03 09:00 | 24 |
| 1h/lastguru-pearson | rising (between BUY and SELL) | 2026-10-03 13:00 | 2026-10-03 00:00 | 28 |
| 1h/lastguru-dft | falling (between SELL and BUY) | 2026-10-03 05:00 | 2026-10-04 02:00 | 43 |
| 1h/lastguru-phase | rising (between BUY and SELL) | 2026-10-03 21:00 | 2026-10-03 06:00 | 30 |