
import React from 'react';
import { Loader2 } from 'lucide-react';

export const SplashController: React.FC = () => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0f172a] text-white">
      <div className="mb-8 relative">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 bg-blue-500 rounded-full animate-pulse opacity-50"></div>
        </div>
      </div>
      
      <h1 className="text-2xl font-bold tracking-widest mb-2">RED PILL CHARTING</h1>
      <div className="flex items-center gap-2 text-slate-400 text-sm font-mono">
        <Loader2 size={14} className="animate-spin" />
        <span>Initializing System...</span>
      </div>
      
      <div className="absolute bottom-8 text-[10px] text-slate-600 font-mono">
        v1.2.5 • High Performance Architecture
      </div>
    </div>
  );
};
