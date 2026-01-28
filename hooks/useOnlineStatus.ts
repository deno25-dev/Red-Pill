import { useState, useEffect } from 'react';

/**
 * Network Guard Hook
 * 
 * Provides a reactive boolean indicating whether the browser is currently online.
 * Used to enforce Zero-Assumption Connectivity by preventing network calls
 * unless this hook returns true.
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}