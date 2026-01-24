
import { useState, useEffect, useCallback } from 'react';
import { StickyNoteData } from '../types';
import { saveStickyNotesWeb, loadStickyNotesWeb } from '../utils/storage';
import { tauriAPI, isTauri } from '../utils/tauri';

export const useStickyNotes = () => {
  const [notes, setNotes] = useState<StickyNoteData[]>([]);
  const [isVisible, setIsVisible] = useState(true);

  // Initial Load
  useEffect(() => {
    const load = async () => {
      if (isTauri()) {
        const res = await tauriAPI.loadStickyNotes();
        if (res.success && Array.isArray(res.data)) {
            setNotes(res.data);
        }
      } else {
        const local = await loadStickyNotesWeb();
        if (Array.isArray(local)) {
            setNotes(local);
        }
      }
    };
    load();
  }, []);

  // Internal Persist Helper
  const persist = useCallback(async (updatedNotes: StickyNoteData[]) => {
    if (isTauri()) {
      await tauriAPI.saveStickyNotes(updatedNotes);
    } else {
      await saveStickyNotesWeb(updatedNotes);
    }
  }, []);

  const addNote = useCallback(() => {
    const newNote: StickyNoteData = {
      id: crypto.randomUUID(),
      title: 'New Note',
      content: '',
      inkData: null,
      mode: 'text',
      isMinimized: false,
      position: { x: window.innerWidth / 2 - 125, y: window.innerHeight / 2 - 125 },
      size: { w: 250, h: 250 },
      zIndex: 100,
      color: 'yellow'
    };
    
    const updated = [...notes, newNote];
    setNotes(updated);
    persist(updated);
  }, [notes, persist]);

  const updateNote = useCallback((id: string, updates: Partial<StickyNoteData>) => {
    setNotes(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, ...updates } : n);
      persist(updated); // Save on every update
      return updated;
    });
  }, [persist]);

  const removeNote = useCallback((id: string) => {
    setNotes(prev => {
      const updated = prev.filter(n => n.id !== id);
      persist(updated);
      return updated;
    });
  }, [persist]);

  const bringToFront = useCallback((id: string) => {
    setNotes(prev => {
      const maxZ = Math.max(...prev.map(n => n.zIndex || 0), 100);
      return prev.map(n => n.id === id ? { ...n, zIndex: maxZ + 1 } : n);
    });
  }, []);

  const toggleVisibility = useCallback(() => {
      setIsVisible(prev => !prev);
  }, []);

  return {
    notes,
    isVisible,
    addNote,
    updateNote,
    removeNote,
    bringToFront,
    toggleVisibility
  };
};
