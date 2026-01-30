
const { app, BrowserWindow, ipcMain, dialog } = require('electron');

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
            data: safeIPC(data)
        });
    }
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
            logSystemEvent('DB_DIR_CREATE_FAILED', { error: e.message }, 'CRITICAL');
            return;
        }
    }

    db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('Database initialization failed:', err);
            logSystemEvent('DB_INIT_FAILED', { error: err.message }, 'CRITICAL');
        } else {
            logSystemEvent('DB_CONNECTED');
            
            // 2. SQLITE OPTIMIZATION (Phase 1)
            db.serialize(() => {
                db.run("PRAGMA journal_mode = WAL;");   // Write-Ahead Logging
                db.run("PRAGMA synchronous = NORMAL;"); // Reduce disk-sync overhead
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

// --- HELPER: CSV Parsing (Node.js) ---
const parseCSVFileSync = (filePath) => {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const data = [];
        
        for (const line of lines) {
            // Skip empty lines or header lines (assuming header doesn't start with digit)
            if (!line || !line.trim() || !/^\d/.test(line.trim())) continue;

            const delimiter = line.indexOf(';') > -1 ? ';' : ',';
            const parts = line.split(delimiter);

            // Require at least 5 columns
            if (parts.length < 5) continue;

            try {
                let dateStr = '';
                let timestamp = 0;
                let open = 0, high = 0, low = 0, close = 0, volume = 0;

                const p0 = parts[0].trim();
                const p1 = parts[1].trim();

                // Check for Date + Time split columns
                const isDateColumn = /^\d{8}$/.test(p0) || /^\d{4}[\.\-\/]\d{2}[\.\-\/]\d{2}$/.test(p0);
                const isTimeColumn = p1.includes(':');

                if (isDateColumn && isTimeColumn) {
                    let cleanDate = p0.replace(/[\.\-\/]/g, '');
                    if (cleanDate.length === 8) {
                        cleanDate = `${cleanDate.substring(0,4)}-${cleanDate.substring(4,6)}-${cleanDate.substring(6,8)}`;
                    }
                    dateStr = `${cleanDate}T${p1}`;
                    
                    open = parseFloat(parts[2]);
                    high = parseFloat(parts[3]);
                    low = parseFloat(parts[4]);
                    close = parseFloat(parts[5]);
                    if (parts.length > 6) {
                        const v = parseFloat(parts[6]);
                        volume = isNaN(v) ? 0 : v;
                    }
                } else {
                     // Single Column Date/Timestamp
                     dateStr = p0;
                     open = parseFloat(parts[1]);
                     high = parseFloat(parts[2]);
                     low = parseFloat(parts[3]);
                     close = parseFloat(parts[4]);
                     if (parts.length > 5) {
                         const v = parseFloat(parts[5]);
                         volume = isNaN(v) ? 0 : v;
                     }
                }

                if (isNaN(open) || isNaN(close)) continue;

                timestamp = new Date(dateStr).getTime();
                if (isNaN(timestamp)) {
                    timestamp = parseFloat(dateStr);
                    if (!isNaN(timestamp) && timestamp < 10000000000) timestamp *= 1000;
                }

                if (isNaN(timestamp) || timestamp <= 0) continue;

                data.push({ time: timestamp, open, high, low, close, volume });
            } catch (e) {
                // skip malformed
            }
        }
        
        // Sort ascending
        return data.sort((a, b) => a.time - b.time);
    } catch(e) {
        console.error("CSV Parse Error:", e);
        return [];
    }
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

    // CRITICAL: Sanitize before sending to Renderer to prevent Code 134
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

// --- OPTIMIZED MARKET DATA HANDLER (Windowed + Atomic Ingest) ---
ipcMain.handle('market:get-data', async (event, symbol, timeframe, filePath, toTime = null, limit = 1000) => {
    try {
        if (!db) return { error: "Database not initialized" };
        
        // A. CHECK CACHE FIRST
        const fetchPromise = new Promise((resolve) => {
            const fetchQuery = `SELECT time, open, high, low, close, volume FROM ohlc_cache WHERE symbol = ? AND timeframe = ? ${toTime ? 'AND time < ?' : ''} ORDER BY time DESC LIMIT ?`;
            const params = toTime ? [symbol, timeframe, toTime, limit] : [symbol, timeframe, limit];
            db.all(fetchQuery, params, (err, rows) => {
                if (err) resolve([]);
                else resolve(rows);
            });
        });

        const cachedRows = await fetchPromise;

        // If we found data, return it (reversed to ascending)
        if (cachedRows && cachedRows.length > 0) {
            // Note: If requesting history (toTime), any amount is success.
            // If requesting initial (toTime=null), maybe check if we have enough?
            // For now, prompt implies "Cache Miss" usually means "Not in DB".
            // If we have some, we assume it's ingested.
            
            // NOTE: The query sorts DESC (newest first). UI needs ASC (oldest first).
            const reversed = cachedRows.reverse();
            logSystemEvent(`DATA_FETCH_CACHE`, { symbol, timeframe, count: reversed.length });
            return { data: reversed };
        }

        // B. CACHE MISS: ATOMIC BATCH INGEST
        // Only if a file path is provided (Initial Load)
        if (filePath && fs.existsSync(filePath)) {
            logSystemEvent('DATA_INGEST_START', { symbol, filePath });
            
            const rawData = parseCSVFileSync(filePath); // Parse full file
            
            if (rawData.length === 0) return { data: [] };

            // Atomic Transaction
            await new Promise((resolve, reject) => {
                db.serialize(() => {
                    db.run("BEGIN TRANSACTION");
                    const stmt = db.prepare("INSERT OR IGNORE INTO ohlc_cache (symbol, timeframe, time, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                    
                    // Batch insert
                    rawData.forEach(r => {
                        stmt.run(symbol, timeframe, r.time, r.open, r.high, r.low, r.close, r.volume);
                    });
                    
                    stmt.finalize();
                    db.run("COMMIT", (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            });
            
            logSystemEvent('DATA_INGEST_COMPLETE', { symbol, count: rawData.length });

            // C. RETURN WINDOW (The last N bars)
            let resultData = rawData;
            // If specific time requested (unlikely on ingest path unless mixed usage), filter
            if (toTime) {
                resultData = rawData.filter(d => d.time < toTime);
            }
            
            // Slice last 'limit' items (newest)
            const sliced = resultData.slice(-limit);
            
            return { data: sliced };
        }

        return { data: [] }; // No data found and no file to ingest

    } catch (e) {
        logSystemEvent('DATA_FETCH_ERROR', { error: e.message }, 'ERROR');
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
    // This is the old handler, potentially deprecated by get-global-state, but kept for compatibility
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
