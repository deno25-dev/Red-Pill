
import React, { useState, useRef, useEffect } from 'react';
import { 
    X, 
    GripVertical, 
    Type, 
    PenTool, 
    Scaling, 
    Minus, 
    Save, 
    CheckCircle2, 
    Maximize2,
    Palette,
    Pin,
    PinOff,
    Eraser
} from 'lucide-react';
import { StickyNoteData } from '../types';

interface StickyNoteProps {
    note: StickyNoteData;
    onUpdate: (id: string, updates: Partial<StickyNoteData>) => void;
    onRemove: (id: string) => void;
    onFocus: (id: string) => void;
}

// Updated Palette with specific styles
const COLORS_CONFIG: Record<string, { bg: string, border: string, text: string, header: string }> = {
    yellow: { bg: 'bg-yellow-100', border: 'border-yellow-300', text: 'text-yellow-900', header: 'bg-yellow-200/50' },
    blue:   { bg: 'bg-blue-100',   border: 'border-blue-300',   text: 'text-blue-900',   header: 'bg-blue-200/50' },
    green:  { bg: 'bg-green-100',  border: 'border-green-300',  text: 'text-green-900',  header: 'bg-green-200/50' },
    red:    { bg: 'bg-red-100',    border: 'border-red-300',    text: 'text-red-900',    header: 'bg-red-200/50' },
    gray:   { bg: 'bg-slate-200',  border: 'border-slate-400',  text: 'text-slate-900',  header: 'bg-slate-300/50' },
    dark:   { bg: 'bg-[#1e293b]',  border: 'border-[#334155]',  text: 'text-slate-200',  header: 'bg-[#0f172a]' },
};

const MIN_SIZE = 150;
const MAX_SIZE = 600;
const HEADER_HEIGHT = 32;

export const StickyNote: React.FC<StickyNoteProps> = ({ note, onUpdate, onRemove, onFocus }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isSavedVisual, setIsSavedVisual] = useState(false);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [inkTool, setInkTool] = useState<'pen' | 'eraser'>('pen');
    const lastPos = useRef<{x: number, y: number} | null>(null);
    
    // --- Local State for Text (Performance Optimization) ---
    // Using a local buffer prevents the global app re-render loop on every keystroke
    const [localContent, setLocalContent] = useState(note.content);
    const textUpdateTimer = useRef<any>(null);
    const isTypingRef = useRef(false);

    // Sync from parent if changed externally (e.g. initial load or remote update)
    // Only update if we are NOT currently typing to avoid cursor jumps
    useEffect(() => {
        if (!isTypingRef.current && note.content !== localContent) {
            setLocalContent(note.content);
        }
    }, [note.content]);

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setLocalContent(val);
        isTypingRef.current = true;

        if (textUpdateTimer.current) clearTimeout(textUpdateTimer.current);
        
        // Throttled update to parent (2s)
        textUpdateTimer.current = setTimeout(() => {
            onUpdate(note.id, { content: val });
            isTypingRef.current = false;
        }, 2000);
    };

    const handleTextBlur = () => {
        // Force update on blur
        if (textUpdateTimer.current) clearTimeout(textUpdateTimer.current);
        onUpdate(note.id, { content: localContent });
        isTypingRef.current = false;
    };

    // --- DRAG LOGIC ---
    const dragStart = useRef<{ x: number, y: number } | null>(null);
    const initialPos = useRef<{ x: number, y: number } | null>(null);

    const handleDragStart = (e: React.MouseEvent) => {
        // Allow dragging only from header background or grip
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
                img.onload = () => {
                    // Critical: Reset composition to default before drawing image
                    // Otherwise if previously in eraser mode, image might not draw correctly or erase background
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
                    ctx.drawImage(img, 0, 0);
                };
                img.src = note.inkData;
            }
        }
    }, [note.mode, note.isMinimized, note.size, note.inkData]);

    const startDrawing = (e: React.MouseEvent) => {
        if (note.mode !== 'ink' || !canvasRef.current || note.isMinimized) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        
        setIsDrawing(true);
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        lastPos.current = { x, y };
        
        ctx.beginPath();
        ctx.moveTo(x, y);
        
        if (inkTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = 20;
            // Explicitly set opaque stroke for destination-out to work effectively
            ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = note.color === 'dark' ? '#38bdf8' : '#1e293b'; 
            ctx.lineWidth = 2;
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    };

    const draw = (e: React.MouseEvent) => {
        if (!isDrawing || note.mode !== 'ink' || !canvasRef.current || note.isMinimized || !lastPos.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Draw segment from lastPos to currentPos
        ctx.beginPath();
        ctx.moveTo(lastPos.current.x, lastPos.current.y);
        ctx.lineTo(x, y);
        ctx.stroke();
        
        lastPos.current = { x, y };
    };

    const stopDrawing = () => {
        if (isDrawing && canvasRef.current) {
            setIsDrawing(false);
            lastPos.current = null;
            // Always save. Even erasure is a change to the pixel data.
            onUpdate(note.id, { inkData: canvasRef.current.toDataURL() });
        }
    };

    // --- ACTIONS ---
    const handleManualSave = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsSavedVisual(true);
        // Force commit of text content if typing
        if (textUpdateTimer.current) clearTimeout(textUpdateTimer.current);
        onUpdate(note.id, { content: localContent });
        
        setTimeout(() => setIsSavedVisual(false), 2000);
    };

    const handleDelete = (e: React.PointerEvent) => {
        // Critical: Stop propagation on PointerDown to prevent DragStart or Focus
        // which might be attached to parent elements.
        e.stopPropagation();
        e.preventDefault();

        console.log('FINAL_DELETE_ACTION:', note.id);
        
        // Immediate removal to prevent race conditions with confirm() blocking the event loop
        onRemove(note.id);
    };

    const togglePin = (e: React.MouseEvent) => {
        e.stopPropagation();
        onUpdate(note.id, { isPinned: !note.isPinned });
    };

    const theme = COLORS_CONFIG[note.color] || COLORS_CONFIG.yellow;
    // If not pinned (Undocked), use Fixed positioning and high Z-Index
    const positionStyle: React.CSSProperties = {
        left: note.position.x,
        top: note.position.y,
        width: note.size.w,
        height: note.isMinimized ? HEADER_HEIGHT : note.size.h,
        zIndex: note.isPinned ? note.zIndex : 9999, // Undocked is always top
        opacity: 0.98,
        position: note.isPinned ? 'absolute' : 'fixed',
    };

    // Visuals for Undocked state
    const shadowClass = note.isPinned ? 'shadow-xl' : 'shadow-[0_0_25px_rgba(0,0,0,0.5)] ring-1 ring-white/20';

    return (
        <div 
            ref={containerRef}
            className={`flex flex-col rounded-lg overflow-hidden border transition-colors ${theme.bg} ${theme.border} ${theme.text} ${shadowClass} ${note.mode === 'ink' ? (inkTool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair') : 'cursor-default'}`}
            style={positionStyle}
            onMouseDown={() => onFocus(note.id)}
        >
            {/* Header */}
            <div 
                className={`h-8 flex items-center justify-between px-2 cursor-move select-none shrink-0 ${theme.header}`}
                onMouseDown={handleDragStart}
            >
                <div className="flex items-center gap-1 flex-1 overflow-hidden mr-2">
                    <GripVertical size={14} className="opacity-50 shrink-0" />
                    <input 
                        type="text" 
                        value={note.title || ''} 
                        onChange={(e) => onUpdate(note.id, { title: e.target.value })}
                        className="bg-transparent border-none outline-none text-xs font-bold w-full truncate placeholder-current/30 text-inherit"
                        placeholder="Note Title"
                        onMouseDown={(e) => e.stopPropagation()} 
                    />
                </div>

                <div className="flex items-center gap-0.5">
                    {/* Color Picker */}
                    <div className="relative">
                        <button 
                            onClick={() => setShowColorPicker(!showColorPicker)}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="p-1 rounded hover:bg-black/10 transition-colors"
                            title="Change Color"
                        >
                            <Palette size={12} />
                        </button>
                        {showColorPicker && (
                            <div className="absolute top-full right-0 mt-1 bg-[#1e293b] border border-[#334155] p-2 rounded shadow-xl grid grid-cols-3 gap-1.5 z-50 w-24" onMouseDown={(e) => e.stopPropagation()}>
                                {Object.keys(COLORS_CONFIG).map((c) => (
                                    <button
                                        key={c}
                                        onClick={() => { onUpdate(note.id, { color: c as any }); setShowColorPicker(false); }}
                                        className={`w-5 h-5 rounded-full border border-white/20 ${COLORS_CONFIG[c].bg}`}
                                        title={c}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Pin / Unpin */}
                    <button 
                        onClick={togglePin}
                        onMouseDown={(e) => e.stopPropagation()}
                        className={`p-1 rounded transition-colors ${!note.isPinned ? 'text-blue-500 bg-blue-500/10' : 'hover:bg-black/10'}`}
                        title={note.isPinned ? "Undock (Float on top)" : "Dock to Workspace"}
                    >
                        {note.isPinned ? <Pin size={12} /> : <PinOff size={12} />}
                    </button>

                    <div className="w-px h-3 bg-black/10 mx-1"></div>

                    {/* Mode Toggles (Only when expanded) */}
                    {!note.isMinimized && (
                        <>
                            <button 
                                onClick={() => onUpdate(note.id, { mode: 'text' })}
                                onMouseDown={(e) => e.stopPropagation()}
                                className={`p-1 rounded ${note.mode === 'text' ? 'bg-black/20' : 'hover:bg-black/10'}`}
                                title="Text Mode"
                            >
                                <Type size={12} />
                            </button>
                            <button 
                                onClick={() => { onUpdate(note.id, { mode: 'ink' }); setInkTool('pen'); }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className={`p-1 rounded ${note.mode === 'ink' && inkTool === 'pen' ? 'bg-black/20' : 'hover:bg-black/10'}`}
                                title="Ink Mode (Pen)"
                            >
                                <PenTool size={12} />
                            </button>
                            <button 
                                onClick={() => { onUpdate(note.id, { mode: 'ink' }); setInkTool('eraser'); }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className={`p-1 rounded ${note.mode === 'ink' && inkTool === 'eraser' ? 'bg-black/20' : 'hover:bg-black/10'}`}
                                title="Ink Mode (Eraser)"
                            >
                                <Eraser size={12} />
                            </button>
                        </>
                    )}

                    {/* Manual Save */}
                    <button 
                        onClick={handleManualSave}
                        onMouseDown={(e) => e.stopPropagation()}
                        className={`p-1 rounded transition-colors ${isSavedVisual ? 'text-green-600 bg-green-500/20' : 'hover:bg-black/10'}`}
                        title="Save to Database"
                    >
                        {isSavedVisual ? <CheckCircle2 size={12} /> : <Save size={12} />}
                    </button>

                    <div className="w-px h-3 bg-black/10 mx-1"></div>

                    {/* Minimize / Maximize */}
                    <button 
                        onClick={() => onUpdate(note.id, { isMinimized: !note.isMinimized })}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="p-1 rounded hover:bg-black/10 transition-colors"
                        title={note.isMinimized ? "Maximize" : "Minimize"}
                    >
                        {note.isMinimized ? <Maximize2 size={12} /> : <Minus size={12} />}
                    </button>

                    {/* Close (Delete) - HIGH PRIORITY Z-INDEX */}
                    <button 
                        onPointerDown={handleDelete}
                        onClick={(e) => e.stopPropagation()} // Global Event Kill for Safety
                        className="p-1 rounded hover:bg-red-500/20 hover:text-red-600 transition-colors z-[60] pointer-events-auto relative"
                        title="Close Note"
                    >
                        <X size={12} />
                    </button>
                </div>
            </div>

            {/* Body */}
            {!note.isMinimized && (
                <div className="flex-1 relative overflow-hidden">
                    {note.mode === 'text' ? (
                        <textarea 
                            className="w-full h-full bg-transparent border-none resize-none p-3 text-sm focus:outline-none font-medium leading-relaxed custom-scrollbar placeholder-current/40"
                            value={localContent}
                            onChange={handleTextChange}
                            onBlur={handleTextBlur}
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
