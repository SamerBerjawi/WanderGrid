import { BasemapMode } from '../types/mapAppearance';
import { dataService } from './mockDb';

/**
 * Maps a basemap mode to its natural theme ('light' | 'dark' | 'auto').
 */
export const getBasemapThemeMode = (basemap: BasemapMode): 'light' | 'dark' | 'auto' => {
  switch (basemap) {
    case 'liberty':
    case 'bright':
    case 'positron':
    case '3d':
      return 'light';
    case 'dark':
    case 'fiord':
    case 'satellite':
    case 'citylights':
    case 'ocean':
      return 'dark';
    case 'default':
    default:
      return 'auto';
  }
};

/**
 * Automatically synchronizes the application's light/dark mode theme with the selected basemap
 * to ensure optimal contrast, visual legibility of routes, airport markers, and UI elements.
 */
export const syncThemeWithBasemap = (basemap: BasemapMode) => {
  const targetTheme = getBasemapThemeMode(basemap);
  const isDark = targetTheme === 'auto'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : targetTheme === 'dark';

  // 1. Immediately toggle DOM class for 0ms visual latency
  document.documentElement.classList.toggle('dark', isDark);

  // 2. Synchronize meta theme-color for iOS/Android status bar
  const metaThemeColor = document.getElementById('theme-color-meta');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', isDark ? '#050505' : '#FAFAFA');
  }
  document.querySelectorAll('meta[name="theme-color"]').forEach((el) => {
    el.setAttribute('content', isDark ? '#050505' : '#FAFAFA');
  });

  // 3. Persist updated theme to workspace settings and notify subscribers
  dataService.getWorkspaceSettings().then((existing) => {
    if (existing.theme !== targetTheme) {
      const updated = { ...existing, theme: targetTheme };
      dataService.updateWorkspaceSettings(updated);
    }
  }).catch(() => {
    window.dispatchEvent(new CustomEvent('wandergrid_settings_updated', { detail: { theme: targetTheme } }));
  });
};
