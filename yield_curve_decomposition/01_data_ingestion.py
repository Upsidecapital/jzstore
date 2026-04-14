"""
PROMPT 1 — Data Ingestion & Preprocessing
==========================================
Load and preprocess time series data for:
  - 3-month KLIBOR (Kuala Lumpur Interbank Offered Rate)
  - MYOR (Malaysia Overnight Rate, i.e. the overnight policy rate proxy)

The output is a clean merged DataFrame with columns:
  [date, klibor_3m, myor]
"""

import pandas as pd
import numpy as np
from pathlib import Path


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def load_klibor(filepath: str | Path, date_col: str = "date",
                rate_col: str = "klibor_3m") -> pd.DataFrame:
    """Load 3-month KLIBOR from a CSV or Excel file.

    Parameters
    ----------
    filepath : str | Path
        Path to the source file (.csv, .xls, or .xlsx).
    date_col : str
        Name of the column containing dates.
    rate_col : str
        Name of the column containing the 3-month KLIBOR rate
        (expected as a percentage, e.g. 3.50 means 3.50%).

    Returns
    -------
    pd.DataFrame
        Single-column DataFrame indexed by date, column 'klibor_3m'.
    """
    df = _read_file(filepath, date_col)
    df = df[[rate_col]].rename(columns={rate_col: "klibor_3m"})
    return df


def load_myor(filepath: str | Path, date_col: str = "date",
              rate_col: str = "myor") -> pd.DataFrame:
    """Load MYOR (overnight rate) from a CSV or Excel file.

    Parameters
    ----------
    filepath : str | Path
        Path to the source file (.csv, .xls, or .xlsx).
    date_col : str
        Name of the column containing dates.
    rate_col : str
        Name of the column containing the overnight rate
        (expected as a percentage).

    Returns
    -------
    pd.DataFrame
        Single-column DataFrame indexed by date, column 'myor'.
    """
    df = _read_file(filepath, date_col)
    df = df[[rate_col]].rename(columns={rate_col: "myor"})
    return df


def merge_and_clean(klibor_df: pd.DataFrame, myor_df: pd.DataFrame,
                    freq: str = "D") -> pd.DataFrame:
    """Align both series to the same frequency and merge into one DataFrame.

    Steps
    -----
    1. Reindex both series to a common daily date range.
    2. Forward-fill missing values (carries last known rate forward on
       non-business days / public holidays).
    3. Drop any remaining NaN rows that appear before the first observation
       of either series.

    Parameters
    ----------
    klibor_df : pd.DataFrame
        Output of :func:`load_klibor`.
    myor_df : pd.DataFrame
        Output of :func:`load_myor`.
    freq : str
        Pandas frequency alias for resampling ('D' = calendar daily).

    Returns
    -------
    pd.DataFrame
        Merged DataFrame with columns ['klibor_3m', 'myor'], DatetimeIndex
        named 'date'.
    """
    # Determine the overlapping date range
    start = max(klibor_df.index.min(), myor_df.index.min())
    end   = min(klibor_df.index.max(), myor_df.index.max())

    # Build a continuous date range at the target frequency
    full_index = pd.date_range(start=start, end=end, freq=freq, name="date")

    # Reindex both series then forward-fill gaps (e.g. weekends, holidays)
    klibor_reindexed = klibor_df.reindex(full_index).ffill()
    myor_reindexed   = myor_df.reindex(full_index).ffill()

    # Merge side by side
    merged = pd.concat([klibor_reindexed, myor_reindexed], axis=1)

    # Drop leading rows where either series has no data yet
    merged = merged.dropna()

    return merged


def load_and_preprocess(klibor_path: str | Path,
                        myor_path: str | Path,
                        klibor_date_col: str = "date",
                        klibor_rate_col: str = "klibor_3m",
                        myor_date_col: str = "date",
                        myor_rate_col: str = "myor",
                        freq: str = "D") -> pd.DataFrame:
    """End-to-end convenience wrapper: load → clean → merge.

    Parameters
    ----------
    klibor_path : str | Path
        Path to KLIBOR data file.
    myor_path : str | Path
        Path to MYOR data file.
    klibor_date_col, klibor_rate_col : str
        Column names in the KLIBOR file.
    myor_date_col, myor_rate_col : str
        Column names in the MYOR file.
    freq : str
        Output frequency alias ('D' = daily).

    Returns
    -------
    pd.DataFrame
        Clean merged DataFrame with columns ['klibor_3m', 'myor'].
    """
    klibor_df = load_klibor(klibor_path,
                             date_col=klibor_date_col,
                             rate_col=klibor_rate_col)
    myor_df   = load_myor(myor_path,
                           date_col=myor_date_col,
                           rate_col=myor_rate_col)
    return merge_and_clean(klibor_df, myor_df, freq=freq)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _read_file(filepath: str | Path, date_col: str) -> pd.DataFrame:
    """Read a CSV or Excel file and set the date column as a DatetimeIndex.

    Parameters
    ----------
    filepath : str | Path
        Source file path.
    date_col : str
        Column name that holds date strings / values.

    Returns
    -------
    pd.DataFrame
        DataFrame with a DatetimeIndex named 'date'.

    Raises
    ------
    ValueError
        If the file extension is not recognised.
    """
    filepath = Path(filepath)
    ext = filepath.suffix.lower()

    if ext == ".csv":
        # parse_dates converts the column to datetime64 automatically
        df = pd.read_csv(filepath, parse_dates=[date_col])
    elif ext in {".xls", ".xlsx"}:
        df = pd.read_excel(filepath, parse_dates=[date_col])
    else:
        raise ValueError(
            f"Unsupported file extension '{ext}'. "
            "Expected .csv, .xls, or .xlsx."
        )

    # Rename date column to 'date' for consistency
    df = df.rename(columns={date_col: "date"})

    # Sort chronologically and set as index
    df = df.sort_values("date").set_index("date")
    df.index.name = "date"

    return df


# ---------------------------------------------------------------------------
# Demo / synthetic data generator (for testing without real files)
# ---------------------------------------------------------------------------

def generate_synthetic_data(start: str = "2010-01-01",
                             end: str = "2024-12-31",
                             seed: int = 42) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Generate synthetic KLIBOR and MYOR data for testing.

    Returns two DataFrames that mimic realistic Malaysian rate data:
      - MYOR: ~2-4%, slow-moving policy rate
      - KLIBOR 3M: MYOR + a spread that fluctuates with credit/liquidity

    Parameters
    ----------
    start, end : str
        Date range in 'YYYY-MM-DD' format.
    seed : int
        Random seed for reproducibility.

    Returns
    -------
    (klibor_df, myor_df) : tuple of pd.DataFrame
        Both DataFrames indexed by a daily DatetimeIndex.
    """
    rng = np.random.default_rng(seed)
    idx = pd.date_range(start=start, end=end, freq="D", name="date")
    n   = len(idx)

    # MYOR: mean-reverting walk around 3.0%
    myor_shocks = rng.normal(0, 0.005, n)          # small daily moves
    myor_level  = 3.0
    myor_vals   = np.zeros(n)
    myor_vals[0] = myor_level
    for i in range(1, n):
        # Mean-reversion + noise
        myor_vals[i] = (myor_vals[i-1]
                        + 0.01 * (myor_level - myor_vals[i-1])
                        + myor_shocks[i])
    myor_vals = np.clip(myor_vals, 1.0, 7.0)

    # KLIBOR 3M: MYOR + spread (20–80 bps)
    spread_shocks = rng.normal(0, 0.01, n)
    spread        = np.zeros(n)
    spread[0]     = 0.40
    for i in range(1, n):
        spread[i] = np.clip(
            spread[i-1] + 0.05 * (0.40 - spread[i-1]) + spread_shocks[i],
            0.10, 1.20
        )
    klibor_vals = myor_vals + spread

    # Simulate sparse publication (weekdays only) for KLIBOR
    klibor_df = pd.DataFrame({"klibor_3m": klibor_vals}, index=idx)
    klibor_df.loc[idx.weekday >= 5, "klibor_3m"] = np.nan  # weekends → NaN

    myor_df = pd.DataFrame({"myor": myor_vals}, index=idx)

    return klibor_df, myor_df


# ---------------------------------------------------------------------------
# Main — quick smoke test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=== Module 01: Data Ingestion & Preprocessing ===\n")

    # Use synthetic data as a stand-in for real files
    klibor_raw, myor_raw = generate_synthetic_data()

    # Simulate the load functions by injecting synthetic frames directly
    merged = merge_and_clean(klibor_raw, myor_raw, freq="D")

    print(f"Merged DataFrame shape : {merged.shape}")
    print(f"Date range             : {merged.index.min().date()} → "
          f"{merged.index.max().date()}")
    print(f"Missing values         : {merged.isna().sum().to_dict()}")
    print("\nFirst 5 rows:")
    print(merged.head())
    print("\nLast 5 rows:")
    print(merged.tail())
    print("\nDescriptive statistics:")
    print(merged.describe())
