// Checks deskmate.lapistudios.com for a newer DeskMate. The site's update.json names the installer and its sha256;
// the installer is only run if the download matches that checksum.
const { app, net, Notification } = require('electron');
const path = require('path'), fs = require('fs'), crypto = require('crypto'), { spawn } = require('child_process');

const UPDATE_URL = 'https://deskmate.lapistudios.com/update.json';
const ALLOWED_HOSTS = ['deskmate.lapistudios.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'];

// 1.10.0 > 1.9.3; anything non-numeric counts as 0
function newer(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0), pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

let latest = null;   // { version, download, sha256, notes }
let busy = false;

async function check() {
  const res = await net.fetch(UPDATE_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Update check failed (${res.status})`);
  const u = await res.json();
  const ok = typeof u.version === 'string' && /^[0-9a-f]{64}$/i.test(u.sha256 || '') && (() => {
    try { const x = new URL(u.download); return x.protocol === 'https:' && ALLOWED_HOSTS.includes(x.hostname); } catch { return false; }
  })();
  latest = ok ? { version: u.version, download: u.download, sha256: u.sha256.toLowerCase(), notes: String(u.notes || '').slice(0, 400) } : null;
  return status();
}

function status() {
  const current = app.getVersion();
  return { current, latest: latest?.version || null, notes: latest?.notes || '', available: !!latest && newer(latest.version, current), canInstall: app.isPackaged, busy };
}

// Downloads the installer, checks it, starts it and quits so it can replace the app. The installer reopens DeskMate.
async function install() {
  if (!latest || !newer(latest.version, app.getVersion())) throw new Error('No update available');
  if (!app.isPackaged) throw new Error('This is a development copy. Pull the new code instead');
  if (busy) throw new Error('Already updating');
  busy = true;
  try {
    const res = await net.fetch(latest.download, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (crypto.createHash('sha256').update(buf).digest('hex') !== latest.sha256) throw new Error('The download was changed or corrupted (checksum mismatch). Not installing.');
    const file = path.join(app.getPath('temp'), `DeskMate-Setup-${latest.version.replace(/[^0-9.]/g, '')}.exe`);
    fs.writeFileSync(file, buf);
    spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => { app.isQuitting = true; app.quit(); }, 500);
    return true;
  } finally { busy = false; }
}

// Startup check after a short wait, then every 6 hours. Tells the user once per new version.
function start({ onChange, settings, saveSettings }) {
  const run = async () => {
    try {
      const s = await check();
      onChange(s);
      if (s.available && settings.updateNotified !== s.latest) {
        settings.updateNotified = s.latest; saveSettings();
        new Notification({ title: `DeskMate ${s.latest} is available`, body: 'Open DeskMate and go to Plugins to update.' }).show();
      }
    } catch {}
  };
  setTimeout(run, 15e3);
  setInterval(run, 6 * 3600e3);
}

module.exports = { start, check, status, install, newer };
