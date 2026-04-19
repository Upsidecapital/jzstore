/* global React, Icons, WATCHLIST, BLOTTER, NEWS, ALERTS, buildDOM, CvdChart */
const { useState, useMemo } = React;

// ---------------- Left nav ----------------
function LeftNav({ active, onPick, accent }) {
  const [tab, setTab] = useState('watchlist');
  const [query, setQuery] = useState('');
  const list = WATCHLIST.filter(w =>
    !query || w.sym.toLowerCase().includes(query.toLowerCase()) || w.name.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <nav className="leftnav">
      <div className="nav-tabs">
        <button className={`nav-tab ${tab==='watchlist'?'active':''}`} onClick={()=>setTab('watchlist')}>Watchlist</button>
        <button className={`nav-tab ${tab==='markets'?'active':''}`} onClick={()=>setTab('markets')}>Markets</button>
        <button className={`nav-tab ${tab==='screener'?'active':''}`} onClick={()=>setTab('screener')}>Screener</button>
      </div>
      <div className="searchbox">
        <Icons.search size={13} />
        <input placeholder="Search symbols…" value={query} onChange={e=>setQuery(e.target.value)} />
        <span className="kbd">⌘K</span>
      </div>
      <div className="nav-section">
        <span>Main List · {list.length}</span>
        <button className="sec-btn" title="Add symbol"><Icons.plus size={12} /></button>
      </div>
      <div className="wl-head">
        <span>Symbol</span>
        <span style={{textAlign:'right'}}>Last</span>
        <span style={{textAlign:'right'}}>Chg</span>
      </div>
      <div className="watchlist">
        {list.map(w => (
          <div key={w.sym}
               className={`wl-row ${w.sym === active ? 'active' : ''}`}
               onClick={()=>onPick && onPick(w.sym)}>
            <span className="sym">{w.sym}</span>
            <span className="price">{typeof w.price === 'number' ? w.price.toLocaleString(undefined,{minimumFractionDigits: Math.abs(w.price)<10?4:2, maximumFractionDigits: Math.abs(w.price)<10?4:2}) : w.price}</span>
            <span className="chg" style={{color: w.chg>=0 ? 'var(--bid)' : 'var(--ask)'}}>
              {w.chg>=0?'+':''}{typeof w.chg==='number' ? w.chg.toFixed(Math.abs(w.chg)<1?4:2) : w.chg}
            </span>
          </div>
        ))}
      </div>
    </nav>
  );
}

// ---------------- Left drawing rail ----------------
function LeftRail() {
  const [tool, setTool] = useState('cursor');
  const tools = [
    { id: 'cursor', icon: 'cursor', label: 'Select' },
    { id: 'cross',  icon: 'cross',  label: 'Crosshair' },
    { id: 'trend',  icon: 'trend',  label: 'Trend Line' },
    { id: 'hline',  icon: 'hline',  label: 'Horizontal Line' },
    { id: 'rect',   icon: 'rect',   label: 'Rectangle' },
    { id: 'fib',    icon: 'fib',    label: 'Fibonacci' },
    { id: 'text',   icon: 'text',   label: 'Text' },
    { id: 'ruler',  icon: 'ruler',  label: 'Measure' },
  ];
  return (
    <aside className="leftrail">
      {tools.map(t => {
        const Ic = Icons[t.icon];
        return (
          <button key={t.id} title={t.label}
                  className={`tool ${tool===t.id?'active':''}`}
                  onClick={()=>setTool(t.id)}>
            <Ic size={16} />
          </button>
        );
      })}
      <div className="rail-divider" />
      <button className="tool" title="Magnet mode"><Icons.magnet /></button>
      <button className="tool" title="Erase"><Icons.eraser /></button>
    </aside>
  );
}

// ---------------- Right rail: DOM ladder ----------------
function RightRail({ lastPrice }) {
  const [tab, setTab] = useState('dom');
  const dom = useMemo(() => buildDOM(lastPrice), [lastPrice]);
  return (
    <aside className="rightrail">
      <div className="rr-tabs">
        <button className={`rr-tab ${tab==='dom'?'active':''}`} onClick={()=>setTab('dom')}>
          <Icons.layers size={13} /> DOM
        </button>
        <button className={`rr-tab ${tab==='tape'?'active':''}`} onClick={()=>setTab('tape')}>
          Time & Sales
        </button>
        <button className={`rr-tab ${tab==='info'?'active':''}`} onClick={()=>setTab('info')} style={{marginLeft:'auto'}}>
          <Icons.dots size={14} />
        </button>
      </div>
      <div className="rr-body">
        {tab === 'dom' && <DomLadder dom={dom} />}
        {tab === 'tape' && <TimeAndSales lastPrice={lastPrice} />}
        {tab === 'info' && <div style={{padding:14,fontSize:12,color:'var(--fg-2)'}}>Symbol info panel — details, specs, session hours.</div>}
      </div>
    </aside>
  );
}

function DomLadder({ dom }) {
  const asksRev = [...dom.asks].reverse();
  return (
    <div className="dom-ladder">
      <div className="dom-head">
        <span>Bid Size</span>
        <span>Price</span>
        <span style={{textAlign:'left'}}>Ask Size</span>
      </div>
      {asksRev.map(a => (
        <div key={'a'+a.p} className="dom-row ask">
          <span className="bar-ask" style={{transform:`scaleX(${a.size/dom.maxSize})`}} />
          <span className="size-bid"></span>
          <span className="price num">{a.p.toFixed(2)}</span>
          <span className="size-ask num">{a.size.toLocaleString()}</span>
        </div>
      ))}
      <div className="dom-row spread last-print">
        <span></span>
        <span className="price num">{dom.mid.toFixed(2)}</span>
        <span style={{fontSize:10.5, color:'var(--fg-2)', paddingLeft:8}}>spread {dom.spread.toFixed(2)}</span>
      </div>
      {dom.bids.map(b => (
        <div key={'b'+b.p} className="dom-row bid">
          <span className="bar-bid" style={{transform:`scaleX(${b.size/dom.maxSize})`}} />
          <span className="size-bid num">{b.size.toLocaleString()}</span>
          <span className="price num">{b.p.toFixed(2)}</span>
          <span className="size-ask"></span>
        </div>
      ))}
    </div>
  );
}

function TimeAndSales({ lastPrice }) {
  const rows = useMemo(() => {
    const rand = (s=>{ let t=s; return ()=>{ t=(t*1664525+1013904223)|0; return ((t>>>0)%1e6)/1e6; }; })(lastPrice*7);
    const out = [];
    let p = lastPrice;
    for (let i=0;i<40;i++) {
      const side = rand() > 0.5 ? 'buy' : 'sell';
      p += (rand()-0.5) * 0.3;
      out.push({
        t: new Date(Date.now() - i*2500).toTimeString().slice(0,8),
        p: +p.toFixed(2),
        size: Math.round(1 + rand()*50),
        side
      });
    }
    return out;
  }, [lastPrice]);
  return (
    <div style={{overflow:'auto', flex:1}}>
      <div className="dom-head" style={{gridTemplateColumns:'1fr 1fr 1fr'}}>
        <span>Time</span>
        <span style={{textAlign:'center'}}>Price</span>
        <span style={{textAlign:'right'}}>Size</span>
      </div>
      {rows.map((r,i) => (
        <div key={i} style={{
          display:'grid', gridTemplateColumns:'1fr 1fr 1fr',
          padding:'0 10px', height:22, alignItems:'center',
          fontFamily:'var(--f-num)', fontSize:11.5,
          borderBottom:'1px solid var(--line-1)',
          background: r.side === 'buy' ? 'var(--bid-soft)' : 'var(--ask-soft)'
        }}>
          <span style={{color:'var(--fg-2)'}}>{r.t}</span>
          <span style={{textAlign:'center', color: r.side==='buy'?'var(--bid)':'var(--ask)', fontWeight:600}}>{r.p.toFixed(2)}</span>
          <span style={{textAlign:'right'}}>{r.size}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------- Bottom tabs ----------------
function BottomPanel({ candles, showCVD }) {
  const [tab, setTab] = useState(showCVD ? 'cvd' : 'blotter');
  React.useEffect(() => {
    if (!showCVD && tab === 'cvd') setTab('blotter');
  }, [showCVD]);
  return (
    <section className="bottom">
      <div className="bottom-header">
        {showCVD && (
          <button className={`bottom-tab ${tab==='cvd'?'active':''}`} onClick={()=>setTab('cvd')}>
            CVD · Delta
          </button>
        )}
        <button className={`bottom-tab ${tab==='blotter'?'active':''}`} onClick={()=>setTab('blotter')}>
          Trades <span className="count">{BLOTTER.length}</span>
        </button>
        <button className={`bottom-tab ${tab==='positions'?'active':''}`} onClick={()=>setTab('positions')}>
          Positions <span className="count">2</span>
        </button>
        <button className={`bottom-tab ${tab==='pnl'?'active':''}`} onClick={()=>setTab('pnl')}>
          Account · P&amp;L
        </button>
        <button className={`bottom-tab ${tab==='news'?'active':''}`} onClick={()=>setTab('news')}>
          News <span className="count">{NEWS.length}</span>
        </button>
        <button className={`bottom-tab ${tab==='alerts'?'active':''}`} onClick={()=>setTab('alerts')}>
          Alerts <span className="count">{ALERTS.filter(a=>a.on).length}</span>
        </button>
        <div style={{marginLeft:'auto', display:'flex', gap:2, paddingRight:4}}>
          <button className="iconbtn" title="Expand"><Icons.expand size={13} /></button>
          <button className="iconbtn" title="More"><Icons.dots size={15} /></button>
        </div>
      </div>
      <div className="bottom-body">
        {tab === 'cvd' && showCVD && <CvdChart candles={candles} />}
        {tab === 'blotter' && <Blotter />}
        {tab === 'positions' && <Positions />}
        {tab === 'pnl' && <PnL />}
        {tab === 'news' && <NewsList />}
        {tab === 'alerts' && <AlertsList />}
      </div>
    </section>
  );
}

function Blotter() {
  return (
    <div className="blotter">
      <table>
        <thead>
          <tr>
            <th>Time</th><th>Symbol</th><th>Side</th><th>Qty</th>
            <th>Entry</th><th>Exit</th><th>P&amp;L</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {BLOTTER.map((r,i)=>(
            <tr key={i}>
              <td>{r.t}</td>
              <td className="sym">{r.sym}</td>
              <td className={`side ${r.side.toLowerCase()}`}>{r.side}</td>
              <td>{r.qty}</td>
              <td>{typeof r.entry==='number' ? r.entry.toLocaleString(undefined,{minimumFractionDigits:2}) : r.entry}</td>
              <td>{typeof r.exit==='number' ? r.exit.toLocaleString(undefined,{minimumFractionDigits:2}) : r.exit}</td>
              <td className={`pnl ${r.pnl>=0?'pos':'neg'}`}>{r.pnl>=0?'+':''}${r.pnl.toFixed(2)}</td>
              <td><span style={{
                padding:'2px 7px', borderRadius:3, fontSize:10,
                background:'var(--bg-3)', color: r.status==='Open' ? 'var(--info)' : 'var(--fg-2)',
                textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:600
              }}>{r.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Positions() {
  const open = BLOTTER.filter(b => b.status === 'Open');
  return (
    <div className="blotter">
      <table>
        <thead>
          <tr>
            <th>Symbol</th><th>Side</th><th>Qty</th>
            <th>Avg Entry</th><th>Mark</th><th>Unrealized</th><th>Drawdown</th>
          </tr>
        </thead>
        <tbody>
          {open.map((r,i)=>(
            <tr key={i}>
              <td className="sym">{r.sym}</td>
              <td className={`side ${r.side.toLowerCase()}`}>{r.side}</td>
              <td>{r.qty}</td>
              <td>{r.entry.toFixed(2)}</td>
              <td>{(r.entry + r.pnl/r.qty).toFixed(2)}</td>
              <td className={`pnl ${r.pnl>=0?'pos':'neg'}`}>{r.pnl>=0?'+':''}${r.pnl.toFixed(2)}</td>
              <td>-$18.40</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PnL() {
  const metrics = [
    { k: 'Equity',           v: '$128,412.50', d: '+1,284.30 (+1.01%)', pos: true },
    { k: 'Day P&L',          v: '+$1,284.30',  d: 'realized +$1,210.80', pos: true },
    { k: 'Open P&L',         v: '+$73.50',     d: '2 positions',         pos: true },
    { k: 'Buying Power',     v: '$86,200',     d: '2.5× leverage',       pos: null },
    { k: 'Win Rate (30d)',   v: '62%',         d: '38 / 61 trades',      pos: true },
    { k: 'Avg Win / Loss',   v: '1.84 R',      d: 'expectancy +0.42R',   pos: true },
    { k: 'Max Drawdown',     v: '-$2,140',     d: 'April 12',            pos: false },
    { k: 'Sharpe (90d)',     v: '1.92',        d: 'annualised',          pos: true },
  ];
  return (
    <div style={{padding:14, display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10}}>
      {metrics.map(m => (
        <div key={m.k} style={{
          padding:12, background:'var(--bg-1)', border:'1px solid var(--line-1)', borderRadius:8
        }}>
          <div style={{fontSize:10.5, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:600, marginBottom:6}}>
            {m.k}
          </div>
          <div className="num" style={{
            fontSize:20, fontWeight:600, letterSpacing:'-0.01em',
            color: m.pos === true ? 'var(--bid)' : m.pos === false ? 'var(--ask)' : 'var(--fg-0)'
          }}>{m.v}</div>
          <div style={{fontSize:11, color:'var(--fg-2)', marginTop:3}}>{m.d}</div>
        </div>
      ))}
    </div>
  );
}

function NewsList() {
  return (
    <div>
      {NEWS.map((n,i)=>(
        <div key={i} className="news-item">
          <span className="news-time num">{n.t}</span>
          <div>
            <div className="news-title">{n.title}</div>
            <div className="news-src">{n.src}</div>
          </div>
          <span className={`news-impact ${n.impact}`}>{n.impact==='hi'?'High':n.impact==='md'?'Med':'Low'}</span>
        </div>
      ))}
    </div>
  );
}

function AlertsList() {
  const [list, setList] = useState(ALERTS);
  return (
    <div>
      {list.map((a,i)=>(
        <div key={i} className={`alert-item ${a.hit?'hit':''}`}>
          <div className="alert-ico"><Icons.bell size={14} /></div>
          <div className="alert-cond">
            <span className="sym">{a.sym}</span>
            <span style={{color:'var(--fg-1)'}}>{a.cond}</span>
          </div>
          <span className="alert-time">{a.time}</span>
          <button className={`alert-toggle ${a.on?'on':''}`}
                  onClick={()=>{
                    const next = [...list];
                    next[i] = {...a, on: !a.on};
                    setList(next);
                  }} />
        </div>
      ))}
      <div style={{padding:12, textAlign:'center'}}>
        <button style={{
          padding:'6px 12px', fontSize:11.5, color:'var(--accent, var(--info))',
          background:'transparent', border:'1px dashed var(--line-2)', borderRadius:5, cursor:'pointer'
        }}>+ New alert</button>
      </div>
    </div>
  );
}

Object.assign(window, { LeftNav, LeftRail, RightRail, BottomPanel });
