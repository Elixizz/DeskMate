// Running programs for the "processes" permission. bin/dm-procs.exe (tools/procs-helper) lists every process in a
// few milliseconds; here they're grouped the way Task Manager does (one row per program, all its processes together)
// and split into your open apps, your background programs, and everything else (Windows services, other users).
// Ending is a force-end (TerminateProcess) and only happens after the plugin host has asked you.
const { app } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const HELPER = path.join(__dirname, 'bin', 'dm-procs.exe');
// Ending any of these would crash or lock up Windows, so they can't be ended from a Mate.
const PROTECTED = new Set(['system', 'registry', 'secure system', 'memory compression', 'smss', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'lsaiso', 'svchost', 'fontdrvhost', 'dwm', 'sihost', 'ctfmon', 'audiodg', 'spoolsv', 'taskhostw', 'runtimebroker', 'searchhost', 'startmenuexperiencehost', 'shellexperiencehost', 'textinputhost', 'lockapp', 'logonui', 'userinit', 'dm-procs']);

let child = null, buf = '', pending = null, idleTimer = null;
let prev = new Map(), prevT = 0, groups = new Map();
const iconCache = new Map();

function ensure() {
  if (child) return;
  const c = child = spawn(HELPER, [], { windowsHide: true });
  c.stdout.setEncoding('utf8');
  c.stdout.on('data', (d) => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      const p = pending; pending = null;
      if (!p) continue;
      try { const j = JSON.parse(line); j.error ? p.reject(new Error(j.error)) : p.resolve(j); } catch (e) { p.reject(e); }
    }
  });
  const gone = () => { if (child === c) { child = null; buf = ''; } if (pending) { pending.reject(new Error('The process list stopped')); pending = null; } };
  c.on('error', gone); c.on('exit', gone);
  c.stdin.on('error', () => {});
}
function stop() { if (child) { child.kill(); child = null; } buf = ''; prev = new Map(); prevT = 0; }

// One snapshot at a time; callers that arrive while one is running share it.
function snapshot() {
  ensure();
  clearTimeout(idleTimer); idleTimer = setTimeout(stop, 30e3);
  if (pending) return pending.promise;
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  pending = { resolve, reject, promise };
  const timer = setTimeout(() => { if (pending?.promise === promise) { pending = null; stop(); reject(new Error('The process list took too long')); } }, 6000);
  promise.finally(() => clearTimeout(timer)).catch(() => {});
  child.stdin.write('list\n');
  return promise;
}

function ownPids() {
  const s = new Set([process.pid]);
  try { for (const m of app.getAppMetrics()) s.add(m.pid); } catch {}
  if (child) s.add(child.pid);
  return s;
}

async function list() {
  const snap = await snapshot();
  const cores = os.cpus().length, dt = prevT ? snap.t - prevT : 0, mine = ownPids();
  // two lists a moment apart (end() refreshes first) would give wild CPU numbers, so keep the last ones instead
  const quick = dt > 0 && dt < 500, lastCpu = new Map([...groups.values()].map((g) => [g.key, g.cpu]));
  const exe = process.execPath.toLowerCase();
  const next = new Map(), out = new Map();
  for (const p of snap.procs) {
    next.set(p.p, p.c);
    if (p.p === 4) continue; // "System" is the kernel itself
    const before = prev.get(p.p);
    const cpu = quick ? 0 : dt > 0 && before >= 0 && p.c >= 0 ? Math.max(0, (p.c - before) / (dt * cores)) * 100 : 0;
    const own = p.s === snap.me;
    const id = (p.f || p.n).toLowerCase();
    const key = (own ? 'u:' : `o${p.s}:`) + id;
    let g = out.get(key);
    if (!g) out.set(key, g = { key, name: p.d || p.n, exe: p.n, path: p.f || null, title: null, cpu: 0, memMB: 0, count: 0, pids: [], own, window: false, protected: false });
    g.count++; g.pids.push(p.p); g.cpu += cpu;
    if (p.m > 0) g.memMB += p.m / 1048576;
    if (p.w && !g.title) { g.title = p.w; g.window = true; }
    if (PROTECTED.has(p.n.toLowerCase()) || mine.has(p.p) || (p.f && p.f.toLowerCase() === exe)) g.protected = true;
  }
  if (quick) for (const g of out.values()) g.cpu = lastCpu.get(g.key) || 0;
  else { prev = next; prevT = snap.t; }
  groups = out;
  return {
    cores,
    groups: [...out.values()].map((g) => ({
      key: g.key, name: g.name, exe: g.exe, title: g.title, cpu: Math.round(g.cpu * 10) / 10, memMB: Math.round(g.memMB), count: g.count,
      level: g.own ? (g.window ? 'app' : 'background') : 'other', protected: g.protected, canRestart: !!g.path && g.own && !g.protected,
    })),
  };
}

const info = (key) => { const g = groups.get(key); return g && { name: g.name, count: g.count, protected: g.protected }; };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// Force-end every process of a program. Programs running as admin or another user need admin rights to end.
async function end(key) {
  await list(); // fresh pids: the program may have started or closed processes since the Mate's last look
  const g = groups.get(key);
  if (!g) throw new Error('That program has already closed');
  if (g.protected) throw new Error(`${g.name} is part of Windows or DeskMate and can't be ended here`);
  let ended = 0, denied = 0;
  for (const pid of g.pids) {
    try { process.kill(pid); ended++; } catch (e) { if (e.code === 'ESRCH') ended++; else denied++; }
  }
  if (!ended && denied) throw new Error(`Windows needs admin rights to end ${g.name}`);
  return { ended, denied, name: g.name, path: g.path, pids: g.pids };
}

async function restart(key) {
  const g0 = groups.get(key);
  if (!g0?.path || !g0.own) throw new Error('This program can\'t be restarted from here');
  const r = await end(key);
  for (let i = 0; i < 40 && r.pids.some(alive); i++) await new Promise((ok) => setTimeout(ok, 100));
  // Windows brings Explorer back by itself; only start it if it didn't.
  if (/\\explorer\.exe$/i.test(r.path)) {
    await new Promise((ok) => setTimeout(ok, 2500));
    const snap = await snapshot();
    if (snap.procs.some((p) => p.n.toLowerCase() === 'explorer' && p.s === snap.me)) return { ...r, restarted: true };
  }
  if (!fs.existsSync(r.path)) throw new Error(`Ended ${r.name}, but couldn't find it to start it again`);
  await new Promise((ok, fail) => {
    const c = spawn(r.path, [], { detached: true, stdio: 'ignore', cwd: path.dirname(r.path) });
    c.once('error', () => fail(new Error(`Ended ${r.name}, but Windows wouldn't start it again`)));
    c.once('spawn', () => { c.unref(); ok(); });
  });
  return { ...r, restarted: true };
}

async function iconFor(file) {
  if (!file) return null;
  const k = file.toLowerCase();
  if (iconCache.has(k)) return iconCache.get(k);
  let url = null;
  try { const img = await app.getFileIcon(file, { size: 'normal' }); url = img.isEmpty() ? null : img.toDataURL(); } catch {}
  if (iconCache.size > 400) iconCache.clear();
  iconCache.set(k, url);
  return url;
}
async function icons(keys) {
  const out = {};
  for (const k of keys) { const g = groups.get(k); if (g?.path) out[k] = await iconFor(g.path); }
  return out;
}

module.exports = { list, info, end, restart, icons, iconFor, stop };
