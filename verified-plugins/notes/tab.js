const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let notes = load('notes', []);   // [{ id, text, pinned, updated }]
let todos = load('todos', []);   // [{ id, text, done, created }]
let openId = null;

// ---------- mode ----------
function setMode(mode) {
  $$('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $('#notesView').classList.toggle('hidden', mode !== 'notes');
  $('#todoView').classList.toggle('hidden', mode !== 'todo');
  try { localStorage.setItem('mode', mode); } catch {}
  if (mode === 'todo') $('#todoText').focus();
}
$$('[data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));

// ---------- notes ----------
const title = (t) => (t.split('\n').find((l) => l.trim()) || 'Empty note').trim().slice(0, 80);
const preview = (t) => t.split('\n').filter((l) => l.trim()).slice(1).join(' ').slice(0, 120);
const when = (ts) => {
  const d = new Date(ts), now = new Date();
  return d.toDateString() === now.toDateString() ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};
function highlight(text, q) {
  if (!q) return esc(text);
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? esc(text) : esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
}
function renderNotes() {
  const q = $('#search').value.trim();
  const list = notes.filter((n) => !q || n.text.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.pinned - a.pinned) || (b.updated - a.updated));
  $('#notes').innerHTML = list.length ? list.map((n) => `
    <div class="card note" data-id="${n.id}">
      <div class="t">${n.pinned ? '<span class="pin">&#x2605;</span>' : ''}<span class="ellipsis grow">${highlight(title(n.text), q)}</span><span class="muted small">${when(n.updated)}</span></div>
      ${preview(n.text) ? `<div class="p ellipsis">${highlight(preview(n.text), q)}</div>` : ''}
    </div>`).join('') : `<div class="empty">${q ? 'No notes match.' : 'No notes yet. Click + New.'}</div>`;
}
function openNote(id) {
  openId = id;
  const n = notes.find((x) => x.id === id);
  $('#text').value = n.text;
  $('#pinNote').classList.toggle('on', !!n.pinned);
  $('#saved').textContent = 'Saved';
  $('#noteList').classList.add('hidden'); $('#editor').classList.remove('hidden');
  $('#text').focus();
}
function closeNote() {
  // an empty note isn't worth keeping
  const n = notes.find((x) => x.id === openId);
  if (n && !n.text.trim()) { notes = notes.filter((x) => x !== n); store('notes', notes); }
  openId = null;
  $('#editor').classList.add('hidden'); $('#noteList').classList.remove('hidden');
  renderNotes();
}
$('#newNote').onclick = () => { const n = { id: uid(), text: '', pinned: false, updated: Date.now() }; notes.push(n); store('notes', notes); openNote(n.id); };
$('#notes').onclick = (e) => { const c = e.target.closest('[data-id]'); if (c) openNote(c.dataset.id); };
$('#search').oninput = renderNotes;
$('#back').onclick = closeNote;
let saveTimer = null;
$('#text').oninput = () => {
  const n = notes.find((x) => x.id === openId); if (!n) return;
  n.text = $('#text').value; n.updated = Date.now();
  $('#saved').textContent = 'Saving...';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { store('notes', notes); $('#saved').textContent = 'Saved'; }, 400);
};
$('#pinNote').onclick = () => {
  const n = notes.find((x) => x.id === openId); if (!n) return;
  n.pinned = !n.pinned; store('notes', notes);
  $('#pinNote').classList.toggle('on', n.pinned);
};
$('#delNote').onclick = () => {
  const b = $('#delNote');
  if (b.textContent !== 'Sure?') { b.textContent = 'Sure?'; setTimeout(() => (b.textContent = 'Delete'), 2500); return; }
  notes = notes.filter((x) => x.id !== openId); store('notes', notes);
  b.textContent = 'Delete'; closeNote();
};

// ---------- to-do ----------
function renderTodos() {
  const open = todos.filter((t) => !t.done).length;
  $('#todos').innerHTML = todos.length ? todos.map((t) => `
    <div class="card todo${t.done ? ' done' : ''}" data-id="${t.id}" draggable="true">
      <input type="checkbox"${t.done ? ' checked' : ''}><span class="txt">${esc(t.text)}</span>
      <button class="icon x" title="Delete">&#x2715;</button>
    </div>`).join('') : '<div class="empty">Nothing to do. Nice.</div>';
  $('#todoCount').textContent = open ? `(${open})` : '';
  $('#todoSummary').textContent = todos.length ? `${open} left, ${todos.length - open} done` : '';
  $('#clearDone').classList.toggle('hidden', !todos.some((t) => t.done));
  deskmate.setBadge(open);
}
$('#addTodo').onsubmit = (e) => {
  e.preventDefault();
  const text = $('#todoText').value.trim(); if (!text) return;
  todos.unshift({ id: uid(), text, done: false, created: Date.now() });
  $('#todoText').value = '';
  store('todos', todos); renderTodos();
};
$('#todos').onclick = (e) => {
  const row = e.target.closest('[data-id]'); if (!row) return;
  const t = todos.find((x) => x.id === row.dataset.id);
  if (e.target.matches('input[type=checkbox]')) {
    t.done = e.target.checked;
    // finished tasks sink below the open ones
    todos = [...todos.filter((x) => !x.done), ...todos.filter((x) => x.done)];
  } else if (e.target.closest('.x')) todos = todos.filter((x) => x !== t);
  else return;
  store('todos', todos); renderTodos();
};
$('#clearDone').onclick = () => { todos = todos.filter((t) => !t.done); store('todos', todos); renderTodos(); };
// drag to reorder
let dragId = null;
$('#todos').addEventListener('dragstart', (e) => { const r = e.target.closest('[data-id]'); if (!r) return; dragId = r.dataset.id; r.classList.add('dragging'); });
$('#todos').addEventListener('dragend', () => { dragId = null; renderTodos(); });
$('#todos').addEventListener('dragover', (e) => {
  e.preventDefault();
  const over = e.target.closest('[data-id]'); if (!over || over.dataset.id === dragId) return;
  const from = todos.findIndex((t) => t.id === dragId), to = todos.findIndex((t) => t.id === over.dataset.id);
  const [m] = todos.splice(from, 1); todos.splice(to, 0, m);
  store('todos', todos);
  const el = $(`#todos [data-id="${dragId}"]`);
  over.parentNode.insertBefore(el, from < to ? over.nextSibling : over);
});

renderNotes();
renderTodos();
setMode(localStorage.getItem('mode') === 'todo' ? 'todo' : 'notes');
