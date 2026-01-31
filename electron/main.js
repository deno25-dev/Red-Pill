
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { Worker } = require('worker_threads');

// 1. INCREASE HEAP TO 500MB (Phase 1: Memory Power-Up)
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=500');

const path = require('path');
const fs = require('fs');
const v8 = require('v8');
const sqlite3 = require('sqlite3').verbose();
const readline = require('readline');

// [TELEMETRY] Initialize Session Start Time
const sessionStartTime = Date.now();
const systemLogBuffer = [];
const MAX_SYSTEM_LOGS = 200;

// Helper: Sanitize for IPC (Prevent Code 134)
const safeIPC = (data) => {
    try {
        return JSON.parse(JSON.stringify(data));
    } catch (e) {
        return { error: 'Serialization Failed', details: e.message };
    }
};

const logSystemEvent = (eventName, data = null, level = 'INFO') => {
    const entry = { 
        event: eventName, 
        timestamp: Date.now(),
        level,
        data: safeIPC(data) 
    };
    systemLogBuffer.unshift(entry);
    if (systemLogBuffer.length > MAX_SYSTEM_LOGS) systemLogBuffer.pop();
    
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('redpill-log-stream', {
            category: 'IPC BRIDGE',
            level,
            message: eventName,
            data: safeIPC(data),
            timestamp: entry.timestamp // Pass timestamp to maintain accuracy across bridge
        });
    }
    console.log(`[SYS_EVENT] ${eventName}`);
};

let mainWindow;
let watcher = null;
let db = null;
let dbPathGlobal = null; // Store for worker

// --- CONFIGURATION ---
const IGNORED_DIRECTORIES = ['Database', '.git', 'node_modules', 'dist', 'build', 'release', 'src', 'src-tauri', 'public'];

// --- INTERNAL LIBRARY STORAGE (BOOT CACHE) ---
let internalLibraryStorage = [];

// --- DATABASE SETUP ---
const setupDatabase = () => {
    const userDataPath = app.getPath('userData');
    const dbFolder = path.join(userDataPath, 'RedPill');
    dbPathGlobal = path.join(dbFolder, 'master.db');

    if (!fs.existsSync(dbFolder)) {
        try {
            fs.mkdirSync(dbFolder, { recursive: true });
        } catch (e) {
            console.error('Failed to create database directory:', e);
            logSystemEvent('DB_DIR_CREATE_FAILED', { error: e.message }, 'CRITICAL');
            return;
        }
    }

    // Task 3: Non-Blocking SQLite (The WAL Verify)
    db = new sqlite3.Database(dbPathGlobal, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
            console.error('Database initialization failed:', err);
            logSystemEvent('DB_INIT_FAILED', { error: err.message }, 'CRITICAL');
        } else {
            logSystemEvent('DB_CONNECTED');
            
            // 2. SQLITE OPTIMIZATION (Phase 1)
            db.serialize(() => {
                db.run("PRAGMA journal_mode = WAL;");   // Write-Ahead Logging
                // Task 3: Non-Blocking Writes
                db.run("PRAGMA synchronous = OFF;"); 
            });

            initializeTables();
        }
    });
};

const initializeTables = () => {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS drawings (symbol TEXT PRIMARY KEY, data TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS trades (id TEXT PRIMARY KEY, sourceId TEXT, data TEXT, timestamp INTEGER)`);
        db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
        db.run(`
            CREATE TABLE IF NOT EXISTS ohlc_cache (
                symbol TEXT,
                timeframe TEXT,
                time INTEGER,
                open REAL, high REAL, low REAL, close REAL, volume REAL,
                UNIQUE(symbol, timeframe, time)
            )
        `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_ohlc_lookup ON ohlc_cache (symbol, timeframe, time)`);
        logSystemEvent('DB_TABLES_READY');
    });
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

  if (!resolvedPath) resolvedPath = path.join(__dirname, 'preload.js'); 

  logSystemEvent('WINDOW_CREATING');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0f172a',
    title: 'Red Pill Charting',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0f172a', symbolColor: '#94a3b8', height: 30 },
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
    const loadWithRetry = () => {
      mainWindow.loadURL('http://localhost:5173').catch(() => {
        setTimeout(() => { if (mainWindow && !mainWindow.isDestroyed()) loadWithRetry(); }, 1000);
      });
    };
    loadWithRetry();
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
  }
  
  mainWindow.once('ready-to-show', () => logSystemEvent('WINDOW_READY'));
};

const resolveAssetsPath = () => {
    let assetsPath;
    if (app.isPackaged) assetsPath = path.join(path.dirname(process.execPath), 'Assets');
    else assetsPath = path.join(__dirname, '..', 'Assets');
    if (!fs.existsSync(assetsPath)) try { fs.mkdirSync(assetsPath, { recursive: true }); } catch (e) {}
    return assetsPath;
};

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
                    if (stat && stat.isDirectory()) scanDir(fullPath);
                    else if (file.toLowerCase().endsWith('.csv') || file.toLowerCase().endsWith('.json')) {
                        results.push({ name: file, path: fullPath, kind: 'file', folder: path.relative(assetsPath, dir) || '.' });
                    }
                } catch (e) {}
            });
        } catch (e) {}
    };

    if (fs.existsSync(assetsPath)) scanDir(assetsPath);
    logSystemEvent('BOOT_SCAN_COMPLETE', { count: results.length });
    internalLibraryStorage = results;
    return internalLibraryStorage;
};

// --- WORKER HANDLER ---
const runIngestWorker = (filePath, symbol, timeframe) => {
    return new Promise((resolve, reject) => {
        // Resolve worker path
        let workerPath = path.join(__dirname, 'ingestWorker.js');
        // Handle production packaging path shifts if necessary
        if (!fs.existsSync(workerPath)) {
             workerPath = path.join(app.getAppPath(), 'electron', 'ingestWorker.js');
        }

        const worker = new Worker(workerPath);
        
        worker.on('message', (result) => {
            if (result.success) resolve(result);
            else reject(new Error(result.error));
        });
        
        worker.on('error', reject);
        
        worker.on('exit', (code) => {
            if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
        });

        // Start worker
        worker.postMessage({
            dbPath: dbPathGlobal,
            filePath,
            symbol,
            timeframe
        });
    });
};

ipcMain.handle('debug:get-global-state', async () => {
    // Collect state from main process memory
    const mem = process.memoryUsage();
    
    const state = {
        app: {
            version: app.getVersion(),
            userData: app.getPath('userData'),
            assetsPath: resolveAssetsPath(),
            uptime: process.uptime()
        },
        resources: {
            memoryMB: Math.round(mem.rss / 1024 / 1024),
            heapMB: Math.round(mem.heapUsed / 1024 / 1024)
        },
        database: {
            connected: !!db,
            path: db ? 'master.db' : 'null'
        },
        library: {
            fileCount: internalLibraryStorage.length
        },
        watcher: {
            active: !!watcher
        },
        logBuffer: systemLogBuffer.slice(0, 50) // Last 50 system logs
    };

    return safeIPC(state);
});

ipcMain.on('log:send', (event, category, message, data) => {
    if (data && (data.level === 'ERROR' || data.level === 'CRITICAL')) {
        console.log(`[RENDERER-${category}] ${message}`, data);
    }
});

ipcMain.handle('dialog:select-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (canceled) return null;
    return { path: filePaths[0], name: path.basename(filePaths[0]) };
});

ipcMain.handle('get-default-database-path', () => resolveAssetsPath());
ipcMain.handle('get-internal-library', async () => runBootScan());

ipcMain.handle('file:watch-folder', async (event, folderPath) => {
  if (watcher) { watcher.close(); watcher = null; }
  logSystemEvent('WATCH_FOLDER_START', { path: folderPath });
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
      if (filename && (filename.endsWith('.csv') || filename.endsWith('.json'))) {
         if (mainWindow) mainWindow.webContents.send('folder-changed', getFilesRecursive(folderPath));
      }
    });
    return initialFiles;
  } catch (e) { throw e; }
});

ipcMain.handle('file:unwatch-folder', () => { if (watcher) { watcher.close(); watcher = null; logSystemEvent('WATCH_FOLDER_STOP'); } });

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
        const stats = fs.statSync(filePath);
        return { exists: true, size: stats.size };
    } catch (e) { return { exists: false, size: 0 }; }
});

// --- OPTIMIZED MARKET DATA HANDLER (Worker + Flat Array) ---
ipcMain.handle('market:get-data', async (event, symbol, timeframe, filePath, toTime = null, limit = 1000) => {
    try {
        if (!db) return { error: "Database not initialized" };
        
        // A. CHECK CACHE FIRST (Task 2: Optimized Windowed Query)
        const fetchPromise = new Promise((resolve) => {
            const fetchQuery = `
                SELECT time, open, high, low, close, volume 
                FROM ohlc_cache 
                WHERE symbol = ? AND timeframe = ? 
                ${toTime ? 'AND time < ?' : ''} 
                ORDER BY time DESC 
                LIMIT ?
            `;
            const params = toTime ? [symbol, timeframe, toTime, limit] : [symbol, timeframe, limit];
            db.all(fetchQuery, params, (err, rows) => {
                if (err) resolve([]);
                else {
                    // Reverse to ASC order for chart
                    resolve(rows.reverse());
                }
            });
        });

        let cachedRows = await fetchPromise;

        // B. CACHE MISS: WORKER THREAD INGEST
        // If no data found and we have a source file, spawn worker
        if ((!cachedRows || cachedRows.length === 0) && filePath && fs.existsSync(filePath)) {
            logSystemEvent('WORKER_SPAWN', { symbol, filePath });
            
            try {
                await runIngestWorker(filePath, symbol, timeframe);
                
                // Re-fetch after worker completion
                cachedRows = await fetchPromise;
                logSystemEvent('WORKER_COMPLETE', { symbol, rowsLoaded: cachedRows.length });
            } catch (err) {
                logSystemEvent('WORKER_ERROR', { error: err.message }, 'ERROR');
                return { error: `Ingestion failed: ${err.message}` };
            }
        }

        // C. RETURN OPTIMIZED PAYLOAD (Task 4: Flat Array)
        if (cachedRows && cachedRows.length > 0) {
            // Map to flat array [t, o, h, l, c, v]
            const flatData = cachedRows.map(r => [r.time, r.open, r.high, r.low, r.close, r.volume]);
            return { data: flatData, format: 'array' };
        }

        return { data: [] };

    } catch (e) {
        logSystemEvent('DATA_FETCH_ERROR', { error: e.message }, 'ERROR');
        return { error: e.message };
    }
});

// --- TAIL-FIRST ACCESS ---
ipcMain.handle('market:get-tail', async (event, filePath) => {
    try {
        const stats = fs.statSync(filePath);
        const size = stats.size;
        const chunkSize = 200 * 1024; // 200KB tail
        const start = Math.max(0, size - chunkSize);
        
        return new Promise((resolve, reject) => {
            fs.open(filePath, 'r', (err, fd) => {
                if (err) return reject(err);
                const buffer = Buffer.alloc(size - start);
                fs.read(fd, buffer, 0, buffer.length, start, (err, bytesRead, b) => {
                    fs.close(fd, () => {});
                    if (err) return reject(err);
                    const text = b.toString('utf8');
                    // Parse logic locally for tail (lightweight)
                    const lines = text.split('\n');
                    // Drop first potentially partial line
                    if (lines.length > 1) lines.shift(); 
                    // Use standard parsing logic here or helper if available
                    // For tail, we can send raw text to renderer to parse to keep main light? 
                    // Or implement mini-parser. Let's do simple flat array return if possible, 
                    // but since parsing logic is complex, let's just return the raw string 
                    // and let renderer parse the tail for immediate display.
                    // Actually, consistent API is better.
                    resolve({ text }); 
                });
            });
        });
    } catch (e) {
        return { error: e.message };
    }
});

ipcMain.handle('drawings:get-state', async (event, symbol) => {
    return new Promise((resolve) => {
        db.get('SELECT data FROM drawings WHERE symbol = ?', [symbol], (err, row) => resolve(row ? JSON.parse(row.data) : null));
    });
});

ipcMain.handle('drawings:save-state', async (event, symbol, data) => {
    return new Promise((resolve) => {
        db.run('INSERT OR REPLACE INTO drawings (symbol, data) VALUES (?, ?)', [symbol, JSON.stringify(data)], (err) => resolve({ success: !err, error: err ? err.message : undefined }));
    });
});

ipcMain.handle('drawings:delete-all', async (event, sourceId) => {
    return new Promise((resolve) => {
        db.run('DELETE FROM drawings WHERE symbol = ?', [sourceId], (err) => resolve({ success: !err, error: err ? err.message : undefined }));
    });
});

ipcMain.handle('master-drawings:load', async () => {
    return new Promise((resolve) => {
        db.all('SELECT symbol, data FROM drawings', [], (err, rows) => {
            if (err) resolve({ success: false, error: err.message });
            else {
                const map = {};
                try { rows.forEach(row => { map[row.symbol] = JSON.parse(row.data); }); resolve({ success: true, data: map }); } 
                catch (e) { resolve({ success: false, error: 'Failed to parse legacy drawings' }); }
            }
        });
    });
});

ipcMain.handle('trades:get-ledger', async (event, sourceId) => {
    return new Promise((resolve) => {
        db.all('SELECT data FROM trades WHERE sourceId = ? ORDER BY timestamp DESC', [sourceId], (err, rows) => {
            try { resolve(err ? [] : (rows || []).map(r => JSON.parse(r.data))); } catch (e) { resolve([]); }
        });
    });
});

ipcMain.handle('trades:save', async (event, trade) => {
    return new Promise((resolve) => {
        db.run('INSERT INTO trades (id, sourceId, data, timestamp) VALUES (?, ?, ?, ?)', [trade.id, trade.sourceId, JSON.stringify(trade), trade.timestamp], (err) => {
            if (!err) logSystemEvent('TRADE_SAVED', { id: trade.id });
            resolve({ success: !err, error: err ? err.message : undefined });
        });
    });
});

ipcMain.handle('get-system-telemetry', async () => {
    const mem = process.memoryUsage();
    return {
        processInfo: { version: process.versions.electron, uptime: Math.floor(process.uptime()), pid: process.pid },
        resources: { memory: { rss: (mem.rss / 1024 / 1024).toFixed(2) + ' MB' } },
        logBuffer: systemLogBuffer
    };
});

ipcMain.handle('logs:get-db-status', async () => {
    return new Promise((resolve) => {
        if (!db) resolve({ connected: false, error: 'DB Null' });
        else db.get("SELECT 1", (err) => resolve({ connected: !err, error: err ? err.message : undefined }));
    });
});

app.whenReady().then(() => {
  logSystemEvent('APP_READY');
  setupDatabase();
  runBootScan();
  createWindow();
});

app.on('window-all-closed', () => { if (db) db.close(); if (process.platform !== 'darwin') app.quit(); });
