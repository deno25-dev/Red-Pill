
import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Database, Braces, Table, AlertTriangle, Play, FileJson } from 'lucide-react';

interface DatabaseBrowserProps {
    isOpen: boolean;
    onClose: () => void;
    mode: 'notes' | 'layouts';
}

export const DatabaseBrowser: React.FC<DatabaseBrowserProps> = ({ isOpen, onClose, mode }) => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [viewMode, setViewMode] = useState<'json' | 'table'>('table'); // Default to table for action buttons
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const electron = (window as any).electronAPI;
            if (electron) {
                let res;
                if (mode === 'notes') {
                    if (electron.loadStickyNotes) res = await electron.loadStickyNotes();
                    else throw new Error("loadStickyNotes API not available");
                }
                else if (mode === 'layouts') {
                    if (electron.listLayouts) {
                        res = await electron.listLayouts(); // Expects { success: true, data: [...] }
                    }
                    else throw new Error("listLayouts API not available");
                }
                
                // Handle response formats
                if (res && res.success !== false) {
                    const payload = res.data !== undefined ? res.data : res;
                    setData(payload);
                } else {
                    setData(null);
                    setError(res?.error || "Failed to load data from backend.");
                }
            } else {
                setError("Electron API unavailable. Cannot access local database.");
            }
        } catch (e: any) {
            console.error(e);
            setError(e.message || String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) fetchData();
    }, [isOpen, mode]);

    const handleSelect = async (item: any) => {
        const electron = (window as any).electronAPI;
        if (mode === 'layouts') {
            if (!confirm(`Overwrite current layout with ${item.filename}?`)) return;
            
            try {
                // 1. Load the specific layout file
                const loaded = await electron.loadSettings(item.filename);
                if (loaded && loaded.success) {
                    // 2. Save it as the active ui_layout.json
                    await electron.saveSettings('ui_layout.json', loaded.data); 
                    // 3. Reload
                    window.location.reload(); 
                } else {
                    alert(`Failed to load selected layout file: ${loaded?.error || 'Unknown error'}`);
                }
            } catch (e) {
                alert("Error restoring layout.");
            }
        } else if (mode === 'notes') {
            // Logic to highlight/focus note could go here
            // For now just close browser to show notes overlay
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 md:p-8">
            <div className="w-full max-w-5xl h-[85vh] bg-[#0f172a] border border-[#334155] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#334155] bg-[#1e293b]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
                            <Database className="text-blue-400" size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white capitalize tracking-wide">Database Inspector</h2>
                            <p className="text-xs text-slate-400 font-mono">
                                Target: <span className="text-blue-300">{mode === 'notes' ? 'Sticky Notes (sticky_notes.json)' : 'Layouts (/Settings/*.json)'}</span>
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex bg-[#0f172a] rounded-lg p-1 border border-[#334155] mr-4">
                            <button 
                                onClick={() => setViewMode('table')}
                                className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-[#334155] text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                title="Table View"
                                disabled={!Array.isArray(data)}
                            >
                                <Table size={16} />
                            </button>
                            <button 
                                onClick={() => setViewMode('json')}
                                className={`p-1.5 rounded ${viewMode === 'json' ? 'bg-[#334155] text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                title="JSON View"
                            >
                                <Braces size={16} />
                            </button>
                        </div>
                        <button onClick={fetchData} className="p-2 hover:bg-[#334155] rounded-full text-slate-400 hover:text-white transition-colors" title="Reload Data">
                            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-[#334155] rounded-full text-slate-400 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto bg-[#0b0f19] custom-scrollbar relative">
                    {loading ? (
                        <div className="absolute inset-0 flex items-center justify-center text-blue-400 gap-2">
                            <RefreshCw size={24} className="animate-spin" />
                            <span className="text-sm font-medium">Reading Database...</span>
                        </div>
                    ) : error ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 gap-2">
                            <AlertTriangle size={32} />
                            <span className="text-sm font-medium">{error}</span>
                        </div>
                    ) : (
                        <div className="p-6">
                            {viewMode === 'json' ? (
                                <pre className="font-mono text-xs text-emerald-400 leading-relaxed whitespace-pre-wrap bg-[#0f172a] p-4 rounded border border-[#334155]">
                                    {JSON.stringify(data, null, 2)}
                                </pre>
                            ) : (
                                Array.isArray(data) ? (
                                    <div className="grid grid-cols-1 gap-2">
                                        {data.map((item, idx) => (
                                            <div key={idx} className="flex items-center justify-between bg-[#1e293b] border border-[#334155] rounded p-3 hover:border-blue-500/50 transition-colors">
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className="p-2 bg-[#0f172a] rounded text-slate-400">
                                                        {mode === 'layouts' ? <FileJson size={16}/> : <span className="text-xs font-bold text-yellow-500">Note</span>}
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-sm font-bold text-slate-200 truncate">
                                                            {mode === 'layouts' ? item.filename : (item.title || 'Untitled Note')}
                                                        </span>
                                                        <span className="text-[10px] text-slate-500 font-mono truncate">
                                                            {mode === 'layouts' ? item.path : item.id}
                                                        </span>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex items-center gap-4">
                                                    {mode === 'notes' && (
                                                        <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded text-slate-300">
                                                            {item.color || 'yellow'}
                                                        </span>
                                                    )}
                                                    <button 
                                                        onClick={() => handleSelect(item)}
                                                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold transition-colors"
                                                    >
                                                        {mode === 'layouts' ? (
                                                            <>
                                                                <Play size={12} fill="currentColor" />
                                                                Restore
                                                            </>
                                                        ) : 'View'}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center text-slate-500 py-20 flex flex-col items-center gap-2">
                                        <Table size={32} className="opacity-20" />
                                        <p>Data is not an array. Switch to JSON view.</p>
                                    </div>
                                )
                            )}
                        </div>
                    )}
                </div>
                
                {/* Footer */}
                <div className="px-6 py-2 bg-[#1e293b] border-t border-[#334155] text-[10px] text-slate-500 flex justify-between">
                    <span>STATUS: {loading ? 'READING' : error ? 'ERROR' : 'READY'}</span>
                    <span>TYPE: {Array.isArray(data) ? 'ARRAY' : typeof data === 'object' ? 'OBJECT' : typeof data}</span>
                </div>
            </div>
        </div>
    );
};
