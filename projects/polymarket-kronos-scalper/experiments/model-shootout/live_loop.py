"""Rolling live forecasts: predict each BTC 15-minute window at its open, score at close.

Usage: OMP_NUM_THREADS=2 python live_loop.py --first UNIX --windows 6 [--paths 30]

For each window: at open + 5 s freeze the last 512 closed 1-minute Binance
candles and Polymarket's Up price, forecast P(Up) with Kronos-base (``--paths``
sampled paths) and TimesFM 3, merge them; after the next window has been
predicted, fetch the official result and append to results/live_loop.jsonl.
The scoreboard (results/live_loop.md) is rewritten after every scored window.
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone

import numpy as np
import requests
import torch

import common as c

GAMMA = "https://gamma-api.polymarket.com/events"
FORECASTERS = ["kronos", "timesfm", "merged", "market"]


def market(start: int) -> dict:
    try:
        m = requests.get(GAMMA, params={"slug": f"btc-updown-15m-{start}"}, timeout=20).json()[0]["markets"][0]
        top = c.clob_top(json.loads(m["clobTokenIds"])[0])
        if top:
            return top
        bid, ask = float(m["bestBid"]), float(m["bestAsk"])
        return {"bid": bid, "ask": ask, "mid": (bid + ask) / 2, "source": "gamma"}
    except Exception as exc:
        return {"error": repr(exc)}


def outcome(start: int) -> bool | None:
    try:
        m = requests.get(GAMMA, params={"slug": f"btc-updown-15m-{start}"}, timeout=20).json()[0]["markets"][0]
        p = [float(x) for x in json.loads(m["outcomePrices"])]
        settled = m.get("closed") is True or m.get("umaResolutionStatus") in ("proposed", "resolved")
        return p[0] > 0.5 if settled and max(p) >= 0.99 and min(p) <= 0.01 else None
    except Exception:
        return None


def scoreboard(rows: list[dict]) -> str:
    done = [r for r in rows if r.get("up") is not None]
    lines = ["# Live 15-minute forecasts (Kronos-base vs TimesFM 3 vs market)", "",
             "P = forecast probability of Up at the window open; ✓ = right side of 50%.", "",
             "| window (UTC) | Kronos | TimesFM 3 | merged | market | result |",
             "|---|---:|---:|---:|---:|---|"]
    for r in rows:
        res = "pending" if r.get("up") is None else ("UP" if r["up"] else "DOWN")

        def cell(f: str) -> str:
            p = r.get(f)
            if p is None:
                return "—"
            mark = "" if r.get("up") is None else (" ✓" if (p > 0.5) == r["up"] else " ✗")
            return f"{p:.2f}{mark}"

        lines.append(f"| {datetime.fromtimestamp(r['start'], tz=timezone.utc):%H:%M} | " +
                     " | ".join(cell(f) for f in FORECASTERS) + f" | {res} |")
    if done:
        lines += ["", f"After {len(done)} scored windows:", "",
                  "| forecaster | hit rate | mean Brier (lower = better) |", "|---|---:|---:|"]
        for f in FORECASTERS:
            xs = [r for r in done if r.get(f) is not None]
            if xs:
                hits = np.mean([(r[f] > 0.5) == r["up"] for r in xs])
                br = np.mean([(r[f] - r["up"]) ** 2 for r in xs])
                lines.append(f"| {f} | {hits:.0%} ({len(xs)}) | {br:.3f} |")
        lines += ["", "A handful of windows is an anecdote: see backtest_report.md for statistics."]
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--first", type=int, required=True)
    ap.add_argument("--windows", type=int, default=6)
    ap.add_argument("--paths", type=int, default=30)
    a = ap.parse_args()
    print("torch threads", torch.get_num_threads(), flush=True)
    kronos, tfm = c.load_kronos(), c.load_timesfm3()
    res = c.HERE / "results"
    jsonl, md = res / "live_loop.jsonl", res / "live_loop.md"
    rows: list[dict] = []
    unscored: list[dict] = []
    for i in range(a.windows + 1):
        start = a.first + 900 * i
        if i < a.windows:
            if time.time() < start + 5:
                time.sleep(start + 5 - time.time())
            mk = market(start)
            ctx = c.fetch_klines("1m", end_ms=start * 1000 - 1, limit=600).tail(512)
            ref = float(ctx["close"].iloc[-1])
            t0 = time.time()
            paths = c.kronos_paths(kronos, ctx, "1m", 15, n_paths=a.paths)
            _, q = c.timesfm_forecast(tfm, ctx["close"].to_numpy(), 15)
            k_p = c.p_up_from_paths(paths[:, -1], ref)
            t_p = c.p_up_from_quantiles(q[-1], ref)
            row = {"start": start, "ref": ref, "kronos": round(k_p, 4), "timesfm": round(t_p, 4),
                   "merged": round((k_p + t_p) / 2, 4), "market": mk.get("mid"),
                   "market_book": mk, "seconds": round(time.time() - t0, 1), "up": None}
            rows.append(row)
            unscored.append(row)
            print(f"{datetime.fromtimestamp(start, tz=timezone.utc):%H:%M} predicted: kronos {k_p:.3f} "
                  f"timesfm {t_p:.3f} market {mk.get('mid')} ({row['seconds']}s)", flush=True)
        # score windows that have closed (official result ~1 min after close)
        deadline = time.time() + (600 if i == a.windows else 0)
        while unscored:
            r = unscored[0]
            if time.time() < r["start"] + 900 + 60:
                if i < a.windows:
                    break
                time.sleep(r["start"] + 960 - time.time())
            y = outcome(r["start"])
            if y is None:
                if time.time() > deadline:
                    break
                time.sleep(20)
                continue
            r["up"] = y
            unscored.pop(0)
            with jsonl.open("a") as f:
                f.write(json.dumps(r) + "\n")
            print(f"{datetime.fromtimestamp(r['start'], tz=timezone.utc):%H:%M} scored: "
                  f"{'UP' if y else 'DOWN'}", flush=True)
        md.write_text(scoreboard(rows))
    print(scoreboard(rows), flush=True)


if __name__ == "__main__":
    main()
