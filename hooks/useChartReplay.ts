
import React, { useEffect, useRef, useCallback } from 'react';
import { ISeriesApi, IChartApi, Time, SeriesType, LogicalRange } from 'lightweight-charts';
import { OHLCV } from '../types';

let renderCount = 0;

interface UseChartReplayProps {
  chartRef: React.MutableRefObject<IChartApi | null>;
  seriesRef: React.MutableRefObject<ISeriesApi<SeriesType> | null>;
  fullData?: OHLCV[];
  startIndex: number;
  isPlaying: boolean;
  speed: number;
  onSyncState?: (index: number, time: number, price: number) => void;
  onComplete?: () => void;
  liveTimeRef?: React.MutableRefObject<number | null>;
}

export const useChartReplay = ({
  chartRef,
  seriesRef,
  fullData,
  startIndex,
  isPlaying,
  speed,
  onSyncState,
  onComplete,
  liveTimeRef
}: UseChartReplayProps) => {
  renderCount++;
  
  const requestRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  
  const replayBufferRef = useRef<OHLCV[]>([]);
  const bufferCursorRef = useRef<number>(0);
  
  // Track current state in refs to sync on pause (State Deferral)
  const currentIndexRef = useRef<number>(startIndex);
  const currentPriceRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);
  
  // Internal refs for props to break dependency chains (The Ref-Controller Pattern)
  const fullDataRef = useRef<OHLCV[] | undefined>(fullData);
  
  // Stable Callback Refs
  const onSyncStateRef = useRef(onSyncState);
  const onCompleteRef = useRef(onComplete);
  const lastSyncTimeRef = useRef<number>(0);

  useEffect(() => { fullDataRef.current = fullData; }, [fullData]);
  useEffect(() => { onSyncStateRef.current = onSyncState; }, [onSyncState]);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  // 1. Monkey-Patch TimeScale (Library Lock)
  // This prevents the library from overriding our manual scroll positions during high-frequency updates.
  useEffect(() => {
      if (!chartRef.current) return;
      const timeScale = chartRef.current.timeScale();
      
      if ((timeScale as any)._isPatched) return;

      const originalSetVisible = timeScale.setVisibleLogicalRange.bind(timeScale);

      timeScale.setVisibleLogicalRange = (range: LogicalRange) => {
          return originalSetVisible(range);
      };
      (timeScale as any)._isPatched = true;
  }, [chartRef.current]);

  // NUCLEAR RESET LISTENER
  useEffect(() => {
    const handleGlobalReset = () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
        replayBufferRef.current = [];
        bufferCursorRef.current = 0;
        lastFrameTimeRef.current = 0;
    };
    window.addEventListener('GLOBAL_ASSET_CHANGE', handleGlobalReset);
    return () => window.removeEventListener('GLOBAL_ASSET_CHANGE', handleGlobalReset);
  }, []);

  // --- LOGIC 1: INITIALIZATION ---
  // Runs ONLY when Data Reference Changes (New File / Timeframe)
  // REMOVED startIndex from dependency array to prevent playback loop resets
  useEffect(() => {
    if (!seriesRef.current || !fullData || fullData.length === 0) return;

    // Reset Engine State
    bufferCursorRef.current = 0;
    lastFrameTimeRef.current = 0;
    currentIndexRef.current = startIndex; // Use current prop for init

    // Build Buffer (Slice from startIndex + 1 to end)
    const bufferStart = startIndex + 1;
    if (bufferStart < fullData.length) {
        replayBufferRef.current = fullData.slice(bufferStart);
    } else {
        replayBufferRef.current = [];
    }

    // Init Values
    if (fullData[startIndex]) {
        currentTimeRef.current = fullData[startIndex].time;
        currentPriceRef.current = fullData[startIndex].close;
        if (liveTimeRef) liveTimeRef.current = fullData[startIndex].time;
    }

    console.log('[Replay] Engine Initialized for new data source.');

  }, [fullData]); // STRICT DEPENDENCY: Only FullData.

  // --- LOGIC 2: SEEKING (RECUT) ---
  // Runs when startIndex prop changes. 
  // We calculate the deviation to determine if it's a Manual Seek or just a Playback Update.
  useEffect(() => {
      if (!fullData || fullData.length === 0) return;

      const internalIndex = currentIndexRef.current;
      const targetIndex = startIndex;
      const diff = Math.abs(targetIndex - internalIndex);
      
      // Deviation Threshold: 2 frames.
      // If deviation is small, it's likely the parent component updating due to our own onSyncState loop.
      // If large, it's a user interaction (Click on chart / Toolbar reset).
      if (diff > 2) {
          console.log(`[Replay] Manual Seek detected (Diff: ${diff}). Recutting buffer.`);
          
          // Apply Seek
          currentIndexRef.current = targetIndex;
          bufferCursorRef.current = 0;
          lastFrameTimeRef.current = 0;

          const bufferStart = targetIndex + 1;
          if (bufferStart < fullData.length) {
              replayBufferRef.current = fullData.slice(bufferStart);
          } else {
              replayBufferRef.current = [];
          }

          if (fullData[targetIndex]) {
              currentTimeRef.current = fullData[targetIndex].time;
              currentPriceRef.current = fullData[targetIndex].close;
              if (liveTimeRef) liveTimeRef.current = fullData[targetIndex].time;
          }
      }
  }, [startIndex, fullData]);

  // --- LOGIC 3: ANIMATION LOOP ---
  const animate = useCallback((time: number) => {
    const currentSeries = seriesRef.current;
    const currentChart = chartRef.current;
    
    // Safety Guards
    if (!currentSeries || !currentChart || replayBufferRef.current.length === 0) return;
    
    // Time Delta Calculation
    if (lastFrameTimeRef.current === 0) {
      lastFrameTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
      return;
    }

    const deltaSeconds = (time - lastFrameTimeRef.current) / 1000;
    
    // Sanity check for suspended tabs or massive lag spikes
    if (isNaN(deltaSeconds) || !isFinite(deltaSeconds) || deltaSeconds > 1.0) {
        lastFrameTimeRef.current = time;
        requestRef.current = requestAnimationFrame(animate);
        return;
    }

    lastFrameTimeRef.current = time;

    // Advance Cursor
    const advanceAmount = deltaSeconds * speed;
    const prevCursor = bufferCursorRef.current;
    const nextCursor = prevCursor + advanceAmount;
    bufferCursorRef.current = nextCursor;

    const floorPrev = Math.floor(prevCursor);
    const floorNext = Math.floor(nextCursor);

    // Batch Update: Apply all completed candles in this frame
    if (floorNext > floorPrev) {
        // Range Locking: Prevent chart auto-scroll/zoom jitter
        const timeScale = currentChart.timeScale();
        const lockedRange = timeScale.getVisibleLogicalRange();

        // Iterate through all candles passed in this frame
        for (let i = floorPrev; i < floorNext; i++) {
            if (i < replayBufferRef.current.length) {
                const candle = replayBufferRef.current[i];
                
                if (candle) {
                    try {
                        currentSeries.update({
                            time: (candle.time / 1000) as Time,
                            open: candle.open,
                            high: candle.high,
                            low: candle.low,
                            close: candle.close
                        } as any);
                    } catch (e) {
                        // Suppress update errors (e.g. older data point)
                    }
                    
                    currentIndexRef.current = currentIndexRef.current + 1;
                    currentTimeRef.current = candle.time;
                    currentPriceRef.current = candle.close;
                    if (liveTimeRef) liveTimeRef.current = candle.time;
                }
            }
        }

        // Restore Range
        if (lockedRange) {
            timeScale.setVisibleLogicalRange(lockedRange);
        }
    }

    // Process Tick Interpolation (for current forming candle)
    if (floorNext < replayBufferRef.current.length) {
        const targetCandle = replayBufferRef.current[floorNext];
        
        if (targetCandle) {
            const progress = nextCursor - floorNext;
            
            let simulatedPrice = targetCandle.open;
            let simulatedHigh = targetCandle.open;
            let simulatedLow = targetCandle.open;

            // Simple Tick Simulation Pattern
            if (progress < 0.33) {
                const p = progress / 0.33;
                simulatedPrice = targetCandle.open + (targetCandle.high - targetCandle.open) * p;
                simulatedHigh = Math.max(targetCandle.open, simulatedPrice);
                simulatedLow = Math.min(targetCandle.open, simulatedPrice);
            } else if (progress < 0.66) {
                const p = (progress - 0.33) / 0.33;
                simulatedPrice = targetCandle.high - (targetCandle.high - targetCandle.low) * p;
                simulatedHigh = targetCandle.high;
                simulatedLow = Math.min(targetCandle.low, simulatedPrice);
            } else {
                const p = (progress - 0.66) / 0.34;
                simulatedPrice = targetCandle.low + (targetCandle.close - targetCandle.low) * p;
                simulatedHigh = targetCandle.high;
                simulatedLow = targetCandle.low;
            }

            // Apply Tick
            try {
                currentSeries.update({
                    time: (targetCandle.time / 1000) as Time,
                    open: targetCandle.open,
                    high: simulatedHigh,
                    low: simulatedLow,
                    close: simulatedPrice
                } as any);
                
                currentPriceRef.current = simulatedPrice;
                if (liveTimeRef) liveTimeRef.current = targetCandle.time;
            } catch (e) {}
        }
    }

    // Check for Completion
    if (floorNext >= replayBufferRef.current.length) {
        if (onCompleteRef.current) onCompleteRef.current();
        // Sync final state immediately
        if (onSyncStateRef.current) {
             const lastIdx = (fullDataRef.current?.length || 0) - 1;
             if (lastIdx >= 0) {
                 const finalC = fullDataRef.current![lastIdx];
                 onSyncStateRef.current(lastIdx, finalC.time, finalC.close);
             }
        }
        return; // Stop animation loop
    }

    // Throttled UI Sync (The Passive Playhead)
    // Only update React state every 200ms to keep UI responsive
    const now = performance.now();
    if (now - lastSyncTimeRef.current > 200 && onSyncStateRef.current) {
        onSyncStateRef.current(currentIndexRef.current, currentTimeRef.current, currentPriceRef.current);
        lastSyncTimeRef.current = now;
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [speed, seriesRef, chartRef]); // Removed startIndex from dependencies

  // --- PLAY/PAUSE CONTROLLER ---
  useEffect(() => {
    if (isPlaying) {
      lastFrameTimeRef.current = 0;
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      
      // Force one final sync on pause to ensure exact UI state
      // (Unless we are in the middle of a seek)
      const diff = Math.abs(startIndex - currentIndexRef.current);
      if (diff < 2 && onSyncStateRef.current) {
          onSyncStateRef.current(currentIndexRef.current, currentTimeRef.current, currentPriceRef.current);
      }
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, animate]); // Removed startIndex
};
