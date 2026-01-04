

import { useState, useEffect, useCallback } from 'react';
import { debugLog } from '../utils/logger';

export interface FileSystemFile {
  name: string;
  path: string; // Absolute path (Electron)
  handle?: any; // Fallback for Web API
}

// This hook acts as a bridge to the Electron main process.
// All file system operations, including recursive directory scanning,
// are handled in `electron/main.js` to ensure they are performed efficiently
// and correctly handle path information for asset grouping.
export const useFileSystem = () => {
  const [files, setFiles] = useState<FileSystemFile[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [isReady, setIsReady] = useState(false);
  
  const electron = (window as any).electronAPI;

  // Watch for changes coming from the backend
  useEffect(() => {
    if (!electron) return;

    const cleanup = electron.onFolderChange((updatedFiles: any[]) => {
      debugLog('Data', 'FileSystem: Folder content changed', { count: updatedFiles.length });
      setFiles(updatedFiles);
    });

    return () => {
      cleanup();
    };
  }, [electron]);

  const connectFolder = useCallback(async () => {
    if (!electron) return;
    
    try {
      const result = await electron.selectFolder();
      if (result && result.path) {
        setCurrentPath(result.path);
        debugLog('Data', `FileSystem: Watching folder ${result.path}`);
        
        // Start watching
        const initialFiles = await electron.watchFolder(result.path);
        setFiles(initialFiles || []);
        setIsReady(true);
        return result.name;
      }
    } catch (e: any) {
      console.error("Failed to connect folder:", e);
      debugLog('Data', 'FileSystem: Connection failed', e.message);
    }
    return null;
  }, [electron]);

  const connectDefaultDatabase = useCallback(async () => {
      if (!electron) return;
      
      try {
          const dbPath = await electron.getDefaultDatabasePath();
          if (dbPath) {
              setCurrentPath(dbPath);
              debugLog('Data', `FileSystem: Auto-connected to database at ${dbPath}`);
              
              // Start watching
              const initialFiles = await electron.watchFolder(dbPath);
              setFiles(initialFiles || []);
              setIsReady(true);
              return true;
          }
      } catch (e: any) {
          console.error("Failed to connect default database:", e);
          debugLog('Data', 'FileSystem: Auto-connection failed', e.message);
      }
      return false;
  }, [electron]);

  const disconnect = useCallback(async () => {
      if (electron) {
          await electron.unwatchFolder();
      }
      setFiles([]);
      setCurrentPath('');
      setIsReady(false);
  }, [electron]);

  // Validation Guard Logic: Check if a specific file still exists
  const checkFileExists = useCallback(async (filePath: string) => {
      if (!electron) return true; // Assume true in web mode
      const stats = await electron.getFileDetails(filePath);
      return stats.exists;
  }, [electron]);

  return {
    files,
    currentPath,
    isReady,
    isBridgeAvailable: !!electron,
    connectFolder,
    connectDefaultDatabase,
    disconnect,
    checkFileExists
  };
};