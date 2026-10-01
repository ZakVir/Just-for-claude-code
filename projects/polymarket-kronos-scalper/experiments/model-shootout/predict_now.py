"""Predict every open Polymarket BTC Up/Down market (15 min -> 1 day) + the daily ladder.

Usage: python predict_now.py [--at UNIX] [--runs 3] [--paths 10]

At ``--at`` (default: next 15-minute boundary + 5 s) it freezes Binance
candles and Polymarket prices, then runs Kronos-base and TimesFM 3 ``--runs``
times per horizon and writes results/predictions_<at>.json/.md. Targets:

  15m     the 15-minute window opening at ``at``      (Chainlink TWAP; strike ~ price at open)
  hourly  the hourly market in progress               (Binance 1h close >= open)
  4h      the 4-hour window in progress               (Chainlink TWAP vs priceToBeat)
  daily   the noon-to-noon Up/Down market             (Binance noon close vs prior noon)
  ladder  every strike of the next noon "above" ladder (Binance noon close > strike)

Baselines: market mid; options-implied (Deribit smile) for 4h/daily/ladder;
volatility-scaled random walk for 15m/hourly. Score with score_predictions.py.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from datetime import datetime, timedelta, timezone
from statistics import NormalDist
from zoneinfo import ZoneInfo

import numpy as np
import requests

import common as c

sys.path.insert(0, str(c.HERE.parent / "fair-value-scan"))
sys.path.insert(0, str(c.HERE.parent.parent / "reference"))
import pricing as pr  # noqa: E402
from scan import BASIS, deribit_smiles, vol_at  # noqa: E402

GAMMA = "https://gamma-api.polymarket.com/events"
ET = ZoneInfo("America/New_York")
YEAR = 365.0 * 24 * 3600
_N = NormalDist()


def gamma_event(slug: str) -> dict | None:
    try:
        ev = requests.get(GAMMA, params={"slug": slug}, timeout=20).json()
        return ev[0] if ev else None
    except Exception:
        return None


def book(m: dict) -> dict:
    """Order-book quote for the YES/Up token; Gamma's cached fields as fallback."""
    try:
        top = c.clob_top(json.loads(m["clobTokenIds"])[0])
        if top:
            return top
    except (KeyError, TypeError, ValueError):
        pass
    try:
        bid, ask = float(m["bestBid"]), float(m["bestAsk"])
        return {"bid": bid, "ask": ask, "mid": round((bid + ask) / 2, 4), "source": "gamma"}
    except (KeyError, TypeError, ValueError):
        return {}


def et_slug_date(d: datetime) -> str:
    return f"{d.strftime('%B').lower()}-{d.day}-{d.year}"


def rw_p_up(closes: np.ndarray, spot: float, strike: float, steps: int) -> float:
    r = np.diff(np.log(closes[-61:]))
    sig = float(np.std(r)) or 1e-6
    return _N.cdf(math.log(spot / strike) / (sig * math.sqrt(max(steps, 1))))


def main() -> None:
    ap = argparse.ArgumentParser()
    now = int(time.time())
    ap.add_argument("--at", type=int, default=now - now % 900 + 900)
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--paths", type=int, default=10)
    a = ap.parse_args()
    at = a.at
    if time.time() < at + 5:
        print(f"waiting {at + 5 - time.time():.0f}s to freeze inputs", flush=True)
        time.sleep(at + 5 - time.time())

    # ------------------------------------------------------------------ freeze
    frozen = datetime.now(timezone.utc)
    end_ms = at * 1000 - 1
    data = {iv: c.fetch_klines(iv, end_ms=end_ms, limit=600).tail(512).reset_index(drop=True)
            for iv in ("1m", "15m", "1h")}
    spot = float(data["1m"]["close"].iloc[-1])
    at_et = datetime.fromtimestamp(at, tz=ET)

    hour_start = at - at % 3600
    four_start = at - (at % 14400)  # 4h windows start 00/04/08/12/16/20 UTC
    noon_today = datetime(at_et.year, at_et.month, at_et.day, 12, tzinfo=ET)
    next_noon = noon_today if at_et < noon_today else noon_today + timedelta(days=1)
    prev_noon = next_noon - timedelta(days=1)

    ev15 = gamma_event(f"btc-updown-15m-{at}")
    h_et = datetime.fromtimestamp(hour_start, tz=ET)
    h12 = h_et.strftime("%I").lstrip("0") + h_et.strftime("%p").lower()
    ev1h = gamma_event(f"bitcoin-up-or-down-{et_slug_date(h_et)}-{h12}-et")
    ev4h = gamma_event(f"btc-updown-4h-{four_start}")
    evd = gamma_event(f"bitcoin-up-or-down-on-{et_slug_date(next_noon)}")
    evl = gamma_event(f"bitcoin-above-on-{et_slug_date(next_noon)}")

    m1 = data["1m"]
    open_row = m1[m1["open_time"] == hour_start * 1000]
    meta4h = (ev4h or {}).get("eventMetadata") or {}
    metad = (evd or {}).get("eventMetadata") or {}
    prev_noon_ms = int(prev_noon.timestamp() * 1000)

    def binance_close_at(open_ms: int) -> float | None:
        df = c.fetch_klines("1m", end_ms=open_ms + 59_999, limit=2)
        row = df[df["open_time"] == open_ms]
        return float(row["close"].iloc[0]) if not row.empty else None

    targets = {
        "15m": {"slug": f"btc-updown-15m-{at}", "settles_utc": at + 900, "interval": "1m",
                "steps": 15, "strike": spot, "strike_note": "Binance close at open (TWAP proxy)",
                "op": ">=", "market": book(ev15["markets"][0]) if ev15 else {}},
        "hourly": {"slug": (ev1h or {}).get("slug"), "settles_utc": hour_start + 3600,
                   "interval": "1m", "steps": (hour_start + 3600 - at) // 60,
                   "strike": float(open_row["open"].iloc[0]) if not open_row.empty else None,
                   "strike_note": "Binance 1h candle open", "op": ">=",
                   "market": book(ev1h["markets"][0]) if ev1h else {}},
        "4h": {"slug": f"btc-updown-4h-{four_start}", "settles_utc": four_start + 14400,
               "interval": "15m", "steps": (four_start + 14400 - at) // 900,
               "strike": float(meta4h["priceToBeat"]) if meta4h.get("priceToBeat")
               else binance_close_at(four_start * 1000 - 60_000),
               "strike_note": "Chainlink priceToBeat" if meta4h.get("priceToBeat") else "Binance proxy",
               "op": ">=", "market": book(ev4h["markets"][0]) if ev4h else {}},
        "daily": {"slug": (evd or {}).get("slug"), "settles_utc": int(next_noon.timestamp()),
                  "interval": "1h", "steps": int((next_noon.timestamp() - at) // 3600),
                  "strike": float(metad["priceToBeat"]) if metad.get("priceToBeat")
                  else binance_close_at(prev_noon_ms - 60_000),
                  "strike_note": "priceToBeat" if metad.get("priceToBeat") else "Binance 11:59 ET close",
                  "op": ">", "market": book(evd["markets"][0]) if evd else {}},
    }
    ladder = []
    for m in (evl or {}).get("markets", []):
        try:
            k = float((m.get("groupItemTitle") or "").replace(",", ""))
        except ValueError:
            continue
        ladder.append({"strike": k, "question": m.get("question"), "market": book(m)})
    ladder.sort(key=lambda r: r["strike"])

    # steps so that the last forecast candle CLOSES at the settlement time:
    # candle k opens at last_open + k*dt and closes at last_open + (k+1)*dt
    for t in targets.values():
        last_open = int(data[t["interval"]]["open_time"].iloc[-1])
        dt = c.INTERVAL_MS[t["interval"]]
        t["steps"] = int(round((t["settles_utc"] * 1000 - last_open) / dt)) - 1

    print("frozen", frozen.isoformat(), "spot", spot, flush=True)
    for name, t in targets.items():
        print(f"  {name}: slug={t['slug']} strike={t['strike']} steps={t['steps']} market={t['market']}", flush=True)

    # ------------------------------------------------------------------ models
    kronos = c.load_kronos()
    tfm = c.load_timesfm3()
    smiles, index = deribit_smiles()
    paths_cache: dict[str, np.ndarray] = {}
    tfm_cache: dict[str, tuple] = {}
    runs_meta: dict[str, dict] = {}
    for iv, steps in sorted({(t["interval"], t["steps"]) for t in targets.values()}):
        if steps <= 0:
            continue
        ctx = data[iv]
        all_runs, secs = [], []
        for r in range(a.runs):
            t0 = time.time()
            all_runs.append(c.kronos_paths(kronos, ctx, iv, steps, n_paths=a.paths))
            secs.append(round(time.time() - t0, 1))
            print(f"kronos {iv} x{steps} run {r + 1} ({secs[-1]}s)", flush=True)
        paths_cache[f"{iv}:{steps}"] = np.stack(all_runs)  # (runs, paths, steps)
        tf_runs = [c.timesfm_forecast(tfm, ctx["close"].to_numpy(), steps) for _ in range(a.runs)]
        tfm_cache[f"{iv}:{steps}"] = tf_runs
        runs_meta[f"{iv}:{steps}"] = {"kronos_seconds": secs,
                                      "timesfm_identical": all(np.allclose(x[0], tf_runs[0][0]) for x in tf_runs)}

    def model_probs(iv: str, steps: int, strike: float, op: str) -> dict:
        key = f"{iv}:{steps}"
        P = paths_cache[key][:, :, steps - 1]  # (runs, paths)
        cmp = (lambda x: x >= strike) if op == ">=" else (lambda x: x > strike)
        k_runs = [float((np.sum(cmp(P[r])) + 0.5) / (P.shape[1] + 1)) for r in range(P.shape[0])]
        k_all = float((np.sum(cmp(P)) + 0.5) / (P.size + 1))
        tf_point, tf_q = tfm_cache[key][0]
        t_p = c.p_up_from_quantiles(tf_q[steps - 1], strike)
        return {"kronos_runs": [round(x, 4) for x in k_runs], "kronos": round(k_all, 4),
                "kronos_final_mean": round(float(P.mean()), 2),
                "kronos_final_p10_p90": [round(float(np.percentile(P, 10)), 2),
                                         round(float(np.percentile(P, 90)), 2)],
                "timesfm_runs": [round(t_p, 4)] * a.runs, "timesfm": round(t_p, 4),
                "timesfm_final_point": round(float(tf_point[steps - 1]), 2),
                "timesfm_final_p10_p90": [round(float(tf_q[steps - 1][0]), 2),
                                          round(float(tf_q[steps - 1][8]), 2)],
                "merged": round((k_all + t_p) / 2, 4)}

    def options_p(settle: int, strike: float) -> float | None:
        try:
            k_idx = strike / (1 + BASIS)
            sig, slope, fwd = vol_at(smiles, settle, k_idx, time.time())
            return round(pr.digital_prob_with_skew(fwd, k_idx, sig, (settle - time.time()) / YEAR, slope), 4)
        except Exception:
            return None

    out = {"at": at, "frozen_at": frozen.isoformat(), "spot": spot, "deribit_index": index,
           "config": {"runs": a.runs, "kronos_paths_per_run": a.paths, "kronos": "NeoQuasar/Kronos-base",
                      "timesfm": "google/timesfm-3.0-pytorch", "context": 512},
           "runs_meta": runs_meta, "targets": {}, "ladder": []}
    for name, t in targets.items():
        if t["strike"] is None or t["steps"] <= 0:
            out["targets"][name] = {**t, "error": "missing strike or no steps"}
            continue
        probs = model_probs(t["interval"], t["steps"], t["strike"], t["op"])
        if name in ("15m", "hourly"):
            base = {"baseline": "random walk", "baseline_p": round(
                rw_p_up(data["1m"]["close"].to_numpy(), spot, t["strike"], t["steps"]), 4)}
        else:
            base = {"baseline": "options (Deribit)", "baseline_p": options_p(t["settles_utc"], t["strike"])}
        out["targets"][name] = {**t, **probs, **base}
    lt = targets["daily"]
    for row in ladder:
        probs = model_probs(lt["interval"], lt["steps"], row["strike"], ">")
        out["ladder"].append({**row, **probs, "options": options_p(lt["settles_utc"], row["strike"])})

    res = c.HERE / "results"
    (res / f"predictions_{at}.json").write_text(json.dumps(out, indent=1, default=float))
    lines = [f"# Live model predictions frozen {frozen:%Y-%m-%d %H:%M:%S} UTC (BTC {spot:,.2f})", "",
             f"Kronos-base: {a.runs} runs × {a.paths} sampled paths; TimesFM 3: {a.runs} runs "
             "(deterministic). P = probability the market resolves **Up/Yes**.", "",
             "| market | settles (UTC) | strike | Kronos runs | Kronos | TimesFM 3 | merged | baseline | market mid | models say |",
             "|---|---|---:|---|---:|---:|---:|---:|---:|---|"]
    for name, t in out["targets"].items():
        if "error" in t:
            lines.append(f"| {name} | — | — | — | — | — | — | — | — | {t['error']} |")
            continue
        mid = t["market"].get("mid")
        call = "UP" if t["merged"] > 0.5 else "DOWN"
        lines.append(
            f"| {name} | {datetime.fromtimestamp(t['settles_utc'], tz=timezone.utc):%m-%d %H:%M} | "
            f"{t['strike']:,.2f} | {' / '.join(f'{x:.2f}' for x in t['kronos_runs'])} | {t['kronos']:.2f} | "
            f"{t['timesfm']:.2f} | {t['merged']:.2f} | {t['baseline_p'] if t['baseline_p'] is not None else float('nan'):.2f} "
            f"({t['baseline']}) | {mid if mid is not None else float('nan'):.3f} | {call} ({t['merged']:.0%}) |")
    lines += ["", f"## Ladder: Bitcoin above ___ at noon ET ({(evl or {}).get('slug')})", "",
              "| strike | Kronos | TimesFM 3 | merged | options | market mid |", "|---:|---:|---:|---:|---:|---:|"]
    for r in out["ladder"]:
        lines.append(f"| {r['strike']:,.0f} | {r['kronos']:.3f} | {r['timesfm']:.3f} | {r['merged']:.3f} | "
                     f"{r['options'] if r['options'] is not None else float('nan'):.3f} | "
                     f"{r['market'].get('mid', float('nan')):.3f} |")
    (res / f"predictions_{at}.md").write_text("\n".join(lines))
    print("\n".join(lines), flush=True)


if __name__ == "__main__":
    main()
