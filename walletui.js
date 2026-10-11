// Wallet screens drawn by DeskMate itself (never by a Mate): create/import, show the recovery phrase, change
// password, network, remove, and the confirmation for every send. The phrase and password only exist here and in
// the host process.
const wm = $('#walletModal');
let wctx = null; // { mode, data, requester }

function wShow(html) {
  wm.innerHTML = `<div class="wbox">${html}</div>`;
  wm.classList.remove('hidden');
  reportLayout();
  wm.querySelector('input')?.focus();
}
let wSending = false;
async function wClose() {
  if (wSending || !(await api.wallet.close())) return; // a send is in flight: it can't be cancelled now
  wm.classList.add('hidden'); wm.innerHTML = ''; wctx = null;
  reportLayout();
}
const wErr = (e) => { const el = wm.querySelector('.werr'); if (el) el.textContent = errText(e); };
const short = (a) => (a && a.length > 20 ? a.slice(0, 10) + '…' + a.slice(-8) : a);
const netTag = (n) => (n === 'testnet' ? '<span class="wtag test">TEST NETWORK</span>' : '');
const head = (title, sub) => `<div class="whead"><span class="wtitle">${title}</span><button class="icon" data-w="close" title="Close">&#x2715;</button></div>${sub ? `<div class="muted small">${sub}</div>` : ''}`;
const by = () => (wctx?.requester ? `Opened by the <b>${esc(wctx.requester)}</b> Mate.` : '');

api.on('host:wallet-ui', (msg) => {
  wctx = msg;
  if (msg.mode === 'setup') return setupStart();
  if (msg.mode === 'manage') return manageScreen();
  if (msg.mode === 'send') return sendScreen(msg.data);
});
wm.addEventListener('click', (e) => { if (e.target.closest('[data-w="close"]')) wClose(); });
wm.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); wClose(); } }, true);

// ---------- setup ----------
function setupStart() {
  wShow(`${head('Set up your wallet', by())}
    <div class="wtext">One recovery phrase gives you Bitcoin, Ethereum and Solana accounts. It's encrypted with a password you choose and locked to this Windows account.</div>
    <button data-w="create">Create a new wallet</button>
    <button class="ghost" data-w="import">I already have a recovery phrase</button>
    <div class="muted small">Works with phrases from Phantom, MetaMask, Exodus, Trust Wallet and other standard wallets.</div>`);
  wm.querySelector('[data-w=create]').onclick = createShow;
  wm.querySelector('[data-w=import]').onclick = importShow;
}
async function createShow() {
  const words = await api.wallet.generate();
  wShow(`${head('Your recovery phrase')}
    <div class="wwarn"><b>Write these 12 words down on paper, in order.</b> Anyone with them can take your crypto. DeskMate can't recover them for you. Don't screenshot them or save them on this PC.</div>
    <div class="wwords">${words.map((w, i) => `<span><i>${i + 1}</i>${esc(w)}</span>`).join('')}</div>
    <label class="wcheck"><input type="checkbox" id="wGot"> I wrote them down somewhere safe</label>
    <button id="wNext" disabled>Next</button>`);
  wm.querySelector('#wGot').onchange = (e) => (wm.querySelector('#wNext').disabled = !e.target.checked);
  wm.querySelector('#wNext').onclick = () => createCheck(words.length);
}
function createCheck(n) {
  const picks = [];
  while (picks.length < 3) { const i = Math.floor(Math.random() * n); if (!picks.includes(i)) picks.push(i); }
  picks.sort((a, b) => a - b);
  wShow(`${head('Check your phrase')}
    <div class="wtext">Type these words from your paper copy.</div>
    ${picks.map((i) => `<label class="wfield">Word #${i + 1}<input data-i="${i}" autocomplete="off" spellcheck="false"></label>`).join('')}
    <div class="werr"></div>
    <div class="row"><button class="ghost grow" id="wBack">Show the words again</button><button class="grow" id="wOk">Check</button></div>`);
  wm.querySelector('#wBack').onclick = createShow;
  wm.querySelector('#wOk').onclick = async () => {
    const answers = Object.fromEntries([...wm.querySelectorAll('[data-i]')].map((el) => [el.dataset.i, el.value]));
    if (await api.wallet.checkWords(answers)) passwordShow('create');
    else wErr(new Error("Those don't match. Check your paper copy, or go back and look at the words again."));
  };
}
function importShow() {
  wShow(`${head('Import a recovery phrase')}
    <div class="wtext">Type your 12 or 24 words, separated by spaces.</div>
    <textarea id="wPhrase" rows="4" autocomplete="off" spellcheck="false" placeholder="word1 word2 word3 ..."></textarea>
    <div class="werr"></div>
    <button id="wOk">Next</button>`);
  wm.querySelector('#wOk').onclick = async () => {
    const p = wm.querySelector('#wPhrase').value;
    if (await api.wallet.validate(p)) passwordShow('import', p);
    else wErr(new Error("That phrase isn't valid. Check the spelling and the order of the words."));
  };
}
function passwordShow(kind, phrase) {
  wShow(`${head('Choose a wallet password')}
    <div class="wtext">You'll type it to approve every send and to see your phrase. If you forget it, you can import your recovery phrase again.</div>
    <label class="wfield">Password<input type="password" id="wPw1" autocomplete="new-password"></label>
    <label class="wfield">Type it again<input type="password" id="wPw2" autocomplete="new-password"></label>
    <div class="werr"></div>
    <button id="wOk">Create wallet</button>`);
  const go = async () => {
    const a = wm.querySelector('#wPw1').value, b = wm.querySelector('#wPw2').value;
    if (a.length < 8) return wErr(new Error('Use at least 8 characters'));
    if (a !== b) return wErr(new Error("The passwords don't match"));
    const btn = wm.querySelector('#wOk'); btn.disabled = true; btn.textContent = 'Encrypting...';
    try {
      const st = kind === 'create' ? await api.wallet.create(a) : await api.wallet.import(phrase, a);
      doneShow(st);
    } catch (e) { wErr(e); btn.disabled = false; btn.textContent = 'Create wallet'; }
  };
  wm.querySelector('#wOk').onclick = go;
  wm.querySelector('#wPw2').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}
function doneShow(st) {
  wShow(`${head('Wallet ready')}
    <div class="wtext">Your addresses:</div>
    <div class="waddr"><b>Bitcoin</b><code>${esc(st.addresses.btc)}</code></div>
    <div class="waddr"><b>Ethereum</b><code>${esc(st.addresses.eth)}</code></div>
    <div class="waddr"><b>Solana</b><code>${esc(st.addresses.sol)}</code></div>
    <button data-w="close">Done</button>`);
}

// ---------- manage ----------
async function manageScreen() {
  const st = await api.wallet.status();
  if (!st.exists) return setupStart();
  wShow(`${head('Wallet settings', by())}
    <div class="wrow"><span class="grow">Network</span>
      <div class="seg"><button class="segbtn${st.network === 'mainnet' ? ' active' : ''}" data-net="mainnet">Main</button><button class="segbtn${st.network === 'testnet' ? ' active' : ''}" data-net="testnet">Test</button></div></div>
    <div class="muted small">Test networks use free test coins (Bitcoin testnet4, Ethereum Sepolia, Solana devnet), for trying things out.</div>
    <button class="ghost" id="wReveal">Show recovery phrase</button>
    <button class="ghost" id="wChange">Change password</button>
    <button class="ghost danger" id="wRemove">Remove wallet from this PC</button>`);
  wm.querySelectorAll('[data-net]').forEach((b) => (b.onclick = async () => { await api.wallet.setNetwork(b.dataset.net); manageScreen(); }));
  wm.querySelector('#wReveal').onclick = revealShow;
  wm.querySelector('#wChange').onclick = changeShow;
  wm.querySelector('#wRemove').onclick = removeShow;
}
function askPassword(title, text, btnText, fn, extra = '') {
  wShow(`${head(title)}<div class="wtext">${text}</div>${extra}
    <label class="wfield">Wallet password<input type="password" id="wPw" autocomplete="current-password"></label>
    <div class="werr"></div>
    <div class="row"><button class="ghost grow" id="wBack">Back</button><button class="grow" id="wOk">${btnText}</button></div>`);
  wm.querySelector('#wBack').onclick = manageScreen;
  const go = async () => { const b = wm.querySelector('#wOk'); b.disabled = true; try { await fn(wm.querySelector('#wPw').value); } catch (e) { wErr(e); b.disabled = false; } };
  wm.querySelector('#wOk').onclick = go;
  wm.querySelector('#wPw').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}
function revealShow() {
  askPassword('Show recovery phrase', 'Make sure nobody can see your screen.', 'Show', async (pw) => {
    const words = await api.wallet.reveal(pw);
    wShow(`${head('Your recovery phrase')}<div class="wwarn">Never type these into a website or share them. Support staff will never ask for them.</div>
      <div class="wwords">${words.map((w, i) => `<span><i>${i + 1}</i>${esc(w)}</span>`).join('')}</div><button id="wHide">Hide</button>`);
    wm.querySelector('#wHide').onclick = manageScreen;
  });
}
function changeShow() {
  askPassword('Change password', 'Type your current password, then the new one.', 'Change', async (pw) => {
    const n1 = wm.querySelector('#wNew1').value, n2 = wm.querySelector('#wNew2').value;
    if (n1.length < 8) throw new Error('Use at least 8 characters for the new password');
    if (n1 !== n2) throw new Error("The new passwords don't match");
    await api.wallet.changePassword(pw, n1); toast('Wallet password changed'); manageScreen();
  }, `<label class="wfield">New password<input type="password" id="wNew1" autocomplete="new-password"></label><label class="wfield">New password again<input type="password" id="wNew2" autocomplete="new-password"></label>`);
}
function removeShow() {
  askPassword('Remove wallet', "This deletes the wallet from this PC. <b>Your crypto stays on the blockchain</b>, but you'll need your recovery phrase to get it back.", 'Remove', async (pw) => {
    if (wm.querySelector('#wType').value.trim() !== 'REMOVE') throw new Error('Type REMOVE to confirm');
    await api.wallet.remove(pw); toast('Wallet removed from this PC'); wClose();
  }, '<label class="wfield">Type REMOVE<input id="wType" autocomplete="off"></label>');
}

// ---------- send ----------
function sendScreen(q) {
  const usd = (v) => (v == null ? '' : ` <span class="muted">($${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })})</span>`);
  const chainName = { btc: 'Bitcoin', eth: 'Ethereum', sol: 'Solana' }[q.chain];
  wShow(`${head('Approve send', by())}
    ${netTag(q.network)}
    <div class="wamount">${esc(q.amount)} ${esc(q.symbol)}${usd(q.usd)}</div>
    <div class="wkv"><span>To</span><code class="wto">${esc(q.to)}</code></div>
    <div class="wkv"><span>Network</span><b>${chainName}${q.token ? ` (${esc(q.symbol)} token)` : ''}</b></div>
    <div class="wkv"><span>Fee</span><b>${q.feeIsMax ? 'up to ' : ''}${esc(Number(q.feeAmount).toLocaleString(undefined, { maximumSignificantDigits: 4, maximumFractionDigits: 12 }))} ${esc(q.feeSymbol)}</b></div>
    ${q.createsAccount ? '<div class="muted small">Includes a one-time deposit to open the recipient\'s token account.</div>' : ''}
    <div class="wwarn small">Check the address character by character. Crypto sends can't be undone.</div>
    <label class="wfield">Wallet password<input type="password" id="wPw" autocomplete="current-password"></label>
    <div class="werr"></div>
    <div class="row"><button class="ghost grow" data-w="close">Cancel</button><button class="grow" id="wOk">Send</button></div>`);
  const go = async () => {
    const b = wm.querySelector('#wOk');
    if (wSending || b.disabled) return;
    wSending = true; b.disabled = true; b.textContent = 'Sending...';
    wm.querySelectorAll('[data-w=close]').forEach((x) => (x.disabled = true));
    try {
      const r = await api.wallet.confirmSend(wm.querySelector('#wPw').value);
      wSending = false;
      wShow(`${head('Sent')}<div class="wamount">${esc(q.amount)} ${esc(q.symbol)}</div>
        <div class="wtext">On its way to ${esc(short(q.to))}. It can take a few seconds (Solana) to a few minutes (Bitcoin) to confirm.</div>
        <button class="ghost" id="wEx">View on explorer</button><button data-w="close">Done</button>`);
      wm.querySelector('#wEx').onclick = () => api.wallet.openExplorer(r.explorer);
    } catch (e) {
      wSending = false; wErr(e); b.disabled = false; b.textContent = 'Send';
      wm.querySelectorAll('[data-w=close]').forEach((x) => (x.disabled = false));
    }
  };
  wm.querySelector('#wOk').onclick = go;
  wm.querySelector('#wPw').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}
