const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let watcher = null;

// --- INTERNAL LIBRARY STORAGE (BOOT CACHE) ---
let internalLibraryStorage = [];

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
    // Hardcode path to 'Assets' folder at the project root
    let assetsPath;

    if (app.isPackaged) {
        // In a packaged app, __dirname is .../app_root/dist/
        // So we go up to the app root and look for 'Assets'
        assetsPath = path.join(app.getAppPath(), 'Assets');
    } else {
        // In development, __dirname is .../project_root/electron
        // So we go up one level to the project root and then to 'Assets'
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
                        console.log(`[DIAGNOSTIC]    - Relative path: '${folderName}'`);
                        
                        // START OF USER REQUESTED CHANGES
                        console.log(`Checking: ${file} in folder: ${folderName}`);
                        // END OF USER REQUESTED CHANGES

                        let originalFolderName = folderName;
                        if (folderName) {
                            // START OF USER REQUESTED CHANGES
                            console.log(`Original Path: ${folderName}`);
                            // END OF USER REQUESTED CHANGES
                            // folderName = folderName.split(path.sep)[0];
                            // START OF USER REQUESTED CHANGES
                            console.log(`Truncated Path: ${folderName}`);
                            // END OF USER REQUESTED CHANGES
                        }
                        console.log(`[DIAGNOSTIC]    - Processed folder name (blind spot): '${folderName}' (Original was: '${originalFolderName}')`);

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

// --- Sidecar Metadata Persistence ---
const getMetaPath = (filePath) => `${filePath}.meta.json`;

ipcMain.handle('meta:load', async (event, filePath) => {
    try {
        validatePath(filePath);
        const metaPath = getMetaPath(filePath);
        if (fs.existsSync(metaPath)) {
            const data = fs.readFileSync(metaPath, 'utf8');
            return { success: true, data: JSON.parse(data) };
        }
        return { success: true, data: null };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('meta:save', async (event, filePath, data) => {
    try {
        validatePath(filePath);
        const metaPath = getMetaPath(filePath);
        fs.writeFileSync(metaPath, JSON.stringify(data, null, 2));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('meta:delete', async (event, filePath) => {
    try {
        validatePath(filePath);
        const metaPath = getMetaPath(filePath);
        if (fs.existsSync(metaPath)) {
            fs.unlinkSync(metaPath);
        }
        return { success: true };
    } catch (e) {
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
  runBootScan();
  createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });