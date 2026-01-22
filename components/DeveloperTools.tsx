
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Terminal, X, Trash2, Activity, Database, AlertCircle, Cpu, ShieldAlert, FileEdit, FileJson, Layout, FileClock, ClipboardList, PenTool, Copy, ChevronRight, Filter, Pause, Play } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { LogEntry, clearLogs as clearRuntimeLogs, getLogHistory } from '../utils/logger';
import { useDevLogs } from '../hooks/useDevLogs';

interface DeveloperToolsProps {
  activeDataSource: string;
  lastError: string | null;
  chartRenderTime: number | null;
  onOpenStickyNotes?: () => void;
  onOpenLayoutDB?: () => void;
}

const LogRow = ({ log }: { log: LogEntry }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(JSON.stringify(log.data, null, 2));
    };

    return (
        <div className={`border-b border-white/5 font-mono text-xs transition-colors ${isExpanded ? 'bg-white/5' : 'hover:bg-white/5'}`}>
            <div 
                className="flex items-center gap-2 p-2 cursor-pointer select-none"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="text-slate-500 w-16 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
                </span>
                
                <span className={`w-24 shrink-0 font-bold truncate ${
                    log.level === 'error' ? 'text-red-400' :
                    log.level === 'warn' ? 'text-amber-400' :
                    'text-blue-400'
                }`}>
                    {log.component}
                </span>

                <span className={`flex-1 truncate ${log.level === 'error' ? 'text-red-200' : 'text-slate-300'}`}>
                    {log.action}
                </span>

                {log.data && (
                    <ChevronRight size={14} className={`text-slate-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                )}
            </div>

            {isExpanded && log.data && (
                <div className="p-2 pl-20 bg-black/40 text-[10px] text-emerald-300/80 relative group">
                    <button 
                        onClick={handleCopy}
                        className="absolute top-2 right-2 p-1 bg-slate-800 rounded opacity-0 group-hover:opacity-100 hover:text-white transition-all"
                        title="Copy State Snapshot"
                    >
                        <Copy size={12} />
                    </button>
                    <pre className="whitespace-pre-wrap break-all overflow-x-auto">
                        {JSON.stringify(log.data, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
};

export const DeveloperTools: React.FC<DeveloperToolsProps> = ({ 
  activeDataSource, 
  lastError,
  chartRenderTime,
  onOpenStickyNotes,
  onOpenLayoutDB
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'runtime' | 'system'>('runtime');
  
  // Telemetry State
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isFrozen, setIsFrozen] = useState(false);
  const [filterComponent, setFilterComponent] = useState<string>('ALL');
  
  // System Logs (Persistent)
  const { logs: devLogs, addLog: addDevLog, clearLogs: clearDevLogs } = useDevLogs();
  
  const isOnline = useOnlineStatus();

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Telemetry Stream Listener
  useEffect(() => {
    setLogs(getLogHistory());

    const handleLog = (e: any) => {
      if (isFrozen) return; // Stop updates if frozen
      const newEntry = e.detail as LogEntry;
      setLogs(prev => [newEntry, ...prev].slice(0, 200));
    };

    const handleClear = () => {
      setLogs([]);
    };

    window.addEventListener('redpill-telemetry', handleLog);
    window.addEventListener('redpill-telemetry-clear', handleClear);

    // Legacy support for debugLog
    window.addEventListener('redpill-debug-log', handleLog);
    window.addEventListener('redpill-debug-clear', handleClear);

    return () => {
      window.removeEventListener('redpill-telemetry', handleLog);
      window.removeEventListener('redpill-telemetry-clear', handleClear);
      window.removeEventListener('redpill-debug-log', handleLog);
      window.removeEventListener('redpill-debug-clear', handleClear);
    };
  }, [isFrozen]);

  const uniqueComponents = useMemo(() => {
      const components = new Set(logs.map(l => l.component));
      return ['ALL', ...Array.from(components).sort()];
  }, [logs]);

  const filteredLogs = useMemo(() => {
      if (filterComponent === 'ALL') return logs;
      return logs.filter(l => l.component === filterComponent);
  }, [logs, filterComponent]);

  const generateReport = () => {
    // We only report what the user is currently looking at (filteredLogs)
    const reportHeader = `--- REDPILL INCIDENT REPORT [${new Date().toLocaleString()}] ---\n` +
        `Data Source: ${activeDataSource || 'None'}\n` + 
        `Render Time: ${chartRenderTime ? chartRenderTime.toFixed(2) + 'ms' : 'N/A'}\n` +
        `Last Error: ${lastError || 'None'}\n\n`;
    
    const reportBody = filteredLogs.map(log => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const head = `[${time}] [${log.level.toUpperCase()}] [${log.component}] ${log.action}`;
        const data = log.data ? `\nData: ${JSON.stringify(log.data, null, 2)}` : '';
        return `${head}${data}\n${'-'.repeat(40)}`;
    }).join('\n\n');

    navigator.clipboard.writeText(reportHeader + reportBody);
    alert("Full Report Copied to Clipboard!");
  };

  const handleNuclearClear = () => {
      if (confirm('NUCLEAR OPTION: This will permanently delete all drawings/metadata for the CURRENT chart from the database. Are you sure?')) {
          window.dispatchEvent(new CustomEvent('redpill-nuclear-clear'));
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[600px] bg-[#0b0f19]/95 border-l border-slate-700/50 shadow-2xl z-[9999] flex flex-col font-sans text-sm animate-in slide-in-from-right duration-200 backdrop-blur-md">
      
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-700/50 bg-slate-900/50">
        <div className="flex items-center gap-2 font-bold text-slate-200 tracking-wide">
          <Terminal size={16} className="text-emerald-500" />
          <span>TELEMETRY HUB</span>
        </div>
        <div className="flex items-center gap-2">
           <div className="flex bg-slate-800 rounded overflow-hidden border border-slate-700">
               <button 
                 onClick={() => setActiveTab('runtime')}
                 className={`px-3 py-1 text-[10px] font-bold uppercase transition-colors ${activeTab === 'runtime' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
               >
                   Live Stream
               </button>
               <button 
                 onClick={() => setActiveTab('system')}
                 className={`px-3 py-1 text-[10px] font-bold uppercase transition-colors ${activeTab === 'system' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
               >
                   History
               </button>
           </div>
           <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white">
             <X size={16} />
           </button>
        </div>
      </div>

      {/* Metrics Bar */}
      {activeTab === 'runtime' && (
        <div className="grid grid-cols-3 gap-px bg-slate-800 border-b border-slate-700">
            <div className="bg-[#0b0f19] p-2 flex flex-col items-center">
                <span className="text-[9px] text-slate-500 uppercase font-bold">Network</span>
                <div className="flex items-center gap-1.5 text-xs">
                    <Activity size={12} className={isOnline ? "text-emerald-500" : "text-red-500"} />
                    <span className="text-slate-200">{isOnline ? 'Online' : 'Offline'}</span>
                </div>
            </div>
            <div className="bg-[#0b0f19] p-2 flex flex-col items-center">
                <span className="text-[9px] text-slate-500 uppercase font-bold">Render</span>
                <div className="flex items-center gap-1.5 text-xs">
                    <Cpu size={12} className="text-blue-500" />
                    <span className="text-slate-200">{chartRenderTime ? `${chartRenderTime.toFixed(1)}ms` : '--'}</span>
                </div>
            </div>
            <div className="bg-[#0b0f19] p-2 flex flex-col items-center">
                <span className="text-[9px] text-slate-500 uppercase font-bold">Data Source</span>
                <div className="flex items-center gap-1.5 text-xs w-full justify-center">
                    <Database size={12} className="text-amber-500 shrink-0" />
                    <span className="text-slate-200 truncate max-w-[100px]" title={activeDataSource}>{activeDataSource || 'None'}</span>
                </div>
            </div>
        </div>
      )}

      {/* Error Panel */}
      {lastError && (
        <div className="bg-red-950/30 border-b border-red-900/30 p-3">
          <div className="flex items-center gap-2 text-red-500 mb-1 text-xs font-bold uppercase">
            <AlertCircle size={14} />
            <span>Critical Error</span>
          </div>
          <p className="text-red-400 text-xs break-words font-sans">{lastError}</p>
        </div>
      )}

      {/* Controls Bar */}
      {activeTab === 'runtime' && (
          <div className="flex items-center justify-between p-2 bg-[#0f172a] border-b border-slate-800">
              <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsFrozen(!isFrozen)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase border transition-all ${isFrozen ? 'bg-amber-500/10 border-amber-500/50 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                  >
                      {isFrozen ? <Play size={10} /> : <Pause size={10} />}
                      {isFrozen ? 'Resume' : 'Freeze'}
                  </button>
                  <button 
                    onClick={clearRuntimeLogs}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase border border-slate-700 text-slate-400 hover:text-red-400 hover:bg-red-900/10 transition-all"
                  >
                      <Trash2 size={10} />
                      Clear
                  </button>
              </div>
              
              <div className="flex items-center gap-2">
                  <Filter size={12} className="text-slate-500" />
                  <select 
                    value={filterComponent}
                    onChange={(e) => setFilterComponent(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-slate-300 text-[10px] rounded px-1 py-0.5 outline-none focus:border-blue-500"
                  >
                      {uniqueComponents.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
              </div>
          </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#05080f] relative">
        {activeTab === 'runtime' ? (
            <>
                {filteredLogs.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2">
                        <Activity size={24} className="opacity-20" />
                        <span className="text-xs">No logs captured yet...</span>
                    </div>
                )}
                {filteredLogs.map((log) => (
                    <LogRow key={log.id} log={log} />
                ))}
            </>
        ) : (
            // System Logs (DevLogs)
            <div className="p-2 space-y-1">
                {devLogs.map((log) => (
                    <div key={log.id} className="border border-slate-800 bg-slate-900/30 p-2 rounded hover:border-slate-700 transition-colors">
                        <div className="flex justify-between mb-1">
                            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                log.type === 'feat' ? 'bg-green-900/30 text-green-400' :
                                log.type === 'fix' ? 'bg-red-900/30 text-red-400' :
                                'bg-slate-800 text-slate-400'
                            }`}>
                                {log.type}
                            </span>
                            <span className="text-[10px] text-slate-500">
                                {new Date(log.timestamp).toLocaleString()}
                            </span>
                        </div>
                        <div className="text-slate-300 font-medium text-xs">{log.message}</div>
                        {log.details && <div className="text-slate-500 text-xs mt-1 pl-2 border-l border-slate-700">{log.details}</div>}
                    </div>
                ))}
            </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="bg-[#0f172a] border-t border-slate-800">
          {/* Action Row 1: DB Tools */}
          <div className="p-2 grid grid-cols-2 gap-2 border-b border-slate-800">
                <button 
                    onClick={onOpenStickyNotes}
                    className="flex items-center justify-center gap-2 bg-blue-900/10 hover:bg-blue-800/30 text-blue-400 py-1.5 px-2 rounded border border-blue-800/30 transition-colors uppercase text-[10px] font-bold tracking-wider"
                >
                    <FileJson size={12} />
                    Inspect Notes
                </button>
                <button 
                    onClick={onOpenLayoutDB}
                    className="flex items-center justify-center gap-2 bg-blue-900/10 hover:bg-blue-800/30 text-blue-400 py-1.5 px-2 rounded border border-blue-800/30 transition-colors uppercase text-[10px] font-bold tracking-wider"
                >
                    <Layout size={12} />
                    Inspect Layouts
                </button>
          </div>
          
          {/* Action Row 2: Logging Tools */}
          <div className="p-2 grid grid-cols-3 gap-2">
            <button 
                onClick={activeTab === 'runtime' ? clearRuntimeLogs : clearDevLogs}
                className="flex items-center justify-center gap-1 bg-slate-800/50 hover:bg-slate-700 text-slate-400 py-2 px-2 rounded border border-slate-700 transition-colors uppercase text-[10px] font-bold tracking-wider"
                title="Clear current view logs"
            >
                <Trash2 size={12} />
                Clear View
            </button>
            
            <button 
                onClick={generateReport}
                className="flex items-center justify-center gap-1 bg-emerald-900/20 hover:bg-emerald-800/40 text-emerald-400 py-2 px-2 rounded border border-emerald-800/50 transition-colors uppercase text-[10px] font-bold tracking-wider"
                title="Copy full incident report to clipboard"
            >
                <ClipboardList size={12} />
                Report
            </button>

            {activeTab === 'runtime' ? (
                <button 
                    onClick={() => window.dispatchEvent(new CustomEvent('OPEN_CHANGELOG_EDITOR'))}
                    className="flex items-center justify-center gap-1 bg-purple-900/20 hover:bg-purple-800/40 text-purple-400 py-2 px-2 rounded border border-purple-800/50 transition-colors uppercase text-[10px] font-bold tracking-wider"
                    title="Edit User-Facing 'Latest Add' Text"
                >
                    <FileEdit size={12} />
                    Public Log
                </button>
            ) : (
                <button 
                    onClick={() => {
                        const msg = prompt("Enter log message:");
                        if(msg) addDevLog({ type: 'feat', message: msg });
                    }}
                    className="flex items-center justify-center gap-1 bg-blue-900/20 hover:bg-blue-800/40 text-blue-400 py-2 px-2 rounded border border-blue-800/50 transition-colors uppercase text-[10px] font-bold tracking-wider"
                    title="Manually add entry to Dev Log"
                >
                    <PenTool size={12} />
                    Add Entry
                </button>
            )}
        </div>
        
        {/* Nuclear Option */}
        <div className="px-2 pb-2">
             <button 
                onClick={handleNuclearClear}
                className="w-full flex items-center justify-center gap-2 bg-red-900/10 hover:bg-red-900/30 text-red-500 py-1.5 px-2 rounded border border-red-900/30 transition-colors uppercase text-[10px] font-bold tracking-wider"
            >
                <ShieldAlert size={12} />
                NUCLEAR CLEAR (Active Chart)
            </button>
        </div>
      </div>
    </div>
  );
};
