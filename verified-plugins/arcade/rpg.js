// Sword Quest: a small top-down adventure. Explore Willowby and the lands around it, help the villagers, level up,
// find better gear, and beat the three dungeon bosses to bring back the shards of the Great Lamp.
(() => {
  const W = 336, H = 288, TS = RPG.TS, { T, SOLID, ITEMS, ENEMIES, QUESTS } = RPG;
  let A, P, world, mapCanvas, ents, shots, parts, floats, cam, ui, saveT, banner, boss;

  // ---------- save / new game ----------
  function newSave() {
    const v = RPG.region('village');
    return { region: 'village', x: v.start.x * TS + 8, y: v.start.y * TS + 8, hp: 30, maxHp: 30, lvl: 1, xp: 0, gold: 15, potions: 2, weapon: 'wood', armor: 'tunic', owned: ['wood', 'tunic'], inv: {}, quests: {}, flags: {}, opened: [], bosses: [], hearts: 0, kills: {}, ended: false, played: 0 };
  }
  const persist = () => { if (P) { A.save('rpg', P); A.best('rpg', P.lvl); } };
  const xpNeed = (l) => Math.round(20 * l ** 1.55);
  const atk = () => ITEMS[P.weapon].atk + P.lvl;
  const def = () => ITEMS[P.armor].def;
  const has = (skill) => ({ dash: 2, spin: 4, shield: 6 }[skill] <= P.lvl);

  // ---------- regions ----------
  function enter(id, tx, ty) {
    world = RPG.region(id);
    P.region = id;
    const start = world.start || { x: Math.floor(world.w / 2), y: Math.floor(world.h / 2) };
    let x = tx ?? start.x, y = ty ?? start.y;
    // never arrive inside something solid, on lava or on a warp: take the nearest open tile
    const ok = (a, b) => !SOLID.has(RPG.get(world, a, b)) && RPG.get(world, a, b) !== T.LAVA && !isWarp(a, b);
    if (!ok(x, y)) {
      found: for (let r = 1; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && ok(x + dx, y + dy)) { x += dx; y += dy; break found; }
    }
    P.x = x * TS + 8; P.y = y * TS + 8;
    mapCanvas = renderMap(world);
    ents = world.spawns.map((s) => mkEnemy(s.type, s.x * TS + 8, s.y * TS + 8));
    boss = null;
    if (world.boss && !P.bosses.includes(world.boss.id)) { boss = mkEnemy(world.boss.type, world.boss.x * TS + 8, world.boss.y * TS + 8); boss.bossInfo = world.boss; ents.push(boss); }
    shots = []; parts = []; floats = [];
    banner = { text: world.name, t: 2.2 };
    persist();
  }
  const isWarp = (x, y) => world.warps.some((w) => x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h);

  function mkEnemy(type, x, y) {
    const e = ENEMIES[type];
    const lvlScale = world.id.startsWith('cave') || world.id === 'tower' ? 1.15 : 1;
    return { type, ...e, x, y, hx: x, hy: y, hp: e.hp * lvlScale, max: e.hp * lvlScale, vx: 0, vy: 0, t: Math.random() * 2, cd: rand(0.5, 2), hurtT: 0, state: 'idle', phase: 0, burn: 0, chill: 0 };
  }

  // ---------- map rendering (once per region) ----------
  function renderMap(m) {
    const c = document.createElement('canvas'); c.width = m.w * TS; c.height = m.h * TS;
    const g = c.getContext('2d');
    let seed = 1;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) drawTile(g, RPG.get(m, x, y), x * TS, y * TS, r, m, x, y);
    return c;
  }
  // Dark fantasy palette: muted, cold and dim. The lighting pass (see drawLight) darkens it further.
  function drawTile(g, t, px, py, r, m) {
    const base = { [T.G]: '#26331f', [T.FLOWER]: '#26331f', [T.TREE]: '#26331f', [T.WATER]: '#142838', [T.PATH]: '#4a3e30', [T.SAND]: '#3d3530', [T.ROCK]: '#3d3530', [T.WALL]: '#33281f', [T.ROOF]: '#3b2322', [T.DOOR]: '#140d08', [T.FLOOR]: '#24262c', [T.DWALL]: '#101114', [T.LAVA]: '#4a1606', [T.SNOW]: '#7d8893', [T.PINE]: '#7d8893', [T.ICE]: '#465f70', [T.BRIDGE]: '#33271a', [T.STONE]: '#3f3d37', [T.CAVE]: '#050505', [T.FENCE]: '#26331f', [T.DARK]: '#050608' }[t];
    const ground = m.id === 'hills' ? '#3d3530' : m.id === 'peak' ? '#7d8893' : base;
    g.fillStyle = [T.TREE, T.ROCK, T.PINE].includes(t) ? ground : base; g.fillRect(px, py, TS, TS);
    if (t === T.G || t === T.FLOWER || t === T.FENCE) { g.fillStyle = '#1e2918'; for (let i = 0; i < 4; i++) g.fillRect(px + r() * 14, py + r() * 14, 2, 2); g.fillStyle = '#2f3d26'; g.fillRect(px + r() * 14, py + r() * 14, 1, 3); }
    if (t === T.FLOWER) { for (let i = 0; i < 2; i++) { g.fillStyle = ['#6b5a7a', '#8a8a9a', '#5a6b7a'][Math.floor(r() * 3)]; g.fillRect(px + 2 + r() * 11, py + 2 + r() * 11, 2, 2); } }
    if (t === T.TREE) { g.fillStyle = '#241a12'; g.fillRect(px + 6, py + 9, 4, 7); g.fillStyle = '#121c13'; g.beginPath(); g.arc(px + 8, py + 7, 7.5, 0, 7); g.fill(); g.fillStyle = '#1b2a1c'; g.beginPath(); g.arc(px + 6, py + 5, 3.5, 0, 7); g.fill(); }
    if (t === T.PINE) { g.fillStyle = '#241a12'; g.fillRect(px + 7, py + 11, 2, 5); g.fillStyle = '#16241f'; g.beginPath(); g.moveTo(px + 8, py); g.lineTo(px + 15, py + 12); g.lineTo(px + 1, py + 12); g.fill(); g.fillStyle = '#9aa6b2'; g.fillRect(px + 6, py + 3, 4, 1.2); }
    if (t === T.ROCK) { g.fillStyle = '#2b2926'; g.beginPath(); g.ellipse(px + 8, py + 9, 7, 6, 0, 0, 7); g.fill(); g.fillStyle = '#3a3733'; g.beginPath(); g.ellipse(px + 6, py + 7, 3, 2, 0, 0, 7); g.fill(); }
    if (t === T.WATER) { g.fillStyle = '#1e3a50'; g.fillRect(px + r() * 10, py + r() * 13, 5, 1.2); }
    if (t === T.PATH || t === T.SAND) { g.fillStyle = t === T.PATH ? '#3e3428' : '#332c28'; for (let i = 0; i < 3; i++) g.fillRect(px + r() * 14, py + r() * 14, 2, 2); }
    if (t === T.WALL) { g.fillStyle = '#28201a'; for (let i = 3; i < TS; i += 5) g.fillRect(px, py + i, TS, 1); }
    if (t === T.ROOF) { g.fillStyle = '#2c1a19'; for (let i = 0; i < TS; i += 4) g.fillRect(px, py + i, TS, 1.5); }
    if (t === T.DOOR) { g.fillStyle = '#2a1c10'; g.fillRect(px + 3, py + 2, 10, 14); g.fillStyle = '#d9a441'; g.fillRect(px + 10, py + 9, 2, 2); }
    if (t === T.FLOOR || t === T.STONE) { g.strokeStyle = t === T.FLOOR ? '#1c1d22' : '#35332e'; g.lineWidth = 1; g.strokeRect(px + 0.5, py + 0.5, TS - 1, TS - 1); if (r() < 0.15) { g.fillStyle = '#1a1b20'; g.fillRect(px + r() * 10, py + r() * 10, 4, 3); } }
    if (t === T.DWALL) { g.fillStyle = '#181a1f'; g.fillRect(px + 1, py + 1, 6, 6); g.fillRect(px + 9, py + 9, 6, 6); }
    if (t === T.LAVA) { g.fillStyle = '#9a3a12'; g.fillRect(px + r() * 10, py + r() * 12, 4, 2); }
    if (t === T.SNOW) { g.fillStyle = '#6c7783'; g.fillRect(px + r() * 14, py + r() * 14, 2, 2); }
    if (t === T.ICE) { g.fillStyle = '#5f7d90'; g.fillRect(px + r() * 9, py + r() * 12, 6, 1); }
    if (t === T.BRIDGE) { g.fillStyle = '#271d13'; for (let i = 0; i < TS; i += 4) g.fillRect(px, py + i, TS, 1); }
    if (t === T.CAVE) { g.fillStyle = '#000'; g.beginPath(); g.arc(px + 8, py + 12, 7, Math.PI, 0); g.fill(); g.fillRect(px + 1, py + 12, 14, 4); }
    if (t === T.FENCE) { g.fillStyle = '#33281f'; g.fillRect(px, py + 6, TS, 2); g.fillRect(px, py + 11, TS, 2); g.fillRect(px + 2, py + 4, 2, 11); g.fillRect(px + 11, py + 4, 2, 11); }
  }

  // ---------- collision ----------
  const solidAt = (px, py, flying) => { const t = RPG.get(world, Math.floor(px / TS), Math.floor(py / TS)); return flying ? t === T.DARK || t === T.DWALL : SOLID.has(t); };
  function blocked(x, y, r, flying) { return solidAt(x - r, y - r, flying) || solidAt(x + r, y - r, flying) || solidAt(x - r, y + r, flying) || solidAt(x + r, y + r, flying) || npcAt(x, y, r); }
  const npcAt = (x, y, r) => world.npcs.some((n) => Math.abs(n.x * TS + 8 - x) < 7 + r && Math.abs(n.y * TS + 8 - y) < 7 + r);
  function move(o, dx, dy, r, flying) {
    if (!blocked(o.x + dx, o.y, r, flying)) o.x += dx; else if (o === P) slideCorner(o, dx, 0, r);
    if (!blocked(o.x, o.y + dy, r, flying)) o.y += dy; else if (o === P) slideCorner(o, 0, dy, r);
  }
  function slideCorner(o, dx, dy, r) {
    // nudge around corners so the player doesn't snag on tile edges
    for (const n of [3, -3]) { if (dx && !blocked(o.x + dx, o.y + n, r)) { o.y += Math.sign(n) * 0.8; return; } if (dy && !blocked(o.x + n, o.y + dy, r)) { o.x += Math.sign(n) * 0.8; return; } }
  }

  // ---------- quests ----------
  const qState = (id) => P.quests[id]?.state;
  function qStart(id) { if (P.quests[id]) return; P.quests[id] = { state: 'active', n: 0 }; A.sfx('coin'); banner = { text: 'Quest: ' + QUESTS[id].title, t: 2.5 }; persist(); }
  function qReady(id) {
    const q = QUESTS[id], s = P.quests[id]; if (!s || s.state !== 'active') return false;
    if (q.type === 'kill') return s.n >= q.count;
    if (q.type === 'item') return (P.inv[q.item] || 0) >= q.count;
    return false;
  }
  function qFinish(id) {
    const q = QUESTS[id], s = P.quests[id];
    s.state = 'done';
    if (q.take) P.inv[q.item] -= q.count;
    P.gold += q.reward.gold || 0; gainXp(q.reward.xp || 0);
    if (q.reward.item) give(q.reward.item, q.reward.n || 1);
    A.sfx('win'); banner = { text: 'Quest complete: ' + q.title, t: 2.5 };
    if (q.next) qStart(q.next);
    persist();
  }
  function give(item, n = 1) {
    const it = ITEMS[item];
    if (it.kind === 'potion') P.potions = Math.min(9, P.potions + n);
    else if (it.kind === 'weapon' || it.kind === 'armor') {
      if (!P.owned.includes(item)) P.owned.push(item);
      const better = it.kind === 'weapon' ? it.atk > ITEMS[P.weapon].atk : it.def > ITEMS[P.armor].def;
      if (better) P[it.kind] = item;
    } else P.inv[item] = (P.inv[item] || 0) + n;
    floats.push({ x: P.x, y: P.y - 16, text: `+${n > 1 ? n + ' ' : ''}${it.name}`, t: 0, col: '#ffd23d' });
  }
  function gainXp(n) {
    P.xp += n;
    while (P.xp >= xpNeed(P.lvl)) {
      P.xp -= xpNeed(P.lvl); P.lvl++; P.maxHp += 5; P.hp = P.maxHp;
      const sk = { 2: 'Dash unlocked: Shift', 4: 'Spin Attack unlocked: hold attack, then let go', 6: 'Shield unlocked: hold K' }[P.lvl];
      banner = { text: `Level ${P.lvl}!${sk ? ' ' + sk : ''}`, t: 3 }; A.sfx('win');
    }
  }

  // ---------- talking ----------
  function say(name, lines, after) { ui = { mode: 'talk', name, lines: [].concat(lines), i: 0, after }; }
  function talk(n) {
    const id = n.id;
    if (n.shop) { say(n.name, n.id === 'shop' ? 'Welcome! Have a look.' : 'Best gear for brave folk.', () => (ui = { mode: 'shop', npc: n, sel: 0 })); return; }
    if (n.gate) {
      if (P.flags[n.gate]) return say(n.name, 'The road is open. Stay safe out there.');
      return say(n.name, n.gate === 'gate1' ? 'Elder Rowan says nobody goes north until the Forest Shard is back.' : 'The west road to Frost Peak is closed until the Ember Shard is found.');
    }
    if (id === 'elder') {
      if (!qState('lamp1')) return say(n.name, ['Ah, a young sword! Do you see the Great Lamp in the square? It keeps the monsters away.', 'Its three shards were stolen and hidden in the old dungeons. Without them it will go dark.', 'Start with the Forest Shard: east through Whisper Woods, in Mossy Cave. Please hurry.'], () => qStart('lamp1'));
      for (const [qid, gate] of [['lamp1', 'gate1'], ['lamp2', 'gate2'], ['lamp3', null]]) {
        if (qReady(qid)) {
          return say(n.name, qid === 'lamp3' ? ['The Frost Shard! With all three, the Lamp will shine again!', '...', 'Willowby is safe, thanks to you. You are welcome here always, hero.'] : ['You found it! The Lamp already glows brighter.', gate === 'gate1' ? 'I\'ll tell the north guard to open the gate to Ember Hills.' : 'The west gate to Frost Peak is yours to pass.'], () => {
            if (gate) P.flags[gate] = true;
            qFinish(qid);
            if (qid === 'lamp3') { P.ended = true; persist(); A.overlay('The Great Lamp shines again!', `You saved Willowby at level ${P.lvl}. Thanks for playing Sword Quest! You can keep exploring.`, [['Keep playing', () => A.hideOverlay()]]); }
          });
        }
      }
      const cur = ['lamp1', 'lamp2', 'lamp3'].find((q) => qState(q) === 'active');
      return say(n.name, cur ? QUESTS[cur].desc : 'The Lamp shines bright. Thank you, hero.');
    }
    const quest = Object.entries(QUESTS).find(([, q]) => q.giver === id)?.[0];
    if (quest) {
      if (!qState(quest)) return say(n.name, QUESTS[quest].desc, () => qStart(quest));
      if (qReady(quest)) return say(n.name, 'You did it! Here, take this.', () => qFinish(quest));
      if (qState(quest) === 'active') { const q = QUESTS[quest], s = P.quests[quest]; return say(n.name, `${q.title}: ${q.type === 'kill' ? s.n : P.inv[q.item] || 0} / ${q.count}. Keep going!`); }
    }
    const idle = { innkeep: 'The inn is always warm. Rest by the fire any time.', kid: ['I\'m gonna be a hero like you one day!', 'Did you know you can press M to see a map?'], farmer: 'Fine weather for cabbages.', hunter: 'Wolves are smart. Hit and step back.', miner: 'Mind the lava, it bites.', ranger: 'Yetis wind up before they charge. Get out of the way!' }[id];
    say(n.name, idle || 'Hello there.');
  }
  function openChest(c) {
    P.opened.push(c.id); A.sfx('coin');
    const l = c.loot;
    if (l.gold) { P.gold += Math.round(l.gold); floats.push({ x: c.x * TS + 8, y: c.y * TS - 4, text: `+${Math.round(l.gold)} gold`, t: 0, col: '#ffd23d' }); }
    if (l.item) give(l.item, l.n || 1);
    if (l.heart) { P.maxHp += 10; P.hp = P.maxHp; P.hearts++; banner = { text: 'Heart Container! Max HP +10', t: 2.5 }; }
    persist();
  }

  // ---------- combat ----------
  function hurtPlayer(dmg, fromX, fromY) {
    if (P.inv_t > 0 || ui) return;
    let d = Math.max(1, Math.round(dmg - def()));
    if (P.shield && has('shield')) {
      const fx = fromX - P.x, fy = fromY - P.y, l = Math.hypot(fx, fy) || 1;
      if ((fx / l) * P.fx + (fy / l) * P.fy > 0.3) { d = Math.max(0, Math.round(d * 0.15)); A.sfx('block'); }
    }
    if (d <= 0) return;
    P.hp -= d; P.inv_t = 0.7; A.sfx('hurt');
    const l = Math.hypot(P.x - fromX, P.y - fromY) || 1;
    P.kx = ((P.x - fromX) / l) * 150; P.ky = ((P.y - fromY) / l) * 150;
    floats.push({ x: P.x, y: P.y - 14, text: '-' + d, t: 0, col: '#ff5d6c' });
    if (P.hp <= 0) die();
  }
  function die() {
    P.hp = 0; A.sfx('lose');
    const lost = Math.floor(P.gold * 0.2);
    ui = { mode: 'dead' };
    A.overlay('You were defeated', `You wake up in Willowby. Lost ${lost} gold.`, [['Continue', () => { P.gold -= lost; P.hp = P.maxHp; ui = null; enter('village'); A.hideOverlay(); }]]);
  }
  function hitEnemy(e, dmg, kx, ky) {
    if (e.dead || e.hurtT > 0.15) return;
    e.hp -= dmg; e.hurtT = 0.25; A.sfx('hit');
    if (!e.boss) { e.vx = kx * 180; e.vy = ky * 180; e.stun = 0.18; }
    if (ITEMS[P.weapon].burn) e.burn = 2.5;
    if (ITEMS[P.weapon].chill) e.chill = 2;
    floats.push({ x: e.x, y: e.y - e.r - 4, text: String(Math.round(dmg)), t: 0, col: '#fff' });
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e) {
    e.dead = true;
    for (let i = 0; i < 14; i++) parts.push({ x: e.x, y: e.y, vx: rand(-90, 90), vy: rand(-90, 90), t: 0, life: 0.5, c: e.color });
    gainXp(e.xp);
    const g = irand(e.gold[0], e.gold[1]); P.gold += g;
    floats.push({ x: e.x, y: e.y - 8, text: `+${g}g`, t: 0, col: '#ffd23d' });
    if (e.drop && Math.random() < e.drop[1]) give(e.drop[0]);
    if (!e.boss && Math.random() < 0.06) give('potion');
    P.kills[e.type] = (P.kills[e.type] || 0) + 1;
    for (const [id, q] of Object.entries(QUESTS)) if (q.type === 'kill' && q.target === e.type && qState(id) === 'active') P.quests[id].n++;
    if (e.boss) {
      P.bosses.push(e.bossInfo.id); give(e.bossInfo.shard);
      banner = { text: `${e.name} defeated! Got the ${ITEMS[e.bossInfo.shard].name}`, t: 3.5 };
      A.sfx('win'); persist();
    }
  }
  function shoot(from, kind, ang, speed = 120) {
    shots.push({ x: from.x, y: from.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, kind, dmg: from.dmg, t: 0, r: kind === 'rock' ? 6 : 3 });
  }

  // ---------- enemy AI ----------
  function think(e, dt) {
    const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const slow = e.chill > 0 ? 0.55 : 1, sp = e.speed * slow;
    e.t += dt; e.cd -= dt;
    if (e.burn > 0) { e.burn -= dt; e.hp -= 4 * dt; if (e.hp <= 0) return killEnemy(e); }
    if (e.chill > 0) e.chill -= dt;
    if (e.stun > 0) { e.stun -= dt; move(e, e.vx * dt, e.vy * dt, e.r * 0.7, e.flies || e.ai === 'fly'); e.vx *= 0.85; e.vy *= 0.85; return; }
    const seen = d < (e.boss ? 400 : 150);
    switch (e.ai) {
      case 'hop':
        if (e.cd <= 0) { e.cd = rand(0.7, 1.2); const a = seen ? Math.atan2(dy, dx) : rand(0, 7); e.vx = Math.cos(a) * sp * 2.2; e.vy = Math.sin(a) * sp * 2.2; }
        move(e, e.vx * dt, e.vy * dt, e.r * 0.7); e.vx *= 0.9; e.vy *= 0.9; break;
      case 'chase':
        if (seen) move(e, ux * sp * dt, uy * sp * dt, e.r * 0.7);
        else { if (e.cd <= 0) { e.cd = rand(1, 3); e.wa = rand(0, 7); } move(e, Math.cos(e.wa || 0) * sp * 0.3 * dt, Math.sin(e.wa || 0) * sp * 0.3 * dt, e.r * 0.7); }
        break;
      case 'fly':
        if (seen) move(e, (ux + Math.cos(e.t * 5) * 0.8) * sp * dt, (uy + Math.sin(e.t * 4) * 0.8) * sp * dt, e.r * 0.6, true);
        else move(e, Math.cos(e.t) * 20 * dt, Math.sin(e.t * 1.3) * 20 * dt, e.r * 0.6, true);
        break;
      case 'shoot':
        if (seen) {
          const want = d > 90 ? 1 : d < 60 ? -1 : 0;
          move(e, ux * sp * want * dt + Math.cos(e.t * 2) * 15 * dt, uy * sp * want * dt + Math.sin(e.t * 2) * 15 * dt, e.r * 0.7, e.flies);
          if (e.cd <= 0) { e.cd = rand(1.6, 2.4); shoot(e, e.shot, Math.atan2(dy, dx), e.shot === 'arrow' ? 150 : 110); A.sfx('shoot'); }
        }
        break;
      case 'charge':
        if (e.state === 'idle') { if (seen) move(e, ux * sp * 0.6 * dt, uy * sp * 0.6 * dt, e.r * 0.7); if (seen && d < 110 && e.cd <= 0) { e.state = 'wind'; e.st = 0.6; e.ca = Math.atan2(dy, dx); } }
        else if (e.state === 'wind') { e.st -= dt; if (e.st <= 0) { e.state = 'go'; e.st = 0.55; } }
        else { e.st -= dt; const ox = e.x, oy = e.y; move(e, Math.cos(e.ca) * sp * 4 * dt, Math.sin(e.ca) * sp * 4 * dt, e.r * 0.7); if (e.st <= 0 || (ox === e.x && oy === e.y)) { e.state = 'idle'; e.cd = rand(1.5, 2.5); } }
        break;
      case 'boss1': // Slime King: big hops, shockwave rings, splits into slimes when hurt
        if (e.cd <= 0) {
          e.phase++;
          if (e.phase % 3 === 0) { for (let i = 0; i < 10; i++) shoot(e, 'goo', (i / 10) * Math.PI * 2, 90); A.sfx('boom'); e.cd = 1.4; }
          else { const a = Math.atan2(dy, dx); e.vx = Math.cos(a) * 160; e.vy = Math.sin(a) * 160; e.cd = 1.1; }
        }
        move(e, e.vx * dt, e.vy * dt, e.r * 0.6); e.vx *= 0.92; e.vy *= 0.92;
        for (const [mark, at] of [['s1', 0.5], ['s2', 0.25]]) if (!e[mark] && e.hp < e.max * at) { e[mark] = true; for (let i = 0; i < 3; i++) ents.push(mkEnemy('slime', e.x + rand(-20, 20), e.y + rand(-20, 20))); }
        break;
      case 'boss2': // Magma Golem: slow, throws rocks, slams the ground
        move(e, ux * sp * dt, uy * sp * dt, e.r * 0.6);
        if (e.cd <= 0) {
          e.phase++;
          if (e.phase % 2) { shoot(e, 'rock', Math.atan2(dy, dx), 130); e.cd = 1.6; A.sfx('shoot'); }
          else { e.slam = 0.01; e.cd = 2.4; A.sfx('boom'); }
        }
        if (e.slam) { e.slam += dt; const R = e.slam * 160; if (Math.abs(d - R) < 10 && R < 150) hurtPlayer(e.dmg, e.x, e.y); if (R > 150) e.slam = 0; }
        if (!e.s1 && e.hp < e.max / 2) { e.s1 = true; e.speed *= 1.5; }
        break;
      case 'boss3': { // Frost Wyrm: circles the room, fans of ice, dives at you
        e.home ||= { x: e.x, y: e.y };
        if (e.state === 'dive') { e.st -= dt; move(e, Math.cos(e.ca) * 230 * dt, Math.sin(e.ca) * 230 * dt, e.r * 0.5, true); if (e.st <= 0) e.state = 'idle'; break; }
        const a = e.t * 0.8; const tx = e.home.x + Math.cos(a) * 60, ty = e.home.y + Math.sin(a) * 45;
        move(e, (tx - e.x) * 2 * dt, (ty - e.y) * 2 * dt, e.r * 0.5, true);
        if (e.cd <= 0) {
          e.phase++;
          if (e.phase % 3 === 0) { e.state = 'dive'; e.st = 0.7; e.ca = Math.atan2(dy, dx); e.cd = 1.8; }
          else { const b = Math.atan2(dy, dx); for (let i = -2; i <= 2; i++) shoot(e, 'ice', b + i * 0.22, 130); e.cd = e.hp < e.max / 2 ? 1.1 : 1.7; A.sfx('shoot'); }
        }
        break;
      }
    }
    // touching the player hurts
    if (d < e.r + 6) hurtPlayer(e.dmg, e.x, e.y);
  }

  // ---------- menus ----------
  function shopItems(n) { return n.shop.map((id) => ({ id, ...ITEMS[id] })); }
  function buy(n, i) {
    const it = shopItems(n)[i]; if (!it) return;
    if ((it.kind === 'weapon' || it.kind === 'armor') && P.owned.includes(it.id)) { P[it.kind] = it.id; A.sfx('click'); return; }
    if (it.kind === 'potion' && P.potions >= 9) return;
    if (P.gold < it.price) { A.sfx('hurt'); return; }
    P.gold -= it.price; give(it.id); A.sfx('buy'); persist();
  }

  // ---------- input helpers ----------
  const press = (...k) => A.hit(...k);

  GAMES.rpg = {
    name: 'Sword Quest', W, H,
    help: 'WASD move · J/Space/click attack · E talk · Shift dash · K shield · H potion · Q quests · I gear · M map',
    desc: 'An open-world adventure. Save Willowby.',
    bestLabel: (b) => (b ? `Level ${b}` : 'A new adventure'),
    canPause: () => !ui || ui.mode !== 'dead',
    onEscape: () => { if (ui && ui.mode !== 'dead' && ui.mode !== 'talk') { ui = null; return true; } return false; },
    thumb(g, w, h) {
      g.fillStyle = '#1a2216'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#3a3026'; g.fillRect(0, h / 2 - 8, w, 16);
      for (const [x, y] of [[20, 14], [44, 20], [140, 16], [150, 64], [30, 70]]) { g.fillStyle = '#0e160f'; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); }
      const lt = g.createRadialGradient(w / 2, h / 2 - 8, 4, w / 2, h / 2 - 8, 60); lt.addColorStop(0, 'rgba(255,200,120,0.18)'); lt.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = lt; g.fillRect(0, 0, w, h);
      g.fillStyle = '#3d6fb0'; g.fillRect(w / 2 - 5, h / 2 - 12, 10, 12); g.fillStyle = '#f1d3b3'; g.beginPath(); g.arc(w / 2, h / 2 - 16, 5, 0, 7); g.fill();
      g.strokeStyle = '#e6e6e6'; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2 + 6, h / 2 - 6); g.lineTo(w / 2 + 18, h / 2 - 18); g.stroke();
      g.fillStyle = '#2f6b3a'; g.beginPath(); g.ellipse(w / 2 + 40, h / 2 + 2, 8, 6, 0, 0, 7); g.fill(); g.fillStyle = '#ffcf4a'; g.fillRect(w / 2 + 36, h / 2, 2, 2); g.fillRect(w / 2 + 41, h / 2, 2, 2);
      g.save(); g.filter = 'grayscale(1) contrast(1.25)'; g.drawImage(g.canvas, 0, 0); g.restore();
      g.fillStyle = '#ff2a2a'; g.fillRect(w / 2 + 36, h / 2, 2, 2); g.fillRect(w / 2 + 41, h / 2, 2, 2);
    },
    start(a) {
      A = a; ui = null; saveT = 0;
      P = A.load('rpg', null);
      const fresh = !P;
      if (fresh) P = newSave();
      Object.assign(P, { fx: 0, fy: 1, swing: 0, spin: 0, hitSet: new Set(), inv_t: 0, dashT: 0, dashCd: 0, spinCd: 0, hold: 0, kx: 0, ky: 0, shield: false, lavaT: 0 });
      cam = null;
      enter(P.region, Math.floor(P.x / TS), Math.floor(P.y / TS));
      if (fresh) say('Narrator', ['Welcome to Willowby. Something is wrong with the Great Lamp in the village square...', 'Find Elder Rowan in the house to the north-west. Walk with WASD, talk with E.']);
    },
    stop() { persist(); },
    onHide() { persist(); },
    _test: () => ({ P, world, ents, ui, enter, talk, mkEnemy, qState }),
    update(dt) {
      if (!P || !world) return;
      // ---- menus and dialogue pause the world ----
      if (ui?.mode === 'dead') return;
      if (ui) {
        const adv = press('KeyE', 'Space', 'Enter', 'KeyJ') || A.mouse.clicked;
        if (ui.mode === 'talk') { if (adv) { ui.i++; if (ui.i >= ui.lines.length) { const f = ui.after; ui = null; f?.(); } } return; }
        if (ui.mode === 'shop') {
          const items = shopItems(ui.npc);
          if (press('ArrowDown', 'KeyS')) ui.sel = (ui.sel + 1) % items.length;
          if (press('ArrowUp', 'KeyW')) ui.sel = (ui.sel + items.length - 1) % items.length;
          for (let i = 0; i < items.length; i++) if (press('Digit' + (i + 1))) buy(ui.npc, i);
          if (A.mouse.clicked) { const i = Math.floor((A.mouse.y - 70) / 30); if (i >= 0 && i < items.length && A.mouse.x > 30 && A.mouse.x < W - 30) { ui.sel = i; buy(ui.npc, i); } }
          else if (press('KeyE', 'Enter', 'Space')) buy(ui.npc, ui.sel);
          if (press('Escape', 'KeyQ', 'KeyX')) ui = null;
          return;
        }
        if (ui.mode === 'gear') {
          const gear = P.owned.map((id) => ({ id, ...ITEMS[id] }));
          if (A.mouse.clicked) { const i = Math.floor((A.mouse.y - 92) / 18); if (gear[i]) { P[gear[i].kind] = gear[i].id; A.sfx('click'); persist(); } }
        }
        if (press('Escape', 'KeyQ', 'KeyI', 'KeyM') || (ui.mode !== 'gear' && A.mouse.clicked)) ui = null;
        return;
      }
      if (press('KeyQ')) { ui = { mode: 'quests' }; return; }
      if (press('KeyI')) { ui = { mode: 'gear' }; return; }
      if (press('KeyM')) { ui = { mode: 'map' }; return; }
      // ---- player ----
      P.inv_t -= dt; P.dashCd -= dt; P.spinCd -= dt;
      let mx = (A.key('KeyD', 'ArrowRight') ? 1 : 0) - (A.key('KeyA', 'ArrowLeft') ? 1 : 0);
      let my = (A.key('KeyS', 'ArrowDown') ? 1 : 0) - (A.key('KeyW', 'ArrowUp') ? 1 : 0);
      const ml = Math.hypot(mx, my); if (ml) { mx /= ml; my /= ml; if (!P.shield) { P.fx = mx; P.fy = my; } }
      P.shield = has('shield') && A.key('KeyK');
      if (press('ShiftLeft', 'ShiftRight', 'KeyL') && has('dash') && P.dashCd <= 0) { P.dashT = 0.18; P.dashCd = 0.7; P.inv_t = Math.max(P.inv_t, 0.22); A.sfx('swing'); }
      let sp = 80 * (P.shield ? 0.5 : 1);
      const under = RPG.get(world, Math.floor(P.x / TS), Math.floor(P.y / TS));
      if (under === T.ICE) sp *= 1.15;
      if (P.dashT > 0) { P.dashT -= dt; move(P, P.fx * 270 * dt, P.fy * 270 * dt, 5); }
      else move(P, mx * sp * dt + P.kx * dt, my * sp * dt + P.ky * dt, 5);
      P.kx *= 0.82; P.ky *= 0.82;
      if (under === T.LAVA) { P.lavaT = (P.lavaT || 0) + dt; if (P.lavaT > 0.5) { P.lavaT = 0; hurtPlayer(5 + def(), P.x + P.fx, P.y + P.fy); } }
      // attack: tap to swing, hold then release to spin (level 4)
      const atkDown = A.key('KeyJ', 'Space') || A.mouse.down;
      if (A.mouse.clicked) { const ax = A.mouse.x + cam.x - P.x, ay = A.mouse.y + cam.y - P.y, l = Math.hypot(ax, ay) || 1; P.fx = ax / l; P.fy = ay / l; }
      if ((press('KeyJ', 'Space') || A.mouse.clicked) && P.swing <= 0) { P.swing = 0.24; P.hitSet = new Set(); A.sfx('swing'); }
      if (atkDown) P.hold += dt; else { if (P.hold > 0.5 && has('spin') && P.spinCd <= 0) { P.spin = 0.35; P.spinCd = 1.1; P.hitSet = new Set(); A.sfx('swing'); } P.hold = 0; }
      if (P.swing > 0) {
        P.swing -= dt;
        const hx = P.x + P.fx * 13, hy = P.y + P.fy * 13;
        for (const e of ents) if (!e.dead && !P.hitSet.has(e) && Math.hypot(e.x - hx, e.y - hy) < 13 + e.r) { P.hitSet.add(e); const l = Math.hypot(e.x - P.x, e.y - P.y) || 1; hitEnemy(e, atk(), (e.x - P.x) / l, (e.y - P.y) / l); }
      }
      if (P.spin > 0) {
        P.spin -= dt;
        for (const e of ents) if (!e.dead && !P.hitSet.has(e) && Math.hypot(e.x - P.x, e.y - P.y) < 24 + e.r) { P.hitSet.add(e); const l = Math.hypot(e.x - P.x, e.y - P.y) || 1; hitEnemy(e, atk() * 1.6, (e.x - P.x) / l, (e.y - P.y) / l); }
      }
      if (press('KeyH', 'Digit1') && P.potions > 0 && P.hp < P.maxHp) { P.potions--; P.hp = Math.min(P.maxHp, P.hp + ITEMS.potion.heal + P.lvl * 2); A.sfx('buy'); floats.push({ x: P.x, y: P.y - 14, text: '+HP', t: 0, col: '#3ccf8e' }); }
      // talk / open / read
      if (press('KeyE', 'Enter')) {
        const near = (x, y) => Math.hypot(x * TS + 8 - P.x, y * TS + 8 - P.y) < 26;
        const n = world.npcs.find((q) => near(q.x, q.y)), c = world.chests.find((q) => near(q.x, q.y) && !P.opened.includes(q.id)), s = world.signs.find((q) => near(q.x, q.y));
        if (n) { const l = Math.hypot(n.x * TS + 8 - P.x, n.y * TS + 8 - P.y) || 1; P.fx = (n.x * TS + 8 - P.x) / l; P.fy = (n.y * TS + 8 - P.y) / l; talk(n); return; }
        if (c) { openChest(c); return; }
        if (s) { say('Sign', s.text); return; }
      }
      // pick up glowcaps and the like by walking over them
      for (const pk of world.picks) if (!P.opened.includes(pk.id) && Math.hypot(pk.x * TS + 8 - P.x, pk.y * TS + 8 - P.y) < 12) { P.opened.push(pk.id); give(pk.item); A.sfx('coin'); }
      // warps
      const tx = Math.floor(P.x / TS), ty = Math.floor(P.y / TS);
      const wp = world.warps.find((w) => tx >= w.x && tx < w.x + w.w && ty >= w.y && ty < w.y + w.h);
      if (wp) {
        if (wp.need && !P.flags[wp.need]) { P.y += 6; P.x += wp.x === 0 ? 6 : 0; const g = world.npcs.find((q) => q.gate === wp.need); if (g) talk(g); }
        else if (wp.entrance) { enter(wp.to); return; }
        else { enter(wp.to, wp.tx, wp.ty); return; }
      }
      // ---- world ----
      for (const e of ents) if (!e.dead) { think(e, dt); e.hurtT -= dt; }
      ents = ents.filter((e) => !e.dead);
      for (const s of shots) {
        s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.t > 3 || solidAt(s.x, s.y, s.kind === 'ice' || s.kind === 'goo')) s.done = true;
        else if (Math.hypot(s.x - P.x, s.y - P.y) < s.r + 5) { hurtPlayer(s.dmg, s.x - s.vx * 0.05, s.y - s.vy * 0.05); s.done = true; }
      }
      shots = shots.filter((s) => !s.done);
      parts = parts.filter((p) => (p.t += dt) < p.life); for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; }
      floats = floats.filter((f) => (f.t += dt) < 1.1);
      if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
      cam = { x: clamp(P.x - W / 2, 0, world.w * TS - W), y: clamp(P.y - H / 2, 0, world.h * TS - H) };
      if ((saveT += dt) > 15) { saveT = 0; persist(); }
      A.hud(`Lv ${P.lvl} · ${P.gold}g`);
    },
    draw(g) {
      if (!P || !world) return;
      cam ||= { x: clamp(P.x - W / 2, 0, world.w * TS - W), y: clamp(P.y - H / 2, 0, world.h * TS - H) };
      const cx = Math.round(cam.x), cy = Math.round(cam.y);
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      g.drawImage(mapCanvas, cx, cy, W, H, 0, 0, W, H);
      const now = performance.now() / 1000;
      // animated water and lava glints
      for (let ty = Math.floor(cy / TS); ty <= Math.floor((cy + H) / TS); ty++) for (let tx = Math.floor(cx / TS); tx <= Math.floor((cx + W) / TS); tx++) {
        const t = RPG.get(world, tx, ty);
        if (t === T.WATER || t === T.LAVA) { const ph = Math.sin(now * 2 + tx * 1.7 + ty * 2.3); if (ph > 0.6) { g.fillStyle = t === T.WATER ? '#9cc7f2aa' : '#ffd166cc'; g.fillRect(tx * TS - cx + 3, ty * TS - cy + 7, 7, 1.5); } }
      }
      g.save(); g.translate(-cx, -cy);
      // pickups, chests, signs
      for (const pk of world.picks) if (!P.opened.includes(pk.id)) { const x = pk.x * TS + 8, y = pk.y * TS + 8; g.fillStyle = '#e9e1ff'; g.fillRect(x - 1, y, 2, 5); g.fillStyle = `rgba(160,255,200,${0.7 + 0.3 * Math.sin(now * 4 + pk.x)})`; g.beginPath(); g.ellipse(x, y, 5, 3.5, 0, Math.PI, 0); g.fill(); }
      for (const c of world.chests) { const x = c.x * TS, y = c.y * TS, open = P.opened.includes(c.id); g.fillStyle = '#7a4f24'; g.fillRect(x + 2, y + 5, 12, 9); g.fillStyle = open ? '#3b2712' : '#9c6a33'; g.fillRect(x + 2, y + (open ? 2 : 4), 12, 4); g.fillStyle = '#e6c35c'; g.fillRect(x + 7, y + 7, 2, 3); }
      for (const s of world.signs) { const x = s.x * TS, y = s.y * TS; g.fillStyle = '#6b4a2a'; g.fillRect(x + 7, y + 8, 2, 8); g.fillStyle = '#b8935a'; g.fillRect(x + 2, y + 2, 12, 7); }
      // sort everything by y so things overlap naturally
      const draws = [];
      for (const n of world.npcs) draws.push([n.y * TS + 8, () => drawNpc(g, n, now)]);
      for (const e of ents) draws.push([e.y, () => drawEnemy(g, e, now)]);
      draws.push([P.y, () => drawPlayer(g, now)]);
      draws.sort((a, b) => a[0] - b[0]).forEach((d) => d[1]());
      for (const s of shots) {
        const col = { arrow: '#e6e1d3', fire: '#ff8a3d', ice: '#bfe9ff', goo: '#5dd65d', rock: '#5a4636' }[s.kind];
        g.fillStyle = col; g.beginPath(); g.arc(s.x, s.y, s.r, 0, 7); g.fill();
      }
      for (const p of parts) { g.globalAlpha = 1 - p.t / p.life; g.fillStyle = p.c; g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
      g.globalAlpha = 1;
      for (const e of ents) if (e.slam) { g.strokeStyle = '#ff8a3d'; g.lineWidth = 3; g.globalAlpha = 1 - e.slam * 160 / 150; g.beginPath(); g.arc(e.x, e.y, e.slam * 160, 0, 7); g.stroke(); g.globalAlpha = 1; }
      g.textAlign = 'center';
      for (const f of floats) { g.globalAlpha = 1 - f.t / 1.1; g.fillStyle = f.col; g.font = '700 10px Segoe UI'; g.fillText(f.text, f.x, f.y - f.t * 20); }
      g.globalAlpha = 1;
      g.restore();
      drawFog(g, 1 / 60);
      drawLight(g, cx, cy, now);
      // Almost black and white: grey out everything drawn so far, then add the few red accents on top.
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.filter = 'grayscale(1) contrast(1.25) brightness(1.05)'; g.drawImage(g.canvas, 0, 0); g.restore();
      drawGrain(g);
      drawEyes(g, cx, cy, now);
      drawHud(g);
      if (ui) drawUi(g);
    },
  };

  // ---------- sprites ----------
  // Darken a colour toward black (enemies and villagers read as silhouettes in the gloom).
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    return `rgb(${Math.round(r * k)},${Math.round(gg * k)},${Math.round(b * k)})`;
  }
  const facing = (fx, fy) => (Math.abs(fx) > Math.abs(fy) ? (fx > 0 ? 'right' : 'left') : fy < 0 ? 'up' : 'down');

  // A hooded, robed figure for villagers.
  function robed(g, x, y, robe, now, opts = {}) {
    g.fillStyle = '#00000066'; g.beginPath(); g.ellipse(x, y + 7, 6, 2.2, 0, 0, 7); g.fill();
    const br = Math.sin(now * 1.6 + x) * 0.4;
    g.fillStyle = robe; g.beginPath(); g.moveTo(x - 4, y - 5 + br); g.lineTo(x + 4, y - 5 + br); g.lineTo(x + 6, y + 7); g.lineTo(x - 6, y + 7); g.fill();
    g.fillStyle = '#0d0d10'; g.beginPath(); g.moveTo(x - 6, y + 7); for (let k = 0; k <= 6; k++) g.lineTo(x - 6 + k * 2, y + 7 + (k % 2 ? 1.2 : 0)); g.lineTo(x + 6, y + 7); g.fill();
    g.fillStyle = '#34343a'; g.beginPath(); g.arc(x, y - 8 + br, 4.8, 0, 7); g.fill();
    g.beginPath(); g.moveTo(x - 3.5, y - 11 + br); g.lineTo(x, y - 16 + br); g.lineTo(x + 3.5, y - 11 + br); g.fill();
    g.fillStyle = '#050506'; g.beginPath(); g.ellipse(x, y - 7.5 + br, 3, 2.6, 0, 0, 7); g.fill();
    if (opts.lantern) {
      const lx = x + 6, ly = y + 1 + Math.sin(now * 2) * 0.6;
      g.strokeStyle = '#2a2a2a'; g.lineWidth = 1; g.beginPath(); g.moveTo(lx, ly - 4); g.lineTo(lx, ly - 2); g.stroke();
      g.fillStyle = '#ffe2a8'; g.shadowColor = '#ffd27a'; g.shadowBlur = 8; g.fillRect(lx - 1.5, ly - 2, 3, 4); g.shadowBlur = 0;
    }
    if (opts.spear) { g.strokeStyle = '#6b6b70'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x + 6, y + 6); g.lineTo(x + 6, y - 16); g.stroke(); g.fillStyle = '#c9c9c9'; g.beginPath(); g.moveTo(x + 6, y - 19); g.lineTo(x + 4.5, y - 15); g.lineTo(x + 7.5, y - 15); g.fill(); }
  }

  // The hero: a hooded knight with a tattered cape, a pauldron and a pale blade.
  function drawPlayer(g, now) {
    const blink = P.inv_t > 0 && Math.floor(now * 20) % 2;
    const moving = A.key('KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight');
    const x = P.x, y = P.y, dir = facing(P.fx, P.fy), lr = dir === 'left' ? -1 : 1;
    const walk = moving ? now * 13 : 0, step = Math.sin(walk), br = moving ? Math.abs(step) * 0.8 : Math.sin(now * 2) * 0.45;
    const armor = { tunic: '#2b2b30', leather: '#3d332b', chain: '#5a5e65', fur: '#4d463d', plate: '#7d828a', dragon: '#2e3d38' }[P.armor];
    const blade = { wood: '#8c7d69', iron: '#c4c8cd', steel: '#e4e7ec', flame: '#ffd2ad', frost: '#d8f1ff' }[P.weapon];
    if (blink) g.globalAlpha = 0.35;
    g.fillStyle = '#00000077'; g.beginPath(); g.ellipse(x, y + 7, 6.5, 2.4, 0, 0, 7); g.fill();

    const sway = Math.sin(now * 2.6) * 0.8 + (moving ? -P.fx * 2.5 : 0), trail = moving ? 2.5 : 0;
    const cape = () => {
      g.fillStyle = '#121214'; g.beginPath();
      g.moveTo(x - 5, y - 6 + br); g.lineTo(x + 5, y - 6 + br);
      g.lineTo(x + 6.5 + sway, y + 8 + trail);
      for (let k = 6; k >= 0; k--) g.lineTo(x - 6.5 + sway + k * (13 / 6), y + 8 + trail + (k % 2 ? 2 : 0) + Math.sin(now * 5 + k) * 0.6);
      g.closePath(); g.fill();
      g.strokeStyle = '#ffffff1f'; g.lineWidth = 0.6; g.stroke();
    };
    const sword = (inFront) => {
      if (P.swing > 0 || P.spin > 0) return;
      if (inFront !== (dir !== 'up')) return;
      const hx = dir === 'up' ? x - 5 : x + 6 * lr, hy = y + 1 + br;
      const tx = hx + 4 * (dir === 'up' ? -1 : lr), ty = hy + 10;
      g.lineCap = 'round';
      g.strokeStyle = '#222'; g.lineWidth = 3; g.beginPath(); g.moveTo(hx, hy); g.lineTo(tx, ty); g.stroke();
      g.strokeStyle = blade; g.lineWidth = 1.6; g.beginPath(); g.moveTo(hx, hy); g.lineTo(tx, ty); g.stroke();
      g.strokeStyle = '#555'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(hx - 2, hy + 0.5); g.lineTo(hx + 2, hy - 0.5); g.stroke();
    };
    if (dir !== 'up') cape();
    sword(false);
    // legs
    g.fillStyle = '#0e0e10';
    g.fillRect(x - 3.2, y + 1, 2.4, 6 + step * 1.2); g.fillRect(x + 0.8, y + 1, 2.4, 6 - step * 1.2);
    // torso
    g.fillStyle = armor; g.beginPath(); g.moveTo(x - 5, y - 6 + br); g.lineTo(x + 5, y - 6 + br); g.lineTo(x + 4, y + 2); g.lineTo(x - 4, y + 2); g.fill();
    g.fillStyle = '#00000066'; g.fillRect(x - 4, y, 8, 1.2);
    if (P.armor === 'chain' || P.armor === 'plate' || P.armor === 'dragon') { g.fillStyle = '#ffffff22'; g.fillRect(x - 3.5, y - 4 + br, 7, 1); }
    // pauldron on the sword arm
    const px = dir === 'up' ? x - 4.5 : x + 4.5 * lr;
    g.fillStyle = '#6e7279'; g.beginPath(); g.ellipse(px, y - 5.5 + br, 2.8, 2, 0, 0, 7); g.fill(); g.fillStyle = '#ffffff30'; g.fillRect(px - 1.5, y - 6.8 + br, 3, 0.8);
    // hood with a shadowed face and two pale glints
    const hy = y - 9 + br;
    g.fillStyle = '#18181c'; g.beginPath(); g.arc(x, hy, 5.2, 0, 7); g.fill();
    const tip = dir === 'left' ? 2.2 : dir === 'right' ? -2.2 : 0;
    g.beginPath(); g.moveTo(x - 4, hy - 2.5); g.quadraticCurveTo(x + tip, hy - 9, x + tip * 2.3, hy - 7.5); g.lineTo(x + 4, hy - 2.5); g.fill();
    g.strokeStyle = '#ffffff2a'; g.lineWidth = 0.7; g.beginPath(); g.arc(x, hy, 5.2, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    if (dir !== 'up') {
      const fo = dir === 'left' ? -1.6 : dir === 'right' ? 1.6 : 0;
      g.fillStyle = '#030304'; g.beginPath(); g.ellipse(x + fo, hy + 0.8, dir === 'down' ? 3.1 : 2.4, 2.8, 0, 0, 7); g.fill();
      g.fillStyle = '#e9e9e9';
      if (dir === 'down') { g.fillRect(x - 1.7, hy + 0.5, 1, 1); g.fillRect(x + 0.8, hy + 0.5, 1, 1); }
      else g.fillRect(x + fo + (dir === 'right' ? 0.6 : -1.4), hy + 0.5, 1, 1);
    }
    if (dir === 'up') cape();
    sword(true);
    // attacks
    g.lineCap = 'round';
    if (P.spin > 0) {
      const a = (1 - P.spin / 0.35) * Math.PI * 2;
      g.strokeStyle = '#ffffff40'; g.lineWidth = 6; g.beginPath(); g.arc(x, y - 2, 18, a - 2.2, a); g.stroke();
      g.strokeStyle = blade; g.lineWidth = 2; g.beginPath(); g.moveTo(x + Math.cos(a) * 4, y - 2 + Math.sin(a) * 4); g.lineTo(x + Math.cos(a) * 19, y - 2 + Math.sin(a) * 19); g.stroke();
    } else if (P.swing > 0) {
      const base = Math.atan2(P.fy, P.fx), k = 1 - P.swing / 0.24, a = base - 1.2 + k * 2.4;
      g.strokeStyle = '#ffffff38'; g.lineWidth = 7; g.beginPath(); g.arc(x, y - 2, 14, base - 1.2, a); g.stroke();
      g.strokeStyle = '#ffffff70'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y - 2, 17, base - 1.2, a); g.stroke();
      g.strokeStyle = '#111'; g.lineWidth = 3.2; g.beginPath(); g.moveTo(x + Math.cos(a) * 4, y - 2 + Math.sin(a) * 4); g.lineTo(x + Math.cos(a) * 18, y - 2 + Math.sin(a) * 18); g.stroke();
      g.strokeStyle = blade; g.lineWidth = 1.8; g.beginPath(); g.moveTo(x + Math.cos(a) * 4, y - 2 + Math.sin(a) * 4); g.lineTo(x + Math.cos(a) * 18, y - 2 + Math.sin(a) * 18); g.stroke();
    }
    if (P.shield) {
      const sx = x + P.fx * 7, sy = y - 1 + P.fy * 6;
      g.fillStyle = '#1d1d22'; g.beginPath(); g.moveTo(sx - 4, sy - 5); g.lineTo(sx + 4, sy - 5); g.lineTo(sx + 4, sy + 1); g.lineTo(sx, sy + 6); g.lineTo(sx - 4, sy + 1); g.closePath(); g.fill();
      g.strokeStyle = '#9a9ea6'; g.lineWidth = 1; g.stroke();
    }
    g.globalAlpha = 1;
  }
  const LANTERN = new Set(['elder', 'innkeep', 'trader', 'peddler', 'ranger']);
  function drawNpc(g, n, now) {
    const x = n.x * TS + 8, y = n.y * TS + 8;
    robed(g, x, y, shade(n.color, 0.45), now, { lantern: LANTERN.has(n.id), spear: !!n.gate });
    // "!" when they have a quest for you, "?" when you can turn one in
    const quest = n.id === 'elder' ? ['lamp1', 'lamp2', 'lamp3'] : Object.entries(QUESTS).filter(([, q]) => q.giver === n.id).map(([id]) => id);
    const offer = quest.some((q) => !qState(q) && (n.id !== 'elder' || q === 'lamp1')), ready = quest.some((q) => qReady(q));
    if (offer || ready) { g.fillStyle = '#f0f0f0'; g.font = '800 12px Segoe UI'; g.textAlign = 'center'; g.fillText(ready ? '?' : '!', x, y - 19 + Math.sin(now * 4) * 1.5); }
    if (n.shop) { g.fillStyle = '#cfcfcf'; g.font = '700 9px Segoe UI'; g.textAlign = 'center'; g.fillText('$', x + 9, y - 13); }
  }
  // Monsters are dark shapes with a faint rim; their red eyes are drawn later, over the dark.
  function drawEnemy(g, e, now) {
    const flash = e.hurtT > 0 && Math.floor(now * 30) % 2;
    const col = flash ? '#e8e8e8' : shade(e.color, e.boss ? 0.42 : 0.38);
    g.fillStyle = '#00000088'; g.beginPath(); g.ellipse(e.x, e.y + e.r * 0.8, e.r, e.r * 0.35, 0, 0, 7); g.fill();
    const bob = e.ai === 'fly' || e.flies || e.ai === 'boss3' ? Math.sin(now * 8 + e.t) * 2 - 4 : 0;
    g.fillStyle = col; g.strokeStyle = '#ffffff22'; g.lineWidth = 0.8;
    g.beginPath();
    if (e.ai === 'hop' || e.ai === 'boss1') {
      const sq = 1 + Math.sin(now * 6 + e.t) * 0.08;
      g.ellipse(e.x, e.y, e.r * sq, e.r * 0.8 / sq, 0, Math.PI, 0); g.lineTo(e.x + e.r * sq, e.y + e.r * 0.4); g.lineTo(e.x - e.r * sq, e.y + e.r * 0.4); g.closePath(); g.fill(); g.stroke();
      if (e.ai === 'boss1') { g.fillStyle = '#9a9a9a'; g.beginPath(); g.moveTo(e.x - 8, e.y - e.r * 0.75); g.lineTo(e.x - 4, e.y - e.r * 1.15); g.lineTo(e.x, e.y - e.r * 0.8); g.lineTo(e.x + 4, e.y - e.r * 1.15); g.lineTo(e.x + 8, e.y - e.r * 0.75); g.fill(); }
    } else if (e.ai === 'fly') {
      g.arc(e.x, e.y + bob, e.r * 0.7, 0, 7); g.fill();
      const fl = Math.sin(now * 30) * 4; g.beginPath(); g.moveTo(e.x, e.y + bob); g.lineTo(e.x - 9, e.y + bob - 3 + fl); g.lineTo(e.x - 3, e.y + bob + 2); g.moveTo(e.x, e.y + bob); g.lineTo(e.x + 9, e.y + bob - 3 + fl); g.lineTo(e.x + 3, e.y + bob + 2); g.fill();
    } else if (e.ai === 'boss3') {
      g.ellipse(e.x, e.y + bob, e.r, e.r * 0.6, 0, 0, 7); g.fill(); g.stroke();
      const fl = Math.sin(now * 6) * 8; g.beginPath(); g.moveTo(e.x - 6, e.y + bob); g.lineTo(e.x - 30, e.y + bob - 14 + fl); g.lineTo(e.x - 10, e.y + bob + 6); g.moveTo(e.x + 6, e.y + bob); g.lineTo(e.x + 30, e.y + bob - 14 + fl); g.lineTo(e.x + 10, e.y + bob + 6); g.fill();
    } else { g.roundRect(e.x - e.r, e.y - e.r + bob, e.r * 2, e.r * 1.7, e.r * 0.5); g.fill(); g.stroke(); }
    if (e.state === 'wind') { g.strokeStyle = '#ff3b3b'; g.lineWidth = 1.5; g.beginPath(); g.arc(e.x, e.y, e.r + 4, 0, 7); g.stroke(); }
    if (!e.boss && e.hp < e.max) { g.fillStyle = '#000c'; g.fillRect(e.x - 8, e.y - e.r - 7, 16, 2.5); g.fillStyle = '#9a9a9a'; g.fillRect(e.x - 8, e.y - e.r - 7, 16 * Math.max(0, e.hp / e.max), 2.5); }
  }

  // ---------- lighting and atmosphere ----------
  // A heavy darkness layer with holes cut out for lights (your torch, lanterns, lava, doorways, fire, glowcaps),
  // drifting fog that only shows where there's light, falling ash, and a deep vignette.
  // Outside the light you can still just make things out (about 5%).
  const DARKNESS = { village: 0.95, woods: 0.95, hills: 0.95, peak: 0.95, cave1: 0.95, cave2: 0.95, tower: 0.95 };
  let lc, lg;
  const fog = Array.from({ length: 7 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 50 + Math.random() * 70, v: 4 + Math.random() * 8, a: 0.04 + Math.random() * 0.05 }));
  const ash = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: 6 + Math.random() * 14, d: Math.random() * 6 }));
  function drawFog(g, dt) {
    for (const f of fog) {
      f.x += f.v * dt; if (f.x - f.r > W) { f.x = -f.r; f.y = Math.random() * H; }
      const gr = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r); gr.addColorStop(0, `rgba(200,200,205,${f.a})`); gr.addColorStop(1, 'rgba(200,200,205,0)');
      g.fillStyle = gr; g.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
    }
  }
  function drawLight(g, cx, cy, now) {
    if (!lc) { lc = document.createElement('canvas'); lc.width = W; lc.height = H; lg = lc.getContext('2d'); }
    const dungeon = !!world.boss, warm = [];
    lg.globalCompositeOperation = 'source-over'; lg.clearRect(0, 0, W, H);
    lg.fillStyle = `rgba(1,1,3,${DARKNESS[world.id] ?? 0.8})`; lg.fillRect(0, 0, W, H);
    lg.globalCompositeOperation = 'destination-out';
    // bright across most of the radius, then a soft fall-off into the dark
    const hole = (x, y, r, a = 1) => { const gr = lg.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.55, `rgba(0,0,0,${a * 0.92})`); gr.addColorStop(0.8, `rgba(0,0,0,${a * 0.45})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); lg.fillStyle = gr; lg.beginPath(); lg.arc(x, y, r, 0, 7); lg.fill(); };
    const flick = Math.sin(now * 11) * 1.6 + Math.sin(now * 4.3) * 2 + Math.sin(now * 23) * 0.6;
    hole(P.x - cx, P.y - cy - 4, (dungeon ? 118 : 148) + flick * 1.5);
    for (const n of world.npcs) if (LANTERN.has(n.id)) hole(n.x * TS + 14 - cx, n.y * TS + 8 - cy, 40 + flick * 0.6, 0.85);
    for (let ty = Math.floor(cy / TS) - 1; ty <= Math.floor((cy + H) / TS) + 1; ty++) for (let tx = Math.floor(cx / TS) - 1; tx <= Math.floor((cx + W) / TS) + 1; tx++) {
      const t = RPG.get(world, tx, ty), x = tx * TS + 8 - cx, y = ty * TS + 8 - cy;
      if (t === T.LAVA) { hole(x, y, 20 + Math.sin(now * 4 + tx) * 3, 0.35); warm.push([x, y, 16, '255,110,30', 0.04]); }
      if (t === T.DOOR) { hole(x, y + 6, 24, 0.55); warm.push([x, y + 6, 20, '255,170,70', 0.08]); }
      if (t === T.CAVE) hole(x, y, 12, 0.2);
    }
    for (const sh of shots) hole(sh.x - cx, sh.y - cy, 20, 0.75);
    for (const pk of world.picks) if (!P.opened.includes(pk.id)) hole(pk.x * TS + 8 - cx, pk.y * TS + 8 - cy, 16, 0.5);
    g.drawImage(lc, 0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    for (const [x, y, r, rgb, a] of warm) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    // ash drifting down, catching your torchlight
    g.fillStyle = '#d0d0d0';
    for (const a of ash) {
      a.y += a.v / 60; a.x += Math.sin(now + a.d) * 0.2;
      if (a.y > H) { a.y = -2; a.x = Math.random() * W; }
      g.globalAlpha = Math.hypot(a.x - (P.x - cx), a.y - (P.y - cy)) < 120 ? 0.45 : 0.05; g.fillRect(a.x, a.y, 1, 1);
    }
    g.globalAlpha = 1;
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.22, W / 2, H / 2, H * 0.8); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
  // A little film grain, drawn after the black-and-white pass.
  function drawGrain(g) {
    for (let i = 0; i < 160; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'; g.fillRect(Math.random() * W, Math.random() * H, 1, 1); }
  }

  // Red eyes in a grey world: the only colour on the map.
  function drawEyes(g, cx, cy, now) {
    for (const e of ents) {
      const ex = e.x - cx, ey = e.y - cy - e.r * 0.3 + (e.ai === 'fly' || e.flies || e.ai === 'boss3' ? Math.sin(now * 8 + e.t) * 2 - 4 : 0);
      const s = e.boss ? 3 : 2;
      g.fillStyle = '#ff2a2a'; g.shadowColor = '#ff2a2a'; g.shadowBlur = e.boss ? 8 : 4;
      g.fillRect(ex - 1 - s, ey, s, s); g.fillRect(ex + 1, ey, s, s);
    }
    g.shadowBlur = 0;
    for (const f of floats) if (f.col === '#ff5d6c') { g.globalAlpha = 1 - f.t / 1.1; g.fillStyle = '#ff3b3b'; g.font = '700 10px Segoe UI'; g.textAlign = 'center'; g.fillText(f.text, f.x - cx, f.y - cy - f.t * 20); g.globalAlpha = 1; }
  }

  // ---------- HUD and menus ----------
  function drawHud(g) {
    g.fillStyle = '#000000aa'; g.beginPath(); g.roundRect(4, 4, 118, 30, 6); g.fill();
    g.fillStyle = '#2a1414'; g.fillRect(9, 9, 108, 8);
    g.fillStyle = P.hp / P.maxHp < 0.3 ? '#ff3b3b' : '#e0484f'; g.fillRect(9, 9, 108 * Math.max(0, P.hp / P.maxHp), 8);
    g.fillStyle = '#fff'; g.font = '700 8px Segoe UI'; g.textAlign = 'center'; g.fillText(`${Math.ceil(P.hp)} / ${P.maxHp}`, 63, 16);
    g.fillStyle = '#222'; g.fillRect(9, 20, 108, 3); g.fillStyle = '#d8d8d8'; g.fillRect(9, 20, 108 * (P.xp / xpNeed(P.lvl)), 3);
    g.textAlign = 'left'; g.fillStyle = '#ddd'; g.font = '9px Segoe UI'; g.fillText(`Lv ${P.lvl}   ${P.gold}g   🧪${P.potions}`, 9, 31);
    if (boss && !boss.dead && Math.hypot(boss.x - P.x, boss.y - P.y) < 230) {
      g.fillStyle = '#000000aa'; g.fillRect(40, H - 22, W - 80, 16);
      g.fillStyle = '#5a1d22'; g.fillRect(44, H - 13, W - 88, 5); g.fillStyle = '#ff3b3b'; g.fillRect(44, H - 13, (W - 88) * Math.max(0, boss.hp / boss.max), 5);
      g.fillStyle = '#fff'; g.font = '700 8px Segoe UI'; g.textAlign = 'center'; g.fillText(boss.name, W / 2, H - 15);
    }
    if (banner) { g.globalAlpha = Math.min(1, banner.t); g.fillStyle = '#000000b0'; g.font = '700 12px Segoe UI'; const w = Math.min(W - 20, g.measureText(banner.text).width + 24); g.beginPath(); g.roundRect(W / 2 - w / 2, 42, w, 22, 8); g.fill(); g.fillStyle = '#f0f0f0'; g.textAlign = 'center'; g.fillText(banner.text, W / 2, 57, W - 30); g.globalAlpha = 1; }
  }
  function wrap(g, text, x, y, maxW, lh) {
    const words = text.split(' '); let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW) { g.fillText(line, x, y); y += lh; line = w; } else line = t; }
    if (line) g.fillText(line, x, y);
    return y + lh;
  }
  function panel(g, x, y, w, h) { g.fillStyle = '#10131bdd'; g.beginPath(); g.roundRect(x, y, w, h, 8); g.fill(); g.strokeStyle = '#ffffff33'; g.lineWidth = 1; g.stroke(); }
  function drawUi(g) {
    g.textAlign = 'left';
    if (ui.mode === 'talk') {
      panel(g, 8, H - 86, W - 16, 78);
      g.fillStyle = '#ffffff'; g.font = '700 11px Segoe UI'; g.fillText(ui.name, 18, H - 68);
      g.fillStyle = '#eee'; g.font = '11px Segoe UI'; wrap(g, ui.lines[ui.i] || '', 18, H - 52, W - 40, 14);
      g.fillStyle = '#999'; g.font = '9px Segoe UI'; g.textAlign = 'right'; g.fillText('E / click ▸', W - 16, H - 14);
      return;
    }
    if (ui.mode === 'shop') {
      const items = shopItems(ui.npc);
      panel(g, 20, 30, W - 40, 50 + items.length * 30);
      g.fillStyle = '#ffffff'; g.font = '700 12px Segoe UI'; g.fillText(ui.npc.name, 32, 50);
      g.fillStyle = '#ccc'; g.font = '10px Segoe UI'; g.textAlign = 'right'; g.fillText(`You have ${P.gold}g`, W - 32, 50); g.textAlign = 'left';
      items.forEach((it, i) => {
        const y = 70 + i * 30, owned = P.owned.includes(it.id), worn = P.weapon === it.id || P.armor === it.id;
        g.fillStyle = i === ui.sel ? '#ffffff22' : '#ffffff08'; g.fillRect(30, y, W - 60, 26);
        g.fillStyle = '#fff'; g.font = '600 11px Segoe UI'; g.fillText(`${i + 1}. ${it.name}`, 38, y + 12);
        g.fillStyle = '#aaa'; g.font = '9.5px Segoe UI'; g.fillText(it.kind === 'weapon' ? `Attack ${it.atk}` : it.kind === 'armor' ? `Defense ${it.def}` : `Heals ${it.heal} (you have ${P.potions}/9)`, 38, y + 22);
        g.textAlign = 'right'; g.fillStyle = worn ? '#ffffff' : owned ? '#bbbbbb' : P.gold >= it.price ? '#e6e6e6' : '#666666'; g.font = '700 11px Segoe UI';
        g.fillText(worn ? 'Equipped' : owned ? 'Equip' : it.price + 'g', W - 38, y + 17); g.textAlign = 'left';
      });
      g.fillStyle = '#888'; g.font = '9px Segoe UI'; g.fillText('Click or press 1-4 to buy · Esc to leave', 32, 64 + items.length * 30 + 12);
      return;
    }
    if (ui.mode === 'quests') {
      panel(g, 12, 12, W - 24, H - 24);
      g.fillStyle = '#ffffff'; g.font = '700 13px Segoe UI'; g.fillText('Quests', 24, 34);
      let y = 52;
      const list = Object.entries(P.quests).sort((a, b) => (a[1].state === 'done') - (b[1].state === 'done'));
      if (!list.length) { g.fillStyle = '#ccc'; g.font = '11px Segoe UI'; g.fillText('No quests yet. Look for people with a "!" over them.', 24, y); }
      for (const [id, s] of list) {
        const q = QUESTS[id]; if (y > H - 30) break;
        g.fillStyle = s.state === 'done' ? '#777' : '#fff'; g.font = '700 11px Segoe UI';
        g.fillText(`${s.state === 'done' ? '✓ ' : ''}${q.title}${s.state === 'active' ? ` (${q.type === 'kill' ? s.n : P.inv[q.item] || 0}/${q.count})` : ''}`, 24, y); y += 13;
        if (s.state === 'active') { g.fillStyle = '#bbb'; g.font = '10px Segoe UI'; y = wrap(g, q.desc, 24, y, W - 60, 12); }
        y += 5;
      }
      return;
    }
    if (ui.mode === 'gear') {
      panel(g, 12, 12, W - 24, H - 24);
      g.fillStyle = '#ffffff'; g.font = '700 13px Segoe UI'; g.fillText(`Hero · Level ${P.lvl}`, 24, 34);
      g.fillStyle = '#ddd'; g.font = '10.5px Segoe UI';
      g.fillText(`HP ${Math.ceil(P.hp)}/${P.maxHp} · Attack ${atk()} · Defense ${def()} · XP ${P.xp}/${xpNeed(P.lvl)}`, 24, 52);
      g.fillText(`Skills: ${['dash', 'spin', 'shield'].filter(has).join(', ') || 'none yet (level 2)'}`, 24, 66);
      g.fillStyle = '#999'; g.fillText('Gear (click to equip):', 24, 84);
      P.owned.forEach((id, i) => { const it = ITEMS[id], worn = P.weapon === id || P.armor === id; g.fillStyle = worn ? '#fff' : '#999'; g.fillText(`${worn ? '▶ ' : '   '}${it.name}  (${it.kind === 'weapon' ? 'atk ' + it.atk : 'def ' + it.def})`, 30, 104 + i * 18); });
      const bag = Object.entries(P.inv).filter(([, n]) => n > 0);
      g.fillStyle = '#999'; g.fillText('Bag:', 190, 84);
      g.fillStyle = '#fff'; g.fillText(`Potions × ${P.potions}`, 190, 104);
      bag.forEach(([id, n], i) => g.fillText(`${ITEMS[id].name} × ${n}`, 190, 122 + i * 18));
      return;
    }
    if (ui.mode === 'map') {
      panel(g, 8, 8, W - 16, H - 16);
      const s = Math.min((W - 40) / (world.w * TS), (H - 60) / (world.h * TS)), mw = world.w * TS * s, mh = world.h * TS * s, ox = (W - mw) / 2, oy = 34;
      g.save(); g.filter = 'grayscale(1) contrast(1.25)'; g.drawImage(mapCanvas, 0, 0, world.w * TS, world.h * TS, ox, oy, mw, mh); g.restore();
      g.fillStyle = '#ffffff'; g.font = '700 12px Segoe UI'; g.fillText(world.name, 20, 26);
      for (const n of world.npcs) { g.fillStyle = '#bbbbbb'; g.fillRect(ox + n.x * TS * s - 1.5, oy + n.y * TS * s - 1.5, 3, 3); }
      for (const w of world.warps) { g.fillStyle = w.need && !P.flags[w.need] ? '#ff3b3b' : '#ffffff'; g.fillRect(ox + w.x * TS * s - 2, oy + w.y * TS * s - 2, 4, 4); }
      g.fillStyle = '#fff'; g.beginPath(); g.arc(ox + P.x * s, oy + P.y * s, 3, 0, 7); g.fill();
      g.fillStyle = '#aaa'; g.font = '9px Segoe UI'; g.fillText('You (dot) · People (grey) · Exits (white, red = closed)', 20, H - 16);
    }
  }
})();
