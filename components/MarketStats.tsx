import React, { useMemo } from 'react';
import { ChevronDown, ChevronUp, Table as TableIcon } from 'lucide-react';
import { OHLCV } from '../types';

interface StatsPanelProps {
  data: OHLCV[];
  isOpen: boolean;
  onToggle: () => void;
}

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
};

const formatNumber = (val: number) => {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(val);
};

export const RecentMarketDataPanel: React.FC<StatsPanelProps> = ({ data, isOpen, onToggle }) => {
  // Get last 15 candles reversed
  const recentData = useMemo(() => {
      if (!data) return [];
      return [...data].reverse().slice(0, 15);
  }, [data]);

  if (!data || data.length === 0) return null;

  return (
    <div className="border-t border-[#334155] bg-[#0f172a] shrink-0">
      <div 
        className="flex items-center justify-between px-4 py-2 bg-[#1e293b] cursor-pointer hover:bg-[#334155]/50 select-none border-b border-[#334155]"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
            <TableIcon size={16} className="text-amber-500" />
            <span>Recent Market Data</span>
        </div>
        <button className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors">
            {isOpen ? 'Hide' : 'Show'}
            {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {isOpen && (
        <div className="p-0 overflow-x-auto animate-in slide-in-from-top-2 duration-200">
             <div className="flex justify-between px-4 py-2 bg-[#0f172a] border-b border-[#334155]">
                <span className="text-xs font-bold text-blue-400">Recent Market Data</span>
                <span className="text-[10px] text-slate-500">Showing last {recentData.length} of {formatNumber(data.length)} candles</span>
             </div>
             <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#1e293b]/50 text-slate-400 font-medium">
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
                    {recentData.map((d, i) => {
                        const change = d.close - d.open;
                        const changePct = (change / d.open) * 100;
                        const isUp = change >= 0;
                        
                        return (
                            <tr key={d.time} className="hover:bg-[#1e293b]/30 transition-colors">
                                <td className="px-4 py-2 font-mono text-slate-500">
                                    {new Date(d.time).toLocaleString()}
                                </td>
                                <td className="px-4 py-2 text-right font-mono">{d.open.toFixed(2)}</td>
                                <td className="px-4 py-2 text-right font-mono text-emerald-500/80">{d.high.toFixed(2)}</td>
                                <td className="px-4 py-2 text-right font-mono text-red-500/80">{d.low.toFixed(2)}</td>
                                <td className="px-4 py-2 text-right font-mono font-bold">{d.close.toFixed(2)}</td>
                                <td className="px-4 py-2 text-right">
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
        </div>
      )}
    </div>
  );
};