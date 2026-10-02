"""Tests for signals, scoring, ledger and gearbox. Run from engine/: python -m unittest -v"""

import math
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

import fm_engine
import forecast
import headtohead
import ledger
import scoring
import signals


class SignalTests(unittest.TestCase):
    def test_sigma_zone(self):
        x = np.array([10.0] * 19 + [10.0])
        x[:10] -= 1
        x[10:19] += 1
        z = signals.sigma_zone(np.concatenate([x[:-1], [12.0]]))
        self.assertGreater(z["z"], 1)
        self.assertIn(z["label"], ("High side", "Stretched high"))

    def test_cone_is_symmetric_in_log_space(self):
        c = signals.cone(100.0, 0.02, [4])[0]
        self.assertAlmostEqual(math.log(c["hi1"] / 100), -math.log(c["lo1"] / 100), places=12)
        self.assertAlmostEqual(math.log(c["hi1"] / 100), 0.04, places=12)

    def test_trend_trail_direction(self):
        up = np.linspace(100, 200, 120)
        d, level = signals.trend_trail(up * 1.01, up * 0.99, up)
        self.assertEqual(d[-1], 1)
        self.assertLess(level[-1], up[-1])
        down = up[::-1]
        d2, level2 = signals.trend_trail(down * 1.01, down * 0.99, down)
        self.assertEqual(d2[-1], -1)
        self.assertGreater(level2[-1], down[-1])


class ScoringTests(unittest.TestCase):
    def test_pivots_and_chance(self):
        t = np.arange(200)
        close = 100 + 10 * np.sin(2 * np.pi * t / 20)
        trough, peak = scoring.pivots(close)
        self.assertTrue(trough[15] and peak[25])
        # a turn every 20 bars, window of 5 bars -> about 25% chance
        self.assertAlmostEqual(scoring.chance_rate(trough), 0.25, delta=0.03)

    def test_perfect_forecast_beats_scrambled(self):
        # irregular cycles (28-52 bars), like real markets: a shifted copy can't line up again
        rng = np.random.default_rng(5)
        lengths = rng.integers(28, 53, 40)
        phase = np.concatenate([np.linspace(0, 2 * np.pi, L, endpoint=False) for L in lengths])[:1200]
        n = len(phase)
        close = 100 - 10 * np.cos(phase)  # trough at phase 0, peak at phase pi
        starts = np.concatenate([[0], np.cumsum(lengths)])
        troughs = starts[starts < n + 60]
        peaks = (starts[:-1] + lengths // 2)
        t = np.arange(n)
        to_trough = np.array([troughs[troughs > i][0] - i for i in t], float)
        to_peak = np.array([peaks[peaks > i][0] - i for i in t], float)
        rising = (to_peak < to_trough).astype(float)
        r = scoring.backtest(close, to_trough, to_peak, rising, np.ones(n, bool), shifts=100)
        self.assertGreater(r["buy_hit"], 0.9)
        self.assertLess(r["buy_p"], 0.05)
        self.assertGreater(r["follow_logret"], r["hold_logret"])


class LedgerTests(unittest.TestCase):
    def _df(self, n=120):
        times = pd.date_range("2026-01-01", periods=n, freq="D", tz="UTC")
        close = 100 + 10 * np.sin(2 * np.pi * np.arange(n) / 20)
        return pd.DataFrame({"time": times, "close": close})

    def test_record_dedupes_and_scores(self):
        df = self._df()
        view = {"tf": "1d", "as_of": "2026-01-10T00:00Z", "close": 100.0,
                "fm": {"next_buy": "2026-01-16T00:00Z", "next_sell": "2026-01-21T00:00Z",
                       "phase": "decline", "period_bars": 20.0, "agreement": 0.8}}
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "ledger.jsonl"
            self.assertTrue(ledger.record(p, "BTC", view))
            self.assertFalse(ledger.record(p, "BTC", view))  # same bar twice -> one line
            s = ledger.score(ledger.load(p), {("BTC", "1d"): df})["1d"]
        # trough at index 15 = Jan 16 (hit); peak at index 25 = Jan 26, Jan 21 is 5 days off (miss)
        self.assertEqual((s["buy_n"], s["buy_hits"]), (1, 1))
        self.assertEqual((s["sell_n"], s["sell_hits"]), (1, 0))


class HeadToHeadTests(unittest.TestCase):
    def test_judge_hit_miss_pending(self):
        n = 120
        times = pd.date_range("2026-01-01", periods=n, freq="h", tz="UTC")
        close = 100 + 10 * np.sin(2 * np.pi * np.arange(n) / 20)  # troughs at 15, 35, 55, ...
        df = pd.DataFrame({"time": times, "close": close})
        as_of = times[30]
        iso = lambda i: times[i].strftime("%Y-%m-%dT%H:%MZ")
        hit = headtohead._judge(df, as_of, "buy", iso(36))
        self.assertEqual((hit["status"], hit["error_bars"]), ("hit", -1))
        self.assertEqual(headtohead._judge(df, as_of, "buy", iso(45))["status"], "miss")
        self.assertEqual(headtohead._judge(df, as_of, "buy", iso(117))["status"], "pending")


class ConsensusTests(unittest.TestCase):
    def _cons(self, troughs, periods):
        per = [{"to_trough": np.array([float(t)]), "period": np.array([float(p)])} for t, p in zip(troughs, periods)]
        return {k: (v[0] if isinstance(v, np.ndarray) else v) for k, v in fm_engine.consensus(per).items()}

    def test_buy_and_sell_half_a_cycle_apart(self):
        c = self._cons([9, 10, 11, 10, 12], [38, 40, 40, 42, 40])
        self.assertAlmostEqual(c["to_trough"], 10, delta=0.6)
        self.assertAlmostEqual(c["to_peak"] - c["to_trough"], c["period"] / 2, places=9)
        self.assertLess(c["rising_vote"], 0.5)  # trough comes first: declining
        self.assertGreater(c["agreement"], 0.95)

    def test_wraps_around_the_trough(self):
        # two methods say "trough just passed", two say "trough about to come": a plain median
        # of the offsets would put the trough half a cycle away; the circular mean puts it now
        c = self._cons([1, 2, 39, 38], [40, 40, 40, 40])
        self.assertTrue(c["to_trough"] < 1 or c["to_trough"] > 39)
        self.assertAlmostEqual(c["to_peak"], 20, delta=1.5)

    def test_disagreement_lowers_agreement(self):
        c = self._cons([5, 15, 25, 35], [40, 40, 40, 40])
        self.assertLess(c["agreement"], 0.1)


class GearboxTests(unittest.TestCase):
    def _view(self, trend, phase, z=0.0):
        return {"trend": {"direction": trend}, "zone": {"z": z},
                "fm": {"rising_vote": 1.0 if phase == "growth" else 0.0, "phase": phase,
                       "next_buy": "B", "next_sell": "S"}}

    def test_aligned_growth(self):
        g = forecast.gearbox({tf: self._view("up", "growth") for tf in forecast.TF_ORDER})
        self.assertEqual((g["bias"], g["agreement"], g["higher_tf_phase"]), ("growth", "Strong", "growth"))
        self.assertTrue(g["four_hour_confirms"])
        self.assertEqual(g["one_hour_entry"], "B")

    def test_conflict_is_weak(self):
        views = {"1w": self._view("up", "growth"), "1d": self._view("down", "decline"),
                 "4h": self._view("up", "decline"), "1h": self._view("down", "growth")}
        g = forecast.gearbox(views)
        self.assertEqual(g["higher_tf_phase"], "mixed")
        self.assertIsNone(g["one_hour_entry"])
        self.assertIn(g["agreement"], ("Weak", "Moderate"))


if __name__ == "__main__":
    unittest.main()
