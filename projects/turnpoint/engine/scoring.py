"""How we judge turn dates: real turns, hits, and a random-timing baseline.

A realised turn is a close that is the lowest (trough) or highest (peak)
within +-PIVOT bars. A forecast date hits if a matching turn lies within
+-HIT_W bars of it. The baseline is the same forecast series circularly
shifted against the price: same cadence and horizons, no timing information.
"""

from __future__ import annotations

import numpy as np

PIVOT, HIT_W, FEE = 5, 2, 0.001


def pivots(close: np.ndarray, m: int = PIVOT) -> tuple[np.ndarray, np.ndarray]:
    n = len(close)
    trough, peak = np.zeros(n, bool), np.zeros(n, bool)
    for i in range(m, n - m):
        w = close[i - m: i + m + 1]
        trough[i] = close[i] == w.min()
        peak[i] = close[i] == w.max()
    return trough, peak


def date_hits(offsets: np.ndarray, valid: np.ndarray, marks: np.ndarray) -> np.ndarray:
    """Per bar t: 1/0 if a turn lies within +-HIT_W of t + offset[t]; NaN if unscorable."""
    n = len(marks)
    cum = np.concatenate([[0], np.cumsum(marks)])
    t = np.arange(n)
    tgt = t + np.rint(np.nan_to_num(offsets)).astype(int)
    lo, hi = np.clip(tgt - HIT_W, 0, n), np.clip(tgt + HIT_W + 1, 0, n)
    ok = valid & (tgt + HIT_W < n - PIVOT)
    out = np.full(n, np.nan)
    out[ok] = (cum[hi[ok]] - cum[lo[ok]] > 0).astype(float)
    return out


def chance_rate(marks: np.ndarray) -> float:
    """Share of all bars that have a turn within +-HIT_W: what a random date scores."""
    n = len(marks)
    cum = np.concatenate([[0], np.cumsum(marks)])
    t = np.arange(PIVOT, n - PIVOT)
    lo, hi = np.clip(t - HIT_W, 0, n), np.clip(t + HIT_W + 1, 0, n)
    return float(np.mean(cum[hi] - cum[lo] > 0)) if len(t) else float("nan")


def trade(pos: np.ndarray, ret: np.ndarray) -> float:
    """Log return of holding pos[t] over ret[t+1], with FEE per side on changes."""
    p = np.nan_to_num(pos)
    r = p[:-1] * ret[1:] - FEE * np.abs(np.diff(np.concatenate([[0], p])))[:-1]
    return float(r.sum())


def backtest(close: np.ndarray, to_trough: np.ndarray, to_peak: np.ndarray, rising: np.ndarray,
             valid: np.ndarray, shifts: int = 300, min_shift: int = 100, seed: int = 0) -> dict:
    """Hit rates and trading result of a forecast series vs its scrambled-timing baseline."""
    rng = np.random.default_rng(seed)
    trough, peak = pivots(close)
    logc = np.log(close)
    ret = np.concatenate([[0.0], np.diff(logc)])
    s = int(np.argmax(valid))
    sl = slice(s, len(close))
    tr, pk, ri, va = to_trough[sl], to_peak[sl], np.where(valid, rising, 0.0)[sl], valid[sl]
    th, pm, rt = trough[sl], peak[sl], ret[sl]
    n = len(tr)

    def run(k: int) -> tuple[float, float, float]:
        rol = (lambda a: np.roll(a, k)) if k else (lambda a: a)
        b = date_hits(rol(tr), rol(va), th)
        p = date_hits(rol(pk), rol(va), pm)
        return float(np.nanmean(b)), float(np.nanmean(p)), trade(rol(ri), rt)

    buy, sell, lr = run(0)
    if n <= 2 * min_shift + 10:
        return {"bars": n, "too_short": True}
    base = np.array([run(int(k)) for k in rng.integers(min_shift, n - min_shift, shifts)])
    return {
        "bars": n, "buy_hit": buy, "buy_random": float(base[:, 0].mean()),
        "buy_p": float(np.mean(base[:, 0] >= buy)),
        "sell_hit": sell, "sell_random": float(base[:, 1].mean()),
        "sell_p": float(np.mean(base[:, 1] >= sell)),
        "follow_logret": lr, "follow_p": float(np.mean(base[:, 2] >= lr)),
        "hold_logret": trade(np.ones(n), rt),
        "n_forecasts": int(np.isfinite(date_hits(tr, va, th)).sum()),
    }
