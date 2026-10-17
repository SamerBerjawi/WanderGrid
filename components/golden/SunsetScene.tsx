import React from 'react';
import { clsx } from 'clsx';

/** Flat sunset illustration: sun circle, layered hills and waves. Decorative only (aria-hidden). */
export const SunsetScene: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true" className={clsx('w-full h-full', className)}>
    <rect width="400" height="220" className="fill-sunset-sand dark:fill-sunset-dusk" />
    <circle cx="270" cy="96" r="58" className="fill-sunset-sun" />
    <path d="M0 150 Q70 100 140 140 T280 130 T400 140 V220 H0Z" className="fill-sunset-lilac" />
    <path d="M0 175 Q90 135 190 170 T400 160 V220 H0Z" className="fill-sunset-coral" />
    <path d="M0 200 Q50 186 100 200 T200 200 T300 200 T400 200 V220 H0Z" className="fill-sunset-teal" />
  </svg>
);

/** Round passport-style stamp with a ring, a short label and a small caption. */
export const GhStamp: React.FC<{ label: string; caption?: string; tone?: 'coral' | 'teal' | 'lilac' | 'sun'; rotate?: number }> = ({ label, caption, tone = 'coral', rotate = 0 }) => {
  const toneCls = { coral: 'bg-sunset-orange text-white', teal: 'bg-sunset-teal text-sunset-ink', lilac: 'bg-sunset-lilac text-sunset-ink', sun: 'bg-sunset-sun text-sunset-ink' }[tone];
  return (
    <div className={clsx('w-28 h-28 sm:w-32 sm:h-32 rounded-full flex flex-col items-center justify-center text-center p-3 shrink-0', toneCls)} style={{ transform: `rotate(${rotate}deg)` }}>
      <span className="text-sm sm:text-base font-black leading-tight line-clamp-2 break-words">{label}</span>
      {caption && <span className="text-2xs font-semibold uppercase tracking-wider opacity-80 mt-1">{caption}</span>}
    </div>
  );
};
