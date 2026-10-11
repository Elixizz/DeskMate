// "screen-effects": little animations just outside DeskMate's panel, e.g. bugs escaping Desk Defense that walk out
// onto the screen and pop. A transparent, click-through, non-focusable strip to the left of the panel. Mates can only
// ask for a fixed set of effects (they can't draw arbitrary things on the screen), and the strip hides itself when
// the last effect ends.
const { BrowserWindow } = require('electron');
const path = require('path');

const STRIP_W = 170;
let fxWin = null, ready = false, queue = [], hideTimer = null;

function ensure() {
  if (fxWin && !fxWin.isDestroyed()) return fxWin;
  ready = false;
  fxWin = new BrowserWindow({
    width: STRIP_W, height: 400, show: false, frame: false, transparent: true, resizable: false, movable: false,
    skipTaskbar: true, alwaysOnTop: true, focusable: false, fullscreenable: false, hasShadow: false, thickFrame: false,
    webPreferences: { preload: path.join(__dirname, '..', 'fx-preload.js'), backgroundThrottling: false },
  });
  fxWin.setIgnoreMouseEvents(true);
  fxWin.setAlwaysOnTop(true, 'pop-up-menu');
  fxWin.loadFile(path.join(__dirname, '..', 'fx.html'));
  fxWin.webContents.once('did-finish-load', () => { ready = true; queue.splice(0).forEach((m) => fxWin.webContents.send('fx:play', m)); });
  fxWin.on('closed', () => { fxWin = null; ready = false; });
  return fxWin;
}

// effect: { kind: 'escape', y (px, relative to the requesting view's top), color, size }
function play(mainWin, viewBounds, effect) {
  if (!mainWin || !mainWin.isVisible()) return false;
  const w = ensure(), b = mainWin.getBounds();
  w.setBounds({ x: b.x - STRIP_W, y: b.y, width: STRIP_W, height: b.height });
  if (!w.isVisible()) w.showInactive();
  const msg = {
    kind: 'escape',
    y: Math.max(8, Math.min(b.height - 8, Math.round((viewBounds?.y || 0) + Number(effect.y) || 0))),
    color: /^#[0-9a-f]{3,8}$/i.test(effect.color || '') ? effect.color : '#c0392b',
    size: Math.max(3, Math.min(14, Number(effect.size) || 6)),
  };
  ready ? w.webContents.send('fx:play', msg) : queue.push(msg);
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (fxWin && !fxWin.isDestroyed()) fxWin.hide(); }, 3500);
  return true;
}
function hide() { if (fxWin && !fxWin.isDestroyed()) fxWin.hide(); }

module.exports = { play, hide };
