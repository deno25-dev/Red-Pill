
import { OHLCV, Timeframe, DrawingPoint } from '../types';

// Simple Random Walk Generator for "Mock" Data
export const generateMockData = (count: number): OHLCV[] => {
  const data: OHLCV[] = [];
  let currentPrice = 50000;
  // Start from roughly 3 days ago to have a nice history ending near "now"
  let currentTime = Date.now() - (count * 60 * 1000); 
  const timeframe = 60 * 1000; // 1 minute base resolution

  for (let i = 0; i < count; i++) {
    const open = currentPrice;
    const volatility = currentPrice * 0.0005; // Reduced volatility for 1m candles
    const change = (Math.random() - 0.5) * volatility;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * (volatility * 0.5);
    const low = Math.min(open, close) - Math.random() * (volatility * 0.5);
    const volume = Math.floor(Math.random() * 50) + 10;

    data.push({
      time: currentTime,
      open,
      high,
      low,
      close,
      volume,
      dateStr: new Date(currentTime).toLocaleString(),
    });

    currentPrice = close;
    currentTime += timeframe;
  }
  return data;
};

// Calculate Simple Moving Average (Optimized Sliding Window)
export const calculateSMA = (data: OHLCV[], period: number): (number | null)[] => {
  const smaData: (number | null)[] = new Array(data.length).fill(null);
  
  if (data.length < period) return smaData;

  let sum = 0;
  
  // Initial window
  for (let i = 0; i < period; i++) {
    sum += data[i].close;
  }
  
  smaData[period - 1] = sum / period;

  // Slide window
  for (let i = period; i < data.length; i++) {
    sum += data[i].close - data[i - period].close;
    smaData[i] = sum / period;
  }
  
  return smaData;
};

// Get duration in ms for a timeframe
export const getTimeframeDuration = (timeframe: Timeframe): number => {
    const map: Record<string, number> = {
        [Timeframe.M1]: 60 * 1000,
        [Timeframe.M3]: 3 * 60 * 1000,
        [Timeframe.M5]: 5 * 60 * 1000,
        [Timeframe.M15]: 15 * 60 * 1000,
        [Timeframe.H1]: 60 * 60 * 1000,
        [Timeframe.H4]: 4 * 60 * 60 * 1000,
        [Timeframe.H12]: 12 * 60 * 60 * 1000,
        [Timeframe.D1]: 24 * 60 * 60 * 1000,
        [Timeframe.W1]: 7 * 24 * 60 * 60 * 1000,
        [Timeframe.MN1]: 30 * 24 * 60 * 60 * 1000,
        [Timeframe.MN12]: 365 * 24 * 60 * 60 * 1000,
    };
    return map[timeframe] || 60 * 1000;
};

// Format ms duration to human readable
export const formatDuration = (ms: number): string => {
    const absMs = Math.abs(ms);
    const mins = Math.floor(absMs / (60 * 1000));
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
        return `${hours}h ${mins % 60}m`;
    }
    return `${mins}m`;
};

// Resample data to a specific timeframe (Optimized Linear Scan)
export const resampleData = (data: OHLCV[], timeframe: Timeframe | string): OHLCV[] => {
  if (!data || data.length === 0) return [];
  
  // If base timeframe, return copy (assumes sorted/deduped by parse/generate)
  if (timeframe === Timeframe.M1) return [...data];

  const period = getTimeframeDuration(timeframe as Timeframe);
  const resampled: OHLCV[] = [];
  
  let currentBucketTime: number | null = null;
  let currentCandle: OHLCV | null = null;

  // Assume data is sorted by time
  for (let i = 0; i < data.length; i++) {
      const d = data[i];
      // Calculate bucket floor
      const bucketTime = Math.floor(d.time / period) * period;

      if (currentBucketTime === null || bucketTime !== currentBucketTime) {
          // Commit previous candle
          if (currentCandle) {
              resampled.push(currentCandle);
          }
          
          // Start new candle
          currentBucketTime = bucketTime;
          currentCandle = {
              time: bucketTime,
              open: d.open,
              high: d.high,
              low: d.low,
              close: d.close,
              volume: d.volume,
              dateStr: new Date(bucketTime).toLocaleString()
          };
      } else {
          // Accumulate into current candle
          if (currentCandle) {
            currentCandle.high = Math.max(currentCandle.high, d.high);
            currentCandle.low = Math.min(currentCandle.low, d.low);
            currentCandle.close = d.close;
            currentCandle.volume += d.volume;
          }
      }
  }

  // Commit final candle
  if (currentCandle) {
      resampled.push(currentCandle);
  }

  return resampled;
};

// --- BRUSH SMOOTHING ALGORITHM ---
// Uses a simple iterative Moving Average approach to smooth out jagged lines
export const smoothPoints = (points: DrawingPoint[], iterations: number): DrawingPoint[] => {
    if (iterations <= 0 || points.length < 3) return points;

    let current = [...points];

    for (let iter = 0; iter < iterations; iter++) {
        const next = [current[0]]; // Always keep start point
        
        for (let i = 1; i < current.length - 1; i++) {
            const prev = current[i - 1];
            const curr = current[i];
            const nxt = current[i + 1];

            // 3-point Moving Average
            next.push({
                time: (prev.time + curr.time + nxt.time) / 3,
                price: (prev.price + curr.price + nxt.price) / 3
            });
        }
        
        next.push(current[current.length - 1]); // Always keep end point
        current = next;
    }

    return current;
};

// --- CHUNK PARSING LOGIC ---

// Optimized parser for a chunk of lines
// Does NOT sort/dedupe internally to be fast; caller must manage order if appending.
export const parseCSVChunk = (lines: string[]): OHLCV[] => {
  const data: OHLCV[] = [];

  for (const line of lines) {
    if (!line || !/^\d/.test(line)) continue; // Skip empty or header lines starting with non-digit

    // Fast split
    const delimiter = line.indexOf(';') > -1 ? ';' : ',';
    const parts = line.split(delimiter);

    if (parts.length < 5) continue;

    try {
        let dateStr = '';
        let open = 0, high = 0, low = 0, close = 0, volume = 0;

        if (parts.length >= 7) {
            const d = parts[0].trim(); 
            const t = parts[1].trim(); 
            // Normalize MT4 date like 2023.01.01 or 20230101
            const cleanD = d.replace(/\./g, '');
            const formattedDate = `${cleanD.substring(0,4)}-${cleanD.substring(4,6)}-${cleanD.substring(6,8)}`;
            dateStr = `${formattedDate}T${t}`;
            
            open = parseFloat(parts[2]);
            high = parseFloat(parts[3]);
            low = parseFloat(parts[4]);
            close = parseFloat(parts[5]);
            volume = parseFloat(parts[6]);
        } else {
             // Standard Format: Timestamp/Date, Open, High, Low, Close, Volume
             dateStr = parts[0].trim();
             open = parseFloat(parts[1]);
             high = parseFloat(parts[2]);
             low = parseFloat(parts[3]);
             close = parseFloat(parts[4]);
             volume = parseFloat(parts[5]);
        }

        if (isNaN(open) || isNaN(close)) continue;

        const timestamp = new Date(dateStr).getTime();

        // Skip invalid dates to prevent chart crashes
        if (isNaN(timestamp)) continue;

        data.push({
            time: timestamp,
            open,
            high,
            low,
            close,
            volume: isNaN(volume) ? 0 : volume,
            dateStr: dateStr
        });
    } catch (e) {
        // Skip malformed lines
    }
  }
  
  return data;
}

// Legacy full parser (wrapper around chunk parser for compatibility)
export const parseCSV = (text: string): OHLCV[] => {
  const lines = text.trim().split('\n');
  const data = parseCSVChunk(lines);
  // Full sort required for full file parse
  data.sort((a, b) => a.time - b.time);
  
  // Deduplicate
  const uniqueData: OHLCV[] = [];
  if (data.length > 0) {
      uniqueData.push(data[0]);
      for (let i = 1; i < data.length; i++) {
          if (data[i].time !== data[i-1].time) {
              uniqueData.push(data[i]);
          }
      }
  }
  return uniqueData;
};

// --- FILE MATCHING LOGIC ---

// Regex patterns for detecting timeframe in filename
// Covers standard conventions (suffix, prefix, no separator)
const TF_PATTERNS: Record<string, RegExp[]> = {
  [Timeframe.M1]: [
    /(?:^|[\W_])1m(?:in)?(?:[\W_]|$)/i, 
    /m1$/i, 
    /_1$/
  ],
  [Timeframe.M3]: [/(?:^|[\W_])3m(?:in)?(?:[\W_]|$)/i, /m3$/i, /_3$/],
  [Timeframe.M5]: [/(?:^|[\W_])5m(?:in)?(?:[\W_]|$)/i, /m5$/i, /_5$/],
  [Timeframe.M15]: [/(?:^|[\W_])15m(?:in)?(?:[\W_]|$)/i, /m15$/i, /_15$/],
  [Timeframe.H1]: [
    /(?:^|[\W_])1h(?:r)?(?:[\W_]|$)/i, 
    /(?:^|[\W_])60m(?:in)?(?:[\W_]|$)/i,
    /h1$/i, 
    /_60$/
  ],
  [Timeframe.H4]: [
    /(?:^|[\W_])4h(?:r)?(?:[\W_]|$)/i, 
    /(?:^|[\W_])240m(?:in)?(?:[\W_]|$)/i,
    /h4$/i,
    /_240$/
  ],
  [Timeframe.H12]: [/(?:^|[\W_])12h(?:r)?(?:[\W_]|$)/i, /h12$/i],
  [Timeframe.D1]: [
    /(?:^|[\W_])1d(?:ay)?(?:[\W_]|$)/i, 
    /d1$/i, 
    /daily/i,
    /_1440$/
  ],
  [Timeframe.W1]: [
    /(?:^|[\W_])1w(?:eek)?(?:[\W_]|$)/i, 
    /w1$/i, 
    /weekly/i
  ],
  [Timeframe.MN1]: [
    /(?:^|[\W_])1M(?:onth)?(?:[\W_]|$)/, 
    /mn1$/i,
    /monthly/i
  ],
  [Timeframe.MN12]: [/(?:^|[\W_])12M(?:onth)?(?:[\W_]|$)/, /1y(?:ear)?/i, /yearly/i],
};

// Extract the "Symbol" part from a filename by stripping extension and timeframe patterns
export const getBaseSymbolName = (filename: string): string => {
  let name = filename.replace(/\.(csv|txt)$/i, '');
  
  // Iterate all known TF patterns and strip them
  Object.values(TF_PATTERNS).flat().forEach(regex => {
    name = name.replace(regex, '');
  });
  
  // Clean up: remove trailing/leading separators
  // Also clean up double separators if middle removal caused them
  return name.replace(/[_\-\s]+$/g, '').replace(/^[_\-\s]+/g, '').toUpperCase();
};

export const findFileForTimeframe = (files: any[], currentTitle: string, targetTf: Timeframe): any | null => {
  if (!files || files.length === 0) return null;

  // 1. Identify the base symbol from the current tab title (which might be from Folder Name)
  // If the chart title was set from a filename like "BTCUSD_1h", this strips "1h" to get "BTCUSD"
  const currentBase = getBaseSymbolName(currentTitle);

  // 2. Search for a file that matches the Base Symbol AND the Target Timeframe pattern
  const patterns = TF_PATTERNS[targetTf] || [];
  
  return files.find(f => {
    // Get the base name of the candidate file
    const fileBase = getBaseSymbolName(f.name);
    
    // MATCH LOGIC:
    // 1. Exact base match (e.g. BTCUSD_1h -> BTCUSD vs BTCUSD_4h -> BTCUSD)
    // 2. Empty file base (e.g. 1h.csv has base "", matches everything in a folder context)
    // 3. Loose containment (e.g. "BTCUSD" is in "COINBASE_BTCUSD_H1")
    const isSymbolMatch = (fileBase === currentBase) || (fileBase === '') || (currentBase && f.name.toUpperCase().includes(currentBase));

    if (!isSymbolMatch) return false;

    // Check if filename contains the target timeframe pattern
    return patterns.some(p => p.test(f.name));
  });
};

// Helper: Scan Directory Recursively
// Updated to be robust against permission errors and invalid handles
export async function scanRecursive(dirHandle: any): Promise<any[]> {
    const files: any[] = [];
    async function traverse(handle: any) {
        if (!handle || typeof handle.values !== 'function') return;
        try {
            // @ts-ignore
            for await (const entry of handle.values()) {
                try {
                    if (entry.kind === 'file') {
                        if (entry.name.toLowerCase().endsWith('.csv') || entry.name.toLowerCase().endsWith('.txt')) {
                           files.push(entry);
                        }
                    } else if (entry.kind === 'directory') {
                        await traverse(entry);
                    }
                } catch (innerErr) {
                    console.warn("Skipping entry due to error:", entry.name, innerErr);
                }
            }
        } catch (err) {
            console.error("Error scanning directory:", handle.name, err);
        }
    }
    await traverse(dirHandle);
    return files;
}
