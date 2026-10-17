/**
 * Central Feature Flags configuration for WanderGrid (GEV Modular Architecture)
 * 
 * Each flag defaults according to the specification:
 * - Fixes & Improvements: default ON
 * - New user-facing features: default OFF (owner flips them on)
 * 
 * Any flag can be overridden at build/runtime using VITE_FF_<ID> environment variables.
 */

import { getUiTheme } from './uiTheme';

function getEnvFlag(key: string, defaultValue: boolean): boolean {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const val = import.meta.env[key];
    if (val === 'true' || val === '1') return true;
    if (val === 'false' || val === '0') return false;
  }
  return defaultValue;
}

export const FEATURE_FLAGS = {
  // P-01: Fix flight-lookup adsbdb provider (route-only, no fabricated times)
  GEV_P01_ADSBDB_ROUTE: getEnvFlag('VITE_FF_GEV_P01_ADSBDB_ROUTE', true),

  // P-02: Real road routing via FOSSGIS/OSRM proxy with real distance & duration
  GEV_P02_ROUTING: getEnvFlag('VITE_FF_GEV_P02_ROUTING', true),

  // P-03: Geocoding upgrade (Open-Meteo + Photon + Nominatim chain)
  GEV_P03_GEOCODING: getEnvFlag('VITE_FF_GEV_P03_GEOCODING', true),

  // P-04a: Basemap auto-fallback on tile failure
  GEV_P04A_BASEMAP_FALLBACK: getEnvFlag('VITE_FF_GEV_P04A_BASEMAP_FALLBACK', true),

  // P-04b: OpenFreeMap vector basemaps (liberty, bright, positron)
  GEV_P04B_OPENFREEMAP: getEnvFlag('VITE_FF_GEV_P04B_OPENFREEMAP', true),

  // P-04c: NASA GIBS Recent Satellite daily layer (default OFF)
  GEV_P04C_GIBS_DAILY: getEnvFlag('VITE_FF_GEV_P04C_GIBS_DAILY', false),

  // P-04d: 3D terrain + hillshade via AWS Terrarium DEM (default OFF)
  GEV_P04D_TERRAIN: getEnvFlag('VITE_FF_GEV_P04D_TERRAIN', false),

  // P-05: Self-host static data + service-worker caching
  GEV_P05_STATIC_AND_TILE_CACHE: getEnvFlag('VITE_FF_GEV_P05_STATIC_AND_TILE_CACHE', true),

  // P-06: Integrations panel in Settings
  GEV_P06_INTEGRATIONS: getEnvFlag('VITE_FF_GEV_P06_INTEGRATIONS', true),

  // P-07: Dynamic data credits popover
  GEV_P07_DATA_CREDITS: getEnvFlag('VITE_FF_GEV_P07_DATA_CREDITS', true),

  // Audit remediation flows that replace broken behaviour (default ON, see CLAUDE.md "Feature work")
  // WP-2.1: "Forgot password?" with admin-issued one-time reset codes
  AUDIT_PASSWORD_RESET: getEnvFlag('VITE_FF_AUDIT_PASSWORD_RESET', true),

  // WP-1.7: "Archived" planner view (Archive no longer deletes trips)
  AUDIT_TRIP_ARCHIVE_VIEW: getEnvFlag('VITE_FF_AUDIT_TRIP_ARCHIVE_VIEW', true),

  // UI: "Golden Hour" theme (sunset palette, rounded solid cards, rounded type). Replaces the glass look when ON
  // ON for the Golden Hour and Departure Board themes, which the user picks in Settings (config/uiTheme.ts)
  UI_GOLDEN_HOUR: getUiTheme() !== 'classic',

  // UI: "Departure Board" view for flights and transport (boarding-pass cards, split-flap list)
  UI_DEPARTURE_BOARD: getUiTheme() !== 'classic' || getEnvFlag('VITE_FF_UI_DEPARTURE_BOARD', false),

} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  return Boolean(FEATURE_FLAGS[flag]);
}
