import { useState, useEffect, useRef } from 'react';
import { OHLCV, Timeframe } from '../types';
import { useReport } from './useReport';

interface UseAdvancedReplayProps {
    seriesRef: any;
    fullData?: OHLCV[];
    startIndex: number;
    isPlaying: boolean;
    speed: number;
    onSyncState?: (index: number, time: number, price: number, metricTimestamp?: number) => void;
    onComplete?: () => void;
    isActive: boolean;
    liveTimeRef?: React.MutableRefObject<number | null>;
    timeframe: Timeframe;
    chartType: string;
}

export const useAdvancedReplay = ({
    seriesRef,
    fullData,
    startIndex,
    isPlaying,
    onSyncState,
    onComplete,
    isActive,
    liveTimeRef
}: UseAdvancedReplayProps) => {
    const { info } = useReport('AdvancedReplay');
    const [displayState, setDisplayState] = useState({ visible: false, label: '', price: 0 });
    
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentIndexRef = useRef(startIndex);
    
    useEffect(() => {
        currentIndexRef.current = startIndex;
    }, [startIndex]);

    useEffect(() => {
        if (!isActive || !isPlaying || !fullData || fullData.length === 0) {
            if (timerRef.current) clearInterval(timerRef.current);
            setDisplayState(prev => ({ ...prev, visible: false }));
            return;
        }

        info('Starting Real-Time Simulation');
        
        // Mock 1-second tick for simulation
        timerRef.current = setInterval(() => {
            if (currentIndexRef.current >= fullData.length) {
                if (onComplete) onComplete();
                return;
            }

            const currentData = fullData[currentIndexRef.current];
            if (currentData) {
                 if (onSyncState) onSyncState(currentIndexRef.current, currentData.time, currentData.close, performance.now());
                 if (liveTimeRef) liveTimeRef.current = currentData.time;
                 
                 setDisplayState({ 
                     visible: true, 
                     label: 'LIVE SIM', 
                     price: currentData.close 
                 });
                 
                 currentIndexRef.current++;
            }
            
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isActive, isPlaying, fullData]);

    return { displayState };
};