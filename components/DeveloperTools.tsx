
import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Copy, X, Trash2, Activity, Database, AlertCircle, Cpu } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { LogEntry, debugLog, clearLogs, getLogHistory } from '../utils/logger';

interface DeveloperToolsProps {
  activeDataSource: string;
  lastError: string | null;
  chartRenderTime: number | null;
}

export const DeveloperTools: React.FC<DeveloperToolsProps> = ({ 
  activeDataSource, 
  lastError,
  chartRenderTime
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const isOnline = useOnlineStatus();
  const logsEndRef = useRef<HTMLDivElement>(null);

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

  // Log listener
  useEffect(() => {
    // Load initial history
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

=== RECENT LOGS (Last 20) ===
${logs.slice(0, 20).map(l => `[${new Date(l.timestamp).toISOString().split('T')[1].replace('Z','')}] [${l.category}] ${l.message}`).join('\n')}
    `.trim();

    navigator.clipboard.writeText(report);
    debugLog('UI', 'Diagnostic report copied to clipboard');
    alert('Report copied to clipboard! Paste this into the chat.');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[450px] bg-black/95 border-l border-emerald-900/50 shadow-2xl z-[9999] flex flex-col font-mono text-sm text-emerald-500 animate-in slide-in-from-right duration-200 backdrop-blur">
      
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-emerald-900/50 bg-emerald-950/20">
        <div className="flex items-center gap-2 font-bold tracking-wider">
          <Terminal size={16} />
          <span>DEV_DIAGNOSTICS_V1</span>
        </div>
        <div className="flex items-center gap-2">
           <button onClick={clearLogs} className="p-1 hover:bg-emerald-900/40 rounded" title="Clear Logs">
             <Trash2 size={14} />
           </button>
           <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-emerald-900/40 rounded">
             <X size={16} />
           </button>
        </div>
      </div>

      {/* Status Grid */}
      <div className="grid grid-cols-2 gap-px bg-emerald-900/30 border-b border-emerald-900/50">
        <div className="bg-black/80 p-3 flex flex-col gap-1">
          <span className="text-[10px] text-emerald-700 uppercase">Connection</span>
          <div className="flex items-center gap-2">
            <Activity size={14} className={isOnline ? "text-emerald-400" : "text-red-500"} />
            <span className={isOnline ? "text-emerald-100" : "text-red-400"}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
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

      {/* Log Feed */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1 bg-black">
        {logs.map((log) => (
          <div key={log.id} className="flex gap-2 text-xs hover:bg-emerald-900/10 p-1 rounded group">
            <span className="text-emerald-700 shrink-0">
              [{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}]
            </span>
            <span className={`font-bold w-14 shrink-0 ${
              log.category === 'UI' ? 'text-purple-400' :
              log.category === 'Net' ? 'text-yellow-400' :
              log.category === 'Data' ? 'text-blue-400' :
              log.category === 'Auth' ? 'text-red-400' :
              'text-emerald-400'
            }`}>
              {log.category}
            </span>
            <span className="text-emerald-100/80 break-all">{log.message}</span>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>

      {/* Actions */}
      <div className="p-3 border-t border-emerald-900/50 bg-black">
        <button 
          onClick={generateFeedbackReport}
          className="w-full flex items-center justify-center gap-2 bg-emerald-900/30 hover:bg-emerald-800/50 text-emerald-400 py-2 px-4 rounded border border-emerald-800 transition-colors uppercase text-xs font-bold tracking-wider"
        >
          <Copy size={14} />
          Generate LLM Feedback Report
        </button>
        <div className="text-center text-[10px] text-emerald-800 mt-2">
          Press Ctrl + D to toggle this panel
        </div>
      </div>
    </div>
  );
};
