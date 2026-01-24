
import React, { useState, useEffect } from 'react';
import { X, List, Plus, Trash2, RefreshCw } from 'lucide-react';
import { WatchlistItem } from '../types';

interface WatchlistPanelProps {
  isOpen: boolean;
  onClose: () => void;
  items: WatchlistItem[];
  onSelect: (symbol: string) => void;
  onAdd: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  currentSymbol?: string;
}

interface MarketData {
  price: number;
  change: number;
  volume: number;
}

export const WatchlistPanel: React.FC<WatchlistPanelProps> = ({
  isOpen,
  onClose,
  items,
  onSelect,
  onAdd,
  onRemove,
  currentSymbol
}) => {
  const [inputValue, setInputValue] = useState('');
  const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (inputValue.trim()) {
          onAdd(inputValue.trim().toUpperCase());
          setInputValue('');
      }
  };

  // --- Mock Data Logic (Offline) ---
  useEffect(() => {
    let isMounted = true;
    
    const generateMockMarketData = () => {
      if (items.length === 0) return;
      
      setIsLoading(true);

      const newData: Record<string, MarketData> = {};
      
      items.forEach(item => {
          // Generate a deterministic but slightly fluctuating mock price
          const hash = item.symbol.split('').reduce((a: number, b: string) => a + b.charCodeAt(0), 0);
          const basePrice = 1000 + (hash % 50000);
          const variance = (Math.random() - 0.5) * (basePrice * 0.02); // 2% fluctuation
          
          newData[item.symbol] = {
              price: basePrice + variance,
              change: (Math.random() - 0.5) * 5, // Random % change
              volume: 1000000 + Math.random() * 5000000
          };
      });
      
      // Simulate network delay slightly
      setTimeout(() => {
          if (isMounted) {
            setMarketData(prev => ({...prev, ...newData}));
            setLastUpdated(new Date());
            setIsLoading(false);
          }
      }, 500);
    };

    // Initial Load
    generateMockMarketData();

    // Poll every 5 seconds
    const interval = setInterval(generateMockMarketData, 5000);
    
    return () => {
        isMounted = false;
        clearInterval(interval);
    };
  }, [items]); // Re-run when items list changes

  const formatPrice = (val: number) => {
      if (val < 1) return val.toFixed(4);
      if (val < 10) return val.toFixed(3);
      return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className={`
        border-l border-[#334155] bg-[#1e293b] flex flex-col z-20 shrink-0 shadow-2xl transition-all duration-300
        ${isOpen ? 'w-72' : 'w-0 border-l-0 overflow-hidden'}
    `}>
      {/* Header */}
      <div className="h-14 border-b border-[#334155] flex items-center justify-between px-4 bg-[#0f172a] shrink-0 min-w-[18rem]">
         <div className="flex items-center gap-2 font-bold text-slate-200">
            <List size={18} className="text-emerald-500" />
            <span>Watchlist</span>
         </div>
         <div className="flex items-center gap-1">
             <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1 mr-2">
                 {isLoading && <RefreshCw size={10} className="animate-spin" />}
                 {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
             </div>
             <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-[#1e293b] transition-colors">
                <X size={18} />
             </button>
         </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col min-w-[18rem]">
          {/* Add Symbol Input */}
          <div className="p-3 border-b border-[#334155] bg-[#1e293b]">
              <form onSubmit={handleSubmit} className="flex gap-2 mb-2">
                  <div className="relative flex-1">
                      <input 
                          type="text" 
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          placeholder="Add Symbol (e.g. BTC)..."
                          className="w-full bg-[#0f172a] border border-[#334155] rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 placeholder-slate-600 uppercase"
                      />
                  </div>
                  <button 
                    type="submit"
                    className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                  >
                      <Plus size={16} />
                  </button>
              </form>
              
              {currentSymbol && !items.some(i => i.symbol === currentSymbol) && (
                  <button 
                    onClick={() => onAdd(currentSymbol)}
                    className="w-full flex items-center justify-center gap-2 py-1.5 rounded border border-dashed border-[#334155] text-xs text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
                  >
                      <Plus size={12} />
                      <span>Add Current: {currentSymbol}</span>
                  </button>
              )}
          </div>

          {/* List Headers */}
          {items.length > 0 && (
              <div className="flex items-center px-4 py-2 bg-[#0f172a]/50 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  <span className="flex-1">Symbol</span>
                  <span className="w-16 text-right">Last</span>
                  <span className="w-14 text-right">Chg%</span>
              </div>
          )}

          {/* List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
              {items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-slate-500 text-center px-4">
                      <List size={24} className="opacity-20 mb-2" />
                      <p className="text-xs">Your watchlist is empty.</p>
                      <p className="text-[10px] text-slate-600 mt-2">Add symbols to track real-time prices.</p>
                  </div>
              ) : (
                  <div className="space-y-0.5">
                      {items.map(item => {
                          const data = marketData[item.symbol];
                          const isUp = data && data.change >= 0;
                          
                          return (
                            <div 
                                key={item.symbol} 
                                className="group flex items-center justify-between px-3 py-2.5 rounded hover:bg-[#334155] cursor-pointer transition-colors border-l-2 border-transparent hover:border-blue-500"
                                onClick={() => onSelect(item.symbol)}
                            >
                                <div className="flex flex-col overflow-hidden flex-1 min-w-0 pr-2">
                                    <div className="flex items-center gap-2">
                                        <span className={`font-bold text-sm truncate ${item.symbol === currentSymbol ? 'text-blue-400' : 'text-slate-200'}`}>
                                            {item.symbol}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 truncate">
                                        {data ? `Vol ${data.volume > 1000000 ? (data.volume/1000000).toFixed(1) + 'M' : (data.volume/1000).toFixed(1) + 'K'}` : 'Offline'}
                                    </div>
                                </div>
                                
                                {data ? (
                                    <div className="flex items-center gap-3">
                                        <div className="text-right">
                                            <div className="text-sm font-mono text-slate-200">{formatPrice(data.price)}</div>
                                        </div>
                                        <div className={`w-14 text-right px-1.5 py-0.5 rounded text-[10px] font-bold ${isUp ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                            {data.change > 0 ? '+' : ''}{data.change.toFixed(2)}%
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center text-slate-600 text-[10px] italic">
                                        --
                                    </div>
                                )}
                                
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onRemove(item.symbol); }}
                                    className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-400 rounded transition-all absolute right-2 bg-[#1e293b] shadow-lg"
                                    title="Remove from Watchlist"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                          );
                      })}
                  </div>
              )}
          </div>
          
          <div className="p-2 border-t border-[#334155] bg-[#0f172a] text-[9px] text-slate-600 text-center">
             Offline Mode - Mock Data
          </div>
      </div>
    </div>
  );
};
