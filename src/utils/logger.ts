
export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: number;
  component: string; // Domain/Category
  action: string;    // Short Message
  data?: any;        // State Snapshot
  level: LogLevel;
}

let logHistory: LogEntry[] = [];
const MAX_LOGS = 500; // Hard Limit for Memory Safety

// The "Pulse" Logger - Central Telemetry Function
export const report = (
    component: string, 
    action: string, 
    data?: any, 
    level: LogLevel = 'info'
) => {
  const entry: LogEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    component,
    action,
    data: data ? JSON.parse(JSON.stringify(data)) : undefined, // Deep copy to freeze state
    level
  };
  
  // Circular Buffer: Keep only the most recent MAX_LOGS
  logHistory = [entry, ...logHistory].slice(0, MAX_LOGS);
  
  // 1. Send to Standard Console with styling
  const style = level === 'error' ? 'color: #ef4444; font-weight: bold' : 
                level === 'warn' ? 'color: #f59e0b; font-weight: bold' : 
                'color: #3b82f6';
                
  // Console grouping for cleaner output
  if (data) {
      console.groupCollapsed(`%c[${component}] ${action}`, style);
      console.log('Timestamp:', new Date(entry.timestamp).toISOString());
      console.log('Payload:', data);
      console.groupEnd();
  } else {
      console.log(`%c[${component}] ${action}`, style);
  }

  // 2. Send to Dev Panel (Ctrl+D)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('redpill-telemetry', { detail: entry }));
  }
};

// Backward compatibility wrapper for existing calls
export const debugLog = (category: string, message: string, details?: any) => {
    report(category, message, details, 'info');
};

export const getLogHistory = () => logHistory;

export const clearLogs = () => {
  logHistory = [];
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('redpill-telemetry-clear'));
  }
};
