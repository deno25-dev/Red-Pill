
export interface DevLogEntry {
    id: string;
    timestamp: number;
    type: 'feat' | 'fix' | 'chore' | 'refactor' | 'perf';
    message: string;
    details?: string;
}

export const INITIAL_DEV_LOGS: DevLogEntry[] = [
    {
        id: 'init-001',
        timestamp: Date.now() - 100000,
        type: 'feat',
        message: 'Implemented Dual-Stream Data Architecture',
        details: 'Separated local CSV parsing (Stream A) from live Binance WebSocket feeds (Stream B) to ensure offline capabilities.'
    },
    {
        id: 'init-002',
        timestamp: Date.now() - 80000,
        type: 'refactor',
        message: 'Migrated to Lightweight Charts v5',
        details: 'Updated canvas rendering logic for custom primitives (DrawingsPrimitive) to match new API signatures.'
    },
    {
        id: 'init-003',
        timestamp: Date.now() - 60000,
        type: 'feat',
        message: 'Added Sticky Notes Persistence',
        details: 'Implemented atomic write operations for sticky_notes.json via Electron bridge.'
    }
];
