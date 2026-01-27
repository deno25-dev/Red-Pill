
export type LogCategory = 'UI' | 'Network' | 'Data' | 'Auth' | 'Replay' | 'Perf' | 'System' | 'Error';

export interface LogEntry {
  id: string;
  timestamp: number;
  category: LogCategory;
  message: string;
  data?: any;
  environment: string; // Track which environment generated the log
}

let logHistory: LogEntry[] = [];

// Environment Detection Logic
// Checks for Tauri internals to determine runtime context
const getEnvironment = (): string => {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    return 'Tauri Environment';
  }
  return 'Web Environment';
};

// Cache the environment status on load
const currentEnv = getEnvironment();

// Log the boot sequence immediately
if (typeof console !== 'undefined') {
    const bootStyle = currentEnv === 'Tauri Environment' 
        ? 'background: #064e3b; color: #34d399; font-weight: bold; padding: 2px 4px; border-radius: 2px;' 
        : 'background: #451a03; color: #fbbf24; font-weight: bold; padding: 2px 4px; border-radius: 2px;';
    console.log(`%c[SYSTEM] Logger Initialized in ${currentEnv}`, bootStyle);
}

export const debugLog = (category: LogCategory | string, message: string, details?: any) => {
  // 1. Determine Standardized Prefix
  let prefix = `[${category.toUpperCase()}]`;
  
  if (category === 'Network') prefix = '[NETWORK]';
  if (category === 'System') prefix = '[SYSTEM]';
  if (category === 'Error' || category.toLowerCase().includes('error')) prefix = '[ERROR]';

  const entry: LogEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    category: category as LogCategory,
    message,
    data: details,
    environment: currentEnv
  };
  
  // 2. Keep last 100 logs in memory for the UI Panel
  logHistory = [entry, ...logHistory].slice(0, 100);
  
  // 3. Robust Console Output
  // Visual cues to differentiate environments instantly in the console
  const envStyle = currentEnv === 'Tauri Environment' 
    ? 'color: #10b981; font-weight: bold;' // Green for Tauri
    : 'color: #f59e0b; font-weight: bold;'; // Orange for Web

  const prefixStyle = category === 'Error' || category.toLowerCase().includes('error')
    ? 'color: #ef4444; font-weight: bold;'
    : 'color: inherit; font-weight: bold;';

  console.debug(
      `%c[${currentEnv}]%c ${prefix} ${message}`, 
      envStyle, 
      prefixStyle, 
      details || ''
  );

  // 4. Dispatch event for DeveloperTools UI
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('redpill-debug-log', { detail: entry }));
  }
};

export const getLogHistory = () => logHistory;

export const clearLogs = () => {
  logHistory = [];
  debugLog('System', 'Log history cleared by user');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('redpill-debug-clear'));
  }
};
