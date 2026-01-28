import React from 'react';
import { X, CandlestickChart } from 'lucide-react';
import { ChartConfig } from '../types';
import { COLORS } from '../constants';

interface CandleSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  config: ChartConfig;
  onUpdateConfig: (updates: Partial<ChartConfig>) => void;
}

const RICH_PALETTE = [
  '#10B981', '#34D399', '#6EE7B7', // Emeralds (Bullish)
  '#EF4444', '#F87171', '#FCA5A5', // Reds (Bearish)
  '#3B82F6', '#60A5FA', '#93C5FD', // Blues
  '#6366F1', '#818CF8', '#A5B4FC', // Indigos
  '#8B5CF6', '#A78BFA', '#C4B5FD', // Violets
  '#D946EF', '#E879F9', '#F0ABFC', // Fuchsias
  '#F59E0B', '#FBBF24', '#FCD34D', // Ambers
  '#ffffff', '#a3a3a3', '#404040', '#171717', // Grayscale
];

export const CandleSettingsDialog: React.FC<CandleSettingsDialogProps> = ({
  isOpen,
  onClose,
  config,
  onUpdateConfig
}) => {
  if (!isOpen) return null;

  // Defaults if not set in config
  const upColor = config.upColor || COLORS.bullish;
  const downColor = config.downColor || COLORS.bearish;
  const wickUpColor = config.wickUpColor || COLORS.bullish;
  const wickDownColor = config.wickDownColor || COLORS.bearish;

  const ColorSection = ({ label, value, onChange }: { label: string, value: string, onChange: (c: string) => void }) => (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-xs text-slate-400 font-medium uppercase tracking-wide">
        <span>{label}</span>
        <div className="flex items-center gap-2">
           <input 
              type="color" 
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-5 h-5 rounded cursor-pointer bg-transparent border-none p-0 appearance-none"
           />
           <span className="font-mono text-slate-500">{value}</span>
        </div>
      </div>
      <div className="grid grid-cols-8 gap-1.5">
          {RICH_PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => onChange(c)}
              className={`w-5 h-5 rounded-full border border-white/5 hover:scale-110 transition-transform ${
                 value.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-white ring-offset-1 ring-offset-[#1e293b]' : ''
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
      </div>
    </div>
  );

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
              <CandlestickChart size={18} className="text-blue-500" />
              <span>Candle Settings</span>
           </div>
           <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <X size={18} />
           </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
           <div className="grid grid-cols-1 gap-6">
              <ColorSection 
                label="Bullish Body" 
                value={upColor} 
                onChange={(c) => onUpdateConfig({ upColor: c })} 
              />
              <ColorSection 
                label="Bearish Body" 
                value={downColor} 
                onChange={(c) => onUpdateConfig({ downColor: c })} 
              />
              <div className="h-px bg-[#334155]"></div>
              <ColorSection 
                label="Bullish Wick & Border" 
                value={wickUpColor} 
                onChange={(c) => onUpdateConfig({ wickUpColor: c, borderUpColor: c })} 
              />
               <ColorSection 
                label="Bearish Wick & Border" 
                value={wickDownColor} 
                onChange={(c) => onUpdateConfig({ wickDownColor: c, borderDownColor: c })} 
              />
           </div>

           <div className="pt-2 flex justify-end">
               <button 
                onClick={() => onUpdateConfig({ 
                    upColor: undefined, 
                    downColor: undefined, 
                    wickUpColor: undefined, 
                    wickDownColor: undefined,
                    borderUpColor: undefined,
                    borderDownColor: undefined
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