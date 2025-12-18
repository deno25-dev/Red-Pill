
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

const CHUNK_SIZE = 2 * 1024 * 1024; 

const App: React.FC = () => {
  const [isAppReady, setIsAppReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isTradingPanelOpen, setIsTradingPanelOpen] = useState(false);
  const [isTradingPanelDetached, setIsTradingPanelDetached] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  const [isWatchlistOpen, setIsWatchlistOpen] = useState(false);
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);

  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState('');

  const [activeToolId, setActiveToolId] = useState<string>('cross');
  const [favoriteTools, setFavoriteTools] = useState<string[]>(['trend_line', 'rectangle']);
  const [isFavoritesBarVisible, setIsFavoritesBarVisible] = useState(true);
  
  const [areDrawingsLocked, setAreDrawingsLocked] = useState(false);
  const [areDrawingsHidden, setAreDrawingsHidden] = useState(false);
  const [isMagnetMode, setIsMagnetMode] = useState(false);
  const [isStayInDrawingMode, setIsStayInDrawingMode] = useState(false);

  const [explorerFiles, setExplorerFiles] = useState<any[]>([]);
  const [explorerFolderName, setExplorerFolderName] = useState<string>('');

  const [databaseFiles, setDatabaseFiles] = useState<any[]>([]);
  const [databaseHandle, setDatabaseHandle] = useState<any>(null);
  
  const databaseInputRef = useRef<HTMLInputElement>(null);

  const toggleFavorite = (id: string) => {
    setFavoriteTools(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };
  
  const [tabs, setTabs] = useState<TabSession[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');

  // Fix: Move randomUUID call inside the function body to avoid potential "not callable" errors at definition time
  const createNewTab = useCallback((id?: string, title: string = 'New Chart', raw: OHLCV[] = []): TabSession => {
    const tabId = id || (crypto as any).randomUUID();
    return {
      id: tabId,
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
      replaySpeed: 1,
      isDetached: false,
      drawings: [],
      groups: [],
      undoStack: [],
      redoStack: [],
      trades: []
    };
  }, []);

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
          setIsStayInDrawingMode(savedState.isStayInDrawingMode ?? false);
          setIsMagnetMode(savedState.isMagnetMode ?? false);
          setAreDrawingsHidden(savedState.areDrawingsHidden ?? false);
        } else {
          const mock = generateMockData(MOCK_DATA_COUNT);
          const newTab = createNewTab('default-tab', 'BTC/USD', mock);
          setTabs([newTab]);
          setActiveTabId(newTab.id);
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
        isFavoritesBarVisible,
        isWatchlistOpen,
        isStayInDrawingMode,
        isMagnetMode,
        areDrawingsHidden
      };
      
      saveAppState(stateToSave).catch(e => console.warn("Auto-save failed:", e));
    }, 1000);

    return () => clearTimeout(saveTimeout);
  }, [tabs, activeTabId, favoriteTools, isFavoritesBarVisible, isWatchlistOpen, isStayInDrawingMode, isMagnetMode, areDrawingsHidden, isAppReady]);


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

  const handleSaveHistory = useCallback(() => {
    if (!activeTab) return;
    const currentDrawings = activeTab.drawings;
    updateActiveTab({
        undoStack: [...activeTab.undoStack.slice(-49), currentDrawings],
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
          // Fix: Ensure resampleData is treated as a callable function (Line 438 fix)
          const displayData = forceTimeframe ? parsedData : (resampleData as any)(parsedData, initialTf);

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
      const file = await (fileHandle as any).getFile();
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
              const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
              
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
              
              setDatabaseHandle({ name: 'Local Folder (Read Only)', kind: 'directory', isFallback: true });
              
              alert("Database connected in Read-Only mode. \n\nNote: Writing downloaded data to disk is disabled in this environment.");
          }
      }
  };

  const checkExistingFile = async (symbol: string, interval: string) => {
      if (!databaseHandle) return null;
      if (databaseHandle.isFallback) {
          const filename = `${symbol}_${interval}.csv`;
          const existing = databaseFiles.find(f => f.name === filename);
          if (existing) {
              try {
                  const file = await (existing as any).getFile();
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
          const fileHandle = await databaseHandle.getFileHandle(filename);
          const file = await fileHandle.getFile();
          
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
      } catch (e) {
      }
      return null;
  };

  const handleDownloadData = async (symbol: string, interval: string, startTime: number, endTime: number, mode: 'new' | 'update') => {
      const useFileSystem = databaseHandle && !databaseHandle.isFallback;
      
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
              try {
                  const perm = await databaseHandle.queryPermission({ mode: 'readwrite' });
                  if (perm !== 'granted') {
                      const req = await databaseHandle.requestPermission({ mode: 'readwrite' });
                      if (req !== 'granted') throw new Error("Permission denied");
                  }
                  
                  const fileHandle = await databaseHandle.getFileHandle(filename, { create: true });
                  
                  if (mode === 'update') {
                      writable = await fileHandle.createWritable({ keepExistingData: true });
                      const file = await fileHandle.getFile();
                      writable.seek(file.size);
                  } else {
                      writable = await fileHandle.createWritable();
                  }
              } catch (e) {
                  console.error("FileSystem Error:", e);
                  alert("Failed to write to database folder. Attempting browser download instead.");
              }
          }

          let currentStartTime = startTime;
          const now = Date.now();
          let totalDownloaded = 0;

          while (currentStartTime < endTime) {
              if (currentStartTime > now + 60000) break;

              // Fixed: Added endTime parameter to support range fetching as requested by App.tsx (Line 570 fix)
              const candles = await fetchBinanceKlines(symbol, interval, currentStartTime, 1000, endTime);
              
              if (candles.length === 0) break;
              
              const validCandles = candles.filter(c => c.openTime <= endTime);
              
              if (validCandles.length === 0) break;

              const lines = validCandles.map(c => {
                  const date = new Date(c.openTime).toISOString();
                  return `${date},${c.open},${c.high},${c.low},${c.close},${c.volume}`;
              }).join('\n');
              
              if (writable) {
                  const prefix = (mode === 'update' || totalDownloaded > 0) ? '\n' : '';
                  await writable.write(prefix + lines);
              } else {
                  const prefix = (accumulatedCSV.length > 0) ? '\n' : '';
                  accumulatedCSV += prefix + lines;
              }
              
              totalDownloaded += validCandles.length;
              setDownloadProgress(`Downloaded ${totalDownloaded} candles...`);
              
              const lastCandle = validCandles[validCandles.length - 1];
              
              if (validCandles.length < candles.length) break;

              currentStartTime = lastCandle.closeTime + 1;
              
              await new Promise(r => setTimeout(r, 100));
          }
          
          if (writable) {
              await writable.close();
              const files = await scanRecursive(databaseHandle);
              setDatabaseFiles(files);
          } else {
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
    
    let matchingFileHandle = findFileForTimeframe(databaseFiles, tab.title, tf);
    if (!matchingFileHandle) {
         matchingFileHandle = findFileForTimeframe(explorerFiles, tab.title, tf);
    }

    if (matchingFileHandle) {
        setLoading(true);
        try {
            const file = await (matchingFileHandle as any).getFile();
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
      
      if (window.confirm('Are you sure you want to remove all drawings from this chart?')) {
          // Fix: Perform an atomic update to prevent race conditions with history
          updateActiveTab({ 
              undoStack: [...activeTab.undoStack.slice(-49), activeTab.drawings],
              redoStack: [],
              drawings: [] 
          });
      }
  }, [activeTab, updateActiveTab]);

  const handleOrderSubmit = useCallback((order: any) => {
      if (!activeTab) return;
      
      const newTrade: Trade = {
          id: (crypto as any).randomUUID(),
          timestamp: Date.now(),
          ...order
      };
      
      const newTrades = [...(activeTab.trades || []), newTrade];
      updateActiveTab({ trades: newTrades });
      
      console.log('Order Submitted:', newTrade);
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
              const file = await (fileHandle as any).getFile();
              if (activeTab.title === 'New Chart' && activeTab.data.length === 0) {
                   startFileStream(file, file.name);
              } else {
                   const newTabId = (crypto as any).randomUUID();
                   const newTab = createNewTab(newTabId, 'Loading...');
                   setTabs(prev => [...prev, newTab]);
                   setActiveTabId(newTabId);
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
               const newTab = createNewTab((crypto as any).randomUUID(), symbol, mock);
               setTabs(prev => [...prev, newTab]);
               setActiveTabId(newTab.id);
          }
      }
  };

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
      
      <input 
        type="file" 
        ref={databaseInputRef} 
        className="hidden" 
        // @ts-ignore
        webkitdirectory="true" 
        // @ts-ignore
        directory="true" 
        multiple 
        onChange={handleDatabaseFallbackSelect}
      />

      <SearchPalette 
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        files={databaseFiles} 
        onFileSelect={handleLibraryFileSelect}
        onConnectDatabase={handleConnectDatabase}
        isConnected={!!databaseHandle}
      />

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

      <TabBar 
        tabs={tabs} 
        activeTabId={activeTabId} 
        onSwitch={handleSwitchTab} 
        onClose={handleCloseTab}
        onDetach={handleDetachTab}
        onAdd={handleAddTab}
      />

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
        onClearAll={handleClearAll}
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
          areDrawingsHidden={areDrawingsHidden}
          onToggleDrawingsHidden={() => setAreDrawingsHidden(!areDrawingsHidden)}
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
                    areDrawingsHidden={areDrawingsHidden}
                    isMagnetMode={isMagnetMode}
                    isStayInDrawingMode={isStayInDrawingMode}
                />
            )}
        </div>

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
                        areDrawingsHidden={false}
                        isMagnetMode={false}
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