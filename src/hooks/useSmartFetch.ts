import { useState, useEffect, useRef, useCallback } from 'react';
import { debugLog } from '../utils/logger';

interface SmartFetchOptions {
  baseInterval?: number; // Normal polling interval (e.g., 30000ms)
  settlingDelay?: number; // Wait time after coming online (e.g., 2000ms)
  initialRetryDelay?: number; // First retry wait (e.g., 5000ms)
  maxRetryDelay?: number; // Max backoff (e.g., 60000ms)
}

interface SmartFetchResult<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean; // True during active fetch
  isSettling: boolean; // True during connection surge guard
  retry: () => void; // Manual override
}

export function useSmartFetch<T>(
  fetchFn: () => Promise<T>,
  isConnected: boolean,
  options: SmartFetchOptions = {}
): SmartFetchResult<T> {
  const {
    baseInterval = 30000,
    settlingDelay = 2000,
    initialRetryDelay = 5000,
    maxRetryDelay = 60000
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  
  // Track consecutive errors for backoff calculation
  const errorCountRef = useRef(0);
  // Timer reference to prevent overlaps
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep latest fetchFn in ref to avoid effect dependency loops
  const fetchFnRef = useRef(fetchFn);

  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const executeFetch = useCallback(async () => {
    clearTimer();
    setIsLoading(true);
    // Note: isSettling is assumed false once we enter execution

    try {
      // debugLog('Network', 'SmartFetch: Executing request...');
      const result = await fetchFnRef.current();
      
      // SUCCESS PATH
      setData(result);
      setError(null);
      errorCountRef.current = 0; // Reset backoff
      
      // Schedule next normal fetch
      // debugLog('Network', `SmartFetch: Success. Next fetch in ${baseInterval / 1000}s`);
      timerRef.current = setTimeout(executeFetch, baseInterval);

    } catch (err: any) {
      // FAILURE PATH
      console.warn("SmartFetch Error:", err);
      setError(err);
      
      // Calculate Exponential Backoff
      // 5s, 10s, 20s, 40s, 60s(cap)
      const multiplier = Math.pow(2, errorCountRef.current);
      let nextDelay = initialRetryDelay * multiplier;
      if (nextDelay > maxRetryDelay) nextDelay = maxRetryDelay;
      
      errorCountRef.current += 1;
      
      debugLog('Network', `SmartFetch: Failure. Backoff level ${errorCountRef.current}. Retrying in ${nextDelay / 1000}s`);
      timerRef.current = setTimeout(executeFetch, nextDelay);

    } finally {
      setIsLoading(false);
      setIsSettling(false);
    }
  }, [baseInterval, initialRetryDelay, maxRetryDelay]);

  // Network Status Reaction
  useEffect(() => {
    clearTimer();

    if (isConnected) {
      // SURGE GUARD: Connection restored
      setIsSettling(true);
      debugLog('Network', `SmartFetch: Connection detected. Settling for ${settlingDelay / 1000}s...`);
      
      timerRef.current = setTimeout(() => {
        setIsSettling(false);
        executeFetch();
      }, settlingDelay);
    } else {
      // OFFLINE: Stop everything
      setIsSettling(false);
      setIsLoading(false);
    }

    return () => clearTimer();
  }, [isConnected, settlingDelay, executeFetch]);

  // Manual Override
  const retry = useCallback(() => {
    debugLog('UI', 'SmartFetch: Manual retry triggered');
    errorCountRef.current = 0;
    setIsSettling(false);
    executeFetch();
  }, [executeFetch]);

  return { data, error, isLoading, isSettling, retry };
}