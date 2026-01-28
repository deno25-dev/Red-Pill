
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
  Folder,
  List,
  Link,
  Unlink,
  ChevronDown,
  ChevronRight,
  FolderPlus
} from 'lucide-react';
import { Drawing, type Folder as FolderType } from '../types';
import { ALL_TOOLS_LIST } from '../constants';
import { debugLog } from '../utils/logger';

interface LayersPanelProps {
  drawings: Drawing[];
  onUpdateDrawings: (drawings: Drawing[]) => void;
  selectedDrawingId: string | null;
  onSelectDrawing: (id: string | null, e?: React.MouseEvent) => void;
  onClose: () => void;
  position?: { x: number; y: number };
  onHeaderMouseDown?: (e: React.MouseEvent) => void;
  isDrawingSyncEnabled?: boolean;
  onToggleDrawingSync?: () => void;
  folders?: FolderType[];
  onUpdateFolders?: (folders: FolderType[]) => void;
  sourceId?: string;
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
  onHeaderMouseDown,
  isDrawingSyncEnabled = true,
  onToggleDrawingSync,
  folders,
  onUpdateFolders,
  sourceId
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

  const handleDeleteAll = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (drawingsRef.current.length === 0) return;
    if (!window.confirm('Delete ALL drawings on this chart? This cannot be undone.')) return;

    const electron = window.electronAPI;
    if (electron && sourceId) {
        try {
            await electron.deleteAllDrawings(sourceId);
            debugLog('Data', `Invoked delete_all_drawings for ${sourceId}`);
        } catch (err) {
            console.error("Failed to delete all drawings via backend:", err);
        }
    }
    
    onUpdateRef.current([]);
    if (onUpdateFolders) onUpdateFolders([]);
    onSelectRef.current(null);
  }, [sourceId, onUpdateFolders]);

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
        if (!groups[label]) {
            groups[label] = [];
        }
        groups[label].push(d);
    });

    return groups;
  }, [viewMode, drawings]);

  const handleCreateFolder = useCallback(() => {
      if (onUpdateFolders) {
          const newFolder: FolderType = {
              id: crypto.randomUUID(),
              name: `Folder ${(folders?.length || 0) + 1}`,
              isExpanded: true
          };
          onUpdateFolders([...(folders || []), newFolder]);
      }
  }, [folders, onUpdateFolders]);

  return (
    <div
      className="absolute z-40 w-64 bg-[#1e293b]/90 backdrop-blur-md border border-[#334155] rounded-xl shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200"
      style={position ? { left: position.x, top: position.y } : { right: '1rem', top: '5rem' }}
    >
      {/* Header */}
      <div
        onMouseDown={onHeaderMouseDown}
        className="flex items-center justify-between p-3 border-b border-[#334155] cursor-move bg-[#0f172a]/50"
      >
        <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
          <Layers size={16} />
          <span>Object Tree</span>
        </div>
        <div className="flex items-center gap-1">
            <button 
                className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white"
                title="New Folder"
                onClick={(e) => { e.stopPropagation(); handleCreateFolder(); }}
            >
                <FolderPlus size={14} />
            </button>
            <button 
                className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-red-400"
                title="Delete All Drawings"
                onClick={handleDeleteAll}
            >
                <Trash2 size={14} />
            </button>
            <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-700 hover:text-white">
                <X size={16} />
            </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center p-2 border-b border-[#334155] gap-1">
        <button
          onClick={() => setViewMode('layers')}
          className={`flex-1 p-1.5 rounded text-xs font-medium flex items-center justify-center gap-1 ${viewMode === 'layers' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
        >
          <List size={14} /> Layers
        </button>
        <button
          onClick={() => setViewMode('groups')}
          className={`flex-1 p-1.5 rounded text-xs font-medium flex items-center justify-center gap-1 ${viewMode === 'groups' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
        >
          <Folder size={14} /> Groups
        </button>
        {onToggleDrawingSync && (
          <button
            onClick={onToggleDrawingSync}
            className={`p-1.5 rounded transition-colors ${isDrawingSyncEnabled ? 'text-blue-400' : 'text-slate-500'}`}
            title={isDrawingSyncEnabled ? "Drawing Sync Enabled" : "Drawing Sync Disabled"}
          >
            {isDrawingSyncEnabled ? <Link size={14} /> : <Unlink size={14} />}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar max-h-[400px]">
        {drawings.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No drawings on chart.</div>
        ) : viewMode === 'layers' ? (
          [...drawings].reverse().map((d, visualIndex) => (
            <LayerRow
              key={d.id}
              drawing={d}
              isSelected={selectedDrawingId === d.id}
              visualIndex={visualIndex}
              onSelect={handleSelect}
              onToggleVisible={handleToggleVisible}
              onToggleLock={handleToggleLock}
              onDelete={handleDelete}
              isDraggable
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              draggedIndex={draggedIndex}
            />
          ))
        ) : (
          groupedDrawings && Object.entries(groupedDrawings).map(([groupName, groupDrawings]) => {
            const drawings = groupDrawings as Drawing[];
            const isCollapsed = collapsedGroups.has(groupName);
            return (
              <div key={groupName}>
                <div 
                    className="flex items-center justify-between px-3 py-2 bg-[#0f172a]/50 border-b border-[#334155] cursor-pointer hover:bg-[#1e293b]/50"
                    onClick={() => {
                        const newSet = new Set(collapsedGroups);
                        if (isCollapsed) newSet.delete(groupName);
                        else newSet.add(groupName);
                        setCollapsedGroups(newSet);
                    }}
                >
                    <span className="text-xs font-bold text-slate-300">{groupName} ({drawings.length})</span>
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </div>
                {!isCollapsed && drawings.map((d, index) => (
                     <LayerRow
                        key={d.id}
                        drawing={d}
                        isSelected={selectedDrawingId === d.id}
                        visualIndex={index} // This is visual index within the group
                        onSelect={handleSelect}
                        onToggleVisible={handleToggleVisible}
                        onToggleLock={handleToggleLock}
                        onDelete={handleDelete}
                     />
                ))}
              </div>
            )
          })
        )}
      </div>
    </div>
  );
};
