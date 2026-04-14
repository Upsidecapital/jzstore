"""
PROMPT 4 — Extract Yield Curve Factors (PCA)
=============================================
Apply Principal Component Analysis to the yield curve matrix to extract
the latent factors that drive yield curve movements.

Economic Interpretation of the Principal Components
----------------------------------------------------
PC1 — Level (parallel shift):
    All factor loadings have the same sign.  A positive PC1 shock shifts
    the entire yield curve up or down uniformly.

PC2 — Slope (tilt / steepening):
    Loadings alternate in sign across maturities (positive at the short end,
    negative at the long end, or vice versa).  Captures steepening /
    flattening of the curve.

PC3 — Curvature (hump / butterfly):
    Loadings have a hump shape (positive at the extremes, negative in the
    middle, or vice versa).  Captures changes in the curvature / convexity
    of the yield curve.

Together these three components typically explain > 95% of yield curve variance.
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA


# ---------------------------------------------------------------------------
# Core PCA extraction
# ---------------------------------------------------------------------------

def extract_pca_factors(yield_matrix: pd.DataFrame,
                         n_components: int = 4,
                         standardize: bool = True) -> dict:
    """Standardise the yield matrix and extract PCA factors.

    Parameters
    ----------
    yield_matrix : pd.DataFrame
        Shape (T, M) — T dates, M maturities.  No NaNs allowed; call
        ``yield_matrix.dropna()`` before passing.
    n_components : int
        Number of principal components to retain (typically 3–5).
    standardize : bool
        If True (recommended), standardise each column to zero mean and
        unit variance before PCA so that no single tenor dominates.

    Returns
    -------
    dict with keys:
        'factors'         : pd.DataFrame (T × n_components) — PC time series.
        'loadings'        : pd.DataFrame (n_components × M) — PC loadings.
        'explained_var'   : np.ndarray — explained variance ratio per PC.
        'cumulative_var'  : np.ndarray — cumulative explained variance.
        'scaler'          : fitted StandardScaler (or None if standardize=False).
        'pca'             : fitted sklearn PCA object.
        'yield_matrix_std': pd.DataFrame — standardised yield matrix.
    """
    yield_matrix = yield_matrix.dropna()

    # Step 1: Standardise (subtract mean, divide by std) per tenor column
    if standardize:
        scaler = StandardScaler()
        X_std  = scaler.fit_transform(yield_matrix.values)
        X_std  = pd.DataFrame(X_std,
                               index=yield_matrix.index,
                               columns=yield_matrix.columns)
    else:
        scaler = None
        X_std  = yield_matrix.copy()

    # Step 2: Fit PCA
    pca = PCA(n_components=n_components, random_state=42)
    factors_array = pca.fit_transform(X_std.values)

    # Build factor DataFrame with interpretable column names
    col_labels = [f"PC{i+1}" for i in range(n_components)]
    factors_df = pd.DataFrame(factors_array,
                               index=yield_matrix.index,
                               columns=col_labels)

    # Build loadings DataFrame (n_components × n_tenors)
    loadings_df = pd.DataFrame(pca.components_,
                                index=col_labels,
                                columns=yield_matrix.columns)

    explained     = pca.explained_variance_ratio_
    cumulative    = np.cumsum(explained)

    return dict(
        factors=factors_df,
        loadings=loadings_df,
        explained_var=explained,
        cumulative_var=cumulative,
        scaler=scaler,
        pca=pca,
        yield_matrix_std=X_std,
    )


# ---------------------------------------------------------------------------
# Plotting utilities
# ---------------------------------------------------------------------------

def plot_explained_variance(explained_var: np.ndarray,
                             cumulative_var: np.ndarray,
                             save_path: str | None = None) -> None:
    """Bar + line chart of explained variance ratio by component.

    Parameters
    ----------
    explained_var : np.ndarray
        Per-component explained variance ratios (from PCA result dict).
    cumulative_var : np.ndarray
        Cumulative explained variance ratios.
    save_path : str or None
        If provided, save the figure to this path instead of showing it.
    """
    n = len(explained_var)
    labels = [f"PC{i+1}" for i in range(n)]

    fig, ax1 = plt.subplots(figsize=(8, 4))

    # Bar: individual explained variance
    ax1.bar(labels, explained_var * 100, color="steelblue", alpha=0.7,
            label="Individual")
    ax1.set_ylabel("Explained Variance (%)", color="steelblue")
    ax1.set_ylim(0, 100)
    ax1.tick_params(axis="y", labelcolor="steelblue")

    # Line: cumulative explained variance
    ax2 = ax1.twinx()
    ax2.plot(labels, cumulative_var * 100, color="crimson", marker="o",
             linewidth=2, label="Cumulative")
    ax2.set_ylabel("Cumulative Variance (%)", color="crimson")
    ax2.set_ylim(0, 105)
    ax2.tick_params(axis="y", labelcolor="crimson")
    ax2.axhline(y=95, color="crimson", linestyle="--", alpha=0.4,
                label="95% threshold")

    ax1.set_title("PCA — Explained Variance by Component")
    fig.legend(loc="lower right", bbox_to_anchor=(0.88, 0.15))
    plt.tight_layout()

    if save_path:
        plt.savefig(save_path, dpi=150)
        print(f"Saved explained variance plot to: {save_path}")
    else:
        plt.show()
    plt.close()


def plot_factor_loadings(loadings_df: pd.DataFrame,
                          save_path: str | None = None) -> None:
    """Plot PC loadings across maturities to visualise level/slope/curvature.

    Parameters
    ----------
    loadings_df : pd.DataFrame
        Shape (n_components × n_tenors).  Index = PC labels, columns = tenors.
    save_path : str or None
        If provided, save figure instead of displaying.
    """
    n_pcs = len(loadings_df)
    fig, axes = plt.subplots(1, n_pcs, figsize=(4 * n_pcs, 4), sharey=False)

    if n_pcs == 1:
        axes = [axes]

    interpretations = {
        "PC1": "Level (parallel shift)",
        "PC2": "Slope (tilt)",
        "PC3": "Curvature (hump)",
    }

    for ax, (pc_label, loading_row) in zip(axes, loadings_df.iterrows()):
        ax.bar(loading_row.index, loading_row.values, color="steelblue",
               alpha=0.75)
        ax.axhline(0, color="black", linewidth=0.8)
        ax.set_title(f"{pc_label}: {interpretations.get(pc_label, '')}")
        ax.set_xlabel("Tenor")
        ax.set_ylabel("Loading")
        ax.tick_params(axis="x", rotation=45)

    plt.suptitle("PCA Factor Loadings — Yield Curve", y=1.02, fontsize=12)
    plt.tight_layout()

    if save_path:
        plt.savefig(save_path, dpi=150)
        print(f"Saved loadings plot to: {save_path}")
    else:
        plt.show()
    plt.close()


def plot_factor_time_series(factors_df: pd.DataFrame,
                             save_path: str | None = None) -> None:
    """Plot the extracted PC factor time series.

    Parameters
    ----------
    factors_df : pd.DataFrame
        Shape (T × n_components) output of extract_pca_factors.
    save_path : str or None
        If provided, save instead of show.
    """
    n_pcs = factors_df.shape[1]
    fig, axes = plt.subplots(n_pcs, 1, figsize=(12, 3 * n_pcs), sharex=True)

    if n_pcs == 1:
        axes = [axes]

    for ax, col in zip(axes, factors_df.columns):
        ax.plot(factors_df.index, factors_df[col], linewidth=0.8,
                color="steelblue")
        ax.axhline(0, color="black", linewidth=0.6, linestyle="--")
        ax.set_ylabel(col)
        ax.set_title(f"Factor Time Series: {col}")

    plt.suptitle("PCA Factors — Yield Curve (X_t)", fontsize=13)
    plt.xlabel("Date")
    plt.tight_layout()

    if save_path:
        plt.savefig(save_path, dpi=150)
        print(f"Saved factor time series to: {save_path}")
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

    print("=== Module 04: PCA Yield Curve Factors ===\n")

    klibor_raw, myor_raw = generate_synthetic_data()
    merged = merge_and_clean(klibor_raw, myor_raw)
    merged = add_myor_3m_to_df(merged)
    curve  = build_yield_curve_matrix(merged).dropna()

    result = extract_pca_factors(curve, n_components=4)

    print("Explained variance per PC:")
    for i, ev in enumerate(result["explained_var"]):
        cumv = result["cumulative_var"][i]
        print(f"  PC{i+1}: {ev*100:6.2f}%  (cumulative {cumv*100:.2f}%)")

    print("\nFactor time series shape:", result["factors"].shape)
    print("\nFirst 5 rows of factors (X_t):")
    print(result["factors"].head())

    print("\nPC loadings (interpretable as level / slope / curvature):")
    print(result["loadings"])
