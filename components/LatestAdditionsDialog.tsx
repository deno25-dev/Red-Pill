
import React, { useEffect, useState } from 'react';
import { X, Sparkles, CheckCircle2, ArrowUpCircle, AlertCircle } from 'lucide-react';
import { useChangelog } from '../hooks/useChangelog';

interface LatestAdditionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LatestAdditionsDialog: React.FC<LatestAdditionsDialogProps> = ({ isOpen, onClose }) => {
  const { data, refresh } = useChangelog();
  
  // Refetch when opened to ensure we have latest data if edited elsewhere
  useEffect(() => {
      if (isOpen) refresh();
  }, [isOpen, refresh]);

  if (!isOpen || !data) return null;

  const { version, date, changes } = data;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="w-full max-w-md bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#334155] bg-[#0f172a]">
           <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Sparkles size={20} className="text-purple-400" />
              </div>
              <div>
                  <h2 className="text-lg font-bold text-white">What's New</h2>
                  <p className="text-xs text-slate-400">Version {version} • {date}</p>
              </div>
           </div>
           <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <X size={20} />
           </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar bg-[#1e293b]">
            <div className="space-y-4">
                {changes.map((change, idx) => (
                    <div key={idx} className="flex gap-3 items-start group">
                        <div className={`mt-0.5 shrink-0 ${
                            change.type === 'new' ? 'text-emerald-400' : 
                            change.type === 'improvement' ? 'text-blue-400' : 'text-amber-400'
                        }`}>
                            {change.type === 'new' && <CheckCircle2 size={16} />}
                            {change.type === 'improvement' && <ArrowUpCircle size={16} />}
                            {change.type === 'fix' && <AlertCircle size={16} />}
                        </div>
                        <div>
                            <div className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${
                                change.type === 'new' ? 'text-emerald-500' : 
                                change.type === 'improvement' ? 'text-blue-500' : 'text-amber-500'
                            }`}>
                                {change.type}
                            </div>
                            <p className="text-sm text-slate-300 leading-relaxed font-medium">
                                {change.description}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 bg-[#0f172a] border-t border-[#334155] text-center">
            <button 
                onClick={onClose}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-900/20"
            >
                Continue
            </button>
        </div>
      </div>
    </div>
  );
};
