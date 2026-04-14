"""
PROMPT 6 — Construct Excess Returns
=====================================
Compute holding-period excess bond returns and assemble the regression dataset
used in the ACM step.

Intuition
---------
For a bond with maturity τ held for one period (day), the excess return is
approximately:

    rx_t(τ) ≈ y_{t}(τ) - y_{t-1}(τ-1) - r_t

where:
    y_t(τ)     — yield at time t of maturity τ
    y_{t-1}(τ-1) — yield one period later of a bond that has aged by one day
    r_t        — risk-free short rate (MYOR overnight)

For discrete tenor panels we approximate this as:

    rx_t+1(τ) = -duration(τ) * Δy_{t+1}(τ)  - r_t * dt

i.e. the return is driven by price appreciation (via duration) minus the
carry cost at the overnight rate.

Simplified discrete approximation used here
-------------------------------------------
    excess_return_t+1 = [y_t(τ) - y_t+1(τ)] * duration(τ) - r_t / 252

This produces a vector of excess returns across tenors for each day t.

The regression dataset is then:
    rxmat ~ constant + X_t-1 (lagged PCA factors) + epsilon_t (VAR residuals)
"""

import numpy as np
import pandas as pd


# ---------------------------------------------------------------------------
# Duration approximation (modified duration for zero-coupon bond)
# ---------------------------------------------------------------------------

def modified_duration(maturity_months: int, yield_pct: float = 3.0) -> float:
    """Approximate modified duration of a zero-coupon bond.

    For a zero-coupon bond: ModDur ≈ τ / (1 + y * τ / 2)  (semi-annual).
    This gives duration in *years*.

    Parameters
    ----------
    maturity_months : int
        Bond maturity in months.
    yield_pct : float
        Approximate yield level in % (used to compute the denominator).

    Returns
    -------
    float
        Modified duration in years.
    """
    tau_years = maturity_months / 12.0
    y_decimal = yield_pct / 100.0
    return tau_years / (1.0 + y_decimal * tau_years / 2.0)


# ---------------------------------------------------------------------------
# Excess return computation
# ---------------------------------------------------------------------------

def compute_excess_returns(yield_matrix: pd.DataFrame,
                            short_rate: pd.Series,
                            tenors_months: list[int] | None = None,
                            dt: float = 1 / 252) -> pd.DataFrame:
    """Compute one-period ahead excess holding-period returns.

    rx_{t+1}(τ) = duration(τ) * [y_t(τ) - y_{t+1}(τ)] - r_t * dt

    where dt = 1/252 (one business day as a fraction of a year).

    Parameters
    ----------
    yield_matrix : pd.DataFrame
        Shape (T × M) — yield curve matrix with columns like 'y_1m', 'y_3m'.
    short_rate : pd.Series
        Daily overnight rate in %, aligned to the same DatetimeIndex.
    tenors_months : list of int or None
        Maturity of each column in months.  Inferred from column names if None.
    dt : float
        Time step in years (default 1/252 for daily data).

    Returns
    -------
    pd.DataFrame
        Shape ((T-1) × M) — daily excess returns (in %).
        Index corresponds to t+1 (forward-looking, aligned to next day).
    """
    if tenors_months is None:
        # Parse from column names like 'y_3m' → 3
        tenors_months = [
            int(c.replace("y_", "").replace("m", ""))
            for c in yield_matrix.columns
        ]

    # Align short rate to yield_matrix index
    r_t = short_rate.reindex(yield_matrix.index).ffill()

    # Yield changes: Δy_{t+1} = y_{t+1} - y_t  (one-period forward difference)
    dy = yield_matrix.diff(1).shift(-1)   # shift(-1): align Δy to t, not t+1

    # Compute duration for each tenor using the average yield as a rough proxy
    durations = {col: modified_duration(tau, yield_matrix[col].mean())
                 for col, tau in zip(yield_matrix.columns, tenors_months)}

    rx_dict = {}
    for col, tau_m in zip(yield_matrix.columns, tenors_months):
        dur       = durations[col]
        # Price appreciation component (negative because price falls when yield rises)
        price_app = -dur * dy[col]
        # Carry cost: overnight rate × dt
        carry     = r_t * dt
        rx_dict[col] = price_app - carry

    rx = pd.DataFrame(rx_dict, index=yield_matrix.index)
    rx.columns = [f"rx_{c.replace('y_','')}" for c in yield_matrix.columns]

    # Drop the last row (no future yield available) and leading NaN row
    rx = rx.dropna()
    return rx


# ---------------------------------------------------------------------------
# Regression dataset assembly
# ---------------------------------------------------------------------------

def build_regression_dataset(excess_returns: pd.DataFrame,
                              factors_df: pd.DataFrame,
                              var_residuals: pd.DataFrame) -> dict:
    """Align excess returns, lagged factors, and VAR residuals into one table.

    The ACM regression for each tenor τ is:

        rx_{t+1}(τ) = a(τ) + b(τ)' * X_t + c(τ)' * epsilon_t + u_{t+1}(τ)

    where:
        X_t         — PCA factors at time t  (lagged predictors)
        epsilon_t   — VAR innovations at time t

    Alignment logic:
        - X_t and epsilon_t are at time t (predictors).
        - rx_{t+1} is the excess return from t to t+1 (dependent variable).
        - We merge on the X_t / epsilon_t index and align rx one period forward.

    Parameters
    ----------
    excess_returns : pd.DataFrame
        Output of compute_excess_returns, indexed at t (the date the return
        is realised, i.e. t+1 in the holding-period sense).
    factors_df : pd.DataFrame
        PCA factors indexed at time t.
    var_residuals : pd.DataFrame
        VAR(1) residuals indexed at time t.

    Returns
    -------
    dict with keys:
        'y'          : pd.DataFrame — dependent variable (excess returns).
        'X'          : pd.DataFrame — regressors (const + X_t + epsilon_t).
        'dates'      : pd.DatetimeIndex — common aligned dates.
    """
    # Alignment strategy:
    #   rx[t] is the excess return realised between period t-1 and t.
    #   The predictor for rx[t] is X_{t-1} and epsilon_{t-1}.
    #   We achieve this by lagging the predictor panel by 1 position
    #   (i.e., shift(1) on the factor/residual DataFrames).

    # Build lagged predictor panel (shift down by 1 so row t holds t-1 values)
    X_t   = factors_df.add_prefix("f_").shift(1)
    eps_t = var_residuals.reindex(factors_df.index).add_prefix("e_").shift(1)

    regressors = pd.concat([X_t, eps_t], axis=1)
    regressors.insert(0, "const", 1.0)          # add constant

    # Drop the first row (NaN after shift) and any remaining NaN rows
    regressors = regressors.dropna()

    # Align excess returns to the same index (inner join on date)
    common = regressors.index.intersection(excess_returns.index)
    X_reg  = regressors.loc[common]
    y_reg  = excess_returns.loc[common]

    return dict(
        y=y_reg,
        X=X_reg,
        dates=common,
    )


# ---------------------------------------------------------------------------
# Main — smoke test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).parent))
    from _01_data_ingestion import generate_synthetic_data, merge_and_clean
    from _02_myor_term_rate import add_myor_3m_to_df
    from _03_yield_curve_proxy import build_yield_curve_matrix
    from _04_pca_factors import extract_pca_factors
    from _05_var_model import estimate_var

    print("=== Module 06: Construct Excess Returns ===\n")

    klibor_raw, myor_raw = generate_synthetic_data()
    merged = merge_and_clean(klibor_raw, myor_raw)
    merged = add_myor_3m_to_df(merged)
    curve  = build_yield_curve_matrix(merged).dropna()
    pca    = extract_pca_factors(curve, n_components=3)
    Xt     = pca["factors"]
    var    = estimate_var(Xt, lag_order=1)

    # Compute excess returns
    short_rate = merged.reindex(curve.index)["myor"]
    rx = compute_excess_returns(curve, short_rate)
    print(f"Excess returns shape: {rx.shape}")
    print("\nDescriptive statistics:")
    print(rx.describe())

    # Build regression dataset
    reg = build_regression_dataset(rx, Xt, var["residuals"])
    print(f"\nRegression dataset:")
    print(f"  y shape: {reg['y'].shape}")
    print(f"  X shape: {reg['X'].shape}")
    print(f"  Columns in X: {list(reg['X'].columns)}")
    print("\nFirst 3 rows of X:")
    print(reg["X"].head(3))
    print("\nFirst 3 rows of y:")
    print(reg["y"].head(3))
