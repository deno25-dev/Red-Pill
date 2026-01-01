
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
  watchFolder: (path) => ipcRenderer.invoke('file:watch-folder', path),
  unwatchFolder: () => ipcRenderer.invoke('file:unwatch'),
  readChunk: (path, start, length) => ipcRenderer.invoke('file:read-chunk', path, start, length),
  getFileDetails: (path) => ipcRenderer.invoke('file:stat', path),
  saveMeta: (path, data) => ipcRenderer.invoke('meta:save', path, data),
  loadMeta: (path) => ipcRenderer.invoke('meta:load', path),
  deleteMeta: (path) => ipcRenderer.invoke('meta:delete', path),
  scanMeta: (folderPath) => ipcRenderer.invoke('meta:scan', folderPath),
  
  // Trade Persistence
  saveTrade: (trade) => ipcRenderer.invoke('trade:save', trade),
  getTradesBySource: (sourceId) => ipcRenderer.invoke('trade:get-by-source', sourceId),
  scanTrades: () => ipcRenderer.invoke('trade:scan'),
  
  // Database Resolvers
  getDefaultDatabasePath: () => ipcRenderer.invoke('app:get-default-database'),
  getDatabaseFolders: () => ipcRenderer.invoke('get-folders'),
  
  // Internal Library
  scanInternalDatabase: () => ipcRenderer.invoke('internal:scan-database'), // Legacy/Manual Refresh
  getInternalLibrary: () => ipcRenderer.invoke('internal:get-library'), // Fast cached access
  
  getDrawingsState: () => ipcRenderer.invoke('drawings:get-state'),
  
  // Events
  onFolderChange: (callback) => {
    const subscription = (_event, files) => callback(files);
    ipcRenderer.on('folder-changed', subscription);
    return () => ipcRenderer.removeListener('folder-changed', subscription);
  },

  // Drawing Signals (The 3 Headaches)
  sendDrawingAction: (action, payload) => {
      const validActions = ['hide', 'lock', 'delete'];
      if (validActions.includes(action)) {
          ipcRenderer.send(`drawings:${action}`, payload);
      }
  }
});
