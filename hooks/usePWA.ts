import { useState, useEffect, useCallback } from 'react';

export interface StorageEstimateInfo {
  usageMB: number;
  quotaMB: number;
  percentage: number;
}

export interface PWAState {
  isInstalled: boolean;
  isInstallable: boolean;
  isOnline: boolean;
  isUpdateAvailable: boolean;
  platform: 'ios' | 'android' | 'desktop';
  promptInstall: () => Promise<{ outcome: 'accepted' | 'dismissed' | 'instructions_needed' }>;
  updateApp: () => void;
  getStorageEstimate: () => Promise<StorageEstimateInfo | null>;
  clearAppCache: () => Promise<void>;
}

// Global reference for deferred install prompt
let globalDeferredPrompt: any = null;

export function usePWA(): PWAState {
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://')
    );
  });

  const [isInstallable, setIsInstallable] = useState<boolean>(() => !!globalDeferredPrompt);
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [isUpdateAvailable, setIsUpdateAvailable] = useState<boolean>(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  // Platform detection
  const platform = ((): 'ios' | 'android' | 'desktop' => {
    if (typeof window === 'undefined') return 'desktop';
    const ua = window.navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) {
      return 'ios';
    }
    if (/Android/.test(ua)) {
      return 'android';
    }
    return 'desktop';
  })();

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Track display mode changes (e.g. user installs or launches as standalone)
  useEffect(() => {
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      setIsInstalled(e.matches);
      if (e.matches) {
        setIsInstallable(false);
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleDisplayModeChange);
      return () => mediaQuery.removeEventListener('change', handleDisplayModeChange);
    }
  }, []);

  // Intercept beforeinstallprompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      globalDeferredPrompt = e;
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      globalDeferredPrompt = null;
      setIsInstallable(false);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Monitor Service Worker updates
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;

      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
        setIsUpdateAvailable(true);
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setIsUpdateAvailable(true);
          }
        });
      });
    });
  }, []);

  // Trigger Install Prompt
  const promptInstall = useCallback(async (): Promise<{ outcome: 'accepted' | 'dismissed' | 'instructions_needed' }> => {
    if (globalDeferredPrompt) {
      try {
        globalDeferredPrompt.prompt();
        const choiceResult = await globalDeferredPrompt.userChoice;
        globalDeferredPrompt = null;
        setIsInstallable(false);
        if (choiceResult.outcome === 'accepted') {
          setIsInstalled(true);
          return { outcome: 'accepted' };
        }
        return { outcome: 'dismissed' };
      } catch (err) {
        console.error('Error invoking PWA install prompt:', err);
        return { outcome: 'dismissed' };
      }
    }

    if (platform === 'ios') {
      return { outcome: 'instructions_needed' };
    }

    return { outcome: 'dismissed' };
  }, [platform]);

  // Activate pending update and reload
  const updateApp = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  }, [waitingWorker]);

  // Estimate storage usage
  const getStorageEstimate = useCallback(async (): Promise<StorageEstimateInfo | null> => {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
      return null;
    }
    try {
      const estimate = await navigator.storage.estimate();
      const usageMB = (estimate.usage || 0) / (1024 * 1024);
      const quotaMB = (estimate.quota || 0) / (1024 * 1024);
      const percentage = quotaMB > 0 ? Math.min(100, Math.round((usageMB / quotaMB) * 100)) : 0;
      return {
        usageMB: Math.round(usageMB * 10) / 10,
        quotaMB: Math.round(quotaMB),
        percentage,
      };
    } catch (e) {
      console.warn('Could not estimate storage:', e);
      return null;
    }
  }, []);

  // Clear caches and reset service workers
  const clearAppCache = useCallback(async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      }
      window.location.reload();
    } catch (e) {
      console.error('Failed to clear app cache:', e);
      window.location.reload();
    }
  }, []);

  return {
    isInstalled,
    isInstallable,
    isOnline,
    isUpdateAvailable,
    platform,
    promptInstall,
    updateApp,
    getStorageEstimate,
    clearAppCache,
  };
}
