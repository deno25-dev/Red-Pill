
import { useState, useEffect, useCallback, useRef } from 'react';
import { StickyNoteData } from '../types';
import { saveStickyNotesWeb, loadStickyNotesWeb } from '../utils/storage';
import { debugLog } from '../utils/logger';

export const useStickyNotes = () => {
    const [notes, setNotes] = useState<StickyNoteData[]>([]);
    const [isVisible, setIsVisible] = useState(true);
    const hasLoaded = useRef(false);
    
    const electron = (window as any).electronAPI;

    // Load notes on mount
    useEffect(() => {
        const load = async () => {
            try {
                let loadedNotes = [];
                if (electron && electron.loadStickyNotes) {
                    const result = await electron.loadStickyNotes();
                    if (result.success) loadedNotes = result.data;
                } else {
                    loadedNotes = await loadStickyNotesWeb();
                }
                
                // Backwards compatibility for notes without isPinned
                const processedNotes = (loadedNotes || []).map((n: any) => ({
                    ...n,
                    isPinned: n.isPinned ?? true, // Default to true (Docked)
                    color: n.color || 'yellow'
                }));

                setNotes(processedNotes);
                hasLoaded.current = true;
                debugLog('UI', `Loaded ${processedNotes.length} sticky notes.`);
            } catch (e) {
                console.error("Failed to load sticky notes", e);
            }
        };
        load();
    }, [electron]);

    // Save notes on change (Throttled/Debounced Persistence)
    useEffect(() => {
        if (!hasLoaded.current) return;

        // Mandate: Throttled Saving (2000ms) to prevent write-lock freeze
        const timer = setTimeout(async () => {
            try {
                if (electron && electron.saveStickyNotes) {
                    await electron.saveStickyNotes(notes);
                } else {
                    await saveStickyNotesWeb(notes);
                }
            } catch (e) {
                console.error("Failed to save sticky notes", e);
            }
        }, 2000);

        return () => clearTimeout(timer);
    }, [notes, electron]);

    // Event Listener for external adds (Manager)
    useEffect(() => {
        const handleAdd = (e: any) => {
            const noteData = e.detail;
            if (noteData) {
                // Create a new instance from saved data to avoid ID collision if loading multiple times
                const newNote: StickyNoteData = {
                    ...noteData,
                    id: crypto.randomUUID(), // Always new ID
                    isPinned: false, // Default to undocked for visibility when loaded from manager
                    position: { x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 - 100 }, // Center it
                    zIndex: Date.now()
                };
                setNotes(prev => [...prev, newNote]);
                setIsVisible(true);
            }
        };
        window.addEventListener('REDPILL_ADD_STICKY_NOTE', handleAdd);
        return () => window.removeEventListener('REDPILL_ADD_STICKY_NOTE', handleAdd);
    }, []);

    // Optimistic UI Update Helpers
    const addNote = useCallback(() => {
        const newNote: StickyNoteData = {
            id: crypto.randomUUID(),
            title: 'New Note',
            content: '',
            inkData: null,
            mode: 'text',
            isMinimized: false,
            isPinned: true, // Default: Docked
            position: { x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 - 100 },
            size: { w: 200, h: 200 },
            zIndex: Date.now(), // Simple z-index based on creation time
            color: 'yellow'
        };
        // Immediate State Update
        setNotes(prev => [...prev, newNote]);
        setIsVisible(true);
    }, []);

    const updateNote = useCallback((id: string, updates: Partial<StickyNoteData>) => {
        // Immediate State Update (Optimistic)
        setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates, zIndex: Date.now() } : n));
    }, []);

    const removeNote = useCallback((idToDelete: string) => {
        console.log('DELETING:', idToDelete);
        setNotes(currentNotes => {
            const updatedNotes = currentNotes.filter(note => note.id !== idToDelete);
            return updatedNotes;
        });
    }, []);

    const toggleVisibility = useCallback(() => {
        setIsVisible(prev => !prev);
    }, []);

    const bringToFront = useCallback((id: string) => {
        setNotes(prev => {
            const maxZ = Math.max(...prev.map(n => n.zIndex), 0);
            return prev.map(n => n.id === id ? { ...n, zIndex: maxZ + 1 } : n);
        });
    }, []);

    const forceSave = useCallback(async () => {
        try {
            if (electron && electron.saveStickyNotes) {
                await electron.saveStickyNotes(notes);
            } else {
                await saveStickyNotesWeb(notes);
            }
            debugLog('Data', 'Sticky notes manually saved.');
        } catch (e) {
            console.error("Failed to force save notes", e);
        }
    }, [notes, electron]);

    return {
        notes,
        isVisible,
        addNote,
        updateNote,
        removeNote,
        toggleVisibility,
        bringToFront,
        forceSave
    };
};
