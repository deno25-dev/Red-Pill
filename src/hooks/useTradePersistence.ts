
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
        // Web Mode Fallback
        const key = `trades_${sourceId}`;
        const saved = localStorage.getItem(key);
        if (saved) {
          try {
            setTrades(JSON.parse(saved));
          } catch (e) {
            console.error("Failed to parse local trades", e);
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
      await tauriAPI.saveTrade(trade);
    } else if (sourceId) {
      const key = `trades_${sourceId}`;
      const current = JSON.parse(localStorage.getItem(key) || '[]');
      localStorage.setItem(key, JSON.stringify([...current, trade]));
    }
  }, [sourceId]);

  return { trades, saveTrade };
};
