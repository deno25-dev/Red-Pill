
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, FileText, X, Database, CornerDownLeft, FolderPlus } from 'lucide-react';
import { scanRecursive } from '../utils/dataUtils';

interface SearchPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  files: any[];
  onFileSelect: (fileHandle: any) => void;
  onConnectDatabase: () => void;
  isConnected: boolean;
}

export const SearchPalette: React.FC<SearchPaletteProps> = ({ 
  isOpen, 
  onClose, 
  files, 
  onFileSelect,
  onConnectDatabase,
  isConnected
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Small delay to ensure render
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filteredFiles = useMemo(() => {
    if (!query) return files.slice(0, 50); // Show all/some if empty
    return files.filter(f => f.name.toLowerCase().includes(query.toLowerCase()));
  }, [files, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filteredFiles.length - 1));
      
      // Auto-scroll
      if (listRef.current) {
          const list = listRef.current;
          // Approx height of item is 48px
          const itemHeight = 48;
          const visibleItems = list.clientHeight / itemHeight;
          if (selectedIndex > visibleItems - 2) {
              list.scrollTop += itemHeight;
          }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
      // Auto-scroll
      if (listRef.current && listRef.current.scrollTop > 0) {
          listRef.current.scrollTop -= 48;
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredFiles[selectedIndex]) {
        onFileSelect(filteredFiles[selectedIndex]);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#334155]">
          <Search className="text-slate-400" size={20} />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-slate-200 placeholder-slate-500 text-lg"
            placeholder={isConnected ? "Search symbol in database..." : "Connect database to search..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isConnected}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 bg-[#0f172a] px-1.5 py-0.5 rounded border border-[#334155]">ESC</span>
            <button onClick={onClose} className="text-slate-500 hover:text-white">
                <X size={20} />
            </button>
          </div>
        </div>

        {/* Results List */}
        <div className="max-h-[50vh] overflow-y-auto custom-scrollbar p-2" ref={listRef}>
           {!isConnected ? (
               <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-4">
                   <Database size={48} className="opacity-20" />
                   <p className="text-sm text-center">
                     Symbol Search requires a connected Database folder.<br />
                     Please select your <code>database</code> folder.
                   </p>
                   <button 
                     onClick={onConnectDatabase}
                     className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors flex items-center gap-2"
                   >
                     <FolderPlus size={16} />
                     Connect Database Folder
                   </button>
               </div>
           ) : files.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-500 gap-2">
                     <p>No CSV files found in the connected database folder.</p>
                     <button 
                        onClick={onConnectDatabase}
                        className="text-xs text-blue-400 hover:underline"
                    >
                        Change Folder
                    </button>
                </div>
           ) : filteredFiles.length === 0 ? (
               <div className="py-8 text-center text-slate-500 text-sm">
                   No results found for "{query}"
               </div>
           ) : (
               <div className="flex flex-col gap-1">
                   {filteredFiles.map((file, idx) => (
                       <button
                          key={idx}
                          onClick={() => { onFileSelect(file); onClose(); }}
                          className={`flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors group ${
                              idx === selectedIndex 
                              ? 'bg-blue-600 text-white' 
                              : 'text-slate-400 hover:bg-[#334155] hover:text-white'
                          }`}
                          onMouseEnter={() => setSelectedIndex(idx)}
                       >
                          <FileText size={18} className={idx === selectedIndex ? 'text-white' : 'text-slate-500 group-hover:text-blue-400'} />
                          <div className="flex-1 truncate">
                              <span className="font-medium">{file.name}</span>
                          </div>
                          {idx === selectedIndex && <CornerDownLeft size={16} className="opacity-50" />}
                       </button>
                   ))}
               </div>
           )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-[#0f172a] border-t border-[#334155] flex justify-between items-center text-[10px] text-slate-500">
            <span>{isConnected ? `${filteredFiles.length} items` : 'Database disconnected'}</span>
            <div className="flex gap-4">
                <span className="flex items-center gap-1">
                   <span className="bg-[#1e293b] px-1 rounded">↑↓</span> to navigate
                </span>
                <span className="flex items-center gap-1">
                   <span className="bg-[#1e293b] px-1 rounded">↵</span> to select
                </span>
            </div>
        </div>

      </div>
    </div>
  );
};
