
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const v8 = require('v8');
const Database = require('better-sqlite3');

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
    try {
        const userDataPath = app.getPath('userData');
        const dbFolder = path.join(userDataPath, 'RedPill');
        const dbPath = path.join(dbFolder, 'master.db');

        if (!fs.existsSync(dbFolder)) {
            fs.mkdirSync(dbFolder, { recursive: true });
        }

        db = new Database(dbPath, { verbose: null }); // Set verbose: console.log for debugging queries
        db.pragma('journal_mode = WAL');

        // Initialize Tables
        db.prepare(`
            CREATE TABLE IF NOT EXISTS drawings (
                symbol TEXT PRIMARY KEY,
                data TEXT
            )
        `).run();

        db.prepare(`
            CREATE TABLE IF NOT EXISTS trades (
                id TEXT PRIMARY KEY,
                sourceId TEXT,
                data TEXT,
                timestamp INTEGER
            )
        `).run();

        db.prepare(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `).run();

        logSystemEvent('DB_INITIALIZED');
        
        runMigration();

    } catch (error) {
        console.error('Database initialization failed:', error);
        logSystemEvent('DB_INIT_FAILED');
    }
};

const runMigration = () => {
    // Migration: Import old JSON flat-files if they exist
    try {
        const oldDrawingsPath = path.join(app.getPath('userData'), 'Database', 'drawings_master.json');
        
        if (fs.existsSync(oldDrawingsPath)) {
            console.log('Migrating legacy drawings...');
            const raw = fs.readFileSync(oldDrawingsPath, 'utf8');
            const data = JSON.parse(raw);
            
            const insert = db.prepare('INSERT OR REPLACE INTO drawings (symbol, data) VALUES (?, ?)');
            const insertMany = db.transaction((drawings) => {
                for (const [symbol, content] of Object.entries(drawings)) {
                    insert.run(symbol, JSON.stringify(content));
                }
            });
            
            insertMany(data);
            
            // Rename old file to avoid re-migration
            fs.renameSync(oldDrawingsPath, oldDrawingsPath + '.bak');
            logSystemEvent('MIGRATION_COMPLETE');
        }
    } catch (error) {
        console.error('Migration failed:', error);
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

// --- PERSISTENCE (SQLite) ---

// 1. Drawings
ipcMain.handle('drawings:get-state', async (event, symbol) => {
    try {
        const row = db.prepare('SELECT data FROM drawings WHERE symbol = ?').get(symbol);
        if (row) {
            return JSON.parse(row.data);
        }
        return null;
    } catch (e) {
        console.error('drawings:get-state error:', e);
        return null;
    }
});

ipcMain.handle('drawings:save-state', async (event, symbol, data) => {
    try {
        const stmt = db.prepare('INSERT OR REPLACE INTO drawings (symbol, data) VALUES (?, ?)');
        stmt.run(symbol, JSON.stringify(data));
        return { success: true };
    } catch (e) {
        console.error('drawings:save-state error:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('drawings:delete-all', async (event, sourceId) => {
    try {
        db.prepare('DELETE FROM drawings WHERE symbol = ?').run(sourceId);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Legacy handler for compatibility during transition (Deprecated)
ipcMain.handle('master-drawings:load', async () => {
    try {
        // Return all drawings as a map to satisfy old frontend expectation if called
        const rows = db.prepare('SELECT symbol, data FROM drawings').all();
        const map = {};
        for (const row of rows) {
            map[row.symbol] = JSON.parse(row.data);
        }
        return { success: true, data: map };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// 2. Trades
ipcMain.handle('trades:get-ledger', async (event, sourceId) => {
    try {
        const rows = db.prepare('SELECT data FROM trades WHERE sourceId = ? ORDER BY timestamp DESC').all(sourceId);
        return rows.map(r => JSON.parse(r.data));
    } catch (e) {
        console.error('trades:get-ledger error:', e);
        return [];
    }
});

ipcMain.handle('trades:save', async (event, trade) => {
    try {
        const stmt = db.prepare('INSERT INTO trades (id, sourceId, data, timestamp) VALUES (?, ?, ?, ?)');
        stmt.run(trade.id, trade.sourceId, JSON.stringify(trade), trade.timestamp);
        logSystemEvent('TRADE_SAVED');
        return { success: true };
    } catch (e) {
        console.error('trades:save error:', e);
        return { success: false, error: e.message };
    }
});

// Legacy trade handler alias
ipcMain.handle('trades:get-by-source', async (event, sourceId) => {
    try {
        const rows = db.prepare('SELECT data FROM trades WHERE sourceId = ? ORDER BY timestamp DESC').all(sourceId);
        return rows.map(r => JSON.parse(r.data));
    } catch (e) {
        return [];
    }
});

// 3. Layouts (Still JSON file based as per original spec, or can move to settings table)
// For now keeping file based to minimize scope creep unless requested, 
// but prompt implies using 'settings' table. Let's stick to existing logic for layouts 
// to ensure stability unless explicitly asked to migrate layouts too.
ipcMain.handle('layouts:save', async (event, layoutName, layoutData) => {
    try {
        const dbPath = path.dirname(db.name); // RedPill folder
        const layoutsDir = path.join(dbPath, '..', 'Database', 'Layouts'); // Keeping compat with old path
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
        const dbPath = path.dirname(db.name);
        const filePath = path.join(dbPath, '..', 'Database', 'Layouts', `${layoutName}.json`);
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
        const dbPath = path.dirname(db.name);
        const layoutsDir = path.join(dbPath, '..', 'Database', 'Layouts');
        if (!fs.existsSync(layoutsDir)) return [];
        const files = fs.readdirSync(layoutsDir);
        return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
    } catch (e) {
        return [];
    }
});

// --- TELEMETRY ---
ipcMain.handle('get-system-telemetry', async () => {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const heapStats = v8.getHeapStatistics();
    
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
            connectionState: db && db.open ? 'Online (SQLite)' : 'Disconnected',
            dbPath: db ? db.name : 'None'
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
