"""Model-free test of the longshot bias in Polymarket's daily BTC ladders.

Usage: ../model-shootout/.venv/bin/python ladder_calibration.py [--days 120]

For every resolved "Bitcoin above ___ on <date>" ladder (11 strikes, Binance
1m candle at noon ET) in the last ``--days`` days, take each strike's YES
price H hours before settlement (from CLOB prices-history) and its official
outcome. Then, per price bucket: average price vs realised YES rate, and the
return of buying YES or NO there after taker fee and half a spread.
Confidence intervals bootstrap whole days (strikes on one day are correlated).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import requests

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "reference"))
from edge_math import taker_fee_per_share  # noqa: E402

GAMMA = "https://gamma-api.polymarket.com/events"
HIST = "https://clob.polymarket.com/prices-history"
ET = ZoneInfo("America/New_York")
HOURS = (20, 4, 1)
BUCKETS = [0, 0.02, 0.05, 0.10, 0.20, 0.35, 0.50, 0.65, 0.80, 0.90, 0.95, 0.98, 1.0001]
HALF_SPREAD = 0.005


def get(url: str, params: dict) -> object:
    for attempt in range(4):
        try:
            r = requests.get(url, params=params, timeout=20)
            if r.status_code == 429:
                time.sleep(2 ** (attempt + 1))
                continue
            r.raise_for_status()
            return r.json()
        except requests.RequestException:
            time.sleep(2 ** (attempt + 1))
    return None


def collect(days: int) -> list[dict]:
    rows = []
    today = datetime.now(ET).date()
    for back in range(days, 0, -1):
        d = today - timedelta(days=back)
        slug = f"bitcoin-above-on-{d.strftime('%B').lower()}-{d.day}-{d.year}"
        ev = get(GAMMA, {"slug": slug})
        if not ev:
            continue
        noon = datetime(d.year, d.month, d.day, 12, tzinfo=ET).timestamp()
        for m in ev[0]["markets"]:
            try:
                prices = [float(x) for x in json.loads(m["outcomePrices"])]
                if not (max(prices) >= 0.99 and min(prices) <= 0.01):
                    continue
                yes_won = prices[0] > 0.5
                tok = json.loads(m["clobTokenIds"])[0]
                strike = float((m.get("groupItemTitle") or "").replace(",", ""))
            except (ValueError, KeyError, TypeError):
                continue
            h = get(HIST, {"market": tok, "startTs": int(noon - 21 * 3600),
                           "endTs": int(noon), "fidelity": 10})
            hist = (h or {}).get("history", [])
            for H in HOURS:
                pts = [x["p"] for x in hist if x["t"] <= noon - H * 3600]
                if pts:
                    rows.append({"date": d.isoformat(), "strike": strike, "hours_before": H,
                                 "price": float(pts[-1]), "yes_won": yes_won})
            time.sleep(0.05)
        print(f"{d} collected ({len(rows)} rows)", flush=True)
    return rows


def buy_return(price: float, won: bool) -> float:
    """Return per $ of buying at ``price`` + half spread + taker fee."""
    px = min(price + HALF_SPREAD, 0.999)
    cost = px + taker_fee_per_share(px)
    return ((1.0 if won else 0.0) - cost) / cost


def day_boot(rows: list[dict], fn, n: int = 2000, seed: int = 1) -> list[float]:
    days = sorted({r["date"] for r in rows})
    by_day = {d: [r for r in rows if r["date"] == d] for d in days}
    rng = np.random.default_rng(seed)
    stats = []
    for _ in range(n):
        sample = [r for d in rng.choice(days, size=len(days)) for r in by_day[d]]
        stats.append(fn(sample))
    return [round(float(np.percentile(stats, 2.5)), 4), round(float(np.percentile(stats, 97.5)), 4)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=120)
    a = ap.parse_args()
    rows = collect(a.days)
    out = {"generated": datetime.now(timezone.utc).isoformat(), "days": a.days,
           "n_rows": len(rows), "n_days": len({r["date"] for r in rows}), "by_hours": {}}
    for H in HOURS:
        sub = [r for r in rows if r["hours_before"] == H]
        table = []
        for lo, hi in zip(BUCKETS[:-1], BUCKETS[1:]):
            b = [r for r in sub if lo <= r["price"] < hi]
            if len(b) < 10:
                continue
            avg_p = float(np.mean([r["price"] for r in b]))
            rate = float(np.mean([r["yes_won"] for r in b]))
            yes_ret = [buy_return(r["price"], r["yes_won"]) for r in b]
            no_ret = [buy_return(1 - r["price"], not r["yes_won"]) for r in b]
            table.append({
                "bucket": f"{lo:.2f}-{min(hi, 1):.2f}", "n": len(b),
                "days": len({r['date'] for r in b}),
                "avg_price": round(avg_p, 4), "yes_rate": round(rate, 4),
                "rate_minus_price": round(rate - avg_p, 4),
                "rate_minus_price_ci95": day_boot(
                    b, lambda s: float(np.mean([r["yes_won"] for r in s]) - np.mean([r["price"] for r in s]))),
                "yes_buyer_return": round(float(np.mean(yes_ret)), 4),
                "no_buyer_return": round(float(np.mean(no_ret)), 4),
                "no_buyer_return_ci95": day_boot(
                    b, lambda s: float(np.mean([buy_return(1 - r["price"], not r["yes_won"]) for r in s]))),
            })
        out["by_hours"][str(H)] = table
    res = HERE / "results"
    res.mkdir(exist_ok=True)
    (res / "ladder_calibration_rows.json").write_text(json.dumps(rows))
    (res / "ladder_calibration.json").write_text(json.dumps(out, indent=1))

    lines = [f"# Daily BTC 'above' ladders: price vs outcome ({out['n_days']} days, "
             f"{out['n_rows']} strike-snapshots)", "",
             "Returns are per $ after taker fee + 0.5¢ half-spread. CIs bootstrap whole days.", ""]
    for H, table in out["by_hours"].items():
        lines += [f"## {H} h before settlement", "",
                  "| YES price bucket | n | days | avg price | YES rate | rate − price (95% CI) | YES buyer | NO buyer (95% CI) |",
                  "|---|---:|---:|---:|---:|---|---:|---|"]
        for t in table:
            lo, hi = t["rate_minus_price_ci95"]
            nlo, nhi = t["no_buyer_return_ci95"]
            lines.append(f"| {t['bucket']} | {t['n']} | {t['days']} | {t['avg_price']:.3f} | {t['yes_rate']:.3f} | "
                         f"{t['rate_minus_price']:+.3f} ({lo:+.3f}, {hi:+.3f}) | {t['yes_buyer_return']:+.1%} | "
                         f"{t['no_buyer_return']:+.1%} ({nlo:+.1%}, {nhi:+.1%}) |")
        lines.append("")
    (res / "ladder_calibration.md").write_text("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
