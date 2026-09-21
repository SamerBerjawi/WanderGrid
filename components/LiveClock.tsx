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
    <div className="flex flex-wrap items-center gap-3">
      <GlassPanel className="wg-glass-pill rounded-xl py-2 px-4 shadow-sm flex items-center gap-3">
        <CalendarBlank className="w-4 h-4 text-zinc-400" weight="duotone" />
        <div className="text-left font-mono">
          <span className="block text-2xs text-light-text-secondary dark:text-dark-text-secondary uppercase font-bold tracking-widest leading-none mb-0.5">Chronometer</span>
          <span className="text-xs font-bold text-light-text dark:text-dark-text">
            {formatDate(currentTime, 'weekday-short', settings)}
          </span>
        </div>
      </GlassPanel>

      <GlassPanel className="wg-glass-pill rounded-xl py-2 px-4 shadow-sm flex items-center gap-3">
        <Compass className="w-4 h-4 text-primary-500 animate-[spin_24s_linear_infinite]" weight="duotone" />
        <div className="text-left font-mono">
          <span className="block text-2xs text-light-text-secondary dark:text-dark-text-secondary uppercase font-bold tracking-widest leading-none mb-0.5">World Time</span>
          <span className="text-xs font-bold text-light-text dark:text-dark-text">
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
          </span>
        </div>
      </GlassPanel>
    </div>
  );
});

LiveClock.displayName = 'LiveClock';
