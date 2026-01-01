
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let watcher = null;

// --- INTERNAL LIBRARY STORAGE (BOOT CACHE) ---
let internalLibraryStorage = [];

const createWindow = () => {
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
      preload: path.join(__dirname, 'preload.js')
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
    // Universal Path Logic: Use userData/database
    // This ensures write access in packaged apps (Fixes Hide & Lock issues)
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'database');
    
    // Create if Missing
    if (!fs.existsSync(dbPath)) {
        try {
            fs.mkdirSync(dbPath, { recursive: true });
            console.log(`Created internal database at: ${dbPath}`);
        } catch (e) {
            console.error("Could not create database folder:", e);
        }
    }
    
    return dbPath;
};

// --- BOOT SCAN FUNCTION ---
const runBootScan = () => {
    console.log('Running Boot Scan on internal database...');
    const dbPath = resolveDatabasePath();
    console.log(`Scanning path: ${dbPath}`);
    const results = [];

    const scanDir = (dir) => {
        try {
            const list = fs.readdirSync(dir);
            list.forEach((file) => {
                const fullPath = path.join(dir, file);
                try {
                    const stat = fs.statSync(fullPath);
                    if (stat && stat.isDirectory()) {
                        scanDir(fullPath);
                    } else {
                        if (file.toLowerCase().endsWith('.csv') || file.toLowerCase().endsWith('.txt')) {
                            const parentDir = path.basename(dir);
                            results.push({ 
                                name: file, 
                                path: fullPath, 
                                kind: 'file',
                                folder: parentDir
                            });
                        }
                    }
                } catch (e) {
                    // Ignore access errors
                }
            });
        } catch (e) {
            console.error(`Error scanning directory ${dir}:`, e);
        }
    };

    if (fs.existsSync(dbPath)) {
        scanDir(dbPath);
    }
    
    internalLibraryStorage = results;
    console.log(`Boot Scan Complete. Indexed ${internalLibraryStorage.length} assets.`);
    return internalLibraryStorage;
};

// --- INTERNAL HANDLERS ---

// GET: Returns cached list immediately (Auto-Send on Request)
ipcMain.handle('internal:get-library', async () => {
    // If empty, try one scan just in case boot failed or was empty
    if (internalLibraryStorage.length === 0) {
        return runBootScan();
    }
    return internalLibraryStorage;
});

// SCAN: Forces a re-scan (Manual Refresh)
ipcMain.handle('internal:scan-database', async () => {
    return runBootScan();
});

// --- FILE WATCHER (Legacy/Explorer) ---
ipcMain.handle('file:watch-folder', async (event, folderPath) => {
  if (watcher) {
    watcher.close();
    watcher = null;
  }

  try {
    if (!fs.existsSync(folderPath)) throw new Error("Folder does not exist");

    const getFilesRecursive = (dir) => {
      let results = [];
      const list = fs.readdirSync(dir);
      list.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(getFilesRecursive(fullPath));
        } else {
          if (file.endsWith('.csv') || file.endsWith('.txt')) {
             results.push({ name: file, path: fullPath, kind: 'file' });
          }
        }
      });
      return results;
    };

    // Initial Scan
    const initialFiles = getFilesRecursive(folderPath);

    // Setup Watcher
    watcher = fs.watch(folderPath, { recursive: true }, (eventType, filename) => {
      if (filename && (filename.endsWith('.csv') || filename.endsWith('.txt'))) {
        if (mainWindow) {
           mainWindow.webContents.send('folder-changed', getFilesRecursive(folderPath));
        }
      }
    });

    return initialFiles;
  } catch (e) {
    console.error("Watcher error:", e);
    throw e;
  }
});

ipcMain.handle('file:unwatch', () => {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
});

// --- FILE READER ---
ipcMain.handle('file:read-chunk', async (event, filePath, start, length) => {
  validatePath(filePath);
  return new Promise((resolve, reject) => {
    fs.open(filePath, 'r', (err, fd) => {
      if (err) return reject(err);
      const buffer = Buffer.alloc(length);
      fs.read(fd, buffer, 0, length, start, (err, bytesRead, buffer) => {
        fs.close(fd, () => {});
        if (err) return reject(err);
        resolve(buffer.toString('utf8', 0, bytesRead)); 
      });
    });
  });
});

ipcMain.handle('file:stat', async (event, filePath) => {
    try {
        const stats = fs.statSync(filePath);
        return { size: stats.size, mtime: stats.mtimeMs, exists: true };
    } catch (e) {
        return { exists: false, size: 0 };
    }
});

// --- METADATA ---
ipcMain.handle('meta:save', async (event, sourcePath, data) => {
  try {
    validatePath(sourcePath);
    const metaPath = sourcePath + '.meta.json';
    fs.writeFileSync(metaPath, JSON.stringify(data, null, 2));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('meta:load', async (event, sourcePath) => {
  try {
    validatePath(sourcePath);
    const metaPath = sourcePath + '.meta.json';
    if (fs.existsSync(metaPath)) {
      const raw = fs.readFileSync(metaPath, 'utf8');
      return { success: true, data: JSON.parse(raw) };
    }
    return { success: false, error: 'No metadata file' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('meta:delete', async (event, sourcePath) => {
  try {
    validatePath(sourcePath);
    const metaPath = sourcePath + '.meta.json';
    if (fs.existsSync(metaPath)) {
        fs.unlinkSync(metaPath);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// --- TRADE PERSISTENCE ---
const getTradesPath = () => path.join(app.getPath('userData'), 'trades.json');

ipcMain.handle('trade:save', async (event, trade) => {
    try {
        const dbPath = getTradesPath();
        let trades = [];
        if (fs.existsSync(dbPath)) {
            const raw = fs.readFileSync(dbPath, 'utf8');
            try { trades = JSON.parse(raw); } catch (e) {}
        }
        trades.push(trade);
        fs.writeFileSync(dbPath, JSON.stringify(trades, null, 2));
        return { success: true, trade };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('trade:get-by-source', async (event, sourceId) => {
    try {
        const dbPath = getTradesPath();
        if (!fs.existsSync(dbPath)) return [];
        const raw = fs.readFileSync(dbPath, 'utf8');
        const trades = JSON.parse(raw);
        return trades.filter(t => t.sourceId === sourceId);
    } catch (e) {
        return [];
    }
});

// --- SYSTEM HANDLES ---

// Returns the full path string (for watcher)
ipcMain.handle('app:get-default-database', async () => {
    return resolveDatabasePath();
});

ipcMain.handle('get-folders', async () => {
    const dbPath = resolveDatabasePath();
    try {
        const items = fs.readdirSync(dbPath);
        // Return folders as strings
        return items.filter(item => {
            try {
                return fs.statSync(path.join(dbPath, item)).isDirectory();
            } catch { return false; }
        });
    } catch (e) {
        console.error("Error reading database folders:", e);
        return [];
    }
});

ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (canceled) return null;
  return { path: filePaths[0], name: path.basename(filePaths[0]) };
});

// --- DRAWING STATE PERSISTENCE ---
// Saves state to settings.json inside the new userData/database folder
const getSettingsPath = () => path.join(resolveDatabasePath(), 'settings.json');

const updateDrawingsState = (key, value) => {
    try {
        const statePath = getSettingsPath();
        let state = {};
        if (fs.existsSync(statePath)) {
            try {
                state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
            } catch (e) { /* ignore corrupt */ }
        }
        
        state[key] = value;
        state.lastUpdated = Date.now();
        
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    } catch (e) {
        console.error("Failed to save settings:", e);
    }
};

ipcMain.handle('drawings:get-state', async () => {
    try {
        const statePath = getSettingsPath();
        if (fs.existsSync(statePath)) {
            return JSON.parse(fs.readFileSync(statePath, 'utf8'));
        }
        return {};
    } catch (e) {
        return {};
    }
});

ipcMain.on('drawings:hide', (event, arg) => {
    updateDrawingsState('areHidden', arg);
});

ipcMain.on('drawings:lock', (event, arg) => {
    updateDrawingsState('areLocked', arg);
});

ipcMain.on('drawings:delete', (event, arg) => {
    updateDrawingsState('lastDeleteAction', Date.now());
});

app.whenReady().then(() => {
  // --- THE BOOT SCAN ---
  // Ensure database is scanned immediately upon startup using the resolved path
  runBootScan();
  
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
