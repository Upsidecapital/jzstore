"""
PROMPT 8 — Estimate Market Price of Risk
=========================================
Compute the market price of risk parameters (lambda_0, lambda_1) from the
ACM regression outputs.

ACM Model Structure
-------------------
Under the physical (real-world) measure P, state variables evolve as VAR(1):

    X_{t+1} = mu + Phi * X_t + epsilon_{t+1},   epsilon ~ N(0, Sigma)

Under the risk-neutral measure Q, the state variables evolve as:

    X_{t+1}^Q = mu^Q + Phi^Q * X_t + epsilon_{t+1}^Q

The pricing kernel / Stochastic Discount Factor (SDF) links P to Q:

    m_{t+1} = exp(-r_t - 0.5 * lambda_t' * lambda_t - lambda_t' * epsilon_{t+1})

where the time-varying market price of risk is:

    lambda_t = lambda_0 + lambda_1 * X_t

Identification from the regression
------------------------------------
From the ACM regression:
    rx_{t+1} = a + b' * X_t + c' * epsilon_t

The ACM paper shows:

    lambda_0 = -Sigma^{-1} * c' * a_bar          (constant component)
    lambda_1 = -Sigma^{-1} * c' * b_bar          (time-varying component)

where a_bar and b_bar are the mean a(τ) and mean b(τ) across tenors
(summarised by the principal-component regression).

For implementation we follow the matrix-form derivation (see ACM 2013 eq. 9-12):

    lambda_0 = -(Sigma^{+}) * a_vec        [K × 1]
    lambda_1 = -(Sigma^{+}) * B_mat        [K × K]

where:
    a_vec   = a(τ) column from the regression  [M × 1 → projected to K × 1]
    B_mat   = b(τ) block from the regression   [K × M → projected to K × K]
    Sigma^+ = pseudo-inverse of Sigma (innovations cov)
"""

import numpy as np
import pandas as pd


# ---------------------------------------------------------------------------
# Market price of risk estimation
# ---------------------------------------------------------------------------

def estimate_market_price_of_risk(mu: pd.Series,
                                   Phi: pd.DataFrame,
                                   Sigma: pd.DataFrame,
                                   a: pd.Series,
                                   b: pd.DataFrame,
                                   c: pd.DataFrame) -> dict:
    """Estimate lambda_0 and lambda_1 from VAR and ACM regression outputs.

    Parameters
    ----------
    mu : pd.Series
        VAR(1) intercept vector, shape (K,).
    Phi : pd.DataFrame
        VAR(1) companion matrix, shape (K × K).
    Sigma : pd.DataFrame
        Covariance matrix of VAR innovations, shape (K × K).
    a : pd.Series
        Regression intercept vector a(τ), shape (M,).
        (Typically rows over tenors M.)
    b : pd.DataFrame
        Factor-loading sub-matrix of the regression, shape (K × M).
    c : pd.DataFrame
        VAR-residual-loading sub-matrix, shape (K × M).

    Returns
    -------
    dict with keys:
        'lambda_0'     : np.ndarray (K,) — constant market price of risk.
        'lambda_1'     : np.ndarray (K × K) — time-varying MPoR loadings.
        'mu_Q'         : np.ndarray (K,) — risk-neutral drift.
        'Phi_Q'        : np.ndarray (K × K) — risk-neutral AR matrix.
        'lambda_series': function — callable to get lambda_t given X_t.
    """
    K = len(mu)
    M = len(a)

    # Convert to numpy for matrix operations
    Sigma_np = Sigma.values.astype(float)          # (K × K)
    a_np     = a.values.astype(float)              # (M,)
    b_np     = b.values.astype(float)              # (K × M)
    c_np     = c.values.astype(float)              # (K × M)
    mu_np    = mu.values.astype(float)             # (K,)
    Phi_np   = Phi.values.astype(float)            # (K × K)

    # Pseudo-inverse of Sigma for numerical stability
    Sigma_pinv = np.linalg.pinv(Sigma_np)          # (K × K)

    # ---- lambda_0 (constant component) ----
    # ACM identification: c' * a  is the projection of a onto the innovation space.
    # c is (K × M); a is (M,); c @ a → (K,)
    ca_product  = c_np @ a_np                      # (K,)
    lambda_0    = -Sigma_pinv @ ca_product          # (K,)

    # ---- lambda_1 (time-varying component) ----
    # c is (K × M); b is (K × M); b.T is (M × K).
    # c @ b.T → (K × K)  — maps factor shocks to return risk loadings
    cb_product  = c_np @ b_np.T                    # (K × K)
    lambda_1    = -Sigma_pinv @ cb_product          # (K × K)

    # ---- Risk-neutral parameters ----
    # Under Q: mu^Q = mu - Sigma * lambda_0
    #           Phi^Q = Phi - Sigma * lambda_1
    mu_Q   = mu_np  - Sigma_np @ lambda_0          # (K,)
    Phi_Q  = Phi_np - Sigma_np @ lambda_1          # (K × K)

    # ---- Time-varying market price of risk as a function ----
    def lambda_t(X: np.ndarray) -> np.ndarray:
        """Compute lambda_t = lambda_0 + lambda_1 @ X_t.

        Parameters
        ----------
        X : np.ndarray  (K,)
            PCA factor vector at time t.

        Returns
        -------
        np.ndarray (K,)
            Time-varying market price of risk vector.
        """
        return lambda_0 + lambda_1 @ X

    # Pack into interpretable DataFrames for reporting
    factor_labels  = mu.index.tolist()
    lambda_0_ser   = pd.Series(lambda_0, index=factor_labels, name="lambda_0")
    lambda_1_df    = pd.DataFrame(lambda_1,
                                   index=factor_labels,
                                   columns=factor_labels)
    mu_Q_ser       = pd.Series(mu_Q, index=factor_labels, name="mu_Q")
    Phi_Q_df       = pd.DataFrame(Phi_Q,
                                   index=factor_labels,
                                   columns=factor_labels)

    return dict(
        lambda_0=lambda_0_ser,
        lambda_1=lambda_1_df,
        mu_Q=mu_Q_ser,
        Phi_Q=Phi_Q_df,
        lambda_series=lambda_t,
    )


def compute_lambda_time_series(factors_df: pd.DataFrame,
                                lambda_0: pd.Series,
                                lambda_1: pd.DataFrame) -> pd.DataFrame:
    """Compute the time series of lambda_t = lambda_0 + lambda_1 * X_t.

    Parameters
    ----------
    factors_df : pd.DataFrame
        PCA factors, shape (T × K).
    lambda_0 : pd.Series
        Constant component of MPoR, shape (K,).
    lambda_1 : pd.DataFrame
        Time-varying component matrix, shape (K × K).

    Returns
    -------
    pd.DataFrame
        Shape (T × K) — market price of risk at each date.
    """
    l0 = lambda_0.values                    # (K,)
    l1 = lambda_1.values                    # (K × K)
    X  = factors_df.values                  # (T × K)

    # lambda_t[i] = l0 + l1 @ X[i]  ← shape (K,) for each row
    lt = l0[np.newaxis, :] + (X @ l1.T)    # broadcast: (T × K)

    cols = [f"lambda_{c}" for c in factors_df.columns]
    return pd.DataFrame(lt, index=factors_df.index, columns=cols)


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
    from _07_acm_regression import run_acm_regression, parse_regression_output

    print("=== Module 08: Market Price of Risk ===\n")

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

    acm    = run_acm_regression(reg["y"], reg["X"])
    parsed = parse_regression_output(acm["coef"], n_factors=3, n_residuals=3)

    mpr = estimate_market_price_of_risk(
        mu=var_out["mu"],
        Phi=var_out["Phi"],
        Sigma=var_out["Sigma"],
        a=parsed["a"],
        b=parsed["b"],
        c=parsed["c"],
    )

    print("lambda_0 (constant market price of risk):")
    print(mpr["lambda_0"])
    print("\nlambda_1 (time-varying loading matrix):")
    print(mpr["lambda_1"])
    print("\nRisk-neutral drift mu_Q:")
    print(mpr["mu_Q"])
    print("\nRisk-neutral AR matrix Phi_Q:")
    print(mpr["Phi_Q"])

    # Time series of lambda_t
    lt_series = compute_lambda_time_series(Xt, mpr["lambda_0"], mpr["lambda_1"])
    print(f"\nMarket price of risk time series shape: {lt_series.shape}")
    print("\nFirst 5 rows:")
    print(lt_series.head())
    print("\nDescriptive statistics:")
    print(lt_series.describe())
