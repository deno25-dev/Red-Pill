
import React, { useEffect, useRef, useCallback } from 'react';
import { ISeriesApi, Time } from 'lightweight-charts';
import { OHLCV } from '../types';
import { getTimeframeDuration } from '../utils/dataUtils';

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
  const requestRef = useRef<number>();
  const lastFrameTimeRef = useRef<number>(0);
  
  // The global index in the fullData array we are currently simulating
  const currentIndexRef = useRef<number>(startIndex);
  
  // The virtual time accumulator (ms) for the CURRENT candle being formed
  const virtualNowRef = useRef<number>(0);

  // Reset internal refs when startIndex changes significantly (user scrub)
  useEffect(() => {
    if (isActive) {
      currentIndexRef.current = startIndex;
      virtualNowRef.current = 0;
      lastFrameTimeRef.current = 0;
    }
  }, [startIndex, isActive]);

  const animate = useCallback((time: number) => {
    if (!isActive || !seriesRef.current || !fullData || fullData.length === 0) return;

    // Initialize previous frame time
    if (lastFrameTimeRef.current === 0) {
      lastFrameTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
      return;
    }

    // 1. Calculate Delta Time (Actual ms passed)
    const deltaTime = time - lastFrameTimeRef.current;
    lastFrameTimeRef.current = time;

    // 2. Increment Virtual Timeline based on speed
    // If speed is 1, we add exactly deltaTime. If speed is 10, we add 10x deltaTime.
    const effectiveDelta = deltaTime * speed;
    virtualNowRef.current += effectiveDelta;

    const currentIdx = currentIndexRef.current;
    
    // Boundary Check
    if (currentIdx >= fullData.length) {
        if (onComplete) onComplete();
        return;
    }

    // 3. Determine Candle Duration
    // If we are at index i, we are simulating the formation of fullData[i].
    // The duration is determined by the difference between fullData[i] and fullData[i-1].
    // If i=0, we fallback to a standard timeframe guess.
    const targetCandle = fullData[currentIdx];
    let duration = 60000; // Default 1m

    if (currentIdx > 0) {
        const prevTime = fullData[currentIdx - 1].time;
        duration = targetCandle.time - prevTime;
    }
    
    // Safety for irregular data gaps: Cap duration to reasonable limits or use 1m if calculation fails
    if (duration <= 0) duration = 60000;

    // 4. Interpolation Logic
    // We treat virtualNowRef.current as the time elapsed since the candle OPENED.
    // If virtualNowRef >= duration, the candle is closed.
    
    if (virtualNowRef.current >= duration) {
        // --- Candle Complete ---
        
        // 1. Commit the final completed candle
        seriesRef.current.update({
            time: (targetCandle.time / 1000) as Time,
            open: targetCandle.open,
            high: targetCandle.high,
            low: targetCandle.low,
            close: targetCandle.close
        });
        
        // 2. Sync State (Index increments)
        const nextIndex = currentIdx + 1;
        currentIndexRef.current = nextIndex;
        
        // 3. Carry over excess time (maintain strict time precision)
        // Instead of resetting to 0, we keep the overflow to apply to the next bar immediately
        virtualNowRef.current = virtualNowRef.current - duration;
        
        // 4. Update UI
        if (onSyncState) {
            onSyncState(nextIndex, targetCandle.time, targetCandle.close);
        }

    } else {
        // --- Candle Forming (Partial Update) ---
        
        const progress = virtualNowRef.current / duration; // 0.0 to 1.0
        
        // 3-Phase Simulation for realism
        let simulatedPrice = targetCandle.open;
        let simulatedHigh = targetCandle.open;
        let simulatedLow = targetCandle.open;

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

        // Apply Update to Chart (Phantom Bar)
        // NOTE: Lightweight charts updates the existing bar if timestamp matches.
        seriesRef.current.update({
            time: (targetCandle.time / 1000) as Time,
            open: targetCandle.open,
            high: simulatedHigh,
            low: simulatedLow,
            close: simulatedPrice
        });

        // Sync Price to UI Header (Real-time price tick)
        if (onSyncState) {
            // We pass the *current* index, but the *simulated* price
            onSyncState(currentIdx, targetCandle.time, simulatedPrice);
        }
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [isActive, fullData, speed, onSyncState, onComplete]);

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
