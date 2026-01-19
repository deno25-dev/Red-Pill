
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

    // Save notes on change (debounced)
    useEffect(() => {
        if (!hasLoaded.current) return;

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
        }, 1000);

        return () => clearTimeout(timer);
    }, [notes, electron]);

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
        setNotes(prev => [...prev, newNote]);
        setIsVisible(true);
    }, []);

    const updateNote = useCallback((id: string, updates: Partial<StickyNoteData>) => {
        setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates, zIndex: Date.now() } : n));
    }, []);

    const removeNote = useCallback((idToDelete: string) => {
        console.log('DELETING:', idToDelete);
        setNotes(currentNotes => {
            const updatedNotes = currentNotes.filter(note => note.id !== idToDelete);
            console.log('REMAINING NOTES:', updatedNotes.length);
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
