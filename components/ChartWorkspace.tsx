
import React, { useMemo, useEffect, useState, useRef } from 'react';
import { FinancialChart } from './Chart';
import { ReplayControls } from './ReplayControls';
import { DrawingToolbar } from './DrawingToolbar';
import { BottomPanel } from './BottomPanel';
import { LayersPanel } from './LayersPanel';
import { RecentMarketDataPanel } from './MarketStats';
import { TabSession, Timeframe, DrawingProperties, Drawing, Folder, Trade } from '../types';
import { calculateSMA, getTimeframeDuration } from '../utils/dataUtils';
import { ALL_TOOLS_LIST, COLORS } from '../constants';
import { GripVertical, Settings, Check, Folder as FolderIcon, Lock, CheckCircle2, Link as LinkIcon } from 'lucide-react';
import { GlobalErrorBoundary } from './GlobalErrorBoundary';
import { useTradePersistence } from '../hooks/useTradePersistence';
import { loadUILayout, saveUILayout } from '../utils/storage';

interface ChartWorkspaceProps {
  tab: TabSession;
  updateTab: (updates: Partial<TabSession>) => void;
  onTimeframeChange: (tf: Timeframe) => void;
  loading?: boolean;
  favoriteTools?: string[];
  onSelectTool?: (id: string) => void;
  activeToolId?: string;
  isFavoritesBarVisible?: boolean;
  onSaveHistory?: () => void;
  onRequestHistory?: () => void;
  
  areDrawingsLocked?: boolean;
  isMagnetMode?: boolean;
  isStayInDrawingMode?: boolean;
  isLayersPanelOpen?: boolean;
  onToggleLayers?: () => void;
  isSyncing?: boolean;
  
  onVisibleRangeChange?: (range: { from: number; to: number }) => void;
  
  favoriteTimeframes?: string[];
  onBackToLibrary?: () => void;

  isDrawingSyncEnabled?: boolean;
  onToggleDrawingSync?: () => void;

  // New props for global drawing state
  drawings: Drawing[];
  onUpdateDrawings: (newDrawings: Drawing[]) => void;
  isHydrating: boolean;

  // Master Sync
  isMasterSyncActive?: boolean;
  onToggleMasterSync?: () => void;
}

export const ChartWorkspace: React.FC<ChartWorkspaceProps> = ({ 
  tab, 
  updateTab, 
  onTimeframeChange,
  loading = false,
  favoriteTools = [],
  onSelectTool,
  activeToolId,
  isFavoritesBarVisible = true,
  onSaveHistory,
  onRequestHistory,
  areDrawingsLocked = false,
  isMagnetMode = false,
  isStayInDrawingMode = false,
  isLayersPanelOpen = false,
  onToggleLayers,
  isSyncing = false,
  onVisibleRangeChange,
  favoriteTimeframes,
  onBackToLibrary,
  isDrawingSyncEnabled = true,
  drawings,
  onUpdateDrawings,
  isHydrating,
  isMasterSyncActive,
  onToggleMasterSync
}) => {
  // Trade Persistence Hook - Remains local to the workspace context, keyed by file/source ID
  const tradeSourceId = tab.filePath || `${tab.title}_${tab.timeframe}`;
  const { trades } = useTradePersistence(tradeSourceId);

  // Sync loaded trades to Tab state so BottomPanel can see them
  useEffect(() => {
      if (trades && trades.length > 0) {
          if (trades.length !== (tab.trades || []).length) {
             updateTab({ trades });
          }
      }
  }, [trades, updateTab, tab.trades]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [isChartSettingsOpen, setIsChartSettingsOpen] = useState(false);
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  
  // Selection State
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [selectedDrawingIds, setSelectedDrawingIds] = useState<Set<string>>(new Set());
  
  // Focus Logic for Trade Navigation
  const [focusTimestamp, setFocusTimestamp] = useState<number | null>(null);

  const [defaultDrawingProperties, setDefaultDrawingProperties] = useState<DrawingProperties>({
    color: COLORS.line,
    lineWidth: 2,
    lineStyle: 'solid',
    filled: false,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    visible: true,
    locked: false,
    smoothing: 0 
  });
  const workspaceRef = useRef<HTMLDivElement>(null);

  // Visual Confirmation State (Mandate 0.32)
  const [showLoadToast, setShowLoadToast] = useState(false);
  const prevHydrating = useRef(isHydrating);

  // Trigger Toast when hydration finishes and drawings exist
  useEffect(() => {
      if (prevHydrating.current && !isHydrating && drawings.length > 0) {
          setShowLoadToast(true);
          const timer = setTimeout(() => setShowLoadToast(false), 3000);
          return () => clearTimeout(timer);
      }
      prevHydrating.current = isHydrating;
  }, [isHydrating, drawings.length]);

  useEffect(() => {
    const handleLockAll = () => {
        onSaveHistory?.();
        const areAllCurrentlyLocked = drawings.length > 0 && drawings.every(d => d.properties.locked);
        onUpdateDrawings(drawings.map(d => ({ ...d, properties: { ...d.properties, locked: !areAllCurrentlyLocked } })));
    };
    const handleHideAll = () => {
        onSaveHistory?.();
        const areAllCurrentlyHidden = drawings.length > 0 && drawings.every(d => !(d.properties.visible ?? true));
        onUpdateDrawings(drawings.map(d => ({ ...d, properties: { ...d.properties, visible: areAllCurrentlyHidden } })));
    };
    window.addEventListener('redpill-lock-all', handleLockAll);
    window.addEventListener('redpill-hide-all', handleHideAll);
    return () => {
        window.removeEventListener('redpill-lock-all', handleLockAll);
        window.removeEventListener('redpill-hide-all', handleHideAll);
    };
  }, [drawings, onUpdateDrawings, onSaveHistory]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentDate(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
            setIsChartSettingsOpen(false);
        }
    };
    if (isChartSettingsOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isChartSettingsOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            if (activeToolId && activeToolId !== 'cross') onSelectTool?.('cross');
            else if (selectedDrawingId) {
                setSelectedDrawingId(null);
                setSelectedDrawingIds(new Set());
            }
        }
        
        // Mandate 4.5: Inversion Hotkey (Alt + I)
        if (e.altKey && (e.key === 'i' || e.key === 'I')) {
            e.preventDefault();
            // Toggle Inversion via Config
            updateTab({ config: { ...tab.config, invertScale: !tab.config.invertScale } });
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeToolId, selectedDrawingId, onSelectTool, tab.config, updateTab]);
  
  const displayedData = useMemo(() => {
    if (tab.isReplaySelecting) return tab.data;
    if (tab.isReplayMode || tab.isAdvancedReplayMode) {
        const safeIndex = Math.max(0, tab.replayIndex);
        return tab.data.slice(0, safeIndex + 1);
    }
    return tab.data;
  }, [tab.data, tab.isReplayMode, tab.isAdvancedReplayMode, tab.replayIndex, tab.isReplaySelecting]);

  const smaData = useMemo(() => {
    if (!tab.config.showSMA) return [];
    return calculateSMA(displayedData, tab.config.smaPeriod);
  }, [displayedData, tab.config.showSMA, tab.config.smaPeriod]);

  const currentPrice = useMemo(() => {
      if (displayedData.length === 0) return 0;
      return displayedData[displayedData.length - 1].close;
  }, [displayedData]);

  const prevPrice = displayedData.length > 1 ? displayedData[displayedData.length - 2].close : currentPrice;
  const priceChange = currentPrice - prevPrice;
  const percentChange = prevPrice !== 0 ? (priceChange / prevPrice) * 100 : 0;
  const isUp = priceChange >= 0;

  const [headerPos, setHeaderPos] = useState({ x: 16, y: 16 });
  const isDraggingHeader = useRef(false);
  const headerDragStart = useRef({ x: 0, y: 0 });
  const headerStartPos = useRef({ x: 0, y: 0 });

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    isDraggingHeader.current = true;
    headerDragStart.current = { x: e.clientX, y: e.clientY };
    headerStartPos.current = { ...headerPos };
    e.preventDefault();
    const win = (e.view as unknown as Window) || window;
    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingHeader.current) return;
      const dx = ev.clientX - headerDragStart.current.x;
      const dy = ev.clientY - headerDragStart.current.y;
      setHeaderPos({ x: Math.max(0, headerStartPos.current.x + dx), y: Math.max(0, headerStartPos.current.y + dy) });
    };
    const handleMouseUp = () => {
      isDraggingHeader.current = false;
      win.removeEventListener('mousemove', handleMouseMove);
      win.removeEventListener('mouseup', handleMouseUp);
    };
    win.addEventListener('mousemove', handleMouseMove);
    win.addEventListener('mouseup', handleMouseUp);
  };

  const [favBarPos, setFavBarPos] = useState({ x: 0, y: 0 });
  const favBarRef = useRef<HTMLDivElement>(null);
  const isDraggingFav = useRef(false);
  const favDragStart = useRef({ x: 0, y: 0 });
  const favStartPos = useRef({ x: 0, y: 0 });
  
  useEffect(() => {
    if (favBarRef.current && favBarPos.x === 0 && favBarPos.y === 0) {
        setFavBarPos({ x: window.innerWidth / 2 - favBarRef.current.clientWidth / 2, y: window.innerHeight - 150 });
    }
  }, [favoriteTools, favBarPos.x, favBarPos.y]);

  const handleFavMouseDown = (e: React.MouseEvent) => {
    isDraggingFav.current = true;
    favDragStart.current = { x: e.clientX, y: e.clientY };
    favStartPos.current = { ...favBarPos };
    e.preventDefault();
    e.stopPropagation();
    const win = (e.view as unknown as Window) || window;
    const el = favBarRef.current;
    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingFav.current || !el) return;
      const dx = ev.clientX - favDragStart.current.x;
      const dy = ev.clientY - favDragStart.current.y;
      el.style.left = `${favStartPos.current.x + dx}px`;
      el.style.top = `${favStartPos.current.y + dy}px`;
    };
    const handleMouseUp = (ev: MouseEvent) => {
      isDraggingFav.current = false;
      win.removeEventListener('mousemove', handleMouseMove);
      win.removeEventListener('mouseup', handleMouseUp);
      if (el) setFavBarPos({ x: favStartPos.current.x + (ev.clientX - favDragStart.current.x), y: favStartPos.current.y + (ev.clientY - favDragStart.current.y) });
    };
    win.addEventListener('mousemove', handleMouseMove);
    win.addEventListener('mouseup', handleMouseUp);
  };

  const [replayPos, setReplayPos] = useState({ x: 0, y: 0 });
  const isDraggingReplay = useRef(false);
  const replayDragStart = useRef({ x: 0, y: 0 });
  const replayStartPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if ((tab.isReplayMode || tab.isAdvancedReplayMode) && replayPos.x === 0 && replayPos.y === 0) {
        setReplayPos({ x: window.innerWidth / 2 - 160, y: window.innerHeight - 200 });
    }
  }, [tab.isReplayMode, tab.isAdvancedReplayMode, replayPos.x, replayPos.y]);

  const handleReplayMouseDown = (e: React.MouseEvent) => {
    isDraggingReplay.current = true;
    replayDragStart.current = { x: e.clientX, y: e.clientY };
    replayStartPos.current = { ...replayPos };
    e.preventDefault();
    const win = (e.view as unknown as Window) || window;
    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingReplay.current) return;
      setReplayPos({ x: replayStartPos.current.x + (ev.clientX - replayDragStart.current.x), y: replayStartPos.current.y + (ev.clientY - replayDragStart.current.y) });
    };
    const handleMouseUp = () => {
      isDraggingReplay.current = false;
      win.removeEventListener('mousemove', handleMouseMove);
      win.removeEventListener('mouseup', handleMouseUp);
    };
    win.addEventListener('mousemove', handleMouseMove);
    win.addEventListener('mouseup', handleMouseUp);
  };

  // --- MANDATE 3.1: PERSISTENT DRAWING TOOLBAR ---
  const [toolbarPos, setToolbarPos] = useState({ x: -1, y: -1 }); // -1 indicates uninitialized
  const isDraggingToolbar = useRef(false);
  const toolbarDragStart = useRef({ x: 0, y: 0 });
  const toolbarStartPos = useRef({ x: 0, y: 0 });
  const isToolbarVisible = !!(selectedDrawingId !== null || (activeToolId && activeToolId !== 'cross' && activeToolId !== 'cursor'));

  // Initialize toolbar position from storage
  useEffect(() => {
      loadUILayout().then(layout => {
          if (layout && layout.toolbarPos) {
              setToolbarPos(layout.toolbarPos);
          } else {
              // Default: Top-Center
              setToolbarPos({ x: window.innerWidth / 2 - 150, y: 60 });
          }
      });
  }, []);

  const handleToolbarMouseDown = (e: React.MouseEvent) => {
    isDraggingToolbar.current = true;
    toolbarDragStart.current = { x: e.clientX, y: e.clientY };
    toolbarStartPos.current = { ...toolbarPos };
    e.preventDefault();
    e.stopPropagation();
    const win = (e.view as unknown as Window) || window;
    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingToolbar.current) return;
      setToolbarPos({ x: toolbarStartPos.current.x + (ev.clientX - toolbarDragStart.current.x), y: toolbarStartPos.current.y + (ev.clientY - toolbarDragStart.current.y) });
    };
    const handleMouseUp = (ev: MouseEvent) => {
      isDraggingToolbar.current = false;
      win.removeEventListener('mousemove', handleMouseMove);
      win.removeEventListener('mouseup', handleMouseUp);
      
      // Save new position
      const newPos = { 
          x: toolbarStartPos.current.x + (ev.clientX - toolbarDragStart.current.x), 
          y: toolbarStartPos.current.y + (ev.clientY - toolbarDragStart.current.y) 
      };
      saveUILayout({ toolbarPos: newPos });
    };
    win.addEventListener('mousemove', handleMouseMove);
    win.addEventListener('mouseup', handleMouseUp);
  };

  const [layersPanelPos, setLayersPanelPos] = useState({ x: 0, y: 0 });
  const isDraggingLayers = useRef(false);
  const layersDragStart = useRef({ x: 0, y: 0 });
  const layersStartPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (isLayersPanelOpen && layersPanelPos.x === 0 && layersPanelPos.y === 0) {
       setLayersPanelPos({ x: window.innerWidth - 320, y: 100 });
    }
  }, [isLayersPanelOpen, layersPanelPos.x, layersPanelPos.y]);

  const handleLayersMouseDown = (e: React.MouseEvent) => {
    isDraggingLayers.current = true;
    layersDragStart.current = { x: e.clientX, y: e.clientY };
    layersStartPos.current = { ...layersPanelPos };
    e.preventDefault();
    const win = (e.view as unknown as Window) || window;
    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingLayers.current) return;
      setLayersPanelPos({ x: layersStartPos.current.x + (ev.clientX - layersDragStart.current.x), y: layersStartPos.current.y + (ev.clientY - layersDragStart.current.y) });
    };
    const handleMouseUp = () => {
      isDraggingLayers.current = false;
      win.removeEventListener('mousemove', handleMouseMove);
      win.removeEventListener('mouseup', handleMouseUp);
    };
    win.addEventListener('mousemove', handleMouseMove);
    win.addEventListener('mouseup', handleMouseUp);
  };

  const handleDrawingPropertyChange = (updates: Partial<DrawingProperties>) => {
    if (selectedDrawingId) {
      onSaveHistory?.();
      const newDrawings = drawings.map(d => d.id === selectedDrawingId ? { ...d, properties: { ...d.properties, ...updates } } : d);
      onUpdateDrawings(newDrawings);
      setDefaultDrawingProperties((prev: any) => ({ ...prev, ...updates }));
    } else {
      setDefaultDrawingProperties((prev: any) => ({ ...prev, ...updates }));
    }
  };

  const deleteSelectedDrawing = () => {
    if (selectedDrawingId) {
      onSaveHistory?.();
      const newDrawings = drawings.filter(d => !selectedDrawingIds.has(d.id));
      onUpdateDrawings(newDrawings);
      setSelectedDrawingId(null);
      setSelectedDrawingIds(new Set());
    }
  };

  const handleReplayPointSelect = (timeInMs: number) => {
      if (!tab.isReplaySelecting) return;
      let idx = tab.data.findIndex((d: any) => d.time >= timeInMs);
      if (idx === -1) idx = tab.data.length - 1;
      updateTab({
          isReplaySelecting: false,
          isReplayMode: tab.isAdvancedReplayMode ? false : true, 
          isAdvancedReplayMode: tab.isAdvancedReplayMode,
          replayIndex: idx,
          replayGlobalTime: tab.data[idx].time,
          simulatedPrice: tab.data[idx].open,
          isReplayPlaying: false
      });
  };
  
  const handleReplaySync = (index: number, time: number, price: number) => {
      updateTab({
          replayIndex: index,
          replayGlobalTime: time,
          simulatedPrice: price
      });
  };

  const handleToolComplete = () => {
      if (!isStayInDrawingMode) onSelectTool?.('cross');
  };

  const handleSelectDrawing = (id: string | null, e?: React.MouseEvent) => {
    const isMultiSelect = e?.ctrlKey || e?.metaKey;

    if (id) {
        if (isMultiSelect) {
            const newSet = new Set(selectedDrawingIds);
            if (newSet.has(id)) {
                newSet.delete(id);
                // If we deselected the primary, set primary to the last one available
                if (id === selectedDrawingId) {
                    const asArray = Array.from(newSet);
                    setSelectedDrawingId(asArray.length > 0 ? asArray[asArray.length - 1] : null);
                }
            } else {
                newSet.add(id);
                setSelectedDrawingId(id); // Newly clicked becomes primary for toolbar
            }
            setSelectedDrawingIds(newSet);
        } else {
            // Normal click - replace selection
            setSelectedDrawingId(id);
            setSelectedDrawingIds(new Set([id]));
        }
    } else {
        // Deselect all
        setSelectedDrawingId(null);
        setSelectedDrawingIds(new Set());
    }
    
    // MANDATE 3.1: REMOVED AUTO-POSITIONING LOGIC
    // The bar stays in its persisted 'Sticky' position.
  };

  const activeProperties = useMemo(() => {
    if (selectedDrawingId) {
      const drawing = drawings.find(d => d.id === selectedDrawingId);
      return drawing?.properties ?? defaultDrawingProperties;
    }
    return defaultDrawingProperties;
  }, [selectedDrawingId, drawings, defaultDrawingProperties]);
  
  const selectedDrawingType = useMemo(() => {
      if (selectedDrawingId) return drawings.find(d => d.id === selectedDrawingId)?.type;
      return activeToolId; 
  }, [selectedDrawingId, drawings, activeToolId]);

  const chartComponentKey = useMemo(() => {
      return `${tab.id}-${tab.filePath || 'local'}-${tab.title}-${tab.timeframe}`;
  }, [tab.id, tab.filePath, tab.title, tab.timeframe]);

  // Handler for Trade Click
  const handleTradeClick = (trade: Trade) => {
      // Set the focus timestamp to trigger chart scroll
      setFocusTimestamp(trade.timestamp);
      // Reset immediately so subsequent clicks on same timestamp work (if needed)
      // Actually, standard react state update handles change, but if same trade is clicked, effect might not re-run.
      // We'll rely on timestamp change or force update if needed.
  };

  return (
    <div ref={workspaceRef} className="flex-1 flex flex-col relative min-w-0 h-full bg-[#0f172a]">
        <div onMouseDown={handleHeaderMouseDown} style={{ left: headerPos.x, top: headerPos.y }} className="absolute z-20 bg-[#1e293b]/90 backdrop-blur-sm px-4 py-2 rounded border border-slate-700 shadow-lg flex items-center gap-4 cursor-move select-none transition-shadow hover:shadow-xl hover:ring-1 hover:ring-slate-600/50">
          
          {/* Mandate 0.3: Source Protected Indicator */}
          <div className="flex items-center gap-1.5 mr-3 px-2 py-0.5 bg-[#0f172a]/50 rounded border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)] group/lock cursor-help transition-all hover:bg-emerald-900/20" title="Source Protected: Read-Only Mode. The original file on disk is never modified.">
              <Lock size={10} className="text-emerald-500" />
              <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest opacity-70 group-hover/lock:opacity-100 transition-opacity hidden sm:block">Secure</span>
          </div>

          <h1 className="text-sm font-bold text-white tracking-wide truncate max-w-[150px]">{tab.title}</h1>
          <div className="h-4 w-px bg-slate-600"></div>
          <div className="flex items-center gap-0.5">
              {Object.values(Timeframe)
                .filter(tf => !favoriteTimeframes || (favoriteTimeframes as any).includes(tf))
                .map((tf) => (
              <button key={String(tf)} onClick={() => onTimeframeChange(tf as any)} className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${tab.timeframe === tf ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-[#334155]'}`}>
                  {String(tf)}
              </button>
              ))}
          </div>
          <div className="h-4 w-px bg-slate-600"></div>
          <div className="flex items-baseline gap-3">
              <span className={`text-sm font-mono font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>{currentPrice.toFixed(2)}</span>
              <span className={`text-xs font-medium ${isUp ? 'text-emerald-500' : 'text-red-500'}`}>{priceChange > 0 ? '+' : ''}{priceChange.toFixed(2)} ({percentChange.toFixed(2)}%)</span>
          </div>
          <div className="h-4 w-px bg-slate-600"></div>
          <div className="text-[10px] text-slate-400">Vol: <span className="text-slate-300 font-mono">{displayedData.length > 0 ? displayedData[displayedData.length - 1].volume.toFixed(0) : 0}</span></div>
          
          {/* Mandate 4.5: Inversion Badge */}
          {tab.config.invertScale && (
              <>
                <div className="h-4 w-px bg-slate-600"></div>
                <span className="text-[9px] font-bold bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded border border-orange-500/30 uppercase tracking-wider animate-pulse" title="Chart Scale Inverted (Alt+I)">
                    Inverted
                </span>
              </>
          )}

          <div className="h-4 w-px bg-slate-600"></div>
          {onToggleMasterSync && (
              <button 
                  onClick={onToggleMasterSync}
                  className={`p-1 rounded transition-colors ${isMasterSyncActive ? 'text-blue-400 bg-blue-400/10 shadow-[0_0_10px_rgba(59,130,246,0.3)] ring-1 ring-blue-500/30' : 'text-slate-400 hover:text-white hover:bg-[#334155]'}`}
                  title={isMasterSyncActive ? "Master Sync Active (All charts follow)" : "Enable Master Sync"}
                  onMouseDown={(e) => e.stopPropagation()}
              >
                  <LinkIcon size={14} className={isMasterSyncActive ? "fill-current" : ""} />
              </button>
          )}
          
          <div className="relative" ref={settingsRef}>
             <button onClick={(e) => { e.stopPropagation(); setIsChartSettingsOpen(!isChartSettingsOpen); }} className="p-1 hover:bg-[#334155] rounded text-slate-400 hover:text-white transition-colors" title="Chart Settings" onMouseDown={(e) => e.stopPropagation()}><Settings size={14} /></button>
             {isChartSettingsOpen && (
                <div className="absolute top-full right-0 mt-2 w-48 bg-[#1e293b] border border-[#334155] rounded-md shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100" onMouseDown={(e) => e.stopPropagation()}>
                   <div className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-[#0f172a]/50 border-b border-[#334155]">Price Scale</div>
                   <button onClick={() => updateTab({ config: { ...tab.config, priceScaleMode: 'linear' } })} className="w-full text-left px-4 py-2 text-xs text-slate-400 hover:text-white hover:bg-[#334155] flex items-center justify-between"><span>Linear</span>{(tab.config.priceScaleMode === 'linear' || !tab.config.priceScaleMode) && <Check size={12} className="text-blue-400" />}</button>
                   <button onClick={() => updateTab({ config: { ...tab.config, priceScaleMode: 'logarithmic' } })} className="w-full text-left px-4 py-2 text-xs text-slate-400 hover:text-white hover:bg-[#334155] flex items-center justify-between"><span>Logarithmic</span>{tab.config.priceScaleMode === 'logarithmic' && <Check size={12} className="text-blue-400" />}</button>
                   <button onClick={() => updateTab({ config: { ...tab.config, priceScaleMode: 'percentage' } })} className="w-full text-left px-4 py-2 text-xs text-slate-400 hover:text-white hover:bg-[#334155] flex items-center justify-between"><span>Percentage</span>{tab.config.priceScaleMode === 'percentage' && <Check size={12} className="text-blue-400" />}</button>
                   <div className="h-px bg-[#334155] my-1 mx-2"></div>
                   <button onClick={() => updateTab({ config: { ...tab.config, autoScale: !tab.config.autoScale } })} className="w-full text-left px-4 py-2 text-xs text-slate-400 hover:text-white hover:bg-[#334155] flex items-center justify-between"><span>Auto Scale</span>{(tab.config.autoScale !== false) && <Check size={12} className="text-emerald-400" />}</button>
                   {/* Mandate 4.5: Inversion Toggle */}
                   <button onClick={() => updateTab({ config: { ...tab.config, invertScale: !tab.config.invertScale } })} className="w-full text-left px-4 py-2 text-xs text-slate-400 hover:text-white hover:bg-[#334155] flex items-center justify-between">
                       <span>Invert Scale (Alt+I)</span>
                       {tab.config.invertScale && <Check size={12} className="text-orange-400" />}
                   </button>
                </div>
             )}
          </div>
          {onBackToLibrary && (
              <>
                <div className="h-4 w-px bg-slate-600"></div>
                <button 
                    onClick={onBackToLibrary}
                    className="p-1 hover:bg-[#334155] rounded text-slate-400 hover:text-red-400 transition-colors"
                    title="Back to Library (Closes Chart)"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <FolderIcon size={14} />
                </button>
              </>
          )}
          
          {/* Visual Confirmation: Drawings Loaded */}
          {showLoadToast && (
              <div className="absolute top-12 left-4 z-50 bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 px-3 py-1.5 rounded-full text-xs font-bold animate-in fade-in slide-in-from-top-2 flex items-center gap-2 backdrop-blur-sm shadow-lg shadow-emerald-900/20">
                  <CheckCircle2 size={12} />
                  <span>Drawings Loaded</span>
              </div>
          )}
        </div>
        {isFavoritesBarVisible && favoriteTools.length > 0 && (
            <div ref={favBarRef} onMouseDown={handleFavMouseDown} style={{ left: favBarPos.x, top: favBarPos.y }} className="absolute z-30 bg-[#1e293b] border border-[#334155] rounded-full shadow-xl shadow-black/50 backdrop-blur-md flex items-center p-1 gap-1 cursor-move animate-in fade-in zoom-in-95 duration-200">
                <div className="pl-2 pr-1 text-slate-500 cursor-move hover:text-slate-300 transition-colors"><GripVertical size={14} /></div>
                <div className="w-px h-4 bg-[#334155] mx-1"></div>
                {favoriteTools.map(toolId => {
                    const tool = ALL_TOOLS_LIST.find((t: any) => t.id === toolId);
                    if (!tool) return null;
                    return (
                        <button key={toolId} onClick={(e) => { e.stopPropagation(); onSelectTool?.(toolId); }} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${activeToolId === toolId ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-[#334155]'}`} onMouseDown={(e) => e.stopPropagation()} title={tool.label}><tool.icon size={18} /></button>
                    );
                })}
            </div>
        )}
        <DrawingToolbar isVisible={isToolbarVisible} properties={activeProperties} onChange={handleDrawingPropertyChange} onDelete={deleteSelectedDrawing} isSelection={selectedDrawingId !== null} position={toolbarPos.x !== -1 ? toolbarPos : undefined} onDragStart={handleToolbarMouseDown} drawingType={selectedDrawingType} />
        {isLayersPanelOpen && (
            <LayersPanel 
                drawings={drawings} 
                onUpdateDrawings={(newDrawings: any) => { onSaveHistory?.(); onUpdateDrawings(newDrawings); }} 
                selectedDrawingIds={selectedDrawingIds}
                onSelectDrawing={handleSelectDrawing} 
                onClose={onToggleLayers || (() => {})} 
                position={layersPanelPos.x !== 0 ? layersPanelPos : undefined} 
                onHeaderMouseDown={handleLayersMouseDown} 
                folders={tab.folders}
                onUpdateFolders={(folders: Folder[]) => updateTab({ folders })}
                sourceId={tab.sourceId}
            />
        )}
        {(tab.isReplayMode || tab.isAdvancedReplayMode) && (
            <ReplayControls 
              isPlaying={tab.isReplayPlaying} 
              onPlayPause={() => updateTab({ isReplayPlaying: !tab.isReplayPlaying })} 
              onStepForward={() => {
                if (tab.isReplayMode) {
                   const nextIndex = Math.min(tab.data.length - 1, tab.replayIndex + 1);
                   updateTab({ replayIndex: nextIndex, replayGlobalTime: tab.data[nextIndex].time, simulatedPrice: tab.data[nextIndex].close });
                } else {
                    const nextTime = (tab.replayGlobalTime || tab.data[tab.replayIndex].time) + getTimeframeDuration(tab.timeframe);
                    let nextIndex = tab.data.findIndex((d: any) => d.time >= nextTime);
                    if (nextIndex === -1) nextIndex = tab.data.length - 1;
                    updateTab({ replayIndex: nextIndex, replayGlobalTime: tab.data[nextIndex].time, simulatedPrice: tab.data[nextIndex].open });
                }
              }} 
              onReset={() => {
                const newIdx = Math.max(0, tab.data.length - 100);
                updateTab({ replayIndex: newIdx, replayGlobalTime: tab.data[newIdx].time, simulatedPrice: tab.data[newIdx].open })
              }} 
              onClose={() => updateTab({ isReplayMode: false, isAdvancedReplayMode: false, isReplayPlaying: false, simulatedPrice: null, replayGlobalTime: null })} 
              speed={tab.replaySpeed} 
              onSpeedChange={(speed: any) => updateTab({ replaySpeed: speed })} 
              progress={tab.data.length > 0 ? (tab.replayIndex / (tab.data.length - 1)) * 100 : 0} 
              position={replayPos.x !== 0 ? replayPos : undefined} 
              onHeaderMouseDown={handleReplayMouseDown} 
            />
        )}
        {tab.isReplaySelecting && <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-blue-600 text-white px-4 py-2 rounded shadow-lg text-sm font-bold animate-pulse pointer-events-none">Click on the chart to start {tab.isAdvancedReplayMode ? 'advanced' : ''} replay</div>}
        <div className="flex-1 w-full relative overflow-hidden">
        {(loading || isHydrating) && <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0f172a]/80 backdrop-blur-sm"><div className="flex flex-col items-center gap-2"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div><div className="text-blue-400 font-medium">{isHydrating ? 'Loading Layout...' : 'Processing Data...'}</div></div></div>}
        <FinancialChart 
          key={chartComponentKey} 
          id={tab.id} 
          data={displayedData} 
          smaData={smaData} 
          config={tab.config} 
          timeframe={tab.timeframe} 
          onConfigChange={(newConfig: any) => updateTab({ config: newConfig })} 
          drawings={drawings} 
          onUpdateDrawings={onUpdateDrawings} 
          activeToolId={activeToolId || 'cross'} 
          onToolComplete={handleToolComplete} 
          currentDefaultProperties={defaultDrawingProperties} 
          selectedDrawingId={selectedDrawingId} 
          onSelectDrawing={handleSelectDrawing} 
          onActionStart={onSaveHistory} 
          isReplaySelecting={tab.isReplaySelecting} 
          onReplayPointSelect={handleReplayPointSelect} 
          onRequestMoreData={onRequestHistory} 
          areDrawingsLocked={areDrawingsLocked} 
          isMagnetMode={isMagnetMode} 
          isSyncing={isSyncing}
          visibleRange={tab.visibleRange}
          onVisibleRangeChange={onVisibleRangeChange}
          fullData={tab.data}
          replayIndex={tab.replayIndex}
          isPlaying={tab.isReplayPlaying}
          replaySpeed={tab.replaySpeed}
          onReplaySync={handleReplaySync}
          onReplayComplete={() => updateTab({ isReplayPlaying: false })}
          isAdvancedReplay={tab.isAdvancedReplayMode}
          trades={trades}
          isDrawingSyncEnabled={isDrawingSyncEnabled}
          focusTimestamp={focusTimestamp}
        />
        </div>
        
        <GlobalErrorBoundary 
            errorMessage="Market Data Unavailable"
            fallback={
                <div className="flex items-center justify-center gap-2 text-slate-500 text-xs py-4">
                    <span>Market data could not be loaded.</span>
                </div>
            }
        >
            <RecentMarketDataPanel 
                currentSymbol={tab.title}
                isOpen={tab.isMarketOverviewOpen} 
                onToggle={() => updateTab({ isMarketOverviewOpen: !tab.isMarketOverviewOpen })} 
            />
        </GlobalErrorBoundary>

        <BottomPanel 
            isOpen={isBottomPanelOpen} 
            onToggle={() => setIsBottomPanelOpen(!isBottomPanelOpen)} 
            trades={trades}
            onTradeClick={handleTradeClick}
        />
        <div className="h-6 bg-[#1e293b] border-t border-[#334155] flex items-center px-4 text-[10px] text-slate-500 justify-between shrink-0 select-none">
            <div className="flex gap-4">
            <span>O: <span className="text-slate-300">{displayedData.length > 0 ? displayedData[displayedData.length-1].open.toFixed(2) : '-'}</span></span>
            <span>H: <span className="text-slate-300">{displayedData.length > 0 ? displayedData[displayedData.length-1].high.toFixed(2) : '-'}</span></span>
            <span>L: <span className="text-slate-300">{displayedData.length > 0 ? displayedData[displayedData.length-1].low.toFixed(2) : '-'}</span></span>
            <span>C: <span className="text-slate-300">{displayedData.length > 0 ? displayedData[displayedData.length-1].close.toFixed(2) : '-'}</span></span>
            </div>
            <div className="flex items-center gap-4">
               <span className="hidden md:inline text-slate-600">Red Pill Charting v1.0.0 • {tab.isReplayMode ? 'Replay Mode' : tab.isAdvancedReplayMode ? 'Real-Time Replay' : 'Offline'}</span>
               <div className="w-px h-3 bg-slate-700 hidden md:block"></div>
               <span className="font-mono text-slate-400 flex items-center gap-2">
                   <span>{currentDate.getFullYear()}-{String(currentDate.getMonth() + 1).padStart(2, '0')}-{String(currentDate.getDate()).padStart(2, '0')}</span>
                   <span>{currentDate.toLocaleTimeString('en-GB', { hour12: false })}</span>
                   <span className="text-slate-500 text-[9px] uppercase border border-slate-700 px-1 rounded">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
               </span>
            </div>
        </div>
    </div>
  );
};
