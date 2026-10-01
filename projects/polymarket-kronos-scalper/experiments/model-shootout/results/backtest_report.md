# Backtest: 96 Polymarket BTC 15-minute windows (generated 2026-10-01T23:33Z)

Scored against Polymarket's official resolution. Brier: lower is better (0.25 = coin flip). 'vs market' = model Brier minus market Brier (negative = model better), 95% bootstrap CI. Trading sim buys whichever side the forecaster thinks is cheap vs the market price, paying a 0.5¢ half-spread and the taker fee.

## Decision at window open (n = 96, Up rate 50.0%, Binance proxy agrees with official 93.8%)

| forecaster | hit rate | Brier | log loss | vs market (95% CI) | avg |p−0.5| | sim trades | sim return/$ (95% CI) |
|---|---:|---:|---:|---|---:|---:|---|
| Polymarket price | 51.0% | 0.2517 | 0.6966 | — | 0.014 | 0 | — |
| Kronos-base | 51.0% | 0.3206 | 0.9112 | +0.0689 (+0.0144, +0.1248) | 0.250 | 96 | -2.6% (-20.7%, +16.8%) |
| TimesFM 3 | 43.8% | 0.2795 | 0.7572 | +0.0278 (+0.0065, +0.0499) | 0.080 | 74 | -19.6% (-42.2%, +1.8%) |
| Kronos+TimesFM merged | 51.0% | 0.2776 | 0.7564 | +0.0259 (-0.0044, +0.0571) | 0.133 | 89 | -1.3% (-21.1%, +17.2%) |
| random-walk baseline | 50.0% | 0.2500 | 0.6932 | -0.0017 (-0.0055, +0.0020) | 0.000 | 23 | +24.0% (-19.9%, +60.0%) |

Calibration (share of windows that went Up, by forecast bucket):

| forecast P(Up) | Polymarket price | Kronos-base | TimesFM 3 | Kronos+TimesFM merged | random-walk baseline |
|---|---:|---:|---:|---:|---:|
| 0.0–0.2 | — | 52% (n=25) | — | 100% (n=1) | — |
| 0.2–0.4 | — | 44% (n=25) | 83% (n=12) | 52% (n=42) | — |
| 0.4–0.6 | 50% (n=96) | 52% (n=29) | 45% (n=71) | 44% (n=36) | 50% (n=96) |
| 0.6–0.8 | — | 46% (n=13) | 45% (n=11) | 53% (n=17) | — |
| 0.8–1.0 | — | 75% (n=4) | 50% (n=2) | — | — |

## Decision 5 minutes into the window (n = 96, Up rate 50.0%, Binance proxy agrees with official 93.8%)

| forecaster | hit rate | Brier | log loss | vs market (95% CI) | avg |p−0.5| | sim trades | sim return/$ (95% CI) |
|---|---:|---:|---:|---|---:|---:|---|
| Polymarket price | 74.0% | 0.1749 | 0.5243 | — | 0.200 | 0 | — |
| Kronos-base | 67.7% | 0.2049 | 0.6018 | +0.0300 (-0.0075, +0.0719) | 0.276 | 90 | -7.4% (-27.1%, +13.5%) |
| TimesFM 3 | 68.8% | 0.2065 | 0.6060 | +0.0316 (+0.0078, +0.0588) | 0.208 | 88 | -21.7% (-40.4%, -3.5%) |
| Kronos+TimesFM merged | 68.8% | 0.1947 | 0.5762 | +0.0199 (-0.0055, +0.0488) | 0.219 | 85 | -25.1% (-43.1%, -6.6%) |
| random-walk baseline | 70.8% | 0.1859 | 0.5525 | +0.0110 (-0.0096, +0.0353) | 0.219 | 84 | -1.3% (-22.9%, +21.8%) |

Calibration (share of windows that went Up, by forecast bucket):

| forecast P(Up) | Polymarket price | Kronos-base | TimesFM 3 | Kronos+TimesFM merged | random-walk baseline |
|---|---:|---:|---:|---:|---:|
| 0.0–0.2 | 23% (n=13) | 21% (n=28) | 33% (n=15) | 32% (n=19) | 19% (n=16) |
| 0.2–0.4 | 17% (n=23) | 47% (n=17) | 21% (n=19) | 15% (n=20) | 30% (n=23) |
| 0.4–0.6 | 52% (n=29) | 46% (n=24) | 50% (n=24) | 58% (n=26) | 50% (n=24) |
| 0.6–0.8 | 72% (n=18) | 75% (n=16) | 58% (n=24) | 65% (n=20) | 73% (n=22) |
| 0.8–1.0 | 100% (n=13) | 100% (n=11) | 93% (n=14) | 100% (n=11) | 91% (n=11) |
