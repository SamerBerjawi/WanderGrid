import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { ArrowLeft, Bed, CalendarBlank, FilmStrip, MapPin, PencilSimple, X, AirplaneTilt } from '@/components/ui/hugeicons';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { toast } from '../../services/toast';
import { dataService } from '../../services/mockDb';
import { calendarService } from '../../services/calendarExport';
import { syncPitStopsToVisited } from '../../services/pitStopSync';
import { invalidateGlobalWanderCache } from '../../hooks/useWanderSync';
import { Accommodation, Activity, EntitlementType, LocationEntry, PackingItem, PublicHoliday, Transport, Trip, User, WorkspaceSettings } from '../../types';
import { calculateTransportCost, formatCurrency, formatDateRange } from '../../utils/formatters';
import { Modal } from '../../components/ui';
import { TransportConfigurator } from '../../components/FlightConfigurator';
import { AccommodationConfigurator } from '../../components/AccommodationConfigurator';
import { ExcursionConfigurator } from '../../components/ExcursionConfigurator';
import { LocationManager } from '../../components/LocationManager';
import { TripModal } from '../../components/TripModal';
import { GhButton, GhCard, GhChip, GhEmpty, GhStat, GhTabs } from '../../components/golden/Gh';
import { GoldenPacking } from '../../components/golden/GoldenPacking';
import { GoldenGuide } from '../../components/golden/GoldenGuide';
import { BookingsTab, BudgetTab, DaysTab } from '../../components/golden/GoldenTripTabs';
import { TripIcon, getTripDates, todayString, useTripWeather, weatherDescription, weatherIconName } from '../../components/golden/tripUtils';
import type { GoldenViewProps } from './registry';

const DeckFlightMap = React.lazy(() => import('../../components/DeckFlightMap').then(m => ({ default: m.DeckFlightMap || m.default })));
const FlightImportWizard = React.lazy(() => import('../../components/FlightImportWizard').then(m => ({ default: m.FlightImportWizard })));

const TABS = [
  { id: 'planner', label: 'Days' },
  { id: 'route', label: 'Route' },
  { id: 'itinerary', label: 'Bookings' },
  { id: 'budget', label: 'Budget' },
  { id: 'packing', label: 'Packing' },
  { id: 'intel', label: 'Guide' },
];

const dayMs = 86_400_000;

const HeroButton: React.FC<{ label: string; short?: string; onClick: () => void; icon: React.ReactNode }> = ({ label, short, onClick, icon }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className="min-w-[44px] min-h-[44px] px-3 sm:px-4 rounded-full bg-white text-sunset-ink shadow-card inline-flex items-center justify-center gap-2 text-sm font-semibold cursor-pointer active:scale-95 transition-transform"
  >
    {icon}
    <span className="hidden sm:inline whitespace-nowrap">{short || label}</span>
  </button>
);

/** Golden Hour redesign of the trip page. Data loading and every handler mirror views/TripDetail.tsx. */
export const GoldenTripDetail: React.FC<GoldenViewProps> = ({ tripId = '', onBack = () => {} }) => {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [, setEntitlements] = useState<EntitlementType[]>([]);
  const [, setHolidays] = useState<PublicHoliday[]>([]);
  const [standaloneFlights, setStandaloneFlights] = useState<any[]>([]);
  const [isAssigningFlights, setIsAssigningFlights] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('planner');

  const [isTransportModalOpen, setIsTransportModalOpen] = useState(false);
  const [isAccommodationModalOpen, setIsAccommodationModalOpen] = useState(false);
  const [isEditTripOpen, setIsEditTripOpen] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isCinematicOpen, setIsCinematicOpen] = useState(false);
  const [isImportWizardOpen, setIsImportWizardOpen] = useState(false);
  const closeCinematic = useCallback(() => setIsCinematicOpen(false), []);
  useEscapeKey(isCinematicOpen, closeCinematic);

  const [selectedActivityForModal, setSelectedActivityForModal] = useState<Activity | null>(null);
  const [currentDayForActivity, setCurrentDayForActivity] = useState('');
  const [selectedDateForModal, setSelectedDateForModal] = useState<string | null>(null);
  const [editingTransports, setEditingTransports] = useState<Transport[] | null>(null);
  const [editingAccommodations, setEditingAccommodations] = useState<Accommodation[] | null>(null);

  const { weather } = useTripWeather(trip);

  // Loading a trip is read-only. Standalone flights inside the trip dates are only offered for assignment.
  const loadData = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    return Promise.all([
      dataService.getTrips(), dataService.getUsers(), dataService.getWorkspaceSettings(),
      dataService.getEntitlementTypes(), dataService.getSavedConfigs(), dataService.getFlights(),
    ]).then(([tripsList, allUsers, s, ents, configs, independentFlights]) => {
      setTrip(tripsList.find(x => x.id === tripId) || null);
      setUsers(allUsers);
      setSettings(s);
      setEntitlements(ents);
      setStandaloneFlights(independentFlights || []);
      setHolidays((configs || []).flatMap(c => (c.holidays ?? []).map(h => ({ ...h, configId: c.id }))));
      setLoading(false);
    }).catch(err => {
      console.error('Failed to load trip details:', err);
      setLoadError(err?.message || 'Could not load this trip.');
      setLoading(false);
    });
  }, [tripId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const matchingFlights = useMemo(() => {
    if (!trip?.startDate || !trip?.endDate) return [];
    const start = trip.startDate.slice(0, 10);
    const end = trip.endDate.slice(0, 10);
    const already = new Set((trip.transports || []).map(tr => tr.id));
    return standaloneFlights.filter(f =>
      (!f.tripId || f.tripId === 'unassigned') && typeof f.departureDate === 'string' &&
      f.departureDate.slice(0, 10) >= start && f.departureDate.slice(0, 10) <= end && !already.has(f.id));
  }, [trip, standaloneFlights]);

  const handleAssignMatchingFlights = async () => {
    if (!trip || matchingFlights.length === 0) return;
    setIsAssigningFlights(true);
    try {
      await dataService.applyBatch({
        upsertTrips: [{ ...trip, transports: [...(trip.transports || []), ...matchingFlights.map(f => ({ ...f, mode: 'Flight' as const }))] }],
        deleteFlights: matchingFlights.map(f => f.id),
      });
      await loadData();
    } catch (err: any) {
      toast.error(`Could not add the flights to this trip. Nothing was changed. ${err?.message || ''}`.trim());
    } finally {
      setIsAssigningFlights(false);
    }
  };

  const afterSave = (saved: Trip) => {
    invalidateGlobalWanderCache();
    window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
    setTrip(saved);
  };

  const handleUpdateTrip = async (updatedTrip: Trip) => {
    if (!trip) return;
    const finalTrip = { ...trip, ...updatedTrip };
    await dataService.updateTrip(finalTrip);
    setTrip(finalTrip);
    setIsEditTripOpen(false);
  };

  const handleUpdatePackingList = async (items: PackingItem[]) => {
    if (!trip) return;
    const updatedTrip = { ...trip, packingList: items };
    await dataService.updateTrip(updatedTrip);
    setTrip(updatedTrip);
  };

  const handleDeleteTrip = async (id: string) => { await dataService.deleteTrip(id); onBack(); };
  const handleArchiveTrip = async (id: string) => { await dataService.setTripsArchived([id], true); onBack(); };

  const handleSaveTransports = async (newTransports: Transport[]) => {
    if (!trip) return;
    let updated = [...(trip.transports || [])];
    if (editingTransports && editingTransports.length > 0) {
      const oldIds = new Set(editingTransports.map(f => f.id));
      updated = updated.filter(f => !oldIds.has(f.id));
    }
    updated = [...updated, ...newTransports];
    for (const t of newTransports) {
      if (t.waypoints && t.waypoints.length > 0) {
        void syncPitStopsToVisited(t.waypoints, { date: t.departureDate, origin: t.origin, destination: t.destination });
      }
    }
    afterSave(await dataService.updateTrip({ ...trip, transports: updated }));
    setIsTransportModalOpen(false);
    setEditingTransports(null);
  };

  const handleDeleteTransports = async (ids: string[]) => {
    if (!trip) return;
    const deleted = (trip.transports || []).filter(f => ids.includes(f.id));
    const remaining = (trip.transports || []).filter(f => !ids.includes(f.id)).map(t => ({ ...t }));
    // A deleted leg's cost moves to the first remaining leg of the same itinerary.
    for (const d of deleted) {
      if (d.itineraryId && (d.cost || 0) > 0) {
        const leg = remaining.find(t => t.itineraryId === d.itineraryId);
        if (leg && (!leg.cost || leg.cost === 0)) leg.cost = d.cost;
      }
    }
    const updatedTrip = { ...trip, transports: remaining };
    await dataService.updateTrip(updatedTrip);
    afterSave(updatedTrip);
    setIsTransportModalOpen(false);
    setEditingTransports(null);
  };

  const handleSaveAccommodations = async (items: Accommodation[]) => {
    if (!trip) return;
    const updatedTrip = { ...trip, accommodations: items };
    await dataService.updateTrip(updatedTrip);
    afterSave(updatedTrip);
    setIsAccommodationModalOpen(false);
  };

  const handleDeleteAccommodations = async (_ids: string[]) => {
    if (!trip) return;
    const updatedTrip = { ...trip, accommodations: [] };
    await dataService.updateTrip(updatedTrip);
    afterSave(updatedTrip);
    setIsAccommodationModalOpen(false);
  };

  const handleSaveRoute = async (items: LocationEntry[], finalTransports: Transport[]) => {
    if (!trip) return;
    // Keep transports the route manager did not manage; drop managed ones that were omitted (deleted).
    const finalIds = new Set(finalTransports.map(t => t.id));
    const preserved = (trip.transports || []).filter(t => {
      if (finalIds.has(t.id)) return false;
      if (t.mode !== 'Flight' || t.isExcursion || t.itineraryId === 'route-gen' || t.itineraryId === 'route-booked' || t.customFields?.some(f => f.key === 'legId')) return false;
      return true;
    });
    afterSave(await dataService.updateTrip({ ...trip, locations: items, transports: [...preserved, ...finalTransports] }));
  };

  const handleOpenActivityModal = (dateStr: string, existing?: Activity) => {
    setCurrentDayForActivity(dateStr);
    setSelectedActivityForModal(existing || null);
    setIsActivityModalOpen(true);
  };

  const handleSaveActivity = async (newActivity: Activity) => {
    if (!trip || !newActivity.title || !newActivity.date) return;
    const activities = [...(trip.activities || [])];
    const idx = activities.findIndex(a => a.id === newActivity.id);
    if (idx >= 0) activities[idx] = newActivity; else activities.push(newActivity);
    const updatedTrip = { ...trip, activities };
    await dataService.updateTrip(updatedTrip);
    afterSave(updatedTrip);
    setIsActivityModalOpen(false);
    setSelectedActivityForModal(null);
  };

  const handleDeleteActivity = async (activityId: string) => {
    if (!trip) return;
    const updatedTrip = { ...trip, activities: (trip.activities || []).filter(a => a.id !== activityId) };
    await dataService.updateTrip(updatedTrip);
    afterSave(updatedTrip);
    setIsActivityModalOpen(false);
    setSelectedActivityForModal(null);
  };

  const handleAddToCalendar = () => {
    if (!trip) return;
    const ics = calendarService.generateIcsContent([trip], 'WanderGrid');
    calendarService.downloadIcs(ics, `trip-${trip.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.ics`);
  };

  const openTransportModal = (set?: Transport[], date?: string) => {
    setEditingTransports(set && set.length > 0 ? set : null);
    setSelectedDateForModal(date || null);
    setIsTransportModalOpen(true);
  };

  const openAccommodationModal = (date?: string) => {
    setEditingAccommodations(trip?.accommodations || []);
    setSelectedDateForModal(date || null);
    setIsAccommodationModalOpen(true);
  };

  if (loading) return <div className="p-8 font-bold text-sunset-ink dark:text-white animate-pulse">Packing the postcard…</div>;

  if (loadError) {
    return (
      <div className="w-full max-w-xl mx-auto pt-12 px-4">
        <GhEmpty title="Couldn't load this trip" hint={loadError} action={<GhButton onClick={() => { void loadData(); }}>Try again</GhButton>} />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="w-full max-w-xl mx-auto pt-12 px-4">
        <GhEmpty title="Trip not found" hint="This trip could not be found or may have been removed." action={<GhButton onClick={onBack}>Back to the planner</GhButton>} />
      </div>
    );
  }

  const activityCost = trip.activities?.reduce((sum, a) => sum + (a.cost || 0), 0) || 0;
  const transportCost = calculateTransportCost(trip.transports);
  const stayCost = trip.accommodations?.reduce((sum, a) => sum + (a.cost || 0), 0) || 0;
  const totalCost = transportCost + stayCost + activityCost;
  const duration = Math.ceil((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / dayMs) + 1;
  const totalDistance = trip.transports?.reduce((sum, t) => sum + (t.distance || 0), 0) || 0;
  const totalNightsBooked = trip.accommodations?.reduce((sum, a) => {
    if (a.checkInDate && a.checkOutDate) return sum + Math.max(0, Math.round((new Date(a.checkOutDate).getTime() - new Date(a.checkInDate).getTime()) / dayMs));
    return sum;
  }, 0) || 0;
  const bookingCount = (trip.transports || []).filter(t => t.mode !== 'Personal Car').length;
  const tripDates = getTripDates(trip);

  const destinationCoordinates: { lat: number; lng: number } | null = (() => {
    if (trip.coordinates?.lat && trip.coordinates?.lng) return { lat: trip.coordinates.lat, lng: trip.coordinates.lng };
    const last = trip.transports?.[trip.transports.length - 1];
    if (last?.destLat && last?.destLng) return { lat: last.destLat, lng: last.destLng };
    const first = trip.accommodations?.[0];
    if (first?.coordinates?.lat && first?.coordinates?.lng) return { lat: first.coordinates.lat, lng: first.coordinates.lng };
    return null;
  })();

  const today = todayString();
  const startsIn = Math.round((new Date(`${trip.startDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / dayMs);
  const countdown = today > trip.endDate ? 'Been there' : startsIn > 0 ? `${startsIn} day${startsIn === 1 ? '' : 's'} to go` : `Day ${Math.min(duration, 1 - startsIn)} of ${duration}`;
  const current = weather?.current_weather;

  return (
    <div className="w-full max-w-[1680px] mx-auto pt-2 sm:pt-4 px-2 sm:px-4 md:px-6 lg:px-8 flex flex-col gap-5 sm:gap-6 animate-fadeIn pb-16 text-sunset-ink dark:text-white">
      {/* Postcard hero */}
      <section className="relative rounded-3xl overflow-hidden bg-sunset-orange text-sunset-ink">
        <svg viewBox="0 0 600 260" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 w-full h-full" aria-hidden="true">
          <circle cx="490" cy="80" r="76" className="fill-sunset-sun" />
          <circle cx="70" cy="240" r="110" className="fill-sunset-coral" />
          <circle cx="330" cy="40" r="10" className="fill-sunset-lilac" />
          <path d="M0 260 Q150 170 300 214 T600 180 L600 260Z" className="fill-sunset-teal" />
        </svg>
        <div className="relative p-4 sm:p-8 flex flex-col gap-6 sm:gap-10 min-h-[18rem] sm:min-h-[22rem]">
          <div className="flex items-center justify-between gap-2">
            <HeroButton label="Back to planner" short="Back" onClick={onBack} icon={<ArrowLeft className="w-5 h-5" />} />
            <div className="flex gap-2">
              <HeroButton label="Cinematic" onClick={() => setIsCinematicOpen(true)} icon={<FilmStrip className="w-5 h-5" weight="duotone" />} />
              <HeroButton label="Calendar" onClick={handleAddToCalendar} icon={<CalendarBlank className="w-5 h-5" weight="duotone" />} />
              <HeroButton label="Edit" onClick={() => setIsEditTripOpen(true)} icon={<PencilSimple className="w-5 h-5" weight="duotone" />} />
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-end gap-3 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-4xl sm:text-6xl shrink-0" aria-hidden="true">{trip.icon || '✈️'}</span>
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight leading-none break-words min-w-0">{trip.name}</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              {trip.location && <GhChip className="!bg-white !text-sunset-ink"><MapPin className="w-3.5 h-3.5" />{trip.location}</GhChip>}
              <GhChip className="!bg-white !text-sunset-ink">{formatDateRange(trip.startDate, trip.endDate, settings)}</GhChip>
              <GhChip tone="ink">{countdown}</GhChip>
              {current && (
                <GhChip className="!bg-white !text-sunset-ink">
                  <TripIcon name={weatherIconName(current.weathercode)} className="w-3.5 h-3.5" />
                  {Math.round(current.temperature)}°C · {weatherDescription(current.weathercode)}
                  {weather.daily?.temperature_2m_max?.length > 0 && weather.daily?.temperature_2m_min?.length > 0 && (
                    <span className="opacity-70"> · H {Math.round(weather.daily.temperature_2m_max[0])}° L {Math.round(weather.daily.temperature_2m_min[0])}°</span>
                  )}
                </GhChip>
              )}
            </div>
          </div>
        </div>
      </section>

      {matchingFlights.length > 0 && (
        <GhCard tone="sun" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p role="status" className="font-bold">
            {matchingFlights.length} standalone flight{matchingFlights.length === 1 ? '' : 's'} fall{matchingFlights.length === 1 ? 's' : ''} within this trip's dates.
          </p>
          <GhButton variant="soft" onClick={handleAssignMatchingFlights}>{isAssigningFlights ? 'Adding…' : `Add ${matchingFlights.length === 1 ? 'it' : 'them'} to this trip`}</GhButton>
        </GhCard>
      )}

      {/* Stats + map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-stretch">
        <div className="lg:col-span-7 xl:col-span-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 content-start">
          <GhStat label="Total cost" value={<span className="break-words">{formatCurrency(totalCost)}</span>} tone="sun" />
          <GhStat label="Journeys" value={trip.transports?.length || 0} tone="teal" />
          <GhStat label="Nights booked" value={totalNightsBooked} tone="lilac" />
          <GhStat label="Excursions" value={trip.activities?.length || 0} tone="surface" />
          <GhStat label="Distance" value={<span className="break-words">{totalDistance > 0 ? `${Math.round(totalDistance).toLocaleString()} km` : '0 km'}</span>} tone="teal" />
          <GhStat label="Days" value={duration} tone="sun" />
        </div>
        <div className="lg:col-span-5 xl:col-span-4 relative rounded-3xl overflow-hidden min-h-[14rem] bg-sunset-sand dark:bg-sunset-dusk shadow-card">
          <Suspense fallback={<div className="w-full h-full min-h-[14rem] flex items-center justify-center text-sm font-bold opacity-70">Unfolding the map…</div>}>
            <DeckFlightMap trips={[trip]} focusTransportCoordinates={destinationCoordinates} animateRoutes={true} showFrequencyWeight={true} showCityMarkers={true} viewMode="network" embedded={true} />
          </Suspense>
        </div>
      </div>

      <div className="flex justify-center sm:justify-start">
        <GhTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === 'planner' && (
        <DaysTab
          trip={trip}
          tripDates={tripDates}
          settings={settings}
          onEditTransports={t => openTransportModal(t)}
          onEditStay={() => openAccommodationModal()}
          onOpenActivity={handleOpenActivityModal}
          onDeleteActivity={handleDeleteActivity}
        />
      )}

      {activeTab === 'route' && (
        <LocationManager
          key={trip.id + trip.locations?.length}
          locations={trip.locations || []}
          transports={trip.transports || []}
          onSave={handleSaveRoute}
          onCancel={() => { void loadData(); }}
          defaultStartDate={trip.startDate}
          defaultEndDate={trip.endDate}
        />
      )}

      {activeTab === 'itinerary' && (
        <BookingsTab trip={trip} settings={settings} onEditTransports={t => openTransportModal(t)} onEditStay={() => openAccommodationModal()} onImport={() => setIsImportWizardOpen(true)} />
      )}

      {activeTab === 'budget' && (
        <BudgetTab trip={trip} transportCost={transportCost} stayCost={stayCost} activityCost={activityCost} bookingCount={bookingCount} duration={duration} />
      )}

      {activeTab === 'packing' && <GoldenPacking trip={trip} onUpdate={handleUpdatePackingList} />}
      {activeTab === 'intel' && <GoldenGuide trip={trip} />}

      {/* Modals (shared configurators, restyled in a later pass) */}
      {isImportWizardOpen && (
        <Suspense fallback={null}>
          <FlightImportWizard isOpen={isImportWizardOpen} onClose={() => setIsImportWizardOpen(false)} onImportComplete={loadData} users={users} existingTripId={trip.id} />
        </Suspense>
      )}

      <Modal
        isOpen={isTransportModalOpen}
        onClose={() => setIsTransportModalOpen(false)}
        title="Manage transport"
        subtitle="Flights, trains and road trips"
        icon={<AirplaneTilt className="w-6 h-6" weight="duotone" />}
        iconContainerClassName="bg-sunset-teal text-sunset-ink"
        maxWidth="max-w-4xl"
      >
        <TransportConfigurator
          initialData={editingTransports || []}
          allTripTransports={trip.transports || []}
          onSave={handleSaveTransports}
          onDelete={handleDeleteTransports}
          onCancel={() => setIsTransportModalOpen(false)}
          defaultStartDate={selectedDateForModal || trip.startDate}
          defaultEndDate={selectedDateForModal || trip.endDate}
        />
      </Modal>

      <Modal
        isOpen={isAccommodationModalOpen}
        onClose={() => setIsAccommodationModalOpen(false)}
        title="Manage stays"
        subtitle="Hotels, rentals and overnight bookings"
        icon={<Bed className="w-6 h-6" weight="duotone" />}
        iconContainerClassName="bg-sunset-lilac text-sunset-ink"
        maxWidth="max-w-3xl"
      >
        <AccommodationConfigurator
          initialData={editingAccommodations || []}
          onSave={handleSaveAccommodations}
          onDelete={handleDeleteAccommodations}
          onCancel={() => setIsAccommodationModalOpen(false)}
          defaultStartDate={selectedDateForModal || trip.startDate}
          defaultEndDate={selectedDateForModal || trip.endDate}
        />
      </Modal>

      <TripModal
        isOpen={isEditTripOpen}
        onClose={() => setIsEditTripOpen(false)}
        onSubmit={handleUpdateTrip}
        onDelete={handleDeleteTrip}
        onArchive={handleArchiveTrip}
        users={users}
        initialData={trip}
      />

      <ExcursionConfigurator
        isOpen={isActivityModalOpen}
        onClose={() => { setIsActivityModalOpen(false); setSelectedActivityForModal(null); }}
        onSave={handleSaveActivity}
        onDelete={(activityId) => { handleDeleteActivity(activityId); setIsActivityModalOpen(false); setSelectedActivityForModal(null); }}
        initialData={selectedActivityForModal}
        defaultDate={currentDayForActivity}
        tripStartDate={trip.startDate}
        tripEndDate={trip.endDate}
      />

      {isCinematicOpen && (
        <div className="fixed inset-0 z-modal bg-sunset-night safe-top safe-bottom safe-x" role="dialog" aria-modal="true" aria-label="Cinematic trip view">
          <div className="absolute top-[calc(1.5rem+env(safe-area-inset-top,0px))] right-[calc(1.5rem+env(safe-area-inset-right,0px))] z-popover">
            <button
              type="button"
              onClick={closeCinematic}
              aria-label="Close cinematic view"
              className={clsx('min-w-[44px] min-h-[44px] rounded-full bg-white text-sunset-ink shadow-card flex items-center justify-center cursor-pointer')}
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-white font-bold">Warming up the globe…</div>}>
            <DeckFlightMap trips={[trip]} animateRoutes={true} showFrequencyWeight={true} initialProjection="globe" initialElevated={true} embedded={true} />
          </Suspense>
        </div>
      )}
    </div>
  );
};
