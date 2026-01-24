
import { useState, useEffect, useCallback } from 'react';
import { debugLog } from '../utils/logger';
import { parseCSVChunk } from '../utils/dataUtils';
import { OHLCV } from '../types';
import { tauriBridge } from '../utils/tauriBridge';

export interface FileSystemFile {
  name: string;
  path: string; // Absolute path (Electron/Tauri)
  handle?: any; // Fallback for Web API
}

export const useFileSystem = () => {
  // --- Folder Mode State ---
  const [files, setFiles] = useState<FileSystemFile[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [isReady, setIsReady] = useState(false);
  
  // --- Single File Mode State ---
  const [data, setData] = useState<OHLCV[]>([]);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  
  // --- Shared State ---
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const electron = (window as any).electronAPI;

  // --- Folder Logic (Legacy Electron / Bridge) ---
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
    setIsLoading(true);
    setError(null);
    try {
      const result = await electron.selectFolder();
      if (result && result.path) {
        setCurrentPath(result.path);
        debugLog('Data', `FileSystem: Watching folder ${result.path}`);
        
        const initialFiles = await electron.watchFolder(result.path);
        setFiles(initialFiles || []);
        setIsReady(true);
        return result.name;
      }
    } catch (e: any) {
      console.error("Failed to connect folder:", e);
      debugLog('Data', 'FileSystem: Connection failed', e.message);
      setError(e.message);
    } finally {
        setIsLoading(false);
    }
    return null;
  }, [electron]);

  const connectDefaultDatabase = useCallback(async () => {
      if (!electron) return false;
      
      try {
          const dbPath = await electron.getDefaultDatabasePath();
          if (dbPath) {
              setCurrentPath(dbPath);
              debugLog('Data', `FileSystem: Auto-connected to database at ${dbPath}`);
              
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

  const checkFileExists = useCallback(async (filePath: string) => {
      if (!electron) return true; 
      const stats = await electron.getFileDetails(filePath);
      return stats.exists;
  }, [electron]);

  // --- Single File Logic (Tauri / Web) ---
  const loadFile = useCallback(async (source: string | File) => {
    setIsLoading(true);
    setError(null);

    try {
      const pathStr = typeof source === 'string' ? source : source.name;

      if (pathStr.includes('Database/StickyNotes') || pathStr.includes('Database\\StickyNotes')) {
        throw new Error("Access Forbidden: System Metadata Directory is protected.");
      }

      let rawContent = "";

      // Check if we can use Tauri Bridge
      const isTauri = await tauriBridge.checkConnection();
      
      if (isTauri && typeof source === 'string') {
        // Stream A: Rust Backend (Tauri)
        rawContent = await tauriBridge.readCSVData(source);
      } else if (source instanceof File) {
        // Web Mode Fallback
        rawContent = await source.text();
      }

      if (!rawContent && source instanceof File) {
          rawContent = await source.text();
      }

      if (!rawContent) {
        throw new Error("File is empty or could not be read");
      }

      const rows = rawContent.split('\n');
      const parsedData = parseCSVChunk(rows);
      parsedData.sort((a, b) => a.time - b.time);

      setData(parsedData);
      setCurrentFileName(pathStr.split(/[\\/]/).pop() || pathStr);
      debugLog('Data', `Loaded file: ${pathStr}`, { count: parsedData.length });
      
    } catch (err: any) {
      console.error("[useFileSystem] Load Error:", err);
      setError(err.message || "Failed to load file data");
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    // Folder State
    files,
    currentPath,
    isReady,
    isBridgeAvailable: !!electron, 
    
    // Single File State
    data,
    currentFileName,
    
    // Shared State
    isLoading,
    error,
    
    // Methods
    connectFolder,
    connectDefaultDatabase,
    disconnect,
    checkFileExists,
    loadFile
  };
};
