
import { useEffect, useState, useRef, useCallback } from 'react';
import { ChartState, ChartConfig, Drawing, Folder } from '../types';
import { loadMasterDrawingsStore, saveMasterDrawingsStore } from '../utils/storage';
import { debugLog } from '../utils/logger';
import { reportSelf } from './useTelemetry';

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

  const electron = window.electronAPI;

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

      if (electron && electron.getDrawingsState) {
          // New SQLite Path: Load specific symbol only
          const result = await electron.getDrawingsState(symbol);
          state = result;
      } else if (electron && electron.loadMasterDrawings) {
          // Fallback legacy
          const result = await electron.loadMasterDrawings();
          if (result.success && result.data && result.data[symbol]) {
              state = result.data[symbol];
          }
      } else {
          // Web Mode
          const masterStore = await loadMasterDrawingsStore();
          if (masterStore && masterStore[symbol]) {
            state = masterStore[symbol];
          }
      }

      if (!cancelled) {
        debugLog('Data', `Persistence: Loaded state for ${symbol}`, state ? 'found' : 'not found');
        if (state) {
            console.log(`[RedPill] Loading ${state.drawings.length} drawings for Symbol: ${symbol}`);
            reportSelf('Persistence', { action: 'Load', symbol, status: 'Success', items: state.drawings.length });
        }
        onStateLoadedRef.current(state);
      }
    } catch (e: any) {
      console.error("Failed to load chart state:", e);
      debugLog('Data', `Persistence: Error loading state for ${symbol}`, e.message);
      reportSelf('Persistence', { action: 'Load', symbol, status: 'Error', error: e.message });
      if (!cancelled) onStateLoadedRef.current(null);
    } finally {
      if (!cancelled) setIsHydrating(false);
    }
  }, [symbol, electron]);

  useEffect(() => {
    loadState();
    return () => { };
  }, [loadState]);

  useEffect(() => {
    if (!symbol || isHydrating) return;

    const handler = setTimeout(async () => {
      const stateToSave: ChartState = {
        sourceId: symbol,
        timestamp: Date.now(),
        drawings,
        folders,
        config,
        visibleRange,
      };

      try {
        if (electron && electron.saveDrawingState) {
            // New SQLite Path
            await electron.saveDrawingState(symbol, stateToSave);
        } else if (electron && electron.saveMasterDrawings) {
            // Fallback Legacy
            const result = await electron.loadMasterDrawings();
            const masterStore = result?.data || {};
            masterStore[symbol] = stateToSave;
            await electron.saveMasterDrawings(masterStore);
        } else {
            // Web Mode
            const masterStore = (await loadMasterDrawingsStore()) || {};
            masterStore[symbol] = stateToSave;
            await saveMasterDrawingsStore(masterStore);
        }

        debugLog('Data', `Persistence: Saved state for ${symbol}`);
        reportSelf('Persistence', { action: 'Save', symbol, status: 'Success' });
      } catch (e: any) {
        console.error("Failed to save chart state:", e);
        debugLog('Data', `Persistence: Error saving state for ${symbol}`, e.message);
        reportSelf('Persistence', { action: 'Save', symbol, status: 'Error', error: e.message });
      }
    }, 1000);

    return () => {
      clearTimeout(handler);
    };
  }, [symbol, drawings, folders, config, visibleRange, isHydrating, electron]);

  return { isHydrating, rehydrate: loadState };
};