const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('api', {
  hide: call('win:hide'),
  pin: call('win:pin'),
  hotkey: call('win:hotkey'),
  mini: { shrink: call('mini:shrink'), open: call('mini:open'), menu: call('mini:menu') },
  getSettings: call('settings:get'),
  setSettings: call('settings:set'),
  vault: {
    status: call('vault:status'), create: call('vault:create'), unlock: call('vault:unlock'), lock: call('vault:lock'),
    save: call('vault:save'), del: call('vault:delete'), reveal: call('vault:reveal'), copy: call('vault:copy'), generate: call('vault:generate'),
    codes: call('vault:codes'), qr: call('vault:qr'), verify: call('vault:verify'),
    security: call('vault:security'), securityBegin: call('vault:securityBegin'), securityConfirm: call('vault:securityConfirm'), securityDisable: call('vault:securityDisable'),
    bindInfo: call('vault:bindInfo'), pickBackup: call('vault:pickBackup'), bind: call('vault:bind'), recoveryKey: call('vault:recoveryKey'),
    backupNow: call('vault:backupNow'), pickRestore: call('vault:pickRestore'), restore: call('vault:restore'),
  },
  update: { status: call('app:updateStatus'), check: call('app:updateCheck'), install: call('app:updateInstall') },
  plugins: {
    list: call('plugins:list'), layout: call('plugins:layout'), status: call('plugins:status'),
    storeGet: call('plugins:storeGet'), storeUrl: call('plugins:storeUrl'), stageStore: call('plugins:stageStore'), stageFolder: call('plugins:stageFolder'),
    commit: call('plugins:commit'), checkUpdates: call('plugins:checkUpdates'), remove: call('plugins:remove'), enable: call('plugins:enable'), reload: call('plugins:reload'), devtools: call('plugins:devtools'),
  },
  on: (ch, fn) => ipcRenderer.on(ch, (_e, ...a) => fn(...a)),
});
