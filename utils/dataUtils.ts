import { OHLCV, Timeframe, DrawingPoint, SanitizationStats } from '../types';

// --- DATA COMMANDS ---

// Mandate 0.3: The Red Pill Safety Toggle
// Enforces Read-Only import logic. This middleware ensures that data is loaded 
// into an immutable memory session and strictly decouples the application from 
// any write capabilities to the source file.
export const loadProtectedSession = async (fileSource: File | string, chunkSize: number): Promise<{
    rawData: OHLCV[];
    cursor: number;
    leftover: string;
    fileSize: number;
}> => {
    // 1. Read Data (Read-Only Stream)
    // This accesses the file via the read-only bridge or File API.
    const result = await getLocalChartData(fileSource, chunkSize);
    
    // 2. RAM-Only Guarantee
    // The returned 'rawData' is a new array in memory. 
    // Modifications to this array (cleaning, sorting) do not affect the disk file.
    // We intentionally do not pass back any file handles that could facilitate writing.
    
    return result;
};

// Command: get_local_chart_data
// Orchestrates reading a file chunk and parsing it into usable chart data
// supports both Web File API and Electron Bridge
export const getLocalChartData = async (fileSource: File | string, chunkSize: number): Promise<{
    rawData: OHLCV[];
    cursor: number;
    leftover: string;
    fileSize: number;
}> => {
    let fileSize = 0;
    
    // Determine size based on environment
    if (typeof fileSource === 'string') {
        // Electron Bridge Mode
        const electron = (window as any).electronAPI;
        if (electron) {
            const stats = await electron.getFileDetails(fileSource);
            fileSize = stats.size;
        }
    } else {
        // Web Mode
        fileSize = fileSource.size;
    }

    const start = Math.max(0, fileSize - chunkSize);
    
    // Read via appropriate bridge
    const text = await readChunk(fileSource, start, fileSize);
    
    const lines = text.split('\n');
    let leftover = '';
    let linesToParse = lines;
    
    if (start > 0) {
        leftover = lines[0];
        linesToParse = lines.slice(1);
    }

    const parsedData = parseCSVChunk(linesToParse);
    parsedData.sort((a, b) => a.time - b.time);
    
    return {
        rawData: parsedData,
        cursor: start,
        leftover,
        fileSize
    };
};

// Utility to read a specific chunk of a local file
// Supports both File object (Web) and Path string (Electron)
export const readChunk = async (fileSource: File | string, start: number, end: number): Promise<string> => {
    const electron = (window as any).electronAPI;

    // Electron Bridge Path
    if (electron && typeof fileSource === 'string') {
        const length = end - start;
        return await electron.readChunk(fileSource, start, length);
    }

    // Web Fallback
    if (fileSource instanceof File) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            const slice = fileSource.slice(start, end);
            reader.onload = (e) => resolve(e.target?.result as string || '');
            reader.onerror = (e) => reject(e);
            reader.readAsText(slice);
        });
    }

    throw new Error("Invalid file source for current environment");
};

// --- DATA SANITIZER ---

export const sanitizeData = (
    data: OHLCV[], 
    timeframeMs: number,
    smoothOutliers: boolean = false
): { data: OHLCV[], stats: SanitizationStats } => {
    const cleanData: OHLCV[] = [];
    const stats: SanitizationStats = { 
        fixedZeroes: 0, 
        fixedLogic: 0, 
        filledGaps: 0, 
        outliers: 0, 
        totalRecords: 0 
    };
    
    if (data.length === 0) return { data: [], stats };

    for (let i = 0; i < data.length; i++) {
        // Clone to avoid mutating original source if needed, though mostly we build new array
        let candle = { ...data[i] };
        
        // Use the last valid candle from our CLEAN list as 'previous'
        const prev = cleanData.length > 0 ? cleanData[cleanData.length - 1] : null;

        // 1. Zero-Value Fix
        // If critical fields are 0, use previous Close
        let hadZero = false;
        if (candle.open === 0 || candle.high === 0 || candle.low === 0 || candle.close === 0) {
            if (prev) {
                if (candle.open === 0) candle.open = prev.close;
                if (candle.high === 0) candle.high = prev.close;
                if (candle.low === 0) candle.low = prev.close;
                if (candle.close === 0) candle.close = prev.close;
                hadZero = true;
            } else {
                // If first candle is 0, we can't do much without context. 
                // Fallback: set to the first non-zero property of itself?
                const fallback = [candle.open, candle.high, candle.low, candle.close].find(v => v !== 0) || 0;
                if (fallback !== 0) {
                    if (candle.open === 0) candle.open = fallback;
                    if (candle.high === 0) candle.high = fallback;
                    if (candle.low === 0) candle.low = fallback;
                    if (candle.close === 0) candle.close = fallback;
                    hadZero = true;
                }
            }
        }
        if (hadZero) stats.fixedZeroes++;

        // 2. Logic Check (H/L Integrity)
        // High must be highest, Low must be lowest
        let logicFixed = false;
        // Fix inverted High/Low
        if (candle.low > candle.high) {
            const temp = candle.low;
            candle.low = candle.high;
            candle.high = temp;
            logicFixed = true;
        }
        // Ensure boundaries
        if (candle.open > candle.high) { candle.high = candle.open; logicFixed = true; }
        if (candle.close > candle.high) { candle.high = candle.close; logicFixed = true; }
        if (candle.open < candle.low) { candle.low = candle.open; logicFixed = true; }
        if (candle.close < candle.low) { candle.low = candle.close; logicFixed = true; }
        
        if (logicFixed) stats.fixedLogic++;

        // 3. Gap Filling
        // If gap is exactly 2x timeframe (with 10% tolerance for jitter), fill it
        if (prev && timeframeMs > 0) {
            const diff = candle.time - prev.time;
            const tolerance = timeframeMs * 0.1;
            // Target gap: 2 * timeframe. 
            // e.g. 1m chart. Prev: 12:00. Curr: 12:02. Diff: 2m. Missing: 12:01.
            if (Math.abs(diff - (2 * timeframeMs)) < tolerance) {
                const filler: OHLCV = {
                    time: prev.time + timeframeMs,
                    open: prev.close,
                    high: prev.close,
                    low: prev.close,
                    close: prev.close,
                    volume: 0,
                    dateStr: new Date(prev.time + timeframeMs).toLocaleString()
                };
                cleanData.push(filler);
                stats.filledGaps++;
            }
        }

        // 4. Outlier Filtering (Flash Crash Protection)
        // 50% move check
        if (prev && prev.close > 0) {
            const pctChange = Math.abs((candle.close - prev.close) / prev.close);
            if (pctChange > 0.5) {
                stats.outliers++;
                if (smoothOutliers) {
                    // Smooth data: Cap the candle at previous close (flat) or some average?
                    // Prompt says "hide these spikes", so we flatten it to prev close usually.
                    candle.open = prev.close;
                    candle.high = prev.close;
                    candle.low = prev.close;
                    candle.close = prev.close;
                }
            }
        }

        cleanData.push(candle);
    }

    stats.totalRecords = cleanData.length;
    return { data: cleanData, stats };
};

// --- EXISTING UTILS ---

// Simple Random Walk Generator for "Mock" Data
export const generateMockData = (count: number): OHLCV[] => {
  const data: OHLCV[] = [];
  let currentPrice = 50000;
  // Start from roughly 3 days ago to have a history ending near "now"
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
        [Timeframe.M30]: 30 * 60 * 1000,
        [Timeframe.H1]: 60 * 60 * 1000,
        [Timeframe.H2]: 2 * 60 * 60 * 1000,
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

// Automatically detect timeframe from data intervals
export const detectTimeframe = (data: OHLCV[]): Timeframe => {
    if (!data || data.length < 2) return Timeframe.M1;

    // Calculate time differences between consecutive candles
    const diffs: number[] = [];
    const limit = Math.min(data.length - 1, 200); // Check first 200 candles to save time
    
    for(let i = 0; i < limit; i++) {
        const diff = data[i+1].time - data[i].time;
        // Ignore zero or negative diffs (duplicate/unsorted)
        if (diff > 0) diffs.push(diff);
    }
    
    if (diffs.length === 0) return Timeframe.M1;

    // Find Mode of differences (most common interval)
    const counts: Record<number, number> = {};
    let maxCount = 0;
    let mode = diffs[0];

    for(const d of diffs) {
        counts[d] = (counts[d] || 0) + 1;
        if(counts[d] > maxCount) {
            maxCount = counts[d];
            mode = d;
        }
    }

    // Convert ms to minutes
    const minutes = Math.round(mode / (60 * 1000));
    
    // Strict matching first
    if (minutes === 1) return Timeframe.M1;
    if (minutes === 3) return Timeframe.M3;
    if (minutes === 5) return Timeframe.M5;
    if (minutes === 15) return Timeframe.M15;
    if (minutes === 30) return Timeframe.M30;
    if (minutes === 60) return Timeframe.H1;
    if (minutes === 120) return Timeframe.H2;
    if (minutes === 240) return Timeframe.H4;
    if (minutes === 720) return Timeframe.H12;
    if (minutes === 1440) return Timeframe.D1;
    if (minutes === 10080) return Timeframe.W1; // 7 * 1440
    
    // Approximate monthly (30 days = 43200 mins)
    if (minutes >= 40000 && minutes <= 45000) return Timeframe.MN1; 
    if (minutes >= 500000) return Timeframe.MN12;

    // Fallbacks for nearest bucket
    if (minutes < 3) return Timeframe.M1;
    if (minutes < 5) return Timeframe.M3;
    if (minutes < 15) return Timeframe.M5;
    if (minutes < 30) return Timeframe.M15;
    if (minutes < 60) return Timeframe.M30;
    if (minutes < 120) return Timeframe.H1;
    if (minutes < 240) return Timeframe.H2;
    if (minutes < 720) return Timeframe.H4;
    if (minutes < 1440) return Timeframe.H12;
    
    return Timeframe.D1;
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

// Helper: Perpendicular Distance of point p from line segment (p1, p2)
// Used for Ramer-Douglas-Peucker
function perpendicularDistance(p: DrawingPoint, p1: DrawingPoint, p2: DrawingPoint): number {
    const x = p.time;
    const y = p.price;
    const x1 = p1.time;
    const y1 = p1.price;
    const x2 = p2.time;
    const y2 = p2.price;

    // Handle case where p1 and p2 are the same point
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
        return Math.sqrt((x - x1) * (x - x1) + (y - y1) * (y - y1));
    }

    // Projection of point onto line
    const t = ((x - x1) * dx + (y - y1) * dy) / lenSq;

    let closestX, closestY;

    if (t < 0) {
        closestX = x1;
        closestY = y1;
    } else if (t > 1) {
        closestX = x2;
        closestY = y2;
    } else {
        closestX = x1 + t * dx;
        closestY = y1 + t * dy;
    }

    const distDx = x - closestX;
    const distDy = y - closestY;
    return Math.sqrt(distDx * distDx + distDy * distDy);
}

// Ramer-Douglas-Peucker Simplification
export const ramerDouglasPeucker = (points: DrawingPoint[], epsilon: number): DrawingPoint[] => {
    if (points.length < 3) return points;

    let dmax = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
        const d = perpendicularDistance(points[i], points[0], points[end]);
        if (d > dmax) {
            index = i;
            dmax = d;
        }
    }

    if (dmax > epsilon) {
        const res1 = ramerDouglasPeucker(points.slice(0, index + 1), epsilon);
        const res2 = ramerDouglasPeucker(points.slice(index), epsilon);
        return res1.slice(0, res1.length - 1).concat(res2);
    } else {
        return [points[0], points[end]];
    }
};

// --- BRUSH SMOOTHING ALGORITHM ---
// Uses Moving Average + RDP Simplification + Robustness Guards
export const smoothPoints = (points: DrawingPoint[], iterations: number): DrawingPoint[] => {
    // 1. Math Guard: Remove Invalid Points immediately
    // Ensure absolute Time is finite and positive
    const validPoints = points.filter(p => 
        Number.isFinite(p.time) && 
        Number.isFinite(p.price) && 
        p.time > 0
    );

    if (validPoints.length < 3) return validPoints;

    let current = [...validPoints];

    // 2. Smoothing Phase (Moving Average)
    if (iterations > 0) {
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
    }

    // 3. Simplification Phase (Ramer-Douglas-Peucker)
    // We use a small epsilon to remove redundant collinear points without losing shape
    // Since Time is large (10^12) compared to Price (10^4), typical Epsilon ~ 0 effectively just cleans exact lines.
    // To properly simplify, we could normalize, but for "Fixing Brush Logic", removing redundant points is usually enough.
    // Let's use Epsilon = 0 to strip perfectly collinear points, or slightly higher to smooth jitter.
    return ramerDouglasPeucker(current, 0);
};

// --- CHUNK PARSING LOGIC ---

// Optimized parser for a chunk of lines
// Does NOT sort/dedupe internally to be fast; caller must manage order if appending.
export const parseCSVChunk = (lines: string[]): OHLCV[] => {
  const data: OHLCV[] = [];

  for (const line of lines) {
    // Skip empty lines or header lines (assuming header doesn't start with digit)
    if (!line || !line.trim() || !/^\d/.test(line.trim())) continue;

    // 1. Auto-Detect Delimiter
    const delimiter = line.indexOf(';') > -1 ? ';' : ',';
    const parts = line.split(delimiter);

    // Require at least 5 columns (Date, Time|Open, High, Low, Close)
    if (parts.length < 5) continue;

    try {
        let dateStr = '';
        let timestamp = 0;
        let open = 0, high = 0, low = 0, close = 0, volume = 0;

        const p0 = parts[0].trim();
        const p1 = parts[1].trim();

        // 2 & 3. Robust Mapping for Split Date/Time (YYYYMMDD + HH:MM:SS)
        // Detection: p0 is 8 digits (YYYYMMDD) or dot/slash date, AND p1 contains ':'
        const isDateColumn = /^\d{8}$/.test(p0) || /^\d{4}[\.\-\/]\d{2}[\.\-\/]\d{2}$/.test(p0);
        const isTimeColumn = p1.includes(':');

        if (isDateColumn && isTimeColumn) {
            // Normalize Date
            let cleanDate = p0.replace(/[\.\-\/]/g, '');
            if (cleanDate.length === 8) {
                cleanDate = `${cleanDate.substring(0,4)}-${cleanDate.substring(4,6)}-${cleanDate.substring(6,8)}`;
            }
            
            // Combine
            dateStr = `${cleanDate}T${p1}`;
            
            // Map OHLCV - indices shifted because time is separate
            open = parseFloat(parts[2]);
            high = parseFloat(parts[3]);
            low = parseFloat(parts[4]);
            close = parseFloat(parts[5]);
            // Volume is optional, usually index 6 in this format
            if (parts.length > 6) {
                const v = parseFloat(parts[6]);
                volume = isNaN(v) ? 0 : v;
            }
        } else {
             // Fallback to Standard (Single Column Date/Timestamp)
             dateStr = p0;
             open = parseFloat(parts[1]);
             high = parseFloat(parts[2]);
             low = parseFloat(parts[3]);
             close = parseFloat(parts[4]);
             if (parts.length > 5) {
                 const v = parseFloat(parts[5]);
                 volume = isNaN(v) ? 0 : v;
             }
        }

        if (isNaN(open) || isNaN(close)) continue;

        timestamp = new Date(dateStr).getTime();

        // Fallback validation for timestamp
        if (isNaN(timestamp)) {
            // Attempt pure numeric parse (e.g. unix timestamp in col 0)
            timestamp = parseFloat(dateStr);
            // Heuristic for seconds vs ms
            if (!isNaN(timestamp) && timestamp < 10000000000) timestamp *= 1000;
        }

        if (isNaN(timestamp) || timestamp <= 0) continue;

        data.push({
            time: timestamp,
            open,
            high,
            low,
            close,
            volume,
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

// --- PERSISTENCE & ID UTILS ---

// Simple hash function to create a consistent numeric ID from a string.
const simpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString(16); // return as hex
};

// Get Source ID (Mandate 11) - UPDATED to share across timeframes
export const getSourceId = (path: string, type: 'local' | 'asset' = 'local'): string => {
  if (!path) return 'anonymous_source';
  
  // 1. Isolate filename from full path to separate directory context if needed
  // However, we want to maintain directory context for uniqueness across folders (e.g. Binance/BTC vs Kraken/BTC)
  // But we want to strip the timeframe suffix from the filename part.
  
  // Split path
  const parts = path.split(/[\\/]/);
  const filename = parts.pop() || '';
  const dirPath = parts.join('/');
  
  // 2. Strip timeframe from filename using getBaseSymbolName logic
  // This converts "BTCUSDT_1h.csv" -> "BTCUSDT"
  const baseName = getBaseSymbolName(filename);
  
  // 3. Reconstruct a unique identity key: Directory + Base Symbol
  // This ensures "Binance/BTC_1h" and "Binance/BTC_5m" share ID,
  // but "Kraken/BTC_1h" has a different ID.
  const uniqueKey = dirPath ? `${dirPath}/${baseName}` : baseName;
  
  return `${type}_${simpleHash(uniqueKey)}`;
};

// --- FILE MATCHING LOGIC ---

// Regex patterns for detecting timeframe in filename
// Covers standard conventions (suffix, prefix, no separator)
const TF_PATTERNS: Record<string, RegExp[]> = {
  [Timeframe.M1]: [
    /(?:^|[\W_])(1m|1mn)(?:in)?(?:[\W_]|$)/i, 
    /m1$/i, 
    /_1$/
  ],
  [Timeframe.M3]: [/(?:^|[\W_])3m(?:in)?(?:[\W_]|$)/i, /m3$/i, /_3$/],
  [Timeframe.M5]: [/(?:^|[\W_])5m(?:in)?(?:[\W_]|$)/i, /m5$/i, /_5$/],
  [Timeframe.M15]: [/(?:^|[\W_])15m(?:in)?(?:[\W_]|$)/i, /m15$/i, /_15$/],
  [Timeframe.M30]: [/(?:^|[\W_])30m(?:in)?(?:[\W_]|$)/i, /m30$/i, /_30$/],
  [Timeframe.H1]: [
    /(?:^|[\W_])1h(?:r)?(?:[\W_]|$)/i, 
    /(?:^|[\W_])60m(?:in)?(?:[\W_]|$)/i,
    /h1$/i, 
    /_60$/
  ],
  [Timeframe.H2]: [/(?:^|[\W_])2h(?:r)?(?:[\W_]|$)/i, /h2$/i, /_120$/],
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
    /(?:^|[\W_])(1M|1mo)(?:onth)?(?:[\W_]|$)/i, 
    /mn1$/i,
    /monthly/i
  ],
  [Timeframe.MN12]: [/(?:^|[\W_])12M(?:onth)?(?:[\W_]|$)/, /1y(?:ear)?/i, /yearly/i],
};

// Extract the "Symbol" part from a filename by stripping extension and timeframe patterns
export const getBaseSymbolName = (filename: string): string => {
  let name = filename.replace(/\.(csv|txt|json)$/i, '');
  
  // Iterate all known TF patterns and strip them
  Object.values(TF_PATTERNS).flat().forEach(regex => {
    name = name.replace(regex, '');
  });
  
  // Clean up: remove trailing/leading separators
  // Also clean up double separators if middle removal caused them
  return name.replace(/[_\-\s]+$/g, '').replace(/^[_\-\s]+/g, '').toUpperCase();
};

// New function for Namespace-Aware Symbol ID
export const getSymbolId = (fileName: string, folderName?: string): string => {
  const baseSymbol = getBaseSymbolName(fileName);
  
  // If a folder name is provided and it's meaningful (not root or generic), prepend it.
  if (folderName && folderName !== '.' && folderName.toLowerCase() !== 'assets') {
    // Clean up folder name (e.g., from path separators) and combine
    const cleanFolder = folderName.split(/[\\/]/).pop()?.toUpperCase() || '';
    if (cleanFolder && cleanFolder !== baseSymbol) {
      return `${cleanFolder}_${baseSymbol}`;
    }
  }
  
  // Default to just the base symbol if no meaningful folder context.
  return baseSymbol;
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
    async function traverse(handle: any, currentPath: string) {
        if (!handle || typeof handle.values !== 'function') return;
        try {
            // @ts-ignore
            for await (const entry of handle.values()) {
                try {
                    if (entry.kind === 'file') {
                        if (entry.name.toLowerCase().endsWith('.csv') || entry.name.toLowerCase().endsWith('.json')) {
                           // The 'entry' is a FileSystemFileHandle. It's not a plain object.
                           // We create a new object that carries the folder info but is compatible with consumers.
                           const fileObject = {
                               name: entry.name,
                               kind: entry.kind,
                               getFile: () => entry.getFile(), // Pass along the method
                               folder: currentPath ? currentPath.split('/')[0] : '.', // Use folder name or '.' for root
                               handle: entry // Keep original handle if needed
                           };
                           files.push(fileObject);
                        }
                    } else if (entry.kind === 'directory') {
                        await traverse(entry, currentPath ? `${currentPath}/${entry.name}` : entry.name);
                    }
                } catch (innerErr) {
                    console.warn("Skipping entry due to error:", entry.name, innerErr);
                }
            }
        } catch (err) {
            console.error("Error scanning directory:", handle.name, err);
        }
    }
    await traverse(dirHandle, ''); // Start with an empty path for the root
    return files;
}