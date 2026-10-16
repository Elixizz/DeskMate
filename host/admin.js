// Runs one Windows system command (reg.exe, taskkill.exe) as admin through Windows' UAC box, for the few things a
// normal program isn't allowed to do. DeskMate itself never runs elevated. One request at a time.
const { execFile } = require('child_process');

let elevate = true, busy = false; // tests turn elevate off to check commands without a UAC box
const CANCELED = 1223;            // Windows' "the user said No"

// Resolves with the command's exit code (CANCELED if the user said No in the UAC box).
async function runAsAdmin(exe, args) {
  if (!/^[a-z]+\.exe$/i.test(exe)) throw new Error('Not a Windows command');
  if (args.some((a) => /["\r\n]/.test(String(a)))) throw new Error('That name can\'t be changed from here');
  if (busy) throw new Error('Windows is already asking you to allow something');
  busy = true;
  try {
    const q = (a) => `'"${String(a).replace(/'/g, "''")}"'`; // PowerShell string holding a double-quoted argument
    const script = `try { $p = Start-Process -FilePath "$env:SystemRoot\\System32\\${exe}" -ArgumentList @(${args.map(q).join(',')}) ${elevate ? '-Verb RunAs ' : ''}-WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode } catch { exit ${CANCELED} }`;
    return await new Promise((ok) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 120e3 }, (err) => ok(err ? (typeof err.code === 'number' ? err.code : 1) : 0)));
  } finally { busy = false; }
}

module.exports = { runAsAdmin, CANCELED, _elevate: (on) => { elevate = on; } };
