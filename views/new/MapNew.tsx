import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NumberFlow from '@number-flow/react';
import { Toolbar, type DockTool } from '../../components/kokonutui/tool-dock';
import SwipeTabs from '../../components/kokonutui/swipe-tabs';
import ActionSearchBar, { type CommandItem } from '../../components/kokonutui/command-palette';
import {
    Airplane, ArrowsIn, ArrowsOut, CornersOut, Funnel, GlobeHemisphereWest, MapPin, MapTrifold, MagnifyingGlass,
    Minus, NavigationArrow, Plus, Stack, Suitcase,
} from '../../components/ui/hugeicons';
import { useExpeditionMapData } from '../../hooks/useExpeditionMapData';
import { dataService } from '../../services/mockDb';
import { searchPlaces, type Place } from '../../services/placeSearch';
import {
    loadMapAppearanceSettings, saveMapAppearanceSettings, type MapAppearanceSettings,
} from '../../types/mapAppearance';
import type { CountryResidenceStatus, PredefinedMapMode, WorkspaceSettings } from '../../types';
import { RpMapCanvas, type RpMapHandle, type RpMapHover } from '../../components/new/map/RpMapCanvas';
import { buildMapModel, type MapRoute } from '../../components/new/map/mapModel';
import { MapSettingsSheet } from '../../components/new/map/MapSettingsSheet';
import { MapFilterSheet } from '../../components/new/map/MapFilterSheet';
import { MapDetailSheet, type MapSelection } from '../../components/new/map/MapDetailSheet';
import { RpEmpty, useIsMobile } from '../../components/new/ui';
import { cn } from '../../utils/cn';

/**
 * MapNew (UI_UX_DESIGN_REFERENCE.md §5.0): the redesigned map at /map-new. Features come from the
 * data layer (useExpeditionMapData, map appearance settings, routing and place search); the layout is
 * new: a full-bleed map, a floating ink dock, mode tabs, and sheets for settings, filters and details.
 */

export interface MapNewProps {
    onTripClick?: (tripId: string) => void;
    /** Kept for parity with the page it will replace; the New shell has no sidebar. */
    isSidebarCollapsed?: boolean;
}

type Tool = 'explore' | 'search' | 'layers' | 'filter';
type Mode = Exclude<PredefinedMapMode, 'none'>;

const MODE_KEY = 'wandergrid_map_new_mode';
const GROUP_KEY = 'wandergrid_map_new_group_airports';
const HEADER = 68;

const readLocal = <T,>(key: string, fallback: T, valid: (v: any) => boolean): T => {
    try {
        const raw = localStorage.getItem(key);
        if (raw == null) return fallback;
        const v = JSON.parse(raw);
        return valid(v) ? v : fallback;
    } catch { return fallback; }
};
const writeLocal = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } };

const useIsDark = () => {
    const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
    useEffect(() => {
        const o = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
        o.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => o.disconnect();
    }, []);
    return dark;
};

export const MapNew: React.FC<MapNewProps> = ({ onTripClick }) => {
    const data = useExpeditionMapData();
    const isDark = useIsDark();
    const mobile = useIsMobile();
    const mapRef = useRef<RpMapHandle>(null);

    const [appearance, setAppearance] = useState<MapAppearanceSettings>(() => loadMapAppearanceSettings());
    const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
    const [mode, setMode] = useState<Mode>(() => readLocal<Mode>(MODE_KEY, 'all', v => ['all', 'flights', 'land_sea', 'scratch'].includes(v)));
    const [groupAirports, setGroupAirports] = useState<boolean>(() => readLocal(GROUP_KEY, false, v => typeof v === 'boolean'));
    const [tool, setTool] = useState<Tool>('explore');
    const [selection, setSelection] = useState<MapSelection | null>(null);
    const [hover, setHover] = useState<RpMapHover | null>(null);
    const [fullscreen, setFullscreen] = useState(false);
    const [placeResults, setPlaceResults] = useState<Place[]>([]);
    const [settled, setSettled] = useState(false);

    useEffect(() => { dataService.getWorkspaceSettings().then(setSettings).catch(() => undefined); }, []);
    useEffect(() => { const id = window.setTimeout(() => setSettled(true), 1800); return () => window.clearTimeout(id); }, []);
    useEffect(() => {
        const sync = () => setFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', sync);
        return () => document.removeEventListener('fullscreenchange', sync);
    }, []);

    const updateAppearance = useCallback((patch: Partial<MapAppearanceSettings>) => {
        setAppearance(prev => {
            const next = { ...prev, ...patch };
            saveMapAppearanceSettings(next);
            return next;
        });
    }, []);
    const replaceAppearance = useCallback((next: MapAppearanceSettings) => { setAppearance(next); saveMapAppearanceSettings(next); }, []);
    const changeMode = (m: Mode) => { setMode(m); writeLocal(MODE_KEY, m); setSelection(null); };
    const changeGroup = (v: boolean) => { setGroupAirports(v); writeLocal(GROUP_KEY, v); };

    const model = useMemo(() => buildMapModel(data.filteredTrips, { mode, groupAirports }), [data.filteredTrips, mode, groupAirports]);
    const openAipAvailable = Boolean(settings?.openAipApiKey || settings?.configuredKeys?.openAipApiKey);
    const metrics = data.expeditionTypeMetrics;

    /* -------------------------------------------------- panels */

    const openTool = (t: Tool) => { setTool(t); if (t !== 'explore') setSelection(null); };
    const select = (s: MapSelection | null) => { setSelection(s); if (s && tool !== 'explore') setTool('explore'); };

    const sheetOpen = tool === 'layers' || tool === 'filter' || selection !== null;
    const padding = useMemo(() => mobile
        ? { top: HEADER + 72, right: 24, bottom: 180, left: 24 }
        : { top: HEADER + 80, right: sheetOpen ? 460 : 40, bottom: 48, left: 104 },
    [mobile, sheetOpen]);

    const toggleFullscreen = () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.();
    };

    const tools: DockTool[] = useMemo(() => {
        const panels: DockTool[] = [
            { id: 'explore', label: 'Explore', icon: NavigationArrow as any, shortcut: 'E' },
            { id: 'search', label: 'Search', icon: MagnifyingGlass as any, shortcut: 'S' },
            { id: 'layers', label: 'Map settings', icon: Stack as any, shortcut: 'L' },
            { id: 'filter', label: data.activeFilterCount ? `Filter (${data.activeFilterCount})` : 'Filter', icon: Funnel as any, shortcut: 'F' },
        ];
        const fit: DockTool = { id: 'fit', label: 'Fit all', icon: ArrowsOut as any, action: () => mapRef.current?.fitAll(), dividerBefore: true };
        if (mobile) return [...panels, fit];
        return [
            ...panels,
            fit,
            { id: 'zoom-in', label: 'Zoom in', icon: Plus as any, action: () => mapRef.current?.zoomIn() },
            { id: 'zoom-out', label: 'Zoom out', icon: Minus as any, action: () => mapRef.current?.zoomOut() },
            {
                id: 'projection',
                label: appearance.projection === 'globe' ? 'Flat map' : 'Globe',
                icon: (appearance.projection === 'globe' ? MapTrifold : GlobeHemisphereWest) as any,
                action: () => updateAppearance({ projection: appearance.projection === 'globe' ? 'flat' : 'globe' }),
            },
            { id: 'fullscreen', label: fullscreen ? 'Exit full screen' : 'Full screen', icon: (fullscreen ? ArrowsIn : CornersOut) as any, action: toggleFullscreen },
        ];
    }, [mobile, appearance.projection, fullscreen, data.activeFilterCount, updateAppearance]);

    /* -------------------------------------------------- search */

    const searchSeq = useRef(0);
    const onQuery = useCallback((q: string) => {
        const seq = ++searchSeq.current;
        if (q.trim().length < 2) { setPlaceResults([]); return; }
        void searchPlaces(q, { limit: 6, onUpdate: places => { if (seq === searchSeq.current) setPlaceResults(places.slice(0, 6)); } })
            .then(places => { if (seq === searchSeq.current) setPlaceResults(places.slice(0, 6)); })
            .catch(() => undefined);
    }, []);

    const searchItems: CommandItem[] = useMemo(() => {
        const trips = data.trips
            .filter(t => (t.transports || []).some(tr => tr.originLat != null && tr.destLat != null))
            .slice(0, 200)
            .map(t => ({ id: `trip:${t.id}`, label: t.name.replace(/^Independent: /, ''), group: 'Trips', icon: <Suitcase size={16} />, keywords: [t.location || ''] }));
        const places = [...model.airports, ...model.places].map(p => ({
            id: `place:${p.kind}:${p.id}`, label: p.label, group: 'Your places', icon: p.kind === 'airport' ? <Airplane size={16} /> : <MapPin size={16} />, keywords: [p.id],
        }));
        const found = placeResults.map(p => ({
            id: `geo:${p.id}`, label: p.label || p.name, group: 'Places', icon: <MapPin size={16} />,
            // Results already match the query on the provider side; keep them visible under fuzzy matching.
            keywords: [p.name, p.subtitle, p.country, p.iata || ''].filter(Boolean),
        }));
        return [...trips, ...places, ...found];
    }, [data.trips, model.airports, model.places, placeResults]);

    const onSearchSelect = (item: CommandItem) => {
        const [kind, ...rest] = item.id.split(':');
        if (kind === 'trip') {
            const trip = data.trips.find(t => t.id === rest.join(':'));
            const pts = (trip?.transports || []).flatMap(tr => (tr.originLat != null && tr.destLat != null ? [[tr.originLng!, tr.originLat], [tr.destLng!, tr.destLat!]] : [])) as [number, number][];
            if (pts.length) {
                const lngs = pts.map(p => p[0]); const lats = pts.map(p => p[1]);
                mapRef.current?.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]]);
            }
        } else if (kind === 'place') {
            const id = rest.slice(1).join(':');
            const place = [...model.airports, ...model.places].find(p => p.id === id);
            if (place) { mapRef.current?.flyTo(place.coords[0], place.coords[1], 7); select({ kind: 'place', place }); }
        } else if (kind === 'geo') {
            const place = placeResults.find(p => p.id === rest.join(':'));
            if (place) mapRef.current?.flyTo(place.lng, place.lat, place.kind === 'country' ? 4 : 8);
        }
        setTool('explore');
    };

    /* -------------------------------------------------- mode tabs */

    const modeItems = [
        { id: 'all', title: 'All', badge: mobile ? undefined : metrics.all.count },
        { id: 'flights', title: 'Flights', badge: mobile ? undefined : metrics.flights.count },
        { id: 'land_sea', title: 'Land & sea', badge: mobile ? undefined : metrics.land_sea.count },
        { id: 'scratch', title: 'Scratch', badge: mobile ? undefined : metrics.scratch.count },
    ];

    const onUpdateCountryStatus = (code: string, name: string, status: CountryResidenceStatus[] | 'none') => {
        void data.handleUpdateCountryStatus(code, name, status);
    };

    const isEmpty = settled && mode !== 'scratch' && model.legs.length === 0;
    const sheetTop = mobile ? 0 : HEADER + 8;

    return (
        <div className="absolute inset-0">
            <RpMapCanvas
                ref={mapRef}
                className="absolute inset-0"
                model={model}
                mode={mode}
                appearance={appearance}
                isDark={isDark}
                visitedCountryCodes={data.visitedCountryCodes}
                countryStatusMap={data.countryStatusMap}
                visitedPlaces={data.visitedPlaces}
                openAipAvailable={openAipAvailable}
                cartoKey={settings?.cartoApiKey}
                defaultBasemapLight={settings?.defaultBasemapLight}
                defaultBasemapDark={settings?.defaultBasemapDark}
                padding={padding}
                onRouteClick={(route: MapRoute) => select({ kind: 'route', route })}
                onPlaceClick={place => select({ kind: 'place', place })}
                onCountryClick={(code, name) => select({ kind: 'country', code, name })}
                onHover={mobile ? undefined : setHover}
            />

            {/* Mode tabs, or the search palette while searching */}
            <div className="pointer-events-none absolute inset-x-0 z-float flex justify-center px-3" style={{ top: HEADER + 4 }}>
                {tool === 'search' ? (
                    <div className="pointer-events-auto w-full max-w-xl">
                        <ActionSearchBar
                            autoFocus
                            items={searchItems}
                            onQueryChange={onQuery}
                            onSelect={item => onSearchSelect(item)}
                            onOpenChange={open => { if (!open) setTool('explore'); }}
                            label="Search the map"
                            placeholder="Search trips, airports and places"
                        />
                    </div>
                ) : (
                    <div className="pointer-events-auto max-w-full">
                        <SwipeTabs
                            items={modeItems}
                            value={mode}
                            onChange={id => changeMode(id as Mode)}
                            panels={false}
                            label="What to show"
                            className="w-auto"
                            listClassName="bg-rp-surface rp-shadow-raised"
                        />
                    </div>
                )}
            </div>

            {/* The ink dock: left edge on tablet and desktop, above the tab bar on mobile */}
            <Toolbar
                tools={tools}
                value={tool}
                onValueChange={id => openTool(id as Tool)}
                toggleTo="explore"
                tone="ink"
                defaultEdge={mobile ? 'bottom' : 'left'}
                fixed={mobile}
                shortcuts="global"
                ariaLabel="Map tools"
                className={cn('pointer-events-none absolute inset-x-0 top-[128px] z-float', mobile ? 'bottom-[88px]' : 'bottom-0')}
                dockClassName="pointer-events-auto"
                key={mobile ? 'mobile' : 'desktop'}
            >
                <span />
            </Toolbar>

            {/* Totals for what is on screen */}
            {!mobile ? (
                <div className="pointer-events-none absolute bottom-4 left-1/2 z-float -translate-x-1/2">
                    <div className="rp-tabular flex items-center gap-4 rounded-full bg-rp-surface px-5 py-2.5 text-sm text-rp-ink rp-shadow-raised">
                        {mode === 'scratch' ? (
                            <span><NumberFlow value={metrics.scratch.count} /> <span className="text-rp-muted">countries</span></span>
                        ) : (
                            <>
                                <span><NumberFlow value={model.totals.routes} /> <span className="text-rp-muted">{model.totals.routes === 1 ? 'journey' : 'journeys'}</span></span>
                                <span className="h-4 w-px bg-rp-line" aria-hidden />
                                <span><NumberFlow value={model.totals.distanceKm} /> <span className="text-rp-muted">km</span></span>
                            </>
                        )}
                    </div>
                </div>
            ) : null}

            {/* Hover label */}
            {hover && !sheetOpen ? (
                <div
                    className="pointer-events-none absolute z-tooltip -translate-x-1/2 -translate-y-[calc(100%+12px)] whitespace-nowrap rounded-full bg-rp-ink px-3 py-1.5 text-xs font-medium text-rp-on-ink rp-shadow-raised"
                    style={{ left: hover.x, top: hover.y }}
                >
                    {hover.kind === 'route' ? `${hover.route.origin} → ${hover.route.destination} · ${hover.route.count}×`
                        : hover.kind === 'place' ? `${hover.place.label} · ${hover.place.count}`
                        : hover.kind === 'pin' ? hover.name
                        : hover.name}
                </div>
            ) : null}

            {isEmpty ? (
                <div className="pointer-events-none absolute inset-0 z-raised flex items-center justify-center p-6">
                    <div className="pointer-events-auto max-w-sm rounded-rp-card bg-rp-surface rp-shadow-float">
                        {data.activeFilterCount ? (
                            <RpEmpty
                                title="Nothing matches these filters"
                                action={<button type="button" onClick={data.handleClearFilters} className="min-h-11 rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink">Clear filters</button>}
                            />
                        ) : (
                            <RpEmpty title="No journeys to show yet">Trips with flights or road trips appear here.</RpEmpty>
                        )}
                    </div>
                </div>
            ) : null}

            <MapSettingsSheet
                open={tool === 'layers'}
                onClose={() => setTool('explore')}
                appearance={appearance}
                onChange={updateAppearance}
                onReplace={replaceAppearance}
                groupAirports={groupAirports}
                onGroupAirports={changeGroup}
                isDark={isDark}
                openAipAvailable={openAipAvailable}
                topOffset={sheetTop}
            />
            <MapFilterSheet
                open={tool === 'filter'}
                onClose={() => setTool('explore')}
                topOffset={sheetTop}
                statusFilter={data.statusFilter}
                setStatusFilter={data.setStatusFilter}
                yearFilter={data.yearFilter}
                setYearFilter={data.setYearFilter}
                years={data.years}
                origins={data.uniqueAirports.origins}
                destinations={data.uniqueAirports.destinations}
                depFilter={data.depFilter}
                setDepFilter={data.setDepFilter}
                arrFilter={data.arrFilter}
                setArrFilter={data.setArrFilter}
                dateFrom={data.dateFrom}
                setDateFrom={data.setDateFrom}
                dateTo={data.dateTo}
                setDateTo={data.setDateTo}
                activeFilterCount={data.activeFilterCount}
                onClear={data.handleClearFilters}
            />
            <MapDetailSheet
                selection={selection}
                onClose={() => setSelection(null)}
                onSelect={select}
                onTripClick={onTripClick}
                trips={data.filteredTrips}
                model={model}
                countryStatusMap={data.countryStatusMap}
                visitedCountryCodes={data.visitedCountryCodes}
                onUpdateCountryStatus={onUpdateCountryStatus}
                topOffset={sheetTop}
            />
        </div>
    );
};

export default MapNew;
