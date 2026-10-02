"""FM module (cycle turn dates), per-timeframe view, and the multi-timeframe gearbox."""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

import cycles as cy
import fm_engine as fe
import scoring
import signals

TF_ORDER = ["1w", "1d", "4h", "1h"]
CHART_BARS = 120
CONE_STEPS = {"1w": [4, 8, 13], "1d": [7, 14, 30], "4h": [6, 18, 42], "1h": [6, 24, 72]}
LIVE_BARS = 900  # enough warm-up for every estimator; full history only for backtests


def _iso(ts: pd.Timestamp) -> str:
    return ts.strftime("%Y-%m-%dT%H:%MZ")


def run_methods(close: np.ndarray) -> tuple[list[dict], dict]:
    logc = np.log(close)
    per = [fe.method_arrays(logc, m) for m in fe.ALL_METHODS]
    return per, fe.consensus(per)


def analyze(df: pd.DataFrame, tf: str, with_backtest: bool = False) -> dict:
    """Everything the app shows for one asset and timeframe."""
    step = pd.Timedelta(milliseconds=int(df["close_time"].iloc[-1] - df["open_time"].iloc[-1] + 1))
    full = df.reset_index(drop=True)
    live = full if with_backtest else full.tail(LIVE_BARS).reset_index(drop=True)
    close = live["close"].to_numpy()
    per, cons = run_methods(close)
    t = len(close) - 1
    last_open = live["time"].iloc[t]
    out: dict = {"tf": tf, "as_of": _iso(last_open + step), "last_bar_open": _iso(last_open),
                 "bar_ms": int(step.total_seconds() * 1000), "close": float(close[t])}

    # ---- FM: consensus turn dates and each estimator's view
    if cons["valid"][t]:
        h_buy = max(1, int(round(cons["to_trough"][t])))
        h_sell = max(1, int(round(cons["to_peak"][t])))
        out["fm"] = {
            "next_buy": _iso(last_open + step * h_buy), "bars_to_buy": h_buy,
            "next_sell": _iso(last_open + step * h_sell), "bars_to_sell": h_sell,
            "phase": "growth" if cons["rising_vote"][t] > 0.5 else "decline",
            "rising_vote": float(cons["rising_vote"][t]),
            "period_bars": float(cons["period"][t]),
            "agreement": float(cons["agreement"][t]),
            "methods": [
                {"name": name,
                 "buy": _iso(last_open + step * max(1, int(round(m["to_trough"][t])))),
                 "sell": _iso(last_open + step * max(1, int(round(m["to_peak"][t])))),
                 "period": float(m["period"][t])}
                for name, m in zip(fe.ALL_METHODS, per) if np.isfinite(m["to_trough"][t])],
        }
    else:
        out["fm"] = None

    # ---- TREND and VOL
    d, level = signals.trend_trail(live["high"].to_numpy(), live["low"].to_numpy(), close)
    flips = np.where(np.diff(d) != 0)[0]
    out["trend"] = {"direction": "up" if d[t] > 0 else "down", "trail": float(level[t]),
                    "bars_since_flip": int(t - (flips[-1] + 1)) if len(flips) else None}
    out["zone"] = signals.sigma_zone(close)
    vol = signals.ewma_vol(close)
    out["cone"] = signals.cone(float(close[t]), vol, CONE_STEPS[tf])
    out["vol_per_bar"] = vol

    # ---- chart: last CHART_BARS closes, trail and its direction, cycle wave, projection
    k = min(CHART_BARS, len(close))
    filt = cy.roofing_filter(np.log(close), fe.LG_HIGH, fe.LG_LOW)
    chart = {"t": [_iso(x) for x in live["time"].iloc[-k:]], "close": [float(x) for x in close[-k:]],
             "trail": [float(x) for x in level[-k:]], "dir": [int(x) for x in d[-k:]],
             "wave": [float(x) * 100 for x in filt[-k:]]}
    if out["fm"]:
        # One sine at the consensus period, phased so its trough lands on the consensus
        # BUY and its crest on the SELL; the amplitude comes from a fit to recent cycles.
        p = out["fm"]["period_bars"]
        seg = filt[-int(2 * p):]
        m = len(seg)
        w = 2 * math.pi / p
        X = np.column_stack([np.cos(w * np.arange(m)), np.sin(w * np.arange(m)), np.ones(m)])
        a, b, c0 = np.linalg.lstsq(X, seg, rcond=None)[0]
        amp, to_tr = math.hypot(a, b), float(cons["to_trough"][t])
        horizon = int(math.ceil(1.5 * p))
        wave = [c0 - amp * math.cos(w * (h - to_tr)) for h in range(horizon + 1)]
        chart["proj_t"] = [_iso(last_open + step * h) for h in range(1, horizon + 1)]
        chart["proj_wave"] = [x * 100 for x in wave[1:]]
        # the same cycle laid over price: where price would go if only the cycle moved
        chart["proj_price"] = [float(close[t] * math.exp(x - wave[0])) for x in wave[1:]]
    out["chart"] = chart

    if with_backtest:
        out["backtest"] = scoring.backtest(close, cons["to_trough"], cons["to_peak"],
                                           (cons["rising_vote"] > 0.5).astype(float), cons["valid"])
        trough, peak = scoring.pivots(close)
        out["backtest"]["chance_buy"] = scoring.chance_rate(trough)
        out["backtest"]["from"] = _iso(live["time"].iloc[int(np.argmax(cons["valid"]))])
    return out


WEIGHTS = {"trend": 1.3, "cycle": 1.0, "stretch": 0.7}
TF_WEIGHT = {"1w": 1.5, "1d": 1.25, "4h": 1.0, "1h": 0.75}


def gearbox(views: dict[str, dict]) -> dict:
    """Combine timeframes the way the cascade reads: 1W/1D set the phase, 4H confirms, 1H times entry.

    The score measures how much the modules agree with each other. It is not a
    probability; the backtests found no reliable accuracy gain from agreement.
    """
    def tf_score(v: dict) -> dict:
        trend = 1.0 if v["trend"]["direction"] == "up" else -1.0
        cyc = (v["fm"]["rising_vote"] - 0.5) * 2 if v.get("fm") else 0.0
        stretch = -max(-1.0, min(1.0, v["zone"]["z"] / 2))  # stretched high leans against growth
        return {"trend": trend, "cycle": cyc, "stretch": stretch}

    parts = {tf: tf_score(v) for tf, v in views.items()}
    total_w = sum(TF_WEIGHT[tf] for tf in parts) * sum(WEIGHTS.values())
    score = sum(TF_WEIGHT[tf] * sum(WEIGHTS[k] * s[k] for k in WEIGHTS) for tf, s in parts.items()) / total_w
    strength = abs(score)
    label = ("Strong" if strength >= 0.6 else "Moderate" if strength >= 0.3 else "Weak")
    bias = "growth" if score > 0.05 else "decline" if score < -0.05 else "none"

    def phase(tf: str) -> str | None:
        v = views.get(tf)
        if not v or not v.get("fm"):
            return None
        return v["fm"]["phase"]

    hi = [phase("1w"), phase("1d")]
    hi_phase = hi[0] if hi[0] == hi[1] else "mixed"
    confirm = phase("4h") == hi_phase if hi_phase != "mixed" else False
    entry = None
    v1h = views.get("1h")
    if hi_phase in ("growth", "decline") and confirm and v1h and v1h.get("fm"):
        entry = v1h["fm"]["next_buy"] if hi_phase == "growth" else v1h["fm"]["next_sell"]
    return {"score": round(score, 3), "bias": bias, "agreement": label, "higher_tf_phase": hi_phase,
            "four_hour_confirms": confirm, "one_hour_entry": entry, "parts": parts}
