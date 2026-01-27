
import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { debugLog } from '@/utils/logger';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  errorMessage?: string; // Optional custom message
  onErrorCaptured?: (error: string) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isStackVisible: boolean;
}

export class GlobalErrorBoundary extends React.Component<Props, State> {
  // Explicitly declare state to avoid TS errors
  state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    isStackVisible: false
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error to the dev diagnostics
    debugLog('UI', 'CRASH DETECTED', { 
        message: error.message, 
        stack: errorInfo.componentStack 
    });
    
    // Notify parent if listener exists (for Debug Panel)
    if (this.props.onErrorCaptured) {
        this.props.onErrorCaptured(error.message);
    }

    console.error("Red Pill Crash Report:", error, errorInfo);
    this.setState({ errorInfo });
  }

  // Use arrow function to avoid binding issues and ensure 'this' context
  handleRetry = () => {
    debugLog('UI', 'User attempted Error Boundary retry');
    this.setState({ hasError: false, error: null, errorInfo: null });
    // Optional: Hard reload if the state is truly corrupted
    // window.location.reload(); 
  }

  toggleStack = () => {
    this.setState(prev => ({ isStackVisible: !prev.isStackVisible }));
  }

  copyError = () => {
    const text = `Error: ${this.state.error?.message}\n\nStack:\n${this.state.errorInfo?.componentStack}`;
    navigator.clipboard.writeText(text);
    alert('Error details copied to clipboard');
  }

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

      // Detailed Professional Diagnostic UI
      return (
        <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center p-8 bg-[#0f172a] text-slate-300 font-sans z-50 relative">
          <div className="max-w-3xl w-full bg-[#1e293b] border border-red-900/50 rounded-xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-red-950/30 px-6 py-4 border-b border-red-900/30 flex items-center gap-4">
              <div className="p-3 bg-red-900/20 rounded-full shrink-0">
                <AlertTriangle className="text-red-500" size={32} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-red-100">Render Cycle Crashed</h2>
                <p className="text-xs text-red-300/70 uppercase tracking-widest font-mono">
                  {this.props.errorMessage || 'Critical UI Exception'}
                </p>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="bg-[#0f172a] p-4 rounded-lg border border-slate-700 font-mono text-sm text-red-300 break-words shadow-inner">
                {this.state.error?.message || 'Unknown Error'}
              </div>

              {/* Stack Trace Toggle */}
              <div className="border border-slate-700 rounded-lg overflow-hidden bg-[#0f172a]">
                <button
                    onClick={this.toggleStack}
                    className="w-full flex items-center justify-between px-4 py-2 bg-[#1e293b]/50 hover:bg-[#334155] transition-colors text-xs font-bold text-slate-400 uppercase tracking-wider"
                >
                    <span>Component Stack Trace</span>
                    {this.state.isStackVisible ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                </button>
                {this.state.isStackVisible && (
                    <pre className="p-4 bg-black/50 text-[10px] text-slate-500 overflow-x-auto custom-scrollbar max-h-64 whitespace-pre-wrap leading-relaxed font-mono">
                        {this.state.errorInfo?.componentStack || 'No stack trace available.'}
                    </pre>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-[#0f172a] border-t border-slate-700 flex justify-between items-center">
              <button
                onClick={this.copyError}
                className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors rounded hover:bg-[#334155]"
              >
                <Copy size={14} /> Copy Details
              </button>
              <button
                onClick={this.handleRetry}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold shadow-lg transition-all active:scale-95"
              >
                <RefreshCw size={16} />
                <span>Reload Component</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
