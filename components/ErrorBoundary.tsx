import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Unhandled error caught by WanderGrid ErrorBoundary:", error, errorInfo);
  }

  private handleReset = () => {
    try {
      localStorage.clear();
      window.location.reload();
    } catch (e) {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center p-6">
          <div className="max-w-md w-full bg-slate-800/80 backdrop-blur border border-slate-700/50 rounded-3xl p-8 shadow-2xl text-center">
            <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-rose-500">
              <span className="text-3xl font-bold">!</span>
            </div>
            
            <h1 className="text-2xl font-black tracking-tight text-white mb-3">WanderGrid Stopped Unexpectedly</h1>
            
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              An unhandled crash occurred in the frontend rendering cycle. This is usually caused by outdated, incompatible local cache or transient route state.
            </p>

            {this.state.error && (
              <div className="bg-slate-950 p-4 rounded-xl text-left font-mono text-xs text-rose-400 overflow-auto max-h-32 mb-6 border border-slate-900 leading-normal">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button 
                id="error-boundary-refresh"
                onClick={() => window.location.reload()}
                className="flex-1 bg-sky-500 hover:bg-sky-400 text-white font-semibold py-3 px-4 rounded-2xl transition duration-200 text-sm shadow-lg shadow-sky-500/20 pointer-events-auto"
              >
                Reload Page
              </button>
              <button 
                id="error-boundary-reset"
                onClick={this.handleReset}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold py-3 px-4 rounded-2xl transition duration-200 text-sm border border-slate-600/50 pointer-events-auto"
              >
                Clear Cache & Reset
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
