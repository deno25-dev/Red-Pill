import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Toolbar } from './Toolbar';
import { Sidebar } from './Sidebar';
import { FilePanel } from './FilePanel';
import { TabBar } from './TabBar';
import { ChartWorkspace } from './ChartWorkspace';
import { Popout } from './Popout';
import { TradingPanel } from './TradingPanel';
import { CandleSettingsDialog } from './CandleSettingsDialog';
import { BackgroundSettingsDialog } from './BackgroundSettingsDialog';
import { AssetLibrary } from './AssetLibrary';
import { SplashController } from './SplashController';
import { StickyNoteOverlay } from './StickyNoteOverlay';
import { DatabaseBrowser } from './DatabaseBrowser';
import { StickyNoteManager } from './modals/StickyNoteManager';
import { LayoutManager } from './modals/LayoutManager';
import { OHLCV, Timeframe, TabSession, Trade, HistorySnapshot, ChartState, ChartConfig, Drawing, ActivePanel, Folder } from '../types';
import { parseCSVChunk, resampleData, findFileForTimeframe, getBaseSymbolName, detectTimeframe, readChunk, sanitizeData, getTimeframeDuration, getSymbolId, getSourceId, loadProtectedSession, scanRecursive, findIndexForTimestamp } from '../utils/dataUtils';
import { saveAppState, loadAppState, getDatabaseHandle, deleteChartMeta, loadUILayout, saveUILayout } from '../utils/storage';
import { ExternalLink } from 'lucide-react';
import { DeveloperTools } from './DeveloperTools';
import { debugLog } from '../utils/logger';
import { useFileSystem } from '@/hooks/useFileSystem';
import { useTradePersistence } from '@/hooks/useTradePersistence';
import { useSymbolPersistence } from '@/hooks/useSymbolPersistence';
import { useStickyNotes } from '@/hooks/useStickyNotes';
import { useOrderPersistence } from '@/hooks/useOrderPersistence';
import { Watchlist } from './Watchlist';
import { LayersPanel } from './LayersPanel';
import { DrawingPalette } from './DrawingPalette';
import { ALL_TOOLS_LIST } from '@/constants/index';

// Chunk size for file streaming: 2MB
const CHUNK_SIZE = 2 * 1024 * 1024; 

// Mock data for debug bypass
const MOCK_DATA: OHLCV[] = (() => {
  const data: OHLCV[] = [];
  let currentPrice = 65000;
  const baseTime = new Date('2024-05-20T00:00:00Z').getTime();
  const interval = 15 * 60 * 1000; // 15 minutes

  for (let i = 0; i < 50; i++) { // Generate 50 candles for a decent view
      const time = baseTime + i * interval;
      const open = currentPrice;
      const change = (Math.random() - 0.48) * 500;
      const close = open + change;
      const high = Math.max(open, close) + Math.random() * 100;
      const low = Math.min(open, close) - Math.random() * 100;
      const volume = Math.floor(Math.random() * 200) + 50;

      data.push({ time, open, high, low, close, volume });
      currentPrice = close;
  }
  return data;
})();


type LayoutMode = 'single' | 'split-2x' | 'split-4x';
type AppStatus = 'BOOT' | 'LIBRARY' | 'ACTIVE';

const App: React.FC = () => {
  // --- State Management ---
  const [appStatus, setAppStatus] = useState<AppStatus>('BOOT');
  const [isRestoreComplete, setIsRestoreComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isAssetLibraryOpen, setIsAssetLibraryOpen] = useState(false);
  const [isTradingPanelOpen, setIsTradingPanelOpen] = useState(false);
  const [isLayersPanelOpen, setIsLayersPanelOpen] = useState(false);
  const [isTradingPanelDetached, setIsTradingPanelDetached] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('single');
  
  // Unified Sidebar State
  const [activePanel, setActivePanel] = useState<ActivePanel>('watchlist');

  // Drawing Selection State (Global for Sidebar sync)
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);

  // Synchronization Toggles
  const [isSymbolSync, setIsSymbolSync] = useState(false);
  const [isIntervalSync, setIsIntervalSync] = useState(false);
  const [isCrosshairSync, setIsCrosshairSync] = useState(false);
  const [isTimeSync, setIsTimeSync] = useState(false);

  // Master Sync State (Mandate 2.11.2)
  const [isMasterSyncActive, setIsMasterSyncActive] = useState(false);

  // Layout Slots: Tracks which tab is in which pane position
  const [layoutTabIds, setLayoutTabIds] = useState<string[]>([]);

  // Settings Dialogs State
  const [isCandleSettingsOpen, setIsCandleSettingsOpen] = useState(false);
  const [isBackgroundSettingsOpen, setIsBackgroundSettingsOpen] = useState(false);

  // Database Browser State
  const [isDbBrowserOpen, setIsDbBrowserOpen] = useState(false);
  const [dbMode, setDbMode] = useState<'notes' | 'layouts'>('notes');

  // Tools & Favorites State
  const [activeToolId, setActiveToolId] = useState<string>('cross');
  const [favoriteTools, setFavoriteTools] = useState<string[]>(['trend_line', 'rectangle']);
  const [isFavoritesBarVisible, setIsFavoritesBarVisible] = useState(true);
  
  // Timeframe Favorites
  const [favoriteTimeframes, setFavoriteTimeframes] = useState<string[]>([
    Timeframe.M1, Timeframe.M5, Timeframe.M15, 
    Timeframe.H1, Timeframe.H4, Timeframe.D1, Timeframe.W1
  ]);
  
  // Global Drawing Modes
  const [isMagnetMode, setIsMagnetMode] = useState(false);
  const [isStayInDrawingMode, setIsStayInDrawingMode] = useState(false);
  const [isDrawingSyncEnabled, setIsDrawingSyncEnabled] = useState(true);
  
  // Data Explorer (Files in the ad-hoc panel) - MANUAL
  const [explorerFiles, setExplorerFiles] = useState<any[]>([]);
  const [explorerFolderName, setExplorerFolderName] = useState<string>('');
  const [filePanelOverride, setFilePanelOverride] = useState<{files: any[], path: string} | null>(null);
  const [filePanelFilter, setFilePanelFilter] = useState<((f: any) => boolean) | null>(null);
  
  // Dev Diagnostic States
  const [lastError, setLastError] = useState<string | null>(null);
  const [chartRenderTime, setChartRenderTime] = useState<number | null>(null);

  // Replay Time Refs (Mandate: Timestamp-Anchored Replay)
  const replayTimeRefs = useRef<Record<string, React.MutableRefObject<number | null>>>({});

  // Helper to ensure ref exists
  const getReplayTimeRef = (id: string) => {
      if (!replayTimeRefs.current[id]) {
          replayTimeRefs.current[id] = { current: null };
      }
      return replayTimeRefs.current[id];
  };

  // Electron File System Hook
  const { checkFileExists, isBridgeAvailable, currentPath: databasePath, connectDefaultDatabase } = useFileSystem();

  // Sticky Notes Hook
  const { 
      notes, 
      isVisible: isStickyNotesVisible, 
      addNote: addStickyNote, 
      updateNote: updateStickyNote, 
      removeNote: removeStickyNote, 
      toggleVisibility: toggleStickyNotes, 
      bringToFront: bringStickyNoteToFront
  } = useStickyNotes();

  // Order Persistence Hook (Global Hybrid Model)
  const { orders: globalOrders, addOrder, syncToDb: syncOrdersToDb, hasUnsavedChanges: hasUnsavedOrders } = useOrderPersistence();

  // Helper for selection
  const handleSelectDrawing = (id: string | null, e?: React.MouseEvent) => {
      setSelectedDrawingId(id);
  };

  // BeforeUnload Listener for unsaved trades
  useEffect(() => {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
          if (hasUnsavedOrders) {
              const message = "You have new trades. Would you like to export them to your Database folder before leaving?";
              e.returnValue = message; // Standard for browsers
              return message;
          }
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedOrders]);

  // Performance Listener
  useEffect(() => {
    const handlePerf = (e: any) => {
      setChartRenderTime(e.detail.duration);
    };
    window.addEventListener('chart-render-perf', handlePerf);
    return () => window.removeEventListener('chart-render-perf', handlePerf);
  }, []);

  // Load Master Sync Persistence
  useEffect(() => {
      loadUILayout().then((layout: any) => {
          if (layout && typeof layout.isMasterSyncActive === 'boolean') {
              setIsMasterSyncActive(layout.isMasterSyncActive);
          }
      });
  }, []);

  // Save Master Sync Persistence
  useEffect(() => {
      loadUILayout().then((currentLayout: any) => {
          saveUILayout({ ...currentLayout, isMasterSyncActive });
      });
  }, [isMasterSyncActive]);

  const toggleFavorite = (id: string) => {
    setFavoriteTools(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };
  
  const toggleFavoriteTimeframe = (tf: string) => {
    setFavoriteTimeframes(prev => 
        prev.includes(tf) ? prev.filter(t => t !== tf) : [...prev, tf]
    );
  };
  
  // Initial Boot Sequence
  useEffect(() => {
      const electron = (window as any).electronAPI;
      if (electron) {
          // Load Drawing States
          if (electron.getDrawingsState) {
              electron.getDrawingsState().then(() => {
                  // The global lock state is now derived from active tab's drawings.
              });
          }
      }
  }, []);

  // Tab Management
  const [tabs, setTabs] = useState<TabSession[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');

  // Helper to create a new tab object
  const createNewTab = useCallback((id: string = crypto.randomUUID(), title: string = 'New Chart', raw: OHLCV[] = []): TabSession => {
    // Detect timeframe for new mock data if any
    const detectedTf = raw.length > 0 ? detectTimeframe(raw) : Timeframe.M15;
    
    return {
      id,
      title,
      symbolId: getSymbolId(title),
      sourceId: `mock_${id}`, // Persistent ID for mock/new tabs
      rawData: raw,
      data: raw.length > 0 ? resampleData(raw, detectedTf) : [],
      timeframe: detectedTf,
      config: {
        showVolume: false,
        showSMA: false,
        smaPeriod: 20,
        chartType: 'candlestick',
        theme: 'dark',
        volumeTopMargin: 0.8,
        priceScaleMode: 'linear',
        autoScale: true,
        showGridlines: true,
      },
      isReplayMode: false,
      isAdvancedReplayMode: false,
      isReplaySelecting: false,
      replayIndex: 0,
      replayGlobalTime: null,
      simulatedPrice: null,
      isReplayPlaying: false,
      replaySpeed: 1, 
      isDetached: false,
      isMarketOverviewOpen: true, // Persisted Sidebar State
      drawings: [],
      folders: [], // Explicitly empty folders
      visibleRange: null, 
      undoStack: [],
      redoStack: [],
      trades: []
    };
  }, []);
  
  const handleDebugBypass = useCallback(() => {
    const dummyTab = createNewTab(crypto.randomUUID(), 'DEBUG-BTC', MOCK_DATA);
    setTabs([dummyTab]);
    setActiveTabId(dummyTab.id);
    if (layoutMode === 'single') {
        setLayoutTabIds([dummyTab.id]);
    }
    setAppStatus('ACTIVE');
    debugLog('UI', 'Debug bypass triggered. Entering workspace with mock data.');
  }, [createNewTab, layoutMode]);

  const activeTab = useMemo(() => 
    tabs.find(t => t.id === activeTabId) || tabs[0], 
  [tabs, activeTabId]);

  // Global Theme Controller
  useEffect(() => {
    const theme = activeTab?.config?.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }, [activeTab?.config?.theme]);

  // Trade Persistence for Active Tab
  const tradeSourceId = activeTab?.sourceId;
  useTradePersistence(tradeSourceId);

  // --- Watcher Validation Effect (Auto-Clear Deleted Files) ---
  useEffect(() => {
      if (!isBridgeAvailable) return;

      const validateActiveFiles = async () => {
          for (const tab of tabs) {
              if (tab.filePath) {
                  const exists = await checkFileExists(tab.filePath);
                  if (!exists && tab.data.length > 0) {
                      debugLog('Data', `File deleted: ${tab.filePath}. Clearing tab.`);
                      updateTab(tab.id, {
                          data: [],
                          rawData: [],
                          filePath: undefined,
                          fileState: undefined,
                          title: `${tab.title} (File Missing)`
                      });
                      alert(`The file for ${tab.title} was deleted or moved. Chart cleared.`);
                  }
              }
          }
      };

      const interval = setInterval(validateActiveFiles, 2000);
      return () => clearInterval(interval);
  }, [tabs, isBridgeAvailable, checkFileExists]);

  // --- Nuclear Clear Listener ---
  useEffect(() => {
      const handleNuclearClear = async () => {
          if (!activeTabId) return;
          const tab = tabs.find(t => t.id === activeTabId);
          if (!tab || !tab.sourceId) return;

          debugLog('Data', `Executing NUCLEAR CLEAR for ${tab.sourceId}`);

          try {
              const electron = (window as any).electronAPI;
              
              if (electron && electron.deleteAllDrawings) {
                  await electron.deleteAllDrawings(tab.sourceId);
              } else if (electron && electron.saveMasterDrawings) {
                  const res = await electron.loadMasterDrawings();
                  const master = res?.data || {};
                  delete master[tab.sourceId];
                  await electron.saveMasterDrawings(master);
              } else {
                  await deleteChartMeta(tab.sourceId);
              }

              updateTab(activeTabId, { drawings: [], folders: [] });
              
              alert("Chart metadata completely purged.");
          } catch (e: any) {
              console.error("Nuclear clear failed:", e);
              debugLog('Data', "Nuclear clear failed", e.message);
          }
      };

      window.addEventListener('redpill-nuclear-clear', handleNuclearClear);
      return () => window.removeEventListener('redpill-nuclear-clear', handleNuclearClear);
  }, [activeTabId, tabs]);

  // --- Persistence Logic ---
  
  const updateTab = useCallback((id: string, updates: Partial<TabSession>) => {
    setTabs(prev => prev.map(tab => {
      if (tab.id === id) {
        return { ...tab, ...updates };
      }
      return tab;
    }));
  }, []);
  
  // Persistence Hook Integration
  const activeSourceId = activeTab?.sourceId || null;
  
  const handleStateLoaded = useCallback((loadedState: ChartState | null) => {
    if (loadedState && activeTabId) {
        updateTab(activeTabId, {
            drawings: loadedState.drawings || [],
            folders: loadedState.folders || [],
            config: { ...(tabs.find(t=>t.id === activeTabId)?.config || {}), ...loadedState.config },
            visibleRange: loadedState.visibleRange || null,
        });
    }
  }, [activeTabId, updateTab, tabs]);
  
  const { isHydrating } = useSymbolPersistence({
      symbol: activeSourceId,
      onStateLoaded: handleStateLoaded,
      drawings: activeTab?.drawings || [],
      folders: activeTab?.folders || [],
      config: activeTab?.config,
      visibleRange: activeTab?.visibleRange || null,
  });

  // 1. Restore Session on Boot
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const savedState = await loadAppState();
        
        if (savedState && savedState.tabs && savedState.tabs.length > 0) {
          setTabs(savedState.tabs);
          setActiveTabId(savedState.activeTabId || savedState.tabs[0].id);
          setFavoriteTools(savedState.favoriteTools || ['trend_line', 'rectangle']);
          if (savedState.favoriteTimeframes) {
              setFavoriteTimeframes(savedState.favoriteTimeframes);
          }
          setIsFavoritesBarVisible(savedState.isFavoritesBarVisible ?? true);
          setIsStayInDrawingMode(savedState.isStayInDrawingMode ?? false);
          setIsDrawingSyncEnabled(savedState.isDrawingSyncEnabled ?? true);
          setIsMagnetMode(savedState.isMagnetMode ?? false);
          setLayoutMode(savedState.layoutMode || 'single');
          setLayoutTabIds(savedState.layoutTabIds || []);
          setIsSymbolSync(savedState.isSymbolSync ?? false);
          setIsIntervalSync(savedState.isIntervalSync ?? false);
          setIsCrosshairSync(savedState.isCrosshairSync ?? false);
          setIsTimeSync(savedState.isTimeSync ?? false);
          debugLog('Data', 'Session restored from local storage');
        }

        if (!isBridgeAvailable) {
            try {
                const dbHandle = await getDatabaseHandle();
                if (dbHandle) {
                    const perm = await dbHandle.queryPermission({ mode: 'readwrite' });
                    if (perm === 'granted') {
                        debugLog('Data', `Database handle permission granted.`);
                    }
                }
            } catch (e) {
                console.warn("Database restore failed", e);
                debugLog('Data', 'Database restore failed', e);
            }
        }
      } catch (e: any) {
        console.error("Failed to restore session:", e);
        debugLog('UI', 'Failed to restore session', e.message);
        setLastError(e.message);
      } finally {
        setIsRestoreComplete(true);
      }
    };
    restoreSession();
  }, [isBridgeAvailable]);

  // 2. Status Gatekeeper Effect
  useEffect(() => {
    if (!isRestoreComplete) return;

    if (activeTabId && tabs.length > 0) {
        setAppStatus('ACTIVE');
    } else {
        const timer = setTimeout(() => {
            setAppStatus('LIBRARY');
        }, 1000);
        return () => clearTimeout(timer);
    }
  }, [activeTabId, isRestoreComplete, tabs.length]);

  // 3. Auto-save session state
  useEffect(() => {
    if (appStatus !== 'ACTIVE') return;

    const saveTimeout = setTimeout(() => {
      const stateToSave = {
        tabs: tabs.map(t => ({
          ...t,
          fileState: undefined,
          // Do not persist large data arrays in the main app state
          data: [], 
          rawData: []
        })),
        activeTabId,
        favoriteTools,
        favoriteTimeframes,
        isFavoritesBarVisible,
        isStayInDrawingMode,
        isDrawingSyncEnabled,
        isMagnetMode,
        layoutMode,
        layoutTabIds,
        isSymbolSync,
        isIntervalSync,
        isCrosshairSync,
        isTimeSync,
        isMasterSyncActive
      };
      
      saveAppState(stateToSave).catch((e: any) => {
        console.warn("Auto-save failed:", e);
        debugLog('Data', 'Auto-save failed', e);
      });
    }, 1000); 

    return () => clearTimeout(saveTimeout);
  }, [tabs, activeTabId, favoriteTools, favoriteTimeframes, isFavoritesBarVisible, isStayInDrawingMode, isDrawingSyncEnabled, isMagnetMode, appStatus, layoutMode, layoutTabIds, isSymbolSync, isIntervalSync, isCrosshairSync, isTimeSync, isMasterSyncActive]);


  const updateActiveTab = useCallback((updates: Partial<TabSession>) => {
    if (activeTabId) {
        updateTab(activeTabId, updates);
    }
  }, [activeTabId, updateTab]);

  // --- History Handlers (Undo/Redo) ---
  const handleSaveHistory = useCallback(() => {
    if (!activeTab) return;
    
    const currentSnapshot: HistorySnapshot = {
        drawings: activeTab.drawings,
        folders: activeTab.folders,
        visibleRange: activeTab.visibleRange
    };

    updateActiveTab({
        undoStack: [...activeTab.undoStack.slice(-49), currentSnapshot], 
        redoStack: []
    });
  }, [activeTab, updateActiveTab]);
  
  // Updated Range Handler for Master Sync
  const handleVisibleRangeChange = useCallback((newRange: { from: number; to: number }) => {
      if (!activeTab) return;

      // Master Sync Logic: Broadcast range
      if (isMasterSyncActive && layoutTabIds.length > 1) {
          layoutTabIds.forEach(id => {
              // Update all visible charts (assuming Quantum Entanglement logic implies mirroring view)
              updateTab(id, { visibleRange: newRange });
          });
      } else {
          if (!activeTab.visibleRange) {
              updateActiveTab({ visibleRange: newRange });
              return;
          }
          
          const prevRange = activeTab.visibleRange;
          if (Math.abs(prevRange.from - newRange.from) < 0.01 && Math.abs(prevRange.to - newRange.to) < 0.01) {
              return;
          }

          updateActiveTab({ visibleRange: newRange });
      }
      
      const snapshot: HistorySnapshot = {
          drawings: activeTab.drawings,
          folders: activeTab.folders,
          visibleRange: activeTab.visibleRange || newRange
      };

      updateActiveTab({
          undoStack: [...activeTab.undoStack.slice(-49), snapshot],
          redoStack: []
      });
  }, [activeTab, updateActiveTab, isMasterSyncActive, layoutTabIds, updateTab]);


  const handleUndo = useCallback(() => {
     if (!activeTab || activeTab.undoStack.length === 0) return;
     
     const previousSnapshot = activeTab.undoStack[activeTab.undoStack.length - 1];
     const newUndoStack = activeTab.undoStack.slice(0, -1);
     
     const currentSnapshot: HistorySnapshot = {
         drawings: activeTab.drawings,
         folders: activeTab.folders,
         visibleRange: activeTab.visibleRange
     };

     updateActiveTab({
         drawings: previousSnapshot.drawings,
         folders: previousSnapshot.folders,
         visibleRange: previousSnapshot.visibleRange,
         undoStack: newUndoStack,
         redoStack: [...activeTab.redoStack, currentSnapshot]
     });
     debugLog('UI', 'Undo action performed');
  }, [activeTab, updateActiveTab]);

  const handleRedo = useCallback(() => {
     if (!activeTab || activeTab.redoStack.length === 0) return;
     
     const nextSnapshot = activeTab.redoStack[activeTab.redoStack.length - 1];
     const newRedoStack = activeTab.redoStack.slice(0, -1);

     const currentSnapshot: HistorySnapshot = {
         drawings: activeTab.drawings,
         folders: activeTab.folders,
         visibleRange: activeTab.visibleRange
     };

     updateActiveTab({
         drawings: nextSnapshot.drawings,
         folders: nextSnapshot.folders,
         visibleRange: nextSnapshot.visibleRange,
         undoStack: [...activeTab.undoStack, currentSnapshot],
         redoStack: newRedoStack
     });
     debugLog('UI', 'Redo action performed');
  }, [activeTab, updateActiveTab]);


  // --- Tab Bar Handlers ---
  const handleAddTab = () => {
    const newTab = createNewTab(undefined, 'New Chart');
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    if (layoutMode === 'single') setLayoutTabIds([newTab.id]);
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);

    let newActiveTabId = activeTabId;

    if (newTabs.length === 0) {
        newActiveTabId = '';
    } else if (activeTabId === id) {
        newActiveTabId = newTabs[newTabs.length - 1].id;
    }
    setActiveTabId(newActiveTabId);
    
    const newLayoutTabIds = layoutTabIds.filter(tid => tid !== id);
    if (layoutTabIds.includes(id)) {
        if (newLayoutTabIds.length === 0 && newTabs.length > 0) {
            setLayoutTabIds([newActiveTabId]);
        } else {
            setLayoutTabIds(newLayoutTabIds);
        }
    } else if (layoutMode === 'single' && newActiveTabId) {
        setLayoutTabIds([newActiveTabId]);
    }
  };

  const handleDetachTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    updateTab(id, { isDetached: true });
    debugLog('UI', `Tab detached: ${id}`);
  };

  const handleAttachTab = (id: string) => {
    updateTab(id, { isDetached: false });
    debugLog('UI', `Tab attached: ${id}`);
  };

  const handleSwitchTab = (id: string) => {
    setActiveTabId(id);
    if (layoutMode === 'single') setLayoutTabIds([id]);
  };

  const loadPreviousChunk = async (tab: TabSession, fileState: any) => {
      if (!fileState.hasMore || fileState.isLoading) return null;

      const fileSource = isBridgeAvailable ? tab.filePath : fileState.file;
      if (!fileSource) return null;

      const cursor = fileState.cursor;
      const end = cursor;
      const start = Math.max(0, end - CHUNK_SIZE);
      const isFirstChunkOfFile = start === 0;

      const text = await readChunk(fileSource, start, end);
      
      const combined = text + fileState.leftover;
      const lines = combined.split('\n');
      
      let newLeftover = '';
      let linesToParse = lines;

      if (!isFirstChunkOfFile) {
          newLeftover = lines[0];
          linesToParse = lines.slice(1);
      }
      
      const newPoints = parseCSVChunk(linesToParse);
      
      return {
          newPoints,
          newCursor: start,
          newLeftover,
          hasMore: start > 0
      };
  };

  const startFileStream = useCallback(async (fileSource: File | any, fileName: string, targetTabId?: string, forceTimeframe?: Timeframe, preservedReplay?: { isReplayMode: boolean, isAdvancedReplayMode: boolean, replayGlobalTime: number | null, isReplayPlaying: boolean }) => {
      window.dispatchEvent(new CustomEvent('GLOBAL_ASSET_CHANGE'));
      
      setLoading(true);
      setFilePanelOverride(null);
      setFilePanelFilter(null);
      
      debugLog('Data', `Starting file stream for ${fileName}`);
      try {
          let actualSource = fileSource;
          let filePath = undefined;
          
          if (isBridgeAvailable && fileSource.path) {
              actualSource = fileSource.path;
              filePath = fileSource.path;
          }

          const result = await loadProtectedSession(actualSource, CHUNK_SIZE);
          const { rawData, cursor, leftover, fileSize } = result;
          
          let displayTitle = getBaseSymbolName(fileName);
          if ((!displayTitle || displayTitle.trim() === '') && explorerFolderName && explorerFolderName !== 'Selected Folder') {
              displayTitle = explorerFolderName;
          }
          if (!displayTitle || displayTitle.trim() === '') {
              displayTitle = fileName.replace(/\.(csv|txt)$/i, '');
          }

          let initialTf = forceTimeframe;
          if (!initialTf) {
              initialTf = detectTimeframe(rawData);
          }
          
          const tfMs = getTimeframeDuration(initialTf);
          const { data: cleanRawData, stats: sanitizationReport } = sanitizeData(rawData, tfMs);
          
          debugLog('Data', `Sanitization Report for ${displayTitle}`, sanitizationReport);

          let currentRaw = cleanRawData;
          let currentFileState = {
              file: (actualSource instanceof File) ? actualSource : null,
              path: (typeof actualSource === 'string') ? actualSource : undefined,
              cursor: cursor,
              leftover: leftover,
              isLoading: false,
              hasMore: cursor > 0,
              fileSize
          };

          if (preservedReplay?.replayGlobalTime) {
              const target = preservedReplay.replayGlobalTime;
              let attempts = 0;
              const MAX_ATTEMPTS = 5; 
              
              while (
                  currentFileState.hasMore && 
                  currentRaw.length > 0 && 
                  currentRaw[0].time > target && 
                  attempts < MAX_ATTEMPTS
              ) {
                  const chunkRes = await loadPreviousChunk({ filePath } as any, currentFileState);
                  if (chunkRes) {
                      const { newPoints, newCursor, newLeftover, hasMore } = chunkRes;
                      const { data: cleanNew } = sanitizeData(newPoints, tfMs);
                      const combined = [...cleanNew, ...currentRaw];
                      combined.sort((a,b) => a.time - b.time);
                      
                      const unique: OHLCV[] = [];
                      if(combined.length > 0) {
                          unique.push(combined[0]);
                          for(let i=1; i<combined.length; i++) {
                              if(combined[i].time !== combined[i-1].time) unique.push(combined[i]);
                          }
                      }
                      
                      currentRaw = unique;
                      currentFileState = { ...currentFileState, cursor: newCursor, leftover: newLeftover, hasMore };
                      debugLog('Replay', `Buffer: Loaded extra chunk to reach ${new Date(target).toISOString()}. Range: ${new Date(currentRaw[0].time).toISOString()} - ${new Date(currentRaw[currentRaw.length-1].time).toISOString()}`);
                  } else {
                      break;
                  }
                  attempts++;
              }
          }

          const displayData = resampleData(currentRaw, initialTf);

          let replayIndex = displayData.length - 1;
          if (preservedReplay?.replayGlobalTime) {
              const idx = findIndexForTimestamp(displayData, preservedReplay.replayGlobalTime);
              replayIndex = idx;
              debugLog('Replay', `Resync: Found target time at index ${idx}`);
          }

          const sourceId = getSourceId(filePath || fileName, isBridgeAvailable ? 'asset' : 'local');

          const baseUpdates: Partial<TabSession> = {
              title: displayTitle,
              symbolId: getSymbolId(displayTitle),
              sourceId: sourceId,
              rawData: currentRaw,
              data: displayData,
              timeframe: initialTf,
              filePath: filePath,
              fileState: currentFileState,
              replayIndex: replayIndex,
              isReplayPlaying: preservedReplay?.isReplayPlaying ?? false,
              isReplayMode: preservedReplay?.isReplayMode ?? false,
              isAdvancedReplayMode: preservedReplay?.isAdvancedReplayMode ?? false,
              replayGlobalTime: preservedReplay?.replayGlobalTime ?? null,
              visibleRange: null
          };

          const tabIdToUpdate = targetTabId || activeTabId || crypto.randomUUID();

          setTabs(currentTabs => {
              const targetTabExists = currentTabs.find(t => t.id === tabIdToUpdate);
              
              if (!targetTabExists) {
                  const newTab = createNewTab(tabIdToUpdate);
                  const fullUpdates = { ...baseUpdates, drawings: [], folders: [] };
                  return [...currentTabs, { ...newTab, ...fullUpdates }];
              }

              return currentTabs.map(t => {
                  const shouldUpdate = 
                    (t.id === tabIdToUpdate) || 
                    (isSymbolSync && layoutTabIds.includes(t.id)) || 
                    (isMasterSyncActive && layoutTabIds.includes(t.id)); 
                  
                  if (shouldUpdate) {
                      const isSameSource = t.sourceId === sourceId;
                      return {
                          ...t,
                          ...baseUpdates,
                          drawings: isSameSource ? t.drawings : [],
                          folders: isSameSource ? t.folders : []
                      };
                  }
                  return t;
              });
          });

          if (!tabs.find(t => t.id === tabIdToUpdate)) {
              setActiveTabId(tabIdToUpdate);
              setLayoutTabIds([tabIdToUpdate]);
          }
          
          debugLog('Data', `File stream started successfully. Records: ${currentRaw.length}`);

      } catch (e: any) {
          console.error("Error starting stream:", e);
          debugLog('Data', 'Error starting file stream', e.message);
          setLastError(e.message);
          alert("Failed to load file.");
      } finally {
          setLoading(false);
      }
  }, [explorerFolderName, activeTabId, isSymbolSync, isMasterSyncActive, layoutTabIds, isBridgeAvailable, tabs, createNewTab]);

  const handleRequestHistory = useCallback(async (tabId: string) => {
      const tab = tabs.find(t => t.id === tabId);
      if (!tab || !tab.fileState || !tab.fileState.hasMore || tab.fileState.isLoading) return;

      updateTab(tabId, { 
          fileState: { ...tab.fileState, isLoading: true } 
      });

      try {
          const result = await loadPreviousChunk(tab, tab.fileState);
          if (result) {
              const { newPoints, newCursor, newLeftover, hasMore } = result;
              
              newPoints.sort((a: OHLCV, b: OHLCV) => a.time - b.time);
              
              const tfMs = getTimeframeDuration(tab.timeframe);
              const { data: cleanNewPoints } = sanitizeData(newPoints, tfMs);

              const fullRawData = [...cleanNewPoints, ...tab.rawData];
              fullRawData.sort((a, b) => a.time - b.time);
              
              const uniqueData: OHLCV[] = [];
              if (fullRawData.length > 0) {
                  uniqueData.push(fullRawData[0]);
                  for (let i = 1; i < fullRawData.length; i++) {
                      if (fullRawData[i].time !== fullRawData[i-1].time) {
                          uniqueData.push(fullRawData[i]);
                      }
                  }
              }
              
              const displayData = resampleData(uniqueData, tab.timeframe);
              
              updateTab(tabId, {
                  rawData: uniqueData,
                  data: displayData,
                  fileState: {
                      ...tab.fileState,
                      cursor: newCursor,
                      leftover: newLeftover,
                      hasMore: hasMore,
                      isLoading: false
                  },
                  replayIndex: tab.replayIndex + (displayData.length - tab.data.length)
              });
              debugLog('Data', `Loaded history chunk. Total records: ${uniqueData.length}`);
          } else {
               updateTab(tabId, { 
                   fileState: { ...tab.fileState, isLoading: false } 
               });
          }
      } catch (e: any) {
          console.error("Error loading history:", e);
          debugLog('Data', 'Error loading history', e.message);
          updateTab(tabId, { 
             fileState: { ...tab.fileState, isLoading: false } 
          });
      }
  }, [tabs, updateTab]);

  const handleTimeframeChange = async (id: string, tf: Timeframe) => {
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;
    
    debugLog('UI', `Timeframe change request: ${tf} for tab ${id}`);
    
    // Updated Target Logic: Respect Master Sync
    const targets = (isMasterSyncActive || (isIntervalSync && layoutTabIds.length > 1)) ? layoutTabIds : [id];

    targets.forEach(async (targetId) => {
        const targetTab = tabs.find(t => t.id === targetId);
        if (!targetTab) return;

        let currentReplayTime = targetTab.replayGlobalTime || (targetTab.data.length > 0 ? targetTab.data[targetTab.replayIndex].time : null);
        
        if (targetTab.isReplayPlaying) {
            const liveRef = getReplayTimeRef(targetId);
            if (liveRef.current !== null) {
                currentReplayTime = liveRef.current;
            }
        }

        const preservedReplay = {
            isReplayMode: targetTab.isReplayMode,
            isAdvancedReplayMode: targetTab.isAdvancedReplayMode,
            isReplayPlaying: targetTab.isReplayPlaying, 
            replayGlobalTime: currentReplayTime
        };

        const electron = (window as any).electronAPI;
        let searchList = explorerFiles;
        
        if (electron && electron.getInternalLibrary) {
            try {
                const internal = await electron.getInternalLibrary();
                if (Array.isArray(internal)) searchList = internal;
            } catch(e) {}
        }

        let matchingFileHandle = findFileForTimeframe(searchList, targetTab.title, tf);
        
        if (matchingFileHandle) {
            try {
                let file, name;
                if (matchingFileHandle.path) {
                    file = matchingFileHandle;
                    name = matchingFileHandle.name;
                } else {
                    file = await matchingFileHandle.getFile();
                    name = file.name;
                }
                
                debugLog('Data', `Found matching file for timeframe ${tf}: ${name}`);
                startFileStream(file, name, targetId, tf, preservedReplay);
            } catch (e) {
                console.error("Error syncing file for timeframe:", e);
            }
            return; 
        }

        const resampled = resampleData(targetTab.rawData, tf);
        
        let newReplayIndex = resampled.length - 1;
        let newGlobalTime = preservedReplay.replayGlobalTime;

        if (preservedReplay.isReplayMode || preservedReplay.isAdvancedReplayMode) {
            if (newGlobalTime) {
                const idx = findIndexForTimestamp(resampled, newGlobalTime);
                newReplayIndex = idx;
            }
        } else {
            newGlobalTime = null;
        }

        updateTab(targetId, {
          timeframe: tf,
          data: resampled,
          replayIndex: newReplayIndex,
          replayGlobalTime: newGlobalTime, 
          simulatedPrice: null,
          isReplayMode: preservedReplay.isReplayMode,
          isAdvancedReplayMode: preservedReplay.isAdvancedReplayMode,
          isReplayPlaying: preservedReplay.isReplayPlaying
        });
    });
  };

  const handleChartTypeChange = (type: 'candlestick' | 'line' | 'area') => {
    if (!activeTab) return;
    updateActiveTab({
      config: { ...activeTab.config, chartType: type }
    });
  };

  const toggleTheme = () => {
    if (!activeTab) return;
    const newTheme = activeTab.config.theme === 'dark' ? 'light' : 'dark';
    setTabs(prev => prev.map(t => ({
      ...t,
      config: { ...t.config, theme: newTheme }
    })));
  };

  const toggleIndicator = (key: string) => {
    if (!activeTab) return;
    if (key === 'sma') {
      updateActiveTab({ config: { ...activeTab.config, showSMA: !activeTab.config.showSMA } });
    } else if (key === 'volume') {
      updateActiveTab({ config: { ...activeTab.config, showVolume: !activeTab.config.showVolume } });
    }
  };

  const toggleGridlines = () => {
    if (!activeTab) return;
    updateActiveTab({
        config: { ...activeTab.config, showGridlines: !(activeTab.config.showGridlines ?? true) }
    });
  };

  const handleToggleReplay = () => {
    if (!activeTab) return;
    if (activeTab.isReplaySelecting) {
        updateActiveTab({ isReplayMode: false, isReplaySelecting: false, isReplayPlaying: false, simulatedPrice: null, replayGlobalTime: null, isAdvancedReplayMode: false });
        return;
    }
    if (activeTab.isReplayMode) {
        updateActiveTab({ isReplaySelecting: true, isReplayPlaying: false });
        return;
    }
    updateActiveTab({ isReplaySelecting: true, isReplayMode: false, isAdvancedReplayMode: false, isReplayPlaying: false });
  };

  const handleToggleAdvancedReplay = () => {
    if (!activeTab) return;
    if (activeTab.isReplaySelecting) {
        updateActiveTab({ isReplayMode: false, isReplaySelecting: false, isReplayPlaying: false, simulatedPrice: null, replayGlobalTime: null, isAdvancedReplayMode: false });
        return;
    }
    if (activeTab.isAdvancedReplayMode) {
        updateActiveTab({ isReplaySelecting: true, isReplayPlaying: false });
        return;
    }
    updateActiveTab({ isAdvancedReplayMode: true, isReplaySelecting: true, isReplayMode: false, isReplayPlaying: false });
    alert("Advanced Replay: Select a starting point. This mode plays back in real-time speed.");
  };

  const handleLayoutAction = async (action: string) => {
    if (!activeTab) return;
    
    if (action === 'save-csv') {
        if (activeTab.data.length === 0) return;
        const headers = ['time','open','high','low','close','volume'];
        const rows = activeTab.data.map((d: OHLCV) => 
           `${new Date(d.time).toISOString()},${d.open},${d.high},${d.low},${d.close},${d.volume}`
        );
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${activeTab.title || 'chart'}_data.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else if (action === 'new') {
        handleAddTab();
    } else if (action === 'rename') {
        const newTitle = prompt("Enter new name for this chart:", activeTab.title);
        if (newTitle) updateActiveTab({ title: newTitle });
    } else if (action === 'full') {
        setLayoutMode('single');
        setLayoutTabIds([activeTabId]);
    } else if (action === 'split-2x') {
        setLayoutMode('split-2x');
        const newLayoutIds = [activeTabId];
        if (tabs.length > 1) {
            const other = tabs.find(t => t.id !== activeTabId);
            if (other) newLayoutIds.push(other.id);
        } else {
            const newTab = createNewTab(undefined, 'Secondary Chart');
            setTabs(prev => [...prev, newTab]);
            newLayoutIds.push(newTab.id);
        }
        setLayoutTabIds(newLayoutIds);
    } else if (action === 'split-4x') {
        setLayoutMode('split-4x');
        const newLayoutIds = [activeTabId];
        const existingOtherIds = tabs.filter(t => t.id !== activeTabId).map(t => t.id);
        
        let toAdd = 3;
        for (let i = 0; i < existingOtherIds.length && toAdd > 0; i++) {
            newLayoutIds.push(existingOtherIds[i]);
            toAdd--;
        }
        
        if (toAdd > 0) {
            const newTabsToAdd: TabSession[] = [];
            for(let i=0; i<toAdd; i++) {
                const nt = createNewTab(undefined, `Chart ${4-toAdd+i+1}`);
                newTabsToAdd.push(nt);
                newLayoutIds.push(nt.id);
            }
            setTabs(prev => [...prev, ...newTabsToAdd]);
        }
        setLayoutTabIds(newLayoutIds);
    } else if (action === 'sync-symbol') setIsSymbolSync(!isSymbolSync);
    else if (action === 'sync-interval') setIsIntervalSync(!isIntervalSync);
    else if (action === 'sync-crosshair') setIsCrosshairSync(!isCrosshairSync);
    else if (action === 'sync-time') setIsTimeSync(!isTimeSync);
    else if (action === 'save') {
        const stateToSave = {
            tabs: tabs.map(t => ({ ...t, fileState: undefined })),
            activeTabId,
            favoriteTools,
            favoriteTimeframes,
            isFavoritesBarVisible,
            isStayInDrawingMode,
            isDrawingSyncEnabled,
            isMagnetMode,
            layoutMode,
            layoutTabIds,
            isSymbolSync,
            isIntervalSync,
            isCrosshairSync,
            isTimeSync,
            isMasterSyncActive
        };
        await saveAppState(stateToSave);
        alert("Layout successfully saved to local storage.");
    } else if (action === 'open-layout-folder') {
        setIsLibraryOpen(true);
        setFilePanelFilter(null);
        
        const electron = (window as any).electronAPI;
        if (electron && electron.getDatabasePath && electron.watchFolder) {
            try {
                const dbPath = await electron.getDatabasePath();
                electron.watchFolder(dbPath);
            } catch(e) { console.error("Failed to watch layout DB", e); }
        } else {
             try {
                 const handle = await getDatabaseHandle();
                 if (handle) {
                     const files = await scanRecursive(handle);
                     setFilePanelOverride({
                         path: handle.name,
                         files: files
                     });
                 } else {
                     alert("No Database folder connected in web mode.");
                 }
             } catch(e) { console.error(e); }
        }
    } else if (action === 'export-layout') {
        const exportObj = {
            version: '1.0',
            timestamp: Date.now(),
            layout: {
                mode: layoutMode,
                tabIds: layoutTabIds,
                sync: { symbol: isSymbolSync, interval: isIntervalSync, crosshair: isCrosshairSync, time: isTimeSync }
            },
            tabs: tabs.map(t => ({
                id: t.id,
                title: t.title,
                timeframe: t.timeframe,
                config: t.config,
                drawings: t.drawings,
                folders: t.folders,
                trades: t.trades
            })),
            activeTabId,
            settings: { favorites: favoriteTools, favoritesVisible: isFavoritesBarVisible, magnet: isMagnetMode, stayInDrawing: isStayInDrawingMode, favoriteTimeframes, isDrawingSyncEnabled, isMasterSyncActive }
        };
        const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `RedPill_Layout_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else if (action === 'import-layout') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const imported = JSON.parse(text);
                
                if (!imported.tabs || !Array.isArray(imported.tabs)) throw new Error("Invalid format");

                const newTabs = imported.tabs.map((it: any) => {
                    const base = createNewTab(it.id, it.title);
                    return {
                        ...base,
                        ...it,
                        data: [], 
                        rawData: [],
                        undoStack: [],
                        redoStack: []
                    };
                });

                setTabs(newTabs);
                if (imported.activeTabId) setActiveTabId(imported.activeTabId);
                if (imported.layout) {
                    setLayoutMode(imported.layout.mode || 'single');
                    setLayoutTabIds(imported.layout.tabIds || []);
                    if (imported.layout.sync) {
                        setIsSymbolSync(imported.layout.sync.symbol ?? false);
                        setIsIntervalSync(imported.layout.sync.interval ?? false);
                        setIsCrosshairSync(imported.layout.sync.crosshair ?? false);
                        setIsTimeSync(imported.layout.sync.time ?? false);
                    }
                }
                if (imported.settings) {
                    setFavoriteTools(imported.settings.favorites || []);
                    setIsFavoritesBarVisible(imported.settings.favoritesVisible ?? true);
                    setIsMagnetMode(imported.settings.magnet ?? false);
                    setIsStayInDrawingMode(imported.settings.stayInDrawing ?? false);
                    setIsDrawingSyncEnabled(imported.settings.isDrawingSyncEnabled ?? true);
                    setIsMasterSyncActive(imported.settings.isMasterSyncActive ?? false);
                    if (imported.settings.favoriteTimeframes) setFavoriteTimeframes(imported.settings.favoriteTimeframes);
                }

                alert("Layout imported successfully. Please reload your data files if needed.");
                debugLog('Data', 'Layout imported successfully');
            } catch (err: any) {
                alert("Failed to import layout file. Please ensure it is a valid Red Pill Layout JSON.");
                debugLog('Data', 'Import layout failed', err.message);
                setLastError(err.message);
            }
        };
        input.click();
    }
  };

  const handleClearAll = useCallback(async () => {
    if (!activeTab || activeTab.drawings.length === 0) {
        if (activeTab.drawings.length === 0) alert("No drawings to clear.");
        return;
    }

    if (!window.confirm('Are you sure you want to permanently remove all drawings for this asset? This cannot be undone.')) {
        return;
    }
    
    updateActiveTab({ drawings: [], folders: [] });
    window.dispatchEvent(new CustomEvent('redpill-force-clear'));

    const sourceId = activeTab.sourceId;
    if (sourceId) {
        try {
            const electron = (window as any).electronAPI;
            if (electron && electron.deleteAllDrawings) {
                await electron.deleteAllDrawings(sourceId);
            } else if (electron && electron.saveMasterDrawings) {
                const res = await electron.loadMasterDrawings();
                const master = res?.data || {};
                delete master[sourceId];
                await electron.saveMasterDrawings(master);
            } else {
                await deleteChartMeta(sourceId);
            }
            debugLog('Data', `Drawings permanently cleared for ${sourceId}`);
        } catch (e: any) {
            console.error("Failed to clear persisted drawings:", e);
            debugLog('Data', 'Persistence clear failed', e.message);
        }
    }
  }, [activeTab, updateActiveTab]);

  const handleOrderSubmit = useCallback(async (order: any) => {
      if (!activeTab) return;
      
      const newTrade: Trade = {
          id: crypto.randomUUID(),
          sourceId: tradeSourceId,
          timestamp: activeTab.isReplayMode || activeTab.isAdvancedReplayMode 
            ? activeTab.replayGlobalTime || Date.now()
            : Date.now(),
          mode: activeTab.isReplayMode || activeTab.isAdvancedReplayMode ? 'simulated' : 'live',
          ...order
      };
      
      // 1. Update React State (UI)
      updateActiveTab({ trades: [...(activeTab.trades || []), newTrade] });

      // 2. Hybrid Persistence (Local Storage + Unsaved Flag)
      addOrder(newTrade);
      
      // 3. Optional: Persist to CSV-Specific store (Legacy Logic kept for compatibility)
      const electron = (window as any).electronAPI;
      if (electron) {
          try {
            await electron.saveTrade(newTrade);
          } catch (e) { console.error(e); }
      }
      
  }, [activeTab, tradeSourceId, updateActiveTab, addOrder]);

  const handleFileUpload = useCallback((file: File) => {
    startFileStream(file, file.name);
  }, [startFileStream]);

  const handleLibraryFileSelect = async (fileHandle: any) => {
    setLoading(true);
    try {
      let file, name;
      
      if (fileHandle.path) {
          file = fileHandle;
          name = fileHandle.name;
      } else {
          file = await fileHandle.getFile();
          name = file.name;
      }
      
      startFileStream(file, name);
    } catch (e: any) {
      console.error("Error reading file from library:", e);
      debugLog('Data', 'Error reading library file', e.message);
      setLastError(e.message);
      alert('Error reading selected file.');
      setLoading(false);
    }
  };
  
  const handleFileSelect = async (fileHandle: any, timeframe: Timeframe) => {
    await startFileStream(fileHandle, fileHandle.name, undefined, timeframe, undefined);
    setAppStatus('ACTIVE');
  };

  const handleOpenStickyNotesFolder = useCallback(async () => {
      setIsLibraryOpen(true);
      setFilePanelFilter(() => (f: any) => f.name.toLowerCase().endsWith('.notes') || f.name.includes('sticky_notes') || (f.path && f.path.includes('notes')));
      
      const electron = (window as any).electronAPI;
      if (electron && electron.getDatabasePath && electron.watchFolder) {
          try {
              const dbPath = await electron.getDatabasePath();
              electron.watchFolder(dbPath); 
          } catch (e) { console.error("Failed to open Sticky Notes folder", e); }
      } else {
          setFilePanelOverride({
              path: 'Sticky Notes (Virtual)',
              files: [{ name: 'sticky_notes.json', kind: 'file', handle: null }]
          });
      }
  }, []);

  const { currentPrice, prevPrice } = useMemo(() => {
    if (!activeTab || activeTab.data.length === 0) return { currentPrice: 0, prevPrice: 0 };
    
    if (activeTab.isReplayMode || activeTab.isAdvancedReplayMode) {
        if (activeTab.simulatedPrice !== null) {
            const idx = Math.min(activeTab.replayIndex, activeTab.data.length - 1);
            const currentCandleOpen = activeTab.data[idx].open;
            const prevClose = idx > 0 ? activeTab.data[idx-1].close : currentCandleOpen;
            return { currentPrice: activeTab.simulatedPrice, prevPrice: prevClose };
        } else {
           const idx = Math.min(activeTab.replayIndex, activeTab.data.length - 1);
           const price = activeTab.data[idx].close;
           const prev = idx > 0 ? activeTab.data[idx-1].close : price;
           return { currentPrice: price, prevPrice: prev };
        }
    }
    
    const lastIdx = activeTab.data.length - 1;
    const price = activeTab.data[lastIdx].close;
    const prev = lastIdx > 0 ? activeTab.data[lastIdx - 1].close : price;
    return { currentPrice: price, prevPrice: prev };
  }, [activeTab?.data, activeTab?.isReplayMode, activeTab?.isAdvancedReplayMode, activeTab?.replayIndex, activeTab?.simulatedPrice]);

  const currentSymbolName = getBaseSymbolName(activeTab?.title || '');
  const activeDataSource = activeTab?.fileState ? (activeTab.fileState.file?.name || activeTab.fileState.path || 'Unknown Source') : (activeTab?.data?.length > 0 ? 'Mock Data' : 'None');

  const areAllDrawingsLocked = useMemo(() => {
    if (!activeTab || !activeTab.drawings || activeTab.drawings.length === 0) return false;
    return activeTab.drawings.every((d: Drawing) => d.properties.locked);
  }, [activeTab]);

  const areAllDrawingsHidden = useMemo(() => {
      if (!activeTab || !activeTab.drawings || activeTab.drawings.length === 0) return false;
      return activeTab.drawings.every((d: Drawing) => !(d.properties.visible ?? true));
  }, [activeTab]);

  const renderLayout = () => {
    if (!activeTab) return null;

    if (layoutMode === 'single') {
        return (
            <div className="flex-1 flex flex-col relative min-w-0">
                {activeTab.isDetached ? (
                    <div className="flex-1 flex flex-col items-center justify-center bg-app-bg text-text-tertiary gap-4">
                        <ExternalLink size={48} className="opacity-20" />
                        <div className="text-center">
                            <h2 className="text-lg font-medium text-text-primary">Tab is detached</h2>
                            <p className="text-sm mt-1">This chart is currently open in another window.</p>
                        </div>
                        <button 
                            onClick={() => handleAttachTab(activeTab.id)}
                            className="px-4 py-2 bg-accent-bg hover:bg-accent-hover-bg text-white rounded text-sm font-medium transition-colors"
                        >
                            Bring back to main window
                        </button>
                    </div>
                ) : (
                    <ChartWorkspace 
                        key={activeTab.sourceId || activeTab.id}
                        tab={activeTab} 
                        updateTab={(updates: Partial<TabSession>) => updateActiveTab(updates)}
                        onTimeframeChange={(tf: Timeframe) => handleTimeframeChange(activeTab.id, tf)}
                        loading={loading}
                        favoriteTools={favoriteTools}
                        onSelectTool={setActiveToolId}
                        activeToolId={activeToolId}
                        isFavoritesBarVisible={isFavoritesBarVisible}
                        onSaveHistory={handleSaveHistory}
                        onRequestHistory={() => handleRequestHistory(activeTab.id)}
                        areDrawingsLocked={areAllDrawingsLocked}
                        isMagnetMode={isMagnetMode}
                        isStayInDrawingMode={isStayInDrawingMode}
                        isLayersPanelOpen={false} 
                        onToggleLayers={() => setActivePanel('layers')}
                        onVisibleRangeChange={handleVisibleRangeChange}
                        favoriteTimeframes={favoriteTimeframes}
                        onBackToLibrary={() => setAppStatus('LIBRARY')}
                        isDrawingSyncEnabled={isDrawingSyncEnabled}
                        drawings={activeTab.drawings}
                        onUpdateDrawings={(newDrawings: Drawing[]) => {
                            const sourceId = activeTab.sourceId;
                            setTabs(prev => prev.map(t => {
                                if (t.sourceId === sourceId) {
                                    return { ...t, drawings: newDrawings };
                                }
                                return t;
                            }));
                        }}
                        isHydrating={loading || isHydrating}
                        isMasterSyncActive={isMasterSyncActive}
                        onToggleMasterSync={() => setIsMasterSyncActive(!isMasterSyncActive)}
                        liveTimeRef={getReplayTimeRef(activeTab.id)}
                        
                        onSyncTrades={syncOrdersToDb}
                        hasUnsavedTrades={hasUnsavedOrders}
                        selectedDrawingId={selectedDrawingId}
                        onSelectDrawing={handleSelectDrawing}
                    />
                )}
            </div>
        );
    }

    const gridColsClass = layoutMode === 'split-2x' ? 'grid-cols-2' : 'grid-cols-2';
    const gridRowsClass = layoutMode === 'split-2x' ? 'grid-rows-1' : 'grid-rows-2';

    return (
        <div className={`flex-1 grid ${gridColsClass} ${gridRowsClass} gap-1 p-1 bg-app-bg`}>
            {layoutTabIds.map((tabId, idx) => {
                const tab = tabs.find(t => t.id === tabId);
                if (!tab) return <div key={idx} className="bg-app-bg border border-app-border" />;
                
                return (
                    <div 
                        key={`${tab.id}-${idx}`} 
                        className={`relative flex flex-col border ${tab.id === activeTabId ? 'border-accent-bg ring-1 ring-accent-bg/50 z-10' : 'border-app-border opacity-80 hover:opacity-100 transition-opacity'}`}
                        onClick={() => setActiveTabId(tab.id)}
                    >
                        <ChartWorkspace 
                            key={tab.sourceId || tab.id}
                            tab={tab} 
                            updateTab={(updates: Partial<TabSession>) => updateTab(tab.id, updates)}
                            onTimeframeChange={(tf: Timeframe) => handleTimeframeChange(tab.id, tf)}
                            loading={false} 
                            favoriteTools={tab.id === activeTabId ? favoriteTools : []}
                            onSelectTool={tab.id === activeTabId ? setActiveToolId : undefined}
                            activeToolId={tab.id === activeTabId ? activeToolId : 'cross'}
                            isFavoritesBarVisible={tab.id === activeTabId ? isFavoritesBarVisible : false}
                            onSaveHistory={tab.id === activeTabId ? handleSaveHistory : undefined}
                            onRequestHistory={() => handleRequestHistory(tab.id)}
                            areDrawingsLocked={areAllDrawingsLocked}
                            isMagnetMode={isMagnetMode}
                            isStayInDrawingMode={isStayInDrawingMode}
                            isLayersPanelOpen={false} 
                            onToggleLayers={tab.id === activeTabId ? () => setActivePanel('layers') : undefined}
                            onVisibleRangeChange={tab.id === activeTabId ? handleVisibleRangeChange : undefined}
                            favoriteTimeframes={favoriteTimeframes}
                            onBackToLibrary={() => setAppStatus('LIBRARY')}
                            isDrawingSyncEnabled={isDrawingSyncEnabled}
                            drawings={tab.drawings}
                            onUpdateDrawings={(newDrawings: Drawing[]) => {
                                const sourceId = tab.sourceId;
                                setTabs(prev => prev.map(t => {
                                    if (t.sourceId === sourceId) {
                                        return { ...t, drawings: newDrawings };
                                    }
                                    return t;
                                }));
                            }}
                            isHydrating={isHydrating && tab.id === activeTabId}
                            isMasterSyncActive={isMasterSyncActive}
                            onToggleMasterSync={() => setIsMasterSyncActive(!isMasterSyncActive)}
                            liveTimeRef={getReplayTimeRef(tab.id)}
                            
                            onSyncTrades={syncOrdersToDb}
                            hasUnsavedTrades={hasUnsavedOrders}
                            selectedDrawingId={tab.id === activeTabId ? selectedDrawingId : null}
                            onSelectDrawing={tab.id === activeTabId ? handleSelectDrawing : undefined}
                        />
                    </div>
                );
            })}
        </div>
    );
  };
  
  const renderContent = () => {
    switch(appStatus) {
        case 'BOOT':
            return <SplashController />;
        case 'LIBRARY':
            return (
                <>
                    <AssetLibrary
                        isOpen={true}
                        onClose={() => {}} // Cannot close in this state
                        onSelect={(file: any, tf: Timeframe) => handleFileSelect(file, tf)}
                        databasePath={isBridgeAvailable ? 'Internal Database' : databasePath}
                        files={isBridgeAvailable ? [] : explorerFiles}
                        onRefresh={isBridgeAvailable ? undefined : connectDefaultDatabase}
                    />
                    <div className="fixed bottom-4 right-4 z-[9999]">
                        <button
                            onClick={handleDebugBypass}
                            className="px-3 py-2 bg-danger hover:opacity-80 text-white text-xs font-mono rounded shadow-lg border border-red-500 transition-colors"
                        >
                            DEBUG: Enter Workspace
                        </button>
                    </div>
                </>
            );
        case 'ACTIVE':
            if (!activeTab) return null; // Guard against render before activeTab is set
            return (
                <div className="flex flex-col h-screen bg-app-bg text-text-primary overflow-hidden">
                    <DeveloperTools 
                        activeDataSource={activeDataSource} 
                        lastError={lastError} 
                        chartRenderTime={chartRenderTime}
                        onOpenStickyNotes={() => window.dispatchEvent(new CustomEvent('TOGGLE_STICKY_NOTE_MANAGER'))}
                    />

                    {/* Database Inspector Modal */}
                    <DatabaseBrowser 
                        isOpen={isDbBrowserOpen} 
                        onClose={() => setIsDbBrowserOpen(false)} 
                        mode={dbMode} 
                    />

                    <CandleSettingsDialog 
                        isOpen={isCandleSettingsOpen}
                        onClose={() => setIsCandleSettingsOpen(false)}
                        config={activeTab.config}
                        onUpdateConfig={(updates: Partial<ChartConfig>) => updateActiveTab({ config: { ...activeTab.config, ...updates } })}
                    />

                    <BackgroundSettingsDialog 
                        isOpen={isBackgroundSettingsOpen}
                        onClose={() => setIsBackgroundSettingsOpen(false)}
                        config={activeTab.config}
                        onUpdateConfig={(updates: Partial<ChartConfig>) => updateActiveTab({ config: { ...activeTab.config, ...updates } })}
                    />
                    
                    <AssetLibrary
                        isOpen={isAssetLibraryOpen}
                        onClose={() => setIsAssetLibraryOpen(false)}
                        onSelect={(file: any, tf: Timeframe) => {
                            startFileStream(file, file.name, undefined, tf);
                            setIsAssetLibraryOpen(false);
                        }}
                        databasePath={isBridgeAvailable ? 'Internal Database' : databasePath}
                        files={isBridgeAvailable ? [] : explorerFiles}
                        onRefresh={isBridgeAvailable ? undefined : connectDefaultDatabase}
                    />

                    <TabBar 
                        tabs={tabs} 
                        activeTabId={activeTabId} 
                        onSwitch={handleSwitchTab} 
                        onClose={handleCloseTab} 
                        onDetach={handleDetachTab} 
                        onAdd={handleAddTab} 
                    />

                    <Toolbar 
                        onFileUpload={handleFileUpload}
                        toggleTheme={toggleTheme}
                        isDark={activeTab.config.theme === 'dark'}
                        onToggleIndicator={toggleIndicator}
                        showSMA={activeTab.config.showSMA}
                        showVolume={activeTab.config.showVolume}
                        chartType={activeTab.config.chartType}
                        onChartTypeChange={handleChartTypeChange}
                        onUndo={handleUndo}
                        onRedo={handleRedo}
                        onToggleReplay={handleToggleReplay}
                        isReplayMode={activeTab.isReplayMode || activeTab.isReplaySelecting}
                        onToggleAdvancedReplay={handleToggleAdvancedReplay}
                        isAdvancedReplayMode={activeTab.isAdvancedReplayMode}
                        onOpenLocalData={() => setIsAssetLibraryOpen(true)}
                        onLayoutAction={handleLayoutAction}
                        isSymbolSync={isSymbolSync}
                        isIntervalSync={isIntervalSync}
                        isCrosshairSync={isCrosshairSync}
                        isTimeSync={isTimeSync}
                        onToggleTradingPanel={() => setIsTradingPanelOpen(!isTradingPanelOpen)}
                        isTradingPanelOpen={isTradingPanelOpen}
                        isLibraryOpen={isLibraryOpen}
                        onToggleLibrary={() => setIsLibraryOpen(!isLibraryOpen)}
                        onToggleLayers={() => setActivePanel('layers')}
                        isLayersOpen={activePanel === 'layers'}
                        onOpenCandleSettings={() => setIsCandleSettingsOpen(true)}
                        onOpenBackgroundSettings={() => setIsBackgroundSettingsOpen(true)}
                        tickerSymbol={currentSymbolName}
                        tickerPrice={currentPrice}
                        tickerPrevPrice={prevPrice}
                        favoriteTimeframes={favoriteTimeframes}
                        onToggleFavoriteTimeframe={toggleFavoriteTimeframe}
                        showGridlines={activeTab.config.showGridlines ?? true}
                        onToggleGridlines={toggleGridlines}
                        showCrosshair={activeTab.config.showCrosshair ?? true}
                        onToggleCrosshair={() => updateActiveTab({ config: { ...activeTab.config, showCrosshair: !(activeTab.config.showCrosshair ?? true) } })}
                        
                        onAddStickyNote={addStickyNote}
                        isStickyNotesVisible={isStickyNotesVisible}
                        onToggleStickyNotes={toggleStickyNotes}
                        onOpenStickyNotesFolder={handleOpenStickyNotesFolder}
                    />

                    <div className="flex flex-1 overflow-hidden relative">
                        <DrawingPalette 
                            activeToolId={activeToolId}
                            onSelectTool={setActiveToolId}
                            favoriteTools={favoriteTools}
                            onToggleFavorite={toggleFavorite}
                            isFavoritesBarVisible={isFavoritesBarVisible}
                            onToggleFavoritesBar={() => setIsFavoritesBarVisible(!isFavoritesBarVisible)}
                            areAllDrawingsLocked={areAllDrawingsLocked}
                            areAllDrawingsHidden={areAllDrawingsHidden}
                            isMagnetMode={isMagnetMode}
                            onToggleMagnet={() => setIsMagnetMode(!isMagnetMode)}
                            isStayInDrawingMode={isStayInDrawingMode}
                            onToggleStayInDrawingMode={() => setIsStayInDrawingMode(!isStayInDrawingMode)}
                            onClearAll={handleClearAll}
                        />

                        <FilePanel 
                            isOpen={isLibraryOpen}
                            onClose={() => setIsLibraryOpen(false)}
                            onFileSelect={handleLibraryFileSelect}
                            onFileListChange={setExplorerFiles}
                            onFolderNameChange={setExplorerFolderName}
                            overrideFiles={filePanelOverride?.files}
                            overridePath={filePanelOverride?.path}
                            fileFilter={filePanelFilter}
                        />

                        {renderLayout()}
                        
                        <Sidebar activePanel={activePanel} onTogglePanel={setActivePanel}>
                            {activePanel === 'watchlist' && (
                                <Watchlist 
                                    currentSymbol={currentSymbolName} 
                                    onSelectSymbol={(s) => {
                                        console.log('Watchlist selected:', s);
                                    }} 
                                />
                            )}
                            {activePanel === 'layers' && (
                                <LayersPanel 
                                    drawings={activeTab.drawings} 
                                    onUpdateDrawings={(newDrawings: Drawing[]) => { 
                                        handleSaveHistory(); 
                                        updateActiveTab({ drawings: newDrawings });
                                    }} 
                                    selectedDrawingIds={new Set(selectedDrawingId ? [selectedDrawingId] : [])} 
                                    onSelectDrawing={handleSelectDrawing} 
                                    onClose={() => setActivePanel('none')} 
                                    position={undefined} 
                                    folders={activeTab.folders} 
                                    onUpdateFolders={(folders: Folder[]) => { 
                                        updateActiveTab({ folders }); 
                                    }} 
                                    sourceId={activeTab.sourceId} 
                                />
                            )}
                            {activePanel === 'details' && (
                                <div className="p-4 text-slate-400 text-xs">
                                    <h3 className="font-bold text-white mb-2">Symbol Info</h3>
                                    <p>Symbol: {currentSymbolName}</p>
                                    <p>Source: {activeDataSource}</p>
                                    <p>Timeframe: {activeTab.timeframe}</p>
                                </div>
                            )}
                        </Sidebar>

                        <StickyNoteOverlay 
                            notes={notes}
                            isVisible={isStickyNotesVisible}
                            onUpdateNote={updateStickyNote}
                            onRemoveNote={removeStickyNote}
                            onFocusNote={bringStickyNoteToFront}
                        />
                        
                        {!isTradingPanelDetached && (
                            <TradingPanel 
                                isOpen={isTradingPanelOpen}
                                onClose={() => setIsTradingPanelOpen(false)}
                                symbol={activeTab.title}
                                currentPrice={currentPrice}
                                isDetached={false}
                                onToggleDetach={() => setIsTradingPanelDetached(true)}
                                onOrderSubmit={handleOrderSubmit}
                            />
                        )}
                    </div>

                    {tabs.map(tab => {
                        if (tab.isDetached) {
                            return (
                                <Popout 
                                    key={tab.id} 
                                    title={`${tab.title} - Red Pill Charting`} 
                                    onClose={() => handleAttachTab(tab.id)}
                                >
                                    <ChartWorkspace 
                                        key={tab.sourceId || tab.id}
                                        tab={activeTab}
                                        updateTab={(updates: Partial<TabSession>) => updateTab(tab.id, updates)}
                                        onTimeframeChange={(tf: Timeframe) => handleTimeframeChange(tab.id, tf)}
                                        favoriteTools={[]} 
                                        onSelectTool={() => {}}
                                        activeToolId=""
                                        areDrawingsLocked={false}
                                        isMagnetMode={false}
                                        favoriteTimeframes={favoriteTimeframes}
                                        onBackToLibrary={() => setAppStatus('LIBRARY')}
                                        drawings={tab.drawings}
                                        onUpdateDrawings={(newDrawings: Drawing[]) => updateTab(tab.id, { drawings: newDrawings })}
                                        isHydrating={isHydrating && tab.id === activeTabId}
                                    />
                                </Popout>
                            );
                        }
                        return null;
                    })}
                    
                    {isTradingPanelDetached && isTradingPanelOpen && (
                        <Popout 
                            title="Trading Panel" 
                            onClose={() => setIsTradingPanelDetached(false)}
                        >
                            <TradingPanel 
                                isOpen={true}
                                onClose={() => setIsTradingPanelOpen(false)}
                                symbol={activeTab.title}
                                currentPrice={currentPrice}
                                isDetached={true}
                                onToggleDetach={() => setIsTradingPanelDetached(false)}
                                onOrderSubmit={handleOrderSubmit}
                            />
                        </Popout>
                    )}
                </div>
            );
        default:
            return null;
    }
  }

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-app-bg">
        {renderContent()}
        <StickyNoteManager />
        <LayoutManager />
    </div>
  );
};

export default App;