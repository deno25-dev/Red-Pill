import { useState, useEffect, useCallback } from 'react';
import { Trade } from '../types';
import { tauriAPI, isTauri } from '../utils/tauri';

export const useTradePersistence = (sourceId?: string) => {
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    const loadTrades = async () => {
      if (!sourceId) return;
      
      if (isTauri()) {
        try {
          const loaded = await tauriAPI.getTradesBySource(sourceId);
          if (Array.isArray(loaded)) setTrades(loaded);
        } catch (e) {
          console.error("Failed to load trades from backend", e);
        }
      } else {
        // Web Mode Fallback: Key trades by the source ID (filename/symbol)
        const key = `redpill_trades_${sourceId}`;
        const saved = localStorage.getItem(key);
        if (saved) {
          try {
            setTrades(JSON.parse(saved));
          } catch (e) {
            console.error("Failed to parse local trades", e);
            setTrades([]);
          }
        } else {
            setTrades([]);
        }
      }
    };
    loadTrades();
  }, [sourceId]);

  const saveTrade = useCallback(async (trade: Trade) => {
    setTrades(prev => [...prev, trade]);
    
    if (isTauri()) {
      try {
        await tauriAPI.saveTrade(trade);
      } catch (e) {
        console.error("Failed to save trade to backend", e);
      }
    } else if (sourceId) {
      // Web Mode Persistence
      const key = `redpill_trades_${sourceId}`;
      try {
        const currentData = localStorage.getItem(key);
        const currentTrades = currentData ? JSON.parse(currentData) : [];
        localStorage.setItem(key, JSON.stringify([...currentTrades, trade]));
      } catch (e) {
        console.error("Failed to save trade locally", e);
      }
    }
  }, [sourceId]);

  return { trades, saveTrade };
};