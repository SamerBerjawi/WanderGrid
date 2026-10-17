import { lazy, LazyExoticComponent, ComponentType } from 'react';
import { ViewState } from '../../types';

/** Props every Golden Hour page variant may receive. Variants use the subset they need. */
export interface GoldenViewProps {
  onUserClick?: (id: string) => void;
  onTripClick?: (id: string) => void;
  onBack?: () => void;
  onLogout?: () => void;
  onThemeChange?: (theme: 'light' | 'dark' | 'auto') => void;
  userId?: string;
  tripId?: string;
  isSidebarCollapsed?: boolean;
}

/**
 * Redesigned pages shown when UI_GOLDEN_HOUR is on. A view missing here falls back to its original page.
 * Each Golden<Name>.tsx starts as a pass-through to the original view and is replaced by its redesign.
 */
export const goldenViews: Partial<Record<ViewState, LazyExoticComponent<ComponentType<GoldenViewProps>>>> = {
  [ViewState.PLANNER]: lazy(() => import('./GoldenPlanner').then(m => ({ default: m.GoldenPlanner }))),
  [ViewState.TRIP_DETAIL]: lazy(() => import('./GoldenTripDetail').then(m => ({ default: m.GoldenTripDetail }))),
  [ViewState.VACATION_CALENDAR]: lazy(() => import('./GoldenCalendar').then(m => ({ default: m.GoldenCalendar }))),
  [ViewState.MAP]: lazy(() => import('./GoldenMap').then(m => ({ default: m.GoldenMap }))),
  [ViewState.TRAVEL_ATLAS]: lazy(() => import('./GoldenAtlas').then(m => ({ default: m.GoldenAtlas }))),
  [ViewState.SETTINGS]: lazy(() => import('./GoldenSettings').then(m => ({ default: m.GoldenSettings }))),
  [ViewState.USER_DETAIL]: lazy(() => import('./GoldenUserDetail').then(m => ({ default: m.GoldenUserDetail }))),
};
