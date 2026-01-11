import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { FilePanel } from './components/FilePanel';
import { TabBar } from './components/TabBar';
import { ChartWorkspace } from './components/ChartWorkspace';
import { Popout } from './components/Popout';
import { TradingPanel } from './components/TradingPanel';
import { CandleSettingsDialog } from './components/CandleSettingsDialog';
import { BackgroundSettingsDialog } from './components/BackgroundSettingsDialog';
import { AssetLibrary } from './components/AssetLibrary';
import { SplashController } from './components/SplashController';
import { OHLCV, Timeframe, TabSession, Trade, HistorySnapshot, ChartState } from './types';
import { parseCSVChunk, resampleData, findFileForTimeframe, getBaseSymbolName, detectTimeframe, getLocalChartData, readChunk, sanitizeData, getTimeframeDuration, getSymbolId, getSourceId } from './utils/dataUtils';
import { saveAppState, loadAppState, getDatabaseHandle, deleteChartMeta } from './utils/storage';
import { ExternalLink } from 'lucide-react';
import { DeveloperTools } from './components/DeveloperTools';
import { debugLog } from './utils/logger';
import { useFileSystem } from './hooks/useFileSystem';
import { useTradePersistence } from './hooks/useTradePersistence';
import { useSymbolPersistence } from './hooks/useSymbolPersistence';

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
  
  // Synchronization Toggles
  const [isSymbolSync, setIsSymbolSync] = useState(false);
  const [isIntervalSync, setIsIntervalSync] = useState(false);
  const [isCrosshairSync, setIsCrosshairSync] = useState(false);
  const [isTimeSync, setIsTimeSync] = useState(false);

  // Layout Slots: Tracks which tab is in which pane position
  const [layoutTabIds, setLayoutTabIds] = useState<string[]>([]);

  // Settings Dialogs State
  const [isCandleSettingsOpen, setIsCandleSettingsOpen] = useState(false);
  const [isBackgroundSettingsOpen, setIsBackgroundSettingsOpen] = useState(false);

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
  
  // Dev Diagnostic States
  const [lastError, setLastError] = useState<string | null>(null);
  const [chartRenderTime, setChartRenderTime] = useState<number | null>(null);

  // Electron File System Hook
  const { checkFileExists, isBridgeAvailable, currentPath: databasePath, connectDefaultDatabase } = useFileSystem();

  // Performance Listener
  useEffect(() => {
    const handlePerf = (e: any) => {
      setChartRenderTime(e.detail.duration);
    };
    window.addEventListener('chart-render-perf', handlePerf);
    return () => window.removeEventListener('chart-render-perf', handlePerf);
  }, []);

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
                  // This avoids stale state from a JSON file.
              });
          }
      }
  }, []); // Run once on mount

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

      // Poll check every 2 seconds if in Bridge mode
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
              // 1. Clear Backend via Dedicated Endpoint (Mandate 12.3)
              const electron = (window as any).electronAPI;
              
              if (electron && electron.deleteAllDrawings) {
                  await electron.deleteAllDrawings(tab.sourceId);
              } else if (electron && electron.saveMasterDrawings) {
                  // Fallback for older electron bridge
                  const res = await electron.loadMasterDrawings();
                  const master = res?.data || {};
                  delete master[tab.sourceId];
                  await electron.saveMasterDrawings(master);
              } else {
                  // Web Fallback
                  await deleteChartMeta(tab.sourceId);
              }

              // 2. Clear Active Tab State
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
  
  // FIX: Destructure 'isHydrating' from the hook to make it available in the component scope.
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
        }, 1000); // Small delay to avoid flash of library on boot
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
        isTimeSync
      };
      
      saveAppState(stateToSave).catch(e => {
        console.warn("Auto-save failed:", e);
        debugLog('Data', 'Auto-save failed', e);
      });
    }, 1000); 

    return () => clearTimeout(saveTimeout);
  }, [tabs, activeTabId, favoriteTools, favoriteTimeframes, isFavoritesBarVisible, isStayInDrawingMode, isDrawingSyncEnabled, isMagnetMode, appStatus, layoutMode, layoutTabIds, isSymbolSync, isIntervalSync, isCrosshairSync, isTimeSync]);


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
  
  const handleVisibleRangeChange = useCallback((newRange: { from: number; to: number }) => {
      if (!activeTab) return;

      if (!activeTab.visibleRange) {
          updateActiveTab({ visibleRange: newRange });
          return;
      }
      
      const prevRange = activeTab.visibleRange;
      if (Math.abs(prevRange.from - newRange.from) < 0.01 && Math.abs(prevRange.to - newRange.to) < 0.01) {
          return;
      }

      const snapshot: HistorySnapshot = {
          drawings: activeTab.drawings,
          folders: activeTab.folders,
          visibleRange: prevRange
      };

      updateActiveTab({
          visibleRange: newRange,
          undoStack: [...activeTab.undoStack.slice(-49), snapshot],
          redoStack: []
      });
  }, [activeTab, updateActiveTab]);


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

  const startFileStream = useCallback(async (fileSource: File | any, fileName: string, targetTabId?: string, forceTimeframe?: Timeframe, preservedReplay?: { isReplayMode: boolean, isAdvancedReplayMode: boolean, replayGlobalTime: number | null }) => {
      window.dispatchEvent(new CustomEvent('GLOBAL_ASSET_CHANGE'));
      
      setLoading(true);
      debugLog('Data', `Starting file stream for ${fileName}`);
      try {
          let actualSource = fileSource;
          let filePath = undefined;
          
          if (isBridgeAvailable && fileSource.path) {
              actualSource = fileSource.path;
              filePath = fileSource.path;
          }

          const result = await getLocalChartData(actualSource, CHUNK_SIZE);
          
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

          const displayData = resampleData(cleanRawData, initialTf);

          let replayIndex = displayData.length - 1;
          if (preservedReplay?.replayGlobalTime) {
              const idx = displayData.findIndex(d => d.time >= preservedReplay.replayGlobalTime!);
              if (idx !== -1) replayIndex = idx;
          }

          // Use the robust source ID generator which handles timeframe stripping
          const sourceId = getSourceId(filePath || fileName, isBridgeAvailable ? 'asset' : 'local');

          // Base update object with new data
          const baseUpdates: Partial<TabSession> = {
              title: displayTitle,
              symbolId: getSymbolId(displayTitle),
              sourceId: sourceId,
              rawData: cleanRawData,
              data: displayData,
              timeframe: initialTf,
              filePath: filePath,
              fileState: {
                  file: (actualSource instanceof File) ? actualSource : null,
                  path: (typeof actualSource === 'string') ? actualSource : undefined,
                  cursor: cursor,
                  leftover: leftover,
                  isLoading: false,
                  hasMore: cursor > 0,
                  fileSize
              },
              replayIndex: replayIndex,
              isReplayPlaying: false,
              isReplayMode: preservedReplay?.isReplayMode ?? false,
              isAdvancedReplayMode: preservedReplay?.isAdvancedReplayMode ?? false,
              replayGlobalTime: preservedReplay?.replayGlobalTime ?? null,
              visibleRange: null // Reset view on new data load
          };

          const tabIdToUpdate = targetTabId || activeTabId || crypto.randomUUID();

          setTabs(currentTabs => {
              const targetTabExists = currentTabs.find(t => t.id === tabIdToUpdate);
              
              if (!targetTabExists) {
                  // Create new tab
                  const newTab = createNewTab(tabIdToUpdate);
                  // New tabs start empty drawings
                  const fullUpdates = { ...baseUpdates, drawings: [], folders: [] };
                  // Update layout and active state as side effects outside this reducer? 
                  // No, we need to do it here or after. 
                  // Since we are inside setTabs updater, we can't side-effect easily.
                  // We'll return the new array.
                  return [...currentTabs, { ...newTab, ...fullUpdates }];
              }

              // Update existing tabs (Single or Sync)
              return currentTabs.map(t => {
                  const shouldUpdate = (t.id === tabIdToUpdate) || (isSymbolSync && layoutTabIds.includes(t.id));
                  
                  if (shouldUpdate) {
                      // STATE LIFT: Check if we are staying on the same source (e.g. timeframe switch)
                      // If sourceId matches, KEEP existing drawings/folders.
                      // If sourceId changes, RESET them (to be rehydrated by persistence hook).
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

          // Ensure active tab and layout if it was a new tab
          if (!tabs.find(t => t.id === tabIdToUpdate)) {
              setActiveTabId(tabIdToUpdate);
              setLayoutTabIds([tabIdToUpdate]);
          }
          
          debugLog('Data', `File stream started successfully. Records: ${cleanRawData.length}`);

      } catch (e: any) {
          console.error("Error starting stream:", e);
          debugLog('Data', 'Error starting file stream', e.message);
          setLastError(e.message);
          alert("Failed to load file.");
      } finally {
          setLoading(false);
      }
  }, [explorerFolderName, activeTabId, isSymbolSync, layoutTabIds, isBridgeAvailable, tabs, createNewTab]);

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
              
              newPoints.sort((a, b) => a.time - b.time);
              
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
  
  const handleTimeframeChange = async (id: string, tf: Timeframe) => {
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;
    
    debugLog('UI', `Timeframe change request: ${tf} for tab ${id}`);
    const targets = (isIntervalSync && layoutTabIds.length > 1) ? layoutTabIds : [id];

    targets.forEach(async (targetId) => {
        const targetTab = tabs.find(t => t.id === targetId);
        if (!targetTab) return;

        const preservedReplay = {
            isReplayMode: targetTab.isReplayMode,
            isAdvancedReplayMode: targetTab.isAdvancedReplayMode,
            replayGlobalTime: targetTab.replayGlobalTime || (targetTab.data.length > 0 ? targetTab.data[targetTab.replayIndex].time : null)
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
                const idx = resampled.findIndex(d => d.time >= newGlobalTime!);
                if (idx !== -1) {
                    newReplayIndex = idx;
                } else {
                    newReplayIndex = resampled.length - 1;
                }
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
          isAdvancedReplayMode: preservedReplay.isAdvancedReplayMode
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
    
    // If currently selecting, cancel selection (Exit)
    if (activeTab.isReplaySelecting) {
        updateActiveTab({ 
            isReplayMode: false, 
            isReplaySelecting: false, 
            isReplayPlaying: false,
            simulatedPrice: null,
            replayGlobalTime: null,
            isAdvancedReplayMode: false
        });
        return;
    }

    // If already in standard replay, enter selection mode (Recut)
    if (activeTab.isReplayMode) {
        updateActiveTab({ 
            isReplaySelecting: true,
            isReplayPlaying: false
        });
        return;
    }

    // Start fresh standard replay selection
    updateActiveTab({ 
        isReplaySelecting: true,
        isReplayMode: false,
        isAdvancedReplayMode: false,
        isReplayPlaying: false
    });
  };

  const handleToggleAdvancedReplay = () => {
    if (!activeTab) return;
    
    // If currently selecting, cancel selection (Exit)
    if (activeTab.isReplaySelecting) {
        updateActiveTab({ 
            isAdvancedReplayMode: false, 
            isReplayMode: false,
            isReplaySelecting: false, 
            isReplayPlaying: false,
            simulatedPrice: null,
            replayGlobalTime: null,
            isAdvancedReplayMode: false
        });
        return;
    }

    // If already in advanced replay, enter selection mode (Recut)
    if (activeTab.isAdvancedReplayMode) {
        updateActiveTab({ 
            isReplaySelecting: true, 
            isReplayPlaying: false 
        });
        return;
    }
     
    // Start fresh advanced replay selection
    updateActiveTab({ 
        isAdvancedReplayMode: true, 
        isReplaySelecting: true, 
        isReplayMode: false,
        isReplayPlaying: false
    });
    alert("Advanced Replay: Select a starting point. This mode plays back in real-time speed.");
  };

  const handleLayoutAction = async (action: string) => {
    if (!activeTab) return;
    
    if (action === 'save-csv') {
        if (activeTab.data.length === 0) return;
        const headers = ['time','open','high','low','close','volume'];
        const rows = activeTab.data.map(d => 
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
            isTimeSync
        };
        await saveAppState(stateToSave);
        alert("Layout successfully saved to local storage.");
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
            settings: { favorites: favoriteTools, favoritesVisible: isFavoritesBarVisible, magnet: isMagnetMode, stayInDrawing: isStayInDrawingMode, favoriteTimeframes, isDrawingSyncEnabled }
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
    
    // Clear UI state immediately
    updateActiveTab({ drawings: [], folders: [] });
    
    // Send event to clean chart
    window.dispatchEvent(new CustomEvent('redpill-force-clear'));

    const sourceId = activeTab.sourceId;
    if (sourceId) {
        try {
            // Mandate 12.3: Nuclear Clear Backend Call
            const electron = (window as any).electronAPI;
            
            // Prefer dedicated clear command if available
            if (electron && electron.deleteAllDrawings) {
                await electron.deleteAllDrawings(sourceId);
            } else if (electron && electron.saveMasterDrawings) {
                const res = await electron.loadMasterDrawings();
                const master = res?.data || {};
                // Actually remove the key entirely as per "Nuclear" requirement
                delete master[sourceId];
                await electron.saveMasterDrawings(master);
            } else {
                // Fallback for web
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
      
      const electron = (window as any).electronAPI;
      if (electron) {
          try {
            await electron.saveTrade(newTrade);
            debugLog('Data', `Trade submitted and saved for ${tradeSourceId}`, newTrade);
          } catch (e) {
            console.error("Failed to save trade:", e);
            debugLog('Data', 'Trade submission failed', e);
          }
      }
      
      updateActiveTab({ trades: [...(activeTab.trades || []), newTrade] });
      
  }, [activeTab, tradeSourceId, updateActiveTab]);

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
    return activeTab.drawings.every(d => d.properties.locked);
  }, [activeTab]);

  const areAllDrawingsHidden = useMemo(() => {
      if (!activeTab || !activeTab.drawings || activeTab.drawings.length === 0) return false;
      return activeTab.drawings.every(d => !(d.properties.visible ?? true));
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
                        updateTab={(updates) => updateActiveTab(updates)}
                        onTimeframeChange={(tf) => handleTimeframeChange(activeTab.id, tf)}
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
                        isLayersPanelOpen={isLayersPanelOpen}
                        onToggleLayers={() => setIsLayersPanelOpen(false)}
                        onVisibleRangeChange={handleVisibleRangeChange}
                        favoriteTimeframes={favoriteTimeframes}
                        onBackToLibrary={() => setAppStatus('LIBRARY')}
                        isDrawingSyncEnabled={isDrawingSyncEnabled}
                        onToggleDrawingSync={() => setIsDrawingSyncEnabled(prev => !prev)}
                        drawings={activeTab.drawings}
                        onUpdateDrawings={(newDrawings) => updateActiveTab({ drawings: newDrawings })}
                        isHydrating={loading || isHydrating}
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
                            updateTab={(updates) => updateTab(tab.id, updates)}
                            onTimeframeChange={(tf) => handleTimeframeChange(tab.id, tf)}
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
                            isLayersPanelOpen={tab.id === activeTabId ? isLayersPanelOpen : false}
                            onToggleLayers={tab.id === activeTabId ? () => setIsLayersPanelOpen(false) : undefined}
                            isSyncing={isCrosshairSync || isTimeSync}
                            onVisibleRangeChange={tab.id === activeTabId ? handleVisibleRangeChange : undefined}
                            favoriteTimeframes={favoriteTimeframes}
                            onBackToLibrary={() => setAppStatus('LIBRARY')}
                            isDrawingSyncEnabled={isDrawingSyncEnabled}
                            onToggleDrawingSync={() => setIsDrawingSyncEnabled(prev => !prev)}
                            drawings={tab.drawings}
                            onUpdateDrawings={(newDrawings) => updateTab(tab.id, { drawings: newDrawings })}
                            isHydrating={isHydrating && tab.id === activeTabId}
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
                        onSelect={handleFileSelect}
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
                    />

                    <CandleSettingsDialog 
                        isOpen={isCandleSettingsOpen}
                        onClose={() => setIsCandleSettingsOpen(false)}
                        config={activeTab.config}
                        onUpdateConfig={(updates) => updateActiveTab({ config: { ...activeTab.config, ...updates } })}
                    />

                    <BackgroundSettingsDialog 
                        isOpen={isBackgroundSettingsOpen}
                        onClose={() => setIsBackgroundSettingsOpen(false)}
                        config={activeTab.config}
                        onUpdateConfig={(updates) => updateActiveTab({ config: { ...activeTab.config, ...updates } })}
                    />
                    
                    <AssetLibrary
                        isOpen={isAssetLibraryOpen}
                        onClose={() => setIsAssetLibraryOpen(false)}
                        onSelect={(file, tf) => {
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
                        onToggleLayers={() => setIsLayersPanelOpen(!isLayersPanelOpen)}
                        isLayersOpen={isLayersPanelOpen}
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
                    />

                    <div className="flex flex-1 overflow-hidden relative">
                        <Sidebar 
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
                        />

                        {renderLayout()}
                        
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
                                        tab={tab}
                                        updateTab={(updates) => updateTab(tab.id, updates)}
                                        onTimeframeChange={(tf) => handleTimeframeChange(tab.id, tf)}
                                        favoriteTools={[]} 
                                        onSelectTool={() => {}}
                                        activeToolId=""
                                        areDrawingsLocked={false}
                                        isMagnetMode={false}
                                        favoriteTimeframes={favoriteTimeframes}
                                        onBackToLibrary={() => setAppStatus('LIBRARY')}
                                        drawings={tab.drawings}
                                        onUpdateDrawings={(newDrawings) => updateTab(tab.id, { drawings: newDrawings })}
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
    </div>
  );
};

export default App;