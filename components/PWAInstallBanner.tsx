import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DownloadSimple, 
  WifiSlash, 
  ArrowClockwise, 
  X, 
  Export, 
  PlusSquare, 
  DeviceMobile, 
  CheckCircle,
  WarningCircle
} from '@phosphor-icons/react';
import GlassPanel from './glass/GlassPanel';
import { usePWA } from '../hooks/usePWA';

const DISMISS_STORAGE_KEY = 'wandergrid_pwa_install_dismissed_at';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const PWAInstallBanner: React.FC = () => {
  const { 
    isInstalled, 
    isInstallable, 
    isOnline, 
    isUpdateAvailable, 
    platform, 
    promptInstall, 
    updateApp 
  } = usePWA();

  const [isBannerDismissed, setIsBannerDismissed] = useState<boolean>(true);
  const [showIosInstructions, setShowIosInstructions] = useState<boolean>(false);
  const [installSuccess, setInstallSuccess] = useState<boolean>(false);

  useEffect(() => {
    // Check if dismissed previously
    const dismissedAt = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (dismissedAt) {
      const timePassed = Date.now() - parseInt(dismissedAt, 10);
      if (timePassed < DISMISS_DURATION_MS) {
        setIsBannerDismissed(true);
        return;
      }
    }
    // Only show if not installed and either installable or on iOS browser
    if (!isInstalled && (isInstallable || platform === 'ios')) {
      const timer = setTimeout(() => setIsBannerDismissed(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [isInstalled, isInstallable, platform]);

  const handleDismiss = () => {
    setIsBannerDismissed(true);
    localStorage.setItem(DISMISS_STORAGE_KEY, Date.now().toString());
  };

  const handleInstallClick = async () => {
    const res = await promptInstall();
    if (res.outcome === 'accepted') {
      setInstallSuccess(true);
      setTimeout(() => setIsBannerDismissed(true), 3000);
    } else if (res.outcome === 'instructions_needed') {
      setShowIosInstructions(true);
    }
  };

  return (
    <>
      {/* 1. Offline Mode Floating Pill */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed top-3 left-1/2 -translate-x-1/2 z-toast pointer-events-auto"
          >
            <GlassPanel
              className="wg-glass-pill flex items-center gap-2.5 px-4 py-2 bg-amber-500/15 dark:bg-amber-950/40 border border-amber-500/30 text-amber-700 dark:text-amber-300 shadow-lg text-xs font-semibold select-none"
            >
              <WifiSlash size={18} weight="bold" className="text-amber-500 animate-pulse" />
              <span>Offline Mode &bull; Cached Trips & Maps Active</span>
            </GlassPanel>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. New Version Available Floating Banner */}
      <AnimatePresence>
        {isUpdateAvailable && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed top-3 left-1/2 -translate-x-1/2 z-toast pointer-events-auto"
          >
            <GlassPanel
              className="wg-glass-pill flex items-center gap-3 px-4 py-2 bg-sky-500/15 dark:bg-sky-950/40 border border-sky-500/30 text-sky-700 dark:text-sky-300 shadow-xl text-xs font-semibold"
            >
              <ArrowClockwise size={18} weight="bold" className="text-sky-500 animate-spin" />
              <span>Update Ready for WanderGrid</span>
              <button
                type="button"
                onClick={updateApp}
                className="px-2.5 py-1 rounded-full bg-sky-500 hover:bg-sky-600 active:scale-95 text-white font-bold text-2xs uppercase tracking-wider transition-all min-h-[32px] flex items-center gap-1 cursor-pointer"
              >
                <span>Reload</span>
              </button>
            </GlassPanel>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Install App Prompt Banner (Bottom-Right Floating or Mobile Bottom) */}
      <AnimatePresence>
        {!isBannerDismissed && !isInstalled && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.96 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed bottom-20 md:bottom-6 right-3 md:right-6 z-popover max-w-[360px] w-[calc(100vw-24px)] pointer-events-auto"
          >
            <GlassPanel
              className="wg-glass-card p-4 bg-white/90 dark:bg-dark-card/90 border border-black/10 dark:border-white/10 shadow-2xl flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-primary-600 flex items-center justify-center text-white shrink-0 shadow-md">
                    <DeviceMobile size={24} weight="duotone" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-light-text dark:text-dark-text tracking-tight">
                      Install WanderGrid
                    </h3>
                    <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium">
                      Fast offline access, full-screen map, and instant launch
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDismiss}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                  aria-label="Dismiss banner"
                >
                  <X size={16} />
                </button>
              </div>

              {installSuccess ? (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-bold py-1">
                  <CheckCircle size={18} weight="fill" />
                  <span>Installed successfully! Launch from your home screen.</span>
                </div>
              ) : (
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-black/5 dark:border-white/5">
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors min-h-[44px] cursor-pointer"
                  >
                    Later
                  </button>
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="px-4 py-1.5 rounded-xl bg-primary-500 hover:bg-primary-600 active:scale-95 text-white text-xs font-bold shadow-md shadow-primary-500/25 flex items-center gap-1.5 transition-all min-h-[44px] cursor-pointer"
                  >
                    <DownloadSimple size={16} weight="bold" />
                    <span>Install App</span>
                  </button>
                </div>
              )}
            </GlassPanel>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. iOS Install Helper Modal */}
      <AnimatePresence>
        {showIosInstructions && (
          <div className="fixed inset-0 z-modal overflow-hidden flex items-end sm:items-center justify-center font-sans">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowIosInstructions(false)}
              className="fixed inset-0 bg-gray-900/60 dark:bg-black/80 backdrop-blur-md"
              style={{ WebkitBackdropFilter: 'blur(12px)' }}
            />

            {/* Modal Sheet */}
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="relative w-full max-w-md p-6 bg-white/95 dark:bg-dark-card/95 backdrop-blur-xl border-t sm:border border-black/10 dark:border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col gap-5 m-0 sm:m-4"
              style={{ WebkitBackdropFilter: 'blur(24px)' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-primary-500 text-white flex items-center justify-center shadow-md">
                    <DeviceMobile size={22} weight="duotone" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-light-text dark:text-dark-text tracking-tight">
                      Install on iPhone & iPad
                    </h2>
                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                      Run WanderGrid in standalone full-screen mode
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowIosInstructions(false)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Step by step instructions */}
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5">
                  <div className="w-8 h-8 rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Export size={18} weight="bold" />
                  </div>
                  <div className="text-xs">
                    <p className="font-bold text-light-text dark:text-dark-text">Step 1: Tap Share</p>
                    <p className="text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                      In the Safari browser bottom toolbar, tap the <strong>Share</strong> icon.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5">
                  <div className="w-8 h-8 rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center shrink-0 mt-0.5">
                    <PlusSquare size={18} weight="bold" />
                  </div>
                  <div className="text-xs">
                    <p className="font-bold text-light-text dark:text-dark-text">Step 2: Add to Home Screen</p>
                    <p className="text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                      Scroll down and select <strong>&quot;Add to Home Screen&quot;</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5">
                  <div className="w-8 h-8 rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle size={18} weight="bold" />
                  </div>
                  <div className="text-xs">
                    <p className="font-bold text-light-text dark:text-dark-text">Step 3: Confirm & Launch</p>
                    <p className="text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                      Tap <strong>&quot;Add&quot;</strong> in top-right. WanderGrid will appear on your home screen!
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowIosInstructions(false)}
                  className="w-full py-3 rounded-2xl bg-primary-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-primary-500/20 active:scale-95 transition-all cursor-pointer min-h-[44px]"
                >
                  Got It
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
