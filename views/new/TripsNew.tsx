import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Trip } from '../../types';
import { useTripsData, type TripDraft } from '../../hooks/useTripsData';
import { canMoveTo, tripMatches, tripYears, type TripBucket } from '../../utils/tripsModel';
import { errorMessage, toast } from '../../services/toast';
import SwipeTabs from '../../components/kokonutui/swipe-tabs';
import type { DockTool } from '../../components/kokonutui/tool-dock';
import { RpChip, RpEmpty, useIsMobile } from '../../components/new/ui';
import { RpKpi } from '../../components/new/atlas/AtlasParts';
import { RpPageToolbar } from '../../components/new/PageToolbar';
import { useUndoToast } from '../../components/new/UndoToast';
import { TripBoard } from '../../components/new/trips/TripBoard';
import { TripList } from '../../components/new/trips/TripList';
import { BUCKET_HEAD, BUCKET_LABEL, type TripActions } from '../../components/new/trips/TripCard';
import { TripDetailsModal, type TripOrigin } from '../../components/new/trips/TripDetailsModal';
import { DeleteTripSheet, TripSheet, type TripSheetTarget } from '../../components/new/trips/TripSheets';
import { Archive, CalendarBlank, Kanban, List, MagnifyingGlass, MapPin, Plus, Suitcase } from '../../components/ui/hugeicons';
import { cn } from '../../utils/cn';

/**
 * TripsNew (UI_UX_DESIGN_REFERENCE.md §5.0): the redesigned trip planner at /trips-new. The features
 * come from the data layer (useTripsData: trips and members, status, archive, create, edit, delete);
 * the layout is new: a board of trips by status (or a list), drag to change status with undo,
 * Archive and Delete drop zones, and one sheet to create or edit a trip.
 */

interface TripsNewProps {
    /** Kept for migration: same props as the original Planner. Opens a trip's page. */
    onTripClick?: (tripId: string) => void;
}

type View = 'board' | 'list';
const VIEW_KEY = 'wandergrid_trips_new_view';
const STAGE_KEY = 'wandergrid_trips_new_stage';
const NEW_TRIP_EVENT = 'rp:new-trip';

const readView = (): View => {
    try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'board'; } catch { return 'board'; }
};
const readStage = (): TripBucket => {
    try {
        const v = localStorage.getItem(STAGE_KEY);
        return v === 'planned' || v === 'past' ? v : 'confirmed';
    } catch { return 'confirmed'; }
};
const currentUserId = (): string | undefined => {
    try { return JSON.parse(localStorage.getItem('wandergrid_session_user') || 'null')?.id; } catch { return undefined; }
};

/** The selected stage tab takes the column's colour, like the Map and Atlas tabs. */
const STAGE_PILL: Record<TripBucket, { bg: string; text: string }> = {
    planned: { bg: 'bg-rp-mustard', text: 'text-rp-on-mustard' },
    confirmed: { bg: 'bg-rp-green', text: 'text-rp-paper' },
    past: { bg: 'bg-rp-ink', text: 'text-rp-on-ink' },
};

const PILL = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-canvas active:scale-[0.97]';

const Count: React.FC<{ n: number }> = ({ n }) => <span className="rp-tabular text-sm font-semibold">{n}</span>;

export const TripsNew: React.FC<TripsNewProps> = ({ onTripClick }) => {
    const data = useTripsData();
    const undo = useUndoToast();
    const mobile = useIsMobile();
    const [view, setView] = useState<View>(readView);
    const [stage, setStage] = useState<TripBucket>(readStage);
    const [query, setQuery] = useState('');
    const [year, setYear] = useState('all');
    const [showArchived, setShowArchived] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [detailsId, setDetailsId] = useState<string | null>(null);
    const [detailsOrigin, setDetailsOrigin] = useState<TripOrigin | null>(null);
    const [sheet, setSheet] = useState<TripSheetTarget | null>(null);
    const [deleting, setDeleting] = useState<Trip | null>(null);

    const changeView = (next: View) => {
        setView(next);
        try { localStorage.setItem(VIEW_KEY, next); } catch { /* storage unavailable */ }
    };
    const changeStage = (next: TripBucket) => {
        setStage(next);
        try { localStorage.setItem(STAGE_KEY, next); } catch { /* storage unavailable */ }
    };

    // "New trip" from the shell's quick actions: on arrival (?new=1) or while already on this page.
    useEffect(() => {
        try {
            const url = new URL(window.location.href);
            if (url.searchParams.get('new') === '1') {
                url.searchParams.delete('new');
                window.history.replaceState({}, '', url.pathname + url.search);
                setSheet({ kind: 'create', bucket: 'planned' });
            }
        } catch { /* ignore */ }
        const onNew = () => setSheet({ kind: 'create', bucket: 'planned' });
        window.addEventListener(NEW_TRIP_EVENT, onNew);
        return () => window.removeEventListener(NEW_TRIP_EVENT, onNew);
    }, []);

    const filterTrips = useCallback(
        (list: Trip[]) => list.filter(t => tripMatches(t, query) && (year === 'all' || tripYears(t).includes(year))),
        [query, year]
    );
    const columns = useMemo(() => ({
        planned: filterTrips(data.columns.planned),
        confirmed: filterTrips(data.columns.confirmed),
        past: filterTrips(data.columns.past),
    }), [data.columns, filterTrips]);
    const archived = useMemo(() => filterTrips(data.archived), [data.archived, filterTrips]);
    const shown = columns.planned.length + columns.confirmed.length + columns.past.length;
    const filtering = Boolean(query.trim()) || year !== 'all';

    const attempt = async (run: () => Promise<void>) => {
        try { await run(); } catch (e) { toast.error(errorMessage(e, "That didn't save. Try again.")); }
    };

    const move = (trip: Trip, bucket: TripBucket) => attempt(async () => {
        const can = canMoveTo(trip, bucket, data.today);
        if (!can.ok) { toast.info(can.reason); return; }
        const previous = await data.moveTo(trip.id, bucket);
        if (previous) undo.show(`Moved ${trip.name} to ${BUCKET_LABEL[bucket]}`, () => attempt(async () => { await data.setStatus(trip.id, previous); }));
    });
    const archive = (trip: Trip) => attempt(async () => {
        await data.setArchived([trip.id], true);
        undo.show(`Archived ${trip.name}`, () => attempt(() => data.setArchived([trip.id], false)));
    });
    const restore = (trip: Trip) => attempt(async () => {
        await data.setArchived([trip.id], false);
        undo.show(`Restored ${trip.name}`, () => attempt(() => data.setArchived([trip.id], true)));
    });
    const openTrip = (trip: Trip) => { if (onTripClick) onTripClick(trip.id); };
    const confirmDelete = (trip: Trip) => attempt(async () => {
        await data.remove(trip.id);
        setDeleting(null);
        setSheet(null);
        setDetailsId(null);
    });

    const actions: TripActions = {
        onDetails: (trip, from) => {
            setDetailsOrigin(from ? { x: from.left + from.width / 2, y: from.top + from.height / 2, width: from.width } : null);
            setDetailsId(trip.id);
        },
        onEdit: trip => setSheet({ kind: 'edit', trip }),
        onOpenTrip: openTrip,
        onMove: move,
        onArchive: archive,
        onRestore: restore,
        onDelete: setDeleting,
    };

    const stageItems = (['planned', 'confirmed', 'past'] as TripBucket[]).map(b => ({
        id: b,
        title: BUCKET_LABEL[b],
        icon: BUCKET_HEAD[b].icon,
        iconClassName: stage === b ? undefined : BUCKET_HEAD[b].text,
        badge: <Count n={columns[b].length} />,
    }));

    const detailsTrip = detailsId ? data.trips.find(t => t.id === detailsId) ?? null : null;

    const tools: DockTool[] = [
        { id: 'board', label: 'Board', icon: Kanban as any },
        { id: 'list', label: 'List', icon: List as any },
        { id: 'search', label: 'Search trips', icon: MagnifyingGlass as any, action: () => setSearchOpen(o => !o), dividerBefore: true },
        { id: 'new', label: 'New trip', icon: Plus as any, action: () => setSheet({ kind: 'create', bucket: 'planned' }) },
    ];

    const dragEnabled = !mobile && view === 'board' && !showArchived;
    const years = data.years;

    return (
        <div className="custom-scrollbar h-full overflow-y-auto px-3 pt-2 pb-32 sm:px-6 md:pb-16">
            <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6">
                <div className="flex flex-wrap items-center justify-between gap-x-3">
                    <h1 className="text-[2.25rem] font-medium leading-[1.05] tracking-tight text-rp-ink sm:text-[2.5rem]">Trips</h1>
                    <RpPageToolbar
                        tools={tools}
                        value={view}
                        onValueChange={id => changeView(id as View)}
                        ariaLabel="Trip tools"
                        search={{
                            open: searchOpen || Boolean(query),
                            query,
                            onQueryChange: setQuery,
                            onClose: () => setSearchOpen(false),
                            label: 'Search trips',
                            placeholder: 'Search trips',
                        }}
                        className="-my-2"
                    />
                </div>

                {data.error ? (
                    <div className="rounded-rp-card bg-rp-surface rp-shadow-rest">
                        <RpEmpty title="Couldn't load your trips" action={<button type="button" className={cn(PILL, 'bg-rp-ink text-rp-on-ink')} onClick={() => void data.reload()}>Try again</button>}>
                            {data.error}
                        </RpEmpty>
                    </div>
                ) : null}

                <div className="grid grid-cols-3 gap-3 lg:gap-6">
                    <StatTile><RpKpi accent="green" icon={Suitcase} value={data.stats.coming} label="Trips coming" /></StatTile>
                    <StatTile><RpKpi accent="ink" icon={CalendarBlank} value={data.stats.days} label="Days away" /></StatTile>
                    <StatTile><RpKpi accent="mustard" icon={MapPin} value={data.stats.places} label="Places" /></StatTile>
                </div>

                <section aria-label="Your trips" className="flex flex-col gap-4">
                    {mobile && view === 'board' && !showArchived ? (
                        <div className="-m-3 overflow-x-auto p-3 [scrollbar-width:none]">
                            <SwipeTabs
                                items={stageItems}
                                value={stage}
                                onChange={id => changeStage(id as TripBucket)}
                                panels={false}
                                label="Trip status"
                                className="w-full"
                                stretch
                                listClassName="bg-rp-surface rp-shadow-soft"
                                activeColor={STAGE_PILL[stage].bg}
                                activeTextColor={STAGE_PILL[stage].text}
                            />
                        </div>
                    ) : null}

                    {years.length > 1 || data.archived.length > 0 ? (
                        <div className="-m-3 overflow-x-auto p-3 [scrollbar-width:none]">
                            <div className="flex items-center gap-2" role="group" aria-label="Filters">
                                {years.length > 1 ? (
                                    <>
                                        <RpChip selected={year === 'all'} onClick={() => setYear('all')} className="shrink-0">All years</RpChip>
                                        {years.map(y => <RpChip key={y} selected={year === y} onClick={() => setYear(year === y ? 'all' : y)} className="rp-tabular shrink-0">{y}</RpChip>)}
                                    </>
                                ) : null}
                                {data.archived.length > 0 ? (
                                    <RpChip selected={showArchived} onClick={() => setShowArchived(s => !s)} className="shrink-0">
                                        <Archive size={16} aria-hidden /> Archived <Count n={data.archived.length} />
                                    </RpChip>
                                ) : null}
                            </div>
                        </div>
                    ) : null}

                    {data.loading ? (
                        <div className="grid gap-3 md:grid-cols-3" aria-busy="true">
                            {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-36 animate-pulse rounded-rp-tile bg-rp-surface/70" />)}
                        </div>
                    ) : showArchived ? (
                        archived.length === 0 ? (
                            <EmptyCard><RpEmpty title={filtering ? 'No archived trips match' : 'Nothing archived'}>{filtering ? 'Try another search.' : 'Archived trips are kept here until you restore them.'}</RpEmpty></EmptyCard>
                        ) : (
                            <TripList flat={archived} users={data.users} today={data.today} actions={actions} onAdd={() => undefined} />
                        )
                    ) : data.active.length === 0 ? (
                        <EmptyCard>
                            <RpEmpty title="No trips yet" action={<button type="button" onClick={() => setSheet({ kind: 'create', bucket: 'planned' })} className={cn(PILL, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}><Plus size={16} aria-hidden /> New trip</button>}>
                                Plan your first trip and it appears here.
                            </RpEmpty>
                        </EmptyCard>
                    ) : shown === 0 ? (
                        <EmptyCard>
                            <RpEmpty title="No trips match" action={<button type="button" onClick={() => { setQuery(''); setYear('all'); }} className={cn(PILL, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}>Clear filters</button>}>
                                Try another search or year.
                            </RpEmpty>
                        </EmptyCard>
                    ) : view === 'list' ? (
                        <TripList columns={columns} users={data.users} today={data.today} actions={actions} onAdd={() => undefined} />
                    ) : (
                        <TripBoard
                            columns={columns}
                            users={data.users}
                            today={data.today}
                            actions={actions}
                            show={mobile ? stage : 'all'}
                            dragEnabled={dragEnabled}
                            onAdd={bucket => setSheet({ kind: 'create', bucket })}
                            onDropMove={move}
                            onDropArchive={archive}
                            onDropDelete={setDeleting}
                        />
                    )}
                </section>
            </div>

            <TripSheet
                target={sheet}
                users={data.users}
                currentUserId={currentUserId()}
                brandfetchApiKey={data.brandfetchApiKey}
                onClose={() => setSheet(null)}
                onSave={async (draft: TripDraft, trip?: Trip) => { if (trip) await data.update(trip, draft); else await data.create(draft); }}
                onDelete={setDeleting}
                onOpenTrip={openTrip}
            />
            <TripDetailsModal
                trip={detailsTrip}
                origin={detailsOrigin}
                users={data.users}
                brandfetchApiKey={data.brandfetchApiKey}
                onClose={() => setDetailsId(null)}
                onEdit={trip => { setDetailsId(null); setSheet({ kind: 'edit', trip }); }}
                onOpenTrip={trip => { setDetailsId(null); openTrip(trip); }}
                onMove={move}
            />
            <DeleteTripSheet trip={deleting} onClose={() => setDeleting(null)} onConfirm={confirmDelete} />
            {undo.host}
        </div>
    );
};

const StatTile: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="flex min-w-0 flex-col justify-center rounded-rp-tile bg-rp-surface p-3 rp-shadow-rest sm:p-4 lg:p-5">{children}</div>
);

const EmptyCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="rounded-rp-card bg-rp-surface rp-shadow-rest">{children}</div>
);

export default TripsNew;
