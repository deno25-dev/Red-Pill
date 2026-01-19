
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
    },
    {
        id: 'init-004',
        timestamp: Date.now() - 40000,
        type: 'perf',
        message: 'Optimized Replay Engine',
        details: 'Switched from React state updates to direct ref manipulation for chart.update() calls during replay to maintain 60fps.'
    },
    {
        id: 'init-005',
        timestamp: Date.now() - 20000,
        type: 'chore',
        message: 'Split Changelog Systems',
        details: 'Decoupled user-facing "Latest Add" from technical "Dev Logs" to reduce jargon for end-users.'
    }
];
