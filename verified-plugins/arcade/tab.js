// Arcade menu: one card per game with a live thumbnail and your best.
const ORDER = ['idle', 'runner', 'td', 'rpg'];
function menu() {
  Arcade.stop();
  $('#play').classList.add('hidden'); $('#menu').classList.remove('hidden');
  $('#cards').innerHTML = ORDER.filter((id) => GAMES[id]).map((id) => {
    const g = GAMES[id], b = g.bestLabel ? g.bestLabel(Arcade.best(id)) : '';
    return `<button class="gcard" data-g="${id}"><canvas width="170" height="86"></canvas><div class="info"><b>${g.name}</b><span>${g.desc}</span>${b ? `<span class="best">${b}</span>` : ''}</div></button>`;
  }).join('');
  document.querySelectorAll('.gcard').forEach((c) => {
    const cv = c.querySelector('canvas'), g = cv.getContext('2d');
    GAMES[c.dataset.g].thumb?.(g, cv.width, cv.height);
    c.onclick = () => play(c.dataset.g);
  });
}
function play(id) {
  $('#menu').classList.add('hidden'); $('#play').classList.remove('hidden');
  Arcade.save('last', id);
  requestAnimationFrame(() => Arcade.start(id));
}
$('#back').onclick = menu;
$('#pauseBtn').onclick = () => Arcade.togglePause();
Arcade.muted = Arcade.load('muted', false);
$('#mute').classList.toggle('off', Arcade.muted);
$('#mute').onclick = () => { Arcade.muted = !Arcade.muted; Arcade.save('muted', Arcade.muted); $('#mute').classList.toggle('off', Arcade.muted); };
menu();
