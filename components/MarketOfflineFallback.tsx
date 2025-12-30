import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

interface MarketOfflineFallbackProps {
  onRetry?: () => void;
}

export const MarketOfflineFallback: React.FC<MarketOfflineFallbackProps> = ({ onRetry }) => {
  return (
    <div className="flex flex-col items-center justify-center w-full p-8 text-center bg-[#0f172a] border-t border-[#334155]/50 min-h-[200px]">
      <div className="p-3 mb-3 rounded-full bg-[#1e293b] border border-white/5 shadow-inner">
        <WifiOff size={24} className="text-slate-500" />
      </div>
      <h3 className="mb-1 text-sm font-bold text-slate-200 tracking-wide">Live Feed Paused</h3>
      <p className="max-w-[240px] mb-5 text-xs text-slate-500 leading-relaxed">
        Connect to the internet to see real-time market updates. Local charting is still active.
      </p>
      <button
        onClick={onRetry}
        className="group flex items-center gap-2 px-4 py-2 text-xs font-medium transition-all duration-200 border rounded-full text-blue-400 border-blue-500/30 hover:bg-blue-500/10 hover:border-blue-500/50 hover:shadow-[0_0_10px_rgba(59,130,246,0.1)] active:scale-95"
      >
        <RefreshCw size={14} className="transition-transform group-hover:rotate-180 duration-500" />
        <span>Re-connect</span>
      </button>
    </div>
  );
};