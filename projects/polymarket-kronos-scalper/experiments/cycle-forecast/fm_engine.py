"""Ensemble of dominant-cycle estimators + ATR trend filter (causal).

method_arrays()  per-bar BUY/SELL offsets for one estimator
consensus()      median dates across estimators and how much they agree
supertrend()     ATR trailing trend direction (+1 up / -1 down)
"""

from __future__ import annotations

import numpy as np

import cycles as cy
import lastguru as lg

LG_LOW, LG_HIGH = 10, 48
ALL_METHODS = list(cy.METHODS) + [f"lastguru-{k}" for k in lg.ESTIMATORS]


def method_arrays(logc: np.ndarray, method: str) -> dict[str, np.ndarray]:
    n = len(logc)
    out = {k: np.full(n, np.nan) for k in ("to_trough", "to_peak", "rising", "period")}
    if method in cy.METHODS:
        filt = cy.roofing_filter(logc, cy.METHODS["ehlers"]["hp"], cy.METHODS["ehlers"]["ss"]) \
            if method == "ehlers" else None
        for t in range(n):
            f = cy.forecast_at(logc, t, method, filtered=filt)
            if f is not None:
                out["to_trough"][t], out["to_peak"][t] = f.bars_to_trough, f.bars_to_peak
                out["rising"][t], out["period"][t] = float(f.rising), f.period
    else:
        per = lg.ESTIMATORS[method.split("-", 1)[1]](logc, LG_LOW, LG_HIGH)
        filt = cy.roofing_filter(logc, LG_HIGH, LG_LOW)
        for t in range(3 * LG_HIGH, n):
            p = per[t]
            if LG_LOW <= p <= LG_HIGH * 1.5:
                tt, tp, r = cy.fit_and_project(filt[t + 1 - int(2 * p): t + 1], p)
                out["to_trough"][t], out["to_peak"][t] = tt, tp
                out["rising"][t], out["period"][t] = float(r), p
    return out


def consensus(per_method: list[dict[str, np.ndarray]]) -> dict[str, np.ndarray]:
    """Median BUY/SELL offsets across estimators; agreement = 1 - MAD/median period."""
    tr = np.vstack([m["to_trough"] for m in per_method])
    pk = np.vstack([m["to_peak"] for m in per_method])
    ri = np.vstack([m["rising"] for m in per_method])
    pe = np.vstack([m["period"] for m in per_method])
    with np.errstate(all="ignore"):
        valid = np.isfinite(tr).sum(axis=0) >= max(3, len(per_method) - 1)
        med_tr, med_pk = np.nanmedian(tr, axis=0), np.nanmedian(pk, axis=0)
        mad_tr = np.nanmedian(np.abs(tr - med_tr), axis=0)
        med_pe = np.nanmedian(pe, axis=0)
        agreement = 1 - np.clip(mad_tr / med_pe, 0, 1)
        rising_vote = np.nanmean(ri, axis=0)
    for a in (med_tr, med_pk, agreement, rising_vote, med_pe):
        a[~valid] = np.nan
    return {"to_trough": med_tr, "to_peak": med_pk, "agreement": agreement,
            "rising_vote": rising_vote, "period": med_pe, "valid": valid}


def supertrend(high: np.ndarray, low: np.ndarray, close: np.ndarray,
               atr_len: int = 10, mult: float = 3.0) -> np.ndarray:
    """Classic SuperTrend direction, computed bar by bar from data <= t."""
    n = len(close)
    tr = np.maximum(high - low, np.maximum(abs(high - np.roll(close, 1)), abs(low - np.roll(close, 1))))
    tr[0] = high[0] - low[0]
    atr = np.zeros(n)
    atr[0] = tr[0]
    for t in range(1, n):  # Wilder smoothing
        atr[t] = (atr[t - 1] * (atr_len - 1) + tr[t]) / atr_len
    mid = (high + low) / 2
    up, dn = mid - mult * atr, mid + mult * atr
    fu, fd = up.copy(), dn.copy()
    d = np.ones(n)
    for t in range(1, n):
        fu[t] = max(up[t], fu[t - 1]) if close[t - 1] > fu[t - 1] else up[t]
        fd[t] = min(dn[t], fd[t - 1]) if close[t - 1] < fd[t - 1] else dn[t]
        if close[t] > fd[t - 1]:
            d[t] = 1
        elif close[t] < fu[t - 1]:
            d[t] = -1
        else:
            d[t] = d[t - 1]
    return d
