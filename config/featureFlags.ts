/**
 * Central Feature Flags configuration for WanderGrid (GEV Modular Architecture)
 * 
 * Each flag defaults according to the specification:
 * - Fixes & Improvements: default ON
 * - New user-facing features: default OFF (owner flips them on)
 * 
 * Any flag can be overridden at build/runtime using VITE_FF_<ID> environment variables.
 */

function getEnvFlag(key: string, defaultValue: boolean): boolean {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const val = import.meta.env[key];
    if (val === 'true' || val === '1') return true;
    if (val === 'false' || val === '0') return false;
  }
  return defaultValue;
}

export const FEATURE_FLAGS = {
  // P-04b: OpenFreeMap vector basemaps (liberty, bright, positron)
  GEV_P04B_OPENFREEMAP: getEnvFlag('VITE_FF_GEV_P04B_OPENFREEMAP', true),

  // P-04c: NASA GIBS Recent Satellite daily layer (default OFF)
  GEV_P04C_GIBS_DAILY: getEnvFlag('VITE_FF_GEV_P04C_GIBS_DAILY', false),

  // P-04d: 3D terrain + hillshade via AWS Terrarium DEM (default OFF)
  GEV_P04D_TERRAIN: getEnvFlag('VITE_FF_GEV_P04D_TERRAIN', false),

  // Audit remediation flows that replace broken behaviour (default ON, see CLAUDE.md "Feature work")
  // WP-2.1: "Forgot password?" with admin-issued one-time reset codes
  AUDIT_PASSWORD_RESET: getEnvFlag('VITE_FF_AUDIT_PASSWORD_RESET', true),

  // WP-1.7: "Archived" planner view (Archive no longer deletes trips)
  AUDIT_TRIP_ARCHIVE_VIEW: getEnvFlag('VITE_FF_AUDIT_TRIP_ARCHIVE_VIEW', true),

} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  return Boolean(FEATURE_FLAGS[flag]);
}
