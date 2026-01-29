
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const v8 = require('v8');

// [TELEMETRY] Initialize Session Start Time
const sessionStartTime = Date.now();
const systemLogBuffer = [];
const MAX_SYSTEM_LOGS = 200;

const logSystemEvent = (eventName) => {
    const entry = { event: eventName, timestamp: Date.now() };
    systemLogBuffer.unshift(entry);
    if (systemLogBuffer.length > MAX_SYSTEM_LOGS) systemLogBuffer.pop();
    console.log(`[SYS_EVENT] ${eventName}`);
};

let mainWindow;
let watcher = null;

// --- CONFIGURATION ---
const IGNORED_DIRECTORIES = ['Database', '.git', 'node_modules', 'dist', 'build', 'release', 'src', 'src-tauri', 'public'];

// --- INTERNAL LIBRARY STORAGE (BOOT CACHE) ---
let internalLibraryStorage = [];

const createWindow = () => {
  // TASK 1: HARDEN PRELOAD PATH RESOLUTION
  // Explicitly resolve relative to this file
  const preloadPath = path.resolve(__dirname, 'preload.js');

  // --- TASK 2: DIAGNOSTIC PATH VERIFICATION ---
  console.log('================================================');
  console.log('[Bridge-Debug] Configuring Window...');
  console.log(`[Bridge-Debug] Environment: ${app.isPackaged ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`[Bridge-Debug] App Path: ${app.getAppPath()}`);
  console.log(`[Bridge-Debug] __dirname: ${__dirname}`);
  console.log(`[Bridge-Debug] Target Preload Path: ${preloadPath}`);
  console.log(`[Bridge-Debug] Preload Exists on Disk: ${fs.existsSync(preloadPath)}`);
  
  if (!fs.existsSync(preloadPath)) {
      console.error('[Bridge-Critical] ❌ Preload script NOT FOUND at target!');
  } else {
      console.log('[Bridge-Debug] ✅ Preload script found.');
  }
  console.log('================================================');

  logSystemEvent('WINDOW_CREATING');

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
      nodeIntegration: false, // SECURITY: Must be false for contextBridge
      contextIsolation: true, // SECURITY: Must be true for contextBridge
      sandbox: false,         // Disable sandbox to allow file system access in Main via IPC
      webSecurity: false,     // Allow local file loading (file://)
      preload: preloadPath    // Explicitly resolved path
    },
    autoHideMenuBar: true
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
  }
  
  mainWindow.once('ready-to-show', () => {
      logSystemEvent('WINDOW_READY');
  });
};

// --- VALIDATION ---
const validatePath = (filePath) => {
  if (!filePath || typeof filePath !== 'string') throw new Error("Invalid path");
  return true;
};

// --- PATH RESOLVERS ---

// 1. Assets (Market Data)
const resolveAssetsPath = () => {
    let assetsPath;
    if (app.isPackaged) {
        assetsPath = path.join(path.dirname(process.execPath), 'Assets');
    } else {
        assetsPath = path.join(__dirname, '..', 'Assets');
    }
    if (!fs.existsSync(assetsPath)) {
        try { fs.mkdirSync(assetsPath, { recursive: true }); } catch (e) {}
    }
    return assetsPath;
};

// 2. Database (Metadata Firewall - System Data)
const resolveDatabasePath = () => {
    const dbPath = path.join(app.getPath('userData'), 'Database');
    if (!fs.existsSync(dbPath)) {
        try { 
            fs.mkdirSync(dbPath, { recursive: true }); 
            // Subdirectories for organization
            fs.mkdirSync(path.join(dbPath, 'Layouts'), { recursive: true });
            fs.mkdirSync(path.join(dbPath, 'StickyNotes'), { recursive: true });
            fs.mkdirSync(path.join(dbPath, 'Trades'), { recursive: true });
        } catch (e) {
            console.error("Could not create Database folder structure:", e);
        }
    }
    return dbPath;
};

// --- BOOT SCAN FUNCTION (Assets Only) ---
const runBootScan = () => {
    const assetsPath = resolveAssetsPath();
    const results = [];
    logSystemEvent('BOOT_SCAN_START');

    const scanDir = (dir) => {
        try {
            const list = fs.readdirSync(dir);
            list.forEach((file) => {
                if (IGNORED_DIRECTORIES.includes(file)) return; // Firewall check

                const fullPath = path.join(dir, file);
                try {
                    const stat = fs.statSync(fullPath);
                    if (stat && stat.isDirectory()) {
                        scanDir(fullPath);
                    } else if (file.toLowerCase().endsWith('.csv') || file.toLowerCase().endsWith('.json')) {
                        let folderName = path.relative(assetsPath, dir);
                        results.push({
                            name: file,
                            path: fullPath,
                            kind: 'file',
                            folder: folderName || '.'
                        });
                    }
                } catch (e) {}
            });
        } catch (e) {}
    };

    if (fs.existsSync(assetsPath)) {
        scanDir(assetsPath);
    }
    
    logSystemEvent('BOOT_SCAN_COMPLETE');
    internalLibraryStorage = results;
    return internalLibraryStorage;
};

// --- IPC HANDLERS ---

ipcMain.handle('dialog:select-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (canceled) return null;
    return { path: filePaths[0], name: path.basename(filePaths[0]) };
});

ipcMain.handle('get-default-database-path', () => {
    // This refers to the Assets library path for the UI display
    return resolveAssetsPath();
});

ipcMain.handle('get-internal-library', async () => {
    return runBootScan();
});

ipcMain.handle('file:watch-folder', async (event, folderPath) => {
  if (watcher) { watcher.close(); watcher = null; }
  logSystemEvent('WATCH_FOLDER_START');
  
  try {
    const getFilesRecursive = (dir) => {
      let res = [];
      try {
          const list = fs.readdirSync(dir);
          list.forEach((file) => {
            if (IGNORED_DIRECTORIES.includes(file)) return; // Firewall check

            const fullPath = path.join(dir, file);
            try {
                const stat = fs.statSync(fullPath);
                if (stat && stat.isDirectory()) res = res.concat(getFilesRecursive(fullPath));
                else if (file.endsWith('.csv') || file.endsWith('.json')) res.push({ name: file, path: fullPath, kind: 'file' });
            } catch(e) {}
          });
      } catch(e) {}
      return res;
    };

    const initialFiles = getFilesRecursive(folderPath);
    
    watcher = fs.watch(folderPath, { recursive: true }, (eventType, filename) => {
      if (filename) {
          // Check ignore list on changed file/folder
          const parts = filename.split(path.sep);
          if (parts.some(p => IGNORED_DIRECTORIES.includes(p))) return;

          if (filename.endsWith('.csv') || filename.endsWith('.json')) {
            if (mainWindow) mainWindow.webContents.send('folder-changed', getFilesRecursive(folderPath));
          }
      }
    });
    return initialFiles;
  } catch (e) { throw e; }
});

ipcMain.handle('file:unwatch-folder', () => {
    if (watcher) {
        watcher.close();
        watcher = null;
        logSystemEvent('WATCH_FOLDER_STOP');
    }
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

ipcMain.handle('file:get-details', async (event, filePath) => {
    try {
        validatePath(filePath);
        const stats = fs.statSync(filePath);
        return { exists: true, size: stats.size };
    } catch (e) {
        return { exists: false, size: 0 };
    }
});

// --- PERSISTENCE (SYSTEM METADATA FIREWALL) ---

// Drawings
const getMasterDrawingsPath = () => path.join(resolveDatabasePath(), 'drawings_master.json');

ipcMain.handle('master-drawings:load', async () => {
    try {
        const dbPath = getMasterDrawingsPath();
        if (fs.existsSync(dbPath)) {
            const data = fs.readFileSync(dbPath, 'utf8');
            return { success: true, data: JSON.parse(data) };
        }
        return { success: true, data: {} };
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

ipcMain.handle('drawings:delete-all', async (event, sourceId) => {
    try {
        const dbPath = getMasterDrawingsPath();
        if (fs.existsSync(dbPath)) {
            const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
            if (data[sourceId]) {
                delete data[sourceId]; // Nuclear delete
                fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
            }
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Layouts
ipcMain.handle('layouts:save', async (event, layoutName, layoutData) => {
    try {
        const layoutsDir = path.join(resolveDatabasePath(), 'Layouts');
        const filePath = path.join(layoutsDir, `${layoutName}.json`);
        fs.writeFileSync(filePath, JSON.stringify(layoutData, null, 2));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('layouts:load', async (event, layoutName) => {
    try {
        const filePath = path.join(resolveDatabasePath(), 'Layouts', `${layoutName}.json`);
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return { success: true, data: JSON.parse(data) };
        }
        return { success: false, error: 'Layout not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('layouts:list', async () => {
    try {
        const layoutsDir = path.join(resolveDatabasePath(), 'Layouts');
        if (!fs.existsSync(layoutsDir)) return [];
        const files = fs.readdirSync(layoutsDir);
        return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
    } catch (e) {
        return [];
    }
});

// Trades
const getTradesDbPath = () => path.join(resolveDatabasePath(), 'Trades', 'trades_ledger.json');

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
        logSystemEvent('TRADE_SAVED');
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// --- TELEMETRY ---
ipcMain.handle('get-system-telemetry', async () => {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const heapStats = v8.getHeapStatistics();
    const dbPath = resolveDatabasePath();
    
    return {
        processInfo: {
            version: process.versions.electron,
            uptime: Math.floor(process.uptime()),
            pid: process.pid
        },
        resources: {
            memory: {
                rss: (mem.rss / 1024 / 1024).toFixed(2) + ' MB',
                heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2) + ' MB'
            },
            cpu: cpu,
            v8Heap: {
                used: (heapStats.used_heap_size / 1024 / 1024).toFixed(2) + ' MB'
            }
        },
        ioStatus: {
            connectionState: fs.existsSync(dbPath) ? 'Online' : 'Initializing',
            dbPath: dbPath
        },
        logBuffer: systemLogBuffer
    };
});

// --- APP LIFECYCLE ---

app.whenReady().then(() => {
  logSystemEvent('APP_READY');
  runBootScan();
  createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
