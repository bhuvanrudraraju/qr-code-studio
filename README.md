https://qr-code-studio-bhuvan.netlify.app/
# QR Code Studio

A browser-only QR code generator and designer built with **React + Vite**. Enter content, style the code, preview it live, and download it as PNG or SVG. No backend, nothing is uploaded.

## Features

- **QR types:** URL, plain text, email (with subject/body), phone number, Wi-Fi (WPA/WEP/open, hidden network)
- **Live preview** that updates on every change
- **Customization:** size, margin, foreground/background colour, error correction level (L/M/Q/H)
- **Presets:** Classic, Ocean, Sunset, Forest, Grape, Ink Dots. Everything stays editable after picking one
- **Validation:** inline, per-field error messages for incomplete or invalid input
- **Scan reliability checks:** warnings for low contrast, inverted colours, small margin, tiny modules, and logos with weak error correction
- **Downloads:** PNG (pixel-identical to the preview, same canvas) and SVG
- **Recent QR codes:** saved in `localStorage` (latest 12), survive refresh, click to reuse
- **Extras:** gradient colours, dot/rounded patterns, logo overlay, copy to clipboard, dark/light theme
- **Responsive** layout for desktop and mobile

Finder patterns (the three big corner squares) always stay square, even with dot or rounded styles, to keep codes scannable.

## Getting started

Requires Node.js 18+.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
npm run preview  # serve the production build locally
npm test         # unit tests (vitest)
```

## Project structure

```
index.html
package.json
vite.config.js
netlify.toml
src/
  main.jsx        entry point
  App.jsx         UI, state, downloads, recent list
  qr.js           payload builders, validation, scan checks, canvas + SVG renderers
  qr.test.js      unit tests
  styles.css      responsive styles, light/dark theme
```

QR matrices come from [`qrcode-generator`](https://www.npmjs.com/package/qrcode-generator). Drawing is custom, which is what enables patterns, gradients and logos.


## Testing checklist

Automated: `npm test` covers payload building for every type, validation errors, oversized content and contrast maths.

Manual:

| Area | What to check |
|------|---------------|
| All types | Generate URL, text, email, phone and Wi-Fi codes; scan each with a phone and confirm the action (open link, compose mail, dial, join network) |
| Customization | Change size, margin, colours, error correction, pattern, gradient; preview updates instantly |
| Presets | Pick a preset, then tweak a setting; the preset highlight clears and your change applies |
| Downloads | Download PNG and SVG; compare with the preview and scan the downloaded file |
| Invalid input | Empty fields, `not a url`, `abc` as a phone number, short WPA password, 5000+ characters of text |
| Persistence | Download or Save a few codes, refresh the page, confirm they remain and reuse restores everything |
| Reliability | Pick very similar fg/bg colours, margin 0, or a logo with Low error correction and confirm warnings appear |
| Responsive | Check at ~360px, ~768px and desktop widths; preview shows first on mobile |

## Notes

- Clipboard image copy needs a secure context (HTTPS or localhost) and a browser that supports `ClipboardItem`.
- Logos over ~150 KB are not kept in the recent list (to stay within `localStorage` limits); the code itself is still restored.
- Always test-scan a customized code before printing it.


