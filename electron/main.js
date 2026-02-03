
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { Worker } = require('worker_threads');

// 1. INCREASE HEAP TO 500MB (Phase 1: Memory Power-Up)
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=500');

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

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
    // Mandate: Open database at app.getPath('userData')/redpill.db
    dbPathGlobal = path.join(userDataPath, 'redpill.db');

    try {
        // Task 3: Non-Blocking SQLite (The WAL Verify)
        db = new Database(dbPathGlobal, { verbose: null }); // Set verbose: console.log for debugging
        logSystemEvent('DB_CONNECTED');

        // 2. SQLITE OPTIMIZATION (Phase 1)
        // Performance Pragmas per PRD
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');

        initializeTables();
    } catch (err) {
        console.error('Database initialization failed:', err);
        logSystemEvent('DB_INIT_FAILED', { error: err.message }, 'CRITICAL');
    }
};

const initializeTables = () => {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS drawings (symbol TEXT PRIMARY KEY, data TEXT);
            CREATE TABLE IF NOT EXISTS trades (id TEXT PRIMARY KEY, sourceId TEXT, data TEXT, timestamp INTEGER);
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
            
            -- Mandate: market_data table with Compound Index
            CREATE TABLE IF NOT EXISTS market_data (
                symbol TEXT,
                timeframe TEXT,
                timestamp INTEGER, -- Renamed from 'time' per PRD source of truth
                open REAL, 
                high REAL, 
                low REAL, 
                close REAL, 
                volume REAL,
                UNIQUE(symbol, timeframe, timestamp)
            );
            
            CREATE INDEX IF NOT EXISTS idx_market_data ON market_data (symbol, timeframe, timestamp);
        `);
        logSystemEvent('DB_TABLES_READY');
    } catch (e) {
        logSystemEvent('DB_SCHEMA_ERROR', { error: e.message }, 'CRITICAL');
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
            connected: !!db && db.open,
            path: dbPathGlobal
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
  if (watcher) { watcher.close(); watcher = null; logSystemEvent('WATCH_FOLDER_START', { path: folderPath }); }
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

// --- OPTIMIZED MARKET DATA HANDLER (Sync Better-SQLite3) ---
ipcMain.handle('market:get-data', async (event, symbol, timeframe, filePath, toTime = null, limit = 1000) => {
    try {
        if (!db) return { error: "Database not initialized" };
        
        // Define Reusable Query Function using synchronous API
        const fetchFromDb = () => {
            // Mapping timestamp -> time for frontend compatibility
            let query = `
                SELECT timestamp as time, open, high, low, close, volume 
                FROM market_data 
                WHERE symbol = ? AND timeframe = ? 
            `;
            const params = [symbol, timeframe];

            // Windowed Logic: Visible slice based on toTime
            if (toTime) {
                query += ' AND timestamp < ?';
                params.push(toTime);
            }

            query += ' ORDER BY timestamp DESC LIMIT ?';
            params.push(limit);

            const stmt = db.prepare(query);
            const rows = stmt.all(...params);
            
            // Reverse to ASC order for chart
            return rows.reverse();
        };

        // A. CHECK CACHE FIRST (Task 2: Optimized Windowed Query)
        let cachedRows = fetchFromDb();

        // B. CACHE MISS: WORKER THREAD INGEST
        // Optimization: Only try ingest if we have NO data for this symbol/tf, or if explicit refresh needed.
        // If we found 0 rows but we have a source file, we need to check if the DB is actually empty for this key.
        // If the DB has data but our query returned 0 (e.g. scrolled past beginning), do NOT re-ingest.
        
        if ((!cachedRows || cachedRows.length === 0) && filePath && fs.existsSync(filePath)) {
            // Check if any data exists for this symbol/timeframe
            const checkStmt = db.prepare('SELECT 1 FROM market_data WHERE symbol = ? AND timeframe = ? LIMIT 1');
            const hasData = checkStmt.get(symbol, timeframe);

            if (!hasData) {
                logSystemEvent('WORKER_SPAWN', { symbol, filePath });
                
                try {
                    await runIngestWorker(filePath, symbol, timeframe);
                    
                    // Re-fetch after worker completion
                    cachedRows = fetchFromDb();
                    logSystemEvent('WORKER_COMPLETE', { symbol, rowsLoaded: cachedRows.length });
                } catch (err) {
                    logSystemEvent('WORKER_ERROR', { error: err.message }, 'ERROR');
                    return { error: `Ingestion failed: ${err.message}` };
                }
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
                    resolve({ text }); 
                });
            });
        });
    } catch (e) {
        return { error: e.message };
    }
});

ipcMain.handle('drawings:get-state', async (event, symbol) => {
    try {
        const stmt = db.prepare('SELECT data FROM drawings WHERE symbol = ?');
        const row = stmt.get(symbol);
        return row ? JSON.parse(row.data) : null;
    } catch (e) {
        return null;
    }
});

ipcMain.handle('drawings:save-state', async (event, symbol, data) => {
    try {
        const stmt = db.prepare('INSERT OR REPLACE INTO drawings (symbol, data) VALUES (?, ?)');
        stmt.run(symbol, JSON.stringify(data));
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('drawings:delete-all', async (event, sourceId) => {
    try {
        const stmt = db.prepare('DELETE FROM drawings WHERE symbol = ?');
        stmt.run(sourceId);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('master-drawings:load', async () => {
    try {
        const stmt = db.prepare('SELECT symbol, data FROM drawings');
        const rows = stmt.all();
        const map = {};
        rows.forEach(row => { map[row.symbol] = JSON.parse(row.data); });
        return { success: true, data: map };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('trades:get-ledger', async (event, sourceId) => {
    try {
        const stmt = db.prepare('SELECT data FROM trades WHERE sourceId = ? ORDER BY timestamp DESC');
        const rows = stmt.all(sourceId);
        return rows.map(r => JSON.parse(r.data));
    } catch (e) {
        return [];
    }
});

ipcMain.handle('trades:save', async (event, trade) => {
    try {
        const stmt = db.prepare('INSERT INTO trades (id, sourceId, data, timestamp) VALUES (?, ?, ?, ?)');
        stmt.run(trade.id, trade.sourceId, JSON.stringify(trade), trade.timestamp);
        logSystemEvent('TRADE_SAVED', { id: trade.id });
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
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
    try {
        if (!db) return { connected: false, error: 'DB Null' };
        db.prepare("SELECT 1").get();
        return { connected: true };
    } catch (err) {
        return { connected: false, error: err.message };
    }
});

app.whenReady().then(() => {
  logSystemEvent('APP_READY');
  setupDatabase();
  runBootScan();
  createWindow();
});

app.on('window-all-closed', () => { if (db) db.close(); if (process.platform !== 'darwin') app.quit(); });
