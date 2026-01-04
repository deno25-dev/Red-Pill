
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
import { OHLCV, Timeframe, TabSession, Trade, HistorySnapshot, Drawing } from './types';
import { parseCSVChunk, resampleData, findFileForTimeframe, getBaseSymbolName, detectTimeframe, getLocalChartData, readChunk, sanitizeData, getTimeframeDuration } from './utils/dataUtils';
import { saveAppState, loadAppState, getDatabaseHandle, deleteChartMeta, saveChartMeta } from './utils/storage';
import { ExternalLink } from 'lucide-react';
import { DeveloperTools } from './components/DeveloperTools';
import { debugLog } from './utils/logger';
import { useFileSystem } from './hooks/useFileSystem';
import { useTradePersistence } from './hooks/useTradePersistence';

// Chunk size for file streaming: 2MB
const CHUNK_SIZE = 2 * 1024 * 1024; 

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
  const [areDrawingsLocked, setAreDrawingsLocked] = useState(false); 
  const [isMagnetMode, setIsMagnetMode] = useState(false);
  const [isStayInDrawingMode, setIsStayInDrawingMode] = useState(false);
  
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
              electron.getDrawingsState().then((state: any) => {
                  if (state.areLocked !== undefined) setAreDrawingsLocked(state.areLocked);
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
        autoScale: true
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
      drawings: [],
      visibleRange: null, // Initialize with null, chart will set it
      undoStack: [],
      redoStack: [],
      trades: []
    };
  }, []);
  
  const activeTab = useMemo(() => 
    tabs.find(t => t.id === activeTabId) || tabs[0] || createNewTab(), 
  [tabs, activeTabId, createNewTab]);

  // Trade Persistence for Active Tab
  const tradeSourceId = activeTab.filePath || `${activeTab.title}_${activeTab.timeframe}`;
  const { saveTrade } = useTradePersistence(tradeSourceId);

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
          if (!tab) return;

          const sourceId = tab.filePath || (tab.title ? `${tab.title}_${tab.timeframe}` : null);
          if (!sourceId) return;

          debugLog('Data', `Executing NUCLEAR CLEAR for ${sourceId}`);

          try {
              // 1. Clear IndexedDB Entry
              await deleteChartMeta(sourceId);
              
              // 2. Clear Electron Sidecar (if applicable)
              const electron = (window as any).electronAPI;
              if (electron && tab.filePath) {
                  await electron.deleteMeta(tab.filePath); // Assume this command exists or fails gracefully
              }

              // 3. Clear Active Tab State
              updateTab(activeTabId, { drawings: [] });
              
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
                        // Files will be loaded via AssetLibrary or FilePanel, no need to store handle here
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
          fileState: undefined 
        })),
        activeTabId,
        favoriteTools,
        favoriteTimeframes,
        isFavoritesBarVisible,
        isStayInDrawingMode,
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
  }, [tabs, activeTabId, favoriteTools, favoriteTimeframes, isFavoritesBarVisible, isStayInDrawingMode, isMagnetMode, appStatus, layoutMode, layoutTabIds, isSymbolSync, isIntervalSync, isCrosshairSync, isTimeSync]);


  const updateTab = useCallback((id: string, updates: Partial<TabSession>) => {
    setTabs(prev => prev.map(tab => {
      if (tab.id === id) {
        return { ...tab, ...updates };
      }
      return tab;
    }));
  }, []);

  const updateActiveTab = useCallback((updates: Partial<TabSession>) => {
    if (activeTabId) {
        updateTab(activeTabId, updates);
    }
  }, [activeTabId, updateTab]);

  // --- History Handlers (Undo/Redo) ---
  const handleSaveHistory = useCallback(() => {
    if (!activeTab) return;
    
    // Create a snapshot of the CURRENT state before the new action is applied
    const currentSnapshot: HistorySnapshot = {
        drawings: activeTab.drawings,
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
         visibleRange: activeTab.visibleRange
     };

     updateActiveTab({
         drawings: previousSnapshot.drawings,
         visibleRange: previousSnapshot.visibleRange, // Restore View
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
         visibleRange: activeTab.visibleRange
     };

     updateActiveTab({
         drawings: nextSnapshot.drawings,
         visibleRange: nextSnapshot.visibleRange, // Restore View
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

      // Logic handles both Web (File object) and Electron (Path string)
      const fileSource = isBridgeAvailable ? tab.filePath : fileState.file;
      if (!fileSource) return null;

      const cursor = fileState.cursor;
      const end = cursor;
      const start = Math.max(0, end - CHUNK_SIZE);
      const isFirstChunkOfFile = start === 0;

      // Use explicit readChunk utility
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
      // NUCLEAR RESET SIGNAL: Freeze all imperative systems before loading new data
      window.dispatchEvent(new CustomEvent('GLOBAL_ASSET_CHANGE'));
      
      setLoading(true);
      debugLog('Data', `Starting file stream for ${fileName}`);
      try {
          // Robust Bridge: If in bridge mode, fileSource might be a handle with .path
          // or just the File object from legacy input
          let actualSource = fileSource;
          let filePath = undefined;
          
          if (isBridgeAvailable && fileSource.path) {
              actualSource = fileSource.path;
              filePath = fileSource.path;
          }

          // Command: get_local_chart_data
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
          
          // --- SANITIZATION LAYER ---
          const tfMs = getTimeframeDuration(initialTf);
          const { data: cleanRawData, stats: sanitizationReport } = sanitizeData(rawData, tfMs);
          
          debugLog('Data', `Sanitization Report for ${displayTitle}`, sanitizationReport);
          if (sanitizationReport.fixedZeroes > 0 || sanitizationReport.fixedLogic > 0 || sanitizationReport.filledGaps > 0) {
              // Optional: notify user via small toast, or just rely on debug log
              console.log(`Loaded ${sanitizationReport.totalRecords} candles. Fixed ${sanitizationReport.fixedZeroes + sanitizationReport.fixedLogic} errors, filled ${sanitizationReport.filledGaps} gaps.`);
          }
          // --------------------------

          const displayData = resampleData(cleanRawData, initialTf);

          let replayIndex = displayData.length - 1;
          if (preservedReplay?.replayGlobalTime) {
              const idx = displayData.findIndex(d => d.time >= preservedReplay.replayGlobalTime!);
              if (idx !== -1) replayIndex = idx;
          }

          const updates: Partial<TabSession> = {
              title: displayTitle,
              rawData: cleanRawData,
              data: displayData,
              timeframe: initialTf,
              filePath: filePath, // Store bridge path
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
              drawings: [], // Hard Reset: Clear drawings to prevent ghosting
              visibleRange: null // Hard Reset: Reset view
          };

          const tabIdToUpdate = targetTabId || activeTabId || crypto.randomUUID();

          // If no active tab exists (e.g., first launch from LIBRARY), create one
          if (!tabs.find(t => t.id === tabIdToUpdate) || tabs.length === 0) {
              const newTab = createNewTab(tabIdToUpdate);
              const updatedNewTab = { ...newTab, ...updates };
              setTabs([updatedNewTab]);
              setActiveTabId(tabIdToUpdate);
              setLayoutTabIds([tabIdToUpdate]);
          } else {
              if (isSymbolSync && layoutTabIds.length > 1) {
                  layoutTabIds.forEach(id => {
                      updateTab(id, updates);
                  });
              } else {
                  updateTab(tabIdToUpdate, updates);
              }
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
  }, [explorerFolderName, activeTabId, isSymbolSync, layoutTabIds, updateTab, isBridgeAvailable, tabs, createNewTab]);

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
              
              // Sort before sanitizing to ensure time order within chunk
              newPoints.sort((a, b) => a.time - b.time);
              
              // Sanitize the new chunk
              const tfMs = getTimeframeDuration(tab.timeframe);
              const { data: cleanNewPoints } = sanitizeData(newPoints, tfMs);

              const fullRawData = [...cleanNewPoints, ...tab.rawData];
              // Re-sort combined to be safe
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
  }, [tabs, updateTab, isBridgeAvailable]);


  const handleFileUpload = useCallback((file: File) => {
    startFileStream(file, file.name);
  }, [startFileStream]);

  // Updated to handle both WebHandle and Bridge Object
  const handleLibraryFileSelect = async (fileHandle: any) => {
    setLoading(true);
    try {
      let file, name;
      
      // Check if this is a bridge file (plain object) or web handle
      if (fileHandle.path) {
          // Bridge mode: We don't have a File object, we use the handle which contains the path
          file = fileHandle; // Pass the whole object to startFileStream
          name = fileHandle.name;
      } else {
          // Web API
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

  const handleToggleReplay = () => {
    if (!activeTab) return;
    if (activeTab.isReplayMode || activeTab.isReplaySelecting) {
        updateActiveTab({ 
            isReplayMode: false, 
            isReplaySelecting: false, 
            isReplayPlaying: false,
            simulatedPrice: null,
            replayGlobalTime: null
        });
    } else {
        updateActiveTab({ 
            isReplaySelecting: true,
            isReplayMode: false,
            isAdvancedReplayMode: false,
            isReplayPlaying: false
        });
    }
  };

  const handleToggleAdvancedReplay = () => {
    if (!activeTab) return;
     if (activeTab.isAdvancedReplayMode) {
        updateActiveTab({ 
            isAdvancedReplayMode: false, 
            isReplaySelecting: false, 
            isReplayPlaying: false,
            simulatedPrice: null,
            replayGlobalTime: null
        });
     } else {
        updateActiveTab({ 
            isAdvancedReplayMode: true, 
            isReplaySelecting: true, 
            isReplayMode: false,
            isReplayPlaying: false
        });
        alert("Advanced Replay: Select a starting point. This mode plays back in real-time speed.");
     }
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
                trades: t.trades
            })),
            activeTabId,
            settings: { favorites: favoriteTools, favoritesVisible: isFavoritesBarVisible, magnet: isMagnetMode, stayInDrawing: isStayInDrawingMode, favoriteTimeframes }
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
      // 1. Guard Clauses
      if (!activeTab) return;
      if (activeTab.drawings.length === 0) {
          alert("No drawings to clear.");
          return;
      }

      // 2. Confirmation Dialog
      if (!window.confirm('Are you sure you want to remove all drawings? This action will clear the chart and local database.')) {
          return;
      }

      // 3. Save History (Undo capability)
      handleSaveHistory();

      // 4. "Registry" / State Clear
      const emptyDrawings: Drawing[] = [];
      updateActiveTab({ drawings: emptyDrawings });
      
      // DISPATCH FORCE CLEAR EVENT for Chart Component
      window.dispatchEvent(new CustomEvent('redpill-force-clear'));

      // 5. Force Persistence Clear (Nuclear Option)
      // We bypass the debounced auto-saver to ensure immediate disk/DB flush
      const sourceId = activeTab.filePath || (activeTab.title ? `${activeTab.title}_${activeTab.timeframe}` : null);
      
      if (sourceId) {
          const nuclearState = {
              sourceId,
              timestamp: Date.now(),
              drawings: [], // Explicit empty
              config: activeTab.config,
              visibleRange: activeTab.visibleRange
          };

          try {
              // Electron Bridge
              const electron = (window as any).electronAPI;
              if (electron && activeTab.filePath) {
                  await electron.saveMeta(activeTab.filePath, nuclearState);
              } else {
                  // Web Mode
                  await saveChartMeta(nuclearState);
              }
              debugLog('Data', `Nuclear clear executed for ${sourceId}`);
          } catch (e: any) {
              console.error("Nuclear clear failed:", e);
              debugLog('Data', "Nuclear clear failed", e.message);
          }
      }
  }, [activeTab, handleSaveHistory, updateActiveTab]);

  const handleOrderSubmit = useCallback(async (order: any) => {
      if (!activeTab) return;
      
      const newTrade: Trade = {
          id: crypto.randomUUID(),
          // Use file path as source ID if available, else a generated key
          sourceId: tradeSourceId || 'unknown_source',
          timestamp: Date.now(),
          ...order
      };
      
      await saveTrade(newTrade);
      // Hook updates trades automatically, effect syncs to tab
  }, [activeTab, tradeSourceId, saveTrade]);

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
  }, [activeTab.data, activeTab.isReplayMode, activeTab.isAdvancedReplayMode, activeTab.replayIndex, activeTab.simulatedPrice]);

  const currentSymbolName = getBaseSymbolName(activeTab.title);

  // Derive active data source string for dev tools
  const activeDataSource = activeTab.fileState ? (activeTab.fileState.file?.name || activeTab.fileState.path || 'Unknown Source') : (activeTab.data.length > 0 ? 'Mock Data' : 'None');

  const renderLayout = () => {
    if (layoutMode === 'single') {
        return (
            <div className="flex-1 flex flex-col relative min-w-0">
                {activeTab.isDetached ? (
                    <div className="flex-1 flex flex-col items-center justify-center bg-[#0f172a] text-slate-500 gap-4">
                        <ExternalLink size={48} className="opacity-20" />
                        <div className="text-center">
                            <h2 className="text-lg font-medium text-slate-300">Tab is detached</h2>
                            <p className="text-sm mt-1">This chart is currently open in another window.</p>
                        </div>
                        <button 
                            onClick={() => handleAttachTab(activeTab.id)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors"
                        >
                            Bring back to main window
                        </button>
                    </div>
                ) : (
                    <ChartWorkspace 
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
                        areDrawingsLocked={areDrawingsLocked}
                        isMagnetMode={isMagnetMode}
                        isStayInDrawingMode={isStayInDrawingMode}
                        onVisibleRangeChange={handleVisibleRangeChange}
                        favoriteTimeframes={favoriteTimeframes}
                        onBackToLibrary={() => setAppStatus('LIBRARY')}
                    />
                )}
            </div>
        );
    }

    const gridColsClass = layoutMode === 'split-2x' ? 'grid-cols-2' : 'grid-cols-2';
    const gridRowsClass = layoutMode === 'split-2x' ? 'grid-rows-1' : 'grid-rows-2';

    return (
        <div className={`flex-1 grid ${gridColsClass} ${gridRowsClass} gap-1 p-1 bg-[#0f172a]`}>
            {layoutTabIds.map((tabId, idx) => {
                const tab = tabs.find(t => t.id === tabId);
                if (!tab) return <div key={idx} className="bg-[#0f172a] border border-[#334155]" />;
                
                return (
                    <div 
                        key={`${tab.id}-${idx}`} 
                        className={`relative flex flex-col border ${tab.id === activeTabId ? 'border-blue-600 ring-1 ring-blue-600/50 z-10' : 'border-[#334155] opacity-80 hover:opacity-100 transition-opacity'}`}
                        onClick={() => setActiveTabId(tab.id)}
                    >
                        <ChartWorkspace 
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
                            areDrawingsLocked={areDrawingsLocked}
                            isMagnetMode={isMagnetMode}
                            isStayInDrawingMode={isStayInDrawingMode}
                            isSyncing={isCrosshairSync || isTimeSync}
                            onVisibleRangeChange={tab.id === activeTabId ? handleVisibleRangeChange : undefined}
                            favoriteTimeframes={favoriteTimeframes}
                            onBackToLibrary={() => setAppStatus('LIBRARY')}
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
                <AssetLibrary
                    isOpen={true}
                    onClose={() => {}} // Cannot close in this state
                    onSelect={handleFileSelect}
                    databasePath={isBridgeAvailable ? 'Internal Database' : databasePath}
                    files={isBridgeAvailable ? [] : explorerFiles}
                    onRefresh={isBridgeAvailable ? undefined : connectDefaultDatabase}
                />
            );
        case 'ACTIVE':
            return (
                <div className="flex flex-col h-screen bg-[#0f172a] text-slate-200 overflow-hidden">
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
                        onOpenCandleSettings={() => setIsCandleSettingsOpen(true)}
                        onOpenBackgroundSettings={() => setIsBackgroundSettingsOpen(true)}
                        tickerSymbol={currentSymbolName}
                        tickerPrice={currentPrice}
                        tickerPrevPrice={prevPrice}
                        favoriteTimeframes={favoriteTimeframes}
                        onToggleFavoriteTimeframe={toggleFavoriteTimeframe}
                    />

                    <div className="flex flex-1 overflow-hidden relative">
                        <Sidebar 
                        activeToolId={activeToolId}
                        onSelectTool={setActiveToolId}
                        favoriteTools={favoriteTools}
                        onToggleFavorite={toggleFavorite}
                        isFavoritesBarVisible={isFavoritesBarVisible}
                        onToggleFavoritesBar={() => setIsFavoritesBarVisible(!isFavoritesBarVisible)}
                        areDrawingsLocked={areDrawingsLocked}
                        onToggleDrawingsLock={() => setAreDrawingsLocked(!areDrawingsLocked)}
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
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-[#020617]">
        {renderContent()}
    </div>
  );
};

export default App;
