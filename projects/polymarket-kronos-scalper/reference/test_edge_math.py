"""Tests for edge_math.py. Run: python3 -m unittest -v   (from this folder)."""

import math
import random
import unittest

import edge_math as em


class FeeTests(unittest.TestCase):
    def test_docs_example_100_shares_at_50c(self):
        # Polymarket docs: 100 shares at $0.50 on a crypto market -> $1.75 fee.
        self.assertAlmostEqual(100 * em.taker_fee_per_share(0.50), 1.75, places=9)

    def test_fee_peaks_at_50c_and_is_symmetric(self):
        self.assertGreater(em.taker_fee_per_share(0.5), em.taker_fee_per_share(0.6))
        self.assertAlmostEqual(
            em.taker_fee_per_share(0.3), em.taker_fee_per_share(0.7), places=12
        )

    def test_breakeven_needs_more_than_the_price(self):
        self.assertAlmostEqual(em.taker_breakeven_prob(0.5), 0.5175, places=9)
        # the article's "confidence > 55%" gate is barely above this at 50c
        self.assertLess(em.taker_breakeven_prob(0.5), 0.55)

    def test_tail_prices_are_cheap_to_take(self):
        self.assertLess(em.taker_fee_per_share(0.95), 0.004)

    def test_bad_price_rejected(self):
        for p in (0.0, 1.0, -0.1, 1.5):
            with self.assertRaises(ValueError):
                em.taker_fee_per_share(p)


class KellyTests(unittest.TestCase):
    def _best_f_by_grid(self, q, c):
        best_f, best_g = 0.0, -1e9
        for i in range(0, 1000):
            f = i / 1000.0
            g = q * math.log(1 - f + f / c) + (1 - q) * math.log(1 - f)
            if g > best_g:
                best_f, best_g = f, g
        return best_f

    def test_matches_brute_force_log_wealth_maximiser(self):
        for q, c in [(0.60, 0.50), (0.55, 0.52), (0.80, 0.70), (0.97, 0.92)]:
            self.assertAlmostEqual(
                em.kelly_fraction(q, c), self._best_f_by_grid(q, c), delta=0.002
            )

    def test_even_odds_reduces_to_2q_minus_1(self):
        self.assertAlmostEqual(em.kelly_fraction(0.6, 0.5), 0.2, places=12)

    def test_no_edge_no_bet(self):
        self.assertEqual(em.kelly_fraction(0.50, 0.5175), 0.0)

    def test_fee_inclusive_cost_shrinks_the_bet(self):
        q, p = 0.56, 0.50
        with_fee = em.kelly_fraction(q, em.taker_cost_per_share(p))
        no_fee = em.kelly_fraction(q, p)
        self.assertLess(with_fee, no_fee)
        self.assertGreater(with_fee, 0.0)

    def test_cap_and_fraction_applied(self):
        # huge edge: 25% Kelly would be large, cap must bind
        self.assertEqual(em.stake_fraction(0.99, 0.5, 0.25, 0.01), 0.01)
        # small edge: fractional Kelly binds, not the cap
        f = em.stake_fraction(0.52, 0.50, 0.25, 0.05)
        self.assertAlmostEqual(f, 0.25 * 0.04, places=12)


class ProbHygieneTests(unittest.TestCase):
    def test_shrink_endpoints(self):
        self.assertEqual(em.shrink_prob(0.7, 0.5, 0.0), 0.5)
        self.assertAlmostEqual(em.shrink_prob(0.7, 0.5, 1.0), 0.7)
        self.assertAlmostEqual(em.shrink_prob(0.7, 0.5, 0.25), 0.55)

    def test_lower_bound_is_below_estimate_and_tightens_with_n(self):
        lo_small = em.prob_lower_bound(0.6, 100)
        lo_big = em.prob_lower_bound(0.6, 10_000)
        self.assertLess(lo_small, lo_big)
        self.assertLess(lo_big, 0.6)


class FairProbTests(unittest.TestCase):
    SIGMA = 1.0  # price units per sqrt(second); scale-free for the test

    def _mc_before_twap(self, offset_sigmas, tau, trials=6000, seed=7):
        """Simulate 1s steps; final TWAP = mean of last 60 samples."""
        rng = random.Random(seed)
        big_l = 60
        s = self.SIGMA
        strike = -offset_sigmas * s * math.sqrt((tau - big_l) + big_l / 3.0)
        wins = 0
        for _ in range(trials):
            x, path = 0.0, []
            for _ in range(int(tau)):
                x += s * rng.gauss(0, 1)
                path.append(x)
            twap = sum(path[-big_l:]) / big_l
            wins += twap >= strike
        analytic = em.fair_prob_up(0.0, strike, s, tau, twap_len=big_l)
        return wins / trials, analytic

    def test_before_twap_window_matches_simulation(self):
        for offset in (-1.0, 0.0, 1.0):
            mc, an = self._mc_before_twap(offset, tau=200)
            self.assertAlmostEqual(mc, an, delta=0.025, msg=f"offset={offset}")

    def test_inside_twap_window_matches_simulation(self):
        rng = random.Random(11)
        big_l, tau, s = 60, 30, self.SIGMA
        spot = 0.0
        known = (big_l - tau) * spot  # price sat at `spot` for the first 30s
        sd = s * math.sqrt(tau**3 / (3.0 * big_l**2))
        strike = -1.0 * sd
        trials, wins = 6000, 0
        for _ in range(trials):
            x, acc = spot, 0.0
            for _ in range(tau):
                x += s * rng.gauss(0, 1)
                acc += x
            wins += (known + acc) / big_l >= strike
        analytic = em.fair_prob_up(
            spot, strike, s, tau, twap_len=big_l, twap_known_integral=known
        )
        self.assertAlmostEqual(wins / trials, analytic, delta=0.03)

    def test_monotone_in_spot_and_certainty_late(self):
        a = em.fair_prob_up(100.0, 100.0, 0.5, 200)
        b = em.fair_prob_up(101.0, 100.0, 0.5, 200)
        self.assertAlmostEqual(a, 0.5, places=12)
        self.assertGreater(b, a)
        # 5 seconds left with the average already well above strike
        late = em.fair_prob_up(
            102.0, 100.0, 0.5, 5, twap_len=60, twap_known_integral=55 * 102.0
        )
        self.assertGreater(late, 0.999)

    def test_expired_window_returns_indicator(self):
        self.assertEqual(
            em.fair_prob_up(0, 99, 1, 0, twap_len=60, twap_known_integral=60 * 100), 1.0
        )
        self.assertEqual(
            em.fair_prob_up(0, 101, 1, 0, twap_len=60, twap_known_integral=60 * 100), 0.0
        )

    def test_bad_sigma_rejected(self):
        with self.assertRaises(ValueError):
            em.fair_prob_up(100, 100, 0.0, 100)


class PowerTests(unittest.TestCase):
    def test_known_sample_sizes(self):
        # z(0.95)+z(0.80) = 2.4865 -> (2.4865/0.02)^2 ~= 15,456
        self.assertAlmostEqual(em.required_trades(0.02), 15_456, delta=5)
        self.assertGreater(em.required_trades(0.01), 4 * 15_000)  # halve edge -> 4x n

    def test_rejects_nonpositive_edge(self):
        with self.assertRaises(ValueError):
            em.required_trades(0.0)


if __name__ == "__main__":
    unittest.main()
