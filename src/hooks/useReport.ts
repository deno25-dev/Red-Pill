
import { useCallback } from 'react';
import { report, LogLevel } from '../utils/logger';

export const useReport = (componentName: string) => {
  const log = useCallback((action: string, data?: any) => {
    report(componentName, action, data, 'info');
  }, [componentName]);

  const warn = useCallback((action: string, data?: any) => {
    report(componentName, action, data, 'warn');
  }, [componentName]);

  const error = useCallback((action: string, data?: any) => {
    report(componentName, action, data, 'error');
  }, [componentName]);

  return { log, warn, error, info: log };
};
