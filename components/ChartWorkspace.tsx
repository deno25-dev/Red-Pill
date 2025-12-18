import React, { useMemo, useEffect, useState, useRef } from 'react';
import { FinancialChart } from './Chart';
import { ReplayControls } from './ReplayControls';
import { DrawingToolbar } from './DrawingToolbar';
import { BottomPanel } from './BottomPanel';
import { LayersPanel } from './LayersPanel';
import { TabSession, Timeframe, DrawingProperties } from '../types';
import { calculateSMA, getTimeframeDuration } from '../utils/dataUtils';
import { ALL_TOOLS_LIST, COLORS } from '../constants';
import { GripVertical, Settings, Check } from 'lucide-react';

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
  areDrawingsHidden?: boolean;
  isMagnetMode?: boolean;
  isStayInDrawingMode?: boolean;
  isLayersPanelOpen?: boolean;
  onToggleLayers?: () => void;
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
  areDrawingsHidden = false,
  isMagnetMode = false,
  isStayInDrawingMode = false,
  isLayersPanelOpen = false,
  onToggleLayers
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isChartSettingsOpen, setIsChartSettingsOpen] = useState(false);
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  
  // Drawing State
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [defaultDrawingProperties, setDefaultDrawingProperties] = useState<DrawingProperties>({
    color: COLORS.line,
    lineWidth: 2,
    lineStyle: 'solid',
    filled: false,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    visible: true,
    locked: false,
    smoothing: 0 // Default raw input
  });

  // Replay Accumulator for Standard Mode
  const replayAccumulator = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setCurrentDate(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Close settings on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
            setIsChartSettingsOpen(false);
        }
    };
    if (isChartSettingsOpen) {
        document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isChartSettingsOpen]);

  // Handle ESC key to exit drawing mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            if (activeToolId && activeToolId !== 'cross') {
                onSelectTool?.('cross');
            } else if (selectedDrawingId) {
                setSelectedDrawingId(null);
            }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeToolId, selectedDrawingId, onSelectTool]);
  
  // --- REPLAY ENGINE ---
  useEffect(() => {
    let interval: any;
    const isPlaying = tab.isReplayPlaying;
    
    // Safety check for data
    if (tab.data.length === 0) return;

    if (isPlaying) {
        // --- 1. STANDARD BAR REPLAY (Index Based) ---
        if (tab.isReplayMode) {
             const UPDATE_RATE_MS = 30; // ~33 FPS for UI smoothness
             
             interval = setInterval(() => {
                 if (tab.replayIndex >= tab.data.length - 1) {
                     updateTab({ isReplayPlaying: false });
                     return;
                 }

                 // Calculate how many bars we should advance in this tick
                 // Speed = Bars Per Second
                 const barsPerSecond = tab.replaySpeed;
                 const barsPerTick = barsPerSecond * (UPDATE_RATE_MS / 1000);
                 
                 replayAccumulator.current += barsPerTick;

                 // If we have accumulated at least 1 whole bar, advance
                 if (replayAccumulator.current >= 1) {
                     const advanceCount = Math.floor(replayAccumulator.current);
                     const nextIndex = Math.min(tab.data.length - 1, tab.replayIndex + advanceCount);
                     
                     replayAccumulator.current -= advanceCount;
                     
                     updateTab({
                         replayIndex: nextIndex,
                         replayGlobalTime: tab.data[nextIndex].time,
                         simulatedPrice: tab.data[nextIndex].close
                     });
                 }
             }, UPDATE_RATE_MS);
        } 
        
        // --- 2. ADVANCED REAL-TIME REPLAY (Time Based) ---
        else if (tab.isAdvancedReplayMode && tab.replayGlobalTime) {
            const TICK_RATE_MS = 1000; // Wall-clock tick
            
            interval = setInterval(() => {
                // Calculate how much time to advance: 1000ms * speedMultiplier
                const timeStep = TICK_RATE_MS * tab.replaySpeed;
                const nextGlobalTime = (tab.replayGlobalTime || tab.data[tab.replayIndex].time) + timeStep;
                
                // Find index
                let nextIndex = tab.data.findIndex(d => d.time > nextGlobalTime);
                
                if (nextIndex === -1) {
                    const lastCandle = tab.data[tab.data.length - 1];
                    const duration = getTimeframeDuration(tab.timeframe);
                    if (nextGlobalTime > lastCandle.time + duration) {
                        updateTab({ isReplayPlaying: false, replayIndex: tab.data.length - 1 });
                        return;
                    }
                    nextIndex = tab.data.length - 1;
                } else {
                    nextIndex = Math.max(0, nextIndex - 1);
                }

                // Gap Handling
                const currentCandle = tab.data[nextIndex];
                const tfDuration = getTimeframeDuration(tab.timeframe);
                
                if (nextGlobalTime > currentCandle.time + tfDuration) {
                    // Jump Gap
                    const futureCandleIdx = nextIndex + 1;
                    if (futureCandleIdx < tab.data.length) {
                        updateTab({
                            replayGlobalTime: tab.data[futureCandleIdx].time,
                            replayIndex: futureCandleIdx,
                            simulatedPrice: tab.data[futureCandleIdx].open
                        });
                    } else {
                        updateTab({ isReplayPlaying: false });
                    }
                    return;
                }

                // Interpolation
                let simPrice = currentCandle.close;
                const elapsed = nextGlobalTime - currentCandle.time;
                const progress = Math.min(1, Math.max(0, elapsed / tfDuration));
                
                const { open, high, low, close } = currentCandle;
                if (progress < 0.33) {
                    const subP = progress / 0.33;
                    simPrice = open + (high - open) * subP;
                } else if (progress < 0.66) {
                    const subP = (progress - 0.33) / 0.33;
                    simPrice = high + (low - high) * subP;
                } else {
                    const subP = (progress - 0.66) / 0.34;
                    simPrice = low + (close - low) * subP;
                }

                updateTab({
                    replayGlobalTime: nextGlobalTime,
                    replayIndex: nextIndex,
                    simulatedPrice: simPrice
                });

            }, TICK_RATE_MS);
        }
    } else {
        // Reset accumulator on pause so it doesn't jump on resume
        replayAccumulator.current = 0;
    }

    return () => clearInterval(interval);
  }, [tab.isReplayMode, tab.isAdvancedReplayMode, tab.isReplayPlaying, tab.replaySpeed, tab.data, tab.replayIndex, tab.replayGlobalTime, tab.timeframe, updateTab]);


  // --- DATA VISUALIZATION LOGIC ---
  const displayedData = useMemo(() => {
    // If not in replay mode, show everything
    if (!tab.isReplayMode && !tab.isAdvancedReplayMode) return tab.data;
    if (tab.data.length === 0) return [];

    // Slice data up to current replay index
    const sliced = tab.data.slice(0, tab.replayIndex + 1);
    
    // In Advanced Mode ONLY: We modify the LAST candle to simulate formation
    if (tab.isAdvancedReplayMode && sliced.length > 0 && tab.replayGlobalTime) {
        const lastIdx = sliced.length - 1;
        const realCandle = sliced[lastIdx];
        const formingCandle = { ...realCandle };
        
        const tfDuration = getTimeframeDuration(tab.timeframe);
        const elapsed = tab.replayGlobalTime - realCandle.time;
        const progress = Math.min(1, Math.max(0, elapsed / tfDuration));
        
        formingCandle.close = tab.simulatedPrice || realCandle.open;

        if (progress < 0.1) {
            formingCandle.high = Math.max(formingCandle.open, formingCandle.close);
            formingCandle.low = Math.min(formingCandle.open, formingCandle.close);
        } else {
            formingCandle.high = Math.max(realCandle.high, formingCandle.close); 
        }
        
        sliced[lastIdx] = formingCandle;
    }
    
    return sliced;
  }, [tab.data, tab.isReplayMode, tab.isAdvancedReplayMode, tab.replayIndex, tab.replayGlobalTime, tab.simulatedPrice, tab.timeframe]);

  const smaData = useMemo(() => {
    if (!tab.config.showSMA) return [];
    return calculateSMA(displayedData, tab.config.smaPeriod);
  }, [displayedData, tab.config.showSMA, tab.config.smaPeriod]);

  // Price Display Logic
  const currentPrice = useMemo(() => {
      if (displayedData.length === 0) return 0;
      return displayedData[displayedData.length - 1].close;
  }, [displayedData]);

  const prevPrice = displayedData.length > 1 ? displayedData[displayedData.length - 2].close : currentPrice;
  const priceChange = currentPrice - prevPrice;
  const percentChange = prevPrice !== 0 ? (priceChange / prevPrice) * 100 : 0;
  const isUp = priceChange >= 0;

  // --- Draggable Header State ---
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
      
      const newX = Math.max(0, headerStartPos.current.x + dx);
      const newY = Math.max(0, headerStartPos.current.y + dy);

      setHeaderPos({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      isDraggingHeader.current = false;
      win.removeEventListener('mousemove', handleMouseMove);
      win.removeEventListener('mouseup', handleMouseUp);
    };

    win.addEventListener('mousemove', handleMouseMove);
    win.addEventListener('mouseup', handleMouseUp);
  };

  // --- Draggable Favorites Bar State ---
  const [favBarPos, setFavBarPos] = useState({ x: 0, y: 0 });
  const favBarRef = useRef<HTMLDivElement>(null);
  const isDraggingFav = useRef(false);
  const favDragStart = useRef({ x: 0, y: 0 });
  const favStartPos = useRef({ x: 0, y: 0 });
  
  // Center initially
  useEffect(() => {
    if (favBarRef.current && favBarPos.x === 0 && favBarPos.y === 0) {
        setFavBarPos({ 
            x: window.innerWidth / 2 - favBarRef.current.clientWidth / 2, 
            y: window.innerHeight - 150 
        });
    }
  }, [favoriteTools]);

  // Optimized Drag Handler: Directly updates DOM to avoid Re-renders during drag
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
      
      // Calculate delta
      const dx = ev.clientX - favDragStart.current.x;
      const dy = ev.clientY - favDragStart.current.y;
      
      const newX = favStartPos.current.x + dx;
      const newY = favStartPos.current.y + dy;

      // Update DOM directly for max performance
      el.style.left = `${newX}px`;
      el.style.top = `${newY}px`;
    };

    const handleMouseUp = (ev: MouseEvent) => {
      isDraggingFav.current = false;
      win.removeEventListener('mousemove', handleMouseMove);
      win.removeEventListener('mouseup', handleMouseUp);
      
      // Sync state at end of drag
      if (el) {
          const dx = ev.clientX - favDragStart.current.x;
          const dy = ev.clientY - favDragStart.current.y;
          setFavBarPos({ 
              x: favStartPos.current.x + dx, 
              y: favStartPos.current.y + dy 
          });
      }
    };

    win.addEventListener('mousemove', handleMouseMove);
    win.addEventListener('mouseup', handleMouseUp);
  };

  // --- Draggable Replay Controls State ---
  const [replayPos, setReplayPos] = useState({ x: 0, y: 0 });
  const isDraggingReplay = useRef(false);
  const replayDragStart = useRef({ x: 0, y: 0 });
  const replayStartPos = useRef({ x: 0, y: 0 });

  // Initialize position centered-bottom when replay starts, if not set
  useEffect(() => {
    if ((tab.isReplayMode || tab.isAdvancedReplayMode) && replayPos.x === 0 && replayPos.y === 0) {
        setReplayPos({ 
            x: window.innerWidth / 2 - 160, 
            y: window.innerHeight - 200 
        });
    }
  }, [tab.isReplayMode, tab.isAdvancedReplayMode]);

  const handleReplayMouseDown = (e: React.MouseEvent) => {
    isDraggingReplay.current = true;
    replayDragStart.current = { x: e.clientX, y: e.clientY };
    replayStartPos.current = { ...replayPos };
    e.preventDefault();
    
    const win = (e.view as unknown as Window) || window;
    
    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingReplay.current) return;
      const dx = ev.clientX - replayDragStart.current.x;
      const dy = ev.clientY - replayDragStart.current.y;
      setReplayPos({ x: replayStartPos.current.x + dx, y: replayStartPos.current.y + dy });
    };

    const handleMouseUp = () => {
      isDraggingReplay.current = false;
      win.removeEventListener('mousemove', handleMouseMove);
      win.removeEventListener('mouseup', handleMouseUp);
    };

    win.addEventListener('mousemove', handleMouseMove);
    win.addEventListener('mouseup', handleMouseUp);
  };

  // --- Draggable Drawing Toolbar State ---
  const [toolbarPos, setToolbarPos] = useState({ x: 0, y: 0 });
  const isDraggingToolbar = useRef(false);
  const toolbarDragStart = useRef({ x: 0, y: 0 });
  const toolbarStartPos = useRef({ x: 0, y: 0 });

  // Determine if toolbar should be shown: active drawing tool OR selected drawing
  const isToolbarVisible = selectedDrawingId !== null || (activeToolId && activeToolId !== 'cross' && activeToolId !== 'cursor' && activeToolId !== 'eraser');

  // Initialize position
  useEffect(() => {
    if (isToolbarVisible && toolbarPos.x === 0 && toolbarPos.y === 0) {
        setToolbarPos({ 
            x: window.innerWidth / 2 - 100, 
            y: window.innerHeight - 120 
        });
    }
  }, [isToolbarVisible]);

  const handleToolbarMouseDown = (e: React.MouseEvent) => {
    isDraggingToolbar.current = true;
    toolbarDragStart.current = { x: e.clientX, y: e.clientY };
    toolbarStartPos.current = { ...toolbarPos };
    e.preventDefault();
    e.stopPropagation();
    
    const win = (e.view as unknown as Window) || window;
    
    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingToolbar.current) return;
      const dx = ev.clientX - toolbarDragStart.current.x;
      const dy = ev.clientY - toolbarDragStart.current.y;
      setToolbarPos({ x: toolbarStartPos.current.x + dx, y: toolbarStartPos.current.y + dy });
    };

    const handleMouseUp = () => {
      isDraggingToolbar.current = false;
      win.removeEventListener('mousemove', handleMouseMove);
      win.removeEventListener('mouseup', handleMouseUp);
    };

    win.addEventListener('mousemove', handleMouseMove);
    win.addEventListener('mouseup', handleMouseUp);
  };

  // --- Draggable Layers Panel State ---
  const [layersPanelPos, setLayersPanelPos] = useState({ x: 0, y: 0 });
  const isDraggingLayers = useRef(false);
  const layersDragStart = useRef({ x: 0, y: 0 });
  const layersStartPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (isLayersPanelOpen && layersPanelPos.x === 0 && layersPanelPos.y === 0) {
       setLayersPanelPos({
           x: window.innerWidth - 320, // Initial right side position
           y: 100
       });
    }
  }, [isLayersPanelOpen]);

  const handleLayersMouseDown = (e: React.MouseEvent) => {
    isDraggingLayers.current = true;
    layersDragStart.current = { x: e.clientX, y: e.clientY };
    layersStartPos.current = { ...layersPanelPos };
    e.preventDefault();
    
    const win = (e.view as unknown as Window) || window;
    
    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingLayers.current) return;
      const dx = ev.clientX - layersDragStart.current.x;
      const dy = ev.clientY - layersDragStart.current.y;
      setLayersPanelPos({ x: layersStartPos.current.x + dx, y: layersStartPos.current.y + dy });
    };

    const handleMouseUp = () => {
      isDraggingLayers.current = false;
      win.removeEventListener('mousemove', handleMouseMove);
      win.removeEventListener('mouseup', handleMouseUp);
    };

    win.addEventListener('mousemove', handleMouseMove);
    win.addEventListener('mouseup', handleMouseUp);
  };

  // --- Drawing Properties Management ---
  const handleDrawingPropertyChange = (updates: Partial<DrawingProperties>) => {
    if (selectedDrawingId) {
      // Trigger history save before modification
      onSaveHistory?.();
      
      // Update existing drawing
      const newDrawings = tab.drawings.map(d => 
        d.id === selectedDrawingId 
          ? { ...d, properties: { ...d.properties, ...updates } }
          : d
      );
      updateTab({ drawings: newDrawings });
      // Also update default for next time user draws
      setDefaultDrawingProperties(prev => ({ ...prev, ...updates }));
    } else {
      // Update default for active tool
      setDefaultDrawingProperties(prev => ({ ...prev, ...updates }));
    }
  };

  const deleteSelectedDrawing = () => {
    if (selectedDrawingId) {
      onSaveHistory?.();
      const newDrawings = tab.drawings.filter(d => d.id !== selectedDrawingId);
      updateTab({ drawings: newDrawings });
      setSelectedDrawingId(null);
    }
  };

  const handleReplayPointSelect = (timeInMs: number) => {
      if (!tab.isReplaySelecting) return;
      
      // Find the index of the candle closest to the time
      let idx = tab.data.findIndex(d => d.time >= timeInMs);
      if (idx === -1) idx = tab.data.length - 1;
      
      // Start replay from here
      updateTab({
          isReplaySelecting: false,
          isReplayMode: tab.isAdvancedReplayMode ? false : true, 
          isAdvancedReplayMode: tab.isAdvancedReplayMode,
          replayIndex: idx,
          replayGlobalTime: tab.data[idx].time, // Set initial time
          simulatedPrice: tab.data[idx].open,
          isReplayPlaying: false
      });
  };

  const handleToolComplete = () => {
      if (!isStayInDrawingMode) {
          onSelectTool?.('cross');
      }
  };

  // Determine current properties to display in toolbar
  const activeProperties = useMemo(() => {
    if (selectedDrawingId) {
      const drawing = tab.drawings.find(d => d.id === selectedDrawingId);
      return drawing ? drawing.properties : defaultDrawingProperties;
    }
    return defaultDrawingProperties;
  }, [selectedDrawingId, tab.drawings, defaultDrawingProperties]);
  
  // Get active drawing type to pass to toolbar
  const selectedDrawingType = useMemo(() => {
      if (selectedDrawingId) {
          return tab.drawings.find(d => d.id === selectedDrawingId)?.type;
      }
      // If we are drawing a new text, we want to show properties but maybe not the text editor until created
      return activeToolId; 
  }, [selectedDrawingId, tab.drawings, activeToolId]);

  return (
    <div className="flex-1 flex flex-col relative min-w-0 h-full bg-[#0f172a]">
        {/* Chart Header Info Overlay */}
        <div 
          onMouseDown={handleHeaderMouseDown}
          style={{ left: headerPos.x, top: headerPos.y }}
          className="absolute z-20 bg-[#1e293b]/90 backdrop-blur-sm px-4 py-2 rounded border border-slate-700 shadow-lg flex items-center gap-4 cursor-move select-none transition-shadow hover:shadow-xl hover:ring-1 hover:ring-slate-600/50"
        >
          {/* Ticker / Title */}
          <h1 className="text-sm font-bold text-white tracking-wide truncate max-w-[150px]">{tab.title}</h1>
          
          <div className="h-4 w-px bg-slate-600"></div>
          
          {/* Timeframes */}
          <div className="flex items-center gap-0.5">
              {Object.values(Timeframe).map((tf) => (
              <button
                  key={tf}
                  onClick={() => onTimeframeChange(tf)}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
                  tab.timeframe === tf
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#334155]'
                  }`}
              >
                  {tf}
              </button>
              ))}
          </div>

          <div className="h-4 w-px bg-slate-600"></div>

          {/* Price Info */}
          <div className="flex items-baseline gap-3">
              <span className={`text-sm font-mono font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
              {currentPrice.toFixed(2)}
              </span>
              <span className={`text-xs font-medium ${isUp ? 'text-emerald-500' : 'text-red-500'}`}>
              {priceChange > 0 ? '+' : ''}{priceChange.toFixed(2)} ({percentChange.toFixed(2)}%)
              </span>
          </div>

          <div className="h-4 w-px bg-slate-600"></div>

          {/* Volume */}
          <div className="text-[10px] text-slate-400">
              Vol: <span className="text-slate-300 font-mono">{displayedData.length > 0 ? displayedData[displayedData.length - 1].volume.toFixed(0) : 0}</span>
          </div>

          <div className="h-4 w-px bg-slate-600"></div>

          {/* Chart Settings Menu */}
          <div className="relative" ref={settingsRef}>
             <button 
                onClick={(e) => { e.stopPropagation(); setIsChartSettingsOpen(!isChartSettingsOpen); }}
                className="p-1 hover:bg-[#334155] rounded text-slate-400 hover:text-white transition-colors"
                title="Chart Settings"
                onMouseDown={(e) => e.stopPropagation()}
             >
                <Settings size={14} />
             </button>
             {isChartSettingsOpen && (
                <div 
                    className="absolute top-full right-0 mt-2 w-48 bg-[#1e293b] border border-[#334155] rounded-md shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                   <div className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-[#0f172a]/50 border-b border-[#334155]">
                     Price Scale
                   </div>
                   
                   <button 
                      onClick={() => updateTab({ config: { ...tab.config, priceScaleMode: 'linear' } })}
                      className="w-full text-left px-4 py-2 text-xs text-slate-400 hover:text-white hover:bg-[#334155] flex items-center justify-between"
                   >
                      <span>Linear</span>
                      {(tab.config.priceScaleMode === 'linear' || !tab.config.priceScaleMode) && <Check size={12} className="text-blue-400" />}
                   </button>
                   
                   <button 
                      onClick={() => updateTab({ config: { ...tab.config, priceScaleMode: 'logarithmic' } })}
                      className="w-full text-left px-4 py-2 text-xs text-slate-400 hover:text-white hover:bg-[#334155] flex items-center justify-between"
                   >
                      <span>Logarithmic</span>
                      {tab.config.priceScaleMode === 'logarithmic' && <Check size={12} className="text-blue-400" />}
                   </button>
                   
                   <button 
                      onClick={() => updateTab({ config: { ...tab.config, priceScaleMode: 'percentage' } })}
                      className="w-full text-left px-4 py-2 text-xs text-slate-400 hover:text-white hover:bg-[#334155] flex items-center justify-between"
                   >
                      <span>Percentage</span>
                      {tab.config.priceScaleMode === 'percentage' && <Check size={12} className="text-blue-400" />}
                   </button>

                   <div className="h-px bg-[#334155] my-1 mx-2"></div>
                   
                   <button 
                      onClick={() => updateTab({ config: { ...tab.config, autoScale: !tab.config.autoScale } })}
                      className="w-full text-left px-4 py-2 text-xs text-slate-400 hover:text-white hover:bg-[#334155] flex items-center justify-between"
                   >
                      <span>Auto Scale</span>
                      {(tab.config.autoScale !== false) && <Check size={12} className="text-emerald-400" />}
                   </button>
                </div>
             )}
          </div>
        </div>

        {/* Favorites Floating Bar */}
        {isFavoritesBarVisible && favoriteTools.length > 0 && (
            <div
                ref={favBarRef}
                onMouseDown={handleFavMouseDown}
                style={{ left: favBarPos.x, top: favBarPos.y }}
                className="absolute z-30 bg-[#1e293b] border border-[#334155] rounded-full shadow-xl shadow-black/50 backdrop-blur-md flex items-center p-1 gap-1 cursor-move animate-in fade-in zoom-in-95 duration-200"
            >
                <div className="pl-2 pr-1 text-slate-500 cursor-move hover:text-slate-300 transition-colors">
                   <GripVertical size={14} />
                </div>
                
                <div className="w-px h-4 bg-[#334155] mx-1"></div>

                {favoriteTools.map(toolId => {
                    const tool = ALL_TOOLS_LIST.find(t => t.id === toolId);
                    if (!tool) return null;
                    return (
                        <button
                            key={toolId}
                            onClick={(e) => { e.stopPropagation(); onSelectTool?.(toolId); }}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                                activeToolId === toolId 
                                ? 'bg-blue-600 text-white shadow-sm' 
                                : 'text-slate-400 hover:text-white hover:bg-[#334155]'
                            }`}
                            onMouseDown={(e) => e.stopPropagation()} // Prevent drag start on button click
                            title={tool.label}
                        >
                            <tool.icon size={18} />
                        </button>
                    );
                })}
            </div>
        )}
        
        {/* Drawing Properties Toolbar */}
        <DrawingToolbar 
           isVisible={isToolbarVisible}
           properties={activeProperties}
           onChange={handleDrawingPropertyChange}
           onDelete={deleteSelectedDrawing}
           isSelection={selectedDrawingId !== null}
           position={toolbarPos.x !== 0 ? toolbarPos : undefined}
           onDragStart={handleToolbarMouseDown}
           drawingType={selectedDrawingType}
        />
        
        {/* Layers Panel */}
        {isLayersPanelOpen && (
            <LayersPanel 
                drawings={tab.drawings}
                onUpdateDrawings={(drawings) => { onSaveHistory?.(); updateTab({ drawings }); }}
                selectedDrawingId={selectedDrawingId}
                onSelectDrawing={setSelectedDrawingId}
                onClose={onToggleLayers || (() => {})}
                position={layersPanelPos.x !== 0 ? layersPanelPos : undefined}
                onHeaderMouseDown={handleLayersMouseDown}
            />
        )}
        
        {/* Replay Controls Overlay */}
        {(tab.isReplayMode || tab.isAdvancedReplayMode) && (
            <ReplayControls 
            isPlaying={tab.isReplayPlaying}
            onPlayPause={() => updateTab({ isReplayPlaying: !tab.isReplayPlaying })}
            onStepForward={() => {
                if (tab.isReplayMode) {
                   // Standard Replay Step
                   const nextIndex = Math.min(tab.data.length - 1, tab.replayIndex + 1);
                   updateTab({ 
                        replayIndex: nextIndex,
                        replayGlobalTime: tab.data[nextIndex].time,
                        simulatedPrice: tab.data[nextIndex].close
                   });
                } else {
                    // Advanced Replay Step (Jump one timeframe unit)
                    const nextTime = (tab.replayGlobalTime || tab.data[tab.replayIndex].time) + getTimeframeDuration(tab.timeframe);
                    let nextIndex = tab.data.findIndex(d => d.time >= nextTime);
                    if (nextIndex === -1) nextIndex = tab.data.length - 1;
                    
                    updateTab({ 
                        replayIndex: nextIndex,
                        replayGlobalTime: tab.data[nextIndex].time,
                        simulatedPrice: tab.data[nextIndex].open
                    });
                }
            }}
            onReset={() => {
                const newIdx = Math.max(0, tab.data.length - 100);
                replayAccumulator.current = 0;
                updateTab({ 
                    replayIndex: newIdx,
                    replayGlobalTime: tab.data[newIdx].time,
                    simulatedPrice: tab.data[newIdx].open
                })
            }}
            onClose={() => updateTab({ 
                isReplayMode: false, 
                isAdvancedReplayMode: false, 
                isReplayPlaying: false,
                simulatedPrice: null,
                replayGlobalTime: null
            })}
            speed={tab.replaySpeed}
            onSpeedChange={(speed) => updateTab({ replaySpeed: speed })}
            progress={tab.data.length > 0 ? (tab.replayIndex / (tab.data.length - 1)) * 100 : 0}
            position={replayPos.x !== 0 ? replayPos : undefined}
            onHeaderMouseDown={handleReplayMouseDown}
            />
        )}
        
        {/* Replay Selection Hint */}
        {tab.isReplaySelecting && (
           <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-blue-600 text-white px-4 py-2 rounded shadow-lg text-sm font-bold animate-pulse pointer-events-none">
             Click on the chart to start {tab.isAdvancedReplayMode ? 'advanced' : ''} replay
           </div>
        )}

        {/* Chart Canvas */}
        <div className="flex-1 w-full relative overflow-hidden">
        {loading && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0f172a]/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <div className="text-blue-400 font-medium">Processing Data...</div>
            </div>
            </div>
        )}
        
        {/* Logo Watermark Restored */}
        <div className="absolute bottom-10 left-4 z-10 flex items-center gap-2 opacity-75 pointer-events-none select-none">
            <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center text-white font-bold text-lg shadow-md shadow-red-900/50">
                K
            </div>
            <span className="text-lg font-semibold tracking-tight text-slate-500">
                Красная таблетка
            </span>
        </div>

        <FinancialChart 
            key={tab.id}
            data={displayedData} 
            smaData={smaData} 
            config={tab.config} 
            onConfigChange={(newConfig) => updateTab({ config: newConfig })}
            drawings={tab.drawings}
            onUpdateDrawings={(drawings) => updateTab({ drawings })}
            activeToolId={activeToolId || 'cross'}
            onToolComplete={handleToolComplete}
            currentDefaultProperties={defaultDrawingProperties}
            selectedDrawingId={selectedDrawingId}
            onSelectDrawing={setSelectedDrawingId}
            onActionStart={onSaveHistory}
            isReplaySelecting={tab.isReplaySelecting}
            onReplayPointSelect={handleReplayPointSelect}
            onRequestMoreData={onRequestHistory}
            areDrawingsLocked={areDrawingsLocked}
            areDrawingsHidden={areDrawingsHidden}
            isMagnetMode={isMagnetMode}
        />
        </div>

        {/* Trade & Order Book Panel */}
        <BottomPanel 
            isOpen={isBottomPanelOpen} 
            onToggle={() => setIsBottomPanelOpen(!isBottomPanelOpen)} 
            trades={tab.trades || []} 
        />

        {/* Status Bar */}
        <div className="h-6 bg-[#1e293b] border-t border-[#334155] flex items-center px-4 text-[10px] text-slate-500 justify-between shrink-0 select-none">
            <div className="flex gap-4">
            <span>O: <span className="text-slate-300">{displayedData.length > 0 ? displayedData[displayedData.length-1].open.toFixed(2) : '-'}</span></span>
            <span>H: <span className="text-slate-300">{displayedData.length > 0 ? displayedData[displayedData.length-1].high.toFixed(2) : '-'}</span></span>
            <span>L: <span className="text-slate-300">{displayedData.length > 0 ? displayedData[displayedData.length-1].low.toFixed(2) : '-'}</span></span>
            <span>C: <span className="text-slate-300">{displayedData.length > 0 ? displayedData[displayedData.length-1].close.toFixed(2) : '-'}</span></span>
            </div>
            
            <div className="flex items-center gap-4">
               <span className="hidden md:inline text-slate-600">
                   Red Pill Charting v0.2.1 • {tab.isReplayMode ? 'Replay Mode' : tab.isAdvancedReplayMode ? 'Real-Time Replay' : 'Offline'}
               </span>
               <div className="w-px h-3 bg-slate-700 hidden md:block"></div>
               <span className="font-mono text-slate-400 flex items-center gap-2">
                   <span>
                    {currentDate.getFullYear()}-{String(currentDate.getMonth() + 1).padStart(2, '0')}-{String(currentDate.getDate()).padStart(2, '0')}
                   </span>
                   <span>
                    {currentDate.toLocaleTimeString('en-GB', { hour12: false })}
                   </span>
                   <span className="text-slate-500 text-[9px] uppercase border border-slate-700 px-1 rounded">
                       {Intl.DateTimeFormat().resolvedOptions().timeZone}
                   </span>
               </span>
            </div>
        </div>
    </div>
  );
};