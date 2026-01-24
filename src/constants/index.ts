import React from 'react';
import { 
  Crosshair, 
  Slash, 
  ArrowUpRight, 
  Square, 
  Triangle, 
  Diamond, 
  Ruler, 
  CalendarDays,
  Brush, 
  Type
} from 'lucide-react';

// Custom Icon for Horizontal Ray
const HorizontalRayIcon = (props: any) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  width: "24",
  height: "24",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  ...props
}, [
  React.createElement('circle', { cx: "7", cy: "12", r: "3", key: "c" }),
  React.createElement('line', { x1: "10", y1: "12", x2: "22", y2: "12", key: "l" })
]);

// Custom Icon for Ray
const RayIcon = (props: any) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  width: "24",
  height: "24",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  ...props
}, [
  React.createElement('circle', { cx: "7", cy: "17", r: "2.5", key: "c1" }),
  React.createElement('circle', { cx: "12", cy: "12", r: "2.5", key: "c2" }),
  React.createElement('line', { x1: "7", y1: "17", x2: "19", y2: "5", key: "l" })
]);

// Custom Icon for Vertical Line
const VerticalLineIcon = (props: any) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  width: "24",
  height: "24",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  ...props
}, [
  React.createElement('line', { x1: "12", y1: "4", x2: "12", y2: "20", key: "l" }),
  React.createElement('circle', { cx: "12", cy: "12", r: "3", key: "c" })
]);

// Custom Icon for Horizontal Line
const HorizontalLineIcon = (props: any) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  width: "24",
  height: "24",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  ...props
}, [
  React.createElement('line', { x1: "4", y1: "12", x2: "20", y2: "12", key: "l" }),
  React.createElement('circle', { cx: "12", cy: "12", r: "3", key: "c" })
]);

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
  ],
  lines: [
    { id: 'trend_line', label: 'Trend Line', icon: Slash },
    { id: 'ray', label: 'Ray', icon: RayIcon },
    { id: 'horizontal_ray', label: 'Horizontal Ray', icon: HorizontalRayIcon },
    { id: 'arrow_line', label: 'Arrow Line', icon: ArrowUpRight },
    { id: 'vertical_line', label: 'Vertical Line', icon: VerticalLineIcon },
    { id: 'horizontal_line', label: 'Horizontal Line', icon: HorizontalLineIcon },
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

export const ALL_TOOLS_LIST = [
  ...TOOLS.cursors,
  ...TOOLS.lines,
  ...TOOLS.shapes,
  ...TOOLS.measure,
  ...TOOLS.other
];