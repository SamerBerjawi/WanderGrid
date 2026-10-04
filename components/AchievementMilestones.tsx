import React, { useMemo } from 'react';
import { Trophy as Award, Compass, MagnifyingGlass as Search, Sparkle as Stars, CheckCircle as CheckCircle2, Lock, Airplane as Plane, Globe, MapPin } from '@phosphor-icons/react';
import { Trip } from '../types';
import { VisitedCountry } from './PassportStamp';
import { GlassPanel } from './glass/GlassPanel';

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
          className="text-black/10 dark:text-white/10"
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
      <span className="absolute text-2xs font-bold font-mono text-light-text-secondary dark:text-dark-text-secondary">
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
        description: 'Log your first visited country.',
        icon: <Globe className="w-5 h-5 text-emerald-500" />,
        targetValue: 1,
        currentValue: visitedCountries.length,
        unit: 'country',
        badgeGradient: 'from-emerald-400 to-teal-500',
      },
      {
        id: 'continental_collector',
        title: 'Visited 5 Countries',
        description: 'Visit 5 distinct countries globally.',
        icon: <Compass className="w-5 h-5 text-amber-500" />,
        targetValue: 5,
        currentValue: visitedCountries.length,
        unit: 'countries',
        badgeGradient: 'from-amber-400 to-orange-500',
      },
      {
        id: 'frequent_flyer',
        title: 'Cloud Captain',
        description: 'Take 5 recorded flights.',
        icon: <Plane className="w-5 h-5 text-blue-500" />,
        targetValue: 5,
        currentValue: flightsCount,
        unit: 'flights',
        badgeGradient: 'from-blue-400 to-indigo-500',
      },
      {
        id: 'ten_thousand_miles',
        title: 'First 10,000 Miles',
        description: 'Log 10,000 flight miles.',
        icon: <Award className="w-5 h-5 text-purple-500" />,
        targetValue: 10000,
        currentValue: totalMiles,
        unit: 'miles',
        badgeGradient: 'from-purple-400 to-pink-500',
      },
      {
        id: 'stamped_decal',
        title: 'Sticker Collector',
        description: 'Collect 5 landmark stickers.',
        icon: <Stars className="w-5 h-5 text-yellow-500" />,
        targetValue: 5,
        currentValue: stickersCount,
        unit: 'stickers',
        badgeGradient: 'from-yellow-400 to-amber-500',
      },
      {
        id: 'megapolis_visitor',
        title: 'Urban Surveyor',
        description: 'Visit 10 distinct cities.',
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

  const unlockedCount = achievementsList.filter((a) => a.currentValue >= a.targetValue).length;

  return (
    <GlassPanel className="wg-glass-card rounded-[28px] overflow-hidden p-5 sm:p-7 border border-black/5 dark:border-white/10 shadow-xs">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-base sm:text-lg font-bold text-light-text dark:text-dark-text tracking-tight">
          Milestones
        </h3>
        <div className="text-right">
          <span className="text-2xs font-mono font-bold text-primary-600 dark:text-primary-400 bg-primary-500/10 border border-primary-500/20 px-2.5 py-1 rounded-xl uppercase tracking-wider">
            {unlockedCount} / {achievementsList.length} Unlocked
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {achievementsList.map((ach) => {
          const isUnlocked = ach.currentValue >= ach.targetValue;
          const progressPercent = Math.min(100, Math.round((ach.currentValue / ach.targetValue) * 100));

          return (
            <div
              key={ach.id}
              className={`p-4 sm:p-5 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between h-44 select-none group ${
                isUnlocked
                  ? 'bg-white/60 dark:bg-white/[0.06] border-black/10 dark:border-white/15 shadow-xs'
                  : 'bg-white/30 dark:bg-white/[0.02] border-black/5 dark:border-white/5 opacity-75'
              }`}
            >
              {/* Unlock Radial Backdrop Spot */}
              {isUnlocked && (
                <div className="absolute right-0 top-0 w-24 h-24 bg-primary-500/5 dark:bg-primary-400/5 rounded-full blur-2xl pointer-events-none -translate-y-1/2 translate-x-1/3" />
              )}

              <div className="flex gap-3 justify-between items-start relative z-10 w-full">
                <div className="flex gap-2.5 sm:gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                      isUnlocked
                        ? `bg-gradient-to-br ${ach.badgeGradient} text-white border-transparent shadow-xs`
                        : 'bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary border-black/10 dark:border-white/10'
                    }`}
                  >
                    {isUnlocked ? ach.icon : <Lock className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary" />}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs sm:text-sm font-bold text-light-text dark:text-dark-text tracking-tight flex items-center gap-1.5 leading-tight">
                      <span className="truncate" title={ach.title}>{ach.title}</span>
                      {isUnlocked && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" weight="fill" />}
                    </h4>
                    <p className="text-2xs sm:text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1 font-medium leading-normal line-clamp-2">
                      {ach.description}
                    </p>
                  </div>
                </div>

                <CircularProgress 
                  percentage={progressPercent} 
                  colorClasses={isUnlocked ? "text-emerald-500 dark:text-emerald-400" : "text-primary-500 dark:text-primary-400"}
                />
              </div>

              <div className="space-y-1.5 relative z-10">
                <div className="flex justify-between items-end text-3xs sm:text-2xs font-mono font-bold text-light-text-secondary dark:text-dark-text-secondary">
                  <span className="uppercase">
                    {isUnlocked ? 'Unlocked' : 'In Progress'}
                  </span>
                  <span>
                    {ach.currentValue.toLocaleString()} / {ach.targetValue.toLocaleString()} {ach.unit}
                  </span>
                </div>
                
                <div className="h-2 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden relative border border-black/5 dark:border-white/5">
                  <div
                    className={`h-full transition-all duration-700 ease-out rounded-full relative ${
                      isUnlocked
                        ? 'bg-gradient-to-r from-emerald-400 to-primary-500'
                        : 'bg-black/20 dark:bg-white/20'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </GlassPanel>
  );
};
