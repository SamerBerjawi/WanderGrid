import React, { useEffect, useId, useRef, useState } from 'react';
import type { GeoCoordinates } from '../../types';
import { searchPlaces, type Place, type PlaceKind, type SearchMode } from '../../services/placeSearch';
import { Airplane, Boat, Check, MapPin, Train, X, type Icon } from '../ui/hugeicons';
import { RP_FIELD } from './fields';
import { cn } from '../../utils/cn';

/**
 * A place field with suggestions: type a city, region or country and pick a match. A picked place
 * also gives the map position (shown as a tick), so the trip is on the map from the start. Typing
 * again clears the position until another place is picked. Free text still works.
 *
 * `mode` tunes the search to what is wanted (airports, stations, ports); `prefer` lists the kinds to
 * show first; `bias` ranks nearby places higher; `format` chooses the text kept in the field.
 */

const KIND_ICON: Partial<Record<PlaceKind, Icon>> = { airport: Airplane, station: Train, port: Boat };
const KIND_LABEL: Partial<Record<PlaceKind, string>> = { airport: 'Airport', station: 'Station', port: 'Port', city: 'City', region: 'Region', country: 'Country' };

export const placeToCoordinates = (p: Place): GeoCoordinates => ({
    lat: p.lat, lng: p.lng, tz: p.tz, country: p.country, countryCode: p.countryCode, displayName: p.label,
});

export const PlaceField: React.FC<{
    id: string;
    value: string;
    located: boolean;
    placeholder?: string;
    onChange: (text: string) => void;
    onPick: (text: string, coordinates: GeoCoordinates, place: Place) => void;
    mode?: SearchMode;
    /** Kinds of place to list first (the search itself still returns the best matches of any kind). */
    prefer?: PlaceKind[];
    bias?: { lat?: number; lon?: number };
    /** The text to keep for a picked place; the place's label by default. */
    format?: (place: Place) => string;
    /** Which edge the suggestion list lines up with; it is wider than a half-width field. */
    align?: 'start' | 'end';
}> = ({ id, value, located, placeholder, onChange, onPick, mode = 'auto', prefer, bias, format, align = 'start' }) => {
    const [results, setResults] = useState<Place[]>([]);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const seq = useRef(0);
    const listId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const typed = useRef(false);
    // Kept in a ref so a new array each render doesn't restart the search.
    const preferRef = useRef(prefer);
    preferRef.current = prefer;
    const rank = (places: Place[]): Place[] => {
        const order = preferRef.current;
        if (!order?.length) return places.slice(0, 6);
        const at = (p: Place) => { const i = order.indexOf(p.kind); return i < 0 ? order.length : i; };
        return [...places].sort((a, b) => at(a) - at(b)).slice(0, 6);
    };

    // Search as you type (only after the person edits the text, never for a value set from outside).
    useEffect(() => {
        if (!typed.current) return;
        const q = value.trim();
        if (q.length < 2) { setResults([]); return; }
        const mine = ++seq.current;
        const timer = window.setTimeout(() => {
            void searchPlaces(q, { limit: 10, mode, bias, onUpdate: places => { if (mine === seq.current) setResults(rank(places)); } })
                .then(places => { if (mine === seq.current) setResults(rank(places)); })
                .catch(() => undefined);
        }, 220);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, mode, bias?.lat, bias?.lon]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('pointerdown', onDown);
        return () => document.removeEventListener('pointerdown', onDown);
    }, [open]);

    const pick = (p: Place) => {
        typed.current = false;
        setOpen(false);
        setResults([]);
        onPick(format ? format(p) : p.label, placeToCoordinates(p), p);
    };

    const showList = open && results.length > 0;

    return (
        <div ref={rootRef} className="relative">
            <div className="relative flex items-center">
                <MapPin size={16} className={cn('pointer-events-none absolute left-3', located ? 'text-rp-green' : 'text-rp-muted')} aria-hidden />
                <input
                    id={id}
                    role="combobox"
                    aria-expanded={showList}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={showList ? `${listId}-${active}` : undefined}
                    value={value}
                    placeholder={placeholder}
                    autoComplete="off"
                    onChange={e => { typed.current = true; setOpen(true); setActive(0); onChange(e.target.value); }}
                    onFocus={() => { if (results.length) setOpen(true); }}
                    onKeyDown={e => {
                        if (!showList) return;
                        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % results.length); }
                        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + results.length) % results.length); }
                        else if (e.key === 'Enter') { e.preventDefault(); pick(results[active]); }
                        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
                    }}
                    className={cn(RP_FIELD, 'pl-9', located && 'pr-10')}
                />
                {located ? (
                    <span className="pointer-events-none absolute right-3 flex size-5 items-center justify-center rounded-full bg-rp-green text-rp-paper" title="Found on the map">
                        <Check size={12} aria-hidden />
                        <span className="sr-only">Found on the map</span>
                    </span>
                ) : value ? (
                    <button type="button" aria-label="Clear" onClick={() => { typed.current = false; onChange(''); setResults([]); }} className="absolute right-0 flex size-11 items-center justify-center rounded-full text-rp-muted hover:text-rp-ink">
                        <X size={16} />
                    </button>
                ) : null}
            </div>
            {showList ? (
                <ul id={listId} role="listbox" className={cn('absolute top-full z-popover mt-1 w-full min-w-[18rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-rp-tile bg-rp-surface p-1 rp-shadow-float', align === 'end' ? 'right-0' : 'left-0')}>
                    {results.map((p, i) => (
                        <li key={p.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                            <button
                                type="button"
                                tabIndex={-1}
                                onPointerDown={e => e.preventDefault()}
                                onClick={() => pick(p)}
                                onMouseEnter={() => setActive(i)}
                                className={cn('flex min-h-11 w-full items-center gap-3 rounded-[14px] px-3 text-left', i === active && 'bg-rp-inset')}
                            >
                                {React.createElement(KIND_ICON[p.kind] ?? MapPin, { size: 16, className: 'shrink-0 text-rp-muted', 'aria-hidden': true })}
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-rp-ink">{p.name}</span>
                                    <span className="block truncate text-xs text-rp-muted">{[KIND_LABEL[p.kind], p.subtitle || p.country].filter(Boolean).join(' · ')}</span>
                                </span>
                                {p.iata ? <span className="rp-tabular shrink-0 rounded-full bg-rp-inset px-2 py-0.5 text-xs font-medium text-rp-ink">{p.iata}</span> : null}
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
};
