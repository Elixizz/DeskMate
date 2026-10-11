// Mate Factory: start a Mate-making business in a garage. Write code, sketch designs and run tests to build Mates,
// ship them for downloads and money, hire a team, move to bigger offices, and one day sell the company.
// Earns from real time, so the team keeps working while DeskMate is hidden or closed (up to 8 hours).
(() => {
  const ROLES = [
    { id: 'intern', name: 'Intern', em: '🧑‍🎓', cost: 25, salary: 0.1, code: 0.5, design: 0.2, test: 0.2, desc: 'A bit of everything' },
    { id: 'dev', name: 'Developer', em: '👩‍💻', cost: 150, salary: 1, code: 3, desc: 'Writes code' },
    { id: 'designer', name: 'Designer', em: '🎨', cost: 220, salary: 1, design: 2.2, desc: 'Designs screens' },
    { id: 'tester', name: 'Tester', em: '🧪', cost: 200, salary: 0.8, test: 2.2, desc: 'Finds bugs, raises quality' },
    { id: 'marketer', name: 'Marketer', em: '📣', cost: 900, salary: 2.5, market: 0.06, desc: '+6% revenue each' },
    { id: 'manager', name: 'Manager', em: '🧑‍💼', cost: 4000, salary: 6, boost: 0.1, desc: '+10% team output, auto-ships Mates' },
  ];
  const OFFICES = [
    { name: 'Garage', cap: 4, cost: 0 },
    { name: 'Co-working Desk', cap: 10, cost: 2500 },
    { name: 'Startup Loft', cap: 25, cost: 30000 },
    { name: 'Studio', cap: 60, cost: 350000 },
    { name: 'Campus', cap: 150, cost: 5e6 },
    { name: 'HQ Tower', cap: 400, cost: 8e7 },
  ];
  const IDEAS = [
    { id: 'notes', name: 'Sticky Notes Mate', em: '📝', code: 30, design: 10, test: 10, rev: 1 },
    { id: 'timer', name: 'Timer Mate', em: '⏱️', code: 90, design: 35, test: 30, rev: 3 },
    { id: 'weather', name: 'Weather Mate', em: '⛅', code: 220, design: 90, test: 70, rev: 8 },
    { id: 'calc', name: 'Calculator Mate', em: '🧮', code: 500, design: 160, test: 170, rev: 16 },
    { id: 'music', name: 'Music Player Mate', em: '🎵', code: 1400, design: 600, test: 450, rev: 42 },
    { id: 'clip', name: 'Clipboard Mate', em: '📋', code: 3500, design: 1100, test: 1400, rev: 95 },
    { id: 'crypto', name: 'Crypto Ticker Mate', em: '📈', code: 9000, design: 3500, test: 3500, rev: 230 },
    { id: 'arcade', name: 'Arcade Mate', em: '🕹️', code: 24000, design: 14000, test: 9000, rev: 580 },
    { id: 'ai', name: 'AI Assistant Mate', em: '🤖', code: 70000, design: 24000, test: 35000, rev: 1600 },
    { id: 'vault', name: 'Password Vault Mate', em: '🔐', code: 180000, design: 60000, test: 140000, rev: 4200 },
    { id: 'photo', name: 'Photo Editor Mate', em: '🖼️', code: 480000, design: 300000, test: 240000, rev: 11000 },
    { id: 'os', name: 'DeskOS', em: '💻', code: 1.8e6, design: 9e5, test: 1e6, rev: 42000 },
  ];
  const UPGRADES = [
    { id: 'coffee', name: 'Better Coffee', em: '☕', cost: 300, desc: 'Team works 20% faster', apply: (m) => (m.out *= 1.2) },
    { id: 'keyboard', name: 'Mechanical Keyboards', em: '⌨️', cost: 800, desc: 'Your clicks count x3', apply: (m) => (m.click *= 3) },
    { id: 'review', name: 'Code Reviews', em: '🔍', cost: 2500, desc: 'Shipped Mates are 10% better', apply: (m) => (m.quality += 0.1) },
    { id: 'ads', name: 'Ad Campaign', em: '📺', cost: 6000, desc: 'Revenue +40%', apply: (m) => (m.rev *= 1.4) },
    { id: 'ci', name: 'Build Pipeline', em: '🔁', cost: 15000, desc: 'Testing +50%', apply: (m) => (m.test *= 1.5) },
    { id: 'designsys', name: 'Design System', em: '🧩', cost: 40000, desc: 'Design +50%', apply: (m) => (m.design *= 1.5) },
    { id: 'remote', name: 'Remote Fridays', em: '🏡', cost: 90000, desc: 'Salaries -20%', apply: (m) => (m.salary *= 0.8) },
    { id: 'closet', name: 'Supply Closet Deal', em: '🗄️', cost: 250000, desc: 'Revenue +50%', apply: (m) => (m.rev *= 1.5) },
    { id: 'hackathon', name: 'Hackathons', em: '🏆', cost: 900000, desc: 'Team works 40% faster', apply: (m) => (m.out *= 1.4) },
    { id: 'fans', name: 'Fan Community', em: '💬', cost: 4e6, desc: 'Mates stay popular twice as long', apply: (m) => (m.decay *= 0.5) },
    { id: 'ai-tools', name: 'AI Coding Tools', em: '✨', cost: 2e7, desc: 'Code x2', apply: (m) => (m.code *= 2) },
    { id: 'global', name: 'Go Global', em: '🌍', cost: 1.5e8, desc: 'Revenue x2', apply: (m) => (m.rev *= 2) },
  ];
  const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'];
  const fmt = (n) => {
    n = Number(n) || 0;
    const neg = n < 0; n = Math.abs(n);
    let r;
    if (n < 1000) r = n < 10 ? (Math.floor(n * 10) / 10).toString() : Math.floor(n).toString();
    else { const i = Math.min(UNITS.length - 1, Math.floor(Math.log10(n) / 3)); const v = n / 10 ** (i * 3); r = v.toFixed(v < 100 ? 2 : 1) + UNITS[i]; }
    return (neg ? '-' : '') + r;
  };
  const money = (n) => '$' + fmt(n);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let A, s, tab = 'build', saveT = 0, renderT = 0, root;

  // ---------- state ----------
  function fresh(rep = 0) {
    return { cash: 25, lifetime: 0, total: 0, staff: {}, office: 0, upgrades: [], project: null, mates: [], shippedIds: [], rep, sold: 0, seen: Date.now(), name: 'Garage Mates Co.' };
  }
  function mods() {
    const m = { out: 1, click: 1, quality: 0, rev: 1, test: 1, design: 1, code: 1, salary: 1, decay: 1 };
    for (const u of UPGRADES) if (s.upgrades.includes(u.id)) u.apply(m);
    m.out *= 1 + (s.staff.manager || 0) * 0.1;
    m.rev *= (1 + (s.staff.marketer || 0) * 0.06) * (1 + s.rep * 0.1);
    return m;
  }
  const headcount = () => ROLES.reduce((n, r) => n + (s.staff[r.id] || 0), 0);
  const hireCost = (r) => Math.ceil(r.cost * 1.13 ** (s.staff[r.id] || 0));
  function rates() {
    const m = mods();
    let code = 0, design = 0, test = 0, salary = 0;
    for (const r of ROLES) { const n = s.staff[r.id] || 0; code += (r.code || 0) * n; design += (r.design || 0) * n; test += (r.test || 0) * n; salary += r.salary * n; }
    const revenue = s.mates.reduce((t, x) => t + mateRev(x, m), 0);
    return { code: code * m.out * m.code, design: design * m.out * m.design, test: test * m.out * m.test, salary: salary * m.salary, revenue, m };
  }
  const idea = (id) => IDEAS.find((i) => i.id === id);
  const mateRev = (x, m) => idea(x.id).rev * x.quality * (1 + 0.08 * (x.version - 1)) * x.pop * m.rev;
  const ideaOpen = (i) => i === 0 || s.shippedIds.includes(IDEAS[i - 1].id);

  // ---------- simulation ----------
  function step(sec) {
    const r = rates();
    // salaries come first; if you can't pay, the team stops working until you can
    const pay = r.salary * sec;
    const working = s.cash + r.revenue * sec >= pay;
    const earned = r.revenue * sec;
    s.cash += earned; s.lifetime += earned;
    if (working) s.cash -= pay;
    s.striking = !working && r.salary > 0;
    if (working && s.project) {
      const p = s.project, it = idea(p.id);
      p.code = Math.min(it.code, p.code + r.code * sec);
      p.design = Math.min(it.design, p.design + r.design * sec);
      p.test = Math.min(it.test * 1.5, p.test + r.test * sec); // extra testing past the goal still raises quality
    }
    if (working && !s.project && (s.staff.manager || 0) > 0) autoStart();
    if (working && s.project && done(s.project) && (s.staff.manager || 0) > 0 && s.project.test >= idea(s.project.id).test * 1.2) ship();
    // popularity slowly fades; updates bring it back
    for (const x of s.mates) x.pop = Math.max(0.3, x.pop - sec * 0.00025 * r.m.decay);
    for (const x of s.mates) x.downloads += idea(x.id).rev * x.pop * sec * 0.6;
  }
  const done = (p) => { const it = idea(p.id); return p.code >= it.code && p.design >= it.design && p.test >= it.test; };
  function startProject(id) { if (s.project) return; s.project = { id, code: 0, design: 0, test: 0 }; A.sfx('click'); render(); }
  function autoStart() {
    // managers pick the best Mate you know how to make, preferring ones you haven't shipped
    const open = IDEAS.filter((_, i) => ideaOpen(i));
    const next = open.find((i) => !s.shippedIds.includes(i.id)) || open[open.length - 1];
    s.project = { id: next.id, code: 0, design: 0, test: 0 };
  }
  function ship() {
    const p = s.project, it = idea(p.id), m = mods();
    const testRatio = Math.min(1.5, p.test / it.test);
    const quality = Math.max(0.5, Math.min(1.6, 0.55 + 0.35 * testRatio + m.quality + rand(-0.08, 0.08)));
    const existing = s.mates.find((x) => x.id === p.id);
    if (existing) { existing.version++; existing.quality = Math.max(existing.quality, quality); existing.pop = 1; }
    else s.mates.push({ id: p.id, quality, version: 1, pop: 1, downloads: 0, shipped: Date.now() });
    if (!s.shippedIds.includes(p.id)) s.shippedIds.push(p.id);
    s.project = null; A.sfx('win');
    toastFloat(`${it.name} shipped!`);
    render();
  }
  const stars = (q) => { const n = Math.max(1, Math.min(5, Math.round((q - 0.4) * 4.2))); return '★'.repeat(n) + '☆'.repeat(5 - n); };
  const sellValue = () => Math.floor(Math.sqrt(s.lifetime / 1e6));

  function persist() { s.seen = Date.now(); A.save('factory', s); A.best('idle', Math.floor(s.lifetime)); }
  function toastFloat(text, ev) {
    const el = document.createElement('div'); el.className = 'mf-float'; el.textContent = text;
    const r = ev?.target?.getBoundingClientRect?.() || root.getBoundingClientRect();
    el.style.left = (ev ? r.left + r.width / 2 - 20 : r.left + 20) + 'px'; el.style.top = (ev ? r.top : r.top + 40) + 'px';
    document.body.appendChild(el); setTimeout(() => el.remove(), 800);
  }

  // ---------- UI ----------
  function render() {
    if (!root) return;
    const r = rates(), net = r.revenue - r.salary, p = s.project;
    const tabs = [['build', 'Build'], ['team', `Team (${headcount()})`], ['mates', `Mates (${s.mates.length})`], ['upgrades', 'Upgrades']];
    let body = '';
    if (tab === 'build') {
      body += `<div class="mf-clicks">
        <button data-act="click:code"><span>⌨️</span>Write code<small>+${fmt(mods().click)}</small></button>
        <button data-act="click:design"><span>🎨</span>Sketch<small>+${fmt(mods().click)}</small></button>
        <button data-act="click:test"><span>🧪</span>Test<small>+${fmt(mods().click)}</small></button></div>`;
      if (p) {
        const it = idea(p.id), bar = (k, cls, req) => `<div class="mf-kv"><span>${k[0].toUpperCase() + k.slice(1)}</span><b>${fmt(p[k])} / ${fmt(req)}</b></div><div class="mf-bar ${cls}"><i style="width:${Math.min(100, (p[k] / req) * 100)}%"></i></div>`;
        body += `<div class="mf-card"><h4><span>${it.em}</span>${esc(it.name)}</h4>
          ${bar('code', '', it.code)}${bar('design', 'design', it.design)}${bar('test', 'test', it.test)}
          ${done(p) ? `<button data-act="ship">Ship it! ${p.test > it.test ? '(extra testing = better rating)' : ''}</button>` : `<div class="muted small">Your team adds ${fmt(r.code)} code, ${fmt(r.design)} design, ${fmt(r.test)} testing a second.</div>`}
        </div>`;
      } else {
        body += `<div class="mf-card"><h4>What should we build?</h4>${IDEAS.map((it, i) => {
          const open = ideaOpen(i), shipped = s.mates.find((x) => x.id === it.id);
          return open || i <= s.shippedIds.length ? `<button class="mf-idea" data-act="start:${it.id}" ${open ? '' : 'disabled'}><b>${it.em} ${esc(it.name)}${shipped ? ` · v${shipped.version + 1}` : ''}</b><span>${open ? `${fmt(it.code)} code · ${fmt(it.design)} design · ${fmt(it.test)} testing · earns ~${money(it.rev)}/s` : `Ship the ${esc(IDEAS[i - 1].name)} first`}</span></button>` : '';
        }).join('')}</div>`;
      }
    }
    if (tab === 'team') {
      const o = OFFICES[s.office], nx = OFFICES[s.office + 1];
      body += `<div class="mf-card"><h4>🏢 ${o.name}</h4><div class="mf-kv"><span>Desks</span><b>${headcount()} / ${o.cap}</b></div>
        ${nx ? `<button data-act="office" ${s.cash >= nx.cost ? '' : 'disabled'}>Move to ${nx.name} (${nx.cap} desks) · ${money(nx.cost)}</button>` : '<div class="muted small">The biggest office there is.</div>'}</div>`;
      body += ROLES.map((ro) => {
        const n = s.staff[ro.id] || 0, c = hireCost(ro), full = headcount() >= o.cap;
        const out = [ro.code && `${fmt(ro.code)} code`, ro.design && `${fmt(ro.design)} design`, ro.test && `${fmt(ro.test)} test`].filter(Boolean).join(', ');
        return `<div class="mf-card mf-row"><span class="em">${ro.em}</span><span class="grow"><b>${ro.name} × ${n}</b><span>${ro.desc}${out ? ` · ${out}/s` : ''} · ${money(ro.salary)}/s pay</span></span>
          <button data-act="hire:${ro.id}" ${s.cash >= c && !full ? '' : 'disabled'}>${full ? 'No desks' : 'Hire ' + money(c)}</button></div>`;
      }).join('');
    }
    if (tab === 'mates') {
      body += s.mates.length ? s.mates.map((x) => {
        const it = idea(x.id);
        return `<div class="mf-card"><div class="mf-row"><span class="em">${it.em}</span><span class="grow"><b>${esc(it.name)} v${x.version}</b><span><span class="mf-stars">${stars(x.quality)}</span> · ${fmt(x.downloads)} downloads · ${money(mateRev(x, r.m))}/s</span></span>
          <button data-act="update:${x.id}" ${s.project ? 'disabled' : ''}>Update</button></div>
          <div class="mf-kv"><span>Popularity</span><b>${Math.round(x.pop * 100)}%</b></div><div class="mf-bar pop"><i style="width:${x.pop * 100}%"></i></div></div>`;
      }).join('') : '<div class="mf-card muted">Ship your first Mate from the Build tab.</div>';
      body += `<div class="mf-card"><h4>💼 Sell the company</h4><div class="muted small">Start over with <b>+${sellValue()} reputation</b> (each one: +10% revenue forever). You have ${s.rep}. Unlocks at $1M earned.</div>
        <button data-act="sell" ${sellValue() > 0 ? '' : 'disabled'}>Sell for ${sellValue()} reputation</button></div>`;
    }
    if (tab === 'upgrades') {
      body += UPGRADES.map((u) => {
        const has = s.upgrades.includes(u.id);
        return `<div class="mf-card mf-row"><span class="em">${u.em}</span><span class="grow"><b>${u.name}</b><span>${u.desc}</span></span>
          <button data-act="buy:${u.id}" ${has || s.cash < u.cost ? 'disabled' : ''}>${has ? 'Owned' : money(u.cost)}</button></div>`;
      }).join('');
    }
    root.innerHTML = `<div class="mf-head"><div class="grow"><div class="muted small">${esc(s.name)}${s.rep ? ` · ${s.rep} reputation` : ''}</div><div class="mf-cash">${money(s.cash)}</div>
      <div class="mf-rate ${net < 0 ? 'neg' : 'muted'}">${net >= 0 ? '+' : ''}${money(net)}/s (${money(r.revenue)} sales − ${money(r.salary)} pay)</div>
      ${s.striking ? '<div class="mf-strike">Can\'t pay salaries: the team stopped working</div>' : ''}</div></div>
      <div class="mf-tabs">${tabs.map(([id, t]) => `<button class="${tab === id ? '' : 'ghost'}" data-act="tab:${id}">${t}</button>`).join('')}</div>${body}`;
  }

  function act(a, ev) {
    const [k, v] = a.split(':');
    const m = mods();
    if (k === 'tab') { tab = v; render(); return; }
    if (k === 'click') {
      if (!s.project) { const first = IDEAS.find((_, i) => ideaOpen(i) && !s.shippedIds.includes(IDEAS[i].id)) || IDEAS[0]; s.project = { id: first.id, code: 0, design: 0, test: 0 }; }
      const it = idea(s.project.id);
      s.project[v] = Math.min(v === 'test' ? it.test * 1.5 : it[v], s.project[v] + m.click);
      A.sfx('click'); toastFloat('+' + fmt(m.click), ev);
    }
    if (k === 'start') startProject(v);
    if (k === 'ship' && s.project && done(s.project)) ship();
    if (k === 'hire') { const ro = ROLES.find((x) => x.id === v), c = hireCost(ro); if (s.cash >= c && headcount() < OFFICES[s.office].cap) { s.cash -= c; s.staff[v] = (s.staff[v] || 0) + 1; A.sfx('buy'); } }
    if (k === 'office') { const nx = OFFICES[s.office + 1]; if (nx && s.cash >= nx.cost) { s.cash -= nx.cost; s.office++; A.sfx('win'); } }
    if (k === 'buy') { const u = UPGRADES.find((x) => x.id === v); if (u && !s.upgrades.includes(v) && s.cash >= u.cost) { s.cash -= u.cost; s.upgrades.push(v); A.sfx('buy'); } }
    if (k === 'update' && !s.project) { s.project = { id: v, code: 0, design: 0, test: 0 }; tab = 'build'; }
    if (k === 'sell' && sellValue() > 0) {
      const rep = s.rep + sellValue();
      A.overlay('Sell the company?', `You'll start again in a garage with <b>${rep} reputation</b> (+${rep * 10}% revenue forever).`, [['Sell', () => { s = fresh(rep); s.sold = (s.sold || 0) + 1; A.hideOverlay(); A.sfx('win'); persist(); render(); }], ['Not yet', () => A.hideOverlay(), true]]);
    }
    render();
  }

  GAMES.idle = {
    name: 'Mate Factory', dom: true, noPause: true,
    help: 'Write code, sketch and test to build Mates. Ship them, hire a team, grow from a garage to a tower.',
    desc: 'Run a Mate-making business.',
    bestLabel: (b) => (b ? `${money(b)} earned` : 'Start in a garage'),
    thumb(g, w, h) {
      g.fillStyle = '#1f2a3a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ff8a3d'; g.fillRect(w / 2 - 34, h - 40, 68, 30); g.fillStyle = '#2b3a50'; g.fillRect(w / 2 - 26, h - 32, 52, 22);
      g.fillStyle = '#ffd23d'; g.font = '700 16px Segoe UI'; g.textAlign = 'center'; g.fillText('$', w / 2 - 44, 30); g.fillText('$', w / 2 + 44, 24);
      g.fillStyle = '#9fb4cc'; g.fillRect(w / 2 - 6, 18, 12, 26);
    },
    start(a) {
      A = a; root = A.dom; tab = 'build';
      s = A.load('factory', null) || fresh();
      const away = Math.min(8 * 3600, (Date.now() - (s.seen || Date.now())) / 1000);
      if (away > 60) {
        const before = s.cash;
        for (let i = 0; i < 60; i++) step(away / 60);
        const got = s.cash - before;
        if (got > 0) A.overlay('Welcome back', `While you were away the team made <b>${money(got)}</b>.`, [['Nice', () => A.hideOverlay()]]);
      }
      s.lastTick = Date.now();
      root.addEventListener('pointerdown', onDown);
      render();
    },
    stop() { persist(); root?.removeEventListener('pointerdown', onDown); root = null; },
    onHide() { persist(); },
    update(dt) {
      const now = Date.now(), el = Math.min(8 * 3600, (now - (s.lastTick || now)) / 1000); s.lastTick = now;
      if (el > 0) step(el);
      if ((saveT += dt) > 3) { saveT = 0; persist(); }
      if ((renderT += dt) > 0.35) { renderT = 0; render(); }
      A.hud(`${s.mates.length} Mates shipped`);
    },
    draw() {},
  };
  // Buttons act on press, so re-rendering the numbers a few times a second never eats a click.
  function onDown(e) { const b = e.target.closest('[data-act]'); if (!b || b.disabled) return; e.preventDefault(); act(b.dataset.act, e); }
})();
