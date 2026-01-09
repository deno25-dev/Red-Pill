

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
  const requestRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  
  const replayBufferRef = useRef<OHLCV[]>([]);
  const bufferCursorRef = useRef<number>(0);

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

  // Initialization & Buffer Setup
  useEffect(() => {
    if (!seriesRef.current || !fullData || fullData.length === 0) return;

    // This effect handles the "Slice & Append" setup.
    // It only runs when replay is paused or being set up.
    if (!isPlaying) {
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
        
        // 4. RESET CURSOR: Start replay from the beginning of the buffer.
        bufferCursorRef.current = 0;
        lastFrameTimeRef.current = 0;
    }
  }, [fullData, startIndex, isPlaying, seriesRef]);

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

    if (floorNext > floorPrev) {
        for (let i = floorPrev; i < floorNext; i++) {
            if (i < replayBufferRef.current.length) {
                const candle = replayBufferRef.current[i];
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
    }

    if (floorNext >= replayBufferRef.current.length) {
        if (onComplete) onComplete();
        if (onSyncState && fullData && fullData.length > 0) {
             const lastIdx = fullData.length - 1;
             onSyncState(lastIdx, fullData[lastIdx].time, fullData[lastIdx].close);
        }
        return;
    }

    // Sync state mid-flight
    if (onSyncState && fullData) {
        const globalIndex = startIndex + floorNext + 1;
        if (globalIndex < fullData.length) {
            onSyncState(globalIndex, fullData[globalIndex].time, fullData[globalIndex].close);
        }
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [speed, onComplete, onSyncState, seriesRef, fullData, startIndex]);

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
