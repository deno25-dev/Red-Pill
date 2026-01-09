

import { useEffect, useState, useRef, useCallback } from 'react';
// FIX: Added Folder type to handle chart state persistence.
import { ChartState, ChartConfig, Drawing, Folder } from '../types';
import { loadMasterDrawingsStore, saveMasterDrawingsStore } from '../utils/storage';
import { debugLog } from '../utils/logger';

interface UseSymbolPersistenceProps {
  symbol: string | null;
  onStateLoaded: (state: ChartState | null) => void;
  drawings: Drawing[];
  // FIX: Added folders to the persistence hook properties to save/load folder state.
  folders?: Folder[];
  config: ChartConfig;
  visibleRange: { from: number; to: number } | null;
}

export const useSymbolPersistence = ({
  symbol,
  onStateLoaded,
  drawings,
  // FIX: Destructured folders prop.
  folders,
  config,
  visibleRange,
}: UseSymbolPersistenceProps) => {
  const [isHydrating, setIsHydrating] = useState(true);
  const onStateLoadedRef = useRef(onStateLoaded);
  onStateLoadedRef.current = onStateLoaded;

  const electron = (window as any).electronAPI;

  const loadState = useCallback(async () => {
    if (!symbol) {
      setIsHydrating(false);
      onStateLoadedRef.current(null);
      return;
    }
    
    setIsHydrating(true);
    let cancelled = false;

    try {
      let state: ChartState | null = null;
      
      if (electron && electron.loadMasterDrawings) {
          const result = await electron.loadMasterDrawings();
          if (result.success && result.data && result.data[symbol]) {
              state = result.data[symbol];
          }
      } else {
          const masterStore = await loadMasterDrawingsStore();
          if (masterStore && masterStore[symbol]) {
            state = masterStore[symbol];
          }
      }

      if (!cancelled) {
        debugLog('Data', `Persistence: Loaded state for ${symbol}`, state ? 'found' : 'not found');
        if (state) {
            console.log(`[RedPill] Loading ${state.drawings.length} drawings for Symbol: ${symbol}`);
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
        // No clean cancellation for async, but we handle it via closure if needed
    };
  }, [loadState]);

  // Save state on change (debounced)
  useEffect(() => {
    if (!symbol || isHydrating) return;

    const handler = setTimeout(async () => {
      const stateToSave: ChartState = {
        sourceId: symbol,
        timestamp: Date.now(),
        drawings,
        // FIX: Added folders to the state object that is persisted.
        folders,
        config,
        visibleRange,
      };

      try {
        if (electron && electron.saveMasterDrawings) {
            const result = await electron.loadMasterDrawings();
            const masterStore = result?.data || {};
            masterStore[symbol] = stateToSave;
            await electron.saveMasterDrawings(masterStore);
        } else {
            const masterStore = (await loadMasterDrawingsStore()) || {};
            masterStore[symbol] = stateToSave;
            await saveMasterDrawingsStore(masterStore);
        }
        debugLog('Data', `Persistence: Saved state for ${symbol}`);
      } catch (e: any) {
        console.error("Failed to save chart state:", e);
        debugLog('Data', `Persistence: Error saving state for ${symbol}`, e.message);
      }
    }, 1000); // 1s debounce

    return () => {
      clearTimeout(handler);
    };
  // FIX: Added folders to the dependency array to trigger save on change.
  }, [symbol, drawings, folders, config, visibleRange, isHydrating, electron]);

  return { isHydrating, rehydrate: loadState };
};
