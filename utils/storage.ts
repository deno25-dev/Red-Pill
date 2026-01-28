import { ChartState } from '../types';

const DB_NAME = 'RedPillChartingDB';
const HANDLE_STORE = 'handles'; // Used for Data Explorer (Last location)
const DB_HANDLE_KEY = 'databaseRoot'; // Key for the specific Database folder
const STATE_STORE = 'appState';
const RECENTS_STORE = 'recentFiles';
const WATCHLIST_STORE = 'watchlist';
const DRAWINGS_STORE = 'masterDrawingsStore'; // NEW: Single store for all drawings
const DB_VERSION = 6; // Incremented version

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
      
      // DEPRECATE old store
      if (db.objectStoreNames.contains('chartMeta')) {
        db.deleteObjectStore('chartMeta');
      }
      
      // NEW Master Store
      if (!db.objectStoreNames.contains(DRAWINGS_STORE)) {
        db.createObjectStore(DRAWINGS_STORE);
      }
    };
  });
};

// --- Data Explorer Persistence (Last Open Folder) ---

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

// --- Database Persistence (Symbol Search Root) ---

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

// --- App State Persistence ---

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

// --- Recent Files Persistence ---

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

// --- Watchlist Persistence ---

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

// --- MASTER DRAWING STORE PERSISTENCE ---

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
