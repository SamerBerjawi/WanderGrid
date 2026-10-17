import React, { lazy, Suspense, useMemo, useState } from 'react';
import { AirplaneTakeoff, Compass } from '@/components/ui/hugeicons';
import { useWanderSync } from '../../hooks/useWanderSync';
import { dataService } from '../../services/mockDb';
import { calculateDistance } from '../../services/geocoding';
import { Trip, Transport } from '../../types';
import { formatDateRange } from '../../utils/formatters';
import { DepartureBoard } from '../../components/DepartureBoard';
import { GoldenTripHero } from '../../components/GoldenTripHero';
import { GhButton, GhCard, GhChip, GhEmpty, GhPage, GhStat } from '../../components/golden/Gh';
import type { GoldenViewProps } from './registry';

const DeckFlightMap = lazy(() => import('../../components/DeckFlightMap').then(m => ({ default: m.DeckFlightMap || m.default })));
const FlightTrackerModal = lazy(() => import('../../components/FlightTrackerModal').then(m => ({ default: m.FlightTrackerModal })));

const LEVELS = [
  { name: 'Backyard Explorer', countries: 0 },
  { name: 'Wanderer', countries: 2 },
  { name: 'Voyager', countries: 5 },
  { name: 'Globetrotter', countries: 10 },
  { name: 'Nomad', countries: 20 },
  { name: 'Citizen of the World', countries: 30 },
];

const greeting = (): string => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

const legDistance = (tr: Transport): number =>
  tr.distance || (tr.originLat && tr.originLng && tr.destLat && tr.destLng ? calculateDistance(tr.originLat, tr.originLng, tr.destLat, tr.destLng) : 0);

export const GoldenDashboard: React.FC<GoldenViewProps> = ({ onTripClick, onUserClick }) => {
  const { data: tripsData } = useWanderSync<Trip[]>('golden_dashboard_trips', () => dataService.getTrips(), [], { collections: ['trips'] });
  const { data: visited } = useWanderSync<any[]>('golden_dashboard_visited', () => dataService.getVisited(), [], { collections: ['visited'] });
  const trips = useMemo(() => (tripsData || []).filter(t => t.status !== 'Cancelled' && !t.archived), [tripsData]);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const user = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('wandergrid_session_user') || 'null') as { id?: string; name?: string; email?: string } | null; } catch { return null; }
  }, []);
  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'explorer';

  const today = new Date().toISOString().split('T')[0];
  const upcoming = useMemo(
    () => trips.filter(t => t.startDate && t.startDate >= today && t.status !== 'Past').sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [trips, today]
  );
  const next = upcoming[0] ?? null;
  const daysToNext = next ? Math.ceil((new Date(next.startDate).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000) : null;

  const stats = useMemo(() => {
    let flights = 0, km = 0, minutes = 0;
    const journeys: { flight: Transport; trip: Trip }[] = [];
    trips.forEach(t => (t.transports || []).forEach(tr => {
      journeys.push({ flight: tr, trip: t });
      if (tr.mode !== 'Flight' || t.status === 'Planning') return;
      flights++;
      km += legDistance(tr);
      if (tr.departureDate && tr.departureTime && tr.arrivalDate && tr.arrivalTime) {
        const diff = (new Date(`${tr.arrivalDate}T${tr.arrivalTime}`).getTime() - new Date(`${tr.departureDate}T${tr.departureTime}`).getTime()) / 60000;
        if (diff > 0) minutes += diff;
      }
    }));
    return { flights, km: Math.round(km), hours: Math.round(minutes / 60), journeys };
  }, [trips]);

  const countries = (visited || []).length;
  const levelIdx = Math.max(0, LEVELS.map(l => l.countries).reduce((acc, c, i) => (countries >= c ? i : acc), 0));
  const level = LEVELS[levelIdx];
  const nextLevel = LEVELS[levelIdx + 1];
  const progress = nextLevel ? Math.min(100, Math.round(((countries - level.countries) / (nextLevel.countries - level.countries)) * 100)) : 100;

  const comingUp = useMemo(
    () => stats.journeys
      .filter(j => j.flight.departureDate >= today)
      .sort((a, b) => `${a.flight.departureDate}${a.flight.departureTime}`.localeCompare(`${b.flight.departureDate}${b.flight.departureTime}`))
      .slice(0, 6),
    [stats.journeys, today]
  );

  return (
    <GhPage
      title={`${greeting()}, ${firstName}`}
      icon={<Compass className="w-8 h-8 sm:w-12 sm:h-12" weight="duotone" />}
      action={<GhButton onClick={() => setTrackerOpen(true)} icon={<AirplaneTakeoff className="w-4 h-4" />}>Track flight</GhButton>}
    >
      {next ? (
        <GoldenTripHero trip={next} daysUntil={daysToNext} onClick={() => onTripClick?.(next.id)} />
      ) : (
        <GhEmpty title="Where next?" hint="Plan a trip and it shows up here with a countdown." />
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <GhStat label="Countries" value={countries} hint={`${Math.round((countries / 195) * 100)}% of the world`} tone="lilac" />
        <GhStat label="Distance" value={`${(stats.km / 1000).toFixed(1)}k km`} hint={`${(stats.km / 40075).toFixed(1)}x around the Earth`} tone="teal" />
        <GhStat label="Flights" value={stats.flights} hint={`${stats.hours}h in the air`} tone="sun" />
        <GhStat label="Trips" value={trips.length} hint={`${upcoming.length} ahead`} tone="coral" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
        <div className="lg:col-span-7 flex flex-col gap-4">
          {comingUp.length > 0 ? (
            <DepartureBoard items={comingUp} onSelect={item => item.trip && onTripClick?.(item.trip.id)} />
          ) : (
            <GhEmpty title="No journeys booked" hint="Flights, trains and ferries you add land on the board." />
          )}
        </div>

        <div className="lg:col-span-5 flex flex-col gap-4">
          <GhCard tone="ink">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider opacity-80">Explorer level</span>
              <GhChip tone="sun">{level.name}</GhChip>
            </div>
            <div className="text-3xl font-black tracking-tight mt-2">{countries} {countries === 1 ? 'country' : 'countries'}</div>
            <div className="h-3 rounded-full bg-white/20 mt-3 overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-sunset-sun" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-xs font-medium opacity-80 mt-2">
              {nextLevel ? `${nextLevel.countries - countries} more to reach ${nextLevel.name}` : 'Top level reached'}
            </div>
            {user?.id && onUserClick && (
              <GhButton variant="soft" className="mt-3" onClick={() => onUserClick(user.id!)}>Open passport</GhButton>
            )}
          </GhCard>

          {upcoming.slice(1, 4).map((t, i) => (
            <GhCard key={t.id} tone={(['lilac', 'teal', 'sun'] as const)[i % 3]} onClick={() => onTripClick?.(t.id)} label={`Open ${t.name}`}>
              <div className="text-lg font-black tracking-tight truncate">{t.name}</div>
              <div className="text-xs font-semibold opacity-80">{formatDateRange(t.startDate, t.endDate)}</div>
            </GhCard>
          ))}
        </div>
      </div>

      <GhCard className="p-0 overflow-hidden">
        <div className="flex items-center justify-between p-4 sm:p-5">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight">Your world</h2>
          <GhButton variant="soft" onClick={() => setShowMap(v => !v)}>{showMap ? 'Hide map' : 'Show map'}</GhButton>
        </div>
        {showMap && (
          <div className="h-[24rem] sm:h-[32rem] relative">
            <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-sm font-semibold">Loading map…</div>}>
              <DeckFlightMap
                trips={trips}
                animateRoutes={false}
                showFrequencyWeight={true}
                onTripClick={onTripClick}
                showCountries={false}
                clusterMode={false}
                visitedCountries={(visited || []).map((v: any) => v.code)}
                showGradientRoutes={true}
                showFlightRoutes={true}
                showLandSeaRoutes={true}
                projection="flat"
                elevatedRoutes={false}
                embedded={true}
              />
            </Suspense>
          </div>
        )}
      </GhCard>

      <Suspense fallback={null}>
        <FlightTrackerModal isOpen={trackerOpen} onClose={() => setTrackerOpen(false)} />
      </Suspense>
    </GhPage>
  );
};
