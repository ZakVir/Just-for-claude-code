"""Render results/backtest_summary.json + backtest_cases.json as markdown.

Usage: python report_backtest.py  ->  results/backtest_report.md
"""

from __future__ import annotations

import json

import numpy as np

import common as c

MODELS = ["market", "kronos", "timesfm3", "merged", "analytic"]
LABEL = {"market": "Polymarket price", "kronos": "Kronos-base", "timesfm3": "TimesFM 3",
         "merged": "Kronos+TimesFM merged", "analytic": "random-walk baseline"}
OFFSET = {"0": "at window open", "300": "5 minutes into the window"}


def main() -> None:
    res = c.HERE / "results"
    s = json.loads((res / "backtest_summary.json").read_text())
    cases = json.loads((res / "backtest_cases.json").read_text())
    lines = [f"# Backtest: {s['windows']} Polymarket BTC 15-minute windows "
             f"(generated {s['generated'][:16]}Z)", "",
             "Scored against Polymarket's official resolution. Brier: lower is better "
             "(0.25 = coin flip). 'vs market' = model Brier minus market Brier "
             "(negative = model better), 95% bootstrap CI. Trading sim buys whichever "
             "side the forecaster thinks is cheap vs the market price, paying a 0.5¢ "
             "half-spread and the taker fee.", ""]
    for off, blk in s["by_offset"].items():
        lines += [f"## Decision {OFFSET.get(off, off + ' s')} (n = {blk['n']}, "
                  f"Up rate {blk['base_rate_up']:.1%}, Binance proxy agrees with "
                  f"official {blk['binance_proxy_agreement']:.1%})", "",
                  "| forecaster | hit rate | Brier | log loss | vs market (95% CI) | "
                  "avg |p−0.5| | sim trades | sim return/$ (95% CI) |",
                  "|---|---:|---:|---:|---|---:|---:|---|"]
        for m in MODELS:
            r = blk["models"][m]
            ci = r.get("brier_minus_market_ci95")
            vs = "—" if m == "market" else f"{r['brier_minus_market']:+.4f} ({ci[0]:+.4f}, {ci[1]:+.4f})"
            sim = "—" if r["sim_return_per_dollar"] is None else (
                f"{r['sim_return_per_dollar']:+.1%}" + (
                    f" ({r['sim_return_ci95'][0]:+.1%}, {r['sim_return_ci95'][1]:+.1%})"
                    if r.get("sim_return_ci95") else ""))
            lines.append(f"| {LABEL[m]} | {r['hit_rate']:.1%} | {r['brier']:.4f} | "
                         f"{r['log_loss']:.4f} | {vs} | {r['mean_abs_dev_from_half']:.3f} | "
                         f"{r['sim_trades']} | {sim} |")
        sub = [x for x in cases if str(x["offset"]) == off]
        if sub:
            lines += ["", "Calibration (share of windows that went Up, by forecast bucket):", "",
                      "| forecast P(Up) | " + " | ".join(LABEL[m] for m in MODELS) + " |",
                      "|---|" + "---:|" * len(MODELS)]
            edges = [0, 0.2, 0.4, 0.6, 0.8, 1.0001]
            for lo, hi in zip(edges[:-1], edges[1:]):
                cells = []
                for m in MODELS:
                    key = "market_p" if m == "market" else m
                    b = [x for x in sub if lo <= float(x[key]) < hi]
                    cells.append(f"{np.mean([x['up_won'] for x in b]):.0%} (n={len(b)})" if b else "—")
                lines.append(f"| {lo:.1f}–{min(hi, 1):.1f} | " + " | ".join(cells) + " |")
        lines.append("")
    (res / "backtest_report.md").write_text("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
