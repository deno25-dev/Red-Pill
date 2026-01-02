
import React, { useState, useEffect } from 'react';
import { 
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Magnet,
  Star,
  ChevronRight,
  Trash2,
  Pencil
} from 'lucide-react';
import { TOOLS } from '../constants';

interface SidebarProps {
  activeToolId: string;
  onSelectTool: (id: string) => void;
  favoriteTools: string[];
  onToggleFavorite: (id: string) => void;
  isFavoritesBarVisible: boolean;
  onToggleFavoritesBar: () => void;
  
  areDrawingsLocked?: boolean;
  onToggleDrawingsLock?: () => void;
  isMagnetMode?: boolean;
  onToggleMagnet?: () => void;
  isStayInDrawingMode?: boolean;
  onToggleStayInDrawingMode?: () => void;
  onClearAll?: () => void;
}

interface ToolButtonProps {
    id: string;
    active: boolean;
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    onToggleMenu: () => void;
    isMenuOpen: boolean;
    menuContent: React.ReactNode;
    menuClassName?: string;
}

const ToolButton: React.FC<ToolButtonProps> = ({ 
    active, icon: Icon, label, onClick, onToggleMenu, isMenuOpen, menuContent, menuClassName 
}) => {
    return (
        <div className="relative flex justify-center w-full group/tool">
            <div className={`relative flex w-full rounded-lg transition-all ${
                active
                  ? 'text-blue-400 bg-[#334155]/50 shadow-sm ring-1 ring-[#334155]'
                  : 'text-slate-400 hover:text-white hover:bg-[#334155]'
            }`}>
                 <button
                    onClick={onClick}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onToggleMenu();
                    }}
                    className="flex-1 p-2 flex justify-center items-center focus:outline-none"
                    title={`${label} (Right-click or click arrow for menu)`}
                 >
                    <Icon size={20} />
                 </button>
                 
                 <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleMenu();
                    }}
                    className={`absolute bottom-0 right-0 p-0.5 rounded-tl hover:bg-[#1e293b] text-slate-500 hover:text-blue-400 transition-all ${isMenuOpen ? 'opacity-100 text-blue-400' : 'opacity-0 group-hover/tool:opacity-100'}`}
                    title="Open Menu"
                 >
                    <ChevronRight size={10} strokeWidth={3} />
                 </button>
            </div>

            <div className={`absolute left-full top-0 ml-3 bg-[#1e293b] border border-[#334155] rounded-md shadow-xl overflow-hidden flex flex-col transition-all duration-200 z-50 origin-top-left ${isMenuOpen ? 'visible opacity-100 scale-100' : 'invisible opacity-0 scale-95 pointer-events-none'} ${menuClassName || 'min-w-[160px]'}`}>
                 {menuContent}
            </div>
        </div>
    );
};

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeToolId,
  onSelectTool,
  favoriteTools,
  onToggleFavorite,
  isFavoritesBarVisible,
  onToggleFavoritesBar,
  areDrawingsLocked = false,
  onToggleDrawingsLock,
  isMagnetMode = false,
  onToggleMagnet,
  isStayInDrawingMode = false,
  onToggleStayInDrawingMode,
  onClearAll
}) => {
  const [hideDrawings, setHideDrawings] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    const handleGlobalClick = () => {
        setOpenMenuId(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const handleToggleMenu = (menuId: string) => {
      setOpenMenuId(prev => prev === menuId ? null : menuId);
  };

  // --- IPC SENDERS (The 3 Headaches Fix) ---
  const sendIPCSignal = (action: 'hide' | 'lock' | 'delete', value?: any) => {
      const electron = (window as any).electronAPI;
      if (electron && electron.sendDrawingAction) {
          electron.sendDrawingAction(action, value);
      }
  };

  const handleHideToggle = () => {
      const newState = !hideDrawings;
      setHideDrawings(newState);
      sendIPCSignal('hide', newState);
  };

  const handleLockToggle = () => {
      if (onToggleDrawingsLock) onToggleDrawingsLock();
      sendIPCSignal('lock', !areDrawingsLocked);
  };

  const handleClear = () => {
      if (onClearAll) onClearAll();
      sendIPCSignal('delete');
  };

  const handleCategoryClick = (category: any[], defaultIndex = 0) => {
    const activeInCat = category.find(t => t.id === activeToolId);
    if (activeInCat) {
        onSelectTool(activeInCat.id);
    } else {
        onSelectTool(category[defaultIndex].id);
    }
  };

  const getCategoryIcon = (category: any[], defaultIndex: number = 0) => {
    const activeInCat = category.find(t => t.id === activeToolId);
    return activeInCat ? activeInCat.icon : category[defaultIndex].icon;
  };
  
  const isCategoryActive = (category: any[]) => {
      return category.some(t => t.id === activeToolId);
  };

  const CursorIcon = getCategoryIcon(TOOLS.cursors);
  const LineIcon = getCategoryIcon(TOOLS.lines);
  const ShapeIcon = getCategoryIcon(TOOLS.shapes);
  const MeasureIcon = getCategoryIcon(TOOLS.measure);
  const BrushIcon = TOOLS.other.find(t => t.id === 'brush')!.icon;
  const TextIcon = TOOLS.other.find(t => t.id === 'text')!.icon;

  const renderFlyoutItem = (opt: any) => (
    <div key={opt.id} className="flex items-center w-full group/item">
        <button
            onClick={(e) => {
                e.stopPropagation();
                onSelectTool(opt.id);
                setOpenMenuId(null);
            }}
            className={`flex-1 flex items-center gap-3 px-3 py-2.5 text-sm transition-colors text-left ${
                activeToolId === opt.id 
                ? 'text-blue-400 bg-[#334155]/30' 
                : 'text-slate-400 hover:text-white hover:bg-[#334155]'
            }`}
        >
            <opt.icon size={16} className={opt.id === 'dot' ? 'fill-current' : ''} />
            <span>{opt.label}</span>
        </button>
        <button 
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(opt.id); }}
            className={`p-2 hover:text-amber-400 transition-colors ${
                favoriteTools.includes(opt.id) ? 'text-amber-400' : 'text-slate-600'
            }`}
        >
            <Star size={12} className={favoriteTools.includes(opt.id) ? 'fill-current' : ''} />
        </button>
    </div>
  );

  return (
    <div className="w-14 bg-[#1e293b] border-r border-[#334155] flex flex-col items-center py-3 gap-2 z-30 shrink-0">
      
      <div className="flex flex-col gap-2 w-full px-2">
        
        {/* Cursor Tools */}
        <ToolButton 
            id="cursors"
            active={isCategoryActive(TOOLS.cursors)}
            icon={CursorIcon}
            label="Cursors"
            onClick={() => handleCategoryClick(TOOLS.cursors)}
            onToggleMenu={() => handleToggleMenu('cursors')}
            isMenuOpen={openMenuId === 'cursors'}
            menuContent={
                <>
                    <div className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-[#0f172a]/50 border-b border-[#334155]">
                        Cursor Mode
                    </div>
                    {TOOLS.cursors.map(renderFlyoutItem)}
                </>
            }
        />

        {/* Line Tools */}
        <ToolButton 
            id="lines"
            active={isCategoryActive(TOOLS.lines)}
            icon={LineIcon}
            label="Trend Lines"
            onClick={() => handleCategoryClick(TOOLS.lines)}
            onToggleMenu={() => handleToggleMenu('lines')}
            isMenuOpen={openMenuId === 'lines'}
            menuClassName="min-w-[180px]"
            menuContent={
                <>
                    <div className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-[#0f172a]/50 border-b border-[#334155]">
                        Line Tools
                    </div>
                    {TOOLS.lines.map(renderFlyoutItem)}
                </>
            }
        />

        {/* Shape Tools */}
        <ToolButton 
            id="shapes"
            active={isCategoryActive(TOOLS.shapes)}
            icon={ShapeIcon}
            label="Shapes"
            onClick={() => handleCategoryClick(TOOLS.shapes)}
            onToggleMenu={() => handleToggleMenu('shapes')}
            isMenuOpen={openMenuId === 'shapes'}
            menuClassName="min-w-[180px]"
            menuContent={
                <>
                    <div className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-[#0f172a]/50 border-b border-[#334155]">
                        Geometric Shapes
                    </div>
                    {TOOLS.shapes.map(renderFlyoutItem)}
                </>
            }
        />

        {/* Brush Tool */}
        <ToolButton 
            id="brush"
            active={activeToolId === 'brush'}
            icon={BrushIcon}
            label="Brush"
            onClick={() => onSelectTool('brush')}
            onToggleMenu={() => handleToggleMenu('brush')}
            isMenuOpen={openMenuId === 'brush'}
            menuClassName="w-auto p-1 min-w-0"
            menuContent={
                <button 
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite('brush'); }}
                    className={`p-2 hover:text-amber-400 flex items-center gap-2 text-xs ${favoriteTools.includes('brush') ? 'text-amber-400' : 'text-slate-600'}`}
                    title="Add to Favorites"
                >
                    <Star size={14} className={favoriteTools.includes('brush') ? 'fill-current' : ''} />
                    <span>Favorite</span>
                </button>
            }
        />

        {/* Text Tool */}
        <ToolButton 
            id="text"
            active={activeToolId === 'text'}
            icon={TextIcon}
            label="Text"
            onClick={() => onSelectTool('text')}
            onToggleMenu={() => handleToggleMenu('text')}
            isMenuOpen={openMenuId === 'text'}
            menuClassName="w-auto p-1 min-w-0"
            menuContent={
                <button 
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite('text'); }}
                    className={`p-2 hover:text-amber-400 flex items-center gap-2 text-xs ${favoriteTools.includes('text') ? 'text-amber-400' : 'text-slate-600'}`}
                    title="Add to Favorites"
                >
                    <Star size={14} className={favoriteTools.includes('text') ? 'fill-current' : ''} />
                    <span>Favorite</span>
                </button>
            }
        />

        {/* Magnet Tool */}
        <button
          onClick={onToggleMagnet}
          className={`p-2 rounded-lg transition-all group relative flex justify-center ${
             isMagnetMode 
               ? 'text-blue-400 bg-[#334155]/50' 
               : 'text-slate-400 hover:text-white hover:bg-[#334155]'
          }`}
          title={isMagnetMode ? "Magnet Mode On" : "Magnet Mode Off"}
        >
          <Magnet size={20} className={isMagnetMode ? "fill-current" : ""} />
        </button>

        {/* Stay in Drawing Mode Tool */}
        <button
          onClick={onToggleStayInDrawingMode}
          className={`p-2 rounded-lg transition-all group relative flex justify-center ${
             isStayInDrawingMode 
               ? 'text-blue-400 bg-[#334155]/50' 
               : 'text-slate-400 hover:text-white hover:bg-[#334155]'
          }`}
          title={isStayInDrawingMode ? "Continuous Drawing Mode On" : "Continuous Drawing Mode Off"}
        >
          <Pencil size={20} className={isStayInDrawingMode ? "fill-current" : ""} />
        </button>

        {/* Measure Tools */}
        <ToolButton 
            id="measure"
            active={isCategoryActive(TOOLS.measure)}
            icon={MeasureIcon}
            label="Measure"
            onClick={() => handleCategoryClick(TOOLS.measure)}
            onToggleMenu={() => handleToggleMenu('measure')}
            isMenuOpen={openMenuId === 'measure'}
            menuClassName="min-w-[150px]"
            menuContent={
                <>
                    <div className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-[#0f172a]/50 border-b border-[#334155]">
                        Measure
                    </div>
                    {TOOLS.measure.map(renderFlyoutItem)}
                </>
            }
        />

        {/* Lock/Unlock Drawing Tools */}
        <button
          onClick={handleLockToggle}
          className={`p-2 rounded-lg transition-all group relative flex justify-center ${
             areDrawingsLocked 
               ? 'text-blue-400 bg-[#334155]/50' 
               : 'text-slate-400 hover:text-white hover:bg-[#334155]'
          }`}
          title={areDrawingsLocked ? "Unlock All Drawings" : "Lock All Drawings"}
        >
          {areDrawingsLocked ? <Lock size={20} /> : <Unlock size={20} />}
        </button>

        {/* Hide/Unhide Drawing Tools */}
        <button
          onClick={handleHideToggle}
          className={`p-2 rounded-lg transition-all group relative flex justify-center ${
             hideDrawings 
               ? 'text-blue-400 bg-[#334155]/50' 
               : 'text-slate-400 hover:text-white hover:bg-[#334155]'
          }`}
          title={hideDrawings ? "Show Drawings" : "Hide Drawings"}
        >
          {hideDrawings ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>

        {/* Toggle Favorites Bar */}
        <button
          onClick={onToggleFavoritesBar}
          className={`p-2 rounded-lg transition-all group relative flex justify-center ${
             isFavoritesBarVisible 
               ? 'text-amber-400 bg-[#334155]/50' 
               : 'text-slate-400 hover:text-white hover:bg-[#334155]'
          }`}
          title={isFavoritesBarVisible ? "Hide Favorites Bar" : "Show Favorites Bar"}
        >
          <Star size={20} className={isFavoritesBarVisible ? "fill-current" : ""} />
        </button>

        {/* Clear All */}
        <button
          onClick={handleClear}
          className="p-2 text-slate-400 hover:text-white hover:bg-[#334155] rounded-lg transition-all group relative flex justify-center"
          title="Clear All Drawings"
        >
          <Trash2 size={20} />
        </button>

      </div>
    </div>
  );
};
