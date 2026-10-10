// The always-visible player bar. It only shows state and sends commands; the audio itself lives in the tab.
const $ = (s) => document.querySelector(s);
const cmd = (action, value) => deskmate.send({ from: 'bar', type: 'cmd', action, value });
let dragging = null, dragTimer = null;

deskmate.onMessage((m) => {
  if (m.from !== 'tab' || m.type !== 'state') return;
  $('#npTitle').textContent = m.title || 'Nothing playing';
  $('#playBtn').innerHTML = m.playing ? '&#x23F8;' : '&#x25B6;';
  $('#shuffleBtn').classList.toggle('on', !!m.shuffle);
  if (dragging !== 'seek') $('#seek').value = Math.round((m.frac || 0) * 1000);
  if (dragging !== 'vol' && m.vol >= 0) $('#vol').value = m.vol;
});
$('#playBtn').onclick = () => cmd('toggle');
$('#nextBtn').onclick = () => cmd('next');
$('#prevBtn').onclick = () => cmd('prev');
$('#shuffleBtn').onclick = () => cmd('shuffle');
function drag(which) { dragging = which; clearTimeout(dragTimer); dragTimer = setTimeout(() => (dragging = null), 1500); }
$('#seek').oninput = () => { drag('seek'); cmd('seek', $('#seek').value / 1000); };
$('#vol').oninput = () => { drag('vol'); cmd('vol', Number($('#vol').value)); };
cmd('hello');
