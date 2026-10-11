const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// items: { id, kind: 'timer'|'reminder', label, due, total, pausedLeft, done, ringing, missed }
// Saved on every change so timers survive a restart; anything that came due while closed is announced as missed.
let items = [];
try { items = JSON.parse(localStorage.getItem('items')) || []; } catch {}
const save = () => { try { localStorage.setItem('items', JSON.stringify(items)); } catch {} };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// "90s", "10" (minutes), "10m", "1h 15m", "1h15", "2:30" (m:ss), "1:02:30" (h:mm:ss)
function parseDuration(text) {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(parseFloat(t) * 60e3);
  if (/^\d+(:\d{1,2}){1,2}$/.test(t)) {
    const p = t.split(':').map(Number);
    return (p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]) * 1000;
  }
  const re = /(\d+(?:\.\d+)?)\s*(hours?|hrs|hr|h|minutes?|mins|min|m|seconds?|secs|sec|s)?/g;
  let ms = 0, any = false, m;
  while ((m = re.exec(t))) {
    if (!m[1]) continue;
    any = true;
    const n = parseFloat(m[1]), u = (m[2] || 'm')[0];
    ms += n * (u === 'h' ? 3600e3 : u === 's' ? 1e3 : 60e3);
  }
  // reject leftovers like "abc"
  if (!any || t.replace(re, '').trim()) return null;
  return Math.round(ms);
}
function fmtLeft(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
function fmtSpan(ms) {
  if (ms < 60e3) return `${Math.max(1, Math.round(ms / 1000))} sec`;
  const m = Math.round(ms / 60e3);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}
const clock = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// ---------- adding ----------
const PRESETS = [['1m', 1], ['5m', 5], ['10m', 10], ['15m', 15], ['25m', 25], ['30m', 30], ['1h', 60]];
$('#presets').innerHTML = PRESETS.map(([t, m]) => `<button type="button" class="chip" data-min="${m}">${t}</button>`).join('');
$('#presets').onclick = (e) => {
  const b = e.target.closest('[data-min]'); if (!b) return;
  addTimer(Number(b.dataset.min) * 60e3, $('#tLabel').value.trim());
};
function addTimer(ms, label) {
  items.push({ id: uid(), kind: 'timer', label: label || `${fmtSpan(ms)} timer`, total: ms, due: Date.now() + ms });
  $('#tLabel').value = ''; $('#tDur').value = ''; $('#tErr').textContent = '';
  save(); render(); publish();
}
$('#timerForm').onsubmit = (e) => {
  e.preventDefault();
  const ms = parseDuration($('#tDur').value || '');
  if (!ms || ms < 1000) return ($('#tErr').textContent = 'Type a length like 90s, 10m, 1h 15m or 2:30');
  if (ms > 24 * 3600e3) return ($('#tErr').textContent = 'Timers can be up to 24 hours. Use a reminder for later.');
  addTimer(ms, $('#tLabel').value.trim());
};
$('#reminderForm').onsubmit = (e) => {
  e.preventDefault();
  const text = $('#rText').value.trim(), time = $('#rTime').value;
  if (!text) return ($('#rErr').textContent = 'What should I remind you about?');
  if (!time) return ($('#rErr').textContent = 'Pick a time');
  const [h, m] = time.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1); // already passed today: it means tomorrow
  items.push({ id: uid(), kind: 'reminder', label: text, due: d.getTime() });
  $('#rText').value = ''; $('#rTime').value = ''; $('#rErr').textContent = '';
  deskmate.toast(`Reminder set for ${clock(d.getTime())}${d.getDate() !== new Date().getDate() ? ' tomorrow' : ''}`);
  save(); render(); publish();
};
$$('[data-mode]').forEach((b) => (b.onclick = () => {
  $$('[data-mode]').forEach((x) => x.classList.toggle('active', x === b));
  $('#timerForm').classList.toggle('hidden', b.dataset.mode !== 'timer');
  $('#reminderForm').classList.toggle('hidden', b.dataset.mode !== 'reminder');
}));

// ---------- the list ----------
function render() {
  const active = items.filter((i) => !i.done).sort((a, b) => (a.pausedLeft != null) - (b.pausedLeft != null) || a.due - b.due);
  const done = items.filter((i) => i.done).sort((a, b) => b.due - a.due).slice(0, 8);
  const now = Date.now();
  let html = active.length ? '' : '<div class="empty">No timers running. Tap a preset to start one.</div>';
  for (const i of active) {
    const left = i.pausedLeft != null ? i.pausedLeft : i.due - now;
    const pct = i.kind === 'timer' ? Math.min(100, Math.max(0, 100 - (left / i.total) * 100)) : 0;
    html += `<div class="card item ${i.kind}${i.pausedLeft != null ? ' paused' : ''}" data-id="${i.id}">
      <div class="top"><span class="label ellipsis">${esc(i.label)}</span>
        <span class="left">${i.kind === 'timer' ? fmtLeft(left) : `${clock(i.due)}`}</span></div>
      ${i.kind === 'timer' ? `<div class="bar"><i style="width:${pct}%"></i></div>` : `<div class="muted small in">in ${fmtSpan(left)}</div>`}
      <div class="row">
        ${i.kind === 'timer' ? `<button class="ghost" data-a="${i.pausedLeft != null ? 'resume' : 'pause'}">${i.pausedLeft != null ? 'Resume' : 'Pause'}</button><button class="ghost" data-a="plus">+1 min</button>` : ''}
        <button class="ghost" data-a="cancel" style="margin-left:auto">Cancel</button>
      </div></div>`;
  }
  if (done.length) {
    html += '<div class="section">Done</div>';
    for (const i of done) {
      html += `<div class="card item done${i.ringing ? ' ringing' : ''}" data-id="${i.id}">
        <div class="top"><span class="label ellipsis">${esc(i.label)}</span><span class="muted small">${i.missed ? 'missed · ' : ''}${clock(i.due)}</span></div>
        <div class="row">${i.kind === 'timer' ? '<button class="ghost" data-a="restart">Restart</button>' : ''}<button class="ghost" data-a="dismiss" style="margin-left:auto">${i.ringing ? 'Dismiss' : 'Clear'}</button></div></div>`;
    }
  }
  $('#list').innerHTML = html;
  deskmate.setBadge(active.length);
}
$('#list').onclick = (e) => {
  const btn = e.target.closest('[data-a]'); if (!btn) return;
  const i = items.find((x) => x.id === btn.closest('[data-id]').dataset.id); if (!i) return;
  const a = btn.dataset.a, now = Date.now();
  if (a === 'pause') i.pausedLeft = Math.max(0, i.due - now);
  if (a === 'resume') { i.due = now + i.pausedLeft; delete i.pausedLeft; }
  if (a === 'plus') { if (i.pausedLeft != null) i.pausedLeft += 60e3; else i.due += 60e3; i.total += 60e3; }
  if (a === 'cancel') items = items.filter((x) => x !== i);
  if (a === 'dismiss') items = items.filter((x) => x !== i);
  if (a === 'restart') { Object.assign(i, { due: now + i.total, done: false, ringing: false, missed: false }); }
  save(); render(); publish();
};

// ---------- firing ----------
function fire(i, missed) {
  i.done = true; i.ringing = !missed; i.missed = !!missed;
  const title = i.kind === 'timer' ? `Time's up: ${i.label}` : `Reminder: ${i.label}`;
  const body = missed ? `This was due at ${clock(i.due)} while DeskMate was closed.` : i.kind === 'timer' ? `${fmtSpan(i.total)} timer finished.` : `It's ${clock(i.due)}.`;
  deskmate.notify(title, body).catch(() => {});
  // Sound picked in Settings > Sounds (DeskMate 1.3+). Missed alarms stay quiet.
  if (!missed && deskmate.playSound) deskmate.playSound(i.kind === 'timer' ? 'done' : 'reminder').catch(() => {});
}
function tick() {
  const now = Date.now();
  let changed = false;
  for (const i of items) if (!i.done && i.pausedLeft == null && i.due <= now) { fire(i, false); changed = true; }
  // keep the "Done" list short
  const done = items.filter((i) => i.done).sort((a, b) => b.due - a.due);
  if (done.length > 8) { items = items.filter((i) => !i.done || i.ringing || done.slice(0, 8).includes(i)); changed = true; }
  if (changed) { save(); publish(); render(); } else updateTimes();
}
// Only touch the countdown text between changes, so buttons aren't rebuilt under the mouse.
function updateTimes() {
  const now = Date.now();
  for (const i of items) {
    if (i.done || i.pausedLeft != null) continue;
    const el = document.querySelector(`[data-id="${i.id}"]`); if (!el) continue;
    const left = i.due - now;
    if (i.kind === 'timer') {
      el.querySelector('.left').textContent = fmtLeft(left);
      el.querySelector('.bar i').style.width = `${Math.min(100, Math.max(0, 100 - (left / i.total) * 100))}%`;
    } else el.querySelector('.in').textContent = `in ${fmtSpan(left)}`;
  }
}

// One dot: red and pulsing when something just went off, green while timers run.
let lastStatus = '';
function publish() {
  const ringing = items.some((i) => i.ringing), running = items.some((i) => !i.done);
  const key = `${ringing}|${running}`;
  if (key === lastStatus) return;
  lastStatus = key;
  const next = items.filter((i) => !i.done && i.pausedLeft == null).sort((a, b) => a.due - b.due)[0];
  deskmate.status.set({
    dots: [ringing ? { color: '#ff5d6c', pulse: true } : running ? { color: '#3ccf6e' } : {}],
    tooltip: ringing ? 'Timers: time\'s up' : next ? `Timers: next at ${clock(next.due)}` : 'Timers: nothing running',
  }).catch(() => {});
}
// Opening DeskMate counts as seeing the alarm.
deskmate.onShown(() => setTimeout(() => {
  if (!items.some((i) => i.ringing)) return;
  items.forEach((i) => (i.ringing = false));
  save(); render(); publish();
}, 4000));

// Things that came due while DeskMate was closed.
const bootNow = Date.now();
items.filter((i) => !i.done && i.pausedLeft == null && i.due <= bootNow).forEach((i) => fire(i, true));
save(); render(); publish();
setInterval(tick, 500);
