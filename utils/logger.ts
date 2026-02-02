
export type LogCategory = 'MARKET DATA' | 'IPC BRIDGE' | 'SQLITE' | 'UI' | 'SYSTEM' | 'CHART ENGINE';
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  source: string; // Function/Module name
  codeSnippet?: string; // Optional source code for context
  data?: any; // Payload
}

const MAX_LOGS = 1000;

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
    window.dispatchEvent(new CustomEvent('redpill-log-stream', { detail: entry }));
  }
};

/**
 * STRICT JSON SERIALIZER
 * Removes circular references and converts Maps/Sets to Arrays to prevent Electron IPC crashes.
 */
export const safeSerialize = (obj: any, depth = 0, maxDepth = 4): any => {
    if (depth > maxDepth) return '[Max Depth Reached]';
    if (obj === null || typeof obj !== 'object') return obj;

    // Handle React Synthetic Events (strip them down)
    if (obj._reactName || (obj.nativeEvent && obj.target)) {
        return `[React Event: ${obj.type}]`;
    }

    // Handle DOM Nodes
    if (obj instanceof Element) {
        return `[DOM Element: ${obj.tagName}]`;
    }

    const seen = new WeakSet();
    
    // Helper within closure to handle the specific object tree
    const replacer = (key: string, value: any) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
                return '[Circular]';
            }
            seen.add(value);
        }
        return value;
    };

    try {
        // First pass: standard JSON stringify to catch basic circulars
        const str = JSON.stringify(obj, replacer);
        return JSON.parse(str);
    } catch (e) {
        return `[Unserializable Object: ${e}]`;
    }
};

/**
 * rpLog: The Global Diagnostic Function
 * Mandate: Call this for all critical system events.
 */
export const rpLog = (
    source: string, 
    message: string, 
    data?: any, 
    category: LogCategory = 'SYSTEM',
    level: LogLevel = 'INFO',
    codeSnippet?: string
) => {
  const cleanData = data ? safeSerialize(data) : undefined;

  const entry: LogEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    level,
    category,
    message,
    source,
    codeSnippet,
    data: cleanData
  };

  // 1. Console output with styling
  const color = getLevelColor(level);
  console.log(`%c[${level}] [${category}] ${source}:`, `color: ${color}; font-weight: bold;`, message);

  // 2. Global Window Persistence (RAM)
  if (typeof window !== 'undefined') {
      if (!window.__REDPIL_LOGS__) window.__REDPIL_LOGS__ = [];
      window.__REDPIL_LOGS__.unshift(entry);
      if (window.__REDPIL_LOGS__.length > MAX_LOGS) window.__REDPIL_LOGS__.pop();
  }

  // 3. Internal module history
  logHistory.unshift(entry);
  if (logHistory.length > MAX_LOGS) logHistory.pop();

  // 4. Electron Bridge Transmission (Safe IPC)
  // We strictly send the CLEAN data to avoid Code 134 crashes
  if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.sendLog) {
      window.electronAPI.sendLog(category, message, { 
          level, 
          source,
          // Only send data if it's small, otherwise just send a marker to keep IPC light
          hasData: !!data 
      });
  }

  // 5. Dispatch Event for UI
  dispatchLogEvent(entry);
};

// Alias for backward compatibility, mapped to rpLog
export const debugLog = (
    category: string, 
    message: string, 
    data?: any, 
    level: LogLevel = 'INFO',
    source: string = 'Legacy',
    codeSnippet?: string
) => {
    // Map old categories to new ones if needed, or cast
    rpLog(source, message, data, category as LogCategory, level, codeSnippet);
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
      window.dispatchEvent(new CustomEvent('redpill-log-clear'));
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
