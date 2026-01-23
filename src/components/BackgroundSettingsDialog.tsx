
import React from 'react';
import { X, PaintBucket } from 'lucide-react';
import { ChartConfig } from '../types';

interface BackgroundSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  config: ChartConfig;
  onUpdateConfig: (updates: Partial<ChartConfig>) => void;
}

const RICH_PALETTE = [
  '#0f172a', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8',
  '#ffffff', '#f8fafc', '#e2e8f0', '#cbd5e1', 
  '#10B981', '#34D399', '#6EE7B7', 
  '#EF4444', '#F87171', '#FCA5A5', 
  '#3B82F6', '#60A5FA', '#93C5FD', 
  '#8B5CF6', '#A78BFA', '#C4B5FD', 
  '#F59E0B', '#FBBF24', '#FCD34D',
];

export const BackgroundSettingsDialog: React.FC<BackgroundSettingsDialogProps> = ({
  isOpen,
  onClose,
  config,
  onUpdateConfig
}) => {
  if (!isOpen) return null;

  const type = config.backgroundType || 'solid';
  const bgColor = config.backgroundColor || (config.theme === 'light' ? '#ffffff' : '#0f172a');
  const topColor = config.backgroundTopColor || (config.theme === 'light' ? '#ffffff' : '#0f172a');
  const bottomColor = config.backgroundBottomColor || (config.theme === 'light' ? '#ffffff' : '#0f172a');

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
              <PaintBucket size={18} className="text-amber-400" />
              <span>Background Settings</span>
           </div>
           <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <X size={18} />
           </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#334155] bg-[#1e293b]">
            <button
                onClick={() => onUpdateConfig({ backgroundType: 'solid' })}
                className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
                    type === 'solid' ? 'border-amber-400 text-amber-400 bg-[#334155]/50' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#334155]/30'
                }`}
            >
                Solid Color
            </button>
            <button
                onClick={() => onUpdateConfig({ backgroundType: 'gradient' })}
                className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
                    type === 'gradient' ? 'border-amber-400 text-amber-400 bg-[#334155]/50' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#334155]/30'
                }`}
            >
                Gradient
            </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
           {type === 'solid' ? (
                <ColorSection 
                    label="Chart Background" 
                    value={bgColor} 
                    onChange={(c) => onUpdateConfig({ backgroundColor: c })} 
                />
           ) : (
                <>
                    <ColorSection 
                        label="Top Color" 
                        value={topColor} 
                        onChange={(c) => onUpdateConfig({ backgroundTopColor: c })} 
                    />
                    <ColorSection 
                        label="Bottom Color" 
                        value={bottomColor} 
                        onChange={(c) => onUpdateConfig({ backgroundBottomColor: c })} 
                    />
                </>
           )}

           <div className="pt-2 flex justify-end">
               <button 
                onClick={() => onUpdateConfig({ 
                    backgroundColor: undefined,
                    backgroundType: undefined,
                    backgroundTopColor: undefined,
                    backgroundBottomColor: undefined
                })}
                className="text-xs text-slate-500 hover:text-white transition-colors"
               >
                   Reset to Theme Default
               </button>
           </div>
        </div>
      </div>
    </div>
  );
};
