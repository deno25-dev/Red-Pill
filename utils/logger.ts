
export type LogCategory = 'Data' | 'Network' | 'Auth' | 'UI' | 'Perf';

export interface LogEntry {
  id: string;
  timestamp: number;
  category: LogCategory;
  message: string;
  data?: any;
}

const MAX_LOGS = 200;

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

// Dispatch event for the UI to pick up (Legacy/Reactive support)
const dispatchLogEvent = (entry: LogEntry) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('redpill-debug-log', { detail: entry }));
  }
};

export const debugLog = (category: LogCategory, message: string, data?: any) => {
  const entry: LogEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    category,
    message,
    data
  };

  // Console output with styling
  const style = `color: ${getCategoryColor(category)}; font-weight: bold;`;
  console.log(`%c[${category}]`, style, message, data || '');

  // 1. Internal module history (Legacy)
  logHistory.unshift(entry);
  if (logHistory.length > MAX_LOGS) logHistory.pop();

  // 2. Global Window Persistence (Red Pill Mandate)
  // This ensures logs are accessible across React lifecycles and via the console manually
  if (typeof window !== 'undefined') {
      if (!window.__REDPIL_LOGS__) window.__REDPIL_LOGS__ = [];
      window.__REDPIL_LOGS__.unshift(entry);
      if (window.__REDPIL_LOGS__.length > MAX_LOGS) window.__REDPIL_LOGS__.pop();
  }

  // 3. Dispatch Event
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

function getCategoryColor(cat: LogCategory): string {
  switch (cat) {
    case 'Data': return '#3b82f6'; // Blue
    case 'Network': return '#eab308'; // Yellow
    case 'Auth': return '#ef4444'; // Red
    case 'UI': return '#a855f7'; // Purple
    case 'Perf': return '#10b981'; // Emerald
    default: return '#94a3b8';
  }
}
