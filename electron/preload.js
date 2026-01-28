
try {
    const { contextBridge, ipcRenderer } = require('electron');

    console.log('--- PRELOAD LOADED ---');

    contextBridge.exposeInMainWorld('electronAPI', {
        // --- File System ---
        selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
        watchFolder: (folderPath) => ipcRenderer.invoke('file:watch-folder', folderPath),
        unwatchFolder: () => ipcRenderer.invoke('file:unwatch-folder'),
        readChunk: (filePath, start, length) => ipcRenderer.invoke('file:read-chunk', filePath, start, length),
        getFileDetails: (filePath) => ipcRenderer.invoke('file:get-details', filePath),
        getDefaultDatabasePath: () => ipcRenderer.invoke('get-default-database-path'),
        getInternalLibrary: () => ipcRenderer.invoke('get-internal-library'),
        getInternalFolders: () => ipcRenderer.invoke('get-internal-library'), // Alias
        
        // --- Persistence (Drawings) ---
        loadMasterDrawings: () => ipcRenderer.invoke('master-drawings:load'),
        saveMasterDrawings: (data) => ipcRenderer.invoke('master-drawings:save', data),
        getDrawingsState: () => ipcRenderer.invoke('drawings:get-state'),
        deleteAllDrawings: (sourceId) => ipcRenderer.invoke('drawings:delete-all', sourceId),

        // --- Persistence (Layouts) ---
        saveLayout: (name, data) => ipcRenderer.invoke('layouts:save', name, data),
        loadLayout: (name) => ipcRenderer.invoke('layouts:load', name),
        listLayouts: () => ipcRenderer.invoke('layouts:list'),

        // --- Trade Persistence ---
        getTradesBySource: (sourceId) => ipcRenderer.invoke('trades:get-by-source', sourceId),
        saveTrade: (trade) => ipcRenderer.invoke('trades:save', trade),

        // --- Telemetry ---
        getSystemTelemetry: () => ipcRenderer.invoke('get-system-telemetry'),

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
