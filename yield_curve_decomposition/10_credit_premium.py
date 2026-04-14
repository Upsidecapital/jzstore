"""
PROMPT 10 — Extract Credit Premium from KLIBOR
================================================
Decompose the 3-month KLIBOR into three additive components:

    KLIBOR_3M = MYOR_3M_compounded + term_premium + credit_premium

Therefore:

    credit_premium = KLIBOR_3M - MYOR_3M_compounded - term_premium

Economic Interpretation
-----------------------
KLIBOR (Kuala Lumpur Interbank Offered Rate) is a rate at which banks lend
unsecured funds to each other.  It contains three premia over the risk-free rate:

1. MYOR_3M_compounded (risk-free component):
   Represents the pure cost of money — what the central bank charges at the
   shortest term, compounded over 90 days.  This is the theoretical
   risk-free 3M rate under no term or credit risk.

2. Term premium:
   Compensation investors require for locking in money for 3 months versus
   rolling overnight.  This is driven by interest-rate uncertainty (duration
   risk) and extracted by the ACM model.

3. Credit premium:
   The residual reflects counterparty / credit risk inherent in unsecured
   interbank lending.  It rises during banking stress, liquidity squeezes,
   or periods of elevated credit concern among banks.

Note: In practice, credit_premium may also capture:
   - Liquidity risk premium (bid-offer spread, market depth)
   - Regulatory / balance-sheet cost
   - Model mis-specification / noise
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates


# ---------------------------------------------------------------------------
# Decomposition
# ---------------------------------------------------------------------------

def compute_credit_premium(klibor_3m: pd.Series,
                            myor_3m_compounded: pd.Series,
                            term_premium_3m: pd.Series) -> pd.DataFrame:
    """Decompose KLIBOR into risk-free, term premium, and credit premium.

    Parameters
    ----------
    klibor_3m : pd.Series
        3-month KLIBOR rate in %, daily.
    myor_3m_compounded : pd.Series
        Compounded overnight rate over 90 days (%, daily), from Module 02.
    term_premium_3m : pd.Series
        3M term premium from ACM model (%), from Module 09.

    Returns
    -------
    pd.DataFrame
        Columns:
            'klibor_3m'          — raw KLIBOR (observed).
            'myor_3m_compounded' — risk-free component.
            'term_premium'       — ACM model term premium.
            'credit_premium'     — residual credit / liquidity premium.
        Index: common DatetimeIndex.
    """
    # Align all series to a common daily index
    common_idx = (klibor_3m.dropna().index
                  .intersection(myor_3m_compounded.dropna().index)
                  .intersection(term_premium_3m.dropna().index))

    klibor  = klibor_3m.loc[common_idx]
    myor_3m = myor_3m_compounded.loc[common_idx]
    tp      = term_premium_3m.loc[common_idx]

    credit  = klibor - myor_3m - tp

    result = pd.DataFrame({
        "klibor_3m":          klibor,
        "myor_3m_compounded": myor_3m,
        "term_premium":       tp,
        "credit_premium":     credit,
    }, index=common_idx)

    return result


# ---------------------------------------------------------------------------
# Verification: components sum check
# ---------------------------------------------------------------------------

def verify_decomposition(decomp_df: pd.DataFrame,
                          tol: float = 1e-8) -> bool:
    """Verify that myor + term_premium + credit_premium ≈ klibor.

    Parameters
    ----------
    decomp_df : pd.DataFrame
        Output of compute_credit_premium.
    tol : float
        Acceptable maximum absolute difference.

    Returns
    -------
    bool
        True if decomposition sums correctly within tolerance.
    """
    reconstructed = (decomp_df["myor_3m_compounded"]
                     + decomp_df["term_premium"]
                     + decomp_df["credit_premium"])
    max_error = (reconstructed - decomp_df["klibor_3m"]).abs().max()
    if max_error < tol:
        print(f"Decomposition check PASSED (max error = {max_error:.2e})")
        return True
    else:
        print(f"Decomposition check FAILED (max error = {max_error:.4f})")
        return False


# ---------------------------------------------------------------------------
# Plotting
# ---------------------------------------------------------------------------

def plot_klibor_decomposition(decomp_df: pd.DataFrame,
                               save_path: str | None = None) -> None:
    """Stacked-area + line chart showing KLIBOR decomposition over time.

    Parameters
    ----------
    decomp_df : pd.DataFrame
        Output of compute_credit_premium.
    save_path : str or None
        If provided, save to file instead of showing.
    """
    fig, axes = plt.subplots(3, 1, figsize=(13, 10), sharex=True)

    # Panel 1: All components as individual lines
    ax = axes[0]
    ax.plot(decomp_df.index, decomp_df["klibor_3m"],
            label="KLIBOR 3M (observed)", color="black", linewidth=1.4)
    ax.plot(decomp_df.index, decomp_df["myor_3m_compounded"],
            label="MYOR 3M compounded (risk-free)", color="green", linewidth=1.0)
    ax.plot(decomp_df.index, decomp_df["term_premium"],
            label="Term premium", color="steelblue", linewidth=1.0, linestyle="--")
    ax.plot(decomp_df.index, decomp_df["credit_premium"],
            label="Credit premium", color="crimson", linewidth=1.0, linestyle="-.")
    ax.set_ylabel("Rate (%)")
    ax.set_title("KLIBOR 3M Decomposition — All Components")
    ax.legend(loc="upper right", fontsize=9)
    ax.grid(alpha=0.3)

    # Panel 2: Stacked fill (components)
    ax2 = axes[1]
    ax2.stackplot(decomp_df.index,
                  decomp_df["myor_3m_compounded"].clip(lower=0),
                  decomp_df["term_premium"].clip(lower=0),
                  decomp_df["credit_premium"].clip(lower=0),
                  labels=["Risk-free (MYOR 3M)", "Term Premium", "Credit Premium"],
                  colors=["green", "steelblue", "crimson"],
                  alpha=0.55)
    ax2.plot(decomp_df.index, decomp_df["klibor_3m"],
             color="black", linewidth=1.2, label="KLIBOR 3M")
    ax2.set_ylabel("Rate (%)")
    ax2.set_title("Stacked Components (positive contributions)")
    ax2.legend(loc="upper right", fontsize=9)
    ax2.grid(alpha=0.3)

    # Panel 3: Credit premium alone
    ax3 = axes[2]
    ax3.fill_between(decomp_df.index, decomp_df["credit_premium"], 0,
                     where=(decomp_df["credit_premium"] >= 0),
                     color="crimson", alpha=0.45, label="Credit premium > 0")
    ax3.fill_between(decomp_df.index, decomp_df["credit_premium"], 0,
                     where=(decomp_df["credit_premium"] < 0),
                     color="blue", alpha=0.35, label="Credit premium < 0")
    ax3.plot(decomp_df.index, decomp_df["credit_premium"],
             color="crimson", linewidth=0.8)
    ax3.axhline(0, color="black", linewidth=0.8)
    ax3.set_ylabel("Credit Premium (%)")
    ax3.set_xlabel("Date")
    ax3.set_title("Credit Premium (= KLIBOR − MYOR 3M − Term Premium)")
    ax3.legend(fontsize=9)
    ax3.grid(alpha=0.3)

    # Format x-axis dates
    for ax in axes:
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
        ax.xaxis.set_major_locator(mdates.YearLocator())

    plt.suptitle("KLIBOR 3M Yield Decomposition", fontsize=14, y=1.01)
    plt.tight_layout()

    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches="tight")
        print(f"Saved decomposition plot to: {save_path}")
    else:
        plt.show()
    plt.close()


def summarise_decomposition(decomp_df: pd.DataFrame) -> pd.DataFrame:
    """Print summary statistics for each component.

    Parameters
    ----------
    decomp_df : pd.DataFrame
        Output of compute_credit_premium.

    Returns
    -------
    pd.DataFrame
        Summary statistics table.
    """
    stats = decomp_df.describe().T
    stats["share_of_klibor_mean%"] = (
        decomp_df.mean() / decomp_df["klibor_3m"].mean() * 100
    )
    return stats


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
    from _09_reconstruct_yields import (estimate_short_rate_loadings,
                                         reconstruct_yields)

    print("=== Module 10: KLIBOR Credit Premium Decomposition ===\n")

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

    yields_out = reconstruct_yields(
        factors_df=Xt,
        mu=var_out["mu"].values,
        Phi=var_out["Phi"].values,
        mu_Q=mpr["mu_Q"].values,
        Phi_Q=mpr["Phi_Q"].values,
        Sigma=var_out["Sigma"].values,
        delta_0=d0,
        delta_1=d1,
    )

    # Use 3M term premium column
    tp_3m = yields_out["term_premium"]["y_3m"]

    # Align KLIBOR and MYOR 3M
    klibor_3m       = merged["klibor_3m"]
    myor_3m_cmpd    = merged["myor_3m_compounded"]

    decomp = compute_credit_premium(klibor_3m, myor_3m_cmpd, tp_3m)

    print(f"Decomposition shape: {decomp.shape}")
    print("\nFirst 5 rows:")
    print(decomp.head())
    print("\nDecomposition summary:")
    print(summarise_decomposition(decomp))

    verify_decomposition(decomp)
