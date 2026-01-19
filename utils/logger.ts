
export type LogCategory = 'UI' | 'Network' | 'Data' | 'Auth' | 'Replay' | 'Perf';

export interface LogEntry {
  id: string;
  timestamp: number;
  category: LogCategory;
  message: string;
  data?: any;
}

let logHistory: LogEntry[] = [];

export const debugLog = (category: LogCategory | string, message: string, details?: any) => {
  const entry: LogEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    category: category as LogCategory,
    message,
    data: details
  };
  
  // Keep last 100 logs
  logHistory = [entry, ...logHistory].slice(0, 100);
  
  // Console output for development
  console.debug(`[${category}] ${message}`, details || '');

  // Dispatch event for DeveloperTools UI
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('redpill-debug-log', { detail: entry }));
  }
};

export const getLogHistory = () => logHistory;

export const clearLogs = () => {
  logHistory = [];
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('redpill-debug-clear'));
  }
};
