const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// ---------- math: a small parser (never eval) ----------
// + - * / ^, % (percent), ! (factorial), parentheses, 2(3) and 2pi style multiplication,
// sqrt cbrt abs round floor ceil log ln sin cos tan asin acos atan (degrees), pi, e, ans.
const FUNCS = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  log: Math.log10, ln: Math.log, exp: Math.exp,
  sin: (x) => Math.sin(x * Math.PI / 180), cos: (x) => Math.cos(x * Math.PI / 180), tan: (x) => Math.tan(x * Math.PI / 180),
  asin: (x) => Math.asin(x) * 180 / Math.PI, acos: (x) => Math.acos(x) * 180 / Math.PI, atan: (x) => Math.atan(x) * 180 / Math.PI,
};
let ans = 0;
function tokenize(src) {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '').replace(/√/g, 'sqrt').replace(/π/g, 'pi');
  const out = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (num) { out.push({ t: 'n', v: parseFloat(num[0]) }); i += num[0].length; continue; }
    const word = /^[a-z]+/i.exec(s.slice(i));
    if (word) { out.push({ t: 'w', v: word[0].toLowerCase() }); i += word[0].length; continue; }
    if ('+-*/^%!()'.includes(c)) { out.push({ t: c }); i++; continue; }
    throw new Error(`Unexpected "${c}"`);
  }
  return out;
}
function evaluate(src) {
  const tk = tokenize(src); let p = 0;
  const peek = () => tk[p], next = () => tk[p++];
  const expect = (t) => { if (peek()?.t !== t) throw new Error(t === ')' ? 'Missing )' : `Expected ${t}`); p++; };
  const startsPrimary = (x) => x && (x.t === 'n' || x.t === 'w' || x.t === '(');
  function expr() { let v = term(); while (peek()?.t === '+' || peek()?.t === '-') v = next().t === '+' ? v + term() : v - term(); return v; }
  function term() {
    let v = factor();
    for (;;) {
      const t = peek()?.t;
      if (t === '*') { p++; v *= factor(); }
      else if (t === '/') { p++; const d = factor(); if (d === 0) throw new Error("Can't divide by 0"); v /= d; }
      else if (startsPrimary(peek())) v *= factor(); // 2(3), 2pi
      else return v;
    }
  }
  function factor() { const b = unary(); if (peek()?.t === '^') { p++; return Math.pow(b, factor()); } return b; }
  function unary() { if (peek()?.t === '-') { p++; return -unary(); } if (peek()?.t === '+') { p++; return unary(); } return postfix(); }
  function postfix() {
    let v = primary();
    for (;;) {
      if (peek()?.t === '%') { p++; v /= 100; }
      else if (peek()?.t === '!') { p++; if (v < 0 || v > 170 || v % 1) throw new Error('! needs a whole number 0-170'); let f = 1; for (let k = 2; k <= v; k++) f *= k; v = f; }
      else return v;
    }
  }
  function primary() {
    const x = next();
    if (!x) throw new Error('Incomplete');
    if (x.t === 'n') return x.v;
    if (x.t === '(') { const v = expr(); expect(')'); return v; }
    if (x.t === 'w') {
      if (x.v === 'pi') return Math.PI;
      if (x.v === 'e') return Math.E;
      if (x.v === 'ans') return ans;
      if (FUNCS[x.v]) { const arg = peek()?.t === '(' ? (p++, (() => { const v = expr(); expect(')'); return v; })()) : unary(); return FUNCS[x.v](arg); }
      throw new Error(`Unknown "${x.v}"`);
    }
    throw new Error(`Unexpected "${x.t}"`);
  }
  if (!tk.length) return null;
  const v = expr();
  if (p < tk.length) throw new Error(`Unexpected "${tk[p].t === 'n' ? tk[p].v : tk[p].v || tk[p].t}"`);
  if (!Number.isFinite(v)) throw new Error('Result is too big');
  return v;
}
const fmt = (v) => {
  if (v == null) return '';
  const r = Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-9 && v !== 0) ? v.toExponential(8) : String(+v.toPrecision(12));
  return r.replace(/^(-?\d+)(\.\d+)?$/, (m, a, b) => a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (b || ''));
};

// ---------- calculator UI ----------
let history = load('history', []);
const KEYS = [
  ['C', 'fn'], ['(', 'fn'], [')', 'fn'], ['%', 'fn'], ['⌫', 'fn'],
  ['7'], ['8'], ['9'], ['÷', 'op'], ['√', 'fn'],
  ['4'], ['5'], ['6'], ['×', 'op'], ['^', 'fn'],
  ['1'], ['2'], ['3'], ['-', 'op'], ['ans', 'fn'],
  ['0'], ['.'], ['π', 'fn'], ['+', 'op'], ['=', 'eq'],
];
$('#keys').innerHTML = KEYS.map(([k, c]) => `<button class="${c || ''}" data-k="${k}">${k}</button>`).join('');
function preview() {
  const el = $('#preview');
  try { const v = evaluate($('#expr').value); el.textContent = v == null ? '' : '= ' + fmt(v); el.classList.remove('err'); }
  catch (e) { el.textContent = $('#expr').value.trim() ? e.message : ''; el.classList.add('err'); }
}
function renderHist() {
  $('#hist').innerHTML = history.slice(-20).map((h, i) => `<div data-h="${history.length - Math.min(20, history.length) + i}"><span class="ellipsis">${esc(h.e)}</span><b>${esc(fmt(h.v))}</b></div>`).join('');
  $('#hist').scrollTop = 1e6;
}
function equals() {
  const src = $('#expr').value;
  try {
    const v = evaluate(src); if (v == null) return;
    ans = v; history.push({ e: src, v }); history = history.slice(-50); store('history', history);
    $('#expr').value = String(+v.toPrecision(12)); renderHist(); preview();
  } catch (e) { $('#preview').textContent = e.message; $('#preview').classList.add('err'); }
}
function insert(text) {
  const el = $('#expr'), s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? s;
  el.value = el.value.slice(0, s) + text + el.value.slice(e);
  el.selectionStart = el.selectionEnd = s + text.length;
  el.focus(); preview();
}
$('#keys').onclick = (ev) => {
  const k = ev.target.closest('[data-k]')?.dataset.k; if (!k) return;
  const el = $('#expr');
  if (k === 'C') { el.value = ''; preview(); el.focus(); return; }
  if (k === '⌫') { const s = el.selectionStart; if (s > 0) { el.value = el.value.slice(0, s - 1) + el.value.slice(s); el.selectionStart = el.selectionEnd = s - 1; } el.focus(); preview(); return; }
  if (k === '=') return equals();
  insert(k === '√' ? '√(' : k);
};
$('#expr').oninput = preview;
$('#expr').onkeydown = (e) => { if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); equals(); } };
$('#hist').onclick = (e) => { const h = history[e.target.closest('[data-h]')?.dataset.h]; if (h) insert(String(+h.v.toPrecision(12))); };
$('#copyRes').onclick = async () => {
  let v; try { v = evaluate($('#expr').value); } catch { return; }
  if (v == null) return;
  await deskmate.copyText(String(+v.toPrecision(12)));
  deskmate.toast('Copied');
};

// ---------- converter ----------
// Each unit is a factor to the category's base unit; temperature uses functions.
const CATS = {
  Length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254, nmi: 1852 },
  Weight: { kg: 1, g: 0.001, mg: 1e-6, t: 1000, lb: 0.45359237, oz: 0.028349523125, st: 6.35029318 },
  Temperature: { '°C': 'C', '°F': 'F', K: 'K' },
  Volume: { L: 1, mL: 0.001, 'm³': 1000, gal: 3.785411784, qt: 0.946352946, pt: 0.473176473, cup: 0.2365882365, 'fl oz': 0.0295735295625, tbsp: 0.01478676478125, tsp: 0.00492892159375 },
  Speed: { 'km/h': 1, mph: 1.609344, 'm/s': 3.6, knot: 1.852, 'ft/s': 1.09728 },
  Area: { 'm²': 1, 'km²': 1e6, 'ft²': 0.09290304, 'mi²': 2589988.110336, acre: 4046.8564224, ha: 10000, 'in²': 0.00064516 },
  Data: { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1048576, GiB: 1073741824, bit: 0.125, Mbit: 125000, Gbit: 1.25e8 },
  Time: { s: 1, ms: 0.001, min: 60, h: 3600, day: 86400, week: 604800, month: 2629746, year: 31556952 },
  Currency: null, // filled from live rates
};
const toC = { C: (v) => v, F: (v) => (v - 32) * 5 / 9, K: (v) => v - 273.15 };
const fromC = { C: (v) => v, F: (v) => v * 9 / 5 + 32, K: (v) => v + 273.15 };
const POPULAR = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY', 'INR', 'MXN', 'BRL', 'CHF', 'SEK', 'NOK', 'KRW', 'NZD'];
let conv = load('conv', { cat: 'Length', from: 'mi', to: 'km' });
let ratesInfo = '';

async function loadRates() {
  const cached = load('rates', null);
  if (cached && Date.now() - cached.at < 12 * 3600e3) return cached;
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD');
    const j = await r.json();
    if (j.result !== 'success') throw new Error();
    const rates = { at: Date.now(), updated: j.time_last_update_unix * 1000, rates: j.rates };
    store('rates', rates); return rates;
  } catch { return cached; }
}
async function setupCurrency() {
  const r = await loadRates();
  if (!r) { CATS.Currency = { USD: 1 }; ratesInfo = "Couldn't load exchange rates. Check your connection."; return; }
  const codes = [...POPULAR.filter((c) => r.rates[c]), ...Object.keys(r.rates).filter((c) => !POPULAR.includes(c)).sort()];
  CATS.Currency = Object.fromEntries(codes.map((c) => [c, 1 / r.rates[c]])); // base: 1 USD
  ratesInfo = `Rates from ExchangeRate-API, updated ${new Date(r.updated).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}
function convert(v, cat, from, to) {
  const u = CATS[cat];
  if (cat === 'Temperature') return fromC[u[to]](toC[u[from]](v));
  return v * u[from] / u[to];
}
function fillUnits() {
  const units = Object.keys(CATS[conv.cat] || {});
  if (!units.includes(conv.from)) conv.from = units[0];
  if (!units.includes(conv.to)) conv.to = units[1] || units[0];
  const opts = (sel) => units.map((u) => `<option${u === sel ? ' selected' : ''}>${esc(u)}</option>`).join('');
  $('#fromUnit').innerHTML = opts(conv.from); $('#toUnit').innerHTML = opts(conv.to);
}
function runConv() {
  store('conv', conv);
  let v;
  try { v = evaluate($('#fromVal').value); } catch { v = null; }
  if (v == null || !CATS[conv.cat]) { $('#toVal').value = ''; $('#convAll').innerHTML = ''; return; }
  $('#toVal').value = fmt(convert(v, conv.cat, conv.from, conv.to));
  $('#convNote').textContent = conv.cat === 'Currency' ? ratesInfo : '';
  const others = Object.keys(CATS[conv.cat]).filter((u) => u !== conv.from).slice(0, conv.cat === 'Currency' ? 14 : 12);
  $('#convAll').innerHTML = others.map((u) => `<div class="alli" data-u="${esc(u)}"><span>${esc(u)}</span><b>${esc(fmt(convert(v, conv.cat, conv.from, u)))}</b></div>`).join('');
}
$('#cat').innerHTML = Object.keys(CATS).map((c) => `<option${c === conv.cat ? ' selected' : ''}>${c}</option>`).join('');
$('#cat').onchange = async () => {
  conv.cat = $('#cat').value;
  if (conv.cat === 'Currency' && !CATS.Currency) { $('#convNote').textContent = 'Loading rates...'; await setupCurrency(); conv.from = 'USD'; conv.to = 'EUR'; }
  fillUnits(); runConv();
};
$('#fromUnit').onchange = () => { conv.from = $('#fromUnit').value; runConv(); };
$('#toUnit').onchange = () => { conv.to = $('#toUnit').value; runConv(); };
$('#fromVal').oninput = runConv;
$('#swap').onclick = () => { [conv.from, conv.to] = [conv.to, conv.from]; fillUnits(); runConv(); };
$('#convAll').onclick = (e) => { const u = e.target.closest('[data-u]')?.dataset.u; if (u) { conv.to = u; fillUnits(); runConv(); } };

// ---------- mode ----------
function setMode(mode) {
  $$('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $('#calcView').classList.toggle('hidden', mode !== 'calc');
  $('#convView').classList.toggle('hidden', mode !== 'conv');
  store('mode', mode);
  (mode === 'calc' ? $('#expr') : $('#fromVal')).focus();
}
$$('[data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));

(async () => {
  renderHist();
  if (conv.cat === 'Currency') await setupCurrency();
  fillUnits(); runConv();
  setMode(load('mode', 'calc'));
})();
