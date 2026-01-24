
import { useState, useEffect } from 'react';
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
          console.error("Failed to load trades", e);
        }
      } else {
        // Web fallback
        const saved = localStorage.getItem(`trades_${sourceId}`);
        if (saved) {
          try {
            setTrades(JSON.parse(saved));
          } catch (e) { console.error(e); }
        }
      }
    };
    loadTrades();
  }, [sourceId]);

  const saveTrade = async (trade: Trade) => {
    setTrades(prev => [...prev, trade]);
    if (isTauri()) {
      await tauriAPI.saveTrade(trade);
    } else {
      const current = JSON.parse(localStorage.getItem(`trades_${sourceId}`) || '[]');
      localStorage.setItem(`trades_${sourceId}`, JSON.stringify([...current, trade]));
    }
  };

  return { trades, saveTrade };
};
