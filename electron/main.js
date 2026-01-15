
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let watcher = null;

// --- INTERNAL LIBRARY STORAGE (BOOT CACHE) ---
let internalLibraryStorage = [];

// --- STORAGE INITIALIZATION (Mandate 0.31) ---
const initializeDatabase = () => {
    const rootPath = app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');
    const dbPath = path.join(rootPath, 'Database');
    const subfolders = ['ObjectTree', 'Drawings', 'Workspaces', 'Settings'];

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

// --- Storage Handlers (Mandate 0.31) ---

ipcMain.handle('storage:save-object-tree', async (event, data) => {
    try {
        const root = app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');
        const p = path.join(root, 'Database', 'ObjectTree', 'tree_state.json');
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
        // Prevent writing to CSV even if frontend check failed
        if (symbol.toLowerCase().endsWith('.csv') || symbol.toLowerCase().endsWith('.txt')) {
            throw new Error("Safety Interlock: Cannot use source extension as persistence key");
        }

        const root = app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');
        // Sanitize symbol for safe filename (replace slashes, colons etc)
        const safeSymbol = symbol.replace(/[^a-z0-9_\-\.]/gi, '_');
        const p = path.join(root, 'Database', 'Drawings', `${safeSymbol}.json`);
        
        fs.writeFileSync(p, JSON.stringify(data, null, 2));
        return { success: true };
    } catch (e) {
        console.error("Failed to save Drawing:", e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('storage:load-drawing', async (event, symbol) => {
    try {
        const root = app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');
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

// --- Existing Handlers ---

ipcMain.handle('get-user-data-path', async () => {
    return app.getPath('userData');
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
        const root = app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');
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


// --- Trade Persistence ---
const getTradesDbPath = () => path.join(app.getPath('userData'), 'trades_db.json');

const readTradesDb = () => {
    const dbPath = getTradesDbPath();
    if (fs.existsSync(dbPath)) {
        try { return JSON.parse(fs.readFileSync(dbPath, 'utf8')); } 
        catch { return {}; }
    }
    return {};
};

const writeTradesDb = (data) => {
    const dbPath = getTradesDbPath();
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
};

ipcMain.handle('trades:get-by-source', async (event, sourceId) => {
    const db = readTradesDb();
    return db[sourceId] || [];
});

ipcMain.handle('trades:save', async (event, trade) => {
    try {
        const db = readTradesDb();
        if (!db[trade.sourceId]) db[trade.sourceId] = [];
        db[trade.sourceId].push(trade);
        writeTradesDb(db);
        return { success: true };
    } catch (e) {
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
