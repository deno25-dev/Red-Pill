
import { useState, useCallback } from 'react';
import { tauriAPI, isTauri } from '../utils/tauri';

export const useFileSystem = () => {
  const isBridgeAvailable = isTauri();
  
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<any[]>([]);

  const connectFolder = useCallback(async () => {
      // In Tauri mode, we typically scan the Assets folder automatically.
      // If we implement a 'Select Folder' dialog in Rust later, this would invoke it.
      if (isBridgeAvailable) {
          // For now, this is a no-op or just confirms the asset scan
          return 'Assets';
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
      // In web mode, we can't easily check file existence without re-requesting handles
      // Assume true to avoid breaking the UI flow
      return true;
  }, [isBridgeAvailable]);

  const connectDefaultDatabase = useCallback(async () => {
      if (isBridgeAvailable) {
          const internal = await tauriAPI.scanAssets();
          setFiles(internal || []);
          setCurrentPath('Internal Assets');
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
