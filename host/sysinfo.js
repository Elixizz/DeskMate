// PC stats for the "system-info" permission: CPU and memory from Node, GPU/disk/network from Windows performance
// counters (a PowerShell sampler), and GPU temperature/VRAM from nvidia-smi when an NVIDIA card is present.
// Nothing runs until a Mate asks, and it all stops again 20 seconds after the last request.
const os = require('os');
const fs = require('fs');
const { spawn, execFile } = require('child_process');

let prevCpu = null, counters = {}, nvidia = null, ps = null, nvTimer = null, idleTimer = null;
const NVSMI = 'C:\\Windows\\System32\\nvidia-smi.exe';

function cpuPercent() {
  const t = os.cpus().reduce((a, c) => {
    const s = c.times; a.idle += s.idle; a.total += s.user + s.nice + s.sys + s.idle + s.irq; return a;
  }, { idle: 0, total: 0 });
  let pct = null;
  if (prevCpu) { const dt = t.total - prevCpu.total; pct = dt > 0 ? Math.round(100 * (1 - (t.idle - prevCpu.idle) / dt)) : 0; }
  prevCpu = t;
  return pct;
}

const SAMPLER = `
$ErrorActionPreference = 'SilentlyContinue'
$paths = '\\GPU Engine(*engtype_3D)\\Utilization Percentage', '\\PhysicalDisk(_Total)\\% Disk Time', '\\Network Interface(*)\\Bytes Received/sec', '\\Network Interface(*)\\Bytes Sent/sec'
while ($true) {
  $s = (Get-Counter -Counter $paths -SampleInterval 1 -MaxSamples 1).CounterSamples
  $gpu = ($s | Where-Object { $_.Path -like '*engtype_3d*' } | Measure-Object CookedValue -Sum).Sum
  $disk = ($s | Where-Object { $_.Path -like '*% disk time' } | Measure-Object CookedValue -Sum).Sum
  $down = ($s | Where-Object { $_.Path -like '*bytes received/sec' } | Measure-Object CookedValue -Sum).Sum
  $up = ($s | Where-Object { $_.Path -like '*bytes sent/sec' } | Measure-Object CookedValue -Sum).Sum
  [Console]::Out.WriteLine((@{ gpu = [math]::Round([math]::Min(100, $gpu)); disk = [math]::Round([math]::Min(100, $disk)); down = [math]::Round($down); up = [math]::Round($up) } | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}`;

function start() {
  if (ps) return;
  const p = ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SAMPLER], { windowsHide: true });
  let buf = '';
  p.stdout.on('data', (d) => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); try { if (line) counters = JSON.parse(line); } catch {} }
  });
  // only forget the sampler if it's still the current one (a quick stop/start may have replaced it)
  p.on('error', () => { if (ps === p) ps = null; });
  p.on('exit', () => { if (ps === p) ps = null; });
  if (fs.existsSync(NVSMI) && !nvTimer) {
    const poll = () => execFile(NVSMI, ['--query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 4000 }, (err, out) => {
      if (err) return;
      const [name, temp, util, used, total] = String(out).split('\n')[0].split(',').map((x) => x.trim());
      nvidia = { name, temp: Number(temp), util: Number(util), vramUsed: Number(used), vramTotal: Number(total) };
    });
    poll(); nvTimer = setInterval(poll, 3000);
  }
}
function stop() {
  if (ps) { ps.kill(); ps = null; }
  clearInterval(nvTimer); nvTimer = null; nvidia = null; counters = {}; prevCpu = null;
}

function stats() {
  start();
  clearTimeout(idleTimer); idleTimer = setTimeout(stop, 20e3);
  const total = os.totalmem(), free = os.freemem();
  return {
    cpu: { percent: cpuPercent(), name: os.cpus()[0]?.model?.trim() || 'CPU', cores: os.cpus().length },
    memory: { usedGB: +((total - free) / 1073741824).toFixed(1), totalGB: +(total / 1073741824).toFixed(1), percent: Math.round(100 * (1 - free / total)) },
    gpu: {
      percent: nvidia?.util ?? (typeof counters.gpu === 'number' ? counters.gpu : null),
      temp: nvidia?.temp ?? null, name: nvidia?.name ?? null,
      vramUsedGB: nvidia ? +(nvidia.vramUsed / 1024).toFixed(1) : null, vramTotalGB: nvidia ? +(nvidia.vramTotal / 1024).toFixed(1) : null,
    },
    disk: { percent: typeof counters.disk === 'number' ? counters.disk : null },
    network: { downBps: counters.down ?? null, upBps: counters.up ?? null },
    uptimeHours: +(os.uptime() / 3600).toFixed(1),
  };
}

module.exports = { stats, stop };
