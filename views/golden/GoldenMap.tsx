import React, { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { clsx } from 'clsx';
import { Airplane, Compass, Globe, MapPin, MapTrifold, SlidersHorizontal, ArrowsOut, ArrowsIn, EyeSlash, CaretUp, CaretDown, X, Calendar } from '@/components/ui/hugeicons';
import { MapAppearanceModal } from '../../components/MapAppearanceModal';
import { LiquidGlassSelect, LiquidGlassMultiSelect } from '../../components/LiquidGlassSelect';
import DatePicker from '../../components/ui/DatePicker';
import { PredefinedMapMode } from '../../types';
import { MapAppearanceSettings, DEFAULT_MAP_APPEARANCE, loadMapAppearanceSettings, saveMapAppearanceSettings } from '../../types/mapAppearance';
import { syncThemeWithBasemap } from '../../services/themeSync';
import { useExpeditionMapData } from '../../hooks/useExpeditionMapData';
import { formatDate } from '../../utils/formatters';
import { GhButton, GhChip, GhTabs } from '../../components/golden/Gh';
import type { GoldenViewProps } from './registry';

const DeckFlightMap = lazy(() => import('../../components/DeckFlightMap').then(m => ({ default: m.DeckFlightMap || m.default })));

const useDarkMode = () => {
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const observer = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
};

/** Colour carries meaning: teal = flights (distance/go), sun = land & sea (time), lilac = scratch (places), coral = everything. */
const MODES: { key: PredefinedMapMode; label: string; icon: React.ComponentType<{ className?: string }>; chip: string }[] = [
  { key: 'flights', label: 'Flights', icon: Airplane, chip: 'bg-sunset-teal text-sunset-ink' },
  { key: 'land_sea', label: 'Land', icon: Compass, chip: 'bg-sunset-sun text-sunset-ink' },
  { key: 'scratch', label: 'Scratch', icon: MapTrifold, chip: 'bg-sunset-lilac text-sunset-ink' },
  { key: 'all', label: 'All', icon: Globe, chip: 'bg-sunset-orange text-white' },
];

const fieldLabel = 'text-xs font-bold uppercase tracking-wider text-sunset-ink/70 dark:text-white/70 block mb-1.5';

/** Golden Hour redesign of the Expedition Map: full-bleed map, floating colour-coded chips, trip bottom sheet. */
export const GoldenMap: React.FC<GoldenViewProps> = ({ onTripClick, isSidebarCollapsed = false }) => {
  const data = useExpeditionMapData();
  const { filteredTrips, expeditionTypeMetrics: metrics, activeFilterCount } = data;
  const isDark = useDarkMode();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [appearance, setAppearance] = useState<MapAppearanceSettings>(() => loadMapAppearanceSettings());
  const [viewMode, setViewMode] = useState<PredefinedMapMode>('all');
  const [elevatedProjection, setElevatedProjection] = useState(true);
  const [animateRoutes, setAnimateRoutes] = useState(false);
  const [showCountries, setShowCountries] = useState(false);
  const [clusterMode, setClusterMode] = useState(false);
  const [showLandSeaRoutes, setShowLandSeaRoutes] = useState(true);
  const [showIndependentFlights, setShowIndependentFlights] = useState(true);
  const [showRoadTracing, setShowRoadTracing] = useState<boolean>(() => localStorage.getItem('wandergrid_road_tracing') === 'true');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const handleSelectViewMode = (mode: PredefinedMapMode) => {
    let target = mode;
    if (mode === 'all' && viewMode === 'all') target = 'none';
    else if (mode === 'all' && viewMode === 'none') target = 'all';
    else if (mode === 'none' && viewMode === 'none') target = 'all';
    setViewMode(target);
    setShowIndependentFlights(target === 'flights' || target === 'all');
    setShowLandSeaRoutes(target === 'land_sea' || target === 'all');
    setShowCountries(target === 'scratch');
  };

  const handleUpdateAppearance = (next: MapAppearanceSettings) => {
    if (next.basemap && next.basemap !== appearance.basemap) syncThemeWithBasemap(next.basemap);
    setAppearance(next);
    saveMapAppearanceSettings(next);
  };

  const handleResetAll = () => {
    handleUpdateAppearance({ ...DEFAULT_MAP_APPEARANCE });
    handleSelectViewMode('all');
    setAnimateRoutes(false);
    setClusterMode(false);
    setShowRoadTracing(false);
    data.handleClearFilters();
  };

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        const el = mapContainerRef.current as any;
        if (el?.requestFullscreen) await el.requestFullscreen();
        else if (el?.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      }
    } catch (e) {
      console.warn('Fullscreen toggle error', e);
    }
  };

  // Real trips only (synthetic independent flights have no detail page), upcoming first then most recent.
  const sheetTrips = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const real = filteredTrips.filter(t => !t.id.startsWith('independent-'));
    const ahead = real.filter(t => (t.endDate || t.startDate) >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const behind = real.filter(t => (t.endDate || t.startDate) < today).sort((a, b) => b.startDate.localeCompare(a.startDate));
    return [...ahead, ...behind].map(t => ({ trip: t, isAhead: (t.endDate || t.startDate) >= today }));
  }, [filteredTrips]);

  const chipBase = 'min-h-[44px] rounded-full px-4 inline-flex items-center gap-2 text-sm font-bold shadow-card cursor-pointer transition-transform active:scale-95';
  const chipIdle = 'bg-white dark:bg-sunset-plum text-sunset-ink dark:text-white';

  return (
    <div ref={mapContainerRef} className="relative w-full h-full overflow-hidden bg-sunset-cream dark:bg-sunset-night select-none">
      <div className="absolute inset-0">
        <Suspense fallback={
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-sunset-ink dark:text-white">
            <Compass className="w-10 h-10 text-sunset-coral animate-[spin_4s_linear_infinite]" />
            <p className="text-sm font-bold">Unfolding the map…</p>
          </div>
        }>
          <DeckFlightMap
            key={`gpu-${isDark ? 'dark' : 'light'}`}
            trips={filteredTrips}
            onTripClick={onTripClick!}
            showFrequencyWeight={appearance.routeWidthMode === 'frequency'}
            animateRoutes={animateRoutes}
            visitedCountries={data.visitedCountryCodes}
            showCountries={showCountries}
            viewMode={viewMode}
            countryStatusMap={data.countryStatusMap}
            onUpdateCountryStatus={data.handleUpdateCountryStatus}
            visitedPlaces={data.visitedPlaces}
            activeLayer={appearance.basemap}
            onChangeActiveLayer={(layer) => handleUpdateAppearance({ ...appearance, basemap: layer as any })}
            projection={appearance.projection}
            elevatedRoutes={elevatedProjection}
            onProjectionChange={(p) => handleUpdateAppearance({ ...appearance, projection: p })}
            onElevatedRoutesChange={setElevatedProjection}
            showFlightRoutes={showIndependentFlights}
            showLandSeaRoutes={showLandSeaRoutes}
            showCityMarkers={(appearance.citySize ?? 'medium') !== 'off'}
            showGradientRoutes={appearance.routeColorMode === 'gradient'}
            clusterMode={clusterMode}
            showRoadTracing={showRoadTracing}
            appearanceSettings={appearance}
            onChangeAppearanceSettings={handleUpdateAppearance}
            onOpenMissionControl={() => setIsSidebarOpen(true)}
            isSidebarCollapsed={isSidebarCollapsed}
          />
        </Suspense>
      </div>

      {/* Top row: title chip left, tools right */}
      <div className="absolute top-[calc(0.75rem+env(safe-area-inset-top,0px))] inset-x-3 sm:inset-x-5 z-float flex items-start justify-between gap-2 pointer-events-none">
        <div className="pointer-events-auto rounded-3xl bg-sunset-orange text-white shadow-card px-4 py-2 min-w-0">
          <div className="text-lg sm:text-2xl font-black tracking-tight leading-tight">Your world</div>
          <div className="text-xs font-semibold opacity-90 truncate">{metrics.activeSectorsCount} journeys · {metrics.totalDistanceKm.toLocaleString()} km</div>
        </div>
        <div className="pointer-events-auto flex items-center gap-2 shrink-0">
          <button type="button" onClick={handleToggleFullscreen} className={clsx(chipBase, chipIdle, '!px-0 w-11 justify-center')} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
            {isFullscreen ? <ArrowsIn className="w-5 h-5" /> : <ArrowsOut className="w-5 h-5" />}
          </button>
          <button type="button" onClick={() => setIsSidebarOpen(v => !v)} className={clsx(chipBase, isSidebarOpen ? 'bg-sunset-coral text-white' : chipIdle)} aria-label="Controls and appearance" aria-expanded={isSidebarOpen}>
            <SlidersHorizontal className="w-5 h-5" />
            <span className="hidden sm:inline">Controls</span>
            {activeFilterCount > 0 && <span className="rounded-full bg-sunset-sun text-sunset-ink text-xs font-black min-w-[22px] h-[22px] px-1.5 inline-flex items-center justify-center">{activeFilterCount}</span>}
          </button>
        </div>
      </div>

      {/* Mode chips: colour-coded, centred under the header on mobile, floating above the sheet on desktop */}
      <div className={clsx(
        'absolute z-float pointer-events-none flex justify-center transition-opacity',
        'top-[calc(5.25rem+env(safe-area-inset-top,0px))] inset-x-3 md:top-auto md:inset-x-0 md:bottom-5',
        isSidebarOpen && 'opacity-0'
      )}>
        <div role="group" aria-label="Map layers" className="pointer-events-auto flex flex-wrap justify-center gap-2 max-w-full p-1">
          {MODES.map(m => {
            const noneActive = m.key === 'all' && viewMode === 'none';
            const selected = viewMode === m.key || noneActive;
            const Icon = noneActive ? EyeSlash : m.icon;
            const stat = metrics[m.key];
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => handleSelectViewMode(m.key)}
                aria-pressed={selected}
                title={`${m.label}: ${stat.count} · ${stat.distanceStr}`}
                className={clsx(
                  chipBase, 'whitespace-nowrap !px-3 sm:!px-4',
                  selected ? clsx(m.chip, 'ring-4 ring-white dark:ring-sunset-night') : 'bg-white/90 dark:bg-sunset-plum text-sunset-ink dark:text-white opacity-90'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{noneActive ? 'Hidden' : m.label}</span>
                <span className={clsx('rounded-full px-2 py-0.5 text-xs font-black', selected ? 'bg-white/40' : 'bg-sunset-sand dark:bg-sunset-dusk')}>{stat.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Trip bottom sheet */}
      <section
        aria-label="Trips on the map"
        className={clsx(
          'absolute z-float inset-x-2 md:inset-x-auto md:right-5 md:w-[24rem] bottom-[calc(4.85rem+env(safe-area-inset-bottom,0px))] md:bottom-24',
          'rounded-3xl bg-white dark:bg-sunset-plum text-sunset-ink dark:text-white shadow-card overflow-hidden transition-opacity',
          isSidebarOpen && 'opacity-0 pointer-events-none'
        )}
      >
        <button
          type="button"
          onClick={() => setSheetOpen(v => !v)}
          aria-expanded={sheetOpen}
          className="w-full min-h-[52px] px-5 flex items-center justify-between gap-3 cursor-pointer"
        >
          <span className="flex items-center gap-2 font-black">
            <MapPin className="w-5 h-5 text-sunset-coral" />
            {sheetTrips.length === 0 ? 'No trips yet' : `${sheetTrips.length} ${sheetTrips.length === 1 ? 'trip' : 'trips'} on the map`}
          </span>
          {sheetOpen ? <CaretDown className="w-5 h-5" /> : <CaretUp className="w-5 h-5" />}
        </button>
        {sheetOpen && (
          <ul className="max-h-[40vh] overflow-y-auto px-3 pb-3 flex flex-col gap-2">
            {sheetTrips.length === 0 && (
              <li className="rounded-2xl bg-sunset-sand dark:bg-sunset-dusk p-4 text-sm font-semibold text-center">
                {activeFilterCount > 0 ? 'Nothing matches those filters.' : 'Plan a trip and it lands here.'}
              </li>
            )}
            {sheetTrips.map(({ trip, isAhead }) => (
              <li key={trip.id}>
                <button
                  type="button"
                  onClick={() => onTripClick?.(trip.id)}
                  className="w-full min-h-[56px] text-left rounded-2xl bg-sunset-sand dark:bg-sunset-dusk px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer active:scale-[0.98] transition-transform"
                >
                  <span className="min-w-0">
                    <span className="block font-black truncate">{trip.name}</span>
                    <span className="block text-xs font-semibold opacity-70 truncate">{trip.location} · {formatDate(trip.startDate, 'short')}</span>
                  </span>
                  <GhChip tone={isAhead ? 'teal' : 'lilac'}>{isAhead ? 'Next' : 'Done'}</GhChip>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MapAppearanceModal
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        settings={appearance}
        onChangeSettings={handleUpdateAppearance}
        onResetCamera={data.handleRefresh}
        onResetAll={handleResetAll}
        viewMode={viewMode}
        onSelectViewMode={handleSelectViewMode}
        animateRoutes={animateRoutes}
        onToggleAnimateRoutes={() => setAnimateRoutes(v => !v)}
        clusterMode={clusterMode}
        onToggleClusterMode={() => setClusterMode(v => !v)}
        showRoadTracing={showRoadTracing}
        onToggleRoadTracing={() => {
          const next = !(showRoadTracing || appearance.routeTracing !== false);
          setShowRoadTracing(next);
          localStorage.setItem('wandergrid_road_tracing', String(next));
          handleUpdateAppearance({ ...appearance, routeTracing: next });
        }}
        activeFilterCount={activeFilterCount}
        onClearFilters={data.handleClearFilters}
        filterTabContent={
          <div className="space-y-4">
            <div>
              <span className={fieldLabel}>Trip status</span>
              <GhTabs
                tabs={[{ id: 'all', label: 'All' }, { id: 'Past', label: 'Past' }, { id: 'Upcoming', label: 'Soon' }, { id: 'Planning', label: 'Planning' }]}
                active={data.statusFilter}
                onChange={id => data.setStatusFilter(id as typeof data.statusFilter)}
              />
            </div>
            <div>
              <span className={fieldLabel}>Year</span>
              <LiquidGlassSelect
                value={data.yearFilter}
                onChange={data.setYearFilter}
                options={[{ value: 'all', label: 'All years' }, ...data.years.map(y => ({ value: y, label: y }))]}
                placeholder="All years"
                icon={Calendar}
                fullWidth
              />
            </div>
            <div>
              <span className={fieldLabel}>Leaving from</span>
              <LiquidGlassMultiSelect placeholder="Any airport" options={data.uniqueAirports.origins} value={data.depFilter} onChange={data.setDepFilter} icon={Airplane} searchable fullWidth />
            </div>
            <div>
              <span className={fieldLabel}>Heading to</span>
              <LiquidGlassMultiSelect placeholder="Any airport" options={data.uniqueAirports.destinations} value={data.arrFilter} onChange={data.setArrFilter} icon={MapPin} searchable fullWidth />
            </div>
            <div>
              <span className={fieldLabel}>Dates</span>
              <div className="grid grid-cols-2 gap-2">
                <DatePicker value={data.dateFrom} onChange={data.setDateFrom} placeholder="From" accentColor="emerald" />
                <DatePicker value={data.dateTo} onChange={data.setDateTo} placeholder="To" accentColor="emerald" />
              </div>
            </div>
            {activeFilterCount > 0 && (
              <GhButton variant="soft" onClick={data.handleClearFilters} icon={<X className="w-4 h-4" />} className="w-full">Clear filters</GhButton>
            )}
          </div>
        }
      />
    </div>
  );
};
