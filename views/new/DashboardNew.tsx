import React, { useCallback, useMemo, useState } from 'react';
import NumberFlow from '@number-flow/react';
import { useDashboardData } from '../../hooks/useDashboardData';
import { WidgetGrid, type WidgetGridItem, type WidgetLayoutItem } from '../../components/kokonutui/bento-grid';
import type { DockTool } from '../../components/kokonutui/tool-dock';
import { RpPageToolbar } from '../../components/new/PageToolbar';
import { HiddenWidgets } from '../../components/new/dashboard/HiddenWidgets';
import { RpEmpty, useIsMobile } from '../../components/new/ui';
import { openPage } from '../../utils/appNavigation';
import {
    LeaveWidget, MapWidget, MetricWidget, NextWidget, PassportWidget, RecentWidget, UpcomingWidget, WhereNextWidget, YearsWidget, nextTone,
} from '../../components/new/dashboard/DashboardWidgets';
import {
    Airplane, ArrowCounterClockwise, ChartBar, Check, PencilSimple, ClockCounterClockwise, Compass, Globe, IdentificationCard, Moon, Path, Plus, SunHorizon, Suitcase, type Icon,
} from '../../components/ui/hugeicons';
import { mapLink } from '../../utils/mapLinks';
import { ORBIT_KM, leaveByType, leaveTrips, type LeaveTrip, type LeaveUse } from '../../utils/dashboardModel';
import { cn } from '../../utils/cn';

/**
 * DashboardNew (UI_UX_DESIGN_REFERENCE.md §5.0, §5.2 rows 2 and 14): the redesigned dashboard at
 * /dashboard-new. Features come from the data layer (useDashboardData: trips, flights, visited places,
 * members and leave types); the layout is new: three tiles, then a Widget Grid the person arranges
 * (lift, drag and resize on desktop; one column on phones) and that is remembered per user.
 */

interface DashboardNewProps {
    onTripClick?: (tripId: string) => void;
    /** Opens a member's page (UserDetail today, MemberNew once it exists). */
    onMemberClick?: (userId: string) => void;
}

const LAYOUT_KEY = 'wandergrid_dashboard_new_layout_v1';
const HIDDEN_KEY = 'wandergrid_dashboard_new_hidden_v1';

/**
 * Default order (also the phone order) and spans. On a wide screen the grid packs gaps with later widgets:
 * Passport fills the space beside Up next, and Where next sits beside By year. Tablets get wider spans.
 */
const DESKTOP_LAYOUT: WidgetLayoutItem[] = [
    { id: 'next', span: 3 },
    { id: 'upcoming', span: 6 },
    { id: 'passport', span: 3 },
    { id: 'map', span: 6 },
    { id: 'metric', span: 4 },
    { id: 'leave', span: 2 },
    { id: 'years', span: 3 },
    { id: 'wherenext', span: 3 },
    { id: 'recent', span: 6 },
];
const TABLET_LAYOUT: WidgetLayoutItem[] = [
    { id: 'next', span: 3 },
    { id: 'upcoming', span: 6 },
    { id: 'passport', span: 3 },
    { id: 'map', span: 6 },
    { id: 'metric', span: 6 },
    { id: 'leave', span: 3 },
    { id: 'years', span: 3 },
    { id: 'wherenext', span: 3 },
    { id: 'recent', span: 3 },
];
const defaultLayout = () => (typeof window !== 'undefined' && window.innerWidth < 1024 ? TABLET_LAYOUT : DESKTOP_LAYOUT);

const sessionUserId = (): string | null => {
    try { return JSON.parse(localStorage.getItem('wandergrid_session_user') || 'null')?.id ?? null; } catch { return null; }
};

const readLayout = (userId: string | null): WidgetLayoutItem[] => {
    try {
        const raw = localStorage.getItem(`${LAYOUT_KEY}:${userId || 'guest'}`);
        const parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed)) {
            const ok = parsed.filter(p => p && typeof p.id === 'string' && Number.isFinite(p.span));
            if (ok.length) return ok;
        }
    } catch { /* unreadable or blocked storage: use the default */ }
    return defaultLayout();
};

const writeLayout = (userId: string | null, layout: WidgetLayoutItem[] | null) => {
    try {
        const key = `${LAYOUT_KEY}:${userId || 'guest'}`;
        if (layout) localStorage.setItem(key, JSON.stringify(layout));
        else localStorage.removeItem(key);
    } catch { /* blocked storage: the layout just won't be remembered */ }
};

const readHidden = (userId: string | null): string[] => {
    try {
        const parsed = JSON.parse(localStorage.getItem(`${HIDDEN_KEY}:${userId || 'guest'}`) || 'null');
        return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch { return []; }
};

const writeHidden = (userId: string | null, hidden: string[]) => {
    try {
        const key = `${HIDDEN_KEY}:${userId || 'guest'}`;
        if (hidden.length) localStorage.setItem(key, JSON.stringify(hidden));
        else localStorage.removeItem(key);
    } catch { /* blocked storage */ }
};

const TILE_TONE = {
    ink: { card: 'bg-rp-ink text-rp-on-ink', muted: 'text-rp-on-ink/70', circle: 'bg-rp-on-ink/15' },
    green: { card: 'bg-rp-green text-rp-paper', muted: 'text-rp-paper/80', circle: 'bg-rp-paper/20' },
    mustard: { card: 'bg-rp-mustard text-rp-on-mustard', muted: 'text-rp-on-mustard/70', circle: 'bg-rp-on-mustard/10' },
} as const;

/** A tile of the totals: a rolling figure with its unit and one line of detail, filled with its accent. */
const Tile: React.FC<{ icon: Icon; tone: keyof typeof TILE_TONE; value: number; unit: string; sub: string }> = ({ icon: IconC, tone, value, unit, sub }) => {
    const t = TILE_TONE[tone];
    return (
        <div className={cn('flex min-w-0 items-center gap-3 rounded-rp-tile p-3 rp-shadow-rest sm:p-4', t.card)}>
            <span className={cn('hidden size-10 shrink-0 items-center justify-center rounded-full sm:flex', t.circle)}><IconC size={18} aria-hidden /></span>
            <span className="min-w-0">
                <span className="flex flex-col sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-1.5">
                    <NumberFlow value={value} format={{ maximumFractionDigits: 0 }} className="rp-tabular text-xl leading-tight font-semibold" />
                    <span className={cn('text-sm', t.muted)}>{unit}</span>
                </span>
                <span className={cn('block text-xs leading-snug sm:truncate', t.muted)}>{sub}</span>
            </span>
        </div>
    );
};

const WidgetIcon: React.FC<{ icon: Icon }> = ({ icon: IconC }) => <IconC size={16} aria-hidden />;

export const DashboardNew: React.FC<DashboardNewProps> = ({ onTripClick, onMemberClick }) => {
    const data = useDashboardData();
    const mobile = useIsMobile();
    const userId = sessionUserId();
    const [layout, setLayout] = useState<WidgetLayoutItem[]>(() => readLayout(userId));
    const [memberId, setMemberId] = useState<string | null>(userId);
    const [hidden, setHidden] = useState<string[]>(() => readHidden(userId));
    const [editing, setEditing] = useState(false);

    // The grid only knows the visible widgets; hidden ones keep their place and size at the end.
    const changeLayout = useCallback((next: WidgetLayoutItem[]) => {
        const kept = layout.filter(l => hidden.includes(l.id) && !next.some(n => n.id === l.id));
        const all = [...next, ...kept];
        setLayout(all);
        writeLayout(userId, all);
    }, [userId, layout, hidden]);
    const resetLayout = useCallback(() => { setLayout(defaultLayout()); writeLayout(userId, null); setHidden([]); writeHidden(userId, []); }, [userId]);
    const hideItem = useCallback((id: string) => { setHidden(h => { const next = [...new Set([...h, id])]; writeHidden(userId, next); return next; }); }, [userId]);
    const showItem = useCallback((id: string) => { setHidden(h => { const next = h.filter(x => x !== id); writeHidden(userId, next); return next; }); }, [userId]);
    // Move a widget one place among the visible ones (the keyboard- and touch-friendly twin of dragging).
    const moveItem = useCallback((id: string, delta: -1 | 1) => {
        const shown = layout.filter(l => !hidden.includes(l.id));
        const at = shown.findIndex(l => l.id === id);
        const other = shown[at + delta];
        if (at < 0 || !other) return;
        const next = layout.slice();
        const i = next.findIndex(l => l.id === id);
        const j = next.findIndex(l => l.id === other.id);
        [next[i], next[j]] = [next[j], next[i]];
        changeLayout(next);
    }, [layout, hidden, changeLayout]);

    const openTrip = useCallback((id: string) => onTripClick?.(id), [onTripClick]);

    // Leave: the chosen member, defaulting to the signed-in one, or the first.
    const member = data.users.find(u => u.id === memberId) ?? data.users.find(u => u.id === userId) ?? data.users[0];
    const year = Number(data.today.slice(0, 4));
    const leave = useMemo(() => {
        if (!member) return { use: [] as LeaveUse[], trips: [] as LeaveTrip[], allowance: 0 };
        let use = leaveByType(data.trips, data.types, member, year);
        // Days logged on the member without a trip behind them still count as taken.
        if (!use.length && (member.takenLeave || 0) > 0) use = [{ entitlementId: 'taken', name: 'Taken', accent: 'rust', days: member.takenLeave }];
        return { use, trips: leaveTrips(data.trips, member, year), allowance: member.leaveBalance || member.allowance || 0 };
    }, [member, data.trips, data.types, year]);

    const nextTrip = data.next?.trip;
    const items = useMemo<WidgetGridItem[]>(() => [
        {
            id: 'next', title: 'Up next', icon: <WidgetIcon icon={Airplane} />, defaultSpan: 3, rows: 2, narrowRows: 2,
            tone: nextTone(data), onOpen: nextTrip ? () => openTrip(nextTrip.id) : undefined, openLabel: nextTrip ? `Open ${nextTrip.name}` : undefined,
            render: size => <NextWidget data={data} size={size} onTripClick={openTrip} />,
        },
        {
            id: 'passport', title: 'Passport', icon: <WidgetIcon icon={IdentificationCard} />, defaultSpan: 3, rows: 2, narrowRows: 3,
            onOpen: () => openPage('/atlas'), openLabel: 'Open Atlas',
            render: size => <PassportWidget data={data} size={size} />,
        },
        {
            id: 'map', title: 'World', icon: <WidgetIcon icon={Globe} />, defaultSpan: 6, rows: span => (span >= 5 ? 4 : 3), narrowRows: 2,
            onOpen: () => openPage(mapLink()), openLabel: 'Open Map',
            render: () => <MapWidget data={data} />,
        },
        {
            id: 'metric', title: 'Travel over time', icon: <WidgetIcon icon={ChartBar} />, defaultSpan: 4, rows: span => (span >= 5 ? 3 : 4), narrowRows: 4, interactive: true,
            render: size => <MetricWidget data={data} size={size} />,
        },
        {
            id: 'leave', title: `Leave ${year}`, icon: <WidgetIcon icon={SunHorizon} />, defaultSpan: 2, rows: 4, narrowRows: 4, interactive: true,
            onOpen: member ? () => (onMemberClick ? onMemberClick(member.id) : openPage('/calendar')) : undefined, openLabel: member ? `Open ${member.name}` : undefined,
            render: () => (
                <LeaveWidget users={data.users} memberId={member?.id ?? ''} onMember={setMemberId} use={leave.use} trips={leave.trips} allowance={leave.allowance} year={year} onTripClick={openTrip} />
            ),
        },
        {
            id: 'upcoming', title: 'Upcoming trips', icon: <WidgetIcon icon={Suitcase} />, defaultSpan: 6, rows: 2, narrowRows: 3, interactive: true, flush: mobile && data.upcoming.length >= 3,
            onOpen: () => openPage('/trips'), openLabel: 'Open Trips',
            render: size => <UpcomingWidget data={data} size={size} onTripClick={openTrip} />,
        },
        {
            id: 'years', title: 'By year', icon: <WidgetIcon icon={ChartBar} />, defaultSpan: 3, rows: 4, narrowRows: 3, interactive: true,
            render: () => <YearsWidget data={data} />,
        },
        {
            id: 'wherenext', title: 'Where next?', icon: <WidgetIcon icon={Compass} />, defaultSpan: 3, rows: 4, narrowRows: 4, interactive: true,
            onOpen: () => openPage('/atlas'), openLabel: 'Open Atlas',
            render: () => <WhereNextWidget data={data} />,
        },
        {
            id: 'recent', title: 'Recent trips', icon: <WidgetIcon icon={ClockCounterClockwise} />, defaultSpan: 6, rows: span => (span >= 5 ? 2 : 4), narrowRows: 3,
            onOpen: () => openPage('/trips'), openLabel: 'Open Trips',
            render: size => <RecentWidget data={data} size={size} onTripClick={openTrip} />,
        },
    ], [data, nextTrip, member, leave, year, openTrip, onMemberClick, mobile]);

    const hiddenWidgets = hidden.flatMap(id => { const item = items.find(i => i.id === id); return item ? [{ id, title: item.title }] : []; });
    // Where focus goes when the tray goes away: the Edit/Done button of the tool bar.
    const editButton = useCallback(() => document.querySelector<HTMLElement>('[aria-label="Dashboard tools"] button[aria-label="Done"], [aria-label="Dashboard tools"] button[aria-label="Edit widgets"]'), []);

    // On phones the tab bar's "+" starts a trip.
    const tools: DockTool[] = [
        { id: 'edit', label: editing ? 'Done' : 'Edit widgets', icon: (editing ? Check : PencilSimple) as any, action: () => setEditing(e => !e) },
        ...(mobile ? [] : [{ id: 'new', label: 'New trip', icon: Plus as any, action: () => openPage('/trips?new=1') }]),
        { id: 'reset', label: 'Reset widgets', icon: ArrowCounterClockwise as any, action: resetLayout },
    ];

    const t = data.totals;
    const orbits = t.km / ORBIT_KM;

    return (
        <div className="custom-scrollbar h-full overflow-y-auto px-3 pt-2 pb-32 sm:px-6 md:pb-16">
            <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6">
                <div className="flex flex-wrap items-center justify-between gap-x-3">
                    <h1 className="text-[2.25rem] font-medium leading-[1.05] tracking-tight text-rp-ink sm:text-[2.5rem]">Dashboard</h1>
                    <RpPageToolbar tools={tools} ariaLabel="Dashboard tools" className="-my-2" />
                </div>

                {data.error ? (
                    <div className="rounded-rp-card bg-rp-surface rp-shadow-rest">
                        <RpEmpty title="Couldn't load your dashboard" action={<button type="button" className="inline-flex min-h-11 items-center rounded-full bg-rp-ink px-4 text-sm font-medium text-rp-on-ink" onClick={() => void data.reload()}>Try again</button>}>
                            {data.error}
                        </RpEmpty>
                    </div>
                ) : null}

                <div className="grid grid-cols-3 gap-3 lg:gap-6">
                    <Tile icon={Path} tone="green" value={t.km} unit="km" sub={`${t.flights} ${t.flights === 1 ? 'flight' : 'flights'}${orbits >= 0.1 ? ` · ${orbits.toFixed(1)}× round the Earth` : ''}`} />
                    <Tile icon={Moon} tone="ink" value={t.nights} unit={t.nights === 1 ? 'night' : 'nights'} sub={`${t.trips} ${t.trips === 1 ? 'trip' : 'trips'}`} />
                    <Tile icon={Globe} tone="mustard" value={data.countries.length} unit={data.countries.length === 1 ? 'country' : 'countries'} sub={`${data.cities.length} ${data.cities.length === 1 ? 'city' : 'cities'} · ${data.worldShare}% of the world`} />
                </div>

                {!data.loading && data.isEmpty ? (
                    <section className="flex flex-col gap-4 rounded-rp-card bg-rp-mustard p-6 text-rp-on-mustard rp-shadow-rest sm:flex-row sm:items-center sm:justify-between sm:p-8" aria-label="Get started">
                        <div className="min-w-0">
                            <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">Start your first trip</h2>
                            <p className="mt-1 text-sm opacity-80">Add a trip, a flight or the places you have been, and this page fills in.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => openPage('/trips?new=1')} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-on-mustard px-5 text-sm font-medium text-rp-mustard outline-none focus-visible:ring-2 focus-visible:ring-rp-on-mustard focus-visible:ring-offset-2 focus-visible:ring-offset-rp-mustard"><Plus size={16} aria-hidden />Plan a trip</button>
                            <button type="button" onClick={() => openPage('/atlas')} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-on-mustard/10 px-5 text-sm font-medium outline-none hover:bg-rp-on-mustard/15 focus-visible:ring-2 focus-visible:ring-rp-on-mustard"><Globe size={16} aria-hidden />Add places</button>
                            <button type="button" onClick={() => openPage('/flights')} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-on-mustard/10 px-5 text-sm font-medium outline-none hover:bg-rp-on-mustard/15 focus-visible:ring-2 focus-visible:ring-rp-on-mustard"><Airplane size={16} aria-hidden />Log a flight</button>
                        </div>
                    </section>
                ) : null}

                {data.loading ? (
                    <div className="grid gap-4 sm:grid-cols-2" aria-busy="true" aria-label="Loading">
                        {[0, 1, 2, 3].map(i => <div key={i} className="h-56 animate-pulse rounded-rp-card bg-rp-surface rp-shadow-rest" />)}
                    </div>
                ) : data.isEmpty ? null : (
                    <div>
                        <HiddenWidgets editing={editing} widgets={hiddenWidgets} onShow={showItem} returnFocusTo={editButton} />
                        <WidgetGrid items={items.filter(i => !hidden.includes(i.id))} layout={layout} onLayoutChange={changeLayout} editing={editing} onMoveItem={moveItem} onHideItem={hideItem} rowHeight={160} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default DashboardNew;
