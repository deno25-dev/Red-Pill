import React, { useState, useEffect, useRef } from 'react';
import { FolderOpen, FileText, X, Database, RefreshCw, AlertCircle, Trash2, Clock, History } from 'lucide-react';
import { getExplorerHandle, saveExplorerHandle, getRecentFiles, addRecentFile } from '../utils/storage';
import { scanRecursive } from '../utils/dataUtils';

interface FilePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelect: (fileHandle: any) => void;
  onFileListChange?: (files: any[]) => void;
  onFolderNameChange?: (name: string) => void;
}

export const FilePanel: React.FC<FilePanelProps> = ({ isOpen, onClose, onFileSelect, onFileListChange, onFolderNameChange }) => {
  const [files, setFiles] = useState<any[]>([]);
  const [recentFiles, setRecentFiles] = useState<any[]>([]);
  const [directoryName, setDirectoryName] = useState<string>('');
  const [storedHandle, setStoredHandle] = useState<any>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const legacyInputRef = useRef<HTMLInputElement>(null);

  // Propagate files up whenever they change
  useEffect(() => {
    if (onFileListChange) {
        onFileListChange(files);
    }
  }, [files, onFileListChange]);

  // Propagate folder name up whenever it changes
  useEffect(() => {
    if (onFolderNameChange) {
        onFolderNameChange(directoryName);
    }
  }, [directoryName, onFolderNameChange]);

  // Load stored handle and recents on mount
  useEffect(() => {
    checkStoredHandle();
    loadRecents();
  }, []);

  const loadRecents = async () => {
      try {
          const recents = await getRecentFiles();
          setRecentFiles(recents.slice(0, 5)); // Keep top 5
      } catch (e) {
          console.warn("Failed to load recents:", e);
      }
  };

  const checkStoredHandle = async () => {
    try {
      const handle = await getExplorerHandle();
      if (handle) {
        setStoredHandle(handle);
        setDirectoryName(handle.name);
        
        // Check if we already have permission
        try {
            // @ts-ignore
            const perm = await handle.queryPermission({ mode: 'read' });
            if (perm === 'granted') {
              await listFiles(handle);
            } else {
              setNeedsPermission(true);
            }
        } catch (permErr) {
            // Handle permission query failure or non-standard behavior
            console.warn("Permission query failed", permErr);
            setNeedsPermission(true);
        }
      }
    } catch (e) {
      console.error("Error loading stored handle:", e);
    }
  };

  const listFiles = async (handle: any) => {
    setLoading(true);
    try {
      // Use recursive scan to find all files in subfolders
      const fileList = await scanRecursive(handle);
      
      // Sort files alphabetically
      fileList.sort((a: any, b: any) => a.name.localeCompare(b.name));
      
      setFiles(fileList);
      setNeedsPermission(false);
      setError(null);
    } catch (e) {
      console.error("Error listing files:", e);
      setError("Failed to list files. Permission might be revoked or directory moved.");
      setNeedsPermission(true);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    // 1. Try Modern File System Access API
    if ('showDirectoryPicker' in window) {
        try {
            // @ts-ignore
            const handle = await window.showDirectoryPicker({
                mode: 'read'
            });

            // Update UI immediately (Optimistic)
            setStoredHandle(handle);
            setDirectoryName(handle.name);
            await listFiles(handle);

            // Save to persistence in background
            try {
                await saveExplorerHandle(handle);
            } catch (dbErr) {
                console.warn('Failed to save directory handle to DB:', dbErr);
            }
            return;

        } catch (err: any) {
            if (err.name === 'AbortError') {
                return; // User cancelled
            }
            // If SecurityError or other (e.g. Cross-origin), fall through to legacy
            console.warn('File System API failed, using fallback:', err);
        }
    }
    
    // 2. Legacy Fallback
    if (legacyInputRef.current) {
        legacyInputRef.current.click();
    }
  };
  
  const handleLegacyFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const rawFiles: File[] = Array.from(e.target.files);
          const validFiles = rawFiles.filter(f => 
             f.name.toLowerCase().endsWith('.csv') || f.name.toLowerCase().endsWith('.txt')
          );
          
          if (validFiles.length === 0) {
              setError("No .csv or .txt files found in selection.");
              setFiles([]);
              return;
          }

          // Sort
          validFiles.sort((a, b) => a.name.localeCompare(b.name));

          // Wrap to match interface { name, getFile() }
          const wrapped = validFiles.map(f => ({
              kind: 'file',
              name: f.name,
              getFile: async () => f
          }));

          setFiles(wrapped);
          
          // Try to guess directory name from relative path
          let dirName = "Selected Folder";
          // @ts-ignore
          if (validFiles[0].webkitRelativePath) {
             // @ts-ignore
             const parts = validFiles[0].webkitRelativePath.split('/');
             if (parts.length > 0) dirName = parts[0];
          }
          setDirectoryName(dirName);
          
          // Clear persistence state as legacy doesn't support it
          setStoredHandle(null);
          setNeedsPermission(false);
          setError(null);
      }
  };

  const handleReconnect = async () => {
    if (!storedHandle) return;
    try {
      // @ts-ignore
      const perm = await storedHandle.requestPermission({ mode: 'read' });
      if (perm === 'granted') {
        setNeedsPermission(false);
        await listFiles(storedHandle);
      } else {
        setError("Permission denied.");
        setNeedsPermission(true);
      }
    } catch (e) {
      console.error("Reconnection failed:", e);
      setError("Reconnection failed.");
    }
  };

  const handleClearDatabase = async () => {
      setStoredHandle(null);
      setFiles([]);
      setDirectoryName('');
      setNeedsPermission(false);
      setError(null);
      if (legacyInputRef.current) legacyInputRef.current.value = '';
      // We don't delete from DB in this simplified view, just clear state
  };

  const handleFileClick = async (fileHandle: any) => {
      // Optimistically select
      onFileSelect(fileHandle);
      
      // Try to save to recents
      try {
          await addRecentFile(fileHandle);
          await loadRecents();
      } catch (e) {
          console.debug("Failed to update recents:", e);
      }
  };

  return (
    <div className={`
        absolute left-14 top-0 bottom-0 z-20
        w-64 bg-[#0f172a] border-r border-[#334155] flex flex-col shadow-xl
        transition-all duration-300 ease-in-out
        ${isOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'}
    `}>
      <div className="p-4 border-b border-[#334155] flex items-center justify-between h-14 box-border">
        <div className="flex items-center gap-2 text-slate-200 font-semibold">
          <Database size={18} className="text-blue-500" />
          <span>Data Explorer</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X size={16}/>
        </button>
      </div>
      
      {/* Hidden Fallback Input */}
      <input 
        type="file" 
        ref={legacyInputRef} 
        className="hidden" 
        // @ts-ignore
        webkitdirectory="true" 
        directory="true" 
        multiple 
        onChange={handleLegacyFileSelect}
      />
      
      <div className="p-4 border-b border-[#334155]/50 flex flex-col gap-3">
        {storedHandle || (files.length > 0 && !needsPermission) ? (
            <div className="space-y-3">
                <div className="flex items-center justify-between bg-[#1e293b] p-2 rounded border border-[#334155]">
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-[10px] text-slate-500 uppercase font-bold">
                            {storedHandle ? 'Connected' : 'Loaded'}
                        </span>
                        <span className="text-sm text-emerald-400 truncate font-medium" title={directoryName}>
                            {directoryName}
                        </span>
                    </div>
                    <button 
                        onClick={handleConnect} 
                        className="text-slate-500 hover:text-white p-1"
                        title="Change Folder"
                    >
                        <FolderOpen size={16} />
                    </button>
                </div>

                {needsPermission && storedHandle && (
                     <button 
                        onClick={handleReconnect}
                        className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white py-2 px-3 rounded text-sm transition-colors font-medium shadow-sm animate-pulse"
                    >
                        <RefreshCw size={16} />
                        <span>Re-verify Permission</span>
                    </button>
                )}

                <button 
                    onClick={handleClearDatabase}
                    className="w-full flex items-center justify-center gap-2 border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-900/50 hover:bg-red-900/10 py-2 px-3 rounded text-xs transition-all font-medium"
                >
                    <Trash2 size={12} />
                    <span>{storedHandle ? 'Disconnect' : 'Reset Selection'}</span>
                </button>
            </div>
        ) : (
            <button 
            onClick={handleConnect}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-2 px-3 rounded text-sm transition-colors font-medium shadow-sm"
            >
            <FolderOpen size={16} />
            <span>Select Folder</span>
            </button>
        )}
        
        {error && (
            <div className="text-xs text-red-400 flex items-start gap-1 bg-red-900/20 p-2 rounded">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{error}</span>
            </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 custom-scrollbar">
        {/* Recents Section */}
        {recentFiles.length > 0 && (
            <div className="mb-4">
                 <div className="px-2 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                     <History size={10} />
                     <span>Recently Accessed</span>
                 </div>
                 <div className="space-y-0.5">
                     {recentFiles.map((item) => (
                         <button
                            key={item.name}
                            onClick={() => handleFileClick(item.handle)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-blue-300/80 hover:bg-[#1e293b] hover:text-blue-300 rounded-md text-left group transition-all"
                         >
                            <Clock size={14} className="text-blue-500/50 group-hover:text-blue-400 shrink-0 transition-colors" />
                            <span className="truncate font-medium">{item.name}</span>
                         </button>
                     ))}
                 </div>
                 <div className="h-px bg-[#334155]/50 my-2 mx-2"></div>
            </div>
        )}

        {files.length === 0 && !needsPermission && !loading ? (
          <div className="flex flex-col items-center justify-center mt-12 text-slate-500 gap-2 px-6 text-center">
            <FileText size={32} className="opacity-20" />
            <p className="text-xs">
                {storedHandle ? "No .csv or .txt files found in this folder." : "Connect a local folder to browse CSV files."}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {(files.length > 0 || loading) && (
                <div className="px-2 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex justify-between items-center">
                <span>Files ({files.length})</span>
                {loading && <RefreshCw size={10} className="animate-spin text-blue-400" />}
                {storedHandle && !loading && (
                    <button onClick={() => listFiles(storedHandle)} className="hover:text-white" title="Refresh">
                        <RefreshCw size={10} />
                    </button>
                )}
                </div>
            )}
            
            {needsPermission && files.length === 0 && (
                <div className="text-center text-slate-500 mt-10 text-sm">
                    Waiting for permission...
                </div>
            )}

            {files.map((file, idx) => (
              <button
                key={idx}
                onClick={() => handleFileClick(file)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-400 hover:bg-[#1e293b] hover:text-white rounded-md text-left group transition-all"
              >
                <FileText size={14} className="text-slate-600 group-hover:text-blue-400 shrink-0 transition-colors" />
                <span className="truncate font-medium">{file.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};