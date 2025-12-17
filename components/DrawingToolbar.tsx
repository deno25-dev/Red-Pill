import React, { useState, useRef, useEffect } from 'react';
import { 
  Trash2, 
  Minus, 
  MoreHorizontal, 
  GripVertical, 
  Type, 
  Square,
  AArrowUp,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Check,
  Activity
} from 'lucide-react';
import { DrawingProperties } from '../types';

interface DrawingToolbarProps {
  properties: DrawingProperties;
  onChange: (updates: Partial<DrawingProperties>) => void;
  onDelete?: () => void;
  isVisible: boolean;
  position?: { x: number; y: number };
  isSelection: boolean;
  onDragStart?: (e: React.MouseEvent) => void;
  drawingType?: string;
}

// A richer, more modern color palette
const RICH_PALETTE = [
  '#ffffff', '#e5e5e5', '#a3a3a3', '#737373', '#404040', '#171717', '#000000',
  '#ef4444', '#f87171', '#fca5a5', // Reds
  '#f97316', '#fb923c', '#fdba74', // Oranges
  '#f59e0b', '#fbbf24', '#fcd34d', // Ambers
  '#84cc16', '#a3e635', '#bef264', // Limes
  '#10b981', '#34d399', '#6ee7b7', // Emeralds
  '#06b6d4', '#22d3ee', '#67e8f9', // Cyans
  '#3b82f6', '#60a5fa', '#93c5fd', // Blues
  '#6366f1', '#818cf8', '#a5b4fc', // Indigos
  '#8b5cf6', '#a78bfa', '#c4b5fd', // Violets
  '#d946ef', '#e879f9', '#f0abfc', // Fuchsias
  '#ec4899', '#f472b6', '#fbcfe8', // Pinks
];

type MenuState = 'none' | 'color' | 'stroke' | 'text' | 'smoothing';

// Helper to extract alpha (0-100) from hex string (6 or 8 char)
const getAlphaFromHex = (hex: string): number => {
    if (!hex) return 100;
    const clean = hex.startsWith('#') ? hex.slice(1) : hex;
    if (clean.length === 8) {
        return Math.round((parseInt(clean.slice(6, 8), 16) / 255) * 100);
    }
    return 100;
};

// Helper to apply alpha (0-100) to hex string
const applyAlphaToHex = (hex: string, alpha: number): string => {
    let clean = hex.startsWith('#') ? hex.slice(1) : hex;
    
    // Normalize short hex #FFF -> #FFFFFF
    if (clean.length === 3) {
        clean = clean.split('').map(c => c+c).join('');
    }
    // Strip existing alpha if present
    if (clean.length === 8) {
        clean = clean.slice(0, 6);
    }
    
    if (alpha === 100) return `#${clean}`;
    
    const alphaHex = Math.round((alpha / 100) * 255).toString(16).padStart(2, '0');
    return `#${clean}${alphaHex}`;
};

export const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  properties,
  onChange,
  onDelete,
  isVisible,
  position,
  isSelection,
  onDragStart,
  drawingType
}) => {
  const [activeMenu, setActiveMenu] = useState<MenuState>('none');
  const [colorTab, setColorTab] = useState<'stroke' | 'fill'>('stroke');
  const [localOpacity, setLocalOpacity] = useState(100);
  const [manualHex, setManualHex] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync opacity and hex state when properties change or tab changes
  useEffect(() => {
      const targetColor = colorTab === 'stroke' ? properties.color : (properties.backgroundColor || '#3b82f6');
      setLocalOpacity(getAlphaFromHex(targetColor));
      
      let clean = targetColor.startsWith('#') ? targetColor.slice(1) : targetColor;
      if (clean.length === 8) clean = clean.slice(0, 6);
      if (clean.length === 3) clean = clean.split('').map(c => c+c).join('');
      setManualHex(clean.toUpperCase());
  }, [properties.color, properties.backgroundColor, colorTab]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu('none');
      }
    };
    if (activeMenu !== 'none') {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeMenu]);

  if (!isVisible) return null;

  // Default position: Centered near bottom
  const style = position 
    ? { left: position.x, top: position.y }
    : { bottom: '100px', left: '50%', transform: 'translateX(-50%)' };

  const handleColorChange = (baseHex: string) => {
    const newColor = applyAlphaToHex(baseHex, localOpacity);
    
    if (colorTab === 'stroke') {
      onChange({ color: newColor });
    } else {
      onChange({ backgroundColor: newColor, filled: true });
    }
  };

  const handleOpacityChange = (val: number) => {
    setLocalOpacity(val);
    const targetColor = colorTab === 'stroke' ? properties.color : (properties.backgroundColor || '#3b82f6');
    const newColor = applyAlphaToHex(targetColor, val);
    
    if (colorTab === 'stroke') {
        onChange({ color: newColor });
    } else {
        onChange({ backgroundColor: newColor });
    }
  };

  const handleManualHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
      if (val.length <= 6) {
          setManualHex(val);
          if (val.length === 6) {
              handleColorChange('#' + val);
          }
      }
  };

  return (
    <div 
      className="absolute z-50 flex flex-col items-center"
      style={style}
      ref={menuRef}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* --- Popover Menus (Rendered ABOVE the toolbar) --- */}
      
      {/* 1. Color Picker Popover */}
      {activeMenu === 'color' && (
        <div className="mb-2 bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl p-3 w-64 animate-in fade-in slide-in-from-bottom-2 duration-200">
           {/* Tabs */}
           <div className="flex bg-[#0f172a] rounded-lg p-0.5 mb-3">
              <button 
                onClick={() => setColorTab('stroke')}
                className={`flex-1 text-[10px] font-bold uppercase py-1.5 rounded-md transition-all ${colorTab === 'stroke' ? 'bg-[#334155] text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
              >
                Stroke
              </button>
              <button 
                onClick={() => setColorTab('fill')}
                className={`flex-1 text-[10px] font-bold uppercase py-1.5 rounded-md transition-all ${colorTab === 'fill' ? 'bg-[#334155] text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
              >
                Fill
              </button>
           </div>

           {/* Color Grid */}
           <div className="grid grid-cols-8 gap-1.5 mb-3">
              {RICH_PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => handleColorChange(c)}
                  className={`w-6 h-6 rounded-full border border-white/10 hover:scale-110 transition-transform ${
                    // Check if base hex matches, ignoring alpha for selection highlight
                    (colorTab === 'stroke' ? properties.color : properties.backgroundColor)?.toLowerCase().startsWith(c.toLowerCase())
                      ? 'ring-2 ring-white ring-offset-1 ring-offset-[#1e293b]' 
                      : ''
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
           </div>

           {/* Hex Input */}
           <div className="flex items-center gap-2 mb-3">
               <div className="text-[10px] text-slate-500 font-bold">HEX</div>
               <div className="flex-1 flex items-center bg-[#0f172a] border border-[#334155] rounded px-2 py-1 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/20 transition-all">
                   <span className="text-slate-500 text-xs mr-1">#</span>
                   <input 
                       type="text" 
                       value={manualHex}
                       onChange={handleManualHexChange}
                       className="flex-1 bg-transparent border-none outline-none text-xs font-mono text-white placeholder-slate-600 uppercase"
                       placeholder="FFFFFF"
                   />
               </div>
           </div>

           {/* Opacity Slider */}
           <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-500 font-medium w-8">Opacity</span>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={localOpacity} 
                onChange={(e) => handleOpacityChange(parseInt(e.target.value))}
                className="flex-1 h-1 bg-[#334155] rounded-lg appearance-none cursor-pointer accent-white"
              />
              <span className="text-[10px] text-slate-300 w-6 text-right">{localOpacity}%</span>
           </div>
        </div>
      )}

      {/* 2. Stroke/Size Settings Popover */}
      {activeMenu === 'stroke' && (
        <div className="mb-2 bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl p-3 w-52 animate-in fade-in slide-in-from-bottom-2 duration-200">
            {drawingType === 'text' ? (
                <>
                    <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">Font Size</div>
                    <div className="flex items-center gap-2 mb-4">
                        <AArrowUp size={16} className="text-slate-400" />
                        <input 
                            type="range" 
                            min="10" 
                            max="72" 
                            value={properties.fontSize || 14} 
                            onChange={(e) => onChange({ fontSize: parseInt(e.target.value) })}
                            className="flex-1 h-1 bg-[#334155] rounded-lg appearance-none cursor-pointer accent-white"
                        />
                        <span className="text-xs font-mono text-white w-6 text-right">{properties.fontSize || 14}</span>
                    </div>

                    <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">Alignment</div>
                    <div className="flex items-center gap-1 bg-[#0f172a] p-1 rounded-lg mb-4">
                        <button 
                            onClick={() => onChange({ textAlign: 'left' })} 
                            className={`flex-1 p-1 flex justify-center items-center rounded transition-all ${!properties.textAlign || properties.textAlign === 'left' ? 'bg-[#334155] text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                            title="Align Left"
                        >
                            <AlignLeft size={16}/>
                        </button>
                        <button 
                            onClick={() => onChange({ textAlign: 'center' })} 
                            className={`flex-1 p-1 flex justify-center items-center rounded transition-all ${properties.textAlign === 'center' ? 'bg-[#334155] text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                            title="Align Center"
                        >
                            <AlignCenter size={16}/>
                        </button>
                        <button 
                            onClick={() => onChange({ textAlign: 'right' })} 
                            className={`flex-1 p-1 flex justify-center items-center rounded transition-all ${properties.textAlign === 'right' ? 'bg-[#334155] text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                            title="Align Right"
                        >
                            <AlignRight size={16}/>
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">Thickness</div>
                    <div className="flex items-center gap-2 mb-4">
                    {[1, 2, 3, 4].map(px => (
                        <button
                        key={px}
                        onClick={() => onChange({ lineWidth: px })}
                        className={`flex-1 h-8 flex items-center justify-center rounded hover:bg-[#334155] transition-colors ${properties.lineWidth === px ? 'bg-[#334155] ring-1 ring-white/20' : ''}`}
                        >
                            <div className="bg-white rounded-full" style={{ width: '60%', height: px }} />
                        </button>
                    ))}
                    </div>
                </>
            )}

            <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">Style</div>
            <div className="flex items-center gap-2">
               <button onClick={() => onChange({ lineStyle: 'solid' })} className={`flex-1 h-8 flex items-center justify-center rounded hover:bg-[#334155] ${properties.lineStyle === 'solid' ? 'bg-[#334155] text-white' : 'text-slate-400'}`} title="Solid"><Minus size={16} /></button>
               <button onClick={() => onChange({ lineStyle: 'dashed' })} className={`flex-1 h-8 flex items-center justify-center rounded hover:bg-[#334155] ${properties.lineStyle === 'dashed' ? 'bg-[#334155] text-white' : 'text-slate-400'}`} title="Dashed"><MoreHorizontal size={16} /></button>
               <button onClick={() => onChange({ lineStyle: 'dotted' })} className={`flex-1 h-8 flex items-center justify-center rounded hover:bg-[#334155] ${properties.lineStyle === 'dotted' ? 'bg-[#334155] text-white' : 'text-slate-400'}`} title="Dotted"><div className="flex gap-0.5"><div className="w-0.5 h-0.5 bg-current rounded-full"/><div className="w-0.5 h-0.5 bg-current rounded-full"/><div className="w-0.5 h-0.5 bg-current rounded-full"/></div></button>
            </div>
        </div>
      )}

      {/* 3. Text Editing Popover */}
      {activeMenu === 'text' && (
        <div className="mb-2 bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl p-3 w-64 animate-in fade-in slide-in-from-bottom-2 duration-200">
           <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">Text Content</div>
           <textarea 
             className="w-full bg-[#0f172a] border border-[#334155] rounded-md p-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
             rows={3}
             value={properties.text || ''}
             onChange={(e) => onChange({ text: e.target.value })}
             placeholder="Enter text..."
           />
        </div>
      )}

      {/* 4. Smoothing Popover (Brush Only) */}
      {activeMenu === 'smoothing' && drawingType === 'brush' && (
        <div className="mb-2 bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl p-3 w-52 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">Brush Smoothing</div>
            <div className="flex items-center gap-2">
                <input 
                    type="range" 
                    min="0" 
                    max="20" 
                    value={properties.smoothing || 0} 
                    onChange={(e) => onChange({ smoothing: parseInt(e.target.value) })}
                    className="flex-1 h-1 bg-[#334155] rounded-lg appearance-none cursor-pointer accent-white"
                />
                <span className="text-xs font-mono text-white w-6 text-right">{properties.smoothing || 0}</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-2 text-center italic">
                {properties.smoothing === 0 ? "Raw Input" : "Auto-smooth enabled"}
            </div>
        </div>
      )}

      {/* --- Main Toolbar Pill --- */}
      <div className="flex items-center gap-1 p-1 bg-[#1e293b] border border-[#334155] rounded-full shadow-xl shadow-black/50 backdrop-blur-md">
         
         {/* Drag Handle */}
         <div 
           onMouseDown={onDragStart}
           className="pl-2 pr-1 text-slate-500 cursor-move hover:text-slate-300 transition-colors"
         >
           <GripVertical size={14} />
         </div>

         <div className="w-px h-4 bg-[#334155] mx-1"></div>

         {/* Color Trigger */}
         <button 
            onClick={() => setActiveMenu(activeMenu === 'color' ? 'none' : 'color')}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${activeMenu === 'color' ? 'bg-[#334155]' : 'hover:bg-[#334155]'}`}
            title="Color & Opacity"
         >
            <div 
              className="w-4 h-4 rounded-full border border-white/20 shadow-sm" 
              style={{ backgroundColor: properties.color }}
            />
         </button>

         {/* Stroke/Size Settings Trigger */}
         <button 
            onClick={() => setActiveMenu(activeMenu === 'stroke' ? 'none' : 'stroke')}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-slate-400 transition-all ${activeMenu === 'stroke' ? 'bg-[#334155] text-white' : 'hover:bg-[#334155] hover:text-white'}`}
            title={drawingType === 'text' ? "Font Size & Style" : "Line Thickness & Style"}
         >
             {drawingType === 'text' ? (
                 <div className="font-serif font-bold text-sm">T<span className="text-[9px] align-top ml-0.5">{properties.fontSize || 14}</span></div>
             ) : (
                <div className="flex flex-col items-center gap-[2px]">
                    <div className="w-4 h-[1px] bg-current"></div>
                    <div className="w-4 h-[1px] bg-current"></div>
                    <div className="w-4 h-[1px] bg-current"></div>
                </div>
             )}
         </button>

         {/* Smoothing Trigger (Brush Only) */}
         {drawingType === 'brush' && (
             <button 
                onClick={() => setActiveMenu(activeMenu === 'smoothing' ? 'none' : 'smoothing')}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${activeMenu === 'smoothing' ? 'bg-[#334155] text-white' : 'hover:bg-[#334155] text-slate-400 hover:text-white'}`}
                title="Smoothing"
            >
                <Activity size={16} />
            </button>
         )}

         {/* Text Content Trigger (Only for Text Tools) */}
         {drawingType === 'text' && (
             <button 
                onClick={() => setActiveMenu(activeMenu === 'text' ? 'none' : 'text')}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-slate-400 transition-all ${activeMenu === 'text' ? 'bg-[#334155] text-white' : 'hover:bg-[#334155] hover:text-white'}`}
                title="Edit Text"
            >
                <Type size={16} />
            </button>
         )}
         
         {/* Toggle Fill (Direct Action) - Hide for text usually, but can keep for background box */}
         <button 
            onClick={() => onChange({ filled: !properties.filled })}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${properties.filled ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:bg-[#334155] hover:text-white'}`}
            title="Toggle Fill"
         >
            {properties.filled ? <Square size={16} fill="currentColor" /> : <Square size={16} />}
         </button>

         <div className="w-px h-4 bg-[#334155] mx-1"></div>

         {/* Delete Action */}
         {isSelection && onDelete && (
             <button 
               onClick={onDelete}
               className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-900/30 hover:text-red-400 transition-colors"
               title="Delete"
             >
               <Trash2 size={16} />
             </button>
         )}
         
         {/* Close/Deselect */}
         {!isSelection && (
             <button 
             className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 cursor-default"
            >
               <div className="w-1 h-1 bg-slate-600 rounded-full"></div>
            </button>
         )}

      </div>
    </div>
  );
};