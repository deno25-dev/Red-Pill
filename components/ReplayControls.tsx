
import React from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  ChevronRight, 
  X,
  GripVertical
} from 'lucide-react';

interface ReplayControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onStepForward: () => void;
  onReset: () => void;
  onClose: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  progress: number; // 0 to 100 percentage
  position?: { x: number; y: number };
  onHeaderMouseDown?: (e: React.MouseEvent) => void;
  isAdvancedMode?: boolean; // Mandate 0.9.2: Flag to lock UI
}

export const ReplayControls: React.FC<ReplayControlsProps> = ({
  isPlaying,
  onPlayPause,
  onStepForward,
  onReset,
  onClose,
  speed,
  onSpeedChange,
  progress,
  position,
  onHeaderMouseDown,
  isAdvancedMode
}) => {
  return (
    <div 
      className="absolute z-40 bg-[#1e293b]/90 backdrop-blur-md border border-[#334155] rounded-full shadow-2xl flex flex-col w-auto animate-in fade-in zoom-in-95 duration-200 overflow-hidden group"
      style={position ? { left: position.x, top: position.y } : { bottom: '5rem', left: '50%', transform: 'translateX(-50%)' }}
    >
      <div className="flex items-center p-1.5 gap-1">
          {/* Drag Handle */}
          <div 
            onMouseDown={onHeaderMouseDown}
            className="pl-2 pr-1 text-slate-500 cursor-move hover:text-slate-300 active:text-white transition-colors"
          >
            <GripVertical size={16} />
          </div>

          <div className="w-px h-6 bg-[#334155] mx-1"></div>

          {/* Jump Start */}
          <button 
            onClick={onReset}
            className="p-2 text-slate-400 hover:text-white hover:bg-[#334155] rounded-full transition-colors"
            title="Jump to Start"
          >
            <SkipBack size={18} />
          </button>
          
          {/* Play/Pause */}
          <button 
            onClick={onPlayPause}
            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${
              isPlaying 
                ? 'bg-amber-500/20 text-amber-500 hover:bg-amber-500/30' 
                : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/20'
            }`}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
          </button>

          {/* Step Forward (Standard Mode Only) */}
          {!isAdvancedMode && (
            <button 
                onClick={onStepForward}
                disabled={isPlaying}
                className="p-2 text-slate-400 hover:text-white hover:bg-[#334155] rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Step Forward"
            >
                <ChevronRight size={18} />
            </button>
          )}

          {/* Speed Toggle vs Status Indicator */}
          {isAdvancedMode ? (
             <div className="mx-3 px-2 py-1 bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded text-[9px] font-bold tracking-wider whitespace-nowrap shadow-[0_0_10px_rgba(168,85,247,0.1)] flex items-center gap-1.5 animate-pulse select-none">
                 <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-ping" />
                 MODE: 1:1 REAL-TIME SIMULATION
             </div>
          ) : (
             <button 
                onClick={() => {
                    const speeds = [0.5, 1, 2, 5, 10, 20, 50, 100]; 
                    const nextIdx = (speeds.indexOf(speed) + 1) % speeds.length;
                    onSpeedChange(speeds[nextIdx]);
                }}
                className="w-12 h-8 mx-1 flex items-center justify-center rounded-md transition-colors font-mono text-xs font-bold hover:bg-[#334155] text-slate-400 hover:text-white"
                title="Playback Speed"
            >
                {speed}x
            </button>
          )}

          <div className="w-px h-6 bg-[#334155] mx-1"></div>

          {/* Close */}
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-full transition-colors"
            title="Close Replay"
          >
            <X size={18} />
          </button>
      </div>
      
      {/* Progress Bar - Integrated at bottom */}
      <div className="h-1 bg-[#0f172a] w-full">
         <div 
            className={`h-full transition-all duration-200 ${isAdvancedMode ? 'bg-purple-500/80' : 'bg-blue-500/80'}`}
            style={{ width: `${progress}%` }}
         />
      </div>
    </div>
  );
};
