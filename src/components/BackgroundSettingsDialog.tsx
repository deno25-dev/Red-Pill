
import React from 'react';
import { X, PaintBucket, Layers } from 'lucide-react';
import { ChartConfig } from '../types';

interface BackgroundSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  config: ChartConfig;
  onUpdateConfig: (updates: Partial<ChartConfig>) => void;
}

const PRESET_COLORS = [
  '#0f172a', // Default Dark
  '#1e293b', // Lighter Dark
  '#000000', // Pitch Black
  '#111827', // Gray 900
  '#F8FAFC', // Slate 50
  '#ffffff', // White
  '#e2e8f0', // Slate 200
  '#f3f4f6', // Gray 100
];

export const BackgroundSettingsDialog: React.FC<BackgroundSettingsDialogProps> = ({
  isOpen,
  onClose,
  config,
  onUpdateConfig
}) => {
  if (!isOpen) return null;

  const bgType = config.backgroundType || 'solid';
  const topColor = config.backgroundTopColor || '#0f172a';
  const bottomColor = config.backgroundBottomColor || '#0f172a';
  const solidColor = config.backgroundColor || '#0f172a';

  return (
    <div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={onClose}
    >
      <div 
        className="w-full max-w-sm bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#334155] bg-[#0f172a]">
           <div className="flex items-center gap-2 font-bold text-slate-200">
              <PaintBucket size={18} className="text-amber-500" />
              <span>Chart Background</span>
           </div>
           <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <X size={18} />
           </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
           
           {/* Mode Selection */}
           <div className="flex bg-[#0f172a] p-1 rounded-lg">
               <button 
                 onClick={() => onUpdateConfig({ backgroundType: 'solid' })}
                 className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-bold uppercase transition-all ${bgType === 'solid' ? 'bg-[#334155] text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
               >
                   <div className="w-3 h-3 bg-current rounded-full" /> Solid
               </button>
               <button 
                 onClick={() => onUpdateConfig({ backgroundType: 'gradient' })}
                 className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-bold uppercase transition-all ${bgType === 'gradient' ? 'bg-[#334155] text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
               >
                   <Layers size={12} /> Gradient
               </button>
           </div>

           {bgType === 'solid' ? (
               <div className="space-y-3">
                   <div className="text-xs font-bold text-slate-500 uppercase">Solid Color</div>
                   <div className="flex items-center gap-3">
                       <input 
                          type="color" 
                          value={solidColor}
                          onChange={(e) => onUpdateConfig({ backgroundColor: e.target.value })}
                          className="w-10 h-10 rounded cursor-pointer bg-transparent border-none p-0"
                       />
                       <input 
                          type="text" 
                          value={solidColor}
                          onChange={(e) => onUpdateConfig({ backgroundColor: e.target.value })}
                          className="flex-1 bg-[#0f172a] border border-[#334155] rounded px-3 py-2 text-sm text-white font-mono"
                       />
                   </div>
                   <div className="grid grid-cols-8 gap-2 mt-2">
                       {PRESET_COLORS.map(c => (
                           <button 
                             key={c}
                             onClick={() => onUpdateConfig({ backgroundColor: c })}
                             className="w-6 h-6 rounded-full border border-white/10"
                             style={{ backgroundColor: c }}
                           />
                       ))}
                   </div>
               </div>
           ) : (
               <div className="space-y-4">
                   <div className="space-y-2">
                       <div className="text-xs font-bold text-slate-500 uppercase">Top Color</div>
                       <div className="flex items-center gap-3">
                           <input 
                              type="color" 
                              value={topColor}
                              onChange={(e) => onUpdateConfig({ backgroundTopColor: e.target.value })}
                              className="w-8 h-8 rounded cursor-pointer bg-transparent border-none p-0"
                           />
                           <input 
                              type="text" 
                              value={topColor}
                              onChange={(e) => onUpdateConfig({ backgroundTopColor: e.target.value })}
                              className="flex-1 bg-[#0f172a] border border-[#334155] rounded px-3 py-1.5 text-sm text-white font-mono"
                           />
                       </div>
                   </div>
                   <div className="space-y-2">
                       <div className="text-xs font-bold text-slate-500 uppercase">Bottom Color</div>
                       <div className="flex items-center gap-3">
                           <input 
                              type="color" 
                              value={bottomColor}
                              onChange={(e) => onUpdateConfig({ backgroundBottomColor: e.target.value })}
                              className="w-8 h-8 rounded cursor-pointer bg-transparent border-none p-0"
                           />
                           <input 
                              type="text" 
                              value={bottomColor}
                              onChange={(e) => onUpdateConfig({ backgroundBottomColor: e.target.value })}
                              className="flex-1 bg-[#0f172a] border border-[#334155] rounded px-3 py-1.5 text-sm text-white font-mono"
                           />
                       </div>
                   </div>
               </div>
           )}

           <div className="pt-2 flex justify-end border-t border-[#334155]">
               <button 
                onClick={() => onUpdateConfig({ 
                    backgroundType: 'solid',
                    backgroundColor: undefined,
                    backgroundTopColor: undefined,
                    backgroundBottomColor: undefined
                })}
                className="text-xs text-slate-500 hover:text-white transition-colors"
               >
                   Reset to Defaults
               </button>
           </div>
        </div>
      </div>
    </div>
  );
};
