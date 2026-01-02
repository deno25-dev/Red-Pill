import React, { useState, useEffect } from 'react';
import { Download, X, CheckCircle2, Calendar, Clock, Database, ArrowRight, Save, AlertTriangle, FolderInput } from 'lucide-react';
import { BINANCE_INTERVALS } from '../utils/binance';

interface DownloadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onDownload: (symbol: string, interval: string, startTime: number, endTime: number, mode: 'new' | 'update') => Promise<void>;
  checkExistingFile: (symbol: string, interval: string) => Promise<number | null>; // Returns last timestamp if exists
  isDownloading: boolean;
  progress: string;
  onConnectDatabase: () => void;
  isConnected: boolean;
  databaseName?: string;
}

export const DownloadDialog: React.FC<DownloadDialogProps> = ({
  isOpen,
  onClose,
  onDownload,
  checkExistingFile,
  isDownloading,
  progress,
  onConnectDatabase,
  isConnected,
  databaseName
}) => {
  const [symbol, setSymbol] = useState('');
  const [interval, setInterval] = useState('1h');
  const [startDate, setStartDate] = useState<string>('2023-01-01');
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [existingLastTime, setExistingLastTime] = useState<number | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  // Auto-check for existing file when symbol/interval changes
  useEffect(() => {
    const check = async () => {
        if (!symbol || !interval || !isConnected) {
            setExistingLastTime(null);
            return;
        }
        setIsChecking(true);
        try {
            const lastTime = await checkExistingFile(symbol.toUpperCase(), interval);
            setExistingLastTime(lastTime);
            // Removed auto-update of startDate to respect user input "From"
        } catch (e) {
            setExistingLastTime(null);
        } finally {
            setIsChecking(false);
        }
    };
    
    const timer = setTimeout(check, 500); // Debounce
    return () => clearTimeout(timer);
  }, [symbol, interval, checkExistingFile, isConnected]);

  if (!isOpen) return null;

  // Calculate timestamps strictly from inputs treated as UTC start/end of days
  const selectedStartTime = new Date(`${startDate}T00:00:00Z`).getTime();
  // Mode logic: 
  // If file exists AND selected start is strictly AFTER file end => Update (Append)
  // Otherwise => New (Overwrite/Download fresh)
  const mode = (existingLastTime && selectedStartTime > existingLastTime) ? 'update' : 'new';
  const isOverwrite = existingLastTime !== null && mode === 'new';

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      
      if (!symbol) return;
      
      // End timestamp is end of the selected day (UTC)
      const endTimestamp = new Date(`${endDate}T23:59:59.999Z`).getTime();

      onDownload(symbol.toUpperCase(), interval, selectedStartTime, endTimestamp, mode);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#334155] bg-[#0f172a]">
           <div className="flex items-center gap-2 font-bold text-slate-200">
              <Download size={18} className="text-blue-500" />
              <span>Download Market Data</span>
           </div>
           {!isDownloading && (
               <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                  <X size={18} />
               </button>
           )}
        </div>

        {/* Body */}
        <div className="p-6">
           <form onSubmit={handleSubmit} className="space-y-4">
               
               {/* Database Folder Selection */}
               <div className="space-y-1">
                   <label className="text-xs text-slate-400 font-bold uppercase">Save Location</label>
                   
                   {isConnected ? (
                       // Connected State (Static Display)
                       <div className="w-full flex items-center px-3 py-2 rounded text-xs font-medium truncate border bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
                           <Database size={14} className="mr-2 shrink-0" />
                           <span className="truncate">{databaseName}</span>
                       </div>
                   ) : (
                       // Disconnected State (Clickable Button to Connect)
                       <button
                           type="button"
                           onClick={onConnectDatabase}
                           className="w-full flex items-center px-3 py-2 rounded text-xs font-medium truncate border bg-slate-700/30 border-slate-600 text-slate-300 hover:bg-slate-700/50 hover:border-blue-500/50 hover:text-white transition-all group"
                       >
                           <FolderInput size={14} className="mr-2 shrink-0 text-slate-400 group-hover:text-blue-400" />
                           <span className="truncate flex-1 text-left">Select Local Folder...</span>
                           <span className="text-[10px] bg-slate-700 px-1.5 py-0.5 rounded text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">Connect</span>
                       </button>
                   )}
                   
                   {!isConnected && (
                       <p className="text-[10px] text-slate-500 italic mt-1">
                           Or leave unconnected to download as a single file to 'Downloads'.
                       </p>
                   )}
               </div>

               {/* Symbol Input */}
               <div className="space-y-1">
                   <label className="text-xs text-slate-400 font-bold uppercase">Symbol (Binance)</label>
                   <input 
                      type="text" 
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value)}
                      placeholder="e.g. BTCUSDT"
                      disabled={isDownloading}
                      className="w-full bg-[#0f172a] border border-[#334155] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 uppercase placeholder-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      required
                   />
               </div>

               {/* Interval Select */}
               <div className="space-y-1">
                   <label className="text-xs text-slate-400 font-bold uppercase">Timeframe</label>
                   <div className="relative">
                       <select 
                          value={interval}
                          onChange={(e) => setInterval(e.target.value)}
                          disabled={isDownloading}
                          className="w-full bg-[#0f172a] border border-[#334155] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                       >
                           {BINANCE_INTERVALS.map(int => (
                               <option key={int.value} value={int.value}>{int.label}</option>
                           ))}
                       </select>
                       <Clock className="absolute right-3 top-2.5 text-slate-500 pointer-events-none" size={14} />
                   </div>
               </div>

               {/* Date Selection */}
               <div className="space-y-2">
                   <label className="text-xs text-slate-400 font-bold uppercase flex items-center gap-2">
                       <Calendar size={12} /> Date Range (UTC)
                   </label>
                   
                   <div className="flex items-center gap-2">
                       {/* Start Date */}
                       <div className="flex-1">
                           <div className="text-[10px] text-slate-500 mb-1">From</div>
                           <input 
                                type="date" 
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                disabled={isDownloading}
                                className="w-full bg-[#1e293b] border border-[#334155] rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                                required
                           />
                       </div>

                       <div className="pt-4 text-slate-500">
                           <ArrowRight size={12} />
                       </div>

                       {/* End Date */}
                       <div className="flex-1">
                           <div className="text-[10px] text-slate-500 mb-1">To</div>
                           <input 
                                type="date" 
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                disabled={isDownloading}
                                className="w-full bg-[#1e293b] border border-[#334155] rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                                required
                           />
                       </div>
                   </div>

                   {/* Update Info */}
                   {existingLastTime !== null && (
                       <div className="flex flex-col gap-1">
                           <div className={`flex items-center gap-2 text-xs font-medium bg-[#0f172a] p-2 rounded border ${isOverwrite ? 'border-amber-500/30 text-amber-400' : 'border-[#334155] text-emerald-400'}`}>
                               {isOverwrite ? (
                                   <>
                                       <AlertTriangle size={14} />
                                       <span>Overwrite existing file</span>
                                   </>
                               ) : (
                                   <>
                                       <CheckCircle2 size={14} />
                                       <span>Append to existing file</span>
                                   </>
                               )}
                           </div>
                           <div className="text-[10px] text-slate-500 px-1">
                               Last Data: {new Date(existingLastTime).toISOString().split('T')[0]}
                           </div>
                       </div>
                   )}
                   
                   {!isConnected && (
                       <p className="text-[10px] text-slate-500">
                           File will be downloaded to your device.
                       </p>
                   )}
               </div>

               {/* Progress Bar */}
               {isDownloading && (
                   <div className="space-y-1 animate-in fade-in slide-in-from-top-2">
                       <div className="flex justify-between text-xs text-slate-300">
                           <span>Downloading...</span>
                           <span className="text-blue-400">{progress}</span>
                       </div>
                       <div className="h-1.5 bg-[#0f172a] rounded-full overflow-hidden">
                           <div className="h-full bg-blue-500 w-full animate-pulse"></div>
                       </div>
                   </div>
               )}

               {/* Submit Button */}
               <button 
                  type="submit"
                  disabled={isDownloading || !symbol}
                  className={`w-full py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                      isDownloading 
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
                      : isOverwrite
                            ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg'
                            : mode === 'update'
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg'
                                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg'
                  }`}
               >
                  {isDownloading ? (
                      'Processing...'
                  ) : isOverwrite ? (
                      <>Overwrite {symbol}</>
                  ) : mode === 'update' ? (
                      <>Append {symbol}</>
                  ) : (
                      <>Download Data</>
                  )}
               </button>

           </form>
        </div>
      </div>
    </div>
  );
};