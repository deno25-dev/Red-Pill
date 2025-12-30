
import React, { useState, useEffect } from 'react';
import { X, Wallet, ArrowRightLeft, Settings2, Zap, CircleDollarSign, ExternalLink, ArrowRightToLine } from 'lucide-react';

interface TradingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  currentPrice: number;
  isDetached?: boolean;
  onToggleDetach?: () => void;
  onOrderSubmit?: (order: any) => void;
}

export const TradingPanel: React.FC<TradingPanelProps> = ({ 
  isOpen, 
  onClose, 
  symbol, 
  currentPrice,
  isDetached = false,
  onToggleDetach,
  onOrderSubmit
}) => {
  const [tradingMode, setTradingMode] = useState<'spot' | 'futures'>('futures');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'limit' | 'market' | 'stop'>('limit');
  const [price, setPrice] = useState<string>('');
  const [amount, setAmount] = useState<string>('1.0');
  const [leverage, setLeverage] = useState<number>(20);
  
  // Mock Balance
  const balance = 100000.00; // USD

  useEffect(() => {
    // Auto-update price field when switching to Limit if empty or if needed
    if (orderType === 'limit' && currentPrice && !price) {
        setPrice(currentPrice.toFixed(2));
    } else if (orderType === 'limit' && Math.abs(parseFloat(price) - currentPrice) / currentPrice > 0.5) {
        // If price is way off (e.g. from previous chart), reset it
        setPrice(currentPrice.toFixed(2));
    }
  }, [currentPrice, orderType, price]);

  if (!isOpen) return null;
  
  const numericPrice = parseFloat(price) || 0;
  const numericAmount = parseFloat(amount) || 0;
  const executionPrice = orderType === 'market' ? currentPrice : numericPrice;
  const totalValue = numericAmount * executionPrice;
  
  // Logic: Spot is always 1x leverage
  const effectiveLeverage = tradingMode === 'spot' ? 1 : leverage;
  const requiredMargin = totalValue / effectiveLeverage;
  const estimatedFee = totalValue * 0.0005; // 0.05% fee

  const leveragePresets = [5, 10, 25, 50, 75, 100, 120];

  const handleSubmit = () => {
      if (onOrderSubmit) {
          onOrderSubmit({
              symbol,
              side,
              type: orderType,
              price: executionPrice,
              qty: numericAmount,
              value: totalValue,
              status: 'filled' // Simulating instant fill
          });
      }
  };

  return (
    <div className={`${isDetached ? 'w-full h-full' : 'w-80 border-l animate-in slide-in-from-right duration-200'} bg-[#1e293b] border-[#334155] flex flex-col z-20 shrink-0 shadow-2xl`}>
      {/* Header */}
      <div className="h-14 border-b border-[#334155] flex items-center justify-between px-4 bg-[#0f172a] shrink-0">
         <div className="flex items-center gap-2 font-bold text-slate-200">
            <ArrowRightLeft size={18} className="text-blue-500" />
            <span>Order Entry</span>
         </div>
         <div className="flex items-center gap-1">
             {onToggleDetach && (
                 <button 
                    onClick={onToggleDetach} 
                    className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-[#1e293b] transition-colors"
                    title={isDetached ? "Dock to Main Window" : "Undock to New Window"}
                 >
                     {isDetached ? <ArrowRightToLine size={16} /> : <ExternalLink size={16} />}
                 </button>
             )}
             <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-[#1e293b] transition-colors">
                <X size={18} />
             </button>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
         {/* Mode Switcher */}
         <div className="p-3 bg-[#0f172a] border-b border-[#334155]">
            <div className="flex bg-[#1e293b] p-1 rounded-lg">
                <button
                    onClick={() => setTradingMode('spot')}
                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded text-xs font-bold uppercase tracking-wide transition-all ${
                        tradingMode === 'spot' 
                        ? 'bg-blue-600 text-white shadow-sm' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                >
                    <CircleDollarSign size={14} /> Spot
                </button>
                <button
                    onClick={() => setTradingMode('futures')}
                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded text-xs font-bold uppercase tracking-wide transition-all ${
                        tradingMode === 'futures' 
                        ? 'bg-purple-600 text-white shadow-sm' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                >
                    <Zap size={14} /> Futures
                </button>
            </div>
         </div>

         <div className="p-4 space-y-6">
            {/* Account Info */}
            <div className="bg-[#0f172a] rounded-lg p-3 border border-[#334155]">
                <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
                    <span className="flex items-center gap-1"><Wallet size={12}/> Available Balance</span>
                    <Settings2 size={12} className="cursor-pointer hover:text-white"/>
                </div>
                <div className="text-lg font-mono font-medium text-white">
                    ${balance.toLocaleString('en-US', {minimumFractionDigits: 2})}
                </div>
                {tradingMode === 'futures' && (
                    <div className="flex justify-between mt-2 text-[10px]">
                        <span className="text-slate-500">Unrealized P&L</span>
                        <span className="text-emerald-400">+$1,240.50</span>
                    </div>
                )}
            </div>

            {/* Side Selection */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#0f172a] rounded-lg border border-[#334155]">
                <button 
                    onClick={() => setSide('buy')}
                    className={`py-2 text-sm font-bold rounded transition-all ${
                        side === 'buy' 
                        ? 'bg-emerald-600 text-white shadow-lg' 
                        : 'text-slate-400 hover:text-emerald-500'
                    }`}
                >
                    Buy
                </button>
                <button 
                    onClick={() => setSide('sell')}
                    className={`py-2 text-sm font-bold rounded transition-all ${
                        side === 'sell' 
                        ? 'bg-red-600 text-white shadow-lg' 
                        : 'text-slate-400 hover:text-red-500'
                    }`}
                >
                    Sell
                </button>
            </div>

            {/* Order Type */}
            <div className="flex border-b border-[#334155]">
                {['Limit', 'Market', 'Stop'].map((type) => (
                    <button
                        key={type}
                        onClick={() => setOrderType(type.toLowerCase() as any)}
                        className={`flex-1 pb-2 text-xs font-medium uppercase tracking-wide border-b-2 transition-colors ${
                            orderType === type.toLowerCase()
                            ? 'border-blue-500 text-blue-400'
                            : 'border-transparent text-slate-500 hover:text-slate-300'
                        }`}
                    >
                        {type}
                    </button>
                ))}
            </div>

            {/* Inputs */}
            <div className="space-y-4">
                {orderType !== 'market' && (
                    <div className="space-y-1">
                        <label className="text-xs text-slate-400 flex justify-between">
                            <span>Price ({symbol.split('/')[1] || 'USD'})</span>
                            <span className="text-blue-400 cursor-pointer hover:underline" onClick={() => setPrice(currentPrice.toFixed(2))}>Last: {currentPrice.toFixed(2)}</span>
                        </label>
                        <div className="relative">
                            <input 
                                type="number"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                placeholder="0.00"
                                className="w-full bg-[#0f172a] border border-[#334155] rounded px-3 py-2 text-sm text-right focus:outline-none focus:border-blue-500 font-mono text-white placeholder-slate-600"
                            />
                        </div>
                    </div>
                )}

                <div className="space-y-1">
                    <label className="text-xs text-slate-400 flex justify-between">
                        <span>Amount ({symbol.split('/')[0] || 'BTC'})</span>
                    </label>
                    <div className="relative">
                        <input 
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-[#0f172a] border border-[#334155] rounded px-3 py-2 text-sm text-right focus:outline-none focus:border-blue-500 font-mono text-white placeholder-slate-600"
                        />
                    </div>
                </div>

                {/* Leverage Slider (Futures Only) */}
                {tradingMode === 'futures' && (
                    <div className="space-y-3 pt-2 border-t border-[#334155]/50 mt-2">
                        <div className="flex justify-between text-xs text-slate-400 items-end">
                            <span className="flex items-center gap-1"><Zap size={12} className="text-amber-400"/> Leverage</span>
                            <span className="font-bold text-amber-400 text-lg">{leverage}x</span>
                        </div>
                        <input 
                            type="range" 
                            min="1" 
                            max="120" 
                            step="1"
                            value={leverage} 
                            onChange={(e) => setLeverage(parseInt(e.target.value))}
                            className="w-full h-1.5 bg-[#334155] rounded-lg appearance-none cursor-pointer accent-purple-500"
                        />
                        <div className="flex justify-between items-center">
                            {leveragePresets.map((val) => (
                                <button
                                    key={val}
                                    onClick={() => setLeverage(val)}
                                    className={`text-[9px] font-mono px-1 py-0.5 rounded hover:bg-[#334155] transition-colors ${
                                        leverage === val ? 'text-purple-400 font-bold' : 'text-slate-600 hover:text-slate-300'
                                    }`}
                                >
                                    {val}x
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                
                {/* Order Options */}
                <div className="flex gap-4 pt-2">
                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer group">
                        <input type="checkbox" className="rounded bg-[#0f172a] border-[#334155] text-blue-500 focus:ring-0 cursor-pointer" />
                        <span className="group-hover:text-slate-300">Post Only</span>
                    </label>
                    {tradingMode === 'futures' && (
                        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer group">
                            <input type="checkbox" className="rounded bg-[#0f172a] border-[#334155] text-blue-500 focus:ring-0 cursor-pointer" />
                            <span className="group-hover:text-slate-300">Reduce Only</span>
                        </label>
                    )}
                </div>
            </div>

            {/* Summary */}
            <div className="bg-[#0f172a]/50 rounded border border-[#334155] p-3 space-y-2 text-xs">
                <div className="flex justify-between">
                    <span className="text-slate-500">Value</span>
                    <span className="font-mono text-slate-300">{totalValue.toLocaleString('en-US', {style: 'currency', currency: 'USD'})}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500">Cost {tradingMode === 'futures' && '(Margin)'}</span>
                    <span className="font-mono text-slate-300">{requiredMargin.toLocaleString('en-US', {style: 'currency', currency: 'USD'})}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500">Est. Fee (0.05%)</span>
                    <span className="font-mono text-slate-300">{estimatedFee.toLocaleString('en-US', {style: 'currency', currency: 'USD'})}</span>
                </div>
            </div>

            {/* Submit Button */}
            <button 
                onClick={handleSubmit}
                className={`w-full py-3 rounded-lg font-bold text-white shadow-lg transition-transform active:scale-[0.98] ${
                side === 'buy' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
            }`}>
                {side === 'buy' 
                    ? (tradingMode === 'spot' ? 'Buy ' : 'Buy / Long ') 
                    : (tradingMode === 'spot' ? 'Sell ' : 'Sell / Short ')
                } 
                {symbol.split('/')[0] || 'BTC'}
            </button>
            
            <div className="text-center text-[10px] text-slate-600">
                Simulation Mode - No Real Funds At Risk
            </div>
         </div>
      </div>
    </div>
  );
};
