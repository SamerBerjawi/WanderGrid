import React from 'react';
import type { Stamp, StampAccent, StampIcon } from '../../../utils/achievements';
import { levelName, nextUp, singular, totalsOf } from '../../../utils/achievements';
import { Airplane, AirplaneTilt, Boat, Buildings, CalendarCheck, Flag, Globe, Moon, Path, Planet, Snowflake, Sun, Suitcase, Train, Trophy, type Icon } from '../../ui/hugeicons';
import { RpEmpty, RpSection, RpSheet } from '../ui';
import { cn } from '../../../utils/cn';

/**
 * Achievements: the stamps you have earned, in the look of a passport page (a dashed border, a slight tilt, a
 * round mark) and what is closest to the next level. Counted by utils/achievements.ts from the trips, flights
 * and places already in the app, never entered by hand.
 */

const ICON: Record<StampIcon, Icon> = {
    continents: Globe, countries: Flag, aircraft: AirplaneTilt, airlines: Airplane, hubs: Buildings, streak: CalendarCheck, distance: Path,
    longest: Planet, rail: Train, sea: Boat, equator: Sun, polar: Snowflake, trips: Suitcase, nights: Moon,
};

const ACCENT: Record<StampAccent, { text: string; fill: string; soft: string; border: string }> = {
    green: { text: 'text-rp-green', fill: 'bg-rp-green', soft: 'bg-rp-green/15', border: 'border-rp-green/50' },
    navy: { text: 'text-rp-navy', fill: 'bg-rp-navy', soft: 'bg-rp-navy/15', border: 'border-rp-navy/50' },
    plum: { text: 'text-rp-plum', fill: 'bg-rp-plum', soft: 'bg-rp-plum/15', border: 'border-rp-plum/50' },
    rust: { text: 'text-rp-rust', fill: 'bg-rp-rust', soft: 'bg-rp-rust/15', border: 'border-rp-rust/50' },
    sea: { text: 'text-rp-sea', fill: 'bg-rp-sea', soft: 'bg-rp-sea/15', border: 'border-rp-sea/50' },
    ochre: { text: 'text-rp-ochre', fill: 'bg-rp-ochre', soft: 'bg-rp-ochre/15', border: 'border-rp-ochre/50' },
};

const n = (v: number) => v.toLocaleString('en-US');

const Bar: React.FC<{ stamp: Stamp }> = ({ stamp }) => (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-rp-line" aria-hidden>
        <span className={cn('block h-full rounded-full', ACCENT[stamp.accent].fill)} style={{ width: `${Math.round(stamp.progress * 100)}%` }} />
    </span>
);

const describe = (s: Stamp): string => `${s.title}: ${s.level > 0 ? `level ${s.level} of ${s.tiers.length}` : 'not earned yet'}. ${n(s.value)} ${s.counts}${s.next !== null ? `; ${n(s.next - s.value)} more for the next level` : '; the top level'}.`;

const StampCard: React.FC<{ stamp: Stamp; index: number }> = ({ stamp, index }) => {
    const a = ACCENT[stamp.accent];
    const IconC = ICON[stamp.icon];
    const earned = stamp.level > 0;
    return (
        <li
            aria-label={describe(stamp)}
            className={cn(
                'flex flex-col gap-2.5 rounded-rp-tile border-2 border-dashed p-3.5 transition-transform duration-200',
                earned ? cn(a.border, 'bg-rp-surface') : 'border-rp-line bg-rp-inset/50',
                earned && (index % 2 === 0 ? '-rotate-[0.8deg]' : 'rotate-[0.8deg]')
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-full', earned ? cn(a.soft, a.text) : 'bg-rp-inset text-rp-muted')} aria-hidden>
                    <IconC size={22} />
                </span>
                <span className={cn('rounded-full px-2 py-0.5 text-2xs font-semibold', earned ? cn(a.soft, a.text) : 'bg-rp-inset text-rp-muted')} aria-hidden>
                    {earned ? levelName(stamp.level) : 'Not yet'}
                </span>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5" aria-hidden>
                <span className="text-sm font-medium leading-tight text-rp-ink">{stamp.title}</span>
                <span className={cn('rp-tabular text-lg font-semibold leading-tight', earned ? a.text : 'text-rp-muted')}>{n(stamp.value)} <span className="text-xs font-normal text-rp-muted">{stamp.value === 1 ? singular(stamp.unit) : stamp.unit}</span></span>
            </div>
            <div className="flex flex-col gap-1" aria-hidden>
                <Bar stamp={stamp} />
                <span className="rp-tabular text-2xs text-rp-muted">{stamp.next !== null ? `${n(stamp.next - stamp.value)} to level ${levelName(stamp.level + 1)}` : 'Top level'}</span>
            </div>
        </li>
    );
};

export const AchievementsSheet: React.FC<{ open: boolean; onClose: () => void; stamps: Stamp[]; loading: boolean; failed: boolean }> = ({ open, onClose, stamps, loading, failed }) => {
    const totals = totalsOf(stamps);
    const up = nextUp(stamps, 3);
    // Earned stamps first (highest level first), then the ones still to earn.
    const ordered = [...stamps].sort((x, y) => y.level - x.level || y.progress - x.progress);
    return (
        <RpSheet open={open} onClose={onClose} title="Achievements" subtitle={stamps.length ? `${totals.earned} of ${totals.possible} levels earned` : undefined} width={460}>
            {loading ? <p className="py-8 text-center text-sm text-rp-muted" aria-busy="true">Counting your stamps...</p> : failed ? (
                <RpEmpty title="Couldn't count your stamps">Check your connection and open this again.</RpEmpty>
            ) : stamps.length === 0 ? null : (
                <div className="flex flex-col gap-5">
                    <div className="flex items-center gap-4 rounded-rp-tile bg-rp-inset px-4 py-3">
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-rp-mustard text-rp-on-mustard" aria-hidden><Trophy size={24} /></span>
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <p className="text-sm text-rp-ink"><span className="rp-tabular text-xl font-semibold">{totals.stampsWithLevel}</span> of {stamps.length} stamps started</p>
                            <span className="block h-1.5 w-full overflow-hidden rounded-full bg-rp-line" role="progressbar" aria-label="Levels earned" aria-valuemin={0} aria-valuemax={totals.possible} aria-valuenow={totals.earned}>
                                <span className="block h-full rounded-full bg-rp-mustard" style={{ width: `${totals.possible ? Math.round((totals.earned / totals.possible) * 100) : 0}%` }} />
                            </span>
                        </div>
                    </div>

                    {up.length ? (
                        <RpSection title="Next up" icon={Trophy}>
                            <ul className="flex flex-col py-1">
                                {up.map(s => {
                                    const a = ACCENT[s.accent];
                                    const IconC = ICON[s.icon];
                                    return (
                                        <li key={s.id} className="flex min-h-14 items-center gap-3 border-t border-rp-line py-2 first:border-t-0">
                                            <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', a.soft, a.text)} aria-hidden><IconC size={18} /></span>
                                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                                                <span className="flex items-baseline justify-between gap-2">
                                                    <span className="truncate text-sm font-medium text-rp-ink">{s.title}</span>
                                                    <span className="rp-tabular shrink-0 text-xs text-rp-muted">{n(s.value)} of {n(s.next as number)}</span>
                                                </span>
                                                <Bar stamp={s} />
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </RpSection>
                    ) : null}

                    <RpSection title="Stamps" icon={Flag}>
                        <ul className="grid grid-cols-2 gap-3 py-2" aria-label="Stamps">
                            {ordered.map((s, i) => <StampCard key={s.id} stamp={s} index={i} />)}
                        </ul>
                    </RpSection>
                </div>
            )}
        </RpSheet>
    );
};
