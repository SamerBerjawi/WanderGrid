import { getWanderSyncCachedData } from '../hooks/useWanderSync';
import { WorkspaceSettings } from '../types';

/**
 * Global Date & Currency Formatter Engine
 * Enforces unified formatting across WanderGrid respecting WorkspaceSettings.
 */

// Fallback format when settings are loading or unavailable
const DEFAULT_DATE_FORMAT = 'MM/DD/YYYY';
const DEFAULT_CURRENCY = 'USD';

/**
 * Retrieves the currently active date format from cache or local storage.
 */
export function getActiveDateFormat(overrideSettings?: WorkspaceSettings | null): string {
  if (overrideSettings?.dateFormat) return overrideSettings.dateFormat;
  const cached = getWanderSyncCachedData<WorkspaceSettings>('settings') 
    || getWanderSyncCachedData<WorkspaceSettings>('planner_settings');
  if (cached?.dateFormat) return cached.dateFormat;

  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('wandergrid_workspace_settings') : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.dateFormat) return parsed.dateFormat;
    }
  } catch {
    // Ignore storage parsing issues
  }

  return DEFAULT_DATE_FORMAT;
}

/**
 * Retrieves the currently active currency code from cache or local storage.
 */
export function getActiveCurrency(overrideSettings?: WorkspaceSettings | null): string {
  if (overrideSettings?.currency) return overrideSettings.currency;
  const cached = getWanderSyncCachedData<WorkspaceSettings>('settings') 
    || getWanderSyncCachedData<WorkspaceSettings>('planner_settings');
  if (cached?.currency) return cached.currency;

  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('wandergrid_workspace_settings') : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.currency) return parsed.currency;
    }
  } catch {
    // Ignore storage parsing issues
  }

  return DEFAULT_CURRENCY;
}

export type DateFormatterStyle = 
  | 'numeric'        // e.g. 09/02/2026 or 02/09/2026 or 2026-09-02
  | 'short'          // e.g. Sep 2 or 2 Sep
  | 'short-with-year'// e.g. Sep 2, 2026 or 2 Sep 2026
  | 'medium'         // e.g. Sep 2, 2026
  | 'long'           // e.g. September 2, 2026
  | 'weekday-short'  // e.g. Wed, Sep 2 or Wed, 2 Sep
  | 'weekday-long'   // e.g. Wednesday, Sep 2, 2026
  | 'month-year';    // e.g. Sep 2026

/**
 * Safely parse date value into a valid Date object or null
 */
function parseSafeDate(date: string | Date | number | null | undefined): Date | null {
  if (!date) return null;
  if (date instanceof Date) return isNaN(date.getTime()) ? null : date;
  
  if (typeof date === 'string') {
    // If it's a date-only string like YYYY-MM-DD, parse as local or resilient date
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [y, m, d] = date.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
  }
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Format a single date value according to style and active workspace settings.
 */
export function formatDate(
  date: string | Date | number | null | undefined,
  style: DateFormatterStyle = 'short-with-year',
  settingsOrFormat?: WorkspaceSettings | string | null
): string {
  const d = parseSafeDate(date);
  if (!d) return 'TBD';

  const formatPreference = typeof settingsOrFormat === 'string' 
    ? settingsOrFormat 
    : getActiveDateFormat(settingsOrFormat);

  const isDayFirst = formatPreference === 'DD/MM/YYYY';
  const isIso = formatPreference === 'YYYY-MM-DD';

  const year = d.getFullYear();
  const monthNum = String(d.getMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getDate()).padStart(2, '0');

  const monthShort = d.toLocaleDateString('en-US', { month: 'short' });
  const monthLong = d.toLocaleDateString('en-US', { month: 'long' });
  const weekdayShort = d.toLocaleDateString('en-US', { weekday: 'short' });
  const weekdayLong = d.toLocaleDateString('en-US', { weekday: 'long' });

  switch (style) {
    case 'numeric':
      if (isIso) return `${year}-${monthNum}-${dayNum}`;
      if (isDayFirst) return `${dayNum}/${monthNum}/${year}`;
      return `${monthNum}/${dayNum}/${year}`;

    case 'short':
      return isDayFirst ? `${d.getDate()} ${monthShort}` : `${monthShort} ${d.getDate()}`;

    case 'short-with-year':
      return isDayFirst ? `${d.getDate()} ${monthShort} ${year}` : `${monthShort} ${d.getDate()}, ${year}`;

    case 'medium':
      return isDayFirst ? `${d.getDate()} ${monthShort}, ${year}` : `${monthShort} ${d.getDate()}, ${year}`;

    case 'long':
      return isDayFirst ? `${d.getDate()} ${monthLong} ${year}` : `${monthLong} ${d.getDate()}, ${year}`;

    case 'weekday-short':
      return isDayFirst 
        ? `${weekdayShort}, ${d.getDate()} ${monthShort}` 
        : `${weekdayShort}, ${monthShort} ${d.getDate()}`;

    case 'weekday-long':
      return isDayFirst 
        ? `${weekdayLong}, ${d.getDate()} ${monthLong} ${year}` 
        : `${weekdayLong}, ${monthLong} ${d.getDate()}, ${year}`;

    case 'month-year':
      return `${monthShort} ${year}`;

    default:
      return isDayFirst ? `${d.getDate()} ${monthShort} ${year}` : `${monthShort} ${d.getDate()}, ${year}`;
  }
}

/**
 * Formats a date range cleanly (e.g. "Sep 2 – Sep 10, 2026" or "2 Sep – 10 Sep 2026")
 */
export function formatDateRange(
  startDate: string | Date | number | null | undefined,
  endDate: string | Date | number | null | undefined,
  settingsOrFormat?: WorkspaceSettings | string | null
): string {
  const s = parseSafeDate(startDate);
  const e = parseSafeDate(endDate);

  if (!s && !e) return 'TBD';
  if (!s && e) return formatDate(e, 'short-with-year', settingsOrFormat);
  if (s && !e) return formatDate(s, 'short-with-year', settingsOrFormat);
  if (!s || !e) return 'TBD';

  const formatPreference = typeof settingsOrFormat === 'string' 
    ? settingsOrFormat 
    : getActiveDateFormat(settingsOrFormat);
  const isDayFirst = formatPreference === 'DD/MM/YYYY';

  const sYear = s.getFullYear();
  const eYear = e.getFullYear();
  const sMonth = s.toLocaleDateString('en-US', { month: 'short' });
  const eMonth = e.toLocaleDateString('en-US', { month: 'short' });
  const sDay = s.getDate();
  const eDay = e.getDate();

  // Same day
  if (s.getTime() === e.getTime()) {
    return formatDate(s, 'short-with-year', settingsOrFormat);
  }

  // Same month & year
  if (sYear === eYear && sMonth === eMonth) {
    if (isDayFirst) {
      return `${sDay} – ${eDay} ${sMonth} ${sYear}`;
    }
    return `${sMonth} ${sDay} – ${eDay}, ${sYear}`;
  }

  // Same year, different months
  if (sYear === eYear) {
    if (isDayFirst) {
      return `${sDay} ${sMonth} – ${eDay} ${eMonth} ${sYear}`;
    }
    return `${sMonth} ${sDay} – ${eMonth} ${eDay}, ${sYear}`;
  }

  // Different years
  if (isDayFirst) {
    return `${sDay} ${sMonth} ${sYear} – ${eDay} ${eMonth} ${eYear}`;
  }
  return `${sMonth} ${sDay}, ${sYear} – ${eMonth} ${eDay}, ${eYear}`;
}

/**
 * Formats a monetary amount into a standardized currency string using Intl.NumberFormat.
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  currencyCode?: string,
  options?: Intl.NumberFormatOptions
): string {
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : Number(amount ?? 0);
  if (isNaN(numericAmount)) return '$0';

  const curr = currencyCode || getActiveCurrency();
  
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
      maximumFractionDigits: 2,
      minimumFractionDigits: Number.isInteger(numericAmount) ? 0 : 2,
      ...options
    }).format(numericAmount);
  } catch {
    // Fallback if currency code is unknown
    return `$${numericAmount.toLocaleString('en-US')}`;
  }
}

/**
 * Returns symbol for currency code (e.g. "USD" -> "$", "EUR" -> "€")
 */
export function getCurrencySymbol(currencyCode?: string): string {
  const code = currencyCode || getActiveCurrency();
  try {
    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: code });
    const parts = formatter.formatToParts(0);
    const symbolPart = parts.find(p => p.type === 'currency');
    return symbolPart ? symbolPart.value : '$';
  } catch {
    return '$';
  }
}
