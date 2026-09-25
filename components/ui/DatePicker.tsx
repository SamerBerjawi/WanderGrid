import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  CalendarBlank, 
  CaretLeft, 
  CaretRight, 
  Check 
} from '@phosphor-icons/react';
import GlassPanel from '../glass/GlassPanel';
import GlassButton from '../glass/GlassButton';
import { formatDate } from '../../utils/formatters';

export type AccentColor = 
  | 'emerald' 
  | 'green' 
  | 'blue' 
  | 'sky' 
  | 'amber' 
  | 'orange' 
  | 'primary';

interface AccentTheme {
  triggerRing: string;
  triggerBorderFocus: string;
  iconBox: string;
  selectedDay: string;
  doneBtn: string;
  durationBadge: string;
}

const ACCENT_THEMES: Record<string, AccentTheme> = {
  emerald: {
    triggerRing: 'ring-2 ring-emerald-500/35 border-emerald-500/60',
    triggerBorderFocus: 'border-emerald-500/60',
    iconBox: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    selectedDay: 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30 font-black scale-105',
    doneBtn: 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-500/20',
    durationBadge: 'text-emerald-600 dark:text-emerald-400',
  },
  blue: {
    triggerRing: 'ring-2 ring-sky-500/35 border-sky-500/60',
    triggerBorderFocus: 'border-sky-500/60',
    iconBox: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
    selectedDay: 'bg-sky-500 text-white shadow-md shadow-sky-500/30 font-black scale-105',
    doneBtn: 'bg-sky-500 hover:bg-sky-600 text-white shadow-sm shadow-sky-500/20',
    durationBadge: 'text-sky-600 dark:text-sky-400',
  },
  amber: {
    triggerRing: 'ring-2 ring-amber-500/35 border-amber-500/60',
    triggerBorderFocus: 'border-amber-500/60',
    iconBox: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    selectedDay: 'bg-amber-500 text-white shadow-md shadow-amber-500/30 font-black scale-105',
    doneBtn: 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm shadow-amber-500/20',
    durationBadge: 'text-amber-600 dark:text-amber-400',
  },
  primary: {
    triggerRing: 'ring-2 ring-primary-500/35 border-primary-500/60',
    triggerBorderFocus: 'border-primary-500/60',
    iconBox: 'bg-primary-500/15 text-primary-600 dark:text-primary-400',
    selectedDay: 'bg-primary-500 text-white shadow-md shadow-primary-500/30 font-black scale-105',
    doneBtn: 'bg-primary-500 hover:bg-primary-600 text-white shadow-sm shadow-primary-500/20',
    durationBadge: 'text-primary-600 dark:text-primary-400',
  }
};
ACCENT_THEMES.green = ACCENT_THEMES.emerald;
ACCENT_THEMES.sky = ACCENT_THEMES.blue;
ACCENT_THEMES.orange = ACCENT_THEMES.amber;

// Helper: format Date object to 'YYYY-MM-DD'
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Helper: parse 'YYYY-MM-DD' into local Date
function parseIso(iso?: string): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Helper: shift date string by N days
function shiftDays(iso: string, days: number): string {
  const d = parseIso(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export interface DatePickerProps {
  label?: string;
  value?: string; // 'YYYY-MM-DD'
  onChange?: (date: string) => void;
  minDate?: string;
  maxDate?: string;
  placeholder?: string;
  align?: 'left' | 'right';
  className?: string;
  containerClassName?: string;
  accentColor?: AccentColor;
  disabled?: boolean;
  error?: string;
  name?: string;
  id?: string;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  label,
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = 'Select date',
  align = 'left',
  className = '',
  containerClassName = '',
  accentColor = 'primary',
  disabled = false,
  error,
  name,
  id
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const theme = ACCENT_THEMES[accentColor] || ACCENT_THEMES.primary;

  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const popoverWidth = isMobile ? Math.min(window.innerWidth - 24, 320) : 320;

    let left: number;
    if (align === 'right') {
      left = rect.right - popoverWidth;
    } else {
      left = rect.left;
    }
    // Clamp horizontally within viewport
    left = Math.max(12, Math.min((typeof window !== 'undefined' ? window.innerWidth : 360) - popoverWidth - 12, left));

    const popoverHeight = popoverRef.current?.offsetHeight || 340;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top: number;
    if (spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
      // Flip upwards if not enough room below and more room above
      top = Math.max(12, rect.top - popoverHeight - 8);
    } else {
      top = rect.bottom + 8;
      // Clamp to viewport if bottom goes past screen
      if (top + popoverHeight > window.innerHeight - 12) {
        top = Math.max(12, window.innerHeight - popoverHeight - 12);
      }
    }

    setCoords({ top, left, width: popoverWidth });
  }, [align]);

  // Calendar month/year navigation state
  const initialDate = parseIso(value) || parseIso(minDate) || new Date();
  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth());

  // Sync calendar view month when value changes
  useEffect(() => {
    if (value) {
      const parsed = parseIso(value);
      if (parsed) {
        setViewYear(parsed.getFullYear());
        setViewMonth(parsed.getMonth());
      }
    }
  }, [value]);

  // Reposition on scroll / resize & handle dismiss
  useEffect(() => {
    if (!isOpen) return;

    updatePosition();
    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        popoverRef.current && !popoverRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, updatePosition]);

  // Month navigation
  const prevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewYear(y => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const nextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewYear(y => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth(m => m + 1);
    }
  };


  // Date selection
  const handleSelectDate = (dateStr: string) => {
    if (minDate && dateStr < minDate) return;
    if (maxDate && dateStr > maxDate) return;
    onChange?.(dateStr);
    setIsOpen(false);
  };

  // Quick Today shortcut
  const handleSelectToday = () => {
    const todayStr = toIsoDate(new Date());
    if (minDate && todayStr < minDate) return;
    if (maxDate && todayStr > maxDate) return;
    onChange?.(todayStr);
    setIsOpen(false);
  };

  // Days calculations
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
  // Adjust so Monday is 0, Sunday is 6
  const firstDayOfWeek = (firstDayIndex + 6) % 7;

  const monthTitle = new Date(viewYear, viewMonth, 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric'
  });

  return (
    <div ref={containerRef} className={`relative flex flex-col gap-1.5 w-full ${containerClassName}`}>
      {label && (
        <label className="block text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
          {label}
        </label>
      )}

      {/* Hidden input for form submits */}
      {name && <input type="hidden" name={name} id={id} value={value || ''} />}

      {/* Trigger Capsule (Liquid Glass Pill) */}
      <GlassPanel
        className={`wg-glass-pill w-full transition-all duration-180 ease-glass ${
          error
            ? '!border-rose-500 ring-2 ring-rose-500/20'
            : isOpen
            ? theme.triggerRing
            : 'border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20'
        } ${disabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer'} ${className}`}
        padding="0px"
        overrides={{ borderRadius: 20 }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className="flex items-center min-h-[44px] h-11 px-3 w-full gap-2.5 select-none">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {/* Calendar Icon */}
            <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${theme.iconBox}`}>
              <CalendarBlank className="w-4 h-4" weight="duotone" />
            </div>

            {/* Date Display */}
            <div className="min-w-0 flex-1">
              <span className={`text-xs font-bold truncate block leading-tight ${
                value ? 'text-light-text dark:text-dark-text' : 'text-light-text-secondary/60 dark:text-dark-text-secondary/60 font-medium'
              }`}>
                {value ? formatDate(value, 'weekday-short') : placeholder}
              </span>
            </div>
          </div>
        </div>
      </GlassPanel>

      {error && <p className="text-2xs text-rose-500 font-bold ml-1">{error}</p>}

      {/* Dropdown Calendar Popover: Rendered via Portal with true Liquid Glass */}
      {isOpen && coords && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            width: coords.width,
            zIndex: 70, // z-popover
          }}
          className="z-popover animate-fadeIn select-none"
        >
          <GlassPanel
            className="wg-glass-card shadow-2xl overflow-hidden border border-black/10 dark:border-white/15"
            padding="16px"
            overrides={{ borderRadius: 24 }}
          >
            <div className="flex flex-col w-full">
              {/* Popover Header: Month Title & Arrows */}
              <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/5">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-light-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  title="Previous month"
                >
                  <CaretLeft className="w-4 h-4" weight="bold" />
                </button>

                <h4 className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">
                  {monthTitle}
                </h4>

                <button
                  type="button"
                  onClick={nextMonth}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-light-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  title="Next month"
                >
                  <CaretRight className="w-4 h-4" weight="bold" />
                </button>
              </div>

              {/* Weekday Header Row */}
              <div className="grid grid-cols-7 gap-1 text-center py-2">
                {WEEKDAYS.map((w, idx) => (
                  <div key={idx} className="text-3xs font-extrabold text-light-text-secondary dark:text-dark-text-secondary">
                    {w}
                  </div>
                ))}
              </div>

              {/* Days Grid */}
              <div className="grid grid-cols-7 gap-y-1 gap-x-0 pt-1">
                {/* Empty leading slots */}
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-8" />
                ))}

                {/* Days in Month */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const d = new Date(viewYear, viewMonth, day);
                  const dateStr = toIsoDate(d);
                  const isSelected = value === dateStr;

                  const isDisabled = Boolean(
                    (minDate && dateStr < minDate) ||
                    (maxDate && dateStr > maxDate)
                  );

                  return (
                    <div key={dateStr} className="h-8 flex items-center justify-center">
                      <button
                        type="button"
                        disabled={isDisabled}
                        onClick={() => handleSelectDate(dateStr)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all relative z-10 cursor-pointer ${
                          isSelected
                            ? theme.selectedDay
                            : isDisabled
                            ? 'opacity-20 cursor-not-allowed text-light-text-secondary dark:text-dark-text-secondary'
                            : 'text-light-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/10'
                        }`}
                      >
                        {day}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Popover Footer: Quick Today shortcut & Done button */}
              <div className="flex items-center justify-between pt-3 mt-3 border-t border-black/5 dark:border-white/5">
                <button
                  type="button"
                  onClick={handleSelectToday}
                  className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text underline underline-offset-2 cursor-pointer"
                >
                  Today
                </button>
                <GlassButton
                  variant="primary"
                  color={accentColor}
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  icon={<Check className="w-3.5 h-3.5" weight="bold" />}
                >
                  Done
                </GlassButton>
              </div>
            </div>
          </GlassPanel>
        </div>,
        document.body
      )}
    </div>
  );
};

export default DatePicker;
