
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { FilePanel } from './components/FilePanel';
import { TabBar } from './components/TabBar';
import { ChartWorkspace } from './components/ChartWorkspace';
import { Popout } from './components/Popout';
import { TradingPanel } from './components/TradingPanel';
import { WatchlistPanel } from './components/WatchlistPanel';
import { CandleSettingsDialog } from './components/CandleSettingsDialog';
import { BackgroundSettingsDialog } from './components/BackgroundSettingsDialog';
import { OHLCV, ChartConfig, Timeframe, TabSession, Trade, WatchlistItem, HistorySnapshot } from './types';
import { generateMockData, parseCSVChunk, resampleData, findFileForTimeframe, getBaseSymbolName, scanRecursive, detectTimeframe } from './utils/dataUtils';
import { saveAppState, loadAppState, getDatabaseHandle, saveDatabaseHandle, clearDatabaseHandle, getWatchlist, addToWatchlist, removeFromWatchlist } from './utils/storage';
import { MOCK_DATA_COUNT } from './constants';
import { ExternalLink } from 'lucide-react';

// Chunk size for file streaming: 2MB
const CHUNK_SIZE = 2 * 1024 * 1024; 

type LayoutMode = 'single' | 'split-2x' | 'split-4x';

const App: React.FC = () => {
  // --- State Management ---
  const [isAppReady, setIsAppReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
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

  // Watchlist State
  const [isWatchlistOpen, setIsWatchlistOpen] = useState(false);
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);

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

  // Data Explorer (Files in the ad-hoc panel)
  const [explorerFiles, setExplorerFiles] = useState<any[]>([]);
  const [explorerFolderName, setExplorerFolderName] = useState<string>('');

  // Database (Files in the specific 'Database' folder)
  const [databaseFiles, setDatabaseFiles] = useState<any[]>([]);
  const [databaseHandle, setDatabaseHandle] = useState<any>(null);
  
  const databaseInputRef = useRef<HTMLInputElement>(null);

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

  // --- Persistence Logic ---

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
          setIsWatchlistOpen(savedState.isWatchlistOpen ?? false);
          setIsStayInDrawingMode(savedState.isStayInDrawingMode ?? false);
          setIsMagnetMode(savedState.isMagnetMode ?? false);
          setLayoutMode(savedState.layoutMode || 'single');
          setLayoutTabIds(savedState.layoutTabIds || []);
          
          setIsSymbolSync(savedState.isSymbolSync ?? false);
          setIsIntervalSync(savedState.isIntervalSync ?? false);
          setIsCrosshairSync(savedState.isCrosshairSync ?? false);
          setIsTimeSync(savedState.isTimeSync ?? false);
        } else {
          const mock = generateMockData(MOCK_DATA_COUNT);
          const newTab = createNewTab('default-tab', 'BTC/USD', mock);
          setTabs([newTab]);
          setActiveTabId(newTab.id);
          setLayoutTabIds([newTab.id]);
        }

        try {
            const wList = await getWatchlist();
            setWatchlistItems(wList);
        } catch (e) {
            console.warn("Watchlist restore failed", e);
        }

        try {
            const dbHandle = await getDatabaseHandle();
            if (dbHandle) {
                const perm = await dbHandle.queryPermission({ mode: 'readwrite' });
                if (perm === 'granted') {
                    setDatabaseHandle(dbHandle);
                    const files = await scanRecursive(dbHandle);
                    setDatabaseFiles(files);
                } else {
                    setDatabaseHandle(dbHandle);
                }
            }
        } catch (e) {
            console.warn("Database restore failed", e);
        }

      } catch (e) {
        console.error("Failed to restore session:", e);
        const mock = generateMockData(MOCK_DATA_COUNT);
        const newTab = createNewTab('default-tab', 'BTC/USD', mock);
        setTabs([newTab]);
        setActiveTabId(newTab.id);
        setLayoutTabIds([newTab.id]);
      } finally {
        setIsAppReady(true);
      }
    };

    restoreSession();
  }, [createNewTab]);

  useEffect(() => {
    if (!isAppReady) return;

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
        isWatchlistOpen,
        isStayInDrawingMode,
        isMagnetMode,
        layoutMode,
        layoutTabIds,
        isSymbolSync,
        isIntervalSync,
        isCrosshairSync,
        isTimeSync
      };
      
      saveAppState(stateToSave).catch(e => console.warn("Auto-save failed:", e));
    }, 1000); 

    return () => clearTimeout(saveTimeout);
  }, [tabs, activeTabId, favoriteTools, favoriteTimeframes, isFavoritesBarVisible, isWatchlistOpen, isStayInDrawingMode, isMagnetMode, isAppReady, layoutMode, layoutTabIds, isSymbolSync, isIntervalSync, isCrosshairSync, isTimeSync]);


  const activeTab = useMemo(() => 
    tabs.find(t => t.id === activeTabId) || tabs[0] || createNewTab(), 
  [tabs, activeTabId, createNewTab]);

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
  
  // Special handler for Visible Range changes to capture history of scrolling
  // We need to pass this down to the chart
  const handleVisibleRangeChange = useCallback((newRange: { from: number; to: number }) => {
      if (!activeTab) return;

      // Don't save history if range hasn't changed meaningfully or is initial null
      if (!activeTab.visibleRange) {
          updateActiveTab({ visibleRange: newRange });
          return;
      }
      
      const prevRange = activeTab.visibleRange;
      if (Math.abs(prevRange.from - newRange.from) < 0.01 && Math.abs(prevRange.to - newRange.to) < 0.01) {
          return;
      }

      // Save previous state to undo stack
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
     
     // Current state becomes a redo item
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
  }, [activeTab, updateActiveTab]);

  const handleRedo = useCallback(() => {
     if (!activeTab || activeTab.redoStack.length === 0) return;
     
     const nextSnapshot = activeTab.redoStack[activeTab.redoStack.length - 1];
     const newRedoStack = activeTab.redoStack.slice(0, -1);

     // Current state pushed back to undo
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
    if (tabs.length <= 1) return; 
    
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);
    
    if (activeTabId === id) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
    
    if (layoutTabIds.includes(id)) {
        setLayoutTabIds(prev => prev.map(slotId => slotId === id ? newTabs[newTabs.length - 1].id : slotId));
    }
  };

  const handleDetachTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    updateTab(id, { isDetached: true });
  };

  const handleAttachTab = (id: string) => {
    updateTab(id, { isDetached: false });
  };

  const handleSwitchTab = (id: string) => {
    setActiveTabId(id);
    if (layoutMode === 'single') setLayoutTabIds([id]);
  };

  const readChunk = async (file: File, start: number, end: number): Promise<string> => {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          const slice = file.slice(start, end);
          reader.onload = (e) => resolve(e.target?.result as string || '');
          reader.onerror = (e) => reject(e);
          reader.readAsText(slice);
      });
  };

  const loadPreviousChunk = async (tab: TabSession, fileState: any) => {
      if (!fileState.hasMore || fileState.isLoading) return null;

      const { file, cursor, leftover } = fileState;
      const end = cursor;
      const start = Math.max(0, end - CHUNK_SIZE);
      const isFirstChunkOfFile = start === 0;

      const text = await readChunk(file, start, end);
      
      const combined = text + leftover;
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

  const startFileStream = useCallback(async (file: File, fileName: string, targetTabId?: string, forceTimeframe?: Timeframe, preservedReplay?: { isReplayMode: boolean, isAdvancedReplayMode: boolean, replayGlobalTime: number | null }) => {
      setLoading(true);
      try {
          const fileSize = file.size;
          const start = Math.max(0, fileSize - CHUNK_SIZE);
          const text = await readChunk(file, start, fileSize);
          
          const lines = text.split('\n');
          let leftover = '';
          let linesToParse = lines;
          
          if (start > 0) {
              leftover = lines[0];
              linesToParse = lines.slice(1);
          }

          const parsedData = parseCSVChunk(linesToParse);
          parsedData.sort((a, b) => a.time - b.time);
          
          let displayTitle = getBaseSymbolName(fileName);
          if ((!displayTitle || displayTitle.trim() === '') && explorerFolderName && explorerFolderName !== 'Selected Folder') {
              displayTitle = explorerFolderName;
          }
          if (!displayTitle || displayTitle.trim() === '') {
              displayTitle = fileName.replace(/\.(csv|txt)$/i, '');
          }

          // Automatically detect timeframe if not forced (usually initial load)
          let initialTf = forceTimeframe;
          if (!initialTf) {
              initialTf = detectTimeframe(parsedData);
          }
          
          // Use detected/forced timeframe to resample/aggregate data for display
          const displayData = resampleData(parsedData, initialTf);

          // Calculate replay index if we have preserved state
          let replayIndex = displayData.length - 1;
          if (preservedReplay?.replayGlobalTime) {
              const idx = displayData.findIndex(d => d.time >= preservedReplay.replayGlobalTime!);
              if (idx !== -1) replayIndex = idx;
          }

          const updates: Partial<TabSession> = {
              title: displayTitle,
              rawData: parsedData,
              data: displayData,
              timeframe: initialTf,
              fileState: {
                  file,
                  cursor: start,
                  leftover,
                  isLoading: false,
                  hasMore: start > 0,
                  fileSize
              },
              replayIndex: replayIndex,
              isReplayPlaying: false,
              isReplayMode: preservedReplay?.isReplayMode ?? false,
              isAdvancedReplayMode: preservedReplay?.isAdvancedReplayMode ?? false,
              replayGlobalTime: preservedReplay?.replayGlobalTime ?? null
          };

          const tabIdToUpdate = targetTabId || activeTabId;
          
          if (isSymbolSync && layoutTabIds.length > 1) {
              layoutTabIds.forEach(id => {
                  updateTab(id, updates);
              });
          } else {
              updateTab(tabIdToUpdate, updates);
          }

      } catch (e) {
          console.error("Error starting stream:", e);
          alert("Failed to load file.");
      } finally {
          setLoading(false);
      }
  }, [explorerFolderName, activeTabId, isSymbolSync, layoutTabIds, updateTab]);

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
              const fullRawData = [...newPoints, ...tab.rawData];
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
          } else {
               updateTab(tabId, { 
                   fileState: { ...tab.fileState, isLoading: false } 
               });
          }
      } catch (e) {
          console.error("Error loading history:", e);
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
      const file = await fileHandle.getFile();
      startFileStream(file, file.name);
    } catch (e) {
      console.error("Error reading file from library:", e);
      alert('Error reading selected file.');
      setLoading(false);
    }
  };
  
  const handleConnectDatabase = useCallback(async () => {
      if ('showDirectoryPicker' in window) {
          try {
              // @ts-ignore
              const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
              
              // Clear previous handle before saving new one to avoid conflicts
              await clearDatabaseHandle();
              
              setDatabaseHandle(handle);
              await saveDatabaseHandle(handle);
              
              const files = await scanRecursive(handle);
              setDatabaseFiles(files);
              
          } catch (e: any) {
              if (e.name === 'AbortError') {
                  console.warn("Database connection cancelled by user");
                  return;
              }
              console.warn("File System Access API failed, trying fallback:", e);
              databaseInputRef.current?.click();
          }
      } else {
          databaseInputRef.current?.click();
      }
  }, []);

  const handleDatabaseFallbackSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const rawFiles: File[] = Array.from(e.target.files);
          const validFiles = rawFiles.filter(f => 
             f.name.toLowerCase().endsWith('.csv') || f.name.toLowerCase().endsWith('.txt')
          );
          
          if (validFiles.length > 0) {
              setDatabaseFiles(validFiles.map(f => ({
                  kind: 'file',
                  name: f.name,
                  getFile: async () => f
              })));
              
              // Clear previous persistence
              clearDatabaseHandle();
              
              setDatabaseHandle({ name: 'Local Folder (Read Only)', kind: 'directory', isFallback: true });
              
              alert("Database connected in Read-Only mode. \n\nNote: Writing downloaded data to disk is disabled in this environment.");
          }
      }
  };

  const handleTimeframeChange = async (id: string, tf: Timeframe) => {
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;
    
    const targets = (isIntervalSync && layoutTabIds.length > 1) ? layoutTabIds : [id];

    targets.forEach(async (targetId) => {
        const targetTab = tabs.find(t => t.id === targetId);
        if (!targetTab) return;

        // Preserve replay state for engagement
        const preservedReplay = {
            isReplayMode: targetTab.isReplayMode,
            isAdvancedReplayMode: targetTab.isAdvancedReplayMode,
            replayGlobalTime: targetTab.replayGlobalTime || (targetTab.data.length > 0 ? targetTab.data[targetTab.replayIndex].time : null)
        };

        let matchingFileHandle = findFileForTimeframe(databaseFiles, targetTab.title, tf);
        if (!matchingFileHandle) {
             matchingFileHandle = findFileForTimeframe(explorerFiles, targetTab.title, tf);
        }

        if (matchingFileHandle) {
            try {
                const file = await matchingFileHandle.getFile();
                startFileStream(file, file.name, targetId, tf, preservedReplay);
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
            const newTabsToAdd = [];
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
            isWatchlistOpen,
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
        // Prepare a clean state object for export (without massive data buffers if possible, 
        // but drawings are essential). For simplicity, we export everything but the file handles.
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
                
                // Very basic validation
                if (!imported.tabs || !Array.isArray(imported.tabs)) throw new Error("Invalid format");

                // Merge imported tabs with dummy data if needed, or just let them stay empty until reloaded
                const newTabs = imported.tabs.map((it: any) => {
                    const base = createNewTab(it.id, it.title);
                    return {
                        ...base,
                        ...it,
                        data: [], // Data must be reloaded from source files
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
            } catch (err) {
                alert("Failed to import layout file. Please ensure it is a valid Red Pill Layout JSON.");
            }
        };
        input.click();
    }
  };

  const handleClearAll = useCallback(() => {
      if (!activeTab) return;
      if (activeTab.drawings.length === 0) {
          alert("No drawings to clear.");
          return;
      }
      
      if (window.confirm('Are you sure you want to remove all drawings?')) {
          handleSaveHistory();
          updateActiveTab({ drawings: [] });
      }
  }, [activeTab, handleSaveHistory, updateActiveTab]);

  const handleOrderSubmit = useCallback((order: any) => {
      if (!activeTab) return;
      
      const newTrade: Trade = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          ...order
      };
      
      const newTrades = [...(activeTab.trades || []), newTrade];
      updateActiveTab({ trades: newTrades });
  }, [activeTab, updateActiveTab]);

  const handleAddToWatchlist = async (symbol: string) => {
      await addToWatchlist(symbol);
      const updated = await getWatchlist();
      setWatchlistItems(updated);
  };

  const handleRemoveFromWatchlist = async (symbol: string) => {
      await removeFromWatchlist(symbol);
      const updated = await getWatchlist();
      setWatchlistItems(updated);
  };

  const handleWatchlistSelect = async (symbol: string) => {
      const existingTab = tabs.find(t => t.title === symbol || getBaseSymbolName(t.title) === symbol);
      if (existingTab) {
          setActiveTabId(existingTab.id);
          if (layoutMode === 'single') setLayoutTabIds([existingTab.id]);
          return;
      }

      let fileHandle = findFileForTimeframe(databaseFiles, symbol, Timeframe.H1) ||
                       findFileForTimeframe(databaseFiles, symbol, Timeframe.D1) ||
                       findFileForTimeframe(databaseFiles, symbol, Timeframe.M15);
      
      if (!fileHandle) {
          fileHandle = databaseFiles.find(f => getBaseSymbolName(f.name) === symbol);
      }
      
      if (!fileHandle) {
          fileHandle = explorerFiles.find(f => getBaseSymbolName(f.name) === symbol);
      }

      if (fileHandle) {
          setLoading(true);
          try {
              const file = await fileHandle.getFile();
              if (activeTab.title === 'New Chart' && activeTab.data.length === 0) {
                   startFileStream(file, file.name);
              } else {
                   const newTabId = crypto.randomUUID();
                   const newTab = createNewTab(newTabId, 'Loading...');
                   setTabs(prev => [...prev, newTab]);
                   setActiveTabId(newTabId);
                   if (layoutMode === 'single') setLayoutTabIds([newTabId]);
                   startFileStream(file, file.name, newTabId);
              }
          } catch (e) {
              console.error("Failed to open watchlist item:", e);
              alert("Could not read file for " + symbol);
          } finally {
              setLoading(false);
          }
      } else {
          if (confirm(`No file found for ${symbol}. Create mock chart?`)) {
               const mock = generateMockData(MOCK_DATA_COUNT);
               const newTab = createNewTab(crypto.randomUUID(), symbol, mock);
               setTabs(prev => [...prev, newTab]);
               setActiveTabId(newTab.id);
               if (layoutMode === 'single') setLayoutTabIds([newTab.id]);
          }
      }
  };

  const { currentPrice, prevPrice } = useMemo(() => {
    if (!activeTab || activeTab.data.length === 0) return { currentPrice: 0, prevPrice: 0 };
    
    if (activeTab.isReplayMode || activeTab.isAdvancedReplayMode) {
        if (activeTab.simulatedPrice !== null) {
            // Intra-bar simulation: use current price and find a reference for prev
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
                        />
                    </div>
                );
            })}
        </div>
    );
  };

  if (!isAppReady) {
    return (
      <div className="h-screen bg-[#0f172a] text-slate-300 flex flex-col gap-4 items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="font-mono text-sm animate-pulse">Initializing Red Pill Charting...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0f172a] text-slate-200 overflow-hidden">
      
      <input 
        type="file" 
        ref={databaseInputRef} 
        className="hidden" 
        // @ts-ignore
        webkitdirectory="true" 
        directory="true" 
        multiple 
        onChange={handleDatabaseFallbackSelect}
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
        onOpenIndicators={() => alert('Indicators coming soon')}
        onToggleWatchlist={() => setIsWatchlistOpen(!isWatchlistOpen)}
        onToggleAdvancedReplay={handleToggleAdvancedReplay}
        isAdvancedReplayMode={activeTab.isAdvancedReplayMode}
        onOpenLocalData={() => setIsLibraryOpen(true)}
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

        <WatchlistPanel 
            isOpen={isWatchlistOpen}
            onClose={() => setIsWatchlistOpen(false)}
            items={watchlistItems}
            onAdd={handleAddToWatchlist}
            onRemove={handleRemoveFromWatchlist}
            onSelect={handleWatchlistSelect}
            currentSymbol={currentSymbolName}
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
                        tab={tab}
                        updateTab={(updates) => updateTab(tab.id, updates)}
                        onTimeframeChange={(tf) => handleTimeframeChange(tab.id, tf)}
                        favoriteTools={[]} 
                        onSelectTool={() => {}}
                        activeToolId=""
                        areDrawingsLocked={false}
                        isMagnetMode={false}
                        favoriteTimeframes={favoriteTimeframes}
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
};

export default App;
