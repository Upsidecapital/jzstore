/* global React, buildVolumeProfile */
const { useRef, useEffect, useState } = React;

// ------------------------------------------------------------------
// Footprint candle chart + aggression bubbles + Deepcharts heatmap
// Pure <canvas> render from candle data.
// ------------------------------------------------------------------

function cssVar(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

function mix(a, b, t) {
  const pa = parse(a), pb = parse(b);
  return `rgba(${Math.round(pa[0] + (pb[0]-pa[0])*t)},${Math.round(pa[1] + (pb[1]-pa[1])*t)},${Math.round(pa[2] + (pb[2]-pa[2])*t)},${pa[3] + (pb[3]-pa[3])*t})`;
}
function parse(c) {
  if (c.startsWith('#')) {
    const h = c.slice(1);
    const n = h.length === 3
      ? [parseInt(h[0]+h[0],16), parseInt(h[1]+h[1],16), parseInt(h[2]+h[2],16)]
      : [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
    return [...n, 1];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return [255,255,255,1];
  const p = m[1].split(',').map(s => parseFloat(s.trim()));
  return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]];
}

function FootprintChart({ candles, vp, intensity, density, showVP, onHover }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const W = wrap.clientWidth;
      const H = wrap.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Colors from theme
      const bg1 = cssVar('--bg-1');
      const grid = cssVar('--grid');
      const grid2 = cssVar('--grid-2');
      const fg2 = cssVar('--fg-2');
      const fg3 = cssVar('--fg-3');
      const bid = cssVar('--bid');
      const ask = cssVar('--ask');
      const bidSoft = cssVar('--bid-soft');
      const askSoft = cssVar('--ask-soft');
      const line1 = cssVar('--line-1');

      // Layout
      const padT = 16, padB = 24;
      const padL = 8;
      const priceAxisW = 68;
      const vpW = showVP ? 140 : 0;
      const plotL = padL;
      const plotR = W - priceAxisW - vpW;
      const plotT = padT;
      const plotB = H - padB;
      const plotW = plotR - plotL;
      const plotH = plotB - plotT;

      // Price range covers all candles
      let hi = -Infinity, lo = Infinity;
      candles.forEach(c => { hi = Math.max(hi, c.high); lo = Math.min(lo, c.low); });
      const pad = (hi - lo) * 0.05;
      hi += pad; lo -= pad;
      const priceToY = p => plotT + (1 - (p - lo) / (hi - lo)) * plotH;

      // Candle geometry
      const compact = density === 'compact';
      const spacious = density === 'spacious';
      const slotW = spacious ? 62 : compact ? 42 : 52;
      const n = candles.length;
      const totalW = n * slotW;
      const startX = plotL + Math.max(0, plotW - totalW - 8);
      const candleW = slotW - 8;

      // Grid — horizontal price lines
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      const steps = 8;
      for (let i = 0; i <= steps; i++) {
        const y = plotT + (i / steps) * plotH;
        ctx.beginPath(); ctx.moveTo(plotL, y); ctx.lineTo(plotR, y); ctx.stroke();
      }
      // Vertical (time) lines every 6 candles
      ctx.strokeStyle = grid;
      for (let i = 0; i < n; i += 6) {
        const x = startX + i * slotW + candleW / 2;
        ctx.beginPath(); ctx.moveTo(x, plotT); ctx.lineTo(x, plotB); ctx.stroke();
      }

      // Price axis labels (right)
      ctx.fillStyle = fg3;
      ctx.font = '11px ' + (cssVar('--f-num') || 'monospace');
      ctx.textAlign = 'left';
      for (let i = 0; i <= steps; i++) {
        const p = hi - (i / steps) * (hi - lo);
        const y = plotT + (i / steps) * plotH;
        ctx.fillText(p.toFixed(2), plotR + 6, y + 3);
      }

      // Footprint cells + wick + body frame
      const rowH = compact ? 10 : spacious ? 14 : 12;
      const maxCellVol = Math.max(1, ...candles.flatMap(c => c.ladder.flatMap(r => [r.bidVol, r.askVol])));
      const intensityK = 0.35 + (intensity / 100) * 0.9; // 0.35..1.25

      candles.forEach((c, i) => {
        const x = startX + i * slotW;
        const cx = x + candleW / 2;

        // Wick
        ctx.strokeStyle = c.up ? bid : ask;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, priceToY(c.high));
        ctx.lineTo(cx, priceToY(c.low));
        ctx.stroke();

        // Footprint cells (split bid | ask)
        const half = candleW / 2;
        c.ladder.forEach(r => {
          const yTop = priceToY(r.p) - rowH / 2;
          // Bid (left half)
          const bidT = Math.min(1, (r.bidVol / maxCellVol) * intensityK);
          if (bidT > 0.05) {
            ctx.fillStyle = `rgba(8,153,129,${0.15 + bidT * 0.65})`;
            ctx.fillRect(x, yTop, half, rowH - 1);
          }
          // Ask (right half)
          const askT = Math.min(1, (r.askVol / maxCellVol) * intensityK);
          if (askT > 0.05) {
            const akR = parse(ask);
            ctx.fillStyle = `rgba(${akR[0]},${akR[1]},${akR[2]},${0.15 + askT * 0.65})`;
            ctx.fillRect(x + half, yTop, half, rowH - 1);
          }

          // Labels inside — only if density permits and cell has meaningful vol
          if (!compact && rowH >= 11) {
            ctx.font = '9px ' + (cssVar('--f-num') || 'monospace');
            ctx.textAlign = 'right';
            if (r.bidVol > maxCellVol * 0.15) {
              ctx.fillStyle = bidT > 0.5 ? '#041914' : bid;
              ctx.fillText(r.bidVol, x + half - 3, yTop + rowH - 3);
            }
            ctx.textAlign = 'left';
            if (r.askVol > maxCellVol * 0.15) {
              ctx.fillStyle = askT > 0.5 ? '#190608' : ask;
              ctx.fillText(r.askVol, x + half + 3, yTop + rowH - 3);
            }
          }
        });

        // Body frame (outline)
        const oy = priceToY(c.open), cy = priceToY(c.close);
        ctx.strokeStyle = c.up ? bid : ask;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, Math.min(oy, cy), candleW, Math.max(1, Math.abs(cy - oy)));

        // Aggression bubbles (Deepcharts style) — positioned to the right of candle
        c.bubbles.forEach(b => {
          const r = Math.min(18, 3 + Math.sqrt(b.size) * 0.35);
          const bx = x + candleW + 3 + r;
          const by = priceToY(b.p);
          const col = b.side === 'bid' ? bid : ask;
          const colR = parse(col);
          // Outer glow
          const grd = ctx.createRadialGradient(bx, by, 0, bx, by, r * 1.6);
          grd.addColorStop(0, `rgba(${colR[0]},${colR[1]},${colR[2]},0.55)`);
          grd.addColorStop(1, `rgba(${colR[0]},${colR[1]},${colR[2]},0)`);
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.arc(bx, by, r * 1.6, 0, Math.PI * 2); ctx.fill();
          // Core
          ctx.fillStyle = `rgba(${colR[0]},${colR[1]},${colR[2]},0.85)`;
          ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = `rgba(${colR[0]},${colR[1]},${colR[2]},1)`;
          ctx.lineWidth = 1.25;
          ctx.stroke();
          // Value label
          if (r > 7) {
            ctx.fillStyle = 'white';
            ctx.font = '9px ' + (cssVar('--f-ui') || 'sans-serif');
            ctx.textAlign = 'center';
            ctx.fillText(b.size > 999 ? (b.size/1000).toFixed(1)+'k' : b.size, bx, by + 3);
          }
        });
      });

      // Last price line + label
      const last = candles[candles.length - 1];
      const lastY = priceToY(last.close);
      ctx.strokeStyle = last.up ? bid : ask;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(plotL, lastY); ctx.lineTo(plotR, lastY); ctx.stroke();
      ctx.setLineDash([]);
      // Label
      const lbl = last.close.toFixed(2);
      ctx.fillStyle = last.up ? bid : ask;
      ctx.fillRect(plotR, lastY - 9, priceAxisW - 2, 18);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 11px ' + (cssVar('--f-num') || 'monospace');
      ctx.textAlign = 'left';
      ctx.fillText(lbl, plotR + 6, lastY + 3);

      // Volume profile (right rail)
      if (showVP) {
        const vpX0 = plotR + priceAxisW;
        const vpX1 = W - 4;
        const vpW2 = vpX1 - vpX0;
        // Background divider
        ctx.fillStyle = bg1;
        ctx.fillRect(vpX0, plotT, vpW2, plotH);
        ctx.strokeStyle = line1;
        ctx.beginPath(); ctx.moveTo(vpX0, plotT); ctx.lineTo(vpX0, plotB); ctx.stroke();

        const prof = buildVolumeProfile(candles, 40);
        const binH = plotH / prof.rows.length;
        prof.rows.forEach(r => {
          const y = priceToY(r.pHi);
          const total = r.buy + r.sell;
          if (total === 0) return;
          const w = (total / prof.max) * vpW2;
          const buyW = (r.buy / total) * w;
          const sellW = w - buyW;
          // Buy portion
          ctx.fillStyle = bidSoft;
          ctx.fillRect(vpX0 + 2, y + 1, buyW, binH - 1);
          // Sell portion
          ctx.fillStyle = askSoft;
          ctx.fillRect(vpX0 + 2 + buyW, y + 1, sellW, binH - 1);
        });
        // POC line
        const pocY = priceToY(prof.poc.p);
        ctx.strokeStyle = cssVar('--warn');
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(vpX0, pocY); ctx.lineTo(vpX1, pocY); ctx.stroke();
        // Label
        ctx.fillStyle = fg3;
        ctx.font = '10px ' + (cssVar('--f-ui') || 'sans-serif');
        ctx.textAlign = 'left';
        ctx.fillText('VOL PROFILE', vpX0 + 4, plotT - 4);
      }

      // Time axis
      ctx.fillStyle = fg3;
      ctx.font = '10px ' + (cssVar('--f-num') || 'monospace');
      ctx.textAlign = 'center';
      for (let i = 0; i < n; i += 6) {
        const x = startX + i * slotW + candleW / 2;
        const d = new Date(candles[i].t);
        const lbl = d.toTimeString().slice(0, 5);
        ctx.fillText(lbl, x, plotB + 14);
      }

      // Hover crosshair
      if (hover) {
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(hover.x, plotT); ctx.lineTo(hover.x, plotB);
        ctx.moveTo(plotL, hover.y); ctx.lineTo(plotR, hover.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Price label on axis
        const p = hi - (hover.y - plotT) / plotH * (hi - lo);
        ctx.fillStyle = cssVar('--bg-4');
        ctx.fillRect(plotR, hover.y - 9, priceAxisW - 2, 18);
        ctx.fillStyle = cssVar('--fg-0');
        ctx.font = '11px ' + (cssVar('--f-num') || 'monospace');
        ctx.textAlign = 'left';
        ctx.fillText(p.toFixed(2), plotR + 6, hover.y + 3);
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [candles, intensity, density, showVP, hover]);

  const onMove = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setHover({ x, y });
    // Figure out which candle
    const slotW = density === 'compact' ? 42 : density === 'spacious' ? 62 : 52;
    const padL = 8;
    const priceAxisW = 68;
    const vpW = showVP ? 140 : 0;
    const plotR = rect.width - priceAxisW - vpW;
    const totalW = candles.length * slotW;
    const startX = padL + Math.max(0, (plotR - padL) - totalW - 8);
    const idx = Math.floor((x - startX) / slotW);
    if (idx >= 0 && idx < candles.length) {
      onHover && onHover(candles[idx], { x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else {
      onHover && onHover(null);
    }
  };
  const onLeave = () => { setHover(null); onHover && onHover(null); };

  return (
    <div ref={wrapRef} className="chart-wrap" onMouseMove={onMove} onMouseLeave={onLeave}>
      <canvas ref={canvasRef} className="chart-canvas" />
    </div>
  );
}

// CVD line chart
function CvdChart({ candles }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const W = wrap.clientWidth;
      const H = wrap.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const bid = cssVar('--bid'); const ask = cssVar('--ask');
      const bidSoft = cssVar('--bid-soft');
      const fg3 = cssVar('--fg-3'); const grid = cssVar('--grid');

      // Build cumulative delta series
      let cum = 0;
      const pts = candles.map(c => (cum += c.delta, cum));
      const hi = Math.max(...pts), lo = Math.min(...pts);
      const pad = (hi - lo) * 0.1 || 100;
      const yHi = hi + pad, yLo = lo - pad;

      const padT = 10, padB = 8, padL = 8, padR = 58;
      const plotW = W - padL - padR;
      const plotH = H - padT - padB;
      const toY = v => padT + (1 - (v - yLo) / (yHi - yLo)) * plotH;
      const toX = i => padL + (i / (candles.length - 1)) * plotW;
      const zeroY = toY(0);

      // Zero line
      ctx.strokeStyle = grid;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(padL, zeroY); ctx.lineTo(padL + plotW, zeroY); ctx.stroke();
      ctx.setLineDash([]);

      // Volume bars behind
      const maxVol = Math.max(...candles.map(c => c.volume));
      const barW = plotW / candles.length * 0.7;
      candles.forEach((c, i) => {
        const x = toX(i) - barW / 2;
        const h = (c.volume / maxVol) * (plotH * 0.35);
        const y = padT + plotH - h;
        ctx.fillStyle = c.up ? bidSoft : cssVar('--ask-soft');
        ctx.fillRect(x, y, barW, h);
      });

      // Delta bars
      candles.forEach((c, i) => {
        const x = toX(i) - barW / 2;
        const dY = toY(c.delta / 2 + (c.delta > 0 ? 0 : 0));
        const h = Math.abs(toY(0) - toY(c.delta)) * 0.5;
        const side = c.delta > 0 ? bid : ask;
        // small side markers skipped; prioritize line
      });

      // CVD area + line
      const aPath = new Path2D();
      aPath.moveTo(padL, zeroY);
      pts.forEach((v, i) => aPath.lineTo(toX(i), toY(v)));
      aPath.lineTo(padL + plotW, zeroY);
      aPath.closePath();
      const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
      const bR = parse(bid);
      grad.addColorStop(0, `rgba(${bR[0]},${bR[1]},${bR[2]},0.35)`);
      grad.addColorStop(1, `rgba(${bR[0]},${bR[1]},${bR[2]},0)`);
      ctx.fillStyle = grad;
      ctx.fill(aPath);

      ctx.strokeStyle = pts[pts.length-1] >= 0 ? bid : ask;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      pts.forEach((v, i) => i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v)));
      ctx.stroke();

      // Last value axis
      const lastV = pts[pts.length - 1];
      ctx.fillStyle = lastV >= 0 ? bid : ask;
      ctx.fillRect(padL + plotW, toY(lastV) - 8, padR - 4, 16);
      ctx.fillStyle = 'white';
      ctx.font = '10.5px ' + (cssVar('--f-num') || 'monospace');
      ctx.textAlign = 'left';
      ctx.fillText((lastV >= 0 ? '+' : '') + lastV.toFixed(0), padL + plotW + 5, toY(lastV) + 3);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [candles]);

  const cum = candles.reduce((a, c) => a + c.delta, 0);
  return (
    <div ref={wrapRef} className="cvd-wrap">
      <canvas ref={canvasRef} className="cvd-canvas" />
      <div className="cvd-label">
        CVD · Cumulative Delta
        <span className="v" style={{ color: cum >= 0 ? 'var(--bid)' : 'var(--ask)' }}>
          {cum >= 0 ? '+' : ''}{cum.toFixed(0)}
        </span>
      </div>
    </div>
  );
}

Object.assign(window, { FootprintChart, CvdChart });
