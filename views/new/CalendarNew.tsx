import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Trip, User } from '../../types';
import { useCalendarData, leaveFieldsOf, NO_LEAVE, type LeaveFields, type NewLeave } from '../../hooks/useCalendarData';
import {
    balancesFor, buildItems, calendarYears, configsFor, daysBetween, holidayDays, isStandaloneLeave, itemsOn, leaveContext, monthOf, MONTH_NAMES,
    nextLeave, summarise, workingDaysOf, type CalendarItem, type LeaveContext, type WeekStart,
} from '../../utils/calendarModel';
import { formatDate } from '../../utils/formatters';
import { errorMessage, toast } from '../../services/toast';
import SwipeTabs from '../../components/kokonutui/swipe-tabs';
import type { DockTool } from '../../components/kokonutui/tool-dock';
import { RpChip, RpEmpty, RpIconButton, useIsMobile } from '../../components/new/ui';
import { RpPageToolbar } from '../../components/new/PageToolbar';
import { useUndoToast } from '../../components/new/UndoToast';
import { Avatar } from '../../components/new/member/Avatar';
import { MonthGrid } from '../../components/new/calendar/MonthGrid';
import { YearGrid } from '../../components/new/calendar/YearGrid';
import { AgendaList } from '../../components/new/calendar/AgendaList';
import { CalendarTile } from '../../components/new/calendar/CalendarTiles';
import { LeaveBalances } from '../../components/new/calendar/LeaveBalances';
import { DayPanel } from '../../components/new/calendar/DayPanel';
import { LeaveSheet, type LeaveTarget } from '../../components/new/calendar/LeaveSheet';
import { HolidaysSheet } from '../../components/new/calendar/HolidaysSheet';
import { OptionsSheet } from '../../components/new/calendar/OptionsSheet';
import { CalendarBlank, CalendarCheck, CaretLeft, CaretRight, Clock, Flag, Gear, List, MagnifyingGlass, Plus, SquaresFour, SunHorizon, Users } from '../../components/ui/hugeicons';
import { cn } from '../../utils/cn';

/**
 * CalendarNew (UI_UX_DESIGN_REFERENCE.md §5.0): the redesigned vacation calendar at /calendar-new. Features
 * come from the data layer (useCalendarData: trips, members, leave types, saved holiday calendars, events);
 * the layout is new: three filled tiles, a month card with Month / Year / Schedule tabs, the Spending Ring
 * for leave by type, and a day sheet (a Smooth Drawer on phones) to read or change a day's leave.
 */

interface CalendarNewProps {
    /** Opens a trip's New page. */
    onTripClick?: (tripId: string) => void;
    /** Opens a member's New page. */
    onMemberClick?: (memberId: string) => void;
}

type Tab = 'month' | 'year' | 'schedule';
const TAB_KEY = 'wandergrid_calendar_new_tab';
const WEEK_KEY = 'wandergrid_calendar_new_week_start';
const TABS: { id: Tab; title: string; icon: typeof CalendarBlank; pill: { bg: string; text: string }; iconClassName: string }[] = [
    { id: 'month', title: 'Month', icon: CalendarBlank, pill: { bg: 'bg-rp-ink', text: 'text-rp-on-ink' }, iconClassName: 'text-rp-ink' },
    { id: 'year', title: 'Year', icon: SquaresFour, pill: { bg: 'bg-rp-green', text: 'text-rp-paper' }, iconClassName: 'text-rp-green' },
    { id: 'schedule', title: 'Schedule', icon: List, pill: { bg: 'bg-rp-mustard', text: 'text-rp-on-mustard' }, iconClassName: 'text-rp-ochre' },
];

const readTab = (): Tab => {
    try {
        const v = localStorage.getItem(TAB_KEY);
        return v === 'year' || v === 'schedule' ? v : 'month';
    } catch { return 'month'; }
};
/** The saved first day of the week, else the locale's, else Monday. */
const readWeekStart = (): WeekStart => {
    try {
        const v = Number(localStorage.getItem(WEEK_KEY));
        if (localStorage.getItem(WEEK_KEY) !== null && (v === 0 || v === 1 || v === 6)) return v;
        const first = (new Intl.Locale(navigator.language) as unknown as { weekInfo?: { firstDay?: number } }).weekInfo?.firstDay;
        if (first === 7) return 0;
        if (first === 6) return 6;
    } catch { /* locale unavailable */ }
    return 1;
};

const PILL = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-surface active:scale-[0.97]';
const card = 'rounded-rp-card bg-rp-surface rp-shadow-rest';

export const CalendarNew: React.FC<CalendarNewProps> = ({ onTripClick, onMemberClick }) => {
    const data = useCalendarData();
    const mobile = useIsMobile();
    const undo = useUndoToast();
    const latest = useRef(data);
    latest.current = data;

    const today = data.today;
    const thisYear = Number(today.slice(0, 4));
    const [tab, setTab] = useState<Tab>(readTab);
    const [cursor, setCursor] = useState(() => monthOf(today));
    const [focusISO, setFocusISO] = useState(today);
    const [weekStart, setWeekStart] = useState<WeekStart>(readWeekStart);
    const [memberIds, setMemberIds] = useState<string[]>([]);
    const [leaveOnly, setLeaveOnly] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [day, setDay] = useState<string | null>(null);
    const [leaveTarget, setLeaveTarget] = useState<LeaveTarget | null>(null);
    const [holidaysOpen, setHolidaysOpen] = useState(false);
    const [optionsOpen, setOptionsOpen] = useState(false);
    const [balanceYear, setBalanceYear] = useState(thisYear);

    // The balances follow the year being looked at.
    useEffect(() => { setBalanceYear(cursor.year); }, [cursor.year]);

    const changeTab = (next: Tab) => {
        setTab(next);
        try { localStorage.setItem(TAB_KEY, next); } catch { /* storage unavailable */ }
    };
    const changeWeekStart = (next: WeekStart) => {
        setWeekStart(next);
        try { localStorage.setItem(WEEK_KEY, String(next)); } catch { /* storage unavailable */ }
    };

    const { users, trips, entitlements, configs, events, settings, me, isAdmin } = data;
    const workingDays = useMemo(() => workingDaysOf(settings), [settings]);

    // Whose balances: the one member in view, else you.
    const subject: User | undefined = useMemo(() => {
        if (memberIds.length === 1) return users.find(u => u.id === memberIds[0]);
        return me ?? users[0];
    }, [memberIds, users, me]);
    const inView = useMemo(() => (memberIds.length > 0 ? users.filter(u => memberIds.includes(u.id)) : users), [memberIds, users]);

    // Counting rules per member: their followed holiday calendars and weekend rule.
    const contexts = useMemo(() => {
        const map = new Map<string, LeaveContext>();
        users.forEach(u => map.set(u.id, leaveContext(workingDays, holidayDays(configsFor(configs, [u]), u.holidayWeekendRule, workingDays))));
        return map;
    }, [users, configs, workingDays]);
    const contextFor = useCallback((id: string) => contexts.get(id) ?? leaveContext(workingDays, []), [contexts, workingDays]);

    const holidays = useMemo(() => holidayDays(configsFor(configs, inView), subject?.holidayWeekendRule, workingDays), [configs, inView, subject, workingDays]);
    const items = useMemo(
        () => buildItems(trips, holidays, events, { memberIds, leaveOnly, query }, today),
        [trips, holidays, events, memberIds, leaveOnly, query, today],
    );

    const balances = useMemo(
        () => (subject ? balancesFor({ user: subject, trips, entitlements, today, ctx: contextFor(subject.id) }, balanceYear) : []),
        [subject, trips, entitlements, today, contextFor, balanceYear],
    );
    const summary = useMemo(() => (subject ? summarise(balances, subject, balanceYear) : null), [balances, subject, balanceYear]);
    const years = useMemo(() => calendarYears(users, trips, thisYear), [users, trips, thisYear]);
    const next = useMemo(() => nextLeave(trips, subject ? [subject.id] : [], today), [trips, subject, today]);

    const upcomingHolidays = useMemo(() => holidays.filter(h => h.counted && h.observed >= today).slice(0, 3), [holidays, today]);
    const myTrips = useMemo(() => items.filter(i => i.kind === 'trip').map(i => i.trip!), [items]);

    const canEdit = useCallback((trip: Trip) => isAdmin || Boolean(me && (trip.participants || []).includes(me.id)), [isAdmin, me]);

    /* ------------------------------ actions ------------------------------ */

    const attempt = async (run: () => Promise<void>, fallback = "That didn't save. Try again.") => {
        try { await run(); } catch (e) { toast.error(errorMessage(e, fallback)); }
    };

    const shiftMonth = useCallback((by: number) => {
        setCursor(c => {
            const d = new Date(Date.UTC(c.year, c.month0 + by, 1));
            return { year: d.getUTCFullYear(), month0: d.getUTCMonth() };
        });
    }, []);
    const goToday = () => { setCursor(monthOf(today)); setFocusISO(today); };
    const step = (by: number) => (tab === 'year' ? setCursor(c => ({ ...c, year: c.year + by })) : shiftMonth(by));

    const openDay = (iso: string) => { setFocusISO(iso); setDay(iso); };
    const startLeave = (iso?: string) => {
        setDay(null);
        setLeaveTarget({ kind: 'new', date: iso, memberId: subject?.id });
    };

    const saveTripLeave = async (trip: Trip, fields: LeaveFields, extra: Partial<Trip>) => {
        const before = latest.current.trips.find(t => t.id === trip.id) ?? trip;
        const beforeExtra: Partial<Trip> = {};
        (Object.keys(extra) as (keyof Trip)[]).forEach(k => { (beforeExtra as Record<string, unknown>)[k] = before[k]; });
        await data.saveLeave(trip, fields, extra);
        undo.show('Leave saved', () => attempt(async () => { await latest.current.saveLeave(before, leaveFieldsOf(before), beforeExtra); }));
    };
    const createLeave = async (input: NewLeave) => {
        const saved = await data.createLeave(input);
        undo.show('Leave added', () => attempt(() => latest.current.deleteLeave(saved)));
    };
    const removeLeave = async (trip: Trip) => {
        await attempt(async () => {
            if (isStandaloneLeave(trip)) await data.deleteLeave(trip);
            else await data.saveLeave(trip, NO_LEAVE);
            toast.success('Leave removed');
        }, "Couldn't remove the leave.");
        setLeaveTarget(null);
    };

    const toggleHolidayDay = (configId: string, holidayId: string, name: string, included: boolean) => {
        const config = latest.current.configs.find(c => c.id === configId);
        if (!config) return;
        void attempt(async () => {
            await data.setHolidayIncluded(config, holidayId, included);
            undo.show(`${name} is ${included ? 'a day off' : 'not a day off'}`, () => attempt(async () => {
                const current = latest.current.configs.find(c => c.id === configId);
                if (current) await latest.current.setHolidayIncluded(current, holidayId, !included);
            }));
        });
    };
    const followCalendar = (member: User, configId: string, name: string, linked: boolean) => {
        void attempt(async () => {
            await data.setMemberCalendar(member, configId, linked);
            undo.show(`${linked ? 'Following' : 'Stopped following'} ${name}`, () => attempt(async () => {
                const current = latest.current.users.find(u => u.id === member.id);
                if (current) await latest.current.setMemberCalendar(current, configId, !linked);
            }));
        });
    };

    const toggleMember = (id: string) => setMemberIds(ids => (ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]));

    const tools: DockTool[] = [
        { id: 'today', label: 'Today', icon: CalendarBlank as any, action: goToday },
        { id: 'search', label: 'Search the calendar', icon: MagnifyingGlass as any, action: () => setSearchOpen(o => !o) },
        { id: 'add', label: 'Add leave', icon: Plus as any, action: () => startLeave() },
        { id: 'holidays', label: 'Holidays', icon: Flag as any, action: () => setHolidaysOpen(true), dividerBefore: true },
        { id: 'options', label: 'Calendar options', icon: Gear as any, action: () => setOptionsOpen(true) },
    ];

    /* ------------------------------ states ------------------------------- */

    if (data.loading) {
        return (
            <div className="px-3 pt-2 sm:px-6" aria-busy="true">
                <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4">
                    <div className="h-12 w-48 animate-pulse rounded-full bg-rp-surface/70" />
                    <div className="h-20 animate-pulse rounded-rp-card bg-rp-surface/70" />
                    <div className="h-[34rem] animate-pulse rounded-rp-card bg-rp-surface/70" />
                </div>
            </div>
        );
    }

    const monthStart = `${cursor.year}-${String(cursor.month0 + 1).padStart(2, '0')}-01`;
    const monthEnd = `${cursor.year}-${String(cursor.month0 + 1).padStart(2, '0')}-${String(new Date(Date.UTC(cursor.year, cursor.month0 + 1, 0)).getUTCDate()).padStart(2, '0')}`;
    const monthItems = items.filter(i => i.end >= monthStart && i.start <= monthEnd);
    const scheduleItems = items.filter(i => i.end >= today);
    const heading = tab === 'year' ? String(cursor.year) : `${MONTH_NAMES[cursor.month0]} ${cursor.year}`;
    const tabItems = TABS.map(t => ({ id: t.id, title: t.title, icon: t.icon, hideTitle: mobile && t.id !== tab, iconClassName: tab === t.id ? undefined : t.iconClassName }));
    const activeTab = TABS.find(t => t.id === tab)!;

    const openItem = (item: CalendarItem, iso: string) => openDay(iso);
    const daysToNext = next ? daysBetween(today, next.startDate) : null;

    return (
        <div className="custom-scrollbar h-full overflow-y-auto px-3 pt-2 pb-32 sm:px-6 md:pb-16">
            <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 lg:gap-6">
                <div className="flex flex-wrap items-center justify-between gap-x-3">
                    <h1 className="text-[2.25rem] font-medium leading-[1.05] tracking-tight text-rp-ink sm:text-[2.5rem]">Calendar</h1>
                    <RpPageToolbar
                        tools={tools}
                        // Every tool is an action: no plate marks one as selected.
                        value="none"
                        ariaLabel="Calendar tools"
                        search={{
                            open: searchOpen || Boolean(query),
                            query,
                            onQueryChange: setQuery,
                            onClose: () => setSearchOpen(false),
                            label: 'Search the calendar',
                            placeholder: 'Search trips and holidays',
                        }}
                        className="-my-2"
                    />
                </div>

                {data.error ? (
                    <div className={card}>
                        <RpEmpty title="Couldn't load the calendar" action={<button type="button" className={cn(PILL, 'bg-rp-ink text-rp-on-ink')} onClick={() => void data.reload()}>Try again</button>}>
                            {data.error}
                        </RpEmpty>
                    </div>
                ) : null}

                {summary ? (
                    <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
                        <CalendarTile tone="ink" icon={CalendarCheck} value={summary.used} unit={summary.used === 1 ? 'day taken' : 'days taken'} sub={`${summary.planned} planned in ${balanceYear}`} />
                        <CalendarTile tone="green" icon={SunHorizon} value={summary.left} unit="days left" sub={summary.total > 0 ? `of ${summary.total} in ${balanceYear}` : `in ${balanceYear}`} />
                        {next && daysToNext !== null ? (
                            daysToNext <= 0
                                ? <CalendarTile tone="mustard" icon={Clock} value="Now" unit="on leave" sub={next.name} />
                                : <CalendarTile tone="mustard" icon={Clock} value={daysToNext} unit={daysToNext === 1 ? 'day to leave' : 'days to leave'} sub={`${next.name} · ${formatDate(next.startDate, 'short')}`} />
                        ) : (
                            <CalendarTile tone="mustard" icon={Clock} value="None" unit="coming" sub="No leave planned" />
                        )}
                    </div>
                ) : null}

                {users.length > 1 ? (
                    <div className="-m-3 flex items-center gap-2 overflow-x-auto p-3 [scrollbar-width:none]" role="group" aria-label="Members">
                        <RpChip selected={memberIds.length === 0} onClick={() => setMemberIds([])}><Users size={16} aria-hidden /> Everyone</RpChip>
                        {users.map(u => (
                            <RpChip key={u.id} selected={memberIds.includes(u.id)} onClick={() => toggleMember(u.id)} className="shrink-0 !pl-2">
                                <Avatar user={u} size={28} className={memberIds.includes(u.id) ? 'bg-rp-on-ink !text-rp-ink' : ''} />
                                {u.name.split(' ')[0]}
                            </RpChip>
                        ))}
                        <span className="mx-1 h-6 w-px shrink-0 bg-rp-line" aria-hidden />
                        <RpChip selected={leaveOnly} onClick={() => setLeaveOnly(v => !v)} className="shrink-0"><SunHorizon size={16} aria-hidden /> Leave only</RpChip>
                    </div>
                ) : (
                    <div className="-m-3 flex gap-2 overflow-x-auto p-3 [scrollbar-width:none]" role="group" aria-label="Filter">
                        <RpChip selected={leaveOnly} onClick={() => setLeaveOnly(v => !v)}><SunHorizon size={16} aria-hidden /> Leave only</RpChip>
                    </div>
                )}

                <div className={cn('grid items-start gap-4 lg:gap-6', tab !== 'year' && 'lg:grid-cols-[minmax(0,1fr)_21rem]')}>
                    <section aria-label="Calendar" className={cn(card, 'min-w-0 p-3 sm:p-5')}>
                        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:flex-col lg:items-stretch xl:flex-row xl:items-center">
                            <div className="-m-3 overflow-x-auto p-3 [scrollbar-width:none] sm:m-0 sm:p-0">
                                <SwipeTabs
                                    items={tabItems}
                                    value={tab}
                                    onChange={id => changeTab(id as Tab)}
                                    panels={false}
                                    label="Calendar view"
                                    className="w-full sm:w-auto"
                                    listClassName="bg-rp-inset"
                                    activeColor={activeTab.pill.bg}
                                    activeTextColor={activeTab.pill.text}
                                />
                            </div>
                            {tab !== 'schedule' ? (
                                <div className="flex items-center justify-between gap-1 sm:justify-end lg:justify-between xl:justify-end">
                                    <RpIconButton label={tab === 'year' ? 'Previous year' : 'Previous month'} tone="ghost" onClick={() => step(-1)}><CaretLeft size={20} /></RpIconButton>
                                    <h2 aria-live="polite" className="rp-tabular min-w-[9.5rem] text-center text-lg font-medium text-rp-ink">{heading}</h2>
                                    <RpIconButton label={tab === 'year' ? 'Next year' : 'Next month'} tone="ghost" onClick={() => step(1)}><CaretRight size={20} /></RpIconButton>
                                    <button type="button" onClick={goToday} className={cn(PILL, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}>Today</button>
                                </div>
                            ) : null}
                        </div>

                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={tab === 'month' ? `m-${cursor.year}-${cursor.month0}` : tab === 'year' ? `y-${cursor.year}` : 's'}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                            >
                                {tab === 'month' ? (
                                    <>
                                        <MonthGrid
                                            year={cursor.year}
                                            month0={cursor.month0}
                                            weekStart={weekStart}
                                            items={items}
                                            workingDays={workingDays}
                                            today={today}
                                            selected={day}
                                            focusISO={focusISO}
                                            compact={mobile}
                                            onFocusISO={setFocusISO}
                                            onOpen={openDay}
                                            onShiftMonth={shiftMonth}
                                        />
                                        <Legend />
                                        {mobile ? (
                                            <div className="mt-4">
                                                <h3 className="px-2 pb-1 text-sm font-medium text-rp-ink">{MONTH_NAMES[cursor.month0]}</h3>
                                                <AgendaList items={monthItems} from={monthStart} empty="Nothing this month" onOpen={openItem} today={today} />
                                            </div>
                                        ) : null}
                                    </>
                                ) : null}
                                {tab === 'year' ? (
                                    <YearGrid
                                        year={cursor.year}
                                        weekStart={weekStart}
                                        items={items}
                                        workingDays={workingDays}
                                        today={today}
                                        onOpenDay={openDay}
                                        onOpenMonth={m => { setCursor({ year: cursor.year, month0: m }); changeTab('month'); }}
                                    />
                                ) : null}
                                {tab === 'schedule' ? (
                                    <AgendaList items={scheduleItems} grouped cap empty="Nothing coming up" onOpen={openItem} today={today} />
                                ) : null}
                            </motion.div>
                        </AnimatePresence>
                    </section>

                    <aside className={cn('flex min-w-0 flex-col gap-4 lg:gap-6', tab === 'year' && 'lg:grid lg:grid-cols-2 lg:items-start')}>
                        <LeaveBalances
                            member={subject}
                            year={balanceYear}
                            years={years}
                            onYear={setBalanceYear}
                            balances={balances}
                            summary={summary ?? { year: balanceYear, used: 0, planned: 0, left: 0, total: 0, fallback: true }}
                            onMember={onMemberClick}
                        />
                        <section aria-label="Public holidays" className={cn(card, 'flex flex-col gap-2 p-4 sm:p-5')}>
                            <div className="flex items-center justify-between gap-2">
                                <h2 className="text-base font-medium text-rp-ink">Public holidays</h2>
                                <button type="button" onClick={() => setHolidaysOpen(true)} className={cn(PILL, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}><Flag size={16} aria-hidden /> Manage</button>
                            </div>
                            {upcomingHolidays.length === 0 ? (
                                <p className="text-sm text-rp-muted">{configs.length === 0 ? 'No holiday calendars yet.' : 'No more holidays this year.'}</p>
                            ) : (
                                <ul className="flex flex-col">
                                    {upcomingHolidays.map(h => (
                                        <li key={`${h.configId}-${h.id}`}>
                                            <button type="button" onClick={() => { setCursor(monthOf(h.observed)); openDay(h.observed); }} className="flex min-h-11 w-full items-center gap-3 rounded-rp-inset px-2 text-left outline-none hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted">
                                                <Flag size={16} className="shrink-0 text-rp-ochre" aria-hidden />
                                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-rp-ink">{h.name}</span>
                                                <span className="rp-tabular shrink-0 text-xs text-rp-muted">{formatDate(h.observed, 'weekday-short')}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </aside>
                </div>
            </div>

            <DayPanel
                iso={day}
                mobile={mobile}
                onClose={() => setDay(null)}
                items={day ? itemsOn(items, day) : []}
                users={users}
                entitlements={entitlements}
                contextFor={contextFor}
                canEdit={canEdit}
                onEditLeave={trip => { setDay(null); setLeaveTarget({ kind: 'edit', trip }); }}
                onOpenTrip={id => { setDay(null); onTripClick?.(id); }}
                onAddLeave={startLeave}
                onManageHolidays={() => { setDay(null); setHolidaysOpen(true); }}
            />
            <LeaveSheet
                target={leaveTarget}
                users={users}
                trips={trips}
                entitlements={entitlements}
                contextFor={contextFor}
                meId={me?.id}
                isAdmin={isAdmin}
                today={today}
                onClose={() => setLeaveTarget(null)}
                onSaveTrip={saveTripLeave}
                onCreate={createLeave}
                onRemove={removeLeave}
                onOpenTrip={id => { setLeaveTarget(null); onTripClick?.(id); }}
            />
            <HolidaysSheet
                open={holidaysOpen}
                onClose={() => setHolidaysOpen(false)}
                configs={configs}
                member={subject}
                canLink={isAdmin || Boolean(subject && me && subject.id === me.id)}
                canEditDays={isAdmin}
                initialYear={cursor.year}
                onLink={(member, config, linked) => followCalendar(member, config.id, config.countryName, linked)}
                onToggleDay={(config, holidayId, included) => toggleHolidayDay(config.id, holidayId, config.holidays.find(h => h.id === holidayId)?.name ?? 'Holiday', included)}
            />
            <OptionsSheet open={optionsOpen} onClose={() => setOptionsOpen(false)} weekStart={weekStart} onWeekStart={changeWeekStart} trips={myTrips} />
            {undo.host}
        </div>
    );
};

/** What the colours mean, each with its icon (colour is never the only signal). */
const Legend: React.FC = () => (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-rp-muted" aria-label="Legend">
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-rp-mustard" aria-hidden /> Planned</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-rp-green" aria-hidden /> Confirmed</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-rp-ink" aria-hidden /> Travelling now</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-rp-line" aria-hidden /> Past</li>
        <li className="flex items-center gap-1.5"><Flag size={12} className="text-rp-ochre" aria-hidden /> Public holiday</li>
        <li className="flex items-center gap-1.5"><SunHorizon size={12} aria-hidden /> Leave</li>
    </ul>
);

export default CalendarNew;
