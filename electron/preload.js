
const { contextBridge, ipcRenderer } = require('electron');

console.log('--- PRELOAD SCRIPT V2 EXECUTED ---');

// --- BRIDGE UTILS ---

/**
 * Debounces promise-returning functions.
 * Resolves ALL pending promises with the result of the LAST execution.
 * Effectively batches multiple rapid calls into one final execution.
 */
const debouncePromise = (func, wait) => {
    let timeout;
    let pendingResolves = [];
    let pendingRejects = [];
    
    return (...args) => {
        return new Promise((resolve, reject) => {
            pendingResolves.push(resolve);
            pendingRejects.push(reject);
            
            clearTimeout(timeout);
            timeout = setTimeout(async () => {
                try {
                    const result = await func(...args);
                    pendingResolves.forEach(r => r(result));
                } catch (err) {
                    pendingRejects.forEach(r => r(err));
                } finally {
                    pendingResolves = [];
                    pendingRejects = [];
                }
            }, wait);
        });
    };
};

// Internal Wrappers
const invokeSaveDrawing = debouncePromise((symbol, data) => ipcRenderer.invoke('storage:save-drawing', symbol, data), 500);
const invokeSaveSettings = debouncePromise((filename, data) => ipcRenderer.invoke('storage:save-settings', filename, data), 500);
const invokeSaveObjectTree = debouncePromise((data) => ipcRenderer.invoke('storage:save-object-tree', data), 1000);
const invokeSaveStickyNotes = debouncePromise((notes) => ipcRenderer.invoke('storage:save-sticky-notes', notes), 1000);

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
    getDatabasePath: () => ipcRenderer.invoke('get-database-path'),
    getInternalFolders: () => ipcRenderer.invoke('get-internal-folders'),
    getInternalLibrary: () => ipcRenderer.invoke('get-internal-folders'), // Alias for compatibility
    openFolder: (subpath) => ipcRenderer.invoke('shell:open-folder', subpath),
    getStoragePath: () => ipcRenderer.invoke('get-storage-path'),
    nuclearReset: () => ipcRenderer.invoke('storage:nuclear-reset'),
    
    // --- New Database Storage (Mandate 0.31) ---
    // THROTTLED for bridge performance
    saveObjectTree: (data) => invokeSaveObjectTree(data),
    saveDrawing: (symbol, data) => invokeSaveDrawing(symbol, data),
    loadDrawing: (symbol) => ipcRenderer.invoke('storage:load-drawing', symbol),
    ensureStickyNoteDirectory: () => ipcRenderer.invoke('storage:ensure-sticky-notes-dir'),
    
    // --- UI Settings (Mandate 3.1) ---
    // THROTTLED
    saveSettings: (filename, data) => invokeSaveSettings(filename, data),
    loadSettings: (filename) => ipcRenderer.invoke('storage:load-settings', filename),
    listLayouts: () => ipcRenderer.invoke('storage:list-layouts'),
    saveLayout: (filename, data) => ipcRenderer.invoke('storage:save-layout', filename, data),
    loadLayout: (filename) => ipcRenderer.invoke('storage:load-layout', filename),
    restoreLayout: (filename) => ipcRenderer.invoke('storage:restore-layout', filename),

    // --- Sticky Notes (Mandate 4.4) ---
    // THROTTLED
    saveStickyNotes: (notes) => invokeSaveStickyNotes(notes),
    loadStickyNotes: () => ipcRenderer.invoke('storage:load-sticky-notes'),
    listStickyNotesDirectory: () => ipcRenderer.invoke('storage:list-sticky-notes-directory'),

    // --- Metadata Management (Mandate 0.38) ---
    deleteMetadataFile: (category, filename) => ipcRenderer.invoke('storage:delete-metadata-file', category, filename),
    loadMetadataFile: (category, filename) => ipcRenderer.invoke('storage:load-metadata-file', category, filename),

    // --- Drawing State Sync ---
    getDrawingsState: () => ipcRenderer.invoke('drawings:get-state'),
    sendDrawingAction: (action, value) => ipcRenderer.send(`drawings:${action}`, value),
    deleteAllDrawings: (sourceId) => ipcRenderer.invoke('drawings:delete-all', sourceId),

    // --- Trade Persistence ---
    // Trade saves are NOT throttled to ensure financial accuracy
    getTradesBySource: (sourceId) => ipcRenderer.invoke('trades:get-by-source', sourceId),
    saveTrade: (trade) => ipcRenderer.invoke('trades:save', trade),
    
    // --- Global Order Book Sync (Mandate 5.0) ---
    syncOrders: (orders) => ipcRenderer.invoke('orders:sync', orders),

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
