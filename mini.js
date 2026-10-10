// The corner pill: shows the status dots plugins publish. Click opens Deskmate, right-click for options.
const pill = document.getElementById('pill'), dots = document.getElementById('dots');
function render(list) {
  dots.innerHTML = list.length
    ? list.map((s) => `<span class="grp">${s.dots.map((d) => `<i class="${d.pulse ? 'pulse' : ''}"${d.color ? ` style="background:${d.color};box-shadow:0 0 7px ${d.color}"` : ''}></i>`).join('')}</span>`).join('')
    : '<i></i>';
  pill.title = list.map((s) => s.tooltip).filter(Boolean).join('\n') || 'Deskmate';
}
pill.onclick = () => api.mini.open();
pill.oncontextmenu = (e) => { e.preventDefault(); api.mini.menu(); };
api.on('host:status', render);
api.plugins.status().then(render);
