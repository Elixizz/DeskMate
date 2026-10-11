// Settings tab: theme, sounds, shortcut and startup, vault timers, updates. Runs after renderer.js and uses its helpers.

// ---------- sounds (played here so they work while the panel is hidden) ----------
let actx = null;
function playSynth(id, volume) {
  try {
    actx ||= new AudioContext();
    if (actx.state === 'suspended') actx.resume();
    const t0 = actx.currentTime + 0.03;
    const out = actx.createGain();
    out.gain.value = Math.max(0, Math.min(1, volume));
    out.connect(actx.destination);
    const note = (freq, at, dur, type = 'sine', peak = 0.5) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(out);
      o.start(t0 + at); o.stop(t0 + at + dur + 0.05);
    };
    const SOUNDS = {
      chime: () => { note(880, 0, 0.6); note(1318.5, 0.15, 0.9); },
      bell: () => [1, 2.76, 5.4].forEach((m, i) => note(523.25 * m, 0, 1.6 / (i + 1), 'sine', 0.4 / (i + 1))),
      ping: () => note(1760, 0, 0.35, 'sine', 0.4),
      pop: () => note(420, 0, 0.12, 'triangle', 0.6),
      alarm: () => { for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++) note(988, r * 0.9 + i * 0.18, 0.12, 'square', 0.16); },
      soft: () => { note(523.25, 0, 0.8, 'triangle', 0.3); note(659.25, 0.2, 0.9, 'triangle', 0.25); },
    };
    (SOUNDS[id] || SOUNDS.chime)();
  } catch {}
}
api.on('host:sound', ({ id, volume }) => playSynth(id, volume));

// ---------- the tab ----------
const SOUND_NAMES = { chime: 'Chime', bell: 'Bell', ping: 'Ping', pop: 'Pop', alarm: 'Alarm', soft: 'Soft', none: 'No sound' };
let prefs = null;
const seg = (name, opts, cur) => `<div class="seg">${opts.map(([v, t]) => `<button class="segbtn${v === cur ? ' active' : ''}" data-set="${name}" data-v="${v}">${t}</button>`).join('')}</div>`;
const toggle = (name, on, label, hint) => `<label class="srow toggle"><span class="grow">${label}${hint ? `<span class="muted small">${hint}</span>` : ''}</span><input type="checkbox" data-set="${name}"${on ? ' checked' : ''}><i></i></label>`;
const pick = (name, opts, cur) => `<select data-set="${name}">${opts.map(([v, t]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${t}</option>`).join('')}</select>`;

async function renderSettings() {
  prefs = await api.prefs.get();
  const p = prefs, t = p.theme;
  const withSounds = pluginList.filter((x) => x.sounds && Object.keys(x.sounds).length);
  const soundOpts = p.soundIds.map((id) => [id, SOUND_NAMES[id] || id]);
  $('#settingsBody').innerHTML = `
    <div class="card sect"><div class="stitle">Appearance</div>
      <div class="srow"><span class="grow">Theme</span>${seg('mode', [['dark', 'Dark'], ['light', 'Light'], ['system', 'Auto']], t.mode).replace('data-v="system"', 'data-v="system" title="Match Windows light or dark mode"')}</div>
      <div class="srow"><span class="grow">Accent color</span>
        <span class="swatches">${p.accents.map((c) => `<button class="swatch${c === t.accent ? ' on' : ''}" data-accent="${c}" style="background:${c}" title="${c}"></button>`).join('')}
        <label class="swatch custom${p.accents.includes(t.accent) ? '' : ' on'}" title="Pick any color" style="background:${p.accents.includes(t.accent) ? 'transparent' : t.accent}">+<input type="color" id="accentPick" value="${t.accent}"></label></span></div>
      <div class="srow"><span class="grow">Panel size</span>${seg('size', [['compact', 'Small'], ['normal', 'Normal'], ['large', 'Large']], p.size)}</div>
      <div class="srow"><span class="grow">See-through <span class="muted small" id="opVal">${Math.round((1 - p.opacity) * 100)}%</span></span>
        <input type="range" min="0" max="40" step="5" value="${Math.round((1 - p.opacity) * 100)}" data-set="opacity"></div>
    </div>

    <div class="card sect"><div class="stitle">Sounds</div>
      <div class="srow"><span class="grow">Volume</span><input type="range" min="0" max="100" step="5" value="${Math.round(p.sound.volume * 100)}" data-set="volume"><button class="icon" data-test="chime" title="Test">&#x25B8;</button></div>
      ${toggle('muted', p.sound.muted, 'Mute all add-on sounds')}
      ${toggle('notifSound', p.sound.notifSound, 'Windows notification sound', 'The ding Windows plays with add-on pop-ups')}
      ${withSounds.length ? withSounds.map((x) => `<div class="ssub">${esc(x.name)}</div>` + Object.entries(x.sounds).map(([k, s]) => {
        const key = `${x.id}:${k}`, cur = p.sound.map[key] || s.default;
        return `<div class="srow"><span class="grow small">${esc(s.label)}</span>${pick('sound:' + key, soundOpts, cur)}<button class="icon" data-test-key="${esc(key)}" title="Test">&#x25B8;</button></div>`;
      }).join('')).join('') : '<div class="muted small">Add-ons that make sounds (like Timers) list them here, so you can pick a sound for each one.</div>'}
    </div>

    <div class="card sect"><div class="stitle">Shortcut and startup</div>
      <div class="srow"><span class="grow">Open DeskMate</span><button class="ghost" id="hotkeyBtn">${esc(p.hotkey)}</button></div>
      <div class="err small" id="hotkeyErr"></div>
      ${toggle('startup', p.startup, 'Start with Windows')}
      ${toggle('mini', p.mini, 'Status dots when hidden', 'A small pill in the corner shows add-on status')}
    </div>

    <div class="card sect"><div class="stitle">Vault</div>
      <div class="srow"><span class="grow">Lock after</span>${pick('autoLockMin', [1, 2, 5, 10, 15, 30, 60].map((m) => [m, `${m} min idle`]), p.autoLockMin)}</div>
      <div class="srow"><span class="grow">Clear copied passwords after</span>${pick('clipClearSec', [10, 20, 30, 60].map((s) => [s, `${s} sec`]), p.clipClearSec)}</div>
    </div>

    <div class="card sect"><div class="stitle">Updates</div>
      <div class="srow"><span class="grow">DeskMate ${esc(p.version)}</span><button class="ghost" id="checkUpd">Check now</button></div>
      <div class="muted small" id="updMsg"></div>
      <button id="dlNow" class="hidden">Download now</button>
      ${toggle('autoUpdatePlugins', p.autoUpdatePlugins, 'Update add-ons automatically', "Updates that ask for new permissions always wait for you")}
    </div>
    <div class="muted small" style="text-align:center">DeskMate by Lapis Studios</div>`;
}

const save = async (patch) => { try { prefs = await api.prefs.set(patch); } catch (e) { toast(errText(e)); } };
const body = () => $('#settingsBody');

body().addEventListener('click', async (e) => {
  const sb = e.target.closest('.segbtn[data-set]');
  if (sb) {
    sb.parentElement.querySelectorAll('.segbtn').forEach((b) => b.classList.toggle('active', b === sb));
    if (sb.dataset.set === 'mode') save({ theme: { mode: sb.dataset.v } });
    if (sb.dataset.set === 'size') save({ size: sb.dataset.v });
    return;
  }
  const sw = e.target.closest('[data-accent]');
  if (sw) { await save({ theme: { accent: sw.dataset.accent } }); return renderSettings(); }
  const tb = e.target.closest('[data-test]');
  if (tb) return api.prefs.testSound(tb.dataset.test);
  const tk = e.target.closest('[data-test-key]');
  if (tk) return api.prefs.testSound(body().querySelector(`select[data-set="sound:${tk.dataset.testKey}"]`).value);
  if (e.target.id === 'checkUpd') {
    e.target.disabled = true; $('#updMsg').textContent = 'Checking...';
    const r = await api.prefs.checkUpdates();
    const a = r.app.error ? `Couldn't reach the update server` : r.app.available ? `DeskMate ${r.app.latest} is available` : 'DeskMate is up to date';
    const pl = r.plugins.error ? '' : r.plugins.updated.length ? ` Updated ${r.plugins.updated.join(', ')}.` : r.plugins.waiting.length ? ' Some add-on updates need your OK in Plugins.' : ' Add-ons are up to date.';
    $('#updMsg').textContent = a + '.' + pl;
    const dl = $('#dlNow');
    dl.classList.toggle('hidden', !(r.app.available && r.app.canInstall));
    dl.textContent = `Download ${r.app.latest || ''} now`;
    e.target.disabled = false;
    refreshPlugins();
  }
  if (e.target.id === 'hotkeyBtn') recordHotkey(e.target);
  if (e.target.id === 'dlNow') {
    const b = e.target;
    b.disabled = true; b.textContent = 'Downloading...';
    $('#updMsg').textContent = 'DeskMate will close, install the update and reopen by itself.';
    try { await api.update.install(); b.textContent = 'Restarting...'; }
    catch (err) { $('#updMsg').textContent = errText(err); b.disabled = false; b.textContent = 'Download now'; }
  }
});

body().addEventListener('change', (e) => {
  const el = e.target, k = el.dataset.set;
  if (el.id === 'accentPick') return save({ theme: { accent: el.value } }).then(renderSettings);
  if (!k) return;
  if (k.startsWith('sound:')) return save({ sound: { set: { key: k.slice(6), value: el.value } } }).then(() => api.prefs.testSound(el.value));
  if (['muted', 'notifSound'].includes(k)) return save({ sound: { [k]: el.checked } });
  if (['startup', 'mini', 'autoUpdatePlugins'].includes(k)) return save({ [k]: el.checked });
  if (['autoLockMin', 'clipClearSec'].includes(k)) return save({ [k]: Number(el.value) });
  if (k === 'volume') return save({ sound: { volume: el.value / 100 } }).then(() => api.prefs.testSound('ping'));
});
body().addEventListener('input', (e) => {
  if (e.target.dataset.set === 'opacity') {
    $('#opVal').textContent = e.target.value + '%';
    save({ opacity: 1 - e.target.value / 100 });
  }
});

// Press the new shortcut while the button is waiting. Esc cancels.
function recordHotkey(btn) {
  if (btn.dataset.rec) return; // already waiting for keys
  btn.dataset.rec = '1';
  const before = btn.textContent;
  btn.textContent = 'Press keys... (Esc cancels)';
  $('#hotkeyErr').textContent = '';
  const onKey = async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Escape') return done(before);
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
    const mods = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
    const c = e.code;
    const key = /^Key[A-Z]$/.test(c) ? c.slice(3) : /^Digit\d$/.test(c) ? c.slice(5) : /^F([1-9]|1[0-2])$/.test(c) ? c
      : { Space: 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown' }[c];
    if (!key) { $('#hotkeyErr').textContent = "That key can't be used. Try a letter, number, F-key or Space."; return; }
    try { const k = await api.prefs.hotkey([...mods, key].join('+')); done(k); toast(`Open DeskMate with ${k}`); $('#hotkeyHint').textContent = k; }
    catch (err) { $('#hotkeyErr').textContent = errText(err); done(before); }
  };
  const done = (text) => { btn.textContent = text; delete btn.dataset.rec; window.removeEventListener('keydown', onKey, true); };
  window.addEventListener('keydown', onKey, true);
}
