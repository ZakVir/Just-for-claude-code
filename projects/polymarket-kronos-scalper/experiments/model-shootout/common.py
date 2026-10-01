"""Shared helpers for the Kronos vs TimesFM 3 shootout.

Data: Binance BTCUSDT klines from the public market-data mirror
(data-api.binance.vision; api.binance.com is geo-blocked from this host).
Polymarket's crypto markets settle on Chainlink BTC/USD, so BTCUSDT is a close
proxy, not the settlement source.
"""

from __future__ import annotations

import math
import sys
import time
from pathlib import Path
from statistics import NormalDist

import numpy as np
import pandas as pd
import requests

HERE = Path(__file__).resolve().parent
VENDOR = HERE.parent.parent / "vendor"
BINANCE = "https://data-api.binance.vision/api/v3/klines"
INTERVAL_MS = {"1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000}
_N = NormalDist()


# --------------------------------------------------------------------------
# Data
# --------------------------------------------------------------------------
def fetch_klines(
    interval: str,
    end_ms: int | None = None,
    limit: int = 1000,
    symbol: str = "BTCUSDT",
) -> pd.DataFrame:
    """Closed candles only, oldest first, ending at or before ``end_ms``."""
    params = {"symbol": symbol, "interval": interval, "limit": limit}
    if end_ms is not None:
        params["endTime"] = end_ms
    for attempt in range(4):
        try:
            r = requests.get(BINANCE, params=params, timeout=20)
            r.raise_for_status()
            break
        except requests.RequestException:
            if attempt == 3:
                raise
            time.sleep(2 ** (attempt + 1))
    rows = r.json()
    df = pd.DataFrame(
        rows,
        columns=[
            "open_time", "open", "high", "low", "close", "volume", "close_time",
            "amount", "trades", "taker_base", "taker_quote", "ignore",
        ],
    )
    for c in ("open", "high", "low", "close", "volume", "amount"):
        df[c] = df[c].astype(float)
    df["timestamps"] = pd.to_datetime(df["open_time"], unit="ms", utc=True)
    now_ms = int(time.time() * 1000)
    df = df[df["close_time"] < now_ms]  # drop the still-forming candle
    if end_ms is not None:
        df = df[df["close_time"] <= end_ms]
    return df[["timestamps", "open_time", "close_time", "open", "high", "low",
               "close", "volume", "amount"]].reset_index(drop=True)


def fetch_history(interval: str, start_ms: int, end_ms: int) -> pd.DataFrame:
    """Paginate backwards to cover [start_ms, end_ms]."""
    frames, cursor = [], end_ms
    while True:
        df = fetch_klines(interval, end_ms=cursor, limit=1000)
        if df.empty:
            break
        frames.append(df)
        first = int(df["open_time"].iloc[0])
        if first <= start_ms:
            break
        cursor = first - 1
    out = pd.concat(frames).drop_duplicates("open_time").sort_values("open_time")
    out = out[out["open_time"] >= start_ms]
    return out.reset_index(drop=True)


def future_index(last_open: pd.Timestamp, interval: str, steps: int) -> pd.Series:
    step = pd.Timedelta(milliseconds=INTERVAL_MS[interval])
    return pd.Series([last_open + step * (i + 1) for i in range(steps)])


# --------------------------------------------------------------------------
# Kronos
# --------------------------------------------------------------------------
def load_kronos(model_name: str = "NeoQuasar/Kronos-base"):
    sys.path.insert(0, str(VENDOR / "Kronos"))
    from model import Kronos, KronosPredictor, KronosTokenizer  # noqa: E402

    tok = KronosTokenizer.from_pretrained("NeoQuasar/Kronos-Tokenizer-base")
    mdl = Kronos.from_pretrained(model_name)
    return KronosPredictor(mdl, tok, device="cpu", max_context=512)


def kronos_paths(
    predictor,
    ctx: pd.DataFrame,
    interval: str,
    pred_len: int,
    n_paths: int,
    T: float = 1.0,
    top_p: float = 0.9,
) -> np.ndarray:
    """n_paths independent sampled close paths, shape (n_paths, pred_len).

    Kronos' predict(sample_count=N) returns the MEAN of N paths, which hides
    the distribution, so we batch the same series N times with
    sample_count=1 instead.
    """
    cols = ["open", "high", "low", "close", "volume", "amount"]
    x_ts = ctx["timestamps"].reset_index(drop=True)
    y_ts = future_index(x_ts.iloc[-1], interval, pred_len)
    outs = predictor.predict_batch(
        [ctx[cols].reset_index(drop=True)] * n_paths,
        [x_ts] * n_paths,
        [y_ts] * n_paths,
        pred_len=pred_len,
        T=T,
        top_p=top_p,
        sample_count=1,
        verbose=False,
    )
    return np.stack([o["close"].to_numpy() for o in outs])


# --------------------------------------------------------------------------
# TimesFM 3
# --------------------------------------------------------------------------
QUANTILE_LEVELS = np.arange(1, 10) / 10.0  # TimesFM 3 returns deciles 0.1..0.9


def load_timesfm3():
    from timesfm3 import TimesFM3Forecaster

    return TimesFM3Forecaster.from_pretrained("google/timesfm-3.0-pytorch", device="cpu")


def timesfm_forecast(model, closes: np.ndarray, horizon: int):
    """Point forecast (h,) and decile quantiles (h, 9) for one series."""
    out = next(
        iter(
            model.predict_batch(
                [np.asarray(closes, dtype=np.float32)],
                horizon=horizon,
                return_quantiles=True,
            )
        )
    )
    return np.asarray(out.forecast)[:horizon], np.asarray(out.quantiles)[:horizon]


# --------------------------------------------------------------------------
# Probabilities and scoring
# --------------------------------------------------------------------------
def p_up_from_paths(final_prices: np.ndarray, ref: float) -> float:
    """Share of sampled paths ending above ``ref`` (Jeffreys-smoothed)."""
    k = float(np.sum(final_prices > ref))
    return (k + 0.5) / (len(final_prices) + 1.0)


def p_up_from_quantiles(q: np.ndarray, ref: float) -> float:
    """P(final > ref) from deciles via a normal fit (median, 10-90 spread)."""
    mu = float(q[4])
    sigma = float(q[8] - q[0]) / (2 * _N.inv_cdf(0.9))
    if sigma <= 0:
        return 1.0 if mu > ref else 0.0
    return 1.0 - _N.cdf((ref - mu) / sigma)


def brier(p: float, outcome_up: bool) -> float:
    return (p - (1.0 if outcome_up else 0.0)) ** 2


def log_loss(p: float, outcome_up: bool, eps: float = 1e-6) -> float:
    p = min(max(p, eps), 1 - eps)
    return -math.log(p if outcome_up else 1 - p)
