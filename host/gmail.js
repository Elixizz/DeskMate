// Gmail access for plugins with the "gmail" permission. Read-only (gmail.readonly scope).
//
// Sign-in happens on Google's own page in the user's browser (OAuth with PKCE and a loopback redirect), so no
// plugin ever sees a password or token. The refresh token is sealed with Windows DPAPI (safeStorage) on disk;
// plugins only ever receive message summaries and any verification codes found in recent mail.
const { app, shell, safeStorage, net } = require('electron');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me/';
const CODE_WINDOW_MS = 30 * 60e3; // codes older than this aren't worth showing
const storePath = () => path.join(app.getPath('userData'), 'gmail.json');

let access = null;           // { token, exp }
let connecting = null;       // pending sign-in promise
const detailCache = new Map(); // message id -> summary (subjects etc. don't change)
const codeCache = new Map();   // message id -> code or null

// The OAuth client for this build. Google treats a desktop app's client secret as not confidential,
// but it stays out of the public repo anyway (host/google-oauth.json is gitignored).
function client() {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(__dirname, 'google-oauth.json'), 'utf8'));
    const o = c.installed || c;
    if (o.client_id && o.client_secret) return { id: o.client_id, secret: o.client_secret };
  } catch {}
  throw new Error("Google sign-in isn't set up in this copy of DeskMate yet");
}
function loadStore() { try { return JSON.parse(fs.readFileSync(storePath(), 'utf8')); } catch { return null; } }
function saveStore(s) { fs.writeFileSync(storePath(), JSON.stringify(s)); }
function refreshToken() {
  const s = loadStore();
  if (!s || !s.refresh) return null;
  try { return safeStorage.decryptString(Buffer.from(s.refresh, 'base64')); } catch { return null; }
}
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function tokenRequest(params) {
  const res = await net.fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error_description || data.error || `Google said ${res.status}`); e.code = data.error; throw e; }
  return data;
}

function status() {
  const s = loadStore();
  let configured = true; try { client(); } catch { configured = false; }
  return { configured, connected: !!(s && s.refresh), email: s ? s.email || null : null };
}

function connect() {
  if (connecting) return connecting;
  connecting = (async () => {
    const { id, secret } = client();
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));
    // Google sends the browser back to this one-shot local server with the sign-in code.
    let server;
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { server.close(); reject(new Error('Sign-in timed out. Try again.')); }, 5 * 60e3);
      server = http.createServer((req, res) => {
        const u = new URL(req.url, 'http://127.0.0.1');
        if (u.pathname !== '/') { res.writeHead(404); return res.end(); }
        const ok = u.searchParams.get('state') === state && u.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><meta charset="utf-8"><title>DeskMate</title><body style="font:16px system-ui;background:#15171c;color:#e6e8ee;display:grid;place-items:center;height:90vh"><div style="text-align:center"><h2>${ok ? 'Signed in to DeskMate' : 'Sign-in was cancelled'}</h2><p>You can close this tab and go back to DeskMate.</p></div>`);
        clearTimeout(timer); server.close();
        if (ok) resolve(u.searchParams.get('code'));
        else reject(new Error(u.searchParams.get('error') === 'access_denied' ? 'Sign-in was cancelled' : 'Sign-in failed'));
      }).listen(0, '127.0.0.1', () => {
        const redirect = `http://127.0.0.1:${server.address().port}`;
        server.redirect = redirect;
        const q = new URLSearchParams({
          client_id: id, redirect_uri: redirect, response_type: 'code', scope: SCOPES, state,
          code_challenge: challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent',
        });
        shell.openExternal('https://accounts.google.com/o/oauth2/v2/auth?' + q);
      });
    });
    const tok = await tokenRequest({ code, client_id: id, client_secret: secret, redirect_uri: server.redirect, grant_type: 'authorization_code', code_verifier: verifier });
    if (!tok.refresh_token) throw new Error("Google didn't allow offline access. Try signing in again.");
    access = { token: tok.access_token, exp: Date.now() + (tok.expires_in - 60) * 1000 };
    const profile = await api('profile');
    saveStore({ email: profile.emailAddress, refresh: safeStorage.encryptString(tok.refresh_token).toString('base64') });
    detailCache.clear(); codeCache.clear();
    return status();
  })().finally(() => { connecting = null; });
  return connecting;
}

async function disconnect() {
  const rt = refreshToken();
  try { fs.rmSync(storePath(), { force: true }); } catch {}
  access = null; detailCache.clear(); codeCache.clear();
  if (rt) net.fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(rt), { method: 'POST' }).catch(() => {});
  return status();
}

async function accessToken() {
  if (access && Date.now() < access.exp) return access.token;
  const rt = refreshToken();
  if (!rt) throw new Error('signed-out');
  const { id, secret } = client();
  try {
    const tok = await tokenRequest({ refresh_token: rt, client_id: id, client_secret: secret, grant_type: 'refresh_token' });
    access = { token: tok.access_token, exp: Date.now() + (tok.expires_in - 60) * 1000 };
    return access.token;
  } catch (e) {
    if (e.code === 'invalid_grant') { fs.rmSync(storePath(), { force: true }); throw new Error('signed-out'); }
    throw e;
  }
}
async function api(pathAndQuery, retried) {
  const res = await net.fetch(API + pathAndQuery, { headers: { Authorization: 'Bearer ' + (await accessToken()) } });
  if (res.status === 401 && !retried) { access = null; return api(pathAndQuery, true); }
  if (!res.ok) throw new Error(`Gmail said ${res.status}`);
  return res.json();
}

// ---------- reading ----------
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decodeEntities = (s) => String(s || '').replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m]);
const header = (msg, name) => ((msg.payload && msg.payload.headers) || []).find((h) => h.name.toLowerCase() === name)?.value || '';
function senderName(from) {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  return m ? (m[1].trim() || m[2]) : from;
}
function bodyText(part) {
  // Prefer text/plain; fall back to text/html with tags stripped.
  let plain = '', html = '';
  (function walk(p) {
    if (!p) return;
    const data = p.body && p.body.data ? Buffer.from(p.body.data, 'base64url').toString('utf8') : '';
    if (p.mimeType === 'text/plain' && data) plain += data + '\n';
    else if (p.mimeType === 'text/html' && data) html += data + '\n';
    (p.parts || []).forEach(walk);
  })(part);
  if (plain) return plain;
  return decodeEntities(html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|tr|td|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' '));
}

const CODE_HINT = /\b(code|verif\w*|otp|one[- ]?time|passcode|pin|2fa|two[- ]?factor|sign[- ]?in|log[- ]?in|security|confirm\w*)\b/i;
// Finds a verification code in an email's subject and text, or returns null.
function extractCode(subject, text) {
  const hay = `${subject}\n${text}`.slice(0, 20000);
  if (!CODE_HINT.test(hay)) return null;
  // Shop promo codes ("use code SAVE20 at checkout") aren't sign-in codes.
  if (/(promo|coupon|discount|checkout|% off)|\d+% off/i.test(hay) && !/(verif\w*|security|sign[- ]?in|log[- ]?in|one[- ]?time|otp|2fa|passcode)/i.test(hay)) return null;
  const clean = (c) => c.replace(/[\s-]/g, '');
  const plausible = (c) => /^\d{4,8}$/.test(c) ? !/^(19|20)\d{2}$/.test(c) : /^(?=.*\d)(?=.*[A-Z])[A-Z0-9]{5,8}$/.test(c);
  const TOKEN = String.raw`(\d{3}[ -]?\d{3}|\d{4,8}|[A-Za-z0-9]{5,8})`;
  // 1) "G-582014 is your Google verification code", "482913 is your code"
  const before = hay.match(/\b(?:[A-Z]-)?(\d{4,8})\s+is\s+your\b/i);
  if (before && plausible(before[1])) return before[1];
  // 2) a code shortly after a hint word: "Your code is: 482913", "passcode\nUse 123-456"
  const hint = /\b(?:code|otp|pin|passcode|verification|one[- ]?time)\b/gi;
  for (const m of hay.matchAll(hint)) {
    const windowText = hay.slice(m.index + m[0].length, m.index + m[0].length + 60);
    for (const t of windowText.matchAll(new RegExp(String.raw`\b` + TOKEN + String.raw`\b`, 'g'))) { const c = clean(t[1]); if (plausible(c)) return c; }
  }
  // 3) a code alone on its own line, the way most code emails lay it out
  for (const line of hay.split(/\n/)) {
    const t = line.trim();
    if (new RegExp('^' + TOKEN + '$').test(t)) { const c = clean(t); if (plausible(c)) return c; }
  }
  return null;
}

async function summary(id) {
  if (detailCache.has(id)) return detailCache.get(id);
  const m = await api(`messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`);
  const s = {
    id, from: senderName(header(m, 'from')), subject: header(m, 'subject') || '(no subject)',
    snippet: decodeEntities(m.snippet), time: Number(m.internalDate), labels: m.labelIds || [],
  };
  detailCache.set(id, s);
  if (detailCache.size > 500) detailCache.delete(detailCache.keys().next().value);
  return s;
}
async function codeFor(s) {
  if (codeCache.has(s.id)) return codeCache.get(s.id);
  let code = extractCode(s.subject, s.snippet);
  if (!code && CODE_HINT.test(s.subject + ' ' + s.snippet)) {
    const full = await api(`messages/${s.id}?format=full`);
    code = extractCode(s.subject, bodyText(full.payload));
  }
  codeCache.set(s.id, code);
  return code;
}

// Newest inbox mail from the last week, unread flagged, plus any codes from the last 30 minutes.
async function inbox(max = 20) {
  const list = await api(`messages?q=${encodeURIComponent('in:inbox newer_than:7d')}&maxResults=${Math.min(Math.max(max | 0, 1), 50)}`);
  const ids = (list.messages || []).map((m) => m.id);
  const messages = [];
  for (let i = 0; i < ids.length; i += 8) messages.push(...(await Promise.all(ids.slice(i, i + 8).map(summary))));
  // Unread state changes; ask once for the current unread ids instead of refetching every message.
  const unread = new Set(((await api(`messages?q=${encodeURIComponent('in:inbox is:unread newer_than:7d')}&maxResults=50`)).messages || []).map((m) => m.id));
  const codes = [];
  for (const s of messages) if (Date.now() - s.time < CODE_WINDOW_MS) { const code = await codeFor(s); if (code) codes.push({ code, id: s.id, from: s.from, subject: s.subject, time: s.time }); }
  return {
    email: loadStore()?.email || null, unreadCount: unread.size, codes,
    messages: messages.map(({ labels, ...s }) => ({ ...s, unread: unread.has(s.id) })),
  };
}

module.exports = { status, connect, disconnect, inbox, extractCode };
