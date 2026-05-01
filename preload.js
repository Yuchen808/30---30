const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('helper', {
  notify: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),
  minimize: () => ipcRenderer.invoke('win-minimize'),
  close: () => ipcRenderer.invoke('win-close'),
  dock: () => ipcRenderer.invoke('win-dock'),
  undock: () => ipcRenderer.invoke('win-undock')
});
