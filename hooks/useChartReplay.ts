
import React, { useEffect, useRef, useCallback } from 'react';
import { ISeriesApi, IChartApi, Time, SeriesType, LogicalRange } from 'lightweight-charts';
import { OHLCV } from '../types';

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

  // Performance Caching
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
    // Allow seeking (recutting) if index deviation is significant (>2 frames approx)
    const isSeek = Math.abs(startIndex - currentIndexRef.current) > 2;
    
    // MANDATE: Re-init if data changes OR paused-seek OR active-seek
    const shouldInit = dataChanged || (!isPlaying && startIndex !== prevStartIndexRef.current) || (isPlaying && isSeek);

    if (shouldInit) {
        prevStartIndexRef.current = startIndex;
        prevDataRef.current = fullData;

        // 1. SLICE & BUFFER
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
        
        if (fullData[startIndex]) {
            currentTimeRef.current = fullData[startIndex].time;
            currentPriceRef.current = fullData[startIndex].close;
            if (liveTimeRef) liveTimeRef.current = fullData[startIndex].time;
        }
    } else if (isPlaying) {
        prevStartIndexRef.current = startIndex;
        prevDataRef.current = fullData;
    }
  }, [fullData, startIndex, isPlaying, seriesRef, liveTimeRef]); 

  // --- PERFORMANCE OVERRIDE: Buffered Sync ---
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
      }, 100); // Throttled UI Sync (10fps)

      return () => clearInterval(syncInterval);
  }, [isPlaying]);

  // Sync on Pause/Stop - Immediate
  useEffect(() => {
      if (!isPlaying && onSyncState && currentIndexRef.current !== startIndex) {
          onSyncState(currentIndexRef.current, currentTimeRef.current, currentPriceRef.current);
      }
  }, [isPlaying, onSyncState, startIndex]);

  const animate = useCallback((time: number) => {
    const currentSeries = seriesRef.current;
    const currentChart = chartRef.current;
    
    // Type-Safe Buffer Guard
    if (!currentSeries || !currentChart || replayBufferRef.current.length === 0) return;
    
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
    
    if (isNaN(deltaSeconds) || !isFinite(deltaSeconds)) {
        lastFrameTimeRef.current = time;
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
        // --- LOGICAL RANGE FREEZE START ---
        // Capture range to prevent engine from auto-scrolling on update
        const timeScale = currentChart.timeScale();
        const lockedRange = timeScale.getVisibleLogicalRange();

        for (let i = floorPrev; i < floorNext; i++) {
            if (i < replayBufferRef.current.length) {
                const candle = replayBufferRef.current[i];
                
                // STRICT TYPE SAFETY CHECK
                if (!candle || 
                    typeof candle.time !== 'number' || isNaN(candle.time) ||
                    typeof candle.open !== 'number' || isNaN(candle.open) ||
                    typeof candle.close !== 'number' || isNaN(candle.close)
                ) {
                     continue; // Skip invalid frame
                }

                try {
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
                
                currentIndexRef.current = startIndex + 1 + i;
                currentTimeRef.current = candle.time;
                currentPriceRef.current = candle.close;
                if (liveTimeRef) liveTimeRef.current = candle.time;
            }
        }

        // --- LOGICAL RANGE FREEZE RESTORE ---
        if (lockedRange) {
            timeScale.setVisibleLogicalRange(lockedRange);
        }
    }

    // Interpolate current forming candle (Tick simulation)
    if (floorNext < replayBufferRef.current.length) {
        const targetCandle = replayBufferRef.current[floorNext];
        
        // Strict number check for interpolation target
        if (targetCandle && 
            typeof targetCandle.time === 'number' && !isNaN(targetCandle.time) &&
            typeof targetCandle.close === 'number' && !isNaN(targetCandle.close)
        ) {
            const progress = nextCursor - floorNext;
            
            let simulatedPrice = targetCandle.open;
            let simulatedHigh = targetCandle.open;
            let simulatedLow = targetCandle.open;

            // Simple tick simulation logic
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

            if (!isNaN(simulatedPrice) && isFinite(simulatedPrice)) {
                try {
                    // Lock Range for Tick Update
                    const timeScale = currentChart.timeScale();
                    const lockedRange = timeScale.getVisibleLogicalRange();

                    currentSeries.update({
                        time: (targetCandle.time / 1000) as Time,
                        open: targetCandle.open,
                        high: simulatedHigh,
                        low: simulatedLow,
                        close: simulatedPrice
                    } as any);
                    
                    // Restore Range
                    if (lockedRange) {
                        timeScale.setVisibleLogicalRange(lockedRange);
                    }

                    currentPriceRef.current = simulatedPrice;
                    if (liveTimeRef) liveTimeRef.current = targetCandle.time;
                } catch (e) {}
            }
        }
    }

    if (floorNext >= replayBufferRef.current.length) {
        if (onCompleteRef.current) onCompleteRef.current();
        // Sync final state
        const allData = fullDataRef.current;
        if (onSyncStateRef.current && allData && allData.length > 0) {
             const lastIdx = allData.length - 1;
             onSyncStateRef.current(lastIdx, allData[lastIdx].time, allData[lastIdx].close);
        }
        return;
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [speed, startIndex, liveTimeRef, seriesRef, chartRef]);

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
