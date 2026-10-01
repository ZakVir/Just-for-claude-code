"""Walk-forward test on recent Polymarket BTC 15-minute windows.

Usage: python backtest.py [--hours 36] [--paths 6]

For every resolved 15-minute window in the last ``--hours`` and two decision
times (window open, and 5 minutes in), forecast P(Up) with:
  * kronos    Kronos-base, ``--paths`` sampled paths (share ending >= strike)
  * timesfm3  TimesFM 3.0 deciles -> normal fit
  * merged    average of kronos and timesfm3
  * analytic  driftless random walk scaled by the last hour's 1-minute vol
  * market    Polymarket's own Up price at the decision time (prices-history)
and score against Polymarket's OFFICIAL resolution. A naive fee-inclusive
trading simulation buys whichever side the forecaster thinks is cheap.

Strike proxy: Binance BTCUSDT close at the window open (official strike is
Chainlink's TWAP). Only data timestamped before each decision is used.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
import time
from datetime import datetime, timezone
from statistics import NormalDist

import numpy as np
import requests

import common as c

sys.path.insert(0, str(c.HERE.parent.parent / "reference"))
from edge_math import taker_fee_per_share  # noqa: E402

GAMMA = "https://gamma-api.polymarket.com/events"
HIST = "https://clob.polymarket.com/prices-history"
_N = NormalDist()
CTX = 512
HALF_SPREAD = 0.005  # assumed cost of crossing half a 1-cent spread


def market_info(start: int, decision_ts: list[int]) -> dict | None:
    try:
        m = requests.get(GAMMA, params={"slug": f"btc-updown-15m-{start}"}, timeout=20).json()[0]["markets"][0]
        prices = [float(x) for x in json.loads(m["outcomePrices"])]
        if not (max(prices) >= 0.99 and min(prices) <= 0.01):
            return None
        up_won = json.loads(m["outcomes"])[int(np.argmax(prices))] == "Up"
        tok = json.loads(m["clobTokenIds"])[0]
        hist = requests.get(HIST, params={"market": tok, "startTs": start - 600,
                                          "endTs": start + 900, "fidelity": 1}, timeout=20).json()["history"]
        px = {}
        for d in decision_ts:
            before = [h["p"] for h in hist if h["t"] <= d + 5]
            px[d] = float(before[-1]) if before else None
        return {"up_won": up_won, "price": px}
    except Exception as exc:
        print("market fetch failed", start, repr(exc), flush=True)
        return None


def analytic_p_up(closes: np.ndarray, strike: float, steps: int) -> float:
    r = np.diff(np.log(closes[-61:]))
    sig = float(np.std(r)) or 1e-6
    return _N.cdf(math.log(closes[-1] / strike) / (sig * math.sqrt(steps)))


def boot_ci(x: np.ndarray, n: int = 2000, seed: int = 0) -> list[float]:
    rng = np.random.default_rng(seed)
    means = [float(np.mean(rng.choice(x, size=len(x)))) for _ in range(n)]
    return [round(float(np.percentile(means, 2.5)), 4), round(float(np.percentile(means, 97.5)), 4)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--hours", type=float, default=36)
    ap.add_argument("--paths", type=int, default=6)
    ap.add_argument("--offsets", default="0,300")
    a = ap.parse_args()
    offsets = [int(x) for x in a.offsets.split(",")]

    now = int(time.time())
    last = now - now % 900 - 1800  # windows that closed >= 15 min ago
    starts = list(range(last - int(a.hours * 3600) + 900, last + 1, 900))
    print(f"{len(starts)} windows x {len(offsets)} decision times", flush=True)

    hist = c.fetch_history("1m", (starts[0] - (CTX + 70) * 60) * 1000, (starts[-1] + 900) * 1000)
    by_open = {int(t): i for i, t in enumerate(hist["open_time"])}
    closes_all = hist["close"].to_numpy()

    cases = []
    for s in starts:
        k_idx = by_open.get((s - 60) * 1000)
        end_idx = by_open.get((s + 840) * 1000)
        if k_idx is None or end_idx is None:
            continue
        info = market_info(s, [s + d for d in offsets])
        time.sleep(0.1)
        if info is None:
            continue
        strike = float(closes_all[k_idx])
        for d in offsets:
            last_idx = by_open.get((s + d - 60) * 1000)
            if last_idx is None or last_idx + 1 < CTX or info["price"][s + d] is None:
                continue
            cases.append({"start": s, "offset": d, "strike": strike, "ctx_end": last_idx,
                          "steps": (900 - d) // 60, "up_won": info["up_won"],
                          "binance_up": float(closes_all[end_idx]) >= strike,
                          "market_p": info["price"][s + d]})
    print(f"{len(cases)} scorable decisions", flush=True)

    # ---- TimesFM 3 (deterministic, batched) ----
    tfm = c.load_timesfm3()
    ctxs = [closes_all[cs["ctx_end"] - CTX + 1: cs["ctx_end"] + 1].astype(np.float32) for cs in cases]
    outs = list(tfm.predict_batch(ctxs, horizon=15, return_quantiles=True))
    for cs, o in zip(cases, outs):
        q = np.asarray(o.quantiles)[cs["steps"] - 1]
        cs["timesfm3"] = c.p_up_from_quantiles(q, cs["strike"])
        cs["analytic"] = analytic_p_up(closes_all[: cs["ctx_end"] + 1], cs["strike"], cs["steps"])
    del tfm
    print("timesfm3 done", flush=True)

    # ---- Kronos-base, sampled paths, batched by horizon ----
    kp = c.load_kronos()
    cols = ["open", "high", "low", "close", "volume", "amount"]
    t0 = time.time()
    for steps in sorted({cs["steps"] for cs in cases}):
        group = [cs for cs in cases if cs["steps"] == steps]
        for i in range(0, len(group), 8):
            chunk = group[i: i + 8]
            dfs, xts, yts = [], [], []
            for cs in chunk:
                ctx = hist.iloc[cs["ctx_end"] - CTX + 1: cs["ctx_end"] + 1]
                x_ts = ctx["timestamps"].reset_index(drop=True)
                y_ts = c.future_index(x_ts.iloc[-1], "1m", steps)
                for _ in range(a.paths):
                    dfs.append(ctx[cols].reset_index(drop=True)); xts.append(x_ts); yts.append(y_ts)
            res = kp.predict_batch(dfs, xts, yts, pred_len=steps, T=1.0, top_p=0.9,
                                   sample_count=1, verbose=False)
            finals = np.array([r["close"].to_numpy()[-1] for r in res]).reshape(len(chunk), a.paths)
            for cs, f in zip(chunk, finals):
                cs["kronos"] = c.p_up_from_paths(f, cs["strike"])
            done = sum("kronos" in x for x in cases)
            print(f"kronos {done}/{len(cases)} ({time.time() - t0:.0f}s)", flush=True)
    for cs in cases:
        cs["merged"] = (cs["kronos"] + cs["timesfm3"]) / 2

    # ---- scoring ----
    models = ["kronos", "timesfm3", "merged", "analytic", "market"]
    report = {"generated": datetime.now(timezone.utc).isoformat(), "windows": len(starts),
              "kronos_paths": a.paths, "by_offset": {}}
    for d in offsets:
        sub = [cs for cs in cases if cs["offset"] == d]
        if not sub:
            continue
        y = np.array([cs["up_won"] for cs in sub], dtype=float)
        mk_brier = np.array([(cs["market_p"] - yy) ** 2 for cs, yy in zip(sub, y)])
        block = {"n": len(sub), "base_rate_up": round(float(y.mean()), 4),
                 "binance_proxy_agreement": round(float(np.mean(
                     [cs["binance_up"] == cs["up_won"] for cs in sub])), 4), "models": {}}
        for m in models:
            p = np.array([cs[m if m != "market" else "market_p"] for cs in sub])
            br = (p - y) ** 2
            ll = -np.log(np.clip(np.where(y == 1, p, 1 - p), 1e-6, 1))
            # naive trading sim vs the market price (fee + half-spread)
            pnl = []
            for cs, q in zip(sub, p):
                mp = cs["market_p"]
                if m == "market" or not (0.01 < mp < 0.99):
                    continue
                cost_up = mp + HALF_SPREAD + taker_fee_per_share(min(mp + HALF_SPREAD, 0.99))
                cost_dn = (1 - mp) + HALF_SPREAD + taker_fee_per_share(min(1 - mp + HALF_SPREAD, 0.99))
                if q > cost_up:
                    pnl.append(((1.0 if cs["up_won"] else 0.0) - cost_up) / cost_up)
                elif (1 - q) > cost_dn:
                    pnl.append(((0.0 if cs["up_won"] else 1.0) - cost_dn) / cost_dn)
            diff = br - mk_brier
            block["models"][m] = {
                "hit_rate": round(float(np.mean((p > 0.5) == (y == 1))), 4),
                "brier": round(float(br.mean()), 5),
                "log_loss": round(float(ll.mean()), 5),
                "brier_minus_market": round(float(diff.mean()), 5),
                "brier_minus_market_ci95": boot_ci(diff) if m != "market" else None,
                "mean_abs_dev_from_half": round(float(np.mean(np.abs(p - 0.5))), 4),
                "sim_trades": len(pnl),
                "sim_return_per_dollar": round(float(np.mean(pnl)), 4) if pnl else None,
                "sim_return_ci95": boot_ci(np.array(pnl)) if len(pnl) > 5 else None,
            }
        report["by_offset"][str(d)] = block
    (c.HERE / "results" / "backtest_cases.json").write_text(json.dumps(cases, indent=0, default=float))
    (c.HERE / "results" / "backtest_summary.json").write_text(json.dumps(report, indent=1))
    print(json.dumps(report, indent=1), flush=True)


if __name__ == "__main__":
    random.seed(0)
    main()
