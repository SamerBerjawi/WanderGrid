import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection, Geometry } from 'geojson';
import {
    ChoroplethChart, ChoroplethFeature, ChoroplethGraticule, ChoroplethPoints, useChoroplethInteraction, useChoroplethZoom,
    type ChoroplethFeatureData, type ChoroplethFeatureProperties,
} from '../../bklit/choropleth';
import { readRpPalette, rpTokensReady, css, type RpPalette } from '../map/mapPalette';
import { ArrowsIn, Minus, Plus } from '../../ui/hugeicons';
import { RpIconButton } from '../ui';
import { getFlagEmoji } from '../../../services/geoData';
import { normalizeCountryCode } from '../../../services/countryRegistry';
import { TONE_DOT, TONE_ICON, TONE_LABEL, toneFill, type AtlasTone } from './atlasStatus';
import { cn } from '../../../utils/cn';

/**
 * The Atlas world view: a BklitUI choropleth with countries coloured by status. Zoom with the buttons,
 * Ctrl/⌘ + wheel or a trackpad pinch (a plain wheel keeps scrolling the page); static on touch screens,
 * where a tap opens the country. The country lists below are the accessible equivalent.
 */

const GEOJSON_URL = '/data/ne_110m_admin_0_countries.geojson';
let geoCache: Promise<FeatureCollection<Geometry, ChoroplethFeatureProperties>> | null = null;
const loadWorld = () => {
    if (!geoCache) {
        geoCache = fetch(GEOJSON_URL)
            .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
            .then((fc: FeatureCollection<Geometry, ChoroplethFeatureProperties>) => ({
                ...fc,
                // Antarctica takes a fifth of the map and is never a travel record here.
                features: fc.features.filter(f => f.properties?.ISO_A3 !== 'ATA'),
            }))
            .catch(err => { geoCache = null; throw err; });
    }
    return geoCache;
};

/** ISO alpha-2 of a feature: ISO_A2 is "-99" for France and Norway, so prefer the EH variant. */
export const featureCode = (f: ChoroplethFeatureData) => {
    const p = f.properties as Record<string, unknown>;
    const eh = String(p.ISO_A2_EH ?? '');
    const a2 = String(p.ISO_A2 ?? '');
    return (eh && eh !== '-99' ? eh : a2 !== '-99' ? a2 : '').toUpperCase();
};
const featureName = (f: ChoroplethFeatureData) => String((f.properties as Record<string, unknown>).NAME ?? f.properties?.name ?? '');

/** The rp palette, refreshed when the theme class changes. */
const usePalette = (ref: React.RefObject<HTMLElement | null>) => {
    const [palette, setPalette] = useState<RpPalette | null>(null);
    useEffect(() => {
        let frame = 0;
        let tries = 0;
        // new.css arrives with a lazy chunk: retry each frame (for up to ~5 s) until the tokens resolve.
        const read = () => {
            if (rpTokensReady(ref.current)) setPalette(readRpPalette(ref.current));
            else if (tries++ < 300) frame = requestAnimationFrame(read);
        };
        read();
        const o = new MutationObserver(() => { tries = 0; cancelAnimationFrame(frame); read(); });
        o.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => { cancelAnimationFrame(frame); o.disconnect(); };
    }, [ref]);
    return palette;
};

const useCoarsePointer = () => {
    const [coarse] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);
    return coarse;
};

export interface AtlasMapProps {
    /** Tone per country code (UK nations already folded into "GB" by the caller or here). */
    tones: Record<string, AtlasTone>;
    counts: Record<AtlasTone, number>;
    onCountryClick: (code: string, name: string) => void;
    /** Cities to mark on the map (empty to hide them). */
    cities?: { id: string; lat: number; lng: number; name: string }[];
    onCityClick?: (id: string) => void;
    className?: string;
}

const Tooltip: React.FC<{ tones: Record<string, AtlasTone> }> = ({ tones }) => {
    const { tooltipData } = useChoroplethInteraction();
    const { zoom } = useChoroplethZoom();
    if (!tooltipData) return null;
    const code = featureCode(tooltipData.feature);
    const tone = tones[code];
    const point = zoom ? zoom.applyToPoint({ x: tooltipData.x, y: tooltipData.y }) : { x: tooltipData.x, y: tooltipData.y };
    return (
        <div
            role="presentation"
            className="pointer-events-none absolute z-raised -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-full bg-rp-ink px-3 py-1.5 text-xs font-medium text-rp-on-ink rp-shadow-ink"
            style={{ left: point.x, top: point.y }}
        >
            <span aria-hidden className="mr-1.5">{getFlagEmoji(code)}</span>
            {featureName(tooltipData.feature)}
            {tone ? <span className="ml-1.5 opacity-70">· {TONE_LABEL[tone]}</span> : null}
        </div>
    );
};

const ZoomControls: React.FC = () => {
    const { zoom } = useChoroplethZoom();
    if (!zoom) return null;
    const step = (factor: number) => zoom.scale({ scaleX: factor, scaleY: factor });
    return (
        <div className="absolute right-3 bottom-3 flex flex-col gap-2">
            <RpIconButton label="Zoom in" onClick={() => step(1.4)}><Plus size={18} /></RpIconButton>
            <RpIconButton label="Zoom out" onClick={() => step(1 / 1.4)}><Minus size={18} /></RpIconButton>
            <RpIconButton label="Fit the world" onClick={() => zoom.reset()}><ArrowsIn size={18} /></RpIconButton>
        </div>
    );
};

export const AtlasMap: React.FC<AtlasMapProps> = ({ tones, counts, onCountryClick, cities, onCityClick, className }) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const palette = usePalette(rootRef);
    const coarse = useCoarsePointer();
    const [world, setWorld] = useState<FeatureCollection<Geometry, ChoroplethFeatureProperties> | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        loadWorld().then(fc => { if (alive) setWorld(fc); }).catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, []);

    // UK nations colour the whole UK shape, using the strongest tone among them.
    const byFeature = useMemo(() => {
        const rank: Record<AtlasTone, number> = { lived: 4, visited: 3, wishlist: 2, layover: 1 };
        const out: Record<string, AtlasTone> = {};
        Object.entries(tones).forEach(([raw, tone]) => {
            const code = normalizeCountryCode(raw).startsWith('GB-') ? 'GB' : normalizeCountryCode(raw);
            if (!out[code] || rank[tone] > rank[out[code]]) out[code] = tone;
        });
        return out;
    }, [tones]);

    const legend: AtlasTone[] = ['visited', 'lived', 'wishlist', 'layover'];

    return (
        <div ref={rootRef} className={cn('relative', className)}>
            <div
                className="relative overflow-hidden rounded-rp-inset"
                // A plain wheel scrolls the page; Ctrl/⌘ + wheel (and trackpad pinch) zooms the map.
                onWheelCapture={e => { if (!e.ctrlKey && !e.metaKey) e.stopPropagation(); }}
            >
                {world && palette ? (
                    <ChoroplethChart
                        data={world}
                        aspectRatio="16 / 9"
                        scaleRatio={1 / 6.6}
                        offsetY={0}
                        animationDuration={0}
                        zoomEnabled={!coarse}
                        zoomMin={1}
                        zoomMax={8}
                        center={[10, 30]}
                        className="text-rp-ink"
                    >
                        <ChoroplethGraticule stroke={css(palette.line, 0.6)} strokeWidth={0.4} step={[30, 30]} />
                        <ChoroplethFeature
                            getFeatureColor={f => css(toneFill(byFeature[featureCode(f)] ?? null, palette))}
                            stroke={css(palette.surface)}
                            strokeWidth={0.5}
                            fadedOpacity={0.55}
                            onFeatureClick={f => { const code = featureCode(f); if (code) onCountryClick(code, featureName(f)); }}
                        />
                        {cities && cities.length > 0 ? (
                            <ChoroplethPoints
                                points={cities.map(c => ({ id: c.id, lng: c.lng, lat: c.lat, label: c.name }))}
                                fill={css(palette.rust)}
                                stroke={css(palette.surface)}
                                labelColor={css(palette.ink)}
                                labelHalo={css(palette.surface, 0.9)}
                                onPointClick={onCityClick ? p => onCityClick(p.id) : undefined}
                            />
                        ) : null}
                        <Tooltip tones={byFeature} />
                        {!coarse ? <ZoomControls /> : null}
                    </ChoroplethChart>
                ) : (
                    <div className="flex aspect-video items-center justify-center text-sm text-rp-muted">
                        {failed ? "Couldn't load the world map." : <span className="sr-only">Loading the world map</span>}
                    </div>
                )}
            </div>
            <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-1" aria-label="Map legend">
                {legend.map(tone => {
                    const IconC = TONE_ICON[tone];
                    return (
                    <li key={tone} className="flex items-center gap-1.5 text-xs text-rp-muted">
                        <span aria-hidden className={cn('size-2.5 rounded-full', TONE_DOT[tone])} />
                        <IconC size={14} aria-hidden className="ml-0.5" />
                        <span className="text-rp-ink">{TONE_LABEL[tone]}</span>
                        <span className="rp-tabular">{counts[tone]}</span>
                    </li>
                    );
                })}
                {cities && cities.length > 0 ? (
                    <li className="flex items-center gap-1.5 text-xs text-rp-muted">
                        <span aria-hidden className="size-2.5 rounded-full bg-rp-rust" />
                        <span className="text-rp-ink">Cities</span>
                        <span className="rp-tabular">{cities.length}</span>
                    </li>
                ) : null}
            </ul>
        </div>
    );
};
