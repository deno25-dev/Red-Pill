import React, { useEffect, useState } from 'react';
import { X, Sparkles } from 'lucide-react';

interface LatestAdditionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LatestAdditionsDialog: React.FC<LatestAdditionsDialogProps> = ({ isOpen, onClose }) => {
  const [content, setContent] = useState('');

  useEffect(() => {
      if (isOpen) {
          const stored = localStorage.getItem('app_changelog_data');
          setContent(stored || 'No updates available at this time.');
      }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    // 1. OUTER OVERLAY: Hardcoded high z-index and flex centering
    <div 
        style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999, // Guarantees it sits on top
            backgroundColor: 'rgba(0, 0, 0, 0.6)', // Standard dark overlay
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        }}
        onClick={onClose}
    >
      {/* 2. MODAL CARD: Simple relative positioning */}
      <div 
        className="w-full max-w-md bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ position: 'relative', maxHeight: '80vh' }}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#334155] bg-[#0f172a] rounded-t-xl">
           <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Sparkles size={20} className="text-purple-400" />
              </div>
              <h2 className="text-lg font-bold text-white">Latest Updates</h2>
           </div>
           <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <X size={20} />
           </button>
        </div>

        {/* CONTENT AREA */}
        <div className="p-6 overflow-y-auto custom-scrollbar bg-[#1e293b]">
            <p className="text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                {content}
            </p>
        </div>
        
        {/* FOOTER */}
        <div className="p-4 bg-[#0f172a] border-t border-[#334155] text-center rounded-b-xl">
            <button 
                onClick={onClose}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg"
            >
                Close
            </button>
        </div>
      </div>
    </div>
  );
};