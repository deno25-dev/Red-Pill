
// Task 3: Preload Handshake
window.PRELOAD_EXECUTED = true;

try {
    const { contextBridge, ipcRenderer } = require('electron');

    console.log('--- PRELOAD LOADED ---');

    // Listener for Main Process Logs
    ipcRenderer.on('redpill-log-stream', (event, logEntry) => {
        if (window.__REDPIL_LOGS__) {
            const entry = {
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                category: logEntry.category || 'IPC BRIDGE',
                level: logEntry.level || 'INFO',
                message: logEntry.message,
                data: logEntry.data,
                source: 'MainProcess'
            };
            window.__REDPIL_LOGS__.unshift(entry);
            if (window.__REDPIL_LOGS__.length > 1000) window.__REDPIL_LOGS__.pop();
            // Dispatch to UI
            window.dispatchEvent(new CustomEvent('redpill-log-stream', { detail: entry }));
        }
    });

    contextBridge.exposeInMainWorld('electronAPI', {
        // --- File System ---
        selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
        watchFolder: (folderPath) => ipcRenderer.invoke('file:watch-folder', folderPath),
        unwatchFolder: () => ipcRenderer.invoke('file:unwatch-folder'),
        readChunk: (filePath, start, length) => ipcRenderer.invoke('file:read-chunk', filePath, start, length),
        getFileDetails: (filePath) => ipcRenderer.invoke('file:get-details', filePath),
        getDefaultDatabasePath: () => ipcRenderer.invoke('get-default-database-path'),
        getInternalLibrary: () => ipcRenderer.invoke('get-internal-library'),
        getInternalFolders: () => ipcRenderer.invoke('get-internal-library'),
        
        // --- Data Ingestion ---
        getMarketData: (symbol, timeframe, filePath, toTime, limit) => ipcRenderer.invoke('market:get-data', symbol, timeframe, filePath, toTime, limit),

        // --- Persistence ---
        loadMasterDrawings: () => ipcRenderer.invoke('master-drawings:load'),
        getDrawingsState: (symbol) => ipcRenderer.invoke('drawings:get-state', symbol),
        saveDrawingState: (symbol, data) => ipcRenderer.invoke('drawings:save-state', symbol, data),
        deleteAllDrawings: (sourceId) => ipcRenderer.invoke('drawings:delete-all', sourceId),

        // --- Layouts ---
        saveLayout: (name, data) => ipcRenderer.invoke('layouts:save', name, data),
        loadLayout: (name) => ipcRenderer.invoke('layouts:load', name),
        listLayouts: () => ipcRenderer.invoke('layouts:list'),

        // --- Trades ---
        getTradesBySource: (sourceId) => ipcRenderer.invoke('trades:get-ledger', sourceId),
        saveTrade: (trade) => ipcRenderer.invoke('trades:save', trade),

        // --- Logs & Diagnostics ---
        getDbStatus: () => ipcRenderer.invoke('logs:get-db-status'),
        sendLog: (category, message, data) => ipcRenderer.send('log:send', category, message, data),
        getSystemTelemetry: () => ipcRenderer.invoke('get-system-telemetry'),
        
        // --- NEW: Global State Explorer ---
        getGlobalState: () => ipcRenderer.invoke('debug:get-global-state'),

        // --- Listeners ---
        onFolderChange: (callback) => {
            const channel = 'folder-changed';
            const subscription = (event, ...args) => callback(...args);
            ipcRenderer.on(channel, subscription);
            return () => ipcRenderer.removeListener(channel, subscription);
        },
    });

    console.log('PRELOAD_SUCCESS');
} catch (error) {
    console.error('PRELOAD_FAILED:', error);
}
