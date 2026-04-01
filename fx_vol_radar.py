"""
FX Volatility & Cross-Asset Correlation Radar
==============================================
Pulls live prices from Yahoo Finance (v8 REST API, no yfinance needed).
Falls back to built-in realistic synthetic data when the network is
unavailable (sandboxed environments, offline use, CI/CD).

Usage:
    python fx_vol_radar.py           # auto (live → demo fallback)
    python fx_vol_radar.py --demo    # force demo mode
    python fx_vol_radar.py --live    # force live mode (fails loudly if no net)

Dependencies:
    pip install pandas numpy tabulate scipy requests
"""

import sys
import warnings
import time
import argparse
import requests
import numpy as np
import pandas as pd
from tabulate import tabulate
from datetime import datetime, timedelta, timezone

warnings.filterwarnings("ignore")

# ── CONFIG ────────────────────────────────────────────────────────────────────

LOOKBACK_DAYS   = 90      # history window
VOL_WINDOW      = 20      # rolling window for realized vol (trading days)
HIGH_VOL_THRESH = 10.0    # annualised % → "HIGH" vol flag
ESC_CORR_THRESH = 0.30    # avg |corr| threshold for escalation label

FX_PAIRS = {
    "AUD/USD": "AUDUSD=X",
    "USD/JPY": "JPY=X",
    "EUR/USD": "EURUSD=X",
    "USD/CAD": "CAD=X",
    "GBP/USD": "GBPUSD=X",
    "USD/CNH": "CNH=X",
    "USD/MXN": "MXN=X",
    "USD/BRL": "BRL=X",
    "USD/ZAR": "ZAR=X",
    "USD/TRY": "TRY=X",
}

CROSS_ASSETS = {
    "WTI Oil":    "CL=F",
    "Gold":       "GC=F",
    "VIX":        "^VIX",
    "S&P 500":    "^GSPC",
    "US 10Y Yld": "^TNX",
    "DXY":        "DX-Y.NYB",
    "EM ETF":     "EEM",
}

RISK_OFF_ASSETS = ["VIX", "WTI Oil", "Gold"]
RISK_ON_ASSETS  = ["S&P 500", "EM ETF"]

# ── YAHOO FINANCE DIRECT FETCH ────────────────────────────────────────────────

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}


def _fetch_one(symbol: str, label: str, days: int) -> pd.Series:
    end_ts   = int(datetime.now(timezone.utc).timestamp())
    start_ts = int((datetime.now(timezone.utc) - timedelta(days=days + 15)).timestamp())
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        f"?interval=1d&period1={start_ts}&period2={end_ts}&events=history"
    )
    r      = requests.get(url, headers=HEADERS, timeout=15)
    r.raise_for_status()
    data   = r.json()
    result = data["chart"]["result"][0]
    ts     = result["timestamp"]
    closes = result["indicators"]["quote"][0]["close"]
    s = pd.Series(
        closes,
        index=pd.to_datetime(ts, unit="s", utc=True).tz_convert(None).normalize(),
        name=label,
    )
    return s.dropna().sort_index().tail(days)


def fetch_live(ticker_map: dict, days: int) -> pd.DataFrame:
    """Fetch all tickers from Yahoo Finance. Returns DataFrame or raises."""
    series = {}
    for label, symbol in ticker_map.items():
        print(f"    {label:14s} ({symbol})")
        s = _fetch_one(symbol, label, days)
        if not s.empty:
            series[label] = s
        time.sleep(0.5)
    if not series:
        raise RuntimeError("All fetches failed.")
    return pd.DataFrame(series).dropna(how="all")


# ── SYNTHETIC DEMO DATA ───────────────────────────────────────────────────────
# Calibrated to realistic current-market vol levels and correlation regimes.

_DEMO_PARAMS = {
    # (annual_drift, annual_vol, start_price)
    "AUD/USD": ( 0.00, 0.085,  0.6550),
    "USD/JPY": ( 0.00, 0.090, 151.50),
    "EUR/USD": ( 0.00, 0.075,  1.0820),
    "USD/CAD": ( 0.00, 0.070,  1.3600),
    "GBP/USD": ( 0.00, 0.080,  1.2650),
    "USD/CNH": ( 0.00, 0.040,  7.2400),
    "USD/MXN": ( 0.00, 0.130, 17.0000),
    "USD/BRL": ( 0.00, 0.180,  5.0000),
    "USD/ZAR": ( 0.00, 0.140, 18.5000),
    "USD/TRY": ( 0.00, 0.220, 32.0000),
    "WTI Oil":  ( 0.00, 0.280, 82.0000),
    "Gold":     ( 0.00, 0.120, 2320.00),
    "VIX":      ( 0.00, 0.600, 18.0000),
    "S&P 500":  ( 0.00, 0.160, 5200.00),
    "US 10Y Yld":( 0.00, 0.120,  4.30),
    "DXY":      ( 0.00, 0.060, 104.50),
    "EM ETF":   ( 0.00, 0.180, 42.00),
}

# Approximate correlation blocks: risk-off pairs correlate with VIX/Oil/Gold,
# risk-on pairs correlate inversely.
_CORR_BLOCK = {
    # FX pair → (corr with VIX, corr with Oil, corr with Gold, corr with SPX)
    "AUD/USD":    (-0.55,  0.45,  0.30,  0.60),
    "USD/JPY":    ( 0.30, -0.20,  0.10, -0.25),
    "EUR/USD":    (-0.30,  0.20,  0.25,  0.35),
    "USD/CAD":    ( 0.25, -0.55,  0.05, -0.20),
    "GBP/USD":    (-0.25,  0.15,  0.20,  0.30),
    "USD/CNH":    ( 0.40, -0.20, -0.15, -0.40),
    "USD/MXN":    ( 0.60, -0.50, -0.10, -0.55),
    "USD/BRL":    ( 0.65, -0.45, -0.05, -0.60),
    "USD/ZAR":    ( 0.70, -0.40,  0.05, -0.65),
    "USD/TRY":    ( 0.75, -0.30, -0.10, -0.60),
}


def _correlated_returns(n: int, rng: np.random.Generator,
                        base_vol: float, vix_ret: np.ndarray,
                        oil_ret: np.ndarray, gold_ret: np.ndarray,
                        spx_ret: np.ndarray,
                        corr_vix: float, corr_oil: float,
                        corr_gold: float, corr_spx: float) -> np.ndarray:
    """Generate returns correlated with the four macro anchors."""
    idio    = rng.standard_normal(n) * base_vol / np.sqrt(252)
    contrib = (corr_vix  * vix_ret  +
               corr_oil  * oil_ret  +
               corr_gold * gold_ret +
               corr_spx  * spx_ret)
    # Weight idio vs systematic (rough decomposition)
    total_sys_var = corr_vix**2 + corr_oil**2 + corr_gold**2 + corr_spx**2
    idio_weight   = max(0.0, 1.0 - total_sys_var) ** 0.5
    return idio * idio_weight + contrib * (1 - idio_weight)


def generate_demo_data(days: int = LOOKBACK_DAYS) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (fx_prices, cross_prices) with synthetic but realistic data."""
    rng   = np.random.default_rng(42)
    n     = days
    dates = pd.bdate_range(end=pd.Timestamp.today().normalize(), periods=n)

    # Generate cross-asset series first (independent GBM)
    cross_series: dict[str, np.ndarray] = {}
    for label in ["WTI Oil", "Gold", "VIX", "S&P 500", "US 10Y Yld", "DXY", "EM ETF"]:
        _, ann_vol, s0 = _DEMO_PARAMS[label]
        daily_vol  = ann_vol / np.sqrt(252)
        log_rets   = rng.standard_normal(n) * daily_vol
        prices     = s0 * np.exp(np.cumsum(log_rets))
        cross_series[label] = prices

    cross_rets = {k: np.diff(np.log(v), prepend=np.log(v[0]))
                  for k, v in cross_series.items()}

    # Generate FX series correlated with cross-asset anchors
    fx_series: dict[str, np.ndarray] = {}
    for label, (_, ann_vol, s0) in _DEMO_PARAMS.items():
        if label in cross_series:
            continue
        cv, co, cg, cs = _CORR_BLOCK.get(label, (0.0, 0.0, 0.0, 0.0))
        log_rets = _correlated_returns(
            n, rng, ann_vol,
            cross_rets["VIX"],  cross_rets["WTI Oil"],
            cross_rets["Gold"], cross_rets["S&P 500"],
            cv, co, cg, cs,
        )
        prices = s0 * np.exp(np.cumsum(log_rets))
        fx_series[label] = prices

    fx_df    = pd.DataFrame({k: v for k, v in fx_series.items()},  index=dates)
    cross_df = pd.DataFrame({k: v for k, v in cross_series.items()}, index=dates)
    return fx_df, cross_df


# ── VOL & CORRELATION CALCULATIONS ───────────────────────────────────────────

def realized_vol(prices: pd.Series, window: int = VOL_WINDOW) -> pd.Series:
    log_ret = np.log(prices / prices.shift(1))
    return log_ret.rolling(window).std() * np.sqrt(252) * 100


def vol_summary(fx_prices: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for pair in fx_prices.columns:
        s = fx_prices[pair].dropna()
        if len(s) < VOL_WINDOW + 5:
            continue
        rv       = realized_vol(s)
        latest   = rv.iloc[-1]
        avg_30   = rv.iloc[-30:].mean()
        avg_60   = rv.iloc[-60:].mean() if len(rv) >= 60 else float("nan")
        trend    = "Rising " if latest > avg_30 else "Falling"
        regime   = "HIGH" if latest > HIGH_VOL_THRESH else "LOW"
        rows.append({
            "FX Pair":       pair,
            "RV Latest (%)": round(latest, 2),
            "RV 30d Avg":    round(avg_30, 2),
            "RV 60d Avg":    round(avg_60, 2) if not np.isnan(avg_60) else "-",
            "Vol Trend":     trend,
            "Vol Regime":    regime,
        })
    return pd.DataFrame(rows).sort_values("RV Latest (%)", ascending=False)


def build_corr_matrix(fx_prices: pd.DataFrame,
                      cross_prices: pd.DataFrame) -> pd.DataFrame:
    all_prices = pd.concat([fx_prices, cross_prices], axis=1).dropna()
    returns    = np.log(all_prices / all_prices.shift(1)).dropna()
    return returns.corr()


def regime_scores(corr_matrix: pd.DataFrame,
                  fx_vol_df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for _, row in fx_vol_df.iterrows():
        pair = row["FX Pair"]
        if pair not in corr_matrix.index:
            continue

        esc_corrs  = [abs(corr_matrix.loc[pair, a])
                      for a in RISK_OFF_ASSETS if a in corr_matrix.columns]
        desc_corrs = [abs(corr_matrix.loc[pair, a])
                      for a in RISK_ON_ASSETS  if a in corr_matrix.columns]

        esc_score  = round(np.mean(esc_corrs)  if esc_corrs  else 0.0, 3)
        desc_score = round(np.mean(desc_corrs) if desc_corrs else 0.0, 3)

        if esc_score >= desc_score and row["Vol Regime"] == "HIGH":
            macro_regime = "ESCALATION"
        elif desc_score > esc_score and row["Vol Regime"] == "LOW":
            macro_regime = "DE-ESCALATION"
        elif esc_score >= ESC_CORR_THRESH:
            macro_regime = "ESCALATION (vol-lagged)"
        else:
            macro_regime = "MIXED / TRANSITIONAL"

        rows.append({
            "FX Pair":      pair,
            "RV (%)":       row["RV Latest (%)"],
            "Vol Regime":   row["Vol Regime"],
            "Esc Score":    esc_score,
            "DeEsc Score":  desc_score,
            "Macro Regime": macro_regime,
        })

    return pd.DataFrame(rows).sort_values("Esc Score", ascending=False)


# ── STRATEGY LOOKUP ───────────────────────────────────────────────────────────

STRATEGIES = {
    ("ESCALATION", "HIGH"): [
        "Buy put spreads — downside convexity, defined risk",
        "Sell OTM call spreads — collect premium, cap upside",
        "Risk reversal: buy downside put / sell topside call",
        "Long straddle → fade vol sell after initial spike",
    ],
    ("ESCALATION", "LOW"): [
        "Buy cheap OTM strangles — gamma play into event risk",
        "Buy 1-week ATM straddle — binary risk event",
        "Calendar spread: sell front / buy back month (long vega)",
    ],
    ("DE-ESCALATION", "HIGH"): [
        "Short straddle / strangle — fade vol crush",
        "Sell OTM puts — high premium, declining downside demand",
        "Ratio call spread: buy 1 / sell 2 (fund with excess premium)",
        "Short variance swap equivalent — theta collection",
    ],
    ("DE-ESCALATION", "LOW"): [
        "Sell iron condors — range-bound, theta collection",
        "Buy call spreads on risk-on pairs (AUD/USD, EM FX)",
        "Calendar spread: sell near / buy far (carry theta, own vol term)",
    ],
}


def get_strategies(macro_regime: str, vol_regime: str) -> list:
    base = "ESCALATION" if "ESCALATION" in macro_regime else "DE-ESCALATION"
    return STRATEGIES.get((base, vol_regime),
                          ["No specific strategy mapped for this regime"])


# ── MAIN ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="FX Vol & Correlation Radar")
    group  = parser.add_mutually_exclusive_group()
    group.add_argument("--demo", action="store_true", help="Force demo mode")
    group.add_argument("--live", action="store_true", help="Force live data mode")
    args = parser.parse_args()

    print("\n" + "=" * 72)
    print("  FX VOLATILITY & CROSS-ASSET CORRELATION RADAR")
    print(f"  Run date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 72)

    # ── data acquisition
    use_demo = args.demo
    if not use_demo and not args.live:
        # Auto-detect: probe with a quick connectivity check
        try:
            requests.get("https://query1.finance.yahoo.com", timeout=5, headers=HEADERS)
            use_demo = False
        except Exception:
            use_demo = True

    if use_demo:
        print("\n  [INFO] Using built-in synthetic demo data")
        print("         (run with no flags when network is available for live data)\n")
        fx_prices, cross_prices = generate_demo_data(LOOKBACK_DAYS)
    else:
        print("\n[1/2] Fetching FX pair prices (live)...")
        try:
            fx_prices = fetch_live(FX_PAIRS, LOOKBACK_DAYS)
        except Exception as e:
            print(f"  [ERROR] {e}")
            sys.exit(1)

        print("\n[2/2] Fetching cross-asset prices (live)...")
        try:
            cross_prices = fetch_live(CROSS_ASSETS, LOOKBACK_DAYS)
        except Exception as e:
            print(f"  [ERROR] {e}")
            sys.exit(1)

    # ── realized vol
    vol_df = vol_summary(fx_prices)

    print("\n── REALIZED VOLATILITY SUMMARY ──────────────────────────────────────")
    print(tabulate(vol_df, headers="keys", tablefmt="rounded_outline",
                   showindex=False))

    # ── correlation matrix
    corr_matrix   = build_corr_matrix(fx_prices, cross_prices)
    macro_anchors = [a for a in CROSS_ASSETS if a in corr_matrix.columns]
    fx_labels     = [p for p in FX_PAIRS     if p in corr_matrix.index]

    if macro_anchors and fx_labels:
        corr_display = corr_matrix.loc[fx_labels, macro_anchors].round(3)
        print("\n── CROSS-ASSET CORRELATION MATRIX ───────────────────────────────────")
        print(tabulate(
            corr_display.reset_index().rename(columns={"index": "FX Pair"}),
            headers="keys", tablefmt="rounded_outline", showindex=False,
        ))

    # ── regime classification
    regime_df = regime_scores(corr_matrix, vol_df)

    print("\n── MACRO REGIME CLASSIFICATION ──────────────────────────────────────")
    print(tabulate(regime_df, headers="keys", tablefmt="rounded_outline",
                   showindex=False))

    # ── strategies
    print("\n── STRATEGY RECOMMENDATIONS ─────────────────────────────────────────")
    strat_rows = []
    for _, row in regime_df.iterrows():
        for s in get_strategies(row["Macro Regime"], row["Vol Regime"])[:2]:
            strat_rows.append({
                "FX Pair":  row["FX Pair"],
                "Regime":   row["Macro Regime"],
                "Vol":      row["Vol Regime"],
                "Strategy": s,
            })
    print(tabulate(strat_rows, headers="keys", tablefmt="rounded_outline",
                   showindex=False))

    # ── headline summary
    esc_pairs  = regime_df[regime_df["Macro Regime"].str.contains("ESCALATION")]
    desc_pairs = regime_df[regime_df["Macro Regime"] == "DE-ESCALATION"]

    print("\n── TOP ESCALATION CANDIDATES ────────────────────────────────────────")
    if not esc_pairs.empty:
        for _, r in esc_pairs.head(3).iterrows():
            print(f"  {r['FX Pair']:12s}  RV={r['RV (%)']:5.2f}%  "
                  f"EscScore={r['Esc Score']:.3f}  Regime={r['Vol Regime']}")
    else:
        print("  None flagged under current conditions.")

    print("\n── TOP DE-ESCALATION CANDIDATES ─────────────────────────────────────")
    if not desc_pairs.empty:
        for _, r in desc_pairs.head(3).iterrows():
            print(f"  {r['FX Pair']:12s}  RV={r['RV (%)']:5.2f}%  "
                  f"DeEscScore={r['DeEsc Score']:.3f}  Regime={r['Vol Regime']}")
    else:
        print("  None flagged under current conditions.")

    print("\n" + "=" * 72)
    print("  Legend:")
    print("  Esc Score   = avg |corr| with VIX, WTI Oil, Gold (risk-off)")
    print("  DeEsc Score = avg |corr| with S&P 500, EM ETF   (risk-on)")
    print("  Vol Regime  = HIGH if 20-day realized vol > 10% annualised")
    print("  Data        :", "DEMO (synthetic)" if use_demo else "LIVE (Yahoo Finance)")
    print("=" * 72 + "\n")


if __name__ == "__main__":
    main()
