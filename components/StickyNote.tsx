
import React, { useState, useRef, useEffect } from 'react';
import { StickyNote as StickyNoteType } from '../types';
import { X, Minus, Save, GripHorizontal, Palette } from 'lucide-react';

interface StickyNoteProps {
    note: StickyNoteType;
    onUpdate: (note: StickyNoteType) => void;
    onDelete: (id: string) => void;
    containerRef: React.RefObject<HTMLDivElement>;
}

const COLORS = [
    '#fef3c7', // Yellow (Default)
    '#dbeafe', // Blue
    '#dcfce7', // Green
    '#fce7f3', // Pink
    '#f3f4f6', // Grey
    '#1e293b'  // Dark
];

export const StickyNote: React.FC<StickyNoteProps> = ({ note, onUpdate, onDelete, containerRef }) => {
    const [isMinimized, setIsMinimized] = useState(false);
    const [content, setContent] = useState(note.content);
    const [position, setPosition] = useState({ x: note.x, y: note.y });
    const [size, setSize] = useState({ w: note.width, h: note.height });
    const [color, setColor] = useState(note.color || '#fef3c7');
    const [isPaletteOpen, setIsPaletteOpen] = useState(false);

    // Refs for Dragging
    const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initX: 0, initY: 0 });
    const resizeRef = useRef({ isResizing: false, startX: 0, startY: 0, initW: 0, initH: 0 });
    const debounceRef = useRef<any>(null);

    const isDark = color === '#1e293b';
    const textColor = isDark ? 'text-slate-200' : 'text-slate-800';
    const headerColor = isDark ? 'bg-slate-700' : 'bg-black/10';

    // Auto-save debouncer
    const triggerSave = (updates: Partial<StickyNoteType>) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        
        const updatedNote = { 
            ...note, 
            content, 
            x: position.x, 
            y: position.y, 
            width: size.w, 
            height: size.h, 
            color,
            ...updates 
        };

        debounceRef.current = setTimeout(() => {
            onUpdate(updatedNote);
        }, 1000); // 1s debounce for persistence
    };

    // --- Drag Logic ---
    const handleMouseDown = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button')) return;
        e.preventDefault();
        dragRef.current = { isDragging: true, startX: e.clientX, startY: e.clientY, initX: position.x, initY: position.y };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (dragRef.current.isDragging) {
            const dx = e.clientX - dragRef.current.startX;
            const dy = e.clientY - dragRef.current.startY;
            setPosition({ x: dragRef.current.initX + dx, y: dragRef.current.initY + dy });
        } else if (resizeRef.current.isResizing) {
            const dx = e.clientX - resizeRef.current.startX;
            const dy = e.clientY - resizeRef.current.startY;
            setSize({ 
                w: Math.max(150, resizeRef.current.initW + dx), 
                h: Math.max(100, resizeRef.current.initH + dy) 
            });
        }
    };

    const handleMouseUp = () => {
        if (dragRef.current.isDragging) {
            triggerSave({ x: position.x, y: position.y }); // Save final position
        }
        if (resizeRef.current.isResizing) {
            triggerSave({ width: size.w, height: size.h }); // Save final size
        }
        dragRef.current.isDragging = false;
        resizeRef.current.isResizing = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    // --- Resize Logic ---
    const handleResizeStart = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        resizeRef.current = { isResizing: true, startX: e.clientX, startY: e.clientY, initW: size.w, initH: size.h };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <div 
            className={`absolute z-[100] flex flex-col rounded-lg shadow-xl overflow-hidden transition-shadow hover:shadow-2xl border border-black/10`}
            style={{ 
                left: position.x, 
                top: position.y, 
                width: isMinimized ? 200 : size.w, 
                height: isMinimized ? 'auto' : size.h,
                backgroundColor: color
            }}
        >
            {/* Header */}
            <div 
                onMouseDown={handleMouseDown}
                className={`h-7 ${headerColor} flex items-center justify-between px-2 cursor-move select-none`}
            >
                <div className="flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity">
                    <GripHorizontal size={14} className={isDark ? 'text-slate-400' : 'text-slate-600'} />
                </div>
                
                <div className="flex items-center gap-1">
                    {/* Palette */}
                    <div className="relative">
                        <button onClick={() => setIsPaletteOpen(!isPaletteOpen)} className={`p-0.5 rounded hover:bg-black/10 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            <Palette size={12} />
                        </button>
                        {isPaletteOpen && (
                            <div className="absolute top-full right-0 mt-1 p-1 bg-white rounded shadow-lg flex gap-1 border border-slate-200 z-50">
                                {COLORS.map(c => (
                                    <button 
                                        key={c}
                                        onClick={() => { setColor(c); setIsPaletteOpen(false); triggerSave({ color: c }); }}
                                        className="w-4 h-4 rounded-full border border-black/10 hover:scale-110 transition-transform"
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    <button 
                        onClick={() => setIsMinimized(!isMinimized)}
                        className={`p-0.5 rounded hover:bg-black/10 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}
                    >
                        <Minus size={12} />
                    </button>
                    
                    <button 
                        onClick={() => { triggerSave({}); onDelete(note.id); }}
                        className={`p-0.5 rounded hover:bg-red-500 hover:text-white ${isDark ? 'text-slate-400' : 'text-slate-600'}`}
                    >
                        <X size={12} />
                    </button>
                </div>
            </div>

            {/* Body */}
            {!isMinimized && (
                <div className="flex-1 relative flex flex-col">
                    <textarea 
                        value={content}
                        onChange={(e) => { setContent(e.target.value); triggerSave({ content: e.target.value }); }}
                        className={`flex-1 w-full h-full p-3 bg-transparent border-none resize-none focus:outline-none text-sm ${textColor} font-medium placeholder-black/30`}
                        placeholder="Write something..."
                    />
                    
                    {/* Resize Handle */}
                    <div 
                        onMouseDown={handleResizeStart}
                        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-end justify-end p-0.5 opacity-50 hover:opacity-100"
                    >
                        <div className={`w-2 h-2 ${isDark ? 'bg-slate-500' : 'bg-slate-400'} rounded-tl`} />
                    </div>
                </div>
            )}
        </div>
    );
};
