
import React, { useEffect, useRef, useCallback } from 'react';
import { ISeriesApi, Time } from 'lightweight-charts';
import { OHLCV } from '../types';

interface UseAdvancedReplayProps {
  seriesRef: React.MutableRefObject<ISeriesApi<"Candlestick"> | null>;
  fullData?: OHLCV[];
  startIndex: number;
  isPlaying: boolean;
  speed: number;
  onSyncState?: (index: number, time: number, price: number) => void;
  onComplete?: () => void;
  isActive: boolean; // Flag to enable/disable this specific hook
}

export const useAdvancedReplay = ({
  seriesRef,
  fullData,
  startIndex,
  isPlaying,
  speed,
  onSyncState,
  onComplete,
  isActive
}: UseAdvancedReplayProps) => {
  const requestRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const virtualNowRef = useRef<number>(0);
  
  // State Deferral Refs
  const currentIndexRef = useRef<number>(startIndex);
  const currentPriceRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);

  // NUCLEAR RESET LISTENER
  useEffect(() => {
    const handleGlobalReset = () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
        virtualNowRef.current = 0;
        lastFrameTimeRef.current = 0;
        currentIndexRef.current = 0;
    };
    window.addEventListener('GLOBAL_ASSET_CHANGE', handleGlobalReset);
    return () => window.removeEventListener('GLOBAL_ASSET_CHANGE', handleGlobalReset);
  }, []);

  // Initialization & "Slice & Set" Logic
  useEffect(() => {
    if (!seriesRef.current || !fullData || fullData.length === 0) return;

    if (isActive) {
      // 1. SLICE
      const initialSlice = fullData.slice(0, startIndex + 1);
      const seriesData = initialSlice.map(d => ({
          time: (d.time / 1000) as Time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
      }));
      
      // 2. SET
      seriesRef.current.setData(seriesData);
      
      // 3. RESET
      currentIndexRef.current = startIndex;
      virtualNowRef.current = 0;
      lastFrameTimeRef.current = 0;
      
      // Init Sync Refs
      if (fullData[startIndex]) {
          currentTimeRef.current = fullData[startIndex].time;
          currentPriceRef.current = fullData[startIndex].close;
      }
    } else {
        // Restore full data
        const fullSeriesData = fullData.map(d => ({
            time: (d.time / 1000) as Time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
        }));
        seriesRef.current.setData(fullSeriesData);
    }
  }, [isActive, startIndex, fullData, seriesRef]);

  // Sync on Pause/Stop - MANDATE 15.2
  useEffect(() => {
      if (!isPlaying && isActive && onSyncState && currentIndexRef.current !== startIndex) {
          onSyncState(currentIndexRef.current, currentTimeRef.current, currentPriceRef.current);
      }
  }, [isPlaying, isActive, onSyncState, startIndex]);

  const animate = useCallback((time: number) => {
    if (!isActive || !seriesRef.current || !fullData || fullData.length === 0) return;

    if (lastFrameTimeRef.current === 0) {
      lastFrameTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
      return;
    }

    const deltaTime = time - lastFrameTimeRef.current;
    lastFrameTimeRef.current = time;
    const effectiveDelta = deltaTime * speed;
    virtualNowRef.current += effectiveDelta;

    const currentIdx = currentIndexRef.current;
    
    if (currentIdx >= fullData.length) {
        if (onComplete) onComplete();
        return;
    }

    const targetCandle = fullData[currentIdx];
    let duration = 60000;

    if (currentIdx > 0) {
        const prevTime = fullData[currentIdx - 1].time;
        duration = targetCandle.time - prevTime;
    }
    
    if (duration <= 0) duration = 60000;
    
    // Check if current virtual candle is complete
    if (virtualNowRef.current >= duration) {
        seriesRef.current.update({
            time: (targetCandle.time / 1000) as Time,
            open: targetCandle.open,
            high: targetCandle.high,
            low: targetCandle.low,
            close: targetCandle.close
        });
        
        const nextIndex = currentIdx + 1;
        currentIndexRef.current = nextIndex;
        virtualNowRef.current = virtualNowRef.current - duration;
        
        // Store for deferred sync
        currentTimeRef.current = targetCandle.time;
        currentPriceRef.current = targetCandle.close;

    } else {
        // Interpolate within the candle
        const progress = virtualNowRef.current / duration;
        
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

        // Store for deferred sync
        currentTimeRef.current = targetCandle.time;
        currentPriceRef.current = simulatedPrice;
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [isActive, fullData, speed, onSyncState, onComplete, seriesRef]);

  // Start/Stop Loop
  useEffect(() => {
    if (isActive && isPlaying) {
      lastFrameTimeRef.current = 0;
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isActive, isPlaying, animate]);
};
