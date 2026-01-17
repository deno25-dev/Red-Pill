
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
            if (stored && stored.version) {
                setData(stored);
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
            
            // Dispatch event to update other components immediately if needed
            window.dispatchEvent(new CustomEvent('redpill-changelog-updated'));
        } catch (e) {
            console.error("Failed to save changelog", e);
        }
    }, []);

    const reset = useCallback(async () => {
        try {
            await saveChangelog(null); // Or delete file logic
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
