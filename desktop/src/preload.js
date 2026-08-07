'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const desktopApi = Object.freeze({
  getState: () => ipcRenderer.invoke('desktop:get-state'),
  startService: () => ipcRenderer.invoke('service:start'),
  stopService: () => ipcRenderer.invoke('service:stop'),
  regeneratePairing: () => ipcRenderer.invoke('service:regenerate-pairing'),
  copy: (kind) => ipcRenderer.invoke('desktop:copy', kind),
  openWeb: (target) => ipcRenderer.invoke('desktop:open-web', target),
  openDataDirectory: () => ipcRenderer.invoke('desktop:open-data-directory'),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke('desktop:set-launch-at-login', Boolean(enabled)),
  quit: () => ipcRenderer.invoke('desktop:quit'),
  onState: (listener) => {
    if (typeof listener !== 'function') return () => {};
    const handler = (_event, state) => listener(state);
    ipcRenderer.on('desktop:state', handler);
    return () => ipcRenderer.removeListener('desktop:state', handler);
  },
});

contextBridge.exposeInMainWorld('kgcDesktop', desktopApi);
