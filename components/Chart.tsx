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
  MouseEventParams
} from 'lightweight-charts';
import { OHLCV, ChartConfig, Drawing, DrawingPoint, DrawingProperties } from '../types';
import { COLORS } from '../constants';
import { smoothPoints } from '../utils/dataUtils';

interface ChartProps {
  data: OHLCV[];
  smaData: (number | null)[];
  config: ChartConfig;
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
}

// Distance between point (x, y) and line segment (x1, y1) - (x2, y2)
function pDistance(x: number, y: number, x1: number, y1: number, x2: number, y2: number) {
  var A = x - x1;
  var B = y - y1;
  var C = x2 - x1;
  var D = y2 - y1;

  var dot = A * C + B * D;
  var len_sq = C * C + D * D;
  var param = -1;
  if (len_sq != 0) //in case of 0 length line
      param = dot / len_sq;

  var xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  }
  else if (param > 1) {
    xx = x2;
    yy = y2;
  }
  else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  var dx = x - xx;
  var dy = y - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

// Point in polygon test
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

// Helper to format duration
function formatDuration(ms: number) {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
    return parts.join(' ');
}

// --- PRIMITIVE IMPLEMENTATION ---

class DrawingsPaneRenderer implements IPrimitivePaneRenderer {
    constructor(private _source: DrawingsPrimitive) {}

    draw(target: any) {
        target.useMediaCoordinateSpace((scope: any) => {
            this._drawImpl(scope.context);
        });
    }

    _drawImpl(target: CanvasRenderingContext2D) {
        if (!target || typeof target.beginPath !== 'function') return;

        const { _drawings, _series, _chart, _timeToIndex, _interactionStateRef, _currentDefaultProperties } = this._source;
        if (!_series || !_chart) return;

        const { isDragging, dragDrawingId, isCreating, creatingPoints, activeToolId } = _interactionStateRef.current;
        
        let drawingsToRender = _drawings;
        
        if (isCreating && creatingPoints.length > 0) {
             const phantom: Drawing = {
                id: 'temp-creation',
                type: activeToolId || 'line',
                points: creatingPoints,
                properties: _currentDefaultProperties
            };
            drawingsToRender = [...drawingsToRender, phantom];
        }

        const timeScale = _chart.timeScale();
        const pointToScreen = (p: DrawingPoint) => {
            try {
                const price = _series.priceToCoordinate(p.price);
                if (price === null) return { x: -10000, y: -10000 };
                
                let x = timeScale.timeToCoordinate(p.time / 1000 as any);
                if (x === null && _timeToIndex) {
                    const idx = _timeToIndex.get(p.time);
                    if (idx !== undefined) x = timeScale.logicalToCoordinate(idx as Logical);
                }
                
                return { 
                    x: (x !== null) ? x : -10000, 
                    y: price
                };
            } catch { return { x: -10000, y: -10000 }; }
        };

        target.save();

        drawingsToRender.forEach(d => {
            if (d.properties.visible === false) return;

            const screenPoints = d.points.map(pointToScreen);
            if (screenPoints.every(p => p.x === -10000 && p.y === -10000)) return;

            const isSelected = d.id === this._source._selectedDrawingId;
            const isBeingDragged = d.id === dragDrawingId;

            target.beginPath();
            target.strokeStyle = d.properties.color;
            target.lineCap = 'round';
            target.lineJoin = 'round';

            if (isSelected || isBeingDragged) {
                target.lineWidth = d.properties.lineWidth + 1;
                target.shadowColor = d.properties.color;
                target.shadowBlur = 10;
            } else {
                target.lineWidth = d.properties.lineWidth;
                target.shadowColor = 'transparent';
                target.shadowBlur = 0;
            }
            
            if (d.properties.lineStyle === 'dashed') target.setLineDash([10, 10]);
            else if (d.properties.lineStyle === 'dotted') target.setLineDash([3, 6]);
            else target.setLineDash([]);
            
            const isFilled = d.properties.filled;
            target.fillStyle = isFilled ? d.properties.backgroundColor || 'rgba(59, 130, 246, 0.1)' : 'transparent';

            if (d.type === 'trend_line' || d.type === 'ray' || d.type === 'arrow_line') {
                if (screenPoints.length < 2) return;
                const p1 = screenPoints[0]; const p2 = screenPoints[1];
                if (p1.x === -10000 || p2.x === -10000) return;

                target.moveTo(p1.x, p1.y);
                if (d.type === 'ray') {
                    const dx = p2.x - p1.x; const dy = p2.y - p1.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist > 0.1) {
                         const extendFactor = 5000; 
                         target.lineTo(p1.x + (dx/dist)*extendFactor, p1.y + (dy/dist)*extendFactor);
                    } else target.lineTo(p2.x, p2.y);
                } else {
                    target.lineTo(p2.x, p2.y);
                }
                target.stroke();

                if (d.type === 'arrow_line') {
                    const headLen = 12;
                    const dx = p2.x - p1.x; const dy = p2.y - p1.y;
                    const angle = Math.atan2(dy, dx);
                    target.beginPath();
                    target.moveTo(p2.x, p2.y);
                    target.lineTo(p2.x - headLen * Math.cos(angle - Math.PI / 6), p2.y - headLen * Math.sin(angle - Math.PI / 6));
                    target.moveTo(p2.x, p2.y);
                    target.lineTo(p2.x - headLen * Math.cos(angle + Math.PI / 6), p2.y - headLen * Math.sin(angle + Math.PI / 6));
                    target.stroke();
                }
            }
            else if (d.type === 'brush') {
                 if (screenPoints.length < 2) return;
                 target.beginPath();
                 let started = false;
                 for(let i=0; i<screenPoints.length; i++) {
                     const p = screenPoints[i];
                     if (p.x !== -10000 && p.y !== -10000) {
                         if (!started) { target.moveTo(p.x, p.y); started = true; }
                         else target.lineTo(p.x, p.y);
                     }
                 }
                 target.stroke();
            }
            else if (d.type === 'horizontal_line') {
                if (screenPoints.length > 0 && screenPoints[0].y !== -10000) {
                    target.moveTo(-50000, screenPoints[0].y);
                    target.lineTo(50000, screenPoints[0].y);
                    target.stroke();
                }
            }
            else if (d.type === 'vertical_line') {
                 if (screenPoints.length > 0 && screenPoints[0].x !== -10000) {
                     target.moveTo(screenPoints[0].x, -50000);
                     target.lineTo(screenPoints[0].x, 50000);
                     target.stroke();
                 }
            }
            else if (d.type === 'horizontal_ray') {
                if (screenPoints.length > 0 && screenPoints[0].y !== -10000 && screenPoints[0].x !== -10000) {
                    target.moveTo(screenPoints[0].x, screenPoints[0].y);
                    target.lineTo(50000, screenPoints[0].y);
                    target.stroke();
                }
            }
            else if (d.type === 'rectangle' || d.type === 'date_range') {
                if (screenPoints.length < 2) return;
                const p1 = screenPoints[0]; const p2 = screenPoints[1];
                if (p1.x === -10000 || p2.x === -10000) return;

                const x = Math.min(p1.x, p2.x);
                const y = Math.min(p1.y, p2.y);
                const w = Math.abs(p2.x - p1.x);
                const h = Math.abs(p2.y - p1.y);
                
                if (d.type === 'date_range') {
                     target.fillStyle = d.properties.backgroundColor || 'rgba(59, 130, 246, 0.1)';
                     target.fillRect(x, 0, w, target.canvas.height); 
                     target.beginPath();
                     target.moveTo(x, 0); target.lineTo(x, target.canvas.height);
                     target.moveTo(x+w, 0); target.lineTo(x+w, target.canvas.height);
                     target.stroke();
                } else {
                    if (isFilled) target.fillRect(x, y, w, h);
                    target.strokeRect(x, y, w, h);
                }
            }
            else if (d.type === 'triangle' || d.type === 'rotated_rectangle') {
                 if (screenPoints.length >= 3) {
                     target.beginPath();
                     target.moveTo(screenPoints[0].x, screenPoints[0].y);
                     for(let i=1; i<screenPoints.length; i++) target.lineTo(screenPoints[i].x, screenPoints[i].y);
                     
                     if (d.type === 'rotated_rectangle' && screenPoints.length >= 3) {
                         const p0=screenPoints[0], p1=screenPoints[1], p2=screenPoints[2];
                         const ux = p1.x - p0.x, uy = p1.y - p0.y;
                         const vx = p2.x - p1.x, vy = p2.y - p1.y;
                         const uLenSq = ux*ux + uy*uy;
                         let hx = vx, hy = vy;
                         if (uLenSq > 0) {
                             const dot = vx*ux + vy*uy;
                             const proj = dot/uLenSq;
                             hx = vx - ux*proj; hy = vy - uy*proj;
                         }
                         target.lineTo(p0.x+hx, p0.y+hy);
                     }
                     target.closePath();
                     if (isFilled) target.fill();
                     target.stroke();
                 }
            }
            else if (d.type === 'circle') {
                if (screenPoints.length >= 2) {
                     const r = Math.hypot(screenPoints[1].x - screenPoints[0].x, screenPoints[1].y - screenPoints[0].y);
                     target.beginPath();
                     target.arc(screenPoints[0].x, screenPoints[0].y, r, 0, 2*Math.PI);
                     if (isFilled) target.fill();
                     target.stroke();
                }
            }
            else if (d.type === 'text') {
                 if (screenPoints.length >= 1) {
                     target.font = `${d.properties.fontSize || 14}px sans-serif`;
                     target.fillStyle = d.properties.color;
                     target.textAlign = d.properties.textAlign || 'left';
                     target.textBaseline = 'top';
                     target.fillText(d.properties.text || 'Text', screenPoints[0].x, screenPoints[0].y);
                 }
            }
            else if (d.type === 'measure') {
                if (screenPoints.length >= 2) {
                   const p1 = screenPoints[0], p2 = screenPoints[1];
                   const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
                   const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
                   target.fillStyle = d.properties.backgroundColor || 'rgba(59, 130, 246, 0.1)';
                   target.fillRect(x, y, w, h);
                   target.beginPath(); target.setLineDash([5,5]); target.moveTo(p1.x, p1.y); target.lineTo(p2.x, p2.y); target.stroke(); target.setLineDash([]);
                }
            }

            // Statistics Overlay for Measure and Date Range
            if (d.type === 'measure' || d.type === 'date_range') {
                if (d.points.length >= 2) {
                    const dp1 = d.points[0];
                    const dp2 = d.points[1];
                    const sp1 = screenPoints[0];
                    const sp2 = screenPoints[1];

                    if (sp1.x !== -10000 && sp2.x !== -10000) {
                        const priceDiff = dp2.price - dp1.price;
                        const percentDiff = (priceDiff / dp1.price) * 100;
                        const timeDiff = Math.abs(dp2.time - dp1.time);
                        
                        let barCount = 0;
                        if (_timeToIndex) {
                            const idx1 = _timeToIndex.get(dp1.time);
                            const idx2 = _timeToIndex.get(dp2.time);
                            if (idx1 !== undefined && idx2 !== undefined) {
                                barCount = Math.abs(idx2 - idx1);
                            }
                        }

                        const statsLines = [];
                        if (d.type === 'measure') {
                            statsLines.push(`${priceDiff.toFixed(2)} (${percentDiff >= 0 ? '+' : ''}${percentDiff.toFixed(2)}%)`);
                        }
                        statsLines.push(`${barCount} bars, ${formatDuration(timeDiff)}`);

                        // Draw stats box
                        const boxW = 140;
                        const boxH = statsLines.length * 16 + 10;
                        const boxX = sp2.x + 10;
                        const boxY = sp2.y - boxH / 2;

                        target.setLineDash([]);
                        target.fillStyle = 'rgba(15, 23, 42, 0.85)';
                        target.strokeStyle = d.properties.color;
                        target.lineWidth = 1;
                        target.shadowBlur = 4;
                        target.shadowColor = 'rgba(0,0,0,0.5)';
                        
                        // Round rect
                        const radius = 4;
                        target.beginPath();
                        target.moveTo(boxX + radius, boxY);
                        target.lineTo(boxX + boxW - radius, boxY);
                        target.quadraticCurveTo(boxX + boxW, boxY, boxX + boxW, boxY + radius);
                        target.lineTo(boxX + boxW, boxY + boxH - radius);
                        target.quadraticCurveTo(boxX + boxW, boxY + boxH, boxX + boxW - radius, boxY + boxH);
                        target.lineTo(boxX + radius, boxY + boxH);
                        target.quadraticCurveTo(boxX, boxY + boxH, boxX, boxY + boxH - radius);
                        target.lineTo(boxX, boxY + radius);
                        target.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
                        target.closePath();
                        target.fill();
                        target.stroke();

                        target.shadowBlur = 0;
                        target.fillStyle = '#FFFFFF';
                        target.font = '11px sans-serif';
                        target.textAlign = 'left';
                        target.textBaseline = 'top';
                        statsLines.forEach((line, i) => {
                            target.fillText(line, boxX + 8, boxY + 6 + i * 16);
                        });
                    }
                }
            }

            if (isSelected && !isDragging && !isCreating) {
                 target.fillStyle = '#ffffff';
                 target.strokeStyle = '#3b82f6';
                 target.lineWidth = 1;
                 target.setLineDash([]);
                 screenPoints.forEach(p => {
                     if (p.x === -10000) return;
                     target.beginPath();
                     target.arc(p.x, p.y, 4, 0, 2*Math.PI);
                     target.fill();
                     target.stroke();
                 });
            }
        });

        target.restore();
    }
}

class DrawingsPriceAxisPaneRenderer {
    constructor(private _source: DrawingsPrimitive) {}

    draw(target: any) {
        target.useMediaCoordinateSpace((scope: any) => {
            this._drawImpl(scope.context, scope.mediaSize.width, scope.mediaSize.height);
        });
    }

    _drawImpl(ctx: CanvasRenderingContext2D, width: number, height: number) {
        const { _drawings, _series } = this._source;
        if (!_series) return;

        const priceFormatter = _series.priceFormatter();

        _drawings.forEach(d => {
            if (d.properties.visible === false) return;
            if (d.type !== 'horizontal_ray' && d.type !== 'horizontal_line') return;
            
            if (d.points.length === 0) return;

            const price = d.points[0].price;
            const y = _series.priceToCoordinate(price);

            if (y === null) return;

            const text = priceFormatter.format(price);
            const bgColor = d.properties.color;
            const textColor = '#FFFFFF';

            const labelHeight = 22;
            const labelY = y - labelHeight / 2;

            ctx.fillStyle = bgColor;
            ctx.fillRect(0, labelY, width, labelHeight);

            ctx.fillStyle = textColor;
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, width / 2, y);
        });
    }
}

class DrawingsPriceAxisPaneView implements ISeriesPrimitiveAxisView {
    constructor(private _source: DrawingsPrimitive) {}
    renderer() { return new DrawingsPriceAxisPaneRenderer(this._source); }
    zOrder(): PrimitivePaneViewZOrder { return 'top'; }
}

class DrawingsPrimitive implements ISeriesPrimitive {
    _chart: IChartApi;
    _series: ISeriesApi<any>;
    _drawings: Drawing[] = [];
    _timeToIndex: Map<number, number> | null = null;
    _interactionStateRef: React.MutableRefObject<any>;
    _currentDefaultProperties: DrawingProperties;
    _selectedDrawingId: string | null = null;
    _paneViews: DrawingsPaneView[];
    _priceAxisViews: DrawingsPriceAxisPaneView[];

    constructor(
        chart: IChartApi, 
        series: ISeriesApi<any>, 
        interactionStateRef: React.MutableRefObject<any>,
        defaults: DrawingProperties
    ) {
        this._chart = chart;
        this._series = series;
        this._interactionStateRef = interactionStateRef;
        this._currentDefaultProperties = defaults;
        this._paneViews = [new DrawingsPaneView(this)];
        this._priceAxisViews = [new DrawingsPriceAxisPaneView(this)];
    }

    update(drawings: Drawing[], timeToIndex: Map<number, number>, defaults: DrawingProperties, selectedId: string | null) {
        this._drawings = drawings;
        this._timeToIndex = timeToIndex;
        this._currentDefaultProperties = defaults;
        this._selectedDrawingId = selectedId;
    }

    paneViews() {
        return this._paneViews;
    }

    priceAxisPaneViews() {
        return this._priceAxisViews;
    }
}

class DrawingsPaneView implements IPrimitivePaneView {
    constructor(private _source: DrawingsPrimitive) {}
    renderer() { return new DrawingsPaneRenderer(this._source); }
    zOrder(): PrimitivePaneViewZOrder { return 'top'; } 
}

const SINGLE_POINT_TOOLS = ['text', 'horizontal_line', 'vertical_line', 'horizontal_ray'];

export const FinancialChart: React.FC<ChartProps> = (props) => {
  const { 
    data, 
    smaData, 
    config, 
    onConfigChange,
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
    onRequestMoreData,
    areDrawingsLocked = false,
    isMagnetMode = false
  } = props;

  const propsRef = useRef(props);
  useEffect(() => { propsRef.current = props; });

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); 
  
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick" | "Line" | "Area"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const drawingsPrimitiveRef = useRef<DrawingsPrimitive | null>(null);
  
  const rangeChangeTimeout = useRef<any>(null);
  const rafId = useRef<number | null>(null);

  const toolTipRef = useRef<HTMLDivElement>(null);
  
  const isResizingVolume = useRef(false);
  const [localVolumeTopMargin, setLocalVolumeTopMargin] = useState(config.volumeTopMargin || 0.8);

  const replayMouseX = useRef<number | null>(null);

  useEffect(() => {
    if (config.volumeTopMargin !== undefined) {
      setLocalVolumeTopMargin(config.volumeTopMargin);
    }
  }, [config.volumeTopMargin]);

  useEffect(() => {
    if (chartRef.current) {
        try {
            chartRef.current.priceScale('volume').applyOptions({
                scaleMargins: { top: localVolumeTopMargin, bottom: 0 }
            });
        } catch(e) {}
    }
  }, [localVolumeTopMargin]);

  const interactionState = useRef<{
    isDragging: boolean;
    isCreating: boolean;
    dragDrawingId: string | null;
    dragHandleIndex: number | null;
    startPoint: { x: number; y: number } | null;
    creatingPoints: DrawingPoint[];
    creationStep: number;
    activeToolId: string;
  }>({
    isDragging: false,
    isCreating: false,
    dragDrawingId: null,
    dragHandleIndex: null,
    startPoint: null,
    creatingPoints: [],
    creationStep: 0,
    activeToolId: activeToolId
  });

  useEffect(() => {
      interactionState.current.activeToolId = activeToolId;
  }, [activeToolId]);

  const processedData = useMemo(() => {
    const length = data.length;
    const processed = new Array(length);
    for (let i = 0; i < length; i++) {
        const d = data[i];
        processed[i] = {
            time: d.time / 1000, 
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            value: d.close, 
        };
    }
    return processed;
  }, [data]);

  const timeToIndex = useMemo(() => {
      const map = new Map<number, number>();
      for(let i=0; i<data.length; i++) {
          map.set(data[i].time, i);
      }
      return map;
  }, [data]);
  
  const timeToIndexRef = useRef(timeToIndex);
  useEffect(() => { timeToIndexRef.current = timeToIndex; }, [timeToIndex]);

  useEffect(() => {
      if (drawingsPrimitiveRef.current) {
          drawingsPrimitiveRef.current.update(drawings, timeToIndex, currentDefaultProperties, selectedDrawingId);
      }
      requestDraw();
  }, [drawings, timeToIndex, currentDefaultProperties, selectedDrawingId]);

  const requestDraw = () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(renderOverlayAndSync);
  };

  const renderOverlayAndSync = () => {
      renderOverlay();
      if (chartRef.current) {
          // @ts-ignore
          if (chartRef.current._renderer) chartRef.current._renderer._redrawVisible();
          else chartRef.current.timeScale().applyOptions({});
      }
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f172a' },
        textColor: COLORS.text,
      },
      grid: {
        vertLines: { color: '#334155', visible: false },
        horzLines: { color: '#334155', visible: false },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { borderColor: '#334155', timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: '#334155' },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    chartRef.current = chart;

    const handleResize = () => {
        if (chartContainerRef.current && chartRef.current && canvasRef.current) {
            const w = chartContainerRef.current.clientWidth;
            const h = chartContainerRef.current.clientHeight;
            const dpr = window.devicePixelRatio || 1;

            chartRef.current.applyOptions({ width: w, height: h });
            
            canvasRef.current.width = w * dpr;
            canvasRef.current.height = h * dpr;
            canvasRef.current.style.width = `${w}px`;
            canvasRef.current.style.height = `${h}px`;
            
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) ctx.scale(dpr, dpr);

            requestDraw();
        }
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    const handleChartClick = (param: MouseEventParams) => {
        if (param.point) {
             const { activeToolId, isReplaySelecting, onSelectDrawing } = propsRef.current;
             const isDrawingTool = activeToolId !== 'cross' && activeToolId !== 'cursor' && activeToolId !== 'eraser';
             
             if (!isDrawingTool && !isReplaySelecting) {
                 onSelectDrawing(null);
             }
        }
    };
    chart.subscribeClick(handleChartClick);

    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        requestDraw(); 
        if (range && propsRef.current.onRequestMoreData) {
            if (rangeChangeTimeout.current) clearTimeout(rangeChangeTimeout.current);
            rangeChangeTimeout.current = setTimeout(() => {
                if (range.from < 100) { 
                    propsRef.current.onRequestMoreData?.();
                }
            }, 100);
        }
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      if (rangeChangeTimeout.current) clearTimeout(rangeChangeTimeout.current);
      if (rafId.current) cancelAnimationFrame(rafId.current);
      
      try { chart.unsubscribeClick(handleChartClick); } catch(e) {}
      
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
      smaSeriesRef.current = null;
      drawingsPrimitiveRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions({
        layout: {
            background: { type: ColorType.Solid, color: config.theme === 'light' ? '#ffffff' : '#0f172a' },
            textColor: config.theme === 'light' ? '#333' : COLORS.text,
        }
    });
    
    const mode = config.priceScaleMode === 'logarithmic' 
        ? PriceScaleMode.Logarithmic 
        : config.priceScaleMode === 'percentage' 
          ? PriceScaleMode.Percentage 
          : PriceScaleMode.Normal;
      
    chartRef.current.priceScale('right').applyOptions({
        mode,
        autoScale: config.autoScale !== false,
    });
  }, [config.theme, config.priceScaleMode, config.autoScale]);

  useEffect(() => {
    if (!chartRef.current) return;

    if (seriesRef.current) {
        chartRef.current.removeSeries(seriesRef.current);
        seriesRef.current = null;
        drawingsPrimitiveRef.current = null;
    }

    let newSeries;
    try {
        if (config.chartType === 'line') {
            newSeries = chartRef.current.addSeries(LineSeries, { color: COLORS.line, lineWidth: 2 });
        } else if (config.chartType === 'area') {
            newSeries = chartRef.current.addSeries(AreaSeries, { 
                lineColor: COLORS.line, 
                topColor: COLORS.areaTop, 
                bottomColor: COLORS.areaBottom, 
                lineWidth: 2 
            });
        } else {
            newSeries = chartRef.current.addSeries(CandlestickSeries, { 
                upColor: COLORS.bullish, 
                downColor: COLORS.bearish, 
                borderVisible: false, 
                wickUpColor: COLORS.bullish, 
                wickDownColor: COLORS.bearish 
            });
        }
        seriesRef.current = newSeries;
        newSeries.setData(processedData);
        
        const primitive = new DrawingsPrimitive(
            chartRef.current, 
            newSeries, 
            interactionState, 
            currentDefaultProperties
        );
        primitive.update(drawings, timeToIndex, currentDefaultProperties, selectedDrawingId);
        newSeries.attachPrimitive(primitive);
        drawingsPrimitiveRef.current = primitive;

    } catch (e) {
        console.error("Error creating series:", e);
    }
    
    requestDraw();

  }, [config.chartType]); 

  useEffect(() => {
    if (!seriesRef.current) return;
    try { seriesRef.current.setData(processedData); } catch(e) { console.error(e); }

    if (volumeSeriesRef.current && config.showVolume) {
        const length = data.length;
        const volData = new Array(length);
        for(let i=0; i<length; i++) {
            const d = data[i];
            volData[i] = {
                time: d.time / 1000,
                value: d.volume,
                color: d.close >= d.open ? COLORS.volumeBullish : COLORS.volumeBearish
            };
        }
        volumeSeriesRef.current.setData(volData);
    }

    if (smaSeriesRef.current && config.showSMA) {
        const smaSeriesData = [];
        const length = data.length;
        for(let i=0; i<length; i++) {
            const val = smaData[i];
            if (val !== null) {
                smaSeriesData.push({ time: data[i].time / 1000, value: val });
            }
        }
        smaSeriesRef.current.setData(smaSeriesData);
    }
  }, [data, smaData, config.chartType, processedData]); 

  useEffect(() => {
    if (!chartRef.current) return;

    if (config.showVolume) {
        if (!volumeSeriesRef.current) {
            volumeSeriesRef.current = chartRef.current.addSeries(HistogramSeries, { 
                priceFormat: { type: 'volume' }, 
                priceScaleId: 'volume', 
            });
            chartRef.current.priceScale('volume').applyOptions({
                scaleMargins: { top: localVolumeTopMargin, bottom: 0 } 
            });
        }
    } else {
        if (volumeSeriesRef.current) {
            chartRef.current.removeSeries(volumeSeriesRef.current);
            volumeSeriesRef.current = null;
        }
    }

    if (config.showSMA) {
        if (!smaSeriesRef.current) {
            smaSeriesRef.current = chartRef.current.addSeries(LineSeries, { 
                color: COLORS.sma, 
                lineWidth: 2, 
                crosshairMarkerVisible: false, 
                priceLineVisible: false, 
                lastValueVisible: false 
            });
        }
    } else {
        if (smaSeriesRef.current) {
            chartRef.current.removeSeries(smaSeriesRef.current);
            smaSeriesRef.current = null;
        }
    }
  }, [config.showVolume, config.showSMA]);

  useEffect(() => {
    if (canvasRef.current) {
        const isDrawingTool = activeToolId !== 'cross' && activeToolId !== 'cursor' && activeToolId !== 'eraser';
        if (isDrawingTool || isReplaySelecting) {
            canvasRef.current.style.pointerEvents = 'auto';
            document.body.style.cursor = 'crosshair';
        } else {
            canvasRef.current.style.pointerEvents = 'none'; 
            document.body.style.cursor = 'default';
        }
    }
  }, [activeToolId, isReplaySelecting]);


  const pointToScreen = (p: DrawingPoint) => {
    if (!chartRef.current || !seriesRef.current) return { x: -1000, y: -1000 };
    try {
        const timeScale = chartRef.current.timeScale();
        const price = seriesRef.current.priceToCoordinate(p.price);
        let x = timeScale.timeToCoordinate(p.time / 1000 as any);
        if (x === null) {
            const idx = timeToIndexRef.current.get(p.time);
            if (idx !== undefined) x = timeScale.logicalToCoordinate(idx as Logical);
        }
        return { 
            x: (x !== null && Number.isFinite(x)) ? x : -1000, 
            y: (price !== null && Number.isFinite(price)) ? price : -1000 
        };
    } catch (e) { return { x: -1000, y: -1000 }; }
  };

  const snapToCandle = (x: number, y: number) => {
      const currentData = propsRef.current.data;
      if (!chartRef.current || !seriesRef.current || currentData.length === 0) return null;

      const timeScale = chartRef.current.timeScale();
      const logical = timeScale.coordinateToLogical(x);
      
      if (logical === null || isNaN(logical)) return null;
      
      const idx = Math.round(logical);
      const candle = currentData[idx];
      
      if (!candle) return null; 

      const openY = seriesRef.current.priceToCoordinate(candle.open);
      const highY = seriesRef.current.priceToCoordinate(candle.high);
      const lowY = seriesRef.current.priceToCoordinate(candle.low);
      const closeY = seriesRef.current.priceToCoordinate(candle.close);
      
      if (openY === null || highY === null || lowY === null || closeY === null) return null;

      const prices = [
          { val: candle.open, y: openY },
          { val: candle.high, y: highY },
          { val: candle.low, y: lowY },
          { val: candle.close, y: closeY }
      ];

      let minDist = Math.abs(y - prices[0].y);
      let nearest = prices[0];
      for (let i = 1; i < prices.length; i++) {
          const d = Math.abs(y - prices[i].y);
          if (d < minDist) { minDist = d; nearest = prices[i]; }
      }

      if (minDist < 30) return { time: candle.time, price: nearest.val };
      return null;
  };

  const screenToPoint = (x: number, y: number, applyMagnet = false) => {
    if (!chartRef.current || !seriesRef.current) return null;
    if (applyMagnet && propsRef.current.isMagnetMode) {
        const snapped = snapToCandle(x, y);
        if (snapped) return snapped;
    }
    try {
        const timeScale = chartRef.current.timeScale();
        const timeSeconds = timeScale.coordinateToTime(x) as number;
        const price = seriesRef.current.coordinateToPrice(y);
        if (timeSeconds === null || price === null || !Number.isFinite(timeSeconds) || !Number.isFinite(price)) return null;
        return { time: timeSeconds * 1000, price };
    } catch (e) { return null; }
  };

  const renderOverlay = () => {
    const canvas = canvasRef.current;
    if (!canvas || !chartRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { isReplaySelecting: currentIsReplaySelecting } = propsRef.current;

    const width = chartContainerRef.current?.clientWidth || 0;
    const height = chartContainerRef.current?.clientHeight || 0;
    
    ctx.clearRect(0, 0, width, height);
    
    if (currentIsReplaySelecting && replayMouseX.current !== null) {
        ctx.beginPath();
        ctx.strokeStyle = '#ef4444'; 
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.moveTo(replayMouseX.current, 0);
        ctx.lineTo(replayMouseX.current, height);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = '#ef4444';
        ctx.fillText('Start Replay', replayMouseX.current + 5, 20);
    }
  };

  const getHitObject = (x: number, y: number) => {
    let hitHandle: { id: string; index: number } | null = null;
    let hitDrawing: Drawing | null = null;
    const { drawings, selectedDrawingId } = propsRef.current;

    if (selectedDrawingId) {
        const d = drawings.find(dr => dr.id === selectedDrawingId);
        if (d && !d.properties.locked && d.properties.visible !== false) {
             const screenPoints = d.points.map(pointToScreen);
             for(let i=0; i<screenPoints.length; i++) {
                 const p = screenPoints[i];
                 if (p.x === -1000) continue;
                 if (Math.hypot(p.x - x, p.y - y) < 8) {
                     hitHandle = { id: d.id, index: i };
                     return { hitHandle, hitDrawing: d };
                 }
             }
        }
    }

    for (let i = drawings.length - 1; i >= 0; i--) {
        const d = drawings[i];
        if (d.properties.visible === false) continue;
        const screenPoints = d.points.map(pointToScreen);
        let hit = false;
        
        if (d.type !== 'brush' && screenPoints.every(p => p.x === -1000)) continue;

        if (d.type === 'trend_line' || d.type === 'ray' || d.type === 'arrow_line') {
             if (screenPoints.length < 2) continue;
             const p1 = screenPoints[0]; const p2 = screenPoints[1];
             if (p1.x === -1000 || p2.x === -1000) continue;
             if (pDistance(x, y, p1.x, p1.y, p2.x, p2.y) < 6) hit = true;
        }
        else if (d.type === 'brush') {
             if (screenPoints.length < 2) continue;
             for (let j = 0; j < screenPoints.length - 1; j++) {
                 const p1 = screenPoints[j];
                 const p2 = screenPoints[j+1];
                 if (p1.x === -1000 || p2.x === -1000) continue;
                 if (pDistance(x, y, p1.x, p1.y, p2.x, p2.y) < 6) {
                     hit = true;
                     break;
                 }
             }
        }
        else if (d.type === 'horizontal_line') {
             if (screenPoints.length > 0 && screenPoints[0].y !== -1000 && Math.abs(y - screenPoints[0].y) < 6) hit = true;
        }
        else if (d.type === 'horizontal_ray') {
             if (screenPoints.length > 0 && screenPoints[0].y !== -1000 && screenPoints[0].x !== -1000) {
                 if (Math.abs(y - screenPoints[0].y) < 6 && x >= (screenPoints[0].x - 10)) hit = true;
             }
        }
        else if (d.type === 'vertical_line') {
             if (screenPoints.length > 0 && screenPoints[0].x !== -1000 && Math.abs(x - screenPoints[0].x) < 6) hit = true;
        }
        else if (d.type === 'rectangle' || d.type === 'date_range' || d.type === 'measure') {
             if (screenPoints.length < 2) continue;
             const minX = Math.min(screenPoints[0].x, screenPoints[1].x);
             const maxX = Math.max(screenPoints[0].x, screenPoints[1].x);
             const minY = d.type === 'date_range' ? 0 : Math.min(screenPoints[0].y, screenPoints[1].y);
             const maxY = d.type === 'date_range' ? 10000 : Math.max(screenPoints[0].y, screenPoints[1].y);
             if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                 if (d.properties.filled || d.type === 'date_range' || d.type === 'measure') hit = true;
                 else {
                     const tol = 6;
                     if (Math.abs(x - minX) < tol || Math.abs(x - maxX) < tol || Math.abs(y - minY) < tol || Math.abs(y - maxY) < tol) hit = true;
                 }
             }
        }
        else if (d.type === 'triangle' || d.type === 'rotated_rectangle') {
            if (screenPoints.length >= 3) {
                const polyPoints = [...screenPoints];
                if (d.type === 'rotated_rectangle') {
                    const p0 = screenPoints[0], p1 = screenPoints[1], p2 = screenPoints[2];
                    const ux = p1.x - p0.x, uy = p1.y - p0.y;
                    const vx = p2.x - p1.x, vy = p2.y - p1.y;
                    const uLenSq = ux*ux + uy*uy;
                    let hx = vx, hy = vy;
                    if (uLenSq > 0) {
                        const dot = vx*ux + vy*uy;
                        const proj = dot/uLenSq;
                        hx = vx - ux*proj; hy = vy - uy*proj;
                    }
                    polyPoints.push({x: p0.x + hx, y: p0.y + hy});
                }
                
                if (isPointInPoly(x, y, polyPoints as any)) hit = true;
                else {
                    const tol = 6;
                    for (let j = 0; j < polyPoints.length; j++) {
                        const p1 = polyPoints[j];
                        const p2 = polyPoints[(j + 1) % polyPoints.length];
                        if (p1.x === -1000 || p2.x === -1000) continue;
                        if (pDistance(x, y, p1.x, p1.y, p2.x, p2.y) < tol) {
                            hit = true;
                            break;
                        }
                    }
                }
            }
        }
        else if (d.type === 'circle') {
             if (screenPoints.length >= 2) {
                 const r = Math.hypot(screenPoints[1].x - screenPoints[0].x, screenPoints[1].y - screenPoints[0].y);
                 const dist = Math.hypot(x - screenPoints[0].x, y - screenPoints[0].y);
                 if (d.properties.filled) { if (dist <= r) hit = true; } 
                 else { if (Math.abs(dist - r) < 6) hit = true; }
             }
        }
        else if (d.type === 'text') {
             if (screenPoints.length >= 1 && screenPoints[0].x !== -1000) {
                 if (x >= screenPoints[0].x && x <= screenPoints[0].x + 50 && y >= screenPoints[0].y && y <= screenPoints[0].y + 20) hit = true;
             }
        }

        if (hit) { hitDrawing = d; break; }
    }
    return { hitHandle, hitDrawing };
  };

  const handleVolumeResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingVolume.current = true;
    const win = (e.view as unknown as Window) || window;
    const handleMouseMove = (ev: MouseEvent) => {
        if (!isResizingVolume.current || !chartContainerRef.current) return;
        const rect = chartContainerRef.current.getBoundingClientRect();
        const relativeY = ev.clientY - rect.top;
        let newMargin = relativeY / rect.height;
        newMargin = Math.max(0.5, Math.min(newMargin, 0.95));
        setLocalVolumeTopMargin(newMargin);
    };
    const handleMouseUp = () => {
        if (isResizingVolume.current) {
            isResizingVolume.current = false;
            win.removeEventListener('mousemove', handleMouseMove);
            win.removeEventListener('mouseup', handleMouseUp);
            if (onConfigChange) onConfigChange({ ...config, volumeTopMargin: localVolumeTopMargin });
        }
    };
    win.addEventListener('mousemove', handleMouseMove);
    win.addEventListener('mouseup', handleMouseUp);
  };
  
  const handleContainerMouseMove = (e: React.MouseEvent) => {
      if (isReplaySelecting && canvasRef.current) {
         const rect = canvasRef.current.getBoundingClientRect();
         replayMouseX.current = e.clientX - rect.left;
         requestDraw();
         return;
      }
      if (interactionState.current.isCreating || interactionState.current.isDragging) return;
      const isDrawingTool = activeToolId !== 'cross' && activeToolId !== 'cursor' && activeToolId !== 'eraser';
      if (isDrawingTool) return;

      if (chartContainerRef.current && canvasRef.current) {
          const rect = chartContainerRef.current.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const { hitHandle, hitDrawing } = getHitObject(x, y);
          if ((hitHandle || hitDrawing) && !areDrawingsLocked) {
              const isLocked = hitDrawing?.properties.locked;
              if (isLocked) {
                  canvasRef.current.style.pointerEvents = 'auto';
                  document.body.style.cursor = 'not-allowed';
              } else {
                  canvasRef.current.style.pointerEvents = 'auto';
                  document.body.style.cursor = hitHandle ? 'grab' : 'move';
              }
          } else {
              canvasRef.current.style.pointerEvents = 'none';
              document.body.style.cursor = 'default'; 
          }
      }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isReplaySelecting) {
        const p = screenToPoint(x, y, true);
        if (p && onReplayPointSelect) {
            onReplayPointSelect(p.time);
            replayMouseX.current = null;
            requestDraw();
        }
        return; 
    }

    const { hitHandle, hitDrawing } = getHitObject(x, y);
    const isDrawingTool = activeToolId !== 'cross' && activeToolId !== 'cursor' && activeToolId !== 'eraser';

    if (isDrawingTool) {
        onActionStart?.();
        const useMagnet = activeToolId !== 'brush' && activeToolId !== 'text' && activeToolId !== 'cursor' && activeToolId !== 'eraser'; 
        const p = screenToPoint(x, y, useMagnet);
        
        if (p) {
            if (interactionState.current.isCreating) return; 

            if (activeToolId === 'brush') {
                 interactionState.current.isCreating = true;
                 interactionState.current.creatingPoints = [p];
                 interactionState.current.creationStep = 0;
            } else if (SINGLE_POINT_TOOLS.includes(activeToolId)) {
                 interactionState.current.isCreating = true;
                 interactionState.current.creatingPoints = [p];
                 interactionState.current.creationStep = 0;
            } else {
                interactionState.current.isCreating = true;
                interactionState.current.creationStep = 1;
                const points = [p, p];
                if (activeToolId === 'triangle' || activeToolId === 'rotated_rectangle') points.push(p);
                interactionState.current.creatingPoints = points;
            }
        }
    } else if (!areDrawingsLocked) {
        if (hitHandle) {
            const d = drawings.find(dr => dr.id === hitHandle.id);
            if (d?.properties.locked) { onSelectDrawing(hitHandle.id); return; }
            onActionStart?.();
            onSelectDrawing(hitHandle.id);
            interactionState.current.isDragging = true;
            interactionState.current.dragDrawingId = hitHandle.id;
            interactionState.current.dragHandleIndex = hitHandle.index;
        } else if (hitDrawing) {
            if (activeToolId === 'eraser') {
                if (hitDrawing.properties.locked) return;
                onActionStart?.();
                onUpdateDrawings(drawings.filter(d => d.id !== hitDrawing!.id));
                return;
            }
            onSelectDrawing(hitDrawing.id);
            if (hitDrawing.properties.locked) return; 
            onActionStart?.();
            interactionState.current.isDragging = true;
            interactionState.current.dragDrawingId = hitDrawing.id;
            interactionState.current.dragHandleIndex = -1;
            interactionState.current.startPoint = { x, y };
        } else {
            onSelectDrawing(null);
        }
    }
    
    requestDraw();
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let needsRedraw = false;

    if (interactionState.current.isCreating) {
        const useMagnet = activeToolId !== 'brush' && activeToolId !== 'text'; 
        const p = screenToPoint(x, y, useMagnet);
        if (p) {
             if (activeToolId === 'brush') {
                 const points = [...interactionState.current.creatingPoints];
                 const lastP = points[points.length - 1];
                 const lastScreen = pointToScreen(lastP);
                 const dist = Math.hypot(x - lastScreen.x, y - lastScreen.y);
                 if (dist > 5 || lastScreen.x === -1000) { 
                     points.push(p);
                     interactionState.current.creatingPoints = points;
                     needsRedraw = true;
                 }
             } else if (SINGLE_POINT_TOOLS.includes(activeToolId)) {
             } else {
                 const points = [...interactionState.current.creatingPoints];
                 const step = interactionState.current.creationStep;
                 points[step] = p;
                 interactionState.current.creatingPoints = points;
                 needsRedraw = true;
             }
        }
    } else if (interactionState.current.isDragging && interactionState.current.dragDrawingId) {
        const d = drawings.find(d => d.id === interactionState.current.dragDrawingId);
        if (d && !d.properties.locked) {
            const newPoints = [...d.points];
            const isHandle = interactionState.current.dragHandleIndex !== null && interactionState.current.dragHandleIndex >= 0;
            const p = screenToPoint(x, y, isHandle);
            
            if (p) {
                if (isHandle) {
                     newPoints[interactionState.current.dragHandleIndex!] = p;
                } else if (interactionState.current.startPoint) {
                     const dx = x - interactionState.current.startPoint.x;
                     const dy = y - interactionState.current.startPoint.y;
                     interactionState.current.startPoint = { x, y };
                     for(let i=0; i<newPoints.length; i++) {
                         const sp = pointToScreen(newPoints[i]);
                         if (sp.x === -1000) continue; 
                         const np = screenToPoint(sp.x + dx, sp.y + dy); 
                         if (np) newPoints[i] = np;
                     }
                }
                const newDrawings = drawings.map(dr => dr.id === d.id ? { ...dr, points: newPoints } : dr);
                onUpdateDrawings(newDrawings); 
                needsRedraw = true;
            }
        }
    }

    if (needsRedraw) {
        requestDraw();
    }
  };

  const handleCanvasMouseUp = () => {
    if (isReplaySelecting) return;

    if (interactionState.current.isCreating) {
        if (activeToolId === 'brush') {
             let finalPoints = interactionState.current.creatingPoints;
             if (currentDefaultProperties.smoothing && currentDefaultProperties.smoothing > 0) {
                 finalPoints = smoothPoints(finalPoints, currentDefaultProperties.smoothing);
             }
             const newDrawing: Drawing = {
                id: crypto.randomUUID(),
                type: activeToolId,
                points: finalPoints,
                properties: currentDefaultProperties
            };
            onUpdateDrawings([...drawings, newDrawing]);
            interactionState.current.isCreating = false;
            interactionState.current.creatingPoints = [];
            interactionState.current.creationStep = 0;
            onToolComplete();
            requestDraw();
            return;
        }

        const step = interactionState.current.creationStep;
        const totalPoints = interactionState.current.creatingPoints.length;
        if (step < totalPoints - 1) {
            interactionState.current.creationStep = step + 1;
            const points = [...interactionState.current.creatingPoints];
            points[step + 1] = points[step]; 
            interactionState.current.creatingPoints = points;
            requestDraw();
            return; 
        }

        if (activeToolId === 'text') {
            setTimeout(() => {
                const text = prompt("Enter text:", "Text Label");
                if (text === null) {
                    interactionState.current.isCreating = false;
                    interactionState.current.creatingPoints = [];
                    interactionState.current.creationStep = 0;
                    onToolComplete();
                    requestDraw();
                    return;
                }
                const newDrawing: Drawing = {
                    id: crypto.randomUUID(),
                    type: activeToolId,
                    points: [...interactionState.current.creatingPoints],
                    properties: { ...currentDefaultProperties, text: text || "Text" }
                };
                onUpdateDrawings([...drawings, newDrawing]);
                interactionState.current.isCreating = false;
                interactionState.current.creatingPoints = [];
                interactionState.current.creationStep = 0;
                onToolComplete();
                requestDraw();
            }, 10);
            return;
        } else {
            const newDrawing: Drawing = {
                id: crypto.randomUUID(),
                type: activeToolId,
                points: interactionState.current.creatingPoints,
                properties: currentDefaultProperties
            };
            onUpdateDrawings([...drawings, newDrawing]);
        }
        interactionState.current.isCreating = false;
        interactionState.current.creationStep = 0;
        onToolComplete(); 
    }
    
    interactionState.current.isDragging = false;
    interactionState.current.dragDrawingId = null;
    interactionState.current.dragHandleIndex = null;
    interactionState.current.startPoint = null;
    
    document.body.style.cursor = 'default';
    requestDraw();
  };

  if (data.length === 0) {
     return <div className="flex items-center justify-center h-full text-slate-500">No data loaded. Import a CSV.</div>;
  }

  return (
    <div 
        className="w-full h-full relative group"
        onMouseMove={handleContainerMouseMove}
    >
       <div ref={chartContainerRef} className="w-full h-full" />
       
       <canvas 
         ref={canvasRef}
         className="absolute inset-0 z-10"
         style={{ pointerEvents: 'none' }} 
         onMouseDown={handleCanvasMouseDown}
         onMouseMove={handleCanvasMouseMove}
         onMouseUp={handleCanvasMouseUp}
       />

       {config.showVolume && (
           <div 
             className="absolute left-0 right-0 z-30 h-1 cursor-ns-resize group/resize"
             style={{ top: `${localVolumeTopMargin * 100}%` }}
             onMouseDown={handleVolumeResizeMouseDown}
           >
                <div className="w-full h-px bg-slate-600 opacity-0 group-hover/resize:opacity-100 transition-opacity"></div>
           </div>
       )}

       <div 
         ref={toolTipRef}
         className="absolute hidden pointer-events-none bg-[#1e293b]/95 border border-[#475569] p-2.5 rounded shadow-xl backdrop-blur-sm z-50 transition-opacity duration-75"
         style={{ top: 0, left: 0 }}
       />
    </div>
  );
};