// Tiny shared engine for the Arcade games: a fixed-size logical canvas scaled to fit, input, sound, saves and a
// game loop that only runs while the game is on screen.
const GAMES = {};
const $ = (s) => document.querySelector(s);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));

const Arcade = {
  game: null, W: 360, H: 360, scale: 1, running: false, paused: false, last: 0,
  keys: new Set(), pressed: new Set(),
  mouse: { x: 0, y: 0, down: false, right: false, clicked: false, rclicked: false },
  muted: false,

  // ---------- saves ----------
  load(k, d) { try { return JSON.parse(localStorage.getItem('arcade:' + k)) ?? d; } catch { return d; } },
  save(k, v) { try { localStorage.setItem('arcade:' + k, JSON.stringify(v)); } catch {} },
  best(id, score, lowerIsBetter) {
    const b = this.load('best:' + id, null);
    if (score == null) return b;
    if (b == null || (lowerIsBetter ? score < b : score > b)) { this.save('best:' + id, score); return score; }
    return b;
  },

  // ---------- canvas ----------
  fit() {
    const st = $('#stage'), g = this.game; if (!g || g.dom) return;
    this.W = g.W || 360; this.H = g.H || 360;
    const s = Math.min(st.clientWidth / this.W, st.clientHeight / this.H);
    this.scale = s;
    const dpr = window.devicePixelRatio || 1, cv = $('#cv');
    cv.style.width = this.W * s + 'px'; cv.style.height = this.H * s + 'px';
    cv.width = Math.round(this.W * s * dpr); cv.height = Math.round(this.H * s * dpr);
    this.ctx = cv.getContext('2d');
    this.ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
  },
  pt(e) { const r = $('#cv').getBoundingClientRect(); return { x: (e.clientX - r.left) / this.scale, y: (e.clientY - r.top) / this.scale }; },

  // ---------- loop ----------
  start(id) {
    this.stop();
    this.game = GAMES[id];
    // games built from page elements (menus, lists) get a div instead of the canvas
    $('#cv').classList.toggle('hidden', !!this.game.dom);
    $('#dom').classList.toggle('hidden', !this.game.dom);
    $('#dom').innerHTML = '';
    this.dom = $('#dom');
    $('#gname').textContent = this.game.name;
    $('#help').textContent = this.game.help || '';
    this.hud('');
    this.hideOverlay();
    this.fit();
    this.keys.clear(); this.pressed.clear();
    this.paused = false;
    this.game.start(this);
    this.resume();
    $('#cv').focus();
  },
  stop() {
    this.running = false;
    if (this.game?.stop) this.game.stop(this);
    this.game = null;
  },
  resume() {
    if (!this.game || this.running || document.hidden) return;
    this.running = true; this.last = performance.now();
    const frame = (t) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
      if (!this.paused) this.game.update(dt, this);
      this.game.draw(this.ctx, this);
      this.pressed.clear(); this.mouse.clicked = false; this.mouse.rclicked = false;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  },
  halt() { this.running = false; this.game?.onHide?.(this); },
  togglePause(force) {
    if (!this.game || this.game.noPause || (this.game.canPause && !this.game.canPause())) return;
    this.paused = force ?? !this.paused;
    if (this.paused) this.overlay('Paused', 'Press P or click to keep playing.', [['Resume', () => this.togglePause(false)]]);
    else this.hideOverlay();
  },

  // ---------- ui ----------
  hud(t) { $('#hud').textContent = t; },
  overlay(big, sub, buttons = []) {
    const o = $('#overlay');
    o.classList.remove('screen');
    o.innerHTML = `<div class="big">${big}</div>${sub ? `<div class="sub">${sub}</div>` : ''}<div class="row"></div>`;
    for (const [label, fn, ghost] of buttons) {
      const b = document.createElement('button'); b.textContent = label; if (ghost) b.className = 'ghost';
      b.onclick = (e) => { e.stopPropagation(); fn(); $('#cv').focus(); };
      o.querySelector('.row').appendChild(b);
    }
    o.classList.remove('hidden');
  },
  hideOverlay() { $('#overlay').classList.add('hidden'); $('#overlay').classList.remove('screen'); },
  // A full scrollable menu over the game (map pickers, shops). The game wires up its own buttons.
  screen(html) {
    const o = $('#overlay');
    o.innerHTML = html; o.classList.add('screen'); o.classList.remove('hidden');
    return o;
  },
  // Where a point on the canvas is, in the Mate page's pixels (for effects drawn outside the panel).
  toPage(x, y) { const r = $('#cv').getBoundingClientRect(); return { x: r.left + x * this.scale, y: r.top + y * this.scale }; },
  key(...codes) { return codes.some((c) => this.keys.has(c)); },
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); },

  // ---------- sound (made on the fly with Web Audio, no files) ----------
  actx: null,
  tone(freq, dur, type = 'square', vol = 0.12, slide = 0, delay = 0) {
    if (this.muted) return;
    try {
      this.actx ||= new AudioContext();
      const a = this.actx, t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch {}
  },
  noise(dur, vol = 0.12, delay = 0) {
    if (this.muted) return;
    try {
      this.actx ||= new AudioContext();
      const a = this.actx, n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = a.createBufferSource(), g = a.createGain(); s.buffer = buf; g.gain.value = vol;
      s.connect(g).connect(a.destination); s.start(a.currentTime + delay);
    } catch {}
  },
  sfx(name) {
    const S = {
      click: () => this.tone(660, 0.05, 'square', 0.06),
      coin: () => { this.tone(988, 0.07, 'square', 0.08); this.tone(1319, 0.12, 'square', 0.08, 0, 0.06); },
      buy: () => { this.tone(523, 0.08, 'triangle', 0.12); this.tone(784, 0.14, 'triangle', 0.12, 0, 0.07); },
      jump: () => this.tone(330, 0.15, 'square', 0.07, 330),
      land: () => this.tone(140, 0.05, 'triangle', 0.08),
      hit: () => { this.noise(0.08, 0.15); this.tone(180, 0.08, 'square', 0.08, -80); },
      hurt: () => { this.tone(220, 0.25, 'sawtooth', 0.1, -150); },
      swing: () => this.noise(0.06, 0.06),
      block: () => { this.tone(1200, 0.05, 'square', 0.06); this.tone(900, 0.08, 'triangle', 0.06, 0, 0.03); },
      parry: () => { this.tone(1568, 0.12, 'triangle', 0.12); this.tone(2093, 0.18, 'triangle', 0.1, 0, 0.06); },
      shoot: () => this.tone(880, 0.04, 'square', 0.04, -300),
      boom: () => this.noise(0.25, 0.18),
      win: () => [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.12, 0, i * 0.1)),
      lose: () => [392, 330, 262].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.12, 0, i * 0.15)),
    };
    S[name]?.();
  },
};

// ---------- input ----------
const GAME_KEYS = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
window.addEventListener('keydown', (e) => {
  if (!Arcade.game || e.target.tagName === 'INPUT') return;
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  if (e.code === 'Escape' && !Arcade.paused && Arcade.game.onEscape?.()) { e.preventDefault(); return; } // the game closed one of its own menus
  if (e.code === 'KeyP' || (e.code === 'Escape' && !Arcade.paused)) { Arcade.togglePause(); e.preventDefault(); return; }
  if (!e.repeat) Arcade.pressed.add(e.code);
  Arcade.keys.add(e.code);
});
window.addEventListener('keyup', (e) => Arcade.keys.delete(e.code));
window.addEventListener('blur', () => { Arcade.keys.clear(); Arcade.mouse.down = false; Arcade.mouse.right = false; });
const cvEl = $('#cv');
cvEl.tabIndex = 0;
cvEl.addEventListener('pointerdown', (e) => {
  cvEl.focus();
  const p = Arcade.pt(e); Object.assign(Arcade.mouse, p);
  if (e.button === 2) { Arcade.mouse.right = true; Arcade.mouse.rclicked = true; }
  else { Arcade.mouse.down = true; Arcade.mouse.clicked = true; }
});
cvEl.addEventListener('pointermove', (e) => Object.assign(Arcade.mouse, Arcade.pt(e)));
window.addEventListener('pointerup', (e) => { if (e.button === 2) Arcade.mouse.right = false; else Arcade.mouse.down = false; });
cvEl.addEventListener('contextmenu', (e) => e.preventDefault());
$('#overlay').addEventListener('click', (e) => { if (e.target === $('#overlay') && Arcade.paused) Arcade.togglePause(false); });

// Pause when hidden; the idle game catches up from timestamps when you come back.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (Arcade.game && !Arcade.paused) Arcade.togglePause(true); Arcade.halt(); }
  else Arcade.resume();
});
new ResizeObserver(() => Arcade.fit()).observe($('#stage'));
