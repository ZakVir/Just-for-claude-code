"""Options-implied fair values for BTC binary markets, and hedge ratios.

Stdlib only. Use these to price Polymarket strike ladders, range buckets and
"what price will BTC hit" (touch) markets off a deep options market such as
Deribit, instead of off a forecast.

Conventions
-----------
* ``F`` forward (≈ spot for short horizons; crypto rates are small but use the
  options-implied forward when available). ``K`` strike, ``B`` barrier.
* ``sigma`` annualised implied vol (e.g. 0.55), ``T`` years to resolution.
* Probabilities are risk-neutral. For horizons of days to weeks the gap to
  real-world probability is small relative to fees and spreads, but it is a
  gap; calibrate before trusting the last cent.
"""

from __future__ import annotations

import math
from statistics import NormalDist

_N = NormalDist()


def _d1_d2(F: float, K: float, sigma: float, T: float) -> tuple[float, float]:
    if F <= 0 or K <= 0 or sigma <= 0 or T <= 0:
        raise ValueError("F, K, sigma, T must be positive")
    s = sigma * math.sqrt(T)
    d1 = (math.log(F / K) + 0.5 * s * s) / s
    return d1, d1 - s


def black_call(F: float, K: float, sigma: float, T: float) -> float:
    """Undiscounted Black-76 call value in the same units as F."""
    d1, d2 = _d1_d2(F, K, sigma, T)
    return F * _N.cdf(d1) - K * _N.cdf(d2)


def digital_prob(F: float, K: float, sigma: float, T: float) -> float:
    """P(S_T > K) with a flat vol: N(d2)."""
    return _N.cdf(_d1_d2(F, K, sigma, T)[1])


def digital_prob_with_skew(
    F: float, K: float, sigma: float, T: float, dsigma_dK: float
) -> float:
    """P(S_T > K) when vol depends on strike.

    Digital = -dC/dK = N(d2) - Vega * dsigma/dK, Vega = F * phi(d1) * sqrt(T).
    Ignoring skew misprices digitals by several cents on BTC; this is the
    term most home-made "fair value" models leave out.
    """
    d1, d2 = _d1_d2(F, K, sigma, T)
    vega = F * _N.pdf(d1) * math.sqrt(T)
    return min(1.0, max(0.0, _N.cdf(d2) - vega * dsigma_dK))


def call_spread_digital(
    call_low: float, call_high: float, k_low: float, k_high: float
) -> float:
    """Model-free digital estimate from two listed calls (USD-denominated).

    (C(k_low) - C(k_high)) / (k_high - k_low) ≈ P(S_T > K) near the middle
    of the two strikes. Deribit quotes options in BTC: multiply by the index
    price to convert to USD first.
    """
    if k_high <= k_low:
        raise ValueError("k_high must exceed k_low")
    return (call_low - call_high) / (k_high - k_low)


def digital_delta(F: float, K: float, sigma: float, T: float) -> float:
    """dP/dF of a $1 digital: BTC to short per YES share to be delta-neutral."""
    _, d2 = _d1_d2(F, K, sigma, T)
    return _N.pdf(d2) / (F * sigma * math.sqrt(T))


def touch_prob(
    S0: float, B: float, sigma: float, T: float, mu: float = 0.0
) -> float:
    """P(price touches barrier B at any time before T), continuous monitoring.

    Log-price drifts at nu = mu - sigma^2/2 (mu = 0: risk-neutral, zero
    rates). For an up-barrier (B > S0, b = ln(B/S0) > 0):
        P = N((-b + nu T)/(s)) + exp(2 nu b / sigma^2) N((-b - nu T)/(s))
    and symmetrically for a down-barrier. s = sigma sqrt(T).
    Touch markets resolve on a candle high/low from a named exchange, which is
    close to continuous monitoring.
    """
    if S0 <= 0 or B <= 0 or sigma <= 0 or T <= 0:
        raise ValueError("S0, B, sigma, T must be positive")
    b = math.log(B / S0)
    if b == 0:
        return 1.0
    nu = mu - 0.5 * sigma * sigma
    s = sigma * math.sqrt(T)
    k = math.exp(2.0 * nu * b / (sigma * sigma))
    if b > 0:
        p = _N.cdf((-b + nu * T) / s) + k * _N.cdf((-b - nu * T) / s)
    else:
        p = _N.cdf((b - nu * T) / s) + k * _N.cdf((b + nu * T) / s)
    return min(1.0, max(0.0, p))


def interp_vol(T: float, T1: float, sigma1: float, T2: float, sigma2: float) -> float:
    """Implied vol at T by linear interpolation in total variance.

    Needed because Polymarket resolves at e.g. 12:00 ET while Deribit options
    expire at 08:00 UTC: price between the two bracketing expiries.
    """
    if not (0 < T1 < T2):
        raise ValueError("need 0 < T1 < T2")
    w1, w2 = sigma1 * sigma1 * T1, sigma2 * sigma2 * T2
    w = w1 + (w2 - w1) * (T - T1) / (T2 - T1)
    if w <= 0 or T <= 0:
        raise ValueError("non-positive total variance")
    return math.sqrt(w / T)


YEAR_SECONDS = 365.0 * 24.0 * 3600.0


def years(seconds: float) -> float:
    """Convenience: seconds -> years for T."""
    return seconds / YEAR_SECONDS
