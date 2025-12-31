
import React, { useRef, useCallback, useEffect } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';

export const useDrawingRegistry = (
  chartRef: React.MutableRefObject<IChartApi | null>,
  seriesRef: React.MutableRefObject<ISeriesApi<"Candlestick"> | null>
) => {
  // Registry stores { id, instance }
  const registry = useRef<Map<string, any>>(new Map());

  const register = useCallback((id: string, instance: any) => {
    if (!registry.current.has(id)) {
        registry.current.set(id, instance);
    }
  }, []);

  const unregister = useCallback((id: string) => {
    registry.current.delete(id);
  }, []);

  const forceClear = useCallback(() => {
    console.log('Registry contains:', registry.current.size);
    
    // Iterate and Detach/Remove
    for (const rawItem of Array.from(registry.current.values())) {
        const item = rawItem as any;
        try {
            // Check if it's a Primitive (has _chart, _series usually, or we check if seriesRef can detach it)
            // Note: We prioritize series.detachPrimitive if available and item looks like a primitive
            if (seriesRef.current && typeof (seriesRef.current as any).detachPrimitive === 'function' && item.paneViews) {
                (seriesRef.current as any).detachPrimitive(item);
            } 
            // Check if it's a Series (has setData)
            else if (chartRef.current && typeof (chartRef.current as any).removeSeries === 'function' && item.setData) {
                chartRef.current.removeSeries(item);
            }
            // Fallback: Check if item has a detach method (custom)
            else if (typeof item.detach === 'function') {
                item.detach();
            }
        } catch (e) {
            console.warn("Error clearing registry item:", e);
        }
    }

    // Clear the map
    registry.current.clear();

    // Force Layout Recalculation
    if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
    }
  }, [chartRef, seriesRef]);

  // NUCLEAR RESET LISTENER
  useEffect(() => {
    const handleReset = () => {
        forceClear();
    };
    window.addEventListener('GLOBAL_ASSET_CHANGE', handleReset);
    return () => window.removeEventListener('GLOBAL_ASSET_CHANGE', handleReset);
  }, [forceClear]);

  return { 
    registry, 
    register, 
    unregister, 
    forceClear 
  };
};
