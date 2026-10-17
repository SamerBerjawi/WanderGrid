import React from 'react';
import { Trip } from '../types';
import { formatDateRange } from '../utils/formatters';

interface GoldenTripHeroProps {
  trip: Trip;
  daysUntil: number | null;
  onClick?: () => void;
}

/** Golden Hour hero: the next trip as a sunset postcard. Rendered only when UI_GOLDEN_HOUR is on. */
export const GoldenTripHero: React.FC<GoldenTripHeroProps> = ({ trip, daysUntil, onClick }) => {
  const countdown = daysUntil === null ? null : daysUntil <= 0 ? 'Today' : `${daysUntil} days to go`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open ${trip.name}`}
      className="relative w-full min-h-[11rem] sm:min-h-[14rem] rounded-[28px] overflow-hidden bg-sunset-orange text-left cursor-pointer hover:scale-[1.005] transition-transform shadow-lg"
    >
      <svg viewBox="0 0 600 220" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <circle cx="500" cy="70" r="80" className="fill-sunset-sun" />
        <circle cx="80" cy="200" r="100" className="fill-sunset-coral" />
        <path d="M0 220 Q150 150 300 190 T600 160 L600 220Z" className="fill-sunset-teal" />
      </svg>
      <div className="relative h-full min-h-[11rem] sm:min-h-[14rem] p-4 sm:p-6 flex flex-col justify-between">
        <div className="flex flex-wrap gap-2">
          <span className="bg-white text-sunset-ink rounded-full px-3 py-1 text-xs font-semibold">
            {formatDateRange(trip.startDate, trip.endDate)}
          </span>
          {countdown && (
            <span className="bg-white text-sunset-ink rounded-full px-3 py-1 text-xs font-semibold">{countdown}</span>
          )}
        </div>
        <div>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight drop-shadow-sm truncate">{trip.name}</h2>
          {trip.location && <p className="text-sm sm:text-base text-white/90 font-medium truncate">{trip.location}</p>}
        </div>
      </div>
    </button>
  );
};

export default GoldenTripHero;
