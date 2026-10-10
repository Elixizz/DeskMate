const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ING = Object.fromEntries(INGREDIENTS.map((i) => [i.name, i]));
const money = (n) => '$' + Math.round(n);

// ---------- mix maths (same rules as the Schedule I Helper) ----------
// Each ingredient swaps a matching effect for its replacement, then still adds its own base effect if there's room.
function calcMix(drugName, names) {
  const drug = DRUGS.find((d) => d.name === drugName) || DRUGS[0];
  const effects = [];
  let cost = 0;
  for (const n of names) {
    const ing = ING[n];
    if (!ing) continue;
    cost += ing.price;
    const hit = effects.find((e) => ing.rep[e]);
    if (hit) {
      const to = ing.rep[hit], idx = effects.indexOf(hit);
      if (!effects.includes(to)) effects[idx] = to; else effects.splice(idx, 1);
    }
    if (!effects.includes(ing.base) && effects.length < MAX_EFFECTS) effects.push(ing.base);
  }
  const bonus = effects.reduce((s, e) => s + ((EFFECTS[e] ?? 1) - 1), 0);
  const sell = Math.round(drug.price * (1 + bonus));
  return { effects, cost, sell, profit: sell - cost };
}

// ---------- saved data (this plugin's own storage) ----------
let store = { mixer: { drug: DRUGS[0].name, steps: [] }, groups: {}, group: GROUPS[0] };
try { Object.assign(store, JSON.parse(localStorage.getItem('schedule-one'))); } catch {}
for (const g of GROUPS) store.groups[g] ||= JSON.parse(JSON.stringify(SEED[g]));
const save = () => { try { localStorage.setItem('schedule-one', JSON.stringify(store)); } catch {} };

// ---------- sections ----------
function showSection(id) {
  document.querySelectorAll('#sections .segbtn').forEach((b) => b.classList.toggle('active', b.dataset.sec === id));
  const map = { mixer: 'mixer', customers: 'customers', effects: 'effectsRef', ingredients: 'ingredientsRef' };
  for (const [k, el] of Object.entries(map)) $('#' + el).classList.toggle('hidden', k !== id);
}
$('#sections').addEventListener('click', (e) => { const b = e.target.closest('[data-sec]'); if (b) showSection(b.dataset.sec); });

// ---------- mixer ----------
function renderMixer() {
  const m = store.mixer;
  $('#steps').innerHTML = m.steps.map((n) => `<li>${esc(n)} <span class="muted small">$${ING[n]?.price ?? 0}</span></li>`).join('');
  $('#stepsEmpty').classList.toggle('hidden', m.steps.length > 0);
  const r = calcMix(m.drug, m.steps);
  $('#effects').innerHTML = r.effects.length
    ? r.effects.map((e) => `<span class="chip">${esc(e)}</span>`).join('')
    : '<span class="muted small">No effects yet</span>';
  $('#cost').textContent = money(r.cost);
  $('#sell').textContent = money(r.sell);
  const p = $('#profit');
  p.textContent = money(r.profit);
  p.className = r.profit >= 0 ? 'ok' : 'bad';
}
$('#drug').innerHTML = DRUGS.map((d) => `<option>${esc(d.name)}</option>`).join('');
$('#drug').value = store.mixer.drug;
$('#drug').addEventListener('change', (e) => { store.mixer.drug = e.target.value; save(); renderMixer(); });
$('#pick').innerHTML = INGREDIENTS.map((i) => `<button class="chip" data-add="${esc(i.name)}">${esc(i.name)}</button>`).join('');
$('#pick').addEventListener('click', (e) => {
  const b = e.target.closest('[data-add]');
  if (b) { store.mixer.steps.push(b.dataset.add); save(); renderMixer(); }
});
$('#removeLast').onclick = () => { store.mixer.steps.pop(); save(); renderMixer(); };
$('#clearMix').onclick = () => { store.mixer.steps = []; save(); renderMixer(); };

// ---------- customers ----------
function renderGroups() {
  $('#groups').innerHTML = GROUPS.map((g) => `<button class="segbtn${g === store.group ? ' active' : ''}" data-g="${esc(g)}">${esc(g)}</button>`).join('');
  renderGroup();
}
$('#groups').addEventListener('click', (e) => {
  const b = e.target.closest('[data-g]');
  if (b) { store.group = b.dataset.g; save(); renderGroups(); }
});

let editDrugs = false;
function mixCard(g, mi) {
  const mix = g.mixes[mi];
  const opts = INGREDIENTS.map((i) => `<option>${esc(i.name)}</option>`).join('');
  return `<div class="card mix" data-mi="${mi}">
    <div class="head"><input class="grow" data-f="mixname" value="${esc(mix.name)}" placeholder="Drug / strain"><button class="ghost" data-act="delmix">Delete</button></div>
    ${mix.ingredients.length ? `<ol>${mix.ingredients.map((n, i) => `<li>${esc(n)} <button class="icon" data-act="rm" data-i="${i}">&times;</button></li>`).join('')}</ol>` : '<div class="muted small">No ingredients</div>'}
    <div class="add"><select>${opts}</select><button class="ghost" data-act="add">Add</button></div>
  </div>`;
}
function renderGroup() {
  const g = store.groups[store.group];
  const favs = g.drugs.length ? g.drugs.map((d) => `<span class="chip">${esc(d)}</span>`).join('') : '<span class="muted small">None yet</span>';
  const picker = DRUGS.map((d) => `<button class="chip${g.drugs.includes(d.name) ? ' active' : ''}" data-drug="${esc(d.name)}">${esc(d.name)}</button>`).join('');
  $('#group').innerHTML = `
    <div class="field"><label>Location</label><input data-f="location" value="${esc(g.location)}" placeholder="Where to find them"></div>
    <div class="field"><label>Favorite drugs <button class="chip" data-act="editdrugs">${editDrugs ? 'Done' : 'Edit'}</button></label>
      <div class="chips">${editDrugs ? picker : favs}</div></div>
    <div class="field"><label>Mixes <button class="chip" data-act="newmix">+ New</button></label></div>
    ${g.mixes.map((_, i) => mixCard(g, i)).join('') || '<div class="muted small">No mixes yet</div>'}
    <div class="field"><label>Notes</label><textarea data-f="notes" rows="3">${esc(g.notes)}</textarea></div>`;
}
const grp = $('#group');
grp.addEventListener('input', (e) => {
  const g = store.groups[store.group], f = e.target.dataset.f;
  if (f === 'location' || f === 'notes') g[f] = e.target.value;
  else if (f === 'mixname') g.mixes[+e.target.closest('[data-mi]').dataset.mi].name = e.target.value;
  else return;
  save();
});
grp.addEventListener('change', (e) => { if (e.target.dataset.f === 'mixname') renderGroup(); });
grp.addEventListener('click', (e) => {
  const g = store.groups[store.group];
  const drug = e.target.closest('[data-drug]');
  if (drug) {
    const d = drug.dataset.drug;
    g.drugs = g.drugs.includes(d) ? g.drugs.filter((x) => x !== d) : [...g.drugs, d];
    save(); return renderGroup();
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const card = b.closest('[data-mi]');
  const mix = card && g.mixes[+card.dataset.mi];
  switch (b.dataset.act) {
    case 'editdrugs': editDrugs = !editDrugs; break;
    case 'newmix': g.mixes.push({ name: 'New mix', ingredients: [] }); break;
    case 'delmix': g.mixes.splice(+card.dataset.mi, 1); break;
    case 'rm': mix.ingredients.splice(+b.dataset.i, 1); break;
    case 'add': mix.ingredients.push(card.querySelector('select').value); break;
    default: return;
  }
  save(); renderGroup();
});

// ---------- reference lists ----------
$('#effectsList').innerHTML = Object.entries(EFFECTS).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([n, m]) => `<div class="row eff"><span>${esc(n)}</span><span class="muted">x${m.toFixed(2)}</span></div>`).join('');
$('#ingredientsList').innerHTML = INGREDIENTS.map((i) => `<div class="card ing">
  <div class="top"><b>${esc(i.name)}</b><span class="muted">$${i.price} &middot; ${esc(i.base)}</span></div>
  <div class="rules">${Object.entries(i.rep).map(([k, v]) => `<div>${esc(k)} &rarr; ${esc(v)}</div>`).join('')}</div></div>`).join('');
$('#ingredientsList').addEventListener('click', (e) => { const c = e.target.closest('.ing'); if (c) c.classList.toggle('open'); });

renderMixer();
renderGroups();
