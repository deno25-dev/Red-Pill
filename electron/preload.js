
const { contextBridge, ipcRenderer } = require('electron');

console.log('--- PRELOAD SCRIPT V2 EXECUTED ---');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // --- File System & Dialogs ---
    selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
    watchFolder: (folderPath) => ipcRenderer.invoke('file:watch-folder', folderPath),
    unwatchFolder: () => ipcRenderer.invoke('file:unwatch-folder'),
    readChunk: (filePath, start, length) => ipcRenderer.invoke('file:read-chunk', filePath, start, length),
    getFileDetails: (filePath) => ipcRenderer.invoke('file:get-details', filePath),
    getDefaultDatabasePath: () => ipcRenderer.invoke('get-default-database-path'),
    getInternalFolders: () => ipcRenderer.invoke('get-internal-folders'),
    getInternalLibrary: () => ipcRenderer.invoke('get-internal-folders'), // Alias for compatibility
    
    // --- Chart State Persistence (Sidecar files) ---
    loadMeta: (filePath) => ipcRenderer.invoke('meta:load', filePath),
    saveMeta: (filePath, data) => ipcRenderer.invoke('meta:save', filePath, data),
    deleteMeta: (filePath) => ipcRenderer.invoke('meta:delete', filePath),
    
    // --- Drawing State Sync ---
    getDrawingsState: () => ipcRenderer.invoke('drawings:get-state'),
    sendDrawingAction: (action, value) => ipcRenderer.send(`drawings:${action}`, value),

    // --- Trade Persistence ---
    getTradesBySource: (sourceId) => ipcRenderer.invoke('trades:get-by-source', sourceId),
    saveTrade: (trade) => ipcRenderer.invoke('trades:save', trade),

    // --- Listeners from Main ---
    onFolderChange: (callback) => {
        const channel = 'folder-changed';
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on(channel, subscription);
        
        // Return a cleanup function
        return () => {
            ipcRenderer.removeListener(channel, subscription);
        };
    },
});