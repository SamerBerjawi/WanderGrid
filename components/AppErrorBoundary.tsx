import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, LayoutGrid } from 'lucide-react';

interface Props {
  children: ReactNode;
  routeKey?: string;
  onResetToDashboard?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("View-level error caught in WanderGrid:", error, errorInfo);
  }

  public componentDidUpdate(prevProps: Props) {
    // If the active route key transitioned, automatically clear the error state
    if (this.props.routeKey !== prevProps.routeKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  private handleLocalReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div 
          id="app-error-boundary-container"
          className="w-full min-h-[450px] flex items-center justify-center p-6 md:p-8"
        >
          <div 
            id="app-error-boundary-card" 
            className="max-w-lg w-full bg-slate-900/60 dark:bg-zinc-950/60 border border-slate-200/20 dark:border-zinc-800/60 backdrop-blur rounded-3xl p-8 shadow-2xl text-center flex flex-col justify-center items-center"
          >
            <div 
              id="app-error-boundary-icon-bg"
              className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mb-6 text-amber-500 animate-pulse"
            >
              <AlertTriangle className="w-7 h-7" />
            </div>

            <h2 id="app-error-boundary-title" className="text-xl font-bold font-sans text-gray-900 dark:text-gray-100 mb-2 tracking-tight">
              View Encountered an Issue
            </h2>

            <p id="app-error-boundary-description" className="text-sm text-gray-500 dark:text-zinc-400 mb-6 leading-relaxed max-w-sm">
              We encountered a frontend rendering problem while displaying this section. Rest assured, other parts of WanderGrid are still running properly.
            </p>

            {this.state.error && (
              <div 
                id="app-error-boundary-debug"
                className="w-full bg-slate-950 dark:bg-black/40 p-4 rounded-xl text-left font-mono text-xs text-rose-400 overflow-auto max-h-36 mb-6 border border-slate-800/40 leading-normal"
              >
                {this.state.error.name ? `[${this.state.error.name}] ` : ''}
                {this.state.error.message}
              </div>
            )}

            <div id="app-error-boundary-actions" className="flex flex-col sm:flex-row gap-3 w-full">
              <button
                id="app-error-boundary-retry-btn"
                onClick={this.handleLocalReset}
                className="flex-1 bg-zinc-805 hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-100 font-semibold py-3 px-4 rounded-2xl transition-all duration-200 text-sm flex items-center justify-center gap-2 border border-slate-300 dark:border-zinc-700 pointer-events-auto shadow-sm"
              >
                <RotateCcw className="w-4 h-4" />
                Try Again
              </button>
              
              {this.props.onResetToDashboard && (
                <button
                  id="app-error-boundary-dashboard-btn"
                  onClick={this.props.onResetToDashboard}
                  className="flex-1 bg-sky-500 hover:bg-sky-450 dark:bg-sky-600 dark:hover:bg-sky-500 text-white font-semibold py-3 px-4 rounded-2xl transition-all duration-200 text-sm flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 pointer-events-auto border border-sky-400/20 dark:border-sky-500/20"
                >
                  <LayoutGrid className="w-4 h-4" />
                  Return to Dashboard
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
