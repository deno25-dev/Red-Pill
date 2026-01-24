
import { useState, useEffect } from 'react';
import { ChartState, Drawing, Folder, ChartConfig } from '../types';
import { saveChartMeta, loadMasterDrawingsStore } from '../utils/storage';
import { report } from '../utils/logger';

interface UseSymbolPersistenceProps {
  symbol: string | null;
  onStateLoaded: (state: ChartState | null) => void;
  drawings: Drawing[];
  folders: Folder[];
  config?: ChartConfig;
  visibleRange: { from: number; to: number } | null;
  isReplayActive: boolean;
}

export const useSymbolPersistence = ({
  symbol,
  onStateLoaded,
  drawings,
  folders,
  config,
  visibleRange,
  isReplayActive
}: UseSymbolPersistenceProps) => {
  const [isHydrating, setIsHydrating] = useState(false);

  // Load effect
  useEffect(() => {
    if (!symbol) return;
    
    const load = async () => {
      setIsHydrating(true);
      try {
        const masterStore = await loadMasterDrawingsStore();
        if (masterStore && masterStore[symbol]) {
          report('Persistence', 'State Hydrated', { symbol });
          onStateLoaded(masterStore[symbol]);
        }
      } catch (e) {
        console.error("Failed to load state", e);
      } finally {
        setIsHydrating(false);
      }
    };
    load();
  }, [symbol]);

  // Save effect
  useEffect(() => {
    if (!symbol || isHydrating || isReplayActive) return;

    const timer = setTimeout(() => {
      const state: ChartState = {
        sourceId: symbol,
        timestamp: Date.now(),
        drawings,
        folders,
        config: config || { showVolume: false, showSMA: false, smaPeriod: 20, chartType: 'candlestick', theme: 'dark' },
        visibleRange
      };
      saveChartMeta(state);
    }, 2000);

    return () => clearTimeout(timer);
  }, [symbol, drawings, folders, config, visibleRange, isHydrating, isReplayActive]);

  return { isHydrating };
};
