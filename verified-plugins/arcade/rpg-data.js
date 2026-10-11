// Sword Quest world data: tiles, items, monsters, quests, NPCs, and the region/dungeon builders.
// Regions are generated from fixed seeds, so the world is the same every time you play.
const RPG = (() => {
  const TS = 16;
  // tile ids
  const G = 0, FLOWER = 1, TREE = 2, WATER = 3, PATH = 4, SAND = 5, ROCK = 6, WALL = 7, ROOF = 8, DOOR = 9, FLOOR = 10, DWALL = 11, LAVA = 12, SNOW = 13, PINE = 14, ICE = 15, BRIDGE = 16, STONE = 17, CAVE = 18, FENCE = 19, DARK = 20;
  const SOLID = new Set([TREE, WATER, ROCK, WALL, ROOF, DWALL, PINE, FENCE, DARK]);

  const ITEMS = {
    wood: { name: 'Wooden Sword', kind: 'weapon', atk: 6, price: 0 },
    iron: { name: 'Iron Sword', kind: 'weapon', atk: 11, price: 120 },
    steel: { name: 'Steel Sword', kind: 'weapon', atk: 18, price: 420 },
    flame: { name: 'Flame Blade', kind: 'weapon', atk: 26, price: 950, burn: true },
    frost: { name: 'Frost Brand', kind: 'weapon', atk: 35, price: 1600, chill: true },
    tunic: { name: 'Tunic', kind: 'armor', def: 0, price: 0 },
    leather: { name: 'Leather Armor', kind: 'armor', def: 2, price: 90 },
    chain: { name: 'Chain Mail', kind: 'armor', def: 4, price: 260 },
    fur: { name: 'Fur Cloak', kind: 'armor', def: 6, price: 0 },
    plate: { name: 'Plate Armor', kind: 'armor', def: 8, price: 700 },
    dragon: { name: 'Dragon Mail', kind: 'armor', def: 12, price: 1900 },
    potion: { name: 'Potion', kind: 'potion', heal: 25, price: 20 },
    pelt: { name: 'Wolf Pelt', kind: 'quest' },
    glowcap: { name: 'Glowcap', kind: 'quest' },
    pickaxe: { name: "Old Pickaxe", kind: 'quest' },
    shard1: { name: 'Forest Shard', kind: 'key' },
    shard2: { name: 'Ember Shard', kind: 'key' },
    shard3: { name: 'Frost Shard', kind: 'key' },
  };

  // behaviour: hop (slime), chase, fly, shoot, charge
  const ENEMIES = {
    slime: { name: 'Slime', hp: 14, dmg: 4, speed: 34, r: 6, ai: 'hop', color: '#3f7d45', xp: 4, gold: [1, 4] },
    wolf: { name: 'Wolf', hp: 26, dmg: 6, speed: 72, r: 7, ai: 'chase', color: '#55585f', xp: 9, gold: [2, 6], drop: ['pelt', 0.45] },
    bat: { name: 'Bat', hp: 11, dmg: 4, speed: 82, r: 5, ai: 'fly', color: '#3f2f55', xp: 5, gold: [1, 3] },
    skeleton: { name: 'Skeleton', hp: 32, dmg: 7, speed: 38, r: 7, ai: 'shoot', shot: 'arrow', color: '#b3ad9d', xp: 14, gold: [3, 9] },
    scorpion: { name: 'Scorpion', hp: 38, dmg: 8, speed: 56, r: 7, ai: 'chase', color: '#7a4a1f', xp: 16, gold: [4, 10] },
    imp: { name: 'Fire Imp', hp: 30, dmg: 8, speed: 46, r: 6, ai: 'shoot', shot: 'fire', color: '#a8381c', xp: 17, gold: [4, 10] },
    golemite: { name: 'Rockling', hp: 55, dmg: 10, speed: 30, r: 8, ai: 'charge', color: '#4a4038', xp: 22, gold: [6, 14] },
    frostwolf: { name: 'Frost Wolf', hp: 48, dmg: 10, speed: 84, r: 7, ai: 'chase', color: '#8fa6bd', xp: 24, gold: [5, 12] },
    yeti: { name: 'Yeti', hp: 95, dmg: 15, speed: 40, r: 10, ai: 'charge', color: '#b9c2cc', xp: 40, gold: [10, 22] },
    wisp: { name: 'Ice Wisp', hp: 34, dmg: 9, speed: 60, r: 6, ai: 'shoot', shot: 'ice', color: '#5c9cc4', xp: 22, gold: [5, 12], flies: true },
    // bosses
    slimeking: { name: 'Slime King', hp: 320, dmg: 9, speed: 30, r: 18, ai: 'boss1', color: '#2e6b34', xp: 160, gold: [80, 80], boss: true },
    golem: { name: 'Magma Golem', hp: 650, dmg: 14, speed: 26, r: 20, ai: 'boss2', color: '#3b2e24', xp: 320, gold: [180, 180], boss: true },
    wyrm: { name: 'Frost Wyrm', hp: 950, dmg: 17, speed: 55, r: 20, ai: 'boss3', color: '#4e86b0', xp: 600, gold: [350, 350], boss: true },
  };

  const QUESTS = {
    lamp1: { title: 'The Fading Lamp', giver: 'elder', desc: 'The Great Lamp of Willowby is going dark. Bring back the Forest Shard from the Slime King in Mossy Cave (east, through Whisper Woods).', type: 'item', item: 'shard1', count: 1, reward: { gold: 100, xp: 80 }, next: 'lamp2', main: true },
    lamp2: { title: 'Embers of Hope', giver: 'elder', desc: 'The Ember Shard lies with the Magma Golem in Cinder Mine, up north in Ember Hills. The north gate is open now.', type: 'item', item: 'shard2', count: 1, reward: { gold: 250, xp: 200 }, next: 'lamp3', main: true },
    lamp3: { title: 'The Frozen Heart', giver: 'elder', desc: 'The last shard is held by the Frost Wyrm atop the Ice Tower on Frost Peak, past the west gate.', type: 'item', item: 'shard3', count: 1, reward: { gold: 500, xp: 500 }, main: true, final: true },
    slimes: { title: 'Slime Trouble', giver: 'farmer', desc: 'Slimes keep eating Bram\'s cabbages. Defeat 8 slimes in Whisper Woods.', type: 'kill', target: 'slime', count: 8, reward: { gold: 60, xp: 40, item: 'potion', n: 2 } },
    pelts: { title: 'Wolf Pelts', giver: 'hunter', desc: 'Hunter Ash needs 5 Wolf Pelts for the winter. Wolves in Whisper Woods drop them.', type: 'item', item: 'pelt', count: 5, take: true, reward: { gold: 40, xp: 60, item: 'leather' } },
    caps: { title: 'Glowing Supper', giver: 'innkeep', desc: 'Mira at the inn wants 6 Glowcaps. They grow in the shady parts of Whisper Woods.', type: 'item', item: 'glowcap', count: 6, take: true, reward: { gold: 50, xp: 50, item: 'potion', n: 4 } },
    pick: { title: 'The Lost Pickaxe', giver: 'miner', desc: 'Old Dunn dropped his lucky pickaxe somewhere in Ember Hills. It\'s in a chest near the lava pools.', type: 'item', item: 'pickaxe', count: 1, take: true, reward: { gold: 150, xp: 120, item: 'steel' } },
    cold: { title: 'Cold Feet', giver: 'ranger', desc: 'Frost Wolves stalk the ranger\'s camp. Defeat 6 of them.', type: 'kill', target: 'frostwolf', count: 6, reward: { gold: 120, xp: 200, item: 'fur' } },
  };

  // ---------- seeded randomness ----------
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function noise(w, h, r, scale) {
    // smooth random field from a coarse grid
    const gw = Math.ceil(w / scale) + 2, gh = Math.ceil(h / scale) + 2, grid = Array.from({ length: gw * gh }, () => r());
    const at = (x, y) => grid[y * gw + x];
    return (x, y) => {
      const fx = x / scale, fy = y / scale, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx, b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
      return a + (b - a) * sy;
    };
  }

  function blank(w, h, fill) { return { w, h, t: new Uint8Array(w * h).fill(fill), warps: [], npcs: [], chests: [], spawns: [], picks: [], signs: [] }; }
  const set = (m, x, y, v) => { if (x >= 0 && y >= 0 && x < m.w && y < m.h) m.t[y * m.w + x] = v; };
  const get = (m, x, y) => (x >= 0 && y >= 0 && x < m.w && y < m.h ? m.t[y * m.w + x] : DARK);
  const rect = (m, x, y, w, h, v) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(m, i, j, v); };
  function road(m, pts, v = PATH, width = 2) {
    for (let k = 0; k < pts.length - 1; k++) {
      let [x, y] = pts[k]; const [x2, y2] = pts[k + 1];
      while (x !== x2 || y !== y2) {
        for (let a = 0; a < width; a++) for (let b = 0; b < width; b++) { const cur = get(m, x + a, y + b); set(m, x + a, y + b, cur === WATER ? BRIDGE : v); }
        if (x !== x2) x += Math.sign(x2 - x); else y += Math.sign(y2 - y);
      }
    }
  }
  function house(m, x, y, w, h, doorX) {
    rect(m, x, y, w, h - 2, ROOF); rect(m, x, y + h - 2, w, 2, WALL); set(m, x + doorX, y + h - 1, DOOR);
  }
  function border(m, v) { for (let x = 0; x < m.w; x++) { set(m, x, 0, v); set(m, x, m.h - 1, v); } for (let y = 0; y < m.h; y++) { set(m, 0, y, v); set(m, m.w - 1, y, v); } }
  function scatter(m, r, nz, thresh, v, onto) { for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) if (onto.includes(get(m, x, y)) && nz(x, y) > thresh && r() < 0.85) set(m, x, y, v); }
  function clear(m, cx, cy, rad, v) { for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) set(m, x, y, v); }

  // ---------- regions ----------
  const BUILD = {
    village() {
      const m = blank(48, 38, G), r = rng(11);
      border(m, TREE);
      for (let i = 0; i < 90; i++) set(m, 1 + Math.floor(r() * 46), 1 + Math.floor(r() * 36), FLOWER);
      rect(m, 18, 14, 12, 10, STONE); // plaza
      rect(m, 22, 17, 4, 3, WATER); // fountain
      road(m, [[24, 1], [24, 14]]); road(m, [[1, 19], [18, 19]]); road(m, [[29, 19], [47, 19]]); road(m, [[24, 23], [24, 34]]);
      house(m, 6, 5, 8, 6, 3); road(m, [[9, 10], [9, 19]], PATH, 1);   // elder
      house(m, 33, 5, 8, 6, 3); road(m, [[36, 10], [36, 19]], PATH, 1); // shop
      house(m, 6, 26, 8, 6, 3); road(m, [[9, 31], [9, 33], [24, 33]], PATH, 1); // inn
      house(m, 33, 26, 8, 6, 3); road(m, [[36, 31], [36, 33], [25, 33]], PATH, 1); // smith
      for (let x = 2; x < 14; x++) set(m, x, 36, FENCE);
      rect(m, 2, 33, 4, 3, FLOWER); // farm patch
      // exits: east to the woods, north to the hills (gate), west to the peak (gate)
      for (let y = 18; y <= 20; y++) { set(m, 47, y, PATH); set(m, 0, y, PATH); }
      set(m, 24, 0, PATH); set(m, 25, 0, PATH);
      m.warps.push({ x: 47, y: 18, w: 1, h: 3, to: 'woods', tx: 2, ty: 24 });
      m.warps.push({ x: 24, y: 0, w: 2, h: 1, to: 'hills', tx: 31, ty: 45, need: 'gate1' });
      m.warps.push({ x: 0, y: 18, w: 1, h: 3, to: 'peak', tx: 61, ty: 24, need: 'gate2' });
      m.npcs.push({ id: 'elder', name: 'Elder Rowan', x: 9, y: 12, color: '#8e7cc3', hat: '#5b4a8a' });
      m.npcs.push({ id: 'shop', name: 'Pip the Merchant', x: 36, y: 12, color: '#d4a017', shop: ['potion', 'iron', 'leather', 'chain'] });
      m.npcs.push({ id: 'innkeep', name: 'Mira', x: 9, y: 33, color: '#e07a9a' });
      m.npcs.push({ id: 'smith', name: 'Brunn the Smith', x: 36, y: 33, color: '#8a5a3a', shop: ['steel', 'plate'] });
      m.npcs.push({ id: 'farmer', name: 'Bram', x: 7, y: 35, color: '#6aa84f', hat: '#b38f4f' });
      m.npcs.push({ id: 'guardN', name: 'Guard', x: 26, y: 2, color: '#7f8c8d', hat: '#bdc3c7', gate: 'gate1' });
      m.npcs.push({ id: 'guardW', name: 'Guard', x: 2, y: 21, color: '#7f8c8d', hat: '#bdc3c7', gate: 'gate2' });
      m.npcs.push({ id: 'kid', name: 'Tess', x: 21, y: 21, color: '#f1c232', wander: true });
      m.signs.push({ x: 30, y: 18, text: 'East: Whisper Woods · North: Ember Hills · West: Frost Peak' });
      m.start = { x: 24, y: 25 };
      return m;
    },
    woods() {
      const m = blank(64, 48, G), r = rng(23), nz = noise(64, 48, r, 7);
      border(m, TREE);
      scatter(m, r, nz, 0.52, TREE, [G]);
      // river with a bridge
      for (let y = 1; y < 47; y++) { const x = 36 + Math.round(Math.sin(y / 5) * 2); rect(m, x, y, 3, 1, WATER); }
      road(m, [[1, 24], [20, 24], [20, 14], [44, 14], [44, 8], [52, 8]]);
      road(m, [[20, 24], [20, 36], [30, 36]]);
      clear(m, 12, 33, 4, G); clear(m, 52, 32, 5, G); clear(m, 28, 30, 3, G); clear(m, 54, 8, 3, G);
      for (let y = 23; y <= 25; y++) set(m, 0, y, PATH);
      rect(m, 53, 5, 3, 2, ROCK); set(m, 54, 6, CAVE); rect(m, 52, 6, 1, 1, ROCK); rect(m, 56, 6, 1, 1, ROCK);
      m.from = { x: 2, y: 24 };
      m.warps.push({ x: 0, y: 23, w: 1, h: 3, to: 'village', tx: 45, ty: 19 });
      m.warps.push({ x: 54, y: 6, w: 1, h: 1, to: 'cave1', entrance: true });
      m.npcs.push({ id: 'hunter', name: 'Hunter Ash', x: 13, y: 33, color: '#7a5230', hat: '#3d6b35' });
      m.signs.push({ x: 50, y: 9, text: 'Mossy Cave. Something big and wobbly lives inside.' });
      for (let i = 0; i < 9; i++) m.picks.push({ id: 'cap' + i, item: 'glowcap', ...openSpot(m, r, 4, 4, 60, 44) });
      m.chests.push({ id: 'w1', x: 52, y: 33, loot: { gold: 40, item: 'potion', n: 2 } });
      m.chests.push({ id: 'w2', x: 28, y: 30, loot: { gold: 25, item: 'iron' } });
      spawnMany(m, r, 'slime', 12); spawnMany(m, r, 'wolf', 7);
      return m;
    },
    hills() {
      const m = blank(64, 48, SAND), r = rng(37), nz = noise(64, 48, r, 6), nz2 = noise(64, 48, r, 9);
      border(m, ROCK);
      scatter(m, r, nz, 0.6, ROCK, [SAND]);
      for (let y = 1; y < 47; y++) for (let x = 1; x < 63; x++) if (nz2(x, y) > 0.72 && get(m, x, y) === SAND) set(m, x, y, LAVA);
      road(m, [[31, 47], [31, 30], [14, 30], [14, 10], [44, 10], [50, 10]]);
      road(m, [[31, 30], [50, 30], [50, 38]]);
      clear(m, 47, 38, 4, SAND); clear(m, 14, 38, 4, SAND); clear(m, 52, 10, 3, SAND);
      set(m, 31, 47, PATH); set(m, 32, 47, PATH);
      rect(m, 53, 7, 3, 2, ROCK); set(m, 54, 8, CAVE);
      m.from = { x: 31, y: 45 };
      m.warps.push({ x: 31, y: 47, w: 2, h: 1, to: 'village', tx: 24, ty: 2 });
      m.warps.push({ x: 54, y: 8, w: 1, h: 1, to: 'cave2', entrance: true });
      m.npcs.push({ id: 'miner', name: 'Old Dunn', x: 15, y: 37, color: '#9c6b30', hat: '#e6b422' });
      m.npcs.push({ id: 'trader', name: 'Sela the Trader', x: 47, y: 37, color: '#c0504d', shop: ['potion', 'flame', 'plate'] });
      m.chests.push({ id: 'h1', x: 17, y: 40, loot: { item: 'pickaxe' } });
      m.chests.push({ id: 'h2', x: 52, y: 12, loot: { gold: 90, item: 'potion', n: 3 } });
      spawnMany(m, r, 'scorpion', 9); spawnMany(m, r, 'imp', 6); spawnMany(m, r, 'golemite', 4);
      return m;
    },
    peak() {
      const m = blank(64, 48, SNOW), r = rng(53), nz = noise(64, 48, r, 7), nz2 = noise(64, 48, r, 10);
      border(m, PINE);
      scatter(m, r, nz, 0.55, PINE, [SNOW]);
      for (let y = 1; y < 47; y++) for (let x = 1; x < 63; x++) if (nz2(x, y) > 0.7 && get(m, x, y) === SNOW) set(m, x, y, ICE);
      road(m, [[63, 24], [40, 24], [40, 12], [12, 12], [12, 6]], PATH, 2);
      road(m, [[40, 24], [40, 38], [22, 38]], PATH, 2);
      clear(m, 22, 38, 4, SNOW); clear(m, 48, 36, 4, SNOW);
      for (let y = 23; y <= 25; y++) set(m, 63, y, PATH);
      rect(m, 11, 3, 3, 2, ROCK); set(m, 12, 4, CAVE);
      m.from = { x: 61, y: 24 };
      m.warps.push({ x: 63, y: 23, w: 1, h: 3, to: 'village', tx: 2, ty: 19 });
      m.warps.push({ x: 12, y: 4, w: 1, h: 1, to: 'tower', entrance: true });
      m.npcs.push({ id: 'ranger', name: 'Ranger Vale', x: 22, y: 37, color: '#4a7fb0', hat: '#dfe9f3' });
      m.npcs.push({ id: 'peddler', name: 'Frost Peddler', x: 48, y: 35, color: '#6c7a89', shop: ['potion', 'frost', 'dragon'] });
      m.chests.push({ id: 'p1', x: 50, y: 38, loot: { gold: 160, item: 'potion', n: 3 } });
      spawnMany(m, r, 'frostwolf', 9); spawnMany(m, r, 'yeti', 4); spawnMany(m, r, 'wisp', 5);
      return m;
    },
    cave1: () => dungeon(101, 'woods', 54, 7, ['slime', 'bat', 'skeleton'], 'slimeking', 'shard1', FLOOR, DWALL),
    cave2: () => dungeon(202, 'hills', 54, 9, ['bat', 'imp', 'golemite', 'skeleton'], 'golem', 'shard2', FLOOR, DWALL, true),
    tower: () => dungeon(303, 'peak', 12, 5, ['wisp', 'skeleton', 'frostwolf'], 'wyrm', 'shard3', ICE, DWALL),
  };
  function openSpot(m, r, x0, y0, x1, y1) {
    for (let i = 0; i < 400; i++) { const x = x0 + Math.floor(r() * (x1 - x0)), y = y0 + Math.floor(r() * (y1 - y0)); if (!SOLID.has(get(m, x, y)) && get(m, x, y) !== LAVA && get(m, x, y) !== WATER) return { x, y }; }
    return { x: x0, y: y0 };
  }
  function spawnMany(m, r, type, n) { for (let i = 0; i < n; i++) { const p = openSpot(m, r, 4, 4, m.w - 4, m.h - 4); m.spawns.push({ type, x: p.x, y: p.y }); } }

  // Dungeons: a chain of rooms joined by corridors; the last, biggest room holds the boss.
  function dungeon(seed, back, bx, by, mobs, boss, shard, floor, wall, lava) {
    const m = blank(56, 44, DARK), r = rng(seed);
    const rooms = [];
    const cols = 4, rows = 3, cw = 14, ch = 14;
    const order = [[0, 2], [1, 2], [2, 2], [3, 2], [3, 1], [2, 1], [1, 1], [0, 1], [0, 0], [1, 0], [2, 0]]; // a snake through the grid
    for (const [gx, gy] of order) {
      const w = 7 + Math.floor(r() * 4), h = 6 + Math.floor(r() * 4);
      const x = gx * cw + 2 + Math.floor(r() * (cw - w - 3)), y = gy * ch + 2 + Math.floor(r() * (ch - h - 3));
      rooms.push({ x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) });
    }
    // boss room takes the top-right corner
    rooms.push({ x: 3 * cw + 1, y: 1, w: 12, h: 11, cx: 3 * cw + 7, cy: 6, boss: true });
    void cols; void rows;
    for (const rm of rooms) { rect(m, rm.x - 1, rm.y - 1, rm.w + 2, rm.h + 2, wall); rect(m, rm.x, rm.y, rm.w, rm.h, floor); }
    for (let i = 0; i < rooms.length - 1; i++) {
      const a = rooms[i], b = rooms[i + 1];
      for (const [x, y] of corridor(a.cx, a.cy, b.cx, b.cy)) { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (get(m, x + dx, y + dy) === DARK) set(m, x + dx, y + dy, wall); }
      for (const [x, y] of corridor(a.cx, a.cy, b.cx, b.cy)) set(m, x, y, floor);
    }
    if (lava) for (const rm of rooms.slice(2, -1)) if (r() < 0.6) set(m, rm.x + 1 + Math.floor(r() * (rm.w - 2)), rm.y + 1 + Math.floor(r() * (rm.h - 2)), LAVA);
    const first = rooms[0];
    set(m, first.cx, first.y + first.h - 1, CAVE);
    m.warps.push({ x: first.cx, y: first.y + first.h - 1, w: 1, h: 1, to: back, tx: bx, ty: by });
    m.start = { x: first.cx, y: first.cy };
    rooms.slice(1, -1).forEach((rm, i) => {
      const n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) m.spawns.push({ type: mobs[Math.floor(r() * mobs.length)], x: rm.x + 1 + Math.floor(r() * (rm.w - 2)), y: rm.y + 1 + Math.floor(r() * (rm.h - 2)) });
      if (i === 3) m.chests.push({ id: `${seed}c1`, x: rm.x + 1, y: rm.y + 1, loot: { gold: 60 + seed / 4, item: 'potion', n: 2 } });
      if (i === 7) m.chests.push({ id: `${seed}c2`, x: rm.x + rm.w - 2, y: rm.y + 1, loot: { heart: true } });
    });
    const br = rooms[rooms.length - 1];
    m.boss = { type: boss, x: br.cx, y: br.cy, shard, id: `${seed}boss` };
    return m;
  }
  function corridor(x1, y1, x2, y2) { const out = []; let x = x1, y = y1; while (x !== x2) { out.push([x, y]); x += Math.sign(x2 - x); } while (y !== y2) { out.push([x, y]); y += Math.sign(y2 - y); } out.push([x, y]); return out; }

  // Make sure everything that matters can be walked to from where you arrive: exits, people, chests, pickups and
  // the boss. Anything cut off by the random trees/rocks gets a path carved to it. (Lava doesn't count as a path.)
  const GROUND = { village: G, woods: G, hills: SAND, peak: SNOW };
  function ensureReachable(m, id) {
    const from = m.from || m.start; if (!from) return;
    const ground = GROUND[id] ?? FLOOR;
    const walk = (x, y) => { const t = get(m, x, y); return !SOLID.has(t) && t !== LAVA; };
    const targets = [
      ...m.warps.map((w) => [w.x, w.y]), ...m.npcs.map((n) => [n.x, n.y]), ...m.chests.map((c) => [c.x, c.y]),
      ...m.picks.map((p) => [p.x, p.y]), ...m.signs.map((p) => [p.x, p.y]), ...(m.boss ? [[m.boss.x, m.boss.y]] : []),
    ];
    for (const [tx, ty] of targets) {
      // flood fill from the arrival point each time, since earlier carving opens new ground
      const seen = new Uint8Array(m.w * m.h), q = [[from.x, from.y]]; seen[from.y * m.w + from.x] = 1;
      let reach = false;
      for (let i = 0; i < q.length; i++) {
        const [x, y] = q[i];
        if (Math.abs(x - tx) + Math.abs(y - ty) <= 1) { reach = true; break; }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx > 0 && ny >= 0 && nx < m.w - 1 && ny < m.h && !seen[ny * m.w + nx] && walk(nx, ny)) { seen[ny * m.w + nx] = 1; q.push([nx, ny]); } }
      }
      if (reach) continue;
      // carve from the closest reachable tile straight to the target
      let best = q[0], bd = 1e9;
      for (const [x, y] of q) { const d = Math.abs(x - tx) + Math.abs(y - ty); if (d < bd) { bd = d; best = [x, y]; } }
      let [x, y] = best;
      while (Math.abs(x - tx) + Math.abs(y - ty) > 1) {
        if (x !== tx) x += Math.sign(tx - x); else y += Math.sign(ty - y);
        if (!walk(x, y) && get(m, x, y) !== CAVE) set(m, x, y, ground);
      }
    }
  }

  const REGION_NAMES = { village: 'Willowby', woods: 'Whisper Woods', hills: 'Ember Hills', peak: 'Frost Peak', cave1: 'Mossy Cave', cave2: 'Cinder Mine', tower: 'Ice Tower' };
  const cache = {};
  const region = (id) => {
    if (!cache[id]) { const m = Object.assign(BUILD[id](), { id, name: REGION_NAMES[id] }); ensureReachable(m, id); cache[id] = m; }
    return cache[id];
  };

  return { TS, T: { G, FLOWER, TREE, WATER, PATH, SAND, ROCK, WALL, ROOF, DOOR, FLOOR, DWALL, LAVA, SNOW, PINE, ICE, BRIDGE, STONE, CAVE, FENCE, DARK }, SOLID, ITEMS, ENEMIES, QUESTS, region, get, REGION_NAMES };
})();
