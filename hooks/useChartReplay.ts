
import React, { useEffect, useRef, useCallback } from 'react';
import { ISeriesApi, IChartApi, Time, SeriesType, LogicalRange } from 'lightweight-charts';
import { OHLCV, TabVaultData } from '../types';
import { useReport } from './useReport'; 

let renderCount = 0;

interface UseChartReplayProps {
  chartRef: React.MutableRefObject<IChartApi | null>;
  seriesRef: React.MutableRefObject<ISeriesApi<SeriesType> | null>;
  fullData?: OHLCV[];
  startIndex: number;
  isPlaying: boolean;
  speed: number;
  onSyncState?: (index: number, time: number, price: number, metricTimestamp?: number) => void;
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
  const { log, warn, info } = useReport('ReplayEngine'); 
  
  const requestRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  
  const replayBufferRef = useRef<OHLCV[]>([]);
  const bufferCursorRef = useRef<number>(0);
  
  const currentIndexRef = useRef<number>(startIndex);
  const currentPriceRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);
  
  // Mute Firewall Ref: Mirrors the last index the engine produced internally.
  const lastSyncedIndexRef = useRef<number>(startIndex);
  
  const fullDataRef = useRef<OHLCV[] | undefined>(fullData);
  const onSyncStateRef = useRef(onSyncState);
  const onCompleteRef = useRef(onComplete);
  const lastSyncTimeRef = useRef<number>(0);

  useEffect(() => { fullDataRef.current = fullData; }, [fullData]);
  useEffect(() => { onSyncStateRef.current = onSyncState; }, [onSyncState]);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  // Monkey-Patch TimeScale
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
        warn('Global Reset Triggered', { source: 'GLOBAL_ASSET_CHANGE' });
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
  useEffect(() => {
    if (!seriesRef.current || !fullData || fullData.length === 0) return;

    bufferCursorRef.current = 0;
    lastFrameTimeRef.current = 0;
    currentIndexRef.current = startIndex; 
    lastSyncedIndexRef.current = startIndex; 

    const bufferStart = startIndex + 1;
    if (bufferStart < fullData.length) {
        replayBufferRef.current = fullData.slice(bufferStart);
    } else {
        replayBufferRef.current = [];
    }

    if (fullData[startIndex]) {
        currentTimeRef.current = fullData[startIndex].time;
        currentPriceRef.current = fullData[startIndex].close;
        if (liveTimeRef) liveTimeRef.current = fullData[startIndex].time;
    }

    info('Engine Initialized', { 
        dataLength: fullData.length, 
        startIndex, 
        bufferSize: replayBufferRef.current.length 
    });

  }, [fullData]); 

  // --- LOGIC 2: SEEKING (RECUT) & PROP LOCK ---
  useEffect(() => {
      if (!fullData || fullData.length === 0) return;

      // 1. PROP LOCK: Strictly ignore all prop changes while engine is running.
      if (isPlaying) {
          return;
      }

      // 2. Exact Match Firewall
      if (startIndex === lastSyncedIndexRef.current) {
          return; 
      }

      // 3. Proximity Firewall (Anti-Loopback) - Increased Tolerance to 30 (Mandate 0.40.2)
      const diff = Math.abs(startIndex - lastSyncedIndexRef.current);
      if (diff < 30) { 
          return; 
      }
      
      // If we get here, it's a legitimate Manual Seek (or a large jump) while PAUSED
      warn('Manual Seek Confirmed (Paused)', { 
          from: lastSyncedIndexRef.current, 
          to: startIndex,
          isPlaying
      });
      
      lastSyncedIndexRef.current = startIndex; 

      currentIndexRef.current = startIndex;
      bufferCursorRef.current = 0;
      lastFrameTimeRef.current = 0;

      const bufferStart = startIndex + 1;
      if (bufferStart < fullData.length) {
          replayBufferRef.current = fullData.slice(bufferStart);
      } else {
          replayBufferRef.current = [];
      }

      if (fullData[startIndex]) {
          currentTimeRef.current = fullData[startIndex].time;
          currentPriceRef.current = fullData[startIndex].close;
          if (liveTimeRef) liveTimeRef.current = fullData[startIndex].time;
      }
  }, [startIndex, fullData, isPlaying]); 

  // --- LOGIC 3: ANIMATION LOOP ---
  const animate = useCallback((time: number) => {
    const currentSeries = seriesRef.current;
    const currentChart = chartRef.current;
    
    if (!currentSeries || !currentChart || replayBufferRef.current.length === 0) return;
    
    if (lastFrameTimeRef.current === 0) {
      lastFrameTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
      return;
    }

    const deltaSeconds = (time - lastFrameTimeRef.current) / 1000;
    
    if (isNaN(deltaSeconds) || !isFinite(deltaSeconds) || deltaSeconds > 1.0) {
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

    if (floorNext > floorPrev) {
        const timeScale = currentChart.timeScale();
        const lockedRange = timeScale.getVisibleLogicalRange();

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
                    } catch (e) {}
                    
                    currentIndexRef.current = currentIndexRef.current + 1;
                    currentTimeRef.current = candle.time;
                    currentPriceRef.current = candle.close;
                    if (liveTimeRef) liveTimeRef.current = candle.time;
                }
            }
        }
        
        // ENGINE UPDATE: Flag this index as engine-driven IMMEDIATELY
        lastSyncedIndexRef.current = currentIndexRef.current;

        if (lockedRange) {
            timeScale.setVisibleLogicalRange(lockedRange);
        }
    }

    if (floorNext < replayBufferRef.current.length) {
        const targetCandle = replayBufferRef.current[floorNext];
        if (targetCandle) {
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

    if (floorNext >= replayBufferRef.current.length) {
        info('Playback Complete', { totalCandles: replayBufferRef.current.length });
        if (onCompleteRef.current) onCompleteRef.current();
        if (onSyncStateRef.current) {
             const lastIdx = (fullDataRef.current?.length || 0) - 1;
             if (lastIdx >= 0) {
                 const finalC = fullDataRef.current![lastIdx];
                 lastSyncedIndexRef.current = lastIdx;
                 onSyncStateRef.current(lastIdx, finalC.time, finalC.close);
             }
        }
        return; 
    }

    const now = performance.now();
    // Throttle parent state updates
    if (now - lastSyncTimeRef.current > 100 && onSyncStateRef.current) {
        onSyncStateRef.current(currentIndexRef.current, currentTimeRef.current, currentPriceRef.current, now);
        lastSyncTimeRef.current = now;
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [speed, seriesRef, chartRef]); 

  // --- PLAY/PAUSE CONTROLLER ---
  useEffect(() => {
    if (isPlaying) {
      log('Playback Started', { speed });
      lastFrameTimeRef.current = 0;
      requestRef.current = requestAnimationFrame(animate);
    } else {
      log('Playback Paused', { atIndex: currentIndexRef.current });
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      
      const diff = Math.abs(startIndex - currentIndexRef.current);
      // Increased Tolerance to 30 for Manual Seek logic match
      if (diff < 30 && onSyncStateRef.current) {
          lastSyncedIndexRef.current = currentIndexRef.current;
          onSyncStateRef.current(currentIndexRef.current, currentTimeRef.current, currentPriceRef.current);
      }
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, animate]);
};
