
import React, { useEffect, useRef, useCallback } from 'react';
import { ISeriesApi, Time, SeriesType } from 'lightweight-charts';
import { OHLCV } from '../types';

interface UseChartReplayProps {
  seriesRef: React.MutableRefObject<ISeriesApi<SeriesType> | null>;
  fullData?: OHLCV[];
  startIndex: number;
  isPlaying: boolean;
  speed: number;
  onSyncState?: (index: number, time: number, price: number) => void;
  onComplete?: () => void;
  liveTimeRef?: React.MutableRefObject<number | null>; // New Prop for live tracking
}

export const useChartReplay = ({
  seriesRef,
  fullData,
  startIndex,
  isPlaying,
  speed,
  onSyncState,
  onComplete,
  liveTimeRef
}: UseChartReplayProps) => {
  const requestRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  
  const replayBufferRef = useRef<OHLCV[]>([]);
  const bufferCursorRef = useRef<number>(0);
  
  // Track current state in refs to sync on pause (State Deferral)
  const currentIndexRef = useRef<number>(startIndex);
  const currentPriceRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);
  
  // State Tracking for Pause Logic
  const prevStartIndexRef = useRef<number | null>(null);
  const prevDataRef = useRef<OHLCV[] | null>(null);

  // Performance Caching: Avoid dependency on props during animation loop
  const fullDataRef = useRef<OHLCV[] | undefined>(fullData);
  const onSyncStateRef = useRef(onSyncState);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => { fullDataRef.current = fullData; }, [fullData]);
  useEffect(() => { onSyncStateRef.current = onSyncState; }, [onSyncState]);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  // NUCLEAR RESET LISTENER
  useEffect(() => {
    const handleGlobalReset = () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
        replayBufferRef.current = [];
        bufferCursorRef.current = 0;
        lastFrameTimeRef.current = 0;
        prevStartIndexRef.current = null;
    };
    window.addEventListener('GLOBAL_ASSET_CHANGE', handleGlobalReset);
    return () => window.removeEventListener('GLOBAL_ASSET_CHANGE', handleGlobalReset);
  }, []);

  // Initialization & Buffer Setup
  useEffect(() => {
    if (!seriesRef.current || !fullData || fullData.length === 0) return;

    // Detect changes
    const dataChanged = prevDataRef.current !== fullData;
    const indexChanged = prevStartIndexRef.current !== startIndex;

    // MANDATE 16 & 23 FIX: 
    // If data changes (e.g. timeframe switch), we MUST re-initialize the buffer immediately,
    // even if playing. If only index changes (user seek), we only re-init if paused.
    const shouldInit = dataChanged || (!isPlaying && indexChanged) || (isPlaying && indexChanged && dataChanged);

    if (shouldInit) {
        // Update trackers
        prevStartIndexRef.current = startIndex;
        prevDataRef.current = fullData;

        // 1. SLICE & BUFFER: Prepare the replay buffer with all future candles.
        // NOTE: We do NOT call setData() here. The parent Chart component handles the initial rendering 
        // of the historical slice via its own props to ensure view range stability (Mandate 0.26).
        
        const bufferStart = startIndex + 1;
        if (bufferStart < fullData.length) {
            replayBufferRef.current = fullData.slice(bufferStart);
        } else {
            replayBufferRef.current = [];
        }
        
        // 2. RESET CURSOR
        bufferCursorRef.current = 0;
        lastFrameTimeRef.current = 0;
        currentIndexRef.current = startIndex;
        
        // Init refs for sync
        if (fullData[startIndex]) {
            currentTimeRef.current = fullData[startIndex].time;
            currentPriceRef.current = fullData[startIndex].close;
            // Sync live time immediately on init so it's available even if paused
            if (liveTimeRef) liveTimeRef.current = fullData[startIndex].time;
        }
    } else if (isPlaying) {
        // If playing without data change (just continuing), keep trackers synced
        prevStartIndexRef.current = startIndex;
        prevDataRef.current = fullData;
    }
  }, [fullData, startIndex, isPlaying, seriesRef, liveTimeRef]); 

  // --- PERFORMANCE OVERRIDE: Buffered Sync ---
  // Decouples the React state update (which causes re-renders) from the 60fps animation loop.
  // Updates the global UI (slider, timestamps) only once every 100ms.
  useEffect(() => {
      if (!isPlaying) return;

      const syncInterval = setInterval(() => {
          if (onSyncStateRef.current) {
              onSyncStateRef.current(
                  currentIndexRef.current,
                  currentTimeRef.current,
                  currentPriceRef.current
              );
          }
      }, 100);

      return () => clearInterval(syncInterval);
  }, [isPlaying]);

  // Sync on Pause/Stop - Immediate
  useEffect(() => {
      if (!isPlaying && onSyncState && currentIndexRef.current !== startIndex) {
          // Sync state back to React ONLY when playback stops
          onSyncState(currentIndexRef.current, currentTimeRef.current, currentPriceRef.current);
      }
  }, [isPlaying, onSyncState, startIndex]);

  const animate = useCallback((time: number) => {
    // USE REFS INSIDE LOOP (Performance Critical)
    const currentSeries = seriesRef.current;
    if (!currentSeries || replayBufferRef.current.length === 0) return;
    
    // MANDATE: NaN Firewall Level 1 (Time pollution)
    if (typeof time !== 'number' || isNaN(time)) {
        requestRef.current = requestAnimationFrame(animate);
        return;
    }

    if (lastFrameTimeRef.current === 0) {
      lastFrameTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
      return;
    }

    const deltaSeconds = (time - lastFrameTimeRef.current) / 1000;
    
    // MANDATE: NaN Firewall Level 2 (Delta corruption)
    if (isNaN(deltaSeconds) || !isFinite(deltaSeconds)) {
        lastFrameTimeRef.current = time; // Reset baseline
        requestRef.current = requestAnimationFrame(animate);
        return;
    }

    lastFrameTimeRef.current = time;

    const advanceAmount = deltaSeconds * speed;
    const prevCursor = bufferCursorRef.current;
    const nextCursor = prevCursor + advanceAmount;
    bufferCursorRef.current = nextCursor;

    const floorPrev = Math.floor(prevCursor);
    const floorNext = Math.floor(nextCursor);

    // Apply fully completed candles
    if (floorNext > floorPrev) {
        for (let i = floorPrev; i < floorNext; i++) {
            if (i < replayBufferRef.current.length) {
                const candle = replayBufferRef.current[i];
                
                // MANDATE: NaN Firewall Level 3 (Data integrity)
                // Strict check for numeric properties to prevent stuttering with malformed data objects
                if (!candle || 
                    typeof candle.time !== 'number' || isNaN(candle.time) ||
                    typeof candle.open !== 'number' || isNaN(candle.open) ||
                    typeof candle.high !== 'number' || isNaN(candle.high) ||
                    typeof candle.low !== 'number' || isNaN(candle.low) ||
                    typeof candle.close !== 'number' || isNaN(candle.close)
                ) {
                     console.warn("Replay Panic: Invalid data point detected. Skipping frame.");
                     continue; // Skip valid update
                }

                try {
                    // Direct Manipulation: series.update() without triggering React state
                    currentSeries.update({
                        time: (candle.time / 1000) as Time,
                        open: candle.open,
                        high: candle.high,
                        low: candle.low,
                        close: candle.close
                    } as any);
                } catch (e) {
                    // Suppress update errors during race conditions
                }
                
                // Update refs (read by the buffered sync interval)
                currentIndexRef.current = startIndex + 1 + i;
                currentTimeRef.current = candle.time;
                currentPriceRef.current = candle.close;
                if (liveTimeRef) liveTimeRef.current = candle.time;
            }
        }
    }

    // Interpolate current forming candle (Tick simulation)
    if (floorNext < replayBufferRef.current.length) {
        const targetCandle = replayBufferRef.current[floorNext];
        
        // Strict number check for interpolation target
        if (targetCandle && 
            typeof targetCandle.time === 'number' && !isNaN(targetCandle.time) &&
            typeof targetCandle.open === 'number' && !isNaN(targetCandle.open) &&
            typeof targetCandle.high === 'number' && !isNaN(targetCandle.high) &&
            typeof targetCandle.low === 'number' && !isNaN(targetCandle.low) &&
            typeof targetCandle.close === 'number' && !isNaN(targetCandle.close)
        ) {
            const progress = nextCursor - floorNext;
            
            let simulatedPrice = targetCandle.open;
            let simulatedHigh = targetCandle.open;
            let simulatedLow = targetCandle.open;

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

            // MANDATE: NaN Firewall Level 4 (Value integrity)
            if (isNaN(simulatedPrice) || !isFinite(simulatedPrice)) {
                 // Do nothing, skip frame
            } else {
                try {
                    currentSeries.update({
                        time: (targetCandle.time / 1000) as Time,
                        open: targetCandle.open,
                        high: simulatedHigh,
                        low: simulatedLow,
                        close: simulatedPrice
                    } as any);
                    
                    // Update refs for interpolation
                    currentPriceRef.current = simulatedPrice;
                    if (liveTimeRef) liveTimeRef.current = targetCandle.time;
                } catch (e) {
                    // Suppress updates if timestamp conflict
                }
            }
        }
    }

    if (floorNext >= replayBufferRef.current.length) {
        if (onCompleteRef.current) onCompleteRef.current();
        // Final sync allowed on complete using cached ref
        const allData = fullDataRef.current;
        if (onSyncStateRef.current && allData && allData.length > 0) {
             const lastIdx = allData.length - 1;
             onSyncStateRef.current(lastIdx, allData[lastIdx].time, allData[lastIdx].close);
        }
        return;
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [speed, startIndex, liveTimeRef, seriesRef]);

  // Start/Stop Loop
  useEffect(() => {
    if (isPlaying) {
      lastFrameTimeRef.current = 0;
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, animate]);
};
