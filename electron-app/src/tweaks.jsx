/* global React */
const { useState, useEffect } = React;

const ACCENTS = [
  { name: 'Blue',   v: '#2962ff' },
  { name: 'Teal',   v: '#0891b2' },
  { name: 'Violet', v: '#7c3aed' },
  { name: 'Amber',  v: '#d97706' },
  { name: 'Rose',   v: '#e11d48' },
  { name: 'Lime',   v: '#65a30d' },
];

function TweaksPanel({ state, set, onClose }) {
  return (
    <div className="tweaks">
      <div className="tweaks-head">
        <span>Tweaks</span>
        <button className="iconbtn" onClick={onClose} style={{width:22,height:22}} title="Close">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
      <div className="tweaks-body">
        <Row label="Theme">
          <div className="tw-seg">
            <button className={state.theme==='dark'?'on':''}  onClick={()=>set({theme:'dark'})}>Dark</button>
            <button className={state.theme==='light'?'on':''} onClick={()=>set({theme:'light'})}>Light</button>
          </div>
        </Row>
        <Row label="Accent">
          <div className="tw-swatches">
            {ACCENTS.map(a => (
              <button key={a.v}
                className={`tw-swatch ${state.accent===a.v?'on':''}`}
                style={{background:a.v}}
                title={a.name}
                onClick={()=>set({accent:a.v})} />
            ))}
          </div>
        </Row>
        <Row label="Intensity">
          <input className="tw-slider" type="range" min="10" max="100" step="5"
                 value={state.intensity}
                 onChange={e=>set({intensity:+e.target.value})} />
        </Row>
        <Row label="Density">
          <div className="tw-seg">
            <button className={state.density==='compact'?'on':''}     onClick={()=>set({density:'compact'})}>Compact</button>
            <button className={state.density==='comfortable'?'on':''} onClick={()=>set({density:'comfortable'})}>Comfy</button>
            <button className={state.density==='spacious'?'on':''}    onClick={()=>set({density:'spacious'})}>Spacious</button>
          </div>
        </Row>
        <Row label="Font">
          <div className="tw-seg">
            <button className={state.font==='grotesk'?'on':''} onClick={()=>set({font:'grotesk'})}>Grotesk</button>
            <button className={state.font==='mono'?'on':''}    onClick={()=>set({font:'mono'})}>Mono</button>
          </div>
        </Row>
        <Row label="Watchlist">
          <button className={`tw-toggle ${state.sidebars?'on':''}`} onClick={()=>set({sidebars:!state.sidebars})} />
        </Row>
        <Row label="Vol Profile">
          <button className={`tw-toggle ${state.showVolumeProfile?'on':''}`} onClick={()=>set({showVolumeProfile:!state.showVolumeProfile})} />
        </Row>
        <Row label="CVD Panel">
          <button className={`tw-toggle ${state.showCVD?'on':''}`} onClick={()=>set({showCVD:!state.showCVD})} />
        </Row>
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="tw-row">
      <label>{label}</label>
      <div>{children}</div>
    </div>
  );
}

// Hook to sync tweaks state with host (for persistence) and with the page (applies theme attrs)
function useTweaks(initial) {
  const [state, setState] = useState(initial);
  const [visible, setVisible] = useState(false);

  // Apply to document
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', state.theme);
    root.setAttribute('data-font', state.font);
    root.setAttribute('data-density', state.density);
    root.style.setProperty('--accent', state.accent);
  }, [state]);

  // Edit-mode protocol
  useEffect(() => {
    const onMsg = (e) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === '__activate_edit_mode') setVisible(true);
      else if (e.data.type === '__deactivate_edit_mode') setVisible(false);
    };
    window.addEventListener('message', onMsg);
    try { window.parent.postMessage({type:'__edit_mode_available'}, '*'); } catch (err) {}
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const set = (patch) => {
    setState(s => {
      const next = { ...s, ...patch };
      try { window.parent.postMessage({type:'__edit_mode_set_keys', edits: patch}, '*'); } catch(err) {}
      return next;
    });
  };

  return { state, set, visible, setVisible };
}

Object.assign(window, { TweaksPanel, useTweaks, ACCENTS });
