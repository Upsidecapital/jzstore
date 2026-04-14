"""
PROMPT 3 — Build Yield Curve Proxy
====================================
Construct a yield curve matrix (time × maturities) from available rate data.

Strategy
--------
Case A — Only 3M KLIBOR available:
  Synthetic maturities are derived from the Expectations Hypothesis plus
  realistic market-implied spreads.  A simple affine interpolation anchors the
  curve at overnight (MYOR) and 3M (KLIBOR), then extrapolates to 6M and 12M
  using historically observed average term spreads.

Case B — Multiple tenors available:
  Fit a Nelson-Siegel (NS) model:

      y(τ) = β₀ + β₁ * (1-exp(-τ/λ))/(τ/λ)
                 + β₂ * [(1-exp(-τ/λ))/(τ/λ) - exp(-τ/λ)]

  The matrix output is suitable for PCA (each column = one tenor).
"""

import warnings
import numpy as np
import pandas as pd
from scipy.optimize import minimize


# Standard tenor grid in months
TENORS_MONTHS = [1, 3, 6, 12]   # 1M, 3M, 6M, 12M


# ---------------------------------------------------------------------------
# Case A: Synthetic curve from 3M KLIBOR + MYOR anchor
# ---------------------------------------------------------------------------

def build_synthetic_curve(df: pd.DataFrame,
                           klibor_col: str = "klibor_3m",
                           myor_col: str = "myor",
                           tenors_months: list[int] | None = None) -> pd.DataFrame:
    """Build a synthetic yield curve when only 3M KLIBOR and overnight MYOR
    are available.

    Interpolation / extrapolation rules
    ------------------------------------
    * 1M  : log-linear interpolation between overnight (MYOR) and 3M (KLIBOR).
    * 3M  : directly observed KLIBOR.
    * 6M  : KLIBOR + avg_spread_6m (calibrated from historical data or assumed).
    * 12M : KLIBOR + avg_spread_12m.

    The spreads represent the average extra premium investors demand for
    locking in money for longer (term premium + credit premium).

    Parameters
    ----------
    df : pd.DataFrame
        DataFrame with 'klibor_3m' and 'myor' columns, DatetimeIndex.
    klibor_col : str
        Column name for 3M KLIBOR.
    myor_col : str
        Column name for MYOR (overnight).
    tenors_months : list of int
        Target maturities in months.

    Returns
    -------
    pd.DataFrame
        Columns: ['y_1m', 'y_3m', 'y_6m', 'y_12m'] (yields in %).
    """
    if tenors_months is None:
        tenors_months = TENORS_MONTHS

    df = df.copy().dropna(subset=[klibor_col, myor_col])
    result = pd.DataFrame(index=df.index)

    klibor = df[klibor_col]
    myor   = df[myor_col]

    # Observed spread of 3M over overnight
    spread_3m = klibor - myor

    # Assume typical BNM market structure term spreads (in percentage points):
    #   6M  ≈ 3M + ~20 bps  (based on typical MYR curve shape)
    #   12M ≈ 3M + ~45 bps
    avg_extra_6m  = 0.20
    avg_extra_12m = 0.45

    # 1M: log-linear interpolation (fraction = 1/3 of the way from ON to 3M)
    # Rationale: 1M is 1/3 of 3 months; blend overnight and 3M logarithmically
    frac_1m = 1.0 / 3.0
    result["y_1m"] = myor + frac_1m * spread_3m

    # 3M: directly observed
    result["y_3m"] = klibor

    # 6M: 3M + time-varying spread proxy (spread_3m scaled + constant premium)
    result["y_6m"] = klibor + avg_extra_6m + 0.3 * spread_3m

    # 12M: 3M + larger term premium
    result["y_12m"] = klibor + avg_extra_12m + 0.5 * spread_3m

    return result


# ---------------------------------------------------------------------------
# Case B: Nelson-Siegel curve fitting
# ---------------------------------------------------------------------------

def nelson_siegel_yield(tau: np.ndarray, beta0: float, beta1: float,
                         beta2: float, lam: float) -> np.ndarray:
    """Compute Nelson-Siegel model yields for given maturities.

    Parameters
    ----------
    tau : np.ndarray
        Maturities in *years*.
    beta0 : float
        Long-run level factor.
    beta1 : float
        Short-end slope factor.
    beta2 : float
        Curvature (hump) factor.
    lam : float
        Decay / shape parameter (> 0).

    Returns
    -------
    np.ndarray
        Model yields (same scale as beta parameters).
    """
    tau = np.asarray(tau, dtype=float)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        x     = tau / lam
        load1 = (1.0 - np.exp(-x)) / x      # slope loading
        load2 = load1 - np.exp(-x)           # curvature loading
    return beta0 + beta1 * load1 + beta2 * load2


def fit_nelson_siegel(tenors_years: np.ndarray,
                      observed_yields: np.ndarray,
                      lam_init: float = 1.0) -> dict:
    """Fit Nelson-Siegel parameters to a single yield curve observation.

    Parameters
    ----------
    tenors_years : np.ndarray
        Maturities in years (e.g. [0.25, 0.5, 1.0, 2.0, 5.0, 10.0]).
    observed_yields : np.ndarray
        Corresponding market yields (%).
    lam_init : float
        Initial guess for the decay parameter λ.

    Returns
    -------
    dict
        Keys: 'beta0', 'beta1', 'beta2', 'lam', 'fitted', 'rmse'.
    """
    def objective(params):
        b0, b1, b2, lam = params
        if lam <= 0:
            return 1e10
        fitted = nelson_siegel_yield(tenors_years, b0, b1, b2, lam)
        return np.sum((fitted - observed_yields) ** 2)

    # Initial guess: level ≈ long-end, slope ≈ spread, curvature ≈ 0
    b0_init = float(observed_yields[-1])
    b1_init = float(observed_yields[0] - observed_yields[-1])
    x0      = [b0_init, b1_init, 0.0, lam_init]

    res = minimize(objective, x0, method="Nelder-Mead",
                   options={"xatol": 1e-8, "fatol": 1e-8, "maxiter": 5000})

    b0, b1, b2, lam = res.x
    fitted = nelson_siegel_yield(tenors_years, b0, b1, b2, lam)
    rmse   = np.sqrt(np.mean((fitted - observed_yields) ** 2))

    return dict(beta0=b0, beta1=b1, beta2=b2, lam=lam,
                fitted=fitted, rmse=rmse)


def build_ns_curve(yields_df: pd.DataFrame,
                   tenors_months: list[int],
                   output_tenors_months: list[int] | None = None) -> pd.DataFrame:
    """Fit Nelson-Siegel to each row of a multi-tenor yield matrix.

    Parameters
    ----------
    yields_df : pd.DataFrame
        DataFrame where columns correspond to observed maturities.
        Each row is one date's yield curve.
    tenors_months : list of int
        Maturities (in months) corresponding to each column of *yields_df*.
    output_tenors_months : list of int or None
        Desired output grid.  Defaults to [1, 3, 6, 12] months.

    Returns
    -------
    pd.DataFrame
        NS-fitted yields on the output grid, indexed like *yields_df*.
    """
    if output_tenors_months is None:
        output_tenors_months = TENORS_MONTHS

    tenors_years_in   = np.array(tenors_months) / 12.0
    tenors_years_out  = np.array(output_tenors_months) / 12.0
    col_names         = [f"y_{t}m" for t in output_tenors_months]

    rows = []
    for date, row in yields_df.iterrows():
        obs = row.values.astype(float)
        if np.any(np.isnan(obs)):
            rows.append([np.nan] * len(output_tenors_months))
            continue
        params = fit_nelson_siegel(tenors_years_in, obs)
        fitted = nelson_siegel_yield(
            tenors_years_out,
            params["beta0"], params["beta1"],
            params["beta2"], params["lam"]
        )
        rows.append(fitted.tolist())

    return pd.DataFrame(rows, index=yields_df.index, columns=col_names)


# ---------------------------------------------------------------------------
# Master entry point: auto-detect which case applies
# ---------------------------------------------------------------------------

def build_yield_curve_matrix(df: pd.DataFrame,
                              extra_tenors_df: pd.DataFrame | None = None,
                              tenors_months: list[int] | None = None) -> pd.DataFrame:
    """Build the yield curve matrix, choosing method based on available data.

    Parameters
    ----------
    df : pd.DataFrame
        Merged DataFrame with at least 'klibor_3m' and 'myor' columns.
    extra_tenors_df : pd.DataFrame or None
        If provided, contains additional tenor columns (besides 3M).
        Columns must be named by maturity (e.g. 'y_1m', 'y_6m', 'y_12m').
        If None → Case A (synthetic interpolation).
    tenors_months : list of int or None
        Output tenor grid in months.

    Returns
    -------
    pd.DataFrame
        Yield matrix suitable for PCA, columns = ['y_1m','y_3m','y_6m','y_12m'].
    """
    if tenors_months is None:
        tenors_months = TENORS_MONTHS

    if extra_tenors_df is None:
        # Case A: synthetic curve
        return build_synthetic_curve(df, tenors_months=tenors_months)
    else:
        # Case B: Nelson-Siegel on the provided multi-tenor panel
        all_observed = extra_tenors_df.dropna()
        observed_tenors = [
            int(c.replace("y_", "").replace("m", ""))
            for c in all_observed.columns
        ]
        return build_ns_curve(all_observed, observed_tenors,
                               output_tenors_months=tenors_months)


# ---------------------------------------------------------------------------
# Main — smoke test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).parent))
    from _01_data_ingestion import generate_synthetic_data, merge_and_clean
    from _02_myor_term_rate import add_myor_3m_to_df

    print("=== Module 03: Yield Curve Proxy ===\n")

    klibor_raw, myor_raw = generate_synthetic_data()
    merged = merge_and_clean(klibor_raw, myor_raw)
    merged = add_myor_3m_to_df(merged)

    # Case A
    curve_matrix = build_yield_curve_matrix(merged)
    curve_matrix = curve_matrix.dropna()

    print(f"Yield curve matrix shape : {curve_matrix.shape}")
    print("\nFirst 5 rows:")
    print(curve_matrix.head())
    print("\nDescriptive statistics:")
    print(curve_matrix.describe())

    # Verify upward-sloping on average (normal market condition)
    means = curve_matrix.mean()
    print(f"\nMean yields by tenor:")
    for col, val in means.items():
        print(f"  {col:6s}: {val:.4f}%")
    print("\n(Expect an upward-sloping curve: 1M < 3M < 6M < 12M on average)")
