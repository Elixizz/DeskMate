// Startup programs for the "processes" permission: the same list Windows Task Manager shows (Run keys and Startup
// folders), switched on and off the same way Task Manager does it (the StartupApproved keys), so both stay in sync.
// Programs installed for every user live under HKLM: changing one runs just that one reg.exe command as admin, so
// Windows shows its UAC box (the user clicks Yes) every time.
const { shell } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

let ROOT = 'Software\\Microsoft\\Windows\\CurrentVersion'; // tests point this somewhere harmless
const sources = () => {
  const approved = (hive, sub) => `${hive}\\${ROOT}\\Explorer\\StartupApproved\\${sub}`;
  return [
    { id: 'ur', scope: 'user', reg: `HKCU\\${ROOT}\\Run`, approved: approved('HKCU', 'Run') },
    { id: 'uf', scope: 'user', folder: path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs\\Startup'), approved: approved('HKCU', 'StartupFolder') },
    { id: 'mr', scope: 'machine', reg: `HKLM\\${ROOT}\\Run`, approved: approved('HKLM', 'Run'), admin: true },
    { id: 'm3', scope: 'machine', reg: `HKLM\\${ROOT.replace('Software\\', 'Software\\WOW6432Node\\')}\\Run`, approved: approved('HKLM', 'Run32'), admin: true },
    { id: 'mf', scope: 'machine', folder: path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs\\StartUp'), approved: approved('HKLM', 'StartupFolder'), admin: true },
  ];
};

const reg = (args) => new Promise((ok) => execFile('reg.exe', args, { windowsHide: true, timeout: 8000 }, (err, out) => ok(err ? null : String(out))));
// "    Name    REG_SZ    value" lines under one key (subkeys are skipped)
async function values(key) {
  const out = await reg(['query', key]);
  const vals = new Map();
  if (!out) return vals;
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^ {4}(.+?) {4}(REG_[A-Z_]+) {4}(.*)$/) || line.match(/^ {4}(.+?) {4}(REG_[A-Z_]+)$/);
    if (m) vals.set(m[1], { type: m[2], data: m[3] || '' });
  }
  return vals;
}
const expand = (s) => s.replace(/%([^%]+)%/g, (all, v) => process.env[v] ?? all);
// The program a Run command starts: a quoted path, or everything up to the first ".exe".
function target(cmd) {
  const c = expand(cmd.trim());
  if (c.startsWith('"')) return c.slice(1, c.indexOf('"', 1) > 0 ? c.indexOf('"', 1) : undefined);
  const m = c.match(/^(.+?\.exe)\b/i);
  return m ? m[1] : c.split(' ')[0];
}

async function list(iconFor) {
  const items = [];
  for (const src of sources()) {
    const approved = await values(src.approved);
    let entries = [];
    if (src.reg) entries = [...(await values(src.reg))].filter(([, v]) => /^REG_(EXPAND_)?SZ$/.test(v.type)).map(([name, v]) => ({ name, label: name, command: v.data, file: target(v.data) }));
    else if (fs.existsSync(src.folder)) {
      entries = fs.readdirSync(src.folder).filter((f) => !/^desktop\.ini$/i.test(f)).map((f) => {
        const full = path.join(src.folder, f);
        let file = full;
        if (/\.lnk$/i.test(f)) { try { file = shell.readShortcutLink(full).target || full; } catch {} }
        return { name: f, label: f.replace(/\.(lnk|url|exe|bat|cmd)$/i, ''), command: full, file };
      });
    }
    for (const e of entries) {
      const a = approved.get(e.name);
      // first byte even (02, 06) = on, odd (03, 07) = switched off
      const enabled = !a || a.type !== 'REG_BINARY' || !(parseInt(a.data.slice(0, 2), 16) & 1);
      items.push({ key: `${src.id}:${e.name}`, name: e.label, command: e.command, enabled, scope: src.scope, canChange: true, admin: !!src.admin, icon: iconFor ? await iconFor(e.file) : null });
    }
  }
  return items;
}

// Run one reg.exe command as admin through Windows' UAC box. Resolves with reg's exit code; 1223 = the user said No.
let elevate = true, elevating = false; // tests turn elevate off to check the command without a UAC box
function regAsAdmin(args) {
  if (args.some((a) => /["\r\n]/.test(a))) return Promise.reject(new Error('That name can\'t be changed from here'));
  const q = (a) => `'"${a.replace(/'/g, "''")}"'`; // PowerShell string holding a double-quoted argument
  const script = `try { $p = Start-Process -FilePath "$env:SystemRoot\\System32\\reg.exe" -ArgumentList @(${args.map(q).join(',')}) ${elevate ? '-Verb RunAs ' : ''}-WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode } catch { exit 1223 }`;
  return new Promise((ok) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { windowsHide: true, timeout: 120e3 }, (err) => ok(err ? (typeof err.code === 'number' ? err.code : 1) : 0)));
}

async function set(key, enabled) {
  const i = String(key).indexOf(':');
  const src = sources().find((s) => s.id === key.slice(0, i)), name = key.slice(i + 1);
  if (!src || !name || (src.folder && /[\\/]|\.\./.test(name))) throw new Error('Unknown startup program');
  const exists = src.reg ? (await values(src.reg)).has(name) : fs.existsSync(path.join(src.folder, name));
  if (!exists) throw new Error('That startup program is gone');
  const args = ['add', src.approved, '/v', name, '/t', 'REG_BINARY', '/d', (enabled ? '02' : '03') + '0'.repeat(22), '/f'];
  if (!src.admin) {
    if (await reg(args) == null) throw new Error('Windows wouldn\'t save that change');
    return true;
  }
  if (elevating) throw new Error('Windows is already asking you about another change');
  elevating = true;
  let code;
  try { code = await regAsAdmin(args); } finally { elevating = false; }
  if (code === 1223) throw new Error('Not changed: Windows needs you to click Yes to allow it');
  // check it really changed rather than trusting the exit code
  const a = (await values(src.approved)).get(name);
  const on = !a || a.type !== 'REG_BINARY' || !(parseInt(a.data.slice(0, 2), 16) & 1);
  if (on !== enabled) throw new Error('Windows wouldn\'t save that change');
  return true;
}

module.exports = { list, set, _root: (r) => { ROOT = r; }, _elevate: (on) => { elevate = on; }, _regAsAdmin: regAsAdmin };
