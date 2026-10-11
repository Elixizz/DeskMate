const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Places are only ever ones the user typed and picked. Nothing here asks for device location.
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
let places = load('places', []);          // [{ name, sub, lat, lon }]
let active = load('active', 0);
let metric = load('metric', false);
let data = null, fetchedAt = 0, reqId = 0;
const MAX_PLACES = 5;

// WMO weather codes -> [label, day icon, night icon]
const WMO = {
  0: ['Clear', '☀️', '🌙'], 1: ['Mostly clear', '🌤️', '🌙'], 2: ['Partly cloudy', '⛅', '☁️'], 3: ['Cloudy', '☁️', '☁️'],
  45: ['Fog', '🌫️', '🌫️'], 48: ['Freezing fog', '🌫️', '🌫️'],
  51: ['Light drizzle', '🌦️', '🌧️'], 53: ['Drizzle', '🌦️', '🌧️'], 55: ['Heavy drizzle', '🌧️', '🌧️'],
  56: ['Freezing drizzle', '🌧️', '🌧️'], 57: ['Freezing drizzle', '🌧️', '🌧️'],
  61: ['Light rain', '🌦️', '🌧️'], 63: ['Rain', '🌧️', '🌧️'], 65: ['Heavy rain', '🌧️', '🌧️'],
  66: ['Freezing rain', '🌧️', '🌧️'], 67: ['Freezing rain', '🌧️', '🌧️'],
  71: ['Light snow', '🌨️', '🌨️'], 73: ['Snow', '🌨️', '🌨️'], 75: ['Heavy snow', '❄️', '❄️'], 77: ['Snow grains', '🌨️', '🌨️'],
  80: ['Showers', '🌦️', '🌧️'], 81: ['Showers', '🌧️', '🌧️'], 82: ['Heavy showers', '🌧️', '🌧️'],
  85: ['Snow showers', '🌨️', '🌨️'], 86: ['Heavy snow showers', '❄️', '❄️'],
  95: ['Thunderstorm', '⛈️', '⛈️'], 96: ['Thunderstorm, hail', '⛈️', '⛈️'], 99: ['Thunderstorm, hail', '⛈️', '⛈️'],
};
const wmo = (c, day = 1) => { const w = WMO[c] || ['', '🌡️', '🌡️']; return { label: w[0], icon: day ? w[1] : w[2] }; };

// ---------- places ----------
function renderPlaces() {
  $('#places').innerHTML = places.map((p, i) => `<button class="chip place${i === active ? ' active' : ''}" data-i="${i}" title="${esc(p.sub)}">${esc(p.name)}<span class="x" data-del="${i}" title="Remove">✕</span></button>`).join('');
  $('#unit').textContent = metric ? '°C' : '°F';
}
$('#places').onclick = (e) => {
  const del = e.target.closest('[data-del]');
  if (del) {
    const n = Number(del.dataset.del);
    places.splice(n, 1);
    if (n < active) active--;
    active = Math.min(active, Math.max(0, places.length - 1));
    store('places', places); store('active', active);
    renderPlaces(); refresh(true);
    return;
  }
  const b = e.target.closest('[data-i]'); if (!b) return;
  active = Number(b.dataset.i); store('active', active);
  renderPlaces(); refresh(true);
};
$('#unit').onclick = () => { metric = !metric; store('metric', metric); renderPlaces(); refresh(true); };
$('#addBtn').onclick = () => {
  const box = $('#search');
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden')) { $('#q').value = ''; $('#results').innerHTML = ''; $('#sErr').textContent = ''; $('#q').focus(); }
};

let found = [];
$('#search').onsubmit = async (e) => {
  e.preventDefault();
  const q = $('#q').value.trim();
  $('#sErr').textContent = ''; $('#results').innerHTML = '';
  if (q.length < 2) return ($('#sErr').textContent = 'Type at least 2 letters');
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    found = ((await r.json()).results || []).map((p) => ({
      name: p.name, sub: [p.admin1, p.country].filter(Boolean).join(', '), lat: p.latitude, lon: p.longitude,
    }));
    if (!found.length) return ($('#sErr').textContent = `No places called "${q}"`);
    $('#results').innerHTML = found.map((p, i) => `<button type="button" class="ghost" data-r="${i}">${esc(p.name)} <span class="muted small">${esc(p.sub)}</span></button>`).join('');
  } catch { $('#sErr').textContent = "Couldn't search right now. Check your connection."; }
};
$('#results').onclick = (e) => {
  const b = e.target.closest('[data-r]'); if (!b) return;
  const p = found[Number(b.dataset.r)];
  const same = places.findIndex((x) => Math.abs(x.lat - p.lat) < 0.01 && Math.abs(x.lon - p.lon) < 0.01);
  if (same >= 0) active = same;
  else {
    if (places.length >= MAX_PLACES) places.shift();
    places.push(p); active = places.length - 1;
  }
  store('places', places); store('active', active);
  $('#search').classList.add('hidden');
  renderPlaces(); refresh(true);
};

// ---------- forecast ----------
async function refresh(force) {
  const p = places[active];
  if (!p) { data = null; render(); return; }
  if (!force && Date.now() - fetchedAt < 30 * 60e3) return;
  // A newer request (place or unit switch) wins; older responses are thrown away.
  const my = ++reqId;
  const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: p.lat.toFixed(3), longitude: p.lon.toFixed(3), timezone: 'auto', forecast_days: '7',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
    hourly: 'temperature_2m,precipitation_probability,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,snowfall_sum,sunrise,sunset',
    temperature_unit: metric ? 'celsius' : 'fahrenheit', wind_speed_unit: metric ? 'kmh' : 'mph', precipitation_unit: metric ? 'mm' : 'inch',
  });
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    if (my !== reqId) return;
    data = json; data.place = p; data.metric = metric;
    fetchedAt = Date.now();
    render();
  } catch {
    if (my !== reqId) return;
    if (!data) $('#body').innerHTML = `<div class="empty">Couldn't load the weather. <button class="ghost" id="retry">Try again</button></div>`;
    const b = $('#retry'); if (b) b.onclick = () => refresh(true);
  }
}

// Open-Meteo times are local to the place ("2026-10-10T18:00"), so read them as plain strings, not as this PC's time.
const hourOf = (t) => { const h = Number(t.slice(11, 13)); return h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`; };
const clockOf = (t) => { const h = Number(t.slice(11, 13)), m = t.slice(14, 16); return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`; };
const dayOf = (d, i) => i === 0 ? 'Today' : new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: 'short' });

function render() {
  if (!places.length) { $('#body').innerHTML = '<div class="empty">Add a city to see the weather.<br><span class="small">Tap "+ City" and type a name. Your device location is never used.</span></div>'; return; }
  if (!data) { $('#body').innerHTML = '<div class="empty">Loading...</div>'; return; }
  const c = data.current, d = data.daily, h = data.hourly, u = data.current_units;
  const deg = '°', wind = data.metric ? 'km/h' : 'mph', snowUnit = (data.daily_units?.snowfall_sum || '').replace('inch', 'in');
  const now = wmo(c.weather_code, c.is_day);

  // next 12 hours starting at the current local hour
  const start = Math.max(0, h.time.findIndex((t) => t.slice(0, 13) >= c.time.slice(0, 13)));
  let hours = '';
  for (let i = start; i < Math.min(start + 12, h.time.length); i++) {
    const w = wmo(h.weather_code[i], h.is_day[i]);
    hours += `<div class="hour"><span class="muted small">${i === start ? 'Now' : hourOf(h.time[i])}</span><span class="ico" title="${esc(w.label)}">${w.icon}</span><b>${Math.round(h.temperature_2m[i])}${deg}</b><span class="wet">${h.precipitation_probability[i] >= 10 ? h.precipitation_probability[i] + '%' : '&nbsp;'}</span></div>`;
  }

  let days = '';
  for (let i = 0; i < d.time.length; i++) {
    const w = wmo(d.weather_code[i]);
    const pop = d.precipitation_probability_max[i], snow = d.snowfall_sum[i];
    const wet = [pop >= 10 ? `${pop}%` : '', snow > 0 ? `${snow.toFixed(1)}${snowUnit} snow` : ''].filter(Boolean).join(' · ');
    days += `<div class="day"><span>${dayOf(d.time[i], i)}</span><span class="ico" title="${esc(w.label)}">${w.icon}</span><span class="wet ellipsis">${wet}</span><span class="t"><b>${Math.round(d.temperature_2m_max[i])}${deg}</b> <span class="lo">${Math.round(d.temperature_2m_min[i])}${deg}</span></span></div>`;
  }

  $('#body').innerHTML = `
    <div class="card">
      <div class="muted small ellipsis">${esc(data.place.name)}${data.place.sub ? ', ' + esc(data.place.sub) : ''}</div>
      <div class="now">
        <span class="ico">${now.icon}</span>
        <div><div class="temp">${Math.round(c.temperature_2m)}${deg}</div></div>
        <div class="grow">
          <div class="desc">${esc(now.label)}</div>
          <div class="muted small">Feels ${Math.round(c.apparent_temperature)}${deg} · H ${Math.round(d.temperature_2m_max[0])}${deg} L ${Math.round(d.temperature_2m_min[0])}${deg}</div>
          <div class="muted small">Wind ${Math.round(c.wind_speed_10m)} ${wind} · Humidity ${c.relative_humidity_2m}${u?.relative_humidity_2m || '%'}</div>
        </div>
      </div>
      <div class="muted small">Sunrise ${clockOf(d.sunrise[0])} · Sunset ${clockOf(d.sunset[0])}</div>
    </div>
    <div class="card"><div class="hours">${hours}</div></div>
    <div class="card">${days}</div>
    <div class="foot muted small">Weather data by Open-Meteo.com · updated ${new Date(fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>`;
}

renderPlaces();
render();
refresh(true);
deskmate.onShown(() => refresh(false));
setInterval(() => refresh(false), 5 * 60e3); // checks every 5 min, fetches at most every 30
