import { useState, useCallback } from 'react';
import { tauriAPI, isTauri } from '../utils/tauri';
import { scanRecursive } from '../utils/dataUtils';

export const useFileSystem = () => {
  const isBridgeAvailable = isTauri();
  
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<any[]>([]);

  const connectFolder = useCallback(async () => {
      // Tauri Mode
      if (isBridgeAvailable) {
          // In the current architecture, Tauri mostly scans 'Assets' automatically.
          // If we add a manual open dialog command later:
          // const selected = await tauriAPI.openDialog();
          // if (selected) { ... }
          return 'Assets';
      }

      // Web Mode: File System Access API
      if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
          try {
              // @ts-ignore - TS might not know about showDirectoryPicker depending on lib config
              const handle = await window.showDirectoryPicker({ mode: 'read' });
              if (handle) {
                  const scannedFiles = await scanRecursive(handle);
                  setFiles(scannedFiles);
                  setCurrentPath(handle.name);
                  return handle.name;
              }
          } catch (e: any) {
              if (e.name !== 'AbortError') {
                  console.error("FileSystem Error:", e);
              }
          }
      } else {
          console.warn("File System Access API not supported in this environment.");
      }
      return null;
  }, [isBridgeAvailable]);

  const disconnect = useCallback(async () => {
      setCurrentPath('');
      setFiles([]);
  }, []);

  const checkFileExists = useCallback(async (path: string) => {
      if (isBridgeAvailable) {
          const details = await tauriAPI.getFileDetails(path);
          return details.exists;
      }
      // Web mode cannot easily check existence of an arbitrary string path without a handle.
      // We assume true to prevent blocking UI logic, as actual read will fail if missing.
      return true;
  }, [isBridgeAvailable]);

  const connectDefaultDatabase = useCallback(async () => {
      if (isBridgeAvailable) {
          const internal = await tauriAPI.scanAssets();
          setFiles(internal || []);
          setCurrentPath('Internal Assets');
      } else {
          // In Web Mode, we might want to prompt for the 'Database' folder specifically
          // or just rely on connectFolder.
          // For now, this is primarily a bridge feature.
      }
  }, [isBridgeAvailable]);

  return {
      isBridgeAvailable,
      currentPath,
      files,
      connectFolder,
      disconnect,
      checkFileExists,
      connectDefaultDatabase
  };
};