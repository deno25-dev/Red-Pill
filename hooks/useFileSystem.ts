
import { useState, useEffect, useCallback, useRef } from 'react';
import { debugLog } from '../utils/logger';
import { reportSelf } from './useTelemetry';
import { SanitizationStats } from '../types';

export interface FileSystemFile {
  name: string;
  path: string; // Absolute path (Electron)
  handle?: any; // Legacy placeholder
}

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
      const api = window.electronAPI as any;
      const bridgeType = api ? (api.__isMock ? 'MOCK' : 'NATIVE') : 'NONE';

      reportSelf('FileSystem', {
        status: status,
        bridgeDetected: !!window.electronAPI,
        bridgeType: bridgeType,
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

  // 2. Initialization Effect with Polling (NO FALLBACK)
  useEffect(() => {
    let mounted = true;
    let attempts = 0;
    const MAX_ATTEMPTS = 25; // 5 seconds (25 * 200ms) - Increased robustness
    const POLLING_INTERVAL = 200; // Increased interval to allow preload to settle

    const checkBridge = () => {
        if (!mounted) return;

        const api = window.electronAPI;
        if (api) {
            electronRef.current = api;
            setStatus('ELECTRON_SOVEREIGN');
            
            // Check for leftovers of mock, though it should be gone
            const isMock = (api as any).__isMock;
            debugLog('Data', `FileSystem: Bridge Connected (${isMock ? 'Mock' : 'Native'})`);

            reportSelf('FileSystem', {
                status: 'ELECTRON_SOVEREIGN',
                bridgeDetected: true,
                bridgeType: isMock ? 'MOCK' : 'NATIVE',
                currentPath: 'None',
                fileCount: 0,
                ready: false,
                recentAccess: accessHistory.current.slice(0, 5),
                note: 'Bridge Initialized'
            });

            try {
                api.onFolderChange((updatedFiles: any[]) => {
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
            // LOUD FAILURE - DO NOT FALLBACK until fully expired
            console.error("CRITICAL: Electron Bridge Handshake Failed after 5s.");
            setStatus('INITIALIZATION_FAILED');
            debugLog('Auth', 'Bridge initialization failed. App halted.');
            
            reportSelf('FileSystem', {
                status: 'INITIALIZATION_FAILED',
                bridgeDetected: false,
                bridgeType: 'NONE',
                note: 'Handshake Timeout (5s)'
            });
        }
    };

    // Start polling immediately
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
