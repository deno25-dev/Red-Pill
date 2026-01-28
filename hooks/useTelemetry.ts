
import { useState, useEffect, useCallback } from 'react';

const TELEMETRY_EVENT = 'redpill-telemetry-report';
const MAX_HISTORY = 200;

export interface TelemetryReport {
  status: any;
  timestamp: number;
}

export type TelemetryState = Record<string, TelemetryReport[]>;

/**
 * Dispatches a telemetry report event.
 * Can be imported and used by any component, hook, or utility function 
 * to report its status to the central telemetry hub.
 * 
 * Supports nested state objects for detailed diagnostics.
 * Example Usage:
 * reportSelf('ChartEngine', { 
 *    pipeline: { bufferSize: 500, latency: 12 }, 
 *    renderer: { fps: 60, drawCalls: 150 } 
 * });
 * 
 * @param name Unique name of the reporter (e.g., 'ChartEngine', 'DataFeed')
 * @param status Any serializable object representing the current state tree
 */
export const reportSelf = (name: string, status: Record<string, any> | any) => {
  if (typeof window !== 'undefined') {
    const event = new CustomEvent(TELEMETRY_EVENT, {
      detail: { name, status }
    });
    window.dispatchEvent(event);
  }
};

/**
 * Hook to aggregate telemetry reports from across the application.
 * Listens for 'redpill-telemetry-report' events and updates local state.
 * 
 * Ideally used in DeveloperTools or a Dashboard component.
 */
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

  /**
   * Retrieves a formatted, stringified JSON representation of a specific component's LATEST report.
   * Useful for debugging or exporting state snapshots.
   */
  const getComponentJSON = useCallback((name: string) => {
    const history = reports[name];
    if (!history || history.length === 0) return JSON.stringify({ error: `Component '${name}' not found` }, null, 2);
    
    // Default to latest entry
    const report = history[0];
    
    const exportData = {
        component: name,
        timestamp: new Date(report.timestamp).toISOString(),
        historyCount: history.length,
        state: report.status
    };
    return JSON.stringify(exportData, null, 2);
  }, [reports]);

  /**
   * Copies the provided text to the system clipboard.
   * Useful for exporting JSON logs to external tools.
   */
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
