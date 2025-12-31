
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  X, 
  Folder, 
  Clock, 
  ChevronRight, 
  ChevronDown, 
  Star,
  Pin
} from 'lucide-react';
import { getBaseSymbolName } from '../utils/dataUtils';
import { Timeframe } from '../types';

interface AssetSymbol {
  name: string;
  files: any[];
  isFavorite: boolean;
}

interface AssetLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadAsset: (file: any, timeframe: Timeframe) => void;
  databasePath?: string; 
  files?: any[];
}

const InteractiveStar = ({ isFavorite, onClick }: { isFavorite: boolean, onClick: (e: React.MouseEvent) => void }) => (
  <button
    onClick={onClick}
    className={`
      absolute top-2 right-2 p-2 rounded-lg z-20 transition-all duration-300 ease-out
      hover:scale-110 active:scale-95 group/star
      ${isFavorite 
        ? 'text-amber-400 bg-amber-400/10 hover:bg-amber-400/20' 
        : 'text-slate-600 hover:text-amber-400 hover:bg-black/40 opacity-0 group-hover:opacity-100' // Only show empty star on hover
      }
    `}
    title={isFavorite ? "Unpin from favorites" : "Pin to favorites"}
  >
    <Star 
      size={16} 
      className={`transition-all duration-300 ${isFavorite ? "fill-amber-400 rotate-0" : "fill-transparent rotate-12"}`} 
      strokeWidth={isFavorite ? 2 : 2}
    />
  </button>
);

export const AssetLibrary: React.FC<AssetLibraryProps> = ({ 
  isOpen, 
  onClose, 
  onLoadAsset,
  databasePath,
  files = []
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(new Set());
  const [assets, setAssets] = useState<AssetSymbol[]>([]);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  
  // Local favorites persistence
  const [favorites, setFavorites] = useState<string[]>(() => {
      try {
          return JSON.parse(localStorage.getItem('redpill_asset_favorites') || '[]');
      } catch { return []; }
  });

  // Process files into assets whenever they change or dialog opens
  useEffect(() => {
    if (isOpen) {
        processFiles(files);
    }
  }, [isOpen, files, favorites]);

  const processFiles = (fileList: any[]) => {
      const grouped: Record<string, any[]> = {};
      
      fileList.forEach(f => {
          let base = getBaseSymbolName(f.name);
          if (!base || base.trim() === '') {
              base = 'Misc';
          }
          if (!grouped[base]) grouped[base] = [];
          grouped[base].push(f);
      });

      const processed: AssetSymbol[] = Object.entries(grouped).map(([name, assetFiles]) => ({
          name,
          files: assetFiles.sort((a, b) => a.name.localeCompare(b.name)),
          isFavorite: favorites.includes(name)
      }));
      
      setAssets(processed);
  };

  const handleToggleFavorite = (e: React.MouseEvent, assetName: string) => {
    e.stopPropagation(); // Stop propagation to prevent folder toggling
    
    let newFavs = [];
    if (favorites.includes(assetName)) {
        newFavs = favorites.filter(f => f !== assetName);
    } else {
        newFavs = [...favorites, assetName];
    }
    
    setFavorites(newFavs);
    localStorage.setItem('redpill_asset_favorites', JSON.stringify(newFavs));
  };

  // Logic: Sort (Hoist Favorites) and Filter
  const { pinnedAssets, unpinnedAssets } = useMemo(() => {
    let result = assets;

    // 1. Filter by Search
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(a => a.name.toLowerCase().includes(lower));
    }

    // 2. Filter by Favorites Toggle
    if (onlyFavorites) {
        result = result.filter(a => a.isFavorite);
    }

    // 3. Sort Alphabetically first
    result.sort((a, b) => a.name.localeCompare(b.name));

    // 4. Split into Pinned and Unpinned
    const pinned = result.filter(a => a.isFavorite);
    const unpinned = result.filter(a => !a.isFavorite);

    return { pinnedAssets: pinned, unpinnedAssets: unpinned };
  }, [assets, searchTerm, onlyFavorites]);

  const toggleExpand = (name: string) => {
    const next = new Set(expandedSymbols);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setExpandedSymbols(next);
  };

  // Helper renderer for Asset Card to avoid duplication
  const renderAssetCard = (asset: AssetSymbol) => {
      const isExpanded = expandedSymbols.has(asset.name);
      return (
        <div 
            key={asset.name} 
            className={`
                relative bg-[#1e293b] border rounded-xl overflow-hidden transition-all duration-300 ease-in-out group flex flex-col
                ${isExpanded ? 'border-blue-500/50 ring-1 ring-blue-500/20' : 'border-[#334155] hover:border-slate-500'}
                ${asset.isFavorite ? 'shadow-[0_0_15px_rgba(245,158,11,0.05)] border-amber-500/20' : ''}
                animate-in fade-in slide-in-from-bottom-2
            `}
        >
            <InteractiveStar 
                isFavorite={asset.isFavorite} 
                onClick={(e) => handleToggleFavorite(e, asset.name)} 
            />

            {/* Card Header */}
            <div 
                className={`p-4 cursor-pointer flex items-center justify-between select-none bg-gradient-to-br transition-colors duration-300 ${asset.isFavorite ? 'from-[#2a2418] to-[#1e293b]' : 'from-[#1e293b] to-[#0f172a]'}`}
                onClick={() => toggleExpand(asset.name)}
            >
                <div className="flex items-center gap-3 overflow-hidden pr-8">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg shrink-0 transition-colors duration-300 ${isExpanded ? 'bg-blue-600 text-white' : 'bg-[#334155] text-slate-300 group-hover:text-white'}`}>
                        {asset.name.substring(0, 1)}
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className={`font-bold truncate text-lg leading-tight transition-colors duration-300 ${asset.isFavorite ? 'text-amber-100' : 'text-slate-100'}`}>{asset.name}</span>
                        <span className="text-xs text-slate-500">{asset.files.length} timeframes</span>
                    </div>
                </div>
                
                {/* Chevron */}
                <div className="absolute bottom-3 right-3 text-slate-600 group-hover:text-slate-400 transition-colors">
                        {isExpanded ? <ChevronDown size={20} className="text-blue-400" /> : <ChevronRight size={20} />}
                </div>
            </div>

            {/* Expanded Content (Timeframes) */}
            {isExpanded && (
                <div className="border-t border-[#334155] bg-[#0f172a]/50 p-2 grid grid-cols-2 gap-2 animate-in slide-in-from-top-2 duration-150">
                    {asset.files.map((file, idx) => {
                        // Strip base symbol name to get timeframe, remove extension
                        let displayTF = file.name.replace(/\.(csv|txt)$/i, '');
                        if (asset.name !== 'Misc') {
                            displayTF = displayTF.replace(asset.name, '').replace(/^[_.-]+/, '').replace(/[_.-]+$/, '');
                        }
                        if (!displayTF) displayTF = 'Default';
                        
                        return (
                            <button
                                key={idx}
                                onClick={() => {
                                    onLoadAsset(file, displayTF as Timeframe); 
                                    onClose();
                                }}
                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#1e293b] hover:bg-blue-600 hover:text-white text-slate-300 border border-[#334155] transition-all group/btn text-left"
                                title={file.name}
                            >
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <Clock size={14} className="text-slate-500 group-hover/btn:text-white/70 shrink-0" />
                                    <span className="font-mono text-sm font-bold truncate">{displayTF}</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
      );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-5xl h-[85vh] bg-[#0f172a] border border-[#334155] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-[#334155] bg-[#1e293b]">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <Folder className="text-blue-500 fill-blue-500/20" size={28} />
              Asset Library
            </h2>
            <p className="text-slate-400 text-sm">
              {assets.length} symbols found in {databasePath ? 'database' : 'file list'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-[#334155] hover:bg-[#475569] rounded-full text-slate-300 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Search & Toolbar */}
        <div className="px-8 py-4 border-b border-[#334155] bg-[#0f172a] flex items-center gap-4">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-4 top-3.5 text-slate-500" size={20} />
            <input 
              type="text" 
              placeholder="Search symbols (e.g. BTC, ETH, SPX)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#1e293b] border border-[#334155] rounded-xl py-3 pl-12 pr-4 text-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all"
              autoFocus
            />
          </div>
          
          <button
            onClick={() => setOnlyFavorites(!onlyFavorites)}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-all ${onlyFavorites ? 'bg-amber-500/10 border-amber-500/50 text-amber-400' : 'bg-[#1e293b] border-[#334155] text-slate-400 hover:text-white'}`}
          >
             <Star size={18} className={onlyFavorites ? "fill-current" : ""} />
             <span className="font-bold text-sm">Favorites Only</span>
          </button>
        </div>

        {/* Content Grid */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#0b0f19]">
          {pinnedAssets.length === 0 && unpinnedAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 opacity-50">
              <Folder size={64} className="mb-4" />
              <p className="text-lg font-medium">No assets found</p>
            </div>
          ) : (
            <div className="space-y-8">
                
                {/* 1. Favorites Section */}
                {pinnedAssets.length > 0 && (
                    <div>
                        <div className="flex items-center gap-3 mb-4 px-2 text-amber-500/80">
                            <Pin size={16} className="fill-current" />
                            <span className="text-xs font-bold uppercase tracking-widest">Pinned Favorites</span>
                            <div className="h-px bg-amber-900/30 flex-1"></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 align-start">
                            {pinnedAssets.map(renderAssetCard)}
                        </div>
                    </div>
                )}

                {/* 2. All Symbols Section */}
                {unpinnedAssets.length > 0 && (
                    <div>
                        {pinnedAssets.length > 0 && (
                            <div className="flex items-center gap-3 mb-4 mt-8 px-2 text-slate-500">
                                <Folder size={16} />
                                <span className="text-xs font-bold uppercase tracking-widest">All Symbols</span>
                                <div className="h-px bg-[#334155] flex-1"></div>
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 align-start">
                            {unpinnedAssets.map(renderAssetCard)}
                        </div>
                    </div>
                )}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-8 py-3 bg-[#1e293b] border-t border-[#334155] text-xs text-slate-500 flex justify-between">
            <span>Select a timeframe to Quick-Load the chart.</span>
            <span>ESC to close</span>
        </div>
      </div>
    </div>
  );
};
