import React, { useRef, useState } from 'react';
import SwipeTabs from '../../kokonutui/swipe-tabs';
import UndoButton from '../../kokonutui/undo-button';
import { FEATURE_FLAGS } from '../../../config/featureFlags';
import {
    DEFAULT_MAP_APPEARANCE, ALL_AIRPORT_CATEGORIES, getYesterdayDateString,
    type AirportCategory, type MapAppearanceSettings,
} from '../../../types/mapAppearance';
import { Airplane, AirplaneTilt, Check, AirplaneLanding, ArrowCounterClockwise, Buildings, CalendarBlank, ChartBar, CirclesThree, CloudRain, Eye, Globe, Heart, House, Lightning, Maping, MapPin, MapTrifold, Moon, Mountains, MountainSnow, Palette, Path, Planet, RoadHorizon, SlidersHorizontal, Sparkle, Stack, Sun, SunHorizon, Train, TrendUp } from '../../ui/hugeicons';
import { cn } from '../../../utils/cn';
import { RpChip, RpRow, RpSection, RpSheet, RpSlider, RpToggle, useIsMobile } from '../ui';

/** Segmented choice built on KokonutUI Swipe Tabs (tabs only). */
export function RpSegmented<T extends string>({ value, options, onChange, label }: {
    value: T;
    options: { value: T; label: string }[];
    onChange: (v: T) => void;
    label: string;
}) {
    const mobile = useIsMobile();
    return (
        <SwipeTabs
            compact={!mobile}
            stretch={mobile}
            items={options.map(o => ({ id: o.value, title: o.label }))}
            value={value}
            onChange={id => onChange(id as T)}
            panels={false}
            label={label}
            className={mobile ? 'w-full' : 'w-auto'}
            listClassName="bg-rp-surface"
        />
    );
}

const SIZES = [
    { value: 'off', label: 'Off' },
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' },
] as const;

type BasemapTone = 'light' | 'dark';

/** Basemap choices, grouped by how they look. Previews are one low-zoom tile from the same provider. */
const BASEMAPS: { value: MapAppearanceSettings['basemap']; label: string; tone: BasemapTone; preview: string; filter?: string }[] = [
    { value: 'liberty', label: 'Streets', tone: 'light', preview: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/2/1/2' },
    { value: 'bright', label: 'Bright', tone: 'light', preview: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/2/1/2' },
    { value: 'positron', label: 'Light grey', tone: 'light', preview: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/2/1/2' },
    { value: 'dark', label: 'Dark', tone: 'dark', preview: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/2/1/2' },
    { value: 'fiord', label: 'Dark blue', tone: 'dark', preview: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/2/1/2', filter: 'sepia(0.6) saturate(4) hue-rotate(180deg) brightness(0.85)' },
    { value: 'citylights', label: 'Night lights', tone: 'dark', preview: 'https://gibs-a.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/default/GoogleMapsCompatible_Level8/2/1/2.png' },
    { value: 'satellite', label: 'Satellite', tone: 'dark', preview: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/2/1/2' },
    { value: 'ocean', label: 'Ocean', tone: 'dark', preview: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/2/1/2' },
];

/** Whether a basemap reads as light or dark; Auto follows the theme. */
export const basemapTone = (value: MapAppearanceSettings['basemap']): BasemapTone | null =>
    BASEMAPS.find(b => b.value === value)?.tone ?? null;

/**
 * A basemap tile: the preview fills the card, the name sits on a soft scrim (a photo overlay, so
 * fixed dark-on-image colours are fine), and the chosen one gets a ring and a check.
 */
const BasemapCard: React.FC<{ label: string; hint?: string; selected: boolean; onClick: () => void; children: React.ReactNode }> = ({ label, hint, selected, onClick, children }) => (
    <button
        type="button"
        aria-pressed={selected}
        aria-label={hint ? `${label}, ${hint}` : label}
        onClick={onClick}
        className={cn(
            'group relative block aspect-[4/3] w-full overflow-hidden rounded-[16px] bg-rp-line text-left outline-none',
            'transition-shadow duration-200 focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-inset',
            selected ? 'ring-2 ring-rp-ink ring-offset-2 ring-offset-rp-inset' : 'ring-1 ring-rp-line'
        )}
    >
        <span className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-110 motion-reduce:group-hover:scale-100">{children}</span>
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-2.5 pt-6 pb-2">
            <span className="block truncate text-xs font-semibold text-white">{label}</span>
            {hint ? <span className="block truncate text-2xs text-white/75">{hint}</span> : null}
        </span>
        {selected ? (
            <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-rp-mustard text-rp-on-mustard rp-shadow-soft" aria-hidden>
                <Check size={14} />
            </span>
        ) : null}
    </button>
);

const AIP_GROUPS: { value: NonNullable<MapAppearanceSettings['openAipGroups']>[number]; label: string }[] = [
    { value: 'airspaces', label: 'Airspaces' },
    { value: 'airports', label: 'Airports' },
    { value: 'navaids', label: 'Navaids' },
    { value: 'reportingPoints', label: 'Reporting points' },
];

const CATEGORY_LABELS: Record<AirportCategory, string> = {
    international: 'International',
    regional: 'Regional',
    cargo: 'Cargo',
    military: 'Military',
    local: 'Local',
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const toggleIn = <T,>(list: T[] | undefined, item: T) => (list || []).includes(item) ? (list || []).filter(i => i !== item) : [...(list || []), item];

export interface MapSettingsSheetProps {
    open: boolean;
    onClose: () => void;
    appearance: MapAppearanceSettings;
    onChange: (patch: Partial<MapAppearanceSettings>) => void;
    onReplace: (next: MapAppearanceSettings) => void;
    groupAirports: boolean;
    onGroupAirports: (v: boolean) => void;
    isDark: boolean;
    openAipAvailable: boolean;
    topOffset: number;
    /** Called when a basemap's tone differs from the current theme. */
    onThemeChange?: (theme: 'light' | 'dark') => void;
}

export const MapSettingsSheet: React.FC<MapSettingsSheetProps> = ({
    open, onClose, appearance: a, onChange, onReplace, groupAirports, onGroupAirports, isDark, openAipAvailable, topOffset, onThemeChange,
}) => {
    // A dark basemap turns the app dark and a light one turns it light, so the chrome matches the map.
    const chooseBasemap = (value: MapAppearanceSettings['basemap'], tone: BasemapTone) => {
        onChange({ basemap: value });
        if ((tone === 'dark') !== isDark) onThemeChange?.(tone);
    };
    const beforeReset = useRef<MapAppearanceSettings | null>(null);
    const mobile = useIsMobile();
    const [section, setSection] = useState('map');

    const mapTab = (
        <div className="flex flex-col gap-5 pt-2">
            <RpSection icon={Eye} title="View">
                <RpRow icon={Globe} label="Projection">
                    <RpSegmented label="Projection" value={a.projection} onChange={v => onChange({ projection: v })} options={[{ value: 'flat', label: 'Flat' }, { value: 'globe', label: 'Globe' }]} />
                </RpRow>
                <RpToggle icon={Sparkle} label="Atmosphere" hint="Globe only" checked={a.atmosphere !== false} disabled={a.projection !== 'globe'} onChange={v => onChange({ atmosphere: v })} />
                <RpToggle icon={SunHorizon} label="Day and night" checked={a.timeOfDay} onChange={v => onChange({ timeOfDay: v })} />
            </RpSection>
            <RpSection icon={MapTrifold} title="Basemap">
                <div className="flex flex-col gap-4 py-3">
                    <div className="grid grid-cols-2 gap-2.5">
                        <BasemapCard label="Auto" hint="Follows the theme" selected={a.basemap === 'default'} onClick={() => onChange({ basemap: 'default' })}>
                            <img src={BASEMAPS[0].preview} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover [clip-path:polygon(0_0,100%_0,0_100%)]" />
                            <img src={BASEMAPS[3].preview} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
                        </BasemapCard>
                    </div>
                    {(['light', 'dark'] as BasemapTone[]).map(tone => (
                        <div key={tone} className="flex flex-col gap-2">
                            <p className="flex items-center gap-1.5 px-0.5 text-xs font-medium text-rp-muted">
                                {tone === 'light' ? <Sun size={14} className="text-rp-ochre" /> : <Moon size={14} />}
                                {tone === 'light' ? 'Light' : 'Dark'}
                            </p>
                            <div className="grid grid-cols-3 gap-2.5">
                                {BASEMAPS.filter(b => b.tone === tone).map(b => (
                                    <BasemapCard key={b.value} label={b.label} selected={a.basemap === b.value} onClick={() => chooseBasemap(b.value, b.tone)}>
                                        <img src={b.preview} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" style={b.filter ? { filter: b.filter } : undefined} />
                                    </BasemapCard>
                                ))}
                            </div>
                        </div>
                    ))}
                    <p className="px-1 text-xs text-rp-muted">Light and dark basemaps switch the app theme to match.</p>
                </div>
            </RpSection>
        </div>
    );

    const layersTab = (
        <div className="flex flex-col gap-5 pt-2">
            <RpSection icon={CloudRain} title="Weather and terrain">
                <RpToggle icon={CloudRain} label="Rain radar" checked={a.rainRadar} onChange={v => onChange({ rainRadar: v })} />
                {a.rainRadar ? <RpSlider label="Opacity" value={a.rainRadarOpacity ?? 0.85} min={0.2} max={1} step={0.05} format={pct} onChange={v => onChange({ rainRadarOpacity: v })} /> : null}
                <RpToggle icon={Mountains} label="Relief shading" checked={Boolean(a.terrainHillshade)} onChange={v => onChange({ terrainHillshade: v })} />
                {a.terrainHillshade ? <RpSlider label="Strength" value={a.terrainHillshadeOpacity ?? 0.8} min={0.1} max={1} step={0.05} format={pct} onChange={v => onChange({ terrainHillshadeOpacity: v })} /> : null}
                {FEATURE_FLAGS.GEV_P04D_TERRAIN ? (
                    <>
                        <RpToggle icon={MountainSnow} label="3D elevation" checked={Boolean(a.terrain3d)} onChange={v => onChange({ terrain3d: v })} />
                        {a.terrain3d ? <RpSlider label="Height" value={a.terrain3dExaggeration ?? 1} min={0.5} max={3} step={0.1} format={v => `${v.toFixed(1)}×`} onChange={v => onChange({ terrain3dExaggeration: v })} /> : null}
                    </>
                ) : null}
                {FEATURE_FLAGS.GEV_P04C_GIBS_DAILY ? (
                    <>
                        <RpToggle icon={Planet} label="Daily satellite" checked={Boolean(a.gibsDaily)} onChange={v => onChange({ gibsDaily: v, gibsDailyDate: a.gibsDailyDate || getYesterdayDateString() })} />
                        {a.gibsDaily ? (
                            <>
                                <RpRow icon={CalendarBlank} label="Imagery date">
                                    <input
                                        type="date"
                                        value={a.gibsDailyDate || getYesterdayDateString()}
                                        max={getYesterdayDateString()}
                                        onChange={e => onChange({ gibsDailyDate: e.target.value })}
                                        className="min-h-11 rounded-full bg-rp-surface px-4 text-sm text-rp-ink outline-none focus-visible:ring-2 focus-visible:ring-rp-muted [color-scheme:light] dark:[color-scheme:dark]"
                                    />
                                </RpRow>
                                <RpSlider label="Opacity" value={a.gibsDailyOpacity ?? 0.9} min={0.2} max={1} step={0.05} format={pct} onChange={v => onChange({ gibsDailyOpacity: v })} />
                            </>
                        ) : null}
                    </>
                ) : null}
            </RpSection>
            <RpSection icon={Train} title="Transport">
                <RpToggle icon={Train} label="Rail lines" checked={Boolean(a.transitOverlay)} onChange={v => onChange({ transitOverlay: v })} />
                {a.transitOverlay ? <RpSlider label="Opacity" value={a.transitOverlayOpacity ?? 0.4} min={0.1} max={1} step={0.05} format={pct} onChange={v => onChange({ transitOverlayOpacity: v })} /> : null}
                <RpToggle
                    icon={AirplaneTilt}
                    label="Aviation charts"
                    hint={openAipAvailable ? undefined : 'Add your OpenAIP key in Settings › Integrations'}
                    checked={Boolean(a.openAipOverlay) && openAipAvailable}
                    disabled={!openAipAvailable}
                    onChange={v => onChange({ openAipOverlay: v })}
                />
                {a.openAipOverlay && openAipAvailable ? (
                    <>
                        <div className="flex flex-wrap gap-2 py-2">
                            {AIP_GROUPS.map(g => (
                                <RpChip key={g.value} selected={(a.openAipGroups || []).includes(g.value)} onClick={() => onChange({ openAipGroups: toggleIn(a.openAipGroups, g.value) })}>{g.label}</RpChip>
                            ))}
                        </div>
                        {(a.openAipGroups || []).includes('airports') ? (
                            <div className="flex flex-wrap gap-2 pb-2">
                                {ALL_AIRPORT_CATEGORIES.map(c => (
                                    <RpChip key={c} selected={(a.openAipAirportCategories || ALL_AIRPORT_CATEGORIES).includes(c)} onClick={() => onChange({ openAipAirportCategories: toggleIn(a.openAipAirportCategories || ALL_AIRPORT_CATEGORIES, c) })}>{CATEGORY_LABELS[c]}</RpChip>
                                ))}
                            </div>
                        ) : null}
                        <RpSlider label="Opacity" value={a.openAipOpacity ?? 0.85} min={0.1} max={1} step={0.05} format={pct} onChange={v => onChange({ openAipOpacity: v })} />
                    </>
                ) : null}
            </RpSection>
        </div>
    );

    const routesTab = (
        <div className="flex flex-col gap-5 pt-2">
            <RpSection icon={Airplane} title="Airports">
                <RpRow label="Markers">
                    <RpSegmented label="Airport markers" value={a.airportSize} onChange={v => onChange({ airportSize: v })} options={SIZES as any} />
                </RpRow>
                <RpToggle icon={ChartBar} label="Size by traffic" checked={a.airportMode !== 'uniform'} onChange={v => onChange({ airportMode: v ? 'frequency' : 'uniform' })} />
                <RpRow icon={Path} label="Runway detail">
                    <RpSegmented label="Runway detail" value={a.airportDetail} onChange={v => onChange({ airportDetail: v })} options={[{ value: 'none', label: 'None' }, { value: 'simple', label: 'Simple' }, { value: 'detailed', label: 'Detailed' }]} />
                </RpRow>
                <RpToggle icon={AirplaneLanding} label="Airports only" hint="Hides routes, cities and overlays" checked={Boolean(a.airportsOnly)} onChange={v => onChange({ airportsOnly: v })} />
                <RpToggle icon={CirclesThree} label="Group nearby airports" checked={groupAirports} onChange={onGroupAirports} />
            </RpSection>
            <RpSection icon={Buildings} title="Cities">
                <RpRow label="Markers">
                    <RpSegmented label="City markers" value={a.citySize || 'medium'} onChange={v => onChange({ citySize: v })} options={SIZES as any} />
                </RpRow>
            </RpSection>
            <RpSection icon={Path} title="Routes">
                <RpRow icon={Palette} label="Colour">
                    <RpSegmented label="Route colour" value={a.routeColorMode} onChange={v => onChange({ routeColorMode: v })} options={[{ value: 'gradient', label: 'Gradient' }, { value: 'frequency', label: 'Frequency' }, { value: 'default', label: 'Status' }]} />
                </RpRow>
                <RpRow icon={SlidersHorizontal} label="Thickness">
                    <RpSegmented label="Route thickness" value={a.routeScale} onChange={v => onChange({ routeScale: v })} options={[{ value: 'thin', label: 'Thin' }, { value: 'normal', label: 'Medium' }, { value: 'thick', label: 'Thick' }]} />
                </RpRow>
                <RpToggle icon={TrendUp} label="Width by frequency" checked={a.routeWidthMode === 'frequency'} onChange={v => onChange({ routeWidthMode: v ? 'frequency' : 'uniform' })} />
                <RpToggle icon={Lightning} label="Animate routes" checked={Boolean(a.animateRoutes)} onChange={v => onChange({ animateRoutes: v })} />
                <RpToggle icon={RoadHorizon} label="Follow roads and rails" checked={a.routeTracing !== false} onChange={v => onChange({ routeTracing: v })} />
            </RpSection>
        </div>
    );

    const scratchTab = (
        <div className="flex flex-col gap-5 pt-2">
            <RpSection icon={Maping} title="Scratch map">
                <RpRow icon={MapPin} label="City pins">
                    <RpSegmented label="City pins" value={a.scratchCitySize || 'medium'} onChange={v => onChange({ scratchCitySize: v })} options={SIZES as any} />
                </RpRow>
                <RpToggle icon={House} label="Lived in" checked={a.showLivedCountries !== false} onChange={v => onChange({ showLivedCountries: v })} />
                <RpToggle icon={AirplaneLanding} label="Layovers" checked={a.showLayoverCountries !== false} onChange={v => onChange({ showLayoverCountries: v })} />
                <RpToggle icon={Heart} label="Wishlist" checked={a.showWishlistCountries !== false} onChange={v => onChange({ showWishlistCountries: v })} />
            </RpSection>
        </div>
    );

    return (
        <RpSheet
            open={open}
            onClose={onClose}
            title="Map settings"
            topOffset={topOffset}
            width={440}
            footer={
                <UndoButton
                    label="Reset settings"
                    doneLabel="Settings reset"
                    icon={ArrowCounterClockwise as any}
                    duration={5000}
                    onAction={() => { beforeReset.current = a; onReplace({ ...DEFAULT_MAP_APPEARANCE }); }}
                    onUndo={() => { if (beforeReset.current) onReplace(beforeReset.current); }}
                />
            }
        >
            <SwipeTabs
                label="Map settings sections"
                listClassName="bg-rp-inset"
                value={section}
                onChange={setSection}
                items={[
                    { id: 'map', title: 'Map', icon: MapTrifold, content: mapTab },
                    { id: 'layers', title: 'Layers', icon: Stack, content: layersTab },
                    { id: 'routes', title: 'Routes', icon: Path, content: routesTab },
                    { id: 'scratch', title: 'Scratch', icon: Maping, content: scratchTab },
                ].map(t => ({ ...t, hideTitle: mobile && t.id !== section }))}
            />
        </RpSheet>
    );
};
