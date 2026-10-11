// Plugin host: loads plugins into sandboxed views, enforces their permissions, and installs/updates/removes them.
//
// Each plugin gets its own session (storage, cookies and cache are separate from every other plugin and from the
// vault), runs with no Node access, and can only reach the network hosts it declared. Everything else goes through
// one IPC channel, 'plugin:call', which checks the calling view's granted permissions before doing anything.
const { app, ipcMain, session, WebContentsView, net, Notification, globalShortcut, shell, dialog, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const BUILTIN_DIR = path.join(__dirname, '..', 'plugins');
const PERMISSIONS = {
  notifications: { label: 'Show Windows notifications', risk: 'low' },
  status: { label: 'Show status dots in the corner pill', risk: 'low' },
  'clipboard-write': { label: 'Copy text to your clipboard', risk: 'low' },
  'open-links': { label: 'Open links in your web browser', risk: 'low' },
  hotkeys: { label: 'Use global keyboard shortcuts', risk: 'medium' },
  'music-files': { label: 'Play audio files from a folder you choose', risk: 'medium' },
  'media-control': { label: 'See and control what other apps are playing (browser, Spotify), and their volume', risk: 'high' },
  claude: { label: 'Read your Claude Code conversations and send replies as you', risk: 'high' },
  gmail: { label: 'Read your Gmail (senders, subjects, previews and sign-in codes). It cannot send or delete', risk: 'high' },
};
const ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
const SOUND_IDS = ['chime', 'bell', 'ping', 'pop', 'alarm', 'soft', 'none'];
const HOST_RE = /^(\*|(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+)$/;
const RESERVED_KEYS = ['Control+Alt+D', 'Control+Shift+D', 'Control+Shift+Space', 'Control+Alt+Space', 'Alt+F4', 'Control+Alt+Delete'];
const MAX_ZIP_BYTES = 20 * 1024 * 1024;
const DEFAULT_STORE = 'https://deskmate.lapistudios.com/plugins/index.json'; // verified plugins, reviewed by Lapis Studios

let ctx = null;                 // { win, settings, saveSettings, caps, onStatus, onLayoutChange, isHostSender, rawHandle }
const loaded = new Map();       // id -> { manifest, dir, builtin, ses, tab, bar }
const byWebContents = new Map(); // webContents.id -> id
const statusByPlugin = new Map();
const badgeByPlugin = new Map();
const soundAt = new Map();
let stagedInstall = null;       // { dir, manifest, source } waiting for the user's consent

// ---------- manifests & permissions ----------
function permLabel(p) {
  if (p.startsWith('net:')) { const h = p.slice(4); return { label: h === '*' ? 'Connect to any website' : `Connect to ${h}`, risk: h === '*' ? 'high' : 'low' }; }
  return PERMISSIONS[p] || { label: p, risk: 'high' };
}
function validateManifest(m, dir) {
  const fail = (msg) => { throw new Error('Bad plugin manifest: ' + msg); };
  if (!m || typeof m !== 'object') fail('not JSON');
  if (typeof m.id !== 'string' || !ID_RE.test(m.id)) fail('id must be lowercase letters, numbers and dashes');
  if (!m.name || String(m.name).length > 40) fail('name is required (40 chars max)');
  if (!/^\d+\.\d+\.\d+$/.test(m.version || '')) fail('version must look like 1.0.0');
  const files = [m.tab, m.bar && m.bar.file].filter(Boolean);
  if (!m.tab && !m.bar) fail('needs a "tab" page, a "bar", or both');
  for (const f of files) {
    if (typeof f !== 'string' || f.includes('..') || path.isAbsolute(f)) fail('page paths must stay inside the plugin');
    if (dir && !fs.existsSync(path.join(dir, f))) fail(`missing ${f}`);
  }
  if (m.bar && !(m.bar.height >= 24 && m.bar.height <= 90)) fail('bar.height must be 24-90');
  m.permissions = m.permissions || [];
  if (!Array.isArray(m.permissions)) fail('permissions must be a list');
  for (const p of m.permissions) {
    if (p.startsWith('net:')) { if (!HOST_RE.test(p.slice(4))) fail(`bad network permission ${p}`); }
    else if (!PERMISSIONS[p]) fail(`unknown permission ${p}`);
  }
  m.hotkeys = m.hotkeys || [];
  if (m.hotkeys.length && !m.permissions.includes('hotkeys')) fail('hotkeys need the "hotkeys" permission');
  if (m.hotkeys.length > 8) fail('8 hotkeys max');
  for (const k of m.hotkeys) {
    // Must include Ctrl or Alt, so a plugin can't swallow ordinary typing (a keylogger in disguise).
    const parts = String(k).split('+'), key = parts.pop();
    // Two modifiers, so a plugin can't take over everyday shortcuts like Ctrl+C or Ctrl+V system-wide.
    const modsOk = parts.length >= 2 && new Set(parts).size === parts.length && parts.every((p) => ['Control', 'Alt', 'Shift', 'Super'].includes(p)) && parts.some((p) => p === 'Control' || p === 'Alt');
    if (!modsOk || !/^([A-Z0-9]|F([1-9]|1[0-2])|Left|Right|Up|Down|Space|Home|End|PageUp|PageDown)$/.test(key)) fail(`hotkey ${k} must be two modifiers (one of them Ctrl or Alt) plus one key`);
    if (RESERVED_KEYS.includes(k)) fail(`hotkey ${k} is reserved`);
  }
  // "sounds": { "done": "Time's up" } or { "done": { "label": "Time's up", "default": "alarm" } }
  // Plugins name the moments that make a sound; the user picks the actual sound for each in Settings.
  const sounds = m.sounds || {};
  if (typeof sounds !== 'object' || Array.isArray(sounds)) fail('sounds must be an object');
  if (Object.keys(sounds).length > 12) fail('12 sounds max');
  m.sounds = {};
  for (const [k, v] of Object.entries(sounds)) {
    if (!/^[a-z0-9-]{1,24}$/.test(k)) fail(`sound name ${k} must be lowercase letters, numbers and dashes`);
    const label = typeof v === 'string' ? v : v?.label;
    if (!label || String(label).length > 40) fail(`sound ${k} needs a label (40 chars max)`);
    const def = typeof v === 'object' && SOUND_IDS.includes(v.default) ? v.default : 'chime';
    m.sounds[k] = { label: String(label), default: def };
  }
  return m;
}
function readManifest(dir) {
  let m;
  try { m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch { throw new Error('No readable manifest.json in that plugin'); }
  return validateManifest(m, dir);
}
function pluginState(id) { return (ctx.settings.plugins ||= {})[id] ||= { enabled: true, granted: [] }; }
const granted = (id, perm) => pluginState(id).granted.includes(perm);
function netAllowed(id, url) {
  let host; try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
  return pluginState(id).granted.some((p) => {
    if (!p.startsWith('net:')) return false;
    const pat = p.slice(4);
    return pat === '*' || host === pat || (pat.startsWith('*.') && (host === pat.slice(2) || host.endsWith(pat.slice(1))));
  });
}

// ---------- sessions, protocols, views ----------
function safeJoin(root, rel) {
  const full = path.resolve(root, rel);
  return full === root || full.startsWith(root + path.sep) ? full : null;
}
// Like safeJoin, but for files that must exist: follows symlinks and refuses anything that lands outside root.
function realInside(root, rel) {
  const full = safeJoin(root, rel);
  if (!full) return null;
  try {
    const real = fs.realpathSync(full), realRoot = fs.realpathSync(root);
    if (!(real.startsWith(realRoot + path.sep)) || !fs.statSync(real).isFile()) return null;
    return real;
  } catch { return null; }
}
const AUDIO_EXT = /\.(mp3|m4a|aac|flac|wav|ogg|opus|webm)$/i;
// Copies a plugin folder, skipping symlinks (they could point anywhere on the PC) and dev clutter.
function copyPlugin(src, dest) {
  fs.cpSync(src, dest, { recursive: true, filter: (s) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(s) && !fs.lstatSync(s).isSymbolicLink() });
}
function setupSession(id, dir) {
  const ses = session.fromPartition('persist:plugin-' + id);
  if (ses.__deskmate) return ses;
  ses.__deskmate = true;
  // plugin://<id>/... serves only this plugin's own files (plus the shared Deskmate stylesheet).
  ses.protocol.handle('plugin', (req) => {
    const u = new URL(req.url);
    if (u.host !== id) return new Response('Not found', { status: 404 });
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
    const file = rel === '__deskmate/ui.css' ? path.join(__dirname, '..', 'plugin-ui.css') : realInside(loaded.get(id).dir, rel);
    if (!file) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).href);
  });
  // dmmedia://music/<path> streams files from the folder the user picked (music-files permission).
  ses.protocol.handle('dmmedia', (req) => {
    if (!granted(id, 'music-files') || !ctx.settings.musicFolder) return new Response('Forbidden', { status: 403 });
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
    const file = AUDIO_EXT.test(rel) ? realInside(path.resolve(ctx.settings.musicFolder), rel) : null;
    if (!file) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).href, { headers: req.headers });
  });
  // dmnet://p/<url> relays plain-http media (radio streams) that a secure page can't load directly. Same host rules as fetch.
  ses.protocol.handle('dmnet', (req) => {
    const target = decodeURIComponent(new URL(req.url).pathname.slice(1));
    if (!/^https?:\/\//i.test(target) || !netAllowed(id, target)) return new Response('Forbidden', { status: 403 });
    const headers = {}; const range = req.headers.get('range'); if (range) headers.Range = range;
    // No redirects: a relayed stream that redirects could otherwise land on a host the plugin never declared.
    return net.fetch(target, { headers, redirect: 'error' }).catch(() => new Response('Blocked', { status: 502 }));
  });
  ses.webRequest.onBeforeRequest((d, cb) => {
    const u = d.url;
    if (u.startsWith(`plugin://${id}/`) || u.startsWith('dmmedia://') || u.startsWith('dmnet://') || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('devtools:')) return cb({});
    if (/^(https?|wss?):/i.test(u) && netAllowed(id, u)) return cb({});
    cb({ cancel: true });
  });
  const allow = (perm) => perm === 'clipboard-sanitized-write' && granted(id, 'clipboard-write');
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(allow(perm)));
  ses.setPermissionCheckHandler((_wc, perm) => allow(perm));
  ses.on('will-download', (e) => e.preventDefault());
  return ses;
}
function makeView(id, file, kind) {
  const p = loaded.get(id);
  const view = new WebContentsView({
    webPreferences: {
      session: p.ses, preload: path.join(__dirname, '..', 'plugin-preload.js'),
      sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false,
      devTools: !!pluginState(id).dev, spellcheck: false,
    },
  });
  view.setBackgroundColor(ctx.theme.bg());
  view.setVisible(false);
  const wc = view.webContents;
  wc.on('dom-ready', () => ctx.theme.apply(wc));
  byWebContents.set(wc.id, id);
  wc.on('will-navigate', (e, url) => { if (!url.startsWith(`plugin://${id}/`)) e.preventDefault(); });
  wc.setWindowOpenHandler(({ url }) => {
    if (granted(id, 'open-links') && /^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('before-input-event', (_e, input) => { if (input.type === 'keyDown' && input.key === 'Escape') ctx.win().hide(); });
  wc.on('destroyed', () => byWebContents.delete(wc.id));
  wc.loadURL(`plugin://${id}/${file}`);
  ctx.win().contentView.addChildView(view);
  view.__kind = kind;
  return view;
}
function loadPlugin(dir, builtin) {
  const manifest = readManifest(dir);
  const id = manifest.id;
  if (loaded.has(id)) unloadPlugin(id);
  const st = pluginState(id);
  if (builtin && !st.builtinGranted) { st.granted = [...manifest.permissions]; st.builtinGranted = true; } // official plugins ship pre-approved
  st.version = manifest.version; st.builtin = !!builtin;
  // A plugin only ever gets permissions that are both requested and approved.
  st.granted = st.granted.filter((p) => manifest.permissions.includes(p));
  if (!st.enabled) { loaded.set(id, { manifest, dir, builtin, disabled: true }); return; }
  const entry = { manifest, dir, builtin, ses: null, tab: null, bar: null, hotkeys: [] };
  loaded.set(id, entry);
  entry.ses = setupSession(id, dir);
  if (manifest.tab) entry.tab = makeView(id, manifest.tab, 'tab');
  if (manifest.bar) entry.bar = makeView(id, manifest.bar.file, 'bar');
  if (granted(id, 'hotkeys')) for (const k of manifest.hotkeys) {
    try { if (globalShortcut.register(k, () => sendTo(id, 'hotkey', k))) entry.hotkeys.push(k); } catch {}
  }
}
function unloadPlugin(id) {
  const p = loaded.get(id);
  if (!p) return;
  for (const k of p.hotkeys || []) globalShortcut.unregister(k);
  for (const v of [p.tab, p.bar]) if (v) { ctx.win().contentView.removeChildView(v); v.webContents.close(); }
  loaded.delete(id); statusByPlugin.delete(id); badgeByPlugin.delete(id);
  ctx.onStatus();
}
function sendTo(id, channel, ...args) {
  const p = loaded.get(id);
  for (const v of [p?.tab, p?.bar]) if (v && !v.webContents.isDestroyed()) v.webContents.send('deskmate:event', channel, ...args);
}
function broadcast(channel, ...args) { for (const id of loaded.keys()) sendTo(id, channel, ...args); }

function userPluginsDir() { return path.join(app.getPath('userData'), 'plugins'); }
function loadAll() {
  const seen = new Set();
  for (const [root, builtin] of [[BUILTIN_DIR, true], [userPluginsDir(), false]]) {
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      const dir = path.join(root, name);
      if (!fs.statSync(dir).isDirectory()) continue;
      try {
        const m = readManifest(dir);
        if (seen.has(m.id)) continue; // built-ins win
        seen.add(m.id);
        loadPlugin(dir, builtin);
      } catch (e) { console.error('plugin', name, e.message); }
    }
  }
  ctx.saveSettings();
  ctx.onStatus();
}

// ---------- layout (the host page tells us where plugin views go) ----------
function applyLayout(layout) {
  for (const [id, p] of loaded) {
    if (p.tab) {
      const show = layout.active === id && layout.content;
      if (show) p.tab.setBounds(roundRect(layout.content));
      p.tab.setVisible(!!show);
    }
    if (p.bar) {
      const r = (layout.bars || []).find((b) => b.id === id);
      if (r) p.bar.setBounds(roundRect(r));
      p.bar.setVisible(!!r);
    }
  }
}
const roundRect = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });

function listForHost() {
  return [...loaded.values()].map(({ manifest: m, builtin, disabled }) => {
    const st = pluginState(m.id);
    return {
      id: m.id, name: m.name, version: m.version, author: m.author || '', description: m.description || '',
      builtin: !!builtin, enabled: !disabled, dev: !!st.dev, updateTo: pendingUpdates.get(m.id) || null, hasTab: !!m.tab, bar: m.bar ? { height: m.bar.height } : null,
      permissions: m.permissions.map((p) => ({ id: p, ...permLabel(p) })), hotkeys: m.hotkeys, badge: badgeByPlugin.get(m.id) || 0, sounds: m.sounds,
    };
  });
}
function statusList() {
  return [...statusByPlugin.entries()].filter(([id]) => loaded.has(id) && granted(id, 'status')).map(([id, s]) => ({ id, name: loaded.get(id).manifest.name, ...s }));
}

// Expensive calls answer from a short cache when a plugin asks again too soon.
const throttleCache = new Map();
function throttled(key, ms, fn) {
  const hit = throttleCache.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.value;
  const value = fn();
  throttleCache.set(key, { at: Date.now(), value });
  if (throttleCache.size > 200) throttleCache.delete(throttleCache.keys().next().value);
  return value;
}

// ---------- the plugin API (window.deskmate) ----------
const API = {
  info: (id) => ({ id, version: loaded.get(id).manifest.version, permissions: pluginState(id).granted }),
  hide: () => ctx.win().hide(),
  toast: (id, text) => ctx.win().webContents.send('host:toast', String(text).slice(0, 140)),
  setBadge: (id, n) => { badgeByPlugin.set(id, Math.max(0, Math.min(999, n | 0))); ctx.win().webContents.send('host:plugins-changed'); },
  send: (id, msg) => { sendTo(id, 'message', msg); },
  legacy: (id) => ctx.caps.legacySettings(id, loaded.get(id).builtin),
  'status.set': [['status'], (id, s) => {
    const dots = (Array.isArray(s?.dots) ? s.dots : []).slice(0, 6).map((d) => ({
      color: typeof d?.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(d.color) ? d.color : null, pulse: !!d?.pulse,
    }));
    statusByPlugin.set(id, { dots, tooltip: String(s?.tooltip || '').slice(0, 120) });
    ctx.onStatus();
  }],
  notify: [['notifications'], (id, title, body) => {
    new Notification({ title: `${loaded.get(id).manifest.name}: ${String(title).slice(0, 60)}`, body: String(body || '').slice(0, 200), silent: ctx.settings.sound?.notifSound === false }).show();
  }],
  // Plays the sound the user picked for one of the plugin's declared moments. No permission: it's only a sound,
  // and the user can change or mute each one. Throttled so a plugin can't spam.
  playSound: (id, name) => {
    const s = loaded.get(id).manifest.sounds[String(name)];
    if (!s) throw new Error(`"${name}" isn't in this plugin's "sounds" list`);
    const last = soundAt.get(id) || 0;
    if (Date.now() - last < 400) return false;
    soundAt.set(id, Date.now());
    return ctx.playSound(ctx.settings.sound?.map?.[`${id}:${name}`] || s.default);
  },
  copyText: [['clipboard-write'], async (id, text) => { await clipboard.writeText(String(text).slice(0, 10000)); return true; }],
  openUrl: [['open-links'], (id, url) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); }],
  'media.sessions': [['media-control'], () => ctx.caps.mediaStatus()],
  'media.art': [['media-control'], (id, appId) => ctx.caps.mediaArt(String(appId))],
  'media.command': [['media-control'], (id, appId, action) => ctx.caps.mediaCmd(String(appId), String(action))],
  'music.pickFolder': [['music-files'], () => ctx.caps.pickMusicFolder()],
  'music.folder': [['music-files'], () => ctx.settings.musicFolder || null],
  'music.tracks': [['music-files'], () => ctx.caps.musicTracks()],
  'claude.activity': [['claude'], (id, since) => throttled(`${id}:activity:${since}`, 1500, () => ctx.caps.claudeActivity(Number(since) || 0))],
  'claude.state': [['claude'], (id, sid) => ctx.caps.sessionState(String(sid))],
  'claude.reply': [['claude'], (id, sid, text) => ctx.caps.claudeReply(String(sid), String(text))],
  // Sign-in happens on Google's page in the browser; the plugin never sees a password or token.
  'gmail.status': [['gmail'], () => ctx.caps.gmail.status()],
  'gmail.connect': [['gmail'], () => ctx.caps.gmail.connect()],
  'gmail.disconnect': [['gmail'], () => ctx.caps.gmail.disconnect()],
  'gmail.inbox': [['gmail'], (id, max) => throttled(`${id}:gmail`, 10e3, () => ctx.caps.gmail.inbox(Number(max) || 20))],
  'claude.revealFile': [['claude'], (id, p) => { p = String(p); if (/^[a-z]:[\\/]/i.test(p) && fs.existsSync(p)) shell.showItemInFolder(p); }],
};

// ---------- store / install / update / remove ----------
const secureUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' || (x.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(x.hostname)); } catch { return false; } };
async function fetchStore() {
  const url = ctx.settings.storeUrl || DEFAULT_STORE;
  if (!secureUrl(url)) throw new Error('The store address must start with https://');
  const res = await net.fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Store returned ${res.status}`);
  const idx = await res.json();
  return { name: idx.name || 'Plugin store', plugins: (idx.plugins || []).filter((p) => typeof p.id === 'string' && ID_RE.test(p.id) && secureUrl(p.download) && /^[0-9a-f]{64}$/i.test(p.sha256 || '')) };
}
function stageDir() { return path.join(app.getPath('temp'), 'deskmate-stage-' + crypto.randomBytes(6).toString('hex')); }
function extractZip(buf, dest) {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(buf);
  let total = 0;
  for (const e of zip.getEntries()) {
    total += e.header.size;
    if (total > MAX_ZIP_BYTES * 3) throw new Error('Plugin is too big');
    const out = safeJoin(dest, e.entryName);
    if (!out) throw new Error('Plugin zip tries to write outside its folder');
    if (e.isDirectory) { fs.mkdirSync(out, { recursive: true }); continue; }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, e.getData());
  }
  // Allow zips that wrap everything in one top folder.
  if (!fs.existsSync(path.join(dest, 'manifest.json'))) {
    const subs = fs.readdirSync(dest);
    if (subs.length === 1 && fs.existsSync(path.join(dest, subs[0], 'manifest.json'))) return path.join(dest, subs[0]);
  }
  return dest;
}
function stage(dir, source, expect, slot) {
  const manifest = readManifest(dir);
  if (expect && (manifest.id !== expect.id || manifest.version !== expect.version)) throw new Error('Downloaded plugin does not match the store listing');
  if (loaded.get(manifest.id)?.builtin) throw new Error(`"${manifest.id}" is a built-in plugin`);
  const prev = loaded.get(manifest.id);
  const already = prev ? pluginState(manifest.id).granted : [];
  const staged = { dir, manifest, source };
  if (slot) slot.staged = staged; else stagedInstall = staged;
  return {
    id: manifest.id, name: manifest.name, version: manifest.version, author: manifest.author || '', description: manifest.description || '',
    update: !!prev, fromVersion: prev?.manifest.version || null, source,
    permissions: manifest.permissions.map((p) => ({ id: p, ...permLabel(p), new: !already.includes(p) })), hotkeys: manifest.hotkeys,
  };
}
async function stageFromStore(id, slot) {
  const { plugins } = await fetchStore();
  const entry = plugins.find((p) => p.id === id);
  if (!entry) throw new Error('Not in the store');
  const res = await net.fetch(entry.download, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_ZIP_BYTES) throw new Error('Plugin is too big');
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  if (hash !== entry.sha256.toLowerCase()) throw new Error('Download was changed or corrupted (checksum mismatch). Not installing.');
  const dest = stageDir(); fs.mkdirSync(dest, { recursive: true });
  return stage(extractZip(buf, dest), 'store', entry, slot);
}
async function stageFromFolder() {
  const r = await ctx.withDialog(() => dialog.showOpenDialog(ctx.win(), { title: 'Pick a plugin folder (it has a manifest.json)', properties: ['openDirectory'] }));
  if (r.canceled) return null;
  const src = r.filePaths[0];
  const dest = stageDir();
  copyPlugin(src, dest);
  const info = stage(dest, 'folder');
  stagedInstall.devSource = src;
  return info;
}
function commitInstall(approve, slot) {
  let s;
  if (slot) { s = slot.staged; slot.staged = null; } else { s = stagedInstall; stagedInstall = null; }
  if (!s) throw new Error('Nothing waiting to install');
  if (approve) pendingUpdates.delete(s.manifest.id);
  if (!approve) { fs.rmSync(s.dir, { recursive: true, force: true }); return listForHost(); }
  const id = s.manifest.id;
  const target = path.join(userPluginsDir(), id);
  unloadPlugin(id);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(userPluginsDir(), { recursive: true });
  fs.cpSync(s.dir, target, { recursive: true });
  fs.rmSync(s.dir, { recursive: true, force: true });
  const st = pluginState(id);
  st.granted = [...s.manifest.permissions]; st.enabled = true;
  st.dev = s.source === 'folder'; st.devSource = s.devSource || null;
  loadPlugin(target, false);
  ctx.saveSettings(); ctx.onLayoutChange();
  return listForHost();
}
function removePlugin(id) {
  const p = loaded.get(id);
  if (!p || p.builtin) throw new Error("Built-in plugins can be turned off but not removed");
  unloadPlugin(id);
  fs.rmSync(path.join(userPluginsDir(), id), { recursive: true, force: true });
  session.fromPartition('persist:plugin-' + id).clearStorageData().catch(() => {});
  delete ctx.settings.plugins[id];
  ctx.saveSettings(); ctx.onLayoutChange();
  return listForHost();
}
function setEnabled(id, on) {
  const p = loaded.get(id);
  if (!p) throw new Error('No such plugin');
  pluginState(id).enabled = !!on;
  const dir = p.dir, builtin = p.builtin;
  unloadPlugin(id);
  loadPlugin(dir, builtin);
  ctx.saveSettings(); ctx.onLayoutChange(); ctx.onStatus();
  return listForHost();
}
function reloadDev(id) {
  const st = pluginState(id);
  if (!st.dev || !st.devSource) throw new Error('Only plugins installed from a folder can be reloaded');
  const dest = stageDir();
  copyPlugin(st.devSource, dest);
  const info = stage(dest, 'folder');
  stagedInstall.devSource = st.devSource;
  // Same permissions and hotkeys as before: reload straight away. Anything new still needs consent.
  const sameKeys = JSON.stringify(info.hotkeys) === JSON.stringify(loaded.get(id)?.manifest.hotkeys || []);
  if (info.permissions.some((p) => p.new) || !sameKeys) return { needsConsent: info };
  return { plugins: commitInstall(true) };
}

// ---------- automatic updates ----------
// Store plugins update themselves when the new version asks for nothing new (same permissions and shortcuts).
// Anything that wants more is left for the user: it shows an Update button and goes through the consent screen.
const pendingUpdates = new Map(); // id -> version waiting for approval
const { newer } = require('./updater');
async function updatePlugins() {
  const { plugins } = await fetchStore();
  const updated = [];
  pendingUpdates.clear();
  for (const sp of plugins) {
    const have = loaded.get(sp.id);
    if (!have || have.builtin || pluginState(sp.id).dev || !newer(sp.version, have.manifest.version)) continue;
    // Its own staging slot, so it never touches an install the user has open on the consent screen.
    const slot = {};
    try {
      const info = await stageFromStore(sp.id, slot);
      const sameKeys = JSON.stringify(info.hotkeys) === JSON.stringify(have.manifest.hotkeys || []);
      if (info.permissions.some((p) => p.new) || !sameKeys) { commitInstall(false, slot); pendingUpdates.set(sp.id, sp.version); continue; }
      commitInstall(true, slot);
      updated.push(`${info.name} ${info.version}`);
    } catch { if (slot.staged) commitInstall(false, slot); }
  }
  ctx.onLayoutChange();
  return { updated, waiting: [...pendingUpdates.keys()] };
}
function startAutoUpdate() {
  const run = async () => {
    if (ctx.settings.autoUpdatePlugins === false) return;
    try {
      const r = await updatePlugins();
      if (r.updated.length) ctx.win().webContents.send('host:toast', `Updated ${r.updated.join(', ')}`);
    } catch {}
  };
  setTimeout(run, 20e3);
  setInterval(run, 6 * 3600e3);
}

// ---------- wiring ----------
function init(c) {
  ctx = c;
  ipcMain.handle('plugin:call', async (e, method, ...args) => {
    const id = byWebContents.get(e.sender.id);
    if (!id || !loaded.has(id)) throw new Error('Unknown plugin');
    const def = API[method];
    if (!def) throw new Error(`deskmate.${method} does not exist`);
    const [needs, fn] = Array.isArray(def) ? def : [[], def];
    for (const perm of needs) if (!granted(id, perm)) throw new Error(`This plugin doesn't have the "${perm}" permission`);
    return fn(id, ...args);
  });
  const host = c.handleHost;
  host('plugins:list', () => listForHost());
  host('plugins:layout', (_e, layout) => applyLayout(layout));
  host('plugins:status', () => statusList());
  host('plugins:storeGet', async () => { try { return await fetchStore(); } catch (e) { return { plugins: [], error: e.message }; } });
  host('plugins:storeUrl', (_e, url) => { ctx.settings.storeUrl = url ? String(url).trim() : ''; ctx.saveSettings(); return ctx.settings.storeUrl; });
  host('plugins:stageStore', (_e, id) => stageFromStore(id));
  host('plugins:stageFolder', () => stageFromFolder());
  host('plugins:commit', (_e, approve) => commitInstall(!!approve));
  host('plugins:remove', (_e, id) => removePlugin(id));
  host('plugins:enable', (_e, id, on) => setEnabled(id, on));
  host('plugins:reload', (_e, id) => reloadDev(id));
  host('plugins:checkUpdates', () => updatePlugins());
  host('plugins:devtools', (_e, id) => { const p = loaded.get(id); if (pluginState(id).dev && p?.tab) p.tab.webContents.openDevTools({ mode: 'detach' }); });
}

// Re-theme every open plugin page (tabs and bars).
function retheme() {
  for (const p of loaded.values()) for (const v of [p.tab, p.bar]) {
    if (!v || v.webContents.isDestroyed()) continue;
    v.setBackgroundColor(ctx.theme.bg());
    ctx.theme.apply(v.webContents);
  }
}

module.exports = { init, loadAll, broadcast, statusList, startAutoUpdate, retheme, updatePlugins, PERMISSIONS, SOUND_IDS };
