import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { CustomEvent, LeaveEntry, SavedConfig, User } from '../../types';
import { useCalendarData } from '../../hooks/useCalendarData';
import { buildConfig, calendarKey, followedKeys, missingYears, withCustomHoliday, withoutHoliday } from '../../utils/holidayCalendar';
import { fetchHolidays } from '../../services/holidayCalendars';
import {
    ALL_LAYERS, balancesFor, addDaysISO, weekOf, buildItems, calendarYears, gridItems, configsFor, daysBetween, holidayDays, itemsOn, leaveTitle, memberWorkingDays, tripDates, leaveContext, monthOf, MONTH_NAMES,
    nextLeave, summarise, workingDaysOf, type CalendarItem, type CalendarLayer, type LeaveColor, type LeaveContext, type WeekStart,
} from '../../utils/calendarModel';
import { formatDate, formatDateRange } from '../../utils/formatters';
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
import { OptionsSheet, type ColourBy } from '../../components/new/calendar/OptionsSheet';
import { EventSheet } from '../../components/new/calendar/EventSheet';
import { BREAK_LENGTHS, OptimizerSheet, type PlanPrefs } from '../../components/new/calendar/OptimizerSheet';
import { TINT } from '../../components/new/calendar/calendarStyles';
import { breakSentence, planYear, suggestBreaks, type PlannedBreak } from '../../utils/leaveOptimizer';
import { newLeaveId } from '../../utils/leaveEntry';
import { dataService } from '../../services/mockDb';
import { tripsNeedingAttention } from '../../utils/tripLeave';
import { LeaveAttention } from '../../components/new/calendar/LeaveAttention';
import { LeaveReminders } from '../../components/new/calendar/LeaveReminders';
import { WeekGrid } from '../../components/new/calendar/WeekGrid';
import { moveLeave } from '../../utils/leaveEntry';
import { leaveReminders } from '../../utils/leaveInsights';
import { CalendarBlank, CalendarCheck, CaretLeft, CaretRight, Clock, Columns, Flag, Gear, List, MagnifyingGlass, Plus, Sparkle, SquaresFour, Star, SunHorizon, Suitcase, Users } from '../../components/ui/hugeicons';
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
    /** Opens another page (a new trip for leave that has none). */
    onNavigate?: (path: string) => void;
}

type Tab = 'week' | 'month' | 'year' | 'schedule';
const TAB_KEY = 'wandergrid_calendar_new_tab';
const WEEK_KEY = 'wandergrid_calendar_new_week_start';
const COLOUR_KEY = 'wandergrid_calendar_new_colour_by';
const LAYERS_KEY = 'wandergrid_calendar_new_layers';
const TABS: { id: Tab; title: string; icon: typeof CalendarBlank; pill: { bg: string; text: string }; iconClassName: string }[] = [
    { id: 'week', title: 'Week', icon: Columns, pill: { bg: 'bg-rp-navy', text: 'text-rp-paper' }, iconClassName: 'text-rp-navy' },
    { id: 'month', title: 'Month', icon: CalendarBlank, pill: { bg: 'bg-rp-ink', text: 'text-rp-on-ink' }, iconClassName: 'text-rp-ink' },
    { id: 'year', title: 'Year', icon: SquaresFour, pill: { bg: 'bg-rp-green', text: 'text-rp-paper' }, iconClassName: 'text-rp-green' },
    { id: 'schedule', title: 'Schedule', icon: List, pill: { bg: 'bg-rp-mustard', text: 'text-rp-on-mustard' }, iconClassName: 'text-rp-ochre' },
];

const readTab = (): Tab => {
    try {
        const v = localStorage.getItem(TAB_KEY);
        return v === 'week' || v === 'year' || v === 'schedule' ? v : 'month';
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

const readColourBy = (): ColourBy => {
    try { return localStorage.getItem(COLOUR_KEY) === 'type' ? 'type' : 'status'; } catch { return 'status'; }
};
const readLayers = (): Record<CalendarLayer, boolean> => {
    try {
        const v = JSON.parse(localStorage.getItem(LAYERS_KEY) || 'null');
        if (v && typeof v === 'object') return { trip: v.trip !== false, leave: v.leave !== false, holiday: v.holiday !== false, event: v.event !== false };
    } catch { /* storage unavailable or not JSON */ }
    return { ...ALL_LAYERS };
};

const PILL = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-surface active:scale-[0.97]';
const card = 'rounded-rp-card bg-rp-surface rp-shadow-rest';

export const CalendarNew: React.FC<CalendarNewProps> = ({ onTripClick, onMemberClick, onNavigate }) => {
    const data = useCalendarData();
    const mobile = useIsMobile();
    const undo = useUndoToast();
    const wantFocus = useRef(false);
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
    const [colourBy, setColourBy] = useState<ColourBy>(readColourBy);
    const [layers, setLayers] = useState<Record<CalendarLayer, boolean>>(readLayers);
    const [eventOpen, setEventOpen] = useState<{ date?: string } | null>(null);
    const [optimizerOpen, setOptimizerOpen] = useState(false);
    const [optimizerMonths, setOptimizerMonths] = useState<3 | 6 | 12>(12);
    const [planPrefs, setPlanPrefs] = useState<PlanPrefs>({ budget: 10, months: [], length: 'any' });

    // The balances follow the year being looked at.
    useEffect(() => { setBalanceYear(cursor.year); }, [cursor.year]);

    const changeTab = (next: Tab) => {
        // The week view opens on the month being looked at: today when it is in it, else its first day.
        if (next === 'week') {
            const m = monthOf(focusISO);
            if (m.year !== cursor.year || m.month0 !== cursor.month0) {
                const first = `${cursor.year}-${String(cursor.month0 + 1).padStart(2, '0')}-01`;
                setFocusISO(monthOf(today).year === cursor.year && monthOf(today).month0 === cursor.month0 ? today : first);
            }
        }
        setTab(next);
        try { localStorage.setItem(TAB_KEY, next); } catch { /* storage unavailable */ }
    };
    const changeColourBy = (next: ColourBy) => {
        setColourBy(next);
        try { localStorage.setItem(COLOUR_KEY, next); } catch { /* storage unavailable */ }
    };
    const toggleLayer = (layer: CalendarLayer) => setLayers(prev => {
        const next = { ...prev, [layer]: !prev[layer] };
        try { localStorage.setItem(LAYERS_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
        return next;
    });
    const changeWeekStart = (next: WeekStart) => {
        setWeekStart(next);
        try { localStorage.setItem(WEEK_KEY, String(next)); } catch { /* storage unavailable */ }
    };

    const { users, trips, leave, entitlements, configs: savedConfigs, events, settings, me, isAdmin } = data;

    // Followed calendars cover every year: a year the workspace has no saved calendar for yet (this year, next year, the
    // year in view) is fetched once. An admin saves it for everyone; for anyone else it is used for this visit only.
    const [fetched, setFetched] = useState<SavedConfig[]>([]);
    const tried = useRef(new Set<string>());
    const configs = useMemo(() => [...savedConfigs, ...fetched.filter(f => !savedConfigs.some(c => c.id === f.id))], [savedConfigs, fetched]);
    useEffect(() => {
        if (data.loading) return;
        const keys = [...new Set(savedConfigs.map(calendarKey))];
        const wanted = [...new Set([thisYear, thisYear + 1, cursor.year])];
        missingYears(keys, configs, wanted).forEach(m => {
            const id = `${m.key}-${m.year}`;
            if (tried.current.has(id)) return;
            tried.current.add(id);
            fetchHolidays(m.countryCode, m.year, m.region)
                .then(async answer => {
                    const config = buildConfig(answer, m.countryName, new Date(), m.regionName);
                    if (isAdmin) await latest.current.addCalendar(config);
                    else setFetched(prev => [...prev.filter(c => c.id !== config.id), config]);
                })
                .catch(() => { /* the service is down or has nothing for that year: the calendar simply has no holidays */ });
        });
        // configs is derived from savedConfigs and fetched, both listed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.loading, savedConfigs, fetched, thisYear, cursor.year, isAdmin]);
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
        users.forEach(u => {
            const week = memberWorkingDays(u, workingDays);
            map.set(u.id, leaveContext(week, holidayDays(configsFor(configs, [u]), u.holidayWeekendRule, week), events));
        });
        return map;
    }, [users, configs, workingDays, events]);
    const contextFor = useCallback((id: string) => contexts.get(id) ?? leaveContext(workingDays, []), [contexts, workingDays]);

    // With one member in view the grid shows their own working week; otherwise the workspace's.
    const viewWeek = useMemo(() => (memberIds.length === 1 ? memberWorkingDays(subject, workingDays) : workingDays), [memberIds, subject, workingDays]);
    const holidays = useMemo(() => holidayDays(configsFor(configs, inView), subject?.holidayWeekendRule, viewWeek), [configs, inView, subject, viewWeek]);
    const leaveColors = useMemo(
        () => (colourBy === 'type' ? Object.fromEntries(entitlements.map(e => [e.id, e.color])) as Record<string, LeaveColor> : undefined),
        [colourBy, entitlements],
    );
    const typeName = useCallback((id: string) => entitlements.find(e => e.id === id)?.name, [entitlements]);
    const items = useMemo(
        () => buildItems({ trips, leave, holidays, events, typeName }, { memberIds, leaveOnly, query, layers }, today, leaveColors),
        [trips, leave, holidays, events, typeName, memberIds, leaveOnly, query, layers, today, leaveColors],
    );
    // The grids and lists draw leave taken for a trip as the trip's bar; the day's detail lists both.
    const drawn = useMemo(() => gridItems(items), [items]);

    const balances = useMemo(
        () => (subject ? balancesFor({ user: subject, leave, entitlements, today, ctx: contextFor(subject.id) }, balanceYear) : []),
        [subject, leave, entitlements, today, contextFor, balanceYear],
    );
    const summary = useMemo(() => (subject ? summarise(balances, subject, balanceYear) : null), [balances, subject, balanceYear]);
    const years = useMemo(() => calendarYears(users, leave, thisYear), [users, leave, thisYear]);
    const next = useMemo(() => nextLeave(leave, subject ? [subject.id] : [], today), [leave, subject, today]);
    const nextName = next ? leaveTitle(next, typeName) : '';

    // The subject's trips whose leave needs a look (working days without leave, refused leave, ...).
    const attention = useMemo(
        () => (subject && entitlements.length > 0 ? tripsNeedingAttention(trips, subject, leave, contextFor(subject.id), today) : []),
        [subject, entitlements.length, trips, leave, contextFor, today],
    );
    // The signed-in member's own reminders, when the calendar shows them (the trips card above covers trip issues).
    const reminders = useMemo(
        () => (subject && me && subject.id === me.id && entitlements.length > 0
            ? leaveReminders(subject, leave, entitlements, contextFor(subject.id), today, { name: e => leaveTitle(e, typeName) })
            : []),
        [subject, me, leave, entitlements, contextFor, today, typeName],
    );
    const upcomingHolidays = useMemo(() => holidays.filter(h => h.counted && h.observed >= today).slice(0, 3), [holidays, today]);
    // The optimizer works from the subject's own days off: their followed calendars, their working week, their booked leave.
    const optimizer = useMemo(() => {
        if (!optimizerOpen || !subject) return [];
        const week = memberWorkingDays(subject, workingDays);
        const mine = holidayDays(configsFor(configs, [subject]), subject.holidayWeekendRule, week);
        const booked = new Set<string>();
        leave.filter(e => e.memberId === subject.id && ['planned', 'requested', 'approved'].includes(e.state)).forEach(e => {
            for (let d = e.startDate; d && d <= (e.endDate || e.startDate); d = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + 1)).toISOString().slice(0, 10)) booked.add(d);
        });
        const to = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1 + optimizerMonths, +today.slice(8, 10))).toISOString().slice(0, 10);
        return suggestBreaks({ from: today, to, workingDays: week, holidays: mine, booked });
    }, [optimizerOpen, subject, configs, workingDays, leave, today, optimizerMonths]);
    const myTrips = useMemo(() => items.filter(i => i.kind === 'trip').map(i => i.trip!), [items]);

    // The year plan: the best breaks for the leave days chosen, over the look-ahead, with the subject's own rules.
    const yearPlan = useMemo(() => {
        if (!optimizerOpen || !subject) return null;
        const ctx = contextFor(subject.id);
        const booked = new Set<string>();
        leave.filter(e => e.memberId === subject.id && ['planned', 'requested', 'approved'].includes(e.state)).forEach(e => tripDates(e).forEach(d => booked.add(d)));
        const to = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1 + optimizerMonths, +today.slice(8, 10))).toISOString().slice(0, 10);
        const len = BREAK_LENGTHS[planPrefs.length];
        const mine = holidayDays(configsFor(configs, [subject]), subject.holidayWeekendRule, ctx.workingDays);
        const companyDays = new Set([...ctx.offDays].filter(d => !mine.some(h => h.counted && h.observed === d)));
        return planYear({
            from: addDaysISO(today, 1), to, workingDays: ctx.workingDays, holidays: mine, offDays: companyDays, workDays: ctx.workDays, booked,
            budget: planPrefs.budget, months: planPrefs.months, minDays: len.min, maxDays: len.max,
        });
    }, [optimizerOpen, subject, contextFor, leave, today, optimizerMonths, planPrefs, configs]);
    // Opening the optimizer starts from what is left this year.
    const openedFor = useRef<string | null>(null);
    useEffect(() => {
        if (!optimizerOpen) { openedFor.current = null; return; }
        if (!subject || openedFor.current === subject.id) return;
        openedFor.current = subject.id;
        const left = summarise(balancesFor({ user: subject, leave, entitlements, today, ctx: contextFor(subject.id) }, thisYear), subject, thisYear).left;
        setPlanPrefs(p => ({ ...p, budget: Math.max(0, Math.floor(left)) || p.budget }));
        // Only when the sheet opens (or the member changes): later edits to leave must not reset the budget being set.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [optimizerOpen, subject?.id]);

    const canEditLeave = useCallback((memberId: string) => isAdmin || Boolean(me && memberId === me.id), [isAdmin, me]);

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
    const step = (by: number) => {
        if (tab === 'year') setCursor(c => ({ ...c, year: c.year + by }));
        else if (tab === 'week') setFocusISO(f => addDaysISO(f, 7 * by));
        else shiftMonth(by);
    };
    // The week view follows the focused day; the month (and the balances' year) follow it there.
    useEffect(() => {
        if (tab !== 'week') return;
        const m = monthOf(focusISO);
        setCursor(c => (c.year === m.year && c.month0 === m.month0 ? c : m));
    }, [tab, focusISO]);

    const openDay = (iso: string) => { setFocusISO(iso); setDay(iso); };
    const startLeave = (iso?: string) => {
        setDay(null);
        setLeaveTarget({ kind: 'new', date: iso, memberId: subject?.id });
    };

    const saveEntry = async (entry: LeaveEntry, before?: LeaveEntry) => {
        await data.saveLeave(entry);
        undo.show(before ? 'Leave saved' : 'Leave added', () => attempt(async () => {
            if (before) await latest.current.saveLeave({ ...before, version: undefined });
            else {
                const current = latest.current.leave.find(e => e.id === entry.id);
                if (current) await latest.current.deleteLeave(current);
            }
        }));
    };
    // Dragging on the grid (leave Phase 2c): days picked open new leave for them; a leave bar dragged moves the leave.
    const pickDays = useCallback((start: string, end: string) => {
        setDay(null);
        setLeaveTarget({ kind: 'new', date: start, endDate: end, memberId: subject?.id });
    }, [subject]);
    const movable = useCallback((key: string) => {
        const entry = items.find(i => i.key === key)?.entry;
        return entry && (isAdmin || entry.memberId === me?.id) ? entry : undefined;
    }, [items, isAdmin, me]);
    const dragLeave = useCallback((entry: LeaveEntry, by: number) => {
        const moved = moveLeave(entry, by, users.find(u => u.id === entry.memberId));
        void attempt(async () => {
            await latest.current.saveLeave(moved);
            undo.show(`Moved to ${formatDateRange(moved.startDate, moved.endDate)}${moved.state !== entry.state ? ', to be asked again' : ''}`, () => attempt(async () => {
                await latest.current.saveLeave({ ...entry, version: undefined });
            }));
        }, "Couldn't move the leave.");
    }, [users, undo]);
    const removeLeave = async (entry: LeaveEntry) => {
        await attempt(async () => {
            await data.deleteLeave(entry);
            undo.show('Leave removed', () => attempt(async () => { await latest.current.saveLeave({ ...entry, version: undefined }); }));
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
    const followCalendar = (member: User, key: string, name: string, linked: boolean) => {
        void attempt(async () => {
            await data.setMemberCalendar(member, key, linked);
            undo.show(`${linked ? 'Following' : 'Stopped following'} ${name}`, () => attempt(async () => {
                const current = latest.current.users.find(u => u.id === member.id);
                if (current) await latest.current.setMemberCalendar(current, key, !linked);
            }));
        });
    };
    const addHolidayDay = (config: SavedConfig, date: string, name: string) => {
        void attempt(async () => {
            const next = withCustomHoliday(config, date, name);
            await data.saveCalendar(next);
            undo.show(`Added ${name || 'a holiday'}`, () => attempt(() => latest.current.saveCalendar(config)));
        });
    };
    const removeHolidayDay = (config: SavedConfig, holidayId: string) => {
        void attempt(async () => {
            const name = config.holidays.find(h => h.id === holidayId)?.name ?? 'Holiday';
            await data.saveCalendar(withoutHoliday(config, holidayId));
            undo.show(`Removed ${name}`, () => attempt(() => latest.current.saveCalendar(config)));
        });
    };

    const saveEvent = async (event: CustomEvent) => {
        await data.addEvent(event);
        undo.show(`Added ${event.name}`, () => attempt(() => latest.current.deleteEvent(event.id)));
    };
    const removeEvent = (event: CustomEvent) => {
        void attempt(async () => {
            await data.deleteEvent(event.id);
            undo.show(`Removed ${event.name}`, () => attempt(async () => { await latest.current.addEvent(event); }));
        }, "Couldn't remove the event.");
    };
    const addCalendar = async (config: SavedConfig, regionalSkipped: number) => {
        const existed = latest.current.configs.some(c => c.id === config.id);
        await data.addCalendar(config);
        // A member who already follows calendars follows the new one too; with none followed every calendar shows anyway.
        const who = subject;
        if (!existed && who && followedKeys(who).length > 0 && !followedKeys(who).includes(calendarKey(config)) && (isAdmin || who.id === me?.id)) await data.setMemberCalendar(who, calendarKey(config), true);
        toast.success(`${config.regionName ? `${config.countryName}, ${config.regionName}` : config.countryName} ${config.year}: ${config.holidays.length} ${config.holidays.length === 1 ? 'holiday' : 'holidays'} ${existed ? 'refreshed' : 'added'}${regionalSkipped > 0 ? ` (${regionalSkipped} regional left out)` : ''}`);
        setCursor(c => (c.year === config.year ? c : { ...c, year: config.year }));
    };
    const removeCalendar = async (config: SavedConfig) => {
        await attempt(async () => { await data.removeCalendar(config); toast.success(`${config.countryName} ${config.year} removed`); }, "Couldn't remove the calendar.");
    };
    /** Adds every planned break as an idea (a draft: on the calendar, counting nothing until planned or confirmed). */
    const planAll = async (breaks: PlannedBreak[]) => {
        if (!subject || breaks.length === 0) return;
        const type = entitlements.find(e => e.category === 'Annual') ?? entitlements.find(e => e.category !== 'Sick' && e.category !== 'Unpaid');
        const ideas: LeaveEntry[] = breaks.map(b => ({
            id: newLeaveId(), memberId: subject.id, name: `Break: ${breakSentence(b).toLowerCase()}`, startDate: b.leaveDates[0], endDate: b.leaveDates[b.leaveDates.length - 1],
            state: 'draft', ...(type ? { entitlementId: type.id } : {}), note: `Suggested by the optimizer: ${formatDateRange(b.start, b.end)} off${b.holidays.length ? ` around ${b.holidays.join(', ')}` : ''}.`,
        }));
        await dataService.applyBatch({ upsertLeave: ideas });
        await data.reload();
        setOptimizerOpen(false);
        undo.show(`${ideas.length} ${ideas.length === 1 ? 'idea' : 'ideas'} added`, () => attempt(async () => {
            await dataService.applyBatch({ deleteLeave: ideas.map(i => i.id) });
            await latest.current.reload();
        }));
    };
    const planBreak = (s: { leaveDates: string[] }) => {
        if (s.leaveDates.length === 0) return;
        setOptimizerOpen(false);
        setLeaveTarget({ kind: 'new', date: s.leaveDates[0], endDate: s.leaveDates[s.leaveDates.length - 1], memberId: subject?.id });
    };

    const toggleMember = (id: string) => setMemberIds(ids => (ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]));

    const tools: DockTool[] = [
        { id: 'today', label: 'Today', icon: CalendarBlank as any, action: goToday },
        { id: 'search', label: 'Search the calendar', icon: MagnifyingGlass as any, action: () => setSearchOpen(o => !o) },
        { id: 'add', label: 'Add leave', icon: Plus as any, action: () => startLeave() },
        ...(isAdmin ? [{ id: 'event', label: 'Add an event', icon: Star as any, action: () => setEventOpen({}) }] : []),
        { id: 'holidays', label: 'Holidays', icon: Flag as any, action: () => setHolidaysOpen(true), dividerBefore: true },
        { id: 'optimizer', label: 'Leave optimizer', icon: Sparkle as any, action: () => setOptimizerOpen(true) },
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
    const monthItems = drawn.filter(i => i.end >= monthStart && i.start <= monthEnd);
    const scheduleItems = drawn.filter(i => i.end >= today);
    const shownWeek = weekOf(focusISO, weekStart);
    const heading = tab === 'year' ? String(cursor.year) : tab === 'week' ? formatDateRange(shownWeek[0], shownWeek[6]) : `${MONTH_NAMES[cursor.month0]} ${cursor.year}`;
    const tabItems = TABS.map(t => ({ id: t.id, title: t.title, icon: t.icon, hideTitle: mobile && t.id !== tab, iconClassName: tab === t.id ? undefined : t.iconClassName }));
    const activeTab = TABS.find(t => t.id === tab)!;

    const openItem = (item: CalendarItem, iso: string) => openDay(iso);
    const daysToNext = next ? daysBetween(today, next.startDate) : null;

    return (
        <div className="custom-scrollbar h-full overflow-y-auto px-3 pt-2 pb-32 sm:px-6 md:pb-16">
            <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 lg:gap-6">
                <div className="flex flex-wrap items-center justify-between gap-x-3">
                    <h1 className="text-[2rem] font-semibold leading-[1.04] tracking-[-0.025em] text-rp-ink sm:text-[2.34rem]">Calendar</h1>
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
                    <div className="grid grid-cols-3 items-start gap-2 sm:gap-3 lg:gap-4">
                        <CalendarTile tone="ink" icon={CalendarCheck} value={summary.used} unit={summary.used === 1 ? 'day taken' : 'days taken'} sub={`${summary.planned} planned in ${balanceYear}`} />
                        <CalendarTile tone="green" icon={SunHorizon} value={summary.left} unit="days left" sub={summary.total > 0 ? `of ${summary.total} in ${balanceYear}` : `in ${balanceYear}`} />
                        {next && daysToNext !== null ? (
                            daysToNext <= 0
                                ? <CalendarTile tone="mustard" icon={Clock} value="Now" unit="on leave" sub={nextName} />
                                : <CalendarTile tone="mustard" icon={Clock} value={daysToNext} unit={daysToNext === 1 ? 'day to leave' : 'days to leave'} sub={`${nextName} · ${formatDate(next.startDate, 'short')}`} />
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
                        <LayerChips layers={layers} onToggle={toggleLayer} />
                    </div>
                ) : (
                    <div className="-m-3 flex gap-2 overflow-x-auto p-3 [scrollbar-width:none]" role="group" aria-label="Filter">
                        <RpChip selected={leaveOnly} onClick={() => setLeaveOnly(v => !v)}><SunHorizon size={16} aria-hidden /> Leave only</RpChip>
                        <LayerChips layers={layers} onToggle={toggleLayer} />
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
                                    <RpIconButton label={tab === 'year' ? 'Previous year' : tab === 'week' ? 'Previous week' : 'Previous month'} tone="ghost" onClick={() => step(-1)}><CaretLeft size={20} /></RpIconButton>
                                    <h2 aria-live="polite" className="rp-tabular min-w-[9.5rem] text-center text-lg font-medium text-rp-ink">{heading}</h2>
                                    <RpIconButton label={tab === 'year' ? 'Next year' : tab === 'week' ? 'Next week' : 'Next month'} tone="ghost" onClick={() => step(1)}><CaretRight size={20} /></RpIconButton>
                                    <button type="button" onClick={goToday} className={cn(PILL, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}>Today</button>
                                </div>
                            ) : null}
                        </div>

                        {/* A short fade in when the view or month changes; no exit, so a key press lands on the new month at once. */}
                        <motion.div
                            key={tab === 'month' ? `m-${cursor.year}-${cursor.month0}` : tab === 'year' ? `y-${cursor.year}` : tab === 'week' ? `w-${shownWeek[0]}` : 's'}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.15 }}
                        >
                                {tab === 'month' ? (
                                    <>
                                        <MonthGrid
                                            year={cursor.year}
                                            month0={cursor.month0}
                                            weekStart={weekStart}
                                            items={drawn}
                                            workingDays={viewWeek}
                                            today={today}
                                            selected={day}
                                            focusISO={focusISO}
                                            compact={mobile}
                                            onFocusISO={setFocusISO}
                                            onOpen={openDay}
                                            onShiftMonth={shiftMonth}
                                            wantFocus={wantFocus}
                                            onSelectRange={pickDays}
                                            onMoveLeave={dragLeave}
                                            movable={movable}
                                        />
                                        <Legend colourBy={colourBy} types={entitlements} />
                                        {mobile ? (
                                            <div className="mt-4">
                                                <h3 className="px-2 pb-1 text-sm font-medium text-rp-ink">{MONTH_NAMES[cursor.month0]}</h3>
                                                <AgendaList items={monthItems} from={monthStart} empty="Nothing this month" onOpen={openItem} today={today} />
                                            </div>
                                        ) : null}
                                    </>
                                ) : null}
                                {tab === 'week' ? (
                                    <>
                                        <WeekGrid
                                            weekStart={weekStart}
                                            items={drawn}
                                            workingDays={viewWeek}
                                            today={today}
                                            selected={day}
                                            focusISO={focusISO}
                                            compact={mobile}
                                            onFocusISO={setFocusISO}
                                            onOpen={openDay}
                                            wantFocus={wantFocus}
                                            onSelectRange={pickDays}
                                            onMoveLeave={dragLeave}
                                            movable={movable}
                                        />
                                        <Legend colourBy={colourBy} types={entitlements} />
                                    </>
                                ) : null}
                                {tab === 'year' ? (
                                    <YearGrid
                                        year={cursor.year}
                                        weekStart={weekStart}
                                        items={drawn}
                                        workingDays={viewWeek}
                                        today={today}
                                        onOpenDay={openDay}
                                        onOpenMonth={m => { setCursor({ year: cursor.year, month0: m }); changeTab('month'); }}
                                    />
                                ) : null}
                                {tab === 'schedule' ? (
                                    <AgendaList items={scheduleItems} grouped cap empty="Nothing coming up" onOpen={openItem} today={today} />
                                ) : null}
                        </motion.div>
                    </section>

                    <aside className={cn('flex min-w-0 flex-col gap-4 lg:gap-6', tab === 'year' && 'lg:grid lg:grid-cols-2 lg:items-start')}>
                        <LeaveBalances
                            member={subject}
                            year={balanceYear}
                            years={years}
                            onYear={setBalanceYear}
                            balances={balances}
                            summary={summary ?? { year: balanceYear, used: 0, planned: 0, pending: 0, left: 0, total: 0 }}
                            onMember={onMemberClick}
                        />
                        <LeaveAttention items={attention} onOpenTrip={id => onTripClick?.(id)} />
                        <LeaveReminders
                            reminders={reminders}
                            onOpenEntry={id => { const entry = leave.find(e => e.id === id); if (entry) setLeaveTarget({ kind: 'edit', entry }); }}
                            onSettings={onNavigate ? () => {
                                try { localStorage.setItem('wandergrid_settings_new_tab', 'leave'); } catch { /* storage unavailable */ }
                                onNavigate('/settings');
                            } : undefined}
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
                canEditLeave={canEditLeave}
                onEditLeave={entry => { setDay(null); setLeaveTarget({ kind: 'edit', entry }); }}
                onPlanTrip={onNavigate ? entry => {
                    setDay(null);
                    const q = new URLSearchParams({ new: '1', start: entry.startDate, end: entry.endDate || entry.startDate, leave: entry.id, ...(entry.name ? { to: entry.name } : {}) });
                    onNavigate(`/trips?${q.toString()}`);
                } : undefined}
                onLeaveForTrip={trip => { setDay(null); setLeaveTarget({ kind: 'new', tripId: trip.id, memberId: (me && trip.participants?.includes(me.id) ? me.id : trip.participants?.[0]) ?? subject?.id }); }}
                onOpenTrip={id => { setDay(null); onTripClick?.(id); }}
                onAddLeave={startLeave}
                onManageHolidays={() => { setDay(null); setHolidaysOpen(true); }}
                canManageEvents={isAdmin}
                onRemoveEvent={removeEvent}
            />
            <LeaveSheet
                target={leaveTarget}
                users={users}
                trips={trips}
                leave={leave}
                entitlements={entitlements}
                contextFor={contextFor}
                meId={me?.id}
                isAdmin={isAdmin}
                today={today}
                onClose={() => setLeaveTarget(null)}
                onSave={saveEntry}
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
                onLink={(member, config, linked) => followCalendar(member, calendarKey(config), config.regionName ? `${config.countryName}, ${config.regionName}` : config.countryName, linked)}
                onAddDay={addHolidayDay}
                onRemoveDay={removeHolidayDay}
                onToggleDay={(config, holidayId, included) => toggleHolidayDay(config.id, holidayId, config.holidays.find(h => h.id === holidayId)?.name ?? 'Holiday', included)}
                thisYear={thisYear}
                onAddCalendar={addCalendar}
                onRemoveCalendar={removeCalendar}
            />
            <OptionsSheet open={optionsOpen} onClose={() => setOptionsOpen(false)} weekStart={weekStart} onWeekStart={changeWeekStart} colourBy={colourBy} onColourBy={changeColourBy} trips={myTrips} leave={leave.filter(e => e.memberId === me?.id)} typeName={typeName} />
            <EventSheet open={eventOpen !== null} date={eventOpen?.date} today={today} onClose={() => setEventOpen(null)} onSave={saveEvent} />
            <OptimizerSheet
                open={optimizerOpen}
                onClose={() => setOptimizerOpen(false)}
                suggestions={optimizer}
                plan={yearPlan}
                prefs={planPrefs}
                onPrefs={setPlanPrefs}
                onPlanAll={planAll}
                today={today}
                memberName={subject?.name}
                daysLeft={summary && summary.year === thisYear ? summary.left : subject ? summarise(balancesFor({ user: subject, leave, entitlements, today, ctx: contextFor(subject.id) }, thisYear), subject, thisYear).left : null}
                window={optimizerMonths}
                onWindow={setOptimizerMonths}
                hasHolidays={holidays.length > 0}
                canPlan={Boolean(subject && (isAdmin || subject.id === me?.id))}
                onPlan={planBreak}
                onOpenHolidays={() => { setOptimizerOpen(false); setHolidaysOpen(true); }}
            />
            {undo.host}
        </div>
    );
};

/** What the colours mean, each with its icon (colour is never the only signal). */
const LayerChips: React.FC<{ layers: Record<CalendarLayer, boolean>; onToggle: (l: CalendarLayer) => void }> = ({ layers, onToggle }) => (
    <>
        <span className="mx-1 h-6 w-px shrink-0 bg-rp-line" aria-hidden />
        <RpChip selected={layers.leave} onClick={() => onToggle('leave')} className="shrink-0"><SunHorizon size={16} aria-hidden /> Leave</RpChip>
        <RpChip selected={layers.trip} onClick={() => onToggle('trip')} className="shrink-0"><Suitcase size={16} aria-hidden /> Trips</RpChip>
        <RpChip selected={layers.holiday} onClick={() => onToggle('holiday')} className="shrink-0"><Flag size={16} aria-hidden /> Holidays</RpChip>
        <RpChip selected={layers.event} onClick={() => onToggle('event')} className="shrink-0"><Star size={16} aria-hidden /> Events</RpChip>
    </>
);

const Legend: React.FC<{ colourBy: ColourBy; types: { id: string; name: string; color: LeaveColor }[] }> = ({ colourBy, types }) => (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-rp-muted" aria-label="Legend">
        {colourBy === 'type' ? types.map(t => <li key={t.id} className="flex items-center gap-1.5"><span className={cn('size-3 rounded-full', TINT[t.color]?.swatch ?? 'bg-rp-muted')} aria-hidden /> {t.name}</li>) : null}
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-rp-mustard" aria-hidden /> Planned</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-rp-green" aria-hidden /> Confirmed</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-rp-ink" aria-hidden /> Travelling now</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-rp-line" aria-hidden /> Past</li>
        <li className="flex items-center gap-1.5"><Flag size={12} className="text-rp-ochre" aria-hidden /> Public holiday</li>
        <li className="flex items-center gap-1.5"><SunHorizon size={12} aria-hidden /> Leave</li>
    </ul>
);

export default CalendarNew;
