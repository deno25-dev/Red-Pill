import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Activity, TrendingUp, TrendingDown, Wifi, WifiOff, Plus, Trash2, X, Loader2 } from 'lucide-react';
import { useMarketPrices } from '../hooks/useLiveData';
import { MarketOfflineFallback } from './MarketOfflineFallback';

interface StatsPanelProps {
  currentSymbol: string;
  isOpen: boolean;
  onToggle: () => void;
}

export const RecentMarketDataPanel: React.FC<StatsPanelProps> = ({ currentSymbol, isOpen, onToggle }) => {
  // Consuming the upgraded hook with Smart Fetch capabilities
  const { 
      tickers, 
      isConnected, 
      isSyncing,
      isSettling,
      lastUpdated, 
      addSymbol, 
      removeSymbol, 
      watchedSymbols, 
      refetch 
  } = useMarketPrices(currentSymbol);
  
  const [isAdding, setIsAdding] = useState(false);
  const [newSymbolInput, setNewSymbolInput] = useState('');

  const displayTickers = useMemo(() => {
    if (!tickers) return [];
    
    // Transform API data to display format
    return tickers.map(t => {
      // Normalize symbol for display (BTCUSDT -> BTC/USDT)
      let displaySymbol = t.symbol;
      if (t.symbol.endsWith('USDT')) {
         displaySymbol = t.symbol.replace('USDT', '/USDT');
      } else if (t.symbol.endsWith('USD')) {
         displaySymbol = t.symbol.replace('USD', '/USD');
      } else if (t.symbol.endsWith('BTC')) {
         displaySymbol = t.symbol.replace('BTC', '/BTC');
      }

      return {
        originalSymbol: t.symbol,
        symbol: displaySymbol,
        price: parseFloat(t.lastPrice),
        change: parseFloat(t.priceChange),
        changePct: parseFloat(t.priceChangePercent),
        high: parseFloat(t.highPrice),
        low: parseFloat(t.lowPrice),
        volume: parseFloat(t.volume), // Base volume
        quoteVolume: parseFloat(t.quoteVolume) // USDT volume
      };
    });
  }, [tickers]);

  // Helper to check if a live ticker matches the current local chart
  const isMatch = (liveSymbol: string) => {
      const normalizedLocal = currentSymbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      return liveSymbol === normalizedLocal || 
             (normalizedLocal.length <= 5 && liveSymbol === `${normalizedLocal}USDT`);
  };

  const formatCurrency = (val: number) => {
      if (val < 1) return val.toFixed(4);
      if (val > 1000) return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(val);
      return val.toFixed(2);
  };

  const formatVolume = (val: number) => {
      if (val >= 1000000000) return (val / 1000000000).toFixed(2) + 'B';
      if (val >= 1000000) return (val / 1000000).toFixed(2) + 'M';
      if (val >= 1000) return (val / 1000).toFixed(2) + 'K';
      return val.toFixed(0);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (newSymbolInput) {
          addSymbol(newSymbolInput);
          setNewSymbolInput('');
      }
  };

  // Determine if we should show fallback
  // Logic: Show fallback if we have NO data AND we are not currently trying to get it (unless we are offline)
  const showFallback = (!tickers || tickers.length === 0) && !isConnected;

  // Determine Status Label and Color
  let statusLabel = 'OFFLINE';
  let statusColorClass = 'bg-slate-800 text-slate-500 border-slate-700';

  if (isConnected) {
      if (isSettling) {
          statusLabel = 'CONNECTING';
          statusColorClass = 'bg-amber-900/20 text-amber-400 border-amber-900/50 animate-pulse';
      } else if (isSyncing) {
          statusLabel = 'SYNCING';
          statusColorClass = 'bg-blue-900/20 text-blue-400 border-blue-900/50';
      } else {
          statusLabel = 'LIVE';
          statusColorClass = 'bg-emerald-900/20 text-emerald-400 border-emerald-900/50';
      }
  }

  return (
    <div className="border-t border-[#334155] bg-[#0f172a] shrink-0">
      <div 
        className="flex items-center justify-between px-4 py-2 bg-[#1e293b] cursor-pointer hover:bg-[#334155]/50 select-none border-b border-[#334155]"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
            <Activity size={16} className={isConnected ? "text-emerald-500" : "text-slate-500"} />
            <span>Market Overview</span>
            <span className={`text-[10px] font-normal px-1.5 rounded border ml-2 transition-all duration-300 ${statusColorClass}`}>
                {statusLabel}
            </span>
        </div>
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-[10px] text-slate-500">
                {isSyncing ? (
                    <Loader2 size={10} className="animate-spin text-blue-400" />
                ) : isConnected ? (
                    <Wifi size={10} />
                ) : (
                    <WifiOff size={10} />
                )}
                {isConnected && <span>{new Date(lastUpdated).toLocaleTimeString()}</span>}
            </div>
            
            {/* Add Symbol Button - Disabled if offline */}
            <button 
                onClick={(e) => { e.stopPropagation(); if (isConnected) { setIsAdding(!isAdding); if(!isOpen) onToggle(); }}}
                className={`flex items-center justify-center p-1 rounded transition-colors ${isAdding ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-[#334155]'} ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="Add Symbol"
                disabled={!isConnected}
            >
                <Plus size={14} />
            </button>

            <button className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors">
                {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
        </div>
      </div>

      {isOpen && (
        <div className="flex flex-col animate-in slide-in-from-top-2 duration-200">
             
             {showFallback ? (
                 <MarketOfflineFallback onRetry={refetch} />
             ) : (
                 <>
                    {/* Add Symbol Form */}
                    {isAdding && (
                        <form onSubmit={handleAddSubmit} className="flex gap-2 p-2 bg-[#1e293b] border-b border-[#334155]">
                            <input 
                                type="text" 
                                value={newSymbolInput} 
                                onChange={(e) => setNewSymbolInput(e.target.value)}
                                placeholder="Symbol (e.g. SOL)"
                                className="flex-1 bg-[#0f172a] border border-[#334155] rounded px-3 py-1 text-xs text-white focus:outline-none focus:border-blue-500 uppercase placeholder-slate-600"
                                autoFocus
                            />
                            <button 
                                type="submit" 
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold"
                            >
                                Add
                            </button>
                            <button 
                                type="button" 
                                onClick={() => setIsAdding(false)}
                                className="px-2 py-1 text-slate-400 hover:text-white hover:bg-[#334155] rounded"
                            >
                                <X size={14} />
                            </button>
                        </form>
                    )}

                    <div className="p-0 overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-[#1e293b]/50 text-slate-400 font-medium whitespace-nowrap">
                                <tr>
                                    <th className="px-4 py-2 border-b border-[#334155]">Symbol</th>
                                    <th className="px-4 py-2 border-b border-[#334155] text-right">Price</th>
                                    <th className="px-4 py-2 border-b border-[#334155] text-right">24h Change</th>
                                    <th className="px-4 py-2 border-b border-[#334155] text-right">24h High</th>
                                    <th className="px-4 py-2 border-b border-[#334155] text-right">24h Low</th>
                                    <th className="px-4 py-2 border-b border-[#334155] text-right">Vol (Quote)</th>
                                    <th className="w-8 border-b border-[#334155]"></th>
                                </tr>
                            </thead>
                            <tbody className="text-slate-300 divide-y divide-[#334155]/30 whitespace-nowrap">
                                {(!tickers || tickers.length === 0) ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500 italic">
                                            {isSettling ? 'Establishing connection...' : 'Loading market data...'}
                                        </td>
                                    </tr>
                                ) : (
                                    displayTickers.map((t) => {
                                        const isUp = t.change >= 0;
                                        const isCurrent = isMatch(t.originalSymbol);
                                        const isDeletable = watchedSymbols.includes(t.originalSymbol);
                                        
                                        return (
                                            <tr key={t.symbol} className={`group hover:bg-[#1e293b]/30 transition-colors ${isCurrent ? 'bg-[#1e293b]/40 border-l-2 border-blue-500' : ''}`}>
                                                <td className="px-4 py-2 font-bold flex items-center gap-2">
                                                    <span className={isCurrent ? 'text-blue-300' : 'text-slate-200'}>{t.symbol}</span>
                                                    {isCurrent && <span className="text-[9px] bg-blue-900/40 text-blue-400 px-1 rounded">Active</span>}
                                                </td>
                                                <td className="px-4 py-2 text-right font-mono text-slate-200">{formatCurrency(t.price)}</td>
                                                <td className="px-4 py-2 text-right">
                                                    <div className={`flex items-center justify-end gap-1 ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                                        <span className="font-bold">{t.changePct.toFixed(2)}%</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2 text-right font-mono text-slate-400">{formatCurrency(t.high)}</td>
                                                <td className="px-4 py-2 text-right font-mono text-slate-400">{formatCurrency(t.low)}</td>
                                                <td className="px-4 py-2 text-right font-mono text-slate-500">
                                                    {formatVolume(t.quoteVolume)}
                                                </td>
                                                <td className="px-2 text-center">
                                                    {isDeletable && (
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); removeSymbol(t.originalSymbol); }}
                                                            className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-all"
                                                            title="Remove symbol"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                 </>
             )}
        </div>
      )}
    </div>
  );
};