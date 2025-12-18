
import React, { useRef, useState, useEffect } from 'react';
import { 
  Upload, 
  Settings, 
  Moon, 
  Sun,
  LineChart,
  CandlestickChart,
  Undo,
  Redo,
  Rewind,
  Briefcase,
  ChevronDown,
  List,
  Activity,
  Check,
  ChevronRight,
  Database,
  Palette,
  PaintBucket,
  Sliders,
  LayoutTemplate,
  Maximize,
  Columns2,
  Grid2x2,
  Save,
  Download,
  Plus,
  PenLine,
  History,
  Clock,
  ArrowRightLeft,
  Folder,
  Search,
  Trash2,
  Layers,
  CloudDownload
} from 'lucide-react';

interface ToolbarProps {
  onSearch?: () => void;
  onFileUpload: (file: File) => void;
  toggleTheme: () => void;
  isDark: boolean;
  onToggleIndicator: (key: string) => void;
  showSMA: boolean;
  showVolume: boolean;
  chartType: 'candlestick' | 'line' | 'area';
  onChartTypeChange: (type: 'candlestick' | 'line' | 'area') => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onToggleReplay: () => void;
  isReplayMode: boolean;
  onOpenIndicators?: () => void;
  onToggleWatchlist?: () => void;
  onToggleAdvancedReplay?: () => void;
  isAdvancedReplayMode?: boolean;
  onOpenLocalData?: () => void;
  onOpenOnlineData?: () => void;
  onLayoutAction?: (action: string) => void;
  onToggleTradingPanel?: () => void;
  isTradingPanelOpen?: boolean;
  isLibraryOpen?: boolean;
  onToggleLibrary?: () => void;
  onClearAll?: () => void;
  onToggleLayers?: () => void;
  isLayersOpen?: boolean;
  onOpenDownloadDialog?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onSearch,
  onFileUpload,
  toggleTheme,
  isDark,
  onToggleIndicator,
  showSMA,
  showVolume,
  chartType,
  onChartTypeChange,
  onUndo,
  onRedo,
  onToggleReplay,
  isReplayMode,
  onOpenIndicators,
  onToggleWatchlist,
  onToggleAdvancedReplay,
  isAdvancedReplayMode,
  onOpenLocalData,
  onOpenOnlineData,
  onLayoutAction,
  onToggleTradingPanel,
  isTradingPanelOpen,
  isLibraryOpen,
  onToggleLibrary,
  onClearAll,
  onToggleLayers,
  isLayersOpen,
  onOpenDownloadDialog
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const layoutMenuRef = useRef<HTMLDivElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(target)) {
        setIsToolsOpen(false);
      }
      if (layoutMenuRef.current && !layoutMenuRef.current.contains(target)) {
        setIsLayoutMenuOpen(false);
      }
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(target)) {
        setIsSettingsOpen(false);
      }
    };

    if (isToolsOpen || isLayoutMenuOpen || isSettingsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isToolsOpen, isLayoutMenuOpen, isSettingsOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileUpload(e.target.files[0]);
    }
  };

  const handleLayoutClick = (action: string) => {
    setIsLayoutMenuOpen(false);
    if (action === 'load-csv') {
      fileInputRef.current?.click();
    } else if (action === 'clear-drawings') {
      onClearAll?.();
    } else {
      onLayoutAction?.(action);
    }
  };

  return (
    <div className="flex items-center justify-between h-14 bg-[#1e293b] border-b border-[#334155] px-4">
      {/* Hidden Input for File Upload */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept=".csv,.txt"
        onChange={handleFileChange}
      />

      {/* Left Group: History, Chart Type, Tools */}
      <div className="flex items-center gap-4">
        
        <div className="flex items-center gap-1">
          <button 
            onClick={onSearch}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-[#334155] rounded transition-colors"
            title="Symbol Search"
          >
            <Search size={18} />
          </button>

          <button 
            onClick={onUndo}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-[#334155] rounded transition-colors"
            title="Undo"
          >
            <Undo size={18} />
          </button>
          <button 
            onClick={onRedo}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-[#334155] rounded transition-colors"
            title="Redo"
          >
            <Redo size={18} />
          </button>
          <button
            onClick={onToggleReplay}
            className={`p-1.5 rounded transition-all duration-200 ${
              isReplayMode 
                ? 'text-white bg-blue-600 shadow-md ring-1 ring-blue-400' 
                : 'text-slate-400 hover:text-white hover:bg-[#334155]'
            }`}
            title="Bar Replay"
          >
            <Rewind size={18} />
          </button>
          <button
            onClick={onToggleAdvancedReplay}
            className={`p-1.5 rounded transition-all duration-200 ${
              isAdvancedReplayMode 
                ? 'text-white bg-purple-600 shadow-md ring-1 ring-purple-400' 
                : 'text-purple-400 hover:text-purple-300 hover:bg-[#334155]'
            }`}
            title="Advanced Replay"
          >
            <Rewind size={18} />
          </button>
        </div>

        <div className="h-6 w-px bg-slate-700"></div>

        {/* Chart Type Selector */}
        <div className="flex items-center gap-1 bg-[#0f172a] p-1 rounded-lg">
          <button
            onClick={() => onChartTypeChange('candlestick')}
            className={`p-1.5 rounded transition-colors ${
              chartType === 'candlestick'
                ? 'bg-[#334155] text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Candlestick Chart"
          >
            <CandlestickChart size={18} />
          </button>
          <button
            onClick={() => onChartTypeChange('line')}
            className={`p-1.5 rounded transition-colors ${
              chartType === 'line'
                ? 'bg-[#334155] text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Line Chart"
          >
            <LineChart size={18} />
          </button>
        </div>

        {/* Trading Tools Menu */}
        <div className="relative" ref={toolsMenuRef}>
          <button
             onClick={() => setIsToolsOpen(!isToolsOpen)}
             className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                isToolsOpen ? 'bg-[#334155] text-white' : 'text-slate-400 hover:text-white hover:bg-[#334155]'
             }`}
          >
            <Briefcase size={16} />
            <span>Tools</span>
            <ChevronDown size={14} className={`transition-transform duration-200 ${isToolsOpen ? 'rotate-180' : ''}`} />
          </button>

          {isToolsOpen && (
            <div className="absolute top-full left-0 mt-2 w-56 bg-[#1e293b] border border-[#334155] rounded-md shadow-xl py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                {/* Watchlist */}
                 <button
                    onClick={() => { setIsToolsOpen(false); onToggleWatchlist?.(); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-[#334155] flex items-center gap-3 transition-colors"
                >
                    <List size={16} className="text-emerald-400" />
                    Watchlist
                </button>
                
                <div className="h-px bg-[#334155] my-1 mx-2"></div>

                 {/* Download Data */}
                 <button
                    onClick={() => { setIsToolsOpen(false); onOpenDownloadDialog?.(); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-[#334155] flex items-center gap-3 transition-colors"
                >
                    <CloudDownload size={16} className="text-sky-400" />
                    Download Data
                </button>

                <div className="h-px bg-[#334155] my-1 mx-2"></div>

                {/* Indicators Submenu */}
                <div className="relative group/indicators w-full">
                    <button
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-[#334155] flex items-center justify-between transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <Activity size={16} className="text-blue-400" />
                            <span>Indicators</span>
                        </div>
                        <ChevronRight size={14} />
                    </button>
                    
                    {/* Flyout */}
                    <div className="absolute left-full top-0 ml-1 w-48 bg-[#1e293b] border border-[#334155] rounded-md shadow-xl py-1 invisible opacity-0 transition-all duration-200 z-50 group-hover/indicators:visible group-hover/indicators:opacity-100 delay-300 group-hover/indicators:delay-0 before:content-[''] before:absolute before:-left-1 before:top-0 before:h-full before:w-1">
                        <button
                            onClick={() => onToggleIndicator('volume')}
                            className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-[#334155] flex items-center justify-between transition-colors"
                        >
                            <span>Volume</span>
                            {showVolume && <Check size={14} className="text-emerald-400" />}
                        </button>
                        <button
                            onClick={() => onToggleIndicator('sma')}
                            className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-[#334155] flex items-center justify-between transition-colors"
                        >
                            <span>SMA (20)</span>
                            {showSMA && <Check size={14} className="text-emerald-400" />}
                        </button>
                    </div>
                </div>
            </div>
          )}
        </div>

        {/* Data Explorer Button (Direct) */}
        <button
            onClick={onToggleLibrary}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded transition-colors ${
            isLibraryOpen ? 'bg-[#334155] text-white' : 'text-slate-400 hover:text-white hover:bg-[#334155]'
            }`}
        >
            <Database size={16} />
            <span>Data Explorer</span>
        </button>

        {/* Chart Layout Menu */}
        <div className="relative" ref={layoutMenuRef}>
          <button
             onClick={() => setIsLayoutMenuOpen(!isLayoutMenuOpen)}
             className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                isLayoutMenuOpen ? 'bg-[#334155] text-white' : 'text-slate-400 hover:text-white hover:bg-[#334155]'
             }`}
          >
            <LayoutTemplate size={16} />
            <span>Layout</span>
            <ChevronDown size={14} className={`transition-transform duration-200 ${isLayoutMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {isLayoutMenuOpen && (
            <div className="absolute top-full left-0 mt-2 w-56 bg-[#1e293b] border border-[#334155] rounded-md shadow-xl py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                {/* Full Chart */}
                <button 
                  onClick={() => handleLayoutClick('full')}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-[#334155] flex items-center gap-3 transition-colors"
                >
                    <Maximize size={16} className="text-slate-400" />
                    <span>Full Chart</span>
                </button>
                {/* Split 2x */}
                 <button 
                   onClick={() => handleLayoutClick('split-2x')}
                   className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-[#334155] flex items-center gap-3 transition-colors"
                 >
                    <Columns2 size={16} className="text-slate-400" />
                    <span>Split Chart 2x</span>
                </button>
                {/* Split 4x */}
                 <button 
                   onClick={() => handleLayoutClick('split-4x')}
                   className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-[#334155] flex items-center gap-3 transition-colors"
                 >
                    <Grid2x2 size={16} className="text-slate-400" />
                    <span>Split Chart 4x</span>
                </button>
                
                <div className="h-px bg-[#334155] my-1 mx-2"></div>

                 {/* Save Chart */}
                 <button 
                   onClick={() => handleLayoutClick('save')}
                   className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-[#334155] flex items-center gap-3 transition-colors"
                 >
                    <Save size={16} className="text-emerald-400" />
                    <span>Save Chart</span>
                </button>
                {/* Save as CSV */}
                 <button 
                   onClick={() => handleLayoutClick('save-csv')}
                   className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-[#334155] flex items-center gap-3 transition-colors"
                 >
                    <Download size={16} className="text-blue-400" />
                    <span>Save as CSV</span>
                </button>
                 {/* Load CSV */}
                 <button 
                   onClick={() => handleLayoutClick('load-csv')}
                   className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-[#334155] flex items-center gap-3 transition-colors"
                 >
                    <Upload size={16} className="text-amber-400" />
                    <span>Load CSV</span>
                </button>
                
                <div className="h-px bg-[#334155] my-1 mx-2"></div>

                {/* Remove All Drawings */}
                <button 
                   onClick={() => handleLayoutClick('clear-drawings')}
                   className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-red-400 hover:bg-red-900/10 flex items-center gap-3 transition-colors"
                 >
                    <Trash2 size={16} />
                    <span>Remove all drawings</span>
                </button>

                <div className="h-px bg-[#334155] my-1 mx-2"></div>
                
                {/* Create New Layout */}
                 <button 
                   onClick={() => handleLayoutClick('new')}
                   className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-[#334155] flex items-center gap-3 transition-colors"
                 >
                    <Plus size={16} className="text-slate-400" />
                    <span>Create new layout</span>
                </button>
                {/* Rename */}
                 <button 
                   onClick={() => handleLayoutClick('rename')}
                   className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-[#334155] flex items-center gap-3 transition-colors"
                 >
                    <PenLine size={16} className="text-slate-400" />
                    <span>Rename</span>
                </button>

                <div className="h-px bg-[#334155] my-1 mx-2"></div>

                {/* Recently Used */}
                 <div className="relative group/recent w-full">
                    <button className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-[#334155] flex items-center justify-between transition-colors">
                        <div className="flex items-center gap-3">
                            <History size={16} className="text-purple-400" />
                            <span>Recently used</span>
                        </div>
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Group: Settings */}
      <div className="flex items-center gap-3">
        {/* Layer Manager Toggle */}
        <button
          className={`p-2 rounded transition-colors ${
              isLayersOpen 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'text-slate-400 hover:text-white hover:bg-[#334155]'
          }`}
          title="Object Tree / Layers"
          onClick={onToggleLayers}
        >
          <Layers size={18} />
        </button>

        {/* Trade Icon */}
        <button
          className={`p-2 rounded transition-colors ${
              isTradingPanelOpen 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'text-slate-400 hover:text-white hover:bg-[#334155]'
          }`}
          title="Trade Panel"
          onClick={onToggleTradingPanel}
        >
          <ArrowRightLeft size={18} />
        </button>

        <div className="relative" ref={settingsMenuRef}>
            <button 
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className={`p-2 rounded transition-colors ${
                    isSettingsOpen ? 'bg-[#334155] text-white' : 'text-slate-400 hover:text-white hover:bg-[#334155]'
                }`}
                title="Settings"
            >
                <Settings size={18} />
            </button>
            
            {isSettingsOpen && (
                <div className="absolute top-full right-0 mt-2 w-56 bg-[#1e293b] border border-[#334155] rounded-md shadow-xl py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                    <div className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-[#0f172a]/50 border-b border-[#334155]">
                        Chart Settings
                    </div>
                    
                    {/* Theme Toggle Button Inside Menu */}
                    <button 
                        onClick={() => { toggleTheme(); setIsSettingsOpen(false); }} 
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-[#334155] flex items-center gap-3 transition-colors"
                    >
                        {isDark ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-purple-400" />}
                        <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
                    </button>

                    <button className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-[#334155] flex items-center gap-3 transition-colors">
                        <CandlestickChart size={16} className="text-blue-400" />
                        <span>Candles</span>
                    </button>

                    <button className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-[#334155] flex items-center gap-3 transition-colors">
                        <PaintBucket size={16} className="text-amber-400" />
                        <span>Background</span>
                    </button>

                    <button className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-[#334155] flex items-center gap-3 transition-colors">
                        <Sliders size={16} className="text-emerald-400" />
                        <span>Chart Styles</span>
                    </button>

                    <button className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-[#334155] flex items-center gap-3 transition-colors">
                        <Activity size={16} className="text-rose-400" />
                        <span>Bid & Ask Line</span>
                    </button>

                    <button className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-[#334155] flex items-center gap-3 transition-colors">
                        <Palette size={16} className="text-indigo-400" />
                        <span>Skins</span>
                    </button>

                    <button className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-[#334155] flex items-center gap-3 transition-colors">
                        <Clock size={16} className="text-teal-400" />
                        <span>Date and Time</span>
                    </button>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
