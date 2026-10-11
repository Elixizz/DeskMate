// Desk Defense: bugs march across six desks toward the hole in DeskMate's side. Build towers along the path, earn XP
// for every wave you survive, spend it in the Armory to unlock 24 towers, and pick 8 to bring into each fight.
// Bugs that get through crawl out of DeskMate onto your screen and pop (with the screen-effects permission).
(() => {
  const W = 360, H = 360, C = 24, COLS = 15, ROWS = 13, BAR = ROWS * C;

  // ---------- maps (every path ends at x = -1: the hole in the side of DeskMate) ----------
  const MAPS = [
    { id: 'desk', name: 'The Desk', mult: 1, bg: '#8a6a4a', path: '#5e4630', deco: 'wood', paths: [[[15, 1], [10, 1], [10, 5], [2, 5], [2, 9], [8, 9], [8, 11], [-1, 11]]] },
    { id: 'keys', name: 'Keyboard', mult: 1.15, bg: '#2b2f3a', path: '#151821', deco: 'keys', paths: [[[15, 6], [12, 6], [12, 1], [8, 1], [8, 11], [4, 11], [4, 3], [-1, 3]]] },
    { id: 'pad', name: 'Mousepad', mult: 1.3, bg: '#3a2d5c', path: '#241a3d', deco: 'pad', paths: [[[7, -1], [7, 2], [12, 2], [12, 10], [2, 10], [2, 6], [-1, 6]]] },
    { id: 'shelf', name: 'Bookshelf', mult: 1.5, bg: '#6b4a2f', path: '#3e2a19', deco: 'shelf', paths: [[[1, -1], [1, 2], [13, 2], [13, 5], [3, 5], [3, 8], [13, 8], [13, 11], [-1, 11]]] },
    { id: 'kitchen', name: 'Kitchen Counter', mult: 1.75, bg: '#cfd6dc', path: '#9aa4ad', deco: 'tiles', paths: [[[15, 2], [9, 2], [9, 6], [-1, 6]], [[15, 10], [9, 10], [9, 6], [-1, 6]]] },
    { id: 'rack', name: 'Server Rack', mult: 2.1, bg: '#16202b', path: '#0b1118', deco: 'rack', paths: [[[14, -1], [14, 2], [4, 2], [4, 5], [-1, 5]], [[15, 12], [10, 12], [10, 8], [2, 8], [2, 11], [-1, 11]]] },
  ];
  const UNLOCK_WAVE = 15, WIN_WAVE = 30;

  // ---------- towers ----------
  // kind decides behaviour; xp is the Armory price (0 = starter).
  const T = {
    pencil: { name: 'Pencil', em: '✏️', xp: 0, cost: 50, range: 68, rate: 2.2, dmg: 6, kind: 'bullet', col: '#ffc93d', desc: 'Cheap and quick. Shoots one bug at a time.' },
    stapler: { name: 'Stapler', em: '🗜️', xp: 0, cost: 120, range: 82, rate: 0.6, dmg: 30, kind: 'bullet', splash: 28, col: '#8b93a7', desc: 'Heavy staples that hit a small group.' },
    fan: { name: 'Fan', em: '🌀', xp: 0, cost: 90, range: 56, rate: 3, dmg: 1, kind: 'slow', slow: 0.45, col: '#3d9bff', desc: 'Slows every bug near it.' },
    band: { name: 'Rubber Band', em: '➰', xp: 100, cost: 70, range: 62, rate: 5, dmg: 3, kind: 'bullet', col: '#e67e22', desc: 'Very fast, weak shots. Great early.' },
    eraser: { name: 'Eraser', em: '🧽', xp: 150, cost: 110, range: 64, rate: 0.9, dmg: 10, kind: 'bullet', knock: 26, col: '#ff9aa2', desc: 'Knocks ground bugs back along the path.' },
    ruler: { name: 'Ruler', em: '📏', xp: 200, cost: 160, range: 150, rate: 0.45, dmg: 55, kind: 'snipe', col: '#f1c40f', desc: 'Long-range sniper. Huge single hits.' },
    clip: { name: 'Paperclip Launcher', em: '📎', xp: 250, cost: 130, range: 80, rate: 1.1, dmg: 14, kind: 'bullet', pierce: 3, col: '#bdc3c7', desc: 'Clips fly through up to 3 bugs.' },
    mug: { name: 'Coffee Mug', em: '☕', xp: 300, cost: 140, range: 60, rate: 0.5, dmg: 6, kind: 'puddle', col: '#6f4e37', desc: 'Spills hot coffee on the path: slows and burns ground bugs.' },
    punch: { name: 'Hole Punch', em: '🕳️', xp: 350, cost: 150, range: 66, rate: 1.2, dmg: 9, kind: 'bullet', shred: 1, col: '#7f8c8d', desc: 'Punches holes in armor. Each hit removes 1 armor.' },
    marker: { name: 'Highlighter', em: '🖍️', xp: 400, cost: 180, range: 72, rate: 0, dmg: 14, kind: 'beam', col: '#c6ff3d', desc: 'Steady beam that gets stronger on the same bug.' },
    lamp: { name: 'Desk Lamp', em: '💡', xp: 450, cost: 160, range: 64, rate: 1.3, dmg: 4, kind: 'bullet', burn: 8, col: '#ffe066', desc: 'Sets bugs on fire for extra damage over time.' },
    pins: { name: 'Push Pins', em: '📌', xp: 500, cost: 120, range: 70, rate: 0.7, dmg: 40, kind: 'mines', col: '#e74c3c', desc: 'Drops pins on the path. Ground bugs that step on them pop.' },
    plane: { name: 'Paper Planes', em: '✈️', xp: 550, cost: 170, range: 95, rate: 1, dmg: 16, kind: 'bullet', homing: true, air: 2.2, col: '#ecf0f1', desc: 'Homing planes. Extra damage to flying bugs.' },
    tape: { name: 'Tape Dispenser', em: '🧻', xp: 600, cost: 150, range: 66, rate: 0.8, dmg: 4, kind: 'bullet', stun: 0.7, col: '#d6c8a7', desc: 'Sticky tape stops a bug in its tracks.' },
    calc: { name: 'Calculator', em: '🧮', xp: 700, cost: 200, range: 0, rate: 0, dmg: 0, kind: 'income', col: '#2ecc71', desc: 'Makes $40 each wave (more when upgraded) plus 3% interest.' },
    printer: { name: 'Printer', em: '🖨️', xp: 800, cost: 210, range: 74, rate: 1.1, dmg: 11, kind: 'multi', shots: 3, col: '#95a5a6', desc: 'Prints three shots at three different bugs.' },
    usb: { name: 'USB Zapper', em: '⚡', xp: 900, cost: 230, range: 76, rate: 0.9, dmg: 20, kind: 'chain', jumps: 4, col: '#9b59b6', desc: 'Lightning that jumps between up to 5 bugs.' },
    battery: { name: 'Battery', em: '🔋', xp: 1000, cost: 180, range: 58, rate: 0, dmg: 0, kind: 'auraDmg', boost: 0.25, col: '#27ae60', desc: '+25% damage for towers around it.' },
    router: { name: 'Wi-Fi Router', em: '📶', xp: 1100, cost: 180, range: 58, rate: 0, dmg: 0, kind: 'auraRange', boost: 0.2, col: '#3498db', desc: '+20% range for towers around it.' },
    scissors: { name: 'Scissors', em: '✂️', xp: 1200, cost: 190, range: 38, rate: 2, dmg: 34, kind: 'bullet', instant: true, col: '#e74c3c', desc: 'Short reach, massive damage. Put it on a corner.' },
    speaker: { name: 'Speaker', em: '🔊', xp: 1300, cost: 240, range: 64, rate: 0.7, dmg: 18, kind: 'pulse', col: '#34495e', desc: 'Sound waves hit every bug in range.' },
    magnet: { name: 'Magnet', em: '🧲', xp: 1450, cost: 260, range: 70, rate: 0.25, dmg: 0, kind: 'pull', pull: 40, col: '#c0392b', desc: 'Drags every ground bug in range backwards.' },
    spray: { name: 'Bug Spray', em: '🧴', xp: 1600, cost: 260, range: 66, rate: 0.6, dmg: 9, kind: 'cloud', col: '#16a085', desc: 'Poison cloud. Ignores armor.' },
    laser: { name: 'Laser Pointer', em: '🔴', xp: 1800, cost: 320, range: 400, rate: 0.6, dmg: 70, kind: 'snipe', air: 1.5, col: '#ff3b3b', desc: 'Hits any bug on the map, instantly.' },
  };
  const ORDER = Object.keys(T);
  const STARTERS = ['pencil', 'stapler', 'fan'];

  // ---------- bugs ----------
  const BUGS = {
    ant: { hp: 20, speed: 42, reward: 5, r: 6, color: '#c0392b' },
    spider: { hp: 16, speed: 72, reward: 6, r: 6, color: '#2c3e50' },
    fly: { hp: 14, speed: 60, reward: 6, r: 5, color: '#5d6d7e', fly: true },
    beetle: { hp: 70, speed: 28, reward: 11, r: 8, color: '#1e8449', armor: 3 },
    caterpillar: { hp: 45, speed: 30, reward: 8, r: 7, color: '#7dcea0', split: 2 },
    worm: { hp: 12, speed: 52, reward: 2, r: 4, color: '#a9dfbf' },
    wasp: { hp: 30, speed: 82, reward: 10, r: 6, color: '#f4d03f', fly: true },
    ladybug: { hp: 50, speed: 36, reward: 10, r: 7, color: '#e74c3c', armor: 6 },
    snail: { hp: 130, speed: 18, reward: 15, r: 9, color: '#af7ac5', armor: 1, regen: 4 },
    moth: { hp: 42, speed: 46, reward: 9, r: 7, color: '#d7bde2', fly: true, noSlow: true },
    roach: { hp: 950, speed: 22, reward: 90, r: 12, color: '#6e2c00', armor: 4, boss: true },
    queen: { hp: 2600, speed: 17, reward: 220, r: 14, color: '#922b21', armor: 5, boss: true, spawns: 'ant' },
  };

  let A, sv, st, map, paths, pathCells, towers, bugs, shots, puddles, mines, fxs, sel, pickSlot;

  // ---------- save ----------
  function loadSave() {
    sv = A.load('td2', null) || { xp: 0, unlocked: [...STARTERS], loadout: [...STARTERS], maps: {}, cleared: {} };
  }
  const persist = () => A.save('td2', sv);
  const mapOpen = (i) => i === 0 || (sv.maps[MAPS[i - 1].id] || 0) >= UNLOCK_WAVE;

  // ---------- path geometry ----------
  function buildMap(m) {
    map = m;
    pathCells = new Set();
    paths = m.paths.map((pts) => {
      const p = pts.map(([x, y]) => ({ x: x * C + C / 2, y: y * C + C / 2 }));
      const lens = [0];
      for (let i = 1; i < p.length; i++) lens.push(lens[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y));
      for (let i = 0; i < pts.length - 1; i++) {
        let [x, y] = pts[i]; const [x2, y2] = pts[i + 1];
        while (x !== x2 || y !== y2) { pathCells.add(`${x},${y}`); x += Math.sign(x2 - x); y += Math.sign(y2 - y); }
        pathCells.add(`${x2},${y2}`);
      }
      return { p, lens, total: lens[lens.length - 1] };
    });
  }
  function posAt(path, d) {
    const { p, lens } = path;
    if (d <= 0) return { x: p[0].x, y: p[0].y };
    for (let i = 1; i < p.length; i++) if (d <= lens[i]) { const t = (d - lens[i - 1]) / (lens[i] - lens[i - 1]); return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * t, y: p[i - 1].y + (p[i].y - p[i - 1].y) * t }; }
    const e = p[p.length - 1]; return { x: e.x, y: e.y };
  }

  // ---------- game state ----------
  function newGame(m) {
    buildMap(m);
    st = { money: 150, lives: 20, wave: 0, queue: [], spawnT: 0, speed: 1, over: false, between: true, xpGained: 0, won: false, endless: false, flash: [] };
    towers = []; bugs = []; shots = []; puddles = []; mines = []; fxs = []; sel = null; pickSlot = null;
    A.hideOverlay();
  }
  function waveList(n) {
    const pool = ['ant'];
    if (n >= 2) pool.push('spider'); if (n >= 3) pool.push('fly'); if (n >= 4) pool.push('beetle');
    if (n >= 6) pool.push('caterpillar'); if (n >= 8) pool.push('wasp'); if (n >= 10) pool.push('ladybug');
    if (n >= 12) pool.push('snail'); if (n >= 14) pool.push('moth');
    const list = [], count = Math.min(60, 6 + n * 2);
    for (let i = 0; i < count; i++) list.push(pool[Math.random() < 0.35 ? 0 : irand(0, pool.length - 1)]);
    if (n % 10 === 0) list.push(n >= 20 ? 'queen' : 'roach');
    if (n > 30 && n % 5 === 0) list.push('roach');
    return list;
  }
  function startWave() {
    if (!st.between || st.over) return;
    st.wave++; st.between = false; st.queue = waveList(st.wave); st.spawnT = 0.2; A.sfx('click');
  }
  let spawnPath = 0;
  function spawn(kind, at) {
    const b = BUGS[kind], scale = 1.15 ** (st.wave - 1) * map.mult;
    const pi = at ? at.pi : (spawnPath++ % paths.length);
    bugs.push({ kind, ...b, hp: b.hp * scale, max: b.hp * scale, armor: (b.armor || 0) + Math.floor(st.wave / 12), pi, d: at ? Math.max(0, at.d + rand(-8, 8)) : 0, x: 0, y: 0, slowT: 0, slowMul: 1, burnT: 0, burnDps: 0, poisonT: 0, poisonDps: 0, stunT: 0, wob: rand(0, 6), spawnT: 3 });
  }

  // ---------- stats with upgrades and auras ----------
  const lvlMul = (t) => 1.5 ** (t.lvl - 1);
  function stat(t) {
    const b = T[t.type];
    let dmg = b.dmg * lvlMul(t), range = b.range * (1 + 0.1 * (t.lvl - 1));
    for (const o of towers) {
      if (o === t || Math.hypot(o.x - t.x, o.y - t.y) > T[o.type].range * (1 + 0.1 * (o.lvl - 1))) continue;
      if (T[o.type].kind === 'auraDmg') dmg *= 1 + T[o.type].boost * (1 + 0.5 * (o.lvl - 1));
      if (T[o.type].kind === 'auraRange') range *= 1 + T[o.type].boost * (1 + 0.5 * (o.lvl - 1));
    }
    return { ...b, dmg, range, rate: b.rate * (1 + 0.15 * (t.lvl - 1)) };
  }
  const upCost = (t) => Math.ceil(T[t.type].cost * 0.8 * t.lvl);
  const towerAt = (cx, cy) => towers.find((t) => t.cx === cx && t.cy === cy);

  function hurt(b, dmg, opt = {}) {
    if (b.dead || dmg <= 0) return;
    if (opt.air && b.fly) dmg *= opt.air;
    const real = opt.pierceArmor ? dmg : Math.max(dmg * 0.25, dmg - b.armor);
    b.hp -= real;
    if (b.hp <= 0) kill(b);
  }
  function kill(b) {
    if (b.dead) return;
    b.dead = true; st.money += b.reward;
    if (b.split) for (let i = 0; i < b.split; i++) spawn('worm', { pi: b.pi, d: b.d });
    if (b.boss) { A.sfx('boom'); fxs.push({ ring: true, x: b.x, y: b.y, t: 0, col: b.color }); }
  }
  function inRange(t, s, groundOnly) { return bugs.filter((b) => !b.dead && (!groundOnly || !b.fly) && Math.hypot(b.x - t.x, b.y - t.y) <= s.range); }
  const furthest = (list) => list.reduce((a, b) => (b.d > a.d ? b : a));

  // ---------- escaping into the real screen ----------
  function escape(b) {
    st.lives -= b.boss ? 5 : 1;
    st.flash.push({ y: b.y, t: 0 });
    A.sfx('hurt');
    if (window.deskmate?.fx) {
      const p = A.toPage(0, b.y);
      deskmate.fx.escape({ y: p.y, color: b.color, size: b.r }).catch(() => {});
      setTimeout(() => A.sfx('boom'), 1400);
    }
  }

  // ---------- menus ----------
  function menu() {
    st = null;
    A.screen(`<h3>Desk Defense</h3>
      <div class="xpline">You have <b>${sv.xp} XP</b> <span class="muted small">· earn XP for every wave you survive</span></div>
      <div class="mapgrid">${MAPS.map((m, i) => `<button class="mapcard" data-map="${i}" ${mapOpen(i) ? '' : 'disabled'}>
        <canvas width="160" height="104" data-prev="${i}"></canvas><b>${m.name}${sv.cleared[m.id] ? ' ✓' : ''}</b>
        <span>${mapOpen(i) ? `Best wave ${sv.maps[m.id] || 0}${m.paths.length > 1 ? ' · 2 paths' : ''} · bugs x${m.mult}` : `Reach wave ${UNLOCK_WAVE} on ${MAPS[i - 1].name}`}</span></button>`).join('')}</div>
      <button id="tdArmory">Armory: unlock and choose towers (${sv.unlocked.length}/${ORDER.length})</button>`);
    for (const cv of document.querySelectorAll('[data-prev]')) drawPreview(cv.getContext('2d'), MAPS[cv.dataset.prev]);
    document.querySelectorAll('[data-map]').forEach((b) => (b.onclick = () => newGame(MAPS[b.dataset.map])));
    document.getElementById('tdArmory').onclick = armory;
  }
  function armory(info) {
    A.screen(`<div class="row"><button class="ghost" id="tdBack">&#x2039; Maps</button><h3 class="grow">Armory</h3><b style="color:var(--accent)">${sv.xp} XP</b></div>
      <div class="muted small">Click a locked tower to unlock it with XP. Click unlocked towers to put them in your loadout (up to 8, numbered).</div>
      <div class="tdinfo" id="tdInfo">${info || 'Pick a tower to see what it does.'}</div>
      <div class="tgrid">${ORDER.map((id) => {
        const t = T[id], un = sv.unlocked.includes(id), slot = sv.loadout.indexOf(id);
        return `<button class="tcard${un ? '' : ' locked'}${slot >= 0 ? ' inload' : ''}" data-t="${id}">${slot >= 0 ? `<span class="slot">${slot + 1}</span>` : ''}<span class="em">${t.em}</span><b>${t.name}</b><span>${un ? '$' + t.cost : t.xp + ' XP'}</span></button>`;
      }).join('')}</div>`);
    document.getElementById('tdBack').onclick = menu;
    document.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => {
      const id = b.dataset.t, t = T[id];
      const line = `<b>${t.em} ${t.name}</b> · $${t.cost}${t.range ? ` · range ${t.range}` : ''}<br>${t.desc}`;
      if (!sv.unlocked.includes(id)) {
        if (sv.xp < t.xp) return armory(`${line}<br><span class="err">Needs ${t.xp} XP. You have ${sv.xp}.</span>`);
        sv.xp -= t.xp; sv.unlocked.push(id);
        if (sv.loadout.length < 8) sv.loadout.push(id);
        persist(); A.sfx('win');
        return armory(`${line}<br><b style="color:var(--ok)">Unlocked!</b>`);
      }
      const i = sv.loadout.indexOf(id);
      if (i >= 0) { if (sv.loadout.length > 1) sv.loadout.splice(i, 1); }
      else if (sv.loadout.length < 8) sv.loadout.push(id);
      else return armory(`${line}<br><span class="err">Loadout is full. Remove one first.</span>`);
      persist(); armory(line);
    }));
  }
  function endScreen(title, sub) {
    A.overlay(title, sub, [['Play again', () => newGame(map)], ['Maps', menu, true]]);
  }

  // ---------- drawing helpers ----------
  function drawBoard(g, m, scale = 1, cells) {
    g.save(); g.scale(scale, scale);
    g.fillStyle = m.bg; g.fillRect(0, 0, W, BAR);
    if (m.deco === 'wood') { g.strokeStyle = '#7a5c3f'; g.lineWidth = 1; for (let y = 6; y < BAR; y += 11) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(120, y + 3, 240, y - 3, W, y + 1); g.stroke(); } }
    if (m.deco === 'keys') { g.fillStyle = '#3a404e'; for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { g.beginPath(); g.roundRect(x * C + 2, y * C + 2, C - 4, C - 5, 4); g.fill(); } }
    if (m.deco === 'pad') { const gr = g.createRadialGradient(W / 2, BAR / 2, 20, W / 2, BAR / 2, 260); gr.addColorStop(0, '#5b46a0'); gr.addColorStop(1, '#2a1f45'); g.fillStyle = gr; g.fillRect(0, 0, W, BAR); }
    if (m.deco === 'shelf') { g.fillStyle = '#5a3d25'; for (let y = 0; y < BAR; y += C * 3) g.fillRect(0, y, W, 4); for (let x = 0; x < W; x += 9) { g.fillStyle = ['#a93226', '#2471a3', '#229954', '#d4ac0d', '#7d3c98'][(x / 9) % 5 | 0] + '55'; g.fillRect(x, 6, 7, C * 3 - 8); } }
    if (m.deco === 'tiles') { g.strokeStyle = '#b5bec6'; g.lineWidth = 1; for (let x = 0; x <= W; x += C * 2) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, BAR); g.stroke(); } for (let y = 0; y <= BAR; y += C * 2) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } }
    if (m.deco === 'rack') { for (let y = 0; y < BAR; y += 12) { g.fillStyle = '#1e2b39'; g.fillRect(0, y, W, 10); g.fillStyle = (y / 12) % 3 ? '#2ecc71' : '#e67e22'; g.fillRect(W - 14, y + 4, 3, 2); g.fillRect(6, y + 4, 3, 2); } }
    g.fillStyle = m.path;
    for (const k of cells) { const [x, y] = k.split(',').map(Number); if (x >= 0 && x < COLS) g.fillRect(x * C, y * C, C, C); }
    // the hole in DeskMate's side where each path ends
    for (const pts of m.paths) {
      const [, ey] = pts[pts.length - 1];
      g.fillStyle = '#000'; g.beginPath(); g.ellipse(0, ey * C + C / 2, 7, C * 0.62, 0, 0, 7); g.fill();
      g.strokeStyle = '#ff8a3d'; g.lineWidth = 2; g.beginPath(); g.ellipse(0, ey * C + C / 2, 7, C * 0.62, 0, -Math.PI / 2, Math.PI / 2); g.stroke();
    }
    g.restore();
  }
  function drawPreview(g, m) {
    const cells = new Set();
    for (const pts of m.paths) for (let i = 0; i < pts.length - 1; i++) { let [x, y] = pts[i]; const [x2, y2] = pts[i + 1]; while (x !== x2 || y !== y2) { cells.add(`${x},${y}`); x += Math.sign(x2 - x); y += Math.sign(y2 - y); } cells.add(`${x2},${y2}`); }
    drawBoard(g, m, 160 / W, cells);
  }
  function drawTowerIcon(g, id, x, y, r) {
    const t = T[id];
    g.fillStyle = '#00000044'; g.beginPath(); g.arc(x + 1, y + 2, r, 0, 7); g.fill();
    const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 1, x, y, r);
    gr.addColorStop(0, t.col); gr.addColorStop(1, '#1e1a17');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.strokeStyle = '#ffffffaa'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, r - 0.5, 0, 7); g.stroke();
    // emoji may draw as a one-colour symbol in canvas, so give it a bright fill and a dark outline
    g.font = `${Math.round(r * 1.2)}px "Segoe UI Emoji", "Segoe UI Symbol"`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 2.5; g.strokeStyle = '#000000aa'; g.strokeText(t.em, x, y + 1);
    g.fillStyle = '#ffffff'; g.fillText(t.em, x, y + 1); g.textBaseline = 'alphabetic';
  }

  // ---------- bottom bar ----------
  const BTN_Y = BAR + 6, BTN_H = 36, SLOT_W = 33;
  function barButtons() {
    if (sel) return [[4, 120, 'up'], [128, 90, 'sell'], [222, 134, 'wave']];
    const b = sv.loadout.map((id, i) => [4 + i * (SLOT_W + 1), SLOT_W, 'slot:' + i]);
    b.push([280, 76, 'wave']);
    return b;
  }
  function onButton(id) {
    if (id.startsWith('slot:')) { const i = Number(id.slice(5)); pickSlot = pickSlot === i ? null : i; sel = null; return; }
    if (id === 'wave') { startWave(); return; }
    if (id === 'up' && sel && sel.lvl < 3 && st.money >= upCost(sel)) { st.money -= upCost(sel); sel.spent += upCost(sel); sel.lvl++; A.sfx('buy'); return; }
    if (id === 'sell' && sel) { st.money += Math.floor(sel.spent * 0.7); towers = towers.filter((t) => t !== sel); sel = null; A.sfx('coin'); }
  }

  GAMES.td = {
    name: 'Desk Defense', W, H,
    help: 'Pick a tower (or press 1-8), click a desk square to build. Click a tower to upgrade/sell. F = speed, Space = next wave.',
    desc: '24 towers, 6 desks. Don\'t let the bugs out.',
    bestLabel: () => { const s = Arcade.load('td2', null); return s ? `${s.xp} XP · ${s.unlocked.length}/${ORDER.length} towers` : '24 towers to unlock'; },
    thumb(g, w, h) {
      g.fillStyle = '#8a6a4a'; g.fillRect(0, 0, w, h); g.fillStyle = '#5e4630'; g.fillRect(0, h / 2 - 9, w, 18);
      g.fillStyle = '#000'; g.beginPath(); g.ellipse(0, h / 2, 6, 12, 0, 0, 7); g.fill();
      g.font = '18px "Segoe UI Emoji"'; g.fillText('✏️', w / 2 - 34, h / 2 - 16); g.fillText('🔋', w / 2 + 20, h / 2 + 30);
      g.fillStyle = '#c0392b'; for (const x of [40, 64, 92]) { g.beginPath(); g.arc(x, h / 2, 5, 0, 7); g.fill(); }
    },
    canPause: () => !!st && !st.over && !document.querySelector('#overlay.screen:not(.hidden)'),
    start(a) { A = a; loadSave(); menu(); },
    stop() { if (sv) persist(); },
    update(dt0) {
      if (!st || st.over) return;
      const m = A.mouse;
      if (A.hit('KeyF')) st.speed = st.speed === 1 ? 2 : st.speed === 2 ? 3 : 1;
      if (A.hit('Space')) startWave();
      for (let i = 0; i < 8; i++) if (A.hit('Digit' + (i + 1)) && sv.loadout[i]) { pickSlot = pickSlot === i ? null : i; sel = null; }
      if (m.rclicked) { pickSlot = null; sel = null; }
      if (m.clicked) {
        if (m.x > 322 && m.y < 22) st.speed = st.speed === 1 ? 2 : st.speed === 2 ? 3 : 1;
        else if (m.y > BAR) { const b = barButtons().find(([x, w]) => m.x >= x && m.x <= x + w && m.y >= BTN_Y && m.y <= BTN_Y + BTN_H); if (b) onButton(b[2]); }
        else {
          const cx = Math.floor(m.x / C), cy = Math.floor(m.y / C), t = towerAt(cx, cy);
          if (t) { sel = sel === t ? null : t; pickSlot = null; }
          else if (pickSlot != null && cx >= 0 && cx < COLS && !pathCells.has(`${cx},${cy}`)) {
            const id = sv.loadout[pickSlot], cost = T[id].cost;
            if (st.money >= cost) { st.money -= cost; towers.push({ type: id, cx, cy, x: cx * C + C / 2, y: cy * C + C / 2, lvl: 1, cd: 0.2, spent: cost, ang: 0, beamT: null, ramp: 0 }); A.sfx('buy'); }
            else A.sfx('hurt');
          } else sel = null;
        }
      }
      const dt = dt0 * st.speed;
      // spawning
      if (st.queue.length && (st.spawnT -= dt) <= 0) { spawn(st.queue.shift()); st.spawnT = Math.max(0.35, 0.8 - st.wave * 0.01); }
      // bugs: effects and movement along the path
      for (const b of bugs) {
        if (b.dead) continue;
        if (b.burnT > 0) { b.burnT -= dt; hurt(b, b.burnDps * dt, { pierceArmor: true }); }
        if (b.poisonT > 0) { b.poisonT -= dt; hurt(b, b.poisonDps * dt, { pierceArmor: true }); }
        if (b.regen) b.hp = Math.min(b.max, b.hp + b.regen * dt * (b.max / BUGS[b.kind].hp) * 0.3);
        if (b.spawns && (b.spawnT -= dt) <= 0) { b.spawnT = 3; spawn(b.spawns, { pi: b.pi, d: b.d }); }
        if (b.stunT > 0) { b.stunT -= dt; }
        else {
          const slow = !b.noSlow && b.slowT > 0 ? b.slowMul : 1;
          b.d += b.speed * slow * dt;
        }
        b.slowT -= dt; if (b.slowT <= 0) b.slowMul = 1;
        const p = posAt(paths[b.pi], b.d); b.x = p.x; b.y = p.y;
        if (b.d >= paths[b.pi].total) { b.dead = true; b.escaped = true; escape(b); }
      }
      // puddles and mines
      for (const pd of puddles) { pd.t -= dt; for (const b of bugs) if (!b.dead && !b.fly && Math.hypot(b.x - pd.x, b.y - pd.y) < 14) { b.slowT = 0.2; b.slowMul = Math.min(b.slowMul, 0.55); hurt(b, pd.dps * dt, { pierceArmor: true }); } }
      puddles = puddles.filter((p) => p.t > 0);
      for (const mi of mines) for (const b of bugs) if (!mi.used && !b.dead && !b.fly && Math.hypot(b.x - mi.x, b.y - mi.y) < 10) {
        mi.used = true; A.sfx('hit'); fxs.push({ ring: true, x: mi.x, y: mi.y, t: 0, col: '#e74c3c' });
        for (const o of bugs) if (!o.fly && Math.hypot(o.x - mi.x, o.y - mi.y) < 20) hurt(o, mi.dmg);
      }
      mines = mines.filter((m2) => !m2.used);
      // towers
      for (const t of towers) {
        const s = stat(t); t.cd -= dt;
        const k = s.kind;
        if (k === 'income' || k === 'auraDmg' || k === 'auraRange') continue;
        if (k === 'slow') {
          const list = inRange(t, s);
          for (const b of list) { b.slowT = 0.3; b.slowMul = Math.min(b.slowMul, 1 - Math.min(0.75, s.slow + 0.08 * (t.lvl - 1))); }
          if (t.cd <= 0 && list.length) { t.cd = 1 / s.rate; for (const b of list) hurt(b, s.dmg); }
          t.ang += dt * (list.length ? 14 : 3); continue;
        }
        if (k === 'beam') {
          const list = inRange(t, s);
          if (!list.length) { t.beamT = null; t.ramp = 0; continue; }
          const tg = t.beamT && list.includes(t.beamT) ? t.beamT : furthest(list);
          if (tg !== t.beamT) { t.beamT = tg; t.ramp = 0; }
          t.ramp = Math.min(2, t.ramp + dt * 0.6);
          hurt(tg, s.dmg * (1 + t.ramp) * dt); t.ang = Math.atan2(tg.y - t.y, tg.x - t.x); continue;
        }
        if (t.cd > 0) continue;
        if (k === 'puddle') {
          const spots = paths.flatMap((pa) => { const out = []; for (let d = 0; d < pa.total; d += 12) { const q = posAt(pa, d); if (Math.hypot(q.x - t.x, q.y - t.y) <= s.range) out.push(q); } return out; });
          if (spots.length && inRange(t, s, true).length) { const q = spots[irand(0, spots.length - 1)]; puddles.push({ x: q.x, y: q.y, t: 4, dps: s.dmg * 2.5 }); t.cd = 1 / s.rate; }
          continue;
        }
        if (k === 'mines') {
          const mine = mines.filter((mm) => mm.owner === t).length;
          if (mine < 4 + t.lvl) {
            const spots = paths.flatMap((pa) => { const out = []; for (let d = 0; d < pa.total; d += 10) { const q = posAt(pa, d); if (Math.hypot(q.x - t.x, q.y - t.y) <= s.range) out.push(q); } return out; });
            if (spots.length) { const q = spots[irand(0, spots.length - 1)]; mines.push({ x: q.x + rand(-4, 4), y: q.y + rand(-4, 4), dmg: s.dmg, owner: t }); }
          }
          t.cd = 1 / s.rate; continue;
        }
        const ground = !!s.knock;
        const list = k === 'snipe' && s.range > 300 ? bugs.filter((b) => !b.dead) : inRange(t, s, ground);
        if (!list.length) continue;
        t.cd = 1 / s.rate;
        if (k === 'pulse') { for (const b of list) hurt(b, s.dmg); fxs.push({ ring: true, x: t.x, y: t.y, t: 0, col: '#ecf0f1', r: s.range }); A.sfx('shoot'); continue; }
        if (k === 'cloud') { for (const b of list) { b.poisonT = 3; b.poisonDps = Math.max(b.poisonDps, s.dmg); } fxs.push({ cloud: true, x: t.x, y: t.y, t: 0, r: s.range }); continue; }
        if (k === 'pull') { for (const b of list) if (!b.fly && !b.boss) b.d = Math.max(0, b.d - s.pull * (1 + 0.3 * (t.lvl - 1))); fxs.push({ ring: true, x: t.x, y: t.y, t: 0, col: '#c0392b', r: s.range, inward: true }); A.sfx('block'); continue; }
        const tg = furthest(list);
        t.ang = Math.atan2(tg.y - t.y, tg.x - t.x);
        if (k === 'snipe') { hurt(tg, s.dmg, { air: s.air }); fxs.push({ line: true, x: t.x, y: t.y, x2: tg.x, y2: tg.y, t: 0, col: s.col }); A.sfx('shoot'); continue; }
        if (k === 'chain') {
          let cur = tg; const hit = new Set();
          for (let j = 0; j <= s.jumps && cur; j++) {
            hit.add(cur); hurt(cur, s.dmg * (1 - j * 0.12));
            const from = cur;
            cur = bugs.filter((b) => !b.dead && !hit.has(b) && Math.hypot(b.x - from.x, b.y - from.y) < 55).sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];
            fxs.push({ line: true, zap: true, x: j ? [...hit][j - 1].x : t.x, y: j ? [...hit][j - 1].y : t.y, x2: from.x, y2: from.y, t: 0, col: '#d2b4ff' });
          }
          A.sfx('shoot'); continue;
        }
        if (s.instant) { hurt(tg, s.dmg); fxs.push({ slash: true, x: tg.x, y: tg.y, t: 0 }); A.sfx('swing'); continue; }
        const targets = k === 'multi' ? list.sort((a, b) => b.d - a.d).slice(0, s.shots) : [tg];
        for (const tt of targets) shots.push({ x: t.x, y: t.y, tgt: tt, dmg: s.dmg, s, pierceLeft: s.pierce || 0, hitSet: new Set(), speed: s.homing ? 220 : 330, ang: Math.atan2(tt.y - t.y, tt.x - t.x) });
        A.sfx('shoot');
      }
      // projectiles
      for (const sh of shots) {
        const s = sh.s;
        if (!sh.tgt.dead || s.homing) {
          const tg = sh.tgt.dead ? bugs.find((b) => !b.dead) : sh.tgt;
          if (tg) { const want = Math.atan2(tg.y - sh.y, tg.x - sh.x); sh.ang = s.homing ? sh.ang + Math.max(-6 * dt, Math.min(6 * dt, ((want - sh.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI)) : want; if (sh.tgt.dead) sh.tgt = tg; }
        }
        sh.x += Math.cos(sh.ang) * sh.speed * dt; sh.y += Math.sin(sh.ang) * sh.speed * dt;
        if (sh.x < -10 || sh.x > W + 10 || sh.y < -10 || sh.y > BAR + 10) { sh.done = true; continue; }
        for (const b of bugs) {
          if (b.dead || sh.hitSet.has(b) || Math.hypot(b.x - sh.x, b.y - sh.y) > b.r + 3) continue;
          if (s.knock && b.fly) continue;
          sh.hitSet.add(b);
          if (s.splash) { for (const o of bugs) if (!o.dead && Math.hypot(o.x - b.x, o.y - b.y) < s.splash) hurt(o, sh.dmg); fxs.push({ ring: true, x: b.x, y: b.y, t: 0, col: '#ffffff', r: s.splash }); }
          else hurt(b, sh.dmg, { air: s.air });
          if (s.knock && !b.boss) b.d = Math.max(0, b.d - s.knock);
          if (s.burn) { b.burnT = 2.5; b.burnDps = Math.max(b.burnDps, s.burn * (sh.dmg / s.dmg)); }
          if (s.stun && !b.boss) b.stunT = Math.max(b.stunT, s.stun);
          if (s.shred) b.armor = Math.max(0, b.armor - s.shred);
          if (sh.pierceLeft-- <= 0) { sh.done = true; break; }
        }
      }
      shots = shots.filter((s) => !s.done);
      fxs = fxs.filter((f) => (f.t += dt0) < 0.35);
      st.flash = st.flash.filter((f) => (f.t += dt0) < 0.6);
      bugs = bugs.filter((b) => !b.dead);
      if (st.lives <= 0) {
        st.lives = 0; st.over = true; A.sfx('lose');
        sv.maps[map.id] = Math.max(sv.maps[map.id] || 0, st.wave - 1); persist();
        endScreen('The bugs broke out!', `${map.name}: you survived <b>${st.wave - 1}</b> waves and earned <b>${st.xpGained} XP</b>.`);
        return;
      }
      if (!st.between && !st.queue.length && !bugs.length) {
        st.between = true;
        const bonus = 20 + st.wave * 3; st.money += bonus;
        for (const t of towers) if (T[t.type].kind === 'income') st.money += 40 * t.lvl + Math.floor(st.money * 0.03 * t.lvl);
        const xp = Math.round((10 + st.wave * 2) * map.mult);
        sv.xp += xp; st.xpGained += xp;
        sv.maps[map.id] = Math.max(sv.maps[map.id] || 0, st.wave);
        fxs.push({ text: `+${xp} XP`, x: W / 2, y: BAR / 2, t: -0.8 });
        A.sfx('win');
        if (st.wave >= WIN_WAVE && !sv.cleared[map.id] && !st.endless) {
          sv.cleared[map.id] = true; sv.xp += 300; st.xpGained += 300;
          A.overlay('Desk defended!', `You held ${map.name} for ${WIN_WAVE} waves. <b>+300 XP</b> bonus.`, [['Keep going', () => { st.endless = true; A.hideOverlay(); }], ['Maps', menu, true]]);
        }
        persist();
      }
      A.hud(`Wave ${st.wave} · ♥ ${st.lives} · $${Math.floor(st.money)}`);
    },
    draw(g) {
      g.fillStyle = css('--bg'); g.fillRect(0, 0, W, H);
      if (!st) return;
      const acc = css('--accent');
      drawBoard(g, map, 1, pathCells);
      for (const pd of puddles) { g.fillStyle = `rgba(111,78,55,${Math.min(0.8, pd.t / 2)})`; g.beginPath(); g.ellipse(pd.x, pd.y, 13, 9, 0, 0, 7); g.fill(); }
      for (const mi of mines) { g.fillStyle = '#e74c3c'; g.beginPath(); g.arc(mi.x, mi.y, 3, 0, 7); g.fill(); g.fillStyle = '#ddd'; g.fillRect(mi.x - 0.5, mi.y - 0.5, 1, 1); }
      // placement preview
      const m = A.mouse, hx = Math.floor(m.x / C), hy = Math.floor(m.y / C);
      if (pickSlot != null && m.y < BAR && sv.loadout[pickSlot]) {
        const ok = !pathCells.has(`${hx},${hy}`) && !towerAt(hx, hy);
        g.fillStyle = ok ? '#ffffff22' : '#ff5d6c44'; g.fillRect(hx * C, hy * C, C, C);
        const r = T[sv.loadout[pickSlot]].range;
        if (r && r < 300) { g.strokeStyle = '#ffffff66'; g.lineWidth = 1; g.beginPath(); g.arc(hx * C + C / 2, hy * C + C / 2, r, 0, 7); g.stroke(); }
      }
      if (sel) { const r = stat(sel).range; if (r && r < 300) { g.strokeStyle = acc; g.lineWidth = 1.5; g.beginPath(); g.arc(sel.x, sel.y, r, 0, 7); g.stroke(); } }
      // towers
      for (const t of towers) {
        drawTowerIcon(g, t.type, t.x, t.y, 10.5);
        if (T[t.type].kind === 'beam' && t.beamT && !t.beamT.dead) { g.strokeStyle = `rgba(198,255,61,${0.5 + t.ramp * 0.25})`; g.lineWidth = 2 + t.ramp; g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(t.beamT.x, t.beamT.y); g.stroke(); }
        for (let i = 1; i < t.lvl; i++) { g.fillStyle = acc; g.fillRect(t.x - 7 + i * 4, t.y + 10, 3, 3); }
      }
      // bugs
      for (const b of bugs) {
        const wob = Math.sin(performance.now() / 80 + b.wob) * 1.2;
        if (b.fly) { g.fillStyle = '#00000033'; g.beginPath(); g.ellipse(b.x, b.y + 7, b.r, b.r * 0.4, 0, 0, 7); g.fill(); }
        const by = b.y + wob - (b.fly ? 5 : 0);
        g.fillStyle = b.stunT > 0 ? '#d6c8a7' : b.slowT > 0 && !b.noSlow ? '#7fb8ff' : b.color;
        g.beginPath(); g.ellipse(b.x, by, b.r, b.r * 0.75, 0, 0, 7); g.fill();
        g.fillStyle = '#00000088'; g.beginPath(); g.arc(b.x - b.r * 0.6, by, b.r * 0.4, 0, 7); g.fill();
        if (b.fly) { g.fillStyle = '#ffffffaa'; g.beginPath(); g.ellipse(b.x + 1, by - b.r * 0.7, b.r * 0.6, b.r * 0.3, 0.4 * Math.sin(performance.now() / 30), 0, 7); g.fill(); }
        if (b.armor > 0) { g.strokeStyle = '#bdc3c7'; g.lineWidth = 1; g.beginPath(); g.ellipse(b.x, by, b.r + 1.5, b.r * 0.75 + 1.5, 0, 0, 7); g.stroke(); }
        if (b.burnT > 0) { g.fillStyle = '#ff8a3d'; g.fillRect(b.x + rand(-3, 3), by - b.r - 2, 2, 2); }
        if (b.poisonT > 0) { g.fillStyle = '#2ecc71'; g.fillRect(b.x + rand(-3, 3), by - b.r - 2, 2, 2); }
        if (b.hp < b.max) { g.fillStyle = '#00000099'; g.fillRect(b.x - 9, by - b.r - 7, 18, 3); g.fillStyle = b.boss ? '#ff5d6c' : '#3ccf8e'; g.fillRect(b.x - 9, by - b.r - 7, 18 * Math.max(0, b.hp / b.max), 3); }
      }
      for (const sh of shots) { g.fillStyle = sh.s.col; g.save(); g.translate(sh.x, sh.y); g.rotate(sh.ang); g.fillRect(-3, -1.5, 6, 3); g.restore(); }
      for (const f of fxs) {
        const a = Math.max(0, 1 - Math.max(0, f.t) / 0.35);
        if (f.ring) { g.strokeStyle = f.col; g.globalAlpha = a; g.lineWidth = 2; g.beginPath(); g.arc(f.x, f.y, f.inward ? (f.r || 20) * a : (f.r || 22) * (1 - a * 0.7), 0, 7); g.stroke(); g.globalAlpha = 1; }
        if (f.cloud) { g.fillStyle = `rgba(46,204,113,${a * 0.25})`; g.beginPath(); g.arc(f.x, f.y, f.r, 0, 7); g.fill(); }
        if (f.line) { g.strokeStyle = f.col; g.globalAlpha = a; g.lineWidth = f.zap ? 2 : 1.5; g.beginPath(); g.moveTo(f.x, f.y); if (f.zap) { const mx = (f.x + f.x2) / 2 + rand(-6, 6), my = (f.y + f.y2) / 2 + rand(-6, 6); g.lineTo(mx, my); } g.lineTo(f.x2, f.y2); g.stroke(); g.globalAlpha = 1; }
        if (f.slash) { g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = 2; g.beginPath(); g.moveTo(f.x - 8, f.y - 8); g.lineTo(f.x + 8, f.y + 8); g.stroke(); }
        if (f.text) { g.globalAlpha = f.t < 0 ? 1 : a; g.fillStyle = acc; g.font = '800 20px Segoe UI'; g.textAlign = 'center'; g.fillText(f.text, f.x, f.y - Math.max(0, f.t) * 40); g.globalAlpha = 1; }
      }
      for (const f of st.flash) { g.fillStyle = `rgba(255,93,108,${0.6 - f.t})`; g.fillRect(0, f.y - 14, 14, 28); }
      // speed button
      g.fillStyle = st.speed > 1 ? acc : '#00000066'; g.beginPath(); g.roundRect(324, 3, 33, 17, 5); g.fill();
      g.fillStyle = st.speed > 1 ? css('--on-accent') : '#fff'; g.font = '700 11px Segoe UI'; g.textAlign = 'center'; g.fillText(`x${st.speed}`, 340, 15.5);
      // bottom bar
      g.fillStyle = css('--panel'); g.fillRect(0, BAR, W, H - BAR);
      for (const [x, w, id] of barButtons()) {
        let on = false, ok = true, label = '', sub = '';
        if (id.startsWith('slot:')) {
          const i = Number(id.slice(5)), tid = sv.loadout[i]; on = pickSlot === i; ok = st.money >= T[tid].cost;
          g.fillStyle = on ? acc : css('--card'); g.beginPath(); g.roundRect(x, BTN_Y, w, BTN_H, 6); g.fill();
          g.globalAlpha = ok ? 1 : 0.45; drawTowerIcon(g, tid, x + w / 2, BTN_Y + 14, 10);
          g.fillStyle = on ? css('--on-accent') : css('--text'); g.font = '9.5px Segoe UI'; g.fillText('$' + T[tid].cost, x + w / 2, BTN_Y + 32); g.globalAlpha = 1;
          continue;
        }
        if (id === 'wave') { label = st.between ? (st.wave === 0 ? 'Start' : 'Next wave') : `Wave ${st.wave}`; sub = st.between ? 'Space' : `${bugs.length + st.queue.length} bugs`; ok = st.between; on = st.between && st.wave === 0; }
        if (id === 'up') { label = sel.lvl < 3 ? `Upgrade ${T[sel.type].name}` : `${T[sel.type].name} (max)`; sub = sel.lvl < 3 ? `$${upCost(sel)} → level ${sel.lvl + 1}` : 'level 3'; ok = sel.lvl < 3 && st.money >= upCost(sel); }
        if (id === 'sell') { label = 'Sell'; sub = '$' + Math.floor(sel.spent * 0.7); }
        g.fillStyle = on ? acc : css('--card'); g.beginPath(); g.roundRect(x, BTN_Y, w, BTN_H, 7); g.fill();
        g.fillStyle = on ? css('--on-accent') : ok ? css('--text') : '#7b8190';
        g.textAlign = 'center'; g.font = '600 11px Segoe UI'; g.fillText(label, x + w / 2, BTN_Y + 16, w - 6);
        g.font = '10px Segoe UI'; g.fillText(sub, x + w / 2, BTN_Y + 29, w - 6);
      }
    },
  };
})();
