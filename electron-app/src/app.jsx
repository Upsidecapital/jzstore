/* global React, ReactDOM, Icons, WATCHLIST, genCandles, FootprintChart,
           LeftNav, LeftRail, RightRail, BottomPanel, TweaksPanel, useTweaks */
const { useState, useMemo, useEffect, useRef } = React;

// Electron window control buttons (only rendered when electronAPI is available)
function WinControls() {
  const api = window.electronAPI;
  if (!api) return null;
  return (
    <div className="win-controls">
      <button className="win-btn" title="Minimize" onClick={() => api.minimize()}>
        <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor"><rect width="10" height="1"/></svg>
      </button>
      <button className="win-btn" title="Maximize / Restore" onClick={() => api.maximize()}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
          <rect x="0.5" y="0.5" width="9" height="9"/>
        </svg>
      </button>
      <button className="win-btn close" title="Close" onClick={() => api.close()}>
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
          <path d="M1 1l8 8M9 1L1 9"/>
        </svg>
      </button>
    </div>
  );
}

function App() {
  const { state, set, visible, setVisible } = useTweaks(window.TWEAKS);
  const [symbol, setSymbol] = useState('XAU/USD');
  const [timeframe, setTimeframe] = useState('30s');
  const [hover, setHover] = useState(null);

  const candles = useMemo(() => genCandles(22, symbol.charCodeAt(0) + symbol.length * 31), [symbol]);
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2] || last;
  const change = last.close - candles[0].open;
  const changePct = (change / candles[0].open) * 100;

  const classes = [
    'app',
    !state.sidebars && 'no-side',
    !state.showVolumeProfile && 'no-vp-sidebar',
    !state.showCVD && 'no-cvd',
  ].filter(Boolean).join(' ');

  const symInfo = WATCHLIST.find(w => w.sym === symbol) || WATCHLIST[0];

  return (
    <div className={classes}>
      {/* Titlebar */}
      <header className="titlebar">
        <div className="brand">
          <span className="dot">U</span>
          <span>Upside</span>
          <span style={{color:'var(--fg-3)', fontWeight:400, marginLeft:2}}>/ Orderflow</span>
        </div>
        <div className="tabs">
          <div className="tab active">
            <span className="sym">{symbol}</span>
            <span style={{color:'var(--fg-3)'}}>·</span>
            <span style={{color:'var(--fg-2)', fontSize:11}}>Footprint · {timeframe}</span>
            <span className="tab-close">×</span>
          </div>
          <div className="tab">
            <span className="sym">EUR/USD</span>
            <span style={{color:'var(--fg-3)'}}>·</span>
            <span style={{color:'var(--fg-2)', fontSize:11}}>Candles · 5m</span>
            <span className="tab-close">×</span>
          </div>
          <button className="tab-new" title="New chart tab"><Icons.plus size={13} /></button>
        </div>
        <div className="titlebar-right">
          <div className="wschip">
            <span className="led" />
            <span>FEED</span>
            <span style={{color:'var(--fg-3)'}}>ws</span>
          </div>
          <button className="iconbtn" title="Replay"><Icons.replay size={15} /></button>
          <button className="iconbtn" title="Save layout"><Icons.save size={15} /></button>
          <button className="iconbtn" title="Toggle theme" onClick={()=>set({theme: state.theme==='dark'?'light':'dark'})}>
            {state.theme==='dark' ? <Icons.sun size={15} /> : <Icons.moon size={15} />}
          </button>
          <button className="iconbtn" title="Alerts"><Icons.bell size={15} /></button>
          <button className={`iconbtn ${visible?'active':''}`} title="Tweaks" onClick={()=>setVisible(v=>!v)}>
            <Icons.tune size={15} />
          </button>
          <button className="iconbtn" title="Settings"><Icons.settings size={15} /></button>
          <div style={{width:1, height:18, background:'var(--line-1)', margin:'0 6px'}} />
          <button className="iconbtn" title="Account">
            <div style={{width:22, height:22, borderRadius:'50%',
                        background:'linear-gradient(135deg,#6366f1,#ec4899)',
                        display:'grid', placeItems:'center', color:'white',
                        fontSize:10, fontWeight:700}}>JZ</div>
          </button>
          <WinControls />
        </div>
      </header>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="tb-group">
          <div className="symbolbox">
            <span className="sym-ico">Au</span>
            <span className="sym-name">{symbol}</span>
            <span className="sym-desc">· {symInfo.name}</span>
            <Icons.chev size={11} />
          </div>
        </div>
        <div className="tb-divider" />
        <div className="tb-group">
          <div className="tf-group">
            {['1s','5s','15s','30s','1m','5m','15m','1h','4h','1D'].map(tf => (
              <button key={tf} className={`tf-chip ${timeframe===tf?'active':''}`} onClick={()=>setTimeframe(tf)}>{tf}</button>
            ))}
          </div>
        </div>
        <div className="tb-divider" />
        <div className="tb-group">
          <button className="tb-chip"><Icons.candle size={13} /> Footprint <Icons.chev size={10} /></button>
          <button className="tb-chip"><Icons.indicator size={13} /> Indicators <span style={{color:'var(--fg-3)'}}>3</span> <Icons.chev size={10} /></button>
          <button className="tb-chip"><Icons.compare size={13} /> Compare</button>
        </div>
        <div className="tb-divider" />
        <div className="tb-group">
          <button className="iconbtn" title="News"><Icons.news size={15} /></button>
          <button className="iconbtn" title="Economic calendar"><Icons.cal size={15} /></button>
        </div>

        <div className="price-strip">
          <span className={`last ${!last.up ? 'down' : ''}`}>
            {last.close.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}
          </span>
          <span className={`chg ${change>=0?'up':'down'}`}>
            {change>=0?'+':''}{change.toFixed(2)} ({changePct>=0?'+':''}{changePct.toFixed(2)}%)
          </span>
          <span className="chg" style={{color:'var(--fg-3)'}}>
            O {candles[0].open.toFixed(2)} · H {Math.max(...candles.map(c=>c.high)).toFixed(2)} · L {Math.min(...candles.map(c=>c.low)).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Left nav (watchlist) */}
      {state.sidebars && <LeftNav active={symbol} onPick={setSymbol} />}

      {/* Left drawing rail */}
      <LeftRail />

      {/* Center chart area */}
      <div className="center">
        <div className="chart-head">
          <div className="ohlc">
            <span><span className="k">O</span><span style={{color:last.up?'var(--bid)':'var(--ask)'}}>{candles[0].open.toFixed(2)}</span></span>
            <span><span className="k">H</span><span style={{color:'var(--fg-0)'}}>{Math.max(...candles.map(c=>c.high)).toFixed(2)}</span></span>
            <span><span className="k">L</span><span style={{color:'var(--fg-0)'}}>{Math.min(...candles.map(c=>c.low)).toFixed(2)}</span></span>
            <span><span className="k">C</span><span style={{color:last.up?'var(--bid)':'var(--ask)'}}>{last.close.toFixed(2)}</span></span>
            <span><span className="k">Δ</span><span style={{color: last.delta>=0?'var(--bid)':'var(--ask)'}}>{last.delta>=0?'+':''}{last.delta}</span></span>
          </div>
          <span className="pill bid">Buyers aggressive</span>
          <span className="pill">POC 5009.10</span>
          <div style={{marginLeft:'auto', display:'flex', gap:6, alignItems:'center'}}>
            <span className="indicator"><span className="dot"/>Footprint · 30s <span className="x">×</span></span>
            <span className="indicator"><span className="dot" style={{background:'var(--warn)'}}/>VWAP <span className="x">×</span></span>
            <span className="indicator"><span className="dot" style={{background:'var(--bid)'}}/>EMA 20 <span className="x">×</span></span>
          </div>
        </div>

        <FootprintChart
          candles={candles}
          intensity={state.intensity}
          density={state.density}
          showVP={state.showVolumeProfile}
          onHover={(c, pos) => setHover(c ? { c, pos } : null)}
        />

        {hover && hover.c && (
          <div className="fp-tooltip" style={{
            left: Math.min(hover.pos.x + 18, (document.querySelector('.chart-wrap')?.clientWidth||0) - 180),
            top: hover.pos.y + 60
          }}>
            <div className="t">{new Date(hover.c.t).toLocaleTimeString()}</div>
            <div className="kv"><span className="k">Open</span><span>{hover.c.open.toFixed(2)}</span></div>
            <div className="kv"><span className="k">High</span><span>{hover.c.high.toFixed(2)}</span></div>
            <div className="kv"><span className="k">Low</span><span>{hover.c.low.toFixed(2)}</span></div>
            <div className="kv"><span className="k">Close</span><span style={{color:hover.c.up?'var(--bid)':'var(--ask)'}}>{hover.c.close.toFixed(2)}</span></div>
            <div className="kv"><span className="k">Volume</span><span>{hover.c.volume.toLocaleString()}</span></div>
            <div className="kv"><span className="k">Delta</span><span style={{color:hover.c.delta>=0?'var(--bid)':'var(--ask)'}}>{hover.c.delta>=0?'+':''}{hover.c.delta}</span></div>
          </div>
        )}
      </div>

      {/* Right rail */}
      <RightRail lastPrice={last.close} />

      {/* Bottom */}
      <BottomPanel candles={candles} showCVD={state.showCVD} />

      {/* Tweaks */}
      {visible && <TweaksPanel state={state} set={set} onClose={()=>setVisible(false)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
