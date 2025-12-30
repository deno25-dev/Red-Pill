const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
  watchFolder: (path) => ipcRenderer.invoke('file:watch-folder', path),
  unwatchFolder: () => ipcRenderer.invoke('file:unwatch'),
  readChunk: (path, start, length) => ipcRenderer.invoke('file:read-chunk', path, start, length),
  getFileDetails: (path) => ipcRenderer.invoke('file:stat', path),
  onFolderChange: (callback) => {
    const subscription = (_event, files) => callback(files);
    ipcRenderer.on('folder-changed', subscription);
    return () => ipcRenderer.removeListener('folder-changed', subscription);
  }
});