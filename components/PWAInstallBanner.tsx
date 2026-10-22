import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { ArrowsClockwise, DownloadSimple } from '@/components/ui/hugeicons';
import { usePWA } from '../hooks/usePWA';
import { toast } from '../services/toast';

// How to install on iOS: loaded only when someone asks for it.
const IosInstallHelp = lazy(() => import('./new/IosInstallHelp'));

const DISMISS_STORAGE_KEY = 'wandergrid_pwa_install_dismissed_at';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const readDismissedAt = (): number => {
  try { return parseInt(localStorage.getItem(DISMISS_STORAGE_KEY) || '0', 10) || 0; } catch { return 0; }
};

/**
 * The app's standing notices, in the New look (decision 177). They are sticky toasts on the shared host
 * (components/Toaster.tsx), so they look and behave like every other message and can never overlap it:
 *  - offline: "You're offline" while there is no connection, then a "Back online" confirmation,
 *  - update ready: a Reload button when a new service worker is waiting,
 *  - install: an Install button (Chrome, Edge, Android), or the iOS steps in a dialog on iPhone and iPad;
 *    closing it with ✕ hides it for 7 days.
 * Renders nothing itself except the iOS help.
 */
export const PWAInstallBanner: React.FC = () => {
  const { isInstalled, isInstallable, isOnline, isUpdateAvailable, platform, promptInstall, updateApp } = usePWA();
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [iosMounted, setIosMounted] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
      toast.info("You're offline. Saved trips and maps still work.", { key: 'offline', sticky: true });
      return;
    }
    toast.dismiss('offline');
    if (wasOffline.current) {
      wasOffline.current = false;
      toast.success('Back online');
    }
  }, [isOnline]);

  useEffect(() => {
    if (!isUpdateAvailable) { toast.dismiss('update'); return; }
    toast.info('A new version of WanderGrid is ready.', {
      key: 'update',
      sticky: true,
      action: { label: 'Reload', icon: ArrowsClockwise, onClick: updateApp },
    });
  }, [isUpdateAvailable, updateApp]);

  useEffect(() => {
    // Only when not installed, and installable (or on iOS), and not closed in the last week.
    if (isInstalled || !(isInstallable || platform === 'ios') || Date.now() - readDismissedAt() < DISMISS_DURATION_MS) {
      toast.dismiss('install');
      return;
    }
    const timer = window.setTimeout(() => {
      toast.info('Install WanderGrid for offline access.', {
        key: 'install',
        sticky: true,
        action: {
          label: 'Install',
          icon: DownloadSimple,
          onClick: async () => {
            const res = await promptInstall();
            if (res.outcome === 'accepted') toast.success('Installed. Open WanderGrid from your home screen.');
            else if (res.outcome === 'instructions_needed') { setIosMounted(true); setShowIosInstructions(true); }
          },
        },
        onDismiss: () => { try { localStorage.setItem(DISMISS_STORAGE_KEY, Date.now().toString()); } catch { /* storage unavailable */ } },
      });
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [isInstalled, isInstallable, platform, promptInstall]);

  return iosMounted ? (
    <Suspense fallback={null}>
      <IosInstallHelp open={showIosInstructions} onClose={() => setShowIosInstructions(false)} />
    </Suspense>
  ) : null;
};
