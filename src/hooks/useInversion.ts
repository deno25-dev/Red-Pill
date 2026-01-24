import { useEffect } from 'react';
import { ChartConfig } from '../types';
import { debugLog } from '../utils/logger';

/**
 * Mandate 4.5: The Inversion Engine
 * Listens for Alt + I (or Opt + I) to toggle the chart scale inversion.
 */
export const useInversion = (
  config: ChartConfig,
  onUpdateConfig: (updates: Partial<ChartConfig>) => void
) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Mandate 4.5: Hotkeys Global listener for Alt + I
      if (e.altKey && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        const newState = !config.invertScale;
        onUpdateConfig({ invertScale: newState });
        debugLog('UI', `Inversion Engine: Scale ${newState ? 'Inverted' : 'Normal'}`);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [config, onUpdateConfig]);

  return config.invertScale;
};
