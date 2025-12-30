import React, { useMemo } from 'react';
import { X, Table as TableIcon } from 'lucide-react';
import { OHLCV } from '../types';

interface WatchlistPanelProps {
  isOpen: boolean;
  onClose: () => void;
  data: OHLCV[];
  symbol: string;
}

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
};

export const WatchlistPanel: React.FC<WatchlistPanelProps> = ({
  isOpen,
  onClose,
  data,
  symbol
}) => {
  const recentData = useMemo(() => {
      if (!data) return [];
      // Show last 50 candles for scrolling context, reversed to show newest first
      return [...data].reverse().slice(0, 50);
  }, [data]);

  return (
    <div className={`
        border-l border-[#334155] bg-[#1e293b] flex flex-col z-20 shrink-0 shadow-2xl transition-all duration-300
        ${isOpen ? 'w-[500px]' : 'w-0 border-l-0 overflow-hidden'}
    `}>
      {/* Header */}
      <div className="h-14 border-b border-[#334155] flex items-center justify-between px-4 bg-[#0f172a] shrink-0 min-w-[18rem]">
         <div className="flex items-center gap-2 font-bold text-slate-200">
            <TableIcon size={18} className="text-emerald-500" />
            <span>Recent Market Data</span>
         </div>
         <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-[#1e293b] transition-colors">
            <X size={18} />
         </button>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar bg-[#0f172a]">
           {data.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-40 text-slate-500 text-center px-4">
                   <p className="text-xs">No data available.</p>
               </div>
           ) : (
             <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#1e293b] sticky top-0 z-10 text-slate-400 font-medium">
                    <tr>
                        <th className="px-4 py-2 border-b border-[#334155]">Time</th>
                        <th className="px-4 py-2 border-b border-[#334155] text-right">Open</th>
                        <th className="px-4 py-2 border-b border-[#334155] text-right">High</th>
                        <th className="px-4 py-2 border-b border-[#334155] text-right">Low</th>
                        <th className="px-4 py-2 border-b border-[#334155] text-right">Close</th>
                        <th className="px-4 py-2 border-b border-[#334155] text-right">Change</th>
                        <th className="px-4 py-2 border-b border-[#334155] text-right">Volume</th>
                    </tr>
                </thead>
                <tbody className="text-slate-300 divide-y divide-[#334155]/30">
                    {recentData.map((d) => {
                        const change = d.close - d.open;
                        const changePct = (change / d.open) * 100;
                        const isUp = change >= 0;
                        
                        return (
                            <tr key={d.time} className="hover:bg-[#1e293b]/30 transition-colors">
                                <td className="px-4 py-2 font-mono text-slate-500 whitespace-nowrap">
                                    {new Date(d.time).toLocaleString()}
                                </td>
                                <td className="px-4 py-2 text-right font-mono">{d.open.toFixed(2)}</td>
                                <td className="px-4 py-2 text-right font-mono text-emerald-500/80">{d.high.toFixed(2)}</td>
                                <td className="px-4 py-2 text-right font-mono text-red-500/80">{d.low.toFixed(2)}</td>
                                <td className="px-4 py-2 text-right font-mono font-bold">{d.close.toFixed(2)}</td>
                                <td className="px-4 py-2 text-right whitespace-nowrap">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isUp ? 'bg-emerald-900/20 text-emerald-400' : 'bg-red-900/20 text-red-400'}`}>
                                        {isUp ? '+' : ''}{changePct.toFixed(2)}%
                                    </span>
                                </td>
                                <td className="px-4 py-2 text-right font-mono text-blue-300/80">
                                    {formatCurrency(d.volume)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
             </table>
           )}
      </div>
      
      <div className="p-2 border-t border-[#334155] bg-[#0f172a] text-[10px] text-slate-500 flex justify-between px-4">
         <span>{symbol}</span>
         <span>Showing last {recentData.length} candles</span>
      </div>
    </div>
  );
};