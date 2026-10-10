// Runs inside every plugin view (sandboxed, no Node). Exposes window.deskmate; the host checks permissions on every call.
const { contextBridge, ipcRenderer } = require('electron');

const call = async (method, ...args) => {
  try { return await ipcRenderer.invoke('plugin:call', method, ...args); }
  catch (e) { throw new Error(String(e.message).replace(/^.*?Error: /, '')); }
};
const listeners = {};
ipcRenderer.on('deskmate:event', (_e, channel, ...args) => (listeners[channel] || []).forEach((fn) => { try { fn(...args); } catch (err) { console.error(err); } }));
const on = (channel) => (fn) => { (listeners[channel] ||= []).push(fn); };

contextBridge.exposeInMainWorld('deskmate', {
  info: () => call('info'),
  hide: () => call('hide'),
  toast: (text) => call('toast', text),
  setBadge: (n) => call('setBadge', n),
  // Talk between this plugin's own tab and bar.
  send: (msg) => call('send', msg),
  onMessage: on('message'),
  onHotkey: on('hotkey'),
  onShown: on('shown'),
  onHidden: on('hidden'),
  notify: (title, body) => call('notify', title, body),
  openUrl: (url) => call('openUrl', url),
  copyText: (text) => call('copyText', text),
  status: { set: (s) => call('status.set', s) },
  // Plain-http media (most radio streams) can't load in a secure page; route it through the host.
  mediaUrl: (url) => (/^http:\/\//i.test(url) ? 'dmnet://p/' + encodeURIComponent(url) : url),
  media: {
    sessions: () => call('media.sessions'),
    art: (app) => call('media.art', app),
    command: (app, action) => call('media.command', app, action),
  },
  music: {
    pickFolder: () => call('music.pickFolder'),
    folder: () => call('music.folder'),
    tracks: () => call('music.tracks'),
  },
  claude: {
    activity: (since) => call('claude.activity', since),
    state: (sessionId) => call('claude.state', sessionId),
    reply: (sessionId, text) => call('claude.reply', sessionId, text),
    revealFile: (p) => call('claude.revealFile', p),
  },
  gmail: {
    status: () => call('gmail.status'),
    connect: () => call('gmail.connect'),
    disconnect: () => call('gmail.disconnect'),
    inbox: (max) => call('gmail.inbox', max),
  },
  legacy: () => call('legacy'),
});
