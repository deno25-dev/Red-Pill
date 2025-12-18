import React, { useRef, useState, useMemo } from 'react';
import { 
  X, 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  Trash2, 
  GripVertical, 
  Layers,
  FolderPlus,
  ChevronDown,
  ChevronRight,
  Folder,
  MinusSquare,
  PlusSquare,
  MoreVertical
} from 'lucide-react';
import { Drawing, Group } from '../types';
import { ALL_TOOLS_LIST } from '../constants';

interface LayersPanelProps {
  drawings: Drawing[];
  groups: Group[];
  onUpdateDrawings: (drawings: Drawing[]) => void;
  onUpdateGroups: (groups: Group[]) => void;
  selectedDrawingId: string | null;
  onSelectDrawing: (id: string | null) => void;
  onClose: () => void;
  position?: { x: number; y: number };
  onHeaderMouseDown?: (e: React.MouseEvent) => void;
}

export const LayersPanel: React.FC<LayersPanelProps> = ({
  drawings,
  groups,
  onUpdateDrawings,
  onUpdateGroups,
  selectedDrawingId,
  onSelectDrawing,
  onClose,
  position,
  onHeaderMouseDown
}) => {
  const [draggedItemId, setDraggedItemId] = useState<{id: string, type: 'drawing' | 'group'} | null>(null);

  // Helper to get tool icon and label
  const getToolInfo = (type: string) => {
    const tool = ALL_TOOLS_LIST.find(t => t.id === type);
    return tool ? { Icon: tool.icon, label: tool.label } : { Icon: Layers, label: 'Unknown' };
  };

  // Group Actions
  const createGroup = () => {
    const newGroup: Group = {
      id: (crypto as any).randomUUID(),
      label: 'New Group',
      visible: true,
      locked: false,
      expanded: true
    };
    onUpdateGroups([...groups, newGroup]);
  };

  const toggleGroupVisibility = (id: string) => {
    onUpdateGroups(groups.map(g => g.id === id ? { ...g, visible: !g.visible } : g));
  };

  const toggleGroupLock = (id: string) => {
    onUpdateGroups(groups.map(g => g.id === id ? { ...g, locked: !g.locked } : g));
  };

  const deleteGroup = (id: string) => {
    // Delete group and its drawings
    onUpdateGroups(groups.filter(g => g.id !== id));
    onUpdateDrawings(drawings.filter(d => d.groupId !== id));
  };

  const toggleGroupExpand = (id: string) => {
    onUpdateGroups(groups.map(g => g.id === id ? { ...g, expanded: !g.expanded } : g));
  };

  const renameGroup = (id: string) => {
    const group = groups.find(g => g.id === id);
    if (!group) return;
    const name = prompt('Enter group name:', group.label);
    if (name) {
      onUpdateGroups(groups.map(g => g.id === id ? { ...g, label: name } : g));
    }
  };

  // Drawing Actions
  const toggleVisibility = (id: string) => {
    onUpdateDrawings(drawings.map(d => d.id === id ? { ...d, properties: { ...d.properties, visible: !(d.properties.visible ?? true) } } : d));
  };

  const toggleLock = (id: string) => {
    onUpdateDrawings(drawings.map(d => d.id === id ? { ...d, properties: { ...d.properties, locked: !d.properties.locked } } : d));
  };

  const deleteDrawing = (id: string) => {
    onUpdateDrawings(drawings.filter(d => d.id !== id));
    if (selectedDrawingId === id) onSelectDrawing(null);
  };

  // Drag and Drop Logic
  const handleDragStart = (e: React.DragEvent, id: string, type: 'drawing' | 'group') => {
    setDraggedItemId({ id, type });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropToGroup = (e: React.DragEvent, groupId: string | null) => {
    e.preventDefault();
    if (!draggedItemId || draggedItemId.type !== 'drawing') return;

    onUpdateDrawings(drawings.map(d => 
      d.id === draggedItemId.id ? { ...d, groupId: groupId || undefined } : d
    ));
    setDraggedItemId(null);
  };

  const renderDrawingRow = (d: Drawing, depth = 0) => {
    const { Icon, label } = getToolInfo(d.type);
    const isVisible = d.properties.visible ?? true;
    const isLocked = d.properties.locked ?? false;
    const isSelected = selectedDrawingId === d.id;
    let displayName = label;
    if (d.type === 'text' && d.properties.text) {
        displayName = `"${d.properties.text.substring(0, 15)}${d.properties.text.length > 15 ? '...' : ''}"`;
    }

    return (
      <div
        key={d.id}
        draggable
        onDragStart={(e) => handleDragStart(e, d.id, 'drawing')}
        onClick={() => onSelectDrawing(d.id)}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        className={`
          group flex items-center gap-2 pr-2 py-1.5 rounded text-xs transition-colors cursor-pointer
          ${isSelected ? 'bg-blue-900/20 text-blue-100' : 'hover:bg-[#334155] text-slate-400 hover:text-slate-200'}
        `}
      >
        <div className="text-slate-600 cursor-grab hover:text-slate-400"><GripVertical size={10} /></div>
        <Icon size={12} className={isSelected ? 'text-blue-400' : 'text-slate-500'} />
        <span className="flex-1 truncate font-medium select-none">{displayName}</span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); toggleVisibility(d.id); }} className="p-1 hover:text-white">{isVisible ? <Eye size={12} /> : <EyeOff size={12} className="text-slate-500" />}</button>
          <button onClick={(e) => { e.stopPropagation(); toggleLock(d.id); }} className="p-1 hover:text-white">{isLocked ? <Lock size={12} className="text-amber-500" /> : <Unlock size={12} />}</button>
          <button onClick={(e) => { e.stopPropagation(); deleteDrawing(d.id); }} className="p-1 hover:text-red-400"><Trash2 size={12} /></button>
        </div>
      </div>
    );
  };

  const renderGroup = (g: Group) => {
    const groupDrawings = drawings.filter(d => d.groupId === g.id);
    const isExpanded = g.expanded ?? true;

    return (
      <div key={g.id} className="mb-1">
        <div 
          draggable
          onDragStart={(e) => handleDragStart(e, g.id, 'group')}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDropToGroup(e, g.id)}
          className={`
            flex items-center gap-2 p-1.5 rounded-md text-xs font-bold transition-colors bg-[#0f172a]/40 border border-[#334155]/30 group/grouprow
            ${g.visible ? 'text-slate-200' : 'text-slate-500'}
          `}
        >
          <button onClick={() => toggleGroupExpand(g.id)} className="text-slate-500 hover:text-white">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <Folder size={14} className="text-amber-500/80" />
          <span onDoubleClick={() => renameGroup(g.id)} className="flex-1 truncate select-none">{g.label} <span className="font-normal opacity-50">({groupDrawings.length})</span></span>
          
          <div className="flex items-center gap-0.5 opacity-0 group-hover/grouprow:opacity-100">
            <button onClick={() => toggleGroupVisibility(g.id)} className="p-1 hover:text-white">{g.visible ? <Eye size={12} /> : <EyeOff size={12} />}</button>
            <button onClick={() => toggleGroupLock(g.id)} className="p-1 hover:text-white">{g.locked ? <Lock size={12} className="text-amber-500" /> : <Unlock size={12} />}</button>
            <button onClick={() => deleteGroup(g.id)} className="p-1 hover:text-red-400"><Trash2 size={12} /></button>
          </div>
        </div>
        
        {isExpanded && (
          <div className="mt-0.5">
            {groupDrawings.map(d => renderDrawingRow(d, 1))}
          </div>
        )}
      </div>
    );
  };

  const looseDrawings = drawings.filter(d => !d.groupId);

  return (
    <div 
      className="absolute z-40 bg-[#1e293b] border border-[#334155] rounded-lg shadow-2xl flex flex-col w-72 h-96 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      style={position ? { left: position.x, top: position.y } : { top: '60px', right: '20px' }}
      onDragOver={handleDragOver}
      onDrop={(e) => handleDropToGroup(e, null)}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-[#0f172a] border-b border-[#334155] cursor-move select-none" onMouseDown={onHeaderMouseDown}>
        <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm"><Layers size={16} className="text-blue-500" /><span>Object Tree</span></div>
        <div className="flex items-center gap-1">
          <button onClick={createGroup} className="p-1 text-slate-400 hover:text-blue-400 transition-colors" title="Create Group"><FolderPlus size={16} /></button>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={16} /></button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-1.5">
        {groups.map(renderGroup)}
        {looseDrawings.length > 0 && (
          <div className="mt-2">
            {looseDrawings.length > 0 && groups.length > 0 && (
              <div className="px-2 py-1 text-[9px] uppercase font-bold text-slate-600 tracking-wider">Ungrouped</div>
            )}
            {looseDrawings.map(d => renderDrawingRow(d, 0))}
          </div>
        )}
        
        {drawings.length === 0 && groups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
            <Layers size={24} className="opacity-20" />
            <span className="text-xs">No objects</span>
          </div>
        )}
      </div>
    </div>
  );
};