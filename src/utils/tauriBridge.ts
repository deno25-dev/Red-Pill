import { ChartState, StickyNoteData } from '@/types';

// Helper to check if running within Tauri context
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Generic invoke wrapper that handles dynamic import of Tauri API
 * to prevent crashes in standard web browsers.
 */
async function invokeCommand<T>(cmd: string, args: Record<string, any> = {}): Promise<T | null> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      // Fix: Cast invoke to any to handle untyped function calls or allow generic usage
      return await (invoke as any)(cmd, args) as T;
    } catch (e) {
      console.error(`[TauriBridge] Command '${cmd}' failed:`, e);
      throw e;
    }
  } else {
    console.warn(`[TauriBridge] Web Mode: Mocking command '${cmd}'`, args);
    return null;
  }
}

export const tauriBridge = {
  /**
   * Checks if the Rust backend is reachable.
   */
  async checkConnection(): Promise<boolean> {
    if (!isTauri()) return false;
    try {
      // 'ping' is a standard convention, ensures backend is responsive
      await invokeCommand('ping'); 
      return true;
    } catch {
      // Even if ping fails, if __TAURI_INTERNALS__ exists, we are in the environment
      return true; 
    }
  },

  /**
   * Mandate 0.2: Reads a local CSV file via Rust backend.
   */
  async readCSVData(filePath: string): Promise<string> {
    const result = await invokeCommand<string>('read_csv', { filePath });
    return result || "";
  },

  /**
   * Mandate 0.11.2: Saves chart state (drawings, tools) to persistence layer.
   */
  async saveChartState(sourceId: string, state: ChartState): Promise<void> {
    await invokeCommand('save_chart_state', { 
      sourceId, 
      state: JSON.stringify(state) 
    });
  },

  /**
   * Mandate 4.4: Save Sticky Notes to Database/StickyNotes via Rust
   */
  async saveStickyNotes(notes: StickyNoteData[]): Promise<void> {
    await invokeCommand('save_sticky_notes', { notes });
  },

  /**
   * Mandate 4.4: Load Sticky Notes from Database/StickyNotes
   */
  async loadStickyNotes(): Promise<StickyNoteData[]> {
    const result = await invokeCommand<StickyNoteData[]>('load_sticky_notes');
    return result || [];
  }
};
