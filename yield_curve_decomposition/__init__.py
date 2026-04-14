"""
Yield Curve Decomposition Package
==================================
Malaysian interest rate term premium decomposition using the
Adrian-Crump-Moench (ACM) methodology.

Modules:
    01_data_ingestion       — Load and preprocess KLIBOR / MYOR data
    02_myor_term_rate       — Construct 3M compounded rate from overnight MYOR
    03_yield_curve_proxy    — Build yield curve matrix (Nelson-Siegel / synthetic)
    04_pca_factors          — Extract level/slope/curvature factors via PCA
    05_var_model            — VAR(1) on PCA factors
    06_excess_returns       — Construct excess bond returns
    07_acm_regression       — OLS regression (ACM Step)
    08_market_price_of_risk — Estimate lambda_0, lambda_1
    09_reconstruct_yields   — Fitted yields, risk-neutral yields, term premium
    10_credit_premium       — KLIBOR decomposition into components
    11_validation           — Model diagnostics and bias-corrected VAR
"""
