const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// This Mate only shows balances and asks DeskMate to send. Setup, the recovery phrase and the password all live in
// DeskMate's own window.
let data = null, showUnknown = false, view = 'main', timer = null;
const CHAIN = { btc: 'Bitcoin', eth: 'Ethereum', sol: 'Solana' };
const money = (v) => (v == null ? '' : '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const amt = (s) => { const n = Number(s); return n === 0 ? '0' : n < 0.0001 ? n.toPrecision(2) : n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 6 : 4 }); };

function show(v) {
  view = v;
  for (const id of ['empty', 'main', 'send', 'recv']) $('#' + id).classList.toggle('hidden', id !== v);
}

async function load(force) {
  const st = await deskmate.wallet.status();
  if (!st.exists) { data = null; show('empty'); return; }
  if (view === 'empty') show('main');
  if (force || !data) $('#total').textContent = data ? $('#total').textContent : '…';
  try { data = await deskmate.wallet.balances(); render(); }
  catch (e) { $('#errs').textContent = e.message; }
}

function render() {
  if (!data) return;
  const test = data.network === 'testnet';
  $('#net').innerHTML = test ? '<span class="tag">TEST NETWORK</span>' : '';
  $('#total').textContent = test ? 'Test coins' : money(data.total);
  const known = data.assets.filter((a) => !a.unknown), unknown = data.assets.filter((a) => a.unknown);
  const list = showUnknown ? [...known, ...unknown] : known;
  $('#assets').innerHTML = list.map((a) => {
    const ch = a.change24h;
    return `<div class="card asset" data-id="${esc(a.id)}">
      <span class="coin ${a.token ? 'tok' : a.chain}">${esc(a.symbol.replace('…', '').slice(0, 4))}${a.token ? `<span class="chain coin ${a.chain}"></span>` : ''}</span>
      <span class="nm"><b>${esc(a.symbol)}</b><span class="muted small ellipsis">${esc(a.token ? `${a.name} on ${CHAIN[a.chain]}` : a.name)}</span></span>
      <span class="val"><b>${amt(a.amount)}</b><span class="small">${a.usd != null ? money(a.usd) : ''}${ch != null && Number(a.amount) > 0 ? ` <span class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '+' : ''}${ch.toFixed(1)}%</span>` : ''}</span></span>
    </div>`;
  }).join('') + (unknown.length ? `<button class="ghost small more" id="toggleUnknown">${showUnknown ? 'Hide' : 'Show'} ${unknown.length} unknown token${unknown.length > 1 ? 's' : ''}</button>` : '');
  $('#errs').textContent = data.errors.length ? "Couldn't reach: " + data.errors.join('; ') : '';
  const tu = $('#toggleUnknown'); if (tu) tu.onclick = () => { showUnknown = !showUnknown; render(); };
}

// ---------- send ----------
function openSend(assetId) {
  const opts = data.assets.filter((a) => !a.unknown || showUnknown);
  $('#sAsset').innerHTML = opts.map((a) => `<option value="${esc(a.id)}">${esc(a.symbol)} ${a.token ? `(${CHAIN[a.chain]})` : ''} · ${amt(a.amount)}</option>`).join('');
  if (assetId) $('#sAsset').value = assetId;
  $('#sTo').value = ''; $('#sAmt').value = ''; $('#sErr').textContent = '';
  updateHave(); show('send'); $('#sTo').focus();
}
function updateHave() {
  const a = data.assets.find((x) => x.id === $('#sAsset').value);
  $('#sHave').textContent = a ? `You have ${amt(a.amount)} ${a.symbol} on ${CHAIN[a.chain]}${a.token ? `. The fee is paid in ${{ eth: 'ETH', sol: 'SOL' }[a.chain]}` : ''}.` : '';
}
let sendMax = false;
$('#sAsset').onchange = () => { sendMax = false; updateHave(); };
$('#sAmt').oninput = () => { sendMax = false; };
$('#sMax').onclick = () => {
  const a = data.assets.find((x) => x.id === $('#sAsset').value); if (!a) return;
  sendMax = true; $('#sAmt').value = a.amount;
};
$('#sReview').onclick = async () => {
  $('#sErr').textContent = '';
  const btn = $('#sReview'); btn.disabled = true; btn.textContent = 'Checking...';
  try {
    await deskmate.wallet.send({ asset: $('#sAsset').value, to: $('#sTo').value.trim(), amount: $('#sAmt').value.trim(), max: sendMax });
    deskmate.toast('Sent');
    show('main'); load(true);
  } catch (e) {
    if (e.message !== 'Canceled') $('#sErr').textContent = e.message;
  } finally { btn.disabled = false; btn.textContent = 'Review'; }
};

// ---------- receive ----------
async function openRecv(chain) {
  show('recv');
  $$('#rChain .segbtn').forEach((b) => b.classList.toggle('active', b.dataset.c === chain));
  const addr = data.addresses[chain];
  $('#rAddr').textContent = addr;
  $('#rQr').src = await deskmate.wallet.qr(addr);
  $('#rNote').textContent = {
    btc: 'Only send Bitcoin (BTC) to this address.',
    eth: 'Send ETH or Ethereum tokens (USDC, USDT, DAI...) on the Ethereum network. Tokens sent on other networks (Base, BNB...) won\'t show here.',
    sol: 'Send SOL or Solana tokens (USDC and others) on the Solana network.',
  }[chain] + (data.network === 'testnet' ? ' This is a TEST network address.' : '');
}
$('#rChain').onclick = (e) => { const c = e.target.closest('[data-c]')?.dataset.c; if (c) openRecv(c); };
$('#rCopy').onclick = async () => { await deskmate.copyText($('#rAddr').textContent); deskmate.toast('Address copied'); };

// ---------- wiring ----------
$('#setupBtn').onclick = () => deskmate.wallet.setup().then(() => load(true), () => {});
$('#manage').onclick = () => deskmate.wallet.manage().then(() => load(true), () => {});
$('#refresh').onclick = () => load(true);
$('#sendBtn').onclick = () => data && openSend();
$('#recvBtn').onclick = () => data && openRecv('btc');
$$('.back').forEach((b) => (b.onclick = () => show('main')));
$('#assets').onclick = (e) => { const id = e.target.closest('.asset')?.dataset.id; if (id) openSend(id); };
deskmate.wallet.onChange(() => load(true));
// Refresh while the tab is on screen; balances come from public blockchain servers, so don't hammer them.
document.addEventListener('visibilitychange', () => { clearInterval(timer); if (!document.hidden) { load(); timer = setInterval(load, 60e3); } });
show('main');
load(true);
if (!document.hidden) timer = setInterval(load, 60e3);
