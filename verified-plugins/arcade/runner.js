// Rooftop Run: endless parkour across city rooftops. Jump the gaps and vents (double jump in the air), slide under
// the signs, grab coins. It speeds up as you go.
(() => {
  const W = 360, H = 300, GRAV = 1600, JUMP = -540, JUMP2 = -470, PX = 70;
  let A, st, p, roofs, obs, coins, sky, parts;

  function reset() {
    st = { state: 'ready', speed: 175, dist: 0, coins: 0, t: 0 };
    p = { y: 200 - 26, vy: 0, h: 26, ground: true, jumps: 0, coyote: 0, buffer: 0, slide: 0, run: 0, dead: false };
    roofs = [{ x: -20, w: 420, y: 200 }];
    obs = []; coins = []; parts = [];
    while (roofs[roofs.length - 1].x < W * 2) addRoof();
    sky = Array.from({ length: 14 }, (_, i) => ({ x: i * 34 + rand(0, 10), w: rand(22, 34), h: rand(50, 130), lit: Math.random() }));
  }
  function addRoof() {
    const last = roofs[roofs.length - 1];
    const gapMax = 50 + st.speed * 0.22;
    const gap = rand(38, gapMax);
    const y = clamp(last.y + rand(-46, 46), 150, 250);
    const w = rand(120, 260);
    const r = { x: last.x + last.w + gap, w, y };
    roofs.push(r);
    // obstacles and coins on the new roof, away from its edges
    if (w > 150 && Math.random() < 0.7) {
      const ox = r.x + rand(50, w - 60);
      if (Math.random() < 0.55) obs.push({ kind: 'vent', x: ox, y: y - 16, w: 18, h: 16 });
      else obs.push({ kind: 'sign', x: ox, y: y - 44, w: 34, h: 16 }); // slide under it
    }
    const n = irand(3, 6), cx = r.x + rand(20, Math.max(25, w - 20 - n * 18));
    const arc = Math.random() < 0.5;
    for (let i = 0; i < n; i++) coins.push({ x: cx + i * 18, y: y - 26 - (arc ? Math.sin((i / (n - 1)) * Math.PI) * 34 : 0), got: false });
  }
  function die() {
    if (p.dead) return;
    p.dead = true; st.state = 'over'; A.sfx('lose');
    const score = Math.floor(st.dist / 10) + st.coins * 10;
    const best = A.best('runner', score);
    A.overlay('You fell!', `Score <b>${score}</b> · Best ${best}<br>${Math.floor(st.dist / 10)} m and ${st.coins} coins`, [['Run again', () => { reset(); go(); }]]);
  }
  function go() { st.state = 'run'; A.hideOverlay(); }

  GAMES.runner = {
    name: 'Rooftop Run', W, H,
    help: 'Space / Up / click: jump (again in the air to double jump) · Down / S / right-click: slide',
    desc: 'Parkour across the rooftops.',
    bestLabel: (b) => (b ? `Best ${b}` : 'No runs yet'),
    thumb(g, w, h) {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1b1f3a'); gr.addColorStop(1, '#4a2f5c'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#12142a'; for (let i = 0; i < 6; i++) g.fillRect(i * 30, h - 30 - (i % 3) * 14, 26, 60);
      g.fillStyle = '#ff8a3d'; g.fillRect(w / 2 - 4, h / 2 - 8, 8, 14);
    },
    start(a) { A = a; reset(); A.overlay('Rooftop Run', 'Space or click to jump, again in the air to double jump. Down to slide under signs.', [['Play', go]]); },
    update(dt) {
      if (st.state === 'ready' && (A.hit('Space', 'ArrowUp', 'KeyW') || A.mouse.clicked)) go();
      if (st.state !== 'run') return;
      st.t += dt;
      st.speed = Math.min(430, 175 + st.t * 4.2);
      const dx = st.speed * dt;
      st.dist += dx;
      for (const list of [roofs, obs, coins, parts]) for (const o of list) o.x -= dx;
      for (const s of sky) { s.x -= dx * 0.25; if (s.x < -40) s.x += 14 * 34; }
      while (roofs[0].x + roofs[0].w < -40) roofs.shift();
      obs = obs.filter((o) => o.x > -60); coins = coins.filter((c) => c.x > -20 && !c.got);
      while (roofs[roofs.length - 1].x < W * 2) addRoof();

      // input with a little forgiveness: jump buffer and coyote time
      const wantJump = A.hit('Space', 'ArrowUp', 'KeyW') || A.mouse.clicked;
      if (wantJump) p.buffer = 0.12;
      p.buffer -= dt; p.coyote -= dt;
      const sliding = A.key('ArrowDown', 'KeyS') || A.mouse.right;
      p.h = sliding && p.ground ? 13 : 26;
      if (p.buffer > 0) {
        if (p.ground || p.coyote > 0) { p.vy = JUMP; p.ground = false; p.coyote = 0; p.jumps = 1; p.buffer = 0; A.sfx('jump'); }
        else if (p.jumps < 2) { p.vy = JUMP2; p.jumps = 2; p.buffer = 0; A.sfx('jump'); for (let i = 0; i < 6; i++) parts.push({ x: PX + 8, y: p.y + p.h, vx: rand(-60, 60), vy: rand(20, 90), t: 0 }); }
      }
      if (!sliding && (A.keys.has('Space') || A.keys.has('ArrowUp') || A.keys.has('KeyW') || A.mouse.down) === false && p.vy < -200) p.vy += GRAV * dt; // short hop when released early
      if (sliding && !p.ground) p.vy += GRAV * 1.5 * dt; // fast-fall
      p.vy += GRAV * dt;
      const prevBottom = p.y + p.h;
      p.y += p.vy * dt;
      // land on a roof
      const roof = roofs.find((r) => PX + 14 > r.x && PX + 2 < r.x + r.w);
      const wasGround = p.ground;
      p.ground = false;
      if (roof && p.vy >= 0 && prevBottom <= roof.y + 2 && p.y + p.h >= roof.y) { p.y = roof.y - p.h; p.vy = 0; p.ground = true; p.jumps = 0; if (!wasGround) A.sfx('land'); }
      if (wasGround && !p.ground && p.vy >= 0) p.coyote = 0.08;
      // ran into the side of a taller roof
      if (roof && !p.ground && p.y + p.h > roof.y + 6 && PX + 14 > roof.x && PX < roof.x + 24) die();
      if (p.y > H + 40) die();
      // obstacles and coins
      const px1 = PX + 2, px2 = PX + 14, py1 = p.y + 2, py2 = p.y + p.h;
      for (const o of obs) if (px2 > o.x + 2 && px1 < o.x + o.w - 2 && py2 > o.y + 2 && py1 < o.y + o.h - 2) { A.sfx('hit'); die(); }
      for (const c of coins) if (!c.got && Math.abs(c.x - (PX + 8)) < 13 && Math.abs(c.y - (p.y + p.h / 2)) < 16) { c.got = true; st.coins++; A.sfx('coin'); }
      p.run += dt * st.speed / 18;
      parts = parts.filter((q) => (q.t += dt) < 0.4); for (const q of parts) { q.x += q.vx * dt; q.y += q.vy * dt; }
      A.hud(`${Math.floor(st.dist / 10)} m · ${st.coins} coins`);
    },
    draw(g) {
      const acc = css('--accent');
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#141833'); gr.addColorStop(1, '#3f2a55'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ffffffcc'; g.beginPath(); g.arc(300, 46, 16, 0, 7); g.fill();
      for (const s of sky) {
        g.fillStyle = '#1d2140'; g.fillRect(s.x, H - 70 - s.h, s.w, s.h + 70);
        g.fillStyle = '#ffd77a44';
        for (let yy = H - 64 - s.h; yy < H - 20; yy += 12) for (let xx = s.x + 4; xx < s.x + s.w - 4; xx += 8) if ((xx * 7 + yy * 13 + Math.floor(s.lit * 10)) % 5 === 0) g.fillRect(xx, yy, 3, 5);
      }
      for (const r of roofs) {
        g.fillStyle = '#0d0f20'; g.fillRect(r.x, r.y, r.w, H - r.y);
        g.fillStyle = '#2a2e4f'; g.fillRect(r.x, r.y, r.w, 5);
        g.fillStyle = '#ffd77a33'; for (let yy = r.y + 16; yy < H; yy += 18) for (let xx = r.x + 8; xx < r.x + r.w - 8; xx += 16) if (((xx - r.x) / 16 + yy) % 3 < 1) g.fillRect(xx, yy, 6, 8);
      }
      for (const o of obs) {
        if (o.kind === 'vent') { g.fillStyle = '#7c8394'; g.fillRect(o.x, o.y, o.w, o.h); g.fillStyle = '#4a5060'; for (let i = 3; i < o.h; i += 4) g.fillRect(o.x + 2, o.y + i, o.w - 4, 1.5); }
        else { g.fillStyle = '#4a5060'; g.fillRect(o.x + 3, o.y + o.h, 2, 30); g.fillRect(o.x + o.w - 5, o.y + o.h, 2, 30); g.fillStyle = '#ff5d6c'; g.fillRect(o.x, o.y, o.w, o.h); g.fillStyle = '#fff'; g.font = '700 9px Segoe UI'; g.textAlign = 'center'; g.fillText('STOP', o.x + o.w / 2, o.y + 11); }
      }
      for (const c of coins) { g.fillStyle = '#ffd23d'; g.beginPath(); g.ellipse(c.x, c.y, 5 * Math.abs(Math.sin(performance.now() / 200 + c.x / 30)) + 1.5, 6, 0, 0, 7); g.fill(); }
      for (const q of parts) { g.fillStyle = `rgba(255,255,255,${1 - q.t / 0.4})`; g.fillRect(q.x, q.y, 2, 2); }
      // runner
      const x = PX, y = p.y, h = p.h, leg = Math.sin(p.run) * (p.ground ? 5 : 2);
      g.strokeStyle = acc; g.lineWidth = 3; g.lineCap = 'round';
      if (h < 20) { // sliding
        g.beginPath(); g.arc(x + 12, y + 3, 4, 0, 7); g.fillStyle = acc; g.fill();
        g.beginPath(); g.moveTo(x + 9, y + 6); g.lineTo(x, y + 11); g.stroke();
        g.beginPath(); g.moveTo(x, y + 11); g.lineTo(x - 6, y + 13); g.stroke();
      } else {
        g.fillStyle = acc; g.beginPath(); g.arc(x + 9, y + 4, 4.5, 0, 7); g.fill();
        g.beginPath(); g.moveTo(x + 8, y + 9); g.lineTo(x + 6, y + 17); g.stroke();
        g.beginPath(); g.moveTo(x + 6, y + 17); g.lineTo(x + 6 + leg, y + h); g.moveTo(x + 6, y + 17); g.lineTo(x + 6 - leg, y + h); g.stroke();
        g.beginPath(); g.moveTo(x + 8, y + 11); g.lineTo(x + 8 - leg, y + 15); g.moveTo(x + 8, y + 11); g.lineTo(x + 12 + leg * 0.5, y + 14); g.stroke();
      }
    },
  };
})();
