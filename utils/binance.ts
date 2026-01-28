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

// Active API fetcher with Offline Guard
export const fetchBinanceKlines = async (
  symbol: string,
  interval: string,
  startTime: number,
  limit: number = 1000
): Promise<BinanceKline[]> => {
    if (!navigator.onLine) {
        throw new Error("App is offline. Connect to the internet to download data.");
    }

    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startTime}&limit=${limit}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Binance API Error: ${response.statusText}`);
        }
        const data = await response.json();
        
        // Map array to object
        return data.map((d: any) => ({
            openTime: d[0],
            open: d[1],
            high: d[2],
            low: d[3],
            close: d[4],
            volume: d[5],
            closeTime: d[6]
        }));
    } catch (e) {
        console.error("Fetch failed:", e);
        throw e;
    }
};

export const mapTimeframeToBinance = (tf: Timeframe): string => {
    // Map internal Timeframe enum to Binance string
    switch(tf) {
        case Timeframe.M1: return '1m';
        case Timeframe.M3: return '3m';
        case Timeframe.M5: return '5m';
        case Timeframe.M15: return '15m';
        case Timeframe.M30: return '30m';
        case Timeframe.H1: return '1h';
        case Timeframe.H2: return '2h';
        case Timeframe.H4: return '4h';
        case Timeframe.H12: return '12h';
        case Timeframe.D1: return '1d';
        case Timeframe.W1: return '1w';
        case Timeframe.MN1: return '1M';
        case Timeframe.MN12: return '1M'; // No 1y in Binance, fallback to 1M
        default: return '1h';
    }
};