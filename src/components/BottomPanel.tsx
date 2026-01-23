import React, { useState } from 'react';
import { ChevronUp, ChevronDown, Target, Save, AlertCircle } from 'lucide-react';
import { Trade } from '../types';

interface BottomPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  trades: Trade[];
  onTradeClick?: (trade: Trade) => void;
  onSyncToDb?: () => void;
  hasUnsavedChanges?: boolean;
}

export const BottomPanel: React.FC<BottomPanelProps> = ({ 
    isOpen, 
    onToggle, 
    trades, 
    onTradeClick,
    onSyncToDb,
    hasUnsavedChanges 
}) => {
  const [activeTab, setActiveTab] = useState<'positions' | 'orders' | 'history'>('history');

  // Filter trades for display based on tab (Mock logic for now since all are filled)
  const displayTrades = activeTab === 'history' 
    ? trades 
    : activeTab === 'positions' 
      ? trades.filter(t => t.status === 'filled') // In real app, calculate net positions
      : trades.filter(t => t.status === 'open');

  return (
    <div className={`
        border-t border-[#334155] bg-[#1e293b] flex flex-col transition-all duration-300
        ${isOpen ? 'h-64' : 'h-8'}
    `}>
      {/* Header / Toggle Bar */}
      <div 
        className="h-8 flex items-center justify-between px-2 bg-[#0f172a] cursor-pointer hover:bg-[#1e293b]/50 select-none"
        onClick={onToggle}
      >
        <div className="flex items-center gap-1">
            <button 
                onClick={(e) => { e.stopPropagation(); setActiveTab('positions'); if(!isOpen) onToggle(); }}
                className={`px-3 py-1 text-xs font-bold border-t-2 transition-colors ${activeTab === 'positions' && isOpen ? 'border-blue-500 text-blue-400 bg-[#1e293b]' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
            >
                Positions
            </button>
            <button 
                onClick={(e) => { e.stopPropagation(); setActiveTab('orders'); if(!isOpen) onToggle(); }}
                className={`px-3 py-1 text-xs font-bold border-t-2 transition-colors ${activeTab === 'orders' && isOpen ? 'border-blue-500 text-blue-400 bg-[#1e293b]' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
            >
                Open Orders
            </button>
            <button 
                onClick={(e) => { e.stopPropagation(); setActiveTab('history'); if(!isOpen) onToggle(); }}
                className={`px-3 py-1 text-xs font-bold border-t-2 transition-colors ${activeTab === 'history' && isOpen ? 'border-blue-500 text-blue-400 bg-[#1e293b]' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
            >
                Order History
            </button>
        </div>
        
        <div className="flex items-center gap-3">
            {onSyncToDb && (
                <button
                    onClick={(e) => { e.stopPropagation(); onSyncToDb(); }}
                    className={`flex items-center gap-2 px-3 py-0.5 rounded text-[10px] font-bold uppercase transition-all ${
                        hasUnsavedChanges 
                        ? 'bg-amber-600 hover:bg-amber-500 text-white animate-pulse' 
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    }`}
                    title="Export orders to Database/Orders/orders_history.json"
                >
                    {hasUnsavedChanges ? <AlertCircle size={12} /> : <Save size={12} />}
                    {hasUnsavedChanges ? 'Sync Needed' : 'Sync to DB'}
                </button>
            )}

            <div className="flex items-center gap-2 text-slate-500">
                {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </div>
        </div>
      </div>

      {/* Content */}
      {isOpen && (
        <div className="flex-1 overflow-auto custom-scrollbar bg-[#0f172a] p-0">
            <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#1e293b] sticky top-0 z-10 text-slate-400 font-medium">
                    <tr>
                        <th className="px-4 py-2 border-b border-[#334155]">Time</th>
                        <th className="px-4 py-2 border-b border-[#334155]">Symbol</th>
                        <th className="px-4 py-2 border-b border-[#334155]">Type</th>
                        <th className="px-4 py-2 border-b border-[#334155]">Side</th>
                        <th className="px-4 py-2 border-b border-[#334155] text-right">Price</th>
                        <th className="px-4 py-2 border-b border-[#334155] text-right">Amount</th>
                        <th className="px-4 py-2 border-b border-[#334155] text-right">Value</th>
                        <th className="px-4 py-2 border-b border-[#334155] text-right">S/L</th>
                        <th className="px-4 py-2 border-b border-[#334155] text-right">T/P</th>
                        <th className="px-4 py-2 border-b border-[#334155] text-center">Status</th>
                        <th className="px-4 py-2 border-b border-[#334155] text-center">Action</th>
                    </tr>
                </thead>
                <tbody className="text-slate-300">
                    {displayTrades.length === 0 ? (
                        <tr>
                            <td colSpan={11} className="px-4 py-8 text-center text-slate-500 italic">
                                No {activeTab} found.
                            </td>
                        </tr>
                    ) : (
                        displayTrades.slice().reverse().map((trade) => (
                            <tr 
                                key={trade.id} 
                                className="hover:bg-[#1e293b]/50 transition-colors border-b border-[#334155]/30 cursor-pointer"
                                onClick={() => onTradeClick?.(trade)}
                            >
                                <td className="px-4 py-2 font-mono text-slate-400">
                                    {new Date(trade.timestamp).toLocaleTimeString()}
                                </td>
                                <td className="px-4 py-2 font-bold">{trade.symbol}</td>
                                <td className="px-4 py-2 uppercase text-[10px] tracking-wider text-slate-400">{trade.type}</td>
                                <td className={`px-4 py-2 font-bold uppercase ${trade.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {trade.side}
                                </td>
                                <td className="px-4 py-2 text-right font-mono">{trade.price.toFixed(2)}</td>
                                <td className="px-4 py-2 text-right font-mono">{trade.qty}</td>
                                <td className="px-4 py-2 text-right font-mono text-slate-400">{trade.value.toFixed(2)}</td>
                                <td className="px-4 py-2 text-right font-mono text-red-300/80">
                                    {trade.stopLoss ? trade.stopLoss.toFixed(2) : '—'}
                                </td>
                                <td className="px-4 py-2 text-right font-mono text-emerald-300/80">
                                    {trade.takeProfit ? trade.takeProfit.toFixed(2) : '—'}
                                </td>
                                <td className="px-4 py-2 text-center">
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${
                                        trade.status === 'filled' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-slate-700/50 text-slate-400'
                                    }`}>
                                        {trade.status}
                                    </span>
                                </td>
                                <td className="px-4 py-2 text-center">
                                    <button 
                                        className="p-1 rounded hover:bg-blue-900/50 text-slate-500 hover:text-blue-400 transition-colors"
                                        title="Show on Chart"
                                        onClick={(e) => { e.stopPropagation(); onTradeClick?.(trade); }}
                                    >
                                        <Target size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
      )}
    </div>
  );
};