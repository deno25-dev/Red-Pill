
import React, { useState, useEffect } from 'react';
import { 
  Terminal, 
  X, 
  Trash2, 
  Database, 
  Cpu, 
  Activity,
  Search, 
  ChevronRight, 
  Code,
  Layers,
  HardDrive,
  Copy,
  Check
} from 'lucide-react';
import { LogEntry, LogCategory, rpLog, clearLogs } from '../utils/logger';

interface DeveloperToolsProps {
  activeDataSource: string;
  lastError: string | null;
  chartRenderTime: number | null;
  onRetryBridge?: () => void;
}

// Reuseable JSON Viewer Component
const RecursiveJSONTree: React.FC<{ data: any; label?: string; depth?: number }> = ({ data, label, depth = 0 }) => {
    const [expanded, setExpanded] = useState(depth < 2);
    
    if (data === null) return <div>{label && <span className="text-blue-400 mr-2">{label}:</span>}<span className="text-slate-500">null</span></div>;
    if (typeof data === 'undefined') return <div>{label && <span className="text-blue-400 mr-2">{label}:</span>}<span className="text-slate-600">undefined</span></div>;
    
    if (typeof data === 'object') {
        const isArray = Array.isArray(data);
        const keys = Object.keys(data);
        const isEmpty = keys.length === 0;
        
        return (
            <div className="font-mono text-[10px]">
                <div onClick={() => !isEmpty && setExpanded(!expanded)} className={`cursor-pointer hover:bg-white/5 flex gap-1 ${isEmpty ? 'cursor-default' : ''}`}>
                    {label && <span className="text-blue-400">{label}:</span>}
                    <span className="text-emerald-600">{isArray ? `[` : `{`}</span>
                    {!expanded && !isEmpty && <span className="text-slate-500">...</span>}
                    {isEmpty && <span className="text-emerald-600">{isArray ? `]` : `}`}</span>}
                </div>
                {expanded && !isEmpty && (
                    <div className="pl-4 border-l border-emerald-900/20 ml-1">
                        {keys.map(key => <RecursiveJSONTree key={key} label={key} data={data[key]} depth={depth + 1} />)}
                        <div className="text-emerald-600">{isArray ? `]` : `}`}</div>
                    </div>
                )}
            </div>
        );
    }
    
    // Primitive Values
    let valColor = 'text-amber-200';
    if (typeof data === 'number') valColor = 'text-purple-300';
    if (typeof data === 'boolean') valColor = 'text-red-300';

    return (
        <div className="break-all font-mono text-[10px]">
            {label && <span className="text-blue-400 mr-2">{label}:</span>}
            <span className={valColor}>{String(data)}</span>
        </div>
    );
};

export const DeveloperTools: React.FC<DeveloperToolsProps> = ({ activeDataSource }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'CONSOLE' | 'STATE'>('CONSOLE');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterCategory, setFilterCategory] = useState<LogCategory | 'ALL'>('ALL');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [globalState, setGlobalState] = useState<any>(null);
  const [isLoadingState, setIsLoadingState] = useState(false);
  
  // Feedback States
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [isStateCopied, setIsStateCopied] = useState(false);
  const [isCopyingAll, setIsCopyingAll] = useState(false);

  // Keyboard toggle (Ctrl + D)
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

  // Log Subscription
  useEffect(() => {
    if (!isOpen) return;
    
    // Initial Load
    setLogs([...(window.__REDPIL_LOGS__ || [])]);

    const handleLog = (e: any) => {
        const entry = e.detail;
        setLogs(prev => [entry, ...prev].slice(0, 500));
    };
    
    const handleClear = () => setLogs([]);

    window.addEventListener('redpill-log-stream', handleLog);
    window.addEventListener('redpill-log-clear', handleClear);
    return () => {
        window.removeEventListener('redpill-log-stream', handleLog);
        window.removeEventListener('redpill-log-clear', handleClear);
    };
  }, [isOpen]);

  // Global State Fetcher
  useEffect(() => {
      if (isOpen && activeTab === 'STATE') {
          fetchGlobalState();
      }
  }, [isOpen, activeTab]);

  const fetchGlobalState = async () => {
      setIsLoadingState(true);
      const electron = window.electronAPI;
      if (electron && electron.getGlobalState) {
          try {
              const state = await electron.getGlobalState();
              setGlobalState(state);
              rpLog('DevTools', 'Global state fetched', state, 'UI');
          } catch (e: any) {
              setGlobalState({ error: e.message });
          }
      } else {
          setGlobalState({ error: 'Bridge not available' });
      }
      setIsLoadingState(false);
  };

  const handleCopy = async (text: string, type: 'log' | 'state', id?: string) => {
      const electron = window.electronAPI;
      
      try {
          if (electron && electron.copyToClipboard) {
              electron.copyToClipboard(text);
          } else {
              await navigator.clipboard.writeText(text);
          }

          if (type === 'log' && id) {
              setCopiedLogId(id);
              setTimeout(() => setCopiedLogId(null), 1000);
          } else if (type === 'state') {
              setIsStateCopied(true);
              setTimeout(() => setIsStateCopied(false), 1000);
          }
      } catch (e) {
          console.error("Failed to copy:", e);
      }
  };

  if (!isOpen) return null;

  const filteredLogs = filterCategory === 'ALL' 
    ? logs 
    : logs.filter(l => l.category === filterCategory);

  const handleCopyAll = async () => {
      const text = JSON.stringify(filteredLogs, null, 2);
      const electron = window.electronAPI;
      
      try {
          if (electron && electron.copyToClipboard) {
              electron.copyToClipboard(text);
          } else {
              await navigator.clipboard.writeText(text);
          }
          setIsCopyingAll(true);
          setTimeout(() => setIsCopyingAll(false), 1000);
      } catch (e) {
          console.error("Failed to copy all logs:", e);
      }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[600px] bg-[#09090b] border-l border-emerald-900/50 shadow-2xl z-[9999] flex flex-col font-mono text-sm text-emerald-500 animate-in slide-in-from-right duration-200">
      
      {/* HEADER */}
      <div className="flex items-center justify-between p-3 border-b border-emerald-900/50 bg-emerald-950/20 shrink-0">
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 font-bold tracking-wider text-emerald-400">
                <Terminal size={16} />
                <span>DIAGNOSTICS</span>
            </div>
            <div className="h-4 w-px bg-emerald-900/50"></div>
            <span className="text-[10px] text-emerald-700">{activeDataSource}</span>
        </div>
        <div className="flex items-center gap-2">
            <button onClick={() => setIsOpen(false)} className="p-1 hover:text-white"><X size={16} /></button>
        </div>
      </div>

      {/* TABS & METRICS */}
      <div className="grid grid-cols-2 text-center text-xs font-bold border-b border-emerald-900/50">
          <button 
            onClick={() => setActiveTab('CONSOLE')}
            className={`py-2 transition-colors ${activeTab === 'CONSOLE' ? 'bg-emerald-900/30 text-emerald-200' : 'text-emerald-800 hover:bg-emerald-900/10'}`}
          >
              CONSOLE ({logs.length})
          </button>
          <button 
            onClick={() => setActiveTab('STATE')}
            className={`py-2 transition-colors ${activeTab === 'STATE' ? 'bg-emerald-900/30 text-emerald-200' : 'text-emerald-800 hover:bg-emerald-900/10'}`}
          >
              STATE EXPLORER
          </button>
      </div>

      {/* CONSOLE VIEW */}
      {activeTab === 'CONSOLE' && (
          <div className="flex-1 flex flex-col min-h-0">
              {/* Category Filters */}
              <div className="flex gap-2 p-2 border-b border-emerald-900/30 overflow-x-auto bg-black/40 no-scrollbar">
                  {(['ALL', 'MARKET DATA', 'IPC BRIDGE', 'SQLITE', 'UI'] as const).map(cat => (
                      <button
                        key={cat}
                        onClick={() => setFilterCategory(cat)}
                        className={`px-2 py-1 text-[10px] rounded border transition-colors whitespace-nowrap ${
                            filterCategory === cat 
                            ? 'bg-emerald-900/40 border-emerald-600 text-emerald-100' 
                            : 'border-emerald-900/30 text-emerald-700 hover:text-emerald-400'
                        }`}
                      >
                          {cat}
                      </button>
                  ))}
                  
                  <div className="ml-auto flex items-center gap-1">
                      <button 
                        onClick={handleCopyAll}
                        className={`px-2 py-1 text-[10px] rounded border transition-colors flex items-center gap-1 ${isCopyingAll ? 'bg-emerald-900/40 border-emerald-500 text-emerald-300' : 'border-emerald-900/30 text-emerald-600 hover:text-emerald-400 hover:border-emerald-700'}`}
                        title="Copy All Visible Logs"
                      >
                          {isCopyingAll ? <Check size={10} /> : <Copy size={10} />}
                          <span className="hidden sm:inline">COPY ALL</span>
                      </button>
                      <button onClick={clearLogs} className="px-2 py-1 text-[10px] text-red-400 hover:text-red-200 hover:bg-red-900/20 rounded" title="Clear Console"><Trash2 size={12} /></button>
                  </div>
              </div>

              {/* Log Stream */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                  {filteredLogs.map(log => {
                      const isExpanded = expandedLogId === log.id;
                      const levelColor = log.level === 'ERROR' ? 'text-red-400 border-red-900/50 bg-red-900/10' : 
                                         log.level === 'WARN' ? 'text-amber-400 border-amber-900/50 bg-amber-900/10' : 
                                         'text-emerald-400 border-emerald-900/20 hover:bg-emerald-900/10';
                      
                      return (
                          <div 
                            key={log.id} 
                            className={`border rounded ${levelColor} transition-all`}
                          >
                              <div className="flex items-center gap-2 p-1.5">
                                  <div 
                                    className="flex items-center gap-2 flex-1 cursor-pointer overflow-hidden"
                                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                  >
                                      <ChevronRight size={12} className={`transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
                                      <span className="text-[10px] opacity-60 font-mono w-16 shrink-0">
                                          {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit', fractionDigits: 3 } as any).split(' ')[0]}
                                      </span>
                                      <span className="text-[9px] font-bold px-1 rounded bg-black/30 border border-current opacity-70 w-24 text-center shrink-0 truncate">
                                          {log.category}
                                      </span>
                                      <span className="text-xs truncate flex-1 font-medium">{log.message}</span>
                                  </div>
                                  
                                  {/* Copy Button */}
                                  <button
                                    onClick={() => handleCopy(JSON.stringify(log, null, 2), 'log', log.id)}
                                    className="p-1 hover:bg-black/30 rounded text-current opacity-50 hover:opacity-100 transition-opacity"
                                    title="Copy Log JSON"
                                  >
                                      {copiedLogId === log.id ? <Check size={12} /> : <Copy size={12} />}
                                  </button>
                              </div>

                              {isExpanded && (
                                  <div className="p-2 border-t border-dashed border-current/20 bg-black/40 text-xs">
                                      <div className="grid grid-cols-[60px_1fr] gap-2 mb-2">
                                          <span className="text-right opacity-50">Source:</span>
                                          <span className="font-bold">{log.source}</span>
                                          <span className="text-right opacity-50">ID:</span>
                                          <span className="font-mono text-[10px] opacity-70">{log.id}</span>
                                      </div>
                                      
                                      {log.data && (
                                          <div className="mt-2 border border-white/10 rounded p-2 bg-[#050505]">
                                              <div className="text-[10px] font-bold mb-1 opacity-50 uppercase">Payload</div>
                                              <RecursiveJSONTree data={log.data} />
                                          </div>
                                      )}

                                      {log.codeSnippet && (
                                          <div className="mt-2 border border-white/10 rounded p-2 bg-[#050505]">
                                              <div className="text-[10px] font-bold mb-1 opacity-50 uppercase flex items-center gap-1"><Code size={10} /> Source Trace</div>
                                              <pre className="text-[10px] overflow-x-auto text-emerald-300/80 whitespace-pre-wrap">{log.codeSnippet}</pre>
                                          </div>
                                      )}
                                  </div>
                              )}
                          </div>
                      );
                  })}
              </div>
          </div>
      )}

      {/* STATE EXPLORER VIEW */}
      {activeTab === 'STATE' && (
          <div className="flex-1 flex flex-col min-h-0 bg-black/40">
              <div className="flex items-center justify-between p-2 border-b border-emerald-900/30">
                  <div className="flex items-center gap-2 text-xs">
                      <Activity size={14} />
                      <span>System Snapshot</span>
                  </div>
                  <div className="flex items-center gap-2">
                      <button 
                        onClick={() => globalState && handleCopy(JSON.stringify(globalState, null, 2), 'state')}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold border transition-colors ${isStateCopied ? 'bg-emerald-900/40 border-emerald-500 text-emerald-300' : 'bg-black/30 border-emerald-900/30 text-emerald-600 hover:text-emerald-400 hover:border-emerald-700'}`}
                        disabled={!globalState}
                      >
                          {isStateCopied ? <Check size={10} /> : <Copy size={10} />}
                          {isStateCopied ? 'COPIED!' : 'COPY STATE'}
                      </button>
                      <button 
                        onClick={fetchGlobalState}
                        className="p-1 hover:bg-emerald-900/40 rounded text-emerald-400"
                        title="Refresh State"
                      >
                          <Search size={14} className={isLoadingState ? 'animate-spin' : ''} />
                      </button>
                  </div>
              </div>
              
              <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-[#050505]">
                  {globalState ? (
                      <RecursiveJSONTree data={globalState} />
                  ) : (
                      <div className="flex flex-col items-center justify-center h-full opacity-50">
                          <HardDrive size={32} className="mb-2" />
                          <span>Waiting for bridge...</span>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* FOOTER */}
      <div className="p-1.5 border-t border-emerald-900/50 bg-[#000] text-[9px] text-center text-emerald-900 font-mono">
          RPC: {window.electronAPI ? 'CONNECTED' : 'DISCONNECTED'} • V3.0.1
      </div>
    </div>
  );
};
