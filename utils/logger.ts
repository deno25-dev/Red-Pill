
export type LogCategory = 'Data' | 'Network' | 'Auth' | 'UI' | 'Perf' | 'Main' | 'SQLite' | 'ChartEngine';
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  source?: string; // Function name
  codeSnippet?: string; // Function source code
  data?: any; // Payload
}

const MAX_LOGS = 500;

// Declare global log array
declare global {
  interface Window {
    __REDPIL_LOGS__: LogEntry[];
  }
}

// Ensure it exists on load
if (typeof window !== 'undefined') {
  window.__REDPIL_LOGS__ = window.__REDPIL_LOGS__ || [];
}

const logHistory: LogEntry[] = [];

// Dispatch event for the UI to pick up
const dispatchLogEvent = (entry: LogEntry) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('redpill-debug-log', { detail: entry }));
  }
};

// Safe JSON serializer to prevent circular reference crashes
const safeSerialize = (obj: any): any => {
    const seen = new WeakSet();
    return JSON.parse(JSON.stringify(obj, (key, value) => {
        if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
                return "[Circular]";
            }
            seen.add(value);
        }
        return value;
    }));
};

export const debugLog = (
    category: LogCategory, 
    message: string, 
    data?: any, 
    level: LogLevel = 'INFO',
    source?: string,
    codeSnippet?: string
) => {
  const entry: LogEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    level,
    category,
    message,
    source,
    codeSnippet,
    data: data ? safeSerialize(data) : undefined
  };

  // 1. Console output with styling
  const color = getLevelColor(level);
  console.log(`%c[${level}] [${category}]`, `color: ${color}; font-weight: bold;`, message);

  // 2. Global Window Persistence
  if (typeof window !== 'undefined') {
      if (!window.__REDPIL_LOGS__) window.__REDPIL_LOGS__ = [];
      window.__REDPIL_LOGS__.unshift(entry);
      if (window.__REDPIL_LOGS__.length > MAX_LOGS) window.__REDPIL_LOGS__.pop();
  }

  // 3. Internal module history
  logHistory.unshift(entry);
  if (logHistory.length > MAX_LOGS) logHistory.pop();

  // 4. Electron Bridge Transmission (Avoid infinite loops if logging FROM main)
  if (category !== 'Main' && category !== 'SQLite' && typeof window !== 'undefined' && window.electronAPI && window.electronAPI.sendLog) {
      // We send a simplified version to avoid massive IPC overhead on large payloads
      window.electronAPI.sendLog(category, message, { level, source });
  }

  // 5. Dispatch Event
  dispatchLogEvent(entry);
};

export const getLogHistory = () => {
    if (typeof window !== 'undefined' && window.__REDPIL_LOGS__) {
        return [...window.__REDPIL_LOGS__];
    }
    return [...logHistory];
};

export const clearLogs = () => {
  logHistory.length = 0;
  if (typeof window !== 'undefined') {
      window.__REDPIL_LOGS__ = [];
      window.dispatchEvent(new CustomEvent('redpill-debug-clear'));
  }
};

function getLevelColor(level: LogLevel): string {
    switch (level) {
        case 'INFO': return '#3b82f6';
        case 'WARN': return '#f59e0b';
        case 'ERROR': return '#ef4444';
        case 'CRITICAL': return '#d946ef';
        default: return '#94a3b8';
    }
}
