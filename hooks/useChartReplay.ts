
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
}

export const useChartReplay = ({
  seriesRef,
  fullData,
  startIndex,
  isPlaying,
  speed,
  onSyncState,
  onComplete
}: UseChartReplayProps) => {
  const requestRef = useRef<number>();
  const lastFrameTimeRef = useRef<number>(0);
  
  // Replay Buffer: Stores candles *after* the cut point
  // This ensures we have a dedicated source for the replay stream
  const replayBufferRef = useRef<OHLCV[]>([]);
  
  // Cursor tracking position *within the buffer* (0.0 to buffer.length)
  // 0.0 means we are at the very start of buffer[0]
  const bufferCursorRef = useRef<number>(0);

  // Initialization & Buffer Setup
  // We strictly re-initialize the buffer only when NOT playing (e.g. init, pause, or scrub)
  useEffect(() => {
    if (!isPlaying && fullData && fullData.length > 0) {
        // Cut point is `startIndex`. The Chart displays 0..startIndex via standard render.
        // Buffer is everything AFTER it (startIndex + 1 ... end).
        const bufferStart = startIndex + 1;
        
        if (bufferStart < fullData.length) {
            replayBufferRef.current = fullData.slice(bufferStart);
        } else {
            replayBufferRef.current = [];
        }
        
        // Reset cursor to start of buffer
        bufferCursorRef.current = 0;
        lastFrameTimeRef.current = 0;
    }
  }, [fullData, startIndex, isPlaying]);

  const animate = useCallback((time: number) => {
    // Safety checks
    if (!seriesRef.current || replayBufferRef.current.length === 0) return;
    
    if (lastFrameTimeRef.current === 0) {
      lastFrameTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
      return;
    }

    const deltaSeconds = (time - lastFrameTimeRef.current) / 1000;
    lastFrameTimeRef.current = time;

    // Advance cursor
    const advanceAmount = deltaSeconds * speed;
    const prevCursor = bufferCursorRef.current;
    const nextCursor = prevCursor + advanceAmount;
    bufferCursorRef.current = nextCursor;

    const floorPrev = Math.floor(prevCursor);
    const floorNext = Math.floor(nextCursor);

    // 1. Commit fully completed candles from buffer
    // Example: Moving from 0.5 to 1.5 means we completed candle at index 0
    if (floorNext > floorPrev) {
        for (let i = floorPrev; i < floorNext; i++) {
            if (i < replayBufferRef.current.length) {
                const candle = replayBufferRef.current[i];
                // Use .update() to append strictly
                seriesRef.current.update({
                    time: (candle.time / 1000) as Time,
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close
                });
            }
        }
    }

    // 2. Update/Interpolate the *current* partial candle (at floorNext)
    if (floorNext < replayBufferRef.current.length) {
        const targetCandle = replayBufferRef.current[floorNext];
        const progress = nextCursor - floorNext; // Normalized 0.0 to 1.0 progress within current candle
        
        // Micro-tick Simulation Logic
        let simulatedPrice = targetCandle.open;
        let simulatedHigh = targetCandle.open;
        let simulatedLow = targetCandle.open;

        // 3-Phase Simulation for realism
        if (progress < 0.33) {
            // Phase 1: Open -> High
            const p = progress / 0.33;
            simulatedPrice = targetCandle.open + (targetCandle.high - targetCandle.open) * p;
            simulatedHigh = Math.max(targetCandle.open, simulatedPrice);
            simulatedLow = Math.min(targetCandle.open, simulatedPrice);
        } else if (progress < 0.66) {
            // Phase 2: High -> Low
            const p = (progress - 0.33) / 0.33;
            simulatedPrice = targetCandle.high - (targetCandle.high - targetCandle.low) * p;
            simulatedHigh = targetCandle.high;
            simulatedLow = Math.min(targetCandle.low, simulatedPrice);
        } else {
            // Phase 3: Low -> Close
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
    }

    // 3. Completion Check
    if (floorNext >= replayBufferRef.current.length) {
        if (onComplete) onComplete();
        // Sync final state to ensure we land exactly on the last candle
        if (onSyncState && fullData && fullData.length > 0) {
             const lastIdx = fullData.length - 1;
             onSyncState(lastIdx, fullData[lastIdx].time, fullData[lastIdx].close);
        }
        return; // Stop animation loop
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [speed, onComplete, onSyncState, seriesRef, fullData]);

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

  // Sync state when PAUSING
  // We calculate the global index based on where the buffer cursor stopped
  useEffect(() => {
      if (!isPlaying && fullData && fullData.length > 0 && onSyncState) {
          // If we moved the cursor, we need to update the parent state to reflect the new position
          if (replayBufferRef.current.length > 0 && bufferCursorRef.current > 0) {
             // Calculate how many candles we fully or partially traversed
             // Logic: If we are at 0.5, we snap to the end of candle 0 (Global: startIndex + 1)
             // This ensures when we resume, we start fresh from the NEXT candle.
             const advance = Math.floor(bufferCursorRef.current) + 1;
             // Correction: if we are exactly at 1.0, floor is 1. We advanced 1. 
             // If we are at 0.1, floor is 0. We advance 1 (snap forward).
             
             const newGlobalIndex = Math.min(startIndex + advance, fullData.length - 1);
             
             if (newGlobalIndex > startIndex) {
                 const candle = fullData[newGlobalIndex];
                 onSyncState(newGlobalIndex, candle.time, candle.close);
             }
          }
      }
  }, [isPlaying, fullData, onSyncState, startIndex]);
};
