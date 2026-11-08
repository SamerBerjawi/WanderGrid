import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import NumberFlow from '@number-flow/react';
import type { EntitlementType, Trip, User } from '../../../types';
import type { Leg } from '../../../utils/dashboardModel';
import { dataService } from '../../../services/mockDb';
import { toast } from '../../../services/toast';
import { useOverlayA11y } from '../../../hooks/useOverlayA11y';
import { leaveFigures } from '../../../utils/leaveModel';
import { formatKg } from '../../../utils/footprint';
import { formatMinutes } from '../../../utils/journeysModel';
import { formatDate } from '../../../utils/formatters';
import { buildReview, countryCodeOfPlace, countryName, monthName, percentChange, reviewYears, slidesFor, type SlideKind, type YearReview as Review } from '../../../utils/yearReview';
import { ArrowLeft, ArrowRight, Check, Copy, X } from '../../ui/hugeicons';
import { RpChip } from '../ui';
import { cn } from '../../../utils/cn';
import '../new.css';

/**
 * Year in review: a story of one calendar year of travel, a slide at a time. It reads what the Dashboard
 * already holds (trips, legs, members, leave types) and loads the flight log when it opens. Tap or press the
 * arrows to move; swipe on a phone; Escape closes. Nothing advances by itself, so there is no clock to beat.
 * The figures come from utils/yearReview.ts.
 */

interface Props {
    open: boolean;
    onClose: () => void;
    trips: Trip[];
    legs: Leg[];
    today: string;
    users: User[];
    types: EntitlementType[];
}

const sessionUserId = (): string | undefined => {
    try { return JSON.parse(localStorage.getItem('wandergrid_session_user') || 'null')?.id; } catch { return undefined; }
};

/** The flag of a country from its two-letter code. */
const flagOf = (code: string): string => (/^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map(c => 0x1f1a5 + c.charCodeAt(0))) : '');

/** A number that counts up from nothing when its slide arrives. */
const Count: React.FC<{ value: number; className?: string; suffix?: string; digits?: number }> = ({ value, className, suffix, digits = 0 }) => {
    const [shown, setShown] = useState(0);
    useEffect(() => {
        const id = requestAnimationFrame(() => setShown(value));
        return () => cancelAnimationFrame(id);
    }, [value]);
    return <NumberFlow value={shown} suffix={suffix} className={cn('rp-tabular font-semibold leading-none tracking-tight', className)} format={{ maximumFractionDigits: digits, minimumFractionDigits: digits }} />;
};

type Accent = 'green' | 'navy' | 'plum' | 'rust' | 'sea' | 'ochre';
const ACCENT: Record<Accent, { text: string; fill: string; soft: string }> = {
    green: { text: 'text-rp-green', fill: 'bg-rp-green', soft: 'bg-rp-green/15' },
    navy: { text: 'text-rp-navy', fill: 'bg-rp-navy', soft: 'bg-rp-navy/15' },
    plum: { text: 'text-rp-plum', fill: 'bg-rp-plum', soft: 'bg-rp-plum/15' },
    rust: { text: 'text-rp-rust', fill: 'bg-rp-rust', soft: 'bg-rp-rust/15' },
    sea: { text: 'text-rp-sea', fill: 'bg-rp-sea', soft: 'bg-rp-sea/15' },
    ochre: { text: 'text-rp-ochre', fill: 'bg-rp-ochre', soft: 'bg-rp-ochre/15' },
};
const SLIDE_ACCENT: Record<SlideKind, Accent> = { intro: 'green', distance: 'navy', time: 'plum', places: 'sea', longest: 'rust', favourites: 'ochre', carbon: 'green', leave: 'plum', outro: 'navy' };

const Kicker: React.FC<{ children: ReactNode }> = ({ children }) => <p className="text-sm font-medium text-rp-muted">{children}</p>;
const Lede: React.FC<{ children: ReactNode }> = ({ children }) => <p className="max-w-[28ch] text-lg leading-snug text-rp-ink">{children}</p>;
const Small: React.FC<{ children: ReactNode }> = ({ children }) => <p className="text-sm text-rp-muted">{children}</p>;

const Tile: React.FC<{ label: string; value: ReactNode; accent: Accent }> = ({ label, value, accent }) => (
    <div className="flex flex-col gap-1 rounded-rp-inset bg-rp-inset px-4 py-3">
        <span className={cn('rp-tabular text-2xl font-semibold leading-none', ACCENT[accent].text)}>{value}</span>
        <span className="text-xs text-rp-muted">{label}</span>
    </div>
);

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

const Change: React.FC<{ now: number; before?: number; year: number; unit?: string }> = ({ now, before, year, unit }) => {
    const pct = percentChange(now, before);
    if (pct === null) return null;
    return <Small>{pct > 0 ? 'Up' : 'Down'} {Math.abs(pct)}% on {year - 1}{unit ? ` ${unit}` : ''}.</Small>;
};

const MonthBars: React.FC<{ months: number[]; busiest: number | null; year: number }> = ({ months, busiest, year }) => {
    const max = Math.max(1, ...months);
    return (
        <div className="flex h-20 items-end gap-1.5" role="img" aria-label={`Nights away by month in ${year}. ${busiest !== null ? `${monthName(busiest, year)} the most.` : ''}`}>
            {months.map((n, i) => (
                <span key={i} className="flex h-full flex-1 flex-col justify-end gap-1">
                    <span className={cn('w-full rounded-full', i === busiest ? ACCENT.plum.fill : 'bg-rp-line')} style={{ height: `${Math.max(6, (n / max) * 100)}%` }} />
                    <span className="text-center text-2xs text-rp-muted" aria-hidden>{monthName(i, year).slice(0, 1)}</span>
                </span>
            ))}
        </div>
    );
};

const KindBar: React.FC<{ r: Review }> = ({ r }) => {
    const parts = ([['Flights', r.kmByKind.flight, 'bg-rp-navy'], ['Rail', r.kmByKind.rail, 'bg-rp-green'], ['Road', r.kmByKind.road, 'bg-rp-ochre'], ['Sea', r.kmByKind.sea, 'bg-rp-sea']] as const).filter(p => p[1] > 0);
    const total = parts.reduce((n, p) => n + p[1], 0);
    if (parts.length < 2) return null;
    return (
        <div className="flex flex-col gap-2">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-rp-line" role="img" aria-label={parts.map(p => `${p[0]} ${Math.round((p[1] / total) * 100)}%`).join(', ')}>
                {parts.map(p => <span key={p[0]} className={p[2]} style={{ width: `${(p[1] / total) * 100}%` }} />)}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {parts.map(p => <li key={p[0]} className="flex items-center gap-1.5 text-xs text-rp-muted"><span className={cn('size-2 rounded-full', p[2])} aria-hidden />{p[0]} <span className="rp-tabular text-rp-ink">{Math.round((p[1] / total) * 100)}%</span></li>)}
            </ul>
        </div>
    );
};

const SlideBody: React.FC<{ kind: SlideKind; r: Review; summary: string; onCopy: () => void }> = ({ kind, r, summary, onCopy }) => {
    const a = ACCENT[SLIDE_ACCENT[kind]];
    const daysInAir = Math.floor(r.flightMinutes / 1440);
    const hoursInAir = Math.floor((r.flightMinutes % 1440) / 60);
    switch (kind) {
        case 'intro':
            return (
                <>
                    <Kicker>Your year in travel</Kicker>
                    <p className={cn('rp-tabular text-8xl font-semibold leading-none tracking-tight', a.text)}>{r.year}</p>
                    <Lede>{r.trips > 0 ? `${plural(r.trips, 'trip')}, ${plural(r.nights, 'night')} away from home.` : 'A look back at where you went.'}</Lede>
                    <Small>Tap to begin.</Small>
                </>
            );
        case 'distance':
            return (
                <>
                    <Kicker>You travelled</Kicker>
                    <Count value={r.km} suffix=" km" className={cn('text-6xl', a.text)} />
                    <Lede>{r.orbits >= 0.1 ? `That is ${r.orbits >= 1 ? `${r.orbits.toFixed(1)} times` : `${Math.round(r.orbits * 100)}% of the way`} around the Earth.` : 'Every kilometre counts.'}</Lede>
                    <KindBar r={r} />
                    <Change now={r.km} before={r.before?.km} year={r.year} unit="in distance" />
                </>
            );
        case 'time':
            return (
                <>
                    <Kicker>You spent</Kicker>
                    <Count value={r.nights} className={cn('text-8xl', a.text)} />
                    <Lede>{r.nights === 1 ? 'night' : 'nights'} away, over {plural(r.trips, 'trip')}.</Lede>
                    <MonthBars months={r.monthNights} busiest={r.busiestMonth?.month ?? null} year={r.year} />
                    {r.busiestMonth ? <Small>{monthName(r.busiestMonth.month, r.year)} was your busiest month, with {plural(r.busiestMonth.nights, 'night')}.</Small> : null}
                    {r.longestTrip ? <Small>Longest trip: {r.longestTrip.name}, {plural(r.longestTrip.nights, 'night')}.</Small> : null}
                </>
            );
        case 'places':
            return (
                <>
                    <Kicker>You visited</Kicker>
                    <Count value={r.countries.length} className={cn('text-8xl', a.text)} />
                    <Lede>{r.countries.length === 1 ? 'country' : 'countries'}{r.newCountries.length ? `, ${r.newCountries.length} of them new to you.` : '.'}</Lede>
                    <ul className="flex flex-wrap gap-2" aria-label="Countries visited">
                        {r.countries.slice(0, 18).map(c => {
                            const fresh = r.newCountries.includes(c);
                            return (
                                <li key={c} className={cn('inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm', fresh ? cn(a.soft, 'text-rp-ink') : 'bg-rp-inset text-rp-ink')}>
                                    <span aria-hidden>{flagOf(c)}</span>{countryName(c)}{fresh ? <span className={cn('text-xs font-medium', a.text)}>new</span> : null}
                                </li>
                            );
                        })}
                        {r.countries.length > 18 ? <li className="inline-flex min-h-8 items-center px-1 text-sm text-rp-muted">+{r.countries.length - 18} more</li> : null}
                    </ul>
                </>
            );
        case 'longest': {
            const f = r.longestFlight!;
            return (
                <>
                    <Kicker>Your longest flight</Kicker>
                    <p className={cn('rp-tabular flex items-center gap-3 text-6xl font-semibold leading-none tracking-tight', a.text)}>{f.from}<ArrowRight size={32} aria-label="to" /> {f.to}</p>
                    <Lede>{f.km.toLocaleString('en-US')} km{f.minutes ? `, ${formatMinutes(f.minutes)} in the air` : ''}.</Lede>
                    <Small>{f.identifier ? `${f.identifier} · ` : ''}{formatDate(f.date, 'short-with-year')}</Small>
                    {r.flights > 0 ? <Small>{plural(r.flights, 'flight')} in all{r.flightMinutes ? `: ${daysInAir ? `${plural(daysInAir, 'day')} and ` : ''}${plural(hoursInAir, 'hour')} in the air` : ''}.</Small> : null}
                </>
            );
        }
        case 'favourites':
            return (
                <>
                    <Kicker>Your favourites</Kicker>
                    <ul className="flex flex-col gap-2">
                        {([['Route', r.topRoute?.label, r.topRoute?.count, 'flights'], ['Airline', r.topAirline?.label, r.topAirline?.count, 'flights'], ['Airport', r.topAirport?.label, r.topAirport?.count, 'visits'], ['Aircraft', r.topAircraft?.label, r.topAircraft?.count, 'flights']] as const)
                            .filter(row => row[1]).map(row => (
                                <li key={row[0]} className="flex min-h-14 items-center justify-between gap-3 rounded-rp-inset bg-rp-inset px-4 py-2">
                                    <span className="flex min-w-0 flex-col"><span className="text-xs text-rp-muted">{row[0]}</span><span className={cn('truncate text-lg font-semibold', a.text)}>{row[1]}</span></span>
                                    <span className="rp-tabular shrink-0 text-sm text-rp-muted">{row[2]} {row[3]}</span>
                                </li>
                            ))}
                    </ul>
                </>
            );
        case 'carbon':
            return (
                <>
                    <Kicker>Your travel added about</Kicker>
                    <p className={cn('rp-tabular text-6xl font-semibold leading-none tracking-tight', a.text)}>{formatKg(r.co2Kg)}</p>
                    <Lede>of CO₂, {r.trees > 0 ? `about what ${plural(r.trees, 'tree')} take${r.trees === 1 ? 's' : ''} in over a year.` : 'a light year.'}</Lede>
                    <Small>An estimate from distance, cabin and mode, with an 8% allowance for routing.</Small>
                </>
            );
        case 'leave':
            return (
                <>
                    <Kicker>Time off</Kicker>
                    <Count value={r.leave!.days} className={cn('text-8xl', a.text)} />
                    <Lede>{r.leave!.days === 1 ? 'day' : 'days'} of leave went on trips{r.leave!.allowance > 0 ? ` out of ${r.leave!.allowance}` : ''}.</Lede>
                    {r.leave!.left > 0 ? <Small>{plural(r.leave!.left, 'day')} still to use this year.</Small> : null}
                </>
            );
        case 'outro':
            return (
                <>
                    <Kicker>{r.year} in numbers</Kicker>
                    <div className="grid grid-cols-2 gap-2">
                        <Tile label="Trips" value={r.trips.toLocaleString('en-US')} accent="green" />
                        <Tile label="Nights away" value={r.nights.toLocaleString('en-US')} accent="plum" />
                        <Tile label="Kilometres" value={r.km.toLocaleString('en-US')} accent="navy" />
                        <Tile label={r.newCountries.length ? `Countries, ${r.newCountries.length} new` : 'Countries'} value={r.countries.length.toLocaleString('en-US')} accent="sea" />
                    </div>
                    <button type="button" onClick={onCopy} aria-label={`Copy summary: ${summary}`} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink outline-none hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted">
                        <Copy size={16} aria-hidden /> Copy summary
                    </button>
                </>
            );
    }
};

export const YearReview: React.FC<Props> = ({ open, onClose, trips, legs, today, users, types }) => {
    const reduce = useReducedMotion();
    const panel = useRef<HTMLDivElement>(null);
    const [flights, setFlights] = useState<any[]>([]);
    const [home, setHome] = useState<string | undefined>();
    const [picked, setPicked] = useState<number | null>(null);
    const [index, setIndex] = useState(0);
    const [dir, setDir] = useState<1 | -1>(1);
    const swipe = useRef<{ x: number; y: number } | null>(null);

    useOverlayA11y(open, panel, onClose);

    // The flight log (trips and independent flights) is read when the story opens.
    useEffect(() => {
        if (!open) return;
        let live = true;
        dataService.getFlights().then(list => { if (live) setFlights(list || []); }).catch(() => { /* flight figures stay at zero */ });
        dataService.getWorkspaceSettings().then(s => { if (live) setHome(countryCodeOfPlace(s.defaultStartingAirport)); }).catch(() => { /* the most common origin is used instead */ });
        return () => { live = false; };
    }, [open]);

    const years = useMemo(() => reviewYears(trips, legs, today), [trips, legs, today]);
    const year = picked !== null && years.includes(picked) ? picked : years[0];

    const review = useMemo<Review | null>(() => {
        if (year === undefined) return null;
        const me = users.find(u => u.id === sessionUserId());
        let leave: Review['leave'] = null;
        if (me) {
            const f = leaveFigures(me, trips, types, year, today);
            leave = { days: f.onTrips + f.planned, allowance: f.allowance, left: year === Number(today.slice(0, 4)) ? f.left : 0 };
        }
        return buildReview({ year, today, trips, legs, flights, home, leave });
    }, [year, users, trips, types, legs, flights, home, today]);

    const slides = useMemo(() => (review ? slidesFor(review) : []), [review]);
    useEffect(() => { setIndex(0); }, [year, open]);
    const last = Math.max(0, slides.length - 1);
    const go = (to: number) => {
        const next = Math.min(last, Math.max(0, to));
        if (next === index) return;
        setDir(next > index ? 1 : -1);
        setIndex(next);
    };

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); go(index + 1); }
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); go(index - 1); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const summary = review
        ? `My ${review.year} in travel: ${plural(review.trips, 'trip')}, ${plural(review.nights, 'night')} away, ${review.km.toLocaleString('en-US')} km, ${plural(review.countries.length, 'country', 'countries')}${review.newCountries.length ? ` (${review.newCountries.length} new)` : ''}.`
        : '';
    const copy = async () => {
        try { await navigator.clipboard.writeText(summary); toast.success('Summary copied'); } catch { toast.error("Couldn't copy. Select the text instead."); }
    };

    const kind = slides[index];
    const accent = ACCENT[kind ? SLIDE_ACCENT[kind] : 'green'];

    return (
        <AnimatePresence>
            {open && review ? (
                <div className="rp-root fixed inset-0 z-modal flex items-center justify-center p-3 font-sans sm:p-4">
                    <motion.div aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose} className="absolute inset-0 bg-rp-canvas/60 backdrop-blur-xl" />
                    <motion.div
                        ref={panel}
                        role="dialog"
                        aria-modal="true"
                        aria-label={`Your ${review.year} in travel`}
                        tabIndex={-1}
                        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
                        transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
                        onPointerDown={e => { swipe.current = { x: e.clientX, y: e.clientY }; }}
                        onPointerUp={e => {
                            const s = swipe.current; swipe.current = null;
                            if (!s) return;
                            const dx = e.clientX - s.x, dy = e.clientY - s.y;
                            if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
                        }}
                        className="relative flex h-[min(44rem,calc(100dvh-1.5rem))] w-full max-w-md touch-pan-y flex-col overflow-hidden rounded-rp-card bg-rp-surface text-rp-ink outline-none rp-shadow-float"
                    >
                        <div className="flex flex-col gap-3 px-5 pt-5">
                            <div className="flex items-center gap-1.5" aria-hidden>
                                {slides.map((_, i) => <span key={i} className={cn('h-1 flex-1 rounded-full transition-colors duration-200', i <= index ? accent.fill : 'bg-rp-line')} />)}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <div className="custom-scrollbar flex min-w-0 items-center gap-1.5 overflow-x-auto" role="group" aria-label="Year">
                                    {years.slice(0, 8).map(y => <RpChip key={y} selected={y === year} onClick={() => setPicked(y)}>{y}</RpChip>)}
                                </div>
                                <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-rp-inset text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted"><X size={18} aria-hidden /></button>
                            </div>
                        </div>

                        <div className="relative min-h-0 flex-1">
                            <AnimatePresence mode="wait" initial={false}>
                                <motion.div
                                    key={`${review.year}-${kind}`}
                                    initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 18 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -18 }}
                                    transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                                    className="custom-scrollbar absolute inset-0 flex flex-col justify-center gap-4 overflow-y-auto px-6 py-4"
                                    aria-live="polite"
                                >
                                    {kind ? <SlideBody kind={kind} r={review} summary={summary} onCopy={copy} /> : null}
                                </motion.div>
                            </AnimatePresence>
                            {/* Tap the left side to go back, the right side to go on. */}
                            {index > 0 ? <button type="button" tabIndex={-1} aria-hidden onClick={() => go(index - 1)} className="absolute inset-y-0 left-0 w-1/4 cursor-w-resize outline-none" /> : null}
                            {index < last ? <button type="button" tabIndex={-1} aria-hidden onClick={() => go(index + 1)} className="absolute inset-y-0 right-0 w-1/4 cursor-e-resize outline-none" /> : null}
                        </div>

                        <div className="flex items-center justify-between gap-3 px-5 pb-5 pt-2">
                            <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous slide" className="inline-flex size-11 items-center justify-center rounded-full bg-rp-inset text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted disabled:opacity-30"><ArrowLeft size={18} aria-hidden /></button>
                            <span className="rp-tabular text-xs text-rp-muted" aria-live="polite">{index + 1} of {slides.length}</span>
                            {index < last
                                ? <button type="button" onClick={() => go(index + 1)} aria-label="Next slide" data-autofocus className="inline-flex size-11 items-center justify-center rounded-full bg-rp-ink text-rp-on-ink outline-none hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted"><ArrowRight size={18} aria-hidden /></button>
                                : <button type="button" onClick={onClose} aria-label="Done" data-autofocus className="inline-flex size-11 items-center justify-center rounded-full bg-rp-ink text-rp-on-ink outline-none hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted"><Check size={18} aria-hidden /></button>}
                        </div>
                    </motion.div>
                </div>
            ) : null}
        </AnimatePresence>
    );
};

export default YearReview;
