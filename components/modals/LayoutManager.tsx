
import React, { useState, useEffect } from 'react';
import { X, Layout, FileJson, Calendar, RotateCcw } from 'lucide-react';

interface LayoutFile {
    filename: string;
    path: string;
    updatedAt: number;
}

export const LayoutManager: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [files, setFiles] = useState<LayoutFile[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const handleToggle = () => setIsOpen(prev => !prev);
        // Mandate 2.11.4: Event string alignment
        window.addEventListener('TOGGLE_LAYOUT_MANAGER', handleToggle);
        return () => window.removeEventListener('TOGGLE_LAYOUT_MANAGER', handleToggle);
    }, []);

    useEffect(() => {
        if (isOpen) {
            loadFiles();
        }
    }, [isOpen]);

    const loadFiles = async () => {
        setLoading(true);
        const electron = (window as any).electronAPI;
        if (electron && electron.listLayouts) {
            try {
                // This calls storage:list-layouts which now points to Database/Layouts
                const res = await electron.listLayouts();
                if (res.success) {
                    setFiles(res.data);
                }
            } catch (e) {
                console.error("Failed to list layouts", e);
            }
        }
        setLoading(false);
    };

    const handleRestore = async (filename: string) => {
        if (!confirm(`Are you sure you want to restore "${filename}"? \nThis will overwrite your current workspace configuration and reload the app.`)) {
            return;
        }

        const electron = (window as any).electronAPI;
        if (electron && electron.restoreLayout) {
            try {
                const res = await electron.restoreLayout(filename);
                if (res.success) {
                    // Hard Reload as per Mandate 0.35
                    window.location.reload();
                } else {
                    alert(`Failed to restore layout: ${res.error}`);
                }
            } catch (e: any) {
                alert(`Error restoring layout: ${e.message}`);
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 flex items-center justify-center z-[10000] bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 bg-[#0f172a] border-b border-[#334155]">
                    <div className="flex items-center gap-3 text-blue-400">
                        <Layout size={20} />
                        <h2 className="text-lg font-bold text-white">Layout Manager</h2>
                    </div>
                    <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 bg-[#0b0f19] min-h-[300px] max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
                            <div className="w-6 h-6 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-xs">Loading layouts...</span>
                        </div>
                    ) : files.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2 opacity-60">
                            <FileJson size={32} />
                            <p className="text-sm">No saved layouts found in Database/Layouts</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-2">
                            {files.map((file) => (
                                <div key={file.filename} className="flex items-center justify-between p-3 bg-[#1e293b] border border-[#334155] rounded-lg hover:border-blue-500/50 transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                                            <Layout size={16} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-slate-200">{file.filename}</span>
                                            <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                                <Calendar size={10} />
                                                {new Date(file.updatedAt).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <button 
                                        onClick={() => handleRestore(file.filename)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded shadow-sm"
                                        title="Overwrite current UI and Reload"
                                    >
                                        <RotateCcw size={12} />
                                        Restore
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 bg-[#1e293b] border-t border-[#334155] text-center">
                    <p className="text-[10px] text-slate-500">
                        Reading from [Project_Root]/Database/Layouts/
                    </p>
                </div>
            </div>
        </div>
    );
};
