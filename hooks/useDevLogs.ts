
import { useState, useEffect, useCallback, useRef } from 'react';
import { DevLogEntry, INITIAL_DEV_LOGS } from '../constants/devLogs';
import { loadDevLogs, saveDevLogs } from '../utils/storage';
import { debugLog } from '../utils/logger';

export const useDevLogs = () => {
    // UI State: Only holds the most recent 100 logs to prevent React rendering lag
    const [logs, setLogs] = useState<DevLogEntry[]>([]);
    const [isInitialized, setIsInitialized] = useState(false);
    
    // Performance: Store FULL history in a non-reactive ref for persistence
    const fullHistoryRef = useRef<DevLogEntry[]>([]);
    
    // Performance: Buffer for incoming logs to throttle UI updates
    const incomingBuffer = useRef<DevLogEntry[]>([]);
    
    // Flag for batch saving to disk
    const hasUnsavedChanges = useRef(false);

    // Load logs on mount
    useEffect(() => {
        const load = async () => {
            try {
                const stored = await loadDevLogs();
                if (stored && Array.isArray(stored)) {
                    fullHistoryRef.current = stored;
                    setLogs(stored.slice(0, 100)); // Initial cap
                } else {
                    fullHistoryRef.current = INITIAL_DEV_LOGS;
                    setLogs(INITIAL_DEV_LOGS);
                }
                setIsInitialized(true);
            } catch (e) {
                console.error("Failed to load dev logs", e);
                fullHistoryRef.current = INITIAL_DEV_LOGS;
                setLogs(INITIAL_DEV_LOGS);
                setIsInitialized(true);
            }
        };
        load();
    }, []);

    // 1. Throttled UI Updater (1 Second Interval)
    // Flushes the incoming buffer to React state once per second
    useEffect(() => {
        const uiInterval = setInterval(() => {
            if (incomingBuffer.current.length > 0) {
                // Snapshot buffer and clear it immediately
                const newLogs = [...incomingBuffer.current];
                incomingBuffer.current = [];

                setLogs(prev => {
                    // Combine and Cap at 100 items for the UI
                    const combined = [...newLogs, ...prev];
                    return combined.slice(0, 100);
                });
            }
        }, 1000);

        return () => clearInterval(uiInterval);
    }, []);

    // 2. Periodic Disk Persister (10 Second Interval)
    // Saves the FULL history to disk if changes occurred
    useEffect(() => {
        const saveInterval = setInterval(async () => {
            if (hasUnsavedChanges.current) {
                try {
                    await saveDevLogs(fullHistoryRef.current);
                    hasUnsavedChanges.current = false;
                } catch(e) {
                    console.error("Background log save failed", e);
                }
            }
        }, 10000); 
        return () => clearInterval(saveInterval);
    }, []);

    const addLog = useCallback(async (entry: Omit<DevLogEntry, 'id' | 'timestamp'>) => {
        const newEntry: DevLogEntry = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            ...entry
        };

        // 1. Update Full History (Source of Truth)
        fullHistoryRef.current = [newEntry, ...fullHistoryRef.current];
        
        // 2. Add to Buffer for next UI tick
        incomingBuffer.current = [newEntry, ...incomingBuffer.current];
        
        // 3. Mark for disk save
        hasUnsavedChanges.current = true;
        
        debugLog('UI', 'System Log Added', newEntry.message);
    }, []);

    const clearLogs = useCallback(async () => {
        const empty: DevLogEntry[] = [];
        setLogs(empty);
        fullHistoryRef.current = empty;
        hasUnsavedChanges.current = true; 
        
        // Force save immediately on clear
        await saveDevLogs(empty);
        hasUnsavedChanges.current = false;
    }, []);

    return {
        logs,
        addLog,
        clearLogs,
        isInitialized
    };
};
