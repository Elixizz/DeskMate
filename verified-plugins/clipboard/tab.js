const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// History comes from DeskMate (memory only). Pinned items are the one thing this Mate saves itself.
let history = [];
let pinned = load('pinned', []); // [{ id, text, time }]
let paused = false;

const ago = (t) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? 'now' : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
};
const card = (e, isPin) => `
  <div class="card clip" data-id="${e.id}" data-pin="${isPin ? 1 : ''}" title="Click to copy">
    <div class="txt">${esc(e.text)}</div>
    <div class="meta"><span class="muted small">${isPin ? '&#x2605;' : ago(e.time)}</span>
      <span class="acts"><button class="icon${isPin ? ' on' : ''}" data-a="pin" title="${isPin ? 'Unpin' : 'Pin'}">&#x2605;</button><button class="icon" data-a="del" title="Remove">&#x2715;</button></span></div>
  </div>`;
function render() {
  const q = $('#search').value.trim().toLowerCase();
  const match = (e) => !q || e.text.toLowerCase().includes(q);
  const pins = pinned.filter(match);
  const rest = history.filter((e) => match(e) && !pinned.some((p) => p.text === e.text));
  let html = '';
  if (pins.length) html += '<div class="sect">Pinned</div>' + pins.map((e) => card(e, true)).join('');
  if (rest.length) html += (pins.length ? '<div class="sect">Recent</div>' : '') + rest.map((e) => card(e, false)).join('');
  if (!html) html = `<div class="empty">${q ? 'Nothing matches.' : paused ? 'Recording is paused.' : 'Copy some text and it shows up here.'}</div>`;
  $('#list').innerHTML = html;
}

$('#list').onclick = async (ev) => {
  const row = ev.target.closest('[data-id]'); if (!row) return;
  const isPin = !!row.dataset.pin;
  const e = (isPin ? pinned : history).find((x) => x.id === row.dataset.id); if (!e) return;
  const a = ev.target.closest('[data-a]')?.dataset.a;
  if (a === 'pin') {
    if (isPin) pinned = pinned.filter((x) => x !== e);
    else pinned.unshift({ id: 'p' + e.id, text: e.text, time: Date.now() });
    store('pinned', pinned.slice(0, 30)); render(); return;
  }
  if (a === 'del') {
    if (isPin) { pinned = pinned.filter((x) => x !== e); store('pinned', pinned); }
    else { history = history.filter((x) => x !== e); await deskmate.clipboard.remove(e.id); }
    render(); return;
  }
  await deskmate.copyText(e.text);
  row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 400);
  deskmate.toast('Copied');
};
$('#search').oninput = render;
$('#clear').onclick = async () => {
  const b = $('#clear');
  if (b.textContent !== 'Sure?') { b.textContent = 'Sure?'; setTimeout(() => (b.textContent = 'Clear'), 2500); return; }
  b.textContent = 'Clear';
  await deskmate.clipboard.clear(); history = []; render();
};
$('#pause').onclick = async () => {
  paused = await deskmate.clipboard.setPaused(!paused);
  $('#pause').textContent = paused ? 'Resume' : 'Pause';
  $('#pause').classList.toggle('on', paused);
  render();
};
deskmate.clipboard.onCopy((e) => { history = [e, ...history.filter((x) => x.text !== e.text)].slice(0, 50); render(); });

(async () => {
  history = await deskmate.clipboard.history();
  paused = await deskmate.clipboard.paused();
  $('#pause').textContent = paused ? 'Resume' : 'Pause';
  $('#pause').classList.toggle('on', paused);
  render();
  setInterval(render, 60e3); // keep the "5m ago" labels fresh
})();
