
import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Copy, X, Trash2, Activity, Database, AlertCircle, Cpu, ShieldAlert, Server, Zap, ChevronDown, Check, Code, RotateCcw, HardDrive } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { LogEntry, debugLog, clearLogs } from '../utils/logger';
import { useTelemetry } from '../hooks/useTelemetry';

interface DeveloperToolsProps {
  activeDataSource: string;
  lastError: string | null;
  chartRenderTime: number | null;
}

const MAX_HISTORY_DISPLAY = 200;

export const DeveloperTools: React.FC<DeveloperToolsProps> = ({ 
  activeDataSource, 
  lastError,
  chartRenderTime
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'logs' | 'telemetry'>('logs');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [dbStatus, setDbStatus] = useState<{ connected: boolean; error?: string }>({ connected: false });
  
  // Log Explorer State
  const [selectedComponent, setSelectedComponent] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  // Settings
  const [autoClearOnSymbolChange, setAutoClearOnSymbolChange] = useState(false);

  const isOnline = useOnlineStatus();
  const logsEndRef = useRef<HTMLDivElement>(null);
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

  // Log Polling (Robust Electron Support)
  useEffect(() => {
    if (!isOpen) return;

    const pollLogs = () => {
        if (window.__REDPIL_LOGS__) {
            // We create a new array ref to force React render if content changed
            // In a high-perf scenario we'd check length or a version counter, but for debug tools this is fine.
            setLogs([...window.__REDPIL_LOGS__]);
        }
    };

    // Initial fetch
    pollLogs();

    // Poll every 500ms
    const interval = setInterval(pollLogs, 500);
    return () => clearInterval(interval);
  }, [isOpen]);

  // DB Status Check & System Telemetry Polling
  useEffect(() => {
      if (!isOpen) return;
      
      const electron = window.electronAPI;
      
      const checkHealth = async () => {
          if (electron) {
              // 1. Get DB Status (New IPC)
              if (electron.getDbStatus) {
                  try {
                      const status = await electron.getDbStatus();
                      setDbStatus(status);
                  } catch (e) {
                      setDbStatus({ connected: false, error: 'IPC Failed' });
                  }
              }

              // 2. Get Telemetry (If on tab)
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
      const interval = setInterval(checkHealth, 2000); // Check DB every 2s
      return () => clearInterval(interval);
  }, [isOpen, activeTab]);

  // Auto-Clear Listener
  useEffect(() => {
      if (!autoClearOnSymbolChange) return;

      const handleAssetChange = () => {
          clearLogs();
          clearReports();
          debugLog('UI', 'Auto-cleared logs and telemetry on symbol change');
      };

      window.addEventListener('GLOBAL_ASSET_CHANGE', handleAssetChange);
      return () => window.removeEventListener('GLOBAL_ASSET_CHANGE', handleAssetChange);
  }, [autoClearOnSymbolChange, clearReports]);

  const generateFeedbackReport = async () => {
    const report = `
=== RED PILL DIAGNOSTIC REPORT ===
Timestamp: ${new Date().toISOString()}
Browser: ${navigator.userAgent}
Connection: ${isOnline ? 'Online' : 'Offline'}
DB Status: ${dbStatus.connected ? 'Connected' : `Disconnected (${dbStatus.error || 'Unknown'})`}
Active Data Source: ${activeDataSource || 'None'}
Last Chart Render: ${chartRenderTime ? `${chartRenderTime.toFixed(2)}ms` : 'N/A'}
Last Error: ${lastError || 'None'}

=== RECENT LOGS (Last 20) ===
${logs.slice(0, 20).map(l => `[${new Date(l.timestamp).toISOString().split('T')[1].replace('Z','')}] [${l.category}] ${l.message}`).join('\n')}
    `.trim();

    await copyToClipboard(report);
    debugLog('UI', 'Diagnostic report copied to clipboard');
    alert('Report copied to clipboard! Paste this into the chat.');
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
  
  // Get history array for selected component
  const selectedHistory = selectedComponent ? reports[selectedComponent] : [];
  // Latest state is first element
  const currentReportData = selectedHistory.length > 0 ? selectedHistory[0].status : null;

  return (
    <div className="fixed inset-y-0 right-0 w-[600px] bg-[#09090b]/95 border-l border-emerald-900/50 shadow-2xl z-[9999] flex flex-col font-mono text-sm text-emerald-500 animate-in slide-in-from-right duration-200 backdrop-blur-xl">
      
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-emerald-900/50 bg-emerald-950/20 shrink-0">
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 font-bold tracking-wider text-emerald-400">
            <Terminal size={16} />
            <span>DEV_TOOLS</span>
            </div>
            
            {/* Tabs */}
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
                    Log Explorer
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
            {/* Status Grid */}
            <div className="grid grid-cols-2 gap-px bg-emerald-900/30 border-b border-emerald-900/50 shrink-0">
                <div className="bg-black/40 p-3 flex flex-col gap-1">
                    <span className="text-[10px] text-emerald-700 uppercase font-bold tracking-wider">IO Status</span>
                    <div className="flex items-center gap-2">
                        <HardDrive size={14} className={dbStatus.connected ? "text-emerald-400" : "text-red-500"} />
                        <span className="text-emerald-100">{dbStatus.connected ? 'DB WRITABLE' : 'DB ERROR'}</span>
                    </div>
                </div>
                <div className="bg-black/40 p-3 flex flex-col gap-1">
                    <span className="text-[10px] text-emerald-700 uppercase font-bold tracking-wider">Render Time</span>
                    <div className="flex items-center gap-2">
                        <Cpu size={14} className="text-emerald-600" />
                        <span className="text-emerald-100">{chartRenderTime ? `${chartRenderTime.toFixed(1)}ms` : '--'}</span>
                    </div>
                </div>
                <div className="bg-black/40 p-3 flex flex-col gap-1 col-span-2">
                    <span className="text-[10px] text-emerald-700 uppercase font-bold tracking-wider">Active Data Source</span>
                    <div className="flex items-center gap-2 overflow-hidden">
                        <Database size={14} className="shrink-0 text-emerald-600" />
                        <span className="text-emerald-100 truncate" title={activeDataSource}>
                        {activeDataSource || 'No Data Loaded'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Error Panel */}
            {lastError && (
                <div className="bg-red-950/30 border-b border-red-900/30 p-3 shrink-0">
                <div className="flex items-center gap-2 text-red-500 mb-1 text-xs font-bold uppercase">
                    <AlertCircle size={14} />
                    <span>Critical Error</span>
                </div>
                <p className="text-red-400 text-xs break-words font-sans">{lastError}</p>
                </div>
            )}

            {/* Log Feed */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-0.5 bg-black/60">
                {logs.map((log) => (
                <div key={log.id} className="flex gap-3 text-[11px] hover:bg-emerald-900/10 p-1.5 rounded group border-b border-emerald-900/10 last:border-0">
                    <span className="text-emerald-800 shrink-0 font-mono">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}.<span className="text-emerald-900">{new Date(log.timestamp).getMilliseconds().toString().padStart(3, '0')}</span>
                    </span>
                    <span className={`font-bold w-16 shrink-0 text-center uppercase tracking-tighter rounded px-1 py-0.5 text-[9px] h-fit ${
                    log.category === 'UI' ? 'bg-purple-900/20 text-purple-400' :
                    log.category === 'Network' ? 'bg-yellow-900/20 text-yellow-400' :
                    log.category === 'Data' ? 'bg-blue-900/20 text-blue-400' :
                    log.category === 'Auth' ? 'bg-red-900/20 text-red-400' :
                    'bg-emerald-900/20 text-emerald-400'
                    }`}>
                    {log.category}
                    </span>
                    <span className="text-emerald-100/90 break-all leading-tight">{log.message}</span>
                </div>
                ))}
                <div ref={logsEndRef} />
            </div>
          </>
      ) : (
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-black/60">
              {/* ... (Telemetry View Remains Unchanged) ... */}
              {isBridgeActive ? (
                  <div className="p-4 border-b border-emerald-900/50 bg-emerald-950/10 shrink-0">
                      <div className="flex items-center justify-between mb-3">
                          <div className="text-xs font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                              <Server size={14} /> System Pulse
                          </div>
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                              <span className="text-[10px] font-bold text-emerald-400">BRIDGE ACTIVE</span>
                          </div>
                      </div>
                      
                      <div className="grid grid-cols-4 gap-2 mb-2">
                          <PulseMetric label="CPU Usage" value={systemHealth ? `${systemHealth.resources.cpu.percentCPUUsage?.toFixed(1) || '0.0'}%` : '--'} />
                          <PulseMetric label="Memory RSS" value={systemHealth?.resources.memory.rss || '--'} />
                          <PulseMetric label="V8 Heap" value={systemHealth?.resources.v8Heap?.used || '--'} />
                          <PulseMetric label="Uptime" value={systemHealth ? `${formatUptime(systemHealth.processInfo.uptime)}` : '--'} />
                      </div>
                      
                      <div className="pt-2 border-t border-emerald-900/30 flex justify-between items-center text-[10px]">
                          <span className="text-emerald-700 truncate max-w-[200px]" title={systemHealth?.ioStatus.dbPath}>IO: {systemHealth?.ioStatus.connectionState || 'Unknown'}</span>
                          <span className="text-emerald-600 font-mono">Annotations: {systemHealth?.ioStatus.userAnnotationsCount ?? 0}</span>
                      </div>
                  </div>
              ) : (
                  <div className="p-4 border-b border-red-900/30 bg-red-950/10 shrink-0 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-red-400 font-bold text-xs">
                          <Zap size={14} />
                          <span>BRIDGE DISCONNECTED</span>
                      </div>
                      <span className="text-[10px] text-red-500/70">Web Mode Limits Active</span>
                  </div>
              )}

              {/* ... (Log Explorer / JSON Tree) ... */}
              <div className="flex-1 flex flex-col min-h-0">
                  {/* Explorer Header */}
                  <div className="flex items-center justify-between p-3 border-b border-emerald-900/30 bg-black/40 gap-4">
                      
                      {/* Component Selector */}
                      <div className="flex items-center gap-3 relative flex-1 min-w-0" ref={dropdownRef}>
                          <button 
                              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-900/20 border border-emerald-800/50 rounded hover:bg-emerald-900/40 hover:border-emerald-700 transition-all w-full justify-between text-emerald-200 text-xs font-medium"
                          >
                              <span className="truncate">{selectedComponent || 'Select Component...'}</span>
                              <ChevronDown size={12} className={`shrink-0 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                          </button>

                          {/* Dropdown Menu */}
                          {isDropdownOpen && (
                              <div className="absolute top-full left-0 mt-1 w-[200px] bg-[#0c0c0e] border border-emerald-800/50 rounded shadow-xl z-50 max-h-[300px] overflow-y-auto custom-scrollbar flex flex-col p-1 animate-in fade-in slide-in-from-top-1 duration-100">
                                  {componentNames.length === 0 ? (
                                      <div className="px-3 py-2 text-xs text-emerald-800 italic">No reports available</div>
                                  ) : (
                                      componentNames.map(name => (
                                          <button
                                              key={name}
                                              onClick={() => { setSelectedComponent(name); setIsDropdownOpen(false); }}
                                              className={`text-left px-3 py-2 text-xs rounded transition-colors ${selectedComponent === name ? 'bg-emerald-900/40 text-emerald-100' : 'text-emerald-500 hover:bg-emerald-900/20 hover:text-emerald-300'}`}
                                          >
                                              {name}
                                          </button>
                                      ))
                                  )}
                              </div>
                          )}
                      </div>

                      {/* Log Size Counter */}
                      <div className="flex flex-col items-end shrink-0">
                          <span className="text-[9px] text-emerald-700 font-bold uppercase tracking-wider">Log Size</span>
                          <span className={`text-xs font-mono ${selectedHistory.length >= MAX_HISTORY_DISPLAY ? 'text-red-400' : 'text-emerald-100'}`}>
                              {selectedHistory.length} / {MAX_HISTORY_DISPLAY}
                          </span>
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => setAutoClearOnSymbolChange(!autoClearOnSymbolChange)}
                            className={`p-1.5 rounded transition-colors ${autoClearOnSymbolChange ? 'bg-emerald-500 text-black' : 'bg-emerald-900/20 text-emerald-500 hover:bg-emerald-900/40'}`}
                            title="Auto-Clear on Symbol Change"
                          >
                              <RotateCcw size={14} />
                          </button>
                          
                          <button 
                              onClick={handleCopyJSON}
                              disabled={!selectedComponent}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${isCopied ? 'bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-emerald-900/20 text-emerald-400 border border-emerald-800/50 hover:bg-emerald-900/40 hover:text-emerald-200'}`}
                          >
                              {isCopied ? <Check size={12} strokeWidth={3} /> : <Copy size={12} />}
                              {isCopied ? 'COPIED' : 'COPY'}
                          </button>
                      </div>
                  </div>

                  {/* JSON Tree Area */}
                  <div className="flex-1 overflow-auto bg-[#050505] p-4 font-mono text-xs relative group custom-scrollbar">
                      {selectedComponent && currentReportData ? (
                          <div className="text-emerald-300 leading-relaxed">
                              {/* Root Time Info */}
                              <div className="mb-2 pb-2 border-b border-emerald-900/20 text-emerald-700 text-[10px]">
                                  Latest Snapshot: {new Date(selectedHistory[0].timestamp).toISOString()}
                              </div>
                              <RecursiveJSONTree data={currentReportData} />
                          </div>
                      ) : (
                          <div className="flex flex-col items-center justify-center h-full text-emerald-900 gap-2 opacity-50">
                              <Code size={32} />
                              <p className="text-xs">Select a component to inspect telemetry</p>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Footer Actions */}
      <div className="p-3 border-t border-emerald-900/50 bg-black/80 flex gap-2 shrink-0">
        <button 
          onClick={generateFeedbackReport}
          className="flex-1 flex items-center justify-center gap-2 bg-emerald-900/30 hover:bg-emerald-800/50 text-emerald-400 py-2.5 px-2 rounded border border-emerald-800 transition-colors uppercase text-[10px] font-bold tracking-widest shadow-sm hover:shadow-emerald-900/20"
        >
          <Copy size={14} />
          Full Report
        </button>
        <button 
          onClick={handleNuclearClear}
          className="flex-1 flex items-center justify-center gap-2 bg-red-950/20 hover:bg-red-900/40 text-red-500 py-2.5 px-2 rounded border border-red-900/30 transition-colors uppercase text-[10px] font-bold tracking-widest hover:shadow-red-900/20"
          title="Delete current chart metadata from DB"
        >
          <ShieldAlert size={14} />
          Nuclear Clear
        </button>
      </div>
    </div>
  );
};

// ... (PulseMetric, formatUptime, RecursiveJSONTree components remain unchanged)
const PulseMetric = ({ label, value }: { label: string, value: string }) => (
    <div className="bg-emerald-950/30 border border-emerald-900/30 p-2 rounded flex flex-col">
        <span className="text-[9px] text-emerald-700 uppercase font-bold tracking-wider">{label}</span>
        <span className="text-emerald-100 font-mono text-xs truncate" title={value}>{value}</span>
    </div>
);

const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
};

// Recursive JSON Tree with Copy Branch Feature
const RecursiveJSONTree: React.FC<{ data: any; label?: string }> = ({ data, label }) => {
    const [expanded, setExpanded] = useState(true);
    const [copied, setCopied] = useState(false);

    const handleCopyBranch = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
            setCopied(true);
            setTimeout(() => setCopied(false), 1000);
        } catch(err) {}
    };

    if (data === null) {
        return (
            <div>
                {label && <span className="text-blue-400 mr-1">{label}:</span>}
                <span className="text-slate-500 italic">null</span>
            </div>
        );
    }

    if (typeof data === 'boolean') {
        return (
            <div>
                {label && <span className="text-blue-400 mr-1">{label}:</span>}
                <span className="text-yellow-400">{data.toString()}</span>
            </div>
        );
    }

    if (typeof data === 'number') {
        return (
            <div>
                {label && <span className="text-blue-400 mr-1">{label}:</span>}
                <span className="text-orange-400">{data}</span>
            </div>
        );
    }

    if (typeof data === 'string') {
        return (
            <div>
                {label && <span className="text-blue-400 mr-1">{label}:</span>}
                <span className="text-emerald-200">"{data}"</span>
            </div>
        );
    }

    if (Array.isArray(data)) {
        return (
            <div>
                <div 
                    className="flex items-center gap-1 hover:bg-emerald-900/10 cursor-pointer rounded px-1 -ml-1 group/line"
                    onClick={() => setExpanded(!expanded)}
                >
                    {label && <span className="text-blue-400">{label}:</span>}
                    <span className="text-emerald-100">[{data.length}]</span>
                    {/* Copy Button */}
                    <button 
                        onClick={handleCopyBranch}
                        className={`opacity-0 group-hover/line:opacity-100 p-0.5 ml-2 hover:bg-emerald-800 rounded transition-opacity ${copied ? 'text-emerald-400' : 'text-slate-500'}`}
                        title="Copy Array JSON"
                    >
                        {copied ? <Check size={10} /> : <Copy size={10} />}
                    </button>
                </div>
                {expanded && (
                    <div className="pl-4 border-l border-emerald-900/20 ml-1">
                        {data.map((item, i) => (
                            <RecursiveJSONTree key={i} data={item} />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    if (typeof data === 'object') {
        const keys = Object.keys(data);
        return (
            <div>
                <div 
                    className="flex items-center gap-1 hover:bg-emerald-900/10 cursor-pointer rounded px-1 -ml-1 group/line"
                    onClick={() => setExpanded(!expanded)}
                >
                    {label ? <span className="text-blue-400">{label}</span> : <span className="text-emerald-100 opacity-50">Object</span>}
                    <span className="text-emerald-100">{keys.length} keys</span>
                    {/* Copy Button */}
                    <button 
                        onClick={handleCopyBranch}
                        className={`opacity-0 group-hover/line:opacity-100 p-0.5 ml-2 hover:bg-emerald-800 rounded transition-opacity ${copied ? 'text-emerald-400' : 'text-slate-500'}`}
                        title="Copy Object JSON"
                    >
                        {copied ? <Check size={10} /> : <Copy size={10} />}
                    </button>
                </div>
                {expanded && (
                    <div className="pl-4 border-l border-emerald-900/20 ml-1">
                        {keys.map((key) => (
                            <RecursiveJSONTree key={key} label={key} data={data[key]} />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return <span>Unknown</span>;
};
