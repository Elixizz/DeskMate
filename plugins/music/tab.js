const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (t) => deskmate.toast(t);

// Saved in this plugin's own storage: { favorites, volume, mediaApp }
let prefs = {};
function loadPrefs() { try { prefs = JSON.parse(localStorage.getItem('prefs')) || {}; } catch { prefs = {}; } }
function savePrefs() { try { localStorage.setItem('prefs', JSON.stringify(prefs)); } catch {} }

// ---------- Deskmate's own player ----------
const audio = $('#audio');
let tracks = [], queue = [], qIndex = -1, mode = 'local', shuffle = false, current = null, folder = null;

function playItem(item) {
  if (ext?.status === 'Playing') extCmd('pause');
  current = item;
  audio.src = item.radio ? deskmate.mediaUrl(item.url) : item.url;
  audio.play().catch(() => toast("Couldn't play that one"));
  markPlaying();
}
function markPlaying() { $$('.track').forEach((el) => el.classList.toggle('playing', current && el.dataset.url === current.url)); }
function step(dir) {
  if (!queue.length || current?.radio) return;
  if (shuffle) qIndex = Math.floor(Math.random() * queue.length);
  else qIndex = (qIndex + dir + queue.length) % queue.length;
  playItem(queue[qIndex]);
}
function togglePlay() {
  if (!audio.src) { if (tracks.length) { queue = tracks; qIndex = -1; step(1); } return; }
  audio.paused ? audio.play() : audio.pause();
}
audio.onended = () => step(1);
audio.onerror = () => { if (audio.src) toast('Stream/file failed to load'); };

// ---------- the player bar: it drives whichever source is live ----------
// Deskmate's own player while it's playing, otherwise the browser/app session.
const useExt = () => !!ext && (!audio.src || audio.paused);
function publishState() {
  let s;
  if (useExt()) {
    s = { title: [ext.title, ext.artist].filter(Boolean).join('  ·  ') + '  ·  ' + appLabel(ext.app), playing: ext.status === 'Playing',
      frac: ext.end > 0 ? extPos() / ext.end : 0, vol: ext.vol };
  } else {
    s = { title: current ? current.name + (current.radio ? '  ·  live radio' : '') : 'Nothing playing', playing: !!audio.src && !audio.paused,
      frac: isFinite(audio.duration) ? audio.currentTime / audio.duration : 0, vol: audio.volume };
  }
  deskmate.send({ from: 'tab', type: 'state', shuffle, ...s });
  if (ext) $('#extTime').textContent = ext.end > 0 ? `${fmt(extPos())} / ${fmt(ext.end)}` : '';
}
setInterval(publishState, 500);
['play', 'pause', 'timeupdate'].forEach((ev) => audio.addEventListener(ev, publishState));

let sliderTimer = null;
function control(action, value) {
  if (action === 'toggle') return useExt() ? extCmd('toggle') : togglePlay();
  if (action === 'next') return useExt() ? extCmd('next') : step(1);
  if (action === 'prev') return useExt() ? extCmd('prev') : audio.currentTime > 3 && !current?.radio ? (audio.currentTime = 0) : step(-1);
  if (action === 'shuffle') { shuffle = !shuffle; return publishState(); }
  if (action === 'seek') {
    if (!useExt()) { if (isFinite(audio.duration)) audio.currentTime = value * audio.duration; return; }
    clearTimeout(sliderTimer);
    sliderTimer = setTimeout(() => {
      const sec = value * ext.end;
      Object.assign(ext, { pos: sec, updated: Date.now() });
      extCmd('seek:' + sec.toFixed(1));
    }, 150);
  }
  if (action === 'vol') {
    clearTimeout(sliderTimer);
    if (!useExt()) { audio.volume = value; sliderTimer = setTimeout(() => { prefs.volume = value; savePrefs(); }, 500); return; }
    ext.vol = value;
    sliderTimer = setTimeout(() => deskmate.media.command(ext.app, 'vol:' + value.toFixed(2)), 60);
  }
}
deskmate.onMessage((m) => {
  if (m.from !== 'bar' || m.type !== 'cmd') return;
  if (m.action === 'hello') publishState(); else control(m.action, m.value);
});
// Ctrl+Alt+P / Right / Left follow the same rule as the bar.
deskmate.onHotkey(async (key) => {
  if (audio.paused) await pollExt();
  control({ 'Control+Alt+P': 'toggle', 'Control+Alt+Right': 'next', 'Control+Alt+Left': 'prev' }[key]);
});

// ---------- browser / system media (YouTube Music, Spotify, ...) ----------
let ext = null, extArtKey = null, extSessions = [];
const BROWSERS = /chrome|msedge|opera|firefox|brave|vivaldi/i;
const fmt = (s) => (s > 0 ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '');
function appLabel(id) {
  const m = id.match(/(chrome|msedge|opera|firefox|brave|vivaldi|spotify)/i);
  return m ? { msedge: 'Edge' }[m[1].toLowerCase()] || m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : id.replace(/\.exe$/i, '');
}
// Windows only refreshes the position now and then, so extrapolate from when it was last updated.
function extPos() {
  if (!ext) return 0;
  const p = ext.status === 'Playing' && ext.updated ? ext.pos + (Date.now() - ext.updated) / 1000 : ext.pos;
  return ext.end > 0 ? Math.min(p, ext.end) : p;
}
let extPolling = null;
function pollExt() { return (extPolling ||= doPollExt().finally(() => (extPolling = null))); }
async function doPollExt() {
  let sessions = [];
  try { sessions = await deskmate.media.sessions(); } catch {}
  // Prefer the app the user picked, then whatever is playing, then browsers, then anything else.
  const pick = (s) => s.app === prefs.mediaApp;
  sessions = sessions.filter((s) => s.title);
  sessions.sort((a, b) => pick(b) - pick(a) || (b.status === 'Playing') - (a.status === 'Playing') || BROWSERS.test(b.app) - BROWSERS.test(a.app));
  extSessions = sessions;
  ext = sessions[0] || null;
  renderExt();
  publishState();
}
async function renderExt() {
  $('#ext').classList.toggle('hidden', !ext);
  if (!ext) return;
  $('#extTitle').textContent = ext.title;
  $('#extSub').textContent = [ext.artist, appLabel(ext.app)].filter(Boolean).join('  ·  ');
  const apps = [...new Set(extSessions.map((s) => s.app))];
  $('#extSwitch').classList.toggle('hidden', apps.length < 2);
  $('#extSwitch').textContent = apps.length > 1 ? `Switch (${apps.length})` : '';
  $('#extPlay').innerHTML = ext.status === 'Playing' ? '&#x23F8;' : '&#x25B6;';
  const key = ext.app + '|' + ext.title;
  if (key !== extArtKey) {
    extArtKey = key;
    $('#extArt').src = (await deskmate.media.art(ext.app)) || '';
  }
}
async function extCmd(action) {
  if (!ext) return;
  if ((action === 'toggle' && ext.status !== 'Playing') || action === 'play') audio.pause();
  await deskmate.media.command(ext.app, action);
  setTimeout(pollExt, 400);
}
$('#extPlay').onclick = () => extCmd('toggle');
$('#extSwitch').onclick = () => {
  const apps = [...new Set(extSessions.map((s) => s.app))];
  prefs.mediaApp = apps[(apps.indexOf(ext.app) + 1) % apps.length]; savePrefs();
  toast('Controlling ' + appLabel(prefs.mediaApp));
  pollExt();
};
$('#extNext').onclick = () => extCmd('next');
$('#extPrev').onclick = () => extCmd('prev');
// The bar is always on screen while Deskmate is open, so keep polling even when this tab isn't the one showing.
let panelOpen = true;
deskmate.onShown(() => { panelOpen = true; pollExt(); });
deskmate.onHidden(() => (panelOpen = false));
setInterval(() => { if (panelOpen) pollExt(); }, 2000);

// ---------- my files ----------
$$('.segbtn').forEach((b) => (b.onclick = () => {
  mode = b.dataset.src;
  $$('.segbtn').forEach((x) => x.classList.toggle('active', x === b));
  $('#musicLocal').classList.toggle('hidden', mode !== 'local');
  $('#musicRadio').classList.toggle('hidden', mode !== 'radio');
  if (mode === 'radio' && !$('#radioList').children.length) showFavorites();
}));
async function loadLocal() {
  folder = await deskmate.music.folder();
  $('#folderName').textContent = folder || 'No folder chosen';
  tracks = await deskmate.music.tracks();
  renderTracks();
}
function renderTracks() {
  const q = $('#trackSearch').value.toLowerCase();
  const shown = tracks.filter((t) => !q || t.name.toLowerCase().includes(q));
  const list = $('#trackList');
  list.innerHTML = shown.length ? '' : `<div class="empty">${folder ? 'No audio files found' : 'Pick a folder with your music'}</div>`;
  const frag = document.createDocumentFragment();
  shown.slice(0, 1500).forEach((t) => {
    const el = document.createElement('div');
    el.className = 'track'; el.dataset.url = t.url;
    el.innerHTML = `<span class="ellipsis grow">${esc(t.name)}</span>`;
    el.onclick = () => { queue = shown; qIndex = shown.indexOf(t); playItem(t); };
    frag.appendChild(el);
  });
  list.appendChild(frag);
  markPlaying();
}
$('#trackSearch').oninput = renderTracks;
$('#pickFolderBtn').onclick = async () => { if (await deskmate.music.pickFolder()) loadLocal(); };

// ---------- free radio (radio-browser.info, no key needed) ----------
const GENRES = ['lofi', 'chillout', 'jazz', 'rock', 'hiphop', 'electronic', 'classical', 'ambient', 'pop', 'metal'];
$('#genreChips').innerHTML = '<button class="chip" data-g="__fav">★ Favorites</button>' + GENRES.map((g) => `<button class="chip" data-g="${g}">${g}</button>`).join('');
$$('#genreChips .chip').forEach((c) => (c.onclick = () => {
  $$('#genreChips .chip').forEach((x) => x.classList.toggle('active', x === c));
  c.dataset.g === '__fav' ? showFavorites() : searchRadio({ tag: c.dataset.g });
}));
$('#radioGo').onclick = () => searchRadio({ name: $('#radioSearch').value.trim() });
$('#radioSearch').onkeydown = (e) => { if (e.key === 'Enter') $('#radioGo').click(); };

const isFav = (s) => (prefs.favorites || []).some((f) => f.id === s.id);
function toggleFav(s) {
  const favs = prefs.favorites || [];
  prefs.favorites = isFav(s) ? favs.filter((f) => f.id !== s.id) : [...favs, s];
  savePrefs();
}
function showFavorites() {
  $$('#genreChips .chip').forEach((x) => x.classList.toggle('active', x.dataset.g === '__fav'));
  renderStations(prefs.favorites || [], 'No favorites yet. Star a station to save it.');
}
async function searchRadio({ tag, name }) {
  $('#radioList').innerHTML = '<div class="empty">Tuning in...</div>';
  try {
    const q = new URLSearchParams({ limit: '40', order: 'clickcount', reverse: 'true', hidebroken: 'true' });
    if (tag) q.set('tag', tag);
    if (name) q.set('name', name);
    const res = await fetch('https://all.api.radio-browser.info/json/stations/search?' + q);
    const list = (await res.json()).filter((s) => s.url_resolved).map((s) => ({
      id: s.stationuuid, name: s.name.trim(), url: s.url_resolved, country: s.countrycode, bitrate: s.bitrate, tags: s.tags,
    }));
    renderStations(list, 'No stations found');
  } catch { $('#radioList').innerHTML = '<div class="empty">Radio directory unreachable</div>'; }
}
function renderStations(list, emptyMsg) {
  const el = $('#radioList');
  el.innerHTML = list.length ? '' : `<div class="empty">${emptyMsg}</div>`;
  for (const s of list) {
    const row = document.createElement('div');
    row.className = 'track'; row.dataset.url = s.url;
    row.innerHTML = `<div class="grow" style="min-width:0"><div class="ellipsis">${esc(s.name)}</div>
      <div class="sub ellipsis">${esc([s.country, s.bitrate ? s.bitrate + 'kbps' : '', s.tags].filter(Boolean).join(' · '))}</div></div>
      <button class="star ${isFav(s) ? 'on' : ''}">${isFav(s) ? '★' : '☆'}</button>`;
    row.querySelector('.star').onclick = (e) => {
      e.stopPropagation(); toggleFav(s);
      e.target.classList.toggle('on', isFav(s)); e.target.textContent = isFav(s) ? '★' : '☆';
    };
    row.onclick = () => { queue = []; playItem({ ...s, radio: true }); };
    el.appendChild(row);
  }
  markPlaying();
}

// ---------- boot ----------
(async () => {
  loadPrefs();
  if (!prefs.migrated) {
    const old = await deskmate.legacy();
    prefs = { favorites: old.favorites || [], volume: old.volume ?? 0.6, mediaApp: old.mediaApp || null, migrated: true };
    savePrefs();
  }
  audio.volume = prefs.volume ?? 0.6;
  loadLocal();
  pollExt();
})();
