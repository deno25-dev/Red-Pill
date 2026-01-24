
import React, { useState, useEffect } from 'react';
import { X, StickyNote, Plus, Trash2, RefreshCw } from 'lucide-react';
import { useStickyNotes } from '@/hooks/useStickyNotes';

export const StickyNoteManager: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { notes, addNote, removeNote } = useStickyNotes();

    useEffect(() => {
        const handleToggle = () => setIsOpen(prev => !prev);
        window.addEventListener('TOGGLE_STICKY_NOTE_MANAGER', handleToggle);
        return () => window.removeEventListener('TOGGLE_STICKY_NOTE_MANAGER', handleToggle);
    }, []);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl flex flex-col h-[500px]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#334155] bg-[#0f172a]">
                    <div className="flex items-center gap-3">
                        <StickyNote className="text-yellow-400" size={20} />
                        <h2 className="text-lg font-bold text-white">Sticky Notes</h2>
                    </div>
                    <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-[#334155] rounded-full text-slate-400 hover:text-white"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                    {notes.length === 0 ? (
                        <div className="text-center text-slate-500 mt-20">
                            <p>No active notes.</p>
                            <button onClick={addNote} className="mt-4 text-blue-400 hover:underline">Create One</button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {notes.map(note => (
                                <div key={note.id} className="flex items-center justify-between p-3 bg-[#0f172a] border border-[#334155] rounded hover:border-yellow-500/30 transition-colors group">
                                    <div className="flex flex-col overflow-hidden">
                                        <span className="text-sm font-bold text-slate-200 truncate">{note.title || 'Untitled Note'}</span>
                                        <span className="text-xs text-slate-500 truncate">{note.content || '(Empty)'}</span>
                                    </div>
                                    <button onClick={() => removeNote(note.id)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-[#334155] bg-[#0f172a]">
                    <button onClick={addNote} className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold transition-colors">
                        <Plus size={16} /> New Note
                    </button>
                </div>
            </div>
        </div>
    );
};
