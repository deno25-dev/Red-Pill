import { useState, useCallback } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { ConnectionError } from '../utils/errors';
import { useSmartFetch } from './useSmartFetch';

export interface LiveTicker {
  symbol: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
}

const DEFAULT_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 
  'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT',
  'LINKUSDT', 'LTCUSDT', 'UNIUSDT', 'ATOMUSDT'
];

const STORAGE_KEY = 'redpill_market_symbols';

// Optimization Task 2: Disable SmartFetch
const DEV_DISABLE_SMARTFETCH = true;

export const useMarketPrices = (userSymbol?: string) => {
  // Network Guard
  const isConnected = useOnlineStatus();
  
  // Persistence
  const [watchedSymbols, setWatchedSymbols] = useState<string[]>(() => {
      try {
          const saved = localStorage.getItem(STORAGE_KEY);
          return saved ? JSON.parse(saved) : DEFAULT_SYMBOLS;
      } catch (e) {
          return DEFAULT_SYMBOLS;
      }
  });

  // Track the last successful update time separately from the fetch cycle
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  
  // 1. Define the atomic fetch operation
  const fetchMarketData = useCallback(async (): Promise<LiveTicker[]> => {
    // Optimization: Early exit if disabled
    if (DEV_DISABLE_SMARTFETCH) {
        return [];
    }

    // Construct symbol list
    const symbolsToFetch = new Set(watchedSymbols);
    
    // Add User Symbol if relevant
    if (userSymbol) {
      const normalized = userSymbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      if (normalized.length <= 5 && !normalized.endsWith('USDT') && !normalized.endsWith('USD')) {
         symbolsToFetch.add(`${normalized}USDT`);
      } else {
         symbolsToFetch.add(normalized);
      }
    }

    if (symbolsToFetch.size === 0) return [];

    const symbolParam = JSON.stringify(Array.from(symbolsToFetch));
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${symbolParam}`;
    
    const response = await fetch(url).catch((e) => {
        throw new ConnectionError(`Network request failed: ${e.message}`);
    });

    if (!response.ok) {
        if (response.status === 429) {
             throw new ConnectionError("Rate limited (429). Backing off.");
        }
        throw new ConnectionError(`Market data fetch failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (Array.isArray(data)) {
        setLastUpdated(Date.now());
        // Simple cache update logic could go here
        return data;
    }
    
    throw new Error("Invalid API response format");
  }, [watchedSymbols, userSymbol]);

  // 2. Orchestrate with useSmartFetch
  const { 
    data: tickers, 
    error, 
    isLoading: isSyncing, 
    isSettling, 
    retry 
  } = useSmartFetch<LiveTicker[]>(fetchMarketData, isConnected && !DEV_DISABLE_SMARTFETCH, {
    baseInterval: 30000,    // 30s normal polling
    settlingDelay: 2000,    // 2s surge guard
    initialRetryDelay: 5000, // 5s wait on first error
    maxRetryDelay: 60000     // Cap at 60s
  });

  // 3. Helper Functions
  const addSymbol = useCallback((input: string) => {
      const normalized = input.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      if (!normalized) return;
      
      let symbolToAdd = normalized;
      if (normalized.length <= 5 && !normalized.endsWith('USDT') && !normalized.endsWith('USD') && !normalized.endsWith('BTC') && !normalized.endsWith('ETH')) {
          symbolToAdd = `${normalized}USDT`;
      }

      setWatchedSymbols(prev => {
          if (prev.includes(symbolToAdd)) return prev;
          const newList = [symbolToAdd, ...prev]; 
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
          return newList;
      });
      // Trigger immediate fetch to populate new symbol
      retry();
  }, [retry]);

  const removeSymbol = useCallback((symbol: string) => {
      setWatchedSymbols(prev => {
          const newList = prev.filter(s => s !== symbol);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
          return newList;
      });
  }, []);

  return {
    tickers: tickers || [],
    isConnected: isConnected && !DEV_DISABLE_SMARTFETCH,
    isSyncing,
    isSettling,
    lastUpdated,
    error: error ? error.message : null,
    addSymbol,
    removeSymbol,
    watchedSymbols,
    refetch: retry
  };
};