
import { Timeframe } from '../types';

export const BINANCE_INTERVALS = [
  { label: '1m', value: '1m' },
  { label: '3m', value: '3m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '30m', value: '30m' },
  { label: '1h', value: '1h' },
  { label: '2h', value: '2h' },
  { label: '4h', value: '4h' },
  { label: '6h', value: '6h' },
  { label: '8h', value: '8h' },
  { label: '12h', value: '12h' },
  { label: '1d', value: '1d' },
  { label: '3d', value: '3d' },
  { label: '1w', value: '1w' },
  { label: '1M', value: '1M' },
];

export interface BinanceKline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
}

// Helper to get base URL handles Dev Proxy vs Prod Direct
const getBaseUrl = () => {
  // Safely check for import.meta.env
  const meta = import.meta as any;
  if (meta && meta.env && meta.env.DEV) {
    return '/binance';
  }
  return 'https://api.binance.com';
};

// Robust fetcher that tries direct/local-proxy first, then falls back to public CORS proxy
const robustFetch = async (endpoint: string) => {
  const baseUrl = getBaseUrl();
  const directUrl = `${baseUrl}${endpoint}`;
  
  try {
    const response = await fetch(directUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn("Direct fetch failed, attempting CORS proxy fallback...", error);
    
    // Fallback: Public CORS Proxy
    // Note: Use the full absolute URL for the proxy
    const absoluteTarget = `https://api.binance.com${endpoint}`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(absoluteTarget)}`;
    
    const response = await fetch(proxyUrl);
    if (!response.ok) {
       // If proxy also fails, throw original or new error
       throw new Error(`Fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    return await response.json();
  }
};

// Fixed: Added endTime parameter to support range fetching as requested by App.tsx (Line 570 fix)
export const fetchBinanceKlines = async (
  symbol: string,
  interval: string,
  startTime: number,
  limit: number = 1000,
  endTime?: number
): Promise<BinanceKline[]> => {
  const endpoint = `/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startTime}&limit=${limit}${endTime ? `&endTime=${endTime}` : ''}`;
  
  const data = await robustFetch(endpoint);
  
  if (!Array.isArray(data)) {
    throw new Error("Invalid response format from Binance API");
  }
  
  // Map raw array to object
  // [1499040000000, "0.01634790", "0.80000000", "0.01575800", "0.01577100", "148976.11427815", 1499644799999, ...]
  return data.map((d: any[]) => ({
    openTime: d[0],
    open: d[1],
    high: d[2],
    low: d[3],
    close: d[4],
    volume: d[5],
    closeTime: d[6]
  }));
};

export const mapTimeframeToBinance = (tf: Timeframe): string => {
    // Map internal Timeframe enum to Binance string
    switch(tf) {
        case Timeframe.M1: return '1m';
        case Timeframe.M3: return '3m';
        case Timeframe.M5: return '5m';
        case Timeframe.M15: return '15m';
        case Timeframe.H1: return '1h';
        case Timeframe.H4: return '4h';
        case Timeframe.H12: return '12h';
        case Timeframe.D1: return '1d';
        case Timeframe.W1: return '1w';
        case Timeframe.MN1: return '1M';
        case Timeframe.MN12: return '1M'; // No 1y in Binance, fallback to 1M
        default: return '1h';
    }
};
