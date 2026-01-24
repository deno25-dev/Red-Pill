
import React from 'react';
import { StickyNote } from './StickyNote';
import { StickyNoteData } from '../types';

interface StickyNoteOverlayProps {
    notes: StickyNoteData[];
    isVisible: boolean;
    onUpdateNote: (id: string, updates: Partial<StickyNoteData>) => void;
    onRemoveNote: (id: string) => void;
    onFocusNote: (id: string) => void;
}

export const StickyNoteOverlay: React.FC<StickyNoteOverlayProps> = ({
    notes,
    isVisible,
    onUpdateNote,
    onRemoveNote,
    onFocusNote
}) => {
    if (!isVisible) return null;

    return (
        <div className="absolute inset-0 pointer-events-none z-[100] overflow-hidden">
            {notes.map(note => (
                <div key={note.id} className="pointer-events-auto">
                    <StickyNote 
                        note={note}
                        onUpdate={onUpdateNote}
                        onRemove={onRemoveNote}
                        onFocus={onFocusNote}
                    />
                </div>
            ))}
        </div>
    );
};
