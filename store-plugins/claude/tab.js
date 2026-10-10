const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

// Saved in this plugin's own storage: { lastChecked, watchId, watchTitle }
let prefs = {};
function loadPrefs() { try { prefs = JSON.parse(localStorage.getItem('prefs')) || {}; } catch { prefs = {}; } }
function savePrefs() { try { localStorage.setItem('prefs', JSON.stringify(prefs)); } catch {} }

// ---------- activity ----------
function sinceValue() {
  const r = $('#range').value;
  if (r === '24h') return Date.now() - 864e5;
  if (r === '7d') return Date.now() - 7 * 864e5;
  return prefs.lastChecked;
}
async function loadClaude() {
  const since = sinceValue();
  const sessions = await deskmate.claude.activity(since);
  const seen = since === prefs.lastChecked ? sessions : await deskmate.claude.activity(prefs.lastChecked);
  deskmate.setBadge(seen.length);

  const files = sessions.reduce((n, s) => n + s.files.length, 0);
  const prompts = sessions.reduce((n, s) => n + s.prompts.length, 0);
  $('#claudeSummary').textContent = sessions.length
    ? `${sessions.length} session${sessions.length > 1 ? 's' : ''} · ${prompts} prompts · ${files} files changed · since ${ago(since)}`
    : `Nothing new since ${ago(since)}`;

  const list = $('#claudeList');
  const open = new Set($$('.sess.open').map((el) => el.dataset.id));
  list.innerHTML = sessions.length ? '' : '<div class="empty">Claude has been quiet.</div>';
  for (const s of sessions) {
    const el = document.createElement('div');
    el.className = 'card sess' + (open.has(s.id) ? ' open' : '');
    el.dataset.id = s.id;
    const folder = s.cwd.split(/[\\/]/).filter(Boolean).pop();
    el.innerHTML = `
      <div class="top">${s.active ? '<span class="dot" title="Active now"></span>' : ''}
        <span class="title ellipsis">${esc(s.title)}</span><span class="muted small">${ago(s.last)}</span></div>
      <div class="chips" style="margin-top:5px">
        <span class="chip">${esc(folder)}</span>
        ${s.prompts.length ? `<span class="chip">${s.prompts.length} prompts</span>` : ''}
        ${s.files.length ? `<span class="chip">${s.files.length} files</span>` : ''}
        ${s.cmds ? `<span class="chip">${s.cmds} cmds</span>` : ''}
        ${s.agents.length ? `<span class="chip">${s.agents.length} agents</span>` : ''}
        <button class="chip watch ${watch.id === s.id ? 'watching' : ''}" style="margin-left:auto">${watch.id === s.id ? 'Watching' : 'Watch'}</button>
      </div>
      ${s.lastReply ? `<div class="reply">${esc(s.lastReply)}</div>` : ''}
      <div class="detail">
        ${s.prompts.length ? '<h4>You asked</h4>' + s.prompts.map((p) => `<div class="item">› ${esc(p)}</div>`).join('') : ''}
        ${s.files.length ? '<h4>Files changed</h4>' + s.files.map((f) => `<div class="item file" data-path="${esc(f)}">${esc(f)}</div>`).join('') : ''}
        ${s.agents.length ? '<h4>Agents</h4>' + s.agents.map((a) => `<div class="item">${esc(a)}</div>`).join('') : ''}
      </div>`;
    el.onclick = async (e) => {
      if (e.target.closest('.watch')) {
        setWatch(watch.id === s.id ? null : s.id, s.title);
        return loadClaude();
      }
      const f = e.target.closest('.file');
      if (f) return deskmate.claude.revealFile(f.dataset.path);
      if (window.getSelection().toString()) return;
      el.classList.toggle('open');
    };
    list.appendChild(el);
  }
}
$('#range').onchange = loadClaude;
$('#refreshBtn').onclick = loadClaude;
$('#seenBtn').onclick = () => {
  prefs.lastChecked = Date.now(); savePrefs();
  $('#range').value = 'seen';
  deskmate.toast('All caught up');
  loadClaude();
};
setInterval(loadClaude, 60e3);
deskmate.onShown(loadClaude);

// ---------- watched conversation -> status dots ----------
let watch = { state: 'none' };
const WATCH_LABEL = { working: 'Working...', done: 'Done', input: 'Needs your input', none: '' };
const TIP = { working: 'working', done: 'done', input: 'needs your input' };
const DOTS = {
  working: [{ color: '#3ccf6e', pulse: true }, {}, {}],
  done: [{}, { color: '#ffd23d' }, {}],
  input: [{}, {}, { color: '#3d9bff', pulse: true }],
  none: [{}, {}, {}],
};
function setWatch(id, title) {
  prefs.watchId = id || null; prefs.watchTitle = id ? title : null; savePrefs();
  watch = { state: id ? '' : 'none' };
  pollWatch();
}
let lastPublished = '';
async function pollWatch() {
  const next = prefs.watchId ? await deskmate.claude.state(prefs.watchId) : { state: 'none' };
  if (next.state !== 'none' && next.title === 'Claude' && prefs.watchTitle) next.title = prefs.watchTitle;
  watch = next;
  renderWatch();
  const key = watch.state + '|' + watch.title;
  if (key !== lastPublished) {
    lastPublished = key;
    deskmate.status.set({ dots: DOTS[watch.state] || DOTS.none, tooltip: watch.id ? `${watch.title}: ${TIP[watch.state]}` : 'Claude: not watching a conversation' });
  }
}
function renderWatch() {
  $('#watchDots').className = 'dots ' + (watch.state || '');
  $('#watchBar').classList.toggle('hidden', !watch.id);
  $('#watchText').textContent = watch.id ? `${watch.title}  ·  ${WATCH_LABEL[watch.state] || ''}` : '';
  $('#replyBox').classList.toggle('hidden', !watch.id);
  if (!sending) $('#replyInput').placeholder = watch.state === 'working' ? 'Claude is working...' : watch.state === 'input' ? 'Claude asked something. Answer it in the app' : 'Reply to Claude...';
}
$('#unwatchBtn').onclick = () => { setWatch(null); loadClaude(); };
setInterval(pollWatch, 1500);

// ---------- reply (runs Claude Code in the background, so nothing pops up over a game) ----------
let sending = false;
function showReply(text, isErr) {
  const o = $('#replyOut');
  o.classList.remove('hidden'); o.classList.toggle('err', !!isErr); o.textContent = text;
}
async function sendReply() {
  const text = $('#replyInput').value.trim();
  if (!text || sending || !watch.id) return;
  sending = true; $('#replyBtn').disabled = true; $('#replyInput').value = '';
  $('#replyInput').placeholder = 'Sent. Claude is on it...';
  showReply('You: ' + text);
  const r = await deskmate.claude.reply(watch.id, text);
  sending = false; $('#replyBtn').disabled = false;
  if (r.error === 'not-logged-in') showReply("Claude Code isn't logged in on this PC yet. Run the one-time login, then try again.", true);
  else if (r.error) { showReply(r.error, true); $('#replyInput').value = text; }
  else showReply(r.result);
  renderWatch();
  loadClaude();
}
$('#replyBtn').onclick = sendReply;
$('#replyInput').onkeydown = (e) => { if (e.key === 'Enter') sendReply(); };

// ---------- boot ----------
(async () => {
  loadPrefs();
  if (!prefs.migrated) {
    const old = await deskmate.legacy();
    prefs = { lastChecked: old.lastChecked || Date.now() - 864e5, watchId: old.watchId || null, watchTitle: old.watchTitle || null, migrated: true };
    savePrefs();
  }
  await pollWatch();
  loadClaude();
})();
