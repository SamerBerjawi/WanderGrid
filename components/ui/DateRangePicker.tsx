import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CaretLeft, CaretRight, CalendarBlank, Check, X } from '@phosphor-icons/react';
import GlassPanel from '../glass/GlassPanel';
import { formatDate } from '../../utils/formatters';
import { SECTION_LABEL_STYLE } from '../../constants';

export type AccentColor = 'emerald' | 'green' | 'blue' | 'sky' | 'amber' | 'orange' | 'primary';

export interface DateRangePickerProps {
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;   // 'YYYY-MM-DD'
  onChange: (start: string, end: string) => void;
  startLabel?: string;
  endLabel?: string;
  minDate?: string;
  maxDate?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  singleDate?: boolean;
  align?: 'left' | 'right';
  accentColor?: AccentColor;
}

interface AccentTheme {
  triggerRing: string;
  triggerBorderFocus: string;
  activeSegment: string;
  iconBox: string;
  calendarActiveTab: string;
  startDay: string;
  endDay: string;
  rangeBand: string;
  doneBtn: string;
  durationBadge: string;
}

const ACCENT_THEMES: Record<string, AccentTheme> = {
  emerald: {
    triggerRing: 'ring-2 ring-emerald-500/35 border-emerald-500/60',
    triggerBorderFocus: 'border-emerald-500/60',
    activeSegment: 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300',
    iconBox: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    calendarActiveTab: 'bg-emerald-500 text-white shadow-xs font-bold',
    startDay: 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30 font-black scale-105',
    endDay: 'border-2 border-emerald-500 bg-white dark:bg-[#121820] text-emerald-600 dark:text-emerald-400 font-black scale-105',
    rangeBand: 'bg-emerald-500/15 dark:bg-emerald-500/25',
    doneBtn: 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-500/20',
    durationBadge: 'text-emerald-600 dark:text-emerald-400',
  },
  blue: {
    triggerRing: 'ring-2 ring-sky-500/35 border-sky-500/60',
    triggerBorderFocus: 'border-sky-500/60',
    activeSegment: 'bg-sky-500/15 border border-sky-500/40 text-sky-700 dark:text-sky-300',
    iconBox: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
    calendarActiveTab: 'bg-sky-500 text-white shadow-xs font-bold',
    startDay: 'bg-sky-500 text-white shadow-md shadow-sky-500/30 font-black scale-105',
    endDay: 'border-2 border-sky-500 bg-white dark:bg-[#121820] text-sky-600 dark:text-sky-400 font-black scale-105',
    rangeBand: 'bg-sky-500/15 dark:bg-sky-500/25',
    doneBtn: 'bg-sky-500 hover:bg-sky-600 text-white shadow-sm shadow-sky-500/20',
    durationBadge: 'text-sky-600 dark:text-sky-400',
  },
  amber: {
    triggerRing: 'ring-2 ring-amber-500/35 border-amber-500/60',
    triggerBorderFocus: 'border-amber-500/60',
    activeSegment: 'bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-300',
    iconBox: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    calendarActiveTab: 'bg-amber-500 text-white shadow-xs font-bold',
    startDay: 'bg-amber-500 text-white shadow-md shadow-amber-500/30 font-black scale-105',
    endDay: 'border-2 border-amber-500 bg-white dark:bg-[#121820] text-amber-600 dark:text-amber-400 font-black scale-105',
    rangeBand: 'bg-amber-500/15 dark:bg-amber-500/25',
    doneBtn: 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm shadow-amber-500/20',
    durationBadge: 'text-amber-600 dark:text-amber-400',
  },
  primary: {
    triggerRing: 'ring-2 ring-primary-500/35 border-primary-500/60',
    triggerBorderFocus: 'border-primary-500/60',
    activeSegment: 'bg-primary-500/15 border border-primary-500/40 text-primary-700 dark:text-primary-300',
    iconBox: 'bg-primary-500/15 text-primary-600 dark:text-primary-400',
    calendarActiveTab: 'bg-primary-500 text-white shadow-xs font-bold',
    startDay: 'bg-primary-500 text-white shadow-md shadow-primary-500/30 font-black scale-105',
    endDay: 'border-2 border-primary-500 bg-white dark:bg-[#121820] text-primary-600 dark:text-primary-400 font-black scale-105',
    rangeBand: 'bg-primary-500/15 dark:bg-primary-500/25',
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

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
  startLabel = 'Start Date',
  endLabel = 'End Date',
  minDate,
  maxDate,
  label,
  className = '',
  disabled = false,
  singleDate = false,
  align = 'left',
  accentColor = 'primary',
}) => {
  const theme = ACCENT_THEMES[accentColor] || ACCENT_THEMES.primary;
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'start' | 'end'>('start');
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  // Calendar month view state
  const initialDate = parseIso(startDate) || new Date();
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth()); // 0-indexed

  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const popoverWidth = isMobile ? Math.min(window.innerWidth - 24, 350) : 350;

    let left: number;
    if (align === 'right') {
      left = rect.right - popoverWidth;
    } else {
      left = rect.left;
    }
    // Clamp horizontally within viewport
    left = Math.max(12, Math.min((typeof window !== 'undefined' ? window.innerWidth : 360) - popoverWidth - 12, left));

    const popoverHeight = popoverRef.current?.offsetHeight || 380;
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

  // Sync calendar view month when picker opens
  useEffect(() => {
    if (isOpen) {
      const targetDate = (!singleDate && activeTab === 'end') ? (parseIso(endDate) || parseIso(startDate)) : parseIso(startDate);
      if (targetDate) {
        setViewYear(targetDate.getFullYear());
        setViewMonth(targetDate.getMonth());
      }
    }
  }, [isOpen, activeTab, singleDate]);

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

  // Handle month navigation
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

  // Stepper handlers for start date
  const handleNudgeStart = (e: React.MouseEvent, days: number) => {
    e.stopPropagation();
    const nextStart = shiftDays(startDate, days);
    if (minDate && nextStart < minDate) return;
    if (singleDate) {
      onChange(nextStart, nextStart);
    } else if (endDate && nextStart > endDate) {
      onChange(nextStart, nextStart);
    } else {
      onChange(nextStart, endDate || nextStart);
    }
  };

  // Stepper handlers for end date
  const handleNudgeEnd = (e: React.MouseEvent, days: number) => {
    e.stopPropagation();
    const nextEnd = shiftDays(endDate || startDate, days);
    if (startDate && nextEnd < startDate) return;
    onChange(startDate, nextEnd);
  };

  // Handle click on a calendar date cell
  const handleSelectDate = (dateStr: string) => {
    if (minDate && dateStr < minDate) return;
    if (maxDate && dateStr > maxDate) return;

    if (singleDate) {
      onChange(dateStr, dateStr);
      setIsOpen(false);
      return;
    }

    if (activeTab === 'start') {
      if (endDate && dateStr > endDate) {
        // If chosen start date is after current end date, push end date with it
        onChange(dateStr, dateStr);
      } else {
        onChange(dateStr, endDate);
      }
      setActiveTab('end');
    } else {
      // Picking end date
      if (startDate && dateStr < startDate) {
        // If clicked date is before start date, restart from this date
        onChange(dateStr, '');
        setActiveTab('end');
      } else {
        onChange(startDate, dateStr);
        setIsOpen(false);
      }
    }
  };

  // Generate calendar days for current view
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Monday start: 0 = Mon, 6 = Sun
  const firstDayOfWeek = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;

  // Calculate nights count
  const sDate = parseIso(startDate);
  const eDate = parseIso(endDate);
  const nights = (sDate && eDate && eDate >= sDate)
    ? Math.round((eDate.getTime() - sDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const monthTitle = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className={`flex flex-col gap-1.5 w-full relative ${className}`} ref={containerRef}>
      {label && <label className={SECTION_LABEL_STYLE}>{label}</label>}

      {/* Trigger: Unified Liquid-Glass Capsule (Google Flights Style) */}
      <GlassPanel
        className={`wg-glass-pill w-full transition-all duration-180 ease-glass border-black/10 dark:border-white/10 ${
          isOpen ? theme.triggerRing : ''
        } ${disabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}
        padding="0px"
        overrides={{ borderRadius: 20 }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className="flex items-center min-h-[44px] h-11 px-2.5 sm:px-3 w-full gap-1.5 sm:gap-2 select-none">
          {/* Calendar Icon */}
          <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${theme.iconBox}`}>
            <CalendarBlank className="w-4 h-4" weight="duotone" />
          </div>

          {/* Start Date Section */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              setActiveTab('start');
              setIsOpen(true);
            }}
            className={`flex-1 flex items-center justify-between min-w-0 px-2 py-1 rounded-xl transition-all ${
              isOpen && activeTab === 'start'
                ? theme.activeSegment
                : 'hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <div className="min-w-0 pr-1">
              <span className="text-3xs uppercase font-extrabold tracking-wider text-light-text-secondary/60 dark:text-dark-text-secondary/60 block leading-tight">
                {startLabel}
              </span>
              <span className="text-xs font-bold text-light-text dark:text-dark-text truncate block leading-tight">
                {startDate ? formatDate(startDate, 'weekday-short') : 'Select date'}
              </span>
            </div>
            {startDate && (
              <div className="flex items-center gap-0.5 shrink-0 opacity-40 hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={(e) => handleNudgeStart(e, -1)}
                  className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                  title="Previous day"
                >
                  <CaretLeft className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={(e) => handleNudgeStart(e, 1)}
                  className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                  title="Next day"
                >
                  <CaretRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Hairline Divider & End Date Section (Only for Range mode) */}
          {!singleDate && (
            <>
              <div className="h-5 w-[1px] bg-black/10 dark:bg-white/10 shrink-0" />
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('end');
                  setIsOpen(true);
                }}
                className={`flex-1 flex items-center justify-between min-w-0 px-2 py-1 rounded-xl transition-all ${
                  isOpen && activeTab === 'end'
                    ? theme.activeSegment
                    : 'hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <div className="min-w-0 pr-1">
                  <span className="text-3xs uppercase font-extrabold tracking-wider text-light-text-secondary/60 dark:text-dark-text-secondary/60 block leading-tight">
                    {endLabel}
                  </span>
                  <span className="text-xs font-bold text-light-text dark:text-dark-text truncate block leading-tight">
                    {endDate ? formatDate(endDate, 'weekday-short') : 'Select return'}
                  </span>
                </div>
                {endDate && (
                  <div className="flex items-center gap-0.5 shrink-0 opacity-40 hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => handleNudgeEnd(e, -1)}
                      className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                      title="Previous day"
                    >
                      <CaretLeft className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleNudgeEnd(e, 1)}
                      className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                      title="Next day"
                    >
                      <CaretRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </GlassPanel>

      {/* Dropdown Calendar Popover: Rendered via Portal to eliminate overflow clipping */}
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
          className="z-popover animate-fadeIn bg-white dark:bg-[#121820] border border-black/10 dark:border-white/15 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.8)] rounded-3xl p-4 select-none"
        >
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

          {/* Selection Status Tab Switcher in Popover (Only for Range mode) */}
          {!singleDate && (
            <div className="grid grid-cols-2 gap-1.5 p-1 my-3 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5">
              <button
                type="button"
                onClick={() => setActiveTab('start')}
                className={`py-1.5 px-2 rounded-lg text-2xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  activeTab === 'start'
                    ? theme.calendarActiveTab
                    : 'text-light-text-secondary dark:text-dark-text-secondary opacity-70 hover:opacity-100'
                }`}
              >
                1. {startLabel}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('end')}
                className={`py-1.5 px-2 rounded-lg text-2xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  activeTab === 'end'
                    ? theme.calendarActiveTab
                    : 'text-light-text-secondary dark:text-dark-text-secondary opacity-70 hover:opacity-100'
                }`}
              >
                2. {endLabel}
              </button>
            </div>
          )}

          {/* Weekday Header Row */}
          <div className="grid grid-cols-7 gap-1 text-center py-1">
            {WEEKDAYS.map((w, idx) => (
              <div key={idx} className="text-3xs font-extrabold text-light-text-secondary/60 dark:text-dark-text-secondary/60">
                {w}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-y-1.5 gap-x-0 pt-1" onMouseLeave={() => setHoverDate(null)}>
            {/* Empty leading day slots */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="h-8" />
            ))}

            {/* Month Days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const d = new Date(viewYear, viewMonth, day);
              const dateStr = toIsoDate(d);

              const isStart = startDate === dateStr;
              const isEnd = !singleDate && endDate === dateStr;
              const effectiveEnd = (!singleDate && activeTab === 'end' && hoverDate && hoverDate >= startDate) ? hoverDate : endDate;

              const isInRange = Boolean(
                !singleDate &&
                startDate &&
                effectiveEnd &&
                dateStr > startDate &&
                dateStr < effectiveEnd
              );

              const isDisabled = Boolean(
                (minDate && dateStr < minDate) ||
                (maxDate && dateStr > maxDate)
              );

              return (
                <div
                  key={dateStr}
                  onMouseEnter={() => !isDisabled && setHoverDate(dateStr)}
                  className={`relative h-8 flex items-center justify-center ${
                    isInRange ? theme.rangeBand : ''
                  } ${isStart && !singleDate && effectiveEnd && effectiveEnd > startDate ? `rounded-l-full ${theme.rangeBand}` : ''} ${
                    isEnd && startDate && dateStr > startDate ? `rounded-r-full ${theme.rangeBand}` : ''
                  }`}
                >
                  <button
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleSelectDate(dateStr)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all relative z-10 cursor-pointer ${
                      isStart
                        ? theme.startDay
                        : isEnd
                        ? theme.endDay
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

          {/* Popover Footer: Duration Badge and Action */}
          <div className="flex items-center justify-between pt-3 mt-3 border-t border-black/5 dark:border-white/5">
            <span className={`text-2xs font-bold ${theme.durationBadge}`}>
              {singleDate
                ? (startDate ? formatDate(startDate, 'weekday-short') : 'Select date')
                : (nights > 0 ? `${nights} ${nights === 1 ? 'day' : 'days'}` : 'Select dates')}
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className={`px-3.5 py-1.5 rounded-xl text-2xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer ${theme.doneBtn}`}
            >
              <span>Done</span>
              <Check className="w-3.5 h-3.5" weight="bold" />
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default DateRangePicker;
