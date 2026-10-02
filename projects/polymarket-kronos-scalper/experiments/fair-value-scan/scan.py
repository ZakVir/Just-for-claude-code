"""Read-only scan: live Polymarket BTC ladders vs Deribit-implied fair value.

Usage: ../model-shootout/.venv/bin/python scan.py

Prices three live Polymarket families off Deribit's BTC option smile:
  * monthly touch  ("What price will Bitcoin hit in <month>")   -> touch_prob
  * weekly touch   ("What price will Bitcoin hit <week>")       -> touch_prob
  * daily "above"  ("Bitcoin above ___ on <date>", noon ET)     -> skew digital
and reports the gap to Polymarket's bid/ask after taker fees. Risk-neutral
fair values; see the caveats printed with the report. No orders are placed.
"""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import requests

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "reference"))
import pricing as pr  # noqa: E402
from edge_math import taker_fee_per_share  # noqa: E402

GAMMA = "https://gamma-api.polymarket.com/events"
DERIBIT = "https://www.deribit.com/api/v2/public/get_book_summary_by_currency"
BINANCE = "https://data-api.binance.vision/api/v3/klines"
ET = ZoneInfo("America/New_York")
YEAR = 365.0 * 24 * 3600
BASIS = 0.00043  # Binance BTCUSDT trades ~4.3 bp above the USD index (measured)


def deribit_smiles() -> tuple[dict, float]:
    rows = requests.get(DERIBIT, params={"currency": "BTC", "kind": "option"}, timeout=30).json()["result"]
    smiles: dict[float, dict] = {}
    index = None
    for r in rows:
        _, exp, k, typ = r["instrument_name"].split("-")
        iv, fwd = r.get("mark_iv"), r.get("underlying_price")
        if not iv or not fwd:
            continue
        t_exp = datetime.strptime(exp, "%d%b%y").replace(hour=8, tzinfo=timezone.utc).timestamp()
        k = float(k)
        otm = (typ == "C" and k >= fwd) or (typ == "P" and k < fwd)
        if not otm:
            continue
        s = smiles.setdefault(t_exp, {"fwd": fwd, "k": [], "iv": []})
        s["k"].append(k)
        s["iv"].append(iv / 100.0)
        index = r.get("estimated_delivery_price", index)
    for s in smiles.values():
        order = np.argsort(s["k"])
        s["k"], s["iv"] = np.array(s["k"])[order], np.array(s["iv"])[order]
    return smiles, float(index)


def vol_at(smiles: dict, t_target: float, k: float, now: float) -> tuple[float, float, float]:
    """(sigma, dsigma/dK, forward) at strike k and time t_target."""
    exps = sorted(e for e in smiles if e > now + 600)
    lo = max([e for e in exps if e <= t_target], default=exps[0])
    hi = min([e for e in exps if e >= t_target], default=exps[-1])

    def smile(e: float, kk: float) -> float:
        s = smiles[e]
        return float(np.interp(kk, s["k"], s["iv"]))

    def sig(kk: float) -> float:
        if lo == hi:
            return smile(lo, kk)
        T, T1, T2 = (t_target - now) / YEAR, (lo - now) / YEAR, (hi - now) / YEAR
        return pr.interp_vol(T, T1, smile(lo, kk), T2, smile(hi, kk))

    h = k * 0.005
    fwd = smiles[lo]["fwd"] if lo == hi else float(np.interp(
        t_target, [lo, hi], [smiles[lo]["fwd"], smiles[hi]["fwd"]]))
    return sig(k), (sig(k + h) - sig(k - h)) / (2 * h), fwd


def binance_extremes(since: float) -> tuple[float, float]:
    """Highest high / lowest low of BTCUSDT 1m candles since ``since``."""
    hi, lo, start = -1.0, 1e18, int(since * 1000)
    while True:
        rows = requests.get(BINANCE, params={"symbol": "BTCUSDT", "interval": "1m",
                                             "startTime": start, "limit": 1000}, timeout=20).json()
        if not rows:
            break
        hi = max(hi, max(float(r[2]) for r in rows))
        lo = min(lo, min(float(r[3]) for r in rows))
        if len(rows) < 1000:
            break
        start = rows[-1][0] + 60_000
    return hi, lo


def edges(q: float, bid: float, ask: float) -> dict:
    """Taker edge (per share) of buying YES at ask, or NO at 1-bid."""
    yes_cost = ask + taker_fee_per_share(min(max(ask, 0.001), 0.999))
    no_px = 1.0 - bid
    no_cost = no_px + taker_fee_per_share(min(max(no_px, 0.001), 0.999))
    return {"yes_taker_edge": round(q - yes_cost, 4), "no_taker_edge": round((1 - q) - no_cost, 4)}


def main() -> None:
    now = time.time()
    today = datetime.now(ET)
    smiles, index = deribit_smiles()
    month = today.strftime("%B").lower()
    jobs = [
        ("monthly touch", f"what-price-will-bitcoin-hit-in-{month}-{today.year}"),
        ("daily above", f"bitcoin-above-on-{(today + timedelta(days=1)).strftime('%B').lower()}-"
                        f"{(today + timedelta(days=1)).day}-{(today + timedelta(days=1)).year}"),
    ]
    # current Mon-Sun week touch market (slug uses month-day ranges)
    mon = (today - timedelta(days=today.weekday())).date()
    sun = mon + timedelta(days=6)
    if mon.month == sun.month:
        wk = f"what-price-will-bitcoin-hit-{mon.strftime('%B').lower()}-{mon.day}-{sun.day}-{sun.year}"
    else:
        wk = (f"what-price-will-bitcoin-hit-{mon.strftime('%B').lower()}-{mon.day}-"
              f"{sun.strftime('%B').lower()}-{sun.day}-{sun.year}")
    jobs.append(("weekly touch", wk))

    out = {"generated": datetime.now(timezone.utc).isoformat(), "deribit_index": index,
           "assumptions": {"basis_binance_over_index": BASIS, "touch_vol": "smile IV at barrier, skew-consistent (2x digital) adjustment",
                           "probabilities": "risk-neutral, zero rates"}, "families": {}}
    for family, slug in jobs:
        ev = requests.get(GAMMA, params={"slug": slug}, timeout=20).json()
        if not ev:
            out["families"][family] = {"slug": slug, "error": "not found"}
            continue
        e = ev[0]
        t_end = datetime.fromisoformat(e["endDate"].replace("Z", "+00:00")).timestamp()
        rows = []
        if "touch" in family:
            start = datetime.fromisoformat(e["startDate"].replace("Z", "+00:00")).timestamp() \
                if family == "weekly touch" else datetime(today.year, today.month, 1, tzinfo=ET).timestamp()
            if family == "weekly touch":
                start = datetime(mon.year, mon.month, mon.day, tzinfo=ET).timestamp()
            hi, lo = binance_extremes(start)
        for m in e["markets"]:
            if m.get("closed") or m.get("bestBid") is None or m.get("bestAsk") is None:
                continue
            bid, ask = float(m["bestBid"]), float(m["bestAsk"])
            title = (m.get("groupItemTitle") or "").replace(",", "")
            try:
                k = float(title.replace("↑", "").replace("↓", "").strip())
            except ValueError:
                continue
            T = (t_end - now) / YEAR
            if "touch" in family:
                up = "↓" not in title
                if (up and hi >= k) or (not up and lo <= k):
                    continue  # already touched; resolves YES
                k_index = k / (1 + BASIS)
                sig, slope, fwd = vol_at(smiles, t_end, k_index, now)
                q = pr.touch_prob_skew(index, fwd, k_index, sig, T, slope)
                band = (pr.touch_prob_skew(index, fwd, k_index, max(sig - 0.03, 0.05), T, slope),
                        pr.touch_prob_skew(index, fwd, k_index, sig + 0.03, T, slope))
            else:
                k_index = k / (1 + BASIS)
                sig, slope, fwd = vol_at(smiles, t_end, k_index, now)
                q = pr.digital_prob_with_skew(fwd, k_index, sig, T, slope)
                band = (pr.digital_prob_with_skew(fwd, k_index, max(sig - 0.03, 0.05), T, slope),
                        pr.digital_prob_with_skew(fwd, k_index, sig + 0.03, T, slope))
                up = True
            rows.append({"strike": k, "dir": "up" if up else "down", "bid": bid, "ask": ask,
                         "mid": round((bid + ask) / 2, 4), "fair": round(q, 4),
                         "fair_band_iv_pm3": [round(min(band), 4), round(max(band), 4)],
                         "iv": round(sig, 4), "mid_minus_fair": round((bid + ask) / 2 - q, 4),
                         **edges(q, bid, ask)})
        rows.sort(key=lambda r: (r["dir"], r["strike"]))
        out["families"][family] = {"slug": slug, "end": e["endDate"], "rows": rows}

    res = HERE / "results"
    res.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%MZ")
    (res / f"scan_{stamp}.json").write_text(json.dumps(out, indent=1))

    lines = [f"# Polymarket BTC ladders vs Deribit-implied fair value ({out['generated']})", "",
             f"Deribit index {index:,.0f}. Fair = risk-neutral probability from the Deribit smile "
             "(touch: barrier IV with skew-consistent adjustment; daily: skew-adjusted digital), Binance basis +4.3 bp. "
             "Edges are per $1 share after taker fees; positive = buy at the quoted price.", ""]
    for fam, blk in out["families"].items():
        lines += [f"## {fam} — `{blk.get('slug')}`", ""]
        if "rows" not in blk:
            lines += [f"_{blk.get('error')}_", ""]
            continue
        lines += ["| strike | dir | bid | ask | IV | fair | fair (IV±3) | mid−fair | YES taker edge | NO taker edge |",
                  "|---:|:-:|---:|---:|---:|---:|:-:|---:|---:|---:|"]
        for r in blk["rows"]:
            lines.append(f"| {r['strike']:,.0f} | {r['dir']} | {r['bid']:.3f} | {r['ask']:.3f} | "
                         f"{r['iv']:.1%} | {r['fair']:.3f} | {r['fair_band_iv_pm3'][0]:.3f}–{r['fair_band_iv_pm3'][1]:.3f} | "
                         f"{r['mid_minus_fair']:+.3f} | {r['yes_taker_edge']:+.3f} | {r['no_taker_edge']:+.3f} |")
        lines.append("")
    (res / f"scan_{stamp}.md").write_text("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
