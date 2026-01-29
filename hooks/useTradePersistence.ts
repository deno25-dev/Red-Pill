
import { useState, useCallback, useEffect } from 'react';
import { Trade } from '../types';
import { debugLog } from '../utils/logger';

export const useTradePersistence = (sourceId?: string) => {
    const [trades, setTrades] = useState<Trade[]>([]);
    const [loading, setLoading] = useState(false);
    const electron = window.electronAPI;

    const fetchTrades = useCallback(async () => {
        if (!sourceId || !electron) return;
        
        setLoading(true);
        try {
            // Updated to use the new efficient SQLite handler via Preload
            const result = await electron.getTradesBySource(sourceId);
            setTrades(result || []);
            debugLog('Data', `Loaded ${result.length} trades for source ${sourceId}`);
        } catch (e: any) {
            console.error("Failed to fetch trades:", e);
            debugLog('Data', 'Failed to fetch trades', e.message);
        } finally {
            setLoading(false);
        }
    }, [sourceId, electron]);

    // Initial Load
    useEffect(() => {
        fetchTrades();
    }, [fetchTrades]);

    const saveTrade = useCallback(async (trade: Trade) => {
        if (!electron) {
            // Memory Fallback for non-electron env
            setTrades(prev => [...prev, trade]);
            return;
        }

        try {
            const result = await electron.saveTrade(trade);
            if (result.success) {
                setTrades(prev => [...prev, trade]);
                debugLog('Data', 'Trade saved to database', trade);
            } else {
                console.error("Backend failed to save trade:", result.error);
            }
        } catch (e: any) {
            console.error("Failed to save trade:", e);
        }
    }, [electron]);

    return {
        trades,
        loading,
        saveTrade,
        refetchTrades: fetchTrades
    };
};