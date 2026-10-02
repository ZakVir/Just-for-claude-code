"""Tests for the lastguru DominantCycle port. Run: python -m unittest -v (needs numpy)."""

import unittest

import numpy as np

import lastguru as lg


def series(n: int, period: float, noise: float = 0.0, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    t = np.arange(n)
    return np.log(10 + 0.002 * t + 0.4 * np.sin(2 * np.pi * t / period) + noise * rng.standard_normal(n))


class EstimatorTests(unittest.TestCase):
    def test_each_estimator_recovers_a_known_cycle(self):
        for true_p in (20.0, 32.0):
            x = series(700, true_p, noise=0.01)
            for name, fn in lg.ESTIMATORS.items():
                est = fn(x, 10, 48)
                med = float(np.median(est[-200:]))
                self.assertLess(abs(med - true_p), 0.2 * true_p + 2, f"{name}: {med} vs {true_p}")

    def test_causal(self):
        x = series(500, 25.0, noise=0.02, seed=4)
        for name, fn in lg.ESTIMATORS.items():
            full = fn(x, 10, 48)
            part = fn(x[:400], 10, 48)
            np.testing.assert_allclose(full[:400], part, err_msg=name)


if __name__ == "__main__":
    unittest.main()
