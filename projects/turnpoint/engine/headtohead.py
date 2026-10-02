"""Head-to-head: calls from another cycle tool vs Turnpoint's forecast made at the same moment.

data/rivals.json holds the other tool's projected turn dates, entered by hand (for
example, read off a screenshot). For each entry, Turnpoint is re-run on only the bars
that had closed by that entry's as_of time, so both forecasts saw the same data.
Both are then scored with the house rule: a date hits when a real turn (the lowest or
highest close within PIVOT bars either side) lands within HIT_W bars of it.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

import forecast
import scoring


def _parse(s: str) -> pd.Timestamp:
    return pd.Timestamp(s.replace("Z", ":00Z") if s.count(":") == 1 else s)


def _judge(df: pd.DataFrame, as_of: pd.Timestamp, side: str, when: str) -> dict:
    close = df["close"].to_numpy()
    trough, peak = scoring.pivots(close)
    marks = trough if side == "buy" else peak
    times = df["time"].reset_index(drop=True)
    last_ok = len(close) - 1 - scoring.PIVOT  # turns after this aren't confirmed yet
    i = int(np.argmin(np.abs((times - _parse(when)).dt.total_seconds().to_numpy())))
    out = {"type": side, "time": when}
    after = np.where(marks & (times > as_of).to_numpy() & (np.arange(len(close)) <= last_ok))[0]
    if len(after):
        j = after[np.argmin(np.abs(after - i))]
        out["nearest_turn"] = times[j].strftime("%Y-%m-%dT%H:%MZ")
        out["nearest_turn_price"] = float(close[j])
        out["error_bars"] = int(j - i)
    if i + scoring.HIT_W > last_ok:
        out["status"] = "pending"
    else:
        out["status"] = "hit" if marks[max(0, i - scoring.HIT_W): i + scoring.HIT_W + 1].any() else "miss"
    return out


def evaluate(path: Path, frames: dict[tuple[str, str], pd.DataFrame]) -> list[dict]:
    if not path.exists():
        return []
    results = []
    for e in json.loads(path.read_text()):
        df = frames.get((e["asset"], e["tf"]))
        if df is None:
            continue
        as_of = _parse(e["as_of"])
        step = pd.Timedelta(milliseconds=int(df["close_time"].iloc[-1] - df["open_time"].iloc[-1] + 1))
        seen = df[df["time"] + step <= as_of]
        tp = forecast.analyze(seen, e["tf"])
        tp_calls = []
        if tp["fm"]:
            tp_calls = [_judge(df, as_of, "buy", tp["fm"]["next_buy"]), _judge(df, as_of, "sell", tp["fm"]["next_sell"])]
        rival_calls = [{**c, **(_judge(df, as_of, c["type"], c["time"]) if c.get("counted") else {"status": "not counted"})}
                       for c in e["calls"]]
        results.append({k: e[k] for k in ("id", "source", "read", "asset", "tf", "seen_at", "as_of", "trend", "trail")} | {
            "rival": rival_calls,
            "turnpoint": {"calls": tp_calls, "phase": tp["fm"]["phase"] if tp["fm"] else None,
                          "period_bars": tp["fm"]["period_bars"] if tp["fm"] else None,
                          "trend": tp["trend"]["direction"], "trail": tp["trend"]["trail"]},
            "price_at_as_of": float(seen["close"].iloc[-1]),
            "latest": {"time": df["time"].iloc[-1].strftime("%Y-%m-%dT%H:%MZ"), "close": float(df["close"].iloc[-1])},
        })
    return results
