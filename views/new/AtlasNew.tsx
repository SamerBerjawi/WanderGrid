import React, { useEffect, useMemo, useState } from 'react';
import type { VisitedItem } from '../../types';
import { useAtlasData } from '../../hooks/useAtlasData';
import { groupByRegion, regionOf, resolveCityText } from '../../utils/atlasModel';
import { normalizeCountryCode } from '../../services/countryRegistry';
import { toast } from '../../services/toast';
import { formatDate } from '../../utils/formatters';
import ScrollIndex from '../../components/kokonutui/scroll-index';
import SwipeTabs from '../../components/kokonutui/swipe-tabs';
import MomentumRail from '../../components/kokonutui/momentum-rail';
import MorphPopover from '../../components/kokonutui/morph-popover';
import ParticleButton from '../../components/kokonutui/particle-button';
import { RpEmpty } from '../../components/new/ui';
import { AtlasMap } from '../../components/new/atlas/AtlasMap';
import { CityTile, CountryTile, FlagArt, RegionHeading, RpChipLabel, RpKpi } from '../../components/new/atlas/AtlasParts';
import { AddCountrySheet, CitySheet, CountrySheet, ScanSheet, type CountryTarget } from '../../components/new/atlas/AtlasSheets';
import { WishlistPanel } from '../../components/new/atlas/WishlistPanel';
import { toneOf, type AtlasTone } from '../../components/new/atlas/atlasStatus';
import { openNewPage } from '../../components/new/devLinks';
import {
    Airplane, ArrowUpRight, Buildings, Globe, Heart, MagnifyingGlass, Plus, Sparkle, Stack, X,
} from '../../components/ui/hugeicons';
import { cn } from '../../utils/cn';

/**
 * AtlasNew (UI_UX_DESIGN_REFERENCE.md §5.0): the redesigned Atlas at /atlas-new. Features come from
 * the data layer (useAtlasData: visited records, derived cities, the history scan); the layout is new:
 * KPIs, a BklitUI world map, a recently visited rail, Swipe Tabs for the lists, a Throw Deck for the
 * wishlist, and sheets for every edit.
 */

interface AtlasNewProps {
    /** Kept for migration: same props as the original Atlas. */
    onTripClick?: (tripId: string) => void;
}

type Tab = 'countries' | 'cities' | 'layovers' | 'wishlist';
const TAB_KEY = 'wandergrid_atlas_new_tab';
const SCANNED_KEY = 'wandergrid_atlas_new_autoscan';

const readTab = (): Tab => {
    try {
        const v = localStorage.getItem(TAB_KEY);
        return v === 'cities' || v === 'layovers' || v === 'wishlist' ? v : 'countries';
    } catch { return 'countries'; }
};

const PILL = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-canvas active:scale-[0.97]';

const matches = (q: string, ...parts: (string | undefined)[]) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    return parts.some(p => p?.toLowerCase().includes(needle));
};

export const AtlasNew: React.FC<AtlasNewProps> = () => {
    const data = useAtlasData();
    const [tab, setTab] = useState<Tab>(readTab);
    const [query, setQuery] = useState('');
    const [countryTarget, setCountryTarget] = useState<CountryTarget | null>(null);
    const [city, setCity] = useState<VisitedItem | null>(null);
    const [adding, setAdding] = useState<'visited' | 'wishlist' | null>(null);
    const [scanOpen, setScanOpen] = useState(false);

    const changeTab = (next: Tab) => {
        setTab(next);
        try { localStorage.setItem(TAB_KEY, next); } catch { /* storage unavailable */ }
    };

    // An empty atlas with travel history: offer the scan once per session.
    useEffect(() => {
        if (data.loading || data.visited.length > 0 || !data.hasHistory) return;
        try {
            if (sessionStorage.getItem(SCANNED_KEY)) return;
            sessionStorage.setItem(SCANNED_KEY, '1');
        } catch { /* storage unavailable */ }
        setScanOpen(true);
    }, [data.loading, data.visited.length, data.hasHistory]);

    const tones = useMemo(() => {
        const out: Record<string, AtlasTone> = {};
        data.countries.forEach(c => { out[normalizeCountryCode(c.code)] = toneOf(c); });
        return out;
    }, [data.countries]);
    const toneCounts = useMemo(() => {
        const out: Record<AtlasTone, number> = { visited: 0, lived: 0, wishlist: 0, layover: 0 };
        Object.values(tones).forEach(t => { out[t] += 1; });
        return out;
    }, [tones]);
    const known = useMemo(() => new Set(data.countries.map(c => normalizeCountryCode(c.code))), [data.countries]);

    const recent = useMemo(
        () => [...data.visitedCountries]
            .filter(c => c.visitDate)
            .sort((a, b) => (b.visitDate || '').localeCompare(a.visitDate || ''))
            .slice(0, 12),
        [data.visitedCountries]
    );

    const openCountry = (code: string, name: string, initialStatuses?: CountryTarget['initialStatuses']) => {
        const norm = normalizeCountryCode(code);
        const item = data.countries.find(c => normalizeCountryCode(c.code) === norm)
            // The map has one UK shape; open the first UK nation on record.
            || (norm === 'GB' ? data.countries.find(c => normalizeCountryCode(c.code).startsWith('GB-')) : undefined);
        setCountryTarget(item ? { item, code: item.code, name: item.name } : { code: norm, name, initialStatuses });
    };
    const openItem = (item: VisitedItem) => setCountryTarget({ item, code: item.code, name: item.name });

    const filteredCountries = (list: VisitedItem[]) => list.filter(c => matches(query, c.name, c.code, regionOf(c.code)));
    const visibleCities = useMemo(
        () => data.cities.filter(c => matches(query, c.name, c.countryName, c.countryCode)),
        [data.cities, query]
    );

    const tabItems = [
        { id: 'countries', title: 'Countries', icon: Globe, badge: <TabCount n={data.visitedCountries.length} /> },
        { id: 'cities', title: 'Cities', icon: Buildings, badge: <TabCount n={data.cities.length} /> },
        { id: 'layovers', title: 'Layovers', icon: Airplane, badge: <TabCount n={data.layovers.length} /> },
        { id: 'wishlist', title: 'Wishlist', icon: Heart, badge: <TabCount n={data.wishlist.length} /> },
    ];

    const addCity = async (text: string) => {
        const draft = await resolveCityText(text);
        if (!draft) {
            toast.error(`Couldn't find "${text}". Try the city and country, like "Porto, Portugal".`);
            throw new Error('not found');
        }
        await data.saveCity(draft);
    };

    return (
        <div className="h-full">
            <ScrollIndex
                scroller="self"
                selector="[data-atlas-index]"
                className="h-full rounded-none border-0 bg-transparent"
                contentClassName="px-3 pt-2 pb-32 sm:px-6 md:pb-16 lg:pr-20"
                railClassName="hidden lg:flex"
            >
                <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6">
                    {/* Header: title and KPIs */}
                    <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <h1 className="text-[2.25rem] font-medium leading-[1.05] tracking-tight text-rp-ink sm:text-[2.5rem]">
                            Travel<br />atlas
                        </h1>
                        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-3 lg:flex lg:gap-8">
                            <RpKpi
                                icon={Globe}
                                value={data.visitedCountries.length}
                                label="Countries visited"
                                chip={data.visitedCountries.length > 0 ? <RpChipLabel>{data.worldShare}% of the world</RpChipLabel> : undefined}
                            />
                            <RpKpi icon={Buildings} value={data.cities.length} label={data.cityCountryCount > 0 ? `Cities in ${data.cityCountryCount} ${data.cityCountryCount === 1 ? 'country' : 'countries'}` : 'Cities'} />
                            <RpKpi icon={Heart} value={data.wishlist.length} label="On the wishlist" />
                        </div>
                    </header>

                    {data.error ? (
                        <div className="rounded-rp-card bg-rp-surface rp-shadow-rest">
                            <RpEmpty title="Couldn't load your atlas" action={<button type="button" className={cn(PILL, 'bg-rp-ink text-rp-on-ink')} onClick={() => void data.reload()}>Try again</button>}>
                                {data.error}
                            </RpEmpty>
                        </div>
                    ) : null}

                    {data.cleanup.count > 0 ? (
                        <div className="flex flex-col gap-3 rounded-rp-tile bg-rp-mustard/25 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                                <Stack size={18} className="shrink-0 text-rp-ink" aria-hidden />
                                <p className="text-sm text-rp-ink">
                                    {data.cleanup.count} duplicate {data.cleanup.count === 1 ? 'record' : 'records'} found. Merge them so every page shows each place once.
                                </p>
                            </div>
                            <ParticleButton onClick={() => data.mergeDuplicates()} pendingLabel="Merging" successLabel="Merged" errorLabel="Try again" className="self-start sm:self-auto">
                                Merge
                            </ParticleButton>
                        </div>
                    ) : null}

                    {/* World map */}
                    <section aria-labelledby="atlas-world" className="rounded-rp-card bg-rp-surface p-4 rp-shadow-rest sm:p-6">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <h2 id="atlas-world" className="text-base font-medium text-rp-ink">World</h2>
                                <p className="text-xs text-rp-muted">Tap a country to open it or add it.</p>
                            </div>
                            <button type="button" onClick={() => openNewPage('/map-new')} className={cn(PILL, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}>
                                Open in map <ArrowUpRight size={16} aria-hidden />
                            </button>
                        </div>
                        <AtlasMap tones={tones} counts={toneCounts} onCountryClick={(code, name) => openCountry(code, name)} />
                    </section>

                    {/* Recently visited */}
                    {recent.length >= 3 ? (
                        <section className="rounded-rp-card bg-rp-surface py-3 rp-shadow-rest">
                            <MomentumRail
                                title="Recently visited"
                                items={recent.map(c => ({
                                    id: c.id,
                                    title: c.name,
                                    location: regionOf(c.code),
                                    meta: c.visitDate ? formatDate(c.visitDate, 'month-year') : undefined,
                                    art: <FlagArt code={c.code} tone={toneOf(c)} />,
                                }))}
                                onSelect={railItem => { const item = data.countries.find(c => c.id === railItem.id); if (item) openItem(item); }}
                            />
                        </section>
                    ) : null}

                    {/* Lists */}
                    <section aria-label="Your places" className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="-m-3 overflow-x-auto p-3 [scrollbar-width:none]">
                                <SwipeTabs
                                    items={tabItems}
                                    value={tab}
                                    onChange={id => changeTab(id as Tab)}
                                    panels={false}
                                    label="Lists"
                                    className="w-auto"
                                    listClassName="bg-rp-surface rp-shadow-soft"
                                />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <label className="relative flex min-w-0 flex-1 items-center lg:w-64 lg:flex-none">
                                    <span className="sr-only">Search places</span>
                                    <MagnifyingGlass size={16} className="pointer-events-none absolute left-4 text-rp-muted" aria-hidden />
                                    <input
                                        type="search"
                                        value={query}
                                        onChange={e => setQuery(e.target.value)}
                                        placeholder="Search places"
                                        className="min-h-11 w-full rounded-full bg-rp-surface pr-10 pl-10 text-sm text-rp-ink outline-none rp-shadow-soft placeholder:text-rp-muted focus-visible:ring-2 focus-visible:ring-rp-muted [&::-webkit-search-cancel-button]:hidden"
                                    />
                                    {query ? (
                                        <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-0 flex size-11 items-center justify-center rounded-full text-rp-muted hover:text-rp-ink">
                                            <X size={16} />
                                        </button>
                                    ) : null}
                                </label>
                                <button type="button" onClick={() => setScanOpen(true)} className={cn(PILL, 'bg-rp-surface text-rp-ink rp-shadow-soft hover:bg-rp-inset')} disabled={!data.hasHistory} title={data.hasHistory ? undefined : 'Log a trip or flight first'}>
                                    <Sparkle size={16} aria-hidden /> Find in trips
                                </button>
                                {tab === 'cities' ? (
                                    <MorphPopover
                                        label="Add city"
                                        icon={<Plus size={16} />}
                                        placeholder="City, country"
                                        multiline={false}
                                        submitLabel="Add"
                                        pendingLabel="Adding"
                                        sentLabel="Added"
                                        footerHint="We'll find it on the map."
                                        align="end"
                                        width={320}
                                        onSubmit={addCity}
                                    />
                                ) : (
                                    <button type="button" onClick={() => setAdding(tab === 'wishlist' ? 'wishlist' : 'visited')} className={cn(PILL, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}>
                                        <Plus size={16} aria-hidden /> {tab === 'wishlist' ? 'Add to wishlist' : 'Add country'}
                                    </button>
                                )}
                            </div>
                        </div>

                        {data.loading ? (
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
                                {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-16 animate-pulse rounded-rp-tile bg-rp-surface/70" />)}
                            </div>
                        ) : tab === 'countries' ? (
                            <CountryGroups
                                items={filteredCountries(data.visitedCountries)}
                                onOpen={openItem}
                                empty={query
                                    ? <RpEmpty title="No countries match">Try another name.</RpEmpty>
                                    : <RpEmpty title="No countries yet" action={<EmptyActions hasHistory={data.hasHistory} onScan={() => setScanOpen(true)} onAdd={() => setAdding('visited')} />}>Add the countries you've been to, or find them in your trips.</RpEmpty>}
                            />
                        ) : tab === 'layovers' ? (
                            <CountryGroups
                                items={filteredCountries(data.layovers)}
                                onOpen={openItem}
                                empty={<RpEmpty title={query ? 'No layovers match' : 'No layovers'}>{query ? 'Try another name.' : 'Countries you only passed through appear here.'}</RpEmpty>}
                            />
                        ) : tab === 'wishlist' ? (
                            filteredCountries(data.wishlist).length > 0 ? (
                                <WishlistPanel items={filteredCountries(data.wishlist)} onOpen={openItem} onPromote={item => void data.promote(item)} />
                            ) : (
                                <EmptyCard>
                                    <RpEmpty
                                        title={query ? 'Nothing on the wishlist matches' : 'Your wishlist is empty'}
                                        action={query ? undefined : <button type="button" onClick={() => setAdding('wishlist')} className={cn(PILL, 'bg-rp-ink text-rp-on-ink')}><Plus size={16} aria-hidden /> Add to wishlist</button>}
                                    >
                                        {query ? 'Try another name.' : 'Keep a list of the countries you want to see next.'}
                                    </RpEmpty>
                                </EmptyCard>
                            )
                        ) : (
                            <CityGroups
                                items={visibleCities}
                                storedIds={data.storedIds}
                                onOpen={setCity}
                                empty={<RpEmpty title={query ? 'No cities match' : 'No cities yet'}>{query ? 'Try another name.' : 'Cities from your trips and flights appear here, and you can add your own.'}</RpEmpty>}
                            />
                        )}
                    </section>
                </div>
            </ScrollIndex>

            <CountrySheet target={countryTarget} onClose={() => setCountryTarget(null)} data={data} />
            <CitySheet city={city} onClose={() => setCity(null)} data={data} />
            <AddCountrySheet
                open={adding !== null}
                onClose={() => setAdding(null)}
                known={known}
                onPick={(code, name) => {
                    const statuses = adding === 'wishlist' ? (['wishlist'] as const) : (['visited'] as const);
                    setAdding(null);
                    openCountry(code, name, [...statuses]);
                }}
            />
            <ScanSheet open={scanOpen} onClose={() => setScanOpen(false)} data={data} />
        </div>
    );
};

const TabCount: React.FC<{ n: number }> = ({ n }) => <span className="rp-tabular text-xs opacity-70">{n}</span>;

const EmptyCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="rounded-rp-card bg-rp-surface rp-shadow-rest">{children}</div>
);

const EmptyActions: React.FC<{ hasHistory: boolean; onScan: () => void; onAdd: () => void }> = ({ hasHistory, onScan, onAdd }) => (
    <div className="flex flex-wrap justify-center gap-2">
        {hasHistory ? <button type="button" onClick={onScan} className={cn(PILL, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}><Sparkle size={16} aria-hidden /> Find in trips</button> : null}
        <button type="button" onClick={onAdd} className={cn(PILL, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}><Plus size={16} aria-hidden /> Add country</button>
    </div>
);

const CountryGroups: React.FC<{ items: VisitedItem[]; onOpen: (item: VisitedItem) => void; empty: React.ReactNode }> = ({ items, onOpen, empty }) => {
    const groups = useMemo(() => groupByRegion(items, i => i.code), [items]);
    if (items.length === 0) return <EmptyCard>{empty}</EmptyCard>;
    return (
        <div>
            {groups.map(group => (
                <section key={group.region}>
                    <RegionHeading region={group.region} count={group.items.length} />
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {group.items.map(item => <CountryTile key={item.id} item={item} onClick={() => onOpen(item)} />)}
                    </div>
                </section>
            ))}
        </div>
    );
};

const CityGroups: React.FC<{
    items: VisitedItem[];
    storedIds: Set<string>;
    onOpen: (item: VisitedItem) => void;
    empty: React.ReactNode;
}> = ({ items, storedIds, onOpen, empty }) => {
    const groups = useMemo(() => groupByRegion(items, i => i.countryCode), [items]);
    if (items.length === 0) return <EmptyCard>{empty}</EmptyCard>;
    return (
        <div>
            {groups.map(group => (
                <section key={group.region}>
                    <RegionHeading region={group.region} count={group.items.length} />
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {group.items.map(item => {
                            const stored = storedIds.has(item.id);
                            return <CityTile key={item.id} item={item} derived={!stored} onClick={stored ? () => onOpen(item) : undefined} />;
                        })}
                    </div>
                </section>
            ))}
        </div>
    );
};

export default AtlasNew;
