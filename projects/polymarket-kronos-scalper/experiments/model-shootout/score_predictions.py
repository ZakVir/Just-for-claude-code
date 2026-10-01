"""Score predictions_<at>.json against Polymarket's official resolutions.

Usage: python score_predictions.py --at UNIX [--wait-until UNIX]

Re-runnable: scores every target/strike that has officially resolved, marks
the rest "pending", and rewrites results/predictions_<at>_score.{json,md}.
Brier score: lower is better; 0.25 = always saying 50%.
"""

from __future__ import annotations

import argparse
import json
import math
import time
from datetime import datetime, timezone

import requests

import common as c

GAMMA = "https://gamma-api.polymarket.com/events"
FORECASTERS = ["kronos", "timesfm", "merged", "baseline", "market"]


def resolved_markets(slug: str) -> dict[str, bool] | None:
    """question -> YES/Up won, for markets in the event that have settled."""
    try:
        ev = requests.get(GAMMA, params={"slug": slug}, timeout=20).json()
    except Exception:
        return None
    if not ev:
        return None
    out = {}
    for m in ev[0]["markets"]:
        try:
            p = [float(x) for x in json.loads(m["outcomePrices"])]
        except (KeyError, TypeError, ValueError):
            continue
        if max(p) >= 0.99 and min(p) <= 0.01:
            out[m["question"]] = p[0] > 0.5
    return out


def score(p: float | None, y: bool) -> dict | None:
    if p is None or (isinstance(p, float) and math.isnan(p)):
        return None
    return {"p": round(p, 4), "hit": (p > 0.5) == y, "brier": round((p - y) ** 2, 4)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--at", type=int, required=True)
    ap.add_argument("--wait-until", type=int, default=0)
    a = ap.parse_args()
    if time.time() < a.wait_until:
        time.sleep(a.wait_until - time.time())

    pred = json.loads((c.HERE / "results" / f"predictions_{a.at}.json").read_text())
    out = {"scored_at": datetime.now(timezone.utc).isoformat(), "targets": {}, "ladder": [],
           "totals": {f: {"n": 0, "brier_sum": 0.0, "hits": 0} for f in FORECASTERS}}

    def add(f: str, s: dict | None) -> None:
        if s:
            out["totals"][f]["n"] += 1
            out["totals"][f]["brier_sum"] += s["brier"]
            out["totals"][f]["hits"] += int(s["hit"])

    for name, t in pred["targets"].items():
        if "error" in t or not t.get("slug"):
            out["targets"][name] = {"status": "skipped"}
            continue
        res = resolved_markets(t["slug"])
        if not res:
            out["targets"][name] = {"status": "pending", "settles_utc": t["settles_utc"]}
            continue
        y = next(iter(res.values()))
        row = {"status": "resolved", "up": y,
               "kronos": score(t["kronos"], y), "timesfm": score(t["timesfm"], y),
               "merged": score(t["merged"], y), "baseline": score(t.get("baseline_p"), y),
               "market": score(t["market"].get("mid"), y)}
        for f in FORECASTERS:
            add(f, row[f])
        out["targets"][name] = row

    ladder_slug = None
    if pred["ladder"]:
        q = pred["ladder"][0]["question"]
        d = q.split(" on ")[-1].rstrip("?")
        ladder_slug = f"bitcoin-above-on-{d.lower().replace(' ', '-')}-{datetime.now().year}"
    res_l = resolved_markets(ladder_slug) if ladder_slug else None
    for r in pred["ladder"]:
        if not res_l or r["question"] not in res_l:
            out["ladder"].append({"strike": r["strike"], "status": "pending"})
            continue
        y = res_l[r["question"]]
        row = {"strike": r["strike"], "status": "resolved", "yes": y,
               "kronos": score(r["kronos"], y), "timesfm": score(r["timesfm"], y),
               "merged": score(r["merged"], y), "baseline": score(r.get("options"), y),
               "market": score(r["market"].get("mid"), y)}
        for f in FORECASTERS:
            add(f, row[f])
        out["ladder"].append(row)

    for f, tot in out["totals"].items():
        tot["mean_brier"] = round(tot["brier_sum"] / tot["n"], 4) if tot["n"] else None
    path = c.HERE / "results" / f"predictions_{a.at}_score"
    path.with_suffix(".json").write_text(json.dumps(out, indent=1))

    lines = [f"# Scoring predictions frozen at {pred['frozen_at'][:19]} UTC "
             f"(scored {out['scored_at'][:19]} UTC)", "",
             "| market | outcome | Kronos | TimesFM 3 | merged | baseline | market mid |",
             "|---|---|---|---|---|---|---|"]

    def cell(s: dict | None) -> str:
        return "—" if not s else f"{s['p']:.2f} {'✓' if s['hit'] else '✗'} ({s['brier']:.3f})"

    for name, r in out["targets"].items():
        if r["status"] != "resolved":
            lines.append(f"| {name} | {r['status']} | | | | | |")
            continue
        lines.append(f"| {name} | {'UP' if r['up'] else 'DOWN'} | " +
                     " | ".join(cell(r[f]) for f in FORECASTERS) + " |")
    for r in out["ladder"]:
        if r["status"] != "resolved":
            continue
        lines.append(f"| above {r['strike']:,.0f} | {'YES' if r['yes'] else 'NO'} | " +
                     " | ".join(cell(r[f]) for f in FORECASTERS) + " |")
    pending = [n for n, r in out["targets"].items() if r["status"] == "pending"]
    if any(r["status"] == "pending" for r in out["ladder"]):
        pending.append("ladder")
    lines += ["", "Cells: P(Up/Yes) ✓/✗ (Brier). Mean Brier so far (lower is better): " +
              ", ".join(f"{f} {t['mean_brier']} (n={t['n']})" for f, t in out["totals"].items()),
              "", f"Pending: {', '.join(pending) if pending else 'none'}"]
    path.with_suffix(".md").write_text("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
