// Fox Design System — theme helpers.
// The only way to change a client's identity is applyBrandColor(hex); never write per-client CSS.

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** '#FFF' | 'fff' | '#ffffff' -> '#FFFFFF', or null for invalid input. */
export function normalizeHex(input) {
  if (typeof input !== 'string') return null;
  const m = input.trim().match(HEX);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h.toUpperCase()}`;
}

export function hexToRgb(input) {
  const hex = normalizeHex(input);
  if (!hex) return null;
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function luminance({ r, g, b }) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(l1, l2) {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Returns the more readable text color (white or dark) on top of the given background. */
export function readableOn(input) {
  const rgb = hexToRgb(input);
  if (!rgb) return '#FFFFFF';
  const l = luminance(rgb);
  return contrast(l, 1) >= contrast(l, luminance({ r: 15, g: 23, b: 42 })) ? '#FFFFFF' : '#0F172A';
}

/** Applies the client's brand color. Hover/active/soft variants derive from it in the tokens. */
export function applyBrandColor(input, root = document.documentElement) {
  const hex = normalizeHex(input);
  if (!hex) return false;
  root.style.setProperty('--color-primary', hex);
  root.style.setProperty('--color-on-primary', readableOn(hex));
  return true;
}

/** theme: 'light'|'dark', density: 'comfortable'|'compact', receipt: '80mm'|'58mm' */
export function applyTheme({ theme, density, receipt } = {}, root = document.documentElement) {
  if (theme) root.setAttribute('data-theme', theme);
  if (density) root.setAttribute('data-density', density);
  if (receipt) root.setAttribute('data-receipt', receipt);
}
