"""Build Turnpoint: forecasts for every asset/timeframe -> data JSON -> the app page.

Usage (from projects/turnpoint):
  python engine/build.py              # live forecasts, ledger, reuse cached backtests
  python engine/build.py --backtest   # also recompute the walk-forward backtests (slow)

Reads data/rivals.json (hand-entered calls from other tools) for the head-to-head.
Writes data/turnpoint.json, appends data/ledger.jsonl, caches data/backtest.json,
and renders app/turnpoint.html from app/template.html.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import data  # noqa: E402
import forecast  # noqa: E402
import headtohead  # noqa: E402
import ledger  # noqa: E402

DATA = ROOT / "data"
BACKTEST_TFS = ["1d", "4h", "1h"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backtest", action="store_true")
    ap.add_argument("--assets", default=",".join(data.ASSETS))
    a = ap.parse_args()
    DATA.mkdir(exist_ok=True)
    bt_path = DATA / "backtest.json"
    backtests = json.loads(bt_path.read_text()) if bt_path.exists() else {}
    ledger_path = DATA / "ledger.jsonl"

    out = {"generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "assets": {}}
    frames = {}
    for asset in a.assets.split(","):
        views = {}
        for tf in forecast.TF_ORDER:
            t0 = time.time()
            df = data.candles(asset, tf)
            frames[(asset, tf)] = df
            do_bt = a.backtest and tf in BACKTEST_TFS
            v = forecast.analyze(df, tf, with_backtest=do_bt)
            if do_bt:
                backtests.setdefault(asset, {})[tf] = {**v.pop("backtest"), "computed": out["generated"]}
            views[tf] = v
            ledger.record(ledger_path, asset, v)
            print(f"{asset} {tf}: {len(df)} bars, next BUY {v['fm']['next_buy'] if v['fm'] else '-'} "
                  f"SELL {v['fm']['next_sell'] if v['fm'] else '-'} ({time.time() - t0:.0f}s)", flush=True)
        out["assets"][asset] = {"price": views["1h"]["close"], "views": views,
                                "gearbox": forecast.gearbox(views), "backtest": backtests.get(asset, {})}
    if a.backtest:
        bt_path.write_text(json.dumps(backtests, indent=1))
    out["ledger"] = {"entries": len(ledger.load(ledger_path)),
                     "first": (ledger.load(ledger_path) or [{}])[0].get("logged"),
                     "scores": ledger.score(ledger.load(ledger_path), frames)}
    out["head_to_head"] = headtohead.evaluate(DATA / "rivals.json", frames)
    out["rules"] = {"pivot_bars": 5, "hit_window_bars": 2, "random_baseline": "same forecasts, timing scrambled",
                    "estimators": ["Ehlers DFT", "Detrended FFT", "MESA/MAMA", "Pearson autocorrelation",
                                   "DFT (lastguru)", "Phase accumulation"]}
    (DATA / "turnpoint.json").write_text(json.dumps(out, indent=1))
    template = (ROOT / "app" / "template.html").read_text()
    (ROOT / "app" / "turnpoint.html").write_text(
        template.replace("/*__TURNPOINT_DATA__*/null", json.dumps(out, separators=(",", ":"))))
    print("wrote data/turnpoint.json and app/turnpoint.html")


if __name__ == "__main__":
    main()
