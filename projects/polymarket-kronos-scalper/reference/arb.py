"""Structural (prediction-free) edges: arbitrage, rebates, capital efficiency.

Stdlib only. Every function returns money per $1-payout share or per $1
staked so strategies can be compared on one scale.

Conventions
-----------
* Each outcome token pays $1 if it wins. ``ask`` is the price you would pay as
  a taker, ``bid`` what you would receive as a taker.
* Taker fee per share = fee_rate * p * (1 - p) (crypto fee_rate 0.07 as of
  2026-10-01; read it live). Makers pay no fee. ``fee_rate=0`` models a leg
  filled as a maker.
* "Guaranteed" means: under the market's rules, on the stated resolution
  source. If two legs settle on DIFFERENT sources or times, the relation is
  no longer guaranteed; treat the result as a model trade, not an arb.
"""

from __future__ import annotations

from itertools import combinations
from typing import Sequence

from edge_math import CRYPTO_TAKER_FEE_RATE, taker_fee_per_share


def _buy_cost(ask: float, fee_rate: float) -> float:
    return ask + taker_fee_per_share(ask, fee_rate)


def _sell_proceeds(bid: float, fee_rate: float) -> float:
    # [VERIFY] that taker SELLS pay the same p(1-p) fee as buys.
    return bid - taker_fee_per_share(bid, fee_rate)


# --------------------------------------------------------------------------
# Complete sets (binary market: YES + NO always pays exactly $1)
# --------------------------------------------------------------------------
def complete_set_buy_profit(
    ask_yes: float, ask_no: float, fee_rate: float = CRYPTO_TAKER_FEE_RATE
) -> float:
    """Buy YES and NO, then merge (or hold to resolution) for $1."""
    return 1.0 - _buy_cost(ask_yes, fee_rate) - _buy_cost(ask_no, fee_rate)


def complete_set_sell_profit(
    bid_yes: float, bid_no: float, fee_rate: float = CRYPTO_TAKER_FEE_RATE
) -> float:
    """Split $1 into YES + NO, sell both."""
    return _sell_proceeds(bid_yes, fee_rate) + _sell_proceeds(bid_no, fee_rate) - 1.0


# --------------------------------------------------------------------------
# Dominance ("combinatorial") arbitrage between logically linked markets
# --------------------------------------------------------------------------
def dominance_arb_profit(
    ask_yes_superset: float,
    ask_no_subset: float,
    fee_rate: float = CRYPTO_TAKER_FEE_RATE,
) -> float:
    """Guaranteed profit when event B implies event A (B is a subset of A).

    Buy YES on A and NO on B. Payoffs: B happens -> 1 + 0; A but not B ->
    1 + 1; neither -> 0 + 1. The minimum payoff is $1, so any total cost
    below $1 is locked-in profit, and the "A but not B" state pays a bonus $1.

    Examples (same source and timestamp required):
      * strike ladder: {BTC > 100k at T} contains {BTC > 105k at T};
      * touch vs terminal: {BTC touches 120k by T} contains {BTC >= 120k at T};
      * daily Up/Down vs ladder: {close >= open} contains {close > K}, K > open.
    """
    return 1.0 - _buy_cost(ask_yes_superset, fee_rate) - _buy_cost(ask_no_subset, fee_rate)


def best_ladder_arb(
    strikes: Sequence[float],
    yes_asks: Sequence[float],
    no_asks: Sequence[float],
    fee_rate: float = CRYPTO_TAKER_FEE_RATE,
) -> tuple[float, float, float] | None:
    """Scan an "above K" ladder for the most profitable dominance pair.

    Returns (profit, low_strike, high_strike) for the best pair with
    profit > 0, else None. {S > low} contains {S > high} whenever low < high.
    """
    if not len(strikes) == len(yes_asks) == len(no_asks):
        raise ValueError("strikes, yes_asks and no_asks must align")
    best = None
    for i, j in combinations(range(len(strikes)), 2):
        lo, hi = (i, j) if strikes[i] < strikes[j] else (j, i)
        profit = dominance_arb_profit(yes_asks[lo], no_asks[hi], fee_rate)
        if profit > 0 and (best is None or profit > best[0]):
            best = (profit, strikes[lo], strikes[hi])
    return best


# --------------------------------------------------------------------------
# Multi-outcome (exactly one bucket wins, e.g. "BTC price on <date>" ranges)
# --------------------------------------------------------------------------
def bucket_yes_arb_profit(
    yes_asks: Sequence[float], fee_rate: float = CRYPTO_TAKER_FEE_RATE
) -> float:
    """Buy YES on every bucket. Exactly one pays $1.

    Only valid if the buckets are EXHAUSTIVE (tails included) and mutually
    exclusive; check the market's rules before trusting this.
    """
    return 1.0 - sum(_buy_cost(a, fee_rate) for a in yes_asks)


def bucket_no_arb_profit(
    no_asks: Sequence[float], fee_rate: float = CRYPTO_TAKER_FEE_RATE
) -> float:
    """Buy NO on every bucket. Exactly N-1 of them pay $1.

    On Polymarket neg-risk markets the NO set can also be converted early
    [VERIFY mechanics], freeing capital before resolution.
    """
    n = len(no_asks)
    if n < 2:
        raise ValueError("need at least two outcomes")
    return (n - 1) - sum(_buy_cost(a, fee_rate) for a in no_asks)


# --------------------------------------------------------------------------
# Maker economics and capital efficiency
# --------------------------------------------------------------------------
def maker_rebate_per_share(
    p: float,
    fee_rate: float = CRYPTO_TAKER_FEE_RATE,
    rebate_share: float = 0.20,
) -> float:
    """Expected maker rebate per filled share at price p.

    Polymarket pays ``rebate_share`` of a market's taker fees to makers,
    pro-rata to each maker's fee-equivalent volume (fee_rate * p * (1-p)
    per share). Every fill has exactly one taker side, so total maker
    fee-equivalent equals total taker fees and each filled maker share earns
    rebate_share * fee_rate * p * (1-p). Approximation: assumes all filled
    makers are counted and the pool is fully distributed.
    """
    return rebate_share * taker_fee_per_share(p, fee_rate)


def taker_vs_maker_swing(p: float, fee_rate: float = CRYPTO_TAKER_FEE_RATE) -> float:
    """Per-share difference between paying the taker fee and earning the rebate."""
    return taker_fee_per_share(p, fee_rate) + maker_rebate_per_share(p, fee_rate)


def simple_apr(edge_per_dollar: float, hours_locked: float) -> float:
    """Annualised (non-compounded) return of capital locked for ``hours_locked``.

    Use it to rank opportunities across horizons: 0.5% on a 15-minute window
    and 3% on a 30-day market are very different uses of the same dollar.
    """
    if hours_locked <= 0:
        raise ValueError("hours_locked must be positive")
    return edge_per_dollar * (24.0 * 365.0) / hours_locked
