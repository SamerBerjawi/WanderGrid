import React, { useMemo } from 'react';
import type { Carrier, CountryResidenceStatus, Trip } from '../../../types';
import { toggleCountryResidenceStatus } from '../../../types';
import { buildRouteCorridors, getFlagEmoji, getRouteTransportSummary } from '../../../services/routeCorridor';
import { formatDate } from '../../../utils/formatters';
import { formatProperLocationName } from '../../../services/geocoding';
import { Airplane, ArrowRight, Boat, Car, CheckCircle, type Icon, Path, Ticket, Train } from '../../ui/hugeicons';
import { RpChip, RpLogo, RpSection, RpSheet } from '../ui';
import { cn } from '../../../utils/cn';
import type { LegMode, LegStatus, MapModel, MapPlace, MapRoute } from './mapModel';

export type MapSelection =
    | { kind: 'route'; route: MapRoute }
    | { kind: 'place'; place: MapPlace }
    | { kind: 'country'; code: string; name: string };

const MODE_ICON: Record<LegMode, Icon> = {
    flight: Airplane, rail: Train, road: Car, sea: Boat,
};
const MODE_LABEL: Record<LegMode, string> = { flight: 'Flight', rail: 'Train', road: 'Road', sea: 'Sea' };
const STATUS_DOT: Record<LegStatus, string> = { past: 'bg-rp-ink', upcoming: 'bg-rp-green', planning: 'bg-rp-mustard' };
const STATUS_LABEL: Record<LegStatus, string> = { past: 'Past', upcoming: 'Upcoming', planning: 'Planning' };

const COUNTRY_STATUSES: { value: CountryResidenceStatus; label: string }[] = [
    { value: 'visited', label: 'Visited' },
    { value: 'lived_current', label: 'Live here' },
    { value: 'lived_past', label: 'Lived here' },
    { value: 'layover', label: 'Layover' },
    { value: 'wishlist', label: 'Wishlist' },
];

const km = (n: number) => `${Math.round(n).toLocaleString()} km`;

const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className="flex min-w-0 flex-col">
        <span className="text-xs text-rp-muted">{label}</span>
        <span className="rp-tabular truncate text-base font-medium text-rp-ink">{value}</span>
    </div>
);

export interface MapDetailSheetProps {
    selection: MapSelection | null;
    onClose: () => void;
    onSelect: (s: MapSelection) => void;
    onTripClick?: (tripId: string) => void;
    trips: Trip[];
    model: MapModel;
    countryStatusMap: Record<string, CountryResidenceStatus[] | CountryResidenceStatus>;
    visitedCountryCodes: string[];
    onUpdateCountryStatus: (code: string, name: string, status: CountryResidenceStatus[] | 'none') => void;
    topOffset: number;
    brandfetchApiKey?: string;
    carriers?: Carrier[];
}

export const MapDetailSheet: React.FC<MapDetailSheetProps> = ({
    selection, onClose, onSelect, onTripClick, trips, model, countryStatusMap, visitedCountryCodes, onUpdateCountryStatus, topOffset,
    brandfetchApiKey, carriers,
}) => {
    const corridors = useMemo(() => (selection?.kind === 'route' ? buildRouteCorridors(trips) : null), [selection, trips]);

    if (!selection) return <RpSheet open={false} onClose={onClose} title="">{null}</RpSheet>;

    if (selection.kind === 'route') {
        const r = selection.route;
        const corridor = corridors?.get(r.corridorId);
        const summary = corridor ? getRouteTransportSummary(corridor) : null;
        const legs = [...r.legs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const dates = legs.map(l => l.date).filter(Boolean) as string[];
        const operators = Array.from(new Set(legs.map(l => l.provider?.trim()).filter(Boolean))) as string[];
        const Icon = MODE_ICON[r.mode];
        const title = `${formatProperLocationName(r.origin)} → ${formatProperLocationName(r.destination)}`;
        return (
            <RpSheet
                open
                onClose={onClose}
                topOffset={topOffset}
                title={title}
                subtitle={<span className="inline-flex items-center gap-1.5"><Icon size={14} /> {MODE_LABEL[r.mode]} · {km(r.distanceKm)}</span>}
            >
                <div className="flex flex-col gap-5">
                    {corridor ? (
                        <div className="flex items-center gap-3 rounded-rp-inset bg-rp-inset/60 px-4 py-3">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-rp-ink">{corridor.originFlag} {corridor.originCity || corridor.originName}</p>
                                <p className="truncate text-xs text-rp-muted">{corridor.originCountry}</p>
                            </div>
                            <ArrowRight size={16} className="shrink-0 text-rp-muted" />
                            <div className="min-w-0 flex-1 text-right">
                                <p className="truncate text-sm font-medium text-rp-ink">{corridor.destCity || corridor.destName} {corridor.destFlag}</p>
                                <p className="truncate text-xs text-rp-muted">{corridor.destCountry}</p>
                            </div>
                        </div>
                    ) : null}
                    <div className="grid grid-cols-3 gap-3 px-1">
                        <Stat label={summary?.activityLabel || 'Trips'} value={r.count} />
                        <Stat label="First" value={dates.length ? formatDate(dates[dates.length - 1], 'month-year') : '—'} />
                        <Stat label="Last" value={dates.length ? formatDate(dates[0], 'month-year') : '—'} />
                    </div>
                    {operators.length ? (
                        <RpSection icon={Icon} title={summary?.providerLabel || 'Operators'}>
                            <div className="flex flex-wrap gap-2 py-2">
                                {operators.map(o => (
                                    <span key={o} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-surface py-1 pr-4 pl-1 text-sm text-rp-ink">
                                        <RpLogo name={o} brandfetchApiKey={brandfetchApiKey} carriers={carriers} fallback={Icon} size="sm" className="rounded-full" />
                                        {o}
                                    </span>
                                ))}
                            </div>
                        </RpSection>
                    ) : null}
                    <RpSection icon={Ticket} title="Journeys">
                        <ul className="flex flex-col divide-y divide-rp-line">
                            {legs.map(l => (
                                <li key={l.key}>
                                    <button
                                        type="button"
                                        onClick={() => onTripClick?.(l.tripId)}
                                        className="flex min-h-14 w-full items-center gap-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-rp-muted"
                                    >
                                        <span className="relative">
                                            <RpLogo name={l.provider} brandfetchApiKey={brandfetchApiKey} carriers={carriers} fallback={Icon} />
                                            <span className={cn('absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-rp-inset', STATUS_DOT[l.status])} aria-label={STATUS_LABEL[l.status]} />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium text-rp-ink">{l.tripName.replace(/^Independent: /, '')}</span>
                                            <span className="block truncate text-xs text-rp-muted">
                                                {[l.date ? formatDate(l.date, 'medium') : null, [l.provider, l.identifier].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
                                            </span>
                                        </span>
                                        <ArrowRight size={16} className="shrink-0 text-rp-muted" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </RpSection>
                </div>
            </RpSheet>
        );
    }

    if (selection.kind === 'place') {
        const p = selection.place;
        const routes = model.routes.filter(r => r.origin === p.id || r.destination === p.id).sort((a, b) => b.count - a.count);
        return (
            <RpSheet open onClose={onClose} topOffset={topOffset} title={p.label} subtitle={`${p.kind === 'airport' ? 'Airport' : 'Place'} · ${p.count} ${p.count === 1 ? 'visit' : 'visits'}`}>
                <RpSection icon={Path} title="Routes">
                    <ul className="flex flex-col divide-y divide-rp-line">
                        {routes.map(r => {
                            const other = r.origin === p.id ? r.destination : r.origin;
                            const Icon = MODE_ICON[r.mode];
                            return (
                                <li key={r.id}>
                                    <button type="button" onClick={() => onSelect({ kind: 'route', route: r })} className="flex min-h-12 w-full items-center gap-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-rp-muted">
                                        <Icon size={16} className="shrink-0 text-rp-muted" />
                                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-rp-ink">{formatProperLocationName(other)}</span>
                                        <span className="rp-tabular text-xs text-rp-muted">{r.count}×</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </RpSection>
            </RpSheet>
        );
    }

    // Country status (scratch map)
    const { code, name } = selection;
    const raw = countryStatusMap[code] ?? countryStatusMap[name.toUpperCase()];
    const stored: CountryResidenceStatus[] = !raw ? [] : Array.isArray(raw) ? raw : [raw];
    const current = stored.length ? stored : visitedCountryCodes.includes(code) ? ['visited' as CountryResidenceStatus] : [];
    return (
        <RpSheet open onClose={onClose} topOffset={topOffset} title={`${getFlagEmoji(code)} ${name}`} subtitle={current.length ? COUNTRY_STATUSES.filter(s => current.includes(s.value)).map(s => s.label).join(' · ') : 'Not visited'}>
            <RpSection icon={CheckCircle} title="Status">
                <div className="flex flex-wrap gap-2 py-2">
                    {COUNTRY_STATUSES.map(s => (
                        <RpChip
                            key={s.value}
                            selected={current.includes(s.value)}
                            onClick={() => {
                                const next = toggleCountryResidenceStatus(current, s.value);
                                onUpdateCountryStatus(code, name, next.length ? next : 'none');
                            }}
                        >
                            {s.label}
                        </RpChip>
                    ))}
                    <RpChip selected={false} onClick={() => onUpdateCountryStatus(code, name, 'none')}>Clear</RpChip>
                </div>
            </RpSection>
        </RpSheet>
    );
};
