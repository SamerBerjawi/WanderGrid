/**
 * User-selectable interface theme (per device, stored in localStorage).
 *  - classic: the original glass interface
 *  - golden:  Golden Hour (sunset palette, rounded, playful)
 *  - board:   Departure Board (airport board palette, mono type, ticket shapes)
 * `golden` and `board` share the redesigned page layouts in views/golden/ and differ in skin.
 * Changing the theme reloads the page so every module reads it once at load.
 */
export type UiTheme = 'classic' | 'golden' | 'board';

export const UI_THEME_KEY = 'wandergrid_ui_theme';
export const UI_THEMES: UiTheme[] = ['classic', 'golden', 'board'];

/** Build-time default: VITE_FF_UI_GOLDEN_HOUR=true makes Golden Hour the default for users who never chose. */
const envDefault = (): UiTheme => {
  const v = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_FF_UI_GOLDEN_HOUR : undefined;
  return v === 'true' || v === '1' ? 'golden' : 'classic';
};

export function getUiTheme(): UiTheme {
  try {
    const stored = localStorage.getItem(UI_THEME_KEY) as UiTheme | null;
    if (stored && UI_THEMES.includes(stored)) return stored;
  } catch { /* storage unavailable */ }
  return envDefault();
}

export function setUiTheme(theme: UiTheme): void {
  try { localStorage.setItem(UI_THEME_KEY, theme); } catch { /* storage unavailable */ }
  window.location.reload();
}
