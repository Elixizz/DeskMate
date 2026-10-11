// Clipboard history for the "clipboard-history" permission. Text only, kept in memory (gone when DeskMate quits),
// and only while a Mate with the permission is running. Passwords copied from the Vault are never recorded.
const { clipboard } = require('electron');
const crypto = require('crypto');

const MAX = 50;
let entries = [], timer = null, last = null, listeners = new Set();
const skip = new Set(); // sha256 of texts that must not be recorded (vault copies)
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');

async function tick() {
  let text;
  try { text = await clipboard.readText(); } catch { return; }
  if (!text || text === last) return;
  last = text;
  if (skip.has(hash(text))) return;
  if (!text.trim()) return;
  const e = { id: crypto.randomBytes(6).toString('hex'), text: text.slice(0, 20000), time: Date.now() };
  entries = [e, ...entries.filter((x) => x.text !== e.text)].slice(0, MAX);
  for (const fn of listeners) fn(e);
}
function start() {
  if (timer) return;
  timer = setInterval(tick, 700);
  // don't record whatever was already on the clipboard
  clipboard.readText().then((t) => { if (last === null) last = t; }, () => {});
}
function stop(keep) { clearInterval(timer); timer = null; last = null; if (!keep) entries = []; } // keep: paused, not closed

module.exports = {
  start, stop,
  running: () => !!timer,
  list: () => entries,
  remove: (id) => { entries = entries.filter((e) => e.id !== id); },
  clear: () => { entries = []; },
  onEntry: (fn) => listeners.add(fn),
  // Called by the vault just before it copies a secret. Kept for 5 minutes, then forgotten.
  ignore: (text) => { const h = hash(String(text)); skip.add(h); setTimeout(() => skip.delete(h), 5 * 60e3); },
};
