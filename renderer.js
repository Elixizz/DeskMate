const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let settings = {};

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1600);
}
function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

// ---------- shell & tabs ----------
// Plugin tabs come first, then the built-in Vault and Plugins tabs. A plugin's tab is a sandboxed view the
// host lays over #pluginArea; its optional bar sits in a slot at the bottom of the window.
let pluginList = [], activeTab = null, wantedTab = null;
$('#hideBtn').onclick = () => api.hide();
$('#pinBtn').onclick = async () => $('#pinBtn').classList.toggle('on', await api.pin(!$('#pinBtn').classList.contains('on')));
$('#shrinkBtn').onclick = () => api.mini.shrink();
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') api.hide(); });

// Tab row: add-on tabs plus Vault, in the order the user dragged them into. Whatever doesn't fit the width goes
// into a "More" menu; picking a tab from there swaps it into the last visible spot.
const tabNav = $('#tabs');
let menuOpen = false;
function tabOrder() { return Array.isArray(settings?.tabOrder) ? settings.tabOrder : []; }
function renderTabs() {
  tabNav.querySelectorAll('.ptab').forEach((b) => b.remove());
  // Vault and Music have their own buttons in the header; the tab row is for the other Mates
  const music = pluginList.find((x) => x.id === 'music');
  $('header [data-tab="p:music"]').classList.toggle('hidden', !(music?.enabled && music.hasTab));
  for (const p of pluginList.filter((x) => x.enabled && x.hasTab && x.id !== 'music')) {
    const b = document.createElement('button');
    b.className = 'tab ptab'; b.dataset.tab = 'p:' + p.id; b.dataset.name = p.name;
    // Mates with an icon get a compact icon tab (name on hover), so more of them fit across
    if (p.icon && /^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/.test(p.icon)) {
      b.classList.add('icontab'); b.title = p.name; b.dataset.icon = p.icon;
      b.innerHTML = `<span class="ticon" style="--icon:url('${p.icon}')"></span>` + (p.badge ? `<span class="badge">${p.badge}</span>` : '');
    } else b.innerHTML = esc(p.name) + (p.badge ? ` <span class="badge">${p.badge}</span>` : '');
    tabNav.insertBefore(b, $('#moreBtn')); // after Vault, so Vault stays first unless the user drags it
  }
  // saved order first, then anything new in its natural place
  const order = tabOrder();
  const tabs = $$('nav#tabs .tab').sort((a, b) => {
    const ia = order.indexOf(a.dataset.tab), ib = order.indexOf(b.dataset.tab);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  tabs.forEach((b) => tabNav.insertBefore(b, $('#moreBtn')));
  $$('.tab').forEach((b) => { b.onclick = () => selectTab(b.dataset.tab); b.classList.toggle('active', b.dataset.tab === activeTab); });
  tabs.forEach((b) => (b.draggable = true));
  tabNav.classList.toggle('empty', !tabs.length);
  fitTabs();
}
function fitTabs() {
  const tabs = $$('nav#tabs .tab'), more = $('#moreBtn');
  tabNav.classList.add('measuring');
  tabs.forEach((b) => b.classList.remove('overflow'));
  more.classList.add('hidden');
  if (tabNav.scrollWidth > tabNav.clientWidth + 1) {
    more.classList.remove('hidden');
    const room = tabNav.clientWidth - more.offsetWidth - 8;
    let used = 0, hidden = [];
    for (const b of tabs) { used += b.offsetWidth + 4; if (used > room) hidden.push(b); }
    // keep the open tab visible: it takes the place of the last tab that fits
    const active = tabs.find((b) => b.dataset.tab === activeTab);
    if (active && hidden.includes(active)) {
      const lastShown = tabs.filter((b) => !hidden.includes(b)).pop();
      hidden = hidden.filter((b) => b !== active);
      if (lastShown) hidden.unshift(lastShown);
    }
    hidden.forEach((b) => b.classList.add('overflow'));
    const badges = hidden.reduce((n, b) => n + (Number(b.querySelector('.badge')?.textContent) || 0), 0);
    more.innerHTML = `&#x22EF;${badges ? ` <span class="badge">${badges}</span>` : ''}`;
    more.title = hidden.map(tabName).join(', ');
  }
  tabNav.classList.remove('measuring');
  if (menuOpen) renderMoreMenu();
}
new ResizeObserver(() => fitTabs()).observe(tabNav);

const tabName = (b) => b.dataset.name || b.childNodes[0].textContent.trim();
function renderMoreMenu() {
  const hidden = $$('nav#tabs .tab.overflow');
  if (!hidden.length) return closeMoreMenu();
  $('#moreMenu').innerHTML = hidden.map((b) => {
    const badge = b.querySelector('.badge')?.textContent;
    const ic = b.dataset.icon ? `<span class="ticon" style="--icon:url('${b.dataset.icon}')"></span>` : '';
    return `<button class="moreitem" data-pick="${esc(b.dataset.tab)}">${ic}<span class="grow ellipsis">${esc(tabName(b))}</span>${badge ? `<span class="badge">${esc(badge)}</span>` : ''}</button>`;
  }).join('') + '<div class="muted small morehint">Drag tabs to change their order</div>';
}
function closeMoreMenu() { menuOpen = false; $('#moreMenu').classList.add('hidden'); reportLayout(); }
$('#moreBtn').onclick = (e) => {
  e.stopPropagation();
  if (menuOpen) return closeMoreMenu();
  menuOpen = true; renderMoreMenu();
  $('#moreMenu').style.top = tabNav.getBoundingClientRect().bottom + 2 + 'px';
  $('#moreMenu').classList.remove('hidden');
  reportLayout(); // add-on pages are native views drawn on top; hide them while the menu is open
};
$('#moreMenu').onclick = (e) => { const b = e.target.closest('[data-pick]'); if (b) { closeMoreMenu(); selectTab(b.dataset.pick); } };
document.addEventListener('click', (e) => { if (menuOpen && !e.target.closest('#moreMenu')) closeMoreMenu(); });

// Drag a tab onto another to move it there. The order is saved in settings.
let dragTab = null;
tabNav.addEventListener('dragstart', (e) => { const b = e.target.closest('.tab'); if (!b) return; dragTab = b.dataset.tab; b.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
tabNav.addEventListener('dragend', () => { $$('.tab.dragging, .tab.dropbefore').forEach((b) => b.classList.remove('dragging', 'dropbefore')); dragTab = null; });
tabNav.addEventListener('dragover', (e) => {
  if (!dragTab) return;
  e.preventDefault();
  const over = e.target.closest('nav#tabs .tab');
  $$('.tab.dropbefore').forEach((b) => b.classList.remove('dropbefore'));
  if (over && over.dataset.tab !== dragTab) over.classList.add('dropbefore');
});
tabNav.addEventListener('drop', async (e) => {
  e.preventDefault();
  const over = e.target.closest('nav#tabs .tab');
  const ids = $$('nav#tabs .tab').map((b) => b.dataset.tab).filter((t) => t !== dragTab);
  const at = over ? ids.indexOf(over.dataset.tab) : ids.length;
  ids.splice(at < 0 ? ids.length : at, 0, dragTab);
  settings = await api.setSettings({ tabOrder: ids });
  renderTabs();
});

function selectTab(tab) {
  if (!$$('.tab:not(.hidden)').some((b) => b.dataset.tab === tab)) tab = 'vault';
  activeTab = tab;
  try { localStorage.setItem('tab', tab); } catch {}
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  fitTabs();
  const pane = tab.startsWith('p:') ? 'tab-plugin' : 'tab-' + tab;
  $$('.pane').forEach((p) => p.classList.toggle('active', p.id === pane));
  if (tab === 'vault') refreshVault().then(tickCodes);
  if (tab === 'plugins') renderPlugins();
  if (tab === 'settings') renderSettings();
  reportLayout();
}
function renderBars() {
  const want = pluginList.filter((p) => p.enabled && p.bar);
  const have = $$('#bars .barslot').map((el) => el.dataset.id + ':' + el.style.height).join();
  if (have === want.map((p) => p.id + ':' + p.bar.height + 'px').join()) return;
  $('#bars').innerHTML = want.map((p) => `<div class="barslot" data-id="${esc(p.id)}" style="height:${p.bar.height}px"></div>`).join('');
}
function reportLayout() {
  requestAnimationFrame(() => {
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; };
    const active = activeTab && activeTab.startsWith('p:') ? activeTab.slice(2) : null;
    // Mate pages are native views drawn on top of this page: hide them under menus and wallet screens.
    const cover = menuOpen || !$('#walletModal').classList.contains('hidden');
    api.plugins.layout({ active: cover ? null : active, content: active && !cover ? rect($('#pluginArea')) : null, bars: cover ? [] : $$('#bars .barslot').map((el) => ({ id: el.dataset.id, ...rect(el) })) });
  });
}
new ResizeObserver(reportLayout).observe(document.body);

async function refreshPlugins() {
  pluginList = await api.plugins.list();
  renderTabs(); renderBars(); renderAppUpdate();
  if (wantedTab) {
    const tabs = $$('.tab:not(.hidden)').map((b) => b.dataset.tab).filter((t) => t !== 'plugins' && t !== 'settings');
    const pick = wantedTab === 'first' ? tabs[0] : wantedTab;
    if (tabs.includes(pick) && (pick !== 'vault' || wantedTab !== 'first' || pluginList.length)) { wantedTab = null; return selectTab(pick); }
  }
  if (!$$('.tab:not(.hidden)').some((b) => b.dataset.tab === activeTab)) return selectTab('vault');
  if (activeTab === 'plugins') renderPlugins();
  reportLayout();
}
api.on('host:plugins-changed', refreshPlugins);
api.on('host:toast', (t) => toast(t));

// Status dots published by plugins (also shown in the corner pill).
function renderStatus(list) {
  $('#hdrDots').innerHTML = list.length
    ? list.map((s) => `<span class="grp">${s.dots.map((d) => `<i class="${d.pulse ? 'pulse' : ''}"${d.color ? ` style="background:${d.color};box-shadow:0 0 7px ${d.color}"` : ''}></i>`).join('')}</span>`).join('')
    : '<i></i>';
  $('#shrinkBtn').title = (list.map((s) => s.tooltip).filter(Boolean).join('  ·  ') || 'Nothing to report') + '. Click to shrink to just the dots';
}
api.on('host:status', renderStatus);

// ---------- Plugins manager ----------
let pseg = 'installed';
$$('[data-pseg]').forEach((b) => (b.onclick = () => {
  pseg = b.dataset.pseg;
  $$('[data-pseg]').forEach((x) => x.classList.toggle('active', x === b));
  renderPlugins();
}));
const errText = (e) => String(e.message).replace(/^.*Error: /, '');
const permChips = (perms) => perms.map((p) => `<span class="perm ${p.risk}${p.new ? ' new' : ''}" title="${esc(p.id)}">${p.new ? 'NEW: ' : ''}${esc(p.label)}</span>`).join('');
function renderPlugins() {
  $('#pInstalled').classList.toggle('hidden', pseg !== 'installed');
  $('#pStore').classList.toggle('hidden', pseg !== 'store');
  $('#appUpdate').classList.toggle('hidden', pseg !== 'installed' || !appUpdate?.available);
  pseg === 'installed' ? renderInstalled() : renderStore();
}
function renderInstalled() {
  const list = $('#pInstalled');
  list.innerHTML = pluginList.length ? '' : '<div class="empty">No Mates yet. Grab some from the Supply Closet.</div>';
  for (const p of pluginList) {
    const el = document.createElement('div');
    el.className = 'card plug' + (p.enabled ? '' : ' off');
    el.innerHTML = `
      <div class="row"><span class="name grow ellipsis">${esc(p.name)} <span class="muted small">v${esc(p.version)}</span></span>
        ${p.builtin ? '<span class="tag">Built-in</span>' : ''}${p.dev ? '<span class="tag dev">Dev</span>' : ''}
        ${p.updateTo ? `<button data-a="update" title="This version asks for new permissions, so it needs your OK">Update to v${esc(p.updateTo)}</button>` : ''}</div>
      <div class="muted small">${esc(p.description)}${p.author ? ` · by ${esc(p.author)}` : ''}</div>
      <details class="small"><summary>${p.permissions.length ? `${p.permissions.length} permission${p.permissions.length > 1 ? 's' : ''}` : 'No special permissions'}</summary>
        <div class="perms">${permChips(p.permissions)}</div>${p.hotkeys.length ? `<div class="muted small">Shortcuts: ${p.hotkeys.map(esc).join(', ')}</div>` : ''}</details>
      <div class="row">
        <button class="ghost" data-a="toggle">${p.enabled ? 'Turn off' : 'Turn on'}</button>
        ${p.dev ? '<button class="ghost" data-a="reload">Reload</button><button class="ghost" data-a="devtools">DevTools</button>' : ''}
        ${p.builtin ? '' : '<button class="ghost" data-a="remove" style="margin-left:auto">Remove</button>'}
      </div>`;
    el.onclick = async (e) => {
      const btn = e.target.closest('[data-a]'); if (!btn) return;
      try {
        if (btn.dataset.a === 'toggle') { pluginList = await api.plugins.enable(p.id, !p.enabled); toast(p.enabled ? `${p.name} turned off` : `${p.name} turned on`); }
        if (btn.dataset.a === 'remove') {
          if (btn.textContent !== 'Sure?') { btn.textContent = 'Sure?'; return; }
          pluginList = await api.plugins.remove(p.id); toast(`${p.name} removed`);
        }
        if (btn.dataset.a === 'reload') {
          const r = await api.plugins.reload(p.id);
          if (r.needsConsent) return showConsent(r.needsConsent);
          pluginList = r.plugins; toast(`${p.name} reloaded`);
        }
        if (btn.dataset.a === 'devtools') return api.plugins.devtools(p.id);
        if (btn.dataset.a === 'update') return stageAndConsent(api.plugins.stageStore(p.id));
        refreshPlugins();
      } catch (err) { toast(errText(err)); }
    };
    list.appendChild(el);
  }
}
// DeskMate updates (checked by the host every 6 hours) show as a card above the installed list.
let appUpdate = null;
function renderAppUpdate() {
  const box = $('#appUpdate'), u = appUpdate;
  box.classList.toggle('hidden', !u?.available);
  document.querySelector('.tab[data-tab="plugins"]')?.classList.toggle('has-update', !!u?.available || pluginList.some((p) => p.updateTo));
  if (!u?.available) return;
  box.innerHTML = `<div class="row"><span class="grow"><b>DeskMate ${esc(u.latest)}</b> is available <span class="muted small">(you have ${esc(u.current)})</span></span>
      ${u.canInstall ? '<button id="appUpdateBtn">Update now</button>' : '<span class="muted small">Dev copy: pull the code</span>'}</div>
    ${u.notes ? `<div class="muted small">${esc(u.notes)}</div>` : ''}`;
  const b = $('#appUpdateBtn');
  if (b) b.onclick = async () => {
    b.disabled = true; b.textContent = 'Downloading...';
    try { await api.update.install(); b.textContent = 'Restarting...'; }
    catch (e) { toast(errText(e)); b.disabled = false; b.textContent = 'Update now'; }
  };
}
api.on('host:app-update', (u) => { appUpdate = u; renderAppUpdate(); });
api.update.status().then((u) => { appUpdate = u; renderAppUpdate(); });

async function renderStore() {
  $('#storeUrl').value = settings.storeUrl || '';
  const list = $('#storeList');
  list.innerHTML = '<div class="empty">Opening the Supply Closet...</div>';
  const r = await api.plugins.storeGet();
  if (!r.plugins.length) { list.innerHTML = `<div class="empty">${esc(r.error || 'The Supply Closet is empty')}</div>`; return; }
  list.innerHTML = '';
  for (const sp of r.plugins) {
    const have = pluginList.find((x) => x.id === sp.id);
    const label = !have ? 'Install' : have.builtin ? 'Built-in' : have.version === sp.version ? 'Installed' : 'Update';
    const el = document.createElement('div');
    el.className = 'card plug';
    el.innerHTML = `<div class="row"><span class="name grow ellipsis">${esc(sp.name || sp.id)} <span class="muted small">v${esc(sp.version)}</span></span>
        <button ${['Install', 'Update'].includes(label) ? '' : 'disabled class="ghost"'}>${label}</button></div>
      <div class="muted small">${esc(sp.description || '')}${sp.author ? ` · by ${esc(sp.author)}` : ''}</div>`;
    el.querySelector('button').onclick = (e) => { e.target.textContent = 'Downloading...'; stageAndConsent(api.plugins.stageStore(sp.id)).finally(() => (e.target.textContent = label)); };
    list.appendChild(el);
  }
}
$('#storeUrlSave').onclick = async () => { settings.storeUrl = await api.plugins.storeUrl($('#storeUrl').value); renderStore(); };
$('#installFolderBtn').onclick = () => stageAndConsent(api.plugins.stageFolder());
async function stageAndConsent(promise) {
  try { const info = await promise; if (info) showConsent(info); }
  catch (e) { toast(errText(e)); }
}
function showConsent(info) {
  const c = $('#consent');
  const risky = info.permissions.some((p) => p.risk === 'high');
  c.classList.remove('hidden');
  c.innerHTML = `<div class="gate-title" style="margin:0">${info.update ? 'Update' : 'Install'} ${esc(info.name)}?</div>
    <div class="muted small">v${esc(info.version)}${info.update ? ` (you have v${esc(info.fromVersion)})` : ''}${info.author ? ` · by ${esc(info.author)}` : ''} · ${info.source === 'store' ? 'from the Supply Closet, checksum verified' : 'from a folder on this PC'}</div>
    ${info.description ? `<div class="small">${esc(info.description)}</div>` : ''}
    <div class="small"><b>It's asking to:</b></div>
    <div class="perms">${info.permissions.length ? permChips(info.permissions) : '<span class="muted small">Nothing special. It just gets its own tab.</span>'}</div>
    ${info.hotkeys.length ? `<div class="muted small">Keyboard shortcuts: ${info.hotkeys.map(esc).join(', ')}</div>` : ''}
    <div class="muted small">It can never see your vault, your files, or other Mates.</div>
    ${risky ? '<div class="err">The red items are powerful. Only allow them if you trust whoever made this Mate.</div>' : ''}
    <div class="row"><button id="cDeny" class="ghost grow">Cancel</button><button id="cAllow" class="grow">Allow and ${info.update ? 'update' : 'install'}</button></div>`;
  $('#cDeny').onclick = async () => { await api.plugins.commit(false); c.classList.add('hidden'); };
  $('#cAllow').onclick = async () => {
    try { pluginList = await api.plugins.commit(true); c.classList.add('hidden'); toast(`${info.name} ${info.update ? 'updated' : 'installed'}`); wantedTab = 'p:' + info.id; refreshPlugins(); }
    catch (e) { toast(errText(e)); }
  };
}

// ---------- Vault ----------
let vaultItems = [], vaultState = 'locked', editingId = null;

let codeStep = false; // password accepted, waiting for the authenticator code
async function refreshVault() {
  vaultState = await api.vault.status();
  const gate = vaultState !== 'unlocked';
  $('#vaultGate').classList.toggle('hidden', !gate || !$('#restoreBox').classList.contains('hidden'));
  $('#vaultMain').classList.toggle('hidden', gate);
  if (!gate) $('#restoreBox').classList.add('hidden');
  if (gate) {
    $('#itemForm').classList.add('hidden'); $('#secPanel').classList.add('hidden');
    const creating = vaultState === 'none';
    $('#masterPw').classList.toggle('hidden', codeStep);
    $('#masterPw2').classList.toggle('hidden', !creating || codeStep);
    $('#gateCode').classList.toggle('hidden', !codeStep);
    $('#gateTitle').textContent = codeStep ? 'Enter your 2FA code' : creating ? 'Create your vault' : 'Unlock vault';
    $('#gateBtn').textContent = codeStep ? 'Verify' : creating ? 'Create' : 'Unlock';
    $('#gateNote').textContent = codeStep
      ? 'Open your authenticator app and type the 6-digit Deskmate code. Lost your phone? Type a backup code instead.'
      : creating
        ? 'Encrypted with AES-256 on this PC only. There is no recovery if you forget the master password.'
        : 'Auto-locks after 5 minutes idle or when Windows locks.';
    setTimeout(() => (codeStep ? $('#gateCode') : $('#masterPw')).focus(), 50);
  }
}
async function gateSubmit() {
  const pw = $('#masterPw').value; $('#gateErr').textContent = '';
  try {
    if (codeStep) {
      $('#gateBtn').textContent = 'Checking...';
      const r = await api.vault.verify($('#gateCode').value);
      codeStep = false; $('#gateCode').value = '';
      vaultItems = r.items;
      if (r.usedRecovery) toast(`Backup code used. ${r.recoveryLeft} left`);
    } else if (vaultState === 'none') {
      if (pw.length < 8) throw new Error('Use at least 8 characters');
      if (pw !== $('#masterPw2').value) throw new Error("Passwords don't match");
      vaultItems = await api.vault.create(pw);
    } else {
      $('#gateBtn').textContent = 'Unlocking...';
      const r = await api.vault.unlock(pw);
      $('#masterPw').value = '';
      if (r.needCode) { codeStep = true; return refreshVault(); }
      vaultItems = r.items;
    }
    $('#masterPw').value = $('#masterPw2').value = '';
    await refreshVault(); renderVault(); tickCodes();
  } catch (e) {
    const msg = String(e.message).replace(/^.*Error: /, '');
    if (/master password again/.test(msg)) { codeStep = false; $('#gateCode').value = ''; await refreshVault(); }
    $('#gateErr').textContent = msg;
    $('#gateBtn').textContent = codeStep ? 'Verify' : vaultState === 'none' ? 'Create' : 'Unlock';
  }
}
$('#gateBtn').onclick = gateSubmit;
$('#masterPw').onkeydown = $('#masterPw2').onkeydown = $('#gateCode').onkeydown = (e) => { if (e.key === 'Enter') gateSubmit(); };

// Security panel: Windows-account lock and the authenticator requirement.
async function openSecurity() {
  const p = $('#secPanel');
  const [sec, bind] = await Promise.all([api.vault.security(), api.vault.bindInfo()]);
  p.classList.remove('hidden'); $('#itemForm').classList.add('hidden');
  const when = bind.backupAt ? new Date(bind.backupAt).toLocaleString() : 'not yet';
  p.innerHTML = `
    <div class="secsec">
      <div class="sectitle">Locked to this Windows account <span class="pill ${bind.bound ? 'on' : ''}">${bind.bound ? 'On' : 'Off'}</span></div>
      ${bind.bound
        ? `<div class="muted small">The vault file only opens with your master password on this Windows account. Backup: <span class="mono">${esc(bind.backupPath || '')}</span>, last saved ${esc(when)}.${bind.backupError ? ` <span class="err">Last backup failed: ${esc(bind.backupError)}</span>` : ''}</div>
           <div class="row"><button id="bkNow" class="ghost grow">Save backup now</button><button id="bkMove" class="ghost grow">Move backup</button><button id="bkKey" class="ghost grow">Recovery key</button></div>`
        : `<div class="muted small">Makes a copied vault file useless on any other PC or Windows account, even with your master password.${bind.available ? '' : ' <span class="err">Windows encryption isn\'t available on this account.</span>'}</div>
           <button id="bindStart" ${bind.available ? '' : 'disabled'}>Lock to this Windows account</button>`}
    </div>
    <div class="secsec">
      <div class="sectitle">Authenticator code to unlock <span class="pill ${sec.enabled ? 'on' : ''}">${sec.enabled ? 'On' : 'Off'}</span></div>
      ${sec.enabled
        ? `<div class="muted small">Backup codes left: <b>${sec.recoveryLeft}</b>. Enter a code to turn it off.</div>
           <div class="row"><input id="secCode" class="code-input grow" placeholder="123 456" autocomplete="off" maxlength="12"><button id="secOff" class="ghost">Turn off</button></div>`
        : `<div class="muted small">After your master password, the vault also asks for a 6-digit code from your phone.</div>
           <button id="secStart">Set it up</button>`}
    </div>
    <div class="err" id="secErr"></div>
    <button id="secClose" class="ghost">Close</button>`;
  $('#secClose').onclick = () => p.classList.add('hidden');
  const fail = (e) => ($('#secErr').textContent = errText(e));
  if (sec.enabled) $('#secOff').onclick = async () => { try { await api.vault.securityDisable($('#secCode').value); toast('Authenticator code turned off'); openSecurity(); } catch (e) { fail(e); } };
  else $('#secStart').onclick = setupSecurity;
  if (bind.bound) {
    $('#bkNow').onclick = async () => { try { await api.vault.backupNow(); toast('Backup saved'); openSecurity(); } catch (e) { fail(e); } };
    $('#bkMove').onclick = async () => { const f = await api.vault.pickBackup(); if (!f) return; try { await api.vault.backupNow(f); toast('Backup moved'); openSecurity(); } catch (e) { fail(e); } };
    $('#bkKey').onclick = async () => showRecoveryKey(await api.vault.recoveryKey(), false);
  } else if (bind.available) $('#bindStart').onclick = bindFlow;
}
async function bindFlow() {
  const p = $('#secPanel');
  p.innerHTML = `<div class="gate-title" style="margin:0">Lock to this Windows account</div>
    <div class="small">If you ever reinstall Windows or switch PCs, the vault can only come back from a backup. Deskmate keeps one up to date automatically. OneDrive is a good spot.</div>
    <div class="row"><button id="bkPick" class="ghost">Choose backup location</button></div>
    <div id="bkPath" class="mono small"></div>
    <div class="err" id="secErr"></div>
    <div class="row"><button id="secClose" class="ghost grow">Cancel</button><button id="bindGo" class="grow" disabled>Lock it</button></div>`;
  let target = null;
  $('#secClose').onclick = openSecurity;
  $('#bkPick').onclick = async () => { target = await api.vault.pickBackup(); $('#bkPath').textContent = target || ''; $('#bindGo').disabled = !target; };
  $('#bindGo').onclick = async () => {
    try { showRecoveryKey(await api.vault.bind(target), true); }
    catch (e) { $('#secErr').textContent = errText(e); }
  };
}
function showRecoveryKey(key, fresh) {
  const p = $('#secPanel');
  p.innerHTML = `<div class="gate-title" style="margin:0">${fresh ? 'Locked to this Windows account' : 'Your recovery key'}</div>
    <div class="small"><b>Write this recovery key down or save it on your phone</b> (not on this PC). Restoring the backup needs it plus your master password.</div>
    <div class="backup" style="display:block;text-align:center;font-size:15px">${esc(key)}</div>
    <button id="copyRk" class="ghost">Copy key</button>
    <button id="secClose">${fresh ? 'I saved it' : 'Done'}</button>`;
  $('#copyRk').onclick = async () => { await api.vault.copySecret(key); toast('Recovery key copied. Paste it somewhere safe, then clear your clipboard'); };
  $('#secClose').onclick = openSecurity;
}

// Restore from backup (gate screen)
let restorePath = null;
function showRestore(on) {
  $('#vaultGate').classList.toggle('hidden', on);
  $('#restoreBox').classList.toggle('hidden', !on);
  $('#restoreErr').textContent = '';
}
$('#restoreLink').onclick = (e) => { e.preventDefault(); showRestore(true); };
$('#restoreCancel').onclick = () => { showRestore(false); refreshVault(); };
$('#restorePick').onclick = async () => { restorePath = await api.vault.pickRestore(); $('#restoreFile').textContent = restorePath || 'No file chosen'; };
$('#restoreGo').onclick = async () => {
  if (!restorePath) return ($('#restoreErr').textContent = 'Choose the backup file first');
  const replacing = vaultState !== 'none' && $('#restoreGo').textContent !== 'Replace vault?';
  if (replacing) { $('#restoreGo').textContent = 'Replace vault?'; $('#restoreErr').textContent = 'This replaces the vault on this PC (the old file is kept aside). Click again to confirm.'; return; }
  try {
    $('#restoreGo').textContent = 'Restoring...';
    await api.vault.restore(restorePath, $('#restorePw').value, $('#restoreKey').value);
    $('#restorePw').value = $('#restoreKey').value = '';
    showRestore(false); codeStep = false; await refreshVault();
    $('#gateErr').textContent = ''; toast('Restored. Unlock it with your master password');
  } catch (e) { $('#restoreErr').textContent = errText(e); }
  $('#restoreGo').textContent = 'Restore';
};
async function setupSecurity() {
  const p = $('#secPanel'), r = await api.vault.securityBegin();
  p.innerHTML = `<div class="gate-title" style="margin:0">1. Scan with your authenticator app</div>
    <img src="${r.qr}" class="qr" alt="QR code">
    <div class="muted small" style="text-align:center">Can't scan? Enter this key: <span class="mono">${esc(r.secret)}</span></div>
    <div class="gate-title" style="margin:6px 0 0">2. Type the code it shows</div>
    <input id="secCode" class="code-input" placeholder="123 456" autocomplete="off" maxlength="7">
    <div class="err" id="secErr"></div>
    <div class="row"><button id="secClose" class="ghost grow">Cancel</button><button id="secConfirm" class="grow">Turn on</button></div>`;
  $('#secClose').onclick = openSecurity;
  const confirm = async () => {
    try {
      const codes = await api.vault.securityConfirm($('#secCode').value);
      p.innerHTML = `<div class="gate-title" style="margin:0">2-step unlock is on</div>
        <div class="small"><b>Save these backup codes somewhere safe</b> (not on this PC). Each one works once if you lose your phone. Without them, a lost phone means a locked vault.</div>
        <div class="backup">${codes.map((c) => `<span>${c}</span>`).join('')}</div>
        <button id="copyBackup" class="ghost">Copy codes</button>
        <button id="secClose">I saved them</button>`;
      $('#copyBackup').onclick = async () => { await api.vault.copySecret(codes.join('\n')); toast('Backup codes copied'); };
      $('#secClose').onclick = openSecurity;
    } catch (e) { $('#secErr').textContent = String(e.message).replace(/^.*Error: /, ''); }
  };
  $('#secConfirm').onclick = confirm;
  $('#secCode').onkeydown = (e) => { if (e.key === 'Enter') confirm(); };
  $('#secCode').focus();
}
$('#secBtn').onclick = openSecurity;
$('#lockBtn').onclick = () => api.vault.lock();
api.on('vault:locked', () => { vaultItems = []; codeStep = false; $('#vaultList').innerHTML = ''; $('#secPanel').innerHTML = ''; refreshVault(); });

function renderVault() {
  const q = $('#vaultSearch').value.toLowerCase();
  const items = vaultItems.filter((i) => !q || [i.name, i.username, i.url].join(' ').toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  const list = $('#vaultList');
  list.innerHTML = items.length ? '' : `<div class="empty">${vaultItems.length ? 'No matches' : 'No passwords or 2FA codes yet. Hit + Add.'}</div>`;
  for (const i of items) {
    const el = document.createElement('div');
    el.className = 'card vitem';
    el.innerHTML = `<div class="meta"><div class="name ellipsis">${esc(i.name)}</div><div class="muted small ellipsis">${esc(i.username || i.url || '')}</div></div>
      ${i.hasTotp ? `<button class="totp" data-a="totp" data-id="${i.id}" title="Click to copy the 2FA code"><span class="code">··· ···</span>${RING}</button>` : ''}
      ${i.username ? '<button class="ghost" data-a="user">User</button>' : ''}
      ${i.hasPassword ? '<button data-a="pass">Copy</button>' : ''}<button class="ghost" data-a="edit">Edit</button>`;
    el.onclick = async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'totp') { await api.vault.copy(i.id, 'totp'); toast('2FA code copied'); }
      if (a === 'user') { await api.vault.copy(i.id, 'username'); toast('Username copied'); }
      if (a === 'pass') { await api.vault.copy(i.id, 'password'); toast('Password copied, clears in 20s'); }
      if (a === 'edit') openForm(i);
    };
    list.appendChild(el);
  }
}
$('#vaultSearch').oninput = renderVault;

// Live 2FA codes, refreshed every second while the Vault tab is open.
const RING = '<svg class="ring" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/><circle class="left" cx="10" cy="10" r="8"/></svg>';
async function tickCodes() {
  const btns = $$('#vaultList .totp');
  if (!btns.length || !$('#tab-vault').classList.contains('active') || document.visibilityState !== 'visible') return;
  const codes = await api.vault.codes();
  for (const b of btns) {
    const c = codes[b.dataset.id];
    if (!c) continue;
    const half = Math.ceil(c.code.length / 2);
    b.querySelector('.code').textContent = c.code.slice(0, half) + ' ' + c.code.slice(half);
    const frac = c.remaining / c.period;
    b.querySelector('.left').style.strokeDashoffset = String(50.27 * (1 - frac));
    b.classList.toggle('low', c.remaining <= 5);
  }
}
setInterval(tickCodes, 1000);

function openForm(item) {
  editingId = item ? item.id : null;
  $('#fName').value = item?.name || ''; $('#fUser').value = item?.username || '';
  $('#fPass').value = ''; $('#fPass').type = 'password';
  $('#fPass').placeholder = item ? 'Password (blank = keep current)' : 'Password';
  $('#fUrl').value = item?.url || ''; $('#fNotes').value = item?.notes || '';
  $('#fTotp').value = ''; $('#fTotp').type = 'password'; removeTotp = false;
  $('#fTotp').placeholder = item?.hasTotp ? '2FA is set up (blank = keep it)' : '2FA setup key (optional)';
  setTotpNote(item?.hasTotp ? 'remove' : '');
  $('#cancelItemBtn').textContent = 'Cancel';
  let del = $('#delItemBtn');
  if (item && !del) {
    del = document.createElement('button'); del.type = 'button'; del.id = 'delItemBtn'; del.className = 'ghost'; del.textContent = 'Delete';
    $('#cancelItemBtn').after(del);
  }
  if (del) {
    del.classList.toggle('hidden', !item);
    del.onclick = async () => {
      if (del.textContent !== 'Sure?') { del.textContent = 'Sure?'; return; }
      vaultItems = await api.vault.del(editingId); closeForm(); renderVault(); toast('Deleted');
    };
    del.textContent = 'Delete';
  }
  $('#itemForm').classList.remove('hidden');
  $('#fName').focus();
}
let removeTotp = false;
function setTotpNote(kind, text) {
  const n = $('#totpNote');
  n.classList.toggle('hidden', !kind);
  if (kind === 'remove') {
    n.innerHTML = removeTotp ? '2FA will be removed when you save. <a href="#" id="undoTotp">Undo</a>' : '<a href="#" id="rmTotp">Remove 2FA from this entry</a>';
    const l = n.querySelector('a');
    l.onclick = (e) => { e.preventDefault(); removeTotp = !removeTotp; setTotpNote('remove'); };
  } else if (kind) n.textContent = text;
}
$('#qrBtn').onclick = async () => {
  const r = await api.vault.qr();
  if (r.error) return toast(r.error);
  $('#fTotp').value = r.uri; removeTotp = false;
  const [issuerFromLabel, account] = r.label.includes(':') ? r.label.split(':') : ['', r.label];
  if (!$('#fName').value.trim()) $('#fName').value = r.issuer || issuerFromLabel || '2FA';
  if (!$('#fUser').value.trim() && account) $('#fUser').value = account.trim();
  setTotpNote('info', `2FA code read for ${r.issuer || r.label || 'this account'}. Hit Save.`);
};
function closeForm() { $('#itemForm').classList.add('hidden'); $('#fPass').value = ''; $('#fTotp').value = ''; }
$('#addItemBtn').onclick = () => openForm(null);
$('#cancelItemBtn').onclick = closeForm;
$('#genBtn').onclick = async () => { $('#fPass').value = await api.vault.generate(); $('#fPass').type = 'text'; };
$('#showPassBtn').onclick = async () => {
  const f = $('#fPass');
  if (f.type === 'password') { if (!f.value && editingId) f.value = await api.vault.reveal(editingId); f.type = 'text'; }
  else f.type = 'password';
};
$('#itemForm').onsubmit = async (e) => {
  e.preventDefault();
  const item = { name: $('#fName').value.trim(), username: $('#fUser').value.trim(), password: $('#fPass').value, url: $('#fUrl').value.trim(), notes: $('#fNotes').value,
    totp: removeTotp ? null : $('#fTotp').value.trim() };
  if (editingId) item.id = editingId;
  try { vaultItems = await api.vault.save(item); closeForm(); renderVault(); tickCodes(); toast('Saved'); }
  catch (err) { toast(String(err.message).replace(/^.*Error: /, '')); refreshVault(); }
};


// ---------- boot ----------
(async () => {
  settings = await api.getSettings();
  $('#hotkeyHint').textContent = await api.hotkey();
  $('header .brand').title = `Open or hide DeskMate: ${$('#hotkeyHint').textContent}`;
  renderStatus(await api.plugins.status());
  try { wantedTab = localStorage.getItem('tab') || 'first'; } catch { wantedTab = 'first'; }
  await refreshPlugins();
  refreshVault();
})();
