# This Source Code Form is subject to the terms of the Mozilla Public License,
# v. 2.0. If a copy of the MPL was not distributed with this file, You can
# obtain one at https://mozilla.org/MPL/2.0/.
#
# Python port of the "DominantCycle" Pine Script library (c) lastguru
# https://www.tradingview.com/script/cY7DdxyZ-DominantCycle/ , itself based on
# John F. Ehlers' published estimators. Ported line by line; Pine's `x[n]`
# (value n bars ago) becomes an index into the per-bar history.
#
# Deviation: the library imports cf.hp / cf.supers2 from lastguru's
# CommonFilters, which was not available; Ehlers' standard 2-pole high-pass and
# 2-pole super smoother (cycles.roofing_filter) are used instead [VERIFY].
"""Bar-by-bar (causal) dominant-cycle period estimators: MAMA, Pearson
autocorrelation periodogram, DFT, phase accumulation. Each returns an array of
periods, one per bar, computed from bars <= that bar only."""

from __future__ import annotations

import math

import numpy as np

from cycles import roofing_filter


def _prefilter(src: np.ndarray, dyn_low: int, dyn_high: int) -> np.ndarray:
    # hp = cf.hp(src, dynHigh); filt = cf.supers2(hp, dynLow)
    return roofing_filter(src, dyn_high, dyn_low)


def mama_period(src: np.ndarray, dyn_low: int, dyn_high: int) -> np.ndarray:
    """MESA MAMA cycle: Hilbert Transform Homodyne Discriminator."""
    n = len(src)
    C1, C2 = 0.0962, 0.5769
    smooth, detrend, Q1, I1, jI, jQ, I2, Q2, Re, Im, period = (np.zeros(n) for _ in range(11))

    def ago(a, t, k):
        return a[t - k] if t - k >= 0 else 0.0  # nz(a[k])

    for t in range(n):
        prev_period = period[t - 1] if t >= 1 else 0.0
        C3 = 0.075 * prev_period + 0.54
        smooth[t] = (4 * src[t] + 3 * ago(src, t, 1) + 2 * ago(src, t, 2) + ago(src, t, 3)) / 10
        detrend[t] = C3 * (C1 * smooth[t] + C2 * ago(smooth, t, 2) - C2 * ago(smooth, t, 4) - C1 * ago(smooth, t, 6))
        Q1[t] = C3 * (C1 * detrend[t] + C2 * ago(detrend, t, 2) - C2 * ago(detrend, t, 4) - C1 * ago(detrend, t, 6))
        I1[t] = ago(detrend, t, 3)
        jI[t] = C3 * (C1 * I1[t] + C2 * ago(I1, t, 2) - C2 * ago(I1, t, 4) - C1 * ago(I1, t, 6))
        jQ[t] = C3 * (C1 * Q1[t] + C2 * ago(Q1, t, 2) - C2 * ago(Q1, t, 4) - C1 * ago(Q1, t, 6))
        i2 = I1[t] - jQ[t]
        q2 = Q1[t] + jI[t]
        I2[t] = 0.2 * i2 + 0.8 * ago(I2, t, 1)
        Q2[t] = 0.2 * q2 + 0.8 * ago(Q2, t, 1)
        re = I2[t] * ago(I2, t, 1) + Q2[t] * ago(Q2, t, 1)
        im = I2[t] * ago(Q2, t, 1) - Q2[t] * ago(I2, t, 1)
        Re[t] = 0.2 * re + 0.8 * ago(Re, t, 1)
        Im[t] = 0.2 * im + 0.8 * ago(Im, t, 1)
        p = 2 * math.pi / math.atan(Im[t] / Re[t]) if (Re[t] != 0 and Im[t] != 0) else 0.0
        ref = period[t - 1] if t >= 1 else p  # nz(period[1], period)
        p = min(p, 1.5 * ref)
        p = max(p, (2 / 3) * ref)
        p = min(max(p, dyn_low), dyn_high)
        period[t] = p * 0.2 + prev_period * 0.8
    return period


def pearson_period(src: np.ndarray, dyn_low: int, dyn_high: int) -> np.ndarray:
    """Pearson Autocorrelation Periodogram (Ehlers, S&C Sept 2016)."""
    n = len(src)
    filt = _prefilter(src, dyn_low, dyn_high)
    avglen = 3
    R = np.zeros(dyn_high + 1)
    out = np.zeros(n)
    periods = np.arange(dyn_low, dyn_high + 1)
    lags_n = np.arange(avglen, dyn_high + 1)
    sin_m = np.sin(2 * np.pi * lags_n[None, :] / periods[:, None])
    cos_m = np.cos(2 * np.pi * lags_n[None, :] / periods[:, None])
    for t in range(n):
        corr = np.zeros(dyn_high + 1)
        x = np.array([filt[t - c] if t - c >= 0 else 0.0 for c in range(avglen)])
        for lag in range(dyn_high + 1):
            y = np.array([filt[t - lag - c] if t - lag - c >= 0 else 0.0 for c in range(avglen)])
            m = avglen
            sx, sy, sxx, sxy, syy = x.sum(), y.sum(), (x * x).sum(), (x * y).sum(), (y * y).sum()
            den = (m * sxx - sx * sx) * (m * syy - sy * sy)
            corr[lag] = (m * sxy - sx * sy) / math.sqrt(den) if den > 0 else 0.0
        c_part = cos_m @ corr[avglen:]
        s_part = sin_m @ corr[avglen:]
        sq = c_part ** 2 + s_part ** 2
        R[dyn_low:] = 0.2 * sq ** 2 + 0.8 * R[dyn_low:]
        max_pwr = R[dyn_low:].max()
        pwr = R[dyn_low:] / max_pwr if max_pwr > 0 else np.zeros(len(periods))
        peak = pwr.max() if len(pwr) else 0.0
        mask = (pwr >= 0.25) & (peak >= 0.25)
        sp = pwr[mask].sum()
        dom = float((periods[mask] * pwr[mask]).sum() / sp) if sp != 0 else 0.0
        if sp < 0.25:
            dom = out[t - 1] if t >= 1 else dom  # nz(domCycle[1], domCycle)
        out[t] = dom
    return out


def dft_period(src: np.ndarray, dyn_low: int, dyn_high: int) -> np.ndarray:
    """DFT spectrum, centre of gravity of bins with >= 0.5 normalised power."""
    n = len(src)
    filt = _prefilter(src, dyn_low, dyn_high)
    periods = np.arange(dyn_low, dyn_high + 1)
    k = np.arange(dyn_high)
    cos_m = np.cos(2 * np.pi * k[None, :] / periods[:, None])
    sin_m = np.sin(2 * np.pi * k[None, :] / periods[:, None])
    out = np.zeros(n)
    for t in range(n):
        hist = np.array([filt[t - j] if t - j >= 0 else 0.0 for j in k])  # filt[n], n bars ago
        pwr = (cos_m @ hist) ** 2 + (sin_m @ hist) ** 2
        mx = pwr.max()
        if mx <= 0:
            continue
        pwr = pwr / mx
        mask = pwr >= 0.5
        sp = pwr[mask].sum()
        out[t] = float((periods[mask] * pwr[mask]).sum() / sp) if sp != 0 else 0.0
    return out


def phase_period(src: np.ndarray, dyn_low: int, dyn_high: int) -> np.ndarray:
    """Dominant cycle from phase accumulation."""
    n = len(src)
    filt = _prefilter(src, dyn_low, dyn_high)
    cnt = np.arange(dyn_high)
    cosw = np.cos(2 * np.pi * cnt / dyn_high)
    nsinw = -np.sin(2 * np.pi * cnt / dyn_high)
    angle = np.full(n, np.nan)
    delta = np.full(n, np.nan)
    out = np.zeros(n)

    def pearson(x, y):
        m = len(x)
        sx, sy, sxx, sxy, syy = x.sum(), y.sum(), (x * x).sum(), (x * y).sum(), (y * y).sum()
        a, b = m * sxx - sx * sx, m * syy - sy * sy
        return (m * sxy - sx * sy) / math.sqrt(a * b) if (a > 0 and b > 0) else 0.0

    for t in range(n):
        x = np.array([filt[t - c] if t - c >= 0 else 0.0 for c in cnt])
        real, imag = pearson(x, cosw), pearson(x, nsinw)
        ang = 90 - 180 * math.atan(imag / real) / math.pi if real != 0 else 0.0
        if real < 0:
            ang -= 180
        prev_ang = angle[t - 1] if t >= 1 else np.nan
        if not np.isnan(prev_ang) and prev_ang - ang < 270 and ang < prev_ang:
            ang = prev_ang
        angle[t] = ang
        d = ang - prev_ang  # nan on the first bar, as in Pine
        prev_d = delta[t - 1] if t >= 1 else np.nan
        if not np.isnan(d) and d <= 360 / dyn_high:
            d = prev_d
        if not np.isnan(d) and d >= 360 / dyn_low:
            d = prev_d
        delta[t] = d
        s, dom = 0.0, 0
        for c in range(dyn_high + 1):
            v = delta[t - c] if t - c >= 0 else np.nan
            s += v
            if s > 360:  # nan comparisons are False, as in Pine
                dom = c
                break
        out[t] = dom
    return out


ESTIMATORS = {"mama": mama_period, "pearson": pearson_period, "dft": dft_period, "phase": phase_period}
