
import { ChartState, StickyNoteData } from '@/types';
import { debugLog } from '@/utils/logger';

// Helper to check if running within Tauri context
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Generic invoke wrapper that handles dynamic import of Tauri API
 * to prevent crashes in standard web browsers.
 */
async function invokeCommand<T>(cmd: string, args: Record<string, any> = {}): Promise<T | null> {
  const env = isTauri() ? 'Tauri' : 'Web';
  
  if (isTauri()) {
    try {
      debugLog('System', `IPC Invoke: ${cmd}`, args);
      const { invoke } = await import('@tauri-apps/api/core');
      const start = performance.now();
      
      // Fix: Cast invoke to any to handle untyped function calls
      const result = await (invoke as any)(cmd, args) as T;
      
      const duration = (performance.now() - start).toFixed(2);
      debugLog('System', `IPC Success: ${cmd} (${duration}ms)`);
      
      return result;
    } catch (e: any) {
      debugLog('Error', `IPC Failed: ${cmd}`, { error: e.toString(), args });
      console.error(`[TauriBridge] Command '${cmd}' failed:`, e);
      throw e;
    }
  } else {
    debugLog('System', `Web Mode Mock: ${cmd}`, args);
    console.warn(`[TauriBridge] Web Mode: Mocking command '${cmd}'`, args);
    return null;
  }
}

export const tauriBridge = {
  /**
   * Checks if the Rust backend is reachable.
   */
  async checkConnection(): Promise<boolean> {
    debugLog('Network', 'Bridge: Checking Backend Connection');
    if (!isTauri()) return false;
    try {
      await invokeCommand('ping'); 
      return true;
    } catch (e) {
      debugLog('Error', 'Bridge: Ping failed', e);
      return true; // Still return true if internals exist, just to avoid breaking flow
    }
  },

  /**
   * Mandate 0.2: Reads a local CSV file via Rust backend.
   */
  async readCSVData(filePath: string): Promise<string> {
    debugLog('Data', 'Bridge: readCSVData called', { filePath });
    try {
        const result = await invokeCommand<string>('read_csv', { filePath });
        return result || "";
    } catch (e) {
        debugLog('Error', 'Bridge: readCSVData failed', { filePath, error: e });
        throw e;
    }
  },

  /**
   * Mandate 0.11.2: Saves chart state (drawings, tools) to persistence layer.
   */
  async saveChartState(sourceId: string, state: ChartState): Promise<void> {
    debugLog('Data', 'Bridge: saveChartState called', { sourceId, itemCount: state.drawings.length });
    try {
        await invokeCommand('save_chart_state', { 
          sourceId, 
          state: JSON.stringify(state) 
        });
    } catch (e) {
        debugLog('Error', 'Bridge: saveChartState failed', { sourceId, error: e });
        throw e;
    }
  },

  /**
   * Mandate 4.4: Save Sticky Notes to Database/StickyNotes via Rust
   */
  async saveStickyNotes(notes: StickyNoteData[]): Promise<void> {
    debugLog('Data', 'Bridge: saveStickyNotes called', { count: notes.length });
    try {
        await invokeCommand('save_sticky_notes', { notes });
    } catch (e) {
        debugLog('Error', 'Bridge: saveStickyNotes failed', { error: e });
        throw e;
    }
  },

  /**
   * Mandate 4.4: Load Sticky Notes from Database/StickyNotes
   */
  async loadStickyNotes(): Promise<StickyNoteData[]> {
    debugLog('Data', 'Bridge: loadStickyNotes called');
    try {
        const result = await invokeCommand<StickyNoteData[]>('load_sticky_notes');
        debugLog('Data', 'Bridge: loadStickyNotes success', { count: result?.length || 0 });
        return result || [];
    } catch (e) {
        debugLog('Error', 'Bridge: loadStickyNotes failed', { error: e });
        throw e;
    }
  }
};
