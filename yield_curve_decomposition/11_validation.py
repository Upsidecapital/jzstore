"""
PROMPT 11 — Model Validation & Diagnostics
===========================================
Validate the KLIBOR yield curve decomposition through:

Part A — Standard Diagnostics
------------------------------
1. Summary statistics of each decomposition component.
2. Correlation analysis between components.
3. Rolling mean and variance (structural stability over time).
4. Visual inspection plots.

Part B — Bias-Corrected VAR (Bootstrap Method)
-----------------------------------------------
OLS estimates of VAR companion matrices are downward-biased in small samples
(known as the "Stambaugh bias").  This affects both the physical (P) and
risk-neutral (Q) drift parameters and therefore biases term premium estimates.

The bootstrap bias-correction (Kilian, 1998) proceeds as:
    1. Estimate OLS VAR → Phi_OLS.
    2. Compute the bias in Phi using parametric bootstrap:
         bias = E[Phi_bootstrap] - Phi_OLS
         Phi_corrected = 2 * Phi_OLS - E[Phi_bootstrap]
    3. Re-run full ACM pipeline with Phi_corrected.
    4. Compare resulting term premiums with OLS-based estimates.

The corrected estimates are typically higher (less mean-reversion in factors
→ higher uncertainty about future short rates → larger term premiums).
"""

import warnings
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from statsmodels.tsa.stattools import adfuller
from statsmodels.stats.stattools import durbin_watson


warnings.filterwarnings("ignore")


# ---------------------------------------------------------------------------
# Part A: Diagnostics
# ---------------------------------------------------------------------------

def summary_statistics(decomp_df: pd.DataFrame) -> pd.DataFrame:
    """Compute detailed summary statistics for each component.

    Parameters
    ----------
    decomp_df : pd.DataFrame
        Output of Module 10's compute_credit_premium.

    Returns
    -------
    pd.DataFrame
        Extended statistics including skewness, kurtosis, and ADF test p-value.
    """
    stats = decomp_df.describe().T.copy()
    stats["skewness"]    = decomp_df.skew()
    stats["kurtosis"]    = decomp_df.kurt()
    stats["range"]       = stats["max"] - stats["min"]

    # Augmented Dickey-Fuller test: low p-value → stationary
    adf_pvals = {}
    for col in decomp_df.columns:
        series = decomp_df[col].dropna()
        try:
            _, pval, *_ = adfuller(series, maxlag=10, autolag="AIC")
        except Exception:
            pval = np.nan
        adf_pvals[col] = pval
    stats["ADF_pvalue"] = pd.Series(adf_pvals)

    return stats


def correlation_analysis(decomp_df: pd.DataFrame) -> dict:
    """Compute correlations between decomposition components.

    Parameters
    ----------
    decomp_df : pd.DataFrame
        Component time series.

    Returns
    -------
    dict with keys:
        'pearson'   : pd.DataFrame — Pearson linear correlation matrix.
        'spearman'  : pd.DataFrame — Spearman rank correlation matrix.
        'change_corr': pd.DataFrame — Pearson correlation on first differences.
    """
    pearson  = decomp_df.corr(method="pearson")
    spearman = decomp_df.corr(method="spearman")
    diffs    = decomp_df.diff().dropna()
    change_corr = diffs.corr(method="pearson")

    return dict(pearson=pearson, spearman=spearman, change_corr=change_corr)


def rolling_stability(decomp_df: pd.DataFrame,
                       window: int = 252) -> dict:
    """Compute rolling mean and variance to assess structural stability.

    Parameters
    ----------
    decomp_df : pd.DataFrame
        Component time series.
    window : int
        Rolling window in trading days (default 252 = 1 year).

    Returns
    -------
    dict with keys:
        'rolling_mean' : pd.DataFrame — rolling mean of each component.
        'rolling_std'  : pd.DataFrame — rolling std of each component.
        'rolling_var'  : pd.DataFrame — rolling variance of each component.
    """
    roll       = decomp_df.rolling(window=window, min_periods=window // 2)
    roll_mean  = roll.mean()
    roll_std   = roll.std()
    roll_var   = roll.var()

    return dict(
        rolling_mean=roll_mean,
        rolling_std=roll_std,
        rolling_var=roll_var,
    )


def plot_diagnostic_dashboard(decomp_df: pd.DataFrame,
                               rolling: dict,
                               save_path: str | None = None) -> None:
    """Multi-panel diagnostic dashboard for the decomposition.

    Panels:
        Row 1: Time series of all components.
        Row 2: Rolling mean of each component.
        Row 3: Rolling standard deviation.
        Row 4: Distribution histograms.

    Parameters
    ----------
    decomp_df : pd.DataFrame
        Component time series.
    rolling : dict
        Output of rolling_stability.
    save_path : str or None
        Save path if provided.
    """
    cols   = decomp_df.columns.tolist()
    n_cols = len(cols)
    colors = ["black", "green", "steelblue", "crimson"]

    fig, axes = plt.subplots(4, n_cols, figsize=(5 * n_cols, 14))

    for j, (col, color) in enumerate(zip(cols, colors)):
        # Row 0: raw time series
        axes[0, j].plot(decomp_df.index, decomp_df[col],
                        color=color, linewidth=0.8)
        axes[0, j].set_title(col, fontsize=10)
        axes[0, j].grid(alpha=0.3)
        if j == 0:
            axes[0, j].set_ylabel("Rate (%)")

        # Row 1: rolling mean
        axes[1, j].plot(rolling["rolling_mean"].index,
                        rolling["rolling_mean"][col],
                        color=color, linewidth=1.0)
        axes[1, j].axhline(decomp_df[col].mean(), color="gray",
                           linestyle="--", linewidth=0.8, label="Full-sample mean")
        axes[1, j].grid(alpha=0.3)
        if j == 0:
            axes[1, j].set_ylabel("Rolling Mean (%)")

        # Row 2: rolling std
        axes[2, j].plot(rolling["rolling_std"].index,
                        rolling["rolling_std"][col],
                        color=color, linewidth=1.0)
        axes[2, j].grid(alpha=0.3)
        if j == 0:
            axes[2, j].set_ylabel("Rolling Std (%)")

        # Row 3: histogram
        axes[3, j].hist(decomp_df[col].dropna(), bins=50,
                        color=color, alpha=0.7, edgecolor="white")
        axes[3, j].axvline(decomp_df[col].mean(), color="black",
                           linestyle="--", linewidth=1.0, label="Mean")
        axes[3, j].set_xlabel("Rate (%)")
        axes[3, j].grid(alpha=0.3)
        if j == 0:
            axes[3, j].set_ylabel("Frequency")

    row_labels = ["Time Series", "Rolling Mean (1Y)", "Rolling Std (1Y)",
                  "Distribution"]
    for i, label in enumerate(row_labels):
        axes[i, 0].annotate(label, xy=(-0.3, 0.5), xycoords="axes fraction",
                             fontsize=11, fontweight="bold", va="center",
                             rotation=90)

    plt.suptitle("Decomposition Diagnostic Dashboard", fontsize=14, y=1.01)
    plt.tight_layout()

    if save_path:
        plt.savefig(save_path, dpi=130, bbox_inches="tight")
        print(f"Saved diagnostic dashboard to: {save_path}")
    else:
        plt.show()
    plt.close()


# ---------------------------------------------------------------------------
# Part B: Bias-corrected VAR (Kilian 1998 bootstrap)
# ---------------------------------------------------------------------------

def bootstrap_bias_correction(factors_df: pd.DataFrame,
                                n_bootstrap: int = 500,
                                lag_order: int = 1,
                                seed: int = 42) -> dict:
    """Apply Kilian (1998) bootstrap bias correction to the VAR companion matrix.

    Algorithm
    ---------
    1. Fit OLS VAR(p) → (Phi_OLS, mu_OLS, residuals_OLS).
    2. Bootstrap B times:
       a. Resample residuals with replacement.
       b. Simulate new factor time series from the OLS model + resampled residuals.
       c. Estimate VAR(p) on simulated series → Phi_b.
       d. Store Phi_b.
    3. Compute bias = E[Phi_b] - Phi_OLS.
    4. Phi_corrected = Phi_OLS - bias  (= 2*Phi_OLS - E[Phi_b]).
    5. Ensure Phi_corrected is stable (shrink toward zero if needed).

    Parameters
    ----------
    factors_df : pd.DataFrame
        PCA factor time series, shape (T × K).
    n_bootstrap : int
        Number of bootstrap replications.
    lag_order : int
        VAR lag order (should match the model in Module 05).
    seed : int
        Random seed for reproducibility.

    Returns
    -------
    dict with keys:
        'Phi_OLS'       : pd.DataFrame (K×K) — original OLS estimate.
        'mu_OLS'        : pd.Series (K,)     — original OLS intercept.
        'Phi_corrected' : pd.DataFrame (K×K) — bias-corrected estimate.
        'bias'          : pd.DataFrame (K×K) — estimated bias.
        'Sigma'         : pd.DataFrame (K×K) — OLS residual cov.
        'residuals_OLS' : pd.DataFrame       — OLS residuals.
    """
    from statsmodels.tsa.vector_ar.var_model import VAR as _VAR

    rng = np.random.default_rng(seed)
    T, K = factors_df.shape
    col_labels = factors_df.columns.tolist()

    # Step 1: OLS fit
    model_ols  = _VAR(factors_df)
    result_ols = model_ols.fit(maxlags=lag_order, ic=None)
    params_ols = result_ols.params                 # (1+K, K)
    mu_ols     = params_ols.iloc[0].values          # (K,)
    Phi_ols    = params_ols.iloc[1:1+K].values      # (K, K) — rows=vars, cols=eq
    resid_ols  = result_ols.resid                   # (T-p, K)
    Sigma_ols  = result_ols.sigma_u                 # (K, K)
    T_eff      = len(resid_ols)

    # Step 2–4: Bootstrap
    Phi_boots = np.zeros((n_bootstrap, K, K))

    for b in range(n_bootstrap):
        # 2a: Resample residuals (block bootstrap would be better, but
        #     i.i.d. resampling is the standard Kilian 1998 approach)
        idx_boot     = rng.integers(0, T_eff, size=T_eff)
        resid_boot   = resid_ols[idx_boot]          # (T_eff, K)

        # 2b: Simulate factor series using OLS model
        X_boot = np.zeros((T_eff + lag_order, K))
        # Initialise with the first observed factor vector
        X_boot[:lag_order] = factors_df.values[:lag_order]

        for t in range(lag_order, T_eff + lag_order):
            X_boot[t] = (mu_ols
                         + Phi_ols @ X_boot[t - 1]
                         + resid_boot[t - lag_order])

        X_boot_df = pd.DataFrame(X_boot[lag_order:], columns=col_labels)

        # 2c: Estimate VAR on simulated data
        try:
            m_b   = _VAR(X_boot_df)
            r_b   = m_b.fit(maxlags=lag_order, ic=None)
            Phi_b = r_b.params.iloc[1:1+K].values
        except Exception:
            Phi_b = Phi_ols.copy()

        Phi_boots[b] = Phi_b

    # Step 3: Bias estimate
    mean_Phi_boot = Phi_boots.mean(axis=0)           # (K, K)
    bias          = mean_Phi_boot - Phi_ols           # (K, K)

    # Step 4: Corrected estimate
    Phi_corrected = Phi_ols - bias                    # (K, K)

    # Step 5: Stability check — if not stable, shrink toward identity
    max_mod_corrected = np.max(np.abs(np.linalg.eigvals(Phi_corrected)))
    if max_mod_corrected >= 1.0:
        # Proportional shrinkage toward OLS until stable
        shrink = 0.99
        while max_mod_corrected >= 1.0 and shrink > 0:
            Phi_corrected = Phi_ols + shrink * (Phi_corrected - Phi_ols)
            max_mod_corrected = np.max(np.abs(np.linalg.eigvals(Phi_corrected)))
            shrink *= 0.95

    # Wrap results
    mu_ols_ser    = pd.Series(mu_ols, index=col_labels, name="mu_OLS")
    Phi_ols_df    = pd.DataFrame(Phi_ols, index=col_labels, columns=col_labels)
    Phi_corr_df   = pd.DataFrame(Phi_corrected, index=col_labels, columns=col_labels)
    bias_df       = pd.DataFrame(bias, index=col_labels, columns=col_labels)
    Sigma_df      = pd.DataFrame(Sigma_ols, index=col_labels, columns=col_labels)
    resid_df      = pd.DataFrame(resid_ols,
                                  index=factors_df.index[lag_order:],
                                  columns=col_labels)

    return dict(
        Phi_OLS=Phi_ols_df,
        mu_OLS=mu_ols_ser,
        Phi_corrected=Phi_corr_df,
        bias=bias_df,
        Sigma=Sigma_df,
        residuals_OLS=resid_df,
    )


def compare_term_premiums(tp_ols: pd.Series,
                           tp_corrected: pd.Series,
                           save_path: str | None = None) -> pd.DataFrame:
    """Compare OLS vs bias-corrected term premium estimates.

    Parameters
    ----------
    tp_ols : pd.Series
        Term premium from standard OLS VAR.
    tp_corrected : pd.Series
        Term premium from bias-corrected VAR.
    save_path : str or None
        If provided, save the comparison plot.

    Returns
    -------
    pd.DataFrame
        Comparison of mean, std, and percentile statistics.
    """
    common = tp_ols.index.intersection(tp_corrected.index)
    compare_df = pd.DataFrame({
        "ols":       tp_ols.loc[common],
        "corrected": tp_corrected.loc[common],
    })
    compare_df["difference"] = compare_df["corrected"] - compare_df["ols"]

    stats = compare_df.describe().T
    print("\nTerm Premium Comparison (OLS vs Bias-Corrected):")
    print(stats)

    # Plot
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(13, 7), sharex=True)

    ax1.plot(compare_df.index, compare_df["ols"],
             label="OLS VAR", color="steelblue", linewidth=1.0)
    ax1.plot(compare_df.index, compare_df["corrected"],
             label="Bias-Corrected VAR", color="darkorange",
             linewidth=1.0, linestyle="--")
    ax1.axhline(0, color="black", linewidth=0.6)
    ax1.set_ylabel("Term Premium (%)")
    ax1.set_title("Term Premium: OLS vs Bias-Corrected VAR")
    ax1.legend()
    ax1.grid(alpha=0.3)

    ax2.plot(compare_df.index, compare_df["difference"],
             color="purple", linewidth=0.9)
    ax2.fill_between(compare_df.index, compare_df["difference"], 0,
                     alpha=0.3, color="purple")
    ax2.axhline(0, color="black", linewidth=0.6)
    ax2.set_ylabel("Difference (Corrected − OLS) (%)")
    ax2.set_xlabel("Date")
    ax2.set_title("Bias-Correction Impact")
    ax2.grid(alpha=0.3)

    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=150)
        print(f"Saved comparison plot to: {save_path}")
    else:
        plt.show()
    plt.close()

    return stats


# ---------------------------------------------------------------------------
# Main — smoke test (runs the full pipeline end-to-end)
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
    from _09_reconstruct_yields import estimate_short_rate_loadings, reconstruct_yields
    from _10_credit_premium import compute_credit_premium, summarise_decomposition

    print("=== Module 11: Model Validation & Diagnostics ===\n")

    # ---- Build full pipeline ----
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

    yields_ols = reconstruct_yields(
        factors_df=Xt,
        mu=var_out["mu"].values,
        Phi=var_out["Phi"].values,
        mu_Q=mpr["mu_Q"].values,
        Phi_Q=mpr["Phi_Q"].values,
        Sigma=var_out["Sigma"].values,
        delta_0=d0,
        delta_1=d1,
    )
    tp_ols_3m = yields_ols["term_premium"]["y_3m"]

    klibor_3m    = merged["klibor_3m"]
    myor_3m_cmpd = merged["myor_3m_compounded"]

    decomp = compute_credit_premium(klibor_3m, myor_3m_cmpd, tp_ols_3m)

    # ---- Part A: Diagnostics ----
    print("Part A — Descriptive Statistics:")
    print(summary_statistics(decomp))

    print("\nPearson Correlation Matrix:")
    corr = correlation_analysis(decomp)
    print(corr["pearson"])

    rolling = rolling_stability(decomp, window=252)
    print("\nRolling mean (last 3 rows):")
    print(rolling["rolling_mean"].tail(3))

    # ---- Part B: Bias-corrected VAR ----
    print("\n\nPart B — Bias-Corrected VAR (Kilian 1998):")
    print("Running bootstrap (500 replications)... ", end="", flush=True)
    bc = bootstrap_bias_correction(Xt, n_bootstrap=500, seed=42)
    print("done.")

    print("\nBias (OLS underestimation of Phi):")
    print(bc["bias"])

    print("\nPhi OLS:")
    print(bc["Phi_OLS"])

    print("\nPhi Corrected:")
    print(bc["Phi_corrected"])

    # Re-run ACM with corrected Phi
    # Need to re-estimate mu_Q and Phi_Q using bias-corrected Phi
    # Use the same residuals (OLS residuals are unbiased)
    mpr_bc = estimate_market_price_of_risk(
        mu=bc["mu_OLS"],
        Phi=bc["Phi_corrected"],
        Sigma=bc["Sigma"],
        a=parsed["a"],
        b=parsed["b"],
        c=parsed["c"],
    )

    yields_bc = reconstruct_yields(
        factors_df=Xt,
        mu=bc["mu_OLS"].values,
        Phi=bc["Phi_corrected"].values,
        mu_Q=mpr_bc["mu_Q"].values,
        Phi_Q=mpr_bc["Phi_Q"].values,
        Sigma=bc["Sigma"].values,
        delta_0=d0,
        delta_1=d1,
    )
    tp_bc_3m = yields_bc["term_premium"]["y_3m"]

    compare_term_premiums(tp_ols_3m, tp_bc_3m)

    print(
        "\nInterpretation:"
        "\n  Bias-corrected VAR typically produces HIGHER term premiums."
        "\n  OLS over-estimates mean-reversion in rate factors, which"
        "\n  under-states the uncertainty about future short rates and"
        "\n  therefore under-estimates the compensation investors require."
        "\n  The corrected model is more conservative and theoretically sounder."
    )
