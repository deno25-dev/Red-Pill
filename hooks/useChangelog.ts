
import { useState, useEffect, useCallback } from 'react';
import { LATEST_ADDITIONS, VersionLog } from '../constants/changelog';
import { loadChangelog, saveChangelog } from '../utils/storage';
import { debugLog } from '../utils/logger';

export const useChangelog = () => {
    const [data, setData] = useState<VersionLog>(LATEST_ADDITIONS);
    const [isLoading, setIsLoading] = useState(true);

    const refresh = useCallback(async () => {
        setIsLoading(true);
        try {
            const stored = await loadChangelog();
            if (stored) {
                // If stored is string (new Tier 1), we don't convert to VersionLog yet in this hook mostly used for Tier 2? 
                // Actually, this hook seems legacy or mixed. Tier 1 uses direct local storage.
                // We'll keep it simple: if stored exists and has version, use it.
                if (typeof stored !== 'string' && (stored as any).version) {
                     setData(stored as any);
                }
                debugLog('Data', 'Loaded custom changelog from storage');
            } else {
                setData(LATEST_ADDITIONS);
            }
        } catch (e) {
            console.error("Failed to load changelog", e);
            setData(LATEST_ADDITIONS);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const save = useCallback(async (newData: VersionLog) => {
        try {
            await saveChangelog(newData);
            setData(newData);
            debugLog('Data', 'Changelog updated and saved');
            window.dispatchEvent(new CustomEvent('redpill-changelog-updated'));
        } catch (e) {
            console.error("Failed to save changelog", e);
        }
    }, []);

    const reset = useCallback(async () => {
        try {
            await saveChangelog(null);
            setData(LATEST_ADDITIONS);
            debugLog('Data', 'Changelog reset to defaults');
            window.dispatchEvent(new CustomEvent('redpill-changelog-updated'));
        } catch (e) {
            console.error("Failed to reset changelog", e);
        }
    }, []);

    return {
        data,
        isLoading,
        save,
        reset,
        refresh
    };
};
