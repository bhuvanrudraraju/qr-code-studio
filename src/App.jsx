import { useEffect, useMemo, useRef, useState } from 'react';
import {
  TYPES, DEFAULT_FIELDS, DEFAULT_SETTINGS, PRESETS,
  buildPayload, makeQR, analyze, drawQR, toSVG,
} from './qr.js';

const RECENT_KEY = 'qr-studio-recent-v1';
const THEME_KEY = 'qr-studio-theme';
const MAX_RECENT = 12;

const load = (k, fallback) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
};

function saveAs(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function Thumb({ item }) {
  const ref = useRef(null);
  useEffect(() => {
    const { qr } = makeQR(item.payload, item.settings.ecl);
    if (!qr || !ref.current) return;
    const draw = (logo) => drawQR(ref.current, qr, { ...item.settings, size: 96 }, logo);
    if (item.logo) loadImage(item.logo).then(draw).catch(() => draw(null));
    else draw(null);
  }, [item]);
  return <canvas ref={ref} width="96" height="96" aria-hidden="true" />;
}

function Field({ label, error, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error && <small className="err" role="alert">{error}</small>}
    </label>
  );
}

export default function App() {
  const [theme, setTheme] = useState(() => load(THEME_KEY, window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [type, setType] = useState('url');
  const [fields, setFields] = useState(DEFAULT_FIELDS);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [preset, setPreset] = useState('Classic');
  const [logoSrc, setLogoSrc] = useState(null);
  const [logoImg, setLogoImg] = useState(null);
  const [recent, setRecent] = useState(() => load(RECENT_KEY, []));
  const [toast, setToast] = useState('');
  const canvasRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    save(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!logoSrc) return setLogoImg(null);
    loadImage(logoSrc).then(setLogoImg).catch(() => setLogoImg(null));
  }, [logoSrc]);

  const { payload, errors } = useMemo(() => buildPayload(type, fields), [type, fields]);
  const built = useMemo(() => (payload ? makeQR(payload, settings.ecl) : null), [payload, settings.ecl]);
  const qr = built?.qr;
  const valid = Boolean(qr);
  const warnings = useMemo(
    () => (qr ? analyze(settings, qr.getModuleCount(), Boolean(logoImg)) : []),
    [qr, settings, logoImg],
  );

  // Live preview
  useEffect(() => {
    if (qr && canvasRef.current) drawQR(canvasRef.current, qr, settings, logoImg);
  }, [qr, settings, logoImg]);

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  };
  const setField = (k, v) => setFields((f) => ({ ...f, [k]: v }));
  const setS = (k, v) => {
    setSettings((s) => ({ ...s, [k]: v }));
    setPreset(null);
  };
  const applyPreset = (p) => {
    setSettings((s) => ({ ...s, ...p.values }));
    setPreset(p.name);
  };

  const onLogo = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return flash('Please choose an image file.');
    if (file.size > 1024 * 1024) return flash('Logo must be under 1 MB.');
    const reader = new FileReader();
    reader.onload = () => {
      setLogoSrc(reader.result);
      setSettings((s) => ({ ...s, ecl: 'H' })); // logos need high error correction
    };
    reader.readAsDataURL(file);
  };

  const saveRecent = () => {
    if (!valid) return;
    const key = JSON.stringify([type, payload, settings, logoSrc ? logoSrc.length : 0]);
    const item = {
      id: Date.now(), key, type, fields, settings, payload,
      logo: logoSrc && logoSrc.length < 150_000 ? logoSrc : null,
    };
    const next = [item, ...recent.filter((r) => r.key !== key)].slice(0, MAX_RECENT);
    setRecent(next);
    if (!save(RECENT_KEY, next)) {
      const light = next.map((r) => ({ ...r, logo: null }));
      setRecent(light);
      save(RECENT_KEY, light);
    }
  };

  const downloadPNG = () => {
    canvasRef.current.toBlob((b) => {
      saveAs(b, 'qr-code.png');
      saveRecent();
      flash('PNG downloaded');
    }, 'image/png');
  };
  const downloadSVG = () => {
    saveAs(new Blob([toSVG(qr, settings, logoImg)], { type: 'image/svg+xml' }), 'qr-code.svg');
    saveRecent();
    flash('SVG downloaded');
  };
  const copyImage = () => {
    if (!navigator.clipboard?.write || !window.ClipboardItem) return flash('Clipboard not supported in this browser.');
    canvasRef.current.toBlob(async (b) => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
        saveRecent();
        flash('Copied to clipboard');
      } catch {
        flash('Could not copy. Try downloading instead.');
      }
    }, 'image/png');
  };

  const reuse = (r) => {
    setType(r.type);
    setFields({ ...DEFAULT_FIELDS, ...r.fields });
    setSettings({ ...DEFAULT_SETTINGS, ...r.settings });
    setLogoSrc(r.logo || null);
    setPreset(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const removeRecent = (id) => {
    const next = recent.filter((r) => r.id !== id);
    setRecent(next);
    save(RECENT_KEY, next);
  };
  const clearRecent = () => {
    setRecent([]);
    save(RECENT_KEY, []);
  };

  return (
    <div className="app">
      <header>
        <h1><span aria-hidden="true">▦</span> QR Code Studio</h1>
        <button className="ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
          {theme === 'dark' ? '☀ Light' : '☾ Dark'}
        </button>
      </header>

      <main>
        <section className="panel" aria-label="Content and style">
          <div className="tabs" role="tablist">
            {TYPES.map((t) => (
              <button key={t.id} role="tab" aria-selected={type === t.id} className={type === t.id ? 'tab on' : 'tab'} onClick={() => setType(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="fields">
            {type === 'url' && (
              <Field label="Website URL" error={errors.url}>
                <input value={fields.url} onChange={(e) => setField('url', e.target.value)} placeholder="https://example.com" inputMode="url" aria-invalid={!!errors.url} />
              </Field>
            )}
            {type === 'text' && (
              <Field label="Text" error={errors.text}>
                <textarea rows="4" value={fields.text} onChange={(e) => setField('text', e.target.value)} placeholder="Anything you like…" aria-invalid={!!errors.text} />
              </Field>
            )}
            {type === 'email' && (
              <>
                <Field label="Email address" error={errors.email}>
                  <input type="email" value={fields.email} onChange={(e) => setField('email', e.target.value)} placeholder="name@example.com" aria-invalid={!!errors.email} />
                </Field>
                <Field label="Subject (optional)"><input value={fields.subject} onChange={(e) => setField('subject', e.target.value)} /></Field>
                <Field label="Message (optional)"><textarea rows="3" value={fields.body} onChange={(e) => setField('body', e.target.value)} /></Field>
              </>
            )}
            {type === 'phone' && (
              <Field label="Phone number" error={errors.phone}>
                <input type="tel" value={fields.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="+91 98765 43210" aria-invalid={!!errors.phone} />
              </Field>
            )}
            {type === 'wifi' && (
              <>
                <Field label="Network name (SSID)" error={errors.ssid}>
                  <input value={fields.ssid} onChange={(e) => setField('ssid', e.target.value)} aria-invalid={!!errors.ssid} />
                </Field>
                <Field label="Security">
                  <select value={fields.encryption} onChange={(e) => setField('encryption', e.target.value)}>
                    <option value="WPA">WPA/WPA2/WPA3</option>
                    <option value="WEP">WEP</option>
                    <option value="nopass">None (open network)</option>
                  </select>
                </Field>
                {fields.encryption !== 'nopass' && (
                  <Field label="Password" error={errors.password}>
                    <input type="text" value={fields.password} onChange={(e) => setField('password', e.target.value)} aria-invalid={!!errors.password} autoComplete="off" />
                  </Field>
                )}
                <label className="check"><input type="checkbox" checked={fields.hidden} onChange={(e) => setField('hidden', e.target.checked)} /> Hidden network</label>
              </>
            )}
          </div>

          <h2>Presets</h2>
          <div className="chips">
            {PRESETS.map((p) => (
              <button key={p.name} className={preset === p.name ? 'chip on' : 'chip'} onClick={() => applyPreset(p)}>
                <i style={{ background: p.values.gradient ? `linear-gradient(135deg,${p.values.fg},${p.values.fg2})` : p.values.fg, outline: `3px solid ${p.values.bg}` }} />
                {p.name}
              </button>
            ))}
          </div>

          <h2>Customize</h2>
          <div className="grid2">
            <label className="field"><span>Size: {settings.size}px</span>
              <input type="range" min="128" max="1024" step="16" value={settings.size} onChange={(e) => setS('size', +e.target.value)} /></label>
            <label className="field"><span>Margin: {settings.margin} modules</span>
              <input type="range" min="0" max="10" value={settings.margin} onChange={(e) => setS('margin', +e.target.value)} /></label>
            <label className="field"><span>Foreground</span>
              <input type="color" value={settings.fg} onChange={(e) => setS('fg', e.target.value)} /></label>
            <label className="field"><span>Background</span>
              <input type="color" value={settings.bg} onChange={(e) => setS('bg', e.target.value)} /></label>
            <label className="field"><span>Error correction</span>
              <select value={settings.ecl} onChange={(e) => setS('ecl', e.target.value)}>
                <option value="L">Low (7%)</option>
                <option value="M">Medium (15%)</option>
                <option value="Q">Quartile (25%)</option>
                <option value="H">High (30%)</option>
              </select></label>
            <label className="field"><span>Pattern</span>
              <select value={settings.dot} onChange={(e) => setS('dot', e.target.value)}>
                <option value="square">Square</option>
                <option value="rounded">Rounded</option>
                <option value="dots">Dots</option>
              </select></label>
          </div>
          <label className="check"><input type="checkbox" checked={settings.gradient} onChange={(e) => setS('gradient', e.target.checked)} /> Gradient foreground</label>
          {settings.gradient && (
            <label className="field"><span>Gradient end colour</span>
              <input type="color" value={settings.fg2} onChange={(e) => setS('fg2', e.target.value)} /></label>
          )}

          <div className="logo-row">
            <label className="btn ghost">
              {logoSrc ? 'Change logo' : 'Add logo'}
              <input type="file" accept="image/*" onChange={onLogo} hidden />
            </label>
            {logoSrc && (
              <>
                <label className="field inline"><span>Logo size {Math.round(settings.logoScale * 100)}%</span>
                  <input type="range" min="0.1" max="0.3" step="0.01" value={settings.logoScale} onChange={(e) => setS('logoScale', +e.target.value)} /></label>
                <button className="ghost" onClick={() => setLogoSrc(null)}>Remove</button>
              </>
            )}
          </div>
        </section>

        <section className="preview" aria-label="Preview">
          <div className="canvas-wrap">
            {valid ? (
              <canvas ref={canvasRef} aria-label={`QR code for ${payload}`} />
            ) : (
              <div className="placeholder" role="status">
                {built?.error || 'Fill in the form to see your QR code.'}
              </div>
            )}
          </div>

          {warnings.length > 0 && (
            <ul className="warnings" aria-label="Scan reliability warnings">
              {warnings.map((w, i) => <li key={i} className={w.level}>{w.level === 'error' ? '⛔' : '⚠️'} {w.text}</li>)}
            </ul>
          )}
          {valid && warnings.length === 0 && <p className="ok">✅ Looks highly scannable.</p>}

          <div className="actions">
            <button className="primary" disabled={!valid} onClick={downloadPNG}>Download PNG</button>
            <button disabled={!valid} onClick={downloadSVG}>Download SVG</button>
            <button disabled={!valid} onClick={copyImage}>Copy</button>
            <button className="ghost" disabled={!valid} onClick={() => { saveRecent(); flash('Saved to recent'); }}>Save</button>
          </div>
        </section>
      </main>

      <section className="recent" aria-label="Recent QR codes">
        <div className="recent-head">
          <h2>Recent QR codes</h2>
          {recent.length > 0 && <button className="ghost" onClick={clearRecent}>Clear all</button>}
        </div>
        {recent.length === 0 ? (
          <p className="muted">Codes you download, copy or save appear here and stay after a refresh.</p>
        ) : (
          <ul className="recent-list">
            {recent.map((r) => (
              <li key={r.id}>
                <button className="thumb" onClick={() => reuse(r)} title="Reuse this QR code">
                  <Thumb item={r} />
                  <span className="badge">{TYPES.find((t) => t.id === r.type)?.label}</span>
                  <span className="payload">{r.payload.length > 36 ? r.payload.slice(0, 36) + '…' : r.payload}</span>
                </button>
                <button className="x" onClick={() => removeRecent(r.id)} aria-label="Remove">×</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer>Runs entirely in your browser. Nothing is uploaded.</footer>
      <div className={toast ? 'toast show' : 'toast'} role="status">{toast}</div>
    </div>
  );
}
