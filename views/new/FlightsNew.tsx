import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Transport, Trip } from '../../types';
import { dataService } from '../../services/mockDb';
import { useFlightLog } from '../../hooks/useFlightLog';
import { errorMessage, toast } from '../../services/toast';
import { mapLink } from '../../utils/mapLinks';
import {
    SORT_LABEL, byAirport, byCarrier, carrierLabel, groupJourneys, placeCode, isIndependent, journeyStatus, sortJourneys,
    type JourneyGroup, type JourneyRecord, type JourneySortKey, type JourneyState,
} from '../../utils/journeysModel';
import type { DockTool } from '../../components/kokonutui/tool-dock';
import HoldButton from '../../components/kokonutui/hold-button';
import SwipeTabs from '../../components/kokonutui/swipe-tabs';
import { RpChip, RpEmpty, RpSheet, useIsMobile } from '../../components/new/ui';
import { RpPageToolbar } from '../../components/new/PageToolbar';
import { openNewPage } from '../../components/new/devLinks';
import { useUndoToast } from '../../components/new/UndoToast';
import { TripMenu, type TripMenuItem } from '../../components/new/trips/TripMenu';
import { JourneyTable, type JourneyGrouping } from '../../components/new/journeys/JourneyTable';
import { JourneyHero } from '../../components/new/journeys/JourneyHero';
import { JourneyTimeline } from '../../components/new/journeys/JourneyTimeline';
import { LiveNow } from '../../components/new/journeys/LiveNow';
import { FlightAlerts } from '../../components/new/journeys/FlightAlerts';
import { useFlightAlerts } from '../../hooks/useFlightAlerts';
import { JourneySheet } from '../../components/new/journeys/JourneySheet';
import { JourneyEditor, type JourneyEditorTarget } from '../../components/new/journeys/JourneyEditor';
import { ImportSheet, exportJourneys, type ExportFormat } from '../../components/new/journeys/JourneyTransfer';
import {
    Airplane, ArrowDown, ArrowsClockwise, ChartBar, Copy, LinkSquare, Stack, type Icon, CalendarBlank, CheckSquare, Clock, DownloadSimple, Funnel, Globe, MagnifyingGlass, PencilSimple, Plus, Suitcase, Trash, UploadSimple, X, XCircle,
} from '../../components/ui/hugeicons';
import { cn } from '../../utils/cn';

/**
 * FlightsNew (UI_UX_DESIGN_REFERENCE.md §5.0): the redesigned flight log at /flights-new. The features
 * come from the data layer (useFlightLog: the log, filters, whole-record writes; dataService; the flight
 * tracker and importer); the layout is new: three totals, a Table / Board toggle, a detail sheet with a
 * boarding pass, and one editor shared with the trip sheets.
 */

interface FlightsNewProps {
    /** Opens a trip's page (the sheet's "open trip" arrow). */
    onTripClick?: (tripId: string) => void;
}

const GROUP_KEY = 'wandergrid_flights_new_group';
const TAB_KEY = 'wandergrid_flights_new_tab';
type Tab = 'stats' | 'flights';
const readTab = (): Tab => { try { return localStorage.getItem(TAB_KEY) === 'stats' ? 'stats' : 'flights'; } catch { return 'flights'; } };
const SORT_KEY = 'wandergrid_flights_new_sort';
const NEW_FLIGHT_EVENT = 'rp:new-flight';
const NOUN = { one: 'Flight', many: 'flights' };

const readGroup = (): JourneyGrouping => { try { const v = localStorage.getItem(GROUP_KEY); return v === 'year' || v === 'none' ? v : 'journey'; } catch { return 'journey'; } };
const readSort = (): { key: JourneySortKey; asc: boolean } => {
    try {
        const [key, dir] = (localStorage.getItem(SORT_KEY) || '').split(':');
        if (key in SORT_LABEL) return { key: key as JourneySortKey, asc: dir === 'asc' };
    } catch { /* storage unavailable */ }
    return { key: 'date', asc: false };
};

const PILL = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-canvas active:scale-[0.97]';

const CLASSES = ['Economy', 'Premium Economy', 'Business', 'First'] as const;
const STATES: { id: JourneyState; label: string }[] = [
    { id: 'scheduled', label: 'Scheduled' }, { id: 'travelling', label: 'In the air' }, { id: 'done', label: 'Landed' }, { id: 'cancelled', label: 'Cancelled' },
];
const SORTS: { key: JourneySortKey; asc: boolean; label: string; short: string }[] = [
    { key: 'date', asc: false, label: 'Date, newest first', short: 'Newest' },
    { key: 'date', asc: true, label: 'Date, oldest first', short: 'Oldest' },
    { key: 'journey', asc: true, label: 'Airline', short: 'Airline' },
    { key: 'route', asc: true, label: 'Route', short: 'Route' },
    { key: 'duration', asc: false, label: 'Longest first', short: 'Longest' },
    { key: 'distance', asc: false, label: 'Furthest first', short: 'Furthest' },
    { key: 'cost', asc: false, label: 'Most expensive', short: 'Priciest' },
];

/** The way back for a flight: the places swapped, a week later, the airline kept and everything personal to that flight cleared. */
const returnSeed = (f: Transport): Partial<Transport> => {
    const week = (d: string) => { const x = new Date(`${d || new Date().toISOString().slice(0, 10)}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 7); return x.toISOString().slice(0, 10); };
    return {
        mode: f.mode, provider: f.provider, providerCode: f.providerCode, origin: f.destination, destination: f.origin,
        departureDate: week(f.arrivalDate || f.departureDate), arrivalDate: week(f.arrivalDate || f.departureDate), travelClass: f.travelClass,
        confirmationCode: f.confirmationCode, departureTime: '10:00', arrivalTime: '14:00',
    };
};

const EmptyCard: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="rounded-rp-card bg-rp-surface rp-shadow-rest">{children}</div>;

export const FlightsNew: React.FC<FlightsNewProps> = ({ onTripClick }) => {
    const log = useFlightLog();
    const undo = useUndoToast();
    const mobile = useIsMobile();
    const alerts = useFlightAlerts(log.flights);
    const [tab, setTab] = useState<Tab>(readTab);
    const changeTab = (t: Tab) => { setTab(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* storage unavailable */ } };
    const [{ key: sortKey, asc: sortAsc }, setSort] = useState(readSort);
    const [grouping, setGrouping] = useState<JourneyGrouping>(readGroup);
    const changeGrouping = (g: JourneyGrouping) => { setGrouping(g); setExpanded(false); try { localStorage.setItem(GROUP_KEY, g); } catch { /* storage unavailable */ } };
    const [timelineId, setTimelineId] = useState<string | null>(null);
    const [searchOpen, setSearchOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState<JourneyState | 'all'>('all');
    const [noTrip, setNoTrip] = useState(false);
    const [airline, setAirline] = useState('all');
    const [airport, setAirport] = useState('all');
    const [expanded, setExpanded] = useState(false);
    const [detailId, setDetailId] = useState<string | null>(null);
    const [editor, setEditor] = useState<JourneyEditorTarget | null>(null);
    const [importOpen, setImportOpen] = useState(false);
    const [selecting, setSelecting] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState<JourneyRecord[] | null>(null);

    const changeSort = (key: JourneySortKey, asc: boolean) => { setSort({ key, asc }); try { localStorage.setItem(SORT_KEY, `${key}:${asc ? 'asc' : 'desc'}`); } catch { /* storage unavailable */ } };
    const headerSort = (key: JourneySortKey) => changeSort(key, key === sortKey ? !sortAsc : key === 'date' || key === 'duration' || key === 'distance' || key === 'cost' ? false : true);

    // "New flight" from the shell's quick actions: on arrival (?new=1) or while already on this page.
    useEffect(() => {
        try {
            const url = new URL(window.location.href);
            if (url.searchParams.get('new') === '1') {
                url.searchParams.delete('new');
                window.history.replaceState({}, '', url.pathname + url.search);
                setEditor({ kind: 'create' });
            }
        } catch { /* ignore */ }
        const onNew = () => setEditor({ kind: 'create' });
        window.addEventListener(NEW_FLIGHT_EVENT, onNew);
        return () => window.removeEventListener(NEW_FLIGHT_EVENT, onNew);
    }, []);

    const attempt = async (run: () => Promise<void>, fallback = "That didn't save. Try again.") => {
        try { await run(); } catch (e) { toast.error(errorMessage(e, fallback)); }
    };

    // The list the page shows: the log's search, time, year and class filters, then status and trip.
    const now = Date.now();
    const shown = useMemo(() => {
        const list = log.filteredFlights.filter(r =>
            (statusFilter === 'all' || journeyStatus(r.flight, now).state === statusFilter) && (!noTrip || isIndependent(r.trip.id))
            && (airline === 'all' || carrierLabel(r.flight).trim().toLowerCase() === airline)
            && (airport === 'all' || placeCode(r.flight.origin) === airport || placeCode(r.flight.destination) === airport));
        return sortJourneys(list, sortKey, sortAsc);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [log.filteredFlights, statusFilter, noTrip, airline, airport, sortKey, sortAsc]);
    const airlineOptions = useMemo(() => byCarrier(log.flights), [log.flights]);
    const airportOptions = useMemo(() => byAirport(log.flights), [log.flights]);
    const filtering = Boolean(log.searchQuery.trim()) || log.timeFilter !== 'all' || log.yearFilter !== 'all' || log.classFilter !== 'all' || statusFilter !== 'all' || noTrip || airline !== 'all' || airport !== 'all';
    const independentCount = useMemo(() => log.flights.filter(r => isIndependent(r.trip.id)).length, [log.flights]);

    const tripChoices = useMemo<Trip[]>(() =>
        log.trips
            .filter(t => !t.hideInPlanner && !t.isBundleOnly && !t.archived && t.status !== 'Cancelled')
            .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '')),
    [log.trips]);

    const detail = detailId ? log.flights.find(r => r.flight.id === detailId) ?? null : null;
    useEffect(() => { if (detailId && log.loaded && !detail) setDetailId(null); }, [detailId, detail, log.loaded]);

    // The journey whose timeline is open, read from the log so it stays current after an edit.
    const timelineGroup = useMemo<JourneyGroup | null>(() => {
        if (!timelineId) return null;
        const u = groupJourneys(log.flights).find(x => x.kind === 'journey' && x.group.id === timelineId);
        return u && u.kind === 'journey' ? u.group : null;
    }, [timelineId, log.flights]);

    const open = (rec: JourneyRecord) => {
        if (selecting) {
            setSelected(s => { const next = new Set(s); if (next.has(rec.flight.id)) next.delete(rec.flight.id); else next.add(rec.flight.id); return next; });
            return;
        }
        setDetailId(rec.flight.id);
    };

    const saveDetails = (rec: JourneyRecord, patch: Partial<Transport>) => log.saveJourney(
        { ...rec.flight, ...patch }, isIndependent(rec.trip.id) ? 'unassigned' : rec.trip.id,
        { flight: rec.flight, tripId: isIndependent(rec.trip.id) ? 'unassigned' : rec.trip.id }
    );

    // Grouping by hand: join flights as one journey, or say they are not one; both can be undone.
    const regroup = (records: JourneyRecord[], key: string | undefined, message: string) => attempt(async () => {
        const before = records.map(r => ({ rec: r, key: r.flight.journeyKey }));
        await log.setJourneyKey(records, key);
        undo.show(message, () => attempt(async () => {
            for (const k of new Set(before.map(b => b.key))) await log.setJourneyKey(before.filter(b => b.key === k).map(b => b.rec), k);
        }));
    });
    const joinJourney = (records: JourneyRecord[]) => regroup(records, `j:${Math.random().toString(36).slice(2, 9)}`, `Joined ${records.length} flights as one journey`);
    const separate = (records: JourneyRecord[]) => regroup(records, 'alone', `${records.length} flights are separate now`);

    const assign = (records: JourneyRecord[], tripId: string) => attempt(async () => {
        const before = records.map(r => ({ rec: r, tripId: isIndependent(r.trip.id) ? 'unassigned' : r.trip.id }));
        await log.assignJourneys(records, tripId);
        const name = tripId === 'unassigned' ? 'no trip' : tripChoices.find(t => t.id === tripId)?.name || 'the trip';
        const what = records.length === 1 ? `${records[0].flight.origin} to ${records[0].flight.destination}` : `${records.length} flights`;
        undo.show(`Moved ${what} to ${name}`, () => attempt(async () => {
            const byTrip = new Map<string, JourneyRecord[]>();
            before.forEach(b => byTrip.set(b.tripId, [...(byTrip.get(b.tripId) || []), { flight: b.rec.flight, trip: tripId === 'unassigned' ? { ...b.rec.trip, id: 'unassigned' } : { ...b.rec.trip, id: tripId } }]));
            for (const [origin, list] of byTrip) await log.assignJourneys(list, origin);
        }));
    });

    const remove = (records: JourneyRecord[]) => attempt(async () => {
        await log.deleteJourneys(records);
        setDeleting(null);
        setDetailId(null);
        setSelected(new Set());
        setSelecting(false);
    }, "That didn't delete. Nothing was changed.");

    const makeTrip = (records: JourneyRecord[]) => attempt(async () => {
        const made = await log.createTripFromFlights(records);
        undo.show(`Created ${made.name}`, () => attempt(() => made.undo()), {
            action: onTripClick ? { label: 'Open', icon: LinkSquare, onClick: () => onTripClick(made.tripId) } : undefined,
        });
    }, "The trip wasn't created. Nothing was changed.");

    const exportAs = (format: ExportFormat) => attempt(async () => {
        await exportJourneys(shown, format);
        toast.success(`Exported ${shown.length} ${shown.length === 1 ? 'flight' : 'flights'}`);
    }, "The export didn't work. Try again.");

    const rowMenu = useCallback((rec: JourneyRecord): TripMenuItem[] => [
        { id: 'open', label: 'Details', icon: Airplane, onSelect: () => setDetailId(rec.flight.id) },
        { id: 'edit', label: 'Edit', icon: PencilSimple, onSelect: () => setEditor({ kind: 'edit', record: rec }) },
        ...(isIndependent(rec.trip.id) ? [{ id: 'trip', label: 'Create trip', icon: Suitcase, onSelect: () => void makeTrip([rec]) }] : []),
        { id: 'copy', label: 'Duplicate', icon: Copy, onSelect: () => setEditor({ kind: 'create', seed: { ...rec.flight, actualDepartureTime: undefined, actualArrivalTime: undefined }, tripId: isIndependent(rec.trip.id) ? undefined : rec.trip.id }) },
        { id: 'return', label: 'Add return flight', icon: ArrowsClockwise, onSelect: () => setEditor({ kind: 'create', seed: returnSeed(rec.flight), tripId: isIndependent(rec.trip.id) ? undefined : rec.trip.id }) },
        { id: 'map', label: 'Show on map', icon: Globe, onSelect: () => openNewPage(mapLink({ route: [rec.flight.origin, rec.flight.destination] })) },
        { id: 'delete', label: 'Delete', icon: Trash, tone: 'danger', separated: true, onSelect: () => setDeleting([rec]) },
    ], [log.createTripFromFlights]);

    const tools: DockTool[] = [
        { id: 'search', label: 'Search flights', icon: MagnifyingGlass as any, action: () => setSearchOpen(o => !o) },
        { id: 'import', label: 'Import flights', icon: UploadSimple as any, action: () => setImportOpen(true) },
        { id: 'new', label: 'New flight', icon: Plus as any, action: () => setEditor({ kind: 'create' }) },
    ];

    const brandfetchApiKey = log.workspaceSettings?.brandfetchApiKey || undefined;
    const years = log.uniqueYears;
    const sortLabel = (SORTS.find(s => s.key === sortKey && s.asc === sortAsc) ?? SORTS[0]).short;
    const tickets = shown.filter(r => selected.has(r.flight.id));

    const clearFilters = () => { log.resetFilters(); setStatusFilter('all'); setNoTrip(false); setAirline('all'); setAirport('all'); };

    return (
        <div className="custom-scrollbar h-full overflow-y-auto px-3 pt-2 pb-32 sm:px-6 md:pb-16">
            <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6">
                <div className="flex flex-wrap items-center justify-between gap-x-3">
                    <h1 className="text-[2.25rem] font-medium leading-[1.05] tracking-tight text-rp-ink sm:text-[2.5rem]">Flights</h1>
                    <RpPageToolbar
                        tools={tools}
                        ariaLabel="Flight tools"
                        search={{
                            open: searchOpen || Boolean(log.searchQuery),
                            query: log.searchQuery,
                            onQueryChange: log.setSearchQuery,
                            onClose: () => setSearchOpen(false),
                            label: 'Search flights',
                            placeholder: 'Search airline, airport, trip',
                        }}
                        className="-my-2"
                    />
                </div>

                {log.loadError ? (
                    <EmptyCard>
                        <RpEmpty title="Couldn't load your flights" action={<button type="button" className={cn(PILL, 'bg-rp-ink text-rp-on-ink')} onClick={() => log.refreshData()}>Try again</button>}>
                            {log.loadError}
                        </RpEmpty>
                    </EmptyCard>
                ) : null}

                {log.loaded ? <LiveNow items={log.flights} onOpen={open} brandfetchApiKey={brandfetchApiKey} /> : null}

                {mobile && log.loaded && log.flights.length > 0 ? (
                    <div className="-m-3 overflow-x-auto p-3 [scrollbar-width:none]">
                        <SwipeTabs
                            items={[
                                { id: 'flights', title: 'Flights', icon: Airplane as any, badge: <span className="rp-tabular text-sm font-semibold">{shown.length}</span> },
                                { id: 'stats', title: 'Stats', icon: ChartBar as any },
                            ]}
                            value={tab}
                            onChange={id => changeTab(id as Tab)}
                            panels={false}
                            label="Flights page"
                            className="w-full"
                            stretch
                            compact
                            listClassName="bg-rp-surface rp-shadow-soft"
                        />
                    </div>
                ) : null}

                <FlightAlerts alerts={alerts.alerts} onDismiss={alerts.dismiss} notify={alerts.notify} canNotify={alerts.canNotify} onToggleNotify={() => void alerts.toggleNotify()} watching={alerts.watching} />

                {log.loaded && log.flights.length > 0 && (!mobile || tab === 'stats') ? <JourneyHero items={shown} /> : null}

                {!(mobile && tab === 'stats' && log.flights.length > 0) ? (
                <section aria-label="Your flights" className="flex flex-col gap-4">
                    <div className="-m-3 overflow-x-auto p-3 [scrollbar-width:none] sm:m-0 sm:overflow-visible sm:p-0">
                        <div className="flex items-center gap-2 sm:flex-wrap" role="group" aria-label="Filters">
                            {(['all', 'upcoming', 'past'] as const).map(t => (
                                <RpChip key={t} selected={log.timeFilter === t} onClick={() => log.setTimeFilter(t)} className="shrink-0">{t === 'all' ? 'All flights' : t === 'upcoming' ? 'Upcoming' : 'Past'}</RpChip>
                            ))}
                            {years.length > 1 ? years.map(y => <RpChip key={y} selected={log.yearFilter === y} onClick={() => log.setYearFilter(log.yearFilter === y ? 'all' : y)} className="rp-tabular shrink-0">{y}</RpChip>) : null}
                            {independentCount > 0 ? (
                                <RpChip selected={noTrip} onClick={() => setNoTrip(n => !n)} className="shrink-0"><Suitcase size={16} aria-hidden /> No trip <span className="rp-tabular text-sm font-semibold">{independentCount}</span></RpChip>
                            ) : null}
                            <span className="ml-auto flex shrink-0 items-center gap-2 sm:flex-wrap sm:justify-end">
                                <TripMenu
                                    label="Filter by class"
                                    pill={{ label: log.classFilter === 'all' ? 'Class' : log.classFilter, icon: Funnel }}
                                    items={[{ id: 'all', label: 'Any class', icon: X, selected: log.classFilter === 'all', onSelect: () => log.setClassFilter('all') }, ...CLASSES.map(c => ({ id: c, label: c, icon: Airplane, selected: log.classFilter === c, onSelect: () => log.setClassFilter(c) }))]}
                                />
                                <TripMenu
                                    label="Filter by status"
                                    pill={{ label: statusFilter === 'all' ? 'Status' : STATES.find(s => s.id === statusFilter)!.label, icon: Clock }}
                                    items={[{ id: 'all', label: 'Any status', icon: X, selected: statusFilter === 'all', onSelect: () => setStatusFilter('all') }, ...STATES.map(s => ({ id: s.id, label: s.label, icon: s.id === 'cancelled' ? XCircle : Clock, selected: statusFilter === s.id, onSelect: () => setStatusFilter(s.id) }))]}
                                />
                                                                    <TripMenu
                                    label="Filter by airline"
                                    pill={{ label: airline === 'all' ? 'Airline' : airlineOptions.find(o => o.key === airline)?.label || 'Airline', icon: Airplane }}
                                    items={[{ id: 'all', label: 'Any airline', icon: X, selected: airline === 'all', onSelect: () => setAirline('all') }, ...airlineOptions.slice(0, 40).map(o => ({ id: o.key, label: `${o.label} (${o.count})`, icon: Airplane, selected: airline === o.key, onSelect: () => setAirline(o.key) }))]}
                                />
                                <TripMenu
                                    label="Filter by airport"
                                    pill={{ label: airport === 'all' ? 'Airport' : airport, icon: Globe }}
                                    items={[{ id: 'all', label: 'Any airport', icon: X, selected: airport === 'all', onSelect: () => setAirport('all') }, ...airportOptions.slice(0, 40).map(o => ({ id: o.key, label: `${o.label} (${o.count})`, icon: Globe, selected: airport === o.key, onSelect: () => setAirport(o.key) }))]}
                                />
                                <TripMenu
                                        label="Group flights"
                                        pill={{ label: grouping === 'none' ? 'Group' : grouping === 'year' ? 'By year' : 'Journeys', icon: Stack }}
                                        items={[
                                            { id: 'none', label: 'No grouping', icon: X, selected: grouping === 'none', onSelect: () => changeGrouping('none') },
                                            { id: 'year', label: 'By year', icon: CalendarBlank, selected: grouping === 'year', onSelect: () => changeGrouping('year') },
                                            { id: 'journey', label: 'Journeys', icon: Stack, selected: grouping === 'journey', onSelect: () => changeGrouping('journey') },
                                        ]}
                                    />
                                                                    <TripMenu
                                        label="Sort flights"
                                        pill={{ label: `Sort: ${sortLabel}`, icon: ArrowDown }}
                                        items={SORTS.map(s => ({ id: `${s.key}-${s.asc}`, label: s.label, icon: CalendarBlank, selected: s.key === sortKey && s.asc === sortAsc, onSelect: () => changeSort(s.key, s.asc) }))}
                                    />
                                <TripMenu
                                    label="Export flights"
                                    pill={{ label: 'Export', icon: DownloadSimple }}
                                    items={[
                                        { id: 'csv', label: 'CSV', icon: DownloadSimple, onSelect: () => void exportAs('csv') },
                                        { id: 'xlsx', label: 'Excel', icon: DownloadSimple, onSelect: () => void exportAs('xlsx') },
                                        { id: 'json', label: 'JSON', icon: DownloadSimple, onSelect: () => void exportAs('json') },
                                        { id: 'ics', label: 'Calendar (.ics)', icon: CalendarBlank, onSelect: () => void exportAs('ics') },
                                        { id: 'airtrail', label: 'AirTrail JSON', icon: DownloadSimple, onSelect: () => void exportAs('airtrail') },
                                    ]}
                                />
                                <RpChip selected={selecting} onClick={() => { setSelecting(s => !s); setSelected(new Set()); }}><CheckSquare size={16} aria-hidden /> Select</RpChip>
                            </span>
                        </div>
                    </div>

                    {!log.loaded ? (
                        <div className="flex flex-col gap-3" aria-busy="true">
                            {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-16 animate-pulse rounded-rp-tile bg-rp-surface/70" />)}
                        </div>
                    ) : log.flights.length === 0 ? (
                        <EmptyCard>
                            <RpEmpty title="No flights yet" action={
                                <span className="flex flex-wrap justify-center gap-2">
                                    <button type="button" onClick={() => setEditor({ kind: 'create' })} className={cn(PILL, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}><Plus size={16} aria-hidden /> New flight</button>
                                    <button type="button" onClick={() => setImportOpen(true)} className={cn(PILL, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}><UploadSimple size={16} aria-hidden /> Import</button>
                                </span>
                            }>
                                Log a flight or import your history and it appears here.
                            </RpEmpty>
                        </EmptyCard>
                    ) : shown.length === 0 ? (
                        <EmptyCard>
                            <RpEmpty title="No flights match" action={<button type="button" onClick={clearFilters} className={cn(PILL, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}>Clear filters</button>}>
                                Try another search or filter.
                            </RpEmpty>
                        </EmptyCard>
                    ) : (
                        <JourneyTable
                            items={shown}
                            sort={sortKey}
                            asc={sortAsc}
                            onSort={headerSort}
                            selectedId={detailId}
                            onOpen={open}
                            menu={rowMenu}
                            selecting={selecting}
                            selectedIds={selected}
                            brandfetchApiKey={brandfetchApiKey}
                            expanded={expanded}
                            onExpandedChange={setExpanded}
                            filtering={filtering}
                            noun={NOUN}
                            grouping={grouping}
                            onTimeline={g => setTimelineId(g.id)}
                        />
                    )}
                </section>
                ) : null}
            </div>

            {selecting ? (
                <div className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom,0px))] z-sticky flex justify-center px-3 md:bottom-6">
                    <div className="rp-root pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-[1.75rem] bg-rp-ink py-1.5 pr-1.5 pl-5 text-rp-on-ink rp-shadow-float">
                        <span className="rp-tabular text-sm">{selected.size} selected</span>
                        <button type="button" onClick={() => setSelected(selected.size === shown.length ? new Set() : new Set(shown.map(r => r.flight.id)))} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium outline-none hover:bg-rp-on-ink/10 focus-visible:ring-2 focus-visible:ring-rp-paper">
                            {selected.size === shown.length ? 'Clear' : 'Select all'}
                        </button>
                        <TripMenu
                            label="Move selected flights to a trip"
                            pill={{ label: 'Add to trip', icon: Suitcase }}
                            triggerClassName="!bg-rp-mustard !text-rp-on-mustard hover:!bg-rp-mustard/90"
                            items={[
                                { id: 'new', label: 'New trip from these', icon: Plus, onSelect: () => void makeTrip(tickets).then(() => setSelected(new Set())) },
                                { id: 'unassigned', label: 'No trip', icon: X, separated: true, onSelect: () => void assign(tickets, 'unassigned').then(() => setSelected(new Set())) },
                                ...tripChoices.slice(0, 30).map(t => ({ id: t.id, label: t.name, icon: Suitcase, onSelect: () => void assign(tickets, t.id).then(() => setSelected(new Set())) })),
                            ]}
                        />
                        <TripMenu
                            label="Group the selected flights"
                            pill={{ label: 'Group', icon: Stack }}
                            items={[
                                { id: 'join', label: 'Join as one journey', icon: Stack, onSelect: () => { if (tickets.length >= 2) void joinJourney(tickets).then(() => setSelected(new Set())); } },
                                { id: 'alone', label: 'Show separately', icon: X, onSelect: () => { if (tickets.length) void separate(tickets).then(() => setSelected(new Set())); } },
                                { id: 'auto', label: 'Group automatically', icon: ArrowsClockwise, onSelect: () => { if (tickets.length) void regroup(tickets, undefined, 'Back to automatic grouping').then(() => setSelected(new Set())); } },
                            ]}
                        />
                        <button type="button" disabled={tickets.length === 0} onClick={() => setDeleting(tickets)} aria-label="Delete selected flights" className="inline-flex size-11 items-center justify-center rounded-full outline-none hover:bg-rp-on-ink/10 focus-visible:ring-2 focus-visible:ring-rp-paper disabled:opacity-40">
                            <Trash size={18} />
                        </button>
                    </div>
                </div>
            ) : null}

            <JourneySheet
                record={detail}
                trips={tripChoices}
                noun="flight"
                onClose={() => setDetailId(null)}
                onEdit={rec => { setDetailId(null); setEditor({ kind: 'edit', record: rec }); }}
                onDelete={rec => remove([rec])}
                onAssign={(rec, tripId) => void assign([rec], tripId)}
                onCreateTrip={rec => { setDetailId(null); void makeTrip([rec]); }}
                onOpenTrip={onTripClick ? id => { setDetailId(null); onTripClick(id); } : undefined}
                onShowOnMap={rec => openNewPage(mapLink({ route: [rec.flight.origin, rec.flight.destination] }))}
                onSaveDetails={saveDetails}
                brandfetchApiKey={brandfetchApiKey}
            />
            <JourneyTimeline
                group={timelineGroup}
                onClose={() => setTimelineId(null)}
                onOpenLeg={rec => { setTimelineId(null); setDetailId(rec.flight.id); }}
                onOpenTrip={onTripClick ? id => { setTimelineId(null); onTripClick(id); } : undefined}
                onRenameTrip={(tripId, name) => attempt(async () => { const t = log.trips.find(x => x.id === tripId); if (t) await dataService.updateTrip({ ...t, name }); })}
                onTakeOff={rec => void assign([rec], 'unassigned')}
                onCreateTrip={group => { setTimelineId(null); void makeTrip(group.legs); }}
                onSeparate={group => { setTimelineId(null); void separate(group.legs); }}
                onAuto={group => { setTimelineId(null); void regroup(group.legs, undefined, 'Back to automatic grouping'); }}
                brandfetchApiKey={brandfetchApiKey}
            />
            <JourneyEditor
                target={editor}
                trips={tripChoices}
                modes={['Flight']}
                noun="flight"
                settings={log.workspaceSettings}
                brandfetchApiKey={brandfetchApiKey}
                onClose={() => setEditor(null)}
                onSave={log.saveJourney}
                history={log.flights}
                onNextLeg={(saved, tid) => setEditor({ kind: 'create', tripId: tid === 'unassigned' ? undefined : tid, seed: { mode: saved.mode, origin: saved.destination, departureDate: saved.arrivalDate || saved.departureDate, arrivalDate: saved.arrivalDate || saved.departureDate, confirmationCode: saved.confirmationCode, departureTime: '', arrivalTime: '' } })}
            />
            <ImportSheet
                open={importOpen}
                existing={log.flights}
                trips={tripChoices}
                onClose={() => setImportOpen(false)}
                onImported={n => { toast.success(`Imported ${n} ${n === 1 ? 'flight' : 'flights'}`); log.refreshData(); }}
                brandfetchApiKey={brandfetchApiKey}
            />
            <RpSheet
                open={Boolean(deleting) && !detail}
                onClose={() => setDeleting(null)}
                title={deleting ? `Delete ${deleting.length === 1 ? 'this flight' : `${deleting.length} flights`}?` : ''}
                footer={deleting ? (
                    <>
                        <button type="button" onClick={() => setDeleting(null)} className="inline-flex min-h-11 items-center rounded-full bg-rp-inset px-5 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">Keep {deleting.length === 1 ? 'flight' : 'flights'}</button>
                        <HoldButton onHoldComplete={() => { void remove(deleting); }} resetAfter={0}>Hold to delete</HoldButton>
                    </>
                ) : null}
            >
                <p className="text-sm text-rp-muted">This can't be undone.</p>
            </RpSheet>
            {undo.host}
        </div>
    );
};

export default FlightsNew;
