import React, { useRef, useState } from 'react';
import { 
  X, 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  Trash2, 
  GripVertical, 
  Layers 
} from 'lucide-react';
import { Drawing } from '../types';
import { ALL_TOOLS_LIST } from '../constants';

interface LayersPanelProps {
  drawings: Drawing[];
  onUpdateDrawings: (drawings: Drawing[]) => void;
  selectedDrawingId: string | null;
  onSelectDrawing: (id: string | null) => void;
  onClose: () => void;
  position?: { x: number; y: number };
  onHeaderMouseDown?: (e: React.MouseEvent) => void;
}

export const LayersPanel: React.FC<LayersPanelProps> = ({
  drawings,
  onUpdateDrawings,
  selectedDrawingId,
  onSelectDrawing,
  onClose,
  position,
  onHeaderMouseDown
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Helper to get tool icon and label
  const getToolInfo = (type: string) => {
    const tool = ALL_TOOLS_LIST.find(t => t.id === type);
    return tool ? { Icon: tool.icon, label: tool.label } : { Icon: Layers, label: 'Unknown' };
  };

  // Toggles
  const toggleVisibility = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newDrawings = drawings.map(d => 
      d.id === id ? { ...d, properties: { ...d.properties, visible: !(d.properties.visible ?? true) } } : d
    );
    onUpdateDrawings(newDrawings);
  };

  const toggleLock = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newDrawings = drawings.map(d => 
      d.id === id ? { ...d, properties: { ...d.properties, locked: !d.properties.locked } } : d
    );
    onUpdateDrawings(newDrawings);
  };

  const deleteDrawing = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newDrawings = drawings.filter(d => d.id !== id);
    onUpdateDrawings(newDrawings);
    if (selectedDrawingId === id) onSelectDrawing(null);
  };

  // Drag and Drop Logic
  // Note: drawings array is [0..N], where N is drawn last (on top).
  // Visual list should be [N..0] (Top layers first).
  // When we drag index visualIndexA to visualIndexB, we need to convert to actual array indices.
  
  const handleDragStart = (e: React.DragEvent, visualIndex: number) => {
    setDraggedIndex(visualIndex);
    e.dataTransfer.effectAllowed = 'move';
    // Transparent image to remove default ghost if desired, 
    // but default ghost is usually fine for rows.
  };

  const handleDragOver = (e: React.DragEvent, visualIndex: number) => {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetVisualIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetVisualIndex) return;

    // Convert visual indices (Top-down) to array indices (Bottom-up)
    // Visual 0 is Array Length-1
    const total = drawings.length;
    const fromArrayIndex = total - 1 - draggedIndex;
    const toArrayIndex = total - 1 - targetVisualIndex;

    const newDrawings = [...drawings];
    const [movedItem] = newDrawings.splice(fromArrayIndex, 1);
    newDrawings.splice(toArrayIndex, 0, movedItem);

    onUpdateDrawings(newDrawings);
    setDraggedIndex(null);
  };

  // Render list in reverse order (Top layers at top of list)
  const reversedDrawings = [...drawings].reverse();

  return (
    <div 
      className="absolute z-40 bg-[#1e293b] border border-[#334155] rounded-lg shadow-2xl flex flex-col w-72 h-96 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      style={position ? { left: position.x, top: position.y } : { top: '60px', right: '20px' }}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 bg-[#0f172a] border-b border-[#334155] cursor-move select-none"
        onMouseDown={onHeaderMouseDown}
      >
        <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
          <Layers size={16} className="text-blue-500" />
          <span>Object Tree</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-1 space-y-0.5">
        {reversedDrawings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
            <Layers size={24} className="opacity-20" />
            <span className="text-xs">No objects</span>
          </div>
        ) : (
          reversedDrawings.map((d, visualIndex) => {
            const { Icon, label } = getToolInfo(d.type);
            const isVisible = d.properties.visible ?? true;
            const isLocked = d.properties.locked ?? false;
            const isSelected = selectedDrawingId === d.id;

            // Generate a display name
            let displayName = label;
            if (d.type === 'text' && d.properties.text) {
                displayName = `"${d.properties.text.substring(0, 15)}${d.properties.text.length > 15 ? '...' : ''}"`;
            }

            return (
              <div
                key={d.id}
                draggable
                onDragStart={(e) => handleDragStart(e, visualIndex)}
                onDragOver={(e) => handleDragOver(e, visualIndex)}
                onDrop={(e) => handleDrop(e, visualIndex)}
                onClick={() => onSelectDrawing(d.id)}
                className={`
                  group flex items-center gap-2 px-2 py-2 rounded text-xs border border-transparent transition-colors cursor-pointer
                  ${isSelected ? 'bg-blue-900/20 border-blue-500/30 text-blue-100' : 'hover:bg-[#334155] text-slate-400 hover:text-slate-200'}
                  ${draggedIndex === visualIndex ? 'opacity-50' : ''}
                `}
              >
                {/* Drag Handle */}
                <div className="text-slate-600 cursor-grab hover:text-slate-400">
                  <GripVertical size={12} />
                </div>

                {/* Icon */}
                <Icon size={14} className={isSelected ? 'text-blue-400' : 'text-slate-500'} />

                {/* Name */}
                <span className="flex-1 truncate font-medium select-none">{displayName}</span>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => toggleVisibility(e, d.id)}
                    className="p-1 hover:text-white rounded hover:bg-slate-700"
                    title={isVisible ? "Hide" : "Show"}
                  >
                    {isVisible ? <Eye size={12} /> : <EyeOff size={12} className="text-slate-500" />}
                  </button>
                  
                  <button 
                    onClick={(e) => toggleLock(e, d.id)}
                    className="p-1 hover:text-white rounded hover:bg-slate-700"
                    title={isLocked ? "Unlock" : "Lock"}
                  >
                    {isLocked ? <Lock size={12} className="text-amber-500" /> : <Unlock size={12} />}
                  </button>

                  <button 
                    onClick={(e) => deleteDrawing(e, d.id)}
                    className="p-1 hover:text-red-400 rounded hover:bg-red-900/30"
                    title="Remove"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};