const { app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, Menu, nativeImage, clipboard, dialog, shell, powerMonitor, safeStorage, protocol } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const W = 380, H = 560, MARGIN = 12;
const HOTKEYS = ['Control+Alt+D', 'Control+Shift+D', 'Control+Shift+Space', 'Control+Alt+Space'];
let hotkey = null;
const prettyKey = () => (hotkey ? hotkey.replace('Control', 'Ctrl') : 'tray icon');
const AUTO_LOCK_MS = 5 * 60 * 1000;
const CLIP_CLEAR_MS = 20 * 1000;

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
// Shown by Windows in notifications and the startup list (instead of "Electron").
app.setAppUserModelId(app.isPackaged ? 'com.lapistudios.deskmate' : 'DeskMate'); // packaged id matches the installer's shortcut

// Plugin pages load from plugin://<id>/, local music from dmmedia://, relayed http media from dmnet://.
protocol.registerSchemesAsPrivileged(['plugin', 'dmmedia', 'dmnet'].map((scheme) => ({
  scheme, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
})));
const plugins = require('./host/plugins');

let win, tray, pinned = false;

// Every host channel (vault, settings, ...) only answers the Deskmate window and the status pill, never a plugin view.
const isHostSender = (wc) => (win && wc === win.webContents) || (mini && wc === mini.webContents);
function handleHost(channel, fn) {
  ipcMain.handle(channel, (e, ...args) => {
    if (!isHostSender(e.sender)) throw new Error('Not allowed');
    return fn(e, ...args);
  });
}
// Keeps the panel open while a file dialog is up (it would otherwise hide on blur).
async function withDialog(fn) {
  const prev = pinned; pinned = true;
  try { return await fn(); } finally { pinned = prev; win.focus(); }
}

// ---------- settings ----------
const dataDir = app.getPath('userData');
const settingsPath = path.join(dataDir, 'settings.json');
let settings = { lastChecked: Date.now() - 24 * 3600e3, musicFolder: null, volume: 0.6, favorites: [] };
try { Object.assign(settings, JSON.parse(fs.readFileSync(settingsPath, 'utf8'))); } catch {}
function saveSettings() { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2)); }

// ---------- window ----------
function placeWindow() {
  const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  win.setBounds({ x: wa.x + wa.width - W - MARGIN, y: wa.y + wa.height - H - MARGIN, width: W, height: H });
}
function showWindow() { placeWindow(); win.show(); win.focus(); win.webContents.send('shown'); plugins.broadcast('shown'); }
function toggleWindow() { win.isVisible() && win.isFocused() ? win.hide() : showWindow(); }

function createWindow() {
  win = new BrowserWindow({
    width: W, height: H, show: false, frame: false, transparent: true, resizable: false,
    skipTaskbar: true, alwaysOnTop: true, fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'pop-up-menu');
  win.loadFile('index.html');
  win.on('blur', () => { if (!pinned && !win.webContents.isDevToolsOpened()) win.hide(); });
  win.on('show', () => syncMini());
  win.on('hide', () => { syncMini(); plugins.broadcast('hidden'); });
}

function trayIcon() {
  // 16x16 BGRA: orange ring on transparent
  const s = 16, buf = Buffer.alloc(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5), i = (y * s + x) * 4;
    if (d < 7.5) { buf[i] = 40; buf[i + 1] = 140; buf[i + 2] = 255; buf[i + 3] = d > 4.5 || d < 2 ? 255 : 0; }
  }
  return nativeImage.createFromBitmap(buf, { width: s, height: s });
}

function buildTrayMenu() {
  const loginOpts = { name: 'DeskMate', path: process.execPath, args: app.isPackaged ? [] : [__dirname] };
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open', click: showWindow },
    { label: 'Status dots', type: 'checkbox', checked: !!settings.mini, click: (m) => setMini(m.checked) },
    { label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings(loginOpts).openAtLogin,
      click: (m) => app.setLoginItemSettings({ ...loginOpts, openAtLogin: m.checked }) },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

function buildTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip(`Deskmate (${prettyKey()})`);
  tray.on('click', toggleWindow);
  const loginOpts = { name: 'DeskMate', path: process.execPath, args: app.isPackaged ? [] : [__dirname] };
  if (!settings.loginSet) { app.setLoginItemSettings({ ...loginOpts, openAtLogin: true }); settings.loginSet = true; saveSettings(); }
  // Older versions registered the startup entry under Electron's default name; move it to DeskMate.
  if (!settings.loginRenamed) {
    const old = { name: 'electron.app.Electron', path: process.execPath, args: loginOpts.args };
    const wasOn = app.getLoginItemSettings(old).openAtLogin;
    app.setLoginItemSettings({ ...old, openAtLogin: false });
    if (wasOn) app.setLoginItemSettings({ ...loginOpts, openAtLogin: true });
    settings.loginRenamed = true; saveSettings();
  }
  // The installed DeskMate.exe takes over the startup entry from the dev copy (but a test build in dist\ doesn't).
  if (app.isPackaged && !/[\\/]dist[\\/]/i.test(process.execPath) && settings.loginExe !== process.execPath) {
    app.setLoginItemSettings({ ...loginOpts, openAtLogin: true });
    settings.loginExe = process.execPath; saveSettings();
  }
  buildTrayMenu();
}

app.whenReady().then(() => {
  hotkey = HOTKEYS.find((k) => globalShortcut.register(k, toggleWindow)) || null;
  createWindow();
  buildTray();
  createMini();
  syncMini();
  plugins.init({
    win: () => win, settings, saveSettings, handleHost, withDialog,
    onStatus: pushStatus, onLayoutChange: () => win.webContents.send('host:plugins-changed'),
    caps: { claudeActivity, sessionState, claudeReply, mediaStatus, mediaArt, mediaCmd, pickMusicFolder, musicTracks, legacySettings },
  });
  win.webContents.once('did-finish-load', () => { plugins.loadAll(); win.webContents.send('host:plugins-changed'); });
  tray.displayBalloon({ title: 'Deskmate is running', content: hotkey ? `Press ${prettyKey()} to open it.` : 'Hotkeys are taken. Click the tray icon to open it.' });
  powerMonitor.on('lock-screen', lockVault);
  powerMonitor.on('suspend', lockVault);
});
app.on('second-instance', showWindow);
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', (e) => e.preventDefault());

handleHost('win:hide', () => win.hide());
handleHost('win:hotkey', prettyKey);
handleHost('win:pin', (_e, v) => { pinned = !!v; return pinned; });
handleHost('settings:get', () => settings);
handleHost('settings:set', (_e, patch) => { Object.assign(settings, patch); saveSettings(); return settings; });
handleHost('shell:reveal', (_e, p) => shell.showItemInFolder(p));

// ---------- Claude activity ----------
const projectsDir = path.join(os.homedir(), '.claude', 'projects');
const parseCache = new Map(); // file -> { mtime, entries }

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  return '';
}
function isRealPrompt(t) { return t && !t.startsWith('<') && !t.startsWith('[Request interrupted'); }

function parseSession(file, mtime) {
  const c = parseCache.get(file);
  if (c && c.mtime === mtime) return c.entries;
  const entries = [];
  let title = null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.type === 'custom-title' || o.type === 'ai-title') { title = o.customTitle || o.aiTitle || title; continue; }
    if (o.isSidechain || !o.timestamp || !o.message) continue;
    const ts = Date.parse(o.timestamp);
    if (o.type === 'user' && !o.isMeta) {
      const t = textOf(o.message.content).trim();
      if (isRealPrompt(t)) entries.push({ k: 'prompt', ts, t, cwd: o.cwd });
    } else if (o.type === 'assistant' && Array.isArray(o.message.content)) {
      for (const part of o.message.content) {
        if (part.type === 'text' && part.text.trim()) entries.push({ k: 'reply', ts, t: part.text.trim() });
        else if (part.type === 'tool_use') {
          const fp = part.input && (part.input.file_path || part.input.notebook_path);
          if (['Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(part.name) && fp) entries.push({ k: 'file', ts, t: fp });
          else if (['Bash', 'PowerShell'].includes(part.name)) entries.push({ k: 'cmd', ts, t: (part.input.description || part.input.command || '').slice(0, 120) });
          else if (part.name === 'Agent' || part.name === 'Task') entries.push({ k: 'agent', ts, t: part.input.description || '' });
        }
      }
    }
  }
  entries.title = title;
  parseCache.set(file, { mtime, entries });
  return entries;
}

function claudeActivity(since) {
  const out = [];
  let dirs = [];
  try { dirs = fs.readdirSync(projectsDir, { withFileTypes: true }).filter(d => d.isDirectory()); } catch { return out; }
  for (const d of dirs) {
    const dir = path.join(projectsDir, d.name);
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.jsonl')) continue;
      const file = path.join(dir, f);
      const mtime = fs.statSync(file).mtimeMs;
      if (mtime <= since) continue;
      let entries; try { entries = parseSession(file, mtime); } catch { continue; }
      const recent = entries.filter(e => e.ts > since);
      if (!recent.length) continue;
      const firstPrompt = entries.find(e => e.k === 'prompt');
      const replies = recent.filter(e => e.k === 'reply');
      out.push({
        id: f.replace('.jsonl', ''),
        title: entries.title || (firstPrompt ? firstPrompt.t.slice(0, 60) : 'Untitled session'),
        cwd: (entries.find(e => e.cwd) || {}).cwd || d.name,
        last: recent[recent.length - 1].ts,
        active: Date.now() - mtime < 2 * 60e3,
        prompts: recent.filter(e => e.k === 'prompt').map(e => e.t.slice(0, 300)),
        files: [...new Set(recent.filter(e => e.k === 'file').map(e => e.t))],
        cmds: recent.filter(e => e.k === 'cmd').length,
        agents: recent.filter(e => e.k === 'agent').map(e => e.t),
        lastReply: replies.length ? replies[replies.length - 1].t.slice(0, 1200) : '',
      });
    }
  }
  return out.sort((a, b) => b.last - a.last);
}

// ---------- status pill (mini mode) ----------
// Shows the status dots plugins publish (e.g. the Claude plugin's working/done/needs-input dots).
const MINI_H = 40; // Windows won't go below ~39px tall; the pill is drawn in the bottom 24px
let mini = null, miniW = 40;

function createMini() {
  mini = new BrowserWindow({
    width: miniW, height: MINI_H, show: false, frame: false, transparent: true, resizable: false,
    skipTaskbar: true, alwaysOnTop: true, focusable: false, fullscreenable: false, hasShadow: false, thickFrame: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  mini.setAlwaysOnTop(true, 'screen-saver');
  mini.loadFile('mini.html');
}
function placeMini() {
  const wa = screen.getPrimaryDisplay().workArea;
  mini.setBounds({ x: wa.x + wa.width - miniW - MARGIN, y: wa.y + wa.height - MINI_H - 8, width: miniW, height: MINI_H });
}
function syncMini() {
  if (!mini) return;
  const show = settings.mini && !win.isVisible();
  if (show && !mini.isVisible()) { placeMini(); mini.showInactive(); }
  else if (!show && mini.isVisible()) mini.hide();
}
function setMini(on) {
  settings.mini = !!on; saveSettings();
  if (on) win.hide();
  syncMini();
  buildTrayMenu();
}
function pushStatus() {
  const list = plugins.statusList();
  const dots = list.reduce((n, s) => n + s.dots.length, 0);
  miniW = Math.max(40, 18 + dots * 13 + Math.max(0, list.length - 1) * 8);
  if (mini) { if (mini.isVisible()) placeMini(); mini.webContents.send('host:status', list); }
  if (win) win.webContents.send('host:status', list);
  const tips = list.filter((s) => s.tooltip).map((s) => s.tooltip);
  if (tray) tray.setToolTip([`Deskmate (${prettyKey()})`, ...tips].join('\n').slice(0, 127));
}
handleHost('mini:shrink', () => setMini(true));
handleHost('mini:open', showWindow);
handleHost('mini:menu', () => Menu.buildFromTemplate([
  { label: 'Open Deskmate', click: showWindow },
  { label: 'Hide status dots', click: () => setMini(false) },
]).popup({ window: mini }));

// Which state is the watched Claude conversation in? Read the tail of its transcript.
const WAIT_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode']);
function findTranscript(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    for (const d of fs.readdirSync(projectsDir)) {
      const f = path.join(projectsDir, d, id + '.jsonl');
      if (fs.existsSync(f)) return f;
    }
  } catch {}
  return null;
}
function readTail(file, bytes) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size, start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    const lines = buf.toString('utf8').split('\n');
    if (start > 0) lines.shift(); // partial first line
    return lines;
  } finally { fs.closeSync(fd); }
}
function sessionState(id) {
  const file = findTranscript(id);
  if (!file) return { state: 'none' };
  const idleMs = Date.now() - fs.statSync(file).mtimeMs;
  const lines = readTail(file, 256 * 1024);
  let last = null, mode = null, title = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i]) continue;
    let o; try { o = JSON.parse(lines[i]); } catch { continue; }
    if (!title && (o.type === 'custom-title' || o.type === 'ai-title')) title = o.customTitle || o.aiTitle;
    if (o.isSidechain) continue;
    if (!last && (o.type === 'assistant' || o.type === 'user') && o.message) last = o;
    if (!mode && o.type === 'user' && o.permissionMode) mode = o.permissionMode;
    if (last && mode && title) break;
  }
  let state = 'done';
  if (last && last.type === 'assistant') {
    const parts = Array.isArray(last.message.content) ? last.message.content : [];
    const tools = parts.filter((p) => p.type === 'tool_use');
    if (last.message.stop_reason === 'end_turn' || last.message.stop_reason === 'stop_sequence') state = 'done';
    else if (tools.some((t) => WAIT_TOOLS.has(t.name))) state = 'input';
    // A tool call with no result for a while, outside bypass mode, is almost always a permission prompt.
    else if (tools.length && mode !== 'bypassPermissions' && idleMs > 15e3) state = 'input';
    else state = 'working';
  } else if (last && last.type === 'user') {
    const t = textOf(last.message.content);
    state = t.startsWith('[Request interrupted') ? 'done' : 'working';
  }
  if (state === 'working' && idleMs > 30 * 60e3) state = 'done'; // stale: crashed or closed mid-turn
  return { state, title: title || 'Claude', id };
}
// ---------- reply to a Claude conversation in the background (no window pops up) ----------
function findClaudeExe() {
  const base = path.join(app.getPath('appData'), 'Claude', 'claude-code');
  let best = null;
  try {
    for (const v of fs.readdirSync(base)) for (const h of fs.readdirSync(path.join(base, v))) {
      const exe = path.join(base, v, h, 'claude.exe');
      if (fs.existsSync(exe)) { const t = fs.statSync(exe).mtimeMs; if (!best || t > best.t) best = { exe, t }; }
    }
  } catch {}
  return best ? best.exe : 'claude';
}
function sessionMeta(id) {
  const file = findTranscript(id);
  const meta = {};
  if (!file) return meta;
  const lines = readTail(file, 512 * 1024);
  for (let i = lines.length - 1; i >= 0 && !(meta.cwd && meta.mode && meta.model); i--) {
    let o; try { o = JSON.parse(lines[i]); } catch { continue; }
    if (o.isSidechain) continue;
    if (o.type === 'user') { meta.cwd ||= o.cwd; meta.mode ||= o.permissionMode; }
    if (o.type === 'assistant' && o.message && o.message.model && !o.message.model.startsWith('<')) meta.model ||= o.message.model;
  }
  return meta;
}
const replying = new Set();
async function claudeReply(id, text) {
  if (replying.has(id)) return { error: 'Still sending your last message' };
  const st = sessionState(id).state;
  if (st === 'working') return { error: 'Claude is still working. Wait for yellow.' };
  if (st === 'input') return { error: 'Claude asked a question in the app. Answer it there.' };
  const meta = sessionMeta(id);
  const args = ['-p', text, '--resume', id, '--output-format', 'json'];
  if (meta.mode) args.push('--permission-mode', meta.mode);
  if (meta.model) args.push('--model', meta.model);
  replying.add(id);
  return new Promise((resolve) => {
    // Drop session vars inherited when Deskmate was launched from inside Claude, or the CLI talks to that host instead of using its own login.
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|ANTHROPIC_BASE_URL$|USE_\w*OAUTH$)/.test(k)));
    const p = spawn(findClaudeExe(), args, { cwd: meta.cwd && fs.existsSync(meta.cwd) ? meta.cwd : os.homedir(), windowsHide: true, env });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => { replying.delete(id); resolve({ error: 'Could not start Claude: ' + e.message }); });
    p.on('close', () => {
      replying.delete(id);
      let r; try { r = JSON.parse(out.trim().split('\n').pop()); } catch {}
      if (!r) return resolve({ error: (err || out || 'No response').trim().slice(0, 300) });
      if (/not logged in/i.test(r.result || '')) return resolve({ error: 'not-logged-in' });
      resolve(r.is_error ? { error: String(r.result || 'Claude returned an error').slice(0, 300) } : { result: r.result || '(no text reply)' });
    });
  });
}

// ---------- vault ----------
// Encryption key = scrypt(master password), mixed with a random "device key" when the vault is locked to this
// Windows account. The device key is sealed with Windows DPAPI (Electron safeStorage), so a copied vault.enc is
// useless on another PC or account even with the master password. A backup copy (sealed with the master password
// plus a recovery key the user keeps off this PC) is rewritten on every change so a Windows reinstall isn't fatal.
const vaultPath = path.join(dataDir, 'vault.enc');
let vaultKey = null, vaultSalt = null, vaultItems = null, vaultSecurity = null, lockTimer = null;
let vaultPwKey = null, vaultBound = null, vaultRecovery = null; // bound = DPAPI-sealed device key (base64); recovery = backup recovery key

function deriveKey(pw, salt) { return crypto.scryptSync(pw, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }); }
const mixKey = (pwKey, secret, info) => Buffer.from(crypto.hkdfSync('sha256', Buffer.concat([pwKey, secret]), Buffer.alloc(0), info, 32));
function unsealDevice(bound) {
  try { return Buffer.from(safeStorage.decryptString(Buffer.from(bound, 'base64')), 'hex'); }
  catch { throw new Error('This vault is locked to a different Windows account or PC. Use Restore from backup.'); }
}
function encryptBlob(key, plainObj, extra) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(JSON.stringify(plainObj), 'utf8'), c.final()]);
  return { ...extra, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
}
function decryptBlob(key, blob) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'));
  d.setAuthTag(Buffer.from(blob.tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(blob.data, 'base64')), d.final()]).toString('utf8'));
}
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', text);
  fs.renameSync(file + '.tmp', file);
}
const vaultPlain = () => ({ items: vaultItems, security: vaultSecurity, recovery: vaultRecovery });
function persistVault() {
  const extra = { v: vaultBound ? 2 : 1, salt: vaultSalt.toString('base64'), ...(vaultBound ? { bound: vaultBound } : {}) };
  writeAtomic(vaultPath, JSON.stringify(encryptBlob(vaultKey, vaultPlain(), extra)));
  if (vaultBound && vaultRecovery && settings.vaultBackupPath) {
    try { writeBackup(settings.vaultBackupPath); settings.vaultBackupAt = Date.now(); saveSettings(); }
    catch (e) { settings.vaultBackupError = e.message; saveSettings(); }
  }
}
function writeBackup(file) {
  const key = mixKey(vaultPwKey, Buffer.from(normRecovery(vaultRecovery)), 'deskmate-backup');
  writeAtomic(file, JSON.stringify(encryptBlob(key, vaultPlain(), { kind: 'deskmate-vault-backup', v: 1, salt: vaultSalt.toString('base64'), created: new Date().toISOString() })));
}
function lockVault() {
  for (const k of [vaultKey, vaultPwKey]) if (k) k.fill(0);
  vaultKey = vaultSalt = vaultItems = vaultSecurity = pendingUnlock = setupSecret = vaultPwKey = vaultBound = vaultRecovery = null;
  clearTimeout(lockTimer);
  if (win) win.webContents.send('vault:locked');
}
function touchVault() { clearTimeout(lockTimer); lockTimer = setTimeout(lockVault, AUTO_LOCK_MS); }
function publicItems() { return vaultItems.map(({ password, totp, ...rest }) => ({ ...rest, hasPassword: !!password, hasTotp: !!totp, totpLabel: totp ? totp.issuer || totp.label || '' : '' })); }
function requireUnlocked() { if (!vaultKey) throw new Error('Vault is locked'); touchVault(); }
function openVault(ctx) {
  ({ key: vaultKey, salt: vaultSalt, pwKey: vaultPwKey, bound: vaultBound, items: vaultItems, security: vaultSecurity, recovery: vaultRecovery } = ctx);
  touchVault();
}

handleHost('vault:status', () => (vaultKey ? 'unlocked' : fs.existsSync(vaultPath) ? 'locked' : 'none'));
handleHost('vault:create', (_e, pw) => {
  if (fs.existsSync(vaultPath)) throw new Error('Vault already exists');
  const salt = crypto.randomBytes(16), pwKey = deriveKey(pw, salt);
  openVault({ key: Buffer.from(pwKey), salt, pwKey, bound: null, items: [], security: null, recovery: null });
  persistVault(); return publicItems();
});
handleHost('vault:unlock', (_e, pw) => {
  const blob = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
  const salt = Buffer.from(blob.salt, 'base64'), pwKey = deriveKey(pw, salt);
  const key = blob.bound ? mixKey(pwKey, unsealDevice(blob.bound), 'deskmate-vault') : Buffer.from(pwKey);
  let plain;
  try { plain = decryptBlob(key, blob); } catch { throw new Error('Wrong master password'); }
  const ctx = {
    key, salt, pwKey, bound: blob.bound || null,
    items: Array.isArray(plain) ? plain : plain.items, // older vaults stored just the item list
    security: Array.isArray(plain) ? null : plain.security || null,
    recovery: Array.isArray(plain) ? null : plain.recovery || null,
  };
  if (ctx.security) {
    pendingUnlock = { ...ctx, tries: 0, expires: Date.now() + PENDING_MS };
    return { needCode: true };
  }
  openVault(ctx);
  return { items: publicItems() };
});

// Lock to this Windows account. Needs a backup location first, so a reinstall can't strand the vault.
function defaultBackupPath() {
  const od = process.env.OneDrive || path.join(os.homedir(), 'OneDrive');
  return path.join(fs.existsSync(od) ? od : app.getPath('documents'), 'Deskmate vault backup.dmbak');
}
handleHost('vault:bindInfo', () => {
  requireUnlocked();
  return { bound: !!vaultBound, available: safeStorage.isEncryptionAvailable(), backupPath: settings.vaultBackupPath || null,
    backupAt: settings.vaultBackupAt || null, backupError: settings.vaultBackupError || null };
});
handleHost('vault:pickBackup', async () => {
  requireUnlocked();
  const prev = pinned; pinned = true;
  const r = await dialog.showSaveDialog(win, { title: 'Where should the vault backup go?', defaultPath: settings.vaultBackupPath || defaultBackupPath(),
    filters: [{ name: 'Deskmate vault backup', extensions: ['dmbak'] }] });
  pinned = prev; win.focus();
  return r.canceled ? null : r.filePath;
});
handleHost('vault:bind', (_e, backupPath) => {
  requireUnlocked();
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows encryption is not available on this account');
  if (!backupPath) throw new Error('Pick a backup location first');
  const device = crypto.randomBytes(32);
  const bound = safeStorage.encryptString(device.toString('hex')).toString('base64');
  if (unsealDevice(bound).compare(device) !== 0) throw new Error('Windows encryption check failed');
  if (!vaultRecovery) {
    const r = base32Encode(crypto.randomBytes(20)).toLowerCase();
    vaultRecovery = r.match(/.{4}/g).join('-');
  }
  writeBackup(backupPath); // backup first: if this fails, nothing has changed yet
  settings.vaultBackupPath = backupPath; settings.vaultBackupError = null;
  vaultBound = bound; vaultKey = mixKey(vaultPwKey, device, 'deskmate-vault');
  persistVault();
  return vaultRecovery;
});
handleHost('vault:recoveryKey', () => { requireUnlocked(); return vaultRecovery; });
handleHost('vault:backupNow', (_e, newPath) => {
  requireUnlocked();
  if (!vaultRecovery) throw new Error('Lock the vault to Windows first');
  if (newPath) settings.vaultBackupPath = newPath;
  writeBackup(settings.vaultBackupPath);
  settings.vaultBackupAt = Date.now(); settings.vaultBackupError = null; saveSettings();
  return settings.vaultBackupPath;
});

// Restore a backup onto this Windows account (after a reinstall or new PC). The old vault file, if any, is kept aside.
handleHost('vault:pickRestore', async () => {
  const prev = pinned; pinned = true;
  const r = await dialog.showOpenDialog(win, { title: 'Pick your Deskmate vault backup', defaultPath: settings.vaultBackupPath || defaultBackupPath(),
    filters: [{ name: 'Deskmate vault backup', extensions: ['dmbak'] }], properties: ['openFile'] });
  pinned = prev; win.focus();
  return r.canceled ? null : r.filePaths[0];
});
handleHost('vault:restore', (_e, file, pw, recovery) => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows encryption is not available on this account');
  let blob;
  try { blob = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new Error("Couldn't read that file"); }
  if (blob.kind !== 'deskmate-vault-backup') throw new Error("That isn't a Deskmate vault backup");
  const salt = Buffer.from(blob.salt, 'base64'), pwKey = deriveKey(pw, salt);
  let plain;
  try { plain = decryptBlob(mixKey(pwKey, Buffer.from(normRecovery(recovery || '')), 'deskmate-backup'), blob); }
  catch { throw new Error('Wrong master password or recovery key'); }
  lockVault();
  if (fs.existsSync(vaultPath)) fs.renameSync(vaultPath, vaultPath + '.replaced-' + Date.now());
  const device = crypto.randomBytes(32);
  openVault({ key: mixKey(pwKey, device, 'deskmate-vault'), salt, pwKey, bound: safeStorage.encryptString(device.toString('hex')).toString('base64'),
    items: plain.items, security: plain.security || null, recovery: plain.recovery });
  settings.vaultBackupPath = file; saveSettings();
  persistVault();
  lockVault(); // unlock normally afterwards (authenticator code still applies)
  return true;
});
handleHost('vault:lock', lockVault);
handleHost('vault:save', (_e, item) => {
  requireUnlocked();
  // totp: undefined/'' = keep, null = remove, string = secret or otpauth:// URI
  const totpIn = item.totp; delete item.totp;
  const totp = typeof totpIn === 'string' && totpIn.trim() ? parseTotp(totpIn) : undefined;
  const i = vaultItems.findIndex(x => x.id === item.id);
  if (i >= 0) {
    if (!item.password) item.password = vaultItems[i].password; // blank = keep existing
    vaultItems[i] = { ...vaultItems[i], ...item, updated: Date.now() };
    if (totp) vaultItems[i].totp = totp; else if (totpIn === null) delete vaultItems[i].totp;
  } else vaultItems.push({ ...item, ...(totp ? { totp } : {}), id: crypto.randomUUID(), updated: Date.now() });
  persistVault(); return publicItems();
});
handleHost('vault:delete', (_e, id) => { requireUnlocked(); vaultItems = vaultItems.filter(x => x.id !== id); persistVault(); return publicItems(); });
handleHost('vault:reveal', (_e, id) => { requireUnlocked(); return (vaultItems.find(x => x.id === id) || {}).password || ''; });
handleHost('vault:copy', async (_e, id, field) => {
  requireUnlocked();
  const item = vaultItems.find(x => x.id === id) || {};
  const v = field === 'totp' ? (item.totp ? totpCode(item.totp).code : '') : ['username', 'password'].includes(field) ? item[field] || '' : '';
  await clipboard.writeText(v);
  // Clipboard calls are async in Electron 44+; only clear if the user hasn't copied something else since.
  if (field !== 'username') setTimeout(async () => { if ((await clipboard.readText()) === v) clipboard.clear(); }, CLIP_CLEAR_MS);
  return true;
});
handleHost('vault:generate', () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+';
  return Array.from(crypto.randomBytes(20), b => chars[b % chars.length]).join('');
});

// ---------- 2-step unlock: master password + authenticator code ----------
// The authenticator secret lives inside the encrypted vault, so it's checked right after decrypting.
// Items aren't released to the window (and the vault doesn't count as unlocked) until the code checks out.
const PENDING_MS = 2 * 60e3, MAX_CODE_TRIES = 5;
let pendingUnlock = null, setupSecret = null;

function base32Encode(buf) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
const hashCode = (c) => crypto.createHash('sha256').update(c).digest('hex');
const normRecovery = (c) => c.toLowerCase().replace(/[^a-z0-9]/g, '');
// Returns the matching time step (allowing one step of clock drift), or -1. Never accepts a step at or before minCounter (no replays).
function totpMatch(t, code, minCounter = -1) {
  const now = Math.floor(Date.now() / 1000 / t.period);
  for (const c of [now, now - 1, now + 1]) {
    if (c <= minCounter) continue;
    const want = totpCode(t, c * t.period * 1000).code;
    if (want.length === code.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(code))) return c;
  }
  return -1;
}
// Checks a 6-digit code or a one-time backup code against a security record. Mutates it (replay guard, used backup code).
function checkSecondFactor(sec, input) {
  const digits = String(input || '').replace(/\s/g, '');
  if (/^\d{6}$/.test(digits)) {
    const c = totpMatch(sec.totp, digits, sec.lastCounter ?? -1);
    if (c < 0) return false;
    sec.lastCounter = c; return 'code';
  }
  const h = hashCode(normRecovery(String(input || '')));
  const i = sec.recovery.indexOf(h);
  if (i < 0) return false;
  sec.recovery.splice(i, 1); return 'recovery';
}

handleHost('vault:verify', (_e, input) => {
  if (!pendingUnlock || Date.now() > pendingUnlock.expires) { pendingUnlock = null; throw new Error('Took too long. Enter your master password again.'); }
  const p = pendingUnlock;
  const kind = checkSecondFactor(p.security, input);
  if (!kind) {
    if (++p.tries >= MAX_CODE_TRIES) { pendingUnlock = null; throw new Error('Too many wrong codes. Enter your master password again.'); }
    throw new Error(`Wrong code (${MAX_CODE_TRIES - p.tries} tries left)`);
  }
  pendingUnlock = null;
  openVault(p);
  persistVault(); // saves the replay guard / used backup code
  return { items: publicItems(), usedRecovery: kind === 'recovery', recoveryLeft: vaultSecurity.recovery.length };
});
handleHost('vault:security', () => {
  requireUnlocked();
  return { enabled: !!vaultSecurity, recoveryLeft: vaultSecurity ? vaultSecurity.recovery.length : 0 };
});
handleHost('vault:securityBegin', async () => {
  requireUnlocked();
  setupSecret = base32Encode(crypto.randomBytes(20));
  const uri = `otpauth://totp/Deskmate:Vault?secret=${setupSecret}&issuer=Deskmate&algorithm=SHA1&digits=6&period=30`;
  const qr = await require('qrcode').toDataURL(uri, { margin: 1, scale: 5, color: { dark: '#000000', light: '#ffffff' } });
  return { qr, secret: setupSecret.match(/.{1,4}/g).join(' ') };
});
handleHost('vault:securityConfirm', (_e, code) => {
  requireUnlocked();
  if (!setupSecret) throw new Error('Start setup again');
  const totp = { secret: setupSecret, digits: 6, period: 30, algorithm: 'sha1' };
  const c = totpMatch(totp, String(code || '').replace(/\s/g, ''));
  if (c < 0) throw new Error("That code doesn't match. Check your phone's clock and try the newest code.");
  const codes = Array.from({ length: 8 }, () => {
    const s = base32Encode(crypto.randomBytes(5)).toLowerCase();
    return s.slice(0, 4) + '-' + s.slice(4, 8);
  });
  vaultSecurity = { totp, recovery: codes.map((x) => hashCode(normRecovery(x))), lastCounter: c };
  setupSecret = null;
  persistVault();
  return codes;
});
handleHost('vault:securityDisable', (_e, input) => {
  requireUnlocked();
  if (!vaultSecurity) return true;
  const copy = JSON.parse(JSON.stringify(vaultSecurity));
  if (!checkSecondFactor(copy, input)) throw new Error('Wrong code');
  vaultSecurity = null; persistVault();
  return true;
});

// ---------- authenticator (TOTP, RFC 6238) ----------
function base32Decode(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = s.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, value = 0; const out = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error('That secret has characters a 2FA key never has');
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function parseTotp(input) {
  const s = input.trim();
  let t = { secret: s, digits: 6, period: 30, algorithm: 'sha1' };
  if (/^otpauth:\/\//i.test(s)) {
    const u = new URL(s);
    if (u.host.toLowerCase() !== 'totp') throw new Error('Only time-based (TOTP) codes are supported');
    const q = u.searchParams;
    t = {
      secret: q.get('secret') || '', digits: Number(q.get('digits')) || 6, period: Number(q.get('period')) || 30,
      algorithm: (q.get('algorithm') || 'SHA1').toLowerCase(),
      label: decodeURIComponent(u.pathname.slice(1)), issuer: q.get('issuer') || '',
    };
  }
  if (!['sha1', 'sha256', 'sha512'].includes(t.algorithm)) throw new Error('Unsupported 2FA algorithm');
  if (base32Decode(t.secret).length < 10) throw new Error("That doesn't look like a 2FA secret");
  t.secret = t.secret.toUpperCase().replace(/[\s=-]/g, '');
  return t;
}
function totpCode(t, now = Date.now()) {
  const counter = Math.floor(now / 1000 / t.period);
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac(t.algorithm, base32Decode(t.secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = (h.readUInt32BE(o) & 0x7fffffff) % 10 ** t.digits;
  return { code: String(n).padStart(t.digits, '0'), remaining: t.period - (Math.floor(now / 1000) % t.period), period: t.period };
}
// Live codes for the list. Deliberately doesn't count as activity, so an open Vault tab still auto-locks.
handleHost('vault:codes', () => {
  if (!vaultKey) return {};
  const out = {};
  for (const it of vaultItems) if (it.totp) { try { out[it.id] = totpCode(it.totp); } catch {} }
  return out;
});
// Read a QR code screenshot from the clipboard (Win+Shift+S, then "Paste QR").
async function clipboardImage() {
  for (const item of await clipboard.read()) {
    const type = (item.types || []).find((t) => t.startsWith('image/'));
    if (type) return nativeImage.createFromBuffer(Buffer.from(await (await item.getType(type)).arrayBuffer()));
  }
  return nativeImage.createEmpty();
}
handleHost('vault:qr', async () => {
  const img = await clipboardImage();
  if (img.isEmpty()) return { error: 'No image on the clipboard. Screenshot the QR code with Win+Shift+S first.' };
  const { width, height } = img.getSize();
  const bgra = img.toBitmap(), rgba = Buffer.alloc(bgra.length);
  for (let i = 0; i < bgra.length; i += 4) { rgba[i] = bgra[i + 2]; rgba[i + 1] = bgra[i + 1]; rgba[i + 2] = bgra[i]; rgba[i + 3] = 255; }
  const hit = require('jsqr')(new Uint8ClampedArray(rgba), width, height);
  if (!hit) return { error: "Couldn't find a QR code in that image" };
  if (!/^otpauth:\/\/totp/i.test(hit.data)) return { error: "That QR code isn't a 2FA setup code" };
  try { const t = parseTotp(hit.data); return { uri: hit.data, issuer: t.issuer, label: t.label }; }
  catch (e) { return { error: e.message }; }
});

// ---------- system media (YouTube Music in the browser, Spotify, ...) ----------
const { spawn } = require('child_process');
let mediaProc = null, mediaBuf = '';
const mediaWaiters = [];
function mediaBridge() {
  if (mediaProc) return mediaProc;
  mediaProc = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'media.ps1')], { windowsHide: true });
  mediaProc.on('error', () => {});
  mediaProc.stdin.on('error', () => {});
  mediaProc.stdout.setEncoding('utf8');
  mediaProc.stdout.on('data', (d) => {
    mediaBuf += d;
    let i;
    while ((i = mediaBuf.indexOf('\n')) >= 0) {
      const line = mediaBuf.slice(0, i).trim(); mediaBuf = mediaBuf.slice(i + 1);
      const w = mediaWaiters.shift();
      if (w) { try { w.resolve(JSON.parse(line)); } catch { w.resolve({ error: 'bad output' }); } }
    }
  });
  mediaProc.on('exit', () => { mediaProc = null; mediaBuf = ''; mediaWaiters.splice(0).forEach((w) => w.resolve({ error: 'bridge exited' })); });
  return mediaProc;
}
function mediaSend(line) {
  return new Promise((resolve) => {
    const p = mediaBridge();
    // A WinRT call can hang; restart the bridge so answers don't get matched to the wrong question.
    const timer = setTimeout(() => { if (mediaProc === p) p.kill(); }, 8000);
    mediaWaiters.push({ resolve: (v) => { clearTimeout(timer); resolve(v); } });
    p.stdin.write(line.replace(/[\r\n]/g, ' ') + '\n');
  });
}
async function mediaStatus() {
  const r = await mediaSend('status');
  return (r.sessions || []).filter((s) => s.app !== 'electron.exe' && !/deskmate/i.test(s.app));
}
async function mediaArt(appId) { return (await mediaSend('art ' + appId.replace(/\s/g, ''))).art || null; }
function mediaCmd(appId, action) {
  if (!/^(toggle|play|pause|next|prev|seek:\d+(\.\d+)?|vol:(0(\.\d+)?|1(\.0+)?|\.\d+))$/.test(action)) throw new Error('Unknown media action');
  return mediaSend(`cmd ${appId.replace(/\s/g, '')} ${action}`);
}
app.on('will-quit', () => { if (mediaProc) mediaProc.kill(); });

// ---------- music files (for plugins with the music-files permission) ----------
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus', '.webm']);
function scanAudio(root, dir = root, out = [], depth = 0) {
  if (depth > 6 || out.length > 5000) return out;
  let list; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of list) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) scanAudio(root, p, out, depth + 1);
    else if (AUDIO_EXT.has(path.extname(e.name).toLowerCase())) {
      const rel = path.relative(root, p).split(path.sep).map(encodeURIComponent).join('/');
      out.push({ name: path.parse(e.name).name, url: 'dmmedia://music/' + rel });
    }
  }
  return out;
}
async function pickMusicFolder() {
  const r = await withDialog(() => dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath: settings.musicFolder || app.getPath('music') }));
  if (r.canceled) return null;
  settings.musicFolder = r.filePaths[0]; saveSettings();
  return settings.musicFolder;
}
function musicTracks() { return settings.musicFolder ? scanAudio(settings.musicFolder) : []; }

// Old (pre-plugin) settings, handed once to the matching built-in plugin so nothing is lost in the move.
function legacySettings(id, builtin) {
  if (!builtin) return {};
  if (id === 'music') return { favorites: settings.favorites || [], volume: settings.volume, mediaApp: settings.mediaApp || null };
  if (id === 'claude') return { lastChecked: settings.lastChecked, watchId: settings.watchId || null, watchTitle: settings.watchTitle || null };
  return {};
}
