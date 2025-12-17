import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { FilePanel } from './components/FilePanel';
import { TabBar } from './components/TabBar';
import { ChartWorkspace } from './components/ChartWorkspace';
import { Popout } from './components/Popout';
import { TradingPanel } from './components/TradingPanel';
import { SearchPalette } from './components/SearchPalette';
import { WatchlistPanel } from './components/WatchlistPanel';
import { DownloadDialog } from './components/DownloadDialog';
import { OHLCV, ChartConfig, Timeframe, TabSession, Trade, WatchlistItem } from './types';
import { generateMockData, parseCSVChunk, resampleData, findFileForTimeframe, getBaseSymbolName, scanRecursive } from './utils/dataUtils';
import { saveAppState, loadAppState, getDatabaseHandle, saveDatabaseHandle, getWatchlist, addToWatchlist, removeFromWatchlist } from './utils/storage';
import { fetchBinanceKlines } from './utils/binance';
import { MOCK_DATA_COUNT } from './constants';
import { ExternalLink } from 'lucide-react';

// Chunk size for file streaming: 2MB
const CHUNK_SIZE = 2 * 1024 * 1024; 

const App: React.FC = () => {
  // --- State Management ---
  const [isAppReady, setIsAppReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isTradingPanelOpen, setIsTradingPanelOpen] = useState(false);
  const [isTradingPanelDetached, setIsTradingPanelDetached] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  // Watchlist State
  const [isWatchlistOpen, setIsWatchlistOpen] = useState(false);
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);

  // Download Dialog State
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState('');

  // Tools & Favorites State
  const [activeToolId, setActiveToolId] = useState<string>('cross');
  const [favoriteTools, setFavoriteTools] = useState<string[]>(['trend_line', 'rectangle']);
  const [isFavoritesBarVisible, setIsFavoritesBarVisible] = useState(true);
  
  // Global Drawing Modes
  const [areDrawingsLocked, setAreDrawingsLocked] = useState(false); // Read-only mode for drawings
  const [isMagnetMode, setIsMagnetMode] = useState(false);

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
  
  // Tab Management
  const [tabs, setTabs] = useState<TabSession[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');

  // Helper to create a new tab object
  const createNewTab = useCallback((id: string = crypto.randomUUID(), title: string = 'New Chart', raw: OHLCV[] = []): TabSession => {
    return {
      id,
      title,
      rawData: raw,
      data: raw.length > 0 ? resampleData(raw, Timeframe.M15) : [],
      timeframe: Timeframe.M15,
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
      replaySpeed: 1, // Default 1x speed (Real Time)
      isDetached: false,
      drawings: [],
      undoStack: [],
      redoStack: [],
      trades: []
    };
  }, []);

  // --- Persistence Logic ---

  // 1. Restore Session & Database on Mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const savedState = await loadAppState();
        
        if (savedState && savedState.tabs && savedState.tabs.length > 0) {
          setTabs(savedState.tabs);
          setActiveTabId(savedState.activeTabId || savedState.tabs[0].id);
          setFavoriteTools(savedState.favoriteTools || ['trend_line', 'rectangle']);
          setIsFavoritesBarVisible(savedState.isFavoritesBarVisible ?? true);
          setIsWatchlistOpen(savedState.isWatchlistOpen ?? false);
        } else {
          const mock = generateMockData(MOCK_DATA_COUNT);
          const newTab = createNewTab('default-tab', 'BTC/USD', mock);
          setTabs([newTab]);
          setActiveTabId(newTab.id);
        }

        // Restore Watchlist
        try {
            const wList = await getWatchlist();
            setWatchlistItems(wList);
        } catch (e) {
            console.warn("Watchlist restore failed", e);
        }

        // Restore Database Connection
        try {
            const dbHandle = await getDatabaseHandle();
            if (dbHandle) {
                // Verify Permission
                const perm = await dbHandle.queryPermission({ mode: 'readwrite' }); // Try ReadWrite
                if (perm === 'granted') {
                    setDatabaseHandle(dbHandle);
                    const files = await scanRecursive(dbHandle);
                    setDatabaseFiles(files);
                } else {
                    // Try Read only fallback or just set handle and let user re-verify on action
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
      } finally {
        setIsAppReady(true);
      }
    };

    restoreSession();
  }, [createNewTab]);

  // 2. Auto-Save Session (Debounced)
  useEffect(() => {
    if (!isAppReady) return;

    const saveTimeout = setTimeout(() => {
      const stateToSave = {
        // Strip non-serializable fileState
        tabs: tabs.map(t => ({
          ...t,
          fileState: undefined 
        })),
        activeTabId,
        favoriteTools,
        isFavoritesBarVisible,
        isWatchlistOpen
      };
      
      saveAppState(stateToSave).catch(e => console.warn("Auto-save failed:", e));
    }, 1000); // 1 second debounce

    return () => clearTimeout(saveTimeout);
  }, [tabs, activeTabId, favoriteTools, isFavoritesBarVisible, isWatchlistOpen, isAppReady]);


  // Retrieve Active Tab
  const activeTab = useMemo(() => 
    tabs.find(t => t.id === activeTabId) || tabs[0] || createNewTab(), 
  [tabs, activeTabId, createNewTab]);

  // Helper to update specific tab
  const updateTab = useCallback((id: string, updates: Partial<TabSession>) => {
    setTabs(prev => prev.map(tab => {
      if (tab.id === id) {
        return { ...tab, ...updates };
      }
      return tab;
    }));
  }, []);

  // Helper to update Active Tab
  const updateActiveTab = useCallback((updates: Partial<TabSession>) => {
    if (activeTabId) {
        updateTab(activeTabId, updates);
    }
  }, [activeTabId, updateTab]);

  // --- History Handlers (Undo/Redo) ---
  const handleSaveHistory = useCallback(() => {
    if (!activeTab) return;
    const currentDrawings = activeTab.drawings;
    updateActiveTab({
        undoStack: [...activeTab.undoStack.slice(-49), currentDrawings], // Limit to 50 steps
        redoStack: []
    });
  }, [activeTab, updateActiveTab]);

  const handleUndo = useCallback(() => {
     if (!activeTab || activeTab.undoStack.length === 0) return;
     const previousDrawings = activeTab.undoStack[activeTab.undoStack.length - 1];
     const newUndoStack = activeTab.undoStack.slice(0, -1);
     
     updateActiveTab({
         drawings: previousDrawings,
         undoStack: newUndoStack,
         redoStack: [...activeTab.redoStack, activeTab.drawings]
     });
  }, [activeTab, updateActiveTab]);

  const handleRedo = useCallback(() => {
     if (!activeTab || activeTab.redoStack.length === 0) return;
     const nextDrawings = activeTab.redoStack[activeTab.redoStack.length - 1];
     const newRedoStack = activeTab.redoStack.slice(0, -1);

     updateActiveTab({
         drawings: nextDrawings,
         undoStack: [...activeTab.undoStack, activeTab.drawings],
         redoStack: newRedoStack
     });
  }, [activeTab, updateActiveTab]);


  // --- Tab Bar Handlers ---
  const handleAddTab = () => {
    const newTab = createNewTab(undefined, 'New Chart');
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length <= 1) return; 
    
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);
    
    if (activeTabId === id) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
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
  };

  // --- Lazy Loading Logic ---

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

  const startFileStream = useCallback(async (file: File, fileName: string, targetTabId?: string, forceTimeframe?: Timeframe) => {
      setLoading(true);
      try {
          // 1. Initial Load: Read Tail
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

          const initialTf = forceTimeframe || Timeframe.M1;
          const displayData = forceTimeframe ? parsedData : resampleData(parsedData, initialTf);

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
              replayIndex: displayData.length - 1,
              isReplayPlaying: false
          };

          if (targetTabId) {
              updateTab(targetTabId, updates);
          } else {
              updateActiveTab(updates);
          }

      } catch (e) {
          console.error("Error starting stream:", e);
          alert("Failed to load file.");
      } finally {
          setLoading(false);
      }
  }, [explorerFolderName, updateActiveTab, updateTab]);

  const handleRequestHistory = useCallback(async () => {
      if (!activeTab || !activeTab.fileState || !activeTab.fileState.hasMore || activeTab.fileState.isLoading) return;

      updateActiveTab({ 
          fileState: { ...activeTab.fileState, isLoading: true } 
      });

      try {
          const result = await loadPreviousChunk(activeTab, activeTab.fileState);
          if (result) {
              const { newPoints, newCursor, newLeftover, hasMore } = result;
              newPoints.sort((a, b) => a.time - b.time);
              const fullRawData = [...newPoints, ...activeTab.rawData];
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
              
              const displayData = activeTab.timeframe === Timeframe.M1 
                  ? uniqueData 
                  : resampleData(uniqueData, activeTab.timeframe);
              
              updateActiveTab({
                  rawData: uniqueData,
                  data: displayData,
                  fileState: {
                      ...activeTab.fileState,
                      cursor: newCursor,
                      leftover: newLeftover,
                      hasMore: hasMore,
                      isLoading: false
                  },
                  replayIndex: activeTab.replayIndex + (displayData.length - activeTab.data.length)
              });
          } else {
               updateActiveTab({ 
                   fileState: { ...activeTab.fileState, isLoading: false } 
               });
          }
      } catch (e) {
          console.error("Error loading history:", e);
          updateActiveTab({ 
             fileState: { ...activeTab.fileState, isLoading: false } 
          });
      }
  }, [activeTab, updateActiveTab]);


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
  
  // --- Database Logic ---
  const handleConnectDatabase = useCallback(async () => {
      if ('showDirectoryPicker' in window) {
          try {
              // @ts-ignore
              const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
              
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
              // Fallback for cross-origin or other errors
              databaseInputRef.current?.click();
          }
      } else {
          // Fallback if API not exists
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
              
              // Set a marker object for databaseHandle so UI knows we are connected
              // but without actual filesystem access capability for writing
              setDatabaseHandle({ name: 'Local Folder (Read Only)', kind: 'directory', isFallback: true });
              
              alert("Database connected in Read-Only mode. \n\nNote: Writing downloaded data to disk is disabled in this environment.");
          }
      }
  };

  // --- DOWNLOAD LOGIC ---
  const checkExistingFile = async (symbol: string, interval: string) => {
      if (!databaseHandle) return null;
      // If fallback mode, we can't easily check random files without scanning the list we already have
      if (databaseHandle.isFallback) {
          const filename = `${symbol}_${interval}.csv`;
          const existing = databaseFiles.find(f => f.name === filename);
          if (existing) {
              // We need to read it to find the last time. 
              // This might be expensive if many files, but okay for single check.
              try {
                  const file = await existing.getFile();
                  const size = file.size;
                  const start = Math.max(0, size - 500);
                  const text = await readChunk(file, start, size);
                  const lines = text.trim().split('\n');
                  if (lines.length > 0) {
                      const lastLine = lines[lines.length - 1];
                      const dateStr = lastLine.split(',')[0];
                      const time = new Date(dateStr).getTime();
                      if (!isNaN(time)) return time;
                  }
              } catch(e) {}
          }
          return null;
      }

      const filename = `${symbol}_${interval}.csv`;
      try {
          // Check root
          // @ts-ignore
          const fileHandle = await databaseHandle.getFileHandle(filename);
          const file = await fileHandle.getFile();
          
          // Read last 500 bytes to find last line
          const size = file.size;
          const start = Math.max(0, size - 500);
          const text = await readChunk(file, start, size);
          
          const lines = text.trim().split('\n');
          if (lines.length > 0) {
              const lastLine = lines[lines.length - 1];
              // Parse date: 2023-01-01T00:00...
              const dateStr = lastLine.split(',')[0];
              const time = new Date(dateStr).getTime();
              if (!isNaN(time)) return time;
          }
      } catch (e) {
          // File doesn't exist or read error
      }
      return null;
  };

  const handleDownloadData = async (symbol: string, interval: string, startTime: number, endTime: number, mode: 'new' | 'update') => {
      // Determine save strategy: Direct FileSystem Write vs Blob Download
      const useFileSystem = databaseHandle && !databaseHandle.isFallback;
      
      // If updating, we must have file system access to append efficiently.
      // If we don't, we can only download a NEW file or we'd have to read the whole old file into memory, which is heavy.
      // For simplicity in fallback mode, we only support 'new' downloads effectively (updating will simply create a new partial file or require manual merging).
      
      if (mode === 'update' && !useFileSystem) {
          if (!confirm("Cannot append to file in Read-Only mode. Download new data as a separate file?")) return;
      }

      setIsDownloading(true);
      setDownloadProgress('Starting...');
      
      let writable = null;
      let accumulatedCSV = '';
      
      try {
          const filename = `${symbol}_${interval}.csv`;
          
          if (useFileSystem) {
              // Verify permissions for writing
              try {
                  // @ts-ignore
                  const perm = await databaseHandle.queryPermission({ mode: 'readwrite' });
                  if (perm !== 'granted') {
                      // @ts-ignore
                      const req = await databaseHandle.requestPermission({ mode: 'readwrite' });
                      if (req !== 'granted') throw new Error("Permission denied");
                  }
                  
                  // @ts-ignore
                  const fileHandle = await databaseHandle.getFileHandle(filename, { create: true });
                  
                  if (mode === 'update') {
                      // @ts-ignore
                      writable = await fileHandle.createWritable({ keepExistingData: true });
                      const file = await fileHandle.getFile();
                      writable.seek(file.size);
                  } else {
                      // Overwrite - create new writable (truncates by default)
                      // @ts-ignore
                      writable = await fileHandle.createWritable();
                  }
              } catch (e) {
                  console.error("FileSystem Error:", e);
                  alert("Failed to write to database folder. Attempting browser download instead.");
                  // Fallback to blob download
              }
          }

          let currentStartTime = startTime;
          const now = Date.now();
          let totalDownloaded = 0;

          // Loop until end time is reached
          while (currentStartTime < endTime) {
              // Safety stop if we reach the future (allow small buffer for clock diffs)
              if (currentStartTime > now + 60000) break;

              const candles = await fetchBinanceKlines(symbol, interval, currentStartTime, 1000);
              
              if (candles.length === 0) break;
              
              // Filter out candles that are beyond requested endTime
              const validCandles = candles.filter(c => c.openTime <= endTime);
              
              if (validCandles.length === 0) break;

              // Format CSV
              const lines = validCandles.map(c => {
                  const date = new Date(c.openTime).toISOString();
                  // Format: Date, Open, High, Low, Close, Volume
                  return `${date},${c.open},${c.high},${c.low},${c.close},${c.volume}`;
              }).join('\n');
              
              if (writable) {
                  // Write chunk to disk
                  const prefix = (mode === 'update' || totalDownloaded > 0) ? '\n' : '';
                  await writable.write(prefix + lines);
              } else {
                  // Accumulate in memory
                  const prefix = (accumulatedCSV.length > 0) ? '\n' : '';
                  accumulatedCSV += prefix + lines;
              }
              
              totalDownloaded += validCandles.length;
              setDownloadProgress(`Downloaded ${totalDownloaded} candles...`);
              
              // Update cursor
              const lastCandle = validCandles[validCandles.length - 1];
              
              // If we filtered candles, it means we reached the end
              if (validCandles.length < candles.length) break;

              currentStartTime = lastCandle.closeTime + 1;
              
              // Rate limit safety
              await new Promise(r => setTimeout(r, 100));
          }
          
          if (writable) {
              await writable.close();
              // Refresh database files list
              const files = await scanRecursive(databaseHandle);
              setDatabaseFiles(files);
          } else {
              // Trigger browser download
              if (accumulatedCSV.length > 0) {
                  const blob = new Blob([accumulatedCSV], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.setAttribute("href", url);
                  link.setAttribute("download", filename);
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
              } else {
                  alert("No data found for the selected range.");
              }
          }
          
          setDownloadProgress('Done!');
          if (totalDownloaded > 0) {
              alert(`Successfully downloaded ${totalDownloaded} candles for ${symbol}.`);
              setIsDownloadDialogOpen(false);
          }

      } catch (e: any) {
          console.error("Download failed:", e);
          alert(`Download failed: ${e.message}`);
      } finally {
          setIsDownloading(false);
          setDownloadProgress('');
      }
  };

  const handleTimeframeChange = async (id: string, tf: Timeframe) => {
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;
    
    // Look in BOTH database and explorer files for timeframe matches
    // Prioritize Database
    let matchingFileHandle = findFileForTimeframe(databaseFiles, tab.title, tf);
    if (!matchingFileHandle) {
         matchingFileHandle = findFileForTimeframe(explorerFiles, tab.title, tf);
    }

    if (matchingFileHandle) {
        setLoading(true);
        try {
            const file = await matchingFileHandle.getFile();
            startFileStream(file, file.name, id, tf);
        } catch (e) {
            console.error("Error syncing file for timeframe:", e);
            setLoading(false);
        }
        return; 
    }

    const resampled = resampleData(tab.rawData, tf);
    
    let newReplayIndex = resampled.length - 1;
    let newGlobalTime = tab.replayGlobalTime;

    if (tab.isReplayMode || tab.isAdvancedReplayMode) {
        if (tab.replayGlobalTime) {
            const idx = resampled.findIndex(d => d.time >= tab.replayGlobalTime!);
            if (idx !== -1) {
                newReplayIndex = idx;
            } else {
                newReplayIndex = resampled.length - 1;
            }
        }
    } else {
        newGlobalTime = null;
    }

    updateTab(id, {
      timeframe: tf,
      data: resampled,
      replayIndex: newReplayIndex,
      replayGlobalTime: newGlobalTime, 
      simulatedPrice: null 
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

  const handleLayoutAction = (action: string) => {
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

  // Handle Order Submit
  const handleOrderSubmit = useCallback((order: any) => {
      if (!activeTab) return;
      
      const newTrade: Trade = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          ...order
      };
      
      const newTrades = [...(activeTab.trades || []), newTrade];
      updateActiveTab({ trades: newTrades });
      
      console.log('Order Submitted:', newTrade);
  }, [activeTab, updateActiveTab]);

  // --- Watchlist Logic ---

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
      // 1. Check if we already have a tab open with this symbol
      const existingTab = tabs.find(t => t.title === symbol || getBaseSymbolName(t.title) === symbol);
      if (existingTab) {
          setActiveTabId(existingTab.id);
          return;
      }

      // 2. Try to find the file in Database
      // Prefer standard timeframes like 1h, 4h, 1d, or just take the first match
      let fileHandle = findFileForTimeframe(databaseFiles, symbol, Timeframe.H1) ||
                       findFileForTimeframe(databaseFiles, symbol, Timeframe.D1) ||
                       findFileForTimeframe(databaseFiles, symbol, Timeframe.M15);
      
      // 3. Fallback to any file containing the symbol name
      if (!fileHandle) {
          fileHandle = databaseFiles.find(f => getBaseSymbolName(f.name) === symbol);
      }
      
      // 4. Fallback to explorer files
      if (!fileHandle) {
          fileHandle = explorerFiles.find(f => getBaseSymbolName(f.name) === symbol);
      }

      if (fileHandle) {
          setLoading(true);
          try {
              const file = await fileHandle.getFile();
              // Open in current tab if it's new/empty, otherwise new tab? 
              // Standard behavior: Open in new tab or replace current if empty default
              if (activeTab.title === 'New Chart' && activeTab.data.length === 0) {
                   startFileStream(file, file.name);
              } else {
                   // Create new tab and load
                   const newTabId = crypto.randomUUID();
                   const newTab = createNewTab(newTabId, 'Loading...');
                   setTabs(prev => [...prev, newTab]);
                   setActiveTabId(newTabId);
                   // Small delay to let state propagate? No, just call startFileStream with target ID
                   // We need startFileStream to accept targetTabId
                   startFileStream(file, file.name, newTabId);
              }
          } catch (e) {
              console.error("Failed to open watchlist item:", e);
              alert("Could not read file for " + symbol);
          } finally {
              setLoading(false);
          }
      } else {
          // If no file found, we can't really do much in offline mode unless we generate mock data
          if (confirm(`No file found for ${symbol}. Create mock chart?`)) {
               const mock = generateMockData(MOCK_DATA_COUNT);
               const newTab = createNewTab(crypto.randomUUID(), symbol, mock);
               setTabs(prev => [...prev, newTab]);
               setActiveTabId(newTab.id);
          }
      }
  };

  // Keyboard shortcut to open search
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
              e.preventDefault();
              setIsSearchOpen(true);
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!isAppReady) {
    return (
      <div className="h-screen bg-[#0f172a] text-slate-300 flex flex-col gap-4 items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="font-mono text-sm animate-pulse">Initializing Red Pill Charting...</p>
      </div>
    );
  }

  // Calculate current price safely based on Replay Mode
  const currentPrice = (() => {
      if (!activeTab || activeTab.data.length === 0) return 0;
      
      if (activeTab.isReplayMode || activeTab.isAdvancedReplayMode) {
          if (activeTab.simulatedPrice !== null) {
              return activeTab.simulatedPrice;
          }
          const idx = Math.min(activeTab.replayIndex, activeTab.data.length - 1);
          return activeTab.data[idx].close;
      }
      
      return activeTab.data[activeTab.data.length - 1].close;
  })();

  const currentSymbolName = getBaseSymbolName(activeTab.title);

  return (
    <div className="flex flex-col h-screen bg-[#0f172a] text-slate-200 overflow-hidden">
      
      {/* Hidden File Input for Database Fallback */}
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

      {/* Search Palette Overlay - Uses Database Files */}
      <SearchPalette 
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        files={databaseFiles} 
        onFileSelect={handleLibraryFileSelect}
        onConnectDatabase={handleConnectDatabase}
        isConnected={!!databaseHandle}
      />

      {/* Download Data Dialog */}
      <DownloadDialog 
        isOpen={isDownloadDialogOpen}
        onClose={() => setIsDownloadDialogOpen(false)}
        onDownload={handleDownloadData}
        checkExistingFile={checkExistingFile}
        isDownloading={isDownloading}
        progress={downloadProgress}
        onConnectDatabase={handleConnectDatabase}
        isConnected={!!databaseHandle && !databaseHandle?.isFallback}
        databaseName={databaseHandle?.name}
      />

      {/* Tab Bar */}
      <TabBar 
        tabs={tabs} 
        activeTabId={activeTabId} 
        onSwitch={handleSwitchTab} 
        onClose={handleCloseTab}
        onDetach={handleDetachTab}
        onAdd={handleAddTab}
      />

      {/* Toolbar - Acts on Active Tab */}
      <Toolbar 
        onSearch={() => setIsSearchOpen(true)}
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
        onOpenOnlineData={() => alert('Online data coming soon')}
        onLayoutAction={handleLayoutAction}
        onToggleTradingPanel={() => setIsTradingPanelOpen(!isTradingPanelOpen)}
        isTradingPanelOpen={isTradingPanelOpen}
        isLibraryOpen={isLibraryOpen}
        onToggleLibrary={() => setIsLibraryOpen(!isLibraryOpen)}
        onOpenDownloadDialog={() => setIsDownloadDialogOpen(true)}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar (Tools) - Acts on Active Tab */}
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
          onClearAll={handleClearAll}
        />

        {/* Local Library Panel (Slide in) - Uses Explorer Files */}
        <FilePanel 
          isOpen={isLibraryOpen}
          onClose={() => setIsLibraryOpen(false)}
          onFileSelect={handleLibraryFileSelect}
          onFileListChange={setExplorerFiles}
          onFolderNameChange={setExplorerFolderName}
        />

        {/* Main Chart Area OR Detached Placeholder */}
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
                    onRequestHistory={handleRequestHistory}
                    
                    areDrawingsLocked={areDrawingsLocked}
                    isMagnetMode={isMagnetMode}
                />
            )}
        </div>

        {/* Watchlist Panel (Slide in from Right) */}
        <WatchlistPanel 
            isOpen={isWatchlistOpen}
            onClose={() => setIsWatchlistOpen(false)}
            items={watchlistItems}
            onAdd={handleAddToWatchlist}
            onRemove={handleRemoveFromWatchlist}
            onSelect={handleWatchlistSelect}
            currentSymbol={currentSymbolName}
        />
        
        {/* Trading Panel (Slide in from Right) - Docked Version */}
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

      {/* Render Detached Windows (Portals) */}
      
      {/* 1. Detached Tabs */}
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
                      />
                  </Popout>
              );
          }
          return null;
      })}
      
      {/* 2. Detached Trading Panel */}
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