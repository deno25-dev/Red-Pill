
// Abstraction layer for Tauri commands to replace Electron Bridge
// This assumes the Rust backend implements these commands in snake_case

declare global {
    interface Window {
        __TAURI__?: {
            invoke: (cmd: string, args?: any) => Promise<any>;
        };
    }
}

const invoke = window.__TAURI__?.invoke;

export const isTauri = () => !!invoke;

export const tauriAPI = {
    // Filesystem
    readChunk: async (path: string, start: number, length: number) => {
        if (!invoke) return "";
        return await invoke('read_file_chunk', { path, start, length });
    },
    getFileDetails: async (path: string) => {
        if (!invoke) return { exists: false, size: 0 };
        return await invoke('get_file_details', { path });
    },
    scanAssets: async () => {
        if (!invoke) return [];
        return await invoke('scan_assets_folder');
    },
    
    // Storage (Drawings)
    saveDrawing: async (symbol: string, data: any) => {
        if (!invoke) return;
        await invoke('save_drawing', { symbol, data });
    },
    loadDrawing: async (symbol: string) => {
        if (!invoke) return null;
        return await invoke('load_drawing', { symbol });
    },
    deleteAllDrawings: async (sourceId: string) => {
        if (!invoke) return;
        await invoke('delete_all_drawings', { sourceId });
    },

    // UI Layouts & Settings
    saveSettings: async (filename: string, data: any) => {
        if (!invoke) return;
        await invoke('save_settings', { filename, data });
    },
    loadSettings: async (filename: string) => {
        if (!invoke) return { success: false };
        return await invoke('load_settings', { filename });
    },
    
    // Metadata (Layouts/Sticky Notes)
    saveStickyNotes: async (notes: any) => {
        if (!invoke) return;
        await invoke('save_sticky_notes', { notes });
    },
    loadStickyNotes: async () => {
        if (!invoke) return { success: false, data: [] };
        return await invoke('load_sticky_notes');
    },
    
    // Trades
    saveTrade: async (trade: any) => {
        if (!invoke) return;
        await invoke('save_trade', { trade });
    },
    getTradesBySource: async (sourceId: string) => {
        if (!invoke) return [];
        return await invoke('get_trades_by_source', { sourceId });
    },
    
    // System
    nuclearReset: async () => {
        if (!invoke) return;
        await invoke('nuclear_reset');
    }
};
