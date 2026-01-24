
import React, { useRef } from 'react';
import { useFileSystem } from '@/hooks/useFileSystem';
import { FolderOpen, FileText, Loader2, AlertTriangle, FileSpreadsheet } from 'lucide-react';

interface FilePanelProps {
    isOpen: boolean;
    onClose: () => void;
    onFileSelect: (fileHandle: any) => void;
    onFileListChange: (files: any[]) => void;
    onFolderNameChange: (name: string) => void;
    overrideFiles?: any[];
    overridePath?: string;
    fileFilter?: ((f: any) => boolean) | null;
}

export const FilePanel: React.FC<FilePanelProps> = ({ 
    isOpen, 
    onClose, 
    onFileSelect, 
    onFileListChange, 
    onFolderNameChange,
    overrideFiles,
    overridePath,
    fileFilter
}) => {
  const { loadFile, data, currentFileName, isLoading, error } = useFileSystem();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      loadFile(file);
      onFileSelect(file);
    }
  };

  const handleSelectOverrideFile = (file: any) => {
      onFileSelect(file);
  };

  if (!isOpen) return null;

  return (
    <div className="flex flex-col h-full bg-panel-bg border-r border-app-border w-72 text-text-primary shadow-xl absolute z-20 top-0 left-14">
      {/* Header */}
      <div className="p-4 border-b border-app-border bg-sub-panel-bg flex justify-between items-center">
        <h2 className="text-xs font-bold uppercase tracking-widest text-text-tertiary flex items-center gap-2">
          <FolderOpen size={14} className="text-accent-bg" /> 
          {overridePath ? overridePath : 'Local Data Explorer'}
        </h2>
        <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
      </div>

      {/* Content Area */}
      <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
        
        {/* Load Button */}
        {!overrideFiles && (
            <div>
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".csv,.txt"
                onChange={handleFileChange}
            />
            <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className={`
                w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg text-sm font-bold shadow-lg transition-all
                ${isLoading 
                    ? 'bg-interactive-bg text-text-tertiary cursor-wait' 
                    : 'bg-accent-bg hover:bg-accent-hover-bg text-white hover:shadow-accent-bg/20'
                }
                `}
            >
                {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
                ) : (
                <FileSpreadsheet size={18} />
                )}
                <span>{isLoading ? 'Parsing Stream...' : 'Load Local CSV'}</span>
            </button>
            <p className="text-[10px] text-text-tertiary text-center mt-2">
                Supports .csv and .txt (OHLCV format)
            </p>
            </div>
        )}

        {/* Override File List (e.g. from Database/Layouts watcher) */}
        {overrideFiles && (
            <div className="flex flex-col gap-1">
                {overrideFiles.filter(fileFilter || (()=>true)).map((file, idx) => (
                    <button
                        key={idx}
                        onClick={() => handleSelectOverrideFile(file)}
                        className="flex items-center gap-2 px-3 py-2 rounded text-xs text-left bg-interactive-bg hover:bg-interactive-hover-bg transition-colors"
                    >
                        <FileText size={14} className="text-blue-400" />
                        <span className="truncate flex-1">{file.name}</span>
                    </button>
                ))}
                {overrideFiles.length === 0 && (
                    <div className="text-center text-xs text-slate-500 py-4">Folder empty.</div>
                )}
            </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg flex gap-3 items-start animate-in fade-in slide-in-from-top-2">
            <AlertTriangle size={16} className="text-danger shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-danger mb-1">Load Failed</h4>
              <p className="text-[11px] text-danger/80 leading-snug">{error}</p>
            </div>
          </div>
        )}

        {/* Active File State */}
        {currentFileName && !error && !overrideFiles && (
          <div className="p-4 bg-interactive-bg/20 border border-interactive-bg rounded-lg space-y-3">
            <div className="flex items-center gap-2 text-emerald-400">
              <FileText size={16} />
              <span className="text-sm font-bold truncate" title={currentFileName}>
                {currentFileName}
              </span>
            </div>
            
            <div className="h-px bg-app-border" />
            
            <div className="grid grid-cols-2 gap-y-2 text-[11px] text-text-secondary">
              <div className="flex flex-col">
                <span className="text-text-tertiary uppercase text-[9px] font-bold">Rows</span>
                <span className="font-mono text-text-primary">{data.length.toLocaleString()}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-text-tertiary uppercase text-[9px] font-bold">Status</span>
                <span className="font-mono text-emerald-400">Ready</span>
              </div>
              <div className="flex flex-col col-span-2">
                <span className="text-text-tertiary uppercase text-[9px] font-bold">Stream Type</span>
                <span className="font-mono text-text-primary">Stream A (Local/Offline)</span>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!currentFileName && !isLoading && !error && !overrideFiles && (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center min-h-[100px]">
            <FolderOpen size={48} className="mb-2" />
            <p className="text-xs font-medium">No Data Source Selected</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-app-border bg-sub-panel-bg text-[10px] text-text-tertiary text-center">
        Security: System Metadata Excluded
      </div>
    </div>
  );
};
