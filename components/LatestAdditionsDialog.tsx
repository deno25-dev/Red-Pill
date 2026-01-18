
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
    <div 
        className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
        onClick={onClose}
        style={{ zIndex: 9999 }} // High z-index, but standard
    >
      <div 
        className="w-full max-w-md bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#334155] bg-[#0f172a]">
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

        <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar bg-[#1e293b]">
            <p className="text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                {content}
            </p>
        </div>
        
        <div className="p-4 bg-[#0f172a] border-t border-[#334155] text-center">
            <button 
                onClick={onClose}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-900/20"
            >
                Close
            </button>
        </div>
      </div>
    </div>
  );
};
