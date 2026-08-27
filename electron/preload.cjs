const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronWindow', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  pin: () => ipcRenderer.invoke('window:pin'),
  close: () => ipcRenderer.invoke('window:close'),
  quit: () => ipcRenderer.invoke('window:quit'),
});

contextBridge.exposeInMainWorld('electronQuickInput', {
  close: () => ipcRenderer.invoke('quick-input:close'),
  submit: (text) => ipcRenderer.invoke('quick-input:submit', text),
  setShortcut: (accelerator) => ipcRenderer.invoke('quick-input:set-shortcut', accelerator),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('quick-input:set-auto-launch', enabled),
  onFocus: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('quick-input:focus', listener);
    return () => ipcRenderer.removeListener('quick-input:focus', listener);
  },
  onSubmit: (callback) => {
    const listener = (_event, text) => callback(text);
    ipcRenderer.on('quick-input:submit', listener);
    return () => ipcRenderer.removeListener('quick-input:submit', listener);
  },
});
