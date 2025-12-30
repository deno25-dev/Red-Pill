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
  M1 = '1m',
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
  MN1 = '1M',
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
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop';
  price: number;
  qty: number;
  value: number;
  timestamp: number;
  status: 'filled' | 'open' | 'cancelled';
}

export interface WatchlistItem {
  symbol: string;
  addedAt: number;
}

// Snapshot of state for Undo/Redo
export interface HistorySnapshot {
  drawings: Drawing[];
  visibleRange: { from: number; to: number } | null;
}

export interface TabSession {
  id: string;
  title: string;
  rawData: OHLCV[];
  data: OHLCV[];
  timeframe: Timeframe;
  config: ChartConfig;
  
  // File Streaming
  fileState?: FileStreamState;
  filePath?: string; // Bridge: Absolute path to the source file

  // Replay state
  isReplayMode: boolean;
  isAdvancedReplayMode: boolean;
  isReplaySelecting: boolean; // New state for picking start point
  replayIndex: number;
  replayGlobalTime: number | null; // The exact simulated timestamp in ms
  simulatedPrice: number | null; // The specific price at the current replay step
  isReplayPlaying: boolean;
  replaySpeed: number; // Speed multiplier (1 = real time, 10 = 10x speed)
  // Window state
  isDetached: boolean;
  
  // State
  drawings: Drawing[];
  visibleRange: { from: number; to: number } | null; // Store current scroll position

  // History Stacks
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
  
  // Trades
  trades: Trade[];
}