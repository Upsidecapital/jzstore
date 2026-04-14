"""
PROMPT 5 — Estimate VAR Model on Factors
=========================================
Fit a VAR(1) model on the PCA factor time series:

    X_t = mu + Phi * X_{t-1} + epsilon_t

where:
    X_t      — (K × 1) vector of PCA factors at time t
    mu       — (K × 1) constant / intercept vector
    Phi      — (K × K) companion matrix of autoregressive coefficients
    epsilon_t — (K × 1) white-noise innovations, Cov(ε) = Sigma

This step is the core of the ACM (Adrian-Crump-Moench) term structure model.
The VAR dynamics under the physical (real-world) measure P describe how the
state variables evolve over time.
"""

import numpy as np
import pandas as pd
from statsmodels.tsa.vector_ar.var_model import VAR


# ---------------------------------------------------------------------------
# VAR estimation
# ---------------------------------------------------------------------------

def estimate_var(factors_df: pd.DataFrame,
                 lag_order: int = 1) -> dict:
    """Estimate a VAR(p) model on PCA factor time series.

    Parameters
    ----------
    factors_df : pd.DataFrame
        Shape (T × K) — rows are dates, columns are PC factors (X_t).
        Must be stationary (PCA factors on yield *levels* are often
        near-integrated; consider first-differencing if needed and confirmed
        by an ADF test in module 11).
    lag_order : int
        VAR lag order p.  ACM typically uses p = 1.

    Returns
    -------
    dict with keys:
        'mu'       : pd.Series  (K,)   — intercept vector (annualised in % units).
        'Phi'      : pd.DataFrame (K×K) — companion AR coefficient matrix.
        'residuals': pd.DataFrame (T-p × K) — VAR innovations epsilon_t.
        'Sigma'    : pd.DataFrame (K×K) — covariance matrix of residuals.
        'result'   : statsmodels VARResultsWrapper (full model object).
        'aic'      : float — AIC of the fitted model.
        'bic'      : float — BIC of the fitted model.
        'summary'  : str  — text summary from statsmodels.
    """
    # Fit VAR using statsmodels
    model  = VAR(factors_df)
    result = model.fit(maxlags=lag_order, ic=None)   # fix lag order, no auto-select

    # ---- Extract mu (intercept) ----
    # statsmodels VAR.params layout: rows = [const, L1.PC1, L1.PC2, ...],
    #                                 cols = equations (PC1, PC2, ...).
    # The first row is the intercept for each equation.
    params      = result.params                     # shape (1 + K*p, K)
    mu_array    = params.iloc[0].values             # intercept row
    mu          = pd.Series(mu_array, index=factors_df.columns, name="mu")

    # ---- Extract Phi (companion matrix) ----
    # For VAR(1), Phi is the K×K matrix of coefficients on X_{t-1}.
    # params rows 1..K correspond to L1.PC1 … L1.PCK.
    phi_array   = params.iloc[1: 1 + len(factors_df.columns)].values  # (K, K)
    Phi         = pd.DataFrame(phi_array,
                                index=factors_df.columns,
                                columns=factors_df.columns)

    # ---- Residuals ----
    resid       = pd.DataFrame(result.resid,
                                index=factors_df.index[lag_order:],
                                columns=factors_df.columns)

    # ---- Covariance matrix of residuals ----
    Sigma       = pd.DataFrame(result.sigma_u,
                                index=factors_df.columns,
                                columns=factors_df.columns)

    return dict(
        mu=mu,
        Phi=Phi,
        residuals=resid,
        Sigma=Sigma,
        result=result,
        aic=result.aic,
        bic=result.bic,
        summary=str(result.summary()),
    )


# ---------------------------------------------------------------------------
# Helper: check VAR stability
# ---------------------------------------------------------------------------

def check_stability(Phi: pd.DataFrame) -> dict:
    """Verify that the estimated VAR is stable (all eigenvalues inside unit circle).

    A stable VAR means the factors are stationary (shocks die out over time),
    which is required for the ACM term premium model to be well-defined.

    Parameters
    ----------
    Phi : pd.DataFrame
        The K×K companion matrix from estimate_var.

    Returns
    -------
    dict with keys:
        'eigenvalues'    : np.ndarray of complex eigenvalues.
        'moduli'         : np.ndarray |λ|  for each eigenvalue.
        'max_modulus'    : float — largest |λ|.
        'is_stable'      : bool — True if max_modulus < 1.
    """
    eigenvalues = np.linalg.eigvals(Phi.values)
    moduli      = np.abs(eigenvalues)
    max_mod     = float(np.max(moduli))
    return dict(
        eigenvalues=eigenvalues,
        moduli=moduli,
        max_modulus=max_mod,
        is_stable=max_mod < 1.0,
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

    print("=== Module 05: VAR(1) on PCA Factors ===\n")

    klibor_raw, myor_raw = generate_synthetic_data()
    merged = merge_and_clean(klibor_raw, myor_raw)
    merged = add_myor_3m_to_df(merged)
    curve  = build_yield_curve_matrix(merged).dropna()
    pca    = extract_pca_factors(curve, n_components=3)
    Xt     = pca["factors"]

    var_out = estimate_var(Xt, lag_order=1)

    print("mu (intercept vector):")
    print(var_out["mu"])
    print("\nPhi (companion AR matrix):")
    print(var_out["Phi"])
    print("\nSigma (residual covariance):")
    print(var_out["Sigma"])
    print(f"\nAIC: {var_out['aic']:.4f}  BIC: {var_out['bic']:.4f}")

    stability = check_stability(var_out["Phi"])
    print(f"\nVAR stability check:")
    print(f"  Max eigenvalue modulus: {stability['max_modulus']:.6f}")
    print(f"  Is stable:              {stability['is_stable']}")

    print("\nResiduals shape:", var_out["residuals"].shape)
    print("First 3 residual rows:")
    print(var_out["residuals"].head(3))
