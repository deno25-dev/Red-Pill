
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { 
  createChart, 
  ColorType, 
  CrosshairMode, 
  IChartApi, 
  ISeriesApi, 
  PriceScaleMode,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  PrimitivePaneViewZOrder,
  LineSeries,
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
  Logical,
  MouseEventParams,
  LogicalRange,
  Time,
  SeriesMarker
} from 'lightweight-charts';
import { OHLCV, ChartConfig, Drawing, DrawingPoint, DrawingProperties, Trade, Timeframe } from '../types';
import { COLORS } from '../constants';
import { smoothPoints, formatDuration, getTimeframeDuration } from '../utils/dataUtils';
import { debugLog } from '../utils/logger';
import { ChevronsRight, Check, X as XIcon } from 'lucide-react';
import { useChartReplay } from '../hooks/useChartReplay';
import { useAdvancedReplay } from '../hooks/useAdvancedReplay';
import { useDrawingRegistry } from '../hooks/useDrawingRegistry';

// ... (KEEP ALL EXISTING HELPER FUNCTIONS AND CLASSES: pDistance, isPointInPoly, drawMeasureLabel, DrawingsPaneRenderer, DrawingsPriceAxisPaneRenderer, DrawingsPriceAxisPaneView, DrawingsPaneView, DrawingsPrimitive, SINGLE_POINT_TOOLS, TextInputState) ...
const OFF_SCREEN = -10000;

function pDistance(x: number, y: number, x1: number, y1: number, x2: number, y2: number) {
  const A = x - x1; const B = y - y1; const C = x2 - x1; const D = y2 - y1;
  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  let param = -1;
  if (len_sq !== 0) param = dot / len_sq;
  let xx, yy;
  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x1 + param * C; yy = y1 + param * D; }
  else { xx = x1 + param * C; yy = y1 + param * D; }
  const dx = x - xx; const dy = y - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

function isPointInPoly(x: number, y: number, points: {x: number, y: number}[]) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i].x, yi = points[i].y;
        const xj = points[j].x, yj = points[j].y;
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function drawMeasureLabel(ctx: CanvasRenderingContext2D, x: number, y: number, lines: string[], color: string) {
    const padding = 8; const lineHeight = 16;
    ctx.font = 'bold 11px sans-serif';
    let maxWidth = 0;
    lines.forEach(line => { const w = ctx.measureText(line).width; if (w > maxWidth) maxWidth = w; });
    const rectW = maxWidth + padding * 2;
    const rectH = (lineHeight * lines.length) + padding;
    const rectX = x - rectW / 2;
    const rectH_half = rectH / 2;
    const rectY = y - rectH_half;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath(); ctx.roundRect(rectX, rectY, rectW, rectH, 6); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((line, idx) => { ctx.fillText(line, x, rectY + padding + (idx * lineHeight) + lineHeight / 2); });
}

class DrawingsPaneRenderer implements IPrimitivePaneRenderer {
    constructor(private _source: DrawingsPrimitive) {}
    draw(target: any) { target.useMediaCoordinateSpace((scope: any) => { this._drawImpl(scope.context); }); }
    _drawImpl(target: CanvasRenderingContext2D) {
        if (!target || typeof target.beginPath !== 'function') return;
        const { _drawings, _series, _chart, _timeToIndex, _interactionStateRef, _currentDefaultProperties, _hoveredDrawingId } = this._source;
        if (!_series || !_chart) return;
        const { isDragging, dragDrawingId, isCreating, creatingPoints, activeToolId, draggedDrawingPoints } = _interactionStateRef.current;
        let drawingsToRender = [..._drawings];
        
        if (isCreating && creatingPoints.length > 0 && activeToolId !== 'brush') {
             drawingsToRender.push({ id: 'temp-creation', type: activeToolId || 'line', points: creatingPoints, properties: _currentDefaultProperties });
        }
        
        const timeScale = _chart.timeScale();
        const pointToScreen = (p: DrawingPoint) => {
            if (!p.time || p.time <= 0 || !Number.isFinite(p.time)) {
                return { x: OFF_SCREEN, y: OFF_SCREEN };
            }

            try {
                const price = _series.priceToCoordinate(p.price);
                if (price === null) return { x: OFF_SCREEN, y: OFF_SCREEN };
                
                let x = timeScale.timeToCoordinate(p.time / 1000 as Time);
                
                if (x === null) {
                    const data = this._source._data;
                    if (data && data.length > 0) {
                        let low = 0, high = data.length - 1, i = -1;
                        while (low <= high) {
                            const mid = Math.floor((low + high) / 2);
                            if (data[mid].time <= p.time) {
                                i = mid;
                                low = mid + 1;
                            } else {
                                high = mid - 1;
                            }
                        }

                        if (i === -1 && data.length > 1) {
                            const t1 = data[0].time;
                            const t2 = data[1].time;
                            const timeDiff = t2 - t1;
                            if (timeDiff > 0) {
                                const logical1 = this._source._timeToIndex?.get(t1);
                                const logical2 = this._source._timeToIndex?.get(t2);
                                if (logical1 !== undefined && logical2 !== undefined) {
                                    const x1 = timeScale.logicalToCoordinate(logical1 as Logical);
                                    const x2 = timeScale.logicalToCoordinate(logical2 as Logical);
                                    if (x1 !== null && x2 !== null) {
                                        const barsDiff = (p.time - t1) / timeDiff; // Will be negative
                                        x = (x1 + barsDiff * (x2 - x1)) as any;
                                    }
                                }
                            }
                        } else if (i !== -1 && i < data.length - 1) {
                            const t0 = data[i].time;
                            const t1 = data[i+1].time;
                            const timeDiff = t1 - t0;
                            if (timeDiff > 0) {
                                const logical0 = this._source._timeToIndex?.get(t0);
                                const logical1 = this._source._timeToIndex?.get(t1);
                                if (logical0 !== undefined && logical1 !== undefined) {
                                    const x0 = timeScale.logicalToCoordinate(logical0 as Logical);
                                    const x1 = timeScale.logicalToCoordinate(logical1 as Logical);
                                    if (x0 !== null && x1 !== null) {
                                        const progress = (p.time - t0) / timeDiff;
                                        x = (x0 + progress * (x1 - x0)) as any;
                                    }
                                }
                            }
                        } else if (i === data.length - 1) {
                            const t_last = data[data.length - 1].time;
                            const t_prev = data.length > 1 ? data[data.length - 2].time : t_last - getTimeframeDuration(this._source._timeframe as any);
                            const timeDiff = t_last - t_prev;
                            if (timeDiff > 0) {
                                const logical_last = this._source._timeToIndex?.get(t_last);
                                const logical_prev = this._source._timeToIndex?.get(t_prev);
                                if (logical_last !== undefined && logical_prev !== undefined) {
                                    const x_last = timeScale.logicalToCoordinate(logical_last as Logical);
                                    const x_prev = timeScale.logicalToCoordinate(logical_prev as Logical);
                                    if (x_last !== null && x_prev !== null) {
                                        const barsDiff = (p.time - t_last) / timeDiff; // Will be positive
                                        x = (x_last + barsDiff * (x_last - x_prev)) as any;
                                    }
                                }
                            }
                        }
                    }
                }
                
                if (x === null || !Number.isFinite(x)) {
                    return { x: OFF_SCREEN, y: OFF_SCREEN };
                }

                return { x, y: price };
            } catch { return { x: OFF_SCREEN, y: OFF_SCREEN }; }
        };
        
        drawingsToRender.forEach(d => {
            if (d.properties.visible === false) return;
            let pointsToRender = d.points;
            if (isDragging && dragDrawingId === d.id && draggedDrawingPoints) {
                pointsToRender = draggedDrawingPoints;
            }

            const screenPoints = pointsToRender.map(pointToScreen);
            
            if (screenPoints.every(p => p.x === OFF_SCREEN && p.y === OFF_SCREEN)) return;
            const isSelected = d.id === this._source._selectedDrawingId;
            const isBeingDragged = d.id === dragDrawingId;
            const isHovered = d.id === _hoveredDrawingId;
            const isLocked = d.properties.locked;

            target.save(); 

            if (isHovered && !isSelected && !isBeingDragged && !isLocked) {
                target.filter = 'brightness(1.2)';
            }

            target.beginPath(); target.strokeStyle = d.properties.color; target.lineCap = 'round'; target.lineJoin = 'round';
            if (isSelected || isBeingDragged) { target.lineWidth = d.properties.lineWidth + 1; target.shadowColor = d.properties.color; target.shadowBlur = 10; }
            else { target.lineWidth = d.properties.lineWidth; target.shadowColor = 'transparent'; target.shadowBlur = 0; }
            if (d.properties.lineStyle === 'dashed') target.setLineDash([10, 10]);
            else if (d.properties.lineStyle === 'dotted') target.setLineDash([3, 6]);
            else target.setLineDash([]);
            const isFilled = d.properties.filled;
            target.fillStyle = isFilled ? d.properties.backgroundColor || 'rgba(59, 130, 246, 0.1)' : 'transparent';
            
            if (d.type === 'trend_line' || d.type === 'ray' || d.type === 'arrow_line') {
                if (screenPoints.length < 2) { target.restore(); return; }
                const p1 = screenPoints[0]; const p2 = screenPoints[1];
                if (p1.x === OFF_SCREEN || p2.x === OFF_SCREEN) { target.restore(); return; }
                target.moveTo(p1.x, p1.y);
                if (d.type === 'ray') {
                    const dx = p2.x - p1.x; const dy = p2.y - p1.y; const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist > 0.1) { const ext = 50000; target.lineTo(p1.x + (dx/dist)*ext, p1.y + (dy/dist)*ext); }
                    else target.lineTo(p2.x, p2.y);
                } else target.lineTo(p2.x, p2.y);
                target.stroke();
                if (d.type === 'arrow_line') {
                    const headLen = 12; const dx = p2.x - p1.x; const dy = p2.y - p1.y;
                    const angle = Math.atan2(dy, dx);
                    target.beginPath(); target.moveTo(p2.x, p2.y);
                    target.lineTo(p2.x - headLen * Math.cos(angle - Math.PI / 6), p2.y - headLen * Math.sin(angle - Math.PI / 6));
                    target.moveTo(p2.x, p2.y);
                    target.lineTo(p2.x - headLen * Math.cos(angle + Math.PI / 6), p2.y - headLen * Math.sin(angle + Math.PI / 6));
                    target.stroke();
                }
            }
            else if (d.type === 'brush') {
                 if (screenPoints.length < 2) { target.restore(); return; }
                 target.beginPath(); let started = false;
                 for(let i=0; i<screenPoints.length; i++) {
                     const p = screenPoints[i]; if (p.x !== OFF_SCREEN && p.y !== OFF_SCREEN) { if (!started) { target.moveTo(p.x, p.y); started = true; } else target.lineTo(p.x, p.y); }
                 }
                 target.stroke();
            }
            else if (d.type === 'horizontal_line') { if (screenPoints.length > 0 && screenPoints[0].y !== OFF_SCREEN) { target.moveTo(-50000, screenPoints[0].y); target.lineTo(50000, screenPoints[0].y); target.stroke(); } }
            else if (d.type === 'vertical_line') { if (screenPoints.length > 0 && screenPoints[0].x !== OFF_SCREEN) { target.moveTo(screenPoints[0].x, -50000); target.lineTo(screenPoints[0].x, 50000); target.stroke(); } }
            else if (d.type === 'horizontal_ray') { if (screenPoints.length > 0 && screenPoints[0].y !== OFF_SCREEN && screenPoints[0].x !== OFF_SCREEN) { target.moveTo(screenPoints[0].x, screenPoints[0].y); target.lineTo(50000, screenPoints[0].y); target.stroke(); } }
            else if (d.type === 'rectangle' || d.type === 'date_range' || d.type === 'measure') {
                if (screenPoints.length < 2) { target.restore(); return; }
                const p1 = screenPoints[0]; const p2 = screenPoints[1];
                if (p1.x === OFF_SCREEN || p2.x === OFF_SCREEN) { target.restore(); return; }
                const x = Math.min(p1.x, p2.x); const w = Math.abs(p2.x - p1.x);
                if (d.type === 'date_range') {
                     target.fillStyle = d.properties.backgroundColor || 'rgba(59, 130, 246, 0.1)';
                     target.fillRect(x, 0, w, target.canvas.height / window.devicePixelRatio); 
                     target.beginPath(); target.moveTo(x, 0); target.lineTo(x, target.canvas.height / window.devicePixelRatio); target.moveTo(x+w, 0); target.lineTo(x+w, target.canvas.height / window.devicePixelRatio); target.stroke();
                     const idx1 = _timeToIndex?.get(pointsToRender[0].time) ?? 0; const idx2 = _timeToIndex?.get(pointsToRender[1].time) ?? 0;
                     drawMeasureLabel(target, x + w / 2, 30, [`${Math.abs(idx2 - idx1)} bars`, formatDuration(pointsToRender[1].time - pointsToRender[0].time)], d.properties.color);
                } else {
                    const y = Math.min(p1.y, p2.y); const h = Math.abs(p2.y - p1.y);
                    if (isFilled || d.type === 'measure') { target.fillStyle = d.properties.backgroundColor || 'rgba(59, 130, 246, 0.1)'; target.fillRect(x, y, w, h); }
                    target.strokeRect(x, y, w, h);
                    if (d.type === 'measure') {
                        const priceDiff = pointsToRender[1].price - pointsToRender[0].price; const pricePct = (priceDiff / pointsToRender[0].price) * 100;
                        const idx1 = _timeToIndex?.get(pointsToRender[0].time) ?? 0; const idx2 = _timeToIndex?.get(pointsToRender[1].time) ?? 0;
                        drawMeasureLabel(target, x + w / 2, y + h / 2, [`${priceDiff > 0 ? '+' : ''}${priceDiff.toFixed(2)} (${pricePct > 0 ? '+' : ''}${pricePct.toFixed(2)}%)`, `${Math.abs(idx2 - idx1)} bars, ${formatDuration(pointsToRender[1].time - pointsToRender[0].time)}`], d.properties.color);
                    }
                }
            }
            else if (d.type === 'triangle' || d.type === 'rotated_rectangle') {
                 if (screenPoints.length >= 3) {
                     target.beginPath(); target.moveTo(screenPoints[0].x, screenPoints[0].y);
                     for(let i=1; i<screenPoints.length; i++) target.lineTo(screenPoints[i].x, screenPoints[i].y);
                     if (d.type === 'rotated_rectangle' && screenPoints.length >= 3) {
                         const p0=screenPoints[0], p1=screenPoints[1], p2=screenPoints[2];
                         const ux = p1.x - p0.x, uy = p1.y - p0.y, vx = p2.x - p1.x, vy = p2.y - p1.y, uLenSq = ux*ux + uy*uy;
                         let hx = vx, hy = vy; if (uLenSq > 0) { const proj = (vx*ux + vy*uy)/uLenSq; hx = vx - ux*proj; hy = vy - uy*proj; }
                         target.lineTo(p0.x+hx, p0.y+hy);
                     }
                     target.closePath(); if (isFilled) target.fill(); target.stroke();
                 }
            }
            else if (d.type === 'circle') {
                if (screenPoints.length >= 2) {
                     const r = Math.hypot(screenPoints[1].x - screenPoints[0].x, screenPoints[1].y - screenPoints[0].y);
                     target.beginPath(); target.arc(screenPoints[0].x, screenPoints[0].y, r, 0, 2*Math.PI);
                     if (isFilled) target.fill(); target.stroke();
                }
            }
            else if (d.type === 'text') {
                 if (screenPoints.length >= 1 && screenPoints[0].x !== OFF_SCREEN) {
                     target.setLineDash([]); target.font = `${d.properties.fontSize || 14}px sans-serif`; target.fillStyle = d.properties.color;
                     target.textAlign = d.properties.textAlign || 'left'; target.textBaseline = 'top';
                     const lines = (d.properties.text || 'Text').split('\n');
                     const lineHeight = (d.properties.fontSize || 14) * 1.2;
                     lines.forEach((line, i) => {
                         target.fillText(line, screenPoints[0].x, screenPoints[0].y + (i * lineHeight));
                     });
                 }
            }
            if (isSelected && !isDragging && !isCreating) {
                 target.fillStyle = '#ffffff'; target.strokeStyle = '#3b82f6'; target.lineWidth = 1; target.setLineDash([]);
                 screenPoints.forEach(p => { if (p.x !== OFF_SCREEN) { target.beginPath(); target.arc(p.x, p.y, 4, 0, 2*Math.PI); target.fill(); target.stroke(); } });
            }

            target.restore();
        });
    }
}

class DrawingsPriceAxisPaneRenderer {
    constructor(private _source: DrawingsPrimitive) {}
    draw(target: any) { target.useMediaCoordinateSpace((scope: any) => { this._drawImpl(scope.context, scope.mediaSize.width); }); }
    _drawImpl(ctx: CanvasRenderingContext2D, width: number) {
        const { _drawings, _series } = this._source;
        if (!_series) return;
        const priceFormatter = _series.priceFormatter();
        _drawings.forEach(d => {
            if (d.properties.visible === false || (d.type !== 'horizontal_ray' && d.type !== 'horizontal_line') || d.points.length === 0) return;
            const price = d.points[0].price; const y = _series.priceToCoordinate(price);
            if (y === null) return;
            const text = priceFormatter.format(price); const labelHeight = 22; const labelY = y - labelHeight / 2;
            ctx.fillStyle = d.properties.color; ctx.fillRect(0, labelY, width, labelHeight);
            ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(text, width / 2, y);
        });
    }
}

class DrawingsPriceAxisPaneView {
    constructor(private _source: DrawingsPrimitive) {}
    renderer() { return new DrawingsPriceAxisPaneRenderer(this._source); }
    zOrder(): PrimitivePaneViewZOrder { return 'top'; }
}

class DrawingsPaneView {
    constructor(private _source: DrawingsPrimitive) {}
    renderer() { return new DrawingsPaneRenderer(this._source); }
}

class DrawingsPrimitive implements ISeriesPrimitive {
    _chart: IChartApi; _series: ISeriesApi<any>; _drawings: Drawing[] = []; _timeToIndex: Map<number, number> | null = null;
    _interactionStateRef: React.MutableRefObject<any>; _currentDefaultProperties: DrawingProperties; _selectedDrawingId: string | null = null;
    _hoveredDrawingId: string | null = null;
    _timeframe: string = '1h'; 
    _lastTime: number | null = null;
    _lastIndex: number = 0;
    _data: OHLCV[] = [];
    _paneViews: DrawingsPaneView[]; _priceAxisViews: DrawingsPriceAxisPaneView[];
    constructor(chart: IChartApi, series: ISeriesApi<any>, interactionStateRef: React.MutableRefObject<any>, defaults: DrawingProperties, timeframe: string) {
        this._chart = chart; this._series = series; this._interactionStateRef = interactionStateRef; this._currentDefaultProperties = defaults;
        this._timeframe = timeframe; this._paneViews = [new DrawingsPaneView(this)]; this._priceAxisViews = [new DrawingsPriceAxisPaneView(this)];
    }
    update(drawings: Drawing[], timeToIndex: Map<number, number>, defaults: DrawingProperties, selectedId: string | null, timeframe: string, lastTime: number | null, lastIndex: number, data: OHLCV[]) {
        this._drawings = drawings; this._timeToIndex = timeToIndex; this._currentDefaultProperties = defaults; this._selectedDrawingId = selectedId; this._timeframe = timeframe;
        this._lastTime = lastTime; this._lastIndex = lastIndex;
        this._data = data;
    }
    paneViews() { return this._paneViews; }
    priceAxisPaneViews() { return this._priceAxisViews as any; }
}

const SINGLE_POINT_TOOLS = ['text', 'horizontal_line', 'vertical_line', 'horizontal_ray'];

interface TextInputState {
    visible: boolean;
    x: number;
    y: number;
    text: string;
    point: DrawingPoint | null;
}

interface ChartProps {
  id?: string;
  data: OHLCV[]; // Currently displayed data (slice)
  smaData: (number | null)[];
  config: ChartConfig;
  timeframe: string;
  onConfigChange?: (newConfig: ChartConfig) => void;
  drawings: Drawing[];
  onUpdateDrawings: (drawings: Drawing[]) => void;
  activeToolId: string;
  onToolComplete: () => void;
  currentDefaultProperties: DrawingProperties;
  selectedDrawingId: string | null;
  onSelectDrawing: (id: string | null, e?: React.MouseEvent) => void;
  onActionStart?: () => void;
  isReplaySelecting?: boolean;
  onReplayPointSelect?: (time: number) => void;
  onRequestMoreData?: () => void;
  areDrawingsLocked?: boolean;
  isMagnetMode?: boolean;
  isSyncing?: boolean;
  isStayInDrawingMode?: boolean;
  
  visibleRange: { from: number; to: number } | null;
  onVisibleRangeChange?: (range: { from: number; to: number }) => void;

  fullData?: OHLCV[]; 
  replayIndex?: number;
  isPlaying?: boolean;
  replaySpeed?: number;
  onReplaySync?: (index: number, time: number, price: number) => void;
  onReplayComplete?: () => void;
  isAdvancedReplay?: boolean; 
  liveTimeRef?: React.MutableRefObject<number | null>; 

  trades?: Trade[];
  isDrawingSyncEnabled?: boolean;
  focusTimestamp?: number | null; 
  isMasterSyncActive?: boolean;
}

export const FinancialChart: React.FC<ChartProps> = (props) => {
  const { 
    data, 
    smaData, 
    config, 
    timeframe, 
    onConfigChange: _onConfigChange, 
    drawings, 
    onUpdateDrawings, 
    activeToolId, 
    onToolComplete, 
    currentDefaultProperties, 
    selectedDrawingId, 
    onSelectDrawing, 
    onActionStart, 
    isReplaySelecting, 
    onReplayPointSelect, 
    areDrawingsLocked = false, 
    visibleRange, 
    fullData,
    replayIndex,
    isPlaying = false,
    replaySpeed = 1,
    onReplaySync,
    onReplayComplete,
    isAdvancedReplay = false,
    liveTimeRef,
    trades = [],
    isDrawingSyncEnabled = true,
    focusTimestamp,
    isMasterSyncActive = false
  } = props;

  const propsRef = useRef(props); useEffect(() => { propsRef.current = props; });
  const chartContainerRef = useRef<HTMLDivElement>(null); const canvasRef = useRef<HTMLCanvasElement>(null); 
  const chartRef = useRef<IChartApi | null>(null); 
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null); const smaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const drawingsPrimitiveRef = useRef<DrawingsPrimitive | null>(null); const rangeChangeTimeout = useRef<any>(null);
  const rafId = useRef<number | null>(null);
  const replayMouseX = useRef<number | null>(null); const ignoreRangeChange = useRef(false);
  const isProgrammaticUpdate = useRef(false);
  const rangeDebounceTimeout = useRef<any>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [textInputState, setTextInputState] = useState<TextInputState | null>(null);
  const [reinitCount, setReinitCount] = useState(0);
  const isReplayActive = isPlaying || (fullData && fullData.length > 0 && data.length < fullData.length);
  const { register, forceClear, registry } = useDrawingRegistry(chartRef, seriesRef);

  useEffect(() => {
      const container = chartContainerRef.current;
      if (!container) return;
      const enforceCursor = () => { if (container.style.cursor === 'default') container.style.cursor = 'crosshair'; };
      const observer = new MutationObserver((mutations) => { mutations.forEach((mutation) => { if (mutation.type === 'attributes' && mutation.attributeName === 'style') enforceCursor(); }); });
      observer.observe(container, { attributes: true, attributeFilter: ['style'] });
      container.style.cursor = 'crosshair';
      return () => observer.disconnect();
  }, []);

  const visibleDrawings = useMemo(() => {
    if (isDrawingSyncEnabled) return drawings;
    return drawings.filter(d => !d.creationTimeframe || d.creationTimeframe === timeframe);
  }, [drawings, timeframe, isDrawingSyncEnabled]);

  const visibleDrawingsRef = useRef(visibleDrawings);
  useEffect(() => { visibleDrawingsRef.current = visibleDrawings; }, [visibleDrawings]);

  useEffect(() => {
    const handleForceClear = () => { forceClear(); setReinitCount(c => c + 1); };
    window.addEventListener('redpill-force-clear', handleForceClear);
    return () => window.removeEventListener('redpill-force-clear', handleForceClear);
  }, [forceClear]);

  // --- REPLAY ENGINES ---
  
  useChartReplay({
    seriesRef,
    fullData,
    startIndex: replayIndex || 0,
    isPlaying: isPlaying && !isAdvancedReplay, 
    speed: replaySpeed,
    onSyncState: onReplaySync,
    onComplete: onReplayComplete,
    liveTimeRef 
  });

  const { displayState } = useAdvancedReplay({
    seriesRef,
    fullData,
    startIndex: replayIndex || 0,
    isPlaying,
    speed: replaySpeed || 1,
    onSyncState: onReplaySync,
    onComplete: onReplayComplete,
    isActive: isAdvancedReplay,
    liveTimeRef,
    timeframe: timeframe as Timeframe,
    chartType: config.chartType 
  });

  // Calculate dynamic position for the advanced replay overlay
  // Ensure we round the coordinate to snap to pixel grid (avoids sub-pixel blurring)
  const timerY = (isAdvancedReplay && displayState.visible && seriesRef.current) 
      ? Math.round(seriesRef.current.priceToCoordinate(displayState.price) ?? 0)
      : null;

  // ... (Rest of Chart.tsx logic) ...
  const interactionState = useRef<{ isDragging: boolean; isCreating: boolean; dragDrawingId: string | null; dragHandleIndex: number | null; startPoint: { x: number; y: number } | null; creatingPoints: DrawingPoint[]; creationStep: number; activeToolId: string; initialDrawingPoints: DrawingPoint[] | null; draggedDrawingPoints: DrawingPoint[] | null; }>({ isDragging: false, isCreating: false, dragDrawingId: null, dragHandleIndex: null, startPoint: null, creatingPoints: [], creationStep: 0, activeToolId: propsRef.current.activeToolId, initialDrawingPoints: null, draggedDrawingPoints: null });
  useEffect(() => { interactionState.current.activeToolId = activeToolId; }, [activeToolId]);
  useEffect(() => { const handleReset = () => { interactionState.current = { isDragging: false, isCreating: false, dragDrawingId: null, dragHandleIndex: null, startPoint: null, creatingPoints: [], creationStep: 0, activeToolId: propsRef.current.activeToolId, initialDrawingPoints: null, draggedDrawingPoints: null }; setTextInputState(null); }; window.addEventListener('GLOBAL_ASSET_CHANGE', handleReset); return () => window.removeEventListener('GLOBAL_ASSET_CHANGE', handleReset); }, []);
  const processedData = useMemo(() => { if (config.chartType === 'line' || config.chartType === 'area') { return data.map(d => ({ time: (d.time / 1000) as Time, value: d.close })); } return data.map(d => ({ time: (d.time / 1000) as Time, open: d.open, high: d.high, low: d.low, close: d.close })); }, [data, config.chartType]);
  const timeToIndex = useMemo(() => { const map = new Map<number, number>(); for(let i=0; i<data.length; i++) map.set(data[i].time, i); return map; }, [data]);
  const timeToIndexRef = useRef(timeToIndex); useEffect(() => { timeToIndexRef.current = timeToIndex; }, [timeToIndex]);
  useEffect(() => { if (drawingsPrimitiveRef.current) { const lastCandle = data.length > 0 ? data[data.length - 1] : null; drawingsPrimitiveRef.current.update(visibleDrawings, timeToIndex, currentDefaultProperties, selectedDrawingId, timeframe, lastCandle ? lastCandle.time : null, data.length - 1, data); requestDraw(); } }, [visibleDrawings, timeToIndex, currentDefaultProperties, selectedDrawingId, timeframe, data]);
  
  // FIX: Force redraw when drawings change, ensuring multi-chart sync
  useEffect(() => {
      if (drawingsPrimitiveRef.current && chartRef.current) {
          requestDraw();
      }
  }, [drawings]);

  useEffect(() => { if (seriesRef.current && trades && Array.isArray(trades)) { const seriesApi = seriesRef.current as any; if (typeof seriesApi.setMarkers !== 'function') return; const markers: SeriesMarker<Time>[] = trades.map(t => ({ time: (t.timestamp / 1000) as Time, position: t.side === 'buy' ? 'belowBar' : 'aboveBar', color: t.side === 'buy' ? COLORS.bullish : COLORS.bearish, shape: t.side === 'buy' ? 'arrowUp' : 'arrowDown', text: `${t.side.toUpperCase()} @ ${t.price.toFixed(2)}` })); try { seriesApi.setMarkers(markers); } catch (e) {} } }, [trades, processedData]); 
  const requestDraw = () => { if (rafId.current) cancelAnimationFrame(rafId.current); rafId.current = requestAnimationFrame(renderOverlayAndSync); };
  const renderOverlayAndSync = () => { renderOverlay(); if (chartRef.current) { if ((chartRef.current as any)._renderer) (chartRef.current as any)._renderer._redrawVisible(); else chartRef.current.timeScale().applyOptions({}); } };
  useEffect(() => { if (chartRef.current && visibleRange) { const current = chartRef.current.timeScale().getVisibleLogicalRange(); if (current) { const diffFrom = Math.abs(current.from - visibleRange.from); const diffTo = Math.abs(current.to - visibleRange.to); if (diffFrom > 0.1 || diffTo > 0.1) { isProgrammaticUpdate.current = true; chartRef.current.timeScale().setVisibleLogicalRange(visibleRange as LogicalRange); setTimeout(() => { isProgrammaticUpdate.current = false; }, 100); } } else { isProgrammaticUpdate.current = true; chartRef.current.timeScale().setVisibleLogicalRange(visibleRange as LogicalRange); setTimeout(() => { isProgrammaticUpdate.current = false; }, 100); } } }, [visibleRange]);
  useEffect(() => { if (focusTimestamp && chartRef.current && timeToIndexRef.current) { const index = timeToIndexRef.current.get(focusTimestamp); if (index !== undefined) { const timeScale = chartRef.current.timeScale(); const rangeSize = 100; const from = index - (rangeSize / 2); const to = index + (rangeSize / 2); isProgrammaticUpdate.current = true; timeScale.setVisibleLogicalRange({ from, to } as LogicalRange); setTimeout(() => { isProgrammaticUpdate.current = false; }, 300); } } }, [focusTimestamp, data]); 
  const handleSnapToRecent = useCallback((force: boolean = false) => { if (!chartRef.current) return; setTimeout(() => { if (!chartContainerRef.current || chartContainerRef.current.clientWidth === 0) return; if (!chartRef.current) return; const timeScale = chartRef.current.timeScale(); if (data.length === 0) return; const currentHeadIndex = data.length - 1; const currentRange = timeScale.getVisibleLogicalRange(); if (!currentRange) { if (data.length > 0 && !isReplayActive) timeScale.scrollToRealTime(); return; } const distanceToRightEdge = currentRange.to - currentHeadIndex; const shouldSnap = force || distanceToRightEdge < 5; if (shouldSnap) { if (isReplayActive) { const currentZoomWidth = currentRange.to - currentRange.from; const targetTo = currentHeadIndex + 2; const targetFrom = targetTo - currentZoomWidth; timeScale.setVisibleLogicalRange({ from: targetFrom as Logical, to: targetTo as Logical } as LogicalRange); } else { timeScale.scrollToRealTime(); } } }, 50); }, [isReplayActive, data.length]);
  useEffect(() => { if (!chartContainerRef.current) return; const startTime = performance.now(); const chart = createChart(chartContainerRef.current, { layout: { background: { type: ColorType.Solid, color: 'var(--app-bg)' }, textColor: 'var(--text-secondary)', }, grid: { vertLines: { color: 'var(--border-color)' }, horzLines: { color: 'var(--border-color)' } }, width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight, crosshair: { mode: CrosshairMode.Normal }, timeScale: { borderColor: 'var(--border-color)', timeVisible: true, secondsVisible: false }, rightPriceScale: { borderColor: 'var(--border-color)' }, watermark: { visible: false, }, } as any); chartRef.current = chart; const endTime = performance.now(); const renderDuration = endTime - startTime; debugLog('Perf', `Chart instance initialized in ${renderDuration.toFixed(2)}ms`, { duration: renderDuration }); if (typeof window !== 'undefined') { window.dispatchEvent(new CustomEvent('chart-render-perf', { detail: { duration: renderDuration } })); } const handleResize = (width: number, height: number) => { if (chartRef.current && canvasRef.current) { const dpr = window.devicePixelRatio || 1; chartRef.current.applyOptions({ width, height }); canvasRef.current.width = width * dpr; canvasRef.current.height = height * dpr; canvasRef.current.style.width = `${width}px`; canvasRef.current.style.height = `${height}px`; const ctx = canvasRef.current.getContext('2d'); if (ctx) ctx.scale(dpr, dpr); requestDraw(); } }; const resizeObserver = new ResizeObserver((entries) => { if (entries.length === 0 || !entries[0].contentRect) return; const { width, height } = entries[0].contentRect; if (width > 0 && height > 0) { handleResize(width, height); } }); resizeObserver.observe(chartContainerRef.current); const handleChartClick = (param: MouseEventParams) => { if (param.point) { const { activeToolId, isReplaySelecting, onSelectDrawing } = propsRef.current; if (activeToolId === 'cross' || activeToolId === 'cursor') if (!isReplaySelecting) onSelectDrawing(null); } }; chart.subscribeClick(handleChartClick); const onSyncRange = (e: any) => { if (ignoreRangeChange.current || !propsRef.current.isSyncing) return; const { range, sourceId } = e.detail; if (sourceId !== propsRef.current.id) { ignoreRangeChange.current = true; isProgrammaticUpdate.current = true; chart.timeScale().setVisibleLogicalRange(range); setTimeout(() => { ignoreRangeChange.current = false; isProgrammaticUpdate.current = false; }, 50); } }; const onSyncCrosshair = (e: any) => { const shouldSync = propsRef.current.isSyncing || propsRef.current.isMasterSyncActive; if (!shouldSync) return; const { point, sourceId } = e.detail; if (sourceId !== propsRef.current.id && chartRef.current && seriesRef.current) { chartRef.current.setCrosshairPosition( point.price, (point.time / 1000) as Time, seriesRef.current ); } }; window.addEventListener('chart-sync-range', onSyncRange); window.addEventListener('chart-sync-crosshair', onSyncCrosshair); chart.timeScale().subscribeVisibleLogicalRangeChange((range) => { requestDraw(); if (range && !ignoreRangeChange.current && propsRef.current.isSyncing) { window.dispatchEvent(new CustomEvent('chart-sync-range', { detail: { range, sourceId: propsRef.current.id } })); } if (range && propsRef.current.onRequestMoreData) { if (rangeChangeTimeout.current) clearTimeout(rangeChangeTimeout.current); rangeChangeTimeout.current = setTimeout(() => { if (range.from < 50) propsRef.current.onRequestMoreData?.(); }, 100); } if (range) { const currentData = propsRef.current.data; const lastIndex = currentData.length - 1; const dist = lastIndex - range.to; setShowScrollButton(dist > 10); if (!isProgrammaticUpdate.current && propsRef.current.onVisibleRangeChange) { if (rangeDebounceTimeout.current) clearTimeout(rangeDebounceTimeout.current); rangeDebounceTimeout.current = setTimeout(() => { if (!isProgrammaticUpdate.current) { propsRef.current.onVisibleRangeChange?.({ from: range.from, to: range.to }); } }, 500); } } }); chart.subscribeCrosshairMove((param) => { const shouldSync = propsRef.current.isSyncing || propsRef.current.isMasterSyncActive; if (param.point && !ignoreRangeChange.current && shouldSync) { let price = 0; if (seriesRef.current) { const p = seriesRef.current.coordinateToPrice(param.point.y); if (p !== null) price = p; } window.dispatchEvent(new CustomEvent('chart-sync-crosshair', { detail: { point: { time: (param.time as number) * 1000, price: price, x: param.point.x, y: param.point.y }, sourceId: propsRef.current.id } })); } }); return () => { window.removeEventListener('chart-sync-range', onSyncRange); window.removeEventListener('chart-sync-crosshair', onSyncCrosshair); resizeObserver.disconnect(); if (rangeChangeTimeout.current) clearTimeout(rangeChangeTimeout.current); if (rangeDebounceTimeout.current) clearTimeout(rangeDebounceTimeout.current); if (rafId.current) cancelAnimationFrame(rafId.current); try { chart.unsubscribeClick(handleChartClick); } catch(e) {} if (registry && registry.current) { registry.current.clear(); } chart.remove(); chartRef.current = null; seriesRef.current = null; }; }, []);
  useEffect(() => { if (!chartRef.current) return; chartRef.current.applyOptions({ timeScale: { shiftVisibleRangeOnNewBar: !isReplayActive, allowShiftVisibleRangeOnWhitespaceReplacement: !isReplayActive, } }); }, [isReplayActive]);
  
  useEffect(() => { 
      if (!chartRef.current) return; 
      const mode = config.showCrosshair !== false ? CrosshairMode.Normal : CrosshairMode.Hidden; 
      chartRef.current.applyOptions({ crosshair: { mode } }); 
      if (config.showCrosshair !== false) { 
          chartRef.current.applyOptions({ crosshair: { vertLine: { visible: true, labelVisible: true }, horzLine: { visible: true, labelVisible: true }, } }); 
      } 
  }, [activeToolId, config.showCrosshair]);

  // --- CURSOR LOGIC ---
  useEffect(() => { 
      if (canvasRef.current) { 
          const isDrawingTool = !['cross'].includes(activeToolId); 
          const isInteractive = isDrawingTool || isReplaySelecting; 
          
          if (config.showCrosshair === false) { 
              // Enforce crosshair cursor even if lines are hidden (Persistent Precision)
              document.body.style.cursor = 'crosshair'; 
              canvasRef.current.style.pointerEvents = isInteractive ? 'auto' : 'none'; 
              return; 
          } 
          
          if (isInteractive) { 
              canvasRef.current.style.pointerEvents = 'auto'; 
              if (activeToolId === 'brush') document.body.style.cursor = 'url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZHTgxNiIgdmlld0JveD0iMCAwIDE2IDE2Ij48Y2lyY2xlIGN4PSI4IiBjeT0iOCIgcj0iMyIgZmlsbD0id2hpdGUiIHN0cm9rZT0iIzNiODJmNiIHN0cm9rZS13aWR0aD0iMSIvPjwvc3ZnPg==) 8 8, crosshair'; 
              else document.body.style.cursor = 'crosshair'; 
          } else { 
              canvasRef.current.style.pointerEvents = 'none'; 
              document.body.style.cursor = 'crosshair'; 
          } 
      } 
  }, [activeToolId, isReplaySelecting, config.showCrosshair]);

  useEffect(() => { if (!chartRef.current) return; let background: any; if (config.backgroundType === 'gradient') { background = { type: ColorType.VerticalGradient, topColor: config.backgroundTopColor || (config.theme === 'light' ? '#F8FAFC' : '#0f172a'), bottomColor: config.backgroundBottomColor || (config.theme === 'light' ? '#E2E8F0' : '#0f172a'), }; } else if (config.backgroundColor) { background = { type: ColorType.Solid, color: config.backgroundColor, }; } else { background = { type: ColorType.Solid, color: config.theme === 'light' ? '#F8FAFC' : '#0f172a' }; } const textColor = config.theme === 'light' ? '#1E293B' : COLORS.text; let gridColor = 'transparent'; if (config.showGridlines !== false) { gridColor = config.theme === 'light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(148, 163, 184, 0.1)'; } const borderColor = config.theme === 'light' ? '#CBD5E1' : '#334155'; chartRef.current.applyOptions({ layout: { background, textColor, }, grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } }, timeScale: { borderColor }, rightPriceScale: { borderColor }, }); const mode = config.priceScaleMode === 'logarithmic' ? PriceScaleMode.Logarithmic : config.priceScaleMode === 'percentage' ? PriceScaleMode.Percentage : PriceScaleMode.Normal; chartRef.current.priceScale('right').applyOptions({ mode, autoScale: config.autoScale !== false, invertScale: !!config.invertScale }); }, [config.theme, config.showGridlines, config.priceScaleMode, config.autoScale, config.backgroundColor, config.backgroundType, config.backgroundTopColor, config.backgroundBottomColor, config.invertScale]);
  useEffect(() => { if (!chartRef.current) return; if (seriesRef.current) { chartRef.current.removeSeries(seriesRef.current as any); seriesRef.current = null; } let newSeries; if (config.chartType === 'line') newSeries = chartRef.current.addSeries(LineSeries, { color: COLORS.line, lineWidth: 2 }); else if (config.chartType === 'area') newSeries = chartRef.current.addSeries(AreaSeries, { lineColor: COLORS.line, topColor: COLORS.areaTop, bottomColor: COLORS.areaBottom, lineWidth: 2 }); else { const upColor = config.upColor || COLORS.bullish; const downColor = config.downColor || COLORS.bearish; const wickUpColor = config.wickUpColor || COLORS.bullish; const wickDownColor = config.wickDownColor || COLORS.bearish; const borderUpColor = config.borderUpColor || upColor; const borderDownColor = config.borderDownColor || downColor; newSeries = chartRef.current.addSeries(CandlestickSeries, { upColor, downColor, borderVisible: true, borderUpColor, borderDownColor, wickUpColor, wickDownColor }); } seriesRef.current = newSeries; newSeries.setData(processedData); handleSnapToRecent(true); const primitive = new DrawingsPrimitive(chartRef.current, newSeries, interactionState, currentDefaultProperties, timeframe); const lastCandle = data.length > 0 ? data[data.length - 1] : null; primitive.update(visibleDrawings, timeToIndex, currentDefaultProperties, selectedDrawingId, timeframe, lastCandle ? lastCandle.time : null, data.length - 1, data); register('drawings-primitive', primitive); newSeries.attachPrimitive(primitive); drawingsPrimitiveRef.current = primitive; requestDraw(); }, [config.chartType, config.upColor, config.downColor, config.wickUpColor, config.wickDownColor, config.borderUpColor, config.borderDownColor, reinitCount, handleSnapToRecent]); 
  useEffect(() => { if (!seriesRef.current || !chartRef.current) return; let savedRange: LogicalRange | null = null; if (isReplayActive) { savedRange = chartRef.current.timeScale().getVisibleLogicalRange(); } try { seriesRef.current.setData(processedData); if (isReplayActive && savedRange) { chartRef.current.timeScale().setVisibleLogicalRange(savedRange); } else { handleSnapToRecent(false); } } catch(e) {} if (volumeSeriesRef.current && config.showVolume) { const volUp = config.upColor ? config.upColor + '80' : COLORS.volumeBullish; const volDown = config.downColor ? config.downColor + '80' : COLORS.volumeBearish; volumeSeriesRef.current.setData(data.map(d => ({ time: (d.time / 1000) as Time, value: d.volume, color: d.close >= d.open ? volUp : volDown }))); } if (smaSeriesRef.current && config.showSMA) { const smaSeriesData = []; for(let i=0; i<data.length; i++) { if (smaData[i] !== null) smaSeriesData.push({ time: (data[i].time / 1000) as Time, value: smaData[i] as number }); } smaSeriesRef.current.setData(smaSeriesData); } }, [data, smaData, config.chartType, processedData, config.upColor, config.downColor, handleSnapToRecent, isReplayActive]); 
  useEffect(() => { if (!chartRef.current) return; if (config.showVolume) { if (!volumeSeriesRef.current) { volumeSeriesRef.current = chartRef.current.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume' }); chartRef.current.priceScale('volume').applyOptions({ scaleMargins: { top: config.volumeTopMargin || 0.8, bottom: 0 } }); } } else if (volumeSeriesRef.current) { chartRef.current.removeSeries(volumeSeriesRef.current); volumeSeriesRef.current = null; } if (config.showSMA) { if (!smaSeriesRef.current) smaSeriesRef.current = chartRef.current.addSeries(LineSeries, { color: COLORS.sma, lineWidth: 2, crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false }); } else if (smaSeriesRef.current) { chartRef.current.removeSeries(smaSeriesRef.current); smaSeriesRef.current = null; } }, [config.showVolume, config.showSMA, config.volumeTopMargin]);
  
  const pointToScreen = (p: DrawingPoint) => { if (!chartRef.current || !seriesRef.current) return { x: OFF_SCREEN, y: OFF_SCREEN }; try { if (!p.time || !Number.isFinite(p.time) || p.time <= 0) return { x: OFF_SCREEN, y: OFF_SCREEN }; const timeScale = chartRef.current.timeScale(); const price = seriesRef.current.priceToCoordinate(p.price); let x = timeScale.timeToCoordinate(p.time / 1000 as Time); if (x === null) { const idx = timeToIndexRef.current.get(p.time); if (idx !== undefined) x = timeScale.logicalToCoordinate(idx as Logical); else if (propsRef.current.data.length > 0) { const currentData = propsRef.current.data; const lastCandle = currentData[currentData.length - 1]; const tfMs = getTimeframeDuration(propsRef.current.timeframe as any); const diff = p.time - lastCandle.time; const bars = diff / tfMs; const targetLogical = (currentData.length - 1) + bars; x = timeScale.logicalToCoordinate(targetLogical as Logical); } } return { x: (x !== null && Number.isFinite(x)) ? x : OFF_SCREEN, y: (price !== null && Number.isFinite(price)) ? price : OFF_SCREEN }; } catch (e) { return { x: OFF_SCREEN, y: OFF_SCREEN }; } };
  const snapToCandle = (x: number, y: number) => { const currentData = propsRef.current.data; if (!chartRef.current || !seriesRef.current || currentData.length === 0) return null; const logical = chartRef.current.timeScale().coordinateToLogical(x); if (logical === null || isNaN(logical)) return null; const idx = Math.round(logical); const candle = currentData[idx]; if (!candle) return null; const prices = [{ val: candle.open, y: seriesRef.current.priceToCoordinate(candle.open) }, { val: candle.high, y: seriesRef.current.priceToCoordinate(candle.high) }, { val: candle.low, y: seriesRef.current.priceToCoordinate(candle.low) }, { val: candle.close, y: seriesRef.current.priceToCoordinate(candle.close) }]; let nearest = prices[0]; let minDist = 99999; prices.forEach(p => { if (p.y !== null) { const d = Math.abs(y - p.y); if (d < minDist) { minDist = d; nearest = p; } } }); if (minDist < 30) return { time: candle.time, price: nearest.val }; return null; };
  const screenToPoint = (x: number, y: number, applyMagnet = false) => { if (!chartRef.current || !seriesRef.current) return null; if (applyMagnet && propsRef.current.isMagnetMode) { const snapped = snapToCandle(x, y); if (snapped) return snapped; } try { const timeScale = chartRef.current.timeScale(); const timeSeconds = timeScale.coordinateToTime(x); const price = seriesRef.current.coordinateToPrice(y); if (timeSeconds === null || price === null || !Number.isFinite(timeSeconds as number) || !Number.isFinite(price)) { const logical = timeScale.coordinateToLogical(x); if (logical !== null && propsRef.current.data.length > 0) { const currentData = propsRef.current.data; const lastIdx = currentData.length - 1; const diff = logical - lastIdx; const tfMs = getTimeframeDuration(propsRef.current.timeframe as any); const estimatedTime = currentData[lastIdx].time + (diff * tfMs); if (!Number.isFinite(estimatedTime)) return null; return { time: estimatedTime, price: price || 0 }; } return null; } return { time: (timeSeconds as number) * 1000, price }; } catch (e) { return null; } };
  const renderOverlay = () => { const canvas = canvasRef.current; if (!canvas || !chartRef.current) return; const ctx = canvas.getContext('2d'); if (!ctx) return; const width = chartContainerRef.current?.clientWidth || 0, height = chartContainerRef.current?.clientHeight || 0; ctx.clearRect(0, 0, width, height); if (propsRef.current.isReplaySelecting && replayMouseX.current !== null) { ctx.beginPath(); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1; ctx.setLineDash([6, 4]); ctx.moveTo(replayMouseX.current, 0); ctx.lineTo(replayMouseX.current, height); ctx.stroke(); ctx.setLineDash([]); ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#ef4444'; ctx.fillText('Start Replay', replayMouseX.current + 5, 20); } const { isCreating, activeToolId, creatingPoints } = interactionState.current; if (isCreating && activeToolId === 'brush' && creatingPoints.length > 1) { const screenPoints = creatingPoints.map(pointToScreen); const props = propsRef.current.currentDefaultProperties; ctx.beginPath(); ctx.strokeStyle = props.color; ctx.lineWidth = props.lineWidth; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; if (props.lineStyle === 'dashed') ctx.setLineDash([10, 10]); else if (props.lineStyle === 'dotted') ctx.setLineDash([3, 6]); else ctx.setLineDash([]); let started = false; for(let i=0; i<screenPoints.length; i++) { const p = screenPoints[i]; if (p.x !== OFF_SCREEN && p.y !== OFF_SCREEN) { if (!started) { ctx.moveTo(p.x, p.y); started = true; } else { ctx.lineTo(p.x, p.y); } } } ctx.stroke(); } };
  const getHitObject = (x: number, y: number) => { let hitHandle: { id: string; index: number } | null = null; let hitDrawing: Drawing | null = null; const { selectedDrawingId } = propsRef.current; const currentVisibleDrawings = visibleDrawingsRef.current; if (selectedDrawingId) { const d = currentVisibleDrawings.find(dr => dr.id === selectedDrawingId); if (d && !d.properties.locked && d.properties.visible !== false) { const screenPoints = d.points.map(pointToScreen); for(let i=0; i<screenPoints.length; i++) { const p = screenPoints[i]; if (p.x !== OFF_SCREEN && Math.hypot(p.x - x, p.y - y) < 8) { return { hitHandle: { id: d.id, index: i }, hitDrawing: d }; } } } } for (let i = currentVisibleDrawings.length - 1; i >= 0; i--) { const d = currentVisibleDrawings[i]; if (d.properties.visible === false) continue; const screenPoints = d.points.map(pointToScreen); if (screenPoints.every(p => p.x === OFF_SCREEN)) continue; let hit = false; if (d.type === 'trend_line' || d.type === 'ray' || d.type === 'arrow_line') { const p1 = screenPoints[0], p2 = screenPoints[1]; if (p1.x !== OFF_SCREEN && p2.x !== OFF_SCREEN && pDistance(x, y, p1.x, p1.y, p2.x, p2.y) < 6) hit = true; } else if (d.type === 'brush') { for (let j = 0; j < screenPoints.length - 1; j++) { const p1 = screenPoints[j], p2 = screenPoints[j+1]; if (p1.x !== OFF_SCREEN && p2.x !== OFF_SCREEN && pDistance(x, y, p1.x, p1.y, p2.x, p2.y) < 6) { hit = true; break; } } } else if (d.type === 'horizontal_line') { if (screenPoints[0]?.y !== OFF_SCREEN && Math.abs(y - screenPoints[0].y) < 6) hit = true; } else if (d.type === 'horizontal_ray') { if (screenPoints[0]?.y !== OFF_SCREEN && screenPoints[0]?.x !== OFF_SCREEN && Math.abs(y - screenPoints[0].y) < 6 && x >= screenPoints[0].x - 10) hit = true; } else if (d.type === 'vertical_line') { if (screenPoints[0]?.x !== OFF_SCREEN && Math.abs(x - screenPoints[0].x) < 6) hit = true; } else if (d.type === 'rectangle' || d.type === 'date_range' || d.type === 'measure') { const minX = Math.min(screenPoints[0].x, screenPoints[1].x), maxX = Math.max(screenPoints[0].x, screenPoints[1].x); const minY = d.type === 'date_range' ? 0 : Math.min(screenPoints[0].y, screenPoints[1].y); const maxY = d.type === 'date_range' ? 10000 : Math.max(screenPoints[0].y, screenPoints[1].y); if (x >= minX && x <= maxX && y >= minY && y <= maxY) { if (d.properties.filled || d.type === 'date_range' || d.type === 'measure') hit = true; else { const tol = 6; if (Math.abs(x - minX) < tol || Math.abs(x - maxX) < tol || Math.abs(y - minY) < tol || Math.abs(y - maxY) < tol) hit = true; } } } else if (d.type === 'triangle' || d.type === 'rotated_rectangle') { if (isPointInPoly(x, y, screenPoints as any)) hit = true; } else if (d.type === 'circle') { if (screenPoints.length >= 2) { const r = Math.hypot(screenPoints[1].x - screenPoints[0].x, screenPoints[1].y - screenPoints[0].y), dist = Math.hypot(x - screenPoints[0].x, y - screenPoints[0].y); if (d.properties.filled ? dist <= r : Math.abs(dist - r) < 6) hit = true; } } else if (d.type === 'text') { const p = screenPoints[0]; if (p?.x !== OFF_SCREEN) { const h = d.properties.fontSize || 14, w = (d.properties.text?.length || 4) * (h * 0.6); if (x >= p.x - 5 && x <= p.x + w && y >= p.y - 5 && y <= p.y + h + 5) hit = true; } } if (hit) { hitDrawing = d; break; } } return { hitHandle, hitDrawing }; };
  
  const handleContainerMouseMove = (e: React.MouseEvent) => { 
      if (isReplaySelecting && canvasRef.current) { 
          const rect = canvasRef.current.getBoundingClientRect(); 
          replayMouseX.current = e.clientX - rect.left; 
          requestDraw(); 
          return; 
      } 
      if (interactionState.current.isCreating || interactionState.current.isDragging) return; 
      if (activeToolId !== 'cross' && activeToolId !== 'cursor') return; 
      
      if (chartContainerRef.current && canvasRef.current) { 
          const rect = chartContainerRef.current.getBoundingClientRect(); 
          const { hitHandle, hitDrawing } = getHitObject(e.clientX - rect.left, e.clientY - rect.top); 
          
          if (drawingsPrimitiveRef.current) { 
              const newHoverId = hitDrawing ? hitDrawing.id : null; 
              if (drawingsPrimitiveRef.current._hoveredDrawingId !== newHoverId) { 
                  drawingsPrimitiveRef.current._hoveredDrawingId = newHoverId; 
                  requestDraw(); 
              } 
          } 
          
          // Interaction Logic
          const isInteractive = (hitHandle || hitDrawing) && !areDrawingsLocked;

          if (propsRef.current.config.showCrosshair === false) { 
              document.body.style.cursor = 'crosshair'; 
              canvasRef.current.style.pointerEvents = isInteractive ? 'auto' : 'none'; 
              return; 
          } 
          
          if (isInteractive) { 
              // Force Crosshair unless locked
              if (hitDrawing?.properties.locked) {
                  document.body.style.cursor = 'not-allowed';
              } else {
                  document.body.style.cursor = 'crosshair';
              }
              canvasRef.current.style.pointerEvents = 'auto'; 
          } else { 
              document.body.style.cursor = 'crosshair'; 
              canvasRef.current.style.pointerEvents = 'none'; 
          } 
      } 
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => { if (e.button !== 0) return; const rect = canvasRef.current!.getBoundingClientRect(); const x = e.clientX - rect.left, y = e.clientY - rect.top; if (isReplaySelecting) { const p = screenToPoint(x, y, true); if (p && onReplayPointSelect) onReplayPointSelect(p.time); return; } const { hitHandle, hitDrawing } = getHitObject(x, y); const isDrawingTool = !['cross'].includes(activeToolId); if (isDrawingTool) { onActionStart?.(); const p = screenToPoint(x, y, activeToolId !== 'brush' && activeToolId !== 'text'); if (p) { interactionState.current.isCreating = true; if (activeToolId === 'brush' || SINGLE_POINT_TOOLS.includes(activeToolId)) { interactionState.current.creatingPoints = [p]; interactionState.current.creationStep = 0; } else { interactionState.current.creationStep = 1; const points = [p, p]; if (activeToolId === 'triangle' || activeToolId === 'rotated_rectangle') points.push(p); interactionState.current.creatingPoints = points; } } } else if (!areDrawingsLocked) { if (hitHandle) { onActionStart?.(); onSelectDrawing(hitHandle.id, e); interactionState.current.isDragging = true; interactionState.current.dragDrawingId = hitHandle.id; interactionState.current.dragHandleIndex = hitHandle.index; } else if (hitDrawing) { onSelectDrawing(hitDrawing.id, e); if (hitDrawing.properties.locked) return; onActionStart?.(); interactionState.current.isDragging = true; interactionState.current.dragDrawingId = hitDrawing.id; interactionState.current.dragHandleIndex = -1; interactionState.current.startPoint = { x, y }; interactionState.current.initialDrawingPoints = [...hitDrawing.points]; } else onSelectDrawing(null); } requestDraw(); };
  const handleCanvasMouseMove = (e: React.MouseEvent) => { const rect = canvasRef.current!.getBoundingClientRect(); const x = e.clientX - rect.left, y = e.clientY - rect.top; let redraw = false; if (interactionState.current.isCreating) { const p = screenToPoint(x, y, activeToolId !== 'brush' && activeToolId !== 'text'); if (p) { if (activeToolId === 'brush') { const points = [...interactionState.current.creatingPoints]; const lastScreen = pointToScreen(points[points.length - 1]); if (Math.hypot(x - lastScreen.x, y - lastScreen.y) > 5 || lastScreen.x === OFF_SCREEN) { points.push(p); interactionState.current.creatingPoints = points; requestAnimationFrame(renderOverlay); } } else if (!SINGLE_POINT_TOOLS.includes(activeToolId)) { const points = [...interactionState.current.creatingPoints]; points[interactionState.current.creationStep] = p; interactionState.current.creatingPoints = points; redraw = true; } } } else if (interactionState.current.isDragging && interactionState.current.dragDrawingId) { const d = drawings.find(d => d.id === interactionState.current.dragDrawingId); if (d && !d.properties.locked) { const p = screenToPoint(x, y, interactionState.current.dragHandleIndex !== -1); if (p) { if (interactionState.current.dragHandleIndex !== -1) { const newPoints = [...d.points]; newPoints[interactionState.current.dragHandleIndex!] = p; onUpdateDrawings(drawings.map(dr => dr.id === d.id ? { ...dr, points: newPoints } : dr)); redraw = true; } else if (interactionState.current.startPoint && interactionState.current.initialDrawingPoints) { const startScreen = interactionState.current.startPoint; const dx = x - startScreen.x; const dy = y - startScreen.y; const newPoints = interactionState.current.initialDrawingPoints.map(pt => { const screenPt = pointToScreen(pt); if (screenPt.x === OFF_SCREEN) return pt; const newScreenX = screenPt.x + dx; const newScreenY = screenPt.y + dy; const newPt = screenToPoint(newScreenX, newScreenY); return newPt || pt; }); interactionState.current.draggedDrawingPoints = newPoints; redraw = true; } } } } if (redraw) requestDraw(); handleContainerMouseMove(e); };
  const handleCanvasMouseUp = (e: React.MouseEvent) => { if (interactionState.current.isCreating) { if (activeToolId === 'brush') { const points = smoothPoints(interactionState.current.creatingPoints, 1); if (points.length > 2) { const newDrawing: Drawing = { id: crypto.randomUUID(), type: 'brush', points, properties: currentDefaultProperties, creationTimeframe: timeframe as Timeframe, folderId: null }; onUpdateDrawings([...drawings, newDrawing]); onToolComplete(); } interactionState.current.isCreating = false; interactionState.current.creatingPoints = []; } else if (SINGLE_POINT_TOOLS.includes(activeToolId)) { const p = interactionState.current.creatingPoints[0]; if (p) { const newDrawing: Drawing = { id: crypto.randomUUID(), type: activeToolId, points: [p], properties: currentDefaultProperties, creationTimeframe: timeframe as Timeframe, folderId: null }; onUpdateDrawings([...drawings, newDrawing]); onToolComplete(); if (activeToolId === 'text') { setTextInputState({ visible: true, x: e.clientX, y: e.clientY, text: currentDefaultProperties.text || 'Text', point: p }); onSelectDrawing(newDrawing.id); } } interactionState.current.isCreating = false; interactionState.current.creatingPoints = []; } else { interactionState.current.creationStep++; const requiredSteps = (activeToolId === 'triangle' || activeToolId === 'rotated_rectangle') ? 3 : 2; if (interactionState.current.creationStep >= requiredSteps) { const points = interactionState.current.creatingPoints; const newDrawing: Drawing = { id: crypto.randomUUID(), type: activeToolId, points, properties: currentDefaultProperties, creationTimeframe: timeframe as Timeframe, folderId: null }; onUpdateDrawings([...drawings, newDrawing]); onToolComplete(); interactionState.current.isCreating = false; interactionState.current.creatingPoints = []; } else { interactionState.current.creatingPoints.push(interactionState.current.creatingPoints[interactionState.current.creatingPoints.length-1]); } } onActionStart?.(); } else if (interactionState.current.isDragging) { if (interactionState.current.draggedDrawingPoints && interactionState.current.dragDrawingId) { const d = drawings.find(dr => dr.id === interactionState.current.dragDrawingId); if (d) { const updatedDrawing = { ...d, points: interactionState.current.draggedDrawingPoints }; onUpdateDrawings(drawings.map(dr => dr.id === d.id ? updatedDrawing : dr)); } } interactionState.current.isDragging = false; interactionState.current.dragDrawingId = null; interactionState.current.dragHandleIndex = null; interactionState.current.draggedDrawingPoints = null; interactionState.current.initialDrawingPoints = null; onActionStart?.(); } requestDraw(); };
  const handleTextSubmit = async (e?: React.FormEvent) => { e?.preventDefault(); const stateSnapshot = { ...textInputState }; setTextInputState(null); if (stateSnapshot && stateSnapshot.point && selectedDrawingId) { const d = drawings.find(dr => dr.id === selectedDrawingId); if (d) { const newDrawings = drawings.map(dr => dr.id === selectedDrawingId ? { ...dr, properties: { ...dr.properties, text: stateSnapshot.text } } : dr); onUpdateDrawings(newDrawings); onActionStart?.(); } } };

  return (
    <div className="relative w-full h-full trading-chart-container" onContextMenu={(e) => e.preventDefault()}>
      <div 
        ref={chartContainerRef} 
        className="w-full h-full relative" 
        onMouseMove={handleContainerMouseMove}
      />
      <canvas 
        ref={canvasRef} 
        className="absolute top-0 left-0 w-full h-full z-10 outline-none"
        tabIndex={0}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
      />
      
      {/* --- Advanced Replay Overlay --- */}
      {isAdvancedReplay && displayState.visible && timerY !== null && (
          <div 
            style={{ 
              position: 'absolute', 
              top: timerY - 9, // Vertically centered (height is approx 18px with padding)
              right: '72px', // Adjusted to 72px to align flush with standard price scale
              marginRight: '0px', 
              zIndex: 20, 
              pointerEvents: 'none',
              borderRadius: '3px',
              fontWeight: 500,
              letterSpacing: '0.5px',
              padding: '2px 5px',
              backgroundColor: '#6b21a8',
              color: 'white',
              fontSize: '10px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              minWidth: '40px',
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.5)'
            }}
            className="flex items-center justify-center select-none"
          >
            {displayState.label}
          </div>
      )}

      {showScrollButton && (
          <button
            onClick={() => {
                requestAnimationFrame(() => {
                    handleSnapToRecent(true);
                });
            }}
            className="absolute bottom-12 right-16 z-20 p-2 bg-[#1e293b]/80 text-blue-400 hover:text-white rounded-full shadow-lg border border-blue-500/30 hover:bg-blue-600 transition-all animate-in fade-in zoom-in duration-200"
            title="Scroll to Real-time"
          >
              <ChevronsRight size={20} />
          </button>
      )}

      {textInputState && textInputState.visible && (
          <div 
            className="absolute z-50 bg-[#1e293b] p-2 rounded shadow-xl border border-[#334155] flex flex-col gap-2 min-w-[200px]"
            style={{ left: Math.min(textInputState.x, window.innerWidth - 220), top: Math.min(textInputState.y, window.innerHeight - 150) }}
          >
              <div className="flex justify-between items-center text-xs text-slate-400 font-bold uppercase mb-1">
                  <span>Edit Text</span>
                  <button onClick={() => setTextInputState(null)}><XIcon size={14}/></button>
              </div>
              <textarea 
                  autoFocus
                  value={textInputState.text}
                  onChange={(e) => setTextInputState({ ...textInputState, text: e.target.value })}
                  className="w-full bg-[#0f172a] border border-[#334155] rounded p-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-y"
                  rows={3}
                  onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSubmit(); } }}
              />
              <button 
                  onClick={() => handleTextSubmit()}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white py-1 rounded text-xs font-bold flex items-center justify-center gap-1"
              >
                  <Check size={12} /> Apply
              </button>
          </div>
      )}

      {/* Branding Watermark */}
      <div style={{
          position: 'absolute',
          bottom: '40px',
          left: '20px',
          zIndex: 1,
          pointerEvents: 'none',
          opacity: 0.8,
          userSelect: 'none'
      }}>
          <img 
              src="https://i.postimg.cc/h492Kyd4/Red-pill-Branding.png" 
              alt="Branding" 
              style={{ width: '225px', height: 'auto' }} 
          />
      </div>
    </div>
  );
};
