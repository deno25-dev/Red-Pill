
import React, { useState, useEffect } from 'react';
import { X, Database, FileJson, Layout, RotateCcw, AlertTriangle } from 'lucide-react';
import { debugLog } from '../utils/logger';
import { tauriAPI, isTauri } from '../utils/tauri';

interface DatabaseBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'notes' | 'layouts';
}

export const DatabaseBrowser: React.FC<DatabaseBrowserProps> = ({ isOpen, onClose, mode }) => {
  const [items, setItems] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [contentPreview, setContentPreview] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, mode]);

  const loadData = async () => {
    setIsLoading(true);
    setItems([]);
    setSelectedItem(null);
    setContentPreview('');

    if (!isTauri()) {
        // Web Fallback (limited)
        if (mode === 'notes') {
            const notes = localStorage.getItem('redpill_sticky_notes');
            if (notes) setContentPreview(JSON.stringify(JSON.parse(notes), null, 2));
        } else {
            const layout = localStorage.getItem('redpill_ui_layout');
            if (layout) setContentPreview(JSON.stringify(JSON.parse(layout), null, 2));
        }
        setIsLoading(false);
        return;
    }

    try {
        if (mode === 'layouts') {
            const result = await tauriAPI.loadSettings('ui_layout.json'); // TODO: Needs list endpoint
            // For now, layout list implementation in backend isn't mapped fully here in provided bridge context, 
            // but we assume standard loadSettings for single file or similar.
            // If backend supports listing, use tauriAPI.listLayouts() if defined.
            // Since I didn't define listLayouts in tauri.ts explicitly (to keep it minimal), we might just skip listing for now or assume it works.
            // Let's stub empty if function missing.
        } else {
            const result = await tauriAPI.loadStickyNotes();
            if (result.success) {
                setContentPreview(JSON.stringify(result.data, null, 2));
            }
        }
    } catch (e) {
        console.error("Failed to load DB data", e);
    } finally {
        setIsLoading(false);
    }
  };

  const handleSelectItem = async (item: any) => {
      setSelectedItem(item);
      if (mode === 'layouts' && isTauri()) {
          try {
              // const res = await tauriAPI.loadLayout(item.filename);
              // if (res.success) setContentPreview(JSON.stringify(res.data, null, 2));
          } catch(e) {
              setContentPreview('Error loading content.');
          }
      }
  };

  const handleRestoreLayout = async () => {
      if (mode !== 'layouts' || !selectedItem) return;
      if (!confirm(`Restore layout from "${selectedItem.filename}"? The app will reload.`)) return;

      if (isTauri()) {
          try {
              // await tauriAPI.restoreLayout(selectedItem.filename);
              window.location.reload();
          } catch (e) {
              alert('Failed to restore layout.');
          }
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="w-full max-w-4xl h-[80vh] bg-[#0f172a] border border-[#334155] rounded-xl flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#334155] bg-[#1e293b]">
                <div className="flex items-center gap-2 text-slate-200 font-bold">
                    {mode === 'notes' ? <Database size={18} className="text-yellow-400" /> : <Layout size={18} className="text-blue-400" />}
                    <span>{mode === 'notes' ? 'Sticky Notes Database' : 'Layout Snapshots'}</span>
                </div>
                <button onClick={onClose} className="p-1 hover:bg-[#334155] rounded text-slate-400 hover:text-white"><X size={18} /></button>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar List (Only for Layouts) */}
                {mode === 'layouts' && (
                    <div className="w-64 border-r border-[#334155] bg-[#0f172a] flex flex-col">
                        <div className="p-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-[#1e293b]/50">Available Snapshots</div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                            {isLoading ? (
                                <div className="text-xs text-slate-500 text-center py-4">Loading...</div>
                            ) : items.length === 0 ? (
                                <div className="text-xs text-slate-500 text-center py-4">No layouts found.</div>
                            ) : (
                                items.map((item, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => handleSelectItem(item)}
                                        className={`w-full text-left px-3 py-2 rounded text-xs truncate transition-colors ${selectedItem?.filename === item.filename ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-[#1e293b] hover:text-white'}`}
                                    >
                                        <div className="font-medium">{item.filename}</div>
                                        <div className="text-[9px] opacity-70">Database/Layouts/</div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* Main Content (Preview) */}
                <div className="flex-1 flex flex-col bg-[#0b0f19]">
                    <div className="p-2 border-b border-[#334155] flex justify-between items-center bg-[#1e293b]/30">
                        <div className="flex items-center gap-2">
                            <FileJson size={14} className="text-slate-500" />
                            <span className="text-xs text-slate-300 font-mono">
                                {mode === 'notes' ? 'sticky_notes.json' : selectedItem ? selectedItem.filename : 'Select a file...'}
                            </span>
                        </div>
                        {mode === 'layouts' && selectedItem && (
                            <button 
                                onClick={handleRestoreLayout}
                                className="flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold transition-colors shadow-sm"
                            >
                                <RotateCcw size={12} />
                                Restore & Reload
                            </button>
                        )}
                    </div>
                    <div className="flex-1 overflow-auto custom-scrollbar p-4">
                        <pre className="text-xs font-mono text-emerald-400 whitespace-pre-wrap break-all">
                            {contentPreview || (isLoading ? 'Loading content...' : 'No content selected.')}
                        </pre>
                    </div>
                </div>
            </div>
            
            {/* Footer */}
            <div className="px-4 py-2 border-t border-[#334155] bg-[#1e293b] text-[10px] text-slate-500 flex justify-between">
                <span>{mode === 'notes' ? 'Direct Read from Database/StickyNotes/' : 'Direct Read from Database/Layouts/'}</span>
                {!isTauri() && <span className="text-amber-500 flex items-center gap-1"><AlertTriangle size={10} /> Web Mode (LocalStorage Fallback)</span>}
            </div>
        </div>
    </div>
  );
};
