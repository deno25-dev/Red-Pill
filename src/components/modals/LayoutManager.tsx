
import React, { useState, useEffect } from 'react';
import { X, LayoutTemplate, Save, Trash2, Upload, Download } from 'lucide-react';

export const LayoutManager: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const handleToggle = () => setIsOpen(prev => !prev);
        window.addEventListener('TOGGLE_LAYOUT_MANAGER', handleToggle);
        return () => window.removeEventListener('TOGGLE_LAYOUT_MANAGER', handleToggle);
    }, []);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl flex flex-col h-[500px]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#334155] bg-[#0f172a]">
                    <div className="flex items-center gap-3">
                        <LayoutTemplate className="text-purple-400" size={20} />
                        <h2 className="text-lg font-bold text-white">Layout Manager</h2>
                    </div>
                    <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-[#334155] rounded-full text-slate-400 hover:text-white"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-auto p-4 custom-scrollbar flex flex-col items-center justify-center text-slate-500">
                    <LayoutTemplate size={48} className="mb-4 opacity-20" />
                    <p>No saved layouts found.</p>
                    <p className="text-xs mt-2">Use 'Save Layout to DB' in the toolbar.</p>
                </div>

                <div className="p-4 border-t border-[#334155] bg-[#0f172a] flex justify-between">
                    <button className="flex items-center gap-2 px-3 py-2 bg-[#334155] text-slate-300 hover:text-white rounded text-xs font-bold">
                        <Upload size={14} /> Import
                    </button>
                    <button className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold">
                        <Save size={14} /> Save Current
                    </button>
                </div>
            </div>
        </div>
    );
};
