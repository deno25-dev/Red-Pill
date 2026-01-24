
import React, { useState, useEffect } from 'react';
import { X, StickyNote, FileJson, Calendar, Trash2 } from 'lucide-react';

interface StickyNoteFile {
    filename: string;
    path: string;
    updatedAt: number;
}

export const StickyNoteManager: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [files, setFiles] = useState<StickyNoteFile[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const handleToggle = () => setIsOpen(prev => !prev);
        window.addEventListener('TOGGLE_STICKY_NOTE_MANAGER', handleToggle);
        return () => window.removeEventListener('TOGGLE_STICKY_NOTE_MANAGER', handleToggle);
    }, []);

    useEffect(() => {
        if (isOpen) {
            loadFiles();
        }
    }, [isOpen]);

    const loadFiles = async () => {
        setLoading(true);
        const electron = (window as any).electronAPI;
        if (electron && electron.listStickyNotesDirectory) {
            try {
                const res = await electron.listStickyNotesDirectory();
                if (res.success) {
                    setFiles(res.data);
                }
            } catch (e) {
                console.error("Failed to list sticky notes", e);
            }
        }
        setLoading(false);
    };

    const handleLoad = async (filename: string) => {
        const electron = (window as any).electronAPI;
        if (electron && electron.loadMetadataFile) {
            try {
                const res = await electron.loadMetadataFile('notes', filename);
                if (res.success && res.data) {
                    // Dispatch event to add this note to the active overlay
                    window.dispatchEvent(new CustomEvent('REDPILL_ADD_STICKY_NOTE', { detail: res.data }));
                    setIsOpen(false);
                } else {
                    alert('Failed to load note content.');
                }
            } catch (e) {
                console.error("Failed to load note file", e);
            }
        }
    };

    const handleDelete = async (e: React.MouseEvent, filename: string) => {
        e.stopPropagation();
        if (!confirm(`Are you sure you want to delete note "${filename}"?`)) return;
        
        const electron = (window as any).electronAPI;
        if (electron && electron.deleteMetadataFile) {
            try {
                await electron.deleteMetadataFile('notes', filename);
                loadFiles(); // Refresh
            } catch (e) {
                console.error("Failed to delete note", e);
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 flex items-center justify-center z-[10000] bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 bg-[#0f172a] border-b border-[#334155]">
                    <div className="flex items-center gap-3 text-yellow-400">
                        <StickyNote size={20} />
                        <h2 className="text-lg font-bold text-white">Sticky Note Manager</h2>
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
                            <span className="text-xs">Loading notes...</span>
                        </div>
                    ) : files.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2 opacity-60">
                            <FileJson size={32} />
                            <p className="text-sm">No saved notes found in Database/StickyNotes</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-2">
                            {files.map((file) => (
                                <div 
                                    key={file.filename} 
                                    onClick={() => handleLoad(file.filename)}
                                    className="flex items-center justify-between p-3 bg-[#1e293b] border border-[#334155] rounded-lg hover:border-yellow-500/50 hover:bg-[#334155]/80 cursor-pointer transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-500">
                                            <StickyNote size={16} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-slate-200 group-hover:text-yellow-100 transition-colors">{file.filename}</span>
                                            <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                                <Calendar size={10} />
                                                {new Date(file.updatedAt).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <button 
                                        onClick={(e) => handleDelete(e, file.filename)}
                                        className="opacity-0 group-hover:opacity-100 p-2 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-all"
                                        title="Delete Note"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 bg-[#1e293b] border-t border-[#334155] text-center">
                    <p className="text-[10px] text-slate-500">
                        Click to load • Listing files from [Project_Root]/Database/StickyNotes/
                    </p>
                </div>
            </div>
        </div>
    );
};
