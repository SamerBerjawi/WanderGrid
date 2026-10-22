import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorPanel } from './new/ErrorPanel';

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
        <ErrorPanel
          fullScreen
          error={this.state.error}
          onReload={() => window.location.reload()}
          notice={this.state.confirmingReset ? <p role="alert" className="text-xs text-rp-muted">Cached map, route and dashboard data will be cleared. Your account and trips are not affected.</p> : null}
          extra={(
            <button type="button" id="error-boundary-reset" onClick={this.handleReset} className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium text-rp-muted underline-offset-4 outline-none hover:text-rp-ink hover:underline focus-visible:ring-2 focus-visible:ring-rp-muted">
              {this.state.confirmingReset ? 'Confirm: clear cached data and reload' : 'Clear cached data and reload'}
            </button>
          )}
        />
      );
    }

    return this.props.children;
  }
}
