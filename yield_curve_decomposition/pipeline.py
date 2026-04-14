"""
Yield Curve Decomposition — Full Pipeline Runner
=================================================
Runs the end-to-end ACM yield curve decomposition for Malaysian interest rates
(KLIBOR 3M and MYOR overnight rate).

Usage
-----
# Using synthetic demo data (no files needed):
    python pipeline.py --demo

# Using real CSV/Excel files:
    python pipeline.py \\
        --klibor klibor_data.csv \\
        --myor   myor_data.csv   \\
        --klibor-date-col date   \\
        --klibor-rate-col klibor_3m \\
        --myor-date-col date     \\
        --myor-rate-col myor     \\
        --n-factors 3            \\
        --bootstrap              \\
        --output-dir ./output

Pipeline Steps
--------------
1.  Load and preprocess KLIBOR + MYOR data.
2.  Construct 3M compounded risk-free rate from MYOR.
3.  Build yield curve proxy matrix (synthetic or Nelson-Siegel).
4.  Extract PCA factors (level / slope / curvature).
5.  Estimate VAR(1) on PCA factors.
6.  Compute excess bond holding-period returns.
7.  Run ACM OLS regression.
8.  Estimate market price of risk (lambda_0, lambda_1).
9.  Reconstruct fitted and risk-neutral yields → term premium.
10. Decompose KLIBOR into: risk-free + term premium + credit premium.
11. Validation diagnostics + (optional) bias-corrected VAR.
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")   # non-interactive backend for pipeline use

# ---------------------------------------------------------------------------
# Import all modules (using relative imports within the package)
# ---------------------------------------------------------------------------

import importlib, sys as _sys
_pkg = "yield_curve_decomposition"

def _import(module_file, *names):
    """Import names from a numerically-prefixed submodule via importlib."""
    spec = importlib.util.spec_from_file_location(
        module_file,
        Path(__file__).parent / "yield_curve_decomposition" / (module_file + ".py")
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return tuple(getattr(mod, n) for n in names)

_m01 = _import("01_data_ingestion",
               "generate_synthetic_data", "merge_and_clean", "load_and_preprocess")
generate_synthetic_data, merge_and_clean, load_and_preprocess = _m01

_m02 = _import("02_myor_term_rate", "add_myor_3m_to_df")
add_myor_3m_to_df, = _m02

_m03 = _import("03_yield_curve_proxy", "build_yield_curve_matrix")
build_yield_curve_matrix, = _m03

_m04 = _import("04_pca_factors",
               "extract_pca_factors", "plot_explained_variance",
               "plot_factor_loadings", "plot_factor_time_series")
extract_pca_factors, plot_explained_variance, plot_factor_loadings, plot_factor_time_series = _m04

_m05 = _import("05_var_model", "estimate_var", "check_stability")
estimate_var, check_stability = _m05

_m06 = _import("06_excess_returns", "compute_excess_returns", "build_regression_dataset")
compute_excess_returns, build_regression_dataset = _m06

_m07 = _import("07_acm_regression", "run_acm_regression", "parse_regression_output")
run_acm_regression, parse_regression_output = _m07

_m08 = _import("08_market_price_of_risk",
               "estimate_market_price_of_risk", "compute_lambda_time_series")
estimate_market_price_of_risk, compute_lambda_time_series = _m08

_m09 = _import("09_reconstruct_yields",
               "estimate_short_rate_loadings", "reconstruct_yields", "plot_yield_decomposition")
estimate_short_rate_loadings, reconstruct_yields, plot_yield_decomposition = _m09

_m10 = _import("10_credit_premium",
               "compute_credit_premium", "verify_decomposition",
               "plot_klibor_decomposition", "summarise_decomposition")
compute_credit_premium, verify_decomposition, plot_klibor_decomposition, summarise_decomposition = _m10

_m11 = _import("11_validation",
               "summary_statistics", "correlation_analysis", "rolling_stability",
               "plot_diagnostic_dashboard", "bootstrap_bias_correction", "compare_term_premiums")
summary_statistics, correlation_analysis, rolling_stability, plot_diagnostic_dashboard, bootstrap_bias_correction, compare_term_premiums = _m11


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def run_pipeline(klibor_path: str | None = None,
                 myor_path: str | None = None,
                 klibor_date_col: str = "date",
                 klibor_rate_col: str = "klibor_3m",
                 myor_date_col: str = "date",
                 myor_rate_col: str = "myor",
                 n_factors: int = 3,
                 run_bootstrap: bool = False,
                 n_bootstrap: int = 500,
                 output_dir: str = "./output",
                 demo_mode: bool = False) -> dict:
    """Execute the full decomposition pipeline.

    Parameters
    ----------
    klibor_path : str or None
        Path to KLIBOR data file.  Required unless demo_mode=True.
    myor_path : str or None
        Path to MYOR data file.  Required unless demo_mode=True.
    klibor_date_col, klibor_rate_col : str
        Column names in the KLIBOR file.
    myor_date_col, myor_rate_col : str
        Column names in the MYOR file.
    n_factors : int
        Number of PCA components to retain.
    run_bootstrap : bool
        If True, also run bias-corrected VAR bootstrap (slow).
    n_bootstrap : int
        Number of bootstrap replications (only used if run_bootstrap=True).
    output_dir : str
        Directory to save output files (plots, CSV results).
    demo_mode : bool
        If True, use synthetic data (ignores klibor_path / myor_path).

    Returns
    -------
    dict
        All intermediate and final results:
            'merged', 'curve', 'pca', 'var', 'acm', 'mpr',
            'yields_ols', 'decomp', 'validation', (optional) 'bc'
    """
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("KLIBOR Yield Curve Decomposition — ACM Method")
    print("=" * 60)

    # ------------------------------------------------------------------
    # Step 1: Load and preprocess data
    # ------------------------------------------------------------------
    print("\n[Step 1] Loading and preprocessing data...")
    if demo_mode:
        klibor_raw, myor_raw = generate_synthetic_data()
        merged = merge_and_clean(klibor_raw, myor_raw)
    else:
        merged = load_and_preprocess(
            klibor_path, myor_path,
            klibor_date_col=klibor_date_col,
            klibor_rate_col=klibor_rate_col,
            myor_date_col=myor_date_col,
            myor_rate_col=myor_rate_col,
        )
    print(f"  Loaded {len(merged)} daily observations.")
    print(f"  Date range: {merged.index.min().date()} → {merged.index.max().date()}")

    # ------------------------------------------------------------------
    # Step 2: MYOR 3M compounded
    # ------------------------------------------------------------------
    print("\n[Step 2] Constructing MYOR 3M compounded rate...")
    merged = add_myor_3m_to_df(merged)
    print(f"  myor_3m_compounded added. Mean = "
          f"{merged['myor_3m_compounded'].mean():.4f}%")

    # ------------------------------------------------------------------
    # Step 3: Yield curve matrix
    # ------------------------------------------------------------------
    print("\n[Step 3] Building yield curve proxy matrix...")
    curve = build_yield_curve_matrix(merged).dropna()
    print(f"  Yield matrix shape: {curve.shape}")
    print(f"  Columns: {list(curve.columns)}")

    # ------------------------------------------------------------------
    # Step 4: PCA factors
    # ------------------------------------------------------------------
    print(f"\n[Step 4] Extracting {n_factors} PCA factors...")
    pca = extract_pca_factors(curve, n_components=n_factors)
    Xt  = pca["factors"]
    print("  Explained variance per PC:")
    for i, ev in enumerate(pca["explained_var"]):
        print(f"    PC{i+1}: {ev*100:.2f}%  "
              f"(cumulative {pca['cumulative_var'][i]*100:.2f}%)")

    # Save PCA plots
    plot_explained_variance(pca["explained_var"], pca["cumulative_var"],
                             save_path=str(out_dir / "04_pca_explained_variance.png"))
    plot_factor_loadings(pca["loadings"],
                          save_path=str(out_dir / "04_pca_loadings.png"))
    plot_factor_time_series(Xt,
                             save_path=str(out_dir / "04_pca_factors.png"))

    # ------------------------------------------------------------------
    # Step 5: VAR(1) model
    # ------------------------------------------------------------------
    print("\n[Step 5] Estimating VAR(1) on PCA factors...")
    var_out = estimate_var(Xt, lag_order=1)
    stab    = check_stability(var_out["Phi"])
    print(f"  VAR stability: {'STABLE' if stab['is_stable'] else 'UNSTABLE'}"
          f"  (max |eigenvalue| = {stab['max_modulus']:.6f})")
    print(f"  AIC: {var_out['aic']:.4f}   BIC: {var_out['bic']:.4f}")

    # ------------------------------------------------------------------
    # Step 6: Excess returns
    # ------------------------------------------------------------------
    print("\n[Step 6] Computing excess bond returns...")
    short_rate = merged.reindex(curve.index)["myor"]
    rx  = compute_excess_returns(curve, short_rate)
    reg = build_regression_dataset(rx, Xt, var_out["residuals"])
    print(f"  Excess returns shape: {rx.shape}")
    print(f"  Regression dataset: y={reg['y'].shape}, X={reg['X'].shape}")

    # ------------------------------------------------------------------
    # Step 7: ACM regression
    # ------------------------------------------------------------------
    print("\n[Step 7] Running ACM OLS regression...")
    acm    = run_acm_regression(reg["y"], reg["X"])
    parsed = parse_regression_output(acm["coef"], n_factors=n_factors,
                                      n_residuals=n_factors)
    print(f"  R² per tenor: {acm['R2'].to_dict()}")

    # ------------------------------------------------------------------
    # Step 8: Market price of risk
    # ------------------------------------------------------------------
    print("\n[Step 8] Estimating market price of risk (lambda_0, lambda_1)...")
    mpr = estimate_market_price_of_risk(
        mu=var_out["mu"],
        Phi=var_out["Phi"],
        Sigma=var_out["Sigma"],
        a=parsed["a"],
        b=parsed["b"],
        c=parsed["c"],
    )
    print("  lambda_0 (constant):")
    print("   ", mpr["lambda_0"].to_dict())

    # ------------------------------------------------------------------
    # Step 9: Reconstruct yields and term premium
    # ------------------------------------------------------------------
    print("\n[Step 9] Reconstructing yields and term premium (OLS)...")
    d0, d1 = estimate_short_rate_loadings(
        Xt, short_rate.reindex(Xt.index).ffill()
    )
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
    print(f"  3M Term Premium: mean={tp_ols_3m.mean():.4f}%  "
          f"std={tp_ols_3m.std():.4f}%")

    plot_yield_decomposition(
        yields_ols["fitted_yields"],
        yields_ols["rn_yields"],
        yields_ols["term_premium"],
        tenor_label="y_3m",
        save_path=str(out_dir / "09_yield_decomposition.png"),
    )

    # ------------------------------------------------------------------
    # Step 10: Credit premium decomposition
    # ------------------------------------------------------------------
    print("\n[Step 10] Decomposing KLIBOR into components...")
    klibor_3m    = merged["klibor_3m"]
    myor_3m_cmpd = merged["myor_3m_compounded"]
    decomp = compute_credit_premium(klibor_3m, myor_3m_cmpd, tp_ols_3m)

    verify_decomposition(decomp)
    print("\nComponent summary:")
    print(summarise_decomposition(decomp))

    decomp.to_csv(out_dir / "10_decomposition.csv")
    plot_klibor_decomposition(
        decomp,
        save_path=str(out_dir / "10_klibor_decomposition.png")
    )

    # ------------------------------------------------------------------
    # Step 11: Validation and diagnostics
    # ------------------------------------------------------------------
    print("\n[Step 11] Running validation diagnostics...")
    val_stats   = summary_statistics(decomp)
    corr_result = correlation_analysis(decomp)
    rolling     = rolling_stability(decomp, window=252)

    print("\nPearson correlations:")
    print(corr_result["pearson"])

    plot_diagnostic_dashboard(
        decomp, rolling,
        save_path=str(out_dir / "11_diagnostic_dashboard.png")
    )

    # Optional: bias-corrected VAR
    bc_result = None
    if run_bootstrap:
        print(f"\n[Step 11b] Bias-corrected VAR ({n_bootstrap} bootstrap "
              "replications)...")
        bc_result = bootstrap_bias_correction(Xt, n_bootstrap=n_bootstrap, seed=42)

        mpr_bc = estimate_market_price_of_risk(
            mu=bc_result["mu_OLS"],
            Phi=bc_result["Phi_corrected"],
            Sigma=bc_result["Sigma"],
            a=parsed["a"],
            b=parsed["b"],
            c=parsed["c"],
        )
        yields_bc = reconstruct_yields(
            factors_df=Xt,
            mu=bc_result["mu_OLS"].values,
            Phi=bc_result["Phi_corrected"].values,
            mu_Q=mpr_bc["mu_Q"].values,
            Phi_Q=mpr_bc["Phi_Q"].values,
            Sigma=bc_result["Sigma"].values,
            delta_0=d0,
            delta_1=d1,
        )
        tp_bc_3m = yields_bc["term_premium"]["y_3m"]

        compare_term_premiums(
            tp_ols_3m, tp_bc_3m,
            save_path=str(out_dir / "11b_bias_correction_comparison.png")
        )

        bc_result["tp_bc_3m"] = tp_bc_3m
        bc_result["mpr_bc"]   = mpr_bc
        bc_result["yields_bc"] = yields_bc

    print(f"\n{'=' * 60}")
    print(f"Pipeline complete.  Results saved to: {out_dir}")
    print(f"{'=' * 60}\n")

    return dict(
        merged=merged,
        curve=curve,
        pca=pca,
        var=var_out,
        acm=acm,
        mpr=mpr,
        yields_ols=yields_ols,
        decomp=decomp,
        validation=dict(stats=val_stats, corr=corr_result, rolling=rolling),
        bc=bc_result,
    )


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="KLIBOR yield curve decomposition (ACM method)"
    )
    p.add_argument("--demo", action="store_true",
                   help="Run with synthetic demo data (no files needed).")
    p.add_argument("--klibor", default=None,
                   help="Path to KLIBOR data file (.csv / .xls / .xlsx).")
    p.add_argument("--myor", default=None,
                   help="Path to MYOR data file (.csv / .xls / .xlsx).")
    p.add_argument("--klibor-date-col", default="date")
    p.add_argument("--klibor-rate-col", default="klibor_3m")
    p.add_argument("--myor-date-col",   default="date")
    p.add_argument("--myor-rate-col",   default="myor")
    p.add_argument("--n-factors", type=int, default=3,
                   help="Number of PCA factors to retain (default: 3).")
    p.add_argument("--bootstrap", action="store_true",
                   help="Also run bias-corrected VAR (Kilian 1998).")
    p.add_argument("--n-bootstrap", type=int, default=500,
                   help="Bootstrap replications (default: 500).")
    p.add_argument("--output-dir", default="./output",
                   help="Directory for output files (default: ./output).")
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()

    if not args.demo and (args.klibor is None or args.myor is None):
        print("ERROR: Provide --klibor and --myor paths, or use --demo mode.")
        sys.exit(1)

    run_pipeline(
        klibor_path=args.klibor,
        myor_path=args.myor,
        klibor_date_col=args.klibor_date_col,
        klibor_rate_col=args.klibor_rate_col,
        myor_date_col=args.myor_date_col,
        myor_rate_col=args.myor_rate_col,
        n_factors=args.n_factors,
        run_bootstrap=args.bootstrap,
        n_bootstrap=args.n_bootstrap,
        output_dir=args.output_dir,
        demo_mode=args.demo,
    )
