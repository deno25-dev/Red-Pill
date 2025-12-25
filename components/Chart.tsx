import React, { useEffect, useRef, useState, useMemo } from 'react';
import { 
  createChart, 
  ColorType, 
  CrosshairMode, 
  IChartApi, 
  ISeriesApi, 
  PriceScaleMode,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitiveAxisView,
  PrimitivePaneViewZOrder,
  LineSeries,
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
  Logical,
  MouseEventParams,
  LogicalRange,
  Time
} from 'lightweight-charts';
import { OHLCV, ChartConfig, Drawing, DrawingPoint, DrawingProperties } from '../types';
import { COLORS } from '../constants';
import { smoothPoints, formatDuration, getTimeframeDuration } from '../utils/dataUtils';
import { ChevronsRight, Check, X as XIcon } from 'lucide-react';

interface ChartProps {
  id?: string;
  data: OHLCV[];
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
  onSelectDrawing: (id: string | null) => void;
  onActionStart?: () => void;
  isReplaySelecting?: boolean;
  onReplayPointSelect?: (time: number) => void;
  onRequestMoreData?: () => void;
  areDrawingsLocked?: boolean;
  isMagnetMode?: boolean;
  isSyncing?: boolean;
}

const OFF_SCREEN = -10000;

function pDistance(x: number, y: number, x1: number, y1: number, x2: number, y2: number) {
  var A = x - x1; var B = y - y1; var C = x2 - x1; var D = y2 - y1;
  var dot = A * C + B * D;
  var len_sq = C * C + D * D;
  var param = -1;
  if (len_sq != 0) param = dot / len_sq;
  var xx, yy;
  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x1 + param * C; yy = y1 + param * D; }
  else { xx = x1 + param * C; yy = y1 + param * D; }
  var dx = x - xx; var dy = y - yy;
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
    const rectY = y - rectH / 2;
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
        const { _drawings, _series, _chart, _timeToIndex, _interactionStateRef, _currentDefaultProperties, _timeframe } = this._source;
        if (!_series || !_chart) return;
        const { isDragging, dragDrawingId, isCreating, creatingPoints, activeToolId, draggedDrawingPoints } = _interactionStateRef.current;
        let drawingsToRender = [..._drawings];
        if (isCreating && creatingPoints.length > 0) {
             drawingsToRender.push({ id: 'temp-creation', type: activeToolId || 'line', points: creatingPoints, properties: _currentDefaultProperties });
        }
        const timeScale = _chart.timeScale();
        const pointToScreen = (p: DrawingPoint) => {
            try {
                const price = _series.priceToCoordinate(p.price);
                if (price === null) return { x: OFF_SCREEN, y: OFF_SCREEN };
                let x = timeScale.timeToCoordinate(p.time / 1000 as Time);
                if (x === null) {
                    const idx = _timeToIndex?.get(p.time);
                    if (idx !== undefined) x = timeScale.logicalToCoordinate(idx as Logical);
                    else if (this._source._lastTime !== null) {
                         const tfMs = getTimeframeDuration(this._source._timeframe as any);
                         const diff = p.time - this._source._lastTime;
                         const bars = diff / tfMs;
                         const targetLogical = this._source._lastIndex + bars;
                         x = timeScale.logicalToCoordinate(targetLogical as Logical);
                    }
                }
                return { x: (x !== null) ? x : OFF_SCREEN, y: price };
            } catch { return { x: OFF_SCREEN, y: OFF_SCREEN }; }
        };
        target.save();
        drawingsToRender.forEach(d => {
            if (d.properties.visible === false) return;
            
            // OPTIMIZATION: If this drawing is being dragged, render the temporary points from ref instead of props
            // This allows for 60fps dragging without react re-renders
            let pointsToRender = d.points;
            if (isDragging && dragDrawingId === d.id && draggedDrawingPoints) {
                pointsToRender = draggedDrawingPoints;
            }

            const screenPoints = pointsToRender.map(pointToScreen);
            
            if (screenPoints.every(p => p.x === OFF_SCREEN && p.y === OFF_SCREEN)) return;
            const isSelected = d.id === this._source._selectedDrawingId;
            const isBeingDragged = d.id === dragDrawingId;
            target.beginPath(); target.strokeStyle = d.properties.color; target.lineCap = 'round'; target.lineJoin = 'round';
            if (isSelected || isBeingDragged) { target.lineWidth = d.properties.lineWidth + 1; target.shadowColor = d.properties.color; target.shadowBlur = 10; }
            else { target.lineWidth = d.properties.lineWidth; target.shadowColor = 'transparent'; target.shadowBlur = 0; }
            if (d.properties.lineStyle === 'dashed') target.setLineDash([10, 10]);
            else if (d.properties.lineStyle === 'dotted') target.setLineDash([3, 6]);
            else target.setLineDash([]);
            const isFilled = d.properties.filled;
            target.fillStyle = isFilled ? d.properties.backgroundColor || 'rgba(59, 130, 246, 0.1)' : 'transparent';
            if (d.type === 'trend_line' || d.type === 'ray' || d.type === 'arrow_line') {
                if (screenPoints.length < 2) return;
                const p1 = screenPoints[0]; const p2 = screenPoints[1];
                if (p1.x === OFF_SCREEN || p2.x === OFF_SCREEN) return;
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
                 if (screenPoints.length < 2) return;
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
                if (screenPoints.length < 2) return;
                const p1 = screenPoints[0]; const p2 = screenPoints[1];
                if (p1.x === OFF_SCREEN || p2.x === OFF_SCREEN) return;
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
        });
        target.restore();
    }
}

class DrawingsPriceAxisPaneRenderer {
    constructor(private _source: DrawingsPrimitive) {}
    draw(target: any) { target.useMediaCoordinateSpace((scope: any) => { this._drawImpl(scope.context, scope.mediaSize.width, scope.mediaSize.height); }); }
    _drawImpl(ctx: CanvasRenderingContext2D, width: number, height: number) {
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

// Removing strict implements check to avoid interface property mismatch errors in build
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
    _timeframe: string = '1h'; 
    _lastTime: number | null = null;
    _lastIndex: number = 0;
    _paneViews: DrawingsPaneView[]; _priceAxisViews: DrawingsPriceAxisPaneView[];
    constructor(chart: IChartApi, series: ISeriesApi<any>, interactionStateRef: React.MutableRefObject<any>, defaults: DrawingProperties, timeframe: string) {
        this._chart = chart; this._series = series; this._interactionStateRef = interactionStateRef; this._currentDefaultProperties = defaults;
        this._timeframe = timeframe; this._paneViews = [new DrawingsPaneView(this)]; this._priceAxisViews = [new DrawingsPriceAxisPaneView(this)];
    }
    update(drawings: Drawing[], timeToIndex: Map<number, number>, defaults: DrawingProperties, selectedId: string | null, timeframe: string, lastTime: number | null, lastIndex: number) {
        this._drawings = drawings; this._timeToIndex = timeToIndex; this._currentDefaultProperties = defaults; this._selectedDrawingId = selectedId; this._timeframe = timeframe;
        this._lastTime = lastTime; this._lastIndex = lastIndex;
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

export const FinancialChart: React.FC<ChartProps> = (props) => {
  const { data, smaData, config, timeframe, onConfigChange, drawings, onUpdateDrawings, activeToolId, onToolComplete, currentDefaultProperties, selectedDrawingId, onSelectDrawing, onActionStart, isReplaySelecting, onReplayPointSelect, onRequestMoreData, areDrawingsLocked = false, isMagnetMode = false, isSyncing = false } = props;
  const propsRef = useRef(props); useEffect(() => { propsRef.current = props; });
  const chartContainerRef = useRef<HTMLDivElement>(null); const canvasRef = useRef<HTMLCanvasElement>(null); 
  const chartRef = useRef<IChartApi | null>(null); const seriesRef = useRef<ISeriesApi<"Candlestick" | "Line" | "Area"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null); const smaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const drawingsPrimitiveRef = useRef<DrawingsPrimitive | null>(null); const rangeChangeTimeout = useRef<any>(null);
  const rafId = useRef<number | null>(null); const toolTipRef = useRef<HTMLDivElement>(null);
  const isResizingVolume = useRef(false); const [localVolumeTopMargin, setLocalVolumeTopMargin] = useState(config.volumeTopMargin || 0.8);
  const replayMouseX = useRef<number | null>(null); const ignoreRangeChange = useRef(false);

  // New State for "Scroll to Recent" button
  const [showScrollButton, setShowScrollButton] = useState(false);
  
  // State for Text Input Overlay
  const [textInputState, setTextInputState] = useState<TextInputState | null>(null);

  const interactionState = useRef<{ 
      isDragging: boolean; 
      isCreating: boolean; 
      isErasing: boolean; 
      dragDrawingId: string | null; 
      dragHandleIndex: number | null; 
      startPoint: { x: number; y: number } | null; 
      creatingPoints: DrawingPoint[]; 
      creationStep: number; 
      activeToolId: string;
      initialDrawingPoints: DrawingPoint[] | null; // For smooth dragging delta calc
      draggedDrawingPoints: DrawingPoint[] | null; // Temporary points during drag
  }>({ 
      isDragging: false, 
      isCreating: false, 
      isErasing: false, 
      dragDrawingId: null, 
      dragHandleIndex: null, 
      startPoint: null, 
      creatingPoints: [], 
      creationStep: 0, 
      activeToolId: activeToolId,
      initialDrawingPoints: null,
      draggedDrawingPoints: null
  });

  useEffect(() => { interactionState.current.activeToolId = activeToolId; }, [activeToolId]);

  const processedData = useMemo(() => {
    return data.map(d => ({ time: (d.time / 1000) as Time, open: d.open, high: d.high, low: d.low, close: d.close, value: d.close }));
  }, [data]);

  const timeToIndex = useMemo(() => {
      const map = new Map<number, number>();
      for(let i=0; i<data.length; i++) map.set(data[i].time, i);
      return map;
  }, [data]);
  
  const timeToIndexRef = useRef(timeToIndex); useEffect(() => { timeToIndexRef.current = timeToIndex; }, [timeToIndex]);

  useEffect(() => { 
      if (drawingsPrimitiveRef.current) {
          const lastCandle = data.length > 0 ? data[data.length - 1] : null;
          drawingsPrimitiveRef.current.update(drawings, timeToIndex, currentDefaultProperties, selectedDrawingId, timeframe, lastCandle ? lastCandle.time : null, data.length - 1);
          requestDraw(); 
      }
  }, [drawings, timeToIndex, currentDefaultProperties, selectedDrawingId, timeframe, data]);

  const requestDraw = () => { if (rafId.current) cancelAnimationFrame(rafId.current); rafId.current = requestAnimationFrame(renderOverlayAndSync); };
  const renderOverlayAndSync = () => { renderOverlay(); if (chartRef.current) { if ((chartRef.current as any)._renderer) (chartRef.current as any)._renderer._redrawVisible(); else chartRef.current.timeScale().applyOptions({}); } };

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#0f172a' }, textColor: COLORS.text },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight,
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { borderColor: '#334155', timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: '#334155' },
    });
    chartRef.current = chart;

    const handleResize = () => {
        if (chartContainerRef.current && chartRef.current && canvasRef.current) {
            const w = chartContainerRef.current.clientWidth, h = chartContainerRef.current.clientHeight, dpr = window.devicePixelRatio || 1;
            chartRef.current.applyOptions({ width: w, height: h });
            canvasRef.current.width = w * dpr; canvasRef.current.height = h * dpr;
            canvasRef.current.style.width = `${w}px`; canvasRef.current.style.height = `${h}px`;
            const ctx = canvasRef.current.getContext('2d'); if (ctx) ctx.scale(dpr, dpr);
            requestDraw();
        }
    };
    window.addEventListener('resize', handleResize); handleResize();

    const handleChartClick = (param: MouseEventParams) => {
        if (param.point) {
             const { activeToolId, isReplaySelecting, onSelectDrawing } = propsRef.current;
             if (activeToolId === 'cross' || activeToolId === 'cursor' || activeToolId === 'eraser') if (!isReplaySelecting) onSelectDrawing(null);
        }
    };
    chart.subscribeClick(handleChartClick);

    // SYNC EVENT HANDLERS
    const onSyncRange = (e: any) => {
        if (ignoreRangeChange.current || !propsRef.current.isSyncing) return;
        const { range, sourceId } = e.detail;
        if (sourceId !== propsRef.current.id) {
            ignoreRangeChange.current = true;
            chart.timeScale().setVisibleLogicalRange(range);
            setTimeout(() => { ignoreRangeChange.current = false; }, 50);
        }
    };

    const onSyncCrosshair = (e: any) => {
        if (!propsRef.current.isSyncing) return;
        const { point, sourceId } = e.detail;
        if (sourceId !== propsRef.current.id) {
            chart.setCrosshairPosition(point.price, (point.time / 1000) as Time, seriesRef.current!);
        }
    };

    window.addEventListener('chart-sync-range', onSyncRange);
    window.addEventListener('chart-sync-crosshair', onSyncCrosshair);

    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        requestDraw(); 
        if (range && !ignoreRangeChange.current && propsRef.current.isSyncing) {
            window.dispatchEvent(new CustomEvent('chart-sync-range', { detail: { range, sourceId: propsRef.current.id } }));
        }
        if (range && propsRef.current.onRequestMoreData) {
            if (rangeChangeTimeout.current) clearTimeout(rangeChangeTimeout.current);
            rangeChangeTimeout.current = setTimeout(() => { if (range.from < 50) propsRef.current.onRequestMoreData?.(); }, 100);
        }

        // Logic for "Scroll to Real-time" Button
        if (range) {
             const currentData = propsRef.current.data;
             const lastIndex = currentData.length - 1;
             // Check distance from the rightmost visible bar to the last actual data point
             // Using logical indices, the last bar corresponds to `currentData.length - 1` roughly
             const dist = lastIndex - range.to;
             
             // If we are more than 10 bars away from the latest data, show the button
             setShowScrollButton(dist > 10);
        }
    });

    chart.subscribeCrosshairMove((param) => {
        if (param.point && !ignoreRangeChange.current && propsRef.current.isSyncing) {
             window.dispatchEvent(new CustomEvent('chart-sync-crosshair', { detail: { point: { time: (param.time as number) * 1000, price: 0 }, sourceId: propsRef.current.id } }));
        }
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('chart-sync-range', onSyncRange);
      window.removeEventListener('chart-sync-crosshair', onSyncCrosshair);
      if (rangeChangeTimeout.current) clearTimeout(rangeChangeTimeout.current);
      if (rafId.current) cancelAnimationFrame(rafId.current);
      try { chart.unsubscribeClick(handleChartClick); } catch(e) {}
      chart.remove(); chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    
    // Determine background config
    let background: any;
    
    if (config.backgroundType === 'gradient') {
        background = {
            type: ColorType.VerticalGradient,
            topColor: config.backgroundTopColor || '#0f172a',
            bottomColor: config.backgroundBottomColor || '#0f172a',
        };
    } else if (config.backgroundColor) {
         background = {
            type: ColorType.Solid,
            color: config.backgroundColor,
        };
    } else {
        // Fallback to theme defaults
        background = {
            type: ColorType.Solid,
            color: config.theme === 'light' ? '#ffffff' : '#0f172a'
        };
    }

    const textColor = config.theme === 'light' ? '#333' : COLORS.text;

    chartRef.current.applyOptions({ 
        layout: { 
            background, 
            textColor 
        } 
    });

    const mode = config.priceScaleMode === 'logarithmic' ? PriceScaleMode.Logarithmic : config.priceScaleMode === 'percentage' ? PriceScaleMode.Percentage : PriceScaleMode.Normal;
    chartRef.current.priceScale('right').applyOptions({ mode, autoScale: config.autoScale !== false });
  }, [config.theme, config.priceScaleMode, config.autoScale, config.backgroundColor, config.backgroundType, config.backgroundTopColor, config.backgroundBottomColor]);

  useEffect(() => {
    if (!chartRef.current) return;
    if (seriesRef.current) { chartRef.current.removeSeries(seriesRef.current); seriesRef.current = null; }
    let newSeries;
    if (config.chartType === 'line') newSeries = chartRef.current.addSeries(LineSeries, { color: COLORS.line, lineWidth: 2 });
    else if (config.chartType === 'area') newSeries = chartRef.current.addSeries(AreaSeries, { lineColor: COLORS.line, topColor: COLORS.areaTop, bottomColor: COLORS.areaBottom, lineWidth: 2 });
    else {
        // Apply custom colors from config or fallback to constants
        const upColor = config.upColor || COLORS.bullish;
        const downColor = config.downColor || COLORS.bearish;
        const wickUpColor = config.wickUpColor || COLORS.bullish;
        const wickDownColor = config.wickDownColor || COLORS.bearish;
        const borderUpColor = config.borderUpColor || upColor;
        const borderDownColor = config.borderDownColor || downColor;

        newSeries = chartRef.current.addSeries(CandlestickSeries, { 
            upColor, 
            downColor, 
            borderVisible: true,
            // borderColor: borderUpColor, // REMOVED: Caused generic override preventing borderDownColor from applying
            borderUpColor,
            borderDownColor,
            wickUpColor, 
            wickDownColor 
        });
    }
    seriesRef.current = newSeries; newSeries.setData(processedData);
    const primitive = new DrawingsPrimitive(chartRef.current, newSeries, interactionState, currentDefaultProperties, timeframe);
    const lastCandle = data.length > 0 ? data[data.length - 1] : null;
    primitive.update(drawings, timeToIndex, currentDefaultProperties, selectedDrawingId, timeframe, lastCandle ? lastCandle.time : null, data.length - 1);
    newSeries.attachPrimitive(primitive); drawingsPrimitiveRef.current = primitive; requestDraw();
  }, [config.chartType, config.upColor, config.downColor, config.wickUpColor, config.wickDownColor, config.borderUpColor, config.borderDownColor]); 

  useEffect(() => {
    if (!seriesRef.current) return;
    try { seriesRef.current.setData(processedData); } catch(e) {}
    if (volumeSeriesRef.current && config.showVolume) {
        const upColor = config.upColor || COLORS.volumeBullish;
        const downColor = config.downColor || COLORS.volumeBearish;
        
        // Use simpler logic for volume colors, just bullish/bearish, maybe faded
        const volUp = config.upColor ? config.upColor + '80' : COLORS.volumeBullish;
        const volDown = config.downColor ? config.downColor + '80' : COLORS.volumeBearish;

        volumeSeriesRef.current.setData(data.map(d => ({ 
            time: (d.time / 1000) as Time, 
            value: d.volume, 
            color: d.close >= d.open ? volUp : volDown 
        })));
    }
    if (smaSeriesRef.current && config.showSMA) {
        const smaSeriesData = [];
        for(let i=0; i<data.length; i++) { if (smaData[i] !== null) smaSeriesData.push({ time: (data[i].time / 1000) as Time, value: smaData[i] as number }); }
        smaSeriesRef.current.setData(smaSeriesData);
    }
  }, [data, smaData, config.chartType, processedData, config.upColor, config.downColor]); 

  useEffect(() => {
    if (!chartRef.current) return;
    if (config.showVolume) {
        if (!volumeSeriesRef.current) {
            volumeSeriesRef.current = chartRef.current.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
            chartRef.current.priceScale('volume').applyOptions({ scaleMargins: { top: localVolumeTopMargin, bottom: 0 } });
        }
    } else if (volumeSeriesRef.current) { chartRef.current.removeSeries(volumeSeriesRef.current); volumeSeriesRef.current = null; }
    if (config.showSMA) {
        if (!smaSeriesRef.current) smaSeriesRef.current = chartRef.current.addSeries(LineSeries, { color: COLORS.sma, lineWidth: 2, crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false });
    } else if (smaSeriesRef.current) { chartRef.current.removeSeries(smaSeriesRef.current); smaSeriesRef.current = null; }
  }, [config.showVolume, config.showSMA]);

  useEffect(() => {
    if (canvasRef.current) {
        const isInteractive = activeToolId !== 'cross' && activeToolId !== 'cursor' && activeToolId !== 'eraser' || isReplaySelecting || activeToolId === 'eraser';
        if (isInteractive) { canvasRef.current.style.pointerEvents = 'auto'; document.body.style.cursor = activeToolId === 'eraser' ? 'cell' : 'crosshair'; }
        else { canvasRef.current.style.pointerEvents = 'none'; document.body.style.cursor = 'default'; }
    }
  }, [activeToolId, isReplaySelecting]);

  const pointToScreen = (p: DrawingPoint) => {
    if (!chartRef.current || !seriesRef.current) return { x: OFF_SCREEN, y: OFF_SCREEN };
    try {
        const timeScale = chartRef.current.timeScale(); const price = seriesRef.current.priceToCoordinate(p.price);
        let x = timeScale.timeToCoordinate(p.time / 1000 as Time);
        
        if (x === null) { 
            const idx = timeToIndexRef.current.get(p.time); 
            if (idx !== undefined) x = timeScale.logicalToCoordinate(idx as Logical);
            else if (propsRef.current.data.length > 0) {
                 const currentData = propsRef.current.data;
                 const lastCandle = currentData[currentData.length - 1];
                 const tfMs = getTimeframeDuration(propsRef.current.timeframe as any);
                 const diff = p.time - lastCandle.time;
                 const bars = diff / tfMs;
                 const targetLogical = (currentData.length - 1) + bars;
                 x = timeScale.logicalToCoordinate(targetLogical as Logical);
            }
        }
        return { x: (x !== null && Number.isFinite(x)) ? x : OFF_SCREEN, y: (price !== null && Number.isFinite(price)) ? price : OFF_SCREEN };
    } catch (e) { return { x: OFF_SCREEN, y: OFF_SCREEN }; }
  };

  const snapToCandle = (x: number, y: number) => {
      const currentData = propsRef.current.data;
      if (!chartRef.current || !seriesRef.current || currentData.length === 0) return null;
      const logical = chartRef.current.timeScale().coordinateToLogical(x);
      if (logical === null || isNaN(logical)) return null;
      const idx = Math.round(logical); const candle = currentData[idx]; if (!candle) return null; 
      const prices = [{ val: candle.open, y: seriesRef.current.priceToCoordinate(candle.open) }, { val: candle.high, y: seriesRef.current.priceToCoordinate(candle.high) }, { val: candle.low, y: seriesRef.current.priceToCoordinate(candle.low) }, { val: candle.close, y: seriesRef.current.priceToCoordinate(candle.close) }];
      let nearest = prices[0]; let minDist = 99999;
      prices.forEach(p => { if (p.y !== null) { const d = Math.abs(y - p.y); if (d < minDist) { minDist = d; nearest = p; } } });
      if (minDist < 30) return { time: candle.time, price: nearest.val };
      return null;
  };

  const screenToPoint = (x: number, y: number, applyMagnet = false) => {
    if (!chartRef.current || !seriesRef.current) return null;
    if (applyMagnet && propsRef.current.isMagnetMode) { const snapped = snapToCandle(x, y); if (snapped) return snapped; }
    try {
        const timeScale = chartRef.current.timeScale(); const timeSeconds = timeScale.coordinateToTime(x) as number; const price = seriesRef.current.coordinateToPrice(y);
        if (timeSeconds === null || price === null || !Number.isFinite(timeSeconds) || !Number.isFinite(price)) {
            const logical = timeScale.coordinateToLogical(x);
            if (logical !== null) {
                 const lastIdx = data.length - 1; 
                 const diff = logical - lastIdx; 
                 const tfMs = getTimeframeDuration(propsRef.current.timeframe as any);
                 return { time: data[lastIdx].time + (diff * tfMs), price: price || 0 };
            }
            return null;
        }
        return { time: timeSeconds * 1000, price };
    } catch (e) { return null; }
  };

  const renderOverlay = () => {
    const canvas = canvasRef.current; if (!canvas || !chartRef.current) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const width = chartContainerRef.current?.clientWidth || 0, height = chartContainerRef.current?.clientHeight || 0;
    ctx.clearRect(0, 0, width, height);
    if (propsRef.current.isReplaySelecting && replayMouseX.current !== null) {
        ctx.beginPath(); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1; ctx.setLineDash([6, 4]); ctx.moveTo(replayMouseX.current, 0); ctx.lineTo(replayMouseX.current, height); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#ef4444'; ctx.fillText('Start Replay', replayMouseX.current + 5, 20);
    }
  };

  const getHitObject = (x: number, y: number) => {
    let hitHandle: { id: string; index: number } | null = null; let hitDrawing: Drawing | null = null;
    const { drawings, selectedDrawingId } = propsRef.current;
    if (selectedDrawingId) {
        const d = drawings.find(dr => dr.id === selectedDrawingId);
        if (d && !d.properties.locked && d.properties.visible !== false) {
             const screenPoints = d.points.map(pointToScreen);
             for(let i=0; i<screenPoints.length; i++) { const p = screenPoints[i]; if (p.x !== OFF_SCREEN && Math.hypot(p.x - x, p.y - y) < 8) { return { hitHandle: { id: d.id, index: i }, hitDrawing: d }; } }
        }
    }
    for (let i = drawings.length - 1; i >= 0; i--) {
        const d = drawings[i]; if (d.properties.visible === false) continue;
        const screenPoints = d.points.map(pointToScreen); if (screenPoints.every(p => p.x === OFF_SCREEN)) continue;
        let hit = false;
        if (d.type === 'trend_line' || d.type === 'ray' || d.type === 'arrow_line') { const p1 = screenPoints[0], p2 = screenPoints[1]; if (p1.x !== OFF_SCREEN && p2.x !== OFF_SCREEN && pDistance(x, y, p1.x, p1.y, p2.x, p2.y) < 6) hit = true; }
        else if (d.type === 'brush') { for (let j = 0; j < screenPoints.length - 1; j++) { const p1 = screenPoints[j], p2 = screenPoints[j+1]; if (p1.x !== OFF_SCREEN && p2.x !== OFF_SCREEN && pDistance(x, y, p1.x, p1.y, p2.x, p2.y) < 6) { hit = true; break; } } }
        else if (d.type === 'horizontal_line') { if (screenPoints[0]?.y !== OFF_SCREEN && Math.abs(y - screenPoints[0].y) < 6) hit = true; }
        else if (d.type === 'horizontal_ray') { if (screenPoints[0]?.y !== OFF_SCREEN && screenPoints[0]?.x !== OFF_SCREEN && Math.abs(y - screenPoints[0].y) < 6 && x >= screenPoints[0].x - 10) hit = true; }
        else if (d.type === 'vertical_line') { if (screenPoints[0]?.x !== OFF_SCREEN && Math.abs(x - screenPoints[0].x) < 6) hit = true; }
        else if (d.type === 'rectangle' || d.type === 'date_range' || d.type === 'measure') {
             const minX = Math.min(screenPoints[0].x, screenPoints[1].x), maxX = Math.max(screenPoints[0].x, screenPoints[1].x);
             const minY = d.type === 'date_range' ? 0 : Math.min(screenPoints[0].y, screenPoints[1].y);
             const maxY = d.type === 'date_range' ? 10000 : Math.max(screenPoints[0].y, screenPoints[1].y);
             if (x >= minX && x <= maxX && y >= minY && y <= maxY) { if (d.properties.filled || d.type === 'date_range' || d.type === 'measure') hit = true; else { const tol = 6; if (Math.abs(x - minX) < tol || Math.abs(x - maxX) < tol || Math.abs(y - minY) < tol || Math.abs(y - maxY) < tol) hit = true; } }
        }
        else if (d.type === 'triangle' || d.type === 'rotated_rectangle') { if (isPointInPoly(x, y, screenPoints as any)) hit = true; }
        else if (d.type === 'circle') { if (screenPoints.length >= 2) { const r = Math.hypot(screenPoints[1].x - screenPoints[0].x, screenPoints[1].y - screenPoints[0].y), dist = Math.hypot(x - screenPoints[0].x, y - screenPoints[0].y); if (d.properties.filled ? dist <= r : Math.abs(dist - r) < 6) hit = true; } }
        else if (d.type === 'text') { const p = screenPoints[0]; if (p?.x !== OFF_SCREEN) { const h = d.properties.fontSize || 14, w = (d.properties.text?.length || 4) * (h * 0.6); if (x >= p.x - 5 && x <= p.x + w && y >= p.y - 5 && y <= p.y + h + 5) hit = true; } }
        if (hit) { hitDrawing = d; break; }
    }
    return { hitHandle, hitDrawing };
  };

  const handleVolumeResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation(); isResizingVolume.current = true;
    const handleMouseMove = (ev: MouseEvent) => { if (isResizingVolume.current && chartContainerRef.current) { const rect = chartContainerRef.current.getBoundingClientRect(); setLocalVolumeTopMargin(Math.max(0.5, Math.min((ev.clientY - rect.top) / rect.height, 0.95))); } };
    const handleMouseUp = () => { isResizingVolume.current = false; window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); if (onConfigChange) onConfigChange({ ...config, volumeTopMargin: localVolumeTopMargin }); };
    window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp);
  };
  
  const handleContainerMouseMove = (e: React.MouseEvent) => {
      if (isReplaySelecting && canvasRef.current) { const rect = canvasRef.current.getBoundingClientRect(); replayMouseX.current = e.clientX - rect.left; requestDraw(); return; }
      if (interactionState.current.isCreating || interactionState.current.isDragging) return;
      if (activeToolId !== 'cross' && activeToolId !== 'cursor' && activeToolId !== 'eraser') return;
      if (chartContainerRef.current && canvasRef.current) {
          const rect = chartContainerRef.current.getBoundingClientRect();
          const { hitHandle, hitDrawing } = getHitObject(e.clientX - rect.left, e.clientY - rect.top);
          if (activeToolId === 'eraser') {
              if (hitDrawing && !areDrawingsLocked) { document.body.style.cursor = 'no-drop'; canvasRef.current.style.pointerEvents = 'auto'; }
              else { document.body.style.cursor = 'cell'; canvasRef.current.style.pointerEvents = 'auto'; }
          } else if ((hitHandle || hitDrawing) && !areDrawingsLocked) { 
              document.body.style.cursor = hitDrawing?.properties.locked ? 'not-allowed' : hitHandle ? 'grab' : 'move'; 
              canvasRef.current.style.pointerEvents = 'auto'; 
          }
          else { document.body.style.cursor = 'default'; canvasRef.current.style.pointerEvents = 'none'; }
      }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect(); const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (isReplaySelecting) { const p = screenToPoint(x, y, true); if (p && onReplayPointSelect) onReplayPointSelect(p.time); return; }
    const { hitHandle, hitDrawing } = getHitObject(x, y);
    const isDrawingTool = activeToolId !== 'cross' && activeToolId !== 'cursor' && activeToolId !== 'eraser';
    if (isDrawingTool) {
        onActionStart?.(); const p = screenToPoint(x, y, activeToolId !== 'brush' && activeToolId !== 'text');
        if (p) {
            interactionState.current.isCreating = true;
            if (activeToolId === 'brush' || SINGLE_POINT_TOOLS.includes(activeToolId)) { interactionState.current.creatingPoints = [p]; interactionState.current.creationStep = 0; }
            else { interactionState.current.creationStep = 1; const points = [p, p]; if (activeToolId === 'triangle' || activeToolId === 'rotated_rectangle') points.push(p); interactionState.current.creatingPoints = points; }
        }
    } else if (!areDrawingsLocked) {
        if (activeToolId === 'eraser') {
            interactionState.current.isErasing = true;
            if (hitDrawing && !hitDrawing.properties.locked) {
                onActionStart?.();
                onUpdateDrawings(drawings.filter(d => d.id !== hitDrawing!.id));
            }
        } else if (hitHandle) { 
            onActionStart?.(); 
            onSelectDrawing(hitHandle.id); 
            interactionState.current.isDragging = true; 
            interactionState.current.dragDrawingId = hitHandle.id; 
            interactionState.current.dragHandleIndex = hitHandle.index; 
        }
        else if (hitDrawing) {
            onSelectDrawing(hitDrawing.id); 
            if (hitDrawing.properties.locked) return; 
            onActionStart?.(); 
            interactionState.current.isDragging = true; 
            interactionState.current.dragDrawingId = hitDrawing.id; 
            interactionState.current.dragHandleIndex = -1; 
            interactionState.current.startPoint = { x, y };
            interactionState.current.initialDrawingPoints = [...hitDrawing.points];
        } else onSelectDrawing(null);
    }
    requestDraw();
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect(); const x = e.clientX - rect.left, y = e.clientY - rect.top;
    let redraw = false;
    if (interactionState.current.isCreating) {
        const p = screenToPoint(x, y, activeToolId !== 'brush' && activeToolId !== 'text');
        if (p) {
             if (activeToolId === 'brush') {
                 const points = [...interactionState.current.creatingPoints]; const lastScreen = pointToScreen(points[points.length - 1]);
                 if (Math.hypot(x - lastScreen.x, y - lastScreen.y) > 5 || lastScreen.x === OFF_SCREEN) { points.push(p); interactionState.current.creatingPoints = points; redraw = true; }
             } else if (!SINGLE_POINT_TOOLS.includes(activeToolId)) { const points = [...interactionState.current.creatingPoints]; points[interactionState.current.creationStep] = p; interactionState.current.creatingPoints = points; redraw = true; }
        }
    } else if (interactionState.current.isErasing) {
        const { hitDrawing } = getHitObject(x, y);
        if (hitDrawing && !hitDrawing.properties.locked) {
            onUpdateDrawings(drawings.filter(d => d.id !== hitDrawing!.id));
            redraw = true;
        }
    } else if (interactionState.current.isDragging && interactionState.current.dragDrawingId) {
        const d = drawings.find(d => d.id === interactionState.current.dragDrawingId);
        if (d && !d.properties.locked) {
            const p = screenToPoint(x, y, interactionState.current.dragHandleIndex !== -1);
            if (p) {
                // Handle Dragging via Handle (Still updates React state for immediate feedback on reshape)
                if (interactionState.current.dragHandleIndex !== -1) {
                    const newPoints = [...d.points];
                    newPoints[interactionState.current.dragHandleIndex!] = p;
                    onUpdateDrawings(drawings.map(dr => dr.id === d.id ? { ...dr, points: newPoints } : dr)); 
                    redraw = true;
                }
                // Handle Moving Whole Object (Optimized via ref)
                else if (interactionState.current.startPoint && interactionState.current.initialDrawingPoints) {
                     const dx = x - interactionState.current.startPoint.x;
                     const dy = y - interactionState.current.startPoint.y; 
                     
                     const newPoints: DrawingPoint[] = [];
                     const originalPoints = interactionState.current.initialDrawingPoints;

                     for(const op of originalPoints) {
                         const sp = pointToScreen(op);
                         if (sp.x !== OFF_SCREEN) {
                             const np = screenToPoint(sp.x + dx, sp.y + dy);
                             if (np) newPoints.push(np);
                         }
                     }

                     if (newPoints.length === originalPoints.length) {
                         interactionState.current.draggedDrawingPoints = newPoints;
                         redraw = true; // Just request draw, don't update React state
                     }
                }
            }
        }
    }
    if (redraw) requestDraw();
  };

  const handleCanvasMouseUp = () => {
    if (isReplaySelecting) return;
    if (interactionState.current.isCreating) {
        if (activeToolId === 'brush') { onUpdateDrawings([...drawings, { id: crypto.randomUUID(), type: activeToolId, points: smoothPoints(interactionState.current.creatingPoints, currentDefaultProperties.smoothing || 0), properties: currentDefaultProperties }]); interactionState.current.isCreating = false; onToolComplete(); }
        else if (activeToolId === 'text') {
             // Instead of prompt, open custom text input
             const point = interactionState.current.creatingPoints[0];
             const screenP = pointToScreen(point);
             if (screenP.x !== OFF_SCREEN && screenP.y !== OFF_SCREEN) {
                 setTextInputState({
                     visible: true,
                     x: screenP.x,
                     y: screenP.y,
                     text: "Text",
                     point: point
                 });
             }
             interactionState.current.isCreating = false;
             // Do not call onToolComplete yet, wait for text submission
        } else {
            const step = interactionState.current.creationStep;
            if (step < interactionState.current.creatingPoints.length - 1) { interactionState.current.creationStep = step + 1; interactionState.current.creatingPoints[step + 1] = interactionState.current.creatingPoints[step]; requestDraw(); return; }
            onUpdateDrawings([...drawings, { id: crypto.randomUUID(), type: activeToolId, points: interactionState.current.creatingPoints, properties: currentDefaultProperties }]); interactionState.current.isCreating = false; onToolComplete(); 
        }
    }
    
    // Commit the drag if we were moving an object via ref
    if (interactionState.current.isDragging && interactionState.current.dragHandleIndex === -1 && interactionState.current.draggedDrawingPoints && interactionState.current.dragDrawingId) {
         const newPoints = interactionState.current.draggedDrawingPoints;
         const id = interactionState.current.dragDrawingId;
         onUpdateDrawings(drawings.map(dr => dr.id === id ? { ...dr, points: newPoints } : dr));
         interactionState.current.draggedDrawingPoints = null;
         interactionState.current.initialDrawingPoints = null;
    }

    interactionState.current.isDragging = false; 
    interactionState.current.isErasing = false;
    interactionState.current.dragDrawingId = null; 
    document.body.style.cursor = activeToolId === 'eraser' ? 'cell' : 'default'; 
    requestDraw();
  };
  
  const handleScrollToRealTime = () => {
       chartRef.current?.timeScale().scrollToRealTime();
  };

  // Text Input Handlers
  const handleTextSubmit = () => {
      if (textInputState && textInputState.point) {
          propsRef.current.onUpdateDrawings([
            ...propsRef.current.drawings, 
            { 
                id: crypto.randomUUID(), 
                type: 'text', 
                points: [textInputState.point], 
                properties: { ...propsRef.current.currentDefaultProperties, text: textInputState.text || "Label" } 
            }
          ]);
          propsRef.current.onToolComplete();
          setTextInputState(null);
          requestDraw();
      }
  };

  const handleTextCancel = () => {
      setTextInputState(null);
      // Optional: reset tool if cancelled
      // propsRef.current.onToolComplete();
  };

  if (data.length === 0) return <div className="flex items-center justify-center h-full text-slate-500">No data loaded.</div>;

  return (
    <div className="w-full h-full relative group" onMouseMove={handleContainerMouseMove}>
       <div ref={chartContainerRef} className="w-full h-full" />
       <canvas ref={canvasRef} className="absolute inset-0 z-10" style={{ pointerEvents: 'none' }} onMouseDown={handleCanvasMouseDown} onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp} />
       {config.showVolume && <div className="absolute left-0 right-0 z-30 h-1 cursor-ns-resize group/resize" style={{ top: `${localVolumeTopMargin * 100}%` }} onMouseDown={handleVolumeResizeMouseDown}><div className="w-full h-px bg-slate-600 opacity-0 group-hover/resize:opacity-100 transition-opacity" /></div>}
       <div ref={toolTipRef} className="absolute hidden pointer-events-none bg-[#1e293b]/95 border border-[#475569] p-2.5 rounded shadow-xl backdrop-blur-sm z-50 transition-opacity duration-75" />
       
       {showScrollButton && (
           <button
             onClick={handleScrollToRealTime}
             className="absolute bottom-12 right-20 z-40 bg-[#1e293b]/80 hover:bg-blue-600 text-slate-300 hover:text-white p-2 rounded-full shadow-lg backdrop-blur-sm border border-[#334155] transition-all animate-in fade-in zoom-in duration-200"
             title="Scroll to most recent"
           >
             <ChevronsRight size={20} />
           </button>
       )}
       
       {/* Text Input Overlay */}
       {textInputState && textInputState.visible && (
           <div 
             className="absolute z-50 flex flex-col gap-2 p-2 bg-[#1e293b] border border-[#334155] rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-100"
             style={{ 
                 left: Math.min(textInputState.x, (chartContainerRef.current?.clientWidth || 0) - 220), 
                 top: Math.min(textInputState.y, (chartContainerRef.current?.clientHeight || 0) - 100)
             }}
             onMouseDown={(e) => e.stopPropagation()}
           >
              <textarea
                autoFocus
                className="w-56 h-20 bg-[#0f172a] border border-[#334155] rounded p-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none font-sans"
                value={textInputState.text}
                onChange={(e) => setTextInputState({ ...textInputState, text: e.target.value })}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleTextSubmit();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        handleTextCancel();
                    }
                }}
                onFocus={(e) => e.target.select()}
              />
              <div className="flex justify-end gap-2">
                  <button 
                    onClick={handleTextCancel}
                    className="p-1 text-slate-400 hover:text-white hover:bg-[#334155] rounded"
                    title="Cancel (Esc)"
                  >
                      <XIcon size={16} />
                  </button>
                  <button 
                    onClick={handleTextSubmit}
                    className="p-1 text-blue-400 hover:text-white hover:bg-blue-600 rounded"
                    title="Save (Enter)"
                  >
                      <Check size={16} />
                  </button>
              </div>
           </div>
       )}
    </div>
  );
};