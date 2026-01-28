
import { useState, useEffect, useCallback, useRef } from 'react';
import { debugLog } from '../utils/logger';
import { reportSelf } from './useTelemetry';
import { SanitizationStats, IElectronAPI } from '../types';

export interface FileSystemFile {
  name: string;
  path: string; // Absolute path (Electron)
  handle?: any; // Legacy placeholder
}

// --- MOCK BRIDGE FOR WEB MODE ---
const getMockBridge = (): IElectronAPI => ({
    selectFolder: async () => {
        console.warn("Web Mode: Native directory selection requires browser API or Electron.");
        return null;
    },
    watchFolder: async () => [],
    unwatchFolder: async () => {},
    readChunk: async () => "", 
    getFileDetails: async () => ({ exists: false, size: 0 }),
    getDefaultDatabasePath: async () => "Browser LocalStorage",
    getInternalLibrary: async () => [], // Empty library in web mode
    getInternalFolders: async () => [],
    
    // Persistence -> LocalStorage
    loadMasterDrawings: async () => {
        try {
            const data = localStorage.getItem('redpill_mock_drawings');
            return { success: true, data: data ? JSON.parse(data) : {} };
        } catch { return { success: false, data: {} }; }
    },
    saveMasterDrawings: async (data) => {
        try {
            localStorage.setItem('redpill_mock_drawings', JSON.stringify(data));
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    },
    getDrawingsState: async () => ({}),
    deleteAllDrawings: async (sourceId) => {
        try {
            const raw = localStorage.getItem('redpill_mock_drawings');
            if (raw) {
                const data = JSON.parse(raw);
                delete data[sourceId];
                localStorage.setItem('redpill_mock_drawings', JSON.stringify(data));
            }
            return { success: true };
        } catch (e: any) { return { success: false, error: e.message }; }
    },
    
    saveLayout: async (name, data) => {
        localStorage.setItem(`redpill_layout_${name}`, JSON.stringify(data));
        return { success: true };
    },
    loadLayout: async (name) => {
        const data = localStorage.getItem(`redpill_layout_${name}`);
        return { success: !!data, data: data ? JSON.parse(data) : null };
    },
    listLayouts: async () => [],
    
    getTradesBySource: async (sourceId) => {
        const raw = localStorage.getItem(`redpill_trades_${sourceId}`);
        return raw ? JSON.parse(raw) : [];
    },
    saveTrade: async (trade) => {
        const key = `redpill_trades_${trade.sourceId}`;
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.push(trade);
        localStorage.setItem(key, JSON.stringify(existing));
        return { success: true };
    },
    
    getSystemTelemetry: async () => ({
        processInfo: { version: 'Web-Mock', uptime: performance.now()/1000, pid: 0 },
        resources: { memory: { rss: '0', heapUsed: '0' }, cpu: {}, v8Heap: { used: '0' } },
        ioStatus: { connectionState: 'Simulated', dbPath: 'LocalStorage' },
        logBuffer: []
    }),
    onFolderChange: () => () => {}
});

export const useFileSystem = () => {
  const [files, setFiles] = useState<FileSystemFile[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [isReady, setIsReady] = useState(false);
  
  // 1. Strict State: Only Initializing or Sovereign.
  const [status, setStatus] = useState<'Initializing' | 'ELECTRON_SOVEREIGN' | 'INITIALIZATION_FAILED'>('Initializing');

  const accessHistory = useRef<{ name: string, time: number }[]>([]);
  const electronRef = useRef<any>(null);

  // 3. Telemetry Update
  const sendReport = useCallback((extraData: any = {}) => {
      reportSelf('FileSystem', {
        status: status,
        bridgeDetected: !!window.electronAPI,
        currentPath: currentPath || 'None',
        fileCount: files.length,
        ready: isReady,
        recentAccess: accessHistory.current.slice(0, 5),
        ...extraData
    });
  }, [status, currentPath, files.length, isReady]);

  // Report on state changes
  useEffect(() => {
    sendReport();
  }, [sendReport]);

  // 2. Initialization Effect with Polling & Fallback
  useEffect(() => {
    let mounted = true;
    let attempts = 0;
    const MAX_ATTEMPTS = 20; // 2 seconds total
    const POLLING_INTERVAL = 100;

    const checkBridge = () => {
        if (!mounted) return;

        const api = window.electronAPI;
        if (api) {
            electronRef.current = api;
            setStatus('ELECTRON_SOVEREIGN');
            debugLog('Data', 'FileSystem: Bridge Connected (Sovereign Mode)');

            reportSelf('FileSystem', {
                status: 'ELECTRON_SOVEREIGN',
                bridgeDetected: true,
                currentPath: 'None',
                fileCount: 0,
                ready: false,
                recentAccess: accessHistory.current.slice(0, 5),
                note: 'Bridge Initialized'
            });

            try {
                const cleanup = api.onFolderChange((updatedFiles: any[]) => {
                    debugLog('Data', 'FileSystem: Folder content changed', { count: updatedFiles.length });
                    setFiles(updatedFiles);
                });
            } catch (e) {
                console.error("Failed to attach folder listener:", e);
            }

            return; // Stop polling
        }

        attempts++;
        if (attempts < MAX_ATTEMPTS) {
            // Keep polling
            setTimeout(checkBridge, POLLING_INTERVAL);
        } else {
            // FALLBACK TO MOCK INSTEAD OF CRITICAL FAILURE
            console.warn("Electron Bridge not detected. Injecting Web Mock.");
            
            // Inject Mock
            window.electronAPI = getMockBridge();
            
            // Retry one last time to pick up the mock and init
            setTimeout(checkBridge, 50);
        }
    };

    // Start polling
    checkBridge();

    return () => {
        mounted = false;
    };
  }, []);

  const reportFileLoad = useCallback((filename: string, stats?: SanitizationStats) => {
      const newEntry = { name: filename, time: Date.now() };
      accessHistory.current = [newEntry, ...accessHistory.current].slice(0, 5);

      sendReport({
          lastAction: 'Load',
          loadedFile: filename,
          sanitization: stats || null
      });
  }, [sendReport]);

  // 4. Desktop-Only Methods
  const connectFolder = useCallback(async () => {
    if (status !== 'ELECTRON_SOVEREIGN' || !electronRef.current) {
        console.error("FileSystem: Connect folder blocked. Bridge not sovereign.");
        return null;
    }

    try {
      const result = await electronRef.current.selectFolder();
      if (result && result.path) {
        setCurrentPath(result.path);
        debugLog('Data', `FileSystem: Watching folder ${result.path}`);

        const initialFiles = await electronRef.current.watchFolder(result.path);
        setFiles(initialFiles || []);
        setIsReady(true);
        
        // Immediate report
        reportSelf('FileSystem', {
            status: status,
            bridgeDetected: true,
            currentPath: result.path,
            fileCount: initialFiles?.length || 0,
            ready: true,
            recentAccess: accessHistory.current.slice(0, 5),
            lastAction: 'ConnectFolder'
        });

        return result.name;
      }
    } catch (e: any) {
      console.error("Failed to connect folder:", e);
      debugLog('Data', 'FileSystem: Connection failed', e.message);
    }
    return null;
  }, [status]);

  const connectDefaultDatabase = useCallback(async () => {
      if (status !== 'ELECTRON_SOVEREIGN' || !electronRef.current) {
          console.error("FileSystem: Database connection blocked. Bridge not sovereign.");
          return false;
      }

      try {
          const dbPath = await electronRef.current.getDefaultDatabasePath();
          if (dbPath) {
              setCurrentPath(dbPath);
              debugLog('Data', `FileSystem: Auto-connected to database at ${dbPath}`);

              const initialFiles = await electronRef.current.watchFolder(dbPath);
              setFiles(initialFiles || []);
              setIsReady(true);
              
              reportSelf('FileSystem', {
                  status: status,
                  bridgeDetected: true,
                  currentPath: dbPath,
                  fileCount: initialFiles?.length || 0,
                  ready: true,
                  recentAccess: accessHistory.current.slice(0, 5),
                  lastAction: 'ConnectDefaultDatabase',
                  note: 'Metadata folder (Database) exclusion active'
              });

              return true;
          }
      } catch (e: any) {
          console.error("Failed to connect default database:", e);
          debugLog('Data', 'FileSystem: Auto-connection failed', e.message);
      }
      return false;
  }, [status]);

  const disconnect = useCallback(async () => {
      if (electronRef.current) {
          await electronRef.current.unwatchFolder();
      }
      setFiles([]);
      setCurrentPath('');
      setIsReady(false);
      reportSelf('FileSystem', { 
          status, 
          bridgeDetected: true, 
          currentPath: '', 
          fileCount: 0, 
          ready: false,
          lastAction: 'Disconnect' 
      });
  }, [status]);

  const checkFileExists = useCallback(async (filePath: string) => {
      if (!electronRef.current) return false;
      const stats = await electronRef.current.getFileDetails(filePath);
      return stats.exists;
  }, []);

  return {
    files,
    currentPath,
    isReady,
    isBridgeAvailable: status === 'ELECTRON_SOVEREIGN',
    connectFolder,
    connectDefaultDatabase,
    disconnect,
    checkFileExists,
    reportFileLoad,
    status // Export status for UI feedback
  };
};
