
import React, { useRef, useCallback, useEffect } from 'react';
import { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';

export const useDrawingRegistry = (
  chartRef: React.MutableRefObject<IChartApi | null>,
  seriesRef: React.MutableRefObject<ISeriesApi<SeriesType> | null>
) => {
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
    for (const rawItem of Array.from(registry.current.values())) {
        const item = rawItem as any;
        try {
            if (seriesRef.current && typeof (seriesRef.current as any).detachPrimitive === 'function' && item.paneViews) {
                (seriesRef.current as any).detachPrimitive(item);
            } 
            else if (chartRef.current && typeof (chartRef.current as any).removeSeries === 'function' && item.setData) {
                chartRef.current.removeSeries(item);
            }
            else if (typeof item.detach === 'function') {
                item.detach();
            }
        } catch (e) {
            console.warn("Error clearing registry item:", e);
        }
    }
    registry.current.clear();
    if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
    }
  }, [chartRef, seriesRef]);

  return { 
    registry, 
    register, 
    unregister, 
    forceClear 
  };
};
