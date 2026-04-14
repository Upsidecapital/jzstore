"""
PROMPT 2 — Construct Risk-Free Term Rate from MYOR
====================================================
Converts the daily Malaysia Overnight Rate (MYOR) into a compounded
3-month equivalent rate using:

    ACT/365 day-count convention
    Rolling 90-day compounding window

Assumptions
-----------
* The overnight rate is the risk-free short rate (no credit risk).
* Each overnight period earns interest at rate r_t / 365 on an ACT/365 basis.
* The 3-month tenor is approximated as exactly 90 calendar days.
* Compounding is applied daily (like SORA or SOFR compounded-in-arrears):

        (1 + r_1/365) * (1 + r_2/365) * ... * (1 + r_90/365)  - 1

  then annualised:

        annualised_rate = compounded_return * (365 / 90)

* Forward-filled MYOR is used so every calendar day has a rate.
"""

import numpy as np
import pandas as pd


# ---------------------------------------------------------------------------
# Core computation
# ---------------------------------------------------------------------------

def compute_myor_3m_compounded(myor_series: pd.Series,
                                window: int = 90,
                                day_count: int = 365) -> pd.Series:
    """Compute the rolling 90-day compounded overnight rate (annualised).

    Parameters
    ----------
    myor_series : pd.Series
        Daily MYOR in *percentage* terms (e.g. 3.00 = 3.00 %).
        Should have a DatetimeIndex; missing values should already be
        forward-filled before calling this function.
    window : int
        Number of calendar days in the rolling window (default 90 ≈ 3 months).
    day_count : int
        Day-count basis denominator (365 for ACT/365).

    Returns
    -------
    pd.Series
        Rolling annualised 3-month compounded rate (in %, same scale as input).
        The first (window - 1) observations are NaN because the full rolling
        window is not yet available.

    Notes
    -----
    The compounding formula is:

        compound_factor_t = ∏_{i=0}^{window-1} (1 + r_{t-i} / (100 * day_count))

        compounded_return_t = compound_factor_t - 1

        annualised_rate_t   = compounded_return_t * (day_count / window) * 100
    """
    # Convert percentage → decimal for arithmetic
    r_decimal = myor_series / 100.0

    # Daily growth factors: (1 + r_i / day_count)
    daily_factors = 1.0 + r_decimal / day_count

    # Rolling product over `window` days using log-sum trick for numerical stability:
    #   ln(∏ factors) = Σ ln(factor_i)
    log_factors       = np.log(daily_factors)
    rolling_log_sum   = log_factors.rolling(window=window, min_periods=window).sum()
    compounded_return = np.exp(rolling_log_sum) - 1.0  # still in decimal

    # Annualise: compound return over 90 days → annualised rate
    #   rate_annual = compounded_return * (day_count / window)
    annualised = compounded_return * (day_count / window) * 100.0  # back to %

    annualised.name = "myor_3m_compounded"
    return annualised


# ---------------------------------------------------------------------------
# Convenience wrapper
# ---------------------------------------------------------------------------

def add_myor_3m_to_df(df: pd.DataFrame,
                       myor_col: str = "myor",
                       window: int = 90,
                       day_count: int = 365) -> pd.DataFrame:
    """Add the 'myor_3m_compounded' column to an existing merged DataFrame.

    Parameters
    ----------
    df : pd.DataFrame
        DataFrame containing at least a MYOR column (daily, forward-filled).
    myor_col : str
        Name of the MYOR column in *df*.
    window : int
        Rolling window in calendar days.
    day_count : int
        ACT/365 denominator.

    Returns
    -------
    pd.DataFrame
        Copy of *df* with an additional column 'myor_3m_compounded'.
    """
    df = df.copy()
    df["myor_3m_compounded"] = compute_myor_3m_compounded(
        df[myor_col], window=window, day_count=day_count
    )
    return df


# ---------------------------------------------------------------------------
# Main — quick smoke test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Import synthetic data generator from module 01
    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).parent))
    from _01_data_ingestion import generate_synthetic_data, merge_and_clean

    print("=== Module 02: Construct Risk-Free Term Rate from MYOR ===\n")

    klibor_raw, myor_raw = generate_synthetic_data()
    merged = merge_and_clean(klibor_raw, myor_raw)

    result = add_myor_3m_to_df(merged)

    print(f"Shape after adding myor_3m_compounded : {result.shape}")
    print(f"NaN count in myor_3m_compounded       : "
          f"{result['myor_3m_compounded'].isna().sum()} "
          f"(expected ~89 leading NaNs)")
    print("\nFirst 100 rows (head of first valid value):")
    first_valid = result.dropna()
    print(first_valid.head())
    print("\nDescriptive statistics:")
    print(result[["myor", "myor_3m_compounded"]].describe())

    # Spot check: compounded should be slightly above raw MYOR due to compounding
    avg_raw = result["myor"].mean()
    avg_cmp = result["myor_3m_compounded"].mean()
    print(f"\nAvg MYOR (raw overnight) : {avg_raw:.4f}%")
    print(f"Avg MYOR 3M compounded   : {avg_cmp:.4f}%")
    print("(compounded ≥ raw overnight due to interest-on-interest)")
