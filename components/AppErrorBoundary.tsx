import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorPanel } from './new/ErrorPanel';

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
      return <ErrorPanel error={this.state.error} onRetry={this.handleLocalReset} onDashboard={this.props.onResetToDashboard} />;
    }

    return this.props.children;
  }
}
