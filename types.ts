
import React from 'react';

export interface OHLCV {
  time: number; // Unix timestamp in seconds or milliseconds
  open: number;
  high: number;

  low: number;
  close: number;
  volume: number;
  dateStr?: string; // Original date string for display
}

export interface ChartConfig {
  showVolume: boolean;
  showSMA: boolean;
  smaPeriod: number;
  chartType: 'candlestick' | 'line' | 'area';
  theme: 'dark' | 'light';
  volumeTopMargin?: number; // 0.0 to 1.0, defines where volume section starts
  priceScaleMode?: 'linear' | 'logarithmic' | 'percentage';
  autoScale?: boolean;
  invertScale?: boolean; // Mandate 4.5: Price Scale Inversion
  showGridlines?: boolean;
  showCrosshair?: boolean;
  // Color overrides
  upColor?: string;
  downColor?: string;
  wickUpColor?: string;
  wickDownColor?: string;
  borderUpColor?: string;
  borderDownColor?: string;

  // Background overrides
  backgroundColor?: string; // Used for solid
  backgroundType?: 'solid' | 'gradient'; // gradient maps to VerticalGradient
  backgroundTopColor?: string;
  backgroundBottomColor?: string;
}

export interface ToolItem {
  id: string;
  icon: React.ElementType;
  label: string;
  action: () => void;
  active?: boolean;
}

export enum Timeframe {
  M1 = '1mn',
  M3 = '3m',
  M5 = '5m',
  M15 = '15m',
  M30 = '30m',
  H1 = '1h',
  H2 = '2h',
  H4 = '4h',
  H12 = '12h',
  D1 = '1D',
  W1 = '1W',
  MN1 = '1mo',
  MN12 = '12M'
}

export interface DrawingPoint {
  time: number; // Unix timestamp (ms)
  price: number;
}

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface DrawingProperties {
  color: string;
  lineWidth: number;
  lineStyle: LineStyle;
  text?: string;
  backgroundColor?: string;
  filled?: boolean;
  fontSize?: number;
  visible?: boolean;
  locked?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  smoothing?: number; // 0 to 20, 0 = raw input
}

export interface Drawing {
  id: string;
  type: string;
  points: DrawingPoint[];
  properties: DrawingProperties;
  creationTimeframe?: Timeframe;
  folderId?: string | null;
}

export interface Folder {
  id: string;
  name: string;
  isExpanded: boolean;
  visible?: boolean; // New: Folder visibility toggle (affects children)
  locked?: boolean;  // New: Folder lock toggle (affects children)
}

export interface FileStreamState {
  file: File | null; // Nullable for Electron mode
  path?: string;     // Robust Bridge path
  cursor: number;
  leftover: string;
  isLoading: boolean;
  hasMore: boolean;
  fileSize: number;
}

export interface Trade {
  id: string;
  sourceId: string; // Links trade to specific CSV/Data source
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop';
  price: number; // Entry Price
  qty: number;
  value: number;
  timestamp: number;
  status: 'filled' | 'open' | 'cancelled';
  pnl?: number;
  exitPrice?: number;
  mode?: 'live' | 'simulated'; // For replay trades
  stopLoss?: number;
  takeProfit?: number;
}

export interface WatchlistItem {
  symbol: string;
  addedAt: number;
}

export interface HistorySnapshot {
  drawings: Drawing[];
  folders: Folder[];
  visibleRange: { from: number; to: number } | null;
}

export interface ChartState {
  sourceId: string;
  timestamp: number;
  drawings: Drawing[];
  folders?: Folder[];
  config: ChartConfig;
  visibleRange: { from: number; to: number } | null;
}

export interface TabSession {
  id: string;
  title: string;
  symbolId: string; // Namespace-aware ID (e.g., "FOREX_GOLD")
  sourceId: string; // Persistent unique ID for drawings/trades
  rawData: OHLCV[];
  data: OHLCV[];
  timeframe: Timeframe;
  config: ChartConfig;
  
  fileState?: FileStreamState;
  filePath?: string; 

  isReplayMode: boolean;
  isAdvancedReplayMode: boolean;
  isReplaySelecting: boolean; 
  replayIndex: number;
  replayGlobalTime: number | null; 
  simulatedPrice: number | null; 
  isReplayPlaying: boolean;
  replaySpeed: number; 
  isDetached: boolean;
  
  // Persisted UI State
  isMarketOverviewOpen: boolean;

  visibleRange: { from: number; to: number } | null;
  trades: Trade[];
  drawings: Drawing[];
  folders: Folder[];
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
}

export interface SanitizationStats {
  fixedZeroes: number;
  fixedLogic: number;
  filledGaps: number;
  outliers: number;
  totalRecords: number;
}

// Mandate 4.4: Sticky Note Engine
export interface StickyNoteData {
  id: string;
  title: string; // New: Note Title
  content: string; // Text content
  inkData: string | null; // Base64 encoded image data for ink mode
  mode: 'text' | 'ink';
  isMinimized: boolean; // New: Minimized state
  isPinned?: boolean; // New: Docking state (true = docked/absolute, false = undocked/fixed)
  position: { x: number; y: number };
  size: { w: number; h: number };
  zIndex: number;
  color: 'yellow' | 'blue' | 'green' | 'red' | 'dark' | 'gray';
}
