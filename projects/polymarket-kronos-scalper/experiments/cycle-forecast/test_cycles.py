"""Tests for cycles.py on synthetic data. Run: python -m unittest -v (needs numpy)."""

import math
import unittest

import numpy as np

import cycles as cy


def synthetic(n: int, period: float, amp: float = 0.05, noise: float = 0.0, seed: int = 0):
    rng = np.random.default_rng(seed)
    t = np.arange(n)
    return 10 + 0.0005 * t + amp * np.sin(2 * np.pi * t / period) + noise * rng.standard_normal(n)


class FitTests(unittest.TestCase):
    def test_projection_on_pure_sine(self):
        p = 24.0
        n = np.arange(96)
        y = np.cos(2 * np.pi * n / p)  # peak at n = 0, 24, 48, 72, 96; trough at 12, 36, ...
        to_trough, to_peak, rising = cy.fit_and_project(y, p)
        # last index 95 -> next peak at 96 (1 bar), next trough at 108 (13 bars)
        self.assertAlmostEqual(to_peak, 1.0, places=6)
        self.assertAlmostEqual(to_trough, 13.0, places=6)
        self.assertTrue(rising)

    def test_falling_phase(self):
        p = 24.0
        n = np.arange(90)  # last index 89: just past peak at 72, trough at 84 passed, rising to 96
        y = np.cos(2 * np.pi * n / p)
        _, to_peak, rising = cy.fit_and_project(y, p)
        self.assertTrue(rising)
        self.assertAlmostEqual(to_peak, 7.0, places=6)
        n2 = np.arange(80)  # last index 79: after peak 72, before trough 84 -> falling
        _, _, rising2 = cy.fit_and_project(np.cos(2 * np.pi * n2 / p), p)
        self.assertFalse(rising2)


class DetectionTests(unittest.TestCase):
    def test_both_methods_find_the_cycle_and_its_turns(self):
        period = 30.0
        x = np.log(synthetic(600, period, noise=0.002))
        t = len(x) - 1
        for method in ("ehlers", "fft"):
            f = cy.forecast_at(x, t, method)
            self.assertIsNotNone(f, method)
            self.assertLess(abs(f.period - period), 2.5, method)
            # true next trough of sin(2 pi t / 30): where t/30 = k + 0.75
            true_trough = (math.ceil(t / period - 0.75) + 0.75) * period - t
            if true_trough <= 0:
                true_trough += period
            err = abs(f.bars_to_trough - true_trough)
            self.assertLess(min(err, period - err), 3.0, method)  # filter lag allowance

    def test_no_look_ahead(self):
        x = np.log(synthetic(700, 26.0, noise=0.01, seed=3))
        t = 500
        for method in ("ehlers", "fft"):
            a = cy.forecast_at(x[: t + 1], t, method)
            filt = cy.roofing_filter(x, 60, 10) if method == "ehlers" else None
            b = cy.forecast_at(x, t, method, filtered=filt)
            self.assertAlmostEqual(a.bars_to_trough, b.bars_to_trough, places=9, msg=method)
            self.assertEqual(a.rising, b.rising)


if __name__ == "__main__":
    unittest.main()
