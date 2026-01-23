
import React, { useRef, useCallback, useEffect, useState } from 'react';
import { 
  X, 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  Trash2, 
  GripVertical, 
  Layers,
  Folder as FolderIcon,
  ChevronDown,
  ChevronRight,
  FolderPlus
} from 'lucide-react';
import { Drawing, type Folder as FolderType } from '../types';
import { ALL_TOOLS_LIST } from '../constants';
import { tauriAPI, isTauri } from '../utils/tauri';

interface LayersPanelProps {
  drawings: Drawing[];
  onUpdateDrawings: (drawings: Drawing[]) => void;
  selectedDrawingIds?: Set<string>;
  onSelectDrawing: (id: string | null, e?: React.MouseEvent) => void;
  onClose: () => void;
  position?: { x: number; y: number };
  onHeaderMouseDown?: (e: React.MouseEvent) => void;
  folders?: FolderType[];
  onUpdateFolders?: (folders: FolderType[]) => void;
  sourceId?: string;
}

// --- Tree Node Component ---
interface TreeNodeProps {
  item: Drawing | FolderType;
  type: 'drawing' | 'folder';
  level: number;
  isSelected: boolean;
  isExpanded?: boolean;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onToggleVisible?: (e: React.MouseEvent, id: string) => void;
  onToggleLock?: (e: React.MouseEvent, id: string) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  onToggleExpand?: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string, type: 'drawing' | 'folder') => void;
  onDragOver: (e: React.DragEvent, id: string, type: 'drawing' | 'folder') => void;
  onDrop: (e: React.DragEvent, id: string, type: 'drawing' | 'folder') => void;
  
  // Renaming Props
  isRenaming?: boolean;
  onRenameSubmit?: (id: string, newName: string) => void;
  onRenameCancel?: () => void;
}

const TreeNode = React.memo(({
  item,
  type,
  level,
  isSelected,
  isExpanded,
  onSelect,
  onToggleVisible,
  onToggleLock,
  onDelete,
  onToggleExpand,
  onDragStart,
  onDragOver,
  onDrop,
  isRenaming,
  onRenameSubmit,
  onRenameCancel
}: TreeNodeProps) => {
  const isVisible = type === 'drawing' 
    ? ((item as Drawing).properties.visible ?? true) 
    : ((item as FolderType).visible ?? true);
    
  const isLocked = type === 'drawing' 
    ? ((item as Drawing).properties.locked ?? false) 
    : ((item as FolderType).locked ?? false);
  
  // Get Icon and Label
  let Icon: React.ElementType = FolderIcon;
  let displayName = 'Unknown';

  if (type === 'folder') {
      displayName = (item as FolderType).name || 'Unknown';
  } else if (type === 'drawing') {
      const d = item as Drawing;
      const toolInfo = ALL_TOOLS_LIST.find(t => t.id === d.type) || { icon: Layers, label: 'Unknown' };
      Icon = toolInfo.icon;
      displayName = toolInfo.label;
      if (d.type === 'text' && d.properties.text) {
          const txt = d.properties.text;
          displayName = txt.length > 20 ? txt.substring(0, 20) + '...' : txt;
      }
  }

  // --- Visual Feedback for Multi-Select ---
  const bgClass = isSelected 
    ? 'bg-blue-900/40 text-blue-100 border-l-2 border-l-blue-500' 
    : 'hover:bg-[#334155]/50 text-slate-400 hover:text-slate-200 border-l-2 border-l-transparent';

  return (
    <div
      draggable={!isRenaming}
      onDragStart={(e) => onDragStart(e, item.id, type)}
      onDragOver={(e) => onDragOver(e, item.id, type)}
      onDrop={(e) => onDrop(e, item.id, type)}
      onClick={(e) => onSelect(item.id, e)}
      className={`
        group flex items-center gap-2 pr-2 py-1.5 border-b border-[#334155]/30 cursor-pointer select-none transition-colors
        ${bgClass}
      `}
      style={{ paddingLeft: `${level * 12 + 8}px` }}
    >
      <div className="text-slate-600 cursor-grab hover:text-slate-400 -ml-1">
        <GripVertical size={12} />
      </div>

      {type === 'folder' && (
          <button 
            onClick={(e) => { e.stopPropagation(); onToggleExpand?.(item.id); }}
            className="p-0.5 hover:text-white text-slate-500 transition-colors"
          >
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
      )}

      {/* Dynamic Icon */}
      <Icon size={14} className={isSelected ? 'text-blue-400' : type === 'folder' ? 'text-amber-400' : 'text-slate-500'} />

      {/* Renaming Input or Label */}
      {isRenaming && onRenameSubmit ? (
          <input 
              autoFocus
              type="text"
              defaultValue={displayName}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => onRenameSubmit(item.id, e.target.value)}
              onKeyDown={(e) => {
                  if (e.key === 'Enter') onRenameSubmit(item.id, e.currentTarget.value);
                  if (e.key === 'Escape') onRenameCancel?.();
              }}
              className="flex-1 min-w-0 bg-[#0f172a] border border-blue-500 text-xs text-white px-1 py-0.5 rounded outline-none"
          />
      ) : (
          <span 
            className={`flex-1 truncate text-xs font-medium ${type === 'folder' ? 'text-amber-100/90' : ''}`}
            onDoubleClick={(e) => {
                if (type === 'folder' && onRenameSubmit) {
                    e.stopPropagation();
                }
            }}
          >
              {displayName}
          </span>
      )}

      {/* Actions (Visible on Hover or Selected) */}
      {!isRenaming && (
          <div className={`flex items-center gap-1 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
            {onToggleVisible && (
                <button 
                onClick={(e) => onToggleVisible(e, item.id)}
                className={`p-1 rounded hover:bg-slate-700 transition-colors ${!isVisible ? 'text-slate-500' : 'hover:text-white'}`}
                title={isVisible ? "Hide" : "Show"}
                >
                {isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
            )}
            
            {onToggleLock && (
                <button 
                onClick={(e) => onToggleLock(e, item.id)}
                className={`p-1 rounded hover:bg-slate-700 transition-colors ${isLocked ? 'text-amber-500' : 'hover:text-white'}`}
                title={isLocked ? "Unlock" : "Lock"}
                >
                {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
                </button>
            )}

            <button 
              onClick={(e) => onDelete(e, item.id)}
              className="p-1 text-slate-500 hover:text-red-400 rounded hover:bg-red-900/30 transition-colors"
              title="Remove"
            >
              <Trash2 size={12} />
            </button>
          </div>
      )}
    </div>
  );
});

export const LayersPanel: React.FC<LayersPanelProps> = ({
  drawings,
  onUpdateDrawings,
  selectedDrawingIds = new Set(),
  onSelectDrawing,
  onClose,
  position,
  onHeaderMouseDown,
  folders = [],
  onUpdateFolders,
  sourceId
}) => {
  // Use Refs for callbacks to avoid re-renders of rows
  const drawingsRef = useRef(drawings);
  const foldersRef = useRef(folders);
  const onUpdateRef = useRef(onUpdateDrawings);
  const onUpdateFoldersRef = useRef(onUpdateFolders);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Renaming State
  const [renamingId, setRenamingId] = useState<string | null>(null);
  
  drawingsRef.current = drawings;
  foldersRef.current = folders;
  onUpdateRef.current = onUpdateDrawings;
  onUpdateFoldersRef.current = onUpdateFolders;

  // --- Auto-Save Object Tree Structure ---
  // Using Tauri API if available
  useEffect(() => {
      // Stub for Tauri tree save
  }, [folders, sourceId]);

  // --- Folder Management ---
  const handleCreateFolder = useCallback(() => {
      if (!onUpdateFoldersRef.current) return;

      const currentFolders = foldersRef.current || [];
      const newId = crypto.randomUUID();
      
      const newFolder: FolderType = {
          id: newId,
          name: `Folder ${currentFolders.length + 1}`,
          isExpanded: true,
          visible: true,
          locked: false
      };
      
      const newFolders = [...currentFolders, newFolder];
      onUpdateFoldersRef.current(newFolders);
      
      setRenamingId(newId);
      
      setTimeout(() => {
          if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
      }, 50);
  }, []);

  const handleRenameSubmit = useCallback((id: string, newName: string) => {
      setRenamingId(null);
      if (!newName.trim()) return; 
      
      if (onUpdateFoldersRef.current) {
          const newFolders = (foldersRef.current || []).map(f => 
              f.id === id ? { ...f, name: newName.trim() } : f
          );
          onUpdateFoldersRef.current(newFolders);
      }
  }, []);

  const handleToggleFolder = useCallback((folderId: string) => {
      if (onUpdateFoldersRef.current) {
          const newFolders = (foldersRef.current || []).map(f => 
              f.id === folderId ? { ...f, isExpanded: !f.isExpanded } : f
          );
          onUpdateFoldersRef.current(newFolders);
      }
  }, []);

  const handleDeleteFolder = useCallback((e: React.MouseEvent, folderId: string) => {
      e.stopPropagation();
      if (!window.confirm('Delete folder and move items to root?')) return;
      
      const newDrawings = drawingsRef.current.map(d => 
          d.folderId === folderId ? { ...d, folderId: undefined } : d
      );
      onUpdateRef.current(newDrawings);

      if (onUpdateFoldersRef.current) {
          onUpdateFoldersRef.current((foldersRef.current || []).filter(f => f.id !== folderId));
      }
  }, []);

  // --- Item Actions ---
  const handleToggleVisible = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const folder = foldersRef.current?.find(f => f.id === id);
    if (folder && onUpdateFoldersRef.current) {
        const newVisible = !folder.visible;
        const newFolders = foldersRef.current!.map(f => f.id === id ? { ...f, visible: newVisible } : f);
        onUpdateFoldersRef.current(newFolders);
        
        const newDrawings = drawingsRef.current.map(d => 
            d.folderId === id ? { ...d, properties: { ...d.properties, visible: newVisible } } : d
        );
        onUpdateRef.current(newDrawings);
    } else {
        const newDrawings = drawingsRef.current.map(d => 
            d.id === id ? { ...d, properties: { ...d.properties, visible: !(d.properties.visible ?? true) } } : d
        );
        onUpdateRef.current(newDrawings);
    }
  }, []);

  const handleToggleLock = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const folder = foldersRef.current?.find(f => f.id === id);
    if (folder && onUpdateFoldersRef.current) {
        const newLocked = !folder.locked;
        const newFolders = foldersRef.current!.map(f => f.id === id ? { ...f, locked: newLocked } : f);
        onUpdateFoldersRef.current(newFolders);
        
        const newDrawings = drawingsRef.current.map(d => 
            d.folderId === id ? { ...d, properties: { ...d.properties, locked: newLocked } } : d
        );
        onUpdateRef.current(newDrawings);
    } else {
        const newDrawings = drawingsRef.current.map(d => 
            d.id === id ? { ...d, properties: { ...d.properties, locked: !d.properties.locked } } : d
        );
        onUpdateRef.current(newDrawings);
    }
  }, []);

  const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newDrawings = drawingsRef.current.filter(d => d.id !== id);
    onUpdateRef.current(newDrawings);
    onSelectDrawing(null);
  }, [onSelectDrawing]);

  const handleDeleteAll = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (drawingsRef.current.length === 0) return;
    if (!window.confirm('Delete ALL drawings on this chart?')) return;

    if (isTauri() && sourceId) {
        try { await tauriAPI.deleteAllDrawings(sourceId); } catch (err) {}
    }
    
    onUpdateRef.current([]);
    if (onUpdateFoldersRef.current) onUpdateFoldersRef.current([]);
    onSelectDrawing(null);
  }, [sourceId, onSelectDrawing]);

  // --- Native Bulk Drag & Drop ---
  
  const handleDragStart = (e: React.DragEvent, id: string, type: 'drawing' | 'folder') => {
      if (type === 'drawing' && !selectedDrawingIds?.has(id)) {
          onSelectDrawing(id); 
          const payload = [id];
          e.dataTransfer.setData('redpill/ids', JSON.stringify(payload));
          e.dataTransfer.setData('redpill/type', type);
      } else if (type === 'drawing') {
          const payload = Array.from(selectedDrawingIds || []);
          e.dataTransfer.setData('redpill/ids', JSON.stringify(payload));
          e.dataTransfer.setData('redpill/type', type);
          
          if (payload.length > 1) {
              const ghost = document.createElement('div');
              ghost.style.position = 'absolute';
              ghost.style.top = '-1000px';
              ghost.innerText = `${payload.length} items`;
              document.body.appendChild(ghost);
              e.dataTransfer.setDragImage(ghost, 0, 0);
              setTimeout(() => document.body.removeChild(ghost), 0);
          }
      } else {
          e.dataTransfer.setData('redpill/folderId', id);
          e.dataTransfer.setData('redpill/type', type);
      }
      
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, _id: string, type: 'drawing' | 'folder') => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      if (type === 'folder') {
          (e.currentTarget as HTMLElement).style.background = 'rgba(59, 130, 246, 0.2)';
      }
  };

  const handleDrop = (e: React.DragEvent, targetId: string, targetType: 'drawing' | 'folder') => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).style.background = '';

      const dragType = e.dataTransfer.getData('redpill/type');
      
      if (dragType === 'drawing') {
          const rawIds = e.dataTransfer.getData('redpill/ids');
          if (!rawIds) return;
          const movedIds: string[] = JSON.parse(rawIds);
          
          const currentDrawings = [...drawingsRef.current];
          
          if (targetType === 'folder') {
              const updated = currentDrawings.map(d => {
                  if (movedIds.includes(d.id)) {
                      return { ...d, folderId: targetId };
                  }
                  return d;
              });
              onUpdateRef.current(updated);
              if (onUpdateFoldersRef.current) {
                  const updatedFolders = (foldersRef.current || []).map(f => 
                      f.id === targetId ? { ...f, isExpanded: true } : f
                  );
                  onUpdateFoldersRef.current(updatedFolders);
              }
          } else {
              const targetIndex = currentDrawings.findIndex(d => d.id === targetId);
              if (targetIndex === -1) return;
              
              const itemsToMove = currentDrawings.filter(d => movedIds.includes(d.id));
              const remaining = currentDrawings.filter(d => !movedIds.includes(d.id));
              
              let insertIndex = remaining.findIndex(d => d.id === targetId);
              if (insertIndex === -1) insertIndex = remaining.length;
              
              const targetFolderId = currentDrawings.find(d => d.id === targetId)?.folderId;
              const updatedItems = itemsToMove.map(d => ({ ...d, folderId: targetFolderId }));
              
              remaining.splice(insertIndex, 0, ...updatedItems);
              onUpdateRef.current(remaining);
          }
      }
  };

  const handleRootDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const dragType = e.dataTransfer.getData('redpill/type');
      if (dragType === 'drawing') {
          const rawIds = e.dataTransfer.getData('redpill/ids');
          if (!rawIds) return;
          const movedIds: string[] = JSON.parse(rawIds);
          
          const newDrawings = drawingsRef.current.map(d => 
              movedIds.includes(d.id) ? { ...d, folderId: undefined } : d
          );
          onUpdateRef.current(newDrawings);
      }
  };

  const renderTree = () => {
      const rootDrawings = drawings.filter(d => !d.folderId);
      const folderList = folders || [];
      const elements: React.ReactNode[] = [];
      
      folderList.forEach(folder => {
          const children = drawings.filter(d => d.folderId === folder.id);
          const reversedChildren = [...children].reverse();
          
          elements.push(
              <div key={folder.id} className="border-b border-[#334155]/20">
                  <TreeNode 
                      item={folder} 
                      type="folder" 
                      level={0}
                      isSelected={false} 
                      isExpanded={folder.isExpanded}
                      isRenaming={renamingId === folder.id}
                      onRenameSubmit={handleRenameSubmit}
                      onRenameCancel={() => setRenamingId(null)}
                      onSelect={(_id, _e) => { /* Folder selection logic if needed */ }}
                      onDelete={(e, id) => handleDeleteFolder(e, id)}
                      onToggleExpand={handleToggleFolder}
                      onToggleVisible={handleToggleVisible}
                      onToggleLock={handleToggleLock}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                  />
                  {folder.isExpanded && reversedChildren.map(child => (
                      <TreeNode
                          key={child.id}
                          item={child}
                          type="drawing"
                          level={1}
                          isSelected={selectedDrawingIds?.has(child.id) ?? false}
                          onSelect={onSelectDrawing}
                          onToggleVisible={handleToggleVisible}
                          onToggleLock={handleToggleLock}
                          onDelete={handleDelete}
                          onDragStart={handleDragStart}
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                      />
                  ))}
                  {folder.isExpanded && reversedChildren.length === 0 && (
                      <div className="text-[10px] text-slate-600 pl-8 py-1 italic">Empty Folder</div>
                  )}
              </div>
          );
      });

      [...rootDrawings].reverse().forEach(d => {
          elements.push(
              <TreeNode
                  key={d.id}
                  item={d}
                  type="drawing"
                  level={0}
                  isSelected={selectedDrawingIds?.has(d.id) ?? false}
                  onSelect={onSelectDrawing}
                  onToggleVisible={handleToggleVisible}
                  onToggleLock={handleToggleLock}
                  onDelete={handleDelete}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
              />
          );
      });

      return elements;
  };

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
                onClick={(e) => { 
                    e.stopPropagation(); 
                    handleCreateFolder(); 
                }}
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

      {/* Content */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto custom-scrollbar max-h-[400px] min-h-[100px]"
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
        onDrop={handleRootDrop} 
      >
        {drawings.length === 0 && folders.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No drawings on chart.</div>
        ) : (
            renderTree()
        )}
      </div>
      
      {/* Footer Info */}
      {selectedDrawingIds && selectedDrawingIds.size > 1 && (
          <div className="px-3 py-1 bg-blue-900/20 text-xs text-blue-300 border-t border-[#334155] text-center font-medium">
              {selectedDrawingIds.size} items selected
          </div>
      )}
    </div>
  );
};
