import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { StepNews } from '../../../utils/mapReplay';
import { getFlagEmoji } from '../../../services/geoData';
import { formatDate } from '../../../utils/formatters';
import { Airplane, Flag, Globe, MapPin, Sparkle, Suitcase, Train, type Icon } from '../../ui/hugeicons';
import { cn } from '../../../utils/cn';

/**
 * The card that follows the replay: the date, each route that appeared (its airline and distance), and what it
 * brought for the first time: a country, a place, an airline, or a milestone. It is a caption, never a control,
 * so it ignores the pointer, and a screen reader hears it as a polite update.
 */

const Tag: React.FC<{ icon: Icon; children: React.ReactNode; tone?: 'new' | 'milestone' }> = ({ icon: Icon, children, tone = 'new' }) => (
    <span className={cn('inline-flex min-h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium', tone === 'milestone' ? 'bg-rp-mustard text-rp-on-mustard' : 'bg-rp-inset text-rp-ink')}>
        <Icon size={12} aria-hidden /> {children}
    </span>
);

const km = (n: number) => `${n.toLocaleString('en-US')} km`;

export const ReplayCaption: React.FC<{ news: StepNews | null; className?: string }> = ({ news, className }) => {
    const calm = useReducedMotion();
    const routes = news?.routes.slice(0, 3) ?? [];
    const more = news ? news.routes.length - routes.length : 0;
    return (
        <div className={cn('pointer-events-none flex justify-center px-3', className)} aria-live="polite">
            <AnimatePresence mode="popLayout">
                {news ? (
                    <motion.section
                        key={news.date}
                        aria-label={`Trip on ${formatDate(news.date, 'short-with-year')}`}
                        initial={calm ? false : { opacity: 0, y: -10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={calm ? { opacity: 0 } : { opacity: 0, y: -6 }}
                        transition={{ duration: calm ? 0 : 0.28, ease: 'easeOut' }}
                        className="flex w-[min(26rem,100%)] flex-col gap-2 rounded-rp-tile bg-rp-surface/95 p-3 text-rp-ink rp-shadow-float"
                    >
                        <p className="rp-tabular text-xs font-medium uppercase tracking-wide text-rp-muted">{formatDate(news.date, 'weekday-long')}</p>
                        <ul className="flex flex-col gap-1">
                            {routes.map(r => {
                                const Icon = r.mode === 'flight' ? Airplane : r.mode === 'rail' ? Train : Suitcase;
                                return (
                                    <li key={r.id} className="flex items-center gap-2 text-sm">
                                        <Icon size={16} className="shrink-0 text-rp-rust" aria-hidden />
                                        <span className="min-w-0 flex-1 truncate"><span className="rp-tabular font-semibold">{r.from} → {r.to}</span>{r.airlines.length ? <span className="text-rp-muted"> · {r.airlines.slice(0, 2).join(', ')}</span> : null}</span>
                                        <span className="rp-tabular shrink-0 text-xs text-rp-muted">{km(r.km)}</span>
                                    </li>
                                );
                            })}
                            {more > 0 ? <li className="text-xs text-rp-muted">and {more} more {more === 1 ? 'route' : 'routes'}</li> : null}
                        </ul>
                        {news.newCountries.length || news.newPlaces.length || news.newAirlines.length || news.milestones.length ? (
                            <div className="flex flex-wrap gap-1.5">
                                {news.milestones.map(m => <Tag key={m} icon={Sparkle} tone="milestone">{m}</Tag>)}
                                {news.newCountries.map(c => <Tag key={c.code} icon={Flag}><span aria-hidden>{getFlagEmoji(c.code)}</span> New country: {c.name}</Tag>)}
                                {news.newPlaces.slice(0, 3).map(p => <Tag key={p} icon={MapPin}>New: {p}</Tag>)}
                                {news.newPlaces.length > 3 ? <Tag icon={Globe}>+{news.newPlaces.length - 3} places</Tag> : null}
                                {news.newAirlines.map(a => <Tag key={a} icon={Airplane}>New airline: {a}</Tag>)}
                            </div>
                        ) : null}
                    </motion.section>
                ) : null}
            </AnimatePresence>
        </div>
    );
};
