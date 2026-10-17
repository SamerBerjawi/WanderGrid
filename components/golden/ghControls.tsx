import React from 'react';
import { isFeatureEnabled } from '../../config/featureFlags';
import GlassPanel, { GlassPanelProps } from '../glass/GlassPanel';

/**
 * Golden Hour form-control kit shared by the glass control components (GlassInput, GlassSelect, DatePicker...).
 * Each control keeps its flag-off markup untouched and branches to these class strings when UI_GOLDEN_HOUR is on.
 * Flat, solid, rounded, coral focus ring: no glass, no blur, no hairline borders. See docs/golden-hour-design.md.
 */

/** Evaluated once per module use; the flag is a build-time constant so this never changes mid-session. */
export const isGoldenHour = (): boolean => isFeatureEnabled('UI_GOLDEN_HOUR');

/** Small uppercase label above a field. */
export const GH_LABEL = 'block text-xs font-black uppercase tracking-wider text-sunset-ink/70 dark:text-white/70 px-1';

/** Solid field surface: white (light) / dusk plum (dark), soft warm shadow, no border. */
export const GH_FIELD_SURFACE = 'bg-white dark:bg-sunset-dusk text-sunset-ink dark:text-white shadow-[0_2px_8px_rgba(120,50,20,0.14)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.4)]';

/** Coral focus ring applied to a wrapper that contains the focused element. */
export const GH_FOCUS_WITHIN = 'focus-within:ring-2 focus-within:ring-sunset-coral';

/** Open / error rings for non-input triggers. */
export const GH_RING_OPEN = 'ring-2 ring-sunset-coral';
export const GH_RING_ERROR = 'ring-2 ring-rose-500';

/** Full pill field shell (44px). Compose with GH_FOCUS_WITHIN or an open ring. */
export const GH_PILL = `rounded-full min-h-[44px] h-11 px-4 transition-shadow ${GH_FIELD_SURFACE}`;

/** Placeholder + text for the bare <input> inside a golden shell. */
export const GH_INPUT_TEXT = 'bg-transparent text-sm font-bold text-sunset-ink dark:text-white placeholder:text-sunset-ink/40 dark:placeholder:text-white/40 placeholder:font-semibold focus:outline-none';

/** Solid rounded sheet used by dropdown menus, calendars and autocomplete lists. */
export const GH_SHEET = 'bg-white dark:bg-sunset-dusk text-sunset-ink dark:text-white rounded-3xl shadow-[0_14px_36px_-10px_rgba(60,20,10,0.45)]';

/** Menu rows: hover/keyboard highlight is sand (dusk in dark), the chosen row is a sun-yellow block. */
export const GH_ROW = 'rounded-2xl text-sm font-bold transition-colors';
export const GH_ROW_ACTIVE = 'bg-sunset-sand dark:bg-sunset-plum text-sunset-ink dark:text-white';
export const GH_ROW_SELECTED = 'bg-sunset-sun text-sunset-ink';
export const GH_ROW_IDLE = 'text-sunset-ink dark:text-white';

/** Small round icon button (calendar arrows etc.), 44px hit area via min size. */
export const GH_ICON_BTN = 'w-10 h-10 rounded-full flex items-center justify-center bg-sunset-sand dark:bg-sunset-plum text-sunset-ink dark:text-white hover:brightness-95 transition cursor-pointer active:scale-95';

/** Empty-state line for lists/menus. */
export const GH_EMPTY = 'px-3 py-5 text-center text-sm font-bold text-sunset-ink/60 dark:text-white/60';

/**
 * Drop-in for GlassPanel: with the flag OFF it is GlassPanel with the same props; with it ON it is a plain
 * div carrying `golden` instead of any glass layers. `className` is ignored in golden mode.
 */
export const GlassOrGolden: React.FC<GlassPanelProps & { golden: string }> = ({ golden, children, onClick, id, style, ...glass }) =>
  isGoldenHour()
    ? <div id={id} style={style} className={golden} onClick={onClick as React.MouseEventHandler<HTMLDivElement> | undefined}>{children}</div>
    : <GlassPanel {...glass} id={id} style={style} onClick={onClick}>{children}</GlassPanel>;
