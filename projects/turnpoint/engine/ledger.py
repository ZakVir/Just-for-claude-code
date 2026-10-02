"""Append-only forecast ledger and its scoring.

Every build appends the consensus BUY/SELL dates for each asset and timeframe
(one line per bar; a rebuild of the same bar adds nothing). Lines are never
rewritten, and the file lives in git, so the record can't be quietly edited.
Scoring happens later, once enough bars have passed to know the real turns.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

import scoring


def load(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def record(path: Path, asset: str, view: dict) -> bool:
    """Append this view's forecast unless the same asset/timeframe/bar is already logged."""
    if not view.get("fm"):
        return False
    key = (asset, view["tf"], view["as_of"])
    if any((e["asset"], e["tf"], e["as_of"]) == key for e in load(path)):
        return False
    fm = view["fm"]
    entry = {"logged": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
             "asset": asset, "tf": view["tf"], "as_of": view["as_of"], "close": view["close"],
             "buy": fm["next_buy"], "sell": fm["next_sell"], "phase": fm["phase"],
             "period_bars": round(fm["period_bars"], 2), "agreement": round(fm["agreement"], 3)}
    with path.open("a") as f:
        f.write(json.dumps(entry) + "\n")
    return True


def score(entries: list[dict], frames: dict[tuple[str, str], pd.DataFrame]) -> dict:
    """Hit rates of logged BUY/SELL dates that are old enough to judge, per timeframe,
    next to what a randomly chosen date would score on the same price history."""
    out: dict = {}
    for (asset, tf), df in frames.items():
        close = df["close"].to_numpy()
        trough, peak = scoring.pivots(close)
        idx = {t.strftime("%Y-%m-%dT%H:%MZ"): i for i, t in enumerate(df["time"])}
        last_ok = len(close) - 1 - scoring.PIVOT
        res = out.setdefault(tf, {"buy_n": 0, "buy_hits": 0, "sell_n": 0, "sell_hits": 0, "chance": [],
                                  "pending": 0})
        res["chance"].append(scoring.chance_rate(trough))
        for e in entries:
            if e["asset"] != asset or e["tf"] != tf:
                continue
            for side, marks in (("buy", trough), ("sell", peak)):
                i = idx.get(e[side])
                if i is None or i + scoring.HIT_W > last_ok:
                    res["pending"] += 1 if side == "buy" else 0
                    continue
                lo, hi = max(0, i - scoring.HIT_W), i + scoring.HIT_W + 1
                res[f"{side}_n"] += 1
                res[f"{side}_hits"] += int(marks[lo:hi].any())
    for tf, r in out.items():
        r["chance"] = float(np.mean(r["chance"])) if r["chance"] else None
        r["buy_rate"] = r["buy_hits"] / r["buy_n"] if r["buy_n"] else None
        r["sell_rate"] = r["sell_hits"] / r["sell_n"] if r["sell_n"] else None
    return out
