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
    mug: { name: 'Coffee Mug', em: '☕', xp: 300, cost: 140, range: 60, rate: 0.5, dmg: 6, kind: 'puddle', slow: 0.45, col: '#6f4e37', desc: 'Spills hot coffee on the path: slows and burns ground bugs.' },
    punch: { name: 'Hole Punch', em: '🕳️', xp: 350, cost: 150, range: 66, rate: 1.2, dmg: 9, kind: 'bullet', shred: 1, col: '#7f8c8d', desc: 'Punches holes in armor. Each hit removes 1 armor.' },
    marker: { name: 'Highlighter', em: '🖍️', xp: 400, cost: 180, range: 72, rate: 0, dmg: 14, kind: 'beam', col: '#c6ff3d', desc: 'Steady beam that gets stronger on the same bug.' },
    lamp: { name: 'Desk Lamp', em: '💡', xp: 450, cost: 160, range: 64, rate: 1.3, dmg: 4, kind: 'bullet', burn: 8, col: '#ffe066', desc: 'Sets bugs on fire for extra damage over time.' },
    pins: { name: 'Push Pins', em: '📌', xp: 500, cost: 120, range: 70, rate: 0.7, dmg: 40, kind: 'mines', col: '#e74c3c', desc: 'Drops pins on the path. Ground bugs that step on them pop.' },
    plane: { name: 'Paper Planes', em: '✈️', xp: 550, cost: 170, range: 95, rate: 1, dmg: 16, kind: 'bullet', homing: true, air: 2.2, col: '#ecf0f1', desc: 'Homing planes. Extra damage to flying bugs.' },
    tape: { name: 'Tape Dispenser', em: '🧻', xp: 600, cost: 150, range: 66, rate: 0.8, dmg: 4, kind: 'bullet', stun: 0.7, col: '#d6c8a7', desc: 'Sticky tape stops a bug in its tracks.' },
    calc: { name: 'Calculator', em: '🧮', xp: 700, cost: 200, range: 0, rate: 0, dmg: 0, kind: 'income', income: 40, interest: 0.03, col: '#2ecc71', desc: 'Makes $40 each wave (more when upgraded) plus 3% interest.' },
    printer: { name: 'Printer', em: '🖨️', xp: 800, cost: 210, range: 74, rate: 1.1, dmg: 11, kind: 'multi', shots: 3, col: '#95a5a6', desc: 'Prints three shots at three different bugs.' },
    usb: { name: 'USB Zapper', em: '⚡', xp: 900, cost: 230, range: 76, rate: 0.9, dmg: 20, kind: 'chain', jumps: 4, col: '#9b59b6', desc: 'Lightning that jumps between up to 5 bugs.' },
    battery: { name: 'Battery', em: '🔋', xp: 1000, cost: 180, range: 58, rate: 0, dmg: 0, kind: 'auraDmg', boost: 0.25, col: '#27ae60', desc: '+25% damage for towers around it.' },
    router: { name: 'Wi-Fi Router', em: '📶', xp: 1100, cost: 180, range: 58, rate: 0, dmg: 0, kind: 'auraRange', boost: 0.2, col: '#3498db', desc: '+20% range for towers around it.' },
    scissors: { name: 'Scissors', em: '✂️', xp: 1200, cost: 190, range: 38, rate: 2, dmg: 34, kind: 'bullet', instant: true, col: '#e74c3c', desc: 'Short reach, massive damage. Put it on a corner.' },
    speaker: { name: 'Speaker', em: '🔊', xp: 1300, cost: 240, range: 64, rate: 0.7, dmg: 18, kind: 'pulse', col: '#34495e', desc: 'Sound waves hit every bug in range.' },
    magnet: { name: 'Magnet', em: '🧲', xp: 1450, cost: 260, range: 70, rate: 0.25, dmg: 0, kind: 'pull', pull: 40, col: '#c0392b', desc: 'Drags every ground bug in range backwards.' },
    spray: { name: 'Bug Spray', em: '🧴', xp: 1600, cost: 260, range: 66, rate: 0.6, dmg: 9, kind: 'cloud', col: '#16a085', desc: 'Poison cloud. Ignores armor.' },
    laser: { name: 'Laser Pointer', em: '🔴', xp: 1800, cost: 320, range: 400, rate: 0.6, dmg: 70, kind: 'snipe', air: 1.5, burnScale: 5, col: '#ff3b3b', desc: 'Hits any bug on the map, instantly.' },
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
    st = { money: 150, lives: 20, wave: 0, bounty: 0, queue: [], spawnT: 0, speed: 1, over: false, between: true, xpGained: 0, won: false, endless: false, flash: [] };
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

  // ---------- upgrade paths ----------
  // Every tower has 3 paths of 6 tiers. You can put upgrades into 2 of them, and only one may go past tier 2.
  // Tier effects: "x" keys multiply a stat, numbers add to it, true switches an ability on.
  const PT = {
    power: ['Power', [['Sharpened', { xdmg: 1.3 }], ['Weighted', { xdmg: 1.3 }], ['Armor Breaker', { armorIgnore: 1 }], ['Brutal', { xdmg: 1.5 }], ['Boss Hunter', { xdmg: 1.3, boss: 1 }], ['Legendary', { xdmg: 2.2 }]]],
    speed: ['Speed', [['Oiled', { xrate: 1.2 }], ['Quick', { xrate: 1.2 }], ['Rapid', { xrate: 1.35 }], ['Overclocked', { xrate: 1.4 }], ['Blur', { xrate: 1.5 }], ['Hyperdrive', { xrate: 2 }]]],
    reach: ['Reach', [['Long Reach', { xrange: 1.12 }], ['Farsight', { xrange: 1.12 }], ['Sky Watch', { air: 1, hitAir: true }], ['Scope', { xrange: 1.15, xdmg: 1.3 }], ['Critical', { crit: 0.2 }], ['Deadeye', { xdmg: 2, xrange: 1.15, crit: 0.1 }]]],
    pierce: ['Pierce', [['Sharp Tip', { pierce: 1 }], ['Sharper Tip', { pierce: 1 }], ['Shredder', { shred: 1 }], ['Skewer', { pierce: 3, xdmg: 1.25 }], ['Drill', { pierce: 3, xdmg: 1.4 }], ['Railgun', { pierce: 8, xdmg: 2 }]]],
    splash: ['Blast', [['Wide Staples', { splash: 6 }], ['Bigger Blast', { splash: 6 }], ['Stunning', { stun: 0.25 }], ['Blast Wave', { splash: 8, xdmg: 1.3 }], ['Heavy Blast', { xdmg: 1.6 }], ['Earthquake', { splash: 12, xdmg: 2 }]]],
    burn: ['Fire', [['Kindling', { burn: 4 }], ['Hot Coals', { burn: 6 }], ['Wildfire', { splash: 16 }], ['Blaze', { burn: 12 }], ['Napalm', { burn: 20, burnT: 2 }], ['Sunfire', { burn: 40, xdmg: 2 }]]],
    chill: ['Chill', [['Breeze', { slow: 0.06 }], ['Cold Snap', { slow: 0.06 }], ['Frost', { freezeMoth: true }], ['Arctic', { slow: 0.08, xrange: 1.15 }], ['Brittle', { brittle: 0.25 }], ['Absolute Zero', { slow: 0.1, brittle: 0.25 }]]],
    sticky: ['Sticky', [['Stickier', { stun: 0.2 }], ['Double Sided', { stun: 0.2 }], ['Duct Tape', { stunBoss: true }], ['Wide Roll', { splash: 16 }], ['Industrial', { stun: 0.4, xdmg: 2 }], ['Tape Storm', { xrate: 1.5, stun: 0.3, splash: 8 }]]],
    knock: ['Knockback', [['Bouncy', { knock: 8 }], ['Rubber Slam', { knock: 10 }], ['Swatter', { hitAir: true }], ['Heavy Rubber', { knock: 14, xdmg: 1.5 }], ['Big Eraser', { splash: 18 }], ['Clean Slate', { knock: 30, xdmg: 2 }]]],
    multi: ['Multishot', [['Extra Shot', { shots: 1 }], ['Sharp Shots', { xdmg: 1.3 }], ['Volley', { shots: 1 }], ['Fast Feed', { xrate: 1.4 }], ['Barrage', { shots: 2 }], ['Storm of Shots', { shots: 3, xdmg: 1.5 }]]],
    chain: ['Chain', [['USB 2.0', { jumps: 1 }], ['USB 3.0', { jumps: 1, chainR: 12 }], ['Surge', { stun: 0.15 }], ['Thunderbolt', { jumps: 2, xdmg: 1.3 }], ['Overvoltage', { xdmg: 1.6 }], ['Lightning Storm', { jumps: 4, xdmg: 2 }]]],
    mines: ['Minefield', [['More Pins', { mineCap: 2 }], ['Sharp Pins', { xdmg: 1.3 }], ['Thumbtacks', { mineSplash: 8 }], ['Pin Box', { mineCap: 3, xrate: 1.3 }], ['Steel Pins', { xdmg: 1.6, armorIgnore: 1 }], ['Bed of Nails', { mineCap: 6, xdmg: 2 }]]],
    spill: ['Spill', [['Bigger Spill', { puddleR: 3 }], ['Hotter', { xdmg: 1.3 }], ['Sticky Sugar', { slow: 0.15 }], ['Espresso', { xdmg: 1.6, puddleT: 1 }], ['Full Pot', { puddleR: 5, puddleT: 2 }], ['Volcano Roast', { xdmg: 2.5 }]]],
    payroll: ['Payroll', [['Bookkeeping', { income: 20 }], ['Spreadsheet', { income: 30 }], ['Accountant', { income: 50 }], ['Payroll', { income: 80 }], ['CFO', { income: 120 }], ['Tycoon', { income: 250 }]]],
    savings: ['Interest', [['Savings', { interest: 0.01 }], ['High Yield', { interest: 0.01 }], ['Bonds', { interest: 0.015 }], ['Stocks', { interest: 0.02 }], ['Hedge Fund', { interest: 0.025 }], ['Compound', { interest: 0.04 }]]],
    bounty: ['Bounty', [['Coupons', { bounty: 0.05 }], ['Rebates', { bounty: 0.05 }], ['Cashback', { bounty: 0.08 }], ['Big Game', { bounty: 0.1 }], ['Headhunter', { bounty: 0.12 }], ['Bounty Board', { bounty: 0.2 }]]],
    boost: ['Boost', [['Charged', { boost: 0.05 }], ['Amped', { boost: 0.05 }], ['Lithium', { boost: 0.08 }], ['Power Cell', { boost: 0.1 }], ['Reactor', { boost: 0.12 }], ['Fusion', { boost: 0.2 }]]],
    cover: ['Coverage', [['Long Cable', { xrange: 1.15 }], ['Extension', { xrange: 1.15 }], ['Wireless', { xrange: 1.2 }], ['Repeater', { xrange: 1.2 }], ['Broadcast', { xrange: 1.25 }], ['Satellite', { xrange: 1.5 }]]],
    tempo: ['Tempo', [['Spark', { auraRate: 0.04 }], ['Pulse', { auraRate: 0.05 }], ['Surge', { auraRate: 0.07 }], ['Rush', { auraRate: 0.08 }], ['Frenzy', { auraRate: 0.1 }], ['Overdrive', { auraRate: 0.16 }]]],
    glow: ['Glow', [['Fluorescent', { rampMax: 0.5 }], ['Neon', { rampSpeed: 0.4 }], ['Ultra Bright', { rampMax: 1 }], ['Laser Tip', { xdmg: 1.4 }], ['Neon Rush', { rampSpeed: 0.8 }], ['Supernova', { rampMax: 2, xdmg: 1.5 }]]],
    blades: ['Blades', [['Honed', { xdmg: 1.2 }], ['Twin Blades', { shots: 1 }], ['Long Blades', { xrange: 1.25 }], ['Triple Cut', { shots: 1 }], ['Shear', { armorIgnore: 1 }], ['Whirlwind', { shots: 3, xdmg: 1.5 }]]],
    bass: ['Bass', [['Bass Boost', { stun: 0.1 }], ['Subwoofer', { xrange: 1.12 }], ['Shatter', { shred: 1 }], ['Concert', { stun: 0.2, xdmg: 1.3 }], ['Feedback', { slow: 0.3 }], ['Sonic Boom', { xdmg: 2, stun: 0.3 }]]],
    field: ['Field', [['Strong Field', { pull: 10 }], ['Stronger', { pull: 12 }], ['Ferro Core', { pullBoss: true }], ['Super Magnet', { pull: 20 }], ['Sky Pull', { hitAir: true }], ['Black Hole', { pull: 40, xrange: 1.2 }]]],
    shock: ['Shock', [['Static', { dmg: 5 }], ['Shock', { dmg: 8 }], ['Stun Field', { stun: 0.4 }], ['Arc', { dmg: 20 }], ['Tesla', { xdmg: 2 }], ['Railyard', { dmg: 60, xdmg: 1.5 }]]],
    fumes: ['Fumes', [['Lingering', { poisonT: 1 }], ['Thick Mist', { xrange: 1.12 }], ['Corrosive', { shred: 1 }], ['Toxic', { poisonT: 1.5, xdmg: 1.4 }], ['Fumigate', { slow: 0.3 }], ['Plague', { xdmg: 2, poisonT: 2 }]]],
    holes: ['Shred', [['Bigger Holes', { shred: 1 }], ['Sharp Die', { xdmg: 1.3 }], ['Triple Punch', { pierce: 2 }], ['Heavy Duty', { shred: 2 }], ['Steel Die', { xdmg: 1.6 }], ['Industrial', { shred: 4, xdmg: 2 }]]],
  };
  const TP = {
    pencil: ['power', 'speed', 'pierce'], stapler: ['power', 'splash', 'speed'], fan: ['chill', 'reach', 'power'], band: ['speed', 'pierce', 'power'],
    eraser: ['knock', 'power', 'speed'], ruler: ['power', 'speed', 'reach'], clip: ['pierce', 'power', 'speed'], mug: ['spill', 'speed', 'reach'],
    punch: ['holes', 'power', 'speed'], marker: ['power', 'glow', 'reach'], lamp: ['burn', 'speed', 'reach'], pins: ['mines', 'speed', 'reach'],
    plane: ['power', 'multi', 'speed'], tape: ['sticky', 'speed', 'reach'], calc: ['payroll', 'savings', 'bounty'], printer: ['multi', 'power', 'speed'],
    usb: ['chain', 'power', 'speed'], battery: ['boost', 'cover', 'tempo'], router: ['boost', 'cover', 'tempo'], scissors: ['power', 'blades', 'speed'],
    speaker: ['power', 'bass', 'speed'], magnet: ['field', 'shock', 'speed'], spray: ['power', 'fumes', 'speed'], laser: ['power', 'speed', 'burn'],
  };
  const PCOL = ['#ff7a59', '#4dabf7', '#69db7c'];
  const TIER_COST = [0.5, 0.8, 1.3, 2.5, 5, 10];
  const TARGETS = ['First', 'Last', 'Strong', 'Close'];
  const AIMS = new Set(['bullet', 'snipe', 'beam', 'multi', 'chain']);
  const pathOf = (type, p) => PT[TP[type][p]];
  const tierCost = (t, p) => Math.ceil((T[t.type].cost * TIER_COST[t.up[p]]) / 5) * 5;
  // 'ok', 'max', 'two' (already using two other paths) or 'cap' (another path is already past tier 2)
  function upState(t, p) {
    if (t.up[p] >= 6) return 'max';
    const nu = t.up.slice(); nu[p]++;
    if (nu.filter((v) => v > 0).length > 2) return 'two';
    if (nu.filter((v) => v > 2).length > 1) return 'cap';
    return 'ok';
  }
  const pc = (v) => Math.round(v * 100) + '%';
  const DESC = {
    splash: (v) => `+${v} blast size`, pierce: (v) => `+${v} pierce`, burn: (v) => `+burn damage`, burnT: (v) => `burns ${v}s longer`,
    stun: (v) => `+${v}s stun`, knock: (v) => `+${v} knockback`, shred: (v) => `strips ${v} armor per hit`, air: (v) => `+${pc(v)} vs flying`,
    shots: (v) => `+${v} shot${v > 1 ? 's' : ''}`, jumps: (v) => `+${v} jump${v > 1 ? 's' : ''}`, chainR: () => 'longer jumps', slow: (v) => `+${pc(v)} slow`,
    pull: (v) => `+${v} pull`, boost: (v) => `+${pc(v)} to its boost`, auraRate: (v) => `nearby towers +${pc(v)} attack speed`,
    income: (v) => `+$${v} each wave`, interest: (v) => `+${Math.round(v * 1000) / 10}% interest`, bounty: (v) => `+${pc(v)} cash from every kill`,
    mineCap: (v) => `+${v} pins at once`, mineSplash: () => 'bigger pops', puddleT: (v) => `puddles last ${v}s longer`, puddleR: () => 'bigger puddles',
    rampMax: () => 'beam ramps higher', rampSpeed: () => 'beam ramps faster', armorIgnore: () => 'ignores armor', crit: (v) => `${pc(v)} chance to hit 4x`,
    boss: (v) => `+${pc(v)} vs bosses`, brittle: (v) => `slowed bugs take +${pc(v)} damage`, poisonT: (v) => `poison lasts ${v}s longer`,
    hitAir: () => 'hits flying bugs too', stunBoss: () => 'sticks to bosses briefly', pullBoss: () => 'pulls bosses a little', freezeMoth: () => 'slows moths too',
    dmg: (v) => `+${v} damage`,
  };
  const XNAME = { dmg: 'damage', rate: 'attack speed', range: 'range' };
  const describe = (m) => Object.entries(m).map(([k, v]) => (k[0] === 'x' ? `+${pc(v - 1)} ${XNAME[k.slice(1)]}` : DESC[k](v))).join(', ');

  // ---------- stats: base + upgrade tiers, then auras from nearby towers ----------
  const DEF = { splash: 0, pierce: 0, burn: 0, burnT: 2.5, stun: 0, knock: 0, shred: 0, air: 1, shots: 1, jumps: 0, chainR: 55, slow: 0, pull: 0, boost: 0, auraRate: 0, income: 0, interest: 0, bounty: 0, mineCap: 5, mineSplash: 20, puddleT: 4, puddleR: 13, rampMax: 2, rampSpeed: 0.6, armorIgnore: 0, crit: 0, boss: 1, brittle: 0, poisonT: 3 };
  function baseStat(t) {
    const b = T[t.type], s = { ...DEF, ...b };
    for (let p = 0; p < 3; p++) {
      const tiers = pathOf(t.type, p)[1];
      for (let i = 0; i < t.up[p]; i++) for (const [k, v] of Object.entries(tiers[i][1])) {
        if (k[0] === 'x') s[k.slice(1)] *= v;
        else if (v === true) s[k] = true;
        else s[k] += k === 'burn' ? v * (b.burnScale || 1) : v;
      }
    }
    return s;
  }
  function refreshStats() {
    for (const t of towers) t.b = baseStat(t);
    for (const t of towers) {
      const s = { ...t.b };
      for (const o of towers) {
        const k = o.b.kind;
        if (o === t || (k !== 'auraDmg' && k !== 'auraRange') || Math.hypot(o.x - t.x, o.y - t.y) > o.b.range) continue;
        if (k === 'auraDmg') s.dmg *= 1 + o.b.boost; else s.range *= 1 + o.b.boost;
        s.rate *= 1 + o.b.auraRate;
      }
      t.s = s;
    }
    st.bounty = Math.min(0.75, towers.reduce((a, t) => a + (t.b.bounty || 0), 0));
  }
  const towerAt = (cx, cy) => towers.find((t) => t.cx === cx && t.cy === cy);

  const TRUE_DMG = { armorIgnore: 1 };
  function hurt(b, dmg, s = {}) {
    if (b.dead || dmg <= 0) return;
    if (b.fly && s.air) dmg *= s.air;
    if (b.boss && s.boss) dmg *= s.boss;
    if (b.brittleT > 0) dmg *= 1 + b.brittle;
    const real = Math.max(dmg * 0.25, dmg - b.armor * (1 - (s.armorIgnore || 0)));
    b.hp -= real;
    if (b.hp <= 0) kill(b);
  }
  // one hit from a tower: damage plus whatever extras its upgrades gave it
  function applyHit(b, s, dmg) {
    hurt(b, dmg, s);
    if (s.knock && !b.boss && (!b.fly || s.hitAir)) push(b, s.knock);
    if (s.burn) { b.burnT = Math.max(b.burnT, s.burnT); b.burnDps = Math.max(b.burnDps, s.burn); }
    // a short immunity after each stun so nothing can be held in place forever
    if (s.stun && (!b.boss || s.stunBoss) && !(b.stunCD > 0)) { const d = b.boss ? s.stun * 0.3 : s.stun; b.stunT = Math.max(b.stunT, d); b.stunCD = d + 0.6; }
    if (s.shred) b.armor = Math.max(0, b.armor - s.shred);
    if (s.slow && s.kind !== 'slow') { b.slowT = Math.max(b.slowT, 1); b.slowMul = Math.min(b.slowMul, 1 - Math.min(0.75, s.slow)); }
  }
  // knockback and magnet pulls: each bug can only be pushed back so far in total, so nothing is stuck forever
  const PUSH_MAX = 240;
  function push(b, d) { const n = Math.min(d, PUSH_MAX - (b.pushed || 0), b.d); if (n > 0) { b.d -= n; b.pushed = (b.pushed || 0) + n; } }
  function kill(b) {
    if (b.dead) return;
    b.dead = true; st.money += b.reward * (1 + (st.bounty || 0));
    if (b.split) for (let i = 0; i < b.split; i++) spawn('worm', { pi: b.pi, d: b.d });
    if (b.boss) { A.sfx('boom'); fxs.push({ ring: true, x: b.x, y: b.y, t: 0, col: b.color }); }
  }
  function inRange(t, s, groundOnly) { return bugs.filter((b) => !b.dead && (!groundOnly || !b.fly) && Math.hypot(b.x - t.x, b.y - t.y) <= s.range); }
  // targeting: First (furthest along), Last, Strong (most hp), Close
  function rank(t) {
    const m = t.target || 0;
    return m === 0 ? (a, b) => b.d - a.d : m === 1 ? (a, b) => a.d - b.d : m === 2 ? (a, b) => b.hp - a.hp : (a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y);
  }
  const pick = (t, list) => { const r = rank(t); return list.reduce((a, b) => (r(b, a) < 0 ? b : a)); };

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
      const line = `<b>${t.em} ${t.name}</b> · ${t.cost}${t.range ? ` · range ${t.range}` : ''}<br>${t.desc}<br><span class="muted small">Upgrade paths: ${TP[id].map((k) => PT[k][0]).join(' · ')}</span>`;
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
    const b = sv.loadout.map((id, i) => [4 + i * (SLOT_W + 1), SLOT_W, 'slot:' + i]);
    b.push([280, 76, 'wave']);
    return b;
  }
  const waveCount = (n) => Math.min(60, 6 + n * 2) + (n % 10 === 0 ? 1 : 0) + (n > 30 && n % 5 === 0 ? 1 : 0);
  function onButton(id) {
    if (id.startsWith('slot:')) { const i = Number(id.slice(5)); pickSlot = pickSlot === i ? null : i; sel = null; return; }
    if (id === 'wave') startWave();
  }

  // ---------- upgrade panel (opens over the board, away from the selected tower) ----------
  const PW = 352, PH = 152;
  const panelRect = () => ({ x: 4, y: sel.y < 170 ? H - PH - 4 : 4, w: PW, h: PH });
  function panelButtons() {
    const r = panelRect(), b = [[r.x + r.w - 24, r.y + 5, 19, 19, 'close'], [r.x + r.w - 104, r.y + 5, 76, 19, 'sell']];
    if (AIMS.has(T[sel.type].kind)) b.push([r.x + r.w - 172, r.y + 5, 64, 19, 'target']);
    for (let p = 0; p < 3; p++) b.push([r.x + r.w - 76, r.y + 32 + p * 40, 70, 34, 'buy:' + p]);
    return b;
  }
  const inBox = (m, x, y, w, h) => m.x >= x && m.x <= x + w && m.y >= y && m.y <= y + h;
  const sellValue = (t) => Math.floor(t.spent * 0.7);
  function buy(p) {
    if (!sel || upState(sel, p) !== 'ok') { A.sfx('hurt'); return; }
    const c = tierCost(sel, p);
    if (st.money < c) { A.sfx('hurt'); return; }
    st.money -= c; sel.spent += c; sel.up[p]++;
    const stack = fxs.filter((f) => f.small && f.x === sel.x && f.t < 0.3).length;
    fxs.push({ text: pathOf(sel.type, p)[1][sel.up[p] - 1][0], x: sel.x, y: sel.y - 14 - stack * 13, t: -0.3, small: true, col: PCOL[p] });
    A.sfx('buy'); refreshStats();
  }
  function onPanel(id) {
    if (id === 'close') sel = null;
    else if (id === 'sell') { st.money += sellValue(sel); towers = towers.filter((t) => t !== sel); sel = null; A.sfx('coin'); refreshStats(); }
    else if (id === 'target') { sel.target = ((sel.target || 0) + 1) % TARGETS.length; A.sfx('click'); }
    else if (id.startsWith('buy:')) buy(Number(id.slice(4)));
  }
  function wrap(g, text, maxW) {
    const lines = []; let cur = '';
    for (const w of text.split(' ')) { const t = cur ? cur + ' ' + w : w; if (cur && g.measureText(t).width > maxW) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    return lines;
  }
  function pill(g, x, y, w, h, r, fill) { g.fillStyle = fill; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); }
  function drawPanel(g, cs) {
    const r = panelRect(), t = sel;
    g.save(); g.shadowColor = '#000000aa'; g.shadowBlur = 12; pill(g, r.x, r.y, r.w, r.h, 10, cs.panel); g.restore();
    g.strokeStyle = cs.line; g.lineWidth = 1; g.beginPath(); g.roundRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 10); g.stroke();
    // header
    drawTowerIcon(g, t.type, r.x + 16, r.y + 15, 10);
    g.textAlign = 'left'; g.fillStyle = cs.text; g.font = '700 12.5px Segoe UI'; g.fillText(T[t.type].name, r.x + 31, r.y + 13);
    g.fillStyle = cs.muted; g.font = '9.5px Segoe UI'; g.fillText(`${t.up.join('-')} · spent $${t.spent}`, r.x + 31, r.y + 24);
    const mx = A.mouse;
    for (const [x, y, w, h, id] of panelButtons()) {
      const hov = inBox(mx, x, y, w, h);
      if (id === 'close') { pill(g, x, y, w, h, 6, hov ? cs.line : cs.card); g.strokeStyle = cs.text; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + 6, y + 6); g.lineTo(x + w - 6, y + h - 6); g.moveTo(x + w - 6, y + 6); g.lineTo(x + 6, y + h - 6); g.stroke(); continue; }
      if (id === 'sell') { pill(g, x, y, w, h, 6, hov ? '#c0392b' : cs.card); g.fillStyle = hov ? '#fff' : cs.bad; g.font = '600 10.5px Segoe UI'; g.textAlign = 'center'; g.fillText(`Sell $${sellValue(t)}`, x + w / 2, y + 13); continue; }
      if (id === 'target') { pill(g, x, y, w, h, 6, hov ? cs.line : cs.card); g.fillStyle = cs.text; g.font = '600 10.5px Segoe UI'; g.textAlign = 'center'; g.fillText(`◎ ${TARGETS[t.target || 0]}`, x + w / 2, y + 13); continue; }
      // a path row
      const p = Number(id.slice(4)), [pname, tiers] = pathOf(t.type, p), n = t.up[p], state = upState(t, p);
      const ry = r.y + 30 + p * 40, cost = n < 6 ? tierCost(t, p) : 0, afford = st.money >= cost;
      pill(g, r.x + 5, ry, r.w - 10, 38, 7, cs.card);
      g.fillStyle = PCOL[p]; g.fillRect(r.x + 5, ry + 6, 3, 26);
      g.textAlign = 'left'; g.fillStyle = state === 'ok' || state === 'max' ? cs.text : cs.muted; g.font = '700 11px Segoe UI'; g.fillText(pname, r.x + 13, ry + 14);
      for (let i = 0; i < 6; i++) {
        const px = r.x + 13 + i * 12, py = ry + 21, lockedTier = i >= 2 && state === 'cap' && n <= 2 && i >= n;
        pill(g, px, py, 10, 9, 2, i < n ? PCOL[p] : lockedTier ? '#00000040' : cs.line);
        if (i === 2) { g.fillStyle = cs.muted; g.fillRect(px - 2, py - 1, 1, 11); }
      }
      // the next tier (or why it's locked)
      const tx = r.x + 92, tw = r.w - 92 - 82;
      let title, body, tcol = cs.text;
      if (state === 'max') { title = `${tiers[5][0]} (max)`; body = describe(tiers[5][1]); tcol = PCOL[p]; }
      else if (state === 'two') { title = 'Locked'; body = 'You already upgrade two other paths.'; tcol = cs.muted; }
      else if (state === 'cap') { title = 'Stops at tier 2'; body = 'Only one path can go past tier 2.'; tcol = cs.muted; }
      else { title = `${n + 1}. ${tiers[n][0]}`; body = describe(tiers[n][1]); }
      g.fillStyle = tcol; g.font = '700 10.5px Segoe UI'; g.fillText(title, tx, ry + 13, tw);
      g.fillStyle = cs.muted; g.font = '9.5px Segoe UI';
      wrap(g, body, tw).slice(0, 2).forEach((l, i) => g.fillText(l, tx, ry + 25 + i * 10.5, tw));
      // buy button
      const ok = state === 'ok' && afford, hov2 = inBox(mx, x, y, w, h);
      pill(g, x, y, w, h, 7, state === 'ok' ? (ok ? (hov2 ? cs.accent : cs.accent + 'cc') : cs.line) : '#00000030');
      g.textAlign = 'center';
      if (state === 'max') { g.fillStyle = PCOL[p]; g.font = '800 12px Segoe UI'; g.fillText('MAX', x + w / 2, y + 21); }
      else if (state !== 'ok') { g.fillStyle = cs.muted; g.font = '700 11px Segoe UI'; g.fillText('Locked', x + w / 2, y + 21); }
      else {
        g.fillStyle = ok ? cs.onAccent : cs.muted; g.font = '800 12.5px Segoe UI'; g.fillText('$' + cost, x + w / 2, y + 16);
        g.font = '9px Segoe UI'; g.fillText(`${'ZXC'[p]} · tier ${n + 1}`, x + w / 2, y + 28);
      }
    }
  }
  function tooltip(g, cs, x, y, title, body, w = 170) {
    g.font = '9.5px Segoe UI'; const lines = wrap(g, body, w - 14), h = 22 + lines.length * 11;
    x = clamp(x - w / 2, 3, W - w - 3); y = clamp(y - h, 3, H - h - 3);
    g.save(); g.shadowColor = '#000000aa'; g.shadowBlur = 8; pill(g, x, y, w, h, 7, cs.panel); g.restore();
    g.strokeStyle = cs.line; g.lineWidth = 1; g.beginPath(); g.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 7); g.stroke();
    g.textAlign = 'left'; g.fillStyle = cs.text; g.font = '700 11px Segoe UI'; g.fillText(title, x + 7, y + 14, w - 14);
    g.fillStyle = cs.muted; g.font = '9.5px Segoe UI'; lines.forEach((l, i) => g.fillText(l, x + 7, y + 27 + i * 11));
  }
  function drawHud(g, cs) {
    g.font = '700 11px Segoe UI';
    const parts = [['♥ ', '#ff5d6c'], [String(st.lives), '#fff'], ['   $', '#3ccf8e'], [String(Math.floor(st.money)), '#fff'], ['   Wave ', '#ffffffaa'], [st.endless || st.wave > WIN_WAVE ? String(st.wave) : `${st.wave}/${WIN_WAVE}`, '#fff']];
    const hw = parts.reduce((a, [t]) => a + g.measureText(t).width, 0);
    pill(g, 3, 3, hw + 16, 18, 6, '#000000a0');
    g.textAlign = 'left'; let hx = 11;
    for (const [t, c] of parts) { g.fillStyle = c; g.fillText(t, hx, 16); hx += g.measureText(t).width; }
    pill(g, 324, 3, 33, 18, 6, st.speed > 1 ? cs.accent : '#000000a0');
    g.fillStyle = st.speed > 1 ? cs.onAccent : '#fff'; g.font = '700 11px Segoe UI'; g.textAlign = 'center'; g.fillText(`${st.speed}x`, 340.5, 16);
  }
  function drawTierMarks(g, t) {
    let row = 0, top = -1, topP = 0;
    for (let p = 0; p < 3; p++) {
      if (t.up[p] > top) { top = t.up[p]; topP = p; }
      if (!t.up[p]) continue;
      g.fillStyle = PCOL[p];
      for (let i = 0; i < t.up[p]; i++) g.fillRect(t.x - 9 + i * 3, t.y + 11 + row * 3, 2, 2);
      row++;
    }
    if (top >= 3) {
      g.save(); if (top >= 6) { g.shadowColor = PCOL[topP]; g.shadowBlur = 8; }
      g.strokeStyle = PCOL[topP]; g.lineWidth = top >= 5 ? 2 : 1.5; g.beginPath(); g.arc(t.x, t.y, 12, 0, 7); g.stroke(); g.restore();
    }
  }

  GAMES.td = {
    name: 'Desk Defense', W, H,
    help: 'Pick a tower (1-8), click a square to build. Click a tower for its 3 upgrade paths: use two, only one past tier 2 (Z/X/C buy, T target). F speed, Space next wave.',
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
      if (sel) { ['KeyZ', 'KeyX', 'KeyC'].forEach((k, p) => { if (A.hit(k)) buy(p); }); if (A.hit('KeyT') && AIMS.has(T[sel.type].kind)) onPanel('target'); }
      if (m.rclicked) { pickSlot = null; sel = null; }
      if (m.clicked) {
        const pr = sel && panelRect();
        if (pr && inBox(m, pr.x, pr.y, pr.w, pr.h)) { const b = panelButtons().find(([x, y, w, h]) => inBox(m, x, y, w, h)); if (b) onPanel(b[4]); }
        else if (m.x > 322 && m.y < 22) st.speed = st.speed === 1 ? 2 : st.speed === 2 ? 3 : 1;
        else if (m.y > BAR) { sel = null; const b = barButtons().find(([x, w]) => m.x >= x && m.x <= x + w && m.y >= BTN_Y && m.y <= BTN_Y + BTN_H); if (b) onButton(b[2]); }
        else {
          const cx = Math.floor(m.x / C), cy = Math.floor(m.y / C), t = towerAt(cx, cy);
          if (t) { sel = sel === t ? null : t; pickSlot = null; }
          else if (pickSlot != null && cx >= 0 && cx < COLS && !pathCells.has(`${cx},${cy}`)) {
            const id = sv.loadout[pickSlot], cost = T[id].cost;
            if (st.money >= cost) { st.money -= cost; towers.push({ type: id, cx, cy, x: cx * C + C / 2, y: cy * C + C / 2, up: [0, 0, 0], target: 0, cd: 0.2, spent: cost, ang: 0, beamT: null, ramp: 0 }); A.sfx('buy'); refreshStats(); }
            else A.sfx('hurt');
          } else sel = null;
        }
      }
      const dt = dt0 * st.speed;
      refreshStats();
      // spawning
      if (st.queue.length && (st.spawnT -= dt) <= 0) { spawn(st.queue.shift()); st.spawnT = Math.max(0.35, 0.8 - st.wave * 0.01); }
      // bugs: effects and movement along the path
      for (const b of bugs) {
        if (b.dead) continue;
        if (b.burnT > 0) { b.burnT -= dt; hurt(b, b.burnDps * dt, TRUE_DMG); }
        if (b.poisonT > 0) { b.poisonT -= dt; hurt(b, b.poisonDps * dt, TRUE_DMG); }
        if (b.regen) b.hp = Math.min(b.max, b.hp + b.regen * dt * (b.max / BUGS[b.kind].hp) * 0.3);
        if (b.spawns && (b.spawnT -= dt) <= 0) { b.spawnT = 3; spawn(b.spawns, { pi: b.pi, d: b.d }); }
        if (b.stunT > 0) { b.stunT -= dt; }
        else {
          const slow = (!b.noSlow || b.chillT > 0) && b.slowT > 0 ? b.slowMul : 1;
          b.d += b.speed * slow * dt;
        }
        b.slowT -= dt; if (b.slowT <= 0) b.slowMul = 1;
        b.chillT = (b.chillT || 0) - dt; b.stunCD = (b.stunCD || 0) - dt; b.brittleT = (b.brittleT || 0) - dt;
        const p = posAt(paths[b.pi], b.d); b.x = p.x; b.y = p.y;
        if (b.d >= paths[b.pi].total) { b.dead = true; b.escaped = true; escape(b); }
      }
      // puddles and mines
      for (const pd of puddles) {
        pd.t -= dt;
        for (const b of bugs) if (!b.dead && (!b.fly || pd.s.hitAir) && Math.hypot(b.x - pd.x, b.y - pd.y) < pd.r) { b.slowT = Math.max(b.slowT, 0.2); b.slowMul = Math.min(b.slowMul, 1 - Math.min(0.75, pd.s.slow)); hurt(b, pd.s.dmg * 2.5 * dt, { ...pd.s, armorIgnore: 1 }); }
      }
      puddles = puddles.filter((p) => p.t > 0);
      for (const mi of mines) for (const b of bugs) if (!mi.used && !b.dead && (!b.fly || mi.s.hitAir) && Math.hypot(b.x - mi.x, b.y - mi.y) < 10) {
        mi.used = true; A.sfx('hit'); fxs.push({ ring: true, x: mi.x, y: mi.y, t: 0, col: '#e74c3c', r: mi.s.mineSplash });
        for (const o of bugs) if ((!o.fly || mi.s.hitAir) && Math.hypot(o.x - mi.x, o.y - mi.y) < mi.s.mineSplash) hurt(o, mi.s.dmg, mi.s);
      }
      mines = mines.filter((m2) => !m2.used && towers.includes(m2.owner));
      // towers
      for (const t of towers) {
        const s = t.s; t.cd -= dt;
        const k = s.kind;
        if (k === 'income' || k === 'auraDmg' || k === 'auraRange') continue;
        if (k === 'slow') {
          const list = inRange(t, s);
          for (const b of list) {
            b.slowT = Math.max(b.slowT, 0.3); b.slowMul = Math.min(b.slowMul, 1 - Math.min(0.8, s.slow));
            if (s.freezeMoth) b.chillT = 0.3;
            if (s.brittle) { b.brittle = Math.max(b.brittleT > 0 ? b.brittle : 0, s.brittle); b.brittleT = 0.3; }
          }
          if (t.cd <= 0 && list.length) { t.cd = 1 / s.rate; for (const b of list) hurt(b, s.dmg, s); }
          t.ang += dt * (list.length ? 14 : 3); continue;
        }
        if (k === 'beam') {
          const list = inRange(t, s);
          if (!list.length) { t.beamT = null; t.ramp = 0; continue; }
          const tg = t.beamT && list.includes(t.beamT) ? t.beamT : pick(t, list);
          if (tg !== t.beamT) { t.beamT = tg; t.ramp = 0; }
          t.ramp = Math.min(s.rampMax, t.ramp + dt * s.rampSpeed);
          hurt(tg, s.dmg * (1 + t.ramp) * dt, s); t.ang = Math.atan2(tg.y - t.y, tg.x - t.x); continue;
        }
        if (t.cd > 0) continue;
        if (k === 'puddle') {
          const spots = paths.flatMap((pa) => { const out = []; for (let d = 0; d < pa.total; d += 12) { const q = posAt(pa, d); if (Math.hypot(q.x - t.x, q.y - t.y) <= s.range) out.push(q); } return out; });
          if (spots.length && inRange(t, s, !s.hitAir).length) { const q = spots[irand(0, spots.length - 1)]; puddles.push({ x: q.x, y: q.y, t: s.puddleT, r: s.puddleR, s }); t.cd = 1 / s.rate; }
          continue;
        }
        if (k === 'mines') {
          if (mines.filter((mm) => mm.owner === t).length < s.mineCap) {
            const spots = paths.flatMap((pa) => { const out = []; for (let d = 0; d < pa.total; d += 10) { const q = posAt(pa, d); if (Math.hypot(q.x - t.x, q.y - t.y) <= s.range) out.push(q); } return out; });
            if (spots.length) { const q = spots[irand(0, spots.length - 1)]; mines.push({ x: q.x + rand(-4, 4), y: q.y + rand(-4, 4), s, owner: t }); }
          }
          t.cd = 1 / s.rate; continue;
        }
        const ground = !!s.knock && !s.hitAir;
        const list = k === 'snipe' && s.range > 300 ? bugs.filter((b) => !b.dead) : inRange(t, s, ground);
        if (!list.length) continue;
        t.cd = 1 / s.rate;
        if (k === 'pulse') { for (const b of list) applyHit(b, s, s.dmg); fxs.push({ ring: true, x: t.x, y: t.y, t: 0, col: '#ecf0f1', r: s.range }); A.sfx('shoot'); continue; }
        if (k === 'cloud') {
          for (const b of list) { b.poisonT = Math.max(b.poisonT, s.poisonT); b.poisonDps = Math.max(b.poisonDps, s.dmg); if (s.shred) b.armor = Math.max(0, b.armor - s.shred); if (s.slow) { b.slowT = Math.max(b.slowT, 1); b.slowMul = Math.min(b.slowMul, 1 - s.slow); } }
          fxs.push({ cloud: true, x: t.x, y: t.y, t: 0, r: s.range }); continue;
        }
        if (k === 'pull') {
          for (const b of list) {
            if (b.fly && !s.hitAir) continue;
            if (b.boss && !s.pullBoss) continue;
            push(b, s.pull * (b.boss ? 0.25 : 1));
            if (s.dmg > 0 || s.stun) applyHit(b, s, s.dmg);
          }
          fxs.push({ ring: true, x: t.x, y: t.y, t: 0, col: '#c0392b', r: s.range, inward: true }); A.sfx('block'); continue;
        }
        const tg = pick(t, list);
        t.ang = Math.atan2(tg.y - t.y, tg.x - t.x);
        const crit = () => (s.crit && Math.random() < s.crit ? 4 : 1);
        if (k === 'snipe') { applyHit(tg, s, s.dmg * crit()); fxs.push({ line: true, x: t.x, y: t.y, x2: tg.x, y2: tg.y, t: 0, col: s.col }); A.sfx('shoot'); continue; }
        if (k === 'chain') {
          let cur = tg; const hit = [];
          for (let j = 0; j <= s.jumps && cur; j++) {
            const from = j ? hit[j - 1] : t;
            hit.push(cur); applyHit(cur, s, s.dmg * Math.max(0.3, 1 - j * 0.12));
            fxs.push({ line: true, zap: true, x: from.x, y: from.y, x2: cur.x, y2: cur.y, t: 0, col: '#d2b4ff' });
            const c0 = cur;
            cur = bugs.filter((b) => !b.dead && !hit.includes(b) && Math.hypot(b.x - c0.x, b.y - c0.y) < s.chainR).sort((a, b) => Math.hypot(a.x - c0.x, a.y - c0.y) - Math.hypot(b.x - c0.x, b.y - c0.y))[0];
          }
          A.sfx('shoot'); continue;
        }
        const targets = s.shots > 1 ? list.sort(rank(t)).slice(0, Math.round(s.shots)) : [tg];
        if (s.instant) { for (const tt of targets) { applyHit(tt, s, s.dmg * crit()); fxs.push({ slash: true, x: tt.x, y: tt.y, t: 0 }); } A.sfx('swing'); continue; }
        for (const tt of targets) shots.push({ x: t.x, y: t.y, tgt: tt, dmg: s.dmg * crit(), s, pierceLeft: s.pierce, hitSet: new Set(), speed: s.homing ? 220 : 330, ang: Math.atan2(tt.y - t.y, tt.x - t.x) });
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
          if (s.knock && b.fly && !s.hitAir) continue;
          sh.hitSet.add(b);
          if (s.splash) { for (const o of bugs) if (!o.dead && Math.hypot(o.x - b.x, o.y - b.y) < s.splash) applyHit(o, s, sh.dmg); fxs.push({ ring: true, x: b.x, y: b.y, t: 0, col: '#ffffff', r: s.splash }); }
          else applyHit(b, s, sh.dmg);
          if (sh.pierceLeft-- <= 0) { sh.done = true; break; }
        }
      }
      shots = shots.filter((s) => !s.done);
      fxs = fxs.filter((f) => (f.t += dt0) < (f.small ? 0.7 : 0.35));
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
        let earned = 0;
        for (const t of towers) if (t.b.kind === 'income') earned += t.b.income + Math.floor(Math.min(st.money, 3000) * t.b.interest);
        st.money += earned;
        const xp = Math.round((10 + st.wave * 2) * map.mult);
        sv.xp += xp; st.xpGained += xp;
        sv.maps[map.id] = Math.max(sv.maps[map.id] || 0, st.wave);
        fxs.push({ text: `+${xp} XP`, x: W / 2, y: BAR / 2, t: -0.8 });
        if (earned) fxs.push({ text: `+$${earned}`, x: W / 2, y: BAR / 2 + 24, t: -0.8, small: true, col: '#3ccf8e' });
        A.sfx('win');
        if (st.wave >= WIN_WAVE && !sv.cleared[map.id] && !st.endless) {
          sv.cleared[map.id] = true; sv.xp += 300; st.xpGained += 300;
          A.overlay('Desk defended!', `You held ${map.name} for ${WIN_WAVE} waves. <b>+300 XP</b> bonus.`, [['Keep going', () => { st.endless = true; A.hideOverlay(); }], ['Maps', menu, true]]);
        }
        persist();
      }
      A.hud(map.name);
    },
    draw(g) {
      const cs = { bg: css('--bg'), accent: css('--accent'), onAccent: css('--on-accent'), panel: css('--panel'), card: css('--card'), text: css('--text'), muted: css('--muted'), line: css('--line'), bad: css('--bad') || '#ff5d6c' };
      g.fillStyle = cs.bg; g.fillRect(0, 0, W, H);
      if (!st) return;
      if (towers.length && !towers[0].s) refreshStats();
      const acc = cs.accent;
      drawBoard(g, map, 1, pathCells);
      for (const pd of puddles) { g.fillStyle = `rgba(111,78,55,${Math.min(0.8, pd.t / 2)})`; g.beginPath(); g.ellipse(pd.x, pd.y, pd.r, pd.r * 0.7, 0, 0, 7); g.fill(); }
      for (const mi of mines) { g.fillStyle = '#e74c3c'; g.beginPath(); g.arc(mi.x, mi.y, 3, 0, 7); g.fill(); g.fillStyle = '#ddd'; g.fillRect(mi.x - 0.5, mi.y - 0.5, 1, 1); }
      // placement preview
      const m = A.mouse, hx = Math.floor(m.x / C), hy = Math.floor(m.y / C);
      if (pickSlot != null && m.y < BAR && sv.loadout[pickSlot]) {
        const ok = !pathCells.has(`${hx},${hy}`) && !towerAt(hx, hy);
        g.fillStyle = ok ? '#ffffff22' : '#ff5d6c44'; g.fillRect(hx * C, hy * C, C, C);
        const r = T[sv.loadout[pickSlot]].range;
        if (r && r < 300) { g.fillStyle = '#ffffff10'; g.strokeStyle = '#ffffff66'; g.lineWidth = 1; g.beginPath(); g.arc(hx * C + C / 2, hy * C + C / 2, r, 0, 7); g.fill(); g.stroke(); }
        if (ok) { g.globalAlpha = 0.6; drawTowerIcon(g, sv.loadout[pickSlot], hx * C + C / 2, hy * C + C / 2, 10.5); g.globalAlpha = 1; }
      }
      if (sel) {
        const r = sel.s.range;
        if (r && r < 300) { g.fillStyle = acc + '1a'; g.strokeStyle = acc; g.lineWidth = 1.5; g.beginPath(); g.arc(sel.x, sel.y, r, 0, 7); g.fill(); g.stroke(); }
        g.strokeStyle = acc; g.lineWidth = 2; g.strokeRect(sel.cx * C + 1, sel.cy * C + 1, C - 2, C - 2);
      }
      // towers
      for (const t of towers) {
        drawTowerIcon(g, t.type, t.x, t.y, 10.5);
        if (T[t.type].kind === 'beam' && t.beamT && !t.beamT.dead) { g.strokeStyle = `rgba(198,255,61,${0.5 + t.ramp * 0.15})`; g.lineWidth = 2 + t.ramp; g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(t.beamT.x, t.beamT.y); g.stroke(); }
        drawTierMarks(g, t);
      }
      // bugs
      for (const b of bugs) {
        const wob = Math.sin(performance.now() / 80 + b.wob) * 1.2;
        if (b.fly) { g.fillStyle = '#00000033'; g.beginPath(); g.ellipse(b.x, b.y + 7, b.r, b.r * 0.4, 0, 0, 7); g.fill(); }
        const by = b.y + wob - (b.fly ? 5 : 0);
        g.fillStyle = b.stunT > 0 ? '#d6c8a7' : b.slowT > 0 && (!b.noSlow || b.chillT > 0) ? '#7fb8ff' : b.color;
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
        const a = Math.max(0, 1 - Math.max(0, f.t) / (f.small ? 0.7 : 0.35));
        if (f.ring) { g.strokeStyle = f.col; g.globalAlpha = a; g.lineWidth = 2; g.beginPath(); g.arc(f.x, f.y, f.inward ? (f.r || 20) * a : (f.r || 22) * (1 - a * 0.7), 0, 7); g.stroke(); g.globalAlpha = 1; }
        if (f.cloud) { g.fillStyle = `rgba(46,204,113,${a * 0.25})`; g.beginPath(); g.arc(f.x, f.y, f.r, 0, 7); g.fill(); }
        if (f.line) { g.strokeStyle = f.col; g.globalAlpha = a; g.lineWidth = f.zap ? 2 : 1.5; g.beginPath(); g.moveTo(f.x, f.y); if (f.zap) { const mx = (f.x + f.x2) / 2 + rand(-6, 6), my = (f.y + f.y2) / 2 + rand(-6, 6); g.lineTo(mx, my); } g.lineTo(f.x2, f.y2); g.stroke(); g.globalAlpha = 1; }
        if (f.slash) { g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = 2; g.beginPath(); g.moveTo(f.x - 8, f.y - 8); g.lineTo(f.x + 8, f.y + 8); g.stroke(); }
        if (f.text) {
          g.globalAlpha = f.t < 0 ? 1 : a; g.textAlign = 'center';
          g.font = f.small ? '800 11px Segoe UI' : '800 20px Segoe UI';
          g.lineWidth = 3; g.strokeStyle = '#000000aa'; g.strokeText(f.text, f.x, f.y - Math.max(0, f.t) * 40);
          g.fillStyle = f.col || acc; g.fillText(f.text, f.x, f.y - Math.max(0, f.t) * 40); g.globalAlpha = 1;
        }
      }
      for (const f of st.flash) { g.fillStyle = `rgba(255,93,108,${0.6 - f.t})`; g.fillRect(0, f.y - 14, 14, 28); }
      drawHud(g, cs);
      // bottom bar
      g.fillStyle = cs.panel; g.fillRect(0, BAR, W, H - BAR);
      g.fillStyle = cs.line; g.fillRect(0, BAR, W, 1);
      let tip = null;
      for (const [x, w, id] of barButtons()) {
        const hov = inBox(m, x, BTN_Y, w, BTN_H);
        if (id.startsWith('slot:')) {
          const i = Number(id.slice(5)), tid = sv.loadout[i], on = pickSlot === i, ok = st.money >= T[tid].cost;
          pill(g, x, BTN_Y, w, BTN_H, 6, on ? acc : hov ? cs.line : cs.card);
          g.globalAlpha = ok ? 1 : 0.4; drawTowerIcon(g, tid, x + w / 2, BTN_Y + 14, 10);
          g.textAlign = 'center'; g.fillStyle = on ? cs.onAccent : ok ? cs.text : cs.muted; g.font = '600 9.5px Segoe UI'; g.fillText('$' + T[tid].cost, x + w / 2, BTN_Y + 32); g.globalAlpha = 1;
          g.fillStyle = on ? cs.onAccent : cs.muted; g.font = '700 7.5px Segoe UI'; g.textAlign = 'left'; g.fillText(String(i + 1), x + 3, BTN_Y + 9);
          if (hov && !sel) tip = [x + w / 2, BTN_Y - 4, `${T[tid].name} · $${T[tid].cost}`, `${T[tid].desc} Upgrades: ${TP[tid].map((k) => PT[k][0]).join(', ')}.`];
          continue;
        }
        // wave button with progress
        const live = !st.between, n = live ? st.wave : st.wave + 1;
        pill(g, x, BTN_Y, w, BTN_H, 7, st.between ? (hov ? acc : acc + 'd0') : cs.card);
        if (live) { const total = waveCount(st.wave), left = bugs.length + st.queue.length; pill(g, x + 5, BTN_Y + BTN_H - 7, (w - 10), 3, 2, cs.line); pill(g, x + 5, BTN_Y + BTN_H - 7, (w - 10) * clamp(1 - left / total, 0, 1), 3, 2, acc); }
        g.textAlign = 'center'; g.fillStyle = st.between ? cs.onAccent : cs.text;
        g.font = '700 11px Segoe UI'; g.fillText(st.between ? (st.wave === 0 ? '▶ Start' : '▶ Wave ' + n) : `Wave ${n}`, x + w / 2, BTN_Y + 15, w - 6);
        g.font = '9.5px Segoe UI'; g.fillStyle = st.between ? cs.onAccent : cs.muted;
        g.fillText(live ? `${bugs.length + st.queue.length} bugs left` : `${waveCount(n)} bugs${n % 10 === 0 ? ' + boss' : ''}`, x + w / 2, BTN_Y + (live ? 26 : 28), w - 6);
      }
      // tower hover label
      if (!sel && pickSlot == null && m.y < BAR) {
        const t = towerAt(hx, hy);
        if (t) tip = [t.x, t.y - 14, `${T[t.type].name} · ${t.up.join('-')}`, `${TP[t.type].map((k, p) => `${PT[k][0]} ${t.up[p]}`).join(' · ')}${AIMS.has(T[t.type].kind) ? ' · aims ' + TARGETS[t.target || 0] : ''}. Click to upgrade.`];
      }
      if (sel) drawPanel(g, cs);
      if (tip) tooltip(g, cs, ...tip);
    },
  };
})();
