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
    let dbPath = path.join(app.getAppPath(), 'src', 'database');

    if (!app.isPackaged && !fs.existsSync(dbPath)) {
        const devPath = path.join(__dirname, '..', 'src', 'database');
        if (fs.existsSync(devPath)) {
            dbPath = devPath;
        }
    }
    
    if (!fs.existsSync(dbPath)) {
        try {
            fs.mkdirSync(dbPath, { recursive: true });
        } catch (e) {
            console.error("Could not create database folder:", e);
        }
    }
    return dbPath;
};

// --- BOOT SCAN FUNCTION ---
const runBootScan = () => {
    const dbPath = resolveDatabasePath();
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
                } catch (e) {}
            });
        } catch (e) {}
    };

    if (fs.existsSync(dbPath)) {
        scanDir(dbPath);
    }
    
    internalLibraryStorage = results;
    return internalLibraryStorage;
};

// --- IPC HANDLERS ---

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
        else if (file.endsWith('.csv') || file.endsWith('.txt')) res.push({ name: file, path: fullPath, kind: 'file' });
      });
      return res;
    };
    const initialFiles = getFilesRecursive(folderPath);
    watcher = fs.watch(folderPath, { recursive: true }, (eventType, filename) => {
      if (filename && (filename.endsWith('.csv') || filename.endsWith('.txt'))) {
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

app.whenReady().then(() => {
  runBootScan();
  createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });