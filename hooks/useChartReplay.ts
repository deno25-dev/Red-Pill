
import React, { useEffect, useRef, useCallback } from 'react';
import { ISeriesApi, Time } from 'lightweight-charts';
import { OHLCV } from '../types';

interface UseChartReplayProps {
  seriesRef: React.MutableRefObject<ISeriesApi<"Candlestick"> | null>;
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

        // 1. SLICE: Get the historical data up to the start point.
        const initialSlice = fullData.slice(0, startIndex + 1);
        const seriesData = initialSlice.map(d => ({
            time: (d.time / 1000) as Time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
        }));
        
        // 2. SET: Apply the historical slice to the chart. This is our baseline.
        seriesRef.current.setData(seriesData);
        
        // 3. BUFFER: Prepare the replay buffer with all future candles.
        const bufferStart = startIndex + 1;
        if (bufferStart < fullData.length) {
            replayBufferRef.current = fullData.slice(bufferStart);
        } else {
            replayBufferRef.current = [];
        }
        
        // 4. RESET CURSOR
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

  // Sync on Pause/Stop - MANDATE 15.2 State Deferral
  useEffect(() => {
      if (!isPlaying && onSyncState && currentIndexRef.current !== startIndex) {
          // Sync state back to React ONLY when playback stops
          onSyncState(currentIndexRef.current, currentTimeRef.current, currentPriceRef.current);
      }
  }, [isPlaying, onSyncState, startIndex]);

  const animate = useCallback((time: number) => {
    if (!seriesRef.current || replayBufferRef.current.length === 0) return;
    
    if (lastFrameTimeRef.current === 0) {
      lastFrameTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
      return;
    }

    const deltaSeconds = (time - lastFrameTimeRef.current) / 1000;
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
                // Direct Manipulation: series.update() without triggering React state
                seriesRef.current.update({
                    time: (candle.time / 1000) as Time,
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close
                });
                
                // Update refs
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

        seriesRef.current.update({
            time: (targetCandle.time / 1000) as Time,
            open: targetCandle.open,
            high: simulatedHigh,
            low: simulatedLow,
            close: simulatedPrice
        });
        
        // Update refs for interpolation
        currentPriceRef.current = simulatedPrice;
        if (liveTimeRef) liveTimeRef.current = targetCandle.time;
    }

    if (floorNext >= replayBufferRef.current.length) {
        if (onComplete) onComplete();
        // Final sync allowed on complete
        if (onSyncState && fullData && fullData.length > 0) {
             const lastIdx = fullData.length - 1;
             onSyncState(lastIdx, fullData[lastIdx].time, fullData[lastIdx].close);
        }
        return;
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [speed, onComplete, onSyncState, seriesRef, fullData, startIndex, liveTimeRef]);

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
