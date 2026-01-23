
import { useState, useCallback, useEffect } from 'react';
import { tauriAPI, isTauri } from '../utils/tauri';

export const useFileSystem = () => {
  const isBridgeAvailable = isTauri();
  
  const [currentPath, setCurrentPath] = useState<string>('');
  const [files, setFiles] = useState<any[]>([]);

  const connectFolder = useCallback(async () => {
      // In Tauri we might use a dialog, but for now we assume auto-scan of Assets
      return null;
  }, []);

  const disconnect = useCallback(async () => {
      setCurrentPath('');
      setFiles([]);
  }, []);

  const checkFileExists = useCallback(async (path: string) => {
      if (isBridgeAvailable) {
          const details = await tauriAPI.getFileDetails(path);
          return details.exists;
      }
      return true; // Web assumption
  }, [isBridgeAvailable]);

  const connectDefaultDatabase = useCallback(async () => {
      if (isBridgeAvailable) {
          const internal = await tauriAPI.scanAssets();
          setFiles(internal || []);
          setCurrentPath('Internal Database');
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
