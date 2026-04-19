/* global React */
// Minimal inline SVG icons — stroke-based, 16px default
const Ic = ({ d, size = 16, fill = 'none', stroke = 'currentColor', sw = 1.6, children, vb = 24 }) => (
  <svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} fill={fill} stroke={stroke}
       strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {d ? <path d={d} /> : children}
  </svg>
);

const Icons = {
  search:   (p) => <Ic {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></Ic>,
  plus:     (p) => <Ic {...p} d="M12 5v14M5 12h14"/>,
  close:    (p) => <Ic {...p} d="M6 6l12 12M18 6L6 18"/>,
  settings: (p) => <Ic {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></Ic>,
  power:    (p) => <Ic {...p}><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><path d="M12 2v10"/></Ic>,
  bell:     (p) => <Ic {...p} d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/>,
  star:     (p) => <Ic {...p} d="M12 2l2.9 6.9L22 10l-5.5 4.8L18.2 22 12 18l-6.2 4 1.7-7.2L2 10l7.1-1.1Z"/>,
  layers:   (p) => <Ic {...p} d="M12 3 2 8l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5"/>,
  news:     (p) => <Ic {...p} d="M4 4h13a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H7a2 2 0 0 1-2-2V4ZM9 8h6M9 12h6M9 16h4"/>,
  cal:      (p) => <Ic {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></Ic>,
  wallet:   (p) => <Ic {...p} d="M21 12V8a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h16v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6M17 14h.01"/>,
  grid:     (p) => <Ic {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></Ic>,

  // Drawing tools
  cursor:   (p) => <Ic {...p} d="M4 3l7 17 2.5-7.5L21 10Z"/>,
  cross:    (p) => <Ic {...p} d="M12 3v18M3 12h18"/>,
  trend:    (p) => <Ic {...p} d="M4 20 20 4M16 4h4v4"/>,
  hline:    (p) => <Ic {...p} d="M3 12h18M7 9v6M17 9v6"/>,
  rect:     (p) => <Ic {...p}><rect x="4" y="6" width="16" height="12" rx="1"/></Ic>,
  fib:      (p) => <Ic {...p} d="M3 5h18M3 10h18M3 14h14M3 19h10"/>,
  text:     (p) => <Ic {...p} d="M5 5h14M12 5v14M9 19h6"/>,
  ruler:    (p) => <Ic {...p} d="M21 7 17 3 3 17l4 4Zm-7-2 3 3M11 8l3 3M8 11l3 3M5 14l3 3"/>,
  magnet:   (p) => <Ic {...p} d="M6 3v9a6 6 0 0 0 12 0V3M6 3h4M14 3h4M6 8h4M14 8h4"/>,
  eraser:   (p) => <Ic {...p} d="M19 14 9 4l-6 6 10 10h8l3-3Z"/>,

  // Toolbar
  candle:   (p) => <Ic {...p}><rect x="6" y="8" width="4" height="10"/><path d="M8 4v4M8 18v2"/><rect x="14" y="6" width="4" height="10"/><path d="M16 2v4M16 16v4"/></Ic>,
  indicator:(p) => <Ic {...p} d="M3 17l4-4 4 4 6-8 4 5"/>,
  compare:  (p) => <Ic {...p} d="M7 3v18M17 3v18M3 7h8M13 17h8"/>,
  replay:   (p) => <Ic {...p} d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/>,
  save:     (p) => <Ic {...p}><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M7 3v5h8V3M7 21v-6h10v6"/></Ic>,
  sun:      (p) => <Ic {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></Ic>,
  moon:     (p) => <Ic {...p} d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>,
  chev:     (p) => <Ic {...p} d="m6 9 6 6 6-6"/>,
  expand:   (p) => <Ic {...p} d="M4 10V4h6M14 4h6v6M20 14v6h-6M10 20H4v-6"/>,
  dots:     (p) => <Ic {...p}><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></Ic>,
  tune:     (p) => <Ic {...p} d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h14M18 18h2M14 4v4M8 10v4M18 16v4"/>,
};

Object.assign(window, { Icons });
