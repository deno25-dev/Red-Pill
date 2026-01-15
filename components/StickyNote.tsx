
import React, { useState, useRef, useEffect } from 'react';
import { Trash2, GripVertical, Type, PenTool, Scaling, Minus, Save, CheckCircle2, Maximize2 } from 'lucide-react';
import { StickyNoteData } from '../types';
import { useStickyNotes } from '../hooks/useStickyNotes'; // Import context hooks logic if available or just use passed props

interface StickyNoteProps {
    note: StickyNoteData;
    onUpdate: (id: string, updates: Partial<StickyNoteData>) => void;
    onRemove: (id: string) => void;
    onFocus: (id: string) => void;
}

const COLORS = {
    yellow: 'bg-yellow-100 border-yellow-300 text-yellow-900',
    blue: 'bg-blue-100 border-blue-300 text-blue-900',
    green: 'bg-green-100 border-green-300 text-green-900',
    red: 'bg-red-100 border-red-300 text-red-900',
    dark: 'bg-[#1e293b] border-[#334155] text-slate-200',
};

const MIN_SIZE = 150;
const MAX_SIZE = 600;
const HEADER_HEIGHT = 32;

export const StickyNote: React.FC<StickyNoteProps> = ({ note, onUpdate, onRemove, onFocus }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isSavedVisual, setIsSavedVisual] = useState(false);
    
    // --- DRAG LOGIC ---
    const dragStart = useRef<{ x: number, y: number } | null>(null);
    const initialPos = useRef<{ x: number, y: number } | null>(null);

    const handleDragStart = (e: React.MouseEvent) => {
        // Allow dragging only from header background or grip, not from inputs/buttons
        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).tagName === 'INPUT') return;
        
        e.preventDefault();
        onFocus(note.id);
        dragStart.current = { x: e.clientX, y: e.clientY };
        initialPos.current = { ...note.position };
        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
    };

    const handleDragMove = (e: MouseEvent) => {
        if (!dragStart.current || !initialPos.current) return;
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        
        onUpdate(note.id, {
            position: {
                x: initialPos.current.x + dx,
                y: initialPos.current.y + dy
            }
        });
    };

    const handleDragEnd = () => {
        dragStart.current = null;
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
    };

    // --- RESIZE LOGIC ---
    const resizeStart = useRef<{ x: number, y: number } | null>(null);
    const initialSize = useRef<{ w: number, h: number } | null>(null);

    const handleResizeStart = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onFocus(note.id);
        resizeStart.current = { x: e.clientX, y: e.clientY };
        initialSize.current = { ...note.size };
        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);
    };

    const handleResizeMove = (e: MouseEvent) => {
        if (!resizeStart.current || !initialSize.current) return;
        const dx = e.clientX - resizeStart.current.x;
        const dy = e.clientY - resizeStart.current.y;
        
        const newW = Math.max(MIN_SIZE, Math.min(MAX_SIZE, initialSize.current.w + dx));
        const newH = Math.max(MIN_SIZE, Math.min(MAX_SIZE, initialSize.current.h + dy));

        onUpdate(note.id, { size: { w: newW, h: newH } });
    };

    const handleResizeEnd = () => {
        resizeStart.current = null;
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
    };

    // --- INK LOGIC ---
    useEffect(() => {
        if (note.mode === 'ink' && canvasRef.current && !note.isMinimized) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx && note.inkData) {
                const img = new Image();
                img.onload = () => ctx.drawImage(img, 0, 0);
                img.src = note.inkData;
            }
        }
    }, [note.mode, note.isMinimized]);

    const startDrawing = (e: React.MouseEvent) => {
        if (note.mode !== 'ink' || !canvasRef.current || note.isMinimized) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        
        setIsDrawing(true);
        const rect = canvasRef.current.getBoundingClientRect();
        ctx.beginPath();
        ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
        ctx.strokeStyle = note.color === 'dark' ? '#38bdf8' : '#1e293b'; 
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
    };

    const draw = (e: React.MouseEvent) => {
        if (!isDrawing || note.mode !== 'ink' || !canvasRef.current || note.isMinimized) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        
        const rect = canvasRef.current.getBoundingClientRect();
        ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
        ctx.stroke();
    };

    const stopDrawing = () => {
        if (isDrawing && canvasRef.current) {
            setIsDrawing(false);
            onUpdate(note.id, { inkData: canvasRef.current.toDataURL() });
        }
    };

    // --- ACTIONS ---
    const handleManualSave = () => {
        setIsSavedVisual(true);
        // Force update to trigger hook debounce save immediately if not triggered
        // But hook watches 'notes' so update is enough. We just show visual feedback.
        setTimeout(() => setIsSavedVisual(false), 2000);
    };

    const handleDelete = () => {
        if (confirm('Permanently delete this note?')) {
            onRemove(note.id);
        }
    };

    const colorClass = COLORS[note.color] || COLORS.yellow;

    return (
        <div 
            ref={containerRef}
            className={`absolute flex flex-col shadow-xl rounded-lg overflow-hidden border transition-all ${colorClass} ${note.mode === 'ink' ? 'cursor-crosshair' : 'cursor-default'}`}
            style={{ 
                left: note.position.x, 
                top: note.position.y, 
                width: note.size.w, 
                height: note.isMinimized ? HEADER_HEIGHT : note.size.h,
                zIndex: note.zIndex + 20,
                opacity: 0.95
            }}
            onMouseDown={() => onFocus(note.id)}
        >
            {/* Header / Drag Handle */}
            <div 
                className="h-8 flex items-center justify-between px-2 cursor-move select-none bg-black/10 shrink-0"
                onMouseDown={handleDragStart}
            >
                <div className="flex items-center gap-1 flex-1 overflow-hidden mr-2">
                    <GripVertical size={14} className="opacity-50 shrink-0" />
                    <input 
                        type="text" 
                        value={note.title || ''} 
                        onChange={(e) => onUpdate(note.id, { title: e.target.value })}
                        className="bg-transparent border-none outline-none text-xs font-bold w-full truncate placeholder-black/30 text-inherit"
                        placeholder="Note Title"
                        onMouseDown={(e) => e.stopPropagation()} 
                    />
                </div>

                <div className="flex items-center gap-0.5">
                    {/* Minimize / Maximize */}
                    <button 
                        onClick={() => onUpdate(note.id, { isMinimized: !note.isMinimized })}
                        className="p-1 rounded hover:bg-black/10 transition-colors"
                        title={note.isMinimized ? "Maximize" : "Minimize"}
                    >
                        {note.isMinimized ? <Maximize2 size={12} /> : <Minus size={12} />}
                    </button>

                    {/* Manual Save */}
                    <button 
                        onClick={handleManualSave}
                        className={`p-1 rounded transition-colors ${isSavedVisual ? 'text-green-600 bg-green-500/20' : 'hover:bg-black/10'}`}
                        title="Save to Database"
                    >
                        {isSavedVisual ? <CheckCircle2 size={12} /> : <Save size={12} />}
                    </button>

                    <div className="w-px h-3 bg-black/10 mx-1"></div>

                    {/* Mode Toggles (Only when expanded) */}
                    {!note.isMinimized && (
                        <>
                            <button 
                                onClick={() => onUpdate(note.id, { mode: 'text' })}
                                className={`p-1 rounded ${note.mode === 'text' ? 'bg-black/20' : 'hover:bg-black/10'}`}
                                title="Text Mode"
                            >
                                <Type size={12} />
                            </button>
                            <button 
                                onClick={() => onUpdate(note.id, { mode: 'ink' })}
                                className={`p-1 rounded ${note.mode === 'ink' ? 'bg-black/20' : 'hover:bg-black/10'}`}
                                title="Ink Mode"
                            >
                                <PenTool size={12} />
                            </button>
                        </>
                    )}

                    <div className="w-px h-3 bg-black/10 mx-1"></div>

                    {/* Delete */}
                    <button 
                        onClick={handleDelete}
                        className="p-1 rounded hover:bg-red-500/20 hover:text-red-600 transition-colors"
                        title="Delete Note"
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>

            {/* Body */}
            {!note.isMinimized && (
                <div className="flex-1 relative overflow-hidden">
                    {note.mode === 'text' ? (
                        <textarea 
                            className="w-full h-full bg-transparent border-none resize-none p-3 text-sm focus:outline-none font-medium leading-relaxed custom-scrollbar"
                            value={note.content}
                            onChange={(e) => onUpdate(note.id, { content: e.target.value })}
                            placeholder="Write something..."
                            autoFocus
                        />
                    ) : (
                        <canvas 
                            ref={canvasRef}
                            width={note.size.w}
                            height={note.size.h - HEADER_HEIGHT}
                            className="w-full h-full touch-none"
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                        />
                    )}
                    
                    {/* Resize Handle (Only when expanded) */}
                    <div 
                        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-end justify-end p-0.5 opacity-50 hover:opacity-100"
                        onMouseDown={handleResizeStart}
                    >
                        <Scaling size={10} />
                    </div>
                </div>
            )}
        </div>
    );
};
