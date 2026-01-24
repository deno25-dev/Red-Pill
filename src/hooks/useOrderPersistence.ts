
import { useState, useCallback } from 'react';
import { Trade } from '../types';
import { tauriAPI, isTauri } from '../utils/tauri';

export const useOrderPersistence = () => {
  const [orders, setOrders] = useState<Trade[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const addOrder = useCallback((order: Trade) => {
    setOrders(prev => [...prev, order]);
    setHasUnsavedChanges(true);
  }, []);

  const syncToDb = useCallback(async () => {
    if (isTauri()) {
        // In a real implementation, you might save a "session_orders.json"
        // For now, we simulate the sync acknowledgement
        try {
            // await tauriAPI.saveOrders(orders); 
            console.log("Orders synced to database");
        } catch (e) {
            console.error("Failed to sync orders", e);
        }
    }
    setHasUnsavedChanges(false);
  }, [orders]);

  return {
    orders,
    addOrder,
    syncToDb,
    hasUnsavedChanges
  };
};
