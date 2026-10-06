"""VOL and TREND modules: sigma zones, volatility cone, ATR trend trail."""

from __future__ import annotations

import math

import numpy as np

ZONES = [(-math.inf, -2, "Stretched low"), (-2, -1, "Low side"), (-1, 1, "Inside 1σ"),
         (1, 2, "High side"), (2, math.inf, "Stretched high")]


def sigma_zone(close: np.ndarray, n: int = 20) -> dict:
    """Where the last close sits versus its n-bar mean, in standard deviations."""
    w = close[-n:]
    sd = float(np.std(w))
    z = float((close[-1] - w.mean()) / sd) if sd > 0 else 0.0
    label = next(lab for lo, hi, lab in ZONES if lo <= z < hi)
    return {"z": round(z, 2), "label": label, "mean": float(w.mean()), "sd": sd}


def ewma_vol(close: np.ndarray, lam: float = 0.94) -> float:
    """RiskMetrics EWMA volatility of log returns, per bar."""
    r = np.diff(np.log(close))
    v = r[0] ** 2
    for x in r[1:]:
        v = lam * v + (1 - lam) * x * x
    return float(math.sqrt(v))


def cone(price: float, vol_per_bar: float, bars: list[int]) -> list[dict]:
    """Driftless lognormal 1σ/2σ bands h bars ahead (about 68% / 95% of outcomes)."""
    out = []
    for h in bars:
        s = vol_per_bar * math.sqrt(h)
        out.append({"h": h, "lo2": price * math.exp(-2 * s), "lo1": price * math.exp(-s),
                    "hi1": price * math.exp(s), "hi2": price * math.exp(2 * s)})
    return out


def trend_trail(high: np.ndarray, low: np.ndarray, close: np.ndarray,
                atr_len: int = 10, mult: float = 3.0) -> tuple[np.ndarray, np.ndarray]:
    """SuperTrend-style trail: direction (+1 up / -1 down) and the trail level, per bar.

    Exits happen when the trend flips: price closes through the trail.
    """
    n = len(close)
    prev = np.concatenate([[close[0]], close[:-1]])
    tr = np.maximum(high - low, np.maximum(np.abs(high - prev), np.abs(low - prev)))
    atr = np.zeros(n)
    atr[0] = tr[0]
    for t in range(1, n):
        atr[t] = (atr[t - 1] * (atr_len - 1) + tr[t]) / atr_len
    mid = (high + low) / 2
    up, dn = mid - mult * atr, mid + mult * atr
    fu, fd = up.copy(), dn.copy()
    d = np.ones(n)
    level = np.zeros(n)
    for t in range(1, n):
        fu[t] = max(up[t], fu[t - 1]) if close[t - 1] > fu[t - 1] else up[t]
        fd[t] = min(dn[t], fd[t - 1]) if close[t - 1] < fd[t - 1] else dn[t]
        if close[t] > fd[t - 1]:
            d[t] = 1
        elif close[t] < fu[t - 1]:
            d[t] = -1
        else:
            d[t] = d[t - 1]
        level[t] = fu[t] if d[t] > 0 else fd[t]
    level[0] = fu[0]
    return d, level
