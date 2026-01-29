
import { useState, useCallback, useEffect } from 'react';
import { StickyNote } from '../types';
import { debugLog } from '../utils/logger';

export const useStickyNotes = (sourceId?: string) => {
    const [notes, setNotes] = useState<StickyNote[]>([]);
    const [loading, setLoading] = useState(false);
    const electron = window.electronAPI;

    const fetchNotes = useCallback(async () => {
        if (!sourceId || !electron) {
            setNotes([]);
            return;
        }
        
        setLoading(true);
        try {
            const result = await electron.getStickyNotes(sourceId);
            setNotes(result || []);
            debugLog('Data', `Loaded ${result.length} sticky notes for ${sourceId}`);
        } catch (e: any) {
            console.error("Failed to fetch sticky notes:", e);
            debugLog('Data', 'Failed to fetch sticky notes', e.message);
        } finally {
            setLoading(false);
        }
    }, [sourceId, electron]);

    // Initial Load
    useEffect(() => {
        fetchNotes();
    }, [fetchNotes]);

    const saveNote = useCallback(async (note: StickyNote) => {
        // Optimistic UI Update
        setNotes(prev => {
            const exists = prev.find(n => n.id === note.id);
            if (exists) {
                return prev.map(n => n.id === note.id ? note : n);
            }
            return [...prev, note];
        });

        if (!electron) return;

        try {
            // Debounce/Throttle could be handled here or in component, 
            // but for simplicity we save on change (Mandate says "Atomic Sync")
            await electron.saveStickyNote(note);
        } catch (e: any) {
            console.error("Failed to save sticky note:", e);
        }
    }, [electron]);

    const deleteNote = useCallback(async (id: string) => {
        // Optimistic
        setNotes(prev => prev.filter(n => n.id !== id));

        if (!electron) return;

        try {
            await electron.deleteStickyNote(id);
            debugLog('Data', `Deleted sticky note ${id}`);
        } catch (e: any) {
            console.error("Failed to delete sticky note:", e);
        }
    }, [electron]);

    return {
        notes,
        loading,
        saveNote,
        deleteNote,
        refreshNotes: fetchNotes
    };
};
