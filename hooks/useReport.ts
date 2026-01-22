
import { useCallback } from 'react';
import { report, LogLevel } from '../utils/logger';

export const useReport = (componentName: string) => {
    const log = useCallback((action: string, data?: any, level: LogLevel = 'info') => {
        report(componentName, action, data, level);
    }, [componentName]);

    const info = useCallback((action: string, data?: any) => report(componentName, action, data, 'info'), [componentName]);
    const warn = useCallback((action: string, data?: any) => report(componentName, action, data, 'warn'), [componentName]);
    const error = useCallback((action: string, data?: any) => report(componentName, action, data, 'error'), [componentName]);

    return { log, info, warn, error };
};
