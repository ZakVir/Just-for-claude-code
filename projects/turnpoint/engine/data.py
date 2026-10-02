"""Closed Binance candles (public market-data mirror; no key needed)."""

from __future__ import annotations

import time

import pandas as pd
import requests

BASE = "https://data-api.binance.vision/api/v3/klines"
ASSETS = {"BTC": "BTCUSDT", "ETH": "ETHUSDT", "SOL": "SOLUSDT", "XRP": "XRPUSDT"}
INTERVAL_MS = {"1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000, "1w": 604_800_000}
# how much history each timeframe loads (bars): enough for the estimators and the backtest
HISTORY_BARS = {"1w": 1000, "1d": 3200, "4h": 4400, "1h": 4400}


def _get(params: dict) -> list:
    for attempt in range(5):
        try:
            r = requests.get(BASE, params=params, timeout=20)
            r.raise_for_status()
            return r.json()
        except requests.RequestException:
            if attempt == 4:
                raise
            time.sleep(2 ** attempt)
    return []


def candles(asset: str, interval: str, bars: int | None = None) -> pd.DataFrame:
    """Oldest-first closed candles for an asset ('BTC'...) and interval."""
    bars = bars or HISTORY_BARS[interval]
    now_ms = int(time.time() * 1000)
    rows: list = []
    end = now_ms
    while len(rows) < bars:
        chunk = _get({"symbol": ASSETS[asset], "interval": interval, "limit": 1000, "endTime": end})
        if not chunk:
            break
        rows = chunk + rows
        if len(chunk) < 1000:
            break
        end = chunk[0][0] - 1
    df = pd.DataFrame(rows, columns=["open_time", "open", "high", "low", "close", "volume", "close_time",
                                     "qv", "n", "tb", "tq", "ig"])
    df = df.drop_duplicates("open_time").sort_values("open_time")
    df = df[df["close_time"] < now_ms]  # drop the candle still forming
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = df[col].astype(float)
    df["time"] = pd.to_datetime(df["open_time"], unit="ms", utc=True)
    return df.tail(bars).reset_index(drop=True)[["time", "open_time", "close_time", "open", "high", "low",
                                                  "close", "volume"]]
