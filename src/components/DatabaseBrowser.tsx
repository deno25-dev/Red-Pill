
import React, { useState, useEffect } from 'react';
import { Folder, FileJson, X, RefreshCw, Trash2, Upload, Download } from 'lucide-react';
import { getDatabaseHandle } from '@/utils/storage';
import { scanRecursive } from '@/utils/dataUtils';

interface DatabaseBrowserProps {
    isOpen: boolean;
    onClose: () => void;
    mode: 'notes' | 'layouts';
}

export const DatabaseBrowser: React.FC<DatabaseBrowserProps> = ({ isOpen, onClose, mode }) => {
    const [files, setFiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const electron = (window as any).electronAPI;

    const refresh = async () => {
        setLoading(true);
        setError(null);
        try {
            if (electron) {
                // Electron Mode
                // Assume generic file listing capability if exposed, or specific getters
                // For now, simulating empty or specific path if available
                setFiles([]); // Placeholder implementation for Electron bridge listing
            } else {
                // Web Mode (OPFS)
                const handle = await getDatabaseHandle();
                if (handle) {
                    const allFiles = await scanRecursive(handle);
                    // Filter based on mode
                    const filtered = allFiles.filter(f => {
                        if (mode === 'notes') return f.name.includes('sticky_notes') || f.name.endsWith('.notes.json');
                        if (mode === 'layouts') return f.name.includes('layout') || f.name.endsWith('.layout.json');
                        return true;
                    });
                    setFiles(filtered);
                } else {
                    setError("Database not connected.");
                }
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) refresh();
    }, [isOpen, mode]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl flex flex-col h-[600px]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#334155] bg-[#0f172a]">
                    <div className="flex items-center gap-3">
                        <Folder className="text-blue-500" size={20} />
                        <h2 className="text-lg font-bold text-white">Database Browser: {mode === 'notes' ? 'Sticky Notes' : 'Layouts'}</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-[#334155] rounded-full text-slate-400 hover:text-white"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-auto p-6">
                    {loading ? (
                        <div className="flex justify-center items-center h-full text-blue-400">
                            <RefreshCw className="animate-spin mr-2" /> Loading...
                        </div>
                    ) : error ? (
                        <div className="text-center text-red-400 mt-10">
                            <p>{error}</p>
                            <button onClick={refresh} className="mt-4 px-4 py-2 bg-[#334155] rounded hover:text-white">Retry</button>
                        </div>
                    ) : files.length === 0 ? (
                        <div className="text-center text-slate-500 mt-20">
                            <FileJson size={48} className="mx-auto mb-4 opacity-20" />
                            <p>No files found in {mode} database.</p>
                        </div>
                    ) : (
                        <div className="grid gap-2">
                            {files.map((file, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-[#0f172a] border border-[#334155] rounded hover:border-blue-500/50 transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <FileJson size={18} className="text-slate-400" />
                                        <span className="text-sm font-mono text-slate-200">{file.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button className="p-1.5 hover:bg-blue-600/20 text-blue-400 rounded" title="Load">
                                            <Upload size={14} />
                                        </button>
                                        <button className="p-1.5 hover:bg-red-600/20 text-red-400 rounded" title="Delete">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-[#334155] bg-[#0f172a] flex justify-between">
                    <button onClick={refresh} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white hover:bg-[#334155] rounded">
                        <RefreshCw size={12} /> Refresh
                    </button>
                    <div className="text-[10px] text-slate-600 self-center">System Metadata</div>
                </div>
            </div>
        </div>
    );
};
