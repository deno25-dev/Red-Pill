
import { useEffect, useState, useCallback, useRef } from 'react';
import { ChartState, Drawing, ChartConfig, Folder } from '../types';
import { saveChartMeta, loadMasterDrawingsStore } from '../utils/storage';
import { debugLog } from '../utils/logger';
import { tauriBridge } from '../utils/tauriBridge';

interface UseSymbolPersistenceProps {
  symbol: string | null;
  onStateLoaded: (state: ChartState | null) => void;
  drawings: Drawing[];
  folders: Folder[];
  config: ChartConfig | undefined;
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
  const [isHydrating, setIsHydrating] = useState(false);
  const lastLoadedSymbol = useRef<string | null>(null);
  
  // Load state when symbol changes
  useEffect(() => {
    if (!symbol || symbol === lastLoadedSymbol.current) return;
    
    const loadState = async () => {
      setIsHydrating(true);
      try {
        let loadedState: ChartState | null = null;
        
        // 1. Try Tauri/Electron Backend first
        const isTauri = await tauriBridge.checkConnection();
        if (isTauri) {
            // Note: In a real Tauri implementation, we would call invoke('load_chart_state', { sourceId: symbol })
            // For now, we rely on the bridge simulating or reading from local storage if not fully wired
            // But if electronAPI exists (the legacy bridge), we use that.
            const electron = (window as any).electronAPI;
            if (electron && electron.loadMasterDrawings) {
                const result = await electron.loadMasterDrawings();
                if (result && result.data && result.data[symbol]) {
                    loadedState = result.data[symbol];
                }
            }
        } 
        
        // 2. Fallback to IndexedDB/LocalStorage if bridge didn't return data
        if (!loadedState) {
            const masterStore = await loadMasterDrawingsStore();
            if (masterStore && masterStore[symbol]) {
                loadedState = masterStore[symbol];
            }
        }

        if (loadedState) {
            onStateLoaded(loadedState);
            debugLog('Data', `Hydrated state for ${symbol}`);
        } else {
            // New symbol, clear state
            onStateLoaded(null);
        }
      } catch (e) {
        console.error("Failed to load symbol state:", e);
        debugLog('Data', 'Failed to hydrate', e);
      } finally {
        setIsHydrating(false);
        lastLoadedSymbol.current = symbol;
      }
    };

    loadState();
  }, [symbol, onStateLoaded]);

  // Auto-save state when relevant data changes
  useEffect(() => {
    if (!symbol || isHydrating) return;

    const saveTimeout = setTimeout(async () => {
        const stateToSave: ChartState = {
            sourceId: symbol,
            timestamp: Date.now(),
            drawings,
            folders,
            config: config || { 
                showVolume: true, showSMA: false, smaPeriod: 20, chartType: 'candlestick', theme: 'dark', 
                priceScaleMode: 'linear', autoScale: true, showGridlines: true 
            },
            visibleRange
        };

        try {
            // 1. Save to Tauri/Electron Backend
            const isTauri = await tauriBridge.checkConnection();
            if (isTauri) {
                await tauriBridge.saveChartState(symbol, stateToSave);
            } else {
                // 2. Fallback to IndexedDB
                await saveChartMeta(stateToSave);
            }
            // debugLog('Data', `Auto-saved state for ${symbol}`);
        } catch (e) {
            console.error("Auto-save failed", e);
        }
    }, 2000); // 2s debounce

    return () => clearTimeout(saveTimeout);
  }, [symbol, drawings, folders, config, visibleRange, isHydrating]);

  return { isHydrating };
};
