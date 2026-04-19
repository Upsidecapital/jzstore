/* global React */
const { useState, useMemo } = React;

// ------- Synthetic footprint data -------
// Generates deterministic candles with bid/ask volume ladder and aggression bubbles
function mulberry(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function genCandles(n, seed = 17, startPrice = 5006) {
  const rand = mulberry(seed);
  const candles = [];
  let price = startPrice;
  const tick = 0.1;

  for (let i = 0; i < n; i++) {
    const drift = (rand() - 0.48) * 1.8;
    const range = 0.8 + rand() * 3.5;
    const open = price;
    const close = +(open + drift).toFixed(2);
    const high = +(Math.max(open, close) + rand() * range).toFixed(2);
    const low  = +(Math.min(open, close) - rand() * range).toFixed(2);

    // Build price ladder for footprint
    const ladder = [];
    const steps = Math.max(4, Math.round((high - low) / tick));
    const poc = low + (high - low) * (0.3 + rand() * 0.4);
    for (let s = 0; s <= steps; s++) {
      const p = +(low + s * tick).toFixed(2);
      if (p > high) break;
      const dist = Math.abs(p - poc);
      const base = Math.exp(-dist * dist * 0.4) * (120 + rand() * 380);
      const skew = close > open ? 0.55 + rand() * 0.25 : 0.25 + rand() * 0.25;
      const bidVol = Math.round(base * (1 - skew));
      const askVol = Math.round(base * skew);
      ladder.push({ p, bidVol, askVol });
    }

    // Aggression: total delta + peak bubbles
    const totalBid = ladder.reduce((a, r) => a + r.bidVol, 0);
    const totalAsk = ladder.reduce((a, r) => a + r.askVol, 0);
    const delta = totalAsk - totalBid;
    const volume = totalBid + totalAsk;

    // Pick 0-2 aggression bubbles (points of heavy imbalance)
    const bubbles = [];
    ladder.forEach(r => {
      const rowDelta = r.askVol - r.bidVol;
      const size = Math.abs(rowDelta);
      if (size > 160 && rand() > 0.55) {
        bubbles.push({ p: r.p, size, side: rowDelta > 0 ? 'ask' : 'bid' });
      }
    });

    candles.push({
      t: Date.now() - (n - i) * 30_000,
      open, close, high, low,
      ladder, delta, volume, bubbles,
      up: close >= open
    });
    price = close;
  }
  return candles;
}

// ------- Volume profile from candles -------
function buildVolumeProfile(candles, bins = 34) {
  const hi = Math.max(...candles.map(c => c.high));
  const lo = Math.min(...candles.map(c => c.low));
  const step = (hi - lo) / bins;
  const rows = Array.from({ length: bins }, (_, i) => ({
    p: lo + (i + 0.5) * step,
    pLo: lo + i * step,
    pHi: lo + (i + 1) * step,
    buy: 0, sell: 0
  }));
  candles.forEach(c => {
    c.ladder.forEach(r => {
      const idx = Math.min(bins - 1, Math.max(0, Math.floor((r.p - lo) / step)));
      rows[idx].buy  += r.bidVol; // buyers lifting bid side? convention: show buy-at-bid as buy imbalance
      rows[idx].sell += r.askVol;
    });
  });
  const max = Math.max(...rows.map(r => r.buy + r.sell));
  const poc = rows.reduce((best, r) => (r.buy + r.sell) > (best.buy + best.sell) ? r : best, rows[0]);
  return { rows, max, poc, hi, lo };
}

// ------- DOM / order book -------
function buildDOM(lastPrice) {
  const rand = mulberry(Math.floor(lastPrice * 13));
  const tick = 0.1;
  const levels = 14;
  const bids = [], asks = [];
  let maxSize = 0;
  for (let i = 0; i < levels; i++) {
    const bp = +(lastPrice - (i + 1) * tick).toFixed(2);
    const ap = +(lastPrice + (i + 1) * tick).toFixed(2);
    const bs = Math.round(80 + rand() * 900 * Math.exp(-i * 0.12));
    const as = Math.round(80 + rand() * 900 * Math.exp(-i * 0.12));
    bids.push({ p: bp, size: bs });
    asks.push({ p: ap, size: as });
    maxSize = Math.max(maxSize, bs, as);
  }
  return { bids, asks, maxSize, spread: tick, mid: lastPrice };
}

// ------- Watchlist -------
const WATCHLIST = [
  { sym: 'XAU/USD',  name: 'Gold Spot',            price: 5006.10, chg: +12.35, active: true },
  { sym: 'XAG/USD',  name: 'Silver Spot',          price:   57.82, chg:  -0.41 },
  { sym: 'EUR/USD',  name: 'Euro / Dollar',        price:  1.0724, chg: +0.0018 },
  { sym: 'GBP/USD',  name: 'Pound / Dollar',       price:  1.2631, chg: -0.0023 },
  { sym: 'USD/JPY',  name: 'Dollar / Yen',         price: 154.480, chg: +0.320 },
  { sym: 'AUD/USD',  name: 'Aussie / Dollar',      price:  0.6554, chg: -0.0012 },
  { sym: 'USD/CAD',  name: 'Dollar / CAD',         price:  1.3718, chg: +0.0021 },
  { sym: 'BTC/USD',  name: 'Bitcoin',              price: 94218.5, chg: +842.0 },
  { sym: 'ETH/USD',  name: 'Ethereum',             price: 3284.20, chg: -18.60 },
  { sym: 'ES1!',     name: 'S&P 500 Futures',      price: 5847.25, chg: +14.50 },
  { sym: 'NQ1!',     name: 'Nasdaq 100 Futures',   price: 20184.0, chg: +63.25 },
  { sym: 'CL1!',     name: 'WTI Crude',            price:   69.82, chg: -0.54 },
  { sym: 'NG1!',     name: 'Natural Gas',          price:    3.21, chg: +0.08 },
  { sym: '^VIX',     name: 'Volatility Index',     price:   14.82, chg: -0.31 },
  { sym: 'DX-Y',     name: 'Dollar Index',         price:  104.62, chg: +0.18 },
  { sym: 'US10Y',    name: 'US 10Y Yield',         price:    4.28, chg: +0.02 },
];

const INDICATORS = [
  { name: 'Footprint', color: 'var(--accent, var(--info))' },
  { name: 'CVD · Cumulative Delta', color: 'var(--accent, var(--info))' },
  { name: 'VWAP', color: 'var(--warn)' },
  { name: 'EMA 20', color: 'var(--bid)' },
];

const BLOTTER = [
  { t: '14:28:07', sym: 'XAU/USD', side: 'Buy',  qty: 2,  entry: 5002.40, exit: '—',      pnl: +7.40,  status: 'Open' },
  { t: '14:14:22', sym: 'XAU/USD', side: 'Sell', qty: 1,  entry: 5011.80, exit: 5008.20, pnl: +3.60,  status: 'Closed' },
  { t: '13:47:55', sym: 'EUR/USD', side: 'Buy',  qty: 50, entry: 1.0710,  exit: 1.0724,  pnl: +70.00, status: 'Closed' },
  { t: '13:22:01', sym: 'XAU/USD', side: 'Buy',  qty: 3,  entry: 5014.20, exit: 5009.60, pnl: -13.80, status: 'Closed' },
  { t: '12:58:44', sym: 'BTC/USD', side: 'Sell', qty: 0.2, entry: 94580, exit: 94220,    pnl: +72.00, status: 'Closed' },
  { t: '12:31:18', sym: 'USD/JPY', side: 'Sell', qty: 25, entry: 154.62, exit: '—',      pnl: -3.50,  status: 'Open' },
];

const NEWS = [
  { t: '14:32', impact: 'hi', src: 'Reuters', title: 'Fed\'s Powell: inflation glide path remains uneven; data-dependent on next move' },
  { t: '14:18', impact: 'md', src: 'Bloomberg', title: 'Gold extends gains past $5,000 as dollar softens on dovish Fed tone' },
  { t: '14:02', impact: 'lo', src: 'MarketWatch', title: 'Copper futures pare earlier losses as China PMI data beats estimates' },
  { t: '13:45', impact: 'hi', src: 'DXY', title: 'US retail sales +0.4% MoM vs +0.3% forecast; control group +0.7%' },
  { t: '13:12', impact: 'md', src: 'FT', title: 'ECB\'s Lagarde signals data watch before June; downside risks to growth persist' },
  { t: '12:58', impact: 'lo', src: 'CoinDesk', title: 'Bitcoin ETF inflows resume after three sessions of outflows' },
  { t: '12:30', impact: 'hi', src: 'BLS',   title: 'US Initial Jobless Claims: 218k vs 225k expected; continuing claims edge lower' },
];

const ALERTS = [
  { sym: 'XAU/USD', cond: 'crosses above 5,010.00', time: '14:32', on: true,  hit: true  },
  { sym: 'XAU/USD', cond: 'delta > 2,000 on 30s bar', time: '—',   on: true,  hit: false },
  { sym: 'EUR/USD', cond: 'crosses below 1.0700',    time: '—',   on: true,  hit: false },
  { sym: 'BTC/USD', cond: 'volume spike 3× avg',     time: '11:22', on: false, hit: true  },
  { sym: 'ES1!',    cond: 'CVD divergence on 5m',    time: '—',   on: true,  hit: false },
];

Object.assign(window, {
  mulberry, genCandles, buildVolumeProfile, buildDOM,
  WATCHLIST, INDICATORS, BLOTTER, NEWS, ALERTS,
});
