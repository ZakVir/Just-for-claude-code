"""Model-free longshot-bias test for BTC touch markets ("what price will BTC hit").

Usage: ../model-shootout/.venv/bin/python touch_calibration.py [--days 120] [--weeks 30]

Daily (ET day) and weekly (Mon-Sun ET) touch markets: take each strike's YES
price after the period opens (3 h for daily, 12 h for weekly; prices >= 0.99
are dropped as already touched), compare with the official outcome by price
bucket, and compute YES/NO buyer returns after taker fee + half spread. CIs
bootstrap whole periods. Strategy A1 in PLAN.md rests on YES being
overpriced here.

Quality filter: freshly listed strikes report the midpoint of an empty book
(bid 0.01 / ask 0.99 -> 0.50) until someone quotes them. A first version of
this study counted those as prices and produced a large, spurious "NO edge".
Snapshots now need >= 2 distinct prices in the preceding window.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone

import numpy as np

from ladder_calibration import BUCKETS, ET, GAMMA, HERE, HIST, buy_return, get

SNAP_HOURS = {"daily": 3, "weekly": 12}


def periods(days: int, weeks: int):
    today = datetime.now(ET).date()
    for back in range(days, 0, -1):
        d = today - timedelta(days=back)
        yield "daily", d.isoformat(), f"what-price-will-bitcoin-hit-on-{d.strftime('%B').lower()}-{d.day}-{d.year}"
    this_monday = today - timedelta(days=today.weekday())
    for back in range(weeks, 0, -1):
        mon = this_monday - timedelta(weeks=back)
        sun = mon + timedelta(days=6)
        if mon.month == sun.month:
            slug = f"what-price-will-bitcoin-hit-{mon.strftime('%B').lower()}-{mon.day}-{sun.day}-{sun.year}"
        else:
            slug = (f"what-price-will-bitcoin-hit-{mon.strftime('%B').lower()}-{mon.day}-"
                    f"{sun.strftime('%B').lower()}-{sun.day}-{sun.year}")
        yield "weekly", mon.isoformat(), slug


def collect(days: int, weeks: int) -> list[dict]:
    rows = []
    for family, period, slug in periods(days, weeks):
        ev = get(GAMMA, {"slug": slug})
        if not ev:
            continue
        start = datetime.fromisoformat(ev[0]["startDate"].replace("Z", "+00:00")).timestamp()
        snap = start + SNAP_HOURS[family] * 3600
        for m in ev[0]["markets"]:
            try:
                prices = [float(x) for x in json.loads(m["outcomePrices"])]
                if not (max(prices) >= 0.99 and min(prices) <= 0.01):
                    continue
                created = datetime.fromisoformat(m["createdAt"].replace("Z", "+00:00")).timestamp()
                if created > snap:
                    continue  # strike listed after our snapshot time
                tok = json.loads(m["clobTokenIds"])[0]
                title = m.get("groupItemTitle") or ""
            except (ValueError, KeyError, TypeError):
                continue
            h = get(HIST, {"market": tok, "startTs": int(snap - SNAP_HOURS[family] * 3600),
                           "endTs": int(snap), "fidelity": 10})
            pts = [x["p"] for x in (h or {}).get("history", []) if x["t"] <= snap]
            if not pts or pts[-1] >= 0.99 or len(set(round(x, 4) for x in pts)) < 2:
                continue  # no price, already touched, or never actually quoted
            rows.append({"family": family, "period": period, "dir": "down" if "↓" in title else "up",
                         "price": float(pts[-1]), "yes_won": prices[0] > 0.5})
        print(f"{family} {period}: {len(rows)} rows", flush=True)
    return rows


def boot(rows: list[dict], fn, n: int = 2000, seed: int = 2) -> list[float]:
    keys = sorted({r["period"] for r in rows})
    by = {k: [r for r in rows if r["period"] == k] for k in keys}
    rng = np.random.default_rng(seed)
    vals = [fn([r for k in rng.choice(keys, size=len(keys)) for r in by[k]]) for _ in range(n)]
    return [round(float(np.percentile(vals, 2.5)), 4), round(float(np.percentile(vals, 97.5)), 4)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=120)
    ap.add_argument("--weeks", type=int, default=30)
    a = ap.parse_args()
    rows = collect(a.days, a.weeks)
    out = {"generated": datetime.now(timezone.utc).isoformat(), "families": {}}
    lines = ["# BTC touch markets: price shortly after open vs outcome", "",
             "Returns per $ after taker fee + 0.5¢ half-spread. CIs bootstrap whole periods.", ""]
    for fam in ("daily", "weekly"):
        sub = [r for r in rows if r["family"] == fam]
        n_periods = len({r["period"] for r in sub})
        table = []
        for lo, hi in zip(BUCKETS[:-1], BUCKETS[1:]):
            b = [r for r in sub if lo <= r["price"] < hi]
            if len(b) < 10:
                continue
            table.append({
                "bucket": f"{lo:.2f}-{min(hi, 1):.2f}", "n": len(b),
                "periods": len({r['period'] for r in b}),
                "avg_price": round(float(np.mean([r["price"] for r in b])), 4),
                "yes_rate": round(float(np.mean([r["yes_won"] for r in b])), 4),
                "rate_minus_price_ci95": boot(b, lambda s: float(
                    np.mean([r["yes_won"] for r in s]) - np.mean([r["price"] for r in s]))),
                "no_buyer_return": round(float(np.mean([buy_return(1 - r["price"], not r["yes_won"]) for r in b])), 4),
                "no_buyer_return_ci95": boot(b, lambda s: float(
                    np.mean([buy_return(1 - r["price"], not r["yes_won"]) for r in s]))),
                "yes_buyer_return": round(float(np.mean([buy_return(r["price"], r["yes_won"]) for r in b])), 4),
            })
        out["families"][fam] = {"n_rows": len(sub), "n_periods": n_periods, "table": table}
        lines += [f"## {fam} touch ({n_periods} periods, {len(sub)} strikes)", "",
                  "| YES price | n | periods | avg price | YES rate | rate − price 95% CI | YES buyer | NO buyer (95% CI) |",
                  "|---|---:|---:|---:|---:|---|---:|---|"]
        for t in table:
            lo, hi = t["rate_minus_price_ci95"]
            nlo, nhi = t["no_buyer_return_ci95"]
            lines.append(f"| {t['bucket']} | {t['n']} | {t['periods']} | {t['avg_price']:.3f} | "
                         f"{t['yes_rate']:.3f} | ({lo:+.3f}, {hi:+.3f}) | {t['yes_buyer_return']:+.1%} | "
                         f"{t['no_buyer_return']:+.1%} ({nlo:+.1%}, {nhi:+.1%}) |")
        lines.append("")
    res = HERE / "results"
    res.mkdir(exist_ok=True)
    (res / "touch_calibration_rows.json").write_text(json.dumps(rows))
    (res / "touch_calibration.json").write_text(json.dumps(out, indent=1))
    (res / "touch_calibration.md").write_text("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
