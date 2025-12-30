import { useState, useEffect, useRef, useCallback } from 'react';
import { useOnlineStatus } from './useOnlineStatus';

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

// Command hook: useMarketPrices
// This hook provides the interface for the 'fetch_market_prices' command logic
export const useMarketPrices = (userSymbol?: string) => {
  const [tickers, setTickers] = useState<LiveTicker[]>([]);
  
  // Network Guard: Centralized status check
  // Enforces "Zero-Assumption Connectivity"
  const isConnected = useOnlineStatus();

  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const [error, setError] = useState<string | null>(null);
  
  // Manage custom list with persistence
  const [watchedSymbols, setWatchedSymbols] = useState<string[]>(() => {
      try {
          const saved = localStorage.getItem(STORAGE_KEY);
          return saved ? JSON.parse(saved) : DEFAULT_SYMBOLS;
      } catch (e) {
          return DEFAULT_SYMBOLS;
      }
  });

  const addSymbol = useCallback((input: string) => {
      const normalized = input.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      if (!normalized) return;
      
      // Heuristic: Append USDT if it looks like a coin name (3-5 chars), 
      // otherwise assume it's a full pair if longer.
      let symbolToAdd = normalized;
      if (normalized.length <= 5 && !normalized.endsWith('USDT') && !normalized.endsWith('USD') && !normalized.endsWith('BTC') && !normalized.endsWith('ETH')) {
          symbolToAdd = `${normalized}USDT`;
      }

      setWatchedSymbols(prev => {
          if (prev.includes(symbolToAdd)) return prev;
          const newList = [symbolToAdd, ...prev]; // Add to top
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
          return newList;
      });
  }, []);

  const removeSymbol = useCallback((symbol: string) => {
      setWatchedSymbols(prev => {
          const newList = prev.filter(s => s !== symbol);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
          return newList;
      });
  }, []);
  
  // Track previous prices to determine tick direction for UI animation if needed
  const prevPrices = useRef<Record<string, number>>({});

  useEffect(() => {
    // STRICT OFFLINE GUARD
    // If we are offline, do not attempt to fetch.
    // This prevents errors and unnecessary processing power usage.
    if (!isConnected) {
        return;
    }

    // Command: fetch_market_prices
    // Executes the API call to retrieve live market data
    const fetchMarketPrices = async () => {
      try {
        // Construct symbol list from state
        const symbolsToFetch = new Set(watchedSymbols);
        
        // Try to add the user's current local symbol if it looks like a valid pair
        if (userSymbol) {
          const normalized = userSymbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
          // Heuristic: Append USDT if it looks like a coin name, otherwise assume full pair
          if (normalized.length <= 5 && !normalized.endsWith('USDT') && !normalized.endsWith('USD')) {
             symbolsToFetch.add(`${normalized}USDT`);
          } else {
             symbolsToFetch.add(normalized);
          }
        }

        if (symbolsToFetch.size === 0) return;

        const symbolParam = JSON.stringify(Array.from(symbolsToFetch));
        const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${symbolParam}`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Market data fetch failed');
        
        const data = await response.json();
        
        // Validate array response (Binance returns object on error sometimes)
        if (Array.isArray(data)) {
            setTickers(data);
            setLastUpdated(Date.now());
            setError(null);
            
            // Update cache
            data.forEach((t: any) => {
                prevPrices.current[t.symbol] = parseFloat(t.lastPrice);
            });
        }
      } catch (err) {
        // CRASH PREVENTION: Handle errors silently.
        // We log a warning but do not unmount components or throw.
        // The UI will gracefully show the last cached data or an offline indicator.
        console.warn("Live data fetch skipped or failed:", err);
      }
    };

    // Initial Fetch
    fetchMarketPrices();

    // Poll every 5 seconds
    const interval = setInterval(fetchMarketPrices, 5000);

    return () => clearInterval(interval);
  }, [isConnected, userSymbol, watchedSymbols]);

  return {
    tickers,
    isConnected,
    lastUpdated,
    error,
    addSymbol,
    removeSymbol,
    watchedSymbols
  };
};