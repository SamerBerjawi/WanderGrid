import React, { useMemo } from 'react';
import type { Trip, User } from '../../../types';
import ThrowDeck, { type DeckCard, type DeckSpec } from '../../kokonutui/throw-deck';
import { bucketOf, destinationsOf, todayISO, tripDays } from '../../../utils/tripsModel';
import { formatCurrency, formatDate, formatDateRange } from '../../../utils/formatters';
import {
    Airplane, ArrowUpRight, Bed, Boat, Bus, Car, CarProfile, CalendarBlank, PencilSimple, Receipt, Suitcase, Train, type Icon,
} from '../../ui/hugeicons';
import { RpHugeicon } from '../RpHugeicon';
import { RpLogo, RpSheet } from '../ui';
import { BUCKET_LABEL } from './TripCard';
import { cn } from '../../../utils/cn';

/**
 * The trip's details: a Throw Deck with one card for the trip, one per transport leg, one per stay and
 * one per activity (logos, dates, confirmation codes, costs), and the same items as a list below.
 * Tapping a card opens its full details. "Open trip" goes to the trip's own page.
 */

const MODE_ICON: Record<string, Icon> = {
    Flight: Airplane, Train, Bus, 'Car Rental': Car, 'Personal Car': CarProfile, Cruise: Boat, Ferry: Boat,
};

const when = (date?: string, time?: string) => (date ? [formatDate(date, 'short'), time].filter(Boolean).join(' ') : '');
const money = (n?: number) => (n != null && n > 0 ? formatCurrency(n) : undefined);
const specs = (list: [string, string | undefined][]): DeckSpec[] =>
    list.filter((s): s is [string, string] => Boolean(s[1])).slice(0, 6).map(([label, value]) => ({ label, value }));

const nights = (a?: string, b?: string) => {
    if (!a || !b) return undefined;
    const n = Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
    return n > 0 ? `${n} ${n === 1 ? 'night' : 'nights'}` : undefined;
};

const ArtFrame: React.FC<{ tone: string; children: React.ReactNode }> = ({ tone, children }) => (
    <span aria-hidden className={cn('flex h-full w-full flex-col items-center justify-center gap-3 px-4 text-center', tone)}>{children}</span>
);

const BigLogo: React.FC<{ name?: string; brandfetchApiKey?: string; fallback: Icon }> = ({ name, brandfetchApiKey, fallback }) => (
    <RpLogo name={name} brandfetchApiKey={brandfetchApiKey} fallback={fallback} className="size-16 rounded-2xl" />
);

export const TripDetailsSheet: React.FC<{
    trip: Trip | null;
    users: User[];
    brandfetchApiKey?: string;
    onClose: () => void;
    onEdit: (trip: Trip) => void;
    onOpenTrip: (trip: Trip) => void;
}> = ({ trip, users, brandfetchApiKey, onClose, onEdit, onOpenTrip }) => {
    const today = todayISO();

    const model = useMemo(() => {
        if (!trip) return null;
        const bucket = bucketOf(trip, today);
        const transports = [...(trip.transports || [])].sort((a, b) => `${a.departureDate}${a.departureTime}`.localeCompare(`${b.departureDate}${b.departureTime}`));
        const stays = [...(trip.accommodations || [])].sort((a, b) => (a.checkInDate || '').localeCompare(b.checkInDate || ''));
        const activities = [...(trip.activities || [])].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
        const total = [...transports, ...stays, ...activities].reduce((sum, i) => sum + (i.cost || 0), 0);
        const members = (trip.participants || []).map(id => users.find(u => u.id === id)?.name).filter(Boolean) as string[];
        return { bucket, transports, stays, activities, total, members };
    }, [trip, users, today]);

    const cards = useMemo<DeckCard[]>(() => {
        if (!trip || !model) return [];
        const { bucket, transports, stays, activities, total, members } = model;
        const days = tripDays(trip);
        const tone = bucket === 'planned' ? 'bg-rp-mustard text-rp-on-mustard' : bucket === 'confirmed' ? 'bg-rp-green text-rp-paper' : 'bg-rp-inset text-rp-ink';
        const out: DeckCard[] = [{
            id: `trip:${trip.id}`,
            title: trip.name,
            subtitle: [destinationsOf(trip).join(' · '), trip.startDate ? formatDateRange(trip.startDate, trip.endDate || trip.startDate) : ''].filter(Boolean).join(' · ') || BUCKET_LABEL[bucket],
            art: (
                <ArtFrame tone={tone}>
                    <RpHugeicon name={trip.hugeicon} size={56} strokeWidth={1.25} fallback={<Suitcase size={56} strokeWidth={1.25} aria-hidden />} />
                    <span className="text-lg font-medium leading-tight">{BUCKET_LABEL[bucket]}</span>
                </ArtFrame>
            ),
            description: trip.notes || trip.description || undefined,
            price: money(total),
            specs: specs([
                ['Status', BUCKET_LABEL[bucket]],
                ['Length', days > 0 ? `${days} ${days === 1 ? 'day' : 'days'}` : undefined],
                ['Members', members.length ? (members.length > 2 ? `${members.length} people` : members.join(', ')) : undefined],
                ['Transport', transports.length ? String(transports.length) : undefined],
                ['Stays', stays.length ? String(stays.length) : undefined],
                ['Activities', activities.length ? String(activities.length) : undefined],
            ]),
        }];

        transports.forEach(t => {
            const Mode = MODE_ICON[t.mode] || Airplane;
            out.push({
                id: `transport:${t.id}`,
                title: `${t.origin} → ${t.destination}`,
                subtitle: [t.provider, t.identifier, when(t.departureDate)].filter(Boolean).join(' · ') || t.mode,
                art: (
                    <ArtFrame tone="bg-rp-inset text-rp-ink">
                        <BigLogo name={t.provider} brandfetchApiKey={brandfetchApiKey} fallback={Mode} />
                        <span className="rp-tabular text-lg font-medium leading-tight">{t.origin} → {t.destination}</span>
                    </ArtFrame>
                ),
                price: money(t.cost),
                specs: specs([
                    ['Departs', when(t.departureDate, t.departureTime)],
                    ['Arrives', when(t.arrivalDate, t.arrivalTime)],
                    ['Number', t.identifier],
                    ['Confirmation', t.confirmationCode],
                    ['Class', t.travelClass],
                    ['Seat', t.seatNumber],
                ]),
                description: t.notes,
            });
        });

        stays.forEach(a => {
            out.push({
                id: `stay:${a.id}`,
                title: a.name,
                subtitle: [a.type, a.address].filter(Boolean).join(' · '),
                art: (
                    <ArtFrame tone="bg-rp-inset text-rp-ink">
                        <BigLogo name={a.name} brandfetchApiKey={brandfetchApiKey} fallback={Bed} />
                        <span className="text-lg font-medium leading-tight">{a.name}</span>
                    </ArtFrame>
                ),
                price: money(a.cost),
                specs: specs([
                    ['Check-in', when(a.checkInDate, a.checkInTime)],
                    ['Check-out', when(a.checkOutDate, a.checkOutTime)],
                    ['Length', nights(a.checkInDate, a.checkOutDate)],
                    ['Type', a.type],
                    ['Confirmation', a.confirmationCode],
                ]),
                description: a.notes,
            });
        });

        activities.forEach(a => {
            out.push({
                id: `activity:${a.id}`,
                title: a.title,
                subtitle: [a.type, a.location].filter(Boolean).join(' · ') || 'Activity',
                art: (
                    <ArtFrame tone="bg-rp-inset text-rp-ink">
                        <CalendarBlank size={48} strokeWidth={1.25} aria-hidden />
                        <span className="text-lg font-medium leading-tight">{a.title}</span>
                    </ArtFrame>
                ),
                price: money(a.cost),
                specs: specs([['When', when(a.date, a.time)], ['Where', a.location]]),
                description: a.description,
            });
        });
        return out;
    }, [trip, model, brandfetchApiKey]);

    if (!trip || !model) return <RpSheet open={false} onClose={onClose} title="">{null}</RpSheet>;
    const { transports, stays, activities, total } = model;
    const empty = transports.length === 0 && stays.length === 0 && activities.length === 0;

    return (
        <RpSheet
            open
            onClose={onClose}
            title={trip.name}
            subtitle={[BUCKET_LABEL[model.bucket], trip.startDate ? formatDateRange(trip.startDate, trip.endDate || trip.startDate) : ''].filter(Boolean).join(' · ')}
            width={460}
            footer={
                <>
                    <button type="button" onClick={() => onEdit(trip)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-inset px-5 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">
                        <PencilSimple size={16} aria-hidden /> Edit
                    </button>
                    <button type="button" onClick={() => onOpenTrip(trip)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink outline-none hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted">
                        Open trip <ArrowUpRight size={16} aria-hidden />
                    </button>
                </>
            }
        >
            <div className="-mx-2">
                <ThrowDeck
                    key={cards.map(c => c.id).join('|')}
                    cards={cards}
                    label="Trip details. Drag the top card away, or use the arrow keys, to see the next one. Press Enter to open it."
                    actionLabel="Open trip"
                    onAction={() => onOpenTrip(trip)}
                    className="min-h-[31rem] py-2"
                />
            </div>

            {empty ? (
                <p className="mt-2 text-center text-sm text-rp-muted">No transport or stays yet. Add them on the trip's page.</p>
            ) : (
                <div className="mt-4 flex flex-col gap-5">
                    {transports.length > 0 ? (
                        <ItemList title="Transport" icon={Airplane}>
                            {transports.map(t => {
                                const Mode = MODE_ICON[t.mode] || Airplane;
                                return (
                                    <Item
                                        key={t.id}
                                        logo={<RpLogo name={t.provider} brandfetchApiKey={brandfetchApiKey} fallback={Mode} />}
                                        title={`${t.origin} → ${t.destination}`}
                                        meta={[t.provider, t.identifier, when(t.departureDate, t.departureTime), t.confirmationCode ? `Ref ${t.confirmationCode}` : ''].filter(Boolean).join(' · ')}
                                        cost={money(t.cost)}
                                    />
                                );
                            })}
                        </ItemList>
                    ) : null}
                    {stays.length > 0 ? (
                        <ItemList title="Stays" icon={Bed}>
                            {stays.map(a => (
                                <Item
                                    key={a.id}
                                    logo={<RpLogo name={a.name} brandfetchApiKey={brandfetchApiKey} fallback={Bed} />}
                                    title={a.name}
                                    meta={[a.type, a.checkInDate && a.checkOutDate ? `${formatDate(a.checkInDate, 'short')} – ${formatDate(a.checkOutDate, 'short')}` : '', nights(a.checkInDate, a.checkOutDate), a.confirmationCode ? `Ref ${a.confirmationCode}` : ''].filter(Boolean).join(' · ')}
                                    cost={money(a.cost)}
                                />
                            ))}
                        </ItemList>
                    ) : null}
                    {activities.length > 0 ? (
                        <ItemList title="Activities" icon={CalendarBlank}>
                            {activities.map(a => (
                                <Item
                                    key={a.id}
                                    logo={<span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-rp-inset"><CalendarBlank size={16} className="text-rp-muted" aria-hidden /></span>}
                                    title={a.title}
                                    meta={[when(a.date, a.time), a.location].filter(Boolean).join(' · ')}
                                    cost={money(a.cost)}
                                />
                            ))}
                        </ItemList>
                    ) : null}
                    {total > 0 ? (
                        <div className="flex items-center justify-between rounded-rp-inset bg-rp-inset px-4 py-3">
                            <span className="flex items-center gap-2 text-sm text-rp-muted"><Receipt size={16} aria-hidden /> Total cost</span>
                            <span className="rp-tabular text-base font-semibold text-rp-ink">{formatCurrency(total)}</span>
                        </div>
                    ) : null}
                </div>
            )}
        </RpSheet>
    );
};

const ItemList: React.FC<{ title: string; icon: Icon; children: React.ReactNode }> = ({ title, icon: IconC, children }) => (
    <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-1.5 px-1 text-xs font-medium text-rp-muted"><IconC size={14} aria-hidden /> {title}</h3>
        <ul className="flex flex-col gap-2">{children}</ul>
    </section>
);

const Item: React.FC<{ logo: React.ReactNode; title: string; meta: string; cost?: string }> = ({ logo, title, meta, cost }) => (
    <li className="flex items-center gap-3 rounded-rp-inset bg-rp-inset/60 px-3 py-2.5">
        {logo}
        <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-rp-ink">{title}</span>
            {meta ? <span className="block truncate text-xs text-rp-muted">{meta}</span> : null}
        </span>
        {cost ? <span className="rp-tabular shrink-0 text-sm font-medium text-rp-ink">{cost}</span> : null}
    </li>
);
