import React, { useEffect, useMemo, useState } from 'react';
import type { VisitedItem } from '../../types';
import { useAtlasData } from '../../hooks/useAtlasData';
import { groupByRegion, regionOf, resolveCityText } from '../../utils/atlasModel';
import { normalizeCountryCode } from '../../services/countryRegistry';
import { toast } from '../../services/toast';
import { formatDate } from '../../utils/formatters';
import ScrollIndex from '../../components/kokonutui/scroll-index';
import SwipeTabs from '../../components/kokonutui/swipe-tabs';
import MomentumRail, { type RailItem } from '../../components/kokonutui/momentum-rail';
import type { DockTool } from '../../components/kokonutui/tool-dock';
import { RpPageToolbar } from '../../components/new/PageToolbar';
import { CityQuickAddSheet } from '../../components/new/atlas/AtlasSheets';
import { RpEmpty } from '../../components/new/ui';
import { AtlasMap } from '../../components/new/atlas/AtlasMap';
import { CityTile, CountryTile, FlagArt, RegionHeading, RpChipLabel, RpKpi } from '../../components/new/atlas/AtlasParts';
import { AddCountrySheet, CitySheet, CountrySheet, ScanSheet, type CountryTarget } from '../../components/new/atlas/AtlasSheets';
import { WishlistPanel } from '../../components/new/atlas/WishlistPanel';
import { MergeDrawer } from '../../components/new/atlas/MergeDrawer';
import { TONE_LABEL, toneOf, type AtlasTone } from '../../components/new/atlas/atlasStatus';
import { openNewPage } from '../../components/new/devLinks';
import {
    Airplane, ArrowUpRight, Buildings, Carousel, Globe, Heart, MagnifyingGlass, Plus, Sparkle, SquaresFour, Stack,
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
const VIEW_KEY = 'wandergrid_atlas_new_view';
const MAP_CITIES_KEY = 'wandergrid_atlas_new_map_cities';
type ListView = 'grid' | 'rail';
const readView = (): ListView => {
    try { return localStorage.getItem(VIEW_KEY) === 'rail' ? 'rail' : 'grid'; } catch { return 'grid'; }
};
const SCANNED_KEY = 'wandergrid_atlas_new_autoscan';

const readTab = (): Tab => {
    try {
        const v = localStorage.getItem(TAB_KEY);
        return v === 'cities' || v === 'layovers' || v === 'wishlist' ? v : 'countries';
    } catch { return 'countries'; }
};

/** The selected tab's pill takes the list's accent, like the Map page's view tabs. */
const TAB_PILL: Record<Tab, { bg: string; text: string }> = {
    countries: { bg: 'bg-rp-green', text: 'text-rp-paper' },
    cities: { bg: 'bg-rp-ink', text: 'text-rp-on-ink' },
    layovers: { bg: 'bg-rp-rust', text: 'text-rp-paper' },
    wishlist: { bg: 'bg-rp-mustard', text: 'text-rp-on-mustard' },
};

const PILL = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-canvas active:scale-[0.97]';

const matches = (q: string, ...parts: (string | undefined)[]) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    return parts.some(p => p?.toLowerCase().includes(needle));
};

export const AtlasNew: React.FC<AtlasNewProps> = ({ onTripClick }) => {
    const data = useAtlasData();
    const [tab, setTab] = useState<Tab>(readTab);
    const [view, setView] = useState<ListView>(readView);
    // Cities on the world map: on by default, remembered.
    const [showCities, setShowCities] = useState(() => {
        try { return localStorage.getItem(MAP_CITIES_KEY) !== 'off'; } catch { return true; }
    });
    const toggleCities = () => {
        setShowCities(v => {
            try { localStorage.setItem(MAP_CITIES_KEY, v ? 'off' : 'on'); } catch { /* storage unavailable */ }
            return !v;
        });
    };
    const changeView = (next: ListView) => {
        setView(next);
        try { localStorage.setItem(VIEW_KEY, next); } catch { /* storage unavailable */ }
    };
    const [query, setQuery] = useState('');
    const [countryTarget, setCountryTarget] = useState<CountryTarget | null>(null);
    const [city, setCity] = useState<VisitedItem | null>(null);
    const [adding, setAdding] = useState<'visited' | 'wishlist' | null>(null);
    const [scanOpen, setScanOpen] = useState(false);
    const [mergeOpen, setMergeOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [addingCity, setAddingCity] = useState(false);

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
    // Cities with coordinates (places from trips often have none, and can't be pinned).
    const mapCities = useMemo(
        () => data.cities
            .filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lng))
            .map(c => ({ id: c.id, lat: c.lat as number, lng: c.lng as number, name: c.name })),
        [data.cities]
    );
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

    // Each list has its accent (the same as its stat tile); inactive tabs show it on the icon.
    const tabItems = [
        { id: 'countries', title: 'Countries', icon: Globe, iconClassName: 'text-rp-green', badge: <TabCount n={data.visitedCountries.length} /> },
        { id: 'cities', title: 'Cities', icon: Buildings, badge: <TabCount n={data.cities.length} /> },
        { id: 'layovers', title: 'Layovers', icon: Airplane, iconClassName: 'text-rp-rust', badge: <TabCount n={data.layovers.length} /> },
        { id: 'wishlist', title: 'Wishlist', icon: Heart, iconClassName: 'text-rp-ochre', badge: <TabCount n={data.wishlist.length} /> },
    ];

    const tools: DockTool[] = [
        ...(tab === 'countries' || tab === 'cities'
            ? [
                { id: 'grid', label: 'Grid', icon: SquaresFour as any },
                { id: 'rail', label: 'Rail', icon: Carousel as any },
            ]
            : []),
        { id: 'search', label: 'Search places', icon: MagnifyingGlass as any, action: () => setSearchOpen(o => !o), dividerBefore: tab === 'countries' || tab === 'cities' },
        {
            id: 'scan',
            label: 'Find in trips',
            icon: Sparkle as any,
            action: () => { if (data.hasHistory) setScanOpen(true); else toast.info('Log a trip or flight first.'); },
        },
        {
            id: 'add',
            label: tab === 'cities' ? 'Add city' : tab === 'wishlist' ? 'Add to wishlist' : 'Add country',
            icon: Plus as any,
            action: () => { if (tab === 'cities') setAddingCity(true); else setAdding(tab === 'wishlist' ? 'wishlist' : 'visited'); },
        },
    ];

    // Shown inside the Add city sheet, where the user is looking.
    const [cityError, setCityError] = useState<string | null>(null);
    const addCity = async (text: string) => {
        setCityError(null);
        const draft = await resolveCityText(text);
        if (!draft) {
            setCityError(`Couldn't find "${text}". Try "Porto, Portugal".`);
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
                    <div className="flex flex-wrap items-center justify-between gap-x-3">
                        <h1 className="text-[2.25rem] font-medium leading-[1.05] tracking-tight text-rp-ink sm:text-[2.5rem]">Travel Atlas</h1>
                        <RpPageToolbar
                            tools={tools}
                            value={view}
                            onValueChange={id => changeView(id as ListView)}
                            ariaLabel="Atlas tools"
                            search={{
                                open: searchOpen || Boolean(query),
                                query,
                                onQueryChange: setQuery,
                                onClose: () => setSearchOpen(false),
                                label: 'Search places',
                                placeholder: 'Search places',
                            }}
                            className="-my-2"
                        />
                    </div>

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
                            <button type="button" onClick={() => setMergeOpen(true)} className={cn(PILL, 'self-start bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90 sm:self-auto')}>
                                Review and merge
                            </button>
                        </div>
                    ) : null}

                    {/* World map (half width) with the statistics beside it */}
                    <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
                        <section aria-labelledby="atlas-world" className="rounded-rp-card bg-rp-surface p-4 rp-shadow-rest sm:p-5">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <h2 id="atlas-world" className="text-base font-medium text-rp-ink">World</h2>
                                    <p className="text-xs text-rp-muted">Tap a country to open it or add it.</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    {mapCities.length > 0 ? (
                                        <button
                                            type="button"
                                            aria-pressed={showCities}
                                            onClick={toggleCities}
                                            className={cn(PILL, showCities ? 'bg-rp-rust text-rp-paper hover:bg-rp-rust/90' : 'bg-rp-inset text-rp-ink hover:bg-rp-line')}
                                        >
                                            <Buildings size={16} aria-hidden /> Cities
                                        </button>
                                    ) : null}
                                    <button type="button" onClick={() => openNewPage('/map-new')} className={cn(PILL, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}>
                                        <span className="hidden sm:inline">Open in map</span><span className="sm:hidden">Map</span> <ArrowUpRight size={16} aria-hidden />
                                    </button>
                                </div>
                            </div>
                            <AtlasMap
                                tones={tones}
                                counts={toneCounts}
                                onCountryClick={(code, name) => openCountry(code, name)}
                                cities={showCities ? mapCities : undefined}
                                onCityClick={id => { const c = data.cities.find(x => x.id === id); if (c && data.storedIds.has(id)) setCity(c); }}
                            />
                        </section>
                        <div className="order-first grid grid-cols-2 gap-3 md:grid-cols-4 lg:order-none lg:grid-cols-2 lg:gap-6">
                            <StatTile>
                                <RpKpi
                                    stacked
                                    accent="green"
                                    icon={Globe}
                                    value={data.visitedCountries.length}
                                    label="Countries visited"
                                    chip={data.visitedCountries.length > 0 ? <RpChipLabel>{data.worldShare}% of the world</RpChipLabel> : undefined}
                                />
                            </StatTile>
                            <StatTile>
                                <RpKpi stacked accent="ink" icon={Buildings} value={data.cities.length} label={data.cityCountryCount > 0 ? `Cities in ${data.cityCountryCount} ${data.cityCountryCount === 1 ? 'country' : 'countries'}` : 'Cities'} />
                            </StatTile>
                            <StatTile>
                                <RpKpi stacked accent="mustard" icon={Heart} value={data.wishlist.length} label="On the wishlist" />
                            </StatTile>
                            <StatTile>
                                <RpKpi stacked accent="rust" icon={Airplane} value={data.layovers.length} label="Layover countries" />
                            </StatTile>
                        </div>
                    </div>

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
                                    activeColor={TAB_PILL[tab].bg}
                                    activeTextColor={TAB_PILL[tab].text}
                                />
                            </div>
                        </div>

                        {data.loading ? (
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
                                {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-16 animate-pulse rounded-rp-tile bg-rp-surface/70" />)}
                            </div>
                        ) : tab === 'countries' ? (
                            <CountryGroups
                                view={view}
                                items={filteredCountries(data.visitedCountries)}
                                onOpen={openItem}
                                empty={query
                                    ? <RpEmpty title="No countries match">Try another name.</RpEmpty>
                                    : <RpEmpty title="No countries yet" action={<EmptyActions hasHistory={data.hasHistory} onScan={() => setScanOpen(true)} onAdd={() => setAdding('visited')} />}>Add the countries you've been to, or find them in your trips.</RpEmpty>}
                            />
                        ) : tab === 'layovers' ? (
                            <CountryGroups
                                view="grid"
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
                                view={view}
                                items={visibleCities}
                                storedIds={data.storedIds}
                                onOpen={setCity}
                                empty={<RpEmpty title={query ? 'No cities match' : 'No cities yet'}>{query ? 'Try another name.' : 'Cities from your trips and flights appear here, and you can add your own.'}</RpEmpty>}
                            />
                        )}
                    </section>
                </div>
            </ScrollIndex>

            <CountrySheet target={countryTarget} onClose={() => setCountryTarget(null)} data={data} onTripClick={onTripClick} />
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
            <CityQuickAddSheet open={addingCity} onClose={() => { setAddingCity(false); setCityError(null); }} onAdd={addCity} error={cityError} />
            <ScanSheet open={scanOpen} onClose={() => setScanOpen(false)} data={data} />
            <MergeDrawer open={mergeOpen} onOpenChange={setMergeOpen} review={data.cleanup.review} onConfirm={() => data.mergeDuplicates()} />
        </div>
    );
};

const StatTile: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="flex min-w-0 flex-col justify-center rounded-rp-tile bg-rp-surface p-3 rp-shadow-rest sm:p-4 lg:justify-between lg:p-5">{children}</div>
);

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

/** The Rail view of countries and cities: one Momentum Rail, ordered by region then name. */
const PlacesRail: React.FC<{ title: string; groups: { region: string; items: VisitedItem[] }[]; toItem: (item: VisitedItem, region: string) => RailItem; onSelect: (id: string) => void }> = ({ title, groups, toItem, onSelect }) => {
    const items = groups.flatMap(g => g.items.map(item => toItem(item, g.region)));
    return (
        <section className="rounded-rp-card bg-rp-surface py-3 rp-shadow-rest">
            <MomentumRail
                title={title}
                eyebrow={`${items.length} ${items.length === 1 ? 'place' : 'places'} · ${groups.length} ${groups.length === 1 ? 'region' : 'regions'}`}
                items={items}
                onSelect={railItem => onSelect(railItem.id)}
            />
        </section>
    );
};

const CountryGroups: React.FC<{ view: ListView; items: VisitedItem[]; onOpen: (item: VisitedItem) => void; empty: React.ReactNode }> = ({ view, items, onOpen, empty }) => {
    const groups = useMemo(() => groupByRegion(items, i => i.code), [items]);
    if (items.length === 0) return <EmptyCard>{empty}</EmptyCard>;
    if (view === 'rail') {
        const byId = new Map(items.map(i => [i.id, i]));
        return (
            <PlacesRail
                title="Countries"
                groups={groups}
                onSelect={id => { const item = byId.get(id); if (item) onOpen(item); }}
                toItem={(c, region) => ({
                    id: c.id,
                    title: c.name,
                    location: `${region} · ${TONE_LABEL[toneOf(c)]}`,
                    meta: c.visitDate ? formatDate(c.visitDate, 'month-year') : undefined,
                    art: <FlagArt code={c.code} tone={toneOf(c)} />,
                })}
            />
        );
    }
    return (
        <div>
            {groups.map(group => (
                <section key={group.region} className="mt-7 first:mt-0">
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
    view: ListView;
    items: VisitedItem[];
    storedIds: Set<string>;
    onOpen: (item: VisitedItem) => void;
    empty: React.ReactNode;
}> = ({ view, items, storedIds, onOpen, empty }) => {
    const groups = useMemo(() => groupByRegion(items, i => i.countryCode), [items]);
    if (items.length === 0) return <EmptyCard>{empty}</EmptyCard>;
    if (view === 'rail') {
        const byId = new Map(items.map(i => [i.id, i]));
        return (
            <PlacesRail
                title="Cities"
                groups={groups}
                // Places that come from trips can't be edited here, so only stored cities open.
                onSelect={id => { const item = byId.get(id); if (item && storedIds.has(id)) onOpen(item); }}
                toItem={(c, region) => ({
                    id: c.id,
                    title: c.name,
                    location: c.countryName || region,
                    meta: [c.visitDate ? formatDate(c.visitDate, 'month-year') : null, storedIds.has(c.id) ? null : 'From trips'].filter(Boolean).join(' · ') || undefined,
                    art: <FlagArt code={c.countryCode} tone="visited" />,
                })}
            />
        );
    }
    return (
        <div>
            {groups.map(group => (
                <section key={group.region} className="mt-7 first:mt-0">
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
