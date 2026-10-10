const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const errText = (e) => String(e && e.message || e);
function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
const spaced = (c) => (/^\d{6}$/.test(c) ? c.slice(0, 3) + ' ' + c.slice(3) : c);

// Mail we've already told the user about, so a refresh doesn't notify twice. Saved so restarts don't either.
let seen = new Set();
try { seen = new Set(JSON.parse(localStorage.getItem('seen')) || []); } catch {}
const saveSeen = () => { try { localStorage.setItem('seen', JSON.stringify([...seen].slice(-300))); } catch {} };
let firstLoad = !localStorage.getItem('seen');
let lastStatus = '';

function show(which) {
  $('#signin').classList.toggle('hidden', which !== 'signin');
  $('#mail').classList.toggle('hidden', which !== 'mail');
}

async function refresh() {
  let st;
  try { st = await deskmate.gmail.status(); } catch (e) { return signinError(errText(e)); }
  if (!st.configured) { show('signin'); $('#connectBtn').disabled = true; return signinError("Google sign-in isn't set up in this copy of DeskMate yet."); }
  if (!st.connected) { show('signin'); publish(0, false); deskmate.setBadge(0); return; }
  show('mail');
  $('#account').textContent = st.email || '';
  let box;
  try { box = await deskmate.gmail.inbox(25); }
  catch (e) {
    if (errText(e) === 'signed-out') { show('signin'); return signinError('Google signed you out. Sign in again.'); }
    $('#summary').textContent = "Couldn't reach Gmail: " + errText(e);
    return;
  }
  render(box);
  notifyNew(box);
  deskmate.setBadge(box.unreadCount);
  publish(box.unreadCount, box.codes.some((c) => Date.now() - c.time < 5 * 60e3));
}

function render(box) {
  $('#codes').innerHTML = box.codes.map((c) => `
    <div class="code"><span class="digits">${esc(spaced(c.code))}</span>
      <div class="meta"><div class="small ellipsis">${esc(c.from)}</div><div class="muted small">${ago(c.time)}</div></div>
      <button class="copy" data-code="${esc(c.code)}">Copy</button></div>`).join('');
  $('#summary').textContent = box.messages.length
    ? `${box.unreadCount} unread · last 7 days`
    : 'No email in the last 7 days';
  $('#list').innerHTML = box.messages.map((m) => `
    <div class="mail${m.unread ? ' unread' : ''}">
      <div class="top"><span class="from ellipsis">${esc(m.from)}</span><span class="muted small">${ago(m.time)}</span></div>
      <div class="subj ellipsis">${esc(m.subject)}</div>
      <div class="snip ellipsis">${esc(m.snippet)}</div>
    </div>`).join('');
}
$('#codes').onclick = async (e) => {
  const b = e.target.closest('.copy'); if (!b) return;
  try { await deskmate.copyText(b.dataset.code); deskmate.toast('Code copied'); }
  catch { deskmate.toast("Couldn't copy"); }
};

function notifyNew(box) {
  const fresh = box.messages.filter((m) => m.unread && !seen.has(m.id));
  for (const m of box.messages) seen.add(m.id);
  saveSeen();
  if (firstLoad) { firstLoad = false; return; } // don't announce the whole inbox on first sign-in
  const codeFor = new Map(box.codes.map((c) => [c.id, c.code]));
  for (const m of fresh.slice(0, 3)) {
    const code = codeFor.get(m.id);
    deskmate.notify(code ? `Code ${spaced(code)}` : m.from, code ? `${m.from}: ${m.subject}` : m.subject);
  }
  if (fresh.length > 3) deskmate.notify(`${fresh.length - 3} more new emails`, '');
}

// One dot: blue and pulsing when a fresh sign-in code is waiting, orange when there's unread mail.
function publish(unread, freshCode) {
  const key = `${unread}|${freshCode}`;
  if (key === lastStatus) return;
  lastStatus = key;
  const dot = freshCode ? { color: '#3d9bff', pulse: true } : unread ? { color: '#ff8a3d' } : {};
  deskmate.status.set({ dots: [dot], tooltip: freshCode ? 'Gmail: new sign-in code' : unread ? `Gmail: ${unread} unread` : 'Gmail: all read' });
}

function signinError(msg) { $('#signinErr').textContent = msg; }
$('#connectBtn').onclick = async () => {
  signinError('');
  $('#connectBtn').disabled = true;
  $('#connectBtn').lastChild.textContent = 'Finish signing in in your browser...';
  try { await deskmate.gmail.connect(); firstLoad = true; await refresh(); }
  catch (e) { signinError(errText(e)); }
  $('#connectBtn').disabled = false;
  $('#connectBtn').lastChild.textContent = 'Sign in with Google';
};
$('#refreshBtn').onclick = refresh;
$('#signoutBtn').onclick = async () => {
  if ($('#signoutBtn').textContent !== 'Sure?') { $('#signoutBtn').textContent = 'Sure?'; return setTimeout(() => ($('#signoutBtn').textContent = 'Sign out'), 3000); }
  await deskmate.gmail.disconnect();
  seen = new Set(); saveSeen(); firstLoad = true;
  $('#signoutBtn').textContent = 'Sign out';
  refresh();
};

deskmate.onShown(refresh);
setInterval(refresh, 60e3);
refresh();
