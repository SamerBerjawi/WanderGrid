import React, { useCallback, useMemo, useState } from 'react';
import NumberFlow from '@number-flow/react';
import { useDashboardData } from '../../hooks/useDashboardData';
import { WidgetGrid, type WidgetGridItem, type WidgetLayoutItem } from '../../components/kokonutui/bento-grid';
import type { DockTool } from '../../components/kokonutui/tool-dock';
import { RpPageToolbar } from '../../components/new/PageToolbar';
import { RpEmpty } from '../../components/new/ui';
import { openNewPage } from '../../components/new/devLinks';
import {
    LeaveWidget, MetricWidget, NextWidget, PassportWidget, RecentWidget, UpcomingWidget, WhereNextWidget, YearsWidget, nextTone,
} from '../../components/new/dashboard/DashboardWidgets';
import {
    Airplane, ArrowCounterClockwise, ChartBar, ClockCounterClockwise, Compass, Globe, IdentificationCard, Moon, Path, Plus, SunHorizon, Suitcase, type Icon,
} from '../../components/ui/hugeicons';
import { ORBIT_KM, leaveByType, type LeaveUse } from '../../utils/dashboardModel';
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

/** Default order (also the phone order) and spans. Heights are in grid rows. */
const DEFAULT_LAYOUT: WidgetLayoutItem[] = [
    { id: 'next', span: 3 },
    { id: 'passport', span: 3 },
    { id: 'metric', span: 4 },
    { id: 'leave', span: 2 },
    { id: 'upcoming', span: 6 },
    { id: 'years', span: 3 },
    { id: 'wherenext', span: 3 },
    { id: 'recent', span: 6 },
];

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
    return DEFAULT_LAYOUT;
};

const writeLayout = (userId: string | null, layout: WidgetLayoutItem[] | null) => {
    try {
        const key = `${LAYOUT_KEY}:${userId || 'guest'}`;
        if (layout) localStorage.setItem(key, JSON.stringify(layout));
        else localStorage.removeItem(key);
    } catch { /* blocked storage: the layout just won't be remembered */ }
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
                <span className="flex flex-wrap items-baseline gap-x-1.5">
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
    const userId = sessionUserId();
    const [layout, setLayout] = useState<WidgetLayoutItem[]>(() => readLayout(userId));
    const [memberId, setMemberId] = useState<string | null>(userId);

    const changeLayout = useCallback((next: WidgetLayoutItem[]) => { setLayout(next); writeLayout(userId, next); }, [userId]);
    const resetLayout = useCallback(() => { setLayout(DEFAULT_LAYOUT); writeLayout(userId, null); }, [userId]);

    const openTrip = useCallback((id: string) => onTripClick?.(id), [onTripClick]);

    // Leave: the chosen member, defaulting to the signed-in one, or the first.
    const member = data.users.find(u => u.id === memberId) ?? data.users.find(u => u.id === userId) ?? data.users[0];
    const year = Number(data.today.slice(0, 4));
    const leave = useMemo(() => {
        if (!member) return { use: [] as LeaveUse[], allowance: 0 };
        let use = leaveByType(data.trips, data.types, member, year);
        // Days logged on the member without a trip behind them still count as taken.
        if (!use.length && (member.takenLeave || 0) > 0) use = [{ entitlementId: 'taken', name: 'Taken', accent: 'rust', days: member.takenLeave }];
        return { use, allowance: member.leaveBalance || member.allowance || 0 };
    }, [member, data.trips, data.types, year]);

    const nextTrip = data.next?.trip;
    const items = useMemo<WidgetGridItem[]>(() => [
        {
            id: 'next', title: 'Up next', icon: <WidgetIcon icon={Airplane} />, defaultSpan: 3, rows: 2, narrowRows: 3,
            tone: nextTone(data), onOpen: nextTrip ? () => openTrip(nextTrip.id) : undefined, openLabel: nextTrip ? `Open ${nextTrip.name}` : undefined,
            render: size => <NextWidget data={data} size={size} onTripClick={openTrip} />,
        },
        {
            id: 'passport', title: 'Passport', icon: <WidgetIcon icon={IdentificationCard} />, defaultSpan: 3, rows: 2, narrowRows: 3,
            onOpen: () => openNewPage('/atlas-new'), openLabel: 'Open Atlas',
            render: size => <PassportWidget data={data} size={size} />,
        },
        {
            id: 'metric', title: 'Travel over time', icon: <WidgetIcon icon={ChartBar} />, defaultSpan: 4, rows: 3, narrowRows: 4, interactive: true,
            render: size => <MetricWidget data={data} size={size} />,
        },
        {
            id: 'leave', title: `Leave ${year}`, icon: <WidgetIcon icon={SunHorizon} />, defaultSpan: 2, rows: 3, narrowRows: 4, interactive: true,
            onOpen: member ? () => (onMemberClick ? onMemberClick(member.id) : openNewPage('/calendar')) : undefined, openLabel: member ? `Open ${member.name}` : undefined,
            render: () => (
                <LeaveWidget users={data.users} memberId={member?.id ?? ''} onMember={setMemberId} use={leave.use} allowance={leave.allowance} year={year} />
            ),
        },
        {
            id: 'upcoming', title: 'Upcoming trips', icon: <WidgetIcon icon={Suitcase} />, defaultSpan: 6, rows: 2, narrowRows: 3, interactive: true,
            onOpen: () => openNewPage('/trips-new'), openLabel: 'Open Trips',
            render: size => <UpcomingWidget data={data} size={size} onTripClick={openTrip} />,
        },
        {
            id: 'years', title: 'By year', icon: <WidgetIcon icon={ChartBar} />, defaultSpan: 3, rows: 4, narrowRows: 3, interactive: true,
            render: () => <YearsWidget data={data} />,
        },
        {
            id: 'wherenext', title: 'Where next?', icon: <WidgetIcon icon={Compass} />, defaultSpan: 3, rows: 4, narrowRows: 4, interactive: true,
            onOpen: () => openNewPage('/atlas-new'), openLabel: 'Open Atlas',
            render: () => <WhereNextWidget data={data} />,
        },
        {
            id: 'recent', title: 'Recent trips', icon: <WidgetIcon icon={ClockCounterClockwise} />, defaultSpan: 6, rows: 2, narrowRows: 3,
            onOpen: () => openNewPage('/trips-new'), openLabel: 'Open Trips',
            render: size => <RecentWidget data={data} size={size} onTripClick={openTrip} />,
        },
    ], [data, nextTrip, member, leave, year, openTrip, onMemberClick]);

    const tools: DockTool[] = [
        { id: 'new', label: 'New trip', icon: Plus as any, action: () => openNewPage('/trips-new?new=1') },
        { id: 'reset', label: 'Reset layout', icon: ArrowCounterClockwise as any, action: resetLayout },
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

                {data.loading ? (
                    <div className="grid gap-4 sm:grid-cols-2" aria-busy="true" aria-label="Loading">
                        {[0, 1, 2, 3].map(i => <div key={i} className="h-56 animate-pulse rounded-rp-card bg-rp-surface rp-shadow-rest" />)}
                    </div>
                ) : (
                    <WidgetGrid items={items} layout={layout} onLayoutChange={changeLayout} rowHeight={160} />
                )}
            </div>
        </div>
    );
};

export default DashboardNew;
