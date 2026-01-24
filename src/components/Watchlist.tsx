
import React, { useState } from 'react';
import { useMarketPrices } from '@/hooks/useLiveData';
import { Plus, Trash2, TrendingUp, TrendingDown, WifiOff, Loader2 } from 'lucide-react';

interface WatchlistProps {
  currentSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

export const Watchlist: React.FC<WatchlistProps> = ({ currentSymbol, onSelectSymbol }) => {
  const { 
    tickers, 
    isConnected, 
    isSyncing,
    addSymbol, 
    removeSymbol,
    watchedSymbols 
  } = useMarketPrices(currentSymbol);

  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      addSymbol(input.trim());
      setInput('');
    }
  };

  const formatPrice = (price: string) => {
    const val = parseFloat(price);
    if (isNaN(val)) return '-';
    if (val < 1) return val.toFixed(4);
    if (val > 1000) return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return val.toFixed(2);
  };

  if (!isConnected && (!tickers || tickers.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-slate-500 text-center">
        <WifiOff size={24} className="mb-2 opacity-50" />
        <p className="text-xs">Market data offline.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#1e293b]">
      {/* Add Symbol Input */}
      <form onSubmit={handleSubmit} className="p-2 border-b border-[#334155] flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add Symbol (e.g. BTC)"
          className="flex-1 bg-[#0f172a] border border-[#334155] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500 uppercase placeholder-slate-600"
        />
        <button 
          type="submit"
          className="p-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
        >
          <Plus size={14} />
        </button>
      </form>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isSyncing && tickers.length === 0 && (
          <div className="flex justify-center p-4">
            <Loader2 size={16} className="animate-spin text-blue-400" />
          </div>
        )}
        
        {tickers.map((t) => {
          const isUp = parseFloat(t.priceChange) >= 0;
          const isCurrent = t.symbol === currentSymbol || t.symbol === `${currentSymbol}USDT`;
          
          return (
            <div 
              key={t.symbol}
              onClick={() => onSelectSymbol(t.symbol)}
              className={`
                group flex items-center justify-between px-3 py-2 border-b border-[#334155]/30 cursor-pointer transition-colors
                ${isCurrent ? 'bg-blue-900/20 border-l-2 border-l-blue-500' : 'hover:bg-[#334155]/50 border-l-2 border-l-transparent'}
              `}
            >
              <div className="flex flex-col min-w-0">
                <span className={`text-xs font-bold ${isCurrent ? 'text-blue-300' : 'text-slate-200'}`}>
                  {t.symbol.replace('USDT', '')}
                </span>
                <span className="text-[10px] text-slate-500 truncate">
                  Vol {parseFloat(t.quoteVolume).toLocaleString(undefined, { notation: 'compact' })}
                </span>
              </div>

              <div className="flex flex-col items-end">
                <span className="text-xs font-mono text-slate-200">
                  {formatPrice(t.lastPrice)}
                </span>
                <div className={`flex items-center gap-0.5 text-[10px] font-medium ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {parseFloat(t.priceChangePercent).toFixed(2)}%
                </div>
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); removeSymbol(t.symbol); }}
                className="opacity-0 group-hover:opacity-100 absolute right-2 p-1.5 bg-[#0f172a] text-slate-500 hover:text-red-400 rounded shadow-lg transition-opacity"
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
