# fair-value-scan

Read-only scan of live Polymarket BTC markets against fair values implied by
the Deribit options smile. No orders, no keys.

## What it prices

| Polymarket family | Fair value | Reference function |
|---|---|---|
| Monthly / weekly touch ("what price will Bitcoin hit") | skew-consistent touch probability at the barrier's implied vol, total variance interpolated to the market's end | `reference/pricing.touch_prob_skew` |
| Daily "above ___" ladder (Binance 1m candle at noon ET) | skew-adjusted digital, interpolated between the 08:00 UTC Deribit expiries | `reference/pricing.digital_prob_with_skew` |

Both shift strikes by the measured +4.3 bp Binance-BTCUSDT-over-USD-index
basis. Each fair value is also reported at implied vol ±3 points; treat a gap
as meaningful only when the market sits outside that band.

## Run

```bash
cd projects/polymarket-kronos-scalper/experiments/fair-value-scan
../model-shootout/.venv/bin/python scan.py   # needs numpy + requests
```

Writes `results/scan_<UTC>.json` and `.md`.

## Caveats

- Fair values are **risk-neutral**. Options carry a variance risk premium,
  so real-world tail odds are usually *lower* — fading Polymarket YES against
  these numbers is the conservative direction, buying YES is not.
- Touch pricing is an approximation (barrier vol + "≈ 2 × digital" skew
  correction). The first version ignored the smile slope and got the sign
  wrong on the put wing; keep the skew term.
- One scan is a snapshot: it shows top-of-book prices, not depth or
  persistence. The shadow ledger in PLAN.md §7 measures those.
