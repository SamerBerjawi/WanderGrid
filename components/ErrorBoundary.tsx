import React, { Component, ErrorInfo, ReactNode } from 'react';
import { BTN_PRIMARY_STYLE, BTN_SECONDARY_STYLE } from '../constants';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  confirmingReset?: boolean;
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

  // Clears derived caches only (geocoding, routes, dashboard snapshots, service-worker caches).
  // The session, preferences and — in local mode — the user's data are kept (REL-017).
  private handleReset = async () => {
    // Two-step confirmation inline (the app's dialog host isn't available on the crash screen).
    if (!this.state.confirmingReset) {
      this.setState({ confirmingReset: true });
      return;
    }
    try {
      const isCacheKey = (key: string) =>
        /^wandergrid_.*(cache|_routes_|geo_db|metadata_resolved|api_status|place_registry|road_tracing)/.test(key) ||
        key === 'flightFormDraft';
      Object.keys(localStorage).filter(isCacheKey).forEach((key) => localStorage.removeItem(key));
      if (typeof caches !== 'undefined') {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      }
    } catch (e) {
      console.warn('Cache reset was incomplete:', e);
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text flex flex-col justify-center items-center p-6">
          <div className="max-w-md w-full bg-light-card dark:bg-dark-card backdrop-blur border border-light-separator dark:border-dark-separator rounded-3xl p-8 shadow-glass-light-card dark:shadow-2xl text-center">
            <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-rose-600 dark:text-rose-400">
              <span className="text-3xl font-bold">!</span>
            </div>
            
            <h1 className="text-2xl font-black tracking-tight mb-3">WanderGrid Stopped Unexpectedly</h1>
            
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-6 leading-relaxed">
              An unhandled crash occurred in the frontend rendering cycle. This is usually caused by outdated, incompatible local cache or transient route state.
            </p>

            {this.state.error && (
              <div className="bg-light-fill dark:bg-dark-fill p-4 rounded-xl text-left font-mono text-xs text-rose-700 dark:text-rose-300 overflow-auto max-h-32 mb-6 border border-light-separator dark:border-dark-separator leading-normal">
                {this.state.error.message}
              </div>
            )}

            {this.state.confirmingReset && (
              <p role="alert" className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-3">Cached map, route and dashboard data will be cleared. Your account and trips are not affected.</p>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <button 
                id="error-boundary-refresh"
                onClick={() => window.location.reload()}
                className={`${BTN_PRIMARY_STYLE} flex-1 px-4 text-sm`}
              >
                Reload Page
              </button>
              <button 
                id="error-boundary-reset"
                onClick={this.handleReset}
                className={`${BTN_SECONDARY_STYLE} flex-1 px-4 text-sm`}
              >
                {this.state.confirmingReset ? 'Confirm: Clear Cache & Reload' : 'Clear Cached Data & Reload'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
