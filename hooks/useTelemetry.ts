
import { useState, useEffect, useCallback } from 'react';
import { debugLog } from '../utils/logger';

const TELEMETRY_EVENT = 'redpill-telemetry-report';
const MAX_HISTORY = 200;

export interface TelemetryReport {
  status: any;
  timestamp: number;
}

export type TelemetryState = Record<string, TelemetryReport[]>;

export const reportSelf = (name: string, status: Record<string, any> | any) => {
  if (typeof window !== 'undefined') {
    const event = new CustomEvent(TELEMETRY_EVENT, {
      detail: { name, status }
    });
    window.dispatchEvent(event);
  }
};

/**
 * Higher-Order Function to wrap critical logic with automatic telemetry.
 * Captures arguments, errors, and source code upon failure.
 */
export function withTelemetry<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    category: 'Data' | 'Network' | 'ChartEngine' = 'Data'
): T {
    return (async (...args: any[]) => {
        const funcName = fn.name || 'AnonymousFunc';
        try {
            // Optional: Verbose tracing
            // debugLog(category, `Exec: ${funcName}`, { args }, 'INFO', funcName);
            return await fn(...args);
        } catch (error: any) {
            console.error(`[Telemetry] Captured Error in ${funcName}`, error);
            
            debugLog(
                category, 
                `CRITICAL FAILURE: ${funcName}`, 
                { 
                    error: error.message, 
                    stack: error.stack, 
                    arguments: args 
                }, 
                'CRITICAL',
                funcName,
                fn.toString() // Capture Source Code
            );
            throw error;
        }
    }) as T;
}

export const useTelemetry = () => {
  const [reports, setReports] = useState<TelemetryState>({});

  useEffect(() => {
    const handleReport = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (!customEvent.detail) return;

      const { name, status } = customEvent.detail;
      
      setReports((prev) => {
        const history = prev[name] || [];
        // FIFO: Add to front, slice to MAX_HISTORY
        const newHistory = [
            { status, timestamp: Date.now() },
            ...history
        ].slice(0, MAX_HISTORY);
        
        return {
            ...prev,
            [name]: newHistory
        };
      });
    };

    window.addEventListener(TELEMETRY_EVENT, handleReport);

    return () => {
      window.removeEventListener(TELEMETRY_EVENT, handleReport);
    };
  }, []);

  const clearReports = useCallback(() => {
    setReports({});
  }, []);

  const getComponentJSON = useCallback((name: string) => {
    const history = reports[name];
    if (!history || history.length === 0) return JSON.stringify({ error: `Component '${name}' not found` }, null, 2);
    
    const report = history[0];
    
    const exportData = {
        component: name,
        timestamp: new Date(report.timestamp).toISOString(),
        historyCount: history.length,
        state: report.status
    };
    return JSON.stringify(exportData, null, 2);
  }, [reports]);

  const copyToClipboard = useCallback(async (text: string) => {
      if (!navigator?.clipboard) {
          console.warn("[Telemetry] Clipboard API unavailable");
          return false;
      }
      try {
          await navigator.clipboard.writeText(text);
          return true;
      } catch (e) {
          console.error("[Telemetry] Copy failed", e);
          return false;
      }
  }, []);

  return {
    reports,
    reportSelf, 
    clearReports,
    getComponentJSON,
    copyToClipboard
  };
};
