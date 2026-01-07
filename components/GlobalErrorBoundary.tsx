import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { debugLog } from '../utils/logger';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  errorMessage?: string; // Optional custom message
  onErrorCaptured?: (error: string) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GlobalErrorBoundary extends React.Component<Props, State> {
  // Refactored to use class properties for state and an arrow function for the event handler.
  // This is a more modern and concise syntax for React class components that resolves typing issues.
  state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  // FIX: Changed from an arrow function property to a standard class method.
  // React lifecycle methods are automatically bound to the component instance.
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error to the dev diagnostics
    debugLog('UI', 'Global Error Boundary caught an exception', { 
        message: error.message, 
        stack: errorInfo.componentStack 
    });
    
    // Notify parent if listener exists (for Debug Panel)
    if (this.props.onErrorCaptured) {
        this.props.onErrorCaptured(error.message);
    }

    console.error("Uncaught error in component:", error, errorInfo);
  }

  handleRetry = () => {
    debugLog('UI', 'User attempted Error Boundary retry');
    this.setState({ hasError: false, error: null });
  };

  // FIX: Changed from an arrow function property to a standard class method.
  // The `render` method in a React class component should be a standard method.
  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return (
            <div className="w-full h-full min-h-[120px] flex flex-col items-center justify-center p-4 bg-[#1e293b] border border-[#334155] rounded-lg text-slate-300">
                {this.props.fallback}
                <button
                    onClick={this.handleRetry}
                    className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors"
                >
                    <RefreshCw size={14} />
                    <span>Try Again</span>
                </button>
            </div>
        );
      }

      // Default Professional UI
      return (
        <div className="w-full h-full min-h-[120px] flex flex-col items-center justify-center p-6 bg-[#1e293b] border border-[#334155] rounded-lg shadow-sm">
          <div className="bg-red-500/10 p-3 rounded-full mb-3">
            <AlertTriangle className="text-red-500" size={24} />
          </div>
          <h3 className="text-sm font-bold text-slate-200 mb-1">
            {this.props.errorMessage || 'Component Unavailable'}
          </h3>
          <p className="text-xs text-slate-500 text-center mb-4 max-w-[200px]">
            {this.state.error?.message || 'An unexpected error occurred while rendering this section.'}
          </p>
          <button
            onClick={this.handleRetry}
            className="flex items-center gap-2 px-4 py-2 bg-[#334155] hover:bg-[#475569] text-white rounded text-xs font-medium transition-all border border-slate-600 hover:border-slate-500"
          >
            <RefreshCw size={14} />
            <span>Reload Component</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}