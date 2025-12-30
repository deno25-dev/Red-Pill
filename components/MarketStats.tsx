import React, { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp, Activity, TrendingUp, TrendingDown } from 'lucide-react';
import { OHLCV } from '../types';

interface StatsPanelProps {
  currentSymbol: string;
  data: OHLCV[]; // Data for the current active chart
  isOpen: boolean;
  onToggle: () => void;
}

interface MarketTicker {
    symbol: string;
    price: number;
    change: number;
    changePct: number;
    high: number;
    low: number;
    volume: number;
}

// Initial set of "Popular" assets to display alongside current
const DEFAULT_ASSETS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AAPL', 'MSFT', 'TSLA', 'EUR/USD', 'XAU/USD'];

export const RecentMarketDataPanel: React.FC<StatsPanelProps> = ({ currentSymbol, data, isOpen, onToggle }) => {
  const [tickers, setTickers] = useState<MarketTicker[]>([]);

  // 1. Initialize & Simulate Market Data
  useEffect(() => {
      // Helper to generate a random ticker
      const createTicker = (sym: string, basePrice: number): MarketTicker => {
          const change = (Math.random() - 0.5) * (basePrice * 0.02);
          return {
              symbol: sym,
              price: basePrice,
              change: change,
              changePct: (change / basePrice) * 100,
              high: basePrice + Math.random() * (basePrice * 0.01),
              low: basePrice - Math.random() * (basePrice * 0.01),
              volume: Math.floor(Math.random() * 1000000) + 50000
          };
      };

      // Base prices for simulation
      const basePrices: Record<string, number> = {
          'BTC/USD': 65000, 'ETH/USD': 3500, 'SOL/USD': 150,
          'AAPL': 175, 'MSFT': 420, 'TSLA': 180,
          'EUR/USD': 1.08, 'XAU/USD': 2300
      };

      // Initial population
      const initialTickers = DEFAULT_ASSETS.map(sym => createTicker(sym, basePrices[sym] || 100));
      setTickers(initialTickers);

      // Simulation Interval
      const interval = setInterval(() => {
          setTickers(prev => prev.map(t => {
              // Random walk
              const drift = (Math.random() - 0.5) * (t.price * 0.001);
              const newPrice = t.price + drift;
              // Update High/Low
              const newHigh = Math.max(t.high, newPrice);
              const newLow = Math.min(t.low, newPrice);
              
              return {
                  ...t,
                  price: newPrice,
                  change: t.change + drift, // Cumulative change for "session"
                  changePct: ((t.change + drift) / (t.price - t.change)) * 100, // Approx
                  high: newHigh,
                  low: newLow,
                  volume: t.volume + Math.floor(Math.random() * 500)
              };
          }));
      }, 2000);

      return () => clearInterval(interval);
  }, []);

  // 2. Merge Current Active Chart Data into the View
  const displayTickers = useMemo(() => {
      let merged = [...tickers];
      
      // Ensure current symbol is present and up-to-date with REAL chart data if available
      if (currentSymbol) {
          const existingIdx = merged.findIndex(t => t.symbol === currentSymbol);
          
          if (data && data.length > 0) {
              const last = data[data.length - 1];
              const prev = data.length > 1 ? data[data.length - 2] : last;
              const openDay = data[0].open; // Or some reference
              
              const currentTicker: MarketTicker = {
                  symbol: currentSymbol,
                  price: last.close,
                  change: last.close - openDay, // Change since start of loaded data
                  changePct: ((last.close - openDay) / openDay) * 100,
                  high: Math.max(...data.slice(-50).map(d => d.high)), // High of recent loaded data
                  low: Math.min(...data.slice(-50).map(d => d.low)),
                  volume: last.volume
              };

              if (existingIdx !== -1) {
                  merged[existingIdx] = currentTicker;
              } else {
                  merged.unshift(currentTicker);
              }
          }
      }
      
      return merged;
  }, [tickers, currentSymbol, data]);

  const formatCurrency = (val: number, symbol: string) => {
      // Simple heuristic for formatting based on asset type
      if (symbol.includes('USD') && val < 2) return val.toFixed(4); // Forex/Pennies
      if (val > 1000) return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(val);
      return val.toFixed(2);
  };

  const formatVolume = (val: number) => {
      if (val >= 1000000) return (val / 1000000).toFixed(2) + 'M';
      if (val >= 1000) return (val / 1000).toFixed(2) + 'K';
      return val.toString();
  };

  return (
    <div className="border-t border-[#334155] bg-[#0f172a] shrink-0">
      <div 
        className="flex items-center justify-between px-4 py-2 bg-[#1e293b] cursor-pointer hover:bg-[#334155]/50 select-none border-b border-[#334155]"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
            <Activity size={16} className="text-amber-500" />
            <span>Market Overview</span>
        </div>
        <button className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors">
            {isOpen ? 'Hide' : 'Show'}
            {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {isOpen && (
        <div className="p-0 overflow-x-auto animate-in slide-in-from-top-2 duration-200">
             <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#1e293b]/50 text-slate-400 font-medium whitespace-nowrap">
                    <tr>
                        <th className="px-4 py-2 border-b border-[#334155]">Symbol</th>
                        <th className="px-4 py-2 border-b border-[#334155] text-right">Price</th>
                        <th className="px-4 py-2 border-b border-[#334155] text-right">Change</th>
                        <th className="px-4 py-2 border-b border-[#334155] text-right">High</th>
                        <th className="px-4 py-2 border-b border-[#334155] text-right">Low</th>
                        <th className="px-4 py-2 border-b border-[#334155] text-right">Volume</th>
                    </tr>
                </thead>
                <tbody className="text-slate-300 divide-y divide-[#334155]/30 whitespace-nowrap">
                    {displayTickers.map((t) => {
                        const isUp = t.change >= 0;
                        const isCurrent = t.symbol === currentSymbol;
                        
                        return (
                            <tr key={t.symbol} className={`hover:bg-[#1e293b]/30 transition-colors ${isCurrent ? 'bg-[#1e293b]/40' : ''}`}>
                                <td className="px-4 py-2 font-bold flex items-center gap-2">
                                    {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
                                    <span className={isCurrent ? 'text-blue-300' : 'text-slate-200'}>{t.symbol}</span>
                                </td>
                                <td className="px-4 py-2 text-right font-mono">{formatCurrency(t.price, t.symbol)}</td>
                                <td className="px-4 py-2 text-right">
                                    <div className={`flex items-center justify-end gap-1 ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                        <span className="font-bold">{t.changePct.toFixed(2)}%</span>
                                    </div>
                                </td>
                                <td className="px-4 py-2 text-right font-mono text-slate-400">{formatCurrency(t.high, t.symbol)}</td>
                                <td className="px-4 py-2 text-right font-mono text-slate-400">{formatCurrency(t.low, t.symbol)}</td>
                                <td className="px-4 py-2 text-right font-mono text-slate-500">
                                    {formatVolume(t.volume)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
             </table>
        </div>
      )}
    </div>
  );
};