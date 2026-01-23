
import { OHLCV, Timeframe, DrawingPoint, SanitizationStats } from '../types';
import { tauriAPI, isTauri } from './tauri';

// --- DATA COMMANDS ---

// Mandate 0.3: The Red Pill Safety Toggle
export const loadProtectedSession = async (fileSource: File | string, chunkSize: number): Promise<{
    rawData: OHLCV[];
    cursor: number;
    leftover: string;
    fileSize: number;
}> => {
    const result = await getLocalChartData(fileSource, chunkSize);
    return result;
};

// Command: get_local_chart_data
export const getLocalChartData = async (fileSource: File | string, chunkSize: number): Promise<{
    rawData: OHLCV[];
    cursor: number;
    leftover: string;
    fileSize: number;
}> => {
    let fileSize = 0;
    
    // Determine size based on environment
    if (typeof fileSource === 'string') {
        if (isTauri()) {
            const stats = await tauriAPI.getFileDetails(fileSource);
            fileSize = stats.size;
        } else if (fileSource.startsWith('/') || fileSource.startsWith('http')) {
            // WEB MODE (FETCH HEAD)
            try {
                const response = await fetch(fileSource, { method: 'HEAD' });
                const length = response.headers.get('content-length');
                if (length) fileSize = parseInt(length, 10);
                else fileSize = 5 * 1024 * 1024; // Fallback estimate
            } catch (e) {
                fileSize = 0;
            }
        }
    } else {
        // Web File Object
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
export const readChunk = async (fileSource: File | string, start: number, end: number): Promise<string> => {
    // Tauri Bridge Path
    if (isTauri() && typeof fileSource === 'string' && !fileSource.startsWith('/')) {
        const length = end - start;
        return await tauriAPI.readChunk(fileSource, start, length);
    }

    // Public Asset Fetch (Web Mode)
    if (typeof fileSource === 'string' && (fileSource.startsWith('/') || fileSource.startsWith('http'))) {
        try {
            const response = await fetch(fileSource);
            if (!response.ok) throw new Error("Failed to fetch asset");
            const text = await response.text();
            return text.slice(start, end);
        } catch (e) {
            console.error("Asset Fetch Error:", e);
            return "";
        }
    }

    // Web File API Fallback
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

// --- BINARY SEARCH UTILITY ---
export const findIndexForTimestamp = (data: OHLCV[], targetTime: number): number => {
    if (!data || data.length === 0) return 0;
    if (targetTime < data[0].time) return 0;
    if (targetTime >= data[data.length - 1].time) return data.length - 1;

    let low = 0;
    let high = data.length - 1;
    let result = 0;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (data[mid].time <= targetTime) {
            result = mid;
            low = mid + 1; 
        } else {
            high = mid - 1;
        }
    }
    return result;
};

// --- DATA SANITIZER ---
export const sanitizeData = (
    data: OHLCV[], 
    timeframeMs: number,
    smoothOutliers: boolean = false
): { data: OHLCV[], stats: SanitizationStats } => {
    const cleanData: OHLCV[] = [];
    const stats: SanitizationStats = { fixedZeroes: 0, fixedLogic: 0, filledGaps: 0, outliers: 0, totalRecords: 0 };
    
    if (data.length === 0) return { data: [], stats };

    for (let i = 0; i < data.length; i++) {
        let candle = { ...data[i] };
        const prev = cleanData.length > 0 ? cleanData[cleanData.length - 1] : null;

        // 1. Zero-Value Fix
        let hadZero = false;
        if (candle.open === 0 || candle.high === 0 || candle.low === 0 || candle.close === 0) {
            if (prev) {
                if (candle.open === 0) candle.open = prev.close;
                if (candle.high === 0) candle.high = prev.close;
                if (candle.low === 0) candle.low = prev.close;
                if (candle.close === 0) candle.close = prev.close;
                hadZero = true;
            } else {
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
        let logicFixed = false;
        if (candle.low > candle.high) { const temp = candle.low; candle.low = candle.high; candle.high = temp; logicFixed = true; }
        if (candle.open > candle.high) { candle.high = candle.open; logicFixed = true; }
        if (candle.close > candle.high) { candle.high = candle.close; logicFixed = true; }
        if (candle.open < candle.low) { candle.low = candle.open; logicFixed = true; }
        if (candle.close < candle.low) { candle.low = candle.close; logicFixed = true; }
        if (logicFixed) stats.fixedLogic++;

        // 3. Gap Filling
        if (prev && timeframeMs > 0) {
            const diff = candle.time - prev.time;
            const tolerance = timeframeMs * 0.1;
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

        cleanData.push(candle);
    }

    stats.totalRecords = cleanData.length;
    return { data: cleanData, stats };
};

// --- UTILS ---
export const calculateSMA = (data: OHLCV[], period: number): (number | null)[] => {
  const smaData: (number | null)[] = new Array(data.length).fill(null);
  if (data.length < period) return smaData;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i].close;
  smaData[period - 1] = sum / period;
  for (let i = period; i < data.length; i++) {
    sum += data[i].close - data[i - period].close;
    smaData[i] = sum / period;
  }
  return smaData;
};

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

export const detectTimeframe = (data: OHLCV[]): Timeframe => {
    if (!data || data.length < 2) return Timeframe.M1;
    const diffs: number[] = [];
    const limit = Math.min(data.length - 1, 200); 
    for(let i = 0; i < limit; i++) {
        const diff = data[i+1].time - data[i].time;
        if (diff > 0) diffs.push(diff);
    }
    if (diffs.length === 0) return Timeframe.M1;
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
    const minutes = Math.round(mode / (60 * 1000));
    if (minutes === 1) return Timeframe.M1;
    if (minutes === 5) return Timeframe.M5;
    if (minutes === 15) return Timeframe.M15;
    if (minutes === 60) return Timeframe.H1;
    if (minutes === 240) return Timeframe.H4;
    if (minutes === 1440) return Timeframe.D1;
    if (minutes === 10080) return Timeframe.W1;
    return Timeframe.D1;
};

export const resampleData = (data: OHLCV[], timeframe: Timeframe | string): OHLCV[] => {
  if (!data || data.length === 0) return [];
  if (timeframe === Timeframe.M1) return [...data];
  const period = getTimeframeDuration(timeframe as Timeframe);
  const resampled: OHLCV[] = [];
  let currentBucketTime: number | null = null;
  let currentCandle: OHLCV | null = null;
  for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const bucketTime = Math.floor(d.time / period) * period;
      if (currentBucketTime === null || bucketTime !== currentBucketTime) {
          if (currentCandle) resampled.push(currentCandle);
          currentBucketTime = bucketTime;
          currentCandle = { time: bucketTime, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume };
      } else {
          if (currentCandle) {
            currentCandle.high = Math.max(currentCandle.high, d.high);
            currentCandle.low = Math.min(currentCandle.low, d.low);
            currentCandle.close = d.close;
            currentCandle.volume += d.volume;
          }
      }
  }
  if (currentCandle) resampled.push(currentCandle);
  return resampled;
};

export const parseCSVChunk = (lines: string[]): OHLCV[] => {
  const data: OHLCV[] = [];
  for (const line of lines) {
    if (!line || !line.trim() || !/^\d/.test(line.trim())) continue;
    const delimiter = line.indexOf(';') > -1 ? ';' : ',';
    const parts = line.split(delimiter);
    if (parts.length < 5) continue;
    try {
        let dateStr = '';
        let timestamp = 0;
        let open = 0, high = 0, low = 0, close = 0, volume = 0;
        const p0 = parts[0].trim();
        const p1 = parts[1].trim();
        const isDateColumn = /^\d{8}$/.test(p0) || /^\d{4}[\.\-\/]\d{2}[\.\-\/]\d{2}$/.test(p0);
        const isTimeColumn = p1.includes(':');
        if (isDateColumn && isTimeColumn) {
            let cleanDate = p0.replace(/[\.\-\/]/g, '');
            if (cleanDate.length === 8) cleanDate = `${cleanDate.substring(0,4)}-${cleanDate.substring(4,6)}-${cleanDate.substring(6,8)}`;
            dateStr = `${cleanDate}T${p1}`;
            open = parseFloat(parts[2]); high = parseFloat(parts[3]); low = parseFloat(parts[4]); close = parseFloat(parts[5]);
            if (parts.length > 6) volume = parseFloat(parts[6]) || 0;
        } else {
             dateStr = p0;
             open = parseFloat(parts[1]); high = parseFloat(parts[2]); low = parseFloat(parts[3]); close = parseFloat(parts[4]);
             if (parts.length > 5) volume = parseFloat(parts[5]) || 0;
        }
        if (isNaN(open) || isNaN(close)) continue;
        timestamp = new Date(dateStr).getTime();
        if (isNaN(timestamp)) {
            timestamp = parseFloat(dateStr);
            if (!isNaN(timestamp) && timestamp < 10000000000) timestamp *= 1000;
        }
        if (isNaN(timestamp) || timestamp <= 0) continue;
        data.push({ time: timestamp, open, high, low, close, volume, dateStr });
    } catch (e) {}
  }
  return data;
}

const TF_PATTERNS: Record<string, RegExp[]> = {
  [Timeframe.M1]: [/(?:^|[\W_])(1m|1mn)(?:in)?(?:[\W_]|$)/i, /m1$/i, /_1$/],
  [Timeframe.M5]: [/(?:^|[\W_])5m(?:in)?(?:[\W_]|$)/i, /m5$/i, /_5$/],
  [Timeframe.M15]: [/(?:^|[\W_])15m(?:in)?(?:[\W_]|$)/i, /m15$/i, /_15$/],
  [Timeframe.H1]: [/(?:^|[\W_])1h(?:r)?(?:[\W_]|$)/i, /(?:^|[\W_])60m(?:in)?(?:[\W_]|$)/i, /h1$/i, /_60$/],
  [Timeframe.H4]: [/(?:^|[\W_])4h(?:r)?(?:[\W_]|$)/i, /(?:^|[\W_])240m(?:in)?(?:[\W_]|$)/i, /h4$/i, /_240$/],
  [Timeframe.D1]: [/(?:^|[\W_])1d(?:ay)?(?:[\W_]|$)/i, /d1$/i, /daily/i, /_1440$/],
  [Timeframe.W1]: [/(?:^|[\W_])1w(?:eek)?(?:[\W_]|$)/i, /w1$/i, /weekly/i],
};

export const getBaseSymbolName = (filename: string): string => {
  let name = filename.replace(/\.(csv|txt|json)$/i, '');
  Object.values(TF_PATTERNS).flat().forEach(regex => { name = name.replace(regex, ''); });
  return name.replace(/[_\-\s]+$/g, '').replace(/^[_\-\s]+/g, '').toUpperCase();
};

export const getSymbolId = (fileName: string, folderName?: string): string => {
  const baseSymbol = getBaseSymbolName(fileName);
  if (folderName && folderName !== '.' && folderName.toLowerCase() !== 'assets') {
    const cleanFolder = folderName.split(/[\\/]/).pop()?.toUpperCase() || '';
    if (cleanFolder && cleanFolder !== baseSymbol) return `${cleanFolder}_${baseSymbol}`;
  }
  return baseSymbol;
};

export const getSourceId = (path: string, type: 'local' | 'asset' = 'local'): string => {
  if (!path) return 'anonymous_source';
  const parts = path.split(/[\\/]/);
  const filename = parts.pop() || '';
  const dirPath = parts.join('/');
  const baseName = getBaseSymbolName(filename);
  const uniqueKey = dirPath ? `${dirPath}/${baseName}` : baseName;
  let hash = 0;
  for (let i = 0; i < uniqueKey.length; i++) { hash = (hash << 5) - hash + uniqueKey.charCodeAt(i); hash |= 0; }
  return `${type}_${hash.toString(16)}`;
};

export const findFileForTimeframe = (files: any[], currentTitle: string, targetTf: Timeframe): any | null => {
  if (!files || files.length === 0) return null;
  const currentBase = getBaseSymbolName(currentTitle);
  const patterns = TF_PATTERNS[targetTf] || [];
  return files.find(f => {
    const fileBase = getBaseSymbolName(f.name);
    const isSymbolMatch = (fileBase === currentBase) || (fileBase === '') || (currentBase && f.name.toUpperCase().includes(currentBase));
    if (!isSymbolMatch) return false;
    return patterns.some(p => p.test(f.name));
  });
};

export async function scanRecursive(dirHandle: any): Promise<any[]> {
    const files: any[] = [];
    async function traverse(handle: any, currentPath: string) {
        if (!handle || typeof handle.values !== 'function') return;
        try {
            // @ts-ignore
            for await (const entry of handle.values()) {
                if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.csv')) {
                   files.push({ name: entry.name, kind: entry.kind, getFile: () => entry.getFile(), folder: currentPath ? currentPath.split('/')[0] : '.', handle: entry });
                } else if (entry.kind === 'directory' && !['Database', 'Metadata'].includes(entry.name)) {
                    await traverse(entry, currentPath ? `${currentPath}/${entry.name}` : entry.name);
                }
            }
        } catch (err) {}
    }
    await traverse(dirHandle, ''); 
    return files;
}

export const formatDuration = (ms: number): string => {
    const absMs = Math.abs(ms);
    const seconds = Math.floor(absMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
};

// Smoothing logic for brush
function perpendicularDistance(p: DrawingPoint, p1: DrawingPoint, p2: DrawingPoint): number {
    const x = p.time, y = p.price, x1 = p1.time, y1 = p1.price, x2 = p2.time, y2 = p2.price;
    const dx = x2 - x1, dy = y2 - y1, lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((x - x1) * (x - x1) + (y - y1) * (y - y1));
    const t = ((x - x1) * dx + (y - y1) * dy) / lenSq;
    let cx, cy;
    if (t < 0) { cx = x1; cy = y1; } else if (t > 1) { cx = x2; cy = y2; } else { cx = x1 + t * dx; cy = y1 + t * dy; }
    const distDx = x - cx, distDy = y - cy;
    return Math.sqrt(distDx * distDx + distDy * distDy);
}

export const ramerDouglasPeucker = (points: DrawingPoint[], epsilon: number): DrawingPoint[] => {
    if (points.length < 3) return points;
    let dmax = 0, index = 0, end = points.length - 1;
    for (let i = 1; i < end; i++) {
        const d = perpendicularDistance(points[i], points[0], points[end]);
        if (d > dmax) { index = i; dmax = d; }
    }
    if (dmax > epsilon) {
        const res1 = ramerDouglasPeucker(points.slice(0, index + 1), epsilon);
        const res2 = ramerDouglasPeucker(points.slice(index), epsilon);
        return res1.slice(0, res1.length - 1).concat(res2);
    } else return [points[0], points[end]];
};

export const smoothPoints = (points: DrawingPoint[], iterations: number): DrawingPoint[] => {
    const validPoints = points.filter(p => Number.isFinite(p.time) && Number.isFinite(p.price) && p.time > 0);
    if (validPoints.length < 3) return validPoints;
    let current = [...validPoints];
    if (iterations > 0) {
        for (let iter = 0; iter < iterations; iter++) {
            const next = [current[0]]; 
            for (let i = 1; i < current.length - 1; i++) {
                next.push({ time: (current[i-1].time + current[i].time + current[i+1].time) / 3, price: (current[i-1].price + current[i].price + current[i+1].price) / 3 });
            }
            next.push(current[current.length - 1]);
            current = next;
        }
    }
    return ramerDouglasPeucker(current, 0);
};
