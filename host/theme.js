// Colour themes. The host turns the user's choice into CSS variables and pushes them to the main window,
// the status pill and every plugin page, so plugins using /__deskmate/ui.css follow along without any code.
const { nativeTheme } = require('electron');

const PALETTES = {
  dark: { bg: '#15171c', panel: '#1d2027', card: '#242832', line: '#2f3440', text: '#e6e8ee', muted: '#8b92a3', ok: '#3ccf8e', bad: '#ff5d6c' },
  light: { bg: '#f3f4f7', panel: '#ffffff', card: '#e8eaf0', line: '#d3d7e0', text: '#1c1f26', muted: '#5d6475', ok: '#1f9d63', bad: '#d93a4a' },
};
const ACCENTS = ['#ff8a3d', '#3d9bff', '#3ccf8e', '#a77bff', '#ff5fa2', '#ff5d6c', '#ffc93d', '#2fd3d3'];
const DEFAULTS = { mode: 'dark', accent: '#ff8a3d' };

const hexOk = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (a) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
// Text on an accent-coloured button: near-black on bright accents, white on dark ones.
function onColor(c) {
  const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? '#14110a' : '#ffffff';
}

function resolve(t = {}) {
  const mode = ['dark', 'light', 'system'].includes(t.mode) ? t.mode : DEFAULTS.mode;
  const dark = mode === 'system' ? nativeTheme.shouldUseDarkColors : mode === 'dark';
  const accent = hexOk(t.accent) ? t.accent.toLowerCase() : DEFAULTS.accent;
  const p = PALETTES[dark ? 'dark' : 'light'];
  return { dark, vars: { ...p, accent, 'accent-2': mix(accent, dark ? '#ffffff' : '#000000', 0.3), 'on-accent': onColor(accent) } };
}
function css(t) {
  const { dark, vars } = resolve(t);
  // html:root outranks the pages' own :root rules (injected sheets come before them in the cascade).
  return `html:root{color-scheme:${dark ? 'dark' : 'light'};${Object.entries(vars).map(([k, v]) => `--${k}:${v}`).join(';')}}`;
}

module.exports = { resolve, css, ACCENTS, DEFAULTS, hexOk };
