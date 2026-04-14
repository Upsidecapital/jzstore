# Data Directory

Place your input data files here.

## Expected file formats

### KLIBOR data (`klibor_data.csv` or `klibor_data.xlsx`)

| date       | klibor_3m |
|------------|-----------|
| 2010-01-04 | 3.12      |
| 2010-01-05 | 3.12      |
| ...        | ...       |

- `date` : any parseable date string (e.g. `2010-01-04`, `04/01/2010`)
- `klibor_3m` : 3-month KLIBOR rate in **percentage** (e.g. `3.12` = 3.12 %)
- Source: Bank Negara Malaysia (BNM) statistical database

### MYOR data (`myor_data.csv` or `myor_data.xlsx`)

| date       | myor |
|------------|------|
| 2010-01-04 | 2.00 |
| 2010-01-05 | 2.00 |
| ...        | ...  |

- `date` : same format as above
- `myor`  : Malaysia Overnight Rate in **percentage**
- Source: Bank Negara Malaysia overnight policy rate (OPR) or MYOR fixing

## Running with real data

```bash
python pipeline.py \
    --klibor data/klibor_data.csv \
    --myor   data/myor_data.csv \
    --klibor-date-col date \
    --klibor-rate-col klibor_3m \
    --myor-date-col   date \
    --myor-rate-col   myor \
    --n-factors 3 \
    --output-dir ./output
```

## Running with synthetic demo data

```bash
python pipeline.py --demo
```
