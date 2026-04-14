"""
PROMPT 7 — Run Time-Series Regression (ACM Step)
=================================================
Regress excess bond returns on:
    - a constant
    - lagged PCA factors  (X_t)
    - VAR residuals        (epsilon_t)

This is the key identification step in the Adrian-Crump-Moench (2013) model.
The regression pins down how *bond risk* is loaded onto the state variables.

Economic Interpretation
-----------------------
The coefficient on X_t (the PCA factors = level, slope, curvature) tells us
how much excess return compensation investors require per unit of exposure
to each factor shock.  Combined with the VAR dynamics this allows us to
back out the market price of risk (lambda) and separate the risk premium
component of yields from the expectations component.

Regression Model (per tenor τ):
    rx_{t+1}(τ) = a(τ) + b(τ)' * X_t + c(τ)' * epsilon_t + u_{t+1}(τ)

Where:
    a(τ)        — constant (unconditional average excess return)
    b(τ)        — loadings on lagged PCA factors
    c(τ)        — loadings on VAR innovations
    u_{t+1}(τ) — idiosyncratic regression residuals
"""

import numpy as np
import pandas as pd
from numpy.linalg import lstsq


# ---------------------------------------------------------------------------
# OLS regression (vectorised across all tenors)
# ---------------------------------------------------------------------------

def run_acm_regression(y: pd.DataFrame, X: pd.DataFrame) -> dict:
    """OLS regression of excess returns on lagged factors and VAR residuals.

    Parameters
    ----------
    y : pd.DataFrame
        Shape (T × M) — dependent variable matrix.
        Each column is excess returns for one tenor.
    X : pd.DataFrame
        Shape (T × K) — regressor matrix.
        Must include a constant column named 'const'.

    Returns
    -------
    dict with keys:
        'coef'       : pd.DataFrame (K × M) — OLS coefficients.
                       Rows = regressors, columns = tenors.
        'residuals'  : pd.DataFrame (T × M) — regression residuals u.
        'Sigma_u'    : pd.DataFrame (M × M) — covariance of residuals.
        'R2'         : pd.Series (M,)       — R² per tenor.
        'fitted'     : pd.DataFrame (T × M) — fitted values.
    """
    # Align on common index
    common = y.index.intersection(X.index)
    Y      = y.loc[common].values.astype(float)   # (T × M)
    Xmat   = X.loc[common].values.astype(float)   # (T × K)

    # Solve OLS: B = (X'X)^{-1} X'Y  (K × M)
    # lstsq is numerically stabler than matrix inversion
    B, _, _, _ = lstsq(Xmat, Y, rcond=None)

    fitted_vals = Xmat @ B                         # (T × M)
    residuals   = Y - fitted_vals                  # (T × M)

    # Residual covariance: Sigma_u = (1/(T-K)) * U'U
    T, K = Xmat.shape
    Sigma_u = (residuals.T @ residuals) / (T - K)

    # R² per tenor
    SS_res  = np.sum(residuals ** 2, axis=0)
    SS_tot  = np.sum((Y - Y.mean(axis=0)) ** 2, axis=0)
    R2      = 1.0 - SS_res / np.where(SS_tot == 0, np.nan, SS_tot)

    # Pack into DataFrames
    tenor_labels = y.columns.tolist()
    reg_labels   = X.columns.tolist()
    dates        = common

    coef_df    = pd.DataFrame(B, index=reg_labels, columns=tenor_labels)
    resid_df   = pd.DataFrame(residuals, index=dates, columns=tenor_labels)
    fitted_df  = pd.DataFrame(fitted_vals, index=dates, columns=tenor_labels)
    Sigma_df   = pd.DataFrame(Sigma_u, index=tenor_labels, columns=tenor_labels)
    R2_ser     = pd.Series(R2, index=tenor_labels, name="R2")

    return dict(
        coef=coef_df,
        residuals=resid_df,
        Sigma_u=Sigma_df,
        R2=R2_ser,
        fitted=fitted_df,
    )


# ---------------------------------------------------------------------------
# Convenience: extract a(τ) and b(τ) from the coefficient matrix
# ---------------------------------------------------------------------------

def parse_regression_output(coef_df: pd.DataFrame,
                              n_factors: int,
                              n_residuals: int) -> dict:
    """Split the regression coefficient matrix into interpretable sub-matrices.

    The regressor layout in X is:
        [const | f_PC1 ... f_PCK | e_PC1 ... e_PCK]

    Parameters
    ----------
    coef_df : pd.DataFrame
        Shape (K_total × M) — full coefficient matrix from run_acm_regression.
    n_factors : int
        Number of PCA factors (K).
    n_residuals : int
        Number of VAR residual columns (same K for VAR(1)).

    Returns
    -------
    dict with keys:
        'a'   : pd.Series  (M,) — intercepts.
        'b'   : pd.DataFrame (K × M) — loadings on lagged factors.
        'c'   : pd.DataFrame (K × M) — loadings on VAR residuals.
    """
    a     = coef_df.iloc[0]                            # const row
    b_end = 1 + n_factors
    b     = coef_df.iloc[1:b_end]                     # factor loadings
    c     = coef_df.iloc[b_end: b_end + n_residuals]  # residual loadings

    # Rename index for clarity
    b.index = [f"b_{r}" for r in b.index]
    c.index = [f"c_{r}" for r in c.index]

    return dict(a=a, b=b, c=c)


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
    from _06_excess_returns import compute_excess_returns, build_regression_dataset

    print("=== Module 07: ACM Time-Series Regression ===\n")

    klibor_raw, myor_raw = generate_synthetic_data()
    merged = merge_and_clean(klibor_raw, myor_raw)
    merged = add_myor_3m_to_df(merged)
    curve  = build_yield_curve_matrix(merged).dropna()

    pca     = extract_pca_factors(curve, n_components=3)
    Xt      = pca["factors"]
    var_out = estimate_var(Xt, lag_order=1)

    short_rate = merged.reindex(curve.index)["myor"]
    rx  = compute_excess_returns(curve, short_rate)
    reg = build_regression_dataset(rx, Xt, var_out["residuals"])

    acm = run_acm_regression(reg["y"], reg["X"])

    print("Regression coefficients (K regressors × M tenors):")
    print(acm["coef"])
    print(f"\nR² per tenor:")
    print(acm["R2"])
    print(f"\nResidual covariance Sigma_u:")
    print(acm["Sigma_u"])

    parsed = parse_regression_output(
        acm["coef"],
        n_factors=3,
        n_residuals=3
    )
    print("\n--- Parsed output ---")
    print("Intercepts a(τ):")
    print(parsed["a"])
    print("\nFactor loadings b(τ):")
    print(parsed["b"])
    print("\nVAR residual loadings c(τ):")
    print(parsed["c"])
