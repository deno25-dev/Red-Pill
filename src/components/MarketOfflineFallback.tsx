import React from 'react';
import { WifiOff, RefreshCw, Activity } from 'lucide-react';

interface MarketOfflineFallbackProps {
  onRetry?: () => void;
}

export const MarketOfflineFallback: React.FC<MarketOfflineFallbackProps> = ({ onRetry }) => {
  return (
    <div className="flex flex-col items-center justify-center w-full p-6 text-center bg-panel-bg border-t border-app-border min-h-[240px]">
      <div className="relative mb-6 group">
        {/* Glow effect behind icon */}
        <div className="absolute inset-0 bg-accent-bg/5 rounded-full blur-xl group-hover:bg-accent-bg/10 transition-all duration-500"></div>
        
        <div className="relative p-4 rounded-full bg-app-bg border border-app-border shadow-xl ring-1 ring-white/5">
          <WifiOff size={28} className="text-text-secondary group-hover:text-accent-bg transition-colors duration-300" />
        </div>
        
        {/* Status Indicator Dot */}
        <div className="absolute -bottom-1 -right-1 bg-panel-bg rounded-full p-1 border border-app-border">
             <Activity size={12} className="text-danger animate-pulse" />
        </div>
      </div>
      
      <h3 className="mb-2 text-xs font-bold text-text-primary tracking-widest uppercase">Feed Disconnected</h3>
      
      <p className="max-w-[200px] mb-8 text-[11px] text-text-secondary leading-relaxed font-medium">
        Real-time data stream is currently offline. Check connection or retry.
      </p>
      
      {onRetry && (
        <button
            onClick={onRetry}
            className="group relative flex items-center gap-2 px-6 py-2 text-[11px] font-bold tracking-wide transition-all duration-200 rounded border border-accent-bg/30 text-accent-bg hover:bg-accent-bg hover:text-white hover:border-transparent active:scale-[0.98]"
        >
            <RefreshCw size={12} className="transition-transform group-hover:rotate-180 duration-500" />
            <span>RECONNECT FEED</span>
        </button>
      )}
    </div>
  );
};