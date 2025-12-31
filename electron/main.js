
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

let mainWindow;
let watcher = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0f172a', // Match app background
    title: 'Red Pill Charting',
    titleBarStyle: 'hidden', // Hides native title bar
    titleBarOverlay: {
        color: '#0f172a', // Matches app background
        symbolColor: '#94a3b8', // Slate-400 for controls
        height: 30
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Disable sandbox to allow file system access
      webSecurity: false, // Disable CORS policy for local data fetching
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
  }
};

// --- ROBUST FILE SYSTEM BRIDGE ---

// 1. Validation Guard
const validatePath = (filePath) => {
  if (!filePath || typeof filePath !== 'string') throw new Error("Invalid path");
  // Don't throw if missing for writes, only specific reads
  return true;
};

// 2. The 'Watcher' Command
ipcMain.handle('file:watch-folder', async (event, folderPath) => {
  if (watcher) {
    watcher.close();
    watcher = null;
  }

  try {
    if (!fs.existsSync(folderPath)) throw new Error("Folder does not exist");

    // Helper for recursive scan
    const getFilesRecursive = (dir) => {
      let results = [];
      const list = fs.readdirSync(dir);
      list.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(getFilesRecursive(fullPath));
        } else {
          // Only include CSV/TXT
          if (file.endsWith('.csv') || file.endsWith('.txt')) {
             results.push({ name: file, path: fullPath, kind: 'file' });
          }
        }
      });
      return results;
    };

    // Watch for changes
    watcher = fs.watch(folderPath, { recursive: true }, (eventType, filename) => {
      if (filename && (filename.endsWith('.csv') || filename.endsWith('.txt'))) {
        // Debounce slightly to avoid rapid-fire updates during writes
        if (mainWindow) {
           mainWindow.webContents.send('folder-changed', getFilesRecursive(folderPath));
        }
      }
    });

    return getFilesRecursive(folderPath);
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

// 3. Efficient Streamer (Chunk Reader)
ipcMain.handle('file:read-chunk', async (event, filePath, start, length) => {
  validatePath(filePath);

  return new Promise((resolve, reject) => {
    fs.open(filePath, 'r', (err, fd) => {
      if (err) return reject(err);

      const buffer = Buffer.alloc(length);
      fs.read(fd, buffer, 0, length, start, (err, bytesRead, buffer) => {
        fs.close(fd, () => {}); // Close regardless
        if (err) return reject(err);
        
        // Return string data (React will parse CSV)
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

// --- METADATA PERSISTENCE (Sidecar Files) ---
// Saves chart state to [filename].meta.json

ipcMain.handle('meta:save', async (event, sourcePath, data) => {
  try {
    validatePath(sourcePath);
    const metaPath = sourcePath + '.meta.json';
    fs.writeFileSync(metaPath, JSON.stringify(data, null, 2));
    return { success: true };
  } catch (e) {
    console.error("Meta save failed:", e);
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

ipcMain.handle('meta:scan', async (event, folderPath) => {
    try {
        if (!fs.existsSync(folderPath)) return [];
        
        const metaFiles = [];
        const scan = (dir) => {
            const list = fs.readdirSync(dir);
            list.forEach((file) => {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                if (stat && stat.isDirectory()) {
                    scan(fullPath);
                } else if (file.endsWith('.meta.json')) {
                    // Return the source path (without .meta.json)
                    metaFiles.push(fullPath.replace('.meta.json', ''));
                }
            });
        };
        scan(folderPath);
        return metaFiles;
    } catch (e) {
        console.error("Meta scan failed:", e);
        return [];
    }
});

// --- TRADE PERSISTENCE (Global Store) ---
// Stores trades in appData/trades.json

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
        console.error("Trade save failed:", e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('trade:get-by-source', async (event, sourceId) => {
    try {
        const dbPath = getTradesPath();
        if (!fs.existsSync(dbPath)) return [];
        
        const raw = fs.readFileSync(dbPath, 'utf8');
        const trades = JSON.parse(raw);
        
        // Filter by the specific data file source
        return trades.filter(t => t.sourceId === sourceId);
    } catch (e) {
        console.error("Trade fetch failed:", e);
        return [];
    }
});

ipcMain.handle('trade:scan', async () => {
    try {
        const dbPath = getTradesPath();
        if (!fs.existsSync(dbPath)) return [];
        
        const raw = fs.readFileSync(dbPath, 'utf8');
        const trades = JSON.parse(raw);
        
        // Return unique sourceIds
        return [...new Set(trades.map(t => t.sourceId))];
    } catch (e) {
        console.error("Trade scan failed:", e);
        return [];
    }
});

// Dialog Handler
ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (canceled) {
    return null;
  } else {
    return { path: filePaths[0], name: path.basename(filePaths[0]) };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
