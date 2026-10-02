"""Freeze a live BTC snapshot at a 15-minute boundary and forecast it.

Usage: python snapshot.py [--start UNIX] [--runs 3] [--paths 10]

At start+5 s it freezes: the last 512 closed 1-minute and 5-minute Binance
candles, and the Polymarket order book for the matching 15-minute BTC
Up/Down market. Then it runs Kronos-base and TimesFM 3 ``--runs`` times on
each horizon (15 min on 1m candles, 60 min on 5m candles), merges the results,
and writes results/snapshot_<start>.json for score.py.
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone

import numpy as np
import requests

import common as c

GAMMA = "https://gamma-api.polymarket.com/events"
HORIZONS = {"15m": ("1m", 15), "60m": ("5m", 12)}


def polymarket_15m(start: int) -> dict:
    slug = f"btc-updown-15m-{start}"
    try:
        ev = requests.get(GAMMA, params={"slug": slug}, timeout=20).json()
        m = ev[0]["markets"][0]
        bid, ask = float(m["bestBid"]), float(m["bestAsk"])
        return {
            "slug": slug,
            "question": m["question"],
            "best_bid_up": bid,
            "best_ask_up": ask,
            "mid_up": (bid + ask) / 2,
            "last_trade_up": m.get("lastTradePrice"),
            "resolution_source": m.get("resolutionSource"),
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:  # report, don't crash the forecast
        return {"slug": slug, "error": repr(exc)}


def polymarket_hourly(start: int) -> dict:
    """The Binance-1h-candle hourly market whose hour contains ``start``."""
    hour = datetime.fromtimestamp(start - start % 3600, tz=timezone.utc)
    et = hour.astimezone(__import__("zoneinfo").ZoneInfo("America/New_York"))
    h12 = et.strftime("%I").lstrip("0") + et.strftime("%p").lower()
    slug = f"bitcoin-up-or-down-{et.strftime('%B').lower()}-{et.day}-{et.year}-{h12}-et"
    try:
        m = requests.get(GAMMA, params={"slug": slug}, timeout=20).json()[0]["markets"][0]
        bid, ask = float(m["bestBid"]), float(m["bestAsk"])
        return {"slug": slug, "question": m["question"], "hour_start_utc": hour.isoformat(),
                "best_bid_up": bid, "best_ask_up": ask, "mid_up": (bid + ask) / 2,
                "fetched_at": datetime.now(timezone.utc).isoformat()}
    except Exception as exc:
        return {"slug": slug, "error": repr(exc)}


def main() -> None:
    ap = argparse.ArgumentParser()
    now = int(time.time())
    ap.add_argument("--start", type=int, default=now - now % 900 + 900)
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--paths", type=int, default=10)
    a = ap.parse_args()

    wake = a.start + 5
    if time.time() < wake:
        print(f"waiting {wake - time.time():.0f}s for the window to open", flush=True)
        time.sleep(wake - time.time())

    # ---- freeze inputs (nothing after this line may see newer data) ----
    frozen_at = datetime.now(timezone.utc).isoformat()
    market = polymarket_15m(a.start)
    hourly = polymarket_hourly(a.start)
    end_ms = a.start * 1000 - 1  # candles that closed before the window opened
    data = {iv: c.fetch_klines(iv, end_ms=end_ms, limit=600).tail(512) for iv in ("1m", "5m")}
    print("frozen", frozen_at, json.dumps(market), flush=True)

    kronos = c.load_kronos()
    tfm = c.load_timesfm3()

    out = {
        "window_start": a.start,
        "frozen_at": frozen_at,
        "market": market,
        "hourly_market": hourly,
        "config": {"runs": a.runs, "kronos_paths_per_run": a.paths,
                   "kronos_model": "NeoQuasar/Kronos-base", "kronos_T": 1.0,
                   "kronos_top_p": 0.9, "timesfm": "google/timesfm-3.0-pytorch",
                   "context": 512, "data": "Binance BTCUSDT via data-api.binance.vision"},
        "horizons": {},
    }

    for name, (iv, steps) in HORIZONS.items():
        ctx = data[iv]
        ref = float(ctx["close"].iloc[-1])
        last_open = ctx["timestamps"].iloc[-1]
        target_times = [str(t) for t in c.future_index(last_open, iv, steps)]
        h = {"interval": iv, "steps": steps, "ref_close": ref,
             "ref_candle_open": str(last_open), "target_candle_opens": target_times,
             "kronos_runs": [], "timesfm_runs": []}

        for r in range(a.runs):
            t0 = time.time()
            paths = c.kronos_paths(kronos, ctx, iv, steps, n_paths=a.paths)
            finals = paths[:, -1]
            h["kronos_runs"].append({
                "seconds": round(time.time() - t0, 1),
                "mean_path": paths.mean(axis=0).round(2).tolist(),
                "final_mean": float(finals.mean()),
                "final_min": float(finals.min()),
                "final_max": float(finals.max()),
                "p_up": c.p_up_from_paths(finals, ref),
                "finals": finals.round(2).tolist(),
                "paths": paths.round(2).tolist(),
            })
            print(f"[{name}] kronos run {r + 1}: final {finals.mean():.1f} "
                  f"P(up) {h['kronos_runs'][-1]['p_up']:.3f} ({time.time() - t0:.0f}s)", flush=True)

        for r in range(a.runs):
            point, q = c.timesfm_forecast(tfm, ctx["close"].to_numpy(), steps)
            h["timesfm_runs"].append({
                "point_path": point.round(2).tolist(),
                "final_point": float(point[-1]),
                "final_deciles": q[-1].round(2).tolist(),
                "deciles": q.round(2).tolist(),
                "p_up": c.p_up_from_quantiles(q[-1], ref),
            })
            print(f"[{name}] timesfm run {r + 1}: final {point[-1]:.1f} "
                  f"P(up) {h['timesfm_runs'][-1]['p_up']:.3f}", flush=True)

        all_finals = np.concatenate([np.array(k["finals"]) for k in h["kronos_runs"]])
        k_p = c.p_up_from_paths(all_finals, ref)
        t_p = float(np.mean([t["p_up"] for t in h["timesfm_runs"]]))
        k_final = float(all_finals.mean())
        t_final = float(np.mean([t["final_point"] for t in h["timesfm_runs"]]))
        h["merged"] = {
            "kronos_p_up_all_paths": k_p,
            "kronos_run_p_up_spread": [min(k["p_up"] for k in h["kronos_runs"]),
                                       max(k["p_up"] for k in h["kronos_runs"])],
            "timesfm_p_up": t_p,
            "timesfm_runs_identical": all(
                np.allclose(t["point_path"], h["timesfm_runs"][0]["point_path"])
                for t in h["timesfm_runs"]),
            "ensemble_p_up": (k_p + t_p) / 2,
            "ensemble_final": (k_final + t_final) / 2,
            "kronos_final": k_final,
            "timesfm_final": t_final,
            "direction_agree": (k_final > ref) == (t_final > ref),
        }
        if name == "60m":
            hour_open_ms = (a.start - a.start % 3600) * 1000
            m1 = data["1m"]
            row = m1[m1["open_time"] == hour_open_ms]
            if not row.empty:
                # hourly market: Binance 1h close >= 1h open; 1h close = close
                # of the 5m candle that ends at the top of the next hour
                idx = (3600 - a.start % 3600) // 300 - 1
                hour_open = float(row["open"].iloc[0])
                k_paths = np.concatenate([np.array(k["paths"]) for k in h["kronos_runs"]])
                tq = np.array(h["timesfm_runs"][0]["deciles"])[idx]
                h["hourly_alignment"] = {
                    "hour_open": hour_open, "step_index": int(idx),
                    "kronos_p_up": float(np.mean(k_paths[:, idx] >= hour_open)),
                    "timesfm_p_up": c.p_up_from_quantiles(tq, hour_open),
                }
                h["hourly_alignment"]["ensemble_p_up"] = (
                    h["hourly_alignment"]["kronos_p_up"] + h["hourly_alignment"]["timesfm_p_up"]) / 2
                print(f"[hourly] {json.dumps(h['hourly_alignment'])}", flush=True)
        out["horizons"][name] = h
        print(f"[{name}] merged: {json.dumps(h['merged'])}", flush=True)

    path = c.HERE / "results" / f"snapshot_{a.start}.json"
    path.write_text(json.dumps(out, indent=1))
    print("wrote", path, flush=True)


if __name__ == "__main__":
    main()
