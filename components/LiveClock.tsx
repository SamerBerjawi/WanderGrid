import React, { useState, useEffect } from 'react';
import { CalendarBlank, Compass } from '@phosphor-icons/react';
import { formatDate } from '../utils/formatters';
import { GlassPanel } from './glass/GlassPanel';

interface LiveClockProps {
  settings?: any;
}

export const LiveClock: React.FC<LiveClockProps> = React.memo(({ settings }) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      {/* Mobile Compact Single Pill */}
      <div className="flex sm:hidden items-center">
        <GlassPanel className="wg-glass-pill rounded-xl py-1.5 px-3 shadow-xs flex items-center gap-2 border border-black/5 dark:border-white/10">
          <Compass className="w-3.5 h-3.5 text-primary-500 animate-[spin_24s_linear_infinite] shrink-0" weight="duotone" />
          <span className="text-xs font-mono font-bold text-light-text dark:text-dark-text">
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
          </span>
          <span className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium">
            • {formatDate(currentTime, 'weekday-short', settings)}
          </span>
        </GlassPanel>
      </div>

      {/* Desktop / Tablet Dual Pills */}
      <div className="hidden sm:flex flex-wrap items-center gap-2">
        <GlassPanel className="wg-glass-pill rounded-xl py-1.5 px-3 shadow-xs flex items-center gap-2 border border-black/5 dark:border-white/10">
          <CalendarBlank className="w-3.5 h-3.5 text-zinc-400 shrink-0" weight="duotone" />
          <span className="text-xs font-mono font-bold text-light-text dark:text-dark-text">
            {formatDate(currentTime, 'weekday-short', settings)}
          </span>
        </GlassPanel>

        <GlassPanel className="wg-glass-pill rounded-xl py-1.5 px-3 shadow-xs flex items-center gap-2 border border-black/5 dark:border-white/10">
          <Compass className="w-3.5 h-3.5 text-primary-500 animate-[spin_24s_linear_infinite] shrink-0" weight="duotone" />
          <span className="text-xs font-mono font-bold text-light-text dark:text-dark-text">
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
          </span>
        </GlassPanel>
      </div>
    </>
  );
});

LiveClock.displayName = 'LiveClock';
