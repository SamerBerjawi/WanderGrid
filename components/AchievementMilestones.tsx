import React, { useMemo } from 'react';
import { Award, Compass, Search, Stars, CheckCircle2, Lock, Plane, Globe, MapPin } from 'lucide-react';
import { Trip } from '../types';
import { VisitedCountry } from './PassportStamp';

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  targetValue: number;
  currentValue: number;
  unit: string;
  badgeGradient: string;
}

interface CircularProgressProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  colorClasses?: string;
}

const CircularProgress: React.FC<CircularProgressProps> = ({
  percentage,
  size = 46,
  strokeWidth = 3.5,
  colorClasses = "text-indigo-500 font-black"
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg className="w-full h-full transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="text-zinc-150 dark:text-zinc-800"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={`${colorClasses} transition-all duration-1000 ease-out`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
        />
      </svg>
      <span className="absolute text-2xs font-bold font-mono text-zinc-650 dark:text-zinc-350">
        {percentage}%
      </span>
    </div>
  );
};

interface AchievementMilestonesProps {
  pastTrips: Trip[];
  visitedCountries: VisitedCountry[];
  totalDistanceKm: number;
  stickersCount: number;
}

export const AchievementMilestones: React.FC<AchievementMilestonesProps> = ({
  pastTrips,
  visitedCountries,
  totalDistanceKm,
  stickersCount,
}) => {
  // Convert distance from KM to Miles for specific milestones (e.g. 10,000 Miles Traveled)
  const totalMiles = Math.round(totalDistanceKm * 0.621371192);

  // Flight count
  const flightsCount = useMemo(() => {
    let count = 0;
    pastTrips.forEach((t) => {
      if (t.transports) {
        t.transports.forEach((tr) => {
          if (tr.mode === 'Flight') count++;
        });
      }
    });
    return count;
  }, [pastTrips]);

  const achievementsList: Achievement[] = useMemo(() => {
    return [
      {
        id: 'first_stamp',
        title: 'Explorer Starter',
        description: 'Record your first entry seal in a country passport ledger.',
        icon: <Globe className="w-5 h-5 text-emerald-500" />,
        targetValue: 1,
        currentValue: visitedCountries.length,
        unit: 'country',
        badgeGradient: 'from-emerald-400 to-teal-500',
      },
      {
        id: 'continental_collector',
        title: 'Visited 5 Countries',
        description: 'Pass five borders to establish your footprints globally.',
        icon: <Compass className="w-5 h-5 text-amber-500" />,
        targetValue: 5,
        currentValue: visitedCountries.length,
        unit: 'countries',
        badgeGradient: 'from-amber-400 to-orange-500',
      },
      {
        id: 'frequent_flyer',
        title: 'Cloud Captain',
        description: 'Board at least 5 commercial flight wings.',
        icon: <Plane className="w-5 h-5 text-blue-500" />,
        targetValue: 5,
        currentValue: flightsCount,
        unit: 'flights',
        badgeGradient: 'from-blue-400 to-indigo-500',
      },
      {
        id: 'ten_thousand_miles',
        title: 'First 10,000 Miles',
        description: 'Earn your initial wings with 10k real flight miles logged.',
        icon: <Award className="w-5 h-5 text-purple-500" />,
        targetValue: 10000,
        currentValue: totalMiles,
        unit: 'miles',
        badgeGradient: 'from-purple-400 to-pink-500',
      },
      {
        id: 'stamped_decal',
        title: 'Sticker Collector',
        description: 'Adhere 5 physical adhesive landmark decals to your album.',
        icon: <Stars className="w-5 h-5 text-yellow-500" />,
        targetValue: 5,
        currentValue: stickersCount,
        unit: 'stickers',
        badgeGradient: 'from-yellow-400 to-amber-500',
      },
      {
        id: 'megapolis_visitor',
        title: 'Urban Surveyor',
        description: 'Inspect ten distinct capital or metropolis city coordinates.',
        icon: <MapPin className="w-5 h-5 text-rose-500" />,
        targetValue: 10,
        currentValue: visitedCountries.reduce((citiesCount, country) => {
          const arr = country.cities instanceof Set ? Array.from(country.cities) : Array.isArray(country.cities) ? country.cities : [];
          return citiesCount + arr.length;
        }, 0),
        unit: 'cities',
        badgeGradient: 'from-rose-400 to-red-500',
      },
    ];
  }, [visitedCountries, flightsCount, totalMiles, stickersCount]);

  return (
    <div className="bg-white/70 dark:bg-zinc-900/40 backdrop-blur-md rounded-3xl border border-zinc-200/50 dark:border-white/5 p-8 shadow-sm">
      <div className="flex items-center justify-between mb-8">
        <div>
          <span className="text-2xs font-bold text-gray-400 uppercase tracking-widest block">
            Adventure Logs
          </span>
          <h3 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white capitalize flex items-center gap-2">
            Achievement Milestones 🏆
          </h3>
        </div>
        <div className="text-right">
          <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-xl uppercase tracking-wider">
            {achievementsList.filter((a) => a.currentValue >= a.targetValue).length} / {achievementsList.length} Unlocked
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {achievementsList.map((ach) => {
          const isUnlocked = ach.currentValue >= ach.targetValue;
          const progressPercent = Math.min(100, Math.round((ach.currentValue / ach.targetValue) * 100));

          return (
            <div
              key={ach.id}
              className={`p-5 rounded-3xl border transition-all relative overflow-hidden flex flex-col justify-between h-48 select-none group ${
                isUnlocked
                  ? 'bg-gradient-to-br from-zinc-50 to-white dark:from-zinc-900/60 dark:to-zinc-805/45 border-zinc-200/50 dark:border-white/5 shadow-md hover:shadow-xl'
                  : 'bg-zinc-100/30 dark:bg-zinc-900/10 border-zinc-200/35 dark:border-white/5 opacity-75'
              }`}
            >
              {/* Unlock Radial Backdrop Spot */}
              {isUnlocked && (
                <div className="absolute right-0 top-0 w-24 h-24 bg-indigo-500/5 dark:bg-indigo-400/5 rounded-full blur-2xl pointer-events-none -translate-y-1/2 translate-x-1/3" />
              )}

              <div className="flex gap-3 justify-between items-start relative z-10 w-full">
                <div className="flex gap-3 min-w-0">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border shadow-inner ${
                      isUnlocked
                        ? `bg-gradient-to-br ${ach.badgeGradient} text-white border-transparent`
                        : 'bg-zinc-100 dark:bg-zinc-850 text-zinc-400 dark:text-zinc-600 border-zinc-200 dark:border-zinc-800'
                    }`}
                  >
                    {isUnlocked ? ach.icon : <Lock className="w-4.5 h-4.5 text-zinc-400" />}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs sm:text-sm font-bold text-gray-950 dark:text-white tracking-tight flex items-center gap-1.5 leading-tight">
                      <span className="truncate" title={ach.title}>{ach.title}</span>
                      {isUnlocked && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                    </h4>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 font-normal leading-relaxed line-clamp-2">
                      {ach.description}
                    </p>
                  </div>
                </div>

                <CircularProgress 
                  percentage={progressPercent} 
                  colorClasses={isUnlocked ? "text-emerald-500 dark:text-emerald-400" : "text-indigo-500 dark:text-indigo-400"}
                />
              </div>

              <div className="space-y-2 relative z-10">
                <div className="flex justify-between items-end text-2xs font-mono font-bold text-gray-500 dark:text-zinc-500">
                  <span className="uppercase">
                    {isUnlocked ? 'Unlocked' : 'In Progress'}
                  </span>
                  <span>
                    {ach.currentValue.toLocaleString()} / {ach.targetValue.toLocaleString()} {ach.unit}
                  </span>
                </div>
                
                <div className="h-3 w-full bg-zinc-100 dark:bg-white/5 rounded-full overflow-hidden relative border border-white/5 shadow-inner">
                  <div
                    className={`h-full transition-all duration-1000 ease-out rounded-full relative ${
                      isUnlocked
                        ? 'bg-gradient-to-r from-emerald-400 to-indigo-500'
                        : 'bg-zinc-400/50 dark:bg-zinc-700/50'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
