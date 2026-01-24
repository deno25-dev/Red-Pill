
import { useState, useEffect } from 'react';
import { Trade } from '../types';
import { tauriAPI, isTauri } from '../utils/tauri';

export const useOrderPersistence = () => {
  const [orders, setOrders] = useState<Trade[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const addOrder = (order: Trade) => {
    setOrders(prev => [...prev, order]);
    setHasUnsavedChanges(true);
  };

  const syncToDb = async () => {
    if (isTauri()) {
        // Mock implementation for order sync
        // await tauriAPI.saveOrders(orders);
    }
    setHasUnsavedChanges(false);
  };

  return {
    orders,
    addOrder,
    syncToDb,
    hasUnsavedChanges
  };
};
