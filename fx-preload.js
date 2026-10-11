// The effects strip only receives effects to draw; it can't call anything.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('fx', { onPlay: (fn) => ipcRenderer.on('fx:play', (_e, m) => fn(m)) });
