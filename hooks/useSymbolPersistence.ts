
import { useEffect, useState, useRef, useCallback } from 'react';
import { ChartState, ChartConfig, Drawing, Folder } from '../types';
import { loadMasterDrawingsStore, saveMasterDrawingsStore } from '../utils/storage';
import { useReport } from './useReport';

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
  const { log, info, error } = useReport('Persistence');
  const [isHydrating, setIsHydrating] = useState(true);
  const onStateLoadedRef = useRef(onStateLoaded);
  onStateLoadedRef.current = onStateLoaded;

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

    log(`Linkage Check: Searching for metadata linked to key '${symbol}'`);

    try {
      let state: ChartState | null = null;
      
      if (electron && electron.loadDrawing) {
          const result = await electron.loadDrawing(symbol);
          if (result.success && result.data) {
              state = result.data;
              log(`Linkage Success: Found metadata for '${symbol}'`);
          }
      } else {
          const masterStore = await loadMasterDrawingsStore();
          if (masterStore && masterStore[symbol]) {
            state = masterStore[symbol];
          }
      }

      if (!cancelled) {
        if (state) {
            info(`Loading ${state.drawings.length} drawings`, { symbol });
        } else {
            log(`Linkage: No existing metadata for '${symbol}'. Starting fresh.`);
        }
        onStateLoadedRef.current(state);
      }
    } catch (e: any) {
      console.error("Failed to load chart state:", e);
      error(`Error loading state for ${symbol}`, { error: e.message });
      if (!cancelled) onStateLoadedRef.current(null);
    } finally {
      if (!cancelled) setIsHydrating(false);
    }
  }, [symbol, electron]); 

  // Load initial state
  useEffect(() => {
    loadState();
    return () => {};
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

      const lowerSymbol = symbol.toLowerCase();
      if (lowerSymbol.endsWith('.csv') || lowerSymbol.endsWith('.txt')) {
          const errorMsg = `[SAFETY INTERLOCK] Write blocked for extension key: ${symbol}`;
          error(errorMsg);
          return;
      }

      try {
        if (electron && electron.saveDrawing) {
            await electron.saveDrawing(symbol, stateToSave);
        } else {
            const masterStore = (await loadMasterDrawingsStore()) || {};
            masterStore[symbol] = stateToSave;
            await saveMasterDrawingsStore(masterStore);
        }
        log(`State saved`, { symbol, drawingsCount: stateToSave.drawings.length });
      } catch (e: any) {
        console.error("Failed to save chart state:", e);
        error(`Error saving state for ${symbol}`, { error: e.message });
      }
  }, [symbol, electron]);

  // 1. Debounced Save on Change
  useEffect(() => {
    if (!symbol || isHydrating || !currentStateRef.current) return;

    const handler = setTimeout(() => {
        if (currentStateRef.current) {
            persistState(currentStateRef.current);
        }
    }, 1000); 

    return () => {
      clearTimeout(handler);
    };
  }, [symbol, drawings, folders, config, visibleRange, isHydrating, persistState]);

  // 2. Auto-Save Interval (30s)
  useEffect(() => {
      if (!symbol || isHydrating) return;

      const interval = setInterval(() => {
          if (currentStateRef.current) {
              log(`Auto-saving state (30s interval)`, { symbol });
              persistState(currentStateRef.current);
          }
      }, 30000);

      return () => clearInterval(interval);
  }, [symbol, isHydrating, persistState]);

  return { isHydrating, rehydrate: loadState };
};
