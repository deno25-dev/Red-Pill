
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let watcher = null;

// --- INTERNAL LIBRARY STORAGE (BOOT CACHE) ---
let internalLibraryStorage = [];

// --- ABSOLUTE PATH SOURCE OF TRUTH (Mandate 0.35.3A) ---
const getStorageRoot = () => path.join(app.getPath('userData'), 'RedPill_Storage');
const getAssetsDir = () => path.join(getStorageRoot(), 'Assets');
const getMetadataDir = () => path.join(getStorageRoot(), 'Database');

// --- STORAGE INITIALIZATION (Mandate 0.31) ---
const initializeDatabase = () => {
    const dbRoot = getStorageRoot();
    const assetsDir = getAssetsDir();
    const metadataDir = getMetadataDir();
    
    // Subfolders within Metadata
    // 'Workspaces' is deprecated and removed.
    const subfolders = ['ObjectTree', 'Drawings', 'Settings', 'Trades', 'Orders', 'StickyNotes', 'Layouts'];

    try {
        if (!fs.existsSync(dbRoot)) fs.mkdirSync(dbRoot, { recursive: true });
        if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
        if (!fs.existsSync(metadataDir)) fs.mkdirSync(metadataDir, { recursive: true });

        subfolders.forEach(sub => {
            const subPath = path.join(metadataDir, sub);
            if (!fs.existsSync(subPath)) fs.mkdirSync(subPath, { recursive: true });
        });
        
        console.log('[Storage] System initialized at:', dbRoot);
        console.log('[Storage] Assets Directory:', assetsDir);
        console.log('[Storage] Metadata Directory:', metadataDir);
    } catch (e) {
        console.error('[Storage] Failed to initialize database structure:', e);
    }
};

const createWindow = () => {
  const preloadPath = path.join(__dirname, 'preload.js');
  
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

  // Force DevTools in dev mode (Mandate 4 System Recovery)
  if (isDev) {
      mainWindow.webContents.openDevTools();
  }

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

// --- BOOT SCAN FUNCTION (Mandate 2 Data Engine) ---
const runBootScan = () => {
    const assetsPath = getAssetsDir();
    const results = [];
    console.log(`[Scanner] Starting strict scan in: ${assetsPath}`);

    // Mandate: Blacklist system folders just in case they appear in Assets (unlikely but safe)
    const BLACKLIST = ['Database', 'Metadata', 'Settings', 'StickyNotes'];

    const scanDir = (dir) => {
        try {
            const list = fs.readdirSync(dir);
            list.forEach((file) => {
                const fullPath = path.join(dir, file);
                try {
                    const stat = fs.statSync(fullPath);
                    if (stat && stat.isDirectory()) {
                        if (BLACKLIST.includes(file)) {
                            console.warn(`[Scanner] Skipping blacklisted directory: ${file}`);
                            return;
                        }
                        scanDir(fullPath);
                    } else {
                        // Mandate: File Extension Lock (Strictly .csv)
                        if (file.toLowerCase().endsWith('.csv')) {
                            let folderName = path.relative(assetsPath, dir);
                            
                            const resultObj = {
                                name: file,
                                path: fullPath,
                                kind: 'file',
                                folder: folderName || '.'
                            };
                            results.push(resultObj);
                        } else {
                            // Ignored (json, txt, etc)
                        }
                    }
                } catch (e) { 
                    console.error(`[Scanner] Error processing path: ${fullPath}`, e);
                }
            });
        } catch (e) { 
            console.error(`[Scanner] Error reading directory: ${dir}`, e);
        }
    };

    if (fs.existsSync(assetsPath)) {
        scanDir(assetsPath);
    }
    
    // Purge cache before setting new results (System Recovery)
    internalLibraryStorage = [];
    internalLibraryStorage = results;
    console.log(`[Scanner] Scan complete. Indexed ${results.length} market data files.`);
    return internalLibraryStorage;
};

// --- IPC HANDLERS ---

ipcMain.handle('get-storage-path', () => {
    return getStorageRoot();
});

// --- System Shell Handlers ---
ipcMain.handle('shell:open-folder', async (event, subpath) => {
    try {
        const root = getStorageRoot();
        const fullPath = subpath ? path.join(root, subpath) : root;
        const error = await shell.openPath(fullPath);
        if (error) {
            console.error('Failed to open path:', fullPath, error);
            return { success: false, error };
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// --- Storage Handlers ---

ipcMain.handle('storage:ensure-sticky-notes-dir', async () => {
    try {
        const stickyPath = path.join(getMetadataDir(), 'StickyNotes');
        if (!fs.existsSync(stickyPath)) fs.mkdirSync(stickyPath, { recursive: true });
        console.log('[Storage] Accessing Metadata at:', stickyPath);
        return { success: true, path: stickyPath };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('storage:save-object-tree', async (event, data) => {
    try {
        const dir = path.join(getMetadataDir(), 'ObjectTree');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const p = path.join(dir, 'tree_state.json');
        fs.writeFileSync(p, JSON.stringify(data, null, 2));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('storage:save-drawing', async (event, symbol, data) => {
    try {
        if (symbol.toLowerCase().endsWith('.csv') || symbol.toLowerCase().endsWith('.txt')) {
            throw new Error("Safety Interlock: Cannot use source extension as persistence key");
        }
        const dir = path.join(getMetadataDir(), 'Drawings');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const safeSymbol = symbol.replace(/[^a-z0-9_\-\.]/gi, '_');
        const p = path.join(dir, `${safeSymbol}.json`);
        fs.writeFileSync(p, JSON.stringify(data, null, 2));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('storage:load-drawing', async (event, symbol) => {
    try {
        const safeSymbol = symbol.replace(/[^a-z0-9_\-\.]/gi, '_');
        const p = path.join(getMetadataDir(), 'Drawings', `${safeSymbol}.json`);
        if (fs.existsSync(p)) {
            const data = fs.readFileSync(p, 'utf8');
            return { success: true, data: JSON.parse(data) };
        }
        return { success: true, data: null };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// --- SETTINGS STORAGE (UI LAYOUT ACTIVE STATE) ---
ipcMain.handle('storage:save-settings', async (event, filename, data) => {
    try {
        const dir = path.join(getMetadataDir(), 'Settings');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const p = path.join(dir, filename);
        fs.writeFileSync(p, JSON.stringify(data, null, 2));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('storage:load-settings', async (event, filename) => {
    try {
        const p = path.join(getMetadataDir(), 'Settings', filename);
        if (fs.existsSync(p)) {
            return { success: true, data: JSON.parse(fs.readFileSync(p, 'utf8')) };
        }
        return { success: true, data: null };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// --- LAYOUT MANAGER (SNAPSHOTS) ---
ipcMain.handle('storage:list-layouts', async () => {
    try {
        // FIX 45: Ensure path is 'Layouts', not 'Workspaces'
        const layoutsPath = path.join(getMetadataDir(), 'Layouts');
        console.log('[Storage] Accessing Metadata at:', layoutsPath);
        if (!fs.existsSync(layoutsPath)) {
            fs.mkdirSync(layoutsPath, { recursive: true });
            return { success: true, data: [] };
        }
        const files = fs.readdirSync(layoutsPath);
        const data = files
            .filter(f => f.endsWith('.json'))
            .map(f => ({
                filename: f,
                path: path.join(layoutsPath, f),
                updatedAt: fs.statSync(path.join(layoutsPath, f)).mtimeMs
            }))
            .sort((a, b) => b.updatedAt - a.updatedAt);
        return { success: true, data };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('storage:save-layout', async (event, filename, data) => {
    try {
        // FIX 45: Ensure path is 'Layouts', not 'Workspaces'
        const dir = path.join(getMetadataDir(), 'Layouts');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const p = path.join(dir, filename.endsWith('.json') ? filename : `${filename}.json`);
        fs.writeFileSync(p, JSON.stringify(data, null, 2));
        console.log('[Storage] Accessing Metadata at:', p);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('storage:load-layout', async (event, filename) => {
    try {
        // FIX 45: Ensure path is 'Layouts', not 'Workspaces'
        const p = path.join(getMetadataDir(), 'Layouts', filename.endsWith('.json') ? filename : `${filename}.json`);
        console.log('[Storage] Accessing Metadata at:', p);
        if (fs.existsSync(p)) {
            return { success: true, data: JSON.parse(fs.readFileSync(p, 'utf8')) };
        }
        return { success: false, error: 'File not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('storage:restore-layout', async (event, filename) => {
    try {
        // FIX 45: Ensure path is 'Layouts', not 'Workspaces'
        const source = path.join(getMetadataDir(), 'Layouts', filename);
        const dest = path.join(getMetadataDir(), 'Settings', 'ui_layout.json');
        if (!fs.existsSync(source)) throw new Error("Layout file not found in Database/Layouts");
        fs.copyFileSync(source, dest);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// --- STICKY NOTES PERSISTENCE ---
ipcMain.handle('storage:save-sticky-notes', async (event, notes) => {
    try {
        // FIX 45: Ensure path is 'StickyNotes', not 'Workspaces'
        const dir = path.join(getMetadataDir(), 'StickyNotes');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        // FIX 45: Ensure filename is 'sticky_notes.json'
        const p = path.join(dir, 'sticky_notes.json');
        fs.writeFileSync(p, JSON.stringify(notes, null, 2));
        console.log('[Storage] Accessing Metadata at:', p);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('storage:load-sticky-notes', async (event) => {
    try {
        // FIX 45: Ensure path is 'StickyNotes', not 'Workspaces'
        const p = path.join(getMetadataDir(), 'StickyNotes', 'sticky_notes.json');
        console.log('[Storage] Accessing Metadata at:', p);
        if (fs.existsSync(p)) {
            return { success: true, data: JSON.parse(fs.readFileSync(p, 'utf8')) };
        }
        return { success: true, data: [] };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// --- STICKY NOTES MANAGER ---
ipcMain.handle('storage:list-sticky-notes-directory', async () => {
    try {
        // FIX 45: Ensure path is 'StickyNotes'
        const dir = path.join(getMetadataDir(), 'StickyNotes');
        console.log('[Storage] Accessing Metadata at:', dir);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const files = fs.readdirSync(dir);
        const data = files
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const fullPath = path.join(dir, f);
                const stats = fs.statSync(fullPath);
                return {
                    filename: f,
                    path: fullPath,
                    updatedAt: stats.mtimeMs
                };
            })
            .sort((a, b) => b.updatedAt - a.updatedAt);
        return { success: true, data };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// --- METADATA MANAGEMENT ---
ipcMain.handle('storage:delete-metadata-file', async (event, category, filename) => {
    try {
        const folderName = category === 'layouts' ? 'Layouts' : (category === 'notes' ? 'StickyNotes' : category);
        const filePath = path.join(getMetadataDir(), folderName, filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return { success: true };
        }
        return { success: false, error: 'File not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('storage:load-metadata-file', async (event, category, filename) => {
    try {
        const folderName = category === 'layouts' ? 'Layouts' : (category === 'notes' ? 'StickyNotes' : category);
        const filePath = path.join(getMetadataDir(), folderName, filename);
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return { success: true, data: JSON.parse(data) };
        }
        return { success: false, error: 'File not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// --- Existing Handlers (Refitted to Absolute Paths) ---

ipcMain.handle('get-user-data-path', async () => {
    return app.getPath('userData');
});

ipcMain.handle('get-database-path', async () => {
    return getMetadataDir();
});

ipcMain.handle('get-internal-folders', async () => {
    return runBootScan();
});

ipcMain.handle('get-folders', async () => {
    const assetsPath = getAssetsDir();
    try {
        const items = fs.readdirSync(assetsPath);
        return items.filter(item => {
            try {
                return fs.statSync(path.join(assetsPath, item)).isDirectory();
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
      const BLACKLIST = ['Database', 'Metadata', 'Settings', 'StickyNotes'];
      
      list.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            if (!BLACKLIST.includes(file)) res = res.concat(getFilesRecursive(fullPath));
        }
        else if (file.toLowerCase().endsWith('.csv')) res.push({ name: file, path: fullPath, kind: 'file' });
      });
      return res;
    };
    const initialFiles = getFilesRecursive(folderPath);
    watcher = fs.watch(folderPath, { recursive: true }, (eventType, filename) => {
      if (filename && filename.toLowerCase().endsWith('.csv')) {
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
        const statePath = path.join(getMetadataDir(), 'drawings_state.json');
        if (fs.existsSync(statePath)) return JSON.parse(fs.readFileSync(statePath, 'utf8'));
        return {};
    } catch (e) { return {}; }
});

ipcMain.handle('drawings:delete-all', async (event, sourceId) => {
    try {
        const dir = path.join(getMetadataDir(), 'Drawings');
        const safeSymbol = sourceId.replace(/[^a-z0-9_\-\.]/gi, '_');
        const p = path.join(dir, `${safeSymbol}.json`);
        if (fs.existsSync(p)) fs.unlinkSync(p);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

const updateDrawingsState = (key, value) => {
    try {
        const statePath = path.join(getMetadataDir(), 'drawings_state.json');
        let state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
        state[key] = value;
        state.lastUpdated = Date.now();
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    } catch (e) {}
};

ipcMain.on('drawings:hide', (event, arg) => updateDrawingsState('areHidden', arg));
ipcMain.on('drawings:lock', (event, arg) => updateDrawingsState('areLocked', arg));
ipcMain.on('drawings:delete', (event, arg) => updateDrawingsState('lastDeleteAction', Date.now()));

ipcMain.handle('dialog:select-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (canceled) return null;
    return { path: filePaths[0], name: path.basename(filePaths[0]) };
});

ipcMain.handle('get-default-database-path', () => {
    return getAssetsDir();
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

// --- Master Drawing Store Persistence (LEGACY) ---
const getMasterDrawingsPath = () => path.join(getMetadataDir(), 'drawings_master.json');

ipcMain.handle('master-drawings:load', async () => {
    try {
        const dbPath = getMasterDrawingsPath();
        if (fs.existsSync(dbPath)) {
            const data = fs.readFileSync(dbPath, 'utf8');
            return { success: true, data: JSON.parse(data) };
        }
        return { success: true, data: null };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('master-drawings:save', async (event, data) => {
    try {
        const dbPath = getMasterDrawingsPath();
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// --- Trade Persistence ---
const getTradesLedgerPath = () => path.join(getMetadataDir(), 'Trades', 'ledger.json');

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
        return allTrades.filter(t => t.sourceId === sourceId);
    } catch (e) {
        return [];
    }
});

ipcMain.handle('trades:save', async (event, trade) => {
    try {
        appendTradeToLedger(trade);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('orders:sync', async (event, orders) => {
    try {
        const dir = path.join(getMetadataDir(), 'Orders');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const p = path.join(dir, 'orders_history.json');
        fs.writeFileSync(p, JSON.stringify(orders, null, 2));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// --- APP LIFECYCLE ---

app.whenReady().then(() => {
  initializeDatabase();
  runBootScan();
  console.log('[System] IPC Handlers synchronized with Database/StickyNotes and Database/Layouts.');
  createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
