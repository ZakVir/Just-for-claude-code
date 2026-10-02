"""Dominant-cycle turn forecasting (an open recreation of Elcaro's "FM" idea).

Elcaro does not publish its method, so this implements the standard cycle-
analysis recipe two ways, both strictly causal (a forecast made at bar t uses
only bars <= t):

  A "ehlers"  Ehlers roofing filter (2-pole high-pass + super smoother) on log
              price, DFT power over the last 2*max_period bars -> dominant
              period P, least-squares sine fit over the last 2P filtered bars.
  B "fft"     linear-detrended log price over a 256-bar window, FFT power ->
              P, sine fit over the last 2P detrended bars.

The fitted sine is projected forward: the next trough is the next BUY date
("growth start"), the next peak the next SELL date ("decline start").
Parameters are fixed up front (no tuning on the test data).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

METHODS = {
    "ehlers": {"min_p": 10, "max_p": 60, "hp": 60, "ss": 10},
    "fft": {"min_p": 10, "max_p": 120, "window": 256},
}


@dataclass
class Forecast:
    period: float        # dominant cycle length, bars
    bars_to_trough: float  # > 0: next projected low  -> BUY date
    bars_to_peak: float    # > 0: next projected high -> SELL date
    rising: bool         # projected phase is between trough and peak
    strength: float      # share of spectral power at the chosen period


def roofing_filter(x: np.ndarray, hp_period: int = 60, ss_period: int = 10) -> np.ndarray:
    """Ehlers roofing filter: 2-pole high-pass then super smoother. Causal."""
    n = len(x)
    a = 0.707 * 2 * math.pi / hp_period
    alpha1 = (math.cos(a) + math.sin(a) - 1) / math.cos(a)
    hp = np.zeros(n)
    for t in range(2, n):
        hp[t] = ((1 - alpha1 / 2) ** 2 * (x[t] - 2 * x[t - 1] + x[t - 2])
                 + 2 * (1 - alpha1) * hp[t - 1] - (1 - alpha1) ** 2 * hp[t - 2])
    a1 = math.exp(-1.414 * math.pi / ss_period)
    c2 = 2 * a1 * math.cos(1.414 * math.pi / ss_period)
    c3 = -a1 * a1
    c1 = 1 - c2 - c3
    out = np.zeros(n)
    for t in range(2, n):
        out[t] = c1 * (hp[t] + hp[t - 1]) / 2 + c2 * out[t - 1] + c3 * out[t - 2]
    return out


def dominant_period(y: np.ndarray, min_p: int, max_p: int) -> tuple[float, float]:
    """Period with the most DFT power in y (periods min_p..max_p), and its power share."""
    n = np.arange(len(y))
    y = y - y.mean()
    periods = np.arange(min_p, max_p + 1)
    power = np.array([(y @ np.cos(2 * np.pi * n / p)) ** 2 + (y @ np.sin(2 * np.pi * n / p)) ** 2
                      for p in periods])
    i = int(np.argmax(power))
    return float(periods[i]), float(power[i] / power.sum()) if power.sum() > 0 else 0.0


def fit_and_project(y: np.ndarray, period: float) -> tuple[float, float, bool]:
    """Least-squares sine fit of period P to y; bars from the last point to the
    next projected trough and peak, and whether the phase is rising."""
    m = len(y)
    n = np.arange(m)
    w = 2 * np.pi / period
    X = np.column_stack([np.cos(w * n), np.sin(w * n), np.ones(m)])
    a, b, _ = np.linalg.lstsq(X, y, rcond=None)[0]
    # y ~ R cos(w n - phi): peaks where w n - phi = 0 (mod 2pi), troughs at pi
    phi = math.atan2(b, a)
    theta = (w * (m - 1) - phi) % (2 * math.pi)  # current phase in [0, 2pi)
    to_peak = ((2 * math.pi - theta) % (2 * math.pi)) / w or period
    to_trough = ((math.pi - theta) % (2 * math.pi)) / w or period
    rising = theta > math.pi  # between trough (pi) and next peak (2pi)
    return to_trough, to_peak, rising


def forecast_at(log_close: np.ndarray, t: int, method: str,
                filtered: np.ndarray | None = None) -> Forecast | None:
    """Forecast made at the close of bar t, using bars [.. t] only."""
    cfg = METHODS[method]
    if method == "ehlers":
        f = filtered if filtered is not None else roofing_filter(log_close[: t + 1], cfg["hp"], cfg["ss"])
        win = 2 * cfg["max_p"]
        if t + 1 < win + 50:
            return None
        seg = f[t + 1 - win: t + 1]
        p, s = dominant_period(seg, cfg["min_p"], cfg["max_p"])
        fit = f[t + 1 - int(2 * p): t + 1]
    else:
        win = cfg["window"]
        if t + 1 < win:
            return None
        seg = log_close[t + 1 - win: t + 1]
        n = np.arange(win)
        seg = seg - np.polyval(np.polyfit(n, seg, 1), n)
        p, s = dominant_period(seg, cfg["min_p"], cfg["max_p"])
        fit = seg[-int(2 * p):]
    to_trough, to_peak, rising = fit_and_project(fit, p)
    return Forecast(p, to_trough, to_peak, rising, s)
