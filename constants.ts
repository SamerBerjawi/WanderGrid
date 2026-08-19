/**
 * Application UI Design System & Token Constants
 * Adheres strictly to the Crystal Design System Specification (Apple HIG + Frosted Glassmorphism)
 */

// --- Base Input & Button Styles ---
export const INPUT_BASE_STYLE = 
  'w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-white/70 dark:bg-dark-card/70 backdrop-blur-md border border-black/10 dark:border-white/10 text-light-text dark:text-dark-text placeholder-light-text-secondary/50 dark:placeholder-dark-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all duration-150 text-sm';

export const BTN_PRIMARY_STYLE = 
  'bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-xl transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm';

export const BTN_SECONDARY_STYLE = 
  'bg-white/10 hover:bg-white/20 dark:bg-white/5 dark:hover:bg-white/10 text-light-text dark:text-dark-text font-medium rounded-xl border border-black/5 dark:border-white/10 transition-all duration-150 active:scale-[0.98]';

export const BTN_DANGER_STYLE = 
  'bg-rose-500 hover:bg-rose-600 text-white font-medium rounded-xl transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-[0.98]';

// --- Surfaces & Containers ---
export const CARD_FILL_STYLE = 
  'bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 rounded-3xl p-5';

export const CARD_ELEVATED_STYLE = 
  'bg-white/80 dark:bg-dark-card/80 backdrop-blur-xl border border-black/5 dark:border-white/10 shadow-glass-card rounded-2xl';

export const DIVIDER_INNER_STYLE = 
  'border-black/5 dark:border-white/5';

export const DIVIDER_SHELL_STYLE = 
  'border-black/10 dark:border-white/10';

export const FROSTED_FOOTER_STYLE = 
  'p-6 border-t border-black/5 dark:border-white/10 bg-white/80 dark:bg-dark-card/80 backdrop-blur-md flex items-center justify-between gap-3 shrink-0';

// --- Typography & Labels ---
export const HEADER_TITLE_STYLE = 
  'text-lg font-bold text-light-text dark:text-dark-text tracking-tight truncate';

export const HEADER_SUBTITLE_STYLE = 
  'text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-0.5';

export const SECTION_LABEL_STYLE = 
  'block text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary';

// --- Micro-Components ---
export const CLOSE_BTN_STYLE = 
  'w-9 h-9 rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0';

export const STATUS_PILL_STYLE = 
  'px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20';

export const SEGMENTED_TAB_WRAPPER = 
  'bg-black/5 dark:bg-white/5 p-1 rounded-2xl flex border border-black/5 dark:border-white/5';

export const SEGMENTED_TAB_ACTIVE = 
  'bg-white dark:bg-dark-card text-primary-500 shadow-sm py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all';

export const SEGMENTED_TAB_INACTIVE = 
  'text-light-text-secondary dark:text-dark-text-secondary opacity-60 hover:opacity-100 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all';

export const READOUT_STRIP_STYLE = 
  'p-4 rounded-2xl bg-white/70 dark:bg-dark-card/70 backdrop-blur-md border border-black/5 dark:border-white/10 shadow-sm flex items-center justify-between';

export const MONO_PILL_STYLE = 
  'px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/5 text-xs font-mono font-bold text-light-text dark:text-dark-text';
