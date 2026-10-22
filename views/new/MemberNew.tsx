import React, { useMemo, useState } from 'react';
import NumberFlow from '@number-flow/react';
import type { User } from '../../types';
import { useMemberData, type MemberTrip } from '../../hooks/useMemberData';
import { leaveFigures, leaveYears } from '../../utils/leaveModel';
import { destinationsOf, timingOf } from '../../utils/tripsModel';
import { formatDate, formatDateRange } from '../../utils/formatters';
import { errorMessage, toast } from '../../services/toast';
import SwipeTabs from '../../components/kokonutui/swipe-tabs';
import { StackPanel, type StackPage } from '../../components/kokonutui/stack-panel';
import { RpChip, RpEmpty, useIsMobile } from '../../components/new/ui';
import { RpHugeicon } from '../../components/new/RpHugeicon';
import { Avatar } from '../../components/new/member/Avatar';
import { PassportCard, PassportValidity } from '../../components/new/member/PassportCard';
import { MemberRing, leaveColor, type RingSegment } from '../../components/new/member/MemberRing';
import { MemberSheet, RemoveMemberSheet, type MemberTopic } from '../../components/new/member/MemberSheets';
import { ArrowLeft, CalendarBlank, Envelope, Eye, EyeSlash, Globe, IdentificationCard, Lock, MapPin, PencilSimple, Plus, SignOut, SunHorizon, Suitcase, Trash, User as UserIcon, UserCircle, type Icon } from '../../components/ui/hugeicons';
import { cn } from '../../utils/cn';

/**
 * MemberNew (UI_UX_DESIGN_REFERENCE.md §5.0): the redesigned page for one member, at /member-new/:id.
 * Features come from the data layer (useMemberData: the member, their trips, leave types, save and
 * remove); the layout is new: a compact profile header, three filled tiles and Swipe Tabs for Leave,
 * Trips, Places, Documents and Settings. Documents and Settings are Stack Panels (settings-style rows).
 */

interface MemberNewProps {
    memberId: string;
    onBack: () => void;
    /** Opens a trip's New page. */
    onOpenTrip: (tripId: string) => void;
    onLogout?: () => void;
    /** Called after the member was removed. */
    onRemoved?: () => void;
}

type TabId = 'overview' | 'leave' | 'trips' | 'places' | 'documents' | 'settings';
const TAB_KEY = 'wandergrid_member_new_tab';
const TAB_PILL: Record<TabId, { bg: string; text: string; icon: string }> = {
    overview: { bg: 'bg-rp-navy', text: 'text-rp-paper dark:text-rp-on-ink', icon: 'text-rp-navy' },
    leave: { bg: 'bg-rp-mustard', text: 'text-rp-on-mustard', icon: 'text-rp-ochre' },
    trips: { bg: 'bg-rp-ink', text: 'text-rp-on-ink', icon: 'text-rp-ink' },
    places: { bg: 'bg-rp-green', text: 'text-rp-paper', icon: 'text-rp-green' },
    documents: { bg: 'bg-rp-rust', text: 'text-rp-paper', icon: 'text-rp-rust' },
    settings: { bg: 'bg-rp-ink', text: 'text-rp-on-ink', icon: 'text-rp-muted' },
};
const readTab = (): TabId => {
    try {
        const v = localStorage.getItem(TAB_KEY);
        return v === 'leave' || v === 'trips' || v === 'places' || v === 'documents' || v === 'settings' ? v : 'overview';
    } catch { return 'overview'; }
};

const ROLE_CHIP: Record<User['role'], string> = {
    Admin: 'bg-rp-ink text-rp-on-ink',
    Partner: 'bg-rp-green text-rp-paper',
    Child: 'bg-rp-mustard text-rp-on-mustard',
};
const WEEKEND_LABEL = { none: 'Standard', monday: 'Move to Monday', lieu: 'Day in lieu' } as const;
const TRIPS_SHOWN = 6;
const PLACES_SHOWN = 12;

const card = 'rounded-rp-card bg-rp-surface rp-shadow-rest';

/** How a passport's expiry reads: the text and the chip colour. */
const passportStatus = (expiry?: string): { label: string; className: string } | null => {
    if (!expiry) return null;
    const date = new Date(expiry);
    if (Number.isNaN(date.getTime())) return null;
    const now = new Date();
    if (date < now) return { label: 'Expired', className: 'bg-rp-rust text-rp-paper' };
    const months = (date.getFullYear() - now.getFullYear()) * 12 + date.getMonth() - now.getMonth();
    if (months < 6) return { label: months < 1 ? 'Expires within a month' : `Expires in ${months} months`, className: 'bg-rp-mustard text-rp-on-mustard' };
    return { label: 'Valid', className: 'bg-rp-green text-rp-paper' };
};

export const MemberNew: React.FC<MemberNewProps> = ({ memberId, onBack, onOpenTrip, onLogout, onRemoved }) => {
    const data = useMemberData(memberId);
    const mobile = useIsMobile();
    const [tab, setTab] = useState<TabId>(readTab);
    const [topic, setTopic] = useState<MemberTopic | null>(null);
    const [removing, setRemoving] = useState<User | null>(null);
    const [year, setYear] = useState(() => new Date().getFullYear());
    const [showAllTrips, setShowAllTrips] = useState(false);
    const [reveal, setReveal] = useState(false);

    const { member } = data;
    const thisYear = new Date().getFullYear();
    const years = useMemo(() => (member ? leaveYears(member, data.trips, thisYear) : [thisYear]), [member, data.trips, thisYear]);
    const leave = useMemo(() => (member ? leaveFigures(member, data.trips, data.entitlements, year, data.today) : null), [member, data.trips, data.entitlements, year, data.today]);

    const changeTab = (next: TabId) => {
        setTab(next);
        try { localStorage.setItem(TAB_KEY, next); } catch { /* storage unavailable */ }
    };

    if (data.loading) {
        return (
            <div className="px-3 pt-2 sm:px-6" aria-busy="true">
                <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4">
                    <div className="h-36 animate-pulse rounded-rp-card bg-rp-surface/70" />
                    <div className="h-20 animate-pulse rounded-rp-card bg-rp-surface/70" />
                </div>
            </div>
        );
    }
    if (!member || !leave) {
        return (
            <div className="px-3 pt-2 sm:px-6">
                <div className={cn('mx-auto w-full max-w-[1180px]', card)}>
                    <RpEmpty
                        title={data.error ? "Couldn't load this member" : 'Member not found'}
                        action={<button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink"><ArrowLeft size={16} aria-hidden /> Back</button>}
                    >
                        {data.error ?? 'They may have been removed, or the link is wrong.'}
                    </RpEmpty>
                </div>
            </div>
        );
    }

    const attempt = async (run: () => Promise<void>, fallback = "That didn't save. Try again.") => {
        try { await run(); } catch (e) { toast.error(errorMessage(e, fallback)); }
    };
    const passport = passportStatus(member.passportExpiryDate);
    const hasPassport = Boolean(member.passportNumber || member.nationality || member.dateOfBirth || member.passportIssuingEntity || member.passportIssueDate || member.passportExpiryDate);
    const weekendRule = member.holidayWeekendRule || 'none';
    const firstName = member.name.split(' ')[0];

    const tabItems = ([
        { id: 'overview', title: 'Overview', icon: UserCircle },
        { id: 'leave', title: 'Leave', icon: SunHorizon },
        { id: 'trips', title: 'Trips', icon: Suitcase, badge: data.memberTrips.length || undefined },
        { id: 'places', title: 'Places', icon: Globe, badge: data.stats.countries.length + data.stats.cities.length || undefined },
        { id: 'documents', title: 'Documents', icon: IdentificationCard },
        ...(data.canEdit ? [{ id: 'settings', title: 'Settings', icon: UserIcon }] : []),
    ] as const);
    const activeTab: TabId = tabItems.some(t => t.id === tab) ? tab : 'overview';
    // On phones only the selected tab shows its name (§1.5); the rest keep their icon and count.
    const tabs = tabItems.map(t => ({ ...t, hideTitle: mobile && t.id !== activeTab, iconClassName: activeTab === t.id ? undefined : TAB_PILL[t.id as TabId].icon }));

    // ---- Leave -------------------------------------------------------------------------------
    const segments: RingSegment[] = [
        ...leave.types.map(t => ({ id: t.entitlement.id, label: t.entitlement.name, days: t.used + t.planned, className: leaveColor(t.entitlement.color).stroke })),
        { id: 'recorded', label: 'Recorded as taken', days: Math.max(0, leave.taken - leave.onTrips), className: 'stroke-rp-ink' },
    ];
    const noLeave = leave.allowance === 0 && leave.taken === 0 && leave.types.length === 0;

    // ---- Settings-style panels ---------------------------------------------------------------
    const documentPages: Record<string, StackPage> = {
        documents: {
            title: 'Documents',
            sections: [
                {
                    rows: [
                        { id: 'passport', icon: IdentificationCard, label: 'Passport', detail: passport ? <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium', passport.className)}>{passport.label}</span> : (hasPassport ? 'Added' : 'Not added'), to: 'passport' },
                    ],
                },
                ...(data.canEdit ? [{ rows: [{ id: 'edit-passport', icon: PencilSimple, label: 'Edit passport details', onSelect: () => setTopic('passport' as MemberTopic) }] }] : []),
            ],
        },
        passport: {
            title: 'Passport',
            sections: [
                {
                    rows: [
                        {
                            id: 'number',
                            label: 'Number',
                            detail: member.passportNumber ? (reveal ? member.passportNumber : `•••• ${member.passportNumber.slice(-4)}`) : 'Not added',
                            trailing: member.passportNumber ? <span className="flex size-6 items-center justify-center text-rp-muted" aria-hidden>{reveal ? <EyeSlash size={16} /> : <Eye size={16} />}</span> : undefined,
                            onSelect: member.passportNumber ? () => setReveal(v => !v) : undefined,
                        },
                        ...([
                            ['nationality', 'Nationality', member.nationality || ''],
                            ['dob', 'Date of birth', member.dateOfBirth ? formatDate(member.dateOfBirth, 'long') : ''],
                            ['issuer', 'Issued by', member.passportIssuingEntity || ''],
                            ['issued', 'Issued', member.passportIssueDate ? formatDate(member.passportIssueDate, 'short-with-year') : ''],
                            ['expires', 'Expires', member.passportExpiryDate ? formatDate(member.passportExpiryDate, 'short-with-year') : ''],
                        ] as const).filter(r => r[2]).map(([id, label, detail]) => ({ id, label, detail })),
                    ],
                },
            ],
        },
    };

    const settingsPages: Record<string, StackPage> = {
        settings: {
            title: 'Profile',
            sections: [
                {
                    title: 'Details',
                    rows: [
                        { id: 'name', icon: UserIcon, label: 'Name', detail: member.name, onSelect: () => setTopic('profile') },
                        { id: 'email', icon: Envelope, label: 'Email', detail: member.email || 'None' },
                        { id: 'role', icon: Lock, label: 'Role', detail: member.role, onSelect: data.isAdmin ? () => setTopic('profile') : undefined },
                    ],
                },
                {
                    title: 'Leave',
                    rows: [
                        { id: 'weekend', icon: CalendarBlank, label: 'Weekend holidays', detail: WEEKEND_LABEL[weekendRule], to: 'weekend' },
                        ...(data.isAdmin ? [{ id: 'allowance', icon: SunHorizon, label: 'Leave allowance', detail: `${leave.allowance} days a year`, onSelect: () => setTopic('leave' as MemberTopic) }] : []),
                    ],
                },
            ],
        },
        weekend: {
            title: 'Weekend holidays',
            sections: [
                {
                    rows: (['none', 'monday', 'lieu'] as const).map(rule => ({
                        id: rule,
                        label: WEEKEND_LABEL[rule],
                        selected: weekendRule === rule,
                        onSelect: () => { if (rule !== weekendRule) void attempt(() => data.save({ ...member, holidayWeekendRule: rule })); },
                    })),
                    footer: 'How a holiday that falls on a weekend counts for this member.',
                },
            ],
        },
    };

    const accountPages: Record<string, StackPage> = {
        account: {
            title: 'Account',
            sections: [
                {
                    rows: [
                        { id: 'password', icon: Lock, label: 'Password', detail: 'Change', onSelect: () => setTopic('account') },
                    ],
                },
                {
                    rows: [
                        ...(data.isSelf && onLogout ? [{ id: 'sign-out', icon: SignOut, label: 'Sign out', tone: 'danger' as const, onSelect: onLogout }] : []),
                        ...(data.canRemove ? [{ id: 'remove', icon: Trash, label: 'Remove member', tone: 'danger' as const, onSelect: () => setRemoving(member) }] : []),
                    ],
                },
            ],
        },
    };
    if (accountPages.account.sections[1].rows.length === 0) accountPages.account.sections.pop();

    const visibleTrips: MemberTrip[] = showAllTrips ? data.memberTrips : data.memberTrips.slice(0, TRIPS_SHOWN);

    return (
        <div className="custom-scrollbar h-full overflow-y-auto px-3 pt-2 pb-32 sm:px-6 md:pb-16">
            <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 lg:gap-6">
                <div>
                    <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-full pr-3 text-sm font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                        <ArrowLeft size={16} aria-hidden /> Back
                    </button>
                </div>

                <header className={cn(card, 'flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:p-5')}>
                    <Avatar user={member} size={72} className="sm:!size-20" />
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <h1 className="min-w-0 truncate text-[1.75rem] leading-[1.1] font-medium tracking-tight sm:text-[2.25rem]">{member.name}</h1>
                            <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium', ROLE_CHIP[member.role])}>{member.role}</span>
                            {data.isSelf ? <span className="inline-flex h-6 items-center rounded-full bg-rp-inset px-2.5 text-xs font-medium text-rp-muted">You</span> : null}
                        </div>
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-rp-muted">
                            {member.email ? <span className="flex min-w-0 items-center gap-1.5"><Envelope size={14} className="shrink-0" aria-hidden /><span className="truncate">{member.email}</span></span> : null}
                            {member.nationality ? <span className="flex items-center gap-1.5"><Globe size={14} className="shrink-0" aria-hidden />{member.nationality}</span> : null}
                        </p>
                    </div>
                    {data.canEdit ? (
                        <button type="button" aria-label={`Edit ${member.name}`} onClick={() => setTopic('profile')} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-rp-inset text-rp-ink outline-none transition-colors hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">
                            <PencilSimple size={18} aria-hidden />
                        </button>
                    ) : null}
                </header>

                <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
                    <StatTile tone="ink" icon={Suitcase} value={data.stats.trips} unit={data.stats.trips === 1 ? 'trip' : 'trips'} sub={`${data.stats.coming} coming · ${data.stats.flights} ${data.stats.flights === 1 ? 'flight' : 'flights'}`} />
                    <StatTile tone="green" icon={CalendarBlank} value={data.stats.daysAway} unit="days away" sub={`${data.stats.countries.length} ${data.stats.countries.length === 1 ? 'country' : 'countries'} · ${data.stats.cities.length} ${data.stats.cities.length === 1 ? 'city' : 'cities'}`} />
                    <StatTile tone="mustard" icon={SunHorizon} value={leave.left} unit="days left" sub={leave.allowance > 0 ? `of ${leave.allowance} in ${leave.year}` : `in ${leave.year}`} />
                </div>

                <div className="-m-3 overflow-x-auto p-3 [scrollbar-width:none]">
                    <SwipeTabs
                        items={tabs}
                        value={activeTab}
                        onChange={id => changeTab(id as TabId)}
                        panels={false}
                        label="Member sections"
                        className="w-full sm:w-auto"
                        listClassName="bg-rp-surface rp-shadow-soft"
                        activeColor={TAB_PILL[activeTab].bg}
                        activeTextColor={TAB_PILL[activeTab].text}
                    />
                </div>

                <section aria-label={tabItems.find(t => t.id === activeTab)?.title}>
                    {activeTab === 'overview' ? (
                        <PassportCard
                            member={member}
                            countries={data.stats.countries}
                            status={passport}
                            reveal={reveal}
                            onToggleReveal={() => setReveal(v => !v)}
                            onEdit={data.canEdit ? () => setTopic('passport') : undefined}
                        />
                    ) : null}

                    {activeTab === 'leave' ? (
                        <div className="flex flex-col gap-3">
                            {years.length > 1 ? (
                                <div className="-m-3 flex gap-2 overflow-x-auto p-3 [scrollbar-width:none]" role="group" aria-label="Year">
                                    {years.map(y => <RpChip key={y} selected={y === year} onClick={() => setYear(y)} className="rp-tabular">{y}</RpChip>)}
                                </div>
                            ) : null}
                            <div className={cn(card, 'p-4 sm:p-5')}>
                                {noLeave ? (
                                    <RpEmpty
                                        title="No leave set up"
                                        action={data.isAdmin ? <button type="button" onClick={() => setTopic('leave')} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink"><Plus size={16} aria-hidden /> Set allowance</button> : undefined}
                                    >
                                        {data.isAdmin ? `Give ${firstName} a yearly allowance.` : `${firstName} has no leave allowance yet.`}
                                    </RpEmpty>
                                ) : (
                                    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-8">
                                        <MemberRing segments={segments} total={leave.allowance} label={`${leave.left} leave days left of ${leave.allowance} in ${leave.year}`}>
                                            <NumberFlow value={leave.left} format={{ maximumFractionDigits: 0 }} className="rp-tabular text-4xl leading-none font-semibold" />
                                            <span className="mt-1 text-xs text-rp-muted">days left</span>
                                        </MemberRing>
                                        <div className="flex w-full min-w-0 flex-1 flex-col gap-3">
                                            <p className="rp-tabular text-sm text-rp-muted">
                                                {leave.taken} taken · {leave.planned} planned · {leave.allowance} a year
                                            </p>
                                            {leave.types.length > 0 ? (
                                                <ul className="flex flex-col gap-1.5">
                                                    {leave.types.map(t => (
                                                        <li key={t.entitlement.id} className="flex min-h-11 items-center gap-3 rounded-rp-inset bg-rp-inset px-3">
                                                            <span className={cn('size-3 shrink-0 rounded-full', leaveColor(t.entitlement.color).dot)} aria-hidden />
                                                            <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.entitlement.name}</span>
                                                            <span className="rp-tabular shrink-0 text-sm text-rp-muted">
                                                                {t.used} used · {t.planned} planned{t.unlimited ? ' · Unlimited' : t.allowance !== null ? ` · of ${t.allowance}` : ''}
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <p className="text-sm text-rp-muted">No trips use leave in {leave.year}.</p>
                                            )}
                                            {data.isAdmin ? (
                                                <div>
                                                    <button type="button" onClick={() => setTopic('leave')} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-inset px-4 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">
                                                        <PencilSimple size={16} aria-hidden /> Edit allowance
                                                    </button>
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : null}

                    {activeTab === 'trips' ? (
                        data.memberTrips.length === 0 ? (
                            <div className={card}>
                                <RpEmpty title="No trips yet">{firstName} isn't on any trip. Add them to one from its edit sheet.</RpEmpty>
                            </div>
                        ) : (
                            <div className={cn(card, 'p-2 sm:p-3')}>
                                <ul className="flex flex-col">
                                    {visibleTrips.map(({ trip, bucket, travelling }) => {
                                        const cities = destinationsOf(trip);
                                        const timing = timingOf(trip, data.today);
                                        const cancelled = trip.status === 'Cancelled';
                                        const chip = cancelled
                                            ? { label: 'Cancelled', className: 'bg-rp-inset text-rp-muted' }
                                            : travelling ? { label: 'Travelling now', className: 'bg-rp-ink text-rp-on-ink' }
                                            : bucket === 'planned' ? { label: 'Planned', className: 'bg-rp-mustard text-rp-on-mustard' }
                                            : bucket === 'confirmed' ? { label: 'Confirmed', className: 'bg-rp-green text-rp-paper' }
                                            : { label: 'Past', className: 'bg-rp-inset text-rp-muted' };
                                        return (
                                            <li key={trip.id}>
                                                <button type="button" onClick={() => onOpenTrip(trip.id)} className="flex min-h-14 w-full items-center gap-3 rounded-rp-inset px-2 py-2 text-left outline-none transition-colors hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted sm:px-3">
                                                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rp-inset text-rp-ink">
                                                        <RpHugeicon name={trip.hugeicon} size={18} fallback={<Suitcase size={18} aria-hidden />} />
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-sm font-medium">{trip.name}</span>
                                                        <span className="rp-tabular block truncate text-xs text-rp-muted">
                                                            {trip.startDate ? formatDateRange(trip.startDate, trip.endDate || trip.startDate) : 'No dates yet'}
                                                            {cities.length > 0 ? ` · ${cities.slice(0, 2).join(' · ')}${cities.length > 2 ? ` · +${cities.length - 2}` : ''}` : ''}
                                                        </span>
                                                    </span>
                                                    {!cancelled && timing.value !== null && timing.state !== 'past' ? (
                                                        <span className="rp-tabular hidden shrink-0 text-xs text-rp-muted sm:block">{timing.value} {timing.unit}</span>
                                                    ) : null}
                                                    <span className={cn('inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-medium', chip.className)}>{chip.label}</span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                                {data.memberTrips.length > TRIPS_SHOWN ? (
                                    <div className="flex justify-center pt-1">
                                        <button type="button" onClick={() => setShowAllTrips(v => !v)} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                                            {showAllTrips ? 'Show fewer' : `Show all ${data.memberTrips.length}`}
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        )
                    ) : null}

                    {activeTab === 'places' ? (
                        data.stats.countries.length + data.stats.cities.length === 0 ? (
                            <div className={card}>
                                <RpEmpty title="No places yet">Places appear here once {firstName} has finished a trip.</RpEmpty>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3 lg:gap-4">
                                <PlaceGroup title="Countries" icon={Globe} items={data.stats.countries} tone="bg-rp-green text-rp-paper" />
                                <PlaceGroup title="Cities" icon={MapPin} items={data.stats.cities} tone="bg-rp-ink text-rp-on-ink" />
                            </div>
                        )
                    ) : null}

                    {activeTab === 'documents' ? (
                        hasPassport ? (
                            <div className={cn('grid gap-3 lg:gap-4', member.passportExpiryDate && 'lg:grid-cols-2')}>
                                <div className={cn(card, 'p-2 sm:p-3')}>
                                    <StackPanel pages={documentPages} root="documents" />
                                </div>
                                {member.passportExpiryDate ? <PassportValidity issued={member.passportIssueDate} expires={member.passportExpiryDate} today={data.today} /> : null}
                            </div>
                        ) : (
                            <div className={card}>
                                <RpEmpty
                                    title="No passport details"
                                    action={data.canEdit ? <button type="button" onClick={() => setTopic('passport')} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink"><Plus size={16} aria-hidden /> Add details</button> : undefined}
                                >
                                    {data.canEdit ? 'Number, nationality and dates.' : undefined}
                                </RpEmpty>
                            </div>
                        )
                    ) : null}

                    {activeTab === 'settings' && data.canEdit ? (
                        <div className="grid items-start gap-3 lg:grid-cols-2 lg:gap-4">
                            <div className={cn(card, 'p-2 sm:p-3')}>
                                <StackPanel pages={settingsPages} root="settings" />
                            </div>
                            <div className={cn(card, 'p-2 sm:p-3')}>
                                <StackPanel pages={accountPages} root="account" />
                            </div>
                        </div>
                    ) : null}
                </section>
            </div>

            <MemberSheet
                member={member}
                topic={topic}
                isAdmin={data.isAdmin}
                isSelf={data.isSelf}
                onClose={() => setTopic(null)}
                onSave={data.save}
            />
            <RemoveMemberSheet
                member={removing}
                onClose={() => setRemoving(null)}
                onConfirm={async m => { await data.remove(); setRemoving(null); toast.success(`${m.name} was removed`); (onRemoved ?? onBack)(); }}
            />
        </div>
    );
};

/** One list of visited places (countries or cities): the first few with their last visit, then "Show all". */
const PlaceGroup: React.FC<{ title: string; icon: Icon; items: Array<{ name: string; date: string }>; tone: string }> = ({ title, icon: IconC, items, tone }) => {
    const [all, setAll] = useState(false);
    const shown = all ? items : items.slice(0, PLACES_SHOWN);
    return (
        <section aria-label={title} className={cn(card, 'p-3 sm:p-4')}>
            <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-medium">
                <IconC size={16} className="text-rp-muted" aria-hidden /> {title}
                <span className="rp-tabular text-rp-muted">{items.length}</span>
            </h2>
            {items.length === 0 ? (
                <p className="px-1 pb-1 text-sm text-rp-muted">None yet.</p>
            ) : (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {shown.map(p => (
                        <li key={p.name} className="flex min-h-14 items-center gap-3 rounded-rp-inset bg-rp-inset px-3">
                            <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', tone)}><IconC size={16} aria-hidden /></span>
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-medium">{p.name}</span>
                                <span className="block text-xs text-rp-muted">{formatDate(p.date, 'month-year')}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            {items.length > PLACES_SHOWN ? (
                <div className="flex justify-center pt-2">
                    <button type="button" onClick={() => setAll(v => !v)} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                        {all ? 'Show fewer' : `Show all ${items.length}`}
                    </button>
                </div>
            ) : null}
        </section>
    );
};

/** The tiles are filled with their accent (as on TripNew): a rolling figure with its unit and one line of detail. */
const TILE_TONE = {
    ink: { card: 'bg-rp-ink text-rp-on-ink', muted: 'text-rp-on-ink/70', circle: 'bg-rp-on-ink/15' },
    green: { card: 'bg-rp-green text-rp-paper', muted: 'text-rp-paper/80', circle: 'bg-rp-paper/20' },
    mustard: { card: 'bg-rp-mustard text-rp-on-mustard', muted: 'text-rp-on-mustard/70', circle: 'bg-rp-on-mustard/10' },
} as const;

const StatTile: React.FC<{ icon: Icon; tone: keyof typeof TILE_TONE; value: number; unit: string; sub: string }> = ({ icon: IconC, tone, value, unit, sub }) => {
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

export default MemberNew;
