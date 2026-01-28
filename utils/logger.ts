
export type LogCategory = 'Data' | 'Network' | 'Auth' | 'UI' | 'Perf';

export interface LogEntry {
  id: string;
  timestamp: number;
  category: LogCategory;
  message: string;
  data?: any;
}

const MAX_LOGS = 100;
const logHistory: LogEntry[] = [];

// Dispatch event for the UI to pick up
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

  // Console output
  const style = `color: ${getCategoryColor(category)}; font-weight: bold;`;
  console.log(`%c[${category}]`, style, message, data || '');

  // Internal history
  logHistory.unshift(entry);
  if (logHistory.length > MAX_LOGS) logHistory.pop();

  dispatchLogEvent(entry);
};

export const getLogHistory = () => [...logHistory];

export const clearLogs = () => {
  logHistory.length = 0;
  // Dispatch clear event (using empty detail to signal clear)
  if (typeof window !== 'undefined') {
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
