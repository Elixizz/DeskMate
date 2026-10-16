// Task Manager Mate: running programs (apps, then background, then Windows and other users), force end / restart,
// startup programs, and hog alerts. DeskMate does the actual ending, after its own confirm box.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmtMem = (mb) => (mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : Math.round(mb) + ' MB');
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

let view = 'procs', sort = load('sort', 'cpu'), shown = true, data = null, timer = null, msgTimer = null;
const open = load('open', { background: false, other: false });
const icons = new Map(), asked = new Set(), rows = new Map();
const alerts = load('alerts', { on: true, cpu: 40, for: 60, mem: 8192 });
const hog = new Map(); // key -> { since, memHits, notified }
let hogging = [];

// ---------- programs ----------
async function refresh() {
  try { data = await deskmate.processes.list(); }
  catch (e) { showMsg(e.message, true); return; }
  checkHogs();
  if (shown && view === 'procs') render();
  if (shown && view === 'alerts') renderHogs();
}
function schedule() {
  clearTimeout(timer);
  const ms = shown ? 2000 : alerts.on ? 5000 : 0;
  if (ms) timer = setTimeout(async () => { await refresh(); schedule(); }, ms);
}

function rowFor(g) {
  let el = rows.get(g.key);
  if (!el) {
    el = document.createElement('div');
    el.className = 'proc';
    el.innerHTML = '<span class="ic"></span><div class="nm"><b></b><span></span></div><span class="num cpu"></span><span class="num mem"></span><div class="acts"></div>';
    rows.set(g.key, el);
  }
  const ic = icons.get(g.key);
  const icHtml = ic ? `<img src="${ic}" alt="">` : '<span class="noicon"></span>';
  if (el.dataset.ic !== (ic ? '1' : '0')) { el.querySelector('.ic').innerHTML = icHtml; el.dataset.ic = ic ? '1' : '0'; }
  el.querySelector('.nm b').textContent = g.name;
  const sub = [g.title && g.title !== g.name ? g.title : null, g.count > 1 ? `${g.count} processes` : null, g.exe.toLowerCase() !== g.name.toLowerCase() ? g.exe + '.exe' : null].filter(Boolean).join(' · ');
  el.querySelector('.nm span').textContent = sub;
  el.title = `${g.name}${g.title ? '\n' + g.title : ''}\n${g.exe}.exe · ${g.count} process${g.count > 1 ? 'es' : ''}`;
  const cpu = el.querySelector('.cpu');
  cpu.textContent = g.cpu.toFixed(g.cpu < 10 ? 1 : 0) + '%';
  cpu.className = 'num cpu' + (g.cpu >= alerts.cpu ? ' hot' : g.cpu >= 15 ? ' warm' : '');
  const mem = el.querySelector('.mem');
  mem.textContent = g.memMB || g.level !== 'other' ? fmtMem(g.memMB) : '—'; // Windows hides other users' memory
  mem.className = 'num mem' + (alerts.mem && g.memMB >= alerts.mem ? ' hot' : '');
  const acts = el.querySelector('.acts'), sig = `${g.protected}${g.canRestart}`;
  if (acts.dataset.sig !== sig) {
    acts.dataset.sig = sig;
    acts.innerHTML = g.protected ? '<span class="lock" title="Part of Windows or DeskMate, so it can\'t be ended here">locked</span>'
      : `${g.canRestart ? '<button class="ghost rs" title="Restart">&#x21BB;</button>' : ''}<button class="ghost end" title="End task">&#x2715;</button>`;
    acts.querySelector('.end')?.addEventListener('click', () => act(el.dataset.key, 'end'));
    acts.querySelector('.rs')?.addEventListener('click', () => act(el.dataset.key, 'restart'));
  }
  el.dataset.key = g.key;
  return el;
}

function render() {
  if (!data) return;
  const q = $('#search').value.trim().toLowerCase();
  const match = (g) => !q || g.name.toLowerCase().includes(q) || g.exe.toLowerCase().includes(q) || (g.title || '').toLowerCase().includes(q);
  const by = sort === 'mem' ? (a, b) => b.memMB - a.memMB : sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => b.cpu - a.cpu || b.memMB - a.memMB;
  const want = [];
  for (const level of ['app', 'background', 'other']) {
    const sect = $(`.sect[data-level="${level}"]`), list = data.groups.filter((g) => g.level === level && match(g)).sort(by);
    // searching opens every section so matches aren't hidden
    const isOpen = level === 'app' || q || open[level];
    sect.classList.toggle('closed', !isOpen);
    if (level === 'other') sect.classList.toggle('hidden', !(q || open.background));
    sect.querySelector('.cnt').textContent = `(${list.length})`;
    const box = sect.querySelector('.rows');
    if (!isOpen) { box.replaceChildren(); continue; }
    const els = list.map(rowFor);
    els.forEach((el, i) => { if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null); });
    while (box.children.length > els.length) box.lastChild.remove();
    for (const g of list) if (!icons.has(g.key) && !asked.has(g.key)) want.push(g.key);
  }
  for (const k of [...rows.keys()]) if (!data.groups.some((g) => g.key === k)) rows.delete(k);
  const cpu = data.groups.reduce((a, g) => a + g.cpu, 0), mem = data.groups.reduce((a, g) => a + g.memMB, 0);
  $('#totals').textContent = `${data.groups.length} programs · ${Math.min(100, cpu).toFixed(0)}% CPU · ${fmtMem(mem)} in use`;
  if (want.length) {
    want.forEach((k) => asked.add(k));
    deskmate.processes.icons(want.slice(0, 120)).then((m) => { for (const [k, v] of Object.entries(m)) if (v) icons.set(k, v); render(); }).catch(() => {});
  }
}

async function act(key, action) {
  const g = data?.groups.find((x) => x.key === key);
  const el = rows.get(key);
  el?.classList.add('busy');
  try {
    const r = await (action === 'end' ? deskmate.processes.end(key) : deskmate.processes.restart(key));
    if (r?.canceled) return;
    showMsg(action === 'end' ? `Ended ${r.name}${r.denied ? ` (${r.denied} part${r.denied > 1 ? 's' : ''} needed admin rights)` : ''}` : `Restarted ${r.name}`);
    await refresh();
    refreshAsk();
  } catch (e) { showMsg(e.message, true); }
  finally { el?.classList.remove('busy'); }
  void g;
}

function showMsg(text, err) {
  const m = $('#msg');
  m.textContent = text; m.className = 'msg' + (err ? ' err' : '');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => m.classList.add('hidden'), 4500);
}

// ---------- hog alerts ----------
function checkHogs() {
  if (!data) return;
  const now = Date.now(), cur = [];
  for (const g of data.groups) {
    if (g.level === 'other' || g.protected) continue;
    let h = hog.get(g.key);
    const cpuHigh = g.cpu >= alerts.cpu, memHigh = alerts.mem > 0 && g.memMB >= alerts.mem;
    if (!cpuHigh && !memHigh) { if (h) { h.since = 0; h.memHits = 0; } continue; }
    if (!h) hog.set(g.key, h = { since: 0, memHits: 0, notified: 0 });
    if (cpuHigh) h.since ||= now; else h.since = 0;
    h.memHits = memHigh ? h.memHits + 1 : 0;
    const cpuFor = h.since ? (now - h.since) / 1000 : 0;
    const why = cpuFor >= alerts.for ? `${Math.round(g.cpu)}% CPU for ${cpuFor >= 120 ? Math.round(cpuFor / 60) + ' minutes' : Math.round(cpuFor) + ' seconds'}` : h.memHits >= 2 ? `${fmtMem(g.memMB)} of memory` : null;
    if (!why) continue;
    cur.push({ g, why });
    if (alerts.on && now - h.notified > 30 * 60e3) {
      h.notified = now;
      deskmate.notify(`${g.name} is hogging your PC`, `It's using ${why}. Open Task Manager in DeskMate to end it.`).catch(() => {});
      deskmate.playSound('hog').catch(() => {});
    }
  }
  for (const [k] of hog) if (!data.groups.some((g) => g.key === k)) hog.delete(k);
  hogging = cur;
  const n = alerts.on ? cur.length : 0;
  $('#hogCount').textContent = n; $('#hogCount').classList.toggle('hidden', !n);
  deskmate.setBadge(n).catch(() => {});
}
function renderHogs() {
  $('#hogList').innerHTML = hogging.length ? hogging.map(({ g, why }) => `<div><b style="color:var(--text)">${esc(g.name)}</b> · ${esc(why)}</div>`).join('') : 'Nothing is hogging your PC.';
}
function bindAlerts() {
  $('#alOn').checked = alerts.on; $('#alCpu').value = alerts.cpu; $('#alCpuV').textContent = alerts.cpu + '%';
  $('#alFor').value = String(alerts.for); $('#alMem').value = String(alerts.mem);
  const upd = () => {
    Object.assign(alerts, { on: $('#alOn').checked, cpu: Number($('#alCpu').value), for: Number($('#alFor').value), mem: Number($('#alMem').value) });
    $('#alCpuV').textContent = alerts.cpu + '%'; save('alerts', alerts); checkHogs(); renderHogs(); schedule();
  };
  for (const id of ['#alOn', '#alCpu', '#alFor', '#alMem']) $(id).addEventListener('input', upd);
}
async function refreshAsk() {
  const asks = await deskmate.processes.asks().catch(() => true);
  $('#askText').textContent = asks ? 'DeskMate asks you before ending or restarting a program.' : 'You turned off the confirm box, so programs end straight away when you click the X.';
  $('#askAgain').classList.toggle('hidden', asks);
}
$('#askAgain').onclick = async () => { await deskmate.processes.askAgain(); refreshAsk(); };

// ---------- startup ----------
async function renderStartup() {
  let items;
  try { items = await deskmate.startup.list(); } catch (e) { $('#startList').innerHTML = `<div class="empty err">${esc(e.message)}</div>`; return; }
  items.sort((a, b) => b.enabled - a.enabled || a.name.localeCompare(b.name));
  $('#startList').innerHTML = items.length ? items.map((it, i) => `<div class="card startup${it.enabled ? '' : ' off'}" title="${esc(it.command)}">
      ${it.icon ? `<img src="${it.icon}" alt="">` : '<span class="noicon"></span>'}
      <div class="nm"><b>${esc(it.name)}</b><span>${esc(it.command)}</span></div>
      ${it.admin ? '<span class="badge" title="Installed for every user. Windows will ask you to allow the change.">&#x1F6E1; All users</span>' : it.canChange ? '' : '<span class="badge" title="Installed for every user. Update DeskMate to change it here.">All users</span>'}
      <input type="checkbox" class="sw" data-i="${i}" ${it.enabled ? 'checked' : ''} ${it.canChange ? '' : 'disabled'}>
    </div>`).join('') : '<div class="empty muted small">No startup programs.</div>';
  document.querySelectorAll('#startList .sw').forEach((sw) => sw.addEventListener('change', async () => {
    const it = items[sw.dataset.i];
    sw.disabled = true;
    try { await deskmate.startup.set(it.key, sw.checked); it.enabled = sw.checked; sw.closest('.startup').classList.toggle('off', !sw.checked); }
    catch (e) { sw.checked = !sw.checked; $('#startList').insertAdjacentHTML('afterbegin', `<div class="msg err">${esc(e.message)}</div>`); }
    finally { sw.disabled = false; }
  }));
}

// ---------- wiring ----------
function setView(v) {
  view = v;
  document.querySelectorAll('.segbtn').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  for (const k of ['procs', 'startup', 'alerts']) $(`#${k}View`).classList.toggle('hidden', k !== v);
  if (v === 'procs') render();
  if (v === 'startup') renderStartup();
  if (v === 'alerts') { renderHogs(); refreshAsk(); }
}
document.querySelectorAll('.segbtn').forEach((b) => (b.onclick = () => setView(b.dataset.view)));
document.querySelectorAll('[data-sort]').forEach((b) => {
  b.classList.toggle('active', b.dataset.sort === sort);
  b.onclick = () => { sort = b.dataset.sort; save('sort', sort); document.querySelectorAll('[data-sort]').forEach((x) => x.classList.toggle('active', x === b)); render(); };
});
document.querySelectorAll('.sect .toggle').forEach((h) => (h.onclick = () => {
  const level = h.closest('.sect').dataset.level;
  open[level] = !open[level];
  if (level === 'background' && !open.background) open.other = false;
  save('open', open); render();
}));
$('#search').addEventListener('input', render);
deskmate.onShown(() => { shown = true; refresh(); schedule(); });
deskmate.onHidden(() => { shown = false; schedule(); });
bindAlerts();
refresh().then(() => setTimeout(refresh, 1000)); // the first sample has no CPU numbers yet
schedule();
