import { useState, useEffect, useRef } from 'react';
import { ChartState, TabSession } from '../types';
import { saveChartMeta, loadChartMeta } from '../utils/storage';
import { debugLog } from '../utils/logger';

interface UseChartPersistenceProps {
  tab: TabSession;
  updateTab: (updates: Partial<TabSession>) => void;
}

export const useChartPersistence = ({ tab, updateTab }: UseChartPersistenceProps) => {
  const [isHydrating, setIsHydrating] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSourceIdRef = useRef<string | null>(null);

  // Helper to determine Source ID
  // In Bridge mode, use filePath. In Web mode, use title + timeframe.
  const sourceId = tab.filePath || (tab.title ? `${tab.title}_${tab.timeframe}` : null);

  const electron = (window as any).electronAPI;

  // 1. THE SWITCHER: Hydrate when sourceId changes
  useEffect(() => {
    if (!sourceId || sourceId === lastSourceIdRef.current) return;

    const hydrate = async () => {
      setIsHydrating(true);
      debugLog('Data', `Switching Context: Loading state for ${sourceId}`);
      
      // Clear current drawings to prevent pollution (Drawing Guard)
      updateTab({ drawings: [], visibleRange: null });

      try {
        let loadedState: ChartState | null = null;

        if (electron && tab.filePath) {
          // Electron Bridge Mode: Load from sidecar file
          const result = await electron.loadMeta(tab.filePath);
          if (result.success) {
            loadedState = result.data;
          }
        } else {
          // Web Mode: Load from IndexedDB
          loadedState = await loadChartMeta(sourceId);
        }

        if (loadedState && loadedState.drawings) {
          // VALIDATION: Discard corrupt or ghost drawings
          const validDrawings = loadedState.drawings.filter(d => 
             d && 
             typeof d.id === 'string' && 
             Array.isArray(d.points) && 
             d.points.length > 0 &&
             typeof d.type === 'string'
          );

          if (validDrawings.length < loadedState.drawings.length) {
              debugLog('Data', `Discarded ${loadedState.drawings.length - validDrawings.length} corrupt/ghost drawings during hydration.`);
          }

          debugLog('Data', `Hydrated ${validDrawings.length} drawings for ${sourceId}`);
          updateTab({
            drawings: validDrawings,
            config: { ...tab.config, ...loadedState.config },
            visibleRange: loadedState.visibleRange
          });
        } else {
            debugLog('Data', `No existing state for ${sourceId}. Starting fresh.`);
        }

      } catch (e: any) {
        console.error("Failed to hydrate chart state:", e);
        debugLog('Data', 'Hydration Error', e.message);
      } finally {
        setIsHydrating(false);
        lastSourceIdRef.current = sourceId;
      }
    };

    hydrate();
  }, [sourceId, electron, tab.filePath, updateTab]);

  // 2. THE SAVER: Persist changes
  // Debounced save when drawings, config, or range changes
  useEffect(() => {
    if (isHydrating || !sourceId) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      const stateToSave: ChartState = {
        sourceId,
        timestamp: Date.now(),
        drawings: tab.drawings,
        config: tab.config,
        visibleRange: tab.visibleRange
      };

      try {
        if (electron && tab.filePath) {
            // Electron Bridge Mode
            await electron.saveMeta(tab.filePath, stateToSave);
        } else {
            // Web Mode
            await saveChartMeta(stateToSave);
        }
        debugLog('Data', `Persisted state for ${sourceId}`);
      } catch (e: any) {
        console.error("Failed to save chart state:", e);
        debugLog('Data', 'Persistence Error', e.message);
      }
    }, 1000); // Debounce save by 1 second

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [tab.drawings, tab.config, tab.visibleRange, sourceId, isHydrating, electron, tab.filePath]);

  // FIX: Added missing return statement. The hook must return the state it exposes.
  return { isHydrating };
};
