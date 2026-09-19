import { ViewState } from '../types';

export interface PageThemeConfig {
  id: ViewState;
  title: string;
  color: string;           // Icon and label accent text class
  accentHex: string;       // Primary hex code
  glowGradients: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  activeSidebarDark: string;
  activeSidebarLight: string;
  indicator: string;
}

export const PAGE_THEMES: Record<ViewState, PageThemeConfig> = {
  [ViewState.DASHBOARD]: {
    id: ViewState.DASHBOARD,
    title: 'Dashboard',
    color: 'text-sky-500 dark:text-sky-400',
    accentHex: '#0ea5e9',
    glowGradients: {
      primary: '#0ea5e9',
      secondary: '#6366f1',
      tertiary: '#38bdf8'
    },
    activeSidebarDark: 'bg-gradient-to-r from-sky-500/20 to-indigo-500/15 text-white border border-sky-400/30 shadow-[0_0_15px_-3px_rgba(14,165,233,0.25)]',
    activeSidebarLight: 'bg-gradient-to-r from-sky-500/15 to-indigo-500/10 text-sky-950 border border-sky-500/30 shadow-[0_0_15px_-3px_rgba(14,165,233,0.2)]',
    indicator: 'bg-sky-400 shadow-[0_0_8px_rgba(14,165,233,0.8)]'
  },
  [ViewState.MAP]: {
    id: ViewState.MAP,
    title: 'Map',
    color: 'text-indigo-500 dark:text-indigo-400',
    accentHex: '#6366f1',
    glowGradients: {
      primary: '#6366f1',
      secondary: '#8b5cf6',
      tertiary: '#0ea5e9'
    },
    activeSidebarDark: 'bg-gradient-to-r from-indigo-500/20 to-purple-500/15 text-white border border-indigo-400/30 shadow-[0_0_15px_-3px_rgba(99,102,241,0.25)]',
    activeSidebarLight: 'bg-gradient-to-r from-indigo-500/15 to-purple-500/10 text-indigo-950 border border-indigo-500/30 shadow-[0_0_15px_-3px_rgba(99,102,241,0.2)]',
    indicator: 'bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.8)]'
  },
  [ViewState.PLANNER]: {
    id: ViewState.PLANNER,
    title: 'Planner',
    color: 'text-emerald-500 dark:text-emerald-400',
    accentHex: '#10b981',
    glowGradients: {
      primary: '#10b981',
      secondary: '#14b8a6',
      tertiary: '#06b6d4'
    },
    activeSidebarDark: 'bg-gradient-to-r from-emerald-500/20 to-teal-500/15 text-white border border-emerald-400/30 shadow-[0_0_15px_-3px_rgba(16,185,129,0.25)]',
    activeSidebarLight: 'bg-gradient-to-r from-emerald-500/15 to-teal-500/10 text-emerald-950 border border-emerald-500/30 shadow-[0_0_15px_-3px_rgba(16,185,129,0.2)]',
    indicator: 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
  },
  [ViewState.VACATION_CALENDAR]: {
    id: ViewState.VACATION_CALENDAR,
    title: 'Vacation Calendar',
    color: 'text-amber-500 dark:text-amber-400',
    accentHex: '#f59e0b',
    glowGradients: {
      primary: '#f59e0b',
      secondary: '#ea580c',
      tertiary: '#fbbf24'
    },
    activeSidebarDark: 'bg-gradient-to-r from-amber-500/20 to-orange-500/15 text-white border border-amber-400/30 shadow-[0_0_15px_-3px_rgba(245,158,11,0.25)]',
    activeSidebarLight: 'bg-gradient-to-r from-amber-500/15 to-orange-500/10 text-amber-950 border border-amber-500/30 shadow-[0_0_15px_-3px_rgba(245,158,11,0.2)]',
    indicator: 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]'
  },
  [ViewState.TRAVEL_ATLAS]: {
    id: ViewState.TRAVEL_ATLAS,
    title: 'Travel Atlas',
    color: 'text-rose-500 dark:text-rose-400',
    accentHex: '#f43f5e',
    glowGradients: {
      primary: '#f43f5e',
      secondary: '#ec4899',
      tertiary: '#fb7185'
    },
    activeSidebarDark: 'bg-gradient-to-r from-rose-500/20 to-pink-500/15 text-white border border-rose-400/30 shadow-[0_0_15px_-3px_rgba(244,63,94,0.25)]',
    activeSidebarLight: 'bg-gradient-to-r from-rose-500/15 to-pink-500/10 text-rose-950 border border-rose-500/30 shadow-[0_0_15px_-3px_rgba(244,63,94,0.2)]',
    indicator: 'bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
  },
  [ViewState.FLIGHTS]: {
    id: ViewState.FLIGHTS,
    title: 'Flights',
    color: 'text-cyan-500 dark:text-cyan-400',
    accentHex: '#06b6d4',
    glowGradients: {
      primary: '#06b6d4',
      secondary: '#0284c7',
      tertiary: '#38bdf8'
    },
    activeSidebarDark: 'bg-gradient-to-r from-cyan-500/20 to-sky-500/15 text-white border border-cyan-400/30 shadow-[0_0_15px_-3px_rgba(6,182,212,0.25)]',
    activeSidebarLight: 'bg-gradient-to-r from-cyan-500/15 to-sky-500/10 text-cyan-950 border border-cyan-500/30 shadow-[0_0_15px_-3px_rgba(6,182,212,0.2)]',
    indicator: 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]'
  },
  [ViewState.ROADTRIPS]: {
    id: ViewState.ROADTRIPS,
    title: 'Road Trips',
    color: 'text-violet-500 dark:text-violet-400',
    accentHex: '#8b5cf6',
    glowGradients: {
      primary: '#8b5cf6',
      secondary: '#a855f7',
      tertiary: '#d946ef'
    },
    activeSidebarDark: 'bg-gradient-to-r from-violet-500/20 to-fuchsia-500/15 text-white border border-violet-400/30 shadow-[0_0_15px_-3px_rgba(139,92,246,0.25)]',
    activeSidebarLight: 'bg-gradient-to-r from-violet-500/15 to-fuchsia-500/10 text-violet-950 border border-violet-500/30 shadow-[0_0_15px_-3px_rgba(139,92,246,0.2)]',
    indicator: 'bg-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.8)]'
  },
  [ViewState.SETTINGS]: {
    id: ViewState.SETTINGS,
    title: 'Settings',
    color: 'text-slate-500 dark:text-slate-400',
    accentHex: '#64748b',
    glowGradients: {
      primary: '#64748b',
      secondary: '#818cf8',
      tertiary: '#94a3b8'
    },
    activeSidebarDark: 'bg-gradient-to-r from-slate-500/20 to-zinc-500/15 text-white border border-slate-400/30 shadow-[0_0_15px_-3px_rgba(100,116,139,0.25)]',
    activeSidebarLight: 'bg-gradient-to-r from-slate-500/15 to-zinc-500/10 text-slate-950 border border-slate-500/30 shadow-[0_0_15px_-3px_rgba(100,116,139,0.2)]',
    indicator: 'bg-slate-400 shadow-[0_0_8px_rgba(100,116,139,0.8)]'
  },
  [ViewState.USER_DETAIL]: {
    id: ViewState.USER_DETAIL,
    title: 'Traveler Profile',
    color: 'text-orange-500 dark:text-orange-400',
    accentHex: '#f97316',
    glowGradients: {
      primary: '#f97316',
      secondary: '#f43f5e',
      tertiary: '#fb923c'
    },
    activeSidebarDark: 'bg-gradient-to-r from-orange-500/20 to-rose-500/15 text-white border border-orange-400/30 shadow-[0_0_15px_-3px_rgba(249,115,22,0.25)]',
    activeSidebarLight: 'bg-gradient-to-r from-orange-500/15 to-rose-500/10 text-orange-950 border border-orange-500/30 shadow-[0_0_15px_-3px_rgba(249,115,22,0.2)]',
    indicator: 'bg-orange-400 shadow-[0_0_8px_rgba(249,115,22,0.8)]'
  },
  [ViewState.TRIP_DETAIL]: {
    id: ViewState.TRIP_DETAIL,
    title: 'Trip Itinerary',
    color: 'text-amber-500 dark:text-amber-400',
    accentHex: '#f59e0b',
    glowGradients: {
      primary: '#f59e0b',
      secondary: '#10b981',
      tertiary: '#0ea5e9'
    },
    activeSidebarDark: 'bg-gradient-to-r from-amber-500/20 to-emerald-500/15 text-white border border-amber-400/30 shadow-[0_0_15px_-3px_rgba(245,158,11,0.25)]',
    activeSidebarLight: 'bg-gradient-to-r from-amber-500/15 to-emerald-500/10 text-amber-950 border border-amber-500/30 shadow-[0_0_15px_-3px_rgba(245,158,11,0.2)]',
    indicator: 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]'
  },
  [ViewState.GAMIFICATION]: {
    id: ViewState.GAMIFICATION,
    title: 'Expeditions & Ranks',
    color: 'text-yellow-500 dark:text-yellow-400',
    accentHex: '#eab308',
    glowGradients: {
      primary: '#eab308',
      secondary: '#f59e0b',
      tertiary: '#fbbf24'
    },
    activeSidebarDark: 'bg-gradient-to-r from-yellow-500/20 to-amber-500/15 text-white border border-yellow-400/30 shadow-[0_0_15px_-3px_rgba(234,179,8,0.25)]',
    activeSidebarLight: 'bg-gradient-to-r from-yellow-500/15 to-amber-500/10 text-yellow-950 border border-yellow-500/30 shadow-[0_0_15px_-3px_rgba(234,179,8,0.2)]',
    indicator: 'bg-yellow-400 shadow-[0_0_8px_rgba(234,179,8,0.8)]'
  }
};

export function getPageTheme(view: ViewState): PageThemeConfig {
  return PAGE_THEMES[view] || PAGE_THEMES[ViewState.DASHBOARD];
}
