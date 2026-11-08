import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { isFeatureEnabled } from './config/featureFlags';
import { sharedTokenFrom } from './utils/sharedTrip';

// A public trip link opens on its own page, with no sign-in and none of the app around it.
const SharedTripPage = lazy(() => import('./views/new/SharedTrip').then(m => ({ default: m.SharedTripPage })));
const sharedToken = isFeatureEnabled('PUBLIC_TRIP_LINKS') ? sharedTokenFrom(window.location.pathname) : null;

const originalWarn = console.warn;
console.warn = (...args) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('Clock: This module has been deprecated')) {
    return;
  }
  originalWarn(...args);
};

// Automatically reload when a new service worker version is installed and takes control
if (typeof window !== 'undefined') {
  if ('serviceWorker' in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }

  // Handle dynamic import failure when chunks change after a build
  window.addEventListener('vite:preloadError', () => {
    window.location.reload();
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      {sharedToken ? <Suspense fallback={null}><SharedTripPage token={sharedToken} /></Suspense> : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);