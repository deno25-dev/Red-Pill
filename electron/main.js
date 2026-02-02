
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const v8 = require('v8');
const sqlite3 = require('sqlite3').verbose();

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
let db = null;

// --- CONFIGURATION ---
const IGNORED_DIRECTORIES = ['Database', '.git', 'node_modules', 'dist', 'build', 'release', 'src', 'src-tauri', 'public'];

// --- INTERNAL LIBRARY STORAGE (BOOT CACHE) ---
let internalLibraryStorage = [];

// --- DATABASE SETUP ---
const setupDatabase = () => {
    const userDataPath = app.getPath('userData');
    const dbFolder = path.join(userDataPath, 'RedPill');
    const dbPath = path.join(dbFolder, 'master.db');

    if (!fs.existsSync(dbFolder)) {
        try {
            fs.mkdirSync(dbFolder, { recursive: true });
        } catch (e) {
            console.error('Failed to create database directory:', e);
            logSystemEvent('DB_DIR_CREATE_FAILED');
            return;
        }
    }

    // Initialize Database Asynchronously
    db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('Database initialization failed:', err);
            logSystemEvent('DB_INIT_FAILED');
        } else {
            logSystemEvent('DB_CONNECTED');
            initializeTables();
        }
    });
};

const initializeTables = () => {
    db.serialize(() => {
        db.run(`
            CREATE TABLE IF NOT EXISTS drawings (
                symbol TEXT PRIMARY KEY,
                data TEXT
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS trades (
                id TEXT PRIMARY KEY,
                sourceId TEXT,
                data TEXT,
                timestamp INTEGER
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `, (err) => {
            if (!err) {
                logSystemEvent('DB_TABLES_READY');
                runMigration();
            }
        });
    });
};

const runMigration = () => {
    // Migration: Import old JSON flat-files if they exist
    try {
        const oldDrawingsPath = path.join(app.getPath('userData'), 'Database', 'drawings_master.json');
        
        if (fs.existsSync(oldDrawingsPath)) {
            console.log('Migrating legacy drawings...');
            const raw = fs.readFileSync(oldDrawingsPath, 'utf8');
            const data = JSON.parse(raw);
            
            db.serialize(() => {
                db.run("BEGIN TRANSACTION");
                const stmt = db.prepare('INSERT OR REPLACE INTO drawings (symbol, data) VALUES (?, ?)');
                
                for (const [symbol, content] of Object.entries(data)) {
                    stmt.run(symbol, JSON.stringify(content));
                }
                
                stmt.finalize();
                db.run("COMMIT", (err) => {
                    if (err) {
                        console.error('Migration commit failed:', err);
                        logSystemEvent('MIGRATION_FAILED');
                    } else {
                        // Rename old file to avoid re-migration
                        try {
                            fs.renameSync(oldDrawingsPath, oldDrawingsPath + '.bak');
                            logSystemEvent('MIGRATION_COMPLETE');
                        } catch (e) {
                            console.error('Failed to rename migration file:', e);
                        }
                    }
                });
            });
        }
    } catch (error) {
        console.error('Migration logic error:', error);
        logSystemEvent('MIGRATION_FAILED');
    }
};

const createWindow = () => {
  const potentialPaths = [
    path.join(__dirname, 'preload.js'),
    path.join(process.cwd(), 'electron', 'preload.js'),
    path.join(app.getAppPath(), 'electron', 'preload.js'),
    path.join(app.getAppPath(), 'dist-electron', 'preload.js')
  ];

  let resolvedPath = null;
  for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
      resolvedPath = p;
      break;
    }
  }

  if (!resolvedPath) {
      console.error('[Bridge-Critical] ❌ Preload script NOT FOUND in candidate paths.');
      resolvedPath = path.join(__dirname, 'preload.js'); 
  }

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
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
      preload: resolvedPath
    },
    autoHideMenuBar: true
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    const startUrl = 'http://localhost:5173';
    const loadWithRetry = () => {
      mainWindow.loadURL(startUrl).catch((e) => {
        setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                loadWithRetry();
            }
        }, 1000);
      });
    };
    loadWithRetry();
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
  }
  
  mainWindow.once('ready-to-show', () => {
      logSystemEvent('WINDOW_READY');
  });
};

// --- PATH RESOLVERS ---
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

// --- BOOT SCAN FUNCTION (Assets Only) ---
const runBootScan = () => {
    const assetsPath = resolveAssetsPath();
    const results = [];
    logSystemEvent('BOOT_SCAN_START');

    const scanDir = (dir) => {
        try {
            const list = fs.readdirSync(dir);
            list.forEach((file) => {
                if (IGNORED_DIRECTORIES.includes(file)) return;

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

ipcMain.on('log:send', (event, category, message, data) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${category}] ${message}`, data ? JSON.stringify(data) : '');
});

ipcMain.handle('dialog:select-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (canceled) return null;
    return { path: filePaths[0], name: path.basename(filePaths[0]) };
});

ipcMain.handle('get-default-database-path', () => {
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
            if (IGNORED_DIRECTORIES.includes(file)) return;

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
        if (!filePath || typeof filePath !== 'string') throw new Error("Invalid path");
        const stats = fs.statSync(filePath);
        return { exists: true, size: stats.size };
    } catch (e) {
        return { exists: false, size: 0 };
    }
});

// --- PERSISTENCE (SQLite3 Asynchronous) ---

// 1. Drawings
ipcMain.handle('drawings:get-state', async (event, symbol) => {
    return new Promise((resolve) => {
        db.get('SELECT data FROM drawings WHERE symbol = ?', [symbol], (err, row) => {
            if (err) {
                console.error('drawings:get-state error:', err);
                resolve(null);
            } else {
                if (row) {
                    try {
                        resolve(JSON.parse(row.data));
                    } catch (e) {
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            }
        });
    });
});

ipcMain.handle('drawings:save-state', async (event, symbol, data) => {
    return new Promise((resolve) => {
        db.run('INSERT OR REPLACE INTO drawings (symbol, data) VALUES (?, ?)', [symbol, JSON.stringify(data)], (err) => {
            if (err) {
                console.error('drawings:save-state error:', err);
                resolve({ success: false, error: err.message });
            } else {
                resolve({ success: true });
            }
        });
    });
});

ipcMain.handle('drawings:delete-all', async (event, sourceId) => {
    return new Promise((resolve) => {
        db.run('DELETE FROM drawings WHERE symbol = ?', [sourceId], (err) => {
            if (err) {
                resolve({ success: false, error: err.message });
            } else {
                resolve({ success: true });
            }
        });
    });
});

// Legacy handler for compatibility during transition (Deprecated)
ipcMain.handle('master-drawings:load', async () => {
    return new Promise((resolve) => {
        db.all('SELECT symbol, data FROM drawings', [], (err, rows) => {
            if (err) {
                resolve({ success: false, error: err.message });
            } else {
                const map = {};
                try {
                    rows.forEach(row => {
                        map[row.symbol] = JSON.parse(row.data);
                    });
                    resolve({ success: true, data: map });
                } catch (e) {
                    resolve({ success: false, error: 'Failed to parse legacy drawings' });
                }
            }
        });
    });
});

// 2. Trades
ipcMain.handle('trades:get-ledger', async (event, sourceId) => {
    return new Promise((resolve) => {
        db.all('SELECT data FROM trades WHERE sourceId = ? ORDER BY timestamp DESC', [sourceId], (err, rows) => {
            // Defensively ensure an array is returned even on error/no rows
            if (err) {
                console.error('trades:get-ledger error:', err);
                resolve([]);
            } else {
                try {
                    // Safety check: rows might be null depending on driver impl, though usually []
                    const trades = (rows || []).map(r => JSON.parse(r.data));
                    resolve(trades);
                } catch (e) {
                    resolve([]);
                }
            }
        });
    });
});

ipcMain.handle('trades:save', async (event, trade) => {
    return new Promise((resolve) => {
        db.run(
            'INSERT INTO trades (id, sourceId, data, timestamp) VALUES (?, ?, ?, ?)',
            [trade.id, trade.sourceId, JSON.stringify(trade), trade.timestamp],
            (err) => {
                if (err) {
                    console.error('trades:save error:', err);
                    resolve({ success: false, error: err.message });
                } else {
                    logSystemEvent('TRADE_SAVED');
                    resolve({ success: true });
                }
            }
        );
    });
});

// Legacy trade handler alias
ipcMain.handle('trades:get-by-source', async (event, sourceId) => {
    return new Promise((resolve) => {
        db.all('SELECT data FROM trades WHERE sourceId = ? ORDER BY timestamp DESC', [sourceId], (err, rows) => {
            if (err) {
                resolve([]);
            } else {
                try {
                    const trades = (rows || []).map(r => JSON.parse(r.data));
                    resolve(trades);
                } catch (e) {
                    resolve([]);
                }
            }
        });
    });
});

// 3. Layouts (Still JSON file based as per original spec)
ipcMain.handle('layouts:save', async (event, layoutName, layoutData) => {
    try {
        const layoutsDir = path.join(app.getPath('userData'), 'Database', 'Layouts');
        if (!fs.existsSync(layoutsDir)) fs.mkdirSync(layoutsDir, { recursive: true });
        
        const filePath = path.join(layoutsDir, `${layoutName}.json`);
        fs.writeFileSync(filePath, JSON.stringify(layoutData, null, 2));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('layouts:load', async (event, layoutName) => {
    try {
        const filePath = path.join(app.getPath('userData'), 'Database', 'Layouts', `${layoutName}.json`);
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
        const layoutsDir = path.join(app.getPath('userData'), 'Database', 'Layouts');
        if (!fs.existsSync(layoutsDir)) return [];
        const files = fs.readdirSync(layoutsDir);
        return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
    } catch (e) {
        return [];
    }
});

// --- NEW IPC: LOGS / DB STATUS ---
ipcMain.handle('logs:get-db-status', async () => {
    return new Promise((resolve) => {
        if (!db) {
            resolve({ connected: false, error: 'Database object is null' });
            return;
        }
        // Run a lightweight query to verify connectivity and file lock status
        db.get("SELECT 1", (err) => {
            if (err) {
                resolve({ connected: false, error: err.message });
            } else {
                resolve({ connected: true });
            }
        });
    });
});

// --- TELEMETRY ---
ipcMain.handle('get-system-telemetry', async () => {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const heapStats = v8.getHeapStatistics();
    
    // For sqlite3, we just check if the object exists since there isn't a direct .open property
    const isDbConnected = db ? 'Online (SQLite3)' : 'Disconnected';

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
            connectionState: isDbConnected,
            dbPath: db ? 'master.db' : 'None'
        },
        logBuffer: systemLogBuffer
    };
});

// --- APP LIFECYCLE ---

app.whenReady().then(() => {
  logSystemEvent('APP_READY');
  setupDatabase();
  runBootScan();
  createWindow();
});

app.on('window-all-closed', () => { 
    if (db) db.close();
    if (process.platform !== 'darwin') app.quit(); 
});
