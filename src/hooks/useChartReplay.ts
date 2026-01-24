
import React, { useEffect, useRef, useCallback } from 'react';
import { ISeriesApi, Time, SeriesType } from 'lightweight-charts';
import { OHLCV } from '@/types';

interface UseChartReplayProps {
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
  const currentIndexRef = useRef<number>(startIndex);

  // Buffer Logic
  useEffect(() => {
    if (!seriesRef.current || !fullData || fullData.length === 0) return;
    const initialSlice = fullData.slice(0, startIndex + 1);
    const seriesData = initialSlice.map(d => ({
        time: (d.time / 1000) as Time,
        open: d.open, high: d.high, low: d.low, close: d.close,
    }));
    seriesRef.current.setData(seriesData as any);
    
    const bufferStart = startIndex + 1;
    if (bufferStart < fullData.length) {
        replayBufferRef.current = fullData.slice(bufferStart);
    } else {
        replayBufferRef.current = [];
    }
    bufferCursorRef.current = 0;
    lastFrameTimeRef.current = 0;
    currentIndexRef.current = startIndex;
  }, [fullData, startIndex, seriesRef]); 

  // Animation Loop
  const animate = useCallback((time: number) => {
    const currentSeries = seriesRef.current;
    if (!currentSeries || replayBufferRef.current.length === 0) return;
    
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
                currentSeries.update({
                    time: (candle.time / 1000) as Time,
                    open: candle.open, high: candle.high, low: candle.low, close: candle.close
                } as any);
                currentIndexRef.current = startIndex + 1 + i;
            }
        }
    }

    if (floorNext >= replayBufferRef.current.length) {
        if (onComplete) onComplete();
        return;
    }
    requestRef.current = requestAnimationFrame(animate);
  }, [speed, startIndex, seriesRef, onComplete]);

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
