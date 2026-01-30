
import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Copy, X, Trash2, Database, AlertCircle, Cpu, Server, Zap, ChevronDown, Check, Code, RotateCcw, HardDrive, RefreshCw, ChevronRight, FileCode, Search, Filter } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { LogEntry, debugLog, clearLogs, LogLevel, LogCategory } from '../utils/logger';
import { useTelemetry } from '../hooks/useTelemetry';

interface DeveloperToolsProps {
  activeDataSource: string;
  lastError: string | null;
  chartRenderTime: number | null;
  onRetryBridge?: () => void;
}

const MAX_HISTORY_DISPLAY = 500;

export const DeveloperTools: React.FC<DeveloperToolsProps> = ({ 
  activeDataSource, 
  lastError,
  chartRenderTime,
  onRetryBridge
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'logs' | 'telemetry'>('logs');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [dbStatus, setDbStatus] = useState<{ connected: boolean; error?: string }>({ connected: false });
  
  // Log Explorer State
  const [activeLevels, setActiveLevels] = useState<Set<LogLevel>>(new Set(['INFO', 'WARN', 'ERROR', 'CRITICAL']));
  const [activeCategories, setActiveCategories] = useState<Set<LogCategory>>(new Set(['Main', 'Renderer', 'SQLite', 'Data', 'Network']));
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Telemetry Explorer State
  const [selectedComponent, setSelectedComponent] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  // Settings
  const [autoClearOnSymbolChange, setAutoClearOnSymbolChange] = useState(false);

  const isOnline = useOnlineStatus();
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const { reports, getComponentJSON, copyToClipboard, clearReports } = useTelemetry();

  // Auto-select first component
  useEffect(() => {
      if (!selectedComponent && Object.keys(reports).length > 0) {
          setSelectedComponent(Object.keys(reports)[0]);
      }
  }, [reports, selectedComponent]);

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

  // Click outside listener for dropdown
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
              setIsDropdownOpen(false);
          }
      };
      if (isDropdownOpen) document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  // Log Polling
  useEffect(() => {
    if (!isOpen) return;
    const pollLogs = () => {
        if (window.__REDPIL_LOGS__) {
            setLogs([...window.__REDPIL_LOGS__]);
        }
    };
    pollLogs();
    const interval = setInterval(pollLogs, 500); // 500ms refresh
    return () => clearInterval(interval);
  }, [isOpen]);

  // DB Status Check & System Telemetry Polling
  useEffect(() => {
      if (!isOpen) return;
      
      const electron = window.electronAPI;
      const checkHealth = async () => {
          if (electron) {
              if (electron.getDbStatus) {
                  try {
                      const status = await electron.getDbStatus();
                      setDbStatus(status);
                  } catch (e) {
                      setDbStatus({ connected: false, error: 'IPC Failed' });
                  }
              }
              if (activeTab === 'telemetry' && electron.getSystemTelemetry) {
                  try {
                      const data = await electron.getSystemTelemetry();
                      setSystemHealth(data);
                  } catch (e) {
                      console.error("Telemetry fetch failed", e);
                  }
              }
          }
      };
      checkHealth();
      const interval = setInterval(checkHealth, 2000); 
      return () => clearInterval(interval);
  }, [isOpen, activeTab]);

  // Filter Handling
  const toggleLevel = (level: LogLevel) => {
      const next = new Set(activeLevels);
      if (next.has(level)) next.delete(level); else next.add(level);
      setActiveLevels(next);
  };

  const filteredLogs = logs.filter(log => {
      if (!activeLevels.has(log.level)) return false;
      // Simple text search
      if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return log.message.toLowerCase().includes(q) || 
                 log.category.toLowerCase().includes(q) ||
                 (log.source && log.source.toLowerCase().includes(q));
      }
      return true;
  });

  const getLevelStyle = (level: LogLevel) => {
      switch(level) {
          case 'CRITICAL': return 'bg-fuchsia-900/40 text-fuchsia-300 border-l-2 border-fuchsia-500';
          case 'ERROR': return 'bg-red-900/20 text-red-300 border-l-2 border-red-500';
          case 'WARN': return 'bg-amber-900/20 text-amber-300 border-l-2 border-amber-500';
          default: return 'hover:bg-emerald-900/10 text-emerald-200 border-l-2 border-transparent';
      }
  };

  const handleCopyJSON = async () => {
      if (!selectedComponent) return;
      const json = getComponentJSON(selectedComponent);
      const success = await copyToClipboard(json);
      if (success) {
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
      }
  };

  const handleNuclearClear = () => {
      if (confirm('NUCLEAR OPTION: This will permanently delete all drawings/metadata for the CURRENT chart from the database. Are you sure?')) {
          window.dispatchEvent(new CustomEvent('redpill-nuclear-clear'));
          debugLog('Data', 'Nuclear Clear Triggered by user');
      }
  };

  if (!isOpen) return null;

  const isBridgeActive = !!window.electronAPI;
  const componentNames = Object.keys(reports).sort();
  const selectedHistory = selectedComponent ? reports[selectedComponent] : [];
  const currentReportData = selectedHistory.length > 0 ? selectedHistory[0].status : null;

  return (
    <div className="fixed inset-y-0 right-0 w-[800px] bg-[#09090b] border-l border-emerald-900/50 shadow-2xl z-[9999] flex flex-col font-mono text-sm text-emerald-500 animate-in slide-in-from-right duration-200">
      
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-emerald-900/50 bg-emerald-950/20 shrink-0">
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 font-bold tracking-wider text-emerald-400">
            <Terminal size={16} />
            <span>DEV_TOOLS</span>
            </div>
            
            <div className="flex bg-black/50 rounded p-0.5 border border-emerald-900/30">
                <button 
                    onClick={() => setActiveTab('logs')}
                    className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'logs' ? 'bg-emerald-900/50 text-emerald-100 font-bold' : 'text-emerald-700 hover:text-emerald-400'}`}
                >
                    Logs
                </button>
                <button 
                    onClick={() => setActiveTab('telemetry')}
                    className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'telemetry' ? 'bg-emerald-900/50 text-emerald-100 font-bold' : 'text-emerald-700 hover:text-emerald-400'}`}
                >
                    State Explorer
                </button>
            </div>
        </div>

        <div className="flex items-center gap-2">
           {activeTab === 'logs' && (
               <button onClick={clearLogs} className="p-1.5 hover:bg-emerald-900/40 rounded text-emerald-600 hover:text-emerald-400 transition-colors" title="Clear Logs">
                <Trash2 size={14} />
               </button>
           )}
           <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-emerald-900/40 rounded text-emerald-600 hover:text-emerald-400 transition-colors">
             <X size={16} />
           </button>
        </div>
      </div>

      {activeTab === 'logs' ? (
          <>
            {/* Filter Bar */}
            <div className="flex flex-col border-b border-emerald-900/30 bg-black/40 p-2 gap-2">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search size={14} className="absolute left-2 top-1.5 text-emerald-700" />
                        <input 
                            type="text" 
                            placeholder="Filter logs..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-emerald-950/20 border border-emerald-900/50 rounded pl-7 pr-2 py-1 text-xs text-emerald-200 outline-none focus:border-emerald-500"
                        />
                    </div>
                    <div className="flex gap-1">
                        {(['INFO', 'WARN', 'ERROR', 'CRITICAL'] as LogLevel[]).map(lvl => (
                            <button
                                key={lvl}
                                onClick={() => toggleLevel(lvl)}
                                className={`px-2 py-1 text-[10px] font-bold rounded border ${activeLevels.has(lvl) ? 'bg-emerald-900/40 text-emerald-200 border-emerald-700' : 'bg-transparent text-emerald-800 border-transparent hover:border-emerald-900'}`}
                            >
                                {lvl}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Log Feed */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1 bg-black/60">
                {filteredLogs.length === 0 ? (
                    <div className="text-center text-emerald-900 py-10 italic">No logs found matching filters</div>
                ) : (
                    filteredLogs.map((log) => {
                        const isExpanded = expandedLogId === log.id;
                        return (
                            <div 
                                key={log.id} 
                                className={`rounded transition-colors border border-transparent ${getLevelStyle(log.level)}`}
                            >
                                <div 
                                    className="flex items-center gap-3 p-1.5 cursor-pointer text-xs"
                                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                >
                                    <ChevronRight size={12} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                    <span className="opacity-50 font-mono shrink-0">
                                        {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
                                    </span>
                                    <span className="font-bold w-16 shrink-0">{log.category}</span>
                                    {log.source && <span className="font-mono text-emerald-500 bg-emerald-950/50 px-1 rounded">{log.source}</span>}
                                    <span className="truncate flex-1">{log.message}</span>
                                </div>
                                
                                {isExpanded && (
                                    <div className="pl-8 pr-2 pb-2 text-xs border-t border-white/5 mt-1 bg-black/20">
                                        
                                        {/* Payload */}
                                        {log.data && (
                                            <div className="mt-2">
                                                <div className="text-[10px] text-emerald-700 font-bold uppercase mb-1">Payload</div>
                                                <div className="bg-black/50 p-2 rounded border border-white/5 overflow-x-auto">
                                                    <RecursiveJSONTree data={log.data} />
                                                </div>
                                            </div>
                                        )}

                                        {/* Code Snippet (If Error caught by wrapper) */}
                                        {log.codeSnippet && (
                                            <div className="mt-2">
                                                <div className="text-[10px] text-red-700 font-bold uppercase mb-1 flex items-center gap-2">
                                                    <FileCode size={10} /> Source Trace
                                                </div>
                                                <pre className="bg-[#050505] p-2 rounded border border-red-900/20 text-emerald-600/80 overflow-x-auto whitespace-pre-wrap font-mono text-[10px]">
                                                    {log.codeSnippet}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
          </>
      ) : (
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-black/60">
              {/* Telemetry Header */}
              {isBridgeActive && (
                  <div className="p-3 border-b border-emerald-900/50 bg-emerald-950/10 shrink-0 grid grid-cols-3 gap-2 text-xs">
                      <PulseMetric label="CPU" value={systemHealth ? `${systemHealth.resources.cpu.percentCPUUsage?.toFixed(1) || '0.0'}%` : '--'} />
                      <PulseMetric label="Memory" value={systemHealth?.resources.memory.rss || '--'} />
                      <PulseMetric label="DB" value={systemHealth?.ioStatus.connectionState || 'Unknown'} />
                  </div>
              )}

              {/* State Explorer */}
              <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex items-center justify-between p-3 border-b border-emerald-900/30 bg-black/40 gap-4">
                      <div className="flex items-center gap-3 relative flex-1 min-w-0" ref={dropdownRef}>
                          <button 
                              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-900/20 border border-emerald-800/50 rounded w-full justify-between text-emerald-200 text-xs font-medium"
                          >
                              <span className="truncate">{selectedComponent || 'Select Component...'}</span>
                              <ChevronDown size={12} className={`shrink-0 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                          </button>

                          {isDropdownOpen && (
                              <div className="absolute top-full left-0 mt-1 w-[250px] bg-[#0c0c0e] border border-emerald-800/50 rounded shadow-xl z-50 max-h-[400px] overflow-y-auto custom-scrollbar flex flex-col p-1">
                                  {componentNames.map(name => (
                                      <button
                                          key={name}
                                          onClick={() => { setSelectedComponent(name); setIsDropdownOpen(false); }}
                                          className={`text-left px-3 py-2 text-xs rounded hover:bg-emerald-900/20 ${selectedComponent === name ? 'text-emerald-100 bg-emerald-900/40' : 'text-emerald-500'}`}
                                      >
                                          {name}
                                      </button>
                                  ))}
                              </div>
                          )}
                      </div>
                      
                      <button 
                          onClick={handleCopyJSON}
                          disabled={!selectedComponent}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold uppercase border border-emerald-800/50 bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40"
                      >
                          {isCopied ? <Check size={12} /> : <Copy size={12} />}
                          {isCopied ? 'COPIED' : 'COPY JSON'}
                      </button>
                  </div>

                  <div className="flex-1 overflow-auto bg-[#050505] p-4 font-mono text-xs custom-scrollbar">
                      {selectedComponent && currentReportData ? (
                          <div className="text-emerald-300">
                              <RecursiveJSONTree data={currentReportData} />
                          </div>
                      ) : (
                          <div className="flex flex-col items-center justify-center h-full text-emerald-900 opacity-50">
                              <Code size={32} />
                              <p className="mt-2">Select a component to inspect state</p>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Footer */}
      <div className="p-2 border-t border-emerald-900/50 bg-black/80 flex justify-between items-center text-[10px] text-emerald-800">
        <span>Red Pill Diagnostic Interface v3.0</span>
        <div className="flex gap-2">
            <span className={dbStatus.connected ? 'text-emerald-600' : 'text-red-600'}>DB: {dbStatus.connected ? 'OK' : 'ERR'}</span>
            <span>Logs: {logs.length}</span>
        </div>
      </div>
    </div>
  );
};

const PulseMetric = ({ label, value }: { label: string, value: string }) => (
    <div className="flex justify-between bg-emerald-950/30 p-1.5 rounded border border-emerald-900/30">
        <span className="text-emerald-700 font-bold">{label}</span>
        <span className="text-emerald-100">{value}</span>
    </div>
);

// Reuse RecursiveJSONTree from existing code (inline for brevity in this response context, but in real file it's there)
const RecursiveJSONTree: React.FC<{ data: any; label?: string }> = ({ data, label }) => {
    const [expanded, setExpanded] = useState(true);
    
    if (data === null) return <div>{label && <span className="text-blue-400 mr-1">{label}:</span>}<span className="text-slate-500">null</span></div>;
    
    if (typeof data === 'object') {
        const isArray = Array.isArray(data);
        const keys = Object.keys(data);
        
        return (
            <div>
                <div onClick={() => setExpanded(!expanded)} className="cursor-pointer hover:bg-white/5 flex gap-1">
                    {label && <span className="text-blue-400">{label}:</span>}
                    <span className="text-emerald-600">{isArray ? `Array(${data.length})` : 'Object'}</span>
                </div>
                {expanded && (
                    <div className="pl-4 border-l border-emerald-900/20 ml-1">
                        {keys.map(key => <RecursiveJSONTree key={key} label={key} data={data[key]} />)}
                    </div>
                )}
            </div>
        );
    }
    
    return (
        <div className="break-all">
            {label && <span className="text-blue-400 mr-1">{label}:</span>}
            <span className={typeof data === 'string' ? 'text-amber-200' : 'text-purple-300'}>{String(data)}</span>
        </div>
    );
};
