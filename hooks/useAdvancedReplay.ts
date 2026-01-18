
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { ISeriesApi, Time } from 'lightweight-charts';
import { OHLCV, Timeframe } from '../types';
import { getTimeframeDuration } from '../utils/dataUtils';

interface UseAdvancedReplayProps {
  seriesRef: React.MutableRefObject<ISeriesApi<"Candlestick"> | null>;
  fullData?: OHLCV[];
  startIndex: number;
  isPlaying: boolean;
  speed: number;
  onSyncState?: (index: number, time: number, price: number) => void;
  onComplete?: () => void;
  isActive: boolean; 
  liveTimeRef?: React.MutableRefObject<number | null>; 
  timeframe: Timeframe;
  chartType?: string; 
}

export const useAdvancedReplay = ({
  seriesRef,
  fullData,
  startIndex,
  isPlaying,
  speed,
  onSyncState,
  onComplete,
  isActive,
  liveTimeRef,
  timeframe,
  chartType
}: UseAdvancedReplayProps) => {
  const requestRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const virtualNowRef = useRef<number>(0);
  
  // State Deferral Refs
  const currentIndexRef = useRef<number>(startIndex);
  const currentPriceRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);
  
  // Virtual Overlay State (Reactive)
  const [displayState, setDisplayState] = useState({ price: 0, label: '', visible: false });

  // NUCLEAR RESET LISTENER
  useEffect(() => {
    const handleGlobalReset = () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
        virtualNowRef.current = 0;
        lastFrameTimeRef.current = 0;
        currentIndexRef.current = 0;
        setDisplayState({ price: 0, label: '', visible: false });
    };
    window.addEventListener('GLOBAL_ASSET_CHANGE', handleGlobalReset);
    return () => window.removeEventListener('GLOBAL_ASSET_CHANGE', handleGlobalReset);
  }, [seriesRef]);

  // --- 1. Accurate Timer Formatter (HH:MM:SS / MM:SS) ---
  const formatTimer = useCallback((elapsedMs: number, totalDurationMs: number) => {
      // Calculate strict remaining time
      const remainingMs = Math.max(0, totalDurationMs - elapsedMs);
      const totalSeconds = Math.ceil(remainingMs / 1000);
      
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;

      // Conditional formatting based on duration
      if (h > 0) {
          return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      }
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, []);

  // --- Animation Loop ---
  const animate = useCallback((time: number) => {
    if (!isActive || !seriesRef.current || !fullData || fullData.length === 0) return;

    if (lastFrameTimeRef.current === 0) {
      lastFrameTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
      return;
    }

    const deltaTime = time - lastFrameTimeRef.current;
    lastFrameTimeRef.current = time;
    
    virtualNowRef.current += deltaTime;

    const currentIdx = currentIndexRef.current;
    
    if (currentIdx >= fullData.length) {
        if (onComplete) onComplete();
        setDisplayState(prev => ({ ...prev, visible: false }));
        return;
    }

    const targetCandle = fullData[currentIdx];
    let duration = 60000;

    if (currentIdx > 0) {
        const prevTime = fullData[currentIdx - 1].time;
        duration = targetCandle.time - prevTime;
    }
    
    if (duration <= 0) duration = getTimeframeDuration(timeframe);
    
    // Check if candle complete
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
        
        currentTimeRef.current = targetCandle.time;
        currentPriceRef.current = targetCandle.close;
        if (liveTimeRef) liveTimeRef.current = targetCandle.time;
        
        // Update Overlay State (Reset timer for next candle)
        // Note: We use the next candle's probable duration or current duration as baseline for the label
        setDisplayState({
            price: targetCandle.close,
            label: formatTimer(virtualNowRef.current, getTimeframeDuration(timeframe)),
            visible: true
        });

    } else {
        // Interpolate
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

        currentTimeRef.current = targetCandle.time;
        currentPriceRef.current = simulatedPrice;
        if (liveTimeRef) liveTimeRef.current = targetCandle.time;
        
        // Update Overlay State
        setDisplayState({
            price: simulatedPrice,
            label: formatTimer(virtualNowRef.current, duration),
            visible: true
        });
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [isActive, fullData, onSyncState, onComplete, seriesRef, liveTimeRef, timeframe, formatTimer]);

  // --- Initialization / Slice Logic ---
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
          if (liveTimeRef) liveTimeRef.current = fullData[startIndex].time;
          
          // Initial Overlay State
          setDisplayState({
              price: fullData[startIndex].close,
              label: formatTimer(0, getTimeframeDuration(timeframe)),
              visible: true
          });
      }
      
    } else {
        // RESTORE FULL DATA
        const fullSeriesData = fullData.map(d => ({
            time: (d.time / 1000) as Time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
        }));
        seriesRef.current.setData(fullSeriesData);
        setDisplayState(prev => ({ ...prev, visible: false }));
    }
  }, [isActive, startIndex, fullData, seriesRef, timeframe, chartType, formatTimer]);

  // --- Sync on Pause/Stop ---
  useEffect(() => {
      if (!isPlaying && isActive && onSyncState && currentIndexRef.current !== startIndex) {
          onSyncState(currentIndexRef.current, currentTimeRef.current, currentPriceRef.current);
          
          // Update label on pause
          setDisplayState({
              price: currentPriceRef.current,
              label: formatTimer(virtualNowRef.current, getTimeframeDuration(timeframe)),
              visible: true
          });
      }
  }, [isPlaying, isActive, onSyncState, startIndex, formatTimer, timeframe]);

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

  return { displayState };
};
