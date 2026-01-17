
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
    openFolder: (subpath) => ipcRenderer.invoke('shell:open-folder', subpath),
    
    // --- Master Drawing Store Persistence (LEGACY) ---
    loadMasterDrawings: () => ipcRenderer.invoke('master-drawings:load'),
    saveMasterDrawings: (data) => ipcRenderer.invoke('master-drawings:save', data),
    
    // --- New Database Storage (Mandate 0.31) ---
    saveObjectTree: (data) => ipcRenderer.invoke('storage:save-object-tree', data),
    saveDrawing: (symbol, data) => ipcRenderer.invoke('storage:save-drawing', symbol, data),
    loadDrawing: (symbol) => ipcRenderer.invoke('storage:load-drawing', symbol),
    
    // --- UI Settings (Mandate 3.1) ---
    saveSettings: (filename, data) => ipcRenderer.invoke('storage:save-settings', filename, data),
    loadSettings: (filename) => ipcRenderer.invoke('storage:load-settings', filename),

    // --- Sticky Notes (Mandate 4.4) ---
    saveStickyNotes: (notes) => ipcRenderer.invoke('storage:save-sticky-notes', notes),
    loadStickyNotes: () => ipcRenderer.invoke('storage:load-sticky-notes'),

    // --- Drawing State Sync ---
    getDrawingsState: () => ipcRenderer.invoke('drawings:get-state'),
    sendDrawingAction: (action, value) => ipcRenderer.send(`drawings:${action}`, value),
    deleteAllDrawings: (sourceId) => ipcRenderer.invoke('drawings:delete-all', sourceId),

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
