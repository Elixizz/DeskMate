const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

// Polls only while the tab is on screen, so nothing runs in the background while you game.
const POLL_MS = 1500, KEEP = 80; // 80 samples x 1.5 s = 2 minutes
const hist = { cpu: [], gpu: [], ram: [] };
let timer = null, last = null;

const color = (p) => (p == null ? css('--muted') : p >= 90 ? css('--bad') : p >= 70 ? '#ffc93d' : css('--ok'));
function ring(label, pct, sub) {
  const r = 26, c = 2 * Math.PI * r, v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return `<div class="gauge"><svg viewBox="0 0 62 62">
      <circle cx="31" cy="31" r="${r}" fill="none" stroke="${css('--line')}" stroke-width="6"/>
      <circle cx="31" cy="31" r="${r}" fill="none" stroke="${color(pct)}" stroke-width="6" stroke-linecap="round"
        stroke-dasharray="${(c * v) / 100} ${c}" transform="rotate(-90 31 31)" style="transition: stroke-dasharray .4s"/>
      <text x="31" y="36" text-anchor="middle" font-size="15" font-weight="700" fill="${css('--text')}">${pct == null ? '–' : Math.round(pct) + '%'}</text>
    </svg><span class="lbl">${label}</span><span class="sub">${sub || '&nbsp;'}</span></div>`;
}
const rate = (bps) => (bps == null ? '–' : bps >= 1048576 ? (bps / 1048576).toFixed(1) + ' MB/s' : bps >= 1024 ? Math.round(bps / 1024) + ' KB/s' : Math.round(bps) + ' B/s');

function draw() {
  const cv = $('#graph'), dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  g.strokeStyle = css('--line'); g.lineWidth = 1;
  for (const y of [0.25, 0.5, 0.75]) { g.beginPath(); g.moveTo(0, h * y); g.lineTo(w, h * y); g.stroke(); }
  const line = (arr, col) => {
    if (arr.length < 2) return;
    g.strokeStyle = col; g.lineWidth = 1.8; g.lineJoin = 'round'; g.beginPath();
    arr.forEach((v, i) => { const x = w - (arr.length - 1 - i) * (w / (KEEP - 1)), y = h - (v / 100) * (h - 4) - 2; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
  };
  line(hist.ram, '#3ccf8e'); line(hist.gpu, '#3d9bff'); line(hist.cpu, css('--accent'));
}

function render(s) {
  $('#gauges').innerHTML =
    ring('CPU', s.cpu.percent, `${s.cpu.cores} threads`) +
    ring('GPU', s.gpu.percent, s.gpu.temp != null ? `${s.gpu.temp}°C` : '') +
    ring('RAM', s.memory.percent, `${s.memory.usedGB}/${s.memory.totalGB} GB`) +
    ring('DISK', s.disk.percent, 'active');
  const rows = [
    ['CPU', s.cpu.name],
    s.gpu.name && ['GPU', s.gpu.name],
    s.gpu.vramTotalGB && ['VRAM', `${s.gpu.vramUsedGB} / ${s.gpu.vramTotalGB} GB`],
    ['Download', rate(s.network.downBps)],
    ['Upload', rate(s.network.upBps)],
    ['Up for', s.uptimeHours >= 24 ? `${Math.floor(s.uptimeHours / 24)}d ${Math.round(s.uptimeHours % 24)}h` : `${s.uptimeHours}h`],
  ].filter(Boolean);
  $('#details').innerHTML = rows.map(([k, v]) => `<span class="k">${k}</span><span class="v" title="${esc(v)}">${esc(v)}</span>`).join('') +
    (s.gpu.temp == null ? '<span class="k muted small" style="grid-column: 1 / -1">GPU temperature shows on NVIDIA cards. Windows doesn\'t share CPU temperature without extra drivers.</span>' : '');
  draw();
}

async function poll() {
  try {
    const s = await deskmate.system.stats();
    last = s;
    for (const [k, v] of [['cpu', s.cpu.percent], ['gpu', s.gpu.percent], ['ram', s.memory.percent]]) {
      if (v == null) continue;
      hist[k].push(v); if (hist[k].length > KEEP) hist[k].shift();
    }
    render(s);
  } catch (e) { $('#details').textContent = e.message; }
}
function startPolling() { if (!timer) { poll(); timer = setInterval(poll, POLL_MS); } }
function stopPolling() { clearInterval(timer); timer = null; }

// The tab is only "on screen" when the panel is open and this tab is selected; the page's visibility tells us.
document.addEventListener('visibilitychange', () => (document.hidden ? stopPolling() : startPolling()));
deskmate.onHidden(stopPolling);
deskmate.onShown(() => { if (!document.hidden) startPolling(); });
window.addEventListener('resize', () => last && draw());
if (!document.hidden) startPolling();
