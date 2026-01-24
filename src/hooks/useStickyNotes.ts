
import { useState, useEffect } from 'react';
import { StickyNoteData } from '../types';
import { saveStickyNotesWeb, loadStickyNotesWeb } from '../utils/storage';
import { tauriAPI, isTauri } from '../utils/tauri';

export const useStickyNotes = () => {
  const [notes, setNotes] = useState<StickyNoteData[]>([]);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (isTauri()) {
        const res = await tauriAPI.loadStickyNotes();
        if (res.success && Array.isArray(res.data)) setNotes(res.data);
      } else {
        const local = await loadStickyNotesWeb();
        setNotes(local);
      }
    };
    load();
  }, []);

  const persist = async (updatedNotes: StickyNoteData[]) => {
    if (isTauri()) {
      await tauriAPI.saveStickyNotes(updatedNotes);
    } else {
      await saveStickyNotesWeb(updatedNotes);
    }
  };

  const addNote = () => {
    const newNote: StickyNoteData = {
      id: crypto.randomUUID(),
      title: 'New Note',
      content: '',
      inkData: null,
      mode: 'text',
      isMinimized: false,
      position: { x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 - 100 },
      size: { w: 250, h: 250 },
      zIndex: 100,
      color: 'yellow'
    };
    const updated = [...notes, newNote];
    setNotes(updated);
    persist(updated);
  };

  const updateNote = (id: string, updates: Partial<StickyNoteData>) => {
    setNotes(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, ...updates } : n);
      persist(updated);
      return updated;
    });
  };

  const removeNote = (id: string) => {
    const updated = notes.filter(n => n.id !== id);
    setNotes(updated);
    persist(updated);
  };

  const bringToFront = (id: string) => {
    setNotes(prev => {
      const maxZ = Math.max(...prev.map(n => n.zIndex || 0), 100);
      return prev.map(n => n.id === id ? { ...n, zIndex: maxZ + 1 } : n);
    });
  };

  const toggleVisibility = () => setIsVisible(prev => !prev);

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
