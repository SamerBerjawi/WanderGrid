import React, { lazy, Suspense, useMemo, useState } from 'react';
import type { PackingItem, Trip, User } from '../../types';
import { useTripsData, type TripDraft } from '../../hooks/useTripsData';
import { bucketOf, canMoveTo, destinationsOf, isTravelling, timingOf, todayISO, tripDays, type TripBucket } from '../../utils/tripsModel';
import { costSplit, shiftDate, tripStats } from '../../utils/tripItinerary';
import { formatCurrency, formatDate, formatDateRange } from '../../utils/formatters';
import { errorMessage, toast } from '../../services/toast';
import SwipeTabs from '../../components/kokonutui/swipe-tabs';
import { RpEmpty } from '../../components/new/ui';
import { RpChipLabel, RpKpi } from '../../components/new/atlas/AtlasParts';
import { RpHugeicon } from '../../components/new/RpHugeicon';
import { useUndoToast } from '../../components/new/UndoToast';
import { TripMenu } from '../../components/new/trips/TripMenu';
import { BUCKET_LABEL, tripMenuItems, type TripActions } from '../../components/new/trips/TripCard';
import { MODE_ICON, SKINS, STEPS, initials, nextMove } from '../../components/new/trips/TripDetailsModal';
import { DeleteTripSheet, TripSheet, type TripSheetTarget } from '../../components/new/trips/TripSheets';
import { TripCanvas } from '../../components/new/trip/TripCanvas';
const TripMapPanel = lazy(() => import('../../components/new/trip/TripMapPanel'));
import { BookingsPanel, CostsPanel, GearPanel, ItineraryPanel, NotesPanel, type EditStep } from '../../components/new/trip/TripPanels';
import { Airplane, ArrowLeft, ArrowRight, Backpack, Bed, CalendarBlank, FileText, Kanban, MapTrifold, Moon, Path, MapPin, PencilSimple, Receipt, Suitcase, Ticket } from '../../components/ui/hugeicons';
import { cn } from '../../utils/cn';

/**
 * TripNew (UI_UX_DESIGN_REFERENCE.md §5.0): the redesigned page for one trip, at /trip-new/:id. The
 * features come from the data layer (useTripsData: the trip, status, archive, duplicate, delete, edit
 * of legs, stays and activities, packing list, notes); the layout is new: a header in the trip's
 * status colour, four counts, and tabs for Itinerary, Canvas (the whole plan on one grid), Bookings, Costs, Gear and Notes.
 * Not carried over yet: AI guide, weather, route map, calendar view, flight import and ICS export.
 */

interface TripNewProps {
    tripId: string;
    /** Back to the trips list. */
    onBack: () => void;
    /** Opens the original trip page (kept while TripNew is being built out). */
    onOpenOriginal?: (tripId: string) => void;
}

type TabId = 'itinerary' | 'canvas' | 'map' | 'bookings' | 'costs' | 'gear' | 'notes';
const TAB_KEY = 'wandergrid_trip_new_tab';
const TAB_PILL: Record<TabId, { bg: string; text: string; icon: string }> = {
    itinerary: { bg: 'bg-rp-mustard', text: 'text-rp-on-mustard', icon: 'text-rp-ochre' },
    canvas: { bg: 'bg-rp-green', text: 'text-rp-paper', icon: 'text-rp-green' },
    map: { bg: 'bg-rp-sea', text: 'text-rp-paper', icon: 'text-rp-sea' },
    bookings: { bg: 'bg-rp-rust', text: 'text-rp-paper', icon: 'text-rp-rust' },
    costs: { bg: 'bg-rp-ink', text: 'text-rp-on-ink', icon: 'text-rp-ink' },
    gear: { bg: 'bg-rp-ink', text: 'text-rp-on-ink', icon: 'text-rp-ink' },
    notes: { bg: 'bg-rp-ink', text: 'text-rp-on-ink', icon: 'text-rp-muted' },
};
const readTab = (): TabId => {
    try {
        const v = localStorage.getItem(TAB_KEY);
        return v === 'canvas' || v === 'map' || v === 'bookings' || v === 'costs' || v === 'gear' || v === 'notes' ? v : 'itinerary';
    } catch { return 'itinerary'; }
};
const currentUserId = (): string | undefined => {
    try { return JSON.parse(localStorage.getItem('wandergrid_session_user') || 'null')?.id; } catch { return undefined; }
};
const SHOW_CITIES = 3;

export const TripNew: React.FC<TripNewProps> = ({ tripId, onBack, onOpenOriginal }) => {
    const data = useTripsData();
    const undo = useUndoToast();
    const [tab, setTab] = useState<TabId>(readTab);
    const [sheet, setSheet] = useState<TripSheetTarget | null>(null);
    const [deleting, setDeleting] = useState<Trip | null>(null);
    const trip = useMemo(() => data.trips.find(t => t.id === tripId), [data.trips, tripId]);

    const changeTab = (next: TabId) => {
        setTab(next);
        try { localStorage.setItem(TAB_KEY, next); } catch { /* storage unavailable */ }
    };
    const attempt = async (run: () => Promise<void>) => {
        try { await run(); } catch (e) { toast.error(errorMessage(e, "That didn't save. Try again.")); }
    };

    if (data.loading) {
        return (
            <div className="px-3 pt-2 sm:px-6" aria-busy="true">
                <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4">
                    <div className="h-64 animate-pulse rounded-rp-card bg-rp-surface/70" />
                    <div className="h-24 animate-pulse rounded-rp-card bg-rp-surface/70" />
                </div>
            </div>
        );
    }
    if (!trip) {
        return (
            <div className="px-3 pt-2 sm:px-6">
                <div className="mx-auto w-full max-w-[1180px] rounded-rp-card bg-rp-surface rp-shadow-rest">
                    <RpEmpty
                        title={data.error ? "Couldn't load this trip" : 'Trip not found'}
                        action={<button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink"><ArrowLeft size={16} aria-hidden /> Back to trips</button>}
                    >
                        {data.error ?? 'It may have been deleted, or the link is wrong.'}
                    </RpEmpty>
                </div>
            </div>
        );
    }

    const today = todayISO();
    const bucket = bucketOf(trip, today);
    const travelling = isTravelling(trip, today);
    const skin = SKINS[travelling ? 'ink' : bucket];
    const step = bucket === 'planned' ? 0 : bucket === 'confirmed' ? (travelling ? 2 : 1) : 3;
    const move = nextMove(bucket);
    const cities = destinationsOf(trip);
    const split = costSplit(trip);
    const timing = timingOf(trip, today);
    const days = tripDays(trip);
    const stats = tripStats(trip);
    const members = (trip.participants || []).map(id => data.users.find(u => u.id === id)).filter((u): u is User => Boolean(u));
    const hero = split.total > 0
        ? { text: formatCurrency(split.total), unit: 'Total cost' }
        : timing.value !== null && timing.state !== 'past' ? { text: String(timing.value), unit: timing.unit } : null;

    const moveTo = (to: TripBucket) => attempt(async () => {
        const can = canMoveTo(trip, to, today);
        if (!can.ok) { toast.info(can.reason); return; }
        const previous = await data.moveTo(trip.id, to);
        if (previous) undo.show(`Moved ${trip.name} to ${BUCKET_LABEL[to]}`, () => attempt(async () => { await data.setStatus(trip.id, previous); }));
    });
    const actions: TripActions = {
        onDetails: () => undefined,
        onEdit: t => setSheet({ kind: 'edit', trip: t }),
        onOpenTrip: t => onOpenOriginal?.(t.id),
        onMove: (_t, b) => void moveTo(b),
        onArchive: t => attempt(async () => {
            await data.setArchived([t.id], true);
            undo.show(`Archived ${t.name}`, () => attempt(() => data.setArchived([t.id], false)));
        }),
        onRestore: t => attempt(async () => {
            if (t.status === 'Cancelled') await data.setStatus(t.id, 'Planning');
            else await data.setArchived([t.id], false);
            undo.show(`Restored ${t.name}`, () => undefined);
        }),
        onDuplicate: t => attempt(async () => {
            const copy = await data.duplicate(t);
            undo.show(`Duplicated ${t.name}`, () => attempt(() => data.remove(copy.id)));
        }),
        onCancel: t => attempt(async () => {
            const previous = await data.setStatus(t.id, 'Cancelled');
            undo.show(`Cancelled ${t.name}`, () => attempt(async () => { if (previous) await data.setStatus(t.id, previous); }));
        }),
        onDelete: setDeleting,
    };
    const menu = tripMenuItems(trip, bucket, actions).filter(i => i.id !== 'open' || Boolean(onOpenOriginal));
    const edit = (s: EditStep) => setSheet({ kind: 'edit', trip, step: s });

    // Canvas drags: each change is saved at once and can be undone.
    const moved = (message: string, undoChanges: Partial<Trip>, changes: Partial<Trip>) => attempt(async () => {
        await data.patch(trip.id, changes);
        undo.show(message, () => attempt(async () => { await data.patch(trip.id, undoChanges); }));
    });
    const moveActivity = (id: string, date: string) => {
        const list = trip.activities || [];
        const item = list.find(a => a.id === id);
        if (!item || item.date === date) return;
        void moved(`Moved ${item.title} to ${formatDate(date, 'short')}`, { activities: list }, { activities: list.map(a => (a.id === id ? { ...a, date } : a)) });
    };
    const moveTransport = (id: string, delta: number) => {
        const list = trip.transports || [];
        const item = list.find(t => t.id === id);
        if (!item || delta === 0) return;
        void moved(
            `Moved ${item.origin} to ${item.destination} by ${Math.abs(delta)} ${Math.abs(delta) === 1 ? 'day' : 'days'}`,
            { transports: list },
            { transports: list.map(t => (t.id === id ? { ...t, departureDate: shiftDate(t.departureDate, delta), arrivalDate: shiftDate(t.arrivalDate, delta) } : t)) }
        );
    };
    const moveStay = (id: string, delta: number) => {
        const list = trip.accommodations || [];
        const item = list.find(a => a.id === id);
        if (!item || delta === 0) return;
        void moved(
            `Moved ${item.name} by ${Math.abs(delta)} ${Math.abs(delta) === 1 ? 'day' : 'days'}`,
            { accommodations: list },
            { accommodations: list.map(a => (a.id === id ? { ...a, checkInDate: shiftDate(a.checkInDate, delta), checkOutDate: shiftDate(a.checkOutDate, delta) } : a)) }
        );
    };
    const savePacking = (items: PackingItem[]) => attempt(async () => { await data.patch(trip.id, { packingList: items }); });

    const tabItems = ([
        { id: 'itinerary', title: 'Itinerary', icon: CalendarBlank },
        { id: 'canvas', title: 'Canvas', icon: Kanban },
        { id: 'map', title: 'Map', icon: MapTrifold },
        { id: 'bookings', title: 'Bookings', icon: Ticket },
        { id: 'costs', title: 'Costs', icon: Receipt },
        { id: 'gear', title: 'Gear', icon: Backpack },
        { id: 'notes', title: 'Notes', icon: FileText },
    ] as const).map(t => ({ ...t, iconClassName: tab === t.id ? undefined : TAB_PILL[t.id].icon }));

    const circleBtn = cn('inline-flex size-11 items-center justify-center rounded-full border outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-current', skin.ring);
    const pill = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 active:scale-[0.98]';

    return (
        <div className="custom-scrollbar h-full overflow-y-auto px-3 pt-2 pb-32 sm:px-6 md:pb-16">
            <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 lg:gap-6">
                <div>
                    <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-full pr-3 text-sm font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                        <ArrowLeft size={16} aria-hidden /> Trips
                    </button>
                </div>

                <header className={cn('rounded-rp-card p-5 rp-shadow-rest sm:p-8', skin.card)}>
                    <div className="flex items-start justify-between gap-3">
                        <span className={cn('flex size-12 items-center justify-center rounded-full', skin.panel)}>
                            <RpHugeicon name={trip.hugeicon} size={22} fallback={<Suitcase size={22} aria-hidden />} />
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                            <button type="button" aria-label={`Edit ${trip.name}`} onClick={() => setSheet({ kind: 'edit', trip })} className={circleBtn}><PencilSimple size={18} aria-hidden /></button>
                            <TripMenu label={`${trip.name} actions`} items={menu} triggerClassName={cn('!size-11 !rounded-full border !text-current', skin.ring)} />
                        </div>
                    </div>

                    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                        <div className="min-w-0">
                            <p className={cn('rp-tabular text-sm', skin.muted)}>{trip.startDate ? formatDateRange(trip.startDate, trip.endDate || trip.startDate) : 'No dates yet'}</p>
                            <h1 className="mt-1 text-[2.25rem] leading-[1.05] font-medium tracking-tight sm:text-[3rem]">{trip.name}</h1>
                            {cities.length > 0 ? (
                                <p className={cn('mt-2 flex items-center gap-1.5 text-base', skin.muted)}>
                                    <MapPin size={16} className="shrink-0" aria-hidden />
                                    <span className="truncate">{cities.slice(0, SHOW_CITIES).join(' · ')}{cities.length > SHOW_CITIES ? ` · +${cities.length - SHOW_CITIES}` : ''}</span>
                                </p>
                            ) : null}
                        </div>
                        {hero ? (
                            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 lg:flex-col lg:items-end lg:gap-1">
                                <span className="rp-tabular text-[3rem] leading-none font-semibold tracking-tight sm:text-[3.5rem]">{hero.text}</span>
                                <span className={cn('text-sm', skin.muted)}>{hero.unit}</span>
                            </p>
                        ) : null}
                    </div>

                    <ol className="mt-6 grid grid-cols-4 gap-1.5" aria-label="Status">
                        {STEPS.map((label, i) => (
                            <li key={label} aria-current={i === step ? 'step' : undefined} className="flex flex-col gap-2">
                                <span className={cn('h-1.5 rounded-full', i <= step ? skin.bar : skin.track)} />
                                <span className={cn('truncate text-xs', i === step ? 'font-semibold' : skin.muted)}>{label}</span>
                            </li>
                        ))}
                    </ol>

                    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                            {members.slice(0, 4).map(u => (
                                <span key={u.id} className="flex items-center gap-2 text-sm">
                                    <span className={cn('flex size-9 items-center justify-center rounded-full text-xs font-semibold', skin.panel)}>{initials(u.name)}</span>
                                    {u.name.split(' ')[0]}
                                </span>
                            ))}
                            {members.length > 4 ? <span className={cn('text-sm', skin.muted)}>+{members.length - 4}</span> : null}
                        </div>
                        {move ? (
                            <button type="button" onClick={() => void moveTo(move.to)} className={cn(pill, skin.primary)}>
                                {move.label} <ArrowRight size={16} aria-hidden />
                            </button>
                        ) : null}
                    </div>
                </header>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:gap-4">
                    <Tile><RpKpi accent="ink" icon={CalendarBlank} value={days} label={days === 1 ? 'Day' : 'Days'} /></Tile>
                    <Tile>
                        <RpKpi
                            accent="mustard"
                            icon={Moon}
                            value={stats.nightsBooked}
                            label="Nights booked"
                            chip={stats.nightsTotal > 0 ? <RpChipLabel tone={stats.nightsBooked >= stats.nightsTotal ? 'green' : 'mustard'}>of {stats.nightsTotal}</RpChipLabel> : undefined}
                        />
                    </Tile>
                    <Tile><RpKpi accent="rust" icon={Path} value={stats.distanceKm} format={{ maximumFractionDigits: 0 }} label="km travelled" /></Tile>
                    <Tile>
                        <RpKpi
                            accent="rust"
                            icon={Airplane}
                            value={(trip.transports || []).length}
                            label="Transport"
                            chip={stats.excursions > 0 ? <RpChipLabel tone="inset">{stats.excursions} {stats.excursions === 1 ? 'excursion' : 'excursions'}</RpChipLabel> : undefined}
                        />
                    </Tile>
                    <Tile><RpKpi accent="mustard" icon={Bed} value={(trip.accommodations || []).length} label="Stays" /></Tile>
                    <Tile><RpKpi accent="green" icon={Ticket} value={(trip.activities || []).length} label="Activities" /></Tile>
                </div>

                <div className="-m-3 overflow-x-auto p-3 [scrollbar-width:none]">
                    <SwipeTabs
                        items={tabItems}
                        value={tab}
                        onChange={id => changeTab(id as TabId)}
                        panels={false}
                        label="Trip sections"
                        className="w-full sm:w-auto"
                        listClassName="bg-rp-surface rp-shadow-soft"
                        activeColor={TAB_PILL[tab].bg}
                        activeTextColor={TAB_PILL[tab].text}
                    />
                </div>

                <section aria-label={tabItems.find(t => t.id === tab)?.title}>
                    {tab === 'itinerary' ? <ItineraryPanel trip={trip} brandfetchApiKey={data.brandfetchApiKey} onEdit={edit} /> : null}
                    {tab === 'canvas' ? <TripCanvas trip={trip} brandfetchApiKey={data.brandfetchApiKey} onEdit={edit} onMoveActivity={moveActivity} onMoveTransport={moveTransport} onMoveStay={moveStay} /> : null}
                    {tab === 'map' ? (
                        <Suspense fallback={<div className="h-[24rem] animate-pulse rounded-rp-card bg-rp-surface/70 lg:h-[36rem]" aria-busy="true" />}>
                            <TripMapPanel trip={trip} onSaveStops={async locations => { await data.patch(trip.id, { locations }); }} />
                        </Suspense>
                    ) : null}
                    {tab === 'bookings' ? <BookingsPanel trip={trip} brandfetchApiKey={data.brandfetchApiKey} onEdit={edit} /> : null}
                    {tab === 'costs' ? <CostsPanel trip={trip} members={members.length} onSaveBudget={target => attempt(async () => { await data.patch(trip.id, { targetBudget: target }); })} /> : null}
                    {tab === 'gear' ? <GearPanel items={trip.packingList || []} onChange={savePacking} /> : null}
                    {tab === 'notes' ? (
                        <NotesPanel
                            notes={trip.notes || ''}
                            members={members}
                            onSave={async notes => { await data.patch(trip.id, { notes: notes || undefined }); }}
                        />
                    ) : null}
                </section>
            </div>

            <TripSheet
                target={sheet}
                users={data.users}
                entitlements={data.entitlements}
                currentUserId={currentUserId()}
                brandfetchApiKey={data.brandfetchApiKey}
                onClose={() => setSheet(null)}
                onSave={async (draft: TripDraft, t?: Trip) => { if (t) await data.update(t, draft); }}
                onDelete={setDeleting}
                onOpenTrip={t => onOpenOriginal?.(t.id)}
            />
            <DeleteTripSheet
                trip={deleting}
                onClose={() => setDeleting(null)}
                onConfirm={t => attempt(async () => { await data.remove(t.id); setDeleting(null); setSheet(null); onBack(); })}
            />
            {undo.host}
        </div>
    );
};

const Tile: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="flex min-w-0 flex-col justify-center rounded-rp-tile bg-rp-surface p-3 rp-shadow-rest sm:p-4 lg:p-5">{children}</div>
);

export default TripNew;
