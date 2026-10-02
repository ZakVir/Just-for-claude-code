"""Walk-forward test of dominant-cycle BUY/SELL dates on Bitcoin, plus today's dates.

Usage: ../model-shootout/.venv/bin/python backtest_fm.py

For each timeframe (1D since 2018, 4H last 2 years, 1H last 6 months) and each
method in cycles.METHODS, a forecast is made at the close of every bar from
bars <= t only. Two questions:

1. Do the dates land on real turns? A realised trough/peak is a close that is
   the lowest/highest within +-5 bars. A BUY (SELL) date "hits" if a realised
   trough (peak) lies within +-2 bars of it. Baseline: the same forecast series
   circularly shifted against the price (keeps how often and how far ahead it
   forecasts, destroys any timing information), 300 random shifts.
2. Does trading the dates make money? Long while the projected cycle is
   rising (BUY date passed, SELL date ahead), flat otherwise; also long/short.
   0.1% fee per side. Compared with buy-and-hold and the shifted baseline.
"""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "model-shootout"))
import common as c  # noqa: E402  (Binance data helpers)

import cycles as cy  # noqa: E402
import lastguru as lg  # noqa: E402

LG_LOW, LG_HIGH = 10, 48  # Ehlers' classic bounds, fixed before testing
ALL_METHODS = list(cy.METHODS) + [f"lastguru-{k}" for k in lg.ESTIMATORS]


def max_period(method: str) -> int:
    return cy.METHODS[method]["max_p"] if method in cy.METHODS else LG_HIGH

TIMEFRAMES = {"1d": (365 * 24 * 3600 * 8.5, 365), "4h": (2 * 365 * 24 * 3600, 2190),
              "1h": (183 * 24 * 3600, 8760)}  # history span (s), bars per year
PIVOT, HIT_W, FEE, SHIFTS = 5, 2, 0.001, 300
RNG = np.random.default_rng(7)


def pivots(close: np.ndarray, m: int = PIVOT) -> tuple[np.ndarray, np.ndarray]:
    n = len(close)
    trough = np.zeros(n, bool)
    peak = np.zeros(n, bool)
    for i in range(m, n - m):
        w = close[i - m: i + m + 1]
        trough[i] = close[i] == w.min()
        peak[i] = close[i] == w.max()
    return trough, peak


def date_hits(offsets: np.ndarray, valid: np.ndarray, marks: np.ndarray) -> np.ndarray:
    """1/0 per forecast bar: is there a realised turn within +-HIT_W of t+offset?"""
    n = len(marks)
    cum = np.concatenate([[0], np.cumsum(marks)])
    t = np.arange(n)
    tgt = t + np.rint(offsets).astype(int)
    lo, hi = np.clip(tgt - HIT_W, 0, n), np.clip(tgt + HIT_W + 1, 0, n)
    ok = valid & (tgt + HIT_W < n - PIVOT)
    out = np.full(n, np.nan)
    out[ok] = (cum[hi[ok]] - cum[lo[ok]] > 0).astype(float)
    return out


def trade(pos: np.ndarray, ret: np.ndarray, per_year: int) -> dict:
    """pos[t] held over ret[t+1]; fee on position changes."""
    p = np.nan_to_num(pos)
    r = p[:-1] * ret[1:] - FEE * np.abs(np.diff(np.concatenate([[0], p])))[:-1]
    eq = np.cumsum(r)
    dd = float((np.maximum.accumulate(eq) - eq).max()) if len(eq) else 0.0
    sharpe = float(r.mean() / r.std() * np.sqrt(per_year)) if r.std() > 0 else 0.0
    return {"log_return": float(r.sum()), "sharpe": sharpe, "max_drawdown": dd,
            "trades": int((np.abs(np.diff(p)) > 0).sum())}


def evaluate(df: pd.DataFrame, method: str, per_year: int) -> tuple[dict, list]:
    close = df["close"].to_numpy()
    logc = np.log(close)
    n = len(close)
    to_tr, to_pk, rising, period, valid = (np.full(n, np.nan), np.full(n, np.nan),
                                           np.full(n, np.nan), np.full(n, np.nan), np.zeros(n, bool))
    if method in cy.METHODS:
        filt = cy.roofing_filter(logc, cy.METHODS["ehlers"]["hp"], cy.METHODS["ehlers"]["ss"]) \
            if method == "ehlers" else None
        for t in range(n):
            f = cy.forecast_at(logc, t, method, filtered=filt)
            if f is None:
                continue
            to_tr[t], to_pk[t], rising[t], period[t], valid[t] = (
                f.bars_to_trough, f.bars_to_peak, float(f.rising), f.period, True)
    else:  # lastguru estimator gives the period; same sine-fit projection on its prefilter
        per = lg.ESTIMATORS[method.split("-", 1)[1]](logc, LG_LOW, LG_HIGH)
        filt = cy.roofing_filter(logc, LG_HIGH, LG_LOW)
        for t in range(3 * LG_HIGH, n):
            p = per[t]
            if not (LG_LOW <= p <= LG_HIGH * 1.5):
                continue
            seg = filt[t + 1 - int(2 * p): t + 1]
            tt, tp, r = cy.fit_and_project(seg, p)
            to_tr[t], to_pk[t], rising[t], period[t], valid[t] = tt, tp, float(r), p, True
    trough, peak = pivots(close)
    ret = np.concatenate([[0.0], np.diff(logc)])

    # restrict everything to bars with a forecast
    idx = np.where(valid)[0]
    s, e = idx[0], n
    buy_hit = date_hits(np.nan_to_num(to_tr), valid, trough)
    sell_hit = date_hits(np.nan_to_num(to_pk), valid, peak)
    long_only = trade(np.where(valid, rising, 0)[s:e], ret[s:e], per_year)
    long_short = trade(np.where(valid, 2 * rising - 1, 0)[s:e], ret[s:e], per_year)
    hold = trade(np.ones(e - s), ret[s:e], per_year)

    # circular-shift baseline: same forecasts, wrong timing
    span = e - s
    base = {"buy": [], "sell": [], "lo": [], "ls": []}
    for _ in range(SHIFTS):
        k = int(RNG.integers(2 * max_period(method), span - 2 * max_period(method)))
        sh = lambda a: np.concatenate([a[:s], np.roll(a[s:e], k)])  # noqa: E731
        base["buy"].append(np.nanmean(date_hits(np.nan_to_num(sh(to_tr)), valid, trough)))
        base["sell"].append(np.nanmean(date_hits(np.nan_to_num(sh(to_pk)), valid, peak)))
        rs = sh(np.where(valid, rising, 0))[s:e]
        base["lo"].append(trade(rs, ret[s:e], per_year)["log_return"])
        base["ls"].append(trade(2 * rs - 1, ret[s:e], per_year)["log_return"])

    def pct(x, arr):  # share of shifted runs that did at least as well
        return float(np.mean(np.array(arr) >= x))

    res = {
        "bars": int(span), "from": str(df["timestamps"].iloc[s]), "to": str(df["timestamps"].iloc[-1]),
        "median_period_bars": float(np.nanmedian(period)),
        "turn_density": {"troughs_per_100_bars": float(trough[s:].mean() * 100),
                         "peaks_per_100_bars": float(peak[s:].mean() * 100)},
        "buy_date_hit_rate": float(np.nanmean(buy_hit)),
        "buy_baseline_mean": float(np.mean(base["buy"])), "buy_p_value": pct(np.nanmean(buy_hit), base["buy"]),
        "sell_date_hit_rate": float(np.nanmean(sell_hit)),
        "sell_baseline_mean": float(np.mean(base["sell"])), "sell_p_value": pct(np.nanmean(sell_hit), base["sell"]),
        "long_only": long_only, "long_only_p_value": pct(long_only["log_return"], base["lo"]),
        "long_short": long_short, "long_short_p_value": pct(long_short["log_return"], base["ls"]),
        "buy_and_hold": hold,
    }
    live = []
    t = n - 1
    if valid[t]:
        ts = df["timestamps"].iloc[t]
        step = pd.Timedelta(milliseconds=c.INTERVAL_MS.get(df.attrs["tf"], 86_400_000))
        live = {"as_of_close": str(ts + step), "period_bars": period[t],
                "next_buy_date": str(ts + step * (1 + np.rint(to_tr[t]))),
                "next_sell_date": str(ts + step * (1 + np.rint(to_pk[t]))),
                "phase": "rising (between BUY and SELL)" if rising[t] else "falling (between SELL and BUY)"}
    return res, live


def main() -> None:
    c.INTERVAL_MS.setdefault("1d", 86_400_000)
    c.INTERVAL_MS.setdefault("4h", 14_400_000)
    now_ms = int(time.time() * 1000)
    out = {"generated": datetime.now(timezone.utc).isoformat(),
           "rules": {"pivot_half_width_bars": PIVOT, "hit_window_bars": HIT_W, "fee_per_side": FEE,
                     "shift_baseline_runs": SHIFTS, "methods": cy.METHODS,
                     "lastguru": {"estimators": list(lg.ESTIMATORS), "dyn_low": LG_LOW, "dyn_high": LG_HIGH}},
           "results": {}, "live": {}}
    for tf, (span_s, per_year) in TIMEFRAMES.items():
        df = c.fetch_history(tf, now_ms - int(span_s * 1000), now_ms)
        df.attrs["tf"] = tf
        print(f"{tf}: {len(df)} bars {df['timestamps'].iloc[0]} -> {df['timestamps'].iloc[-1]}", flush=True)
        for method in ALL_METHODS:
            t0 = time.time()
            res, live = evaluate(df, method, per_year)
            out["results"][f"{tf}/{method}"] = res
            out["live"][f"{tf}/{method}"] = live
            print(f"  {method}: BUY hit {res['buy_date_hit_rate']:.1%} vs {res['buy_baseline_mean']:.1%} "
                  f"(p={res['buy_p_value']:.2f}) | SELL hit {res['sell_date_hit_rate']:.1%} vs "
                  f"{res['sell_baseline_mean']:.1%} (p={res['sell_p_value']:.2f}) | long-only "
                  f"{res['long_only']['log_return']:+.2f} (p={res['long_only_p_value']:.2f}) vs hold "
                  f"{res['buy_and_hold']['log_return']:+.2f} ({time.time() - t0:.0f}s)", flush=True)
    res_dir = HERE / "results"
    res_dir.mkdir(exist_ok=True)
    (res_dir / "fm_backtest.json").write_text(json.dumps(out, indent=1, default=float))
    print("wrote results/fm_backtest.json")


if __name__ == "__main__":
    main()
