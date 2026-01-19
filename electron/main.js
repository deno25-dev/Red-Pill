
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let watcher = null;

// --- INTERNAL LIBRARY STORAGE (BOOT CACHE) ---
let internalLibraryStorage = [];

// --- HELPER: ROOT PATH ---
const getRootPath = () => {
    return app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');
};

// --- STORAGE INITIALIZATION (Mandate 0.31) ---
const initializeDatabase = () => {
    const rootPath = getRootPath();
    const dbPath = path.join(rootPath, 'Database');
    // Mandate 0.33: Added 'Trades' to subfolders. Added 'Orders' for Mandate 5.0 Hybrid Persistence.
    const subfolders = ['ObjectTree', 'Drawings', 'Workspaces', 'Settings', 'Trades', 'Orders'];

    try {
        if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });

        subfolders.forEach(sub => {
            const subPath = path.join(dbPath, sub);
            if (!fs.existsSync(subPath)) fs.mkdirSync(subPath, { recursive: true });
        });
        console.log('[Storage] Database structure initialized at:', dbPath);
    } catch (e) {
        console.error('[Storage] Failed to initialize database structure:', e);
    }
};

const createWindow = () => {
  // --- DIAGNOSTIC PATH CHECK ---
  // Using __dirname assumes preload.js is in the same directory as main.js
  const preloadPath = path.join(__dirname, 'preload.js');
  
  console.log('\n\n=================================================');
  console.log('DIAGNOSTIC: PRELOAD SCRIPT LOCATION CHECK');
  console.log('Calculated Path:', preloadPath);
  console.log('File Exists on Disk:', fs.existsSync(preloadPath));
  console.log('=================================================\n\n');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0f172a',
    title: 'Red Pill Charting',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
        color: '#0f172a',
        symbolColor: '#94a3b8',
        height: 30
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
      preload: preloadPath 
    },
    autoHideMenuBar: true
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
  }
};

// --- VALIDATION ---
const validatePath = (filePath) => {
  if (!filePath || typeof filePath !== 'string') throw new Error("Invalid path");
  return true;
};

// --- PATH RESOLVER & FOLDER DISCOVERY ---
const resolveDatabasePath = () => {
    let assetsPath;

    if (app.isPackaged) {
        // For packaged app, 'Assets' folder is next to the executable
        assetsPath = path.join(path.dirname(process.execPath), 'Assets');
    } else {
        // In development, use the project root's 'Assets' folder
        assetsPath = path.join(__dirname, '..', 'Assets');
    }
    
    // Create the directory if it doesn't exist
    if (!fs.existsSync(assetsPath)) {
        try {
            fs.mkdirSync(assetsPath, { recursive: true });
        } catch (e) {
            console.error("Could not create Assets folder:", e);
        }
    }
    return assetsPath;
};

// --- BOOT SCAN FUNCTION ---
const runBootScan = () => {
    const dbPath = resolveDatabasePath();
    const results = [];
    console.log(`[DIAGNOSTIC] Starting scan in root: ${dbPath}`);

    const scanDir = (dir) => {
        try {
            const list = fs.readdirSync(dir);
            console.log(`[DIAGNOSTIC] Scanning directory: ${dir}`);
            list.forEach((file) => {
                const fullPath = path.join(dir, file);
                try {
                    const stat = fs.statSync(fullPath);
                    if (stat && stat.isDirectory()) {
                        console.log(`[DIAGNOSTIC] -> Found directory, recursing into: ${file}`);
                        scanDir(fullPath);
                    } else if (file.toLowerCase().endsWith('.csv') || file.toLowerCase().endsWith('.json')) {
                        console.log(`[DIAGNOSTIC] -> Found file: ${file}`);
                        let folderName = path.relative(dbPath, dir);
                        console.log(`[DIAGNOSTIC]    - Relative path for grouping: '${folderName}'`);

                        const resultObj = {
                            name: file,
                            path: fullPath,
                            kind: 'file',
                            folder: folderName || '.'
                        };

                        results.push(resultObj);
                        console.log(`[DIAGNOSTIC]    - Pushed to results:`, resultObj);
                    }
                } catch (e) { 
                    console.error(`[DIAGNOSTIC] Error processing path: ${fullPath}`, e);
                }
            });
        } catch (e) { 
            console.error(`[DIAGNOSTIC] Error reading directory: ${dir}`, e);
        }
    };

    if (fs.existsSync(dbPath)) {
        scanDir(dbPath);
    }
    
    console.log(`[DIAGNOSTIC] Scan complete. Found ${results.length} files.`);
    internalLibraryStorage = results;
    return internalLibraryStorage;
};

// --- IPC HANDLERS ---

// --- System Shell Handlers ---
ipcMain.handle('shell:open-folder', async (event, subpath) => {
    try {
        const root = getRootPath();
        const fullPath = subpath ? path.join(root, subpath) : root;
        // shell.openPath returns error string if failed, or empty string if success
        const error = await shell.openPath(fullPath);
        if (error) {
            console.error('Failed to open path:', fullPath, error);
            return { success: false, error };
        }
        return { success: true };
    } catch (e) {
        console.error('Exception opening path:', e);
        return { success: false, error: e.message };
    }
});

// --- Storage Handlers (Mandate 0.31) ---

ipcMain.handle('storage:save-object-tree', async (event, data) => {
    try {
        const root = getRootPath();
        const dir = path.join(root, 'Database', 'ObjectTree');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        const p = path.join(dir, 'tree_state.json');
        fs.writeFileSync(p, JSON.stringify(data, null, 2));
        return { success: true };
    } catch (e) {
        console.error("Failed to save Object Tree:", e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('storage:save-drawing', async (event, symbol, data) => {
    try {
        // MANDATE 0.30: Backend Safety Interlock
        if (symbol.toLowerCase().endsWith('.csv') || symbol.toLowerCase().endsWith('.txt')) {
            throw new Error("Safety Interlock: Cannot use source extension as persistence key");
        }

        const root = getRootPath();
        const dir = path.join(root, 'Database', 'Drawings');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const safeSymbol = symbol.replace(/[^a-z0-9_\-\.]/gi, '_');
        const p = path.join(dir, `${safeSymbol}.json`);
        
        fs.writeFileSync(p, JSON.stringify(data, null, 2));
        return { success: true };
    } catch (e) {
        console.error("Failed to save Drawing:", e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('storage:load-drawing', async (event, symbol) => {
    try {
        const root = getRootPath();
        const safeSymbol = symbol.replace(/[^a-z0-9_\-\.]/gi, '_');
        const p = path.join(root, 'Database', 'Drawings', `${safeSymbol}.json`);
        
        if (fs.existsSync(p)) {
            const data = fs.readFileSync(p, 'utf8');
            return { success: true, data: JSON.parse(data) };
        }
        return { success: true, data: null };
    } catch (e) {
        console.error("Failed to load Drawing:", e);
        return { success: false, error: e.message };
    }
});

// --- SETTINGS STORAGE (UI LAYOUT) ---
ipcMain.handle('storage:save-settings', async (event, filename, data) => {
    try {
        const root = getRootPath();
        const dir = path.join(root, 'Database', 'Settings');
        // Atomic Write Guarantee
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        const p = path.join(dir, filename);
        fs.writeFileSync(p, JSON.stringify(data, null, 2));
        return { success: true };
    } catch (e) {
        console.error(`Failed to save settings (${filename}):`, e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('storage:load-settings', async (event, filename) => {
    try {
        const root = getRootPath();
        const p = path.join(root, 'Database', 'Settings', filename);
        if (fs.existsSync(p)) {
            return { success: true, data: JSON.parse(fs.readFileSync(p, 'utf8')) };
        }
        return { success: true, data: null };
    } catch (e) {
        console.error(`Failed to load settings (${filename}):`, e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('storage:list-layouts', async () => {
    try {
        const rootPath = getRootPath();
        const settingsPath = path.join(rootPath, 'Database', 'Settings');
        
        if (!fs.existsSync(settingsPath)) {
            // If it doesn't exist, return empty, don't crash
            return { success: true, data: [] };
        }
        
        const files = fs.readdirSync(settingsPath);
        const data = files.filter(f => f.endsWith('.json')).map(f => ({
            filename: f,
            path: path.join(settingsPath, f)
        }));
        return { success: true, data };
    } catch (e) {
        console.error('Failed to list layouts:', e);
        return { success: false, error: e.message };
    }
});

// --- STICKY NOTES PERSISTENCE (Mandate 4.4) ---
ipcMain.handle('storage:save-sticky-notes', async (event, notes) => {
    try {
        const root = getRootPath();
        const dir = path.join(root, 'Database', 'Workspaces');
        // Atomic Write Guarantee
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        const p = path.join(dir, 'sticky_notes.json');
        fs.writeFileSync(p, JSON.stringify(notes, null, 2));
        return { success: true };
    } catch (e) {
        console.error("Failed to save sticky notes:", e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('storage:load-sticky-notes', async (event) => {
    try {
        const root = getRootPath();
        const p = path.join(root, 'Database', 'Workspaces', 'sticky_notes.json');
        if (fs.existsSync(p)) {
            return { success: true, data: JSON.parse(fs.readFileSync(p, 'utf8')) };
        }
        return { success: true, data: [] };
    } catch (e) {
        console.error("Failed to load sticky notes:", e);
        return { success: false, error: e.message };
    }
});

// --- Existing Handlers ---

ipcMain.handle('get-user-data-path', async () => {
    return app.getPath('userData');
});

ipcMain.handle('get-database-path', async () => {
    const root = getRootPath();
    return path.join(root, 'Database');
});

ipcMain.handle('get-internal-folders', async () => {
    return runBootScan();
});

ipcMain.handle('get-folders', async () => {
    const dbPath = resolveDatabasePath();
    try {
        const items = fs.readdirSync(dbPath);
        return items.filter(item => {
            try {
                return fs.statSync(path.join(dbPath, item)).isDirectory();
            } catch { return false; }
        });
    } catch (e) {
        return [];
    }
});

ipcMain.handle('file:watch-folder', async (event, folderPath) => {
  if (watcher) { watcher.close(); watcher = null; }
  try {
    const getFilesRecursive = (dir) => {
      let res = [];
      const list = fs.readdirSync(dir);
      list.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) res = res.concat(getFilesRecursive(fullPath));
        else if (file.endsWith('.csv') || file.endsWith('.json')) res.push({ name: file, path: fullPath, kind: 'file' });
      });
      return res;
    };
    const initialFiles = getFilesRecursive(folderPath);
    watcher = fs.watch(folderPath, { recursive: true }, (eventType, filename) => {
      if (filename && (filename.endsWith('.csv') || filename.endsWith('.json'))) {
        if (mainWindow) mainWindow.webContents.send('folder-changed', getFilesRecursive(folderPath));
      }
    });
    return initialFiles;
  } catch (e) { throw e; }
});

ipcMain.handle('file:read-chunk', async (event, filePath, start, length) => {
  return new Promise((resolve, reject) => {
    fs.open(filePath, 'r', (err, fd) => {
      if (err) return reject(err);
      const buffer = Buffer.alloc(length);
      fs.read(fd, buffer, 0, length, start, (err, bytesRead, b) => {
        fs.close(fd, () => {});
        if (err) return reject(err);
        resolve(b.toString('utf8', 0, bytesRead)); 
      });
    });
  });
});

ipcMain.handle('drawings:get-state', async () => {
    try {
        const statePath = path.join(resolveDatabasePath(), 'drawings_state.json');
        if (fs.existsSync(statePath)) return JSON.parse(fs.readFileSync(statePath, 'utf8'));
        return {};
    } catch (e) { return {}; }
});

ipcMain.handle('drawings:delete-all', async (event, sourceId) => {
    try {
        const root = getRootPath();
        const safeSymbol = sourceId.replace(/[^a-z0-9_\-\.]/gi, '_');
        const p = path.join(root, 'Database', 'Drawings', `${safeSymbol}.json`);
        
        if (fs.existsSync(p)) {
            // "Nuclear" delete: Remove the file entirely
            fs.unlinkSync(p);
        }
        return { success: true };
    } catch (e) {
        console.error("Failed to delete all drawings:", e);
        return { success: false, error: e.message };
    }
});

const updateDrawingsState = (key, value) => {
    try {
        const statePath = path.join(resolveDatabasePath(), 'drawings_state.json');
        let state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
        state[key] = value;
        state.lastUpdated = Date.now();
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    } catch (e) {}
};

ipcMain.on('drawings:hide', (event, arg) => updateDrawingsState('areHidden', arg));
ipcMain.on('drawings:lock', (event, arg) => updateDrawingsState('areLocked', arg));
ipcMain.on('drawings:delete', (event, arg) => updateDrawingsState('lastDeleteAction', Date.now()));


// --- NEWLY IMPLEMENTED HANDLERS ---

ipcMain.handle('dialog:select-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (canceled) return null;
    return { path: filePaths[0], name: path.basename(filePaths[0]) };
});

ipcMain.handle('get-default-database-path', () => {
    return resolveDatabasePath();
});

ipcMain.handle('file:unwatch-folder', () => {
    if (watcher) {
        watcher.close();
        watcher = null;
    }
});

ipcMain.handle('file:get-details', async (event, filePath) => {
    try {
        validatePath(filePath);
        const stats = fs.statSync(filePath);
        return { exists: true, size: stats.size };
    } catch (e) {
        return { exists: false, size: 0 };
    }
});

// --- Master Drawing Store Persistence (LEGACY - Kept for fallback) ---
const getMasterDrawingsPath = () => path.join(app.getPath('userData'), 'drawings_master.json');

ipcMain.handle('master-drawings:load', async () => {
    try {
        const dbPath = getMasterDrawingsPath();
        if (fs.existsSync(dbPath)) {
            const data = fs.readFileSync(dbPath, 'utf8');
            return { success: true, data: JSON.parse(data) };
        }
        return { success: true, data: null }; // No file is not an error
    } catch (e) {
        console.error("Failed to load master drawings:", e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('master-drawings:save', async (event, data) => {
    try {
        const dbPath = getMasterDrawingsPath();
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
        return { success: true };
    } catch (e) {
        console.error("Failed to save master drawings:", e);
        return { success: false, error: e.message };
    }
});


// --- Trade Persistence (Mandate 0.33) ---
const getTradesLedgerPath = () => {
    const rootPath = getRootPath();
    return path.join(rootPath, 'Database', 'Trades', 'ledger.json');
};

const readTradesLedger = () => {
    const dbPath = getTradesLedgerPath();
    if (fs.existsSync(dbPath)) {
        try { 
            const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
            return Array.isArray(data) ? data : []; 
        } 
        catch { return []; }
    }
    return [];
};

const appendTradeToLedger = (trade) => {
    const dbPath = getTradesLedgerPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    let trades = readTradesLedger();
    trades.push(trade);
    fs.writeFileSync(dbPath, JSON.stringify(trades, null, 2));
};

ipcMain.handle('trades:get-by-source', async (event, sourceId) => {
    try {
        const allTrades = readTradesLedger();
        // Filter trades for the specific chart context (CSV source)
        return allTrades.filter(t => t.sourceId === sourceId);
    } catch (e) {
        console.error("Error reading trades:", e);
        return [];
    }
});

ipcMain.handle('trades:save', async (event, trade) => {
    try {
        appendTradeToLedger(trade);
        return { success: true };
    } catch (e) {
        console.error("Error saving trade:", e);
        return { success: false, error: e.message };
    }
});

// --- GLOBAL ORDERS SYNC (Mandate 5.0) ---
ipcMain.handle('orders:sync', async (event, orders) => {
    try {
        const root = getRootPath();
        const dir = path.join(root, 'Database', 'Orders');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        const p = path.join(dir, 'orders_history.json');
        fs.writeFileSync(p, JSON.stringify(orders, null, 2));
        return { success: true };
    } catch (e) {
        console.error("Failed to sync orders:", e);
        return { success: false, error: e.message };
    }
});

// --- APP LIFECYCLE ---

app.whenReady().then(() => {
  initializeDatabase();
  runBootScan();
  createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
