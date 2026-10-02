"""Do confidence filters make cycle dates better? Discovery vs validation split.

Usage: ../model-shootout/.venv/bin/python confidence_fm.py

Pre-registered candidate rules for the ensemble (median of 6 estimators):
  all        every forecast
  agree      estimator agreement in the top third (threshold set on discovery half)
  trend      BUY dates only in a SuperTrend uptrend, SELL dates only in a downtrend
  agree+trend
Each rule is scored on the first half of the history (discovery) and, without
changes, on the second half (validation), against the same forecasts with
scrambled timing. Trading: long while the consensus says "rising" (and the rule
passes), 0.1% fee per side, vs buy-and-hold and scrambled timing.
"""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "model-shootout"))
import common as c  # noqa: E402

import fm_engine as fe  # noqa: E402
from backtest_fm import PIVOT, TIMEFRAMES, date_hits, pivots, trade  # noqa: E402

c.INTERVAL_MS.setdefault("1d", 86_400_000)
c.INTERVAL_MS.setdefault("4h", 14_400_000)
SHIFTS = 300
RNG = np.random.default_rng(11)


def score_half(lo, hi, cons, mask_buy, mask_sell, trough, peak, ret, per_year):
    sl = slice(lo, hi)
    n = hi - lo
    tr = np.nan_to_num(cons["to_trough"][sl])
    pk = np.nan_to_num(cons["to_peak"][sl])
    mb, ms = mask_buy[sl], mask_sell[sl]
    th, pkm = trough[sl], peak[sl]
    rising = (cons["rising_vote"][sl] > 0.5).astype(float)
    pos = np.where(mb | ms, rising, 0.0) if mb is not ms else rising * mb

    def stats(trv, pkv, mbv, msv, posv):
        b = date_hits(trv, mbv, th)
        s = date_hits(pkv, msv, pkm)
        return np.nanmean(b), np.nanmean(s), trade(posv, ret[sl], per_year)["log_return"]

    buy, sell, lr = stats(tr, pk, mb, ms, pos)
    base = np.array([stats(np.roll(tr, k), np.roll(pk, k), np.roll(mb, k), np.roll(ms, k), np.roll(pos, k))
                     for k in RNG.integers(100, n - 100, SHIFTS)])
    return {
        "n_buy_forecasts": int(np.isfinite(date_hits(tr, mb, th)).sum()),
        "buy_hit": float(buy), "buy_scrambled": float(np.nanmean(base[:, 0])),
        "buy_p": float(np.mean(base[:, 0] >= buy)),
        "sell_hit": float(sell), "sell_scrambled": float(np.nanmean(base[:, 1])),
        "sell_p": float(np.mean(base[:, 1] >= sell)),
        "long_logret": float(lr), "long_p": float(np.mean(base[:, 2] >= lr)),
        "hold_logret": float(trade(np.ones(n), ret[sl], per_year)["log_return"]),
    }


def main() -> None:
    now_ms = int(time.time() * 1000)
    out = {"generated": datetime.now(timezone.utc).isoformat(), "results": {}}
    for tf, (span_s, per_year) in TIMEFRAMES.items():
        df = c.fetch_history(tf, now_ms - int(span_s * 1000), now_ms)
        hi_, lo_, cl = (df[k].to_numpy() for k in ("high", "low", "close"))
        logc = np.log(cl)
        t0 = time.time()
        cons = fe.consensus([fe.method_arrays(logc, m) for m in fe.ALL_METHODS])
        st = fe.supertrend(hi_, lo_, cl)
        trough, peak = pivots(cl)
        ret = np.concatenate([[0.0], np.diff(logc)])
        valid = cons["valid"]
        first = int(np.argmax(valid))
        mid = first + (len(cl) - first) // 2
        thr = np.nanquantile(cons["agreement"][first:mid], 2 / 3)  # set on discovery only
        agree = valid & (cons["agreement"] >= thr)
        rules = {
            "all": (valid, valid),
            "agree": (agree, agree),
            "trend": (valid & (st > 0), valid & (st < 0)),
            "agree+trend": (agree & (st > 0), agree & (st < 0)),
        }
        out["results"][tf] = {"agreement_threshold": float(thr), "bars": len(cl) - first,
                              "discovery": f"{df['timestamps'].iloc[first]} -> {df['timestamps'].iloc[mid - 1]}",
                              "validation": f"{df['timestamps'].iloc[mid]} -> {df['timestamps'].iloc[-1]}",
                              "rules": {}}
        for name, (mb, ms) in rules.items():
            out["results"][tf]["rules"][name] = {
                "discovery": score_half(first, mid, cons, mb, ms, trough, peak, ret, per_year),
                "validation": score_half(mid, len(cl) - PIVOT, cons, mb, ms, trough, peak, ret, per_year),
            }
            v = out["results"][tf]["rules"][name]["validation"]
            d = out["results"][tf]["rules"][name]["discovery"]
            print(f"{tf} {name:12} DISC buy {d['buy_hit']:.1%}/{d['buy_scrambled']:.1%} p={d['buy_p']:.2f} "
                  f"long p={d['long_p']:.2f} | VAL buy {v['buy_hit']:.1%}/{v['buy_scrambled']:.1%} "
                  f"p={v['buy_p']:.2f} sell {v['sell_hit']:.1%}/{v['sell_scrambled']:.1%} p={v['sell_p']:.2f} "
                  f"long {v['long_logret']:+.2f} p={v['long_p']:.2f} hold {v['hold_logret']:+.2f}", flush=True)
        print(f"  ({time.time() - t0:.0f}s)", flush=True)
    (HERE / "results" / "fm_confidence.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
