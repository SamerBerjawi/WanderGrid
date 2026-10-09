import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Globe,
  Stack,
  Airplane,
  Funnel,
  SlidersHorizontal,
  Compass,
  ArrowCounterClockwise,
  Check,
} from '@phosphor-icons/react';
import {
  MapAppearanceSettings,
  DEFAULT_MAP_APPEARANCE,
  BasemapMode,
} from '../../types/mapAppearance';
import { syncThemeWithBasemap } from '../../services/themeSync';
import GlassPanel from '../glass/GlassPanel';
import MAP_SETTINGS_LABELS from './labels';
import MapTab from './tabs/MapTab';
import LayersTab from './tabs/LayersTab';
import TripsTab from './tabs/TripsTab';
import FilterTab from './tabs/FilterTab';

const useDarkMode = () => {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);
  return isDark;
};

export interface MapSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: MapAppearanceSettings;
  onChangeSettings: (newSettings: MapAppearanceSettings) => void;
  onResetCamera?: () => void;
  onResetAll?: () => void;
  // Optional Expedition view mode & dynamics controls
  viewMode?: 'flights' | 'land_sea' | 'scratch' | 'all' | 'none';
  onSelectViewMode?: (mode: 'flights' | 'land_sea' | 'scratch' | 'all' | 'none') => void;
  animateRoutes?: boolean;
  onToggleAnimateRoutes?: () => void;
  clusterMode?: boolean;
  onToggleClusterMode?: () => void;
  showRoadTracing?: boolean;
  onToggleRoadTracing?: () => void;
  // Optional 4th tab: Filters
  filterTabContent?: React.ReactNode;
  activeFilterCount?: number;
  onClearFilters?: () => void;
}

export const MapSettingsPanel: React.FC<MapSettingsPanelProps> = ({
  isOpen,
  onClose,
  settings: initialSettings,
  onChangeSettings,
  onResetCamera,
  onResetAll,
  viewMode,
  onSelectViewMode,
  animateRoutes,
  onToggleAnimateRoutes,
  clusterMode,
  onToggleClusterMode,
  showRoadTracing,
  onToggleRoadTracing,
  filterTabContent,
  activeFilterCount = 0,
  onClearFilters,
}) => {
  const isDark = useDarkMode();
  const [activeTab, setActiveTab] = useState<'map' | 'layers' | 'trips' | 'filter'>('map');
  const [isVisible, setIsVisible] = useState(false);
  const [hasOpenAipKey, setHasOpenAipKey] = useState<boolean>(true);
  const [isResetConfirming, setIsResetConfirming] = useState<boolean>(false);

  // Mobile Bottom Sheet state (MC-08)
  const [isExpandedMobile, setIsExpandedMobile] = useState<boolean>(false);
  const touchStartYRef = useRef<number | null>(null);

  // Local settings for debouncing persistence during slider dragging (MC-09)
  const [localSettings, setLocalSettings] = useState<MapAppearanceSettings>(initialSettings);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSettingsRef = useRef<MapAppearanceSettings | null>(null);

  // Synchronize when initialSettings prop changes
  useEffect(() => {
    setLocalSettings(initialSettings);
  }, [initialSettings]);

  // Flush debounced updates immediately
  const flushPendingSettings = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (pendingSettingsRef.current) {
      onChangeSettings(pendingSettingsRef.current);
      pendingSettingsRef.current = null;
    }
  }, [onChangeSettings]);

  // Update setting field with debounced persistence
  const handleUpdateSetting = useCallback(
    <K extends keyof MapAppearanceSettings>(field: K, value: MapAppearanceSettings[K]) => {
      if (field === 'basemap') {
        syncThemeWithBasemap(value as BasemapMode);
      }

      setLocalSettings((prev) => {
        const next = { ...prev, [field]: value };
        pendingSettingsRef.current = next;

        // Debounce external write by 200ms
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
          onChangeSettings(next);
          debounceTimerRef.current = null;
          pendingSettingsRef.current = null;
        }, 200);

        return next;
      });
    },
    [onChangeSettings]
  );

  // Visibility and opening animation
  useEffect(() => {
    if (isOpen) {
      setIsResetConfirming(false);
      const timer = setTimeout(() => setIsVisible(true), 20);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  // Keyboard Escape listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleClose = () => {
    flushPendingSettings();
    setIsVisible(false);
    setTimeout(onClose, 250);
  };

  // OpenAIP key detection from workspace settings
  useEffect(() => {
    const refreshKeys = () => {
      try {
        const raw =
          localStorage.getItem('wandergrid_workspace_settings') ||
          localStorage.getItem('wandergrid_settings');
        if (raw) {
          const parsed = JSON.parse(raw);
          setHasOpenAipKey(Boolean(parsed.openAipApiKey));
        }
      } catch {}
    };
    refreshKeys();
    window.addEventListener('wandergrid_workspace_settings_updated', refreshKeys);
    window.addEventListener('storage', refreshKeys);
    return () => {
      window.removeEventListener('wandergrid_workspace_settings_updated', refreshKeys);
      window.removeEventListener('storage', refreshKeys);
    };
  }, [isOpen]);

  // Handle Reset Settings (MC-05)
  const handleConfirmReset = () => {
    setIsResetConfirming(false);
    if (onResetAll) {
      onResetAll();
    } else {
      const reset = { ...DEFAULT_MAP_APPEARANCE };
      setLocalSettings(reset);
      onChangeSettings(reset);
    }
  };

  // Wheel forwarding to map canvas so zooming works smoothly while drawer is open
  const handleWheel = (e: React.WheelEvent) => {
    const target =
      document.querySelector('.maplibregl-canvas-container') ||
      document.querySelector('.maplibregl-canvas');
    if (target) {
      target.dispatchEvent(
        new WheelEvent('wheel', {
          deltaX: e.deltaX,
          deltaY: e.deltaY,
          deltaZ: e.deltaZ,
          deltaMode: e.deltaMode,
          clientX: e.clientX,
          clientY: e.clientY,
          screenX: e.screenX,
          screenY: e.screenY,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          metaKey: e.metaKey,
          bubbles: true,
          cancelable: true,
        })
      );
    }
  };

  // Mobile touch/pointer drag handle (MC-08)
  const handlePointerDown = (e: React.PointerEvent) => {
    touchStartYRef.current = e.clientY;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (touchStartYRef.current === null) return;
    const diff = e.clientY - touchStartYRef.current;
    touchStartYRef.current = null;
    // Swipe down to collapse / close
    if (diff > 50) {
      if (isExpandedMobile) {
        setIsExpandedMobile(false);
      } else {
        handleClose();
      }
    } else if (diff < -30) {
      setIsExpandedMobile(true);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartYRef.current === null) return;
    const diff = e.changedTouches[0].clientY - touchStartYRef.current;
    touchStartYRef.current = null;
    // Swipe down to collapse / close
    if (diff > 50) {
      if (isExpandedMobile) {
        setIsExpandedMobile(false);
      } else {
        handleClose();
      }
    } else if (diff < -30) {
      setIsExpandedMobile(true);
    }
  };

  if (!isOpen && !isVisible) return null;

  const tabs = [
    {
      id: 'map' as const,
      label: MAP_SETTINGS_LABELS.tabs.map,
      icon: Globe,
      activeStyle: 'text-sky-700 dark:text-sky-300 bg-sky-500/15 dark:bg-sky-500/25 border-sky-500',
      iconActive: 'text-sky-600 dark:text-sky-400',
    },
    {
      id: 'layers' as const,
      label: MAP_SETTINGS_LABELS.tabs.layers,
      icon: Stack,
      activeStyle: 'text-amber-700 dark:text-amber-300 bg-amber-500/15 dark:bg-amber-500/25 border-amber-500',
      iconActive: 'text-amber-600 dark:text-amber-400',
    },
    {
      id: 'trips' as const,
      label: MAP_SETTINGS_LABELS.tabs.trips,
      icon: Airplane,
      activeStyle: 'text-indigo-700 dark:text-indigo-300 bg-indigo-500/15 dark:bg-indigo-500/25 border-indigo-500',
      iconActive: 'text-indigo-600 dark:text-indigo-400',
    },
    ...(filterTabContent
      ? [
          {
            id: 'filter' as const,
            label:
              activeFilterCount > 0
                ? `${MAP_SETTINGS_LABELS.tabs.filter} · ${activeFilterCount}`
                : MAP_SETTINGS_LABELS.tabs.filter,
            icon: Funnel,
            activeStyle: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 dark:bg-emerald-500/25 border-emerald-500',
            iconActive: 'text-emerald-600 dark:text-emerald-400',
          },
        ]
      : []),
  ];

  return createPortal(
    <div className="fixed inset-0 z-modal overflow-hidden font-sans select-none pointer-events-auto">
      {/* 1. Transparent click-outside dismiss backdrop with wheel passthrough */}
      <div
        className="fixed inset-0 bg-transparent"
        onClick={handleClose}
        onWheel={handleWheel}
      />

      {/* 2. Responsive Shell: Bottom sheet on mobile (<640px), Right drawer on desktop (>=640px) */}
      <div
        className={`fixed z-modal flex pointer-events-none transition-all duration-300 ease-out ${
          // Desktop: Floating right drawer
          'sm:top-3 sm:right-3 sm:bottom-3 md:top-4 md:right-4 md:bottom-4 sm:left-auto sm:max-w-full sm:pl-6 ' +
          // Mobile: Bottom sheet docked at bottom
          'inset-x-0 bottom-0 top-auto'
        }`}
      >
        <div
          className={`w-screen sm:w-[460px] md:w-[480px] flex flex-col pointer-events-auto transition-transform duration-300 ease-out ${
            // Mobile: slide up from bottom; Desktop: slide in from right
            isVisible
              ? 'translate-y-0 sm:translate-y-0 sm:translate-x-0'
              : 'translate-y-full sm:translate-y-0 sm:translate-x-full'
          } ${
            // Mobile height
            isExpandedMobile
              ? 'h-[88dvh] sm:h-full'
              : 'h-[60dvh] sm:h-full'
          }`}
          onClick={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <GlassPanel
            className="wg-glass-card shadow-2xl h-full w-full flex flex-col overflow-hidden"
            padding="0px"
            overrides={{ borderRadius: 28 }}
          >
            <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px] text-light-text dark:text-dark-text relative">
              {/* Mobile Drag Handle (MC-08) */}
              <div
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onClick={() => setIsExpandedMobile(!isExpandedMobile)}
                className="sm:hidden flex items-center justify-center pt-2 pb-1 w-full cursor-grab active:cursor-grabbing shrink-0 select-none touch-none"
                aria-label="Toggle drawer expansion"
              >
                <div className="w-10 h-1 rounded-full bg-black/20 dark:bg-white/25 hover:bg-black/40 dark:hover:bg-white/45 transition-colors" />
              </div>

              {/* Header (MC-05: Title + Close only; no unlabelled refresh icon) */}
              <div
                onClick={(e) => {
                  // If clicking on header (not on buttons) at mobile viewport, toggle expansion
                  if ((e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'path' && window.innerWidth < 640) {
                    setIsExpandedMobile(!isExpandedMobile);
                  }
                }}
                className="flex items-center justify-between px-4 sm:px-5 py-2.5 sm:py-3 border-b border-black/5 dark:border-white/5 bg-gradient-to-r from-primary-500/10 via-transparent to-transparent shrink-0 sm:cursor-default cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-primary-500/15 dark:bg-primary-500/25 border border-primary-500/30 dark:border-primary-400/40 flex items-center justify-center text-primary-600 dark:text-primary-400 shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_6px_rgba(234,88,12,0.15)] wg-glass-surface">
                    <SlidersHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4" weight="bold" />
                  </div>
                  <div>
                    <h2 className="text-xs sm:text-sm font-bold text-light-text dark:text-dark-text tracking-tight">
                      {MAP_SETTINGS_LABELS.panelTitle}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/50 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/15 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text transition-all duration-150 flex items-center justify-center cursor-pointer border border-black/5 dark:border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.25)] active:scale-95 wg-glass-surface"
                    aria-label={MAP_SETTINGS_LABELS.actions.close}
                  >
                    <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" weight="bold" />
                  </button>
                </div>
              </div>

              {/* Navigation Tabs (MC-02: Fixed order, equal widths, never truncate) */}
              <div
                className={`grid ${
                  tabs.length === 4 ? 'grid-cols-4' : 'grid-cols-3'
                } border-b border-black/5 dark:border-white/5 px-2.5 sm:px-3 pt-1.5 gap-1 bg-black/[0.02] dark:bg-white/[0.02] shrink-0`}
              >
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-t-xl text-xs font-bold transition-all duration-200 cursor-pointer relative min-w-0 ${
                        isActive
                          ? `${tab.activeStyle} border-b-2 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)] wg-glass-surface`
                          : 'text-light-text-secondary dark:text-dark-text-secondary opacity-75 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                      title={tab.label}
                    >
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? tab.iconActive : ''}`} weight={isActive ? 'bold' : 'regular'} />
                      <span className="truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Scrollable Tab Body (pb-20 ensures footer never overlaps content) */}
              <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 pb-20 space-y-3 sm:space-y-3.5 custom-scrollbar text-light-text dark:text-dark-text">
                {activeTab === 'map' && (
                  <MapTab
                    settings={localSettings}
                    onChangeSetting={handleUpdateSetting}
                    isDark={isDark}
                  />
                )}

                {activeTab === 'layers' && (
                  <LayersTab
                    settings={localSettings}
                    onChangeSetting={handleUpdateSetting}
                    hasOpenAipKey={hasOpenAipKey}
                    onFlushSettings={flushPendingSettings}
                  />
                )}

                {activeTab === 'trips' && (
                  <TripsTab
                    settings={localSettings}
                    onChangeSetting={handleUpdateSetting}
                    viewMode={viewMode}
                    onSelectViewMode={onSelectViewMode}
                    animateRoutes={animateRoutes}
                    onToggleAnimateRoutes={onToggleAnimateRoutes}
                    clusterMode={clusterMode}
                    onToggleClusterMode={onToggleClusterMode}
                    showRoadTracing={showRoadTracing}
                    onToggleRoadTracing={onToggleRoadTracing}
                  />
                )}

                {activeTab === 'filter' && filterTabContent && (
                  <FilterTab
                    content={filterTabContent}
                    activeFilterCount={activeFilterCount}
                    onClearFilters={onClearFilters}
                  />
                )}
              </div>

              {/* Sticky Footer Actions (MC-05: Reset settings with confirm + Recenter + Done) */}
              <div className="absolute bottom-0 inset-x-0 px-3.5 py-2 sm:px-4 sm:py-2.5 border-t border-black/5 dark:border-white/10 bg-white/80 dark:bg-dark-card/90 wg-glass-surface flex items-center justify-between gap-2 shrink-0 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))]">
                {/* Reset settings button & inline confirm dialog */}
                {isResetConfirming ? (
                  <div className="flex items-center gap-1.5 animate-fadeIn">
                    <span className="text-2xs font-bold text-rose-600 dark:text-rose-400">
                      {MAP_SETTINGS_LABELS.actions.resetSettingsConfirm}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsResetConfirming(false)}
                      className="px-2 py-1 rounded-lg text-2xs font-bold bg-black/5 dark:bg-white/10 text-light-text dark:text-dark-text hover:bg-black/10 transition-colors"
                    >
                      {MAP_SETTINGS_LABELS.actions.cancel}
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmReset}
                      className="px-2 py-1 rounded-lg text-2xs font-bold bg-rose-500 text-white hover:bg-rose-600 shadow-sm transition-colors"
                    >
                      {MAP_SETTINGS_LABELS.actions.reset}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsResetConfirming(true)}
                      className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer flex items-center gap-1.5 active:scale-95"
                    >
                      <ArrowCounterClockwise className="w-3.5 h-3.5" weight="bold" />
                      <span className="hidden xs:inline">{MAP_SETTINGS_LABELS.actions.resetSettings}</span>
                      <span className="xs:hidden">Reset</span>
                    </button>

                    {/* Optional Recenter map button */}
                    {onResetCamera && (
                      <button
                        type="button"
                        onClick={onResetCamera}
                        className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-1.5 active:scale-95"
                      >
                        <Compass className="w-3.5 h-3.5" weight="bold" />
                        <span className="hidden xs:inline">{MAP_SETTINGS_LABELS.actions.recenterMap}</span>
                        <span className="xs:hidden">Recenter</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Right: Done button */}
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-1.5 rounded-xl text-xs font-bold bg-primary-500 hover:bg-primary-600 text-white shadow-md shadow-primary-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  <span>{MAP_SETTINGS_LABELS.actions.done}</span>
                  <Check className="w-3.5 h-3.5" weight="bold" />
                </button>
              </div>
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MapSettingsPanel;
