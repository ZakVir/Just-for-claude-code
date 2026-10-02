"""Reference math for a Polymarket 5-minute up/down strategy.

Stdlib only. These are the formulas the bot's real modules must reproduce
(and be tested against). They exist because the original article gets the
money-critical parts wrong or leaves them out:

  * fees are ignored in the edge calculation,
  * model "confidence" is treated as a calibrated probability,
  * Kelly is computed without the fee-inclusive cost of a share,
  * there is no analytic baseline for what a 5-minute binary is worth.

Conventions
-----------
* A contract pays $1 if it wins, $0 otherwise. Buying one share at price
  ``p`` costs ``p`` plus the taker fee (makers pay no fee).
* ``q`` is YOUR probability that the contract wins. Everything downstream is
  only as good as ``q``; see ``shrink_prob`` and ``required_trades``.
* Fee schedule (docs.polymarket.com/trading/fees, checked 2026-10-01):
  taker fee per share = fee_rate * p * (1 - p), crypto fee_rate = 0.07.
  Re-read the live rate per market before trading; it has changed before.
"""

from __future__ import annotations

import math
from statistics import NormalDist

CRYPTO_TAKER_FEE_RATE = 0.07  # verify live; do not hard-code in production

_N = NormalDist()


# --------------------------------------------------------------------------
# Fees and expected value
# --------------------------------------------------------------------------
def taker_fee_per_share(p: float, fee_rate: float = CRYPTO_TAKER_FEE_RATE) -> float:
    """USDC fee per share for a taker fill at price ``p``."""
    _check_price(p)
    return fee_rate * p * (1.0 - p)


def taker_cost_per_share(p: float, fee_rate: float = CRYPTO_TAKER_FEE_RATE) -> float:
    """All-in cost of buying one share as a taker."""
    return p + taker_fee_per_share(p, fee_rate)


def taker_breakeven_prob(p: float, fee_rate: float = CRYPTO_TAKER_FEE_RATE) -> float:
    """Win probability a taker needs at price ``p`` just to break even."""
    return taker_cost_per_share(p, fee_rate)


def ev_per_share(q: float, cost: float) -> float:
    """Expected profit per share: win pays $1, so EV = q - cost."""
    return q - cost


def ev_per_dollar(q: float, cost: float) -> float:
    """Expected profit per $1 staked (the number to compare across prices)."""
    return (q - cost) / cost


# --------------------------------------------------------------------------
# Probability hygiene
# --------------------------------------------------------------------------
def shrink_prob(q_model: float, p_market: float, weight: float) -> float:
    """Pull a model probability toward the market price.

    ``weight`` in [0, 1] is how much you trust the model over the market,
    ideally fitted out-of-sample (the slope of a regression of outcomes on
    the model-minus-market difference). weight=0 means "just trust the
    market"; weight=1 means "trust the model fully". Most models that look
    good in-sample deserve a weight well under 0.5.
    """
    if not 0.0 <= weight <= 1.0:
        raise ValueError("weight must be in [0, 1]")
    return p_market + weight * (q_model - p_market)


def prob_lower_bound(q: float, n_eff: float, z: float = 1.0) -> float:
    """Normal-approx lower confidence bound on a probability estimate.

    ``n_eff`` is the effective number of out-of-sample observations behind
    the calibration bucket that produced ``q`` (not the raw trade count).
    """
    if n_eff <= 0:
        return 0.0
    return q - z * math.sqrt(max(q * (1.0 - q), 1e-12) / n_eff)


# --------------------------------------------------------------------------
# Kelly sizing
# --------------------------------------------------------------------------
def kelly_fraction(q: float, cost: float) -> float:
    """Full-Kelly fraction of bankroll for a $1-payout binary share.

    Derivation: stake f at cost c per share. Win -> wealth 1 - f + f/c,
    lose -> 1 - f. Maximising q*ln(win) + (1-q)*ln(lose) gives
        f* = (q - c) / (1 - c).
    Returns 0 when there is no edge. ``cost`` must INCLUDE the fee.
    """
    if not 0.0 < cost < 1.0:
        raise ValueError("cost must be in (0, 1)")
    return max(0.0, (q - cost) / (1.0 - cost))


def stake_fraction(
    q: float,
    cost: float,
    kelly_mult: float = 0.25,
    max_fraction: float = 0.01,
) -> float:
    """Fractional Kelly with a hard cap, as a fraction of bankroll."""
    return min(kelly_mult * kelly_fraction(q, cost), max_fraction)


# --------------------------------------------------------------------------
# What is a 5-minute up/down contract worth? (analytic baseline)
# --------------------------------------------------------------------------
def fair_prob_up(
    spot: float,
    strike: float,
    sigma: float,
    secs_remaining: float,
    twap_len: float = 60.0,
    twap_known_integral: float = 0.0,
) -> float:
    """P(final TWAP >= strike) under a driftless Brownian price.

    Settlement (per Polymarket's changelog, Aug 2026): the end price is a
    ``twap_len``-second Chainlink TWAP over the final seconds of the window.
    ``strike`` is the price to beat as the market defines it (itself a TWAP;
    confirm the exact definition in each market's rules before relying on
    this).

    ``sigma`` is the standard deviation of PRICE (not log-price) per sqrt
    second, e.g. spot * per-second log-return vol.

    ``twap_known_integral`` is the already-observed part of the settlement
    average, in price*seconds (sum of 1-second samples inside the TWAP
    window so far). It is 0 until the TWAP window opens.

    Two regimes, with L = twap_len and tau = secs_remaining:

    * tau > L (TWAP window not open yet). Final average = spot + noise with
      variance sigma^2 * ((tau - L) + L/3).
    * tau <= L (inside the TWAP window). Final average =
      (known + tau*spot)/L + noise with variance sigma^2 * tau^3 / (3 L^2).
    """
    if sigma <= 0 or twap_len <= 0:
        raise ValueError("sigma and twap_len must be positive")
    if secs_remaining <= 0:
        # window over; the caller should use the settled value instead
        return 1.0 if (twap_known_integral / twap_len) >= strike else 0.0

    tau, big_l = secs_remaining, twap_len
    if tau > big_l:
        mean = spot
        var = sigma**2 * ((tau - big_l) + big_l / 3.0)
    else:
        mean = (twap_known_integral + tau * spot) / big_l
        var = sigma**2 * tau**3 / (3.0 * big_l**2)
    return _N.cdf((mean - strike) / math.sqrt(var))


# --------------------------------------------------------------------------
# Statistics: how long until you can tell?
# --------------------------------------------------------------------------
def required_trades(
    edge_per_dollar: float,
    payoff_sd: float = 1.0,
    alpha: float = 0.05,
    power: float = 0.80,
) -> int:
    """Independent bets needed to detect a true mean profit per $ staked.

    One-sided test. ``payoff_sd`` is the standard deviation of profit per $1
    staked (~1.0 for near-50c binaries, larger for cheap longshots).
    n = ((z_alpha + z_power) * sd / edge)^2.
    """
    if edge_per_dollar <= 0:
        raise ValueError("edge must be positive")
    z = _N.inv_cdf(1.0 - alpha) + _N.inv_cdf(power)
    return math.ceil((z * payoff_sd / edge_per_dollar) ** 2)


def _check_price(p: float) -> None:
    if not 0.0 < p < 1.0:
        raise ValueError("price must be in (0, 1)")


if __name__ == "__main__":
    print("Taker economics at the 0.07 crypto fee rate")
    print(f"{'price':>6} {'fee/share':>10} {'fee % stake':>12} {'breakeven q':>12}")
    for p in (0.50, 0.60, 0.70, 0.80, 0.90, 0.95, 0.98):
        fee = taker_fee_per_share(p)
        print(f"{p:6.2f} {fee:10.5f} {100 * fee / p:11.2f}% {taker_breakeven_prob(p):12.4f}")

    print("\nTrades needed to detect a true edge (95% one-sided, 80% power)")
    for e in (0.01, 0.02, 0.03, 0.05):
        print(f"  {e:4.0%} per $ staked -> {required_trades(e):>7,} bets")
