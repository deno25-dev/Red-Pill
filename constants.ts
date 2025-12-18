import { 
  Crosshair, 
  Circle, 
  MousePointer2, 
  Slash, 
  TrendingUp, 
  ArrowRight, 
  ArrowUpRight, 
  MoveVertical, 
  Minus, 
  Square, 
  Triangle, 
  Diamond, 
  Ruler, 
  CalendarDays,
  Brush,
  Type
} from 'lucide-react';

export const COLORS = {
  bullish: '#10B981', // Emerald 500
  bearish: '#EF4444', // Red 500
  volumeBullish: 'rgba(16, 185, 129, 0.3)',
  volumeBearish: 'rgba(239, 68, 68, 0.3)',
  line: '#3B82F6', // Blue 500
  areaTop: 'rgba(59, 130, 246, 0.5)',
  areaBottom: 'rgba(59, 130, 246, 0.0)',
  sma: '#F59E0B', // Amber 500
  text: '#94A3B8', // Slate 400
  grid: '#334155', // Slate 700
  crosshair: '#FFFFFF',
};

export const MOCK_DATA_COUNT = 5000;

export const TOOLS = {
  cursors: [
    { id: 'cross', label: 'Cross', icon: Crosshair },
    { id: 'dot', label: 'Dot', icon: Circle },
    { id: 'arrow', label: 'Arrow', icon: MousePointer2 },
  ],
  lines: [
    { id: 'trend_line', label: 'Trend Line', icon: Slash },
    { id: 'ray', label: 'Ray', icon: TrendingUp },
    { id: 'horizontal_ray', label: 'Horizontal Ray', icon: ArrowRight },
    { id: 'arrow_line', label: 'Arrow Line', icon: ArrowUpRight },
    { id: 'vertical_line', label: 'Vertical Line', icon: MoveVertical },
    { id: 'horizontal_line', label: 'Horizontal Line', icon: Minus },
  ],
  shapes: [
    { id: 'rectangle', label: 'Rectangle', icon: Square },
    { id: 'triangle', label: 'Triangle', icon: Triangle },
    { id: 'rotated_rectangle', label: 'Rotated Rectangle', icon: Diamond },
  ],
  measure: [
    { id: 'measure', label: 'Measure', icon: Ruler },
    { id: 'date_range', label: 'Date Range', icon: CalendarDays },
  ],
  other: [
    { id: 'brush', label: 'Brush', icon: Brush },
    { id: 'text', label: 'Text', icon: Type },
  ]
};

// Flattened list for easy lookup
export const ALL_TOOLS_LIST = [
  ...TOOLS.cursors,
  ...TOOLS.lines,
  ...TOOLS.shapes,
  ...TOOLS.measure,
  ...TOOLS.other
];