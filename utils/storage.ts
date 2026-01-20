import { ChartState } from '../types';

const DB_NAME = 'RedPillChartingDB';
const HANDLE_STORE = 'handles'; 
const DB_HANDLE_KEY = 'databaseRoot'; 
const STATE_STORE = 'appState';
const RECENTS_STORE = 'recentFiles';
const WATCHLIST_STORE = 'watchlist';
const DRAWINGS_STORE = 'masterDrawingsStore'; 
const DB_VERSION = 6; 

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE);
      if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE);
      if (!db.objectStoreNames.contains(RECENTS_STORE)) db.createObjectStore(RECENTS_STORE, { keyPath: 'name' });
      if (!db.objectStoreNames.contains(WATCHLIST_STORE)) db.createObjectStore(WATCHLIST_STORE, { keyPath: 'symbol' });
      
      if (db.objectStoreNames.contains('chartMeta')) {
        db.deleteObjectStore('chartMeta');
      }
      
      if (!db.objectStoreNames.contains(DRAWINGS_STORE)) {
        db.createObjectStore(DRAWINGS_STORE);
      }
    };
  });
};

export const saveExplorerHandle = async (handle: any) => {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readwrite');
    const store = tx.objectStore(HANDLE_STORE);
    const req = store.put(handle, 'explorerRoot');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

export const getExplorerHandle = async () => {
  const db = await initDB();
  return new Promise<any>((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readonly');
    const store = tx.objectStore(HANDLE_STORE);
    const req = store.get('explorerRoot');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export const clearExplorerHandle = async () => {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readwrite');
    const store = tx.objectStore(HANDLE_STORE);
    const req = store.delete('explorerRoot');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

export const saveDatabaseHandle = async (handle: any) => {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readwrite');
    const store = tx.objectStore(HANDLE_STORE);
    const req = store.put(handle, DB_HANDLE_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

export const getDatabaseHandle = async () => {
  const db = await initDB();
  return new Promise<any>((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readonly');
    const store = tx.objectStore(HANDLE_STORE);
    const req = store.get(DB_HANDLE_KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export const clearDatabaseHandle = async () => {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readwrite');
    const store = tx.objectStore(HANDLE_STORE);
    const req = store.delete(DB_HANDLE_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

export const saveAppState = async (state: any) => {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STATE_STORE, 'readwrite');
    const store = tx.objectStore(STATE_STORE);
    const req = store.put(state, 'latest');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

export const loadAppState = async () => {
  const db = await initDB();
  return new Promise<any>((resolve, reject) => {
    const tx = db.transaction(STATE_STORE, 'readonly');
    const store = tx.objectStore(STATE_STORE);
    const req = store.get('latest');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export const addRecentFile = async (handle: any) => {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(RECENTS_STORE, 'readwrite');
    const store = tx.objectStore(RECENTS_STORE);
    
    if (!handle || typeof handle.name !== 'string') {
        resolve();
        return;
    }

    const record = {
        name: handle.name,
        handle: handle,
        lastAccessed: Date.now()
    };

    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

export const getRecentFiles = async () => {
  const db = await initDB();
  return new Promise<any[]>((resolve, reject) => {
    const tx = db.transaction(RECENTS_STORE, 'readonly');
    const store = tx.objectStore(RECENTS_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
        const results = req.result || [];
        results.sort((a: any, b: any) => b.lastAccessed - a.lastAccessed);
        resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
};

export const addToWatchlist = async (symbol: string) => {
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(WATCHLIST_STORE, 'readwrite');
        const store = tx.objectStore(WATCHLIST_STORE);
        const item = { symbol, addedAt: Date.now() };
        const req = store.put(item);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

export const removeFromWatchlist = async (symbol: string) => {
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(WATCHLIST_STORE, 'readwrite');
        const store = tx.objectStore(WATCHLIST_STORE);
        const req = store.delete(symbol);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

export const getWatchlist = async () => {
    const db = await initDB();
    return new Promise<any[]>((resolve, reject) => {
        const tx = db.transaction(WATCHLIST_STORE, 'readonly');
        const store = tx.objectStore(WATCHLIST_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
            const results = req.result || [];
            results.sort((a: any, b: any) => a.addedAt - b.addedAt);
            resolve(results);
        };
        req.onerror = () => reject(req.error);
    });
};

export const saveMasterDrawingsStore = async (data: any) => {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DRAWINGS_STORE, 'readwrite');
    const store = tx.objectStore(DRAWINGS_STORE);
    const req = store.put(data, 'master'); 
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

export const loadMasterDrawingsStore = async () => {
  const db = await initDB();
  return new Promise<any>((resolve, reject) => {
    const tx = db.transaction(DRAWINGS_STORE, 'readonly');
    const store = tx.objectStore(DRAWINGS_STORE);
    const req = store.get('master');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export const saveChartMeta = async (chartState: ChartState) => {
  const masterStore = (await loadMasterDrawingsStore()) || {};
  masterStore[chartState.sourceId] = chartState;
  await saveMasterDrawingsStore(masterStore);
};

export const deleteChartMeta = async (sourceId: string) => {
  const masterStore = (await loadMasterDrawingsStore()) || {};
  delete masterStore[sourceId];
  await saveMasterDrawingsStore(masterStore);
};

export const saveUILayout = async (layout: any) => {
  const electron = (window as any).electronAPI;
  if (electron && electron.saveSettings) {
      await electron.saveSettings('ui_layout.json', layout);
  } else {
      localStorage.setItem('redpill_ui_layout', JSON.stringify(layout));
  }
};

export const loadUILayout = async () => {
  const electron = (window as any).electronAPI;
  if (electron && electron.loadSettings) {
      const res = await electron.loadSettings('ui_layout.json');
      if (res.success && res.data) return res.data;
  }
  const local = localStorage.getItem('redpill_ui_layout');
  return local ? JSON.parse(local) : null;
};

export const saveStickyNotesWeb = async (notes: any[]) => {
    localStorage.setItem('redpill_sticky_notes', JSON.stringify(notes));
};

export const loadStickyNotesWeb = async () => {
    const data = localStorage.getItem('redpill_sticky_notes');
    return data ? JSON.parse(data) : [];
};

export const saveDevLogs = async (logs: any[]) => {
  const electron = (window as any).electronAPI;
  if (electron && electron.saveSettings) {
      await electron.saveSettings('dev_logs.json', logs);
  } else {
      localStorage.setItem('redpill_dev_system_logs', JSON.stringify(logs));
  }
};

export const loadDevLogs = async () => {
  const electron = (window as any).electronAPI;
  if (electron && electron.loadSettings) {
      const res = await electron.loadSettings('dev_logs.json');
      if (res.success && res.data) return res.data;
  }
  const local = localStorage.getItem('redpill_dev_system_logs');
  return local ? JSON.parse(local) : null;
};

export const saveChangelog = async (data: any) => {
  localStorage.setItem('app_changelog_data', typeof data === 'string' ? data : JSON.stringify(data));
};

export const loadChangelog = async () => {
  const local = localStorage.getItem('app_changelog_data');
  return local || null;
};