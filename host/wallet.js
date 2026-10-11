// DeskMate wallet: one recovery phrase -> Bitcoin, Ethereum and Solana accounts.
//
// Security model:
//  - The recovery phrase is encrypted at rest: AES-256-GCM with a key from HKDF(scrypt(password) + device key), where
//    the device key is sealed with Windows DPAPI (safeStorage). Copying wallet.json to another PC or account is useless.
//  - Nothing secret stays in memory. Each send, and each "show phrase", asks for the password, decrypts, uses the key
//    and drops it. Balances only need the public addresses, which are stored in the clear.
//  - Mates never see any of this. They can ask for a send; DeskMate's own window shows the details and takes the
//    password. See the wallet:* host channels in main.js.
//
// Derivation paths match the common wallets, so an imported phrase shows the same addresses:
//   BTC  m/84'/0'/0'/0/0  (native SegWit, bc1...)          testnet: m/84'/1'/0'/0/0 (tb1...)
//   ETH  m/44'/60'/0'/0/0 (MetaMask)
//   SOL  m/44'/501'/0'/0' (Phantom, SLIP-0010 ed25519)
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bip39 = require('@scure/bip39');
const { wordlist } = require('@scure/bip39/wordlists/english');
const { HDKey } = require('@scure/bip32');
const btc = require('@scure/btc-signer');
const { hmac } = require('@noble/hashes/hmac');
const { sha512 } = require('@noble/hashes/sha2');
const ethers = require('ethers');
const sol = require('@solana/web3.js');
const spl = require('@solana/spl-token');

// ---------- networks ----------
const NETS = {
  mainnet: {
    btc: { api: 'https://mempool.space/api', net: btc.NETWORK, path: "m/84'/0'/0'/0/0", explorer: 'https://mempool.space/tx/' },
    eth: { rpc: 'https://ethereum-rpc.publicnode.com', chainId: 1, explorer: 'https://etherscan.io/tx/',
      tokens: [
        { symbol: 'USDC', name: 'USD Coin', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, cg: 'usd-coin' },
        { symbol: 'USDT', name: 'Tether', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, cg: 'tether' },
        { symbol: 'DAI', name: 'Dai', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, cg: 'dai' },
        { symbol: 'WBTC', name: 'Wrapped Bitcoin', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8, cg: 'wrapped-bitcoin' },
      ] },
    sol: { rpc: 'https://api.mainnet-beta.solana.com', explorer: 'https://solscan.io/tx/',
      tokens: {
        EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: 'USDC', name: 'USD Coin', cg: 'usd-coin' },
        Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: 'USDT', name: 'Tether', cg: 'tether' },
      } },
  },
  testnet: {
    btc: { api: 'https://mempool.space/testnet4/api', net: btc.TEST_NETWORK, path: "m/84'/1'/0'/0/0", explorer: 'https://mempool.space/testnet4/tx/' },
    eth: { rpc: 'https://ethereum-sepolia-rpc.publicnode.com', chainId: 11155111, explorer: 'https://sepolia.etherscan.io/tx/',
      tokens: [{ symbol: 'USDC', name: 'USD Coin (Sepolia)', address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6, cg: 'usd-coin' }] },
    sol: { rpc: 'https://api.devnet.solana.com', explorer: 'https://solscan.io/tx/', explorerSuffix: '?cluster=devnet',
      tokens: { '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU': { symbol: 'USDC', name: 'USD Coin (devnet)', cg: 'usd-coin' } } },
  },
};
const ERC20 = ['function balanceOf(address) view returns (uint256)', 'function transfer(address to, uint256 amount) returns (bool)'];

// ---------- storage ----------
const file = () => path.join(app.getPath('userData'), 'wallet.json');
const read = () => { try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return null; } };
const write = (w) => { fs.writeFileSync(file() + '.tmp', JSON.stringify(w, null, 2)); fs.renameSync(file() + '.tmp', file()); };
const SCRYPT = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

function keyFor(password, w) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows encryption is not available on this account');
  const device = Buffer.from(safeStorage.decryptString(Buffer.from(w.device, 'base64')), 'base64');
  const pw = crypto.scryptSync(String(password).normalize('NFKC'), Buffer.from(w.salt, 'base64'), 32, SCRYPT);
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.concat([pw, device]), Buffer.from(w.salt, 'base64'), 'deskmate-wallet-v1', 32));
}
function decryptPhrase(password) {
  const w = read();
  if (!w) throw new Error('No wallet on this PC');
  const key = keyFor(password, w);
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(w.iv, 'base64'));
    d.setAuthTag(Buffer.from(w.tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(w.ct, 'base64')), d.final()]).toString('utf8');
  } catch { throw new Error('Wrong wallet password'); }
  finally { key.fill(0); }
}

// ---------- keys ----------
function slip10Ed25519(seed, pathStr) {
  let I = hmac(sha512, new TextEncoder().encode('ed25519 seed'), seed);
  let k = I.slice(0, 32), c = I.slice(32);
  for (const seg of pathStr.split('/').slice(1)) {
    if (!seg.endsWith("'")) throw new Error('ed25519 needs hardened paths');
    const i = (parseInt(seg, 10) + 0x80000000) >>> 0;
    const data = new Uint8Array(37); data.set(k, 1); new DataView(data.buffer).setUint32(33, i);
    I = hmac(sha512, c, data); k = I.slice(0, 32); c = I.slice(32);
  }
  return k;
}
function accounts(phrase, network) {
  const n = NETS[network];
  const seed = bip39.mnemonicToSeedSync(phrase);
  const bkey = HDKey.fromMasterSeed(seed).derive(n.btc.path);
  const eth = ethers.HDNodeWallet.fromPhrase(phrase, undefined, "m/44'/60'/0'/0/0");
  const solKp = sol.Keypair.fromSeed(slip10Ed25519(seed, "m/44'/501'/0'/0'"));
  return {
    btc: { address: btc.p2wpkh(bkey.publicKey, n.btc.net).address, priv: bkey.privateKey, pub: bkey.publicKey },
    eth: { address: eth.address, wallet: eth },
    sol: { address: solKp.publicKey.toBase58(), keypair: solKp },
  };
}
const publicAddresses = (phrase) => Object.fromEntries(['mainnet', 'testnet'].map((net) => {
  const a = accounts(phrase, net);
  return [net, { btc: a.btc.address, eth: a.eth.address, sol: a.sol.address }];
}));

// ---------- setup ----------
function status() {
  const w = read();
  if (!w) return { exists: false };
  return { exists: true, network: w.network, addresses: w.addresses[w.network], created: w.created };
}
const newPhrase = () => bip39.generateMnemonic(wordlist, 128); // 12 words
const normalizePhrase = (p) => String(p).toLowerCase().trim().split(/\s+/).join(' ');
const validPhrase = (p) => [12, 15, 18, 21, 24].includes(normalizePhrase(p).split(' ').length) && bip39.validateMnemonic(normalizePhrase(p), wordlist);

function encrypt(phrase, password) {
  if (String(password).length < 8) throw new Error('Use a wallet password of at least 8 characters');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows encryption is not available on this account');
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), device = crypto.randomBytes(32);
  const w = { v: 1, salt: salt.toString('base64'), iv: iv.toString('base64'), device: safeStorage.encryptString(device.toString('base64')).toString('base64') };
  const key = keyFor(password, w);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  w.ct = Buffer.concat([c.update(phrase, 'utf8'), c.final()]).toString('base64');
  w.tag = c.getAuthTag().toString('base64');
  key.fill(0);
  return w;
}
function save(phrase, password) {
  phrase = normalizePhrase(phrase);
  if (!validPhrase(phrase)) throw new Error("That recovery phrase isn't valid. Check the words and their order");
  if (read()) throw new Error('There is already a wallet on this PC');
  const w = encrypt(phrase, password);
  w.addresses = publicAddresses(phrase);
  w.network = 'mainnet';
  w.created = Date.now();
  write(w);
  return status();
}
function reveal(password) { return decryptPhrase(password); }
function remove(password) { decryptPhrase(password); fs.rmSync(file(), { force: true }); return status(); }
// Re-encrypts in one atomic file replace (write() goes through a temp file), so a crash can't lose the wallet.
function changePassword(oldPw, newPw) {
  const phrase = decryptPhrase(oldPw);
  const old = read();
  write({ ...encrypt(phrase, newPw), addresses: old.addresses, network: old.network, created: old.created });
  return status();
}
function setNetwork(network) {
  if (!NETS[network]) throw new Error('Unknown network');
  const w = read(); if (!w) throw new Error('No wallet on this PC');
  w.network = network; write(w); return status();
}

// ---------- prices & balances ----------
let priceCache = { at: 0, data: {} };
async function prices(ids) {
  if (Date.now() - priceCache.at < 60e3 && ids.every((i) => priceCache.data[i])) return priceCache.data;
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`);
    if (r.ok) priceCache = { at: Date.now(), data: { ...priceCache.data, ...(await r.json()) } };
  } catch {}
  return priceCache.data;
}
const ethProvider = (n) => new ethers.JsonRpcProvider(n.eth.rpc, n.eth.chainId, { staticNetwork: true });
const solConn = (n) => new sol.Connection(n.sol.rpc, 'confirmed');
async function getJson(url, opts) { const r = await fetch(url, opts); if (!r.ok) throw new Error(`${new URL(url).host} returned ${r.status}`); return r.json(); }

async function balances() {
  const w = read(); if (!w) throw new Error('No wallet on this PC');
  const net = w.network, n = NETS[net], a = w.addresses[net];
  const assets = [], errors = [];
  const tryChain = async (name, fn) => { try { await fn(); } catch (e) { errors.push(`${name}: ${e.message}`); } };
  await Promise.all([
    tryChain('Bitcoin', async () => {
      const j = await getJson(`${n.btc.api}/address/${a.btc}`);
      const sats = BigInt(j.chain_stats.funded_txo_sum - j.chain_stats.spent_txo_sum + j.mempool_stats.funded_txo_sum - j.mempool_stats.spent_txo_sum);
      assets.push({ id: 'btc', chain: 'btc', symbol: 'BTC', name: 'Bitcoin', decimals: 8, raw: sats.toString(), cg: 'bitcoin' });
    }),
    tryChain('Ethereum', async () => {
      const p = ethProvider(n);
      const wei = await p.getBalance(a.eth);
      assets.push({ id: 'eth', chain: 'eth', symbol: 'ETH', name: 'Ethereum', decimals: 18, raw: wei.toString(), cg: 'ethereum' });
      await Promise.all(n.eth.tokens.map(async (t) => {
        const bal = await new ethers.Contract(t.address, ERC20, p).balanceOf(a.eth);
        if (bal > 0n || t.symbol === 'USDC') assets.push({ id: `eth:${t.address}`, chain: 'eth', symbol: t.symbol, name: t.name, decimals: t.decimals, raw: bal.toString(), cg: t.cg, token: t.address });
      }));
    }),
    tryChain('Solana', async () => {
      const c = solConn(n), owner = new sol.PublicKey(a.sol);
      const lamports = await c.getBalance(owner);
      assets.push({ id: 'sol', chain: 'sol', symbol: 'SOL', name: 'Solana', decimals: 9, raw: String(lamports), cg: 'solana' });
      let usdcSeen = false;
      for (const programId of [spl.TOKEN_PROGRAM_ID, spl.TOKEN_2022_PROGRAM_ID]) {
        const res = await c.getParsedTokenAccountsByOwner(owner, { programId });
        for (const { account } of res.value) {
          const info = account.data.parsed.info, amt = info.tokenAmount;
          const known = n.sol.tokens[info.mint];
          if (amt.amount === '0' && !known) continue;
          if (known?.symbol === 'USDC') usdcSeen = true;
          // Unknown tokens are often spam airdrops; the Mate keeps them out of sight unless asked.
          assets.push({ id: `sol:${info.mint}`, chain: 'sol', symbol: known?.symbol || info.mint.slice(0, 4) + '…', name: known?.name || 'Unknown Solana token', decimals: amt.decimals, raw: amt.amount, cg: known?.cg, token: info.mint, program: programId.toBase58(), unknown: !known });
        }
      }
      if (!usdcSeen) {
        const [mint, t] = Object.entries(n.sol.tokens).find(([, v]) => v.symbol === 'USDC');
        assets.push({ id: `sol:${mint}`, chain: 'sol', symbol: 'USDC', name: t.name, decimals: 6, raw: '0', cg: 'usd-coin', token: mint, program: spl.TOKEN_PROGRAM_ID.toBase58() });
      }
    }),
  ]);
  const px = await prices([...new Set(assets.map((x) => x.cg).filter(Boolean))]);
  const order = { btc: 0, eth: 1, sol: 2 };
  for (const x of assets) {
    x.amount = ethers.formatUnits(x.raw, x.decimals);
    const p = px[x.cg];
    x.price = net === 'mainnet' && p ? p.usd : null;
    x.change24h = net === 'mainnet' && p ? p.usd_24h_change : null;
    x.usd = x.price != null ? Number(x.amount) * x.price : null;
  }
  assets.sort((x, y) => order[x.chain] - order[y.chain] || (x.token ? 1 : 0) - (y.token ? 1 : 0) || x.symbol.localeCompare(y.symbol));
  return { network: net, addresses: a, assets, errors, total: assets.reduce((s, x) => s + (x.usd || 0), 0) };
}

// ---------- sending ----------
// quote() checks everything and works out the fee without the password; send() signs and broadcasts.
function parseAmount(amount, decimals) {
  const s = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error('Enter an amount like 0.25');
  const v = ethers.parseUnits(s, decimals);
  if (v <= 0n) throw new Error('Amount must be more than 0');
  return v;
}
function checkAddress(chain, to, n) {
  to = String(to).trim();
  if (chain === 'btc') { try { btc.Address(n.btc.net).decode(to); } catch { throw new Error(`That isn't a valid ${n === NETS.testnet ? 'testnet ' : ''}Bitcoin address`); } }
  if (chain === 'eth') { if (!ethers.isAddress(to)) throw new Error("That isn't a valid Ethereum address"); to = ethers.getAddress(to); }
  if (chain === 'sol') { try { new sol.PublicKey(to); } catch { throw new Error("That isn't a valid Solana address"); } }
  return to;
}

async function quote({ asset, to, amount, max }) {
  const w = read(); if (!w) throw new Error('No wallet on this PC');
  const net = w.network, n = NETS[net], a = w.addresses[net];
  const b = await balances();
  const x = b.assets.find((y) => y.id === asset);
  if (!x) throw new Error('Unknown asset');
  to = checkAddress(x.chain, to, n);
  if (to.toLowerCase?.() === a[x.chain].toLowerCase()) throw new Error("That's your own address");
  const have = BigInt(x.raw);
  const q = { max: !!max, asset: x.id, chain: x.chain, symbol: x.symbol, name: x.name, decimals: x.decimals, to, network: net, from: a[x.chain], token: x.token, program: x.program, price: x.price };
  const native = b.assets.find((y) => y.id === x.chain);
  let value = max ? have : parseAmount(amount, x.decimals);
  if (value > have) throw new Error(`You only have ${ethers.formatUnits(have, x.decimals)} ${x.symbol}`);
  if (have === 0n) throw new Error(`You don't have any ${x.symbol} to send`);

  if (x.chain === 'btc') {
    const utxos = await getJson(`${n.btc.api}/address/${a.btc}/utxo`);
    const fees = await getJson(`${n.btc.api}/v1/fees/recommended`).catch(() => ({ halfHourFee: 5 }));
    q.feeRate = Math.max(1, Number(fees.halfHourFee) || 5);
    const script = btc.OutScript.encode(btc.Address(n.btc.net).decode(a.btc));
    q.utxos = utxos.map((u) => ({ txid: u.txid, index: u.vout, witnessUtxo: { script: Buffer.from(script).toString('hex'), amount: String(u.value) } }));
    const sel = selectBtc(q, value, max, n);
    value = sel.value; q.fee = sel.fee.toString(); q.feeSymbol = 'BTC'; q.feeDecimals = 8;
  }
  if (x.chain === 'eth') {
    const p = ethProvider(n), fd = await p.getFeeData();
    const maxFee = fd.maxFeePerGas ?? fd.gasPrice, tip = fd.maxPriorityFeePerGas ?? 0n;
    const tx = x.token ? { to: x.token, data: new ethers.Interface(ERC20).encodeFunctionData('transfer', [to, value]) } : { to, value: max ? 1n : value };
    let gas;
    try { gas = (await p.estimateGas({ ...tx, from: a.eth })) * 12n / 10n; } // 20% headroom; unused gas isn't charged
    catch (e) { throw new Error(`Couldn't work out the Ethereum fee (${e.shortMessage || e.message}). Check you have enough ETH for gas`); }
    const fee = gas * maxFee;
    if (!x.token && max) value = have - fee;
    q.gas = gas.toString(); q.maxFeePerGas = maxFee.toString(); q.maxPriorityFeePerGas = tip.toString();
    q.fee = fee.toString(); q.feeSymbol = 'ETH'; q.feeDecimals = 18; q.feeIsMax = true;
    if (BigInt(native.raw) < (x.token ? fee : fee + value)) throw new Error(`Not enough ETH to cover the network fee (up to ${ethers.formatEther(fee)} ETH)`);
  }
  if (x.chain === 'eth' && x.token && to.toLowerCase() === x.token.toLowerCase()) throw new Error(`That's the ${x.symbol} contract itself. Tokens sent there are lost`);
  if (x.chain === 'sol' && x.program && new sol.PublicKey(x.program).equals(spl.TOKEN_2022_PROGRAM_ID)) {
    // Some Token-2022 tokens take a cut on every transfer, so the recipient would get less than shown. Not supported yet.
    const c = solConn(n);
    const mint = await spl.getMint(c, new sol.PublicKey(x.token), 'confirmed', spl.TOKEN_2022_PROGRAM_ID);
    const feeCfg = spl.getTransferFeeConfig(mint);
    if (feeCfg && (feeCfg.newerTransferFee.transferFeeBasisPoints > 0 || feeCfg.olderTransferFee.transferFeeBasisPoints > 0)) throw new Error(`${x.symbol} charges a fee on every transfer. DeskMate can't send it yet`);
  }
  if (x.chain === 'sol') {
    const c = solConn(n), from = new sol.PublicKey(a.sol), dest = new sol.PublicKey(to);
    const ixs = await solInstructions(c, from, dest, x, max ? 1n : value);
    const { blockhash } = await c.getLatestBlockhash();
    const msg = new sol.TransactionMessage({ payerKey: from, recentBlockhash: blockhash, instructions: ixs.list }).compileToV0Message();
    let fee = BigInt((await c.getFeeForMessage(msg)).value ?? 5000);
    if (ixs.createsAccount) { q.rent = String(await spl.getMinimumBalanceForRentExemptAccount(c)); fee += BigInt(q.rent); }
    if (!x.token && max) value = have - fee;
    q.fee = fee.toString(); q.feeSymbol = 'SOL'; q.feeDecimals = 9; q.createsAccount = ixs.createsAccount;
    if (BigInt(native.raw) < (x.token ? fee : fee + value)) throw new Error(`Not enough SOL to cover the network fee${ixs.createsAccount ? " and the recipient's token account" : ''}`);
  }
  if (value <= 0n) throw new Error('Not enough to cover the network fee');
  if (value > have) throw new Error(`You only have ${ethers.formatUnits(have, x.decimals)} ${x.symbol}`);
  q.value = value.toString();
  q.amount = ethers.formatUnits(value, x.decimals);
  q.feeAmount = ethers.formatUnits(q.fee, q.feeDecimals);
  q.usd = x.price != null ? Number(q.amount) * x.price : null;
  return q;
}

function selectBtc(q, value, max, n) {
  const inputs = q.utxos.map((u) => ({ txid: u.txid, index: u.index, witnessUtxo: { script: Buffer.from(u.witnessUtxo.script, 'hex'), amount: BigInt(u.witnessUtxo.amount) } }));
  if (!inputs.length) throw new Error('No bitcoin to send');
  if (max) {
    // Everything, one output, no change. P2WPKH size: ~10.5 vB overhead + 68 per input + 31 per output.
    const total = inputs.reduce((t, i) => t + i.witnessUtxo.amount, 0n);
    const fee = BigInt(Math.ceil(10.5 + 68 * inputs.length + 31)) * BigInt(q.feeRate);
    const out = total - fee;
    if (out < 330n) throw new Error('Not enough bitcoin to cover the network fee');
    const tx = new btc.Transaction({ allowLegacyWitnessUtxo: true });
    for (const i of inputs) tx.addInput(i);
    tx.addOutputAddress(q.to, out, n.btc.net);
    return { value: out, fee, tx };
  }
  const sel = btc.selectUTXO(inputs, [{ address: q.to, amount: value }], 'default', {
    changeAddress: q.from, feePerByte: BigInt(q.feeRate), bip69: true, createTx: true, network: n.btc.net, allowUnknownOutput: false, allowLegacyWitnessUtxo: true,
  });
  if (!sel) throw new Error('Not enough bitcoin to cover the amount and the network fee');
  return { value, fee: sel.fee, tx: sel.tx };
}

async function solInstructions(c, from, dest, x, value) {
  if (!x.token) return { list: [sol.SystemProgram.transfer({ fromPubkey: from, toPubkey: dest, lamports: value })], createsAccount: false };
  const mint = new sol.PublicKey(x.token), program = new sol.PublicKey(x.program || spl.TOKEN_PROGRAM_ID);
  const src = spl.getAssociatedTokenAddressSync(mint, from, false, program);
  let dst, exists;
  // Exchanges often hand out a token account (not a wallet) as the deposit address. Send straight to it if it
  // holds this token. Never create a token account owned by another token account or a program: nobody could
  // ever move what lands there.
  const destInfo = await c.getAccountInfo(dest);
  if (destInfo && (destInfo.owner.equals(spl.TOKEN_PROGRAM_ID) || destInfo.owner.equals(spl.TOKEN_2022_PROGRAM_ID))) {
    const acct = spl.unpackAccount(dest, destInfo, destInfo.owner);
    if (!acct.mint.equals(mint)) throw new Error(`That address is a token account for a different token, not ${x.symbol}`);
    dst = dest; exists = true;
  } else {
    if (!sol.PublicKey.isOnCurve(dest.toBytes())) throw new Error("That address is a program account and can't receive tokens. Use a normal wallet address");
    dst = spl.getAssociatedTokenAddressSync(mint, dest, false, program);
    exists = !!(await c.getAccountInfo(dst));
  }
  const list = [];
  if (!exists) list.push(spl.createAssociatedTokenAccountIdempotentInstruction(from, dst, dest, mint, program));
  list.push(spl.createTransferCheckedInstruction(src, mint, dst, from, value, x.decimals, [], program));
  return { list, createsAccount: !exists };
}

// Errors marked notSent happened before anything reached the network, so the user may safely try again.
const notSent = (e) => Object.assign(e instanceof Error ? e : new Error(String(e)), { notSent: true });
async function send(q, password, { simulate } = {}) {
  let phrase, acc;
  try {
    phrase = decryptPhrase(password);
    if (read().network !== q.network) throw new Error('The network changed. Start the send again');
    acc = accounts(phrase, q.network);
    if (acc[q.chain].address !== q.from) throw new Error('Wallet mismatch');
  } catch (e) { throw notSent(e); }
  const n = NETS[q.network];
  let txid;
  try {
    if (q.chain === 'btc') {
      const sel = selectBtc(q, BigInt(q.value), q.max, n);
      sel.tx.sign(acc.btc.priv);
      sel.tx.finalize();
      const r = await fetch(`${n.btc.api}/tx`, { method: 'POST', body: sel.tx.hex });
      txid = (await r.text()).trim();
      if (!r.ok) throw notSent(new Error(`Bitcoin network refused it: ${txid}`));
    }
    if (q.chain === 'eth') {
      const signer = acc.eth.wallet.connect(ethProvider(n));
      const base = { gasLimit: BigInt(q.gas), maxFeePerGas: BigInt(q.maxFeePerGas), maxPriorityFeePerGas: BigInt(q.maxPriorityFeePerGas), chainId: n.eth.chainId, type: 2 };
      let tx;
      try {
        tx = q.token
          ? await signer.sendTransaction({ ...base, to: q.token, data: new ethers.Interface(ERC20).encodeFunctionData('transfer', [q.to, BigInt(q.value)]) })
          : await signer.sendTransaction({ ...base, to: q.to, value: BigInt(q.value) });
      } catch (e) { throw notSent(new Error(`Ethereum network refused it: ${e.shortMessage || e.message}`)); }
      txid = tx.hash;
    }
    if (q.chain === 'sol') {
      const c = solConn(n), from = acc.sol.keypair.publicKey;
      let tx, blockhash, lastValidBlockHeight;
      try {
        const ixs = await solInstructions(c, from, new sol.PublicKey(q.to), q, BigInt(q.value));
        ({ blockhash, lastValidBlockHeight } = await c.getLatestBlockhash());
        tx = new sol.VersionedTransaction(new sol.TransactionMessage({ payerKey: from, recentBlockhash: blockhash, instructions: ixs.list }).compileToV0Message());
        tx.sign([acc.sol.keypair]);
      } catch (e) { throw notSent(e); }
      if (simulate) { const r = await c.simulateTransaction(tx, { sigVerify: true }); return { simulated: true, err: r.value.err, logs: r.value.logs }; }
      try { txid = await c.sendRawTransaction(tx.serialize(), { maxRetries: 5 }); }
      catch (e) { throw notSent(new Error(`Solana network refused it: ${e.message.split('\n')[0]}`)); }
      const conf = await c.confirmTransaction({ signature: txid, blockhash, lastValidBlockHeight }, 'confirmed').catch(() => null);
      if (conf?.value?.err) throw notSent(new Error(`The transaction failed on Solana (${JSON.stringify(conf.value.err)}). Only the network fee was spent`));
    }
  } finally {
    acc.btc.priv?.fill?.(0);
  }
  const ex = NETS[q.network][q.chain];
  return { txid, explorer: ex.explorer + txid + (ex.explorerSuffix || '') };
}

module.exports = { status, newPhrase, validPhrase, save, reveal, remove, changePassword, setNetwork, balances, quote, send, wordlist,
  _test: { accounts, slip10Ed25519, decryptPhrase } };
