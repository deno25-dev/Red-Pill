import React, { useState, useEffect, useRef } from 'react';
import { Terminal, X, Trash2, Activity, Database, AlertCircle, Cpu, ShieldAlert, FileEdit, FileJson, Layout, FileClock, ClipboardList, PenTool } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { LogEntry, debugLog, clearLogs as clearRuntimeLogs, getLogHistory } from '../utils/logger';
import { useDevLogs } from '../hooks/useDevLogs';

interface DeveloperToolsProps {
  activeDataSource: string;
  lastError: string | null;
  chartRenderTime: number | null;
  onOpenStickyNotes?: () => void;
  onOpenLayoutDB?: () => void;
}

export const DeveloperTools: React.FC<DeveloperToolsProps> = ({ 
  activeDataSource, 
  lastError,
  chartRenderTime,
  onOpenStickyNotes,
  onOpenLayoutDB
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'runtime' | 'system'>('runtime');
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  const { logs: devLogs, addLog: addDevLog, clearLogs: clearDevLogs } = useDevLogs();
  
  const isOnline = useOnlineStatus();

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

  useEffect(() => {
    setLogs(getLogHistory());

    const handleLog = (e: any) => {
      const newEntry = e.detail as LogEntry;
      setLogs(prev => [newEntry, ...prev]);
    };

    const handleClear = () => {
      setLogs([]);
    };

    window.addEventListener('redpill-debug-log', handleLog);
    window.addEventListener('redpill-debug-clear', handleClear);

    return () => {
      window.removeEventListener('redpill-debug-log', handleLog);
      window.removeEventListener('redpill-debug-clear', handleClear);
    };
  }, []);

  const generateFeedbackReport = () => {
    const report = `
=== RED PILL DIAGNOSTIC REPORT ===
Timestamp: ${new Date().toISOString()}
Browser: ${navigator.userAgent}
Connection: ${isOnline ? 'Online' : 'Offline'}
Active Data Source: ${activeDataSource || 'None'}
Last Chart Render: ${chartRenderTime ? `${chartRenderTime.toFixed(2)}ms` : 'N/A'}
Last Error: ${lastError || 'None'}

=== RECENT RUNTIME LOGS (Last 20) ===
${logs.slice(0, 20).map(l => `[${new Date(l.timestamp).toISOString().split('T')[1].replace('Z','')}] [${l.category}] ${l.message}`).join('\n')}
    `.trim();

    navigator.clipboard.writeText(report);
    debugLog('UI', 'Diagnostic report copied to clipboard');
    alert('Report copied to clipboard!');
  };

  const handleNuclearClear = () => {
      if (confirm('NUCLEAR OPTION: This will permanently delete all drawings/metadata for the CURRENT chart from the database. Are you sure?')) {
          window.dispatchEvent(new CustomEvent('redpill-nuclear-clear'));
          debugLog('Data', 'Nuclear Clear Triggered by user');
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[500px] bg-black/95 border-l border-emerald-900/50 shadow-2xl z-[9999] flex flex-col font-mono text-sm text-emerald-500 animate-in slide-in-from-right duration-200 backdrop-blur">
      
      <div className="flex items-center justify-between p-3 border-b border-emerald-900/50 bg-emerald-950/20">
        <div className="flex items-center gap-2 font-bold tracking-wider">
          <Terminal size={16} />
          <span>DEV_DIAGNOSTICS_V2</span>
        </div>
        <div className="flex items-center gap-2">
           <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-emerald-900/40 rounded">
             <X size={16} />
           </button>
        </div>
      </div>

      <div className="flex border-b border-emerald-900/50 bg-black/50">
          <button 
            onClick={() => setActiveTab('runtime')}
            className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'runtime' ? 'bg-emerald-900/20 text-emerald-400 border-b-2 border-emerald-500' : 'text-emerald-700 hover:text-emerald-500 hover:bg-emerald-900/10'}`}
          >
              <Activity size={12} /> Runtime Stream
          </button>
          <button 
            onClick={() => setActiveTab('system')}
            className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'system' ? 'bg-blue-900/20 text-blue-400 border-b-2 border-blue-500' : 'text-blue-700 hover:text-blue-500 hover:bg-blue-900/10'}`}
          >
              <FileClock size={12} /> System History
          </button>
      </div>

      {activeTab === 'runtime' && (
        <div className="grid grid-cols-2 gap-px bg-emerald-900/30 border-b border-emerald-900/50">
            <div className="bg-black/80 p-3 flex flex-col gap-1">
            <span className="text-[10px] text-emerald-700 uppercase">Connection</span>
            <div className="flex items-center gap-2">
                <Activity size={14} className={isOnline ? "text-emerald-400" : "text-red-500"} />
                <span className="text-emerald-100">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </div>
            </div>
            <div className="bg-black/80 p-3 flex flex-col gap-1">
            <span className="text-[10px] text-emerald-700 uppercase">Render Time</span>
            <div className="flex items-center gap-2">
                <Cpu size={14} />
                <span className="text-emerald-100">{chartRenderTime ? `${chartRenderTime.toFixed(1)}ms` : '--'}</span>
            </div>
            </div>
            <div className="bg-black/80 p-3 flex flex-col gap-1 col-span-2">
            <span className="text-[10px] text-emerald-700 uppercase">Active Data Source</span>
            <div className="flex items-center gap-2 overflow-hidden">
                <Database size={14} className="shrink-0" />
                <span className="text-emerald-100 truncate" title={activeDataSource}>
                {activeDataSource || 'No Data Loaded'}
                </span>
            </div>
            </div>
        </div>
      )}

      {lastError && (
        <div className="bg-red-950/30 border-b border-red-900/30 p-3">
          <div className="flex items-center gap-2 text-red-500 mb-1 text-xs font-bold uppercase">
            <AlertCircle size={14} />
            <span>Critical Error</span>
          </div>
          <p className="text-red-400 text-xs break-words font-sans">{lastError}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1 bg-black relative">
        {activeTab === 'runtime' ? (
            <>
                {logs.map((log) => (
                <div key={log.id} className="flex gap-2 text-xs hover:bg-emerald-900/10 p-1 rounded group">
                    <span className="text-emerald-700 shrink-0">
                    [{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}]
                    </span>
                    <span className={`font-bold w-14 shrink-0 ${
                    log.category === 'UI' ? 'text-purple-400' :
                    log.category === 'Network' ? 'text-yellow-400' :
                    log.category === 'Data' ? 'text-blue-400' :
                    log.category === 'Auth' ? 'text-red-400' :
                    log.category === 'Replay' ? 'text-orange-400' :
                    'text-emerald-400'
                    }`}>
                    {log.category}
                    </span>
                    <span className="text-emerald-100/80 break-all">{log.message}</span>
                </div>
                ))}
            </>
        ) : (
            <>
                {devLogs.length === 0 && <div className="text-center py-8 text-slate-600">No system logs found.</div>}
                {devLogs.map((log) => (
                    <div key={log.id} className="flex flex-col gap-1 border-b border-blue-900/20 p-2 hover:bg-blue-900/10 transition-colors">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
                                    log.type === 'feat' ? 'bg-green-900/30 text-green-400' :
                                    log.type === 'fix' ? 'bg-red-900/30 text-red-400' :
                                    log.type === 'refactor' ? 'bg-purple-900/30 text-purple-400' :
                                    'bg-slate-800 text-slate-400'
                                }`}>{log.type}</span>
                                <span className="text-blue-200 font-bold">{log.message}</span>
                            </div>
                            <span className="text-[10px] text-slate-500">{new Date(log.timestamp).toLocaleDateString()}</span>
                        </div>
                        {log.details && (
                            <p className="text-slate-400 text-xs pl-2 border-l-2 border-slate-700 ml-1">{log.details}</p>
                        )}
                    </div>
                ))}
            </>
        )}
        <div ref={logsEndRef} />
      </div>

      <div className="bg-black border-t border-emerald-900/50">
          <div className="p-2 grid grid-cols-2 gap-2 border-b border-emerald-900/30">
                <button 
                    onClick={onOpenStickyNotes}
                    className="flex items-center justify-center gap-1 bg-blue-900/10 hover:bg-blue-800/30 text-blue-400 py-1.5 px-2 rounded border border-blue-800/30 transition-colors uppercase text-[10px] font-bold tracking-wider"
                >
                    <FileJson size={12} />
                    Inspect Notes DB
                </button>
                <button 
                    onClick={onOpenLayoutDB}
                    className="flex items-center justify-center gap-1 bg-blue-900/10 hover:bg-blue-800/30 text-blue-400 py-1.5 px-2 rounded border border-blue-800/30 transition-colors uppercase text-[10px] font-bold tracking-wider"
                >
                    <Layout size={12} />
                    Inspect Layout DB
                </button>
          </div>
          
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
                onClick={generateFeedbackReport}
                className="flex items-center justify-center gap-1 bg-emerald-900/20 hover:bg-emerald-800/40 text-emerald-400 py-2 px-2 rounded border border-emerald-800/50 transition-colors uppercase text-[10px] font-bold tracking-wider"
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