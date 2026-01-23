import { useRef, useCallback } from 'react';

export const useDrawingRegistry = (chartRef: any, seriesRef: any) => {
    const registry = useRef<Map<string, any>>(new Map());

    const register = useCallback((id: string, primitive: any) => {
        registry.current.set(id, primitive);
    }, []);

    const forceClear = useCallback(() => {
        // Force clear logic if needed, primarily handled by state updates in App/Chart
    }, []);

    return { register, forceClear, registry };
};