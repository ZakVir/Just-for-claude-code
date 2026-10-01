"""Tests for arb.py and pricing.py. Run: python3 -m unittest -v (from this folder)."""

import math
import random
import unittest

import arb
import pricing as pr
from edge_math import taker_fee_per_share


class CompleteSetTests(unittest.TestCase):
    def test_buy_profit_includes_both_fees(self):
        got = arb.complete_set_buy_profit(0.47, 0.48)
        want = 1 - 0.47 - 0.48 - taker_fee_per_share(0.47) - taker_fee_per_share(0.48)
        self.assertAlmostEqual(got, want, places=12)

    def test_fees_kill_a_naive_looking_arb(self):
        # asks sum to 0.97 -> looks like 3c free, but fees at ~50c eat 3.5c
        self.assertLess(arb.complete_set_buy_profit(0.48, 0.49), 0)
        # as a maker (no fee) the same prices are profitable
        self.assertGreater(arb.complete_set_buy_profit(0.48, 0.49, fee_rate=0.0), 0)

    def test_sell_side(self):
        self.assertGreater(arb.complete_set_sell_profit(0.53, 0.52, fee_rate=0.0), 0)
        self.assertLess(arb.complete_set_sell_profit(0.51, 0.50), 0)


class DominanceTests(unittest.TestCase):
    def _payoffs(self, a_happens, b_happens):
        # long YES on superset A, long NO on subset B
        return (1 if a_happens else 0) + (0 if b_happens else 1)

    def test_minimum_payoff_is_one_dollar_in_every_consistent_state(self):
        states = [(True, True), (True, False), (False, False)]  # B => A
        self.assertEqual(min(self._payoffs(*s) for s in states), 1)
        self.assertEqual(self._payoffs(True, False), 2)  # bonus state

    def test_profit_formula(self):
        p = arb.dominance_arb_profit(0.30, 0.65, fee_rate=0.0)
        self.assertAlmostEqual(p, 0.05, places=12)

    def test_taker_fees_are_charged_on_both_legs(self):
        got = arb.dominance_arb_profit(0.30, 0.67)
        want = 1 - 0.30 - 0.67 - taker_fee_per_share(0.30) - taker_fee_per_share(0.67)
        self.assertAlmostEqual(got, want, places=12)
        # 3c of apparent edge is wiped out by ~3c of fees at these prices
        self.assertLess(got, 0)

    def test_ladder_scan_finds_inverted_pair(self):
        strikes = [100_000, 105_000, 110_000]
        # consistent ladder except 105k YES is too cheap vs 110k NO
        yes = [0.70, 0.30, 0.40]
        no = [0.31, 0.71, 0.61]
        best = arb.best_ladder_arb(strikes, yes, no, fee_rate=0.0)
        self.assertIsNotNone(best)
        profit, lo, hi = best
        self.assertEqual((lo, hi), (105_000, 110_000))
        self.assertAlmostEqual(profit, 1 - 0.30 - 0.61, places=12)

    def test_consistent_ladder_has_no_arb(self):
        strikes = [100_000, 105_000, 110_000]
        yes = [0.71, 0.41, 0.16]
        no = [0.30, 0.60, 0.85]
        self.assertIsNone(arb.best_ladder_arb(strikes, yes, no))

    def test_misaligned_inputs_rejected(self):
        with self.assertRaises(ValueError):
            arb.best_ladder_arb([1, 2], [0.5], [0.5, 0.5])


class BucketTests(unittest.TestCase):
    def test_yes_side(self):
        self.assertAlmostEqual(
            arb.bucket_yes_arb_profit([0.2, 0.3, 0.45], fee_rate=0.0), 0.05, places=12
        )

    def test_no_side_pays_n_minus_one(self):
        # 3 buckets, NO asks sum to 1.9 -> guaranteed 2.0 back
        self.assertAlmostEqual(
            arb.bucket_no_arb_profit([0.75, 0.65, 0.50], fee_rate=0.0), 0.10, places=12
        )

    def test_fees_are_charged_per_leg(self):
        free = arb.bucket_yes_arb_profit([0.2, 0.3, 0.45], fee_rate=0.0)
        paid = arb.bucket_yes_arb_profit([0.2, 0.3, 0.45])
        self.assertLess(paid, free)


class MakerAndCapitalTests(unittest.TestCase):
    def test_rebate_at_50c(self):
        self.assertAlmostEqual(arb.maker_rebate_per_share(0.5), 0.0035, places=12)

    def test_swing_is_4_2_percent_of_stake_at_50c(self):
        self.assertAlmostEqual(arb.taker_vs_maker_swing(0.5) / 0.5, 0.042, places=12)

    def test_apr_ranks_horizons(self):
        fast = arb.simple_apr(0.005, 0.25)  # 0.5% per 15 minutes
        slow = arb.simple_apr(0.03, 24 * 30)  # 3% per 30 days
        self.assertGreater(fast, slow)
        self.assertAlmostEqual(slow, 0.03 * 365 / 30, places=12)


class DigitalTests(unittest.TestCase):
    F, K, SIG, T = 100_000.0, 105_000.0, 0.55, 7 / 365

    def test_flat_vol_digital_equals_minus_dC_dK(self):
        h = 1.0
        fd = -(pr.black_call(self.F, self.K + h, self.SIG, self.T)
               - pr.black_call(self.F, self.K - h, self.SIG, self.T)) / (2 * h)
        self.assertAlmostEqual(pr.digital_prob(self.F, self.K, self.SIG, self.T), fd, places=6)

    def test_skew_adjustment_matches_finite_difference_of_smile(self):
        slope = -2e-6  # vol falls 0.2 points per $1,000 of strike
        def vol(k):
            return self.SIG + slope * (k - self.F)
        h = 1.0
        fd = -(pr.black_call(self.F, self.K + h, vol(self.K + h), self.T)
               - pr.black_call(self.F, self.K - h, vol(self.K - h), self.T)) / (2 * h)
        got = pr.digital_prob_with_skew(self.F, self.K, vol(self.K), self.T, slope)
        self.assertAlmostEqual(got, fd, places=6)
        # and the skew term is material: more than half a cent here
        flat = pr.digital_prob(self.F, self.K, vol(self.K), self.T)
        self.assertGreater(abs(got - flat), 0.005)

    def test_call_spread_approximates_digital(self):
        lo, hi = self.K - 500, self.K + 500
        cs = pr.call_spread_digital(
            pr.black_call(self.F, lo, self.SIG, self.T),
            pr.black_call(self.F, hi, self.SIG, self.T), lo, hi)
        self.assertAlmostEqual(cs, pr.digital_prob(self.F, self.K, self.SIG, self.T), delta=0.002)

    def test_delta_matches_finite_difference(self):
        h = 1.0
        fd = (pr.digital_prob(self.F + h, self.K, self.SIG, self.T)
              - pr.digital_prob(self.F - h, self.K, self.SIG, self.T)) / (2 * h)
        self.assertAlmostEqual(pr.digital_delta(self.F, self.K, self.SIG, self.T), fd, places=9)

    def test_bad_inputs_rejected(self):
        with self.assertRaises(ValueError):
            pr.digital_prob(100, 100, 0.0, 1)
        with self.assertRaises(ValueError):
            pr.call_spread_digital(1, 0.5, 100, 100)


class TouchTests(unittest.TestCase):
    def test_reflection_principle_when_log_drift_is_zero(self):
        S0, B, sig, T = 100.0, 110.0, 0.6, 30 / 365
        b, s = math.log(B / S0), sig * math.sqrt(T)
        got = pr.touch_prob(S0, B, sig, T, mu=0.5 * sig * sig)  # nu = 0
        self.assertAlmostEqual(got, 2 * pr._N.cdf(-b / s), places=12)

    def test_touch_dominates_terminal(self):
        S0, B, sig, T = 100_000.0, 120_000.0, 0.55, 31 / 365
        terminal = pr.digital_prob(S0, B, sig, T)
        touch = pr.touch_prob(S0, B, sig, T)
        self.assertGreater(touch, terminal)
        # Reflection gives exactly 2x with zero log-drift; the risk-neutral
        # drift (-sigma^2/2) shrinks the terminal odds a bit more than the
        # touch odds, so the ratio sits slightly above 2 (2.08 here).
        self.assertTrue(1.9 < touch / terminal < 2.3, touch / terminal)

    def test_already_through_barrier(self):
        self.assertEqual(pr.touch_prob(100.0, 100.0, 0.5, 0.1), 1.0)

    def _mc_touch(self, S0, B, sig, T, trials=20_000, steps=50, seed=3):
        """Exact continuous-monitoring MC via Brownian-bridge crossing odds."""
        rng = random.Random(seed)
        b = math.log(B / S0)
        up = b > 0
        nu, dt = -0.5 * sig * sig, T / steps
        sd = sig * math.sqrt(dt)
        hits = 0
        for _ in range(trials):
            x = 0.0
            for _ in range(steps):
                nxt = x + nu * dt + sd * rng.gauss(0, 1)
                crossed = nxt >= b if up else nxt <= b
                if not crossed:
                    p_bridge = math.exp(-2 * (b - x) * (b - nxt) / (sig * sig * dt))
                    crossed = rng.random() < p_bridge
                if crossed:
                    hits += 1
                    break
                x = nxt
        return hits / trials

    def test_up_barrier_matches_simulation(self):
        args = (100_000.0, 115_000.0, 0.55, 30 / 365)
        self.assertAlmostEqual(self._mc_touch(*args), pr.touch_prob(*args), delta=0.015)

    def test_down_barrier_matches_simulation(self):
        args = (100_000.0, 88_000.0, 0.55, 30 / 365)
        self.assertAlmostEqual(self._mc_touch(*args), pr.touch_prob(*args), delta=0.015)


class TouchSkewTests(unittest.TestCase):
    S0, SIG, T = 84_800.0, 0.45, 30 / 365

    def test_no_slope_reduces_to_flat_touch(self):
        for B in (70_000.0, 100_000.0):
            self.assertAlmostEqual(
                pr.touch_prob_skew(self.S0, self.S0, B, self.SIG, self.T, 0.0),
                pr.touch_prob(self.S0, B, self.SIG, self.T), places=12)

    def test_put_skew_lowers_downside_touch_and_raises_upside(self):
        slope = -1e-5  # IV falls as strike rises (puts rich)
        down_flat = pr.touch_prob(self.S0, 70_000.0, self.SIG, self.T)
        down_skew = pr.touch_prob_skew(self.S0, self.S0, 70_000.0, self.SIG, self.T, slope)
        up_flat = pr.touch_prob(self.S0, 100_000.0, self.SIG, self.T)
        up_skew = pr.touch_prob_skew(self.S0, self.S0, 100_000.0, self.SIG, self.T, slope)
        self.assertLess(down_skew, down_flat)
        self.assertGreater(up_skew, up_flat)
        # the correction is material: several points on the downside wing
        self.assertGreater(down_flat - down_skew, 0.02)


class VolInterpTests(unittest.TestCase):
    def test_endpoints_and_middle(self):
        self.assertAlmostEqual(pr.interp_vol(1 / 365, 1 / 365, 0.5, 2 / 365, 0.6), 0.5)
        self.assertAlmostEqual(pr.interp_vol(2 / 365, 1 / 365, 0.5, 2 / 365, 0.6), 0.6)
        mid = pr.interp_vol(1.5 / 365, 1 / 365, 0.5, 2 / 365, 0.6)
        self.assertTrue(0.5 < mid < 0.6)

    def test_years_helper(self):
        self.assertAlmostEqual(pr.years(365 * 24 * 3600), 1.0)


if __name__ == "__main__":
    unittest.main()
