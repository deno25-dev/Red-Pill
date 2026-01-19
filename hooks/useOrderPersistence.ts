
import { useState, useEffect, useCallback } from 'react';
import { Trade } from '../types';
import { debugLog } from '../utils/logger';

const LS_KEY = 'redpill_orders_backup';

export const useOrderPersistence = () => {
    const [orders, setOrders] = useState<Trade[]>([]);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);

    // Load from LS on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(LS_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    setOrders(parsed);
                    debugLog('Data', `Loaded ${parsed.length} orders from local storage cache.`);
                }
            }
        } catch (e) {
            console.error("Failed to load orders from LS", e);
        } finally {
            setIsInitialized(true);
        }
    }, []);

    const addOrder = useCallback((order: Trade) => {
        setOrders(prev => {
            const next = [...prev, order];
            localStorage.setItem(LS_KEY, JSON.stringify(next));
            return next;
        });
        setHasUnsavedChanges(true);
    }, []);

    const syncToDb = useCallback(async () => {
        const electron = (window as any).electronAPI;
        if (electron && electron.syncOrders) {
            try {
                await electron.syncOrders(orders);
                setHasUnsavedChanges(false);
                alert("Orders successfully synced to Database/Orders/orders_history.json");
                debugLog('Data', 'Manual Sync: Orders saved to database.');
            } catch (e) {
                console.error("Sync failed", e);
                alert("Failed to sync orders to database.");
            }
        } else {
            console.warn("Electron API missing for sync");
            alert("Database sync is only available in Desktop mode.");
        }
    }, [orders]);

    return { 
        orders, 
        addOrder, 
        syncToDb, 
        hasUnsavedChanges,
        isInitialized 
    };
};
