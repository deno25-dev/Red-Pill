import React, { useState, useMemo, useRef, useCallback } from 'react';
import { 
  X, 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  Trash2, 
  GripVertical, 
  Layers,
  FolderOpen,
  Folder,
  List
} from 'lucide-react';
import { Drawing } from '../types';
import { ALL_TOOLS_LIST } from '../constants';
import { debugLog } from '../utils/logger';

interface LayersPanelProps {
  drawings: Drawing[];
  onUpdateDrawings: (drawings: Drawing[]) => void;
  selectedDrawingId: string | null;
  onSelectDrawing: (id: string | null) => void;
  onClose: () => void;
  position?: { x: number; y: number };
  onHeaderMouseDown?: (e: React.MouseEvent) => void;
}

// --- Memoized Row Component ---
interface LayerRowProps {
  drawing: Drawing;
  isSelected: boolean;
  visualIndex: number;
  onSelect: (id: string) => void;
  onToggleVisible: (e: React.MouseEvent, id: string) => void;
  onToggleLock: (e: React.MouseEvent, id: string) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  isDraggable?: boolean;
  onDragStart?: (e: React.DragEvent, index: number) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, index: number) => void;
  draggedIndex?: number | null;
}

const LayerRow = React.memo(({
  drawing,
  isSelected,
  visualIndex,
  onSelect,
  onToggleVisible,
  onToggleLock,
  onDelete,
  isDraggable,
  onDragStart,
  onDragOver,
  onDrop,
  draggedIndex
}: LayerRowProps) => {
  const isVisible = drawing.properties.visible ?? true;
  const isLocked = drawing.properties.locked ?? false;
  
  // Get Icon and Label
  const toolInfo = ALL_TOOLS_LIST.find(t => t.id === drawing.type) || { icon: Layers, label: 'Unknown' };
  const Icon = toolInfo.icon;
  
  // Smart Label Generation
  let displayName = toolInfo.label;
  if (drawing.type === 'text' && drawing.properties.text) {
      const txt = drawing.properties.text;
      displayName = txt.length > 20 ? txt.substring(0, 20) + '...' : txt;
  } else if (drawing.points.length > 0 && drawing.points[0].price) {
      // Optional: Show price for lines if meaningful
      // displayName += ` (${drawing.points[0].price.toFixed(2)})`;
  }

  return (
    <div
      draggable={isDraggable}
      onDragStart={(e) => isDraggable && onDragStart?.(e, visualIndex)}
      onDragOver={onDragOver}
      onDrop={(e) => isDraggable && onDrop?.(e, visualIndex)}
      onClick={() => onSelect(drawing.id)}
      className={`
        group flex items-center gap-2 px-3 py-2 border-b border-[#334155]/30 cursor-pointer select-none transition-colors
        ${isSelected ? 'bg-blue-900/20 text-blue-100 border-l-2 border-l-blue-500' : 'hover:bg-[#334155]/50 text-slate-400 hover:text-slate-200 border-l-2 border-l-transparent'}
        ${isDraggable && draggedIndex === visualIndex ? 'opacity-30' : ''}
      `}
    >
      {isDraggable && (
        <div className="text-slate-600 cursor-grab hover:text-slate-400 -ml-1">
          <GripVertical size={12} />
        </div>
      )}

      <Icon size={14} className={isSelected ? 'text-blue-400' : 'text-slate-500'} />

      <span className="flex-1 truncate text-xs font-medium">{displayName}</span>

      {/* Actions (Visible on Hover or Selected) */}
      <div className={`flex items-center gap-1 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
        <button 
          onClick={(e) => onToggleVisible(e, drawing.id)}
          className={`p-1 rounded hover:bg-slate-700 transition-colors ${!isVisible ? 'text-slate-500' : 'hover:text-white'}`}
          title={isVisible ? "Hide" : "Show"}
        >
          {isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
        
        <button 
          onClick={(e) => onToggleLock(e, drawing.id)}
          className={`p-1 rounded hover:bg-slate-700 transition-colors ${isLocked ? 'text-amber-500' : 'hover:text-white'}`}
          title={isLocked ? "Unlock" : "Lock"}
        >
          {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>

        <button 
          onClick={(e) => onDelete(e, drawing.id)}
          className="p-1 text-slate-500 hover:text-red-400 rounded hover:bg-red-900/30 transition-colors"
          title="Remove"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}, (prev, next) => {
  // Custom Comparison for Performance:
  // Only re-render if drawing specific props changed.
  // We assume handlers are stable (refs) or we ignore them to prevent render cascades.
  return (
    prev.drawing === next.drawing && 
    prev.isSelected === next.isSelected &&
    prev.visualIndex === next.visualIndex &&
    prev.draggedIndex === next.draggedIndex
  );
});


export const LayersPanel: React.FC<LayersPanelProps> = ({
  drawings,
  onUpdateDrawings,
  selectedDrawingId,
  onSelectDrawing,
  onClose,
  position,
  onHeaderMouseDown
}) => {
  const [viewMode, setViewMode] = useState<'layers' | 'groups'>('layers');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // --- Stable Handler Pattern ---
  // We use Refs to access the latest state inside callbacks without updating the callback identity.
  // This allows LayerRow to be effectively memoized.
  const drawingsRef = useRef(drawings);
  const onUpdateRef = useRef(onUpdateDrawings);
  const onSelectRef = useRef(onSelectDrawing);

  // Sync refs on render
  drawingsRef.current = drawings;
  onUpdateRef.current = onUpdateDrawings;
  onSelectRef.current = onSelectDrawing;

  // Stable Actions
  const handleToggleVisible = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const currentDrawings = drawingsRef.current;
    let visibility;
    const newDrawings = currentDrawings.map(d => {
      if (d.id === id) {
        visibility = !(d.properties.visible ?? true);
        return { ...d, properties: { ...d.properties, visible: visibility } };
      }
      return d;
    });
    onUpdateRef.current(newDrawings);
    debugLog('UI', `Drawing [${id}] visibility changed to [${visibility}]`);
  }, []);

  const handleToggleLock = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const currentDrawings = drawingsRef.current;
    let lockState;
    const newDrawings = currentDrawings.map(d => {
      if (d.id === id) {
        lockState = !d.properties.locked;
        return { ...d, properties: { ...d.properties, locked: lockState } };
      }
      return d;
    });
    onUpdateRef.current(newDrawings);
    debugLog('UI', `Drawing [${id}] lock state changed to [${lockState ? 'Locked' : 'Unlocked'}]`);
  }, []);

  const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const currentDrawings = drawingsRef.current;
    const newDrawings = currentDrawings.filter(d => d.id !== id);
    onUpdateRef.current(newDrawings);
    // If deleted item was selected, deselect
    // We can't easily check selectedDrawingId inside this callback without ref, but checking logic is simple
    onSelectRef.current(null); 
  }, []);

  const handleSelect = useCallback((id: string) => {
    onSelectRef.current(id);
  }, []);

  // --- Drag & Drop Logic ---
  const handleDragStart = useCallback((e: React.DragEvent, visualIndex: number) => {
    setDraggedIndex(visualIndex);
    e.dataTransfer.effectAllowed = 'move';
    // Remove ghost image if possible, or style row
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetVisualIndex: number) => {
    e.preventDefault();
    setDraggedIndex(prev => {
        if (prev === null || prev === targetVisualIndex) return null;
        
        const currentDrawings = drawingsRef.current;
        const total = currentDrawings.length;
        
        // Convert visual (Top-Down) to array (Bottom-Up/Z-Index)
        const fromArrayIndex = total - 1 - prev;
        const toArrayIndex = total - 1 - targetVisualIndex;

        const newDrawings = [...currentDrawings];
        const [movedItem] = newDrawings.splice(fromArrayIndex, 1);
        newDrawings.splice(toArrayIndex, 0, movedItem);

        onUpdateRef.current(newDrawings);
        return null;
    });
  }, []);

  // --- Grouping Logic ---
  const groupedDrawings = useMemo(() => {
    if (viewMode === 'layers') return null;

    const groups: Record<string, Drawing[]> = {};
    
    // Process in reverse to show top-most first inside groups
    [...drawings].reverse().forEach(d => {
        const tool = ALL_TOOLS_LIST.find(t => t.id === d.type);
        const label = tool ? tool.label : 'Other';
        // Pluralize simple heuristic
        const groupName = label.endsWith('s') ? label : label + 's';
        
        if (!groups[groupName]) groups[groupName] = [];
        groups[groupName].push(d);
    });

    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [drawings, viewMode]);

  const toggleGroup = (groupName: string) => {
      setCollapsedGroups(prev => {
          const next = new Set(prev);
          if (next.has(groupName)) next.delete(groupName);
          else next.add(groupName);
          return next;
      });
  };

  // Render list in reverse order (Top layers at top of list) for Flat View
  const reversedDrawings = useMemo(() => [...drawings].reverse(), [drawings]);

  return (
    <div 
      className="absolute z-40 bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl flex flex-col w-72 h-[500px] overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex-none"
      style={position ? { left: position.x, top: position.y } : { top: '60px', right: '10px' }}
    >
      {/* Header */}
      <div 
        className="flex flex-col bg-[#0f172a] border-b border-[#334155] cursor-move select-none"
        onMouseDown={onHeaderMouseDown}
      >
        <div className="flex items-center justify-between p-3 pb-2">
            <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
            <Layers size={16} className="text-blue-500" />
            <span>Object Tree</span>
            <span className="text-xs text-slate-500 font-normal ml-1">({drawings.length})</span>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-[#334155] rounded">
            <X size={16} />
            </button>
        </div>

        {/* View Toggles */}
        <div className="flex px-3 pb-3 gap-1">
            <button
                onClick={(e) => { e.stopPropagation(); setViewMode('layers'); }}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition-colors ${viewMode === 'layers' ? 'bg-[#334155] text-white shadow-sm' : 'text-slate-500 hover:bg-[#334155]/50 hover:text-slate-300'}`}
            >
                <List size={12} /> Layers
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); setViewMode('groups'); }}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition-colors ${viewMode === 'groups' ? 'bg-[#334155] text-white shadow-sm' : 'text-slate-500 hover:bg-[#334155]/50 hover:text-slate-300'}`}
            >
                <Folder size={12} /> Groups
            </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#1e293b]">
        {drawings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3 opacity-60">
            <div className="bg-[#334155]/30 p-4 rounded-full">
                <Layers size={24} />
            </div>
            <span className="text-xs">No objects on chart</span>
          </div>
        ) : viewMode === 'layers' ? (
            // --- FLAT LIST ---
            <div className="flex flex-col">
                {reversedDrawings.map((d, i) => (
                    <LayerRow
                        key={d.id}
                        drawing={d}
                        isSelected={selectedDrawingId === d.id}
                        visualIndex={i}
                        onSelect={handleSelect}
                        onToggleVisible={handleToggleVisible}
                        onToggleLock={handleToggleLock}
                        onDelete={handleDelete}
                        isDraggable={true}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        draggedIndex={draggedIndex}
                    />
                ))}
            </div>
        ) : (
            // --- GROUPED TREE ---
            <div className="flex flex-col p-1 space-y-1">
                {groupedDrawings?.map(([groupName, groupDrawings]) => {
                    const isCollapsed = collapsedGroups.has(groupName);
                    return (
                        <div key={groupName} className="rounded overflow-hidden border border-[#334155]/30 bg-[#0f172a]/30">
                            <button 
                                onClick={() => toggleGroup(groupName)}
                                className="w-full flex items-center justify-between p-2 text-xs font-bold text-slate-400 hover:bg-[#334155]/50 hover:text-slate-200 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    {isCollapsed ? <Folder size={14} /> : <FolderOpen size={14} className="text-blue-400" />}
                                    <span>{groupName}</span>
                                </div>
                                <span className="bg-[#334155] text-slate-300 px-1.5 rounded text-[10px]">{groupDrawings.length}</span>
                            </button>
                            
                            {!isCollapsed && (
                                <div className="border-t border-[#334155]/30 bg-[#1e293b]">
                                    {groupDrawings.map((d) => (
                                        <LayerRow
                                            key={d.id}
                                            drawing={d}
                                            isSelected={selectedDrawingId === d.id}
                                            visualIndex={-1} // No DnD in group mode
                                            onSelect={handleSelect}
                                            onToggleVisible={handleToggleVisible}
                                            onToggleLock={handleToggleLock}
                                            onDelete={handleDelete}
                                            isDraggable={false}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        )}
      </div>
    </div>
  );
};
