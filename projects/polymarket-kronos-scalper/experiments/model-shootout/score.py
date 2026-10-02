"""Wait for each forecast horizon to pass, then score the snapshot.

Usage: python score.py --start UNIX

Scores every Kronos/TimesFM run and the merged forecast against
  * the realised Binance BTCUSDT closes (the models' own target),
  * Polymarket's official resolution (15-minute Chainlink-TWAP market and the
    Binance-1h-candle hourly market), and
  * the market's own probability at the snapshot (the bar to beat).
Writes results/score_<start>.json and results/report_<start>.md after each
stage, so partial results survive.
"""

from __future__ import annotations

import argparse
import json
import time

import numpy as np
import requests

import common as c

GAMMA = "https://gamma-api.polymarket.com/events"


def wait_until(ts: float, label: str) -> None:
    if time.time() < ts:
        print(f"waiting {ts - time.time():.0f}s for {label}", flush=True)
        time.sleep(ts - time.time())


def official_outcome(slug: str, give_up_at: float) -> dict:
    """Poll Gamma until the market shows a 1/0 settlement price."""
    while True:
        try:
            m = requests.get(GAMMA, params={"slug": slug}, timeout=20).json()[0]["markets"][0]
            prices = [float(x) for x in json.loads(m["outcomePrices"])]
            outcomes = json.loads(m["outcomes"])
            if max(prices) >= 0.99 and min(prices) <= 0.01:
                return {"winner": outcomes[int(np.argmax(prices))],
                        "up": outcomes[int(np.argmax(prices))] == "Up",
                        "closed": m.get("closed"), "uma_status": m.get("umaResolutionStatus")}
        except Exception as exc:  # keep polling
            print("poll error", repr(exc), flush=True)
        if time.time() > give_up_at:
            return {"winner": None, "note": "not resolved before give-up time"}
        time.sleep(30)


def realised(interval: str, opens: list[str]) -> np.ndarray:
    last_open_ms = int(np.datetime64(opens[-1].replace("+00:00", ""), "ms").astype(np.int64))
    df = c.fetch_klines(interval, end_ms=last_open_ms + c.INTERVAL_MS[interval] - 1, limit=50)
    want = {int(np.datetime64(o.replace("+00:00", ""), "ms").astype(np.int64)) for o in opens}
    df = df[df["open_time"].isin(want)]
    if len(df) != len(opens):
        raise RuntimeError(f"expected {len(opens)} candles, got {len(df)}")
    return df["close"].to_numpy()


def score_probability(p: float, up: bool | None) -> dict:
    if up is None:
        return {}
    return {"p_up": round(p, 4), "hit": (p > 0.5) == up,
            "brier": round(c.brier(p, up), 4), "log_loss": round(c.log_loss(p, up), 4)}


def score_horizon(h: dict, actual: np.ndarray) -> dict:
    ref, final = h["ref_close"], float(actual[-1])
    up = final >= ref
    rw_err = abs(final - ref)
    res = {"ref_close": ref, "actual_final": final, "actual_move": round(final - ref, 2),
           "binance_up": up, "random_walk_abs_err": round(rw_err, 2), "runs": []}

    for i, k in enumerate(h["kronos_runs"]):
        err = abs(k["final_mean"] - final)
        res["runs"].append({"model": "kronos", "run": i + 1, "final": round(k["final_mean"], 2),
                            "abs_err": round(err, 2), "beats_random_walk": err < rw_err,
                            "in_path_range": k["final_min"] <= final <= k["final_max"],
                            "path_mae": round(float(np.mean(np.abs(np.array(k["mean_path"]) - actual))), 2),
                            **score_probability(k["p_up"], up)})
    for i, t in enumerate(h["timesfm_runs"]):
        err = abs(t["final_point"] - final)
        d = t["final_deciles"]
        res["runs"].append({"model": "timesfm3", "run": i + 1, "final": round(t["final_point"], 2),
                            "abs_err": round(err, 2), "beats_random_walk": err < rw_err,
                            "in_10_90_band": d[0] <= final <= d[8],
                            "path_mae": round(float(np.mean(np.abs(np.array(t["point_path"]) - actual))), 2),
                            **score_probability(t["p_up"], up)})
    m = h["merged"]
    ens_err = abs(m["ensemble_final"] - final)
    res["merged"] = {
        "kronos_all_paths": score_probability(m["kronos_p_up_all_paths"], up),
        "timesfm": score_probability(m["timesfm_p_up"], up),
        "ensemble": {**score_probability(m["ensemble_p_up"], up),
                     "final": round(m["ensemble_final"], 2), "abs_err": round(ens_err, 2),
                     "beats_random_walk": ens_err < rw_err},
    }
    return res


def render(snap: dict, sc: dict) -> str:
    lines = [f"# Live snapshot {snap['frozen_at']}", "",
             "Single snapshot = anecdote, not evidence. See backtest results for statistics.", ""]
    for name, r in sc.get("horizons", {}).items():
        lines += [f"## {name} horizon", "",
                  f"ref {r['ref_close']:.2f} -> actual {r['actual_final']:.2f} "
                  f"(move {r['actual_move']:+.2f}, Binance {'UP' if r['binance_up'] else 'DOWN'}); "
                  f"random-walk abs err {r['random_walk_abs_err']:.2f}", "",
                  "| model | run | final | abs err | beats RW | P(up) | hit | Brier |",
                  "|---|---|---|---|---|---|---|---|"]
        for x in r["runs"]:
            lines.append(f"| {x['model']} | {x['run']} | {x['final']:.2f} | {x['abs_err']:.2f} | "
                         f"{'yes' if x['beats_random_walk'] else 'no'} | {x.get('p_up', 0):.3f} | "
                         f"{'yes' if x.get('hit') else 'no'} | {x.get('brier', float('nan')):.3f} |")
        e = r["merged"]["ensemble"]
        lines += ["", f"Merged ensemble: P(up) {e['p_up']:.3f}, final {e['final']:.2f}, "
                      f"hit {'yes' if e['hit'] else 'no'}, Brier {e['brier']:.3f}, "
                      f"beats random walk: {'yes' if e['beats_random_walk'] else 'no'}", ""]
        if "official" in r:
            lines += [f"Official Polymarket result: {json.dumps(r['official'])}", ""]
    for key in ("market_15m", "market_hourly"):
        if key in sc:
            lines += [f"## {key}", "", "```json", json.dumps(sc[key], indent=1), "```", ""]
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=int, required=True)
    a = ap.parse_args()
    snap = json.loads((c.HERE / "results" / f"snapshot_{a.start}.json").read_text())
    out_json = c.HERE / "results" / f"score_{a.start}.json"
    out_md = c.HERE / "results" / f"report_{a.start}.md"
    sc: dict = {"window_start": a.start, "horizons": {}}

    def save() -> None:
        out_json.write_text(json.dumps(sc, indent=1))
        out_md.write_text(render(snap, sc))

    # ---- 15-minute horizon + official 15m market ----
    h15 = snap["horizons"]["15m"]
    end15 = a.start + 15 * 60
    wait_until(end15 + 75, "15m candles")
    r15 = score_horizon(h15, realised("1m", h15["target_candle_opens"]))
    mk = snap["market"]
    off = official_outcome(mk["slug"], give_up_at=end15 + 20 * 60) if "slug" in mk else {}
    r15["official"] = off
    if off.get("winner") is not None:
        up = off["up"]
        m = h15["merged"]
        sc["market_15m"] = {
            "official_up": up, "binance_proxy_agrees": up == r15["binance_up"],
            "market_mid_at_snapshot": (score_probability(mk["mid_up"], up)
                                       if "mid_up" in mk else {"error": mk.get("error")}),
            "kronos_vs_official": score_probability(m["kronos_p_up_all_paths"], up),
            "timesfm_vs_official": score_probability(m["timesfm_p_up"], up),
            "ensemble_vs_official": score_probability(m["ensemble_p_up"], up),
        }
    sc["horizons"]["15m"] = r15
    save()
    print("15m scored", json.dumps(sc.get("market_15m", {})), flush=True)

    # ---- hourly Polymarket market (Binance 1h candle) ----
    h60 = snap["horizons"]["60m"]
    hm, align = snap.get("hourly_market", {}), h60.get("hourly_alignment")
    if align and "slug" in hm:
        hour_end = a.start - a.start % 3600 + 3600
        wait_until(hour_end + 75, "hourly candle")
        k1h = c.fetch_klines("1h", end_ms=hour_end * 1000 - 1, limit=3)
        row = k1h[k1h["open_time"] == (hour_end - 3600) * 1000].iloc[0]
        binance_up = float(row["close"]) >= float(row["open"])
        off_h = official_outcome(hm["slug"], give_up_at=hour_end + 30 * 60)
        up = off_h.get("up", binance_up) if off_h.get("winner") is not None else binance_up
        sc["market_hourly"] = {
            "hour_open": float(row["open"]), "hour_close": float(row["close"]),
            "binance_up": binance_up, "official": off_h,
            "market_mid_at_snapshot": (score_probability(hm["mid_up"], up)
                                       if "mid_up" in hm else {"error": hm.get("error")}),
            "kronos": score_probability(align["kronos_p_up"], up),
            "timesfm": score_probability(align["timesfm_p_up"], up),
            "ensemble": score_probability(align["ensemble_p_up"], up),
        }
        save()
        print("hourly scored", json.dumps(sc["market_hourly"]), flush=True)

    # ---- 60-minute horizon ----
    end60 = a.start + 60 * 60
    wait_until(end60 + 75, "60m candles")
    sc["horizons"]["60m"] = score_horizon(h60, realised("5m", h60["target_candle_opens"]))
    save()
    print("60m scored; report at", out_md, flush=True)


if __name__ == "__main__":
    main()
