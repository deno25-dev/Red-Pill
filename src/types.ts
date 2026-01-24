import React from 'react';

export interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  dateStr?: string;
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

export interface ChartConfig {
  showVolume: boolean;
  showSMA: boolean;
  smaPeriod: number;
  chartType: 'candlestick' | 'line' | 'area';
  theme: 'dark' | 'light';
  volumeTopMargin?: number;
  priceScaleMode?: 'linear' | 'logarithmic' | 'percentage';
  autoScale?: boolean;
  invertScale?: boolean;
  showGridlines?: boolean;
  showCrosshair?: boolean;
  upColor?: string;
  downColor?: string;
  wickUpColor?: string;
  wickDownColor?: string;
  borderUpColor?: string;
  borderDownColor?: string;
  backgroundColor?: string;
  backgroundType?: 'solid' | 'gradient';
  backgroundTopColor?: string;
  backgroundBottomColor?: string;
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
  smoothing?: number;
}

export interface DrawingPoint {
  time: number;
  price: number;
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
  visible?: boolean;
  locked?: boolean;
}

export interface Trade {
  id: string;
  sourceId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop';
  price: number;
  qty: number;
  value: number;
  timestamp: number;
  status: 'filled' | 'open' | 'cancelled';
  pnl?: number;
  exitPrice?: number;
  mode?: 'live' | 'simulated';
  stopLoss?: number;
  takeProfit?: number;
}

export interface FileStreamState {
  file: File | null;
  path?: string;
  cursor: number;
  leftover: string;
  isLoading: boolean;
  hasMore: boolean;
  fileSize: number;
}

export interface TabSession {
  id: string;
  title: string;
  symbolId: string;
  sourceId: string;
  timeframe: Timeframe;
  config: ChartConfig;
  fileState?: FileStreamState;
  filePath?: string;
  isReplayMode: boolean;
  isAdvancedReplayMode: boolean;
  isReplaySelecting: boolean;
  isReplayPlaying: boolean;
  replaySpeed: number;
  isDetached: boolean;
  isMarketOverviewOpen: boolean;
  drawings: Drawing[];
  folders: Folder[];
  trades: Trade[];
}

export interface TabVaultData {
  rawData: OHLCV[];
  data: OHLCV[];
  replayIndex: number;
  replayGlobalTime: number | null;
  simulatedPrice: number | null;
  visibleRange: { from: number; to: number } | null;
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
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
  symbol?: string;
  timeframe?: string;
}

export interface StickyNoteData {
  id: string;
  title: string;
  content: string;
  inkData: string | null;
  mode: 'text' | 'ink';
  isMinimized: boolean;
  isPinned?: boolean;
  position: { x: number; y: number };
  size: { w: number; h: number };
  zIndex: number;
  color: 'yellow' | 'blue' | 'green' | 'red' | 'dark' | 'gray';
}

export interface WatchlistItem {
  symbol: string;
  addedAt: number;
}

export interface SanitizationStats {
  fixedZeroes: number;
  fixedLogic: number;
  filledGaps: number;
  outliers: number;
  totalRecords: number;
}