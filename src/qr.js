import qrcode from 'qrcode-generator';

// Encode text as UTF-8 so emojis / non-Latin text scan correctly.
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

export const TYPES = [
  { id: 'url', label: 'URL' },
  { id: 'text', label: 'Text' },
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone' },
  { id: 'wifi', label: 'Wi-Fi' },
];

export const DEFAULT_FIELDS = {
  url: 'https://example.com',
  text: '',
  email: '',
  subject: '',
  body: '',
  phone: '',
  ssid: '',
  password: '',
  encryption: 'WPA',
  hidden: false,
};

export const DEFAULT_SETTINGS = {
  size: 320,
  margin: 4,
  fg: '#000000',
  fg2: '#1d4ed8',
  bg: '#ffffff',
  gradient: false,
  ecl: 'M',
  dot: 'square',
  logoScale: 0.2,
};

export const PRESETS = [
  { name: 'Classic', values: { fg: '#000000', fg2: '#000000', bg: '#ffffff', gradient: false, dot: 'square' } },
  { name: 'Ocean', values: { fg: '#0b3d91', fg2: '#0aa6b8', bg: '#ffffff', gradient: true, dot: 'square' } },
  { name: 'Sunset', values: { fg: '#7a1230', fg2: '#d9480f', bg: '#fff8f0', gradient: true, dot: 'rounded' } },
  { name: 'Forest', values: { fg: '#14532d', fg2: '#14532d', bg: '#f0fdf4', gradient: false, dot: 'rounded' } },
  { name: 'Grape', values: { fg: '#4c1d95', fg2: '#be185d', bg: '#faf5ff', gradient: true, dot: 'dots' } },
  { name: 'Ink Dots', values: { fg: '#111827', fg2: '#111827', bg: '#f9fafb', gradient: false, dot: 'dots' } },
];

/* ---------- Payload building + validation ---------- */

const escWifi = (s) => s.replace(/([\\;,:"])/g, '\\$1');

export function buildPayload(type, f) {
  const errors = {};
  let payload = '';

  switch (type) {
    case 'url': {
      const t = f.url.trim();
      if (!t) {
        errors.url = 'Enter a URL.';
        break;
      }
      const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : 'https://' + t;
      try {
        const u = new URL(withScheme);
        if (!/^https?:$/.test(u.protocol)) errors.url = 'Only http:// and https:// links are supported.';
        else if (!u.hostname.includes('.') && u.hostname !== 'localhost')
          errors.url = 'That doesn’t look like a valid web address.';
        else payload = withScheme;
      } catch {
        errors.url = 'That doesn’t look like a valid web address.';
      }
      break;
    }
    case 'text': {
      if (!f.text.trim()) errors.text = 'Enter some text.';
      else if (f.text.length > 1000) errors.text = 'Text is too long (max 1000 characters).';
      else payload = f.text;
      break;
    }
    case 'email': {
      const addr = f.email.trim();
      if (!addr) errors.email = 'Enter an email address.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr)) errors.email = 'Enter a valid email address.';
      else {
        const params = [];
        if (f.subject.trim()) params.push('subject=' + encodeURIComponent(f.subject.trim()));
        if (f.body.trim()) params.push('body=' + encodeURIComponent(f.body.trim()));
        payload = 'mailto:' + addr + (params.length ? '?' + params.join('&') : '');
      }
      break;
    }
    case 'phone': {
      const cleaned = f.phone.replace(/[\s\-().]/g, '');
      if (!cleaned) errors.phone = 'Enter a phone number.';
      else if (!/^\+?\d{6,15}$/.test(cleaned)) errors.phone = 'Use 6–15 digits, optionally starting with +.';
      else payload = 'tel:' + cleaned;
      break;
    }
    case 'wifi': {
      const ssid = f.ssid.trim();
      if (!ssid) errors.ssid = 'Enter the network name (SSID).';
      else if (ssid.length > 32) errors.ssid = 'SSID can be at most 32 characters.';
      if (f.encryption !== 'nopass') {
        if (!f.password) errors.password = 'Enter the Wi-Fi password.';
        else if (f.encryption === 'WPA' && (f.password.length < 8 || f.password.length > 63))
          errors.password = 'WPA passwords must be 8–63 characters.';
      }
      if (!Object.keys(errors).length) {
        payload =
          `WIFI:T:${f.encryption};S:${escWifi(ssid)};` +
          (f.encryption === 'nopass' ? '' : `P:${escWifi(f.password)};`) +
          (f.hidden ? 'H:true;' : '') +
          ';';
      }
      break;
    }
    default:
      errors.type = 'Unknown type.';
  }
  return { payload, errors };
}

export function makeQR(payload, ecl) {
  try {
    const qr = qrcode(0, ecl);
    qr.addData(payload, 'Byte');
    qr.make();
    return { qr };
  } catch {
    return { error: 'This content is too long to fit in a QR code. Shorten it or lower the error correction level.' };
  }
}

/* ---------- Scan reliability ---------- */

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function contrastRatio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function analyze(s, modules, hasLogo) {
  const w = [];
  const colors = s.gradient ? [s.fg, s.fg2] : [s.fg];
  const worst = Math.min(...colors.map((c) => contrastRatio(c, s.bg)));
  if (worst < 3) w.push({ level: 'error', text: `Contrast is very low (${worst.toFixed(1)}:1). Most scanners will fail. Aim for 4.5:1 or higher.` });
  else if (worst < 4.5) w.push({ level: 'warn', text: `Contrast is lowish (${worst.toFixed(1)}:1). Darker foreground or lighter background is safer.` });
  if (colors.some((c) => lum(c) > lum(s.bg)))
    w.push({ level: 'warn', text: 'Light-on-dark (inverted) codes are not read by some scanner apps.' });
  if (s.margin < 4) w.push({ level: 'warn', text: 'Margin under 4 modules can break the “quiet zone” that scanners need.' });
  const modulePx = s.size / (modules + 2 * s.margin);
  if (modulePx < 4) w.push({ level: 'warn', text: `Each module is only ~${modulePx.toFixed(1)}px. Increase the size or shorten the content.` });
  if (hasLogo) {
    if (s.ecl !== 'H' && s.ecl !== 'Q') w.push({ level: 'error', text: 'A logo hides modules. Use error correction Q or H.' });
    if (s.logoScale > 0.25) w.push({ level: 'warn', text: 'Logo covers a large area. Keep it at 25% of width or less.' });
  }
  if (s.dot === 'dots' && s.ecl === 'L') w.push({ level: 'warn', text: 'Dot patterns plus low error correction is fragile. Try M or higher.' });
  return w;
}

/* ---------- Rendering ---------- */

const inFinder = (r, c, n) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

// Returns the logo box and the fitted image rectangle (as fractions of the full size).
function logoLayout(scale, img) {
  const box = scale;
  const x = (1 - box) / 2;
  const pad = box * 0.12;
  const inner = box - 2 * pad;
  const ratio = img.w / img.h;
  const w = ratio >= 1 ? inner : inner * ratio;
  const h = ratio >= 1 ? inner / ratio : inner;
  return { box: { x, y: x, w: box }, img: { x: 0.5 - w / 2, y: 0.5 - h / 2, w, h } };
}

export function drawQR(canvas, qr, s, logo) {
  const n = qr.getModuleCount();
  const total = n + 2 * s.margin;
  const size = s.size;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = s.bg;
  ctx.fillRect(0, 0, size, size);

  let fill = s.fg;
  if (s.gradient) {
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, s.fg);
    g.addColorStop(1, s.fg2);
    fill = g;
  }
  ctx.fillStyle = fill;
  const cell = size / total;

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      const x = (c + s.margin) * cell;
      const y = (r + s.margin) * cell;
      const style = inFinder(r, c, n) ? 'square' : s.dot;
      if (style === 'square') {
        const x0 = Math.round(x), y0 = Math.round(y);
        ctx.fillRect(x0, y0, Math.round(x + cell) - x0, Math.round(y + cell) - y0);
      } else if (style === 'rounded' && ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, y, cell, cell, cell * 0.35);
        ctx.fill();
      } else if (style === 'rounded') {
        ctx.fillRect(x, y, cell, cell);
      } else {
        ctx.beginPath();
        ctx.arc(x + cell / 2, y + cell / 2, cell * 0.46, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  if (logo) {
    const L = logoLayout(s.logoScale, { w: logo.naturalWidth, h: logo.naturalHeight });
    ctx.fillStyle = s.bg;
    const bx = L.box.x * size, bw = L.box.w * size;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(bx, bx, bw, bw, bw * 0.15);
      ctx.fill();
    } else ctx.fillRect(bx, bx, bw, bw);
    ctx.drawImage(logo, L.img.x * size, L.img.y * size, L.img.w * size, L.img.h * size);
  }
}

export function toSVG(qr, s, logo) {
  const n = qr.getModuleCount();
  const total = n + 2 * s.margin;
  let squares = '';
  let shapes = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      const x = c + s.margin, y = r + s.margin;
      const style = inFinder(r, c, n) ? 'square' : s.dot;
      if (style === 'square') squares += `M${x} ${y}h1v1h-1z`;
      else if (style === 'rounded') shapes += `<rect x="${x}" y="${y}" width="1" height="1" rx=".35"/>`;
      else shapes += `<circle cx="${x + 0.5}" cy="${y + 0.5}" r=".46"/>`;
    }
  }
  const defs = s.gradient
    ? `<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${total}" y2="${total}"><stop offset="0" stop-color="${s.fg}"/><stop offset="1" stop-color="${s.fg2}"/></linearGradient></defs>`
    : '';
  const fill = s.gradient ? 'url(#g)' : s.fg;
  let logoSvg = '';
  if (logo) {
    const L = logoLayout(s.logoScale, { w: logo.naturalWidth, h: logo.naturalHeight });
    const t = (v) => (v * total).toFixed(3);
    logoSvg =
      `<rect x="${t(L.box.x)}" y="${t(L.box.y)}" width="${t(L.box.w)}" height="${t(L.box.w)}" rx="${t(L.box.w * 0.15)}" fill="${s.bg}"/>` +
      `<image href="${logo.src}" x="${t(L.img.x)}" y="${t(L.img.y)}" width="${t(L.img.w)}" height="${t(L.img.h)}"/>`;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s.size}" height="${s.size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    defs +
    `<rect width="${total}" height="${total}" fill="${s.bg}"/>` +
    `<g fill="${fill}"><path d="${squares}"/>${shapes}</g>` +
    logoSvg +
    `</svg>`
  );
}
