"""
PROMPT 9 — Reconstruct Yields and Term Premium
================================================
Use the estimated ACM parameters to:

1. Reconstruct model-implied yields (under physical measure P).
2. Compute risk-neutral yields (setting market price of risk to zero → Q measure).
3. Calculate term premium = physical yield - risk-neutral yield.

Background
----------
In the ACM affine term structure model, the n-period yield is:

    y_t(n) = -(A_n + B_n' * X_t) / n

where the scalar A_n and vector B_n satisfy the Riccati recursions:

Under physical measure P:
    A_{n+1} = A_n + B_n' * mu + 0.5 * B_n' * Sigma * B_n - delta_0
    B_{n+1} = Phi' * B_n - delta_1

Under risk-neutral measure Q (lambda = 0):
    A^Q_{n+1} = A^Q_n + B^Q_n' * mu_Q + 0.5 * B^Q_n' * Sigma * B^Q_n - delta_0
    B^Q_{n+1} = Phi_Q' * B^Q_n - delta_1

with boundary conditions:
    A_0 = 0,  B_0 = 0

and where:
    delta_0 = short-rate intercept (scalar)
    delta_1 = short-rate factor loadings (K-vector, i.e. the PCA loadings
              that map X_t to the overnight rate)

Term Premium:
    tp_t(n) = y_t(n) - y^Q_t(n)

The risk-neutral yield represents expectations of future short rates alone;
the difference (term premium) is the compensation for bearing interest-rate risk.
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt


# ---------------------------------------------------------------------------
# Calibrate short-rate mapping (delta_0, delta_1)
# ---------------------------------------------------------------------------

def estimate_short_rate_loadings(factors_df: pd.DataFrame,
                                  short_rate: pd.Series) -> tuple[float, np.ndarray]:
    """Regress the overnight short rate on PCA factors to get delta_0, delta_1.

    short_rate_t ≈ delta_0 + delta_1' * X_t

    Parameters
    ----------
    factors_df : pd.DataFrame
        PCA factors shape (T × K).
    short_rate : pd.Series
        Daily MYOR in %, aligned to same index.

    Returns
    -------
    (delta_0, delta_1) : (float, np.ndarray)
        OLS intercept and coefficient vector (length K).
    """
    common = factors_df.index.intersection(short_rate.index)
    X   = np.column_stack([np.ones(len(common)),
                            factors_df.loc[common].values])
    y   = short_rate.loc[common].values

    coefs, *_ = np.linalg.lstsq(X, y, rcond=None)
    delta_0 = float(coefs[0])
    delta_1 = coefs[1:]     # (K,)
    return delta_0, delta_1


# ---------------------------------------------------------------------------
# Riccati recursions
# ---------------------------------------------------------------------------

def _riccati_recursion(n_periods: int,
                        mu: np.ndarray,
                        Phi: np.ndarray,
                        Sigma: np.ndarray,
                        delta_0: float,
                        delta_1: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Solve the Riccati recursion for A_n and B_n coefficients.

    Parameters
    ----------
    n_periods : int
        Number of periods (holding period length in trading days).
    mu : np.ndarray (K,)
        VAR intercept (physical or risk-neutral).
    Phi : np.ndarray (K × K)
        VAR companion matrix (physical or risk-neutral).
    Sigma : np.ndarray (K × K)
        Covariance of VAR innovations.
    delta_0 : float
        Short-rate intercept.
    delta_1 : np.ndarray (K,)
        Short-rate factor loadings.

    Returns
    -------
    (A_vec, B_mat) : (np.ndarray, np.ndarray)
        A_vec[n] = scalar A_n for n = 0 … n_periods.
        B_mat[n] = vector B_n (K,) for n = 0 … n_periods.
    """
    K = len(mu)
    A = np.zeros(n_periods + 1)               # scalar sequence
    B = np.zeros((n_periods + 1, K))          # vector sequence

    # Boundary condition: A_0 = 0, B_0 = 0
    for n in range(n_periods):
        Bn    = B[n]
        An    = A[n]
        # B recursion: B_{n+1} = Phi' B_n - delta_1
        B[n+1] = Phi.T @ Bn - delta_1
        # A recursion: A_{n+1} = A_n + B_n' mu + 0.5 * B_n' Sigma B_n - delta_0
        A[n+1] = (An
                  + Bn @ mu
                  + 0.5 * Bn @ Sigma @ Bn
                  - delta_0)

    return A, B


# ---------------------------------------------------------------------------
# Yield reconstruction
# ---------------------------------------------------------------------------

def reconstruct_yields(factors_df: pd.DataFrame,
                        mu: np.ndarray,
                        Phi: np.ndarray,
                        mu_Q: np.ndarray,
                        Phi_Q: np.ndarray,
                        Sigma: np.ndarray,
                        delta_0: float,
                        delta_1: np.ndarray,
                        tenors_days: list[int] | None = None) -> dict:
    """Reconstruct model-implied and risk-neutral yields for given tenors.

    Parameters
    ----------
    factors_df : pd.DataFrame
        PCA factor time series, shape (T × K).
    mu, Phi : np.ndarray
        Physical VAR parameters.
    mu_Q, Phi_Q : np.ndarray
        Risk-neutral VAR parameters.
    Sigma : np.ndarray
        Innovation covariance.
    delta_0, delta_1 : float, np.ndarray
        Short-rate pricing equation parameters.
    tenors_days : list of int
        Holding periods in trading days.  Default: [21, 63, 126, 252]
        corresponding to approx 1M, 3M, 6M, 12M.

    Returns
    -------
    dict with keys:
        'fitted_yields'    : pd.DataFrame (T × len(tenors)) — model yields (%).
        'rn_yields'        : pd.DataFrame (T × len(tenors)) — risk-neutral yields (%).
        'term_premium'     : pd.DataFrame (T × len(tenors)) — term premium (%).
        'tenor_labels'     : list[str] — column names.
    """
    if tenors_days is None:
        tenors_days = [21, 63, 126, 252]   # ~1M, 3M, 6M, 12M in trading days

    T = len(factors_df)
    X = factors_df.values                   # (T × K)

    fitted_cols = []
    rn_cols     = []
    tp_cols     = []
    labels      = []

    for n in tenors_days:
        # Physical measure
        A_P, B_P = _riccati_recursion(n, mu, Phi, Sigma, delta_0, delta_1)
        # Risk-neutral measure
        A_Q, B_Q = _riccati_recursion(n, mu_Q, Phi_Q, Sigma, delta_0, delta_1)

        # Yield for each date t: y_t(n) = -(A_n + B_n' * X_t) / n
        y_P = -(A_P[n] + X @ B_P[n]) / n     # (T,)
        y_Q = -(A_Q[n] + X @ B_Q[n]) / n     # (T,)
        tp  = y_P - y_Q                        # (T,) — term premium

        # Annualise: multiply by 252 and convert decimal → %
        # (The recursion produces rates in the same units as delta_0 / r_t
        #  which are in % terms.  The division by n keeps per-day units;
        #  multiply by 252 to annualise.)
        y_P_ann = y_P * 252
        y_Q_ann = y_Q * 252
        tp_ann  = tp  * 252

        months = round(n / 21)
        label  = f"y_{months}m"
        labels.append(label)
        fitted_cols.append(y_P_ann)
        rn_cols.append(y_Q_ann)
        tp_cols.append(tp_ann)

    idx = factors_df.index
    fitted_df = pd.DataFrame(np.column_stack(fitted_cols), index=idx, columns=labels)
    rn_df     = pd.DataFrame(np.column_stack(rn_cols),     index=idx, columns=labels)
    tp_df     = pd.DataFrame(np.column_stack(tp_cols),     index=idx, columns=labels)

    return dict(
        fitted_yields=fitted_df,
        rn_yields=rn_df,
        term_premium=tp_df,
        tenor_labels=labels,
    )


# ---------------------------------------------------------------------------
# Plotting
# ---------------------------------------------------------------------------

def plot_yield_decomposition(fitted: pd.DataFrame,
                              rn: pd.DataFrame,
                              tp: pd.DataFrame,
                              tenor_label: str = "y_3m",
                              save_path: str | None = None) -> None:
    """Plot fitted yield, risk-neutral yield, and term premium for one tenor.

    Parameters
    ----------
    fitted, rn, tp : pd.DataFrame
        Output from reconstruct_yields.
    tenor_label : str
        Which column to plot (e.g. 'y_3m').
    save_path : str or None
        Save path if not None.
    """
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 7), sharex=True)

    ax1.plot(fitted.index, fitted[tenor_label], label="Fitted yield (P)",
             color="steelblue", linewidth=1.2)
    ax1.plot(rn.index, rn[tenor_label], label="Risk-neutral yield (Q)",
             color="darkorange", linewidth=1.2, linestyle="--")
    ax1.set_ylabel("Yield (%)")
    ax1.set_title(f"Model-Implied vs Risk-Neutral Yield — {tenor_label}")
    ax1.legend()
    ax1.grid(alpha=0.3)

    ax2.fill_between(tp.index, tp[tenor_label], 0,
                     where=(tp[tenor_label] >= 0),
                     label="Term premium (positive)", color="green", alpha=0.4)
    ax2.fill_between(tp.index, tp[tenor_label], 0,
                     where=(tp[tenor_label] < 0),
                     label="Term premium (negative)", color="red", alpha=0.4)
    ax2.plot(tp.index, tp[tenor_label], color="black", linewidth=0.8)
    ax2.axhline(0, color="black", linewidth=0.6)
    ax2.set_ylabel("Term Premium (%)")
    ax2.set_xlabel("Date")
    ax2.set_title("Term Premium")
    ax2.legend()
    ax2.grid(alpha=0.3)

    plt.tight_layout()

    if save_path:
        plt.savefig(save_path, dpi=150)
        print(f"Saved plot to: {save_path}")
    else:
        plt.show()
    plt.close()


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
    from _08_market_price_of_risk import estimate_market_price_of_risk

    print("=== Module 09: Reconstruct Yields & Term Premium ===\n")

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

    d0, d1 = estimate_short_rate_loadings(Xt, short_rate.reindex(Xt.index).ffill())

    out = reconstruct_yields(
        factors_df=Xt,
        mu=var_out["mu"].values,
        Phi=var_out["Phi"].values,
        mu_Q=mpr["mu_Q"].values,
        Phi_Q=mpr["Phi_Q"].values,
        Sigma=var_out["Sigma"].values,
        delta_0=d0,
        delta_1=d1,
    )

    print("Fitted yields (first 5 rows):")
    print(out["fitted_yields"].head())
    print("\nRisk-neutral yields (first 5 rows):")
    print(out["rn_yields"].head())
    print("\nTerm premium (first 5 rows):")
    print(out["term_premium"].head())
    print("\nTerm premium descriptive stats:")
    print(out["term_premium"].describe())
