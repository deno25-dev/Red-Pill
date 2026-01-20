import { useState, useEffect, useCallback } from 'react';
import { DevLogEntry, INITIAL_DEV_LOGS } from '../constants/devLogs';
import { loadDevLogs, saveDevLogs } from '../utils/storage';
import { debugLog } from '../utils/logger';

export const useDevLogs = () => {
    const [logs, setLogs] = useState<DevLogEntry[]>([]);
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const stored = await loadDevLogs();
                if (stored && Array.isArray(stored)) {
                    setLogs(stored);
                } else {
                    setLogs(INITIAL_DEV_LOGS);
                }
                setIsInitialized(true);
            } catch (e) {
                console.error("Failed to load dev logs", e);
                setLogs(INITIAL_DEV_LOGS);
                setIsInitialized(true);
            }
        };
        load();
    }, []);

    const addLog = useCallback(async (entry: Omit<DevLogEntry, 'id' | 'timestamp'>) => {
        const newEntry: DevLogEntry = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            ...entry
        };

        setLogs(prev => {
            const next = [newEntry, ...prev];
            saveDevLogs(next).catch(e => console.error("Failed to persist log", e));
            return next;
        });
        
        debugLog('UI', 'System Log Added', newEntry.message);
    }, []);

    const clearLogs = useCallback(async () => {
        const empty: DevLogEntry[] = [];
        setLogs(empty);
        await saveDevLogs(empty);
    }, []);

    return {
        logs,
        addLog,
        clearLogs,
        isInitialized
    };
};