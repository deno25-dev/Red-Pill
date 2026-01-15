
import { useEffect, useState, useRef, useCallback } from 'react';
import { ChartState, ChartConfig, Drawing, Folder } from '../types';
import { loadMasterDrawingsStore, saveMasterDrawingsStore } from '../utils/storage';
import { debugLog } from '../utils/logger';

// --- MANDATE 0.30: ARCHITECTURAL DEFINITIONS ---
// DATA_SOURCE_PATH: The absolute path to the user's local CSV/TXT file.
//                   ACCESS: READ-ONLY. Managed by useFileSystem / dataUtils.
//                   CONSTRAINT: Never pass this path to a write operation.
//
// PERSISTENCE_PATH: The relative key used to store metadata in the /Database folder.
//                   ACCESS: WRITE-ONLY. Managed by this hook.
//                   FORMAT: strictly JSON (e.g. /Database/Drawings/[symbol].json).

interface UseSymbolPersistenceProps {
  symbol: string | null;
  onStateLoaded: (state: ChartState | null) => void;
  drawings: Drawing[];
  folders?: Folder[];
  config: ChartConfig;
  visibleRange: { from: number; to: number } | null;
}

export const useSymbolPersistence = ({
  symbol,
  onStateLoaded,
  drawings,
  folders,
  config,
  visibleRange,
}: UseSymbolPersistenceProps) => {
  const [isHydrating, setIsHydrating] = useState(true);
  const onStateLoadedRef = useRef(onStateLoaded);
  onStateLoadedRef.current = onStateLoaded;

  // Refs for current state to be used in interval
  const currentStateRef = useRef<ChartState | null>(null);

  const electron = (window as any).electronAPI;

  const loadState = useCallback(async () => {
    if (!symbol) {
      setIsHydrating(false);
      onStateLoadedRef.current(null);
      return;
    }
    
    setIsHydrating(true);
    let cancelled = false;

    // Mandate 0.32: Log the linkage event for audit
    debugLog('Data', `Linkage Check: Searching for metadata linked to key '${symbol}' in Database/Drawings/`);

    try {
      let state: ChartState | null = null;
      
      // Attempt load from new Database structure first
      if (electron && electron.loadDrawing) {
          const result = await electron.loadDrawing(symbol);
          if (result.success && result.data) {
              state = result.data;
              debugLog('Data', `Linkage Success: Found metadata for '${symbol}'`);
          } else if (electron.loadMasterDrawings) {
              // Fallback to legacy master store if not found in new DB
              const res = await electron.loadMasterDrawings();
              if (res.success && res.data && res.data[symbol]) {
                  state = res.data[symbol];
                  debugLog('Data', `Linkage Fallback: Found metadata for '${symbol}' in master store`);
              }
          }
      } else {
          // Web Fallback
          const masterStore = await loadMasterDrawingsStore();
          if (masterStore && masterStore[symbol]) {
            state = masterStore[symbol];
          }
      }

      if (!cancelled) {
        if (state) {
            console.log(`[RedPill] Loading ${state.drawings.length} drawings for Symbol: ${symbol}`);
        } else {
            debugLog('Data', `Linkage: No existing metadata for '${symbol}'. Starting fresh.`);
        }
        onStateLoadedRef.current(state);
      }
    } catch (e: any) {
      console.error("Failed to load chart state:", e);
      debugLog('Data', `Persistence: Error loading state for ${symbol}`, e.message);
      if (!cancelled) onStateLoadedRef.current(null);
    } finally {
      if (!cancelled) setIsHydrating(false);
    }
  }, [symbol, electron]); 

  // Load initial state
  useEffect(() => {
    loadState();
    return () => {
        // cleanup
    };
  }, [loadState]);

  // Keep ref updated for interval saving
  useEffect(() => {
      if (symbol && !isHydrating) {
          currentStateRef.current = {
              sourceId: symbol,
              timestamp: Date.now(),
              drawings,
              folders,
              config,
              visibleRange,
          };
      }
  }, [symbol, drawings, folders, config, visibleRange, isHydrating]);

  // Save Function
  const persistState = useCallback(async (stateToSave: ChartState) => {
      if (!symbol) return;

      // --- MANDATE 0.30: SAFETY INTERLOCK ---
      // Guard against accidental usage of source filenames as persistence keys.
      // We strictly prohibit writing to any key ending in .csv or .txt to prevent 
      // potential file system confusion or overwrite risks, even if the backend 
      // appends .json.
      const lowerSymbol = symbol.toLowerCase();
      if (lowerSymbol.endsWith('.csv') || lowerSymbol.endsWith('.txt')) {
          const errorMsg = `[SAFETY INTERLOCK] Write operation blocked. Attempted to use source file extension for persistence key: ${symbol}`;
          console.error(errorMsg);
          debugLog('Data', errorMsg);
          return; // Strictly abort
      }

      try {
        if (electron && electron.saveDrawing) {
            // New Database Structure: /Database/Drawings/[symbol].json
            // This strictly writes to the Database folder structure.
            await electron.saveDrawing(symbol, stateToSave);
        } else if (electron && electron.saveMasterDrawings) {
            // Legacy Electron
            const result = await electron.loadMasterDrawings();
            const masterStore = result?.data || {};
            masterStore[symbol] = stateToSave;
            await electron.saveMasterDrawings(masterStore);
        } else {
            // Web Fallback
            const masterStore = (await loadMasterDrawingsStore()) || {};
            masterStore[symbol] = stateToSave;
            await saveMasterDrawingsStore(masterStore);
        }
        debugLog('Data', `Persistence: Saved state for ${symbol} to Database/Drawings/`);
      } catch (e: any) {
        console.error("Failed to save chart state:", e);
        debugLog('Data', `Persistence: Error saving state for ${symbol}`, e.message);
      }
  }, [symbol, electron]);

  // 1. Debounced Save on Change
  useEffect(() => {
    if (!symbol || isHydrating || !currentStateRef.current) return;

    const handler = setTimeout(() => {
        if (currentStateRef.current) {
            persistState(currentStateRef.current);
        }
    }, 1000); // 1s debounce

    return () => {
      clearTimeout(handler);
    };
  }, [symbol, drawings, folders, config, visibleRange, isHydrating, persistState]);

  // 2. Auto-Save Interval (30s)
  useEffect(() => {
      if (!symbol || isHydrating) return;

      const interval = setInterval(() => {
          if (currentStateRef.current) {
              debugLog('Data', `Persistence: Auto-saving state for ${symbol} (30s interval)`);
              persistState(currentStateRef.current);
          }
      }, 30000); // 30 seconds

      return () => clearInterval(interval);
  }, [symbol, isHydrating, persistState]);

  return { isHydrating, rehydrate: loadState };
};
