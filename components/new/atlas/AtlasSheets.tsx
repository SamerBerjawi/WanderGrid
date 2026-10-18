import React, { useEffect, useId, useMemo, useState } from 'react';
import { CountryResidenceStatus, VisitedItem, getResidenceStatuses, toggleCountryResidenceStatus } from '../../../types';
import { RpChip, RpEmpty, RpSection, RpSheet } from '../ui';
import HoldButton from '../../kokonutui/hold-button';
import ParticleButton from '../../kokonutui/particle-button';
import ActionSearchBar, { type CommandItem } from '../../kokonutui/command-palette';
import { Airplane, Buildings, Car, Check, Globe, MapPin, Suitcase } from '../../ui/hugeicons';
import { COUNTRY_REGION_MAP, getFlagEmoji } from '../../../services/geoData';
import { canonicalCountryName, UK_CONSTITUENTS } from '../../../services/countryRegistry';
import { formatDate } from '../../../utils/formatters';
import { cityScanKey, isLayoverCountry, isWishlistCountry, regionOf, type AtlasSource, type ScanResult } from '../../../utils/atlasModel';
import type { AtlasData } from '../../../hooks/useAtlasData';
import { STATUS_OPTIONS, toneOf } from './atlasStatus';
import { FlagBadge, ToneChip } from './AtlasParts';
import { cn } from '../../../utils/cn';

/** Sheets of the New Atlas page: a country, a city, adding a country, and finding places in trips. */

const today = () => new Date().toISOString().split('T')[0];

const FIELD = 'min-h-11 w-full rounded-rp-inset bg-rp-surface px-3 text-sm text-rp-ink outline-none placeholder:text-rp-muted focus-visible:ring-2 focus-visible:ring-rp-muted';

const Field: React.FC<{ label: string; children: (id: string) => React.ReactNode }> = ({ label, children }) => {
    const id = useId();
    return (
        <div className="flex flex-col gap-1.5 py-1.5">
            <label htmlFor={id} className="text-xs text-rp-muted">{label}</label>
            {children(id)}
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* Country */
/* ------------------------------------------------------------------ */

export interface CountryTarget {
    /** The stored (merged) record, or undefined for a country not in the atlas yet. */
    item?: VisitedItem;
    code: string;
    name: string;
    /** Statuses for a new record, e.g. ['wishlist'] when added from the Wishlist tab. */
    initialStatuses?: CountryResidenceStatus[];
}

export const CountrySheet: React.FC<{ target: CountryTarget | null; onClose: () => void; data: AtlasData }> = ({ target, onClose, data }) => {
    const item = target?.item;
    const [statuses, setStatuses] = useState<CountryResidenceStatus[]>(['visited']);
    const [visitDate, setVisitDate] = useState('');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        if (!target) return;
        const initial = target.item ? getResidenceStatuses(target.item) : target.initialStatuses || ['visited'];
        setStatuses(initial.length > 0 ? initial : ['visited']);
        // A new visit defaults to today; a new wishlist entry has no date.
        setVisitDate(target.item?.visitDate || (target.item || initial.includes('wishlist') ? '' : today()));
        setNotes(target.item?.notes || '');
    }, [target]);

    if (!target) return <RpSheet open={false} onClose={onClose} title="">{null}</RpSheet>;

    const canPromote = item && (isWishlistCountry(item) || isLayoverCountry(item)) && !getResidenceStatuses(item).some(s => s === 'visited' || s.startsWith('lived'));
    const save = async () => {
        await data.saveCountry({ code: target.code, name: target.name, statuses, visitDate: visitDate || undefined, notes: notes.trim() || undefined }, item);
        onClose();
    };

    return (
        <RpSheet
            open
            onClose={onClose}
            title={target.name}
            subtitle={regionOf(target.code)}
            footer={
                <>
                    {item ? (
                        <HoldButton onHoldComplete={async () => { await data.remove(item); onClose(); }} resetAfter={0}>
                            Hold to delete
                        </HoldButton>
                    ) : <span />}
                    <ParticleButton onClick={save} disabled={statuses.length === 0} pendingLabel="Saving" successLabel="Saved" errorLabel="Try again">
                        {item ? 'Save' : 'Add to atlas'}
                    </ParticleButton>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                <div className="flex items-center gap-4">
                    <FlagBadge code={target.code} size="lg" />
                    <div className="flex min-w-0 flex-col gap-1">
                        {item ? <ToneChip tone={toneOf(item)} className="self-start" /> : <span className="text-sm text-rp-muted">Not in your atlas yet</span>}
                        {item?.visitDate ? <span className="rp-tabular text-xs text-rp-muted">{formatDate(item.visitDate, 'medium')}</span> : null}
                    </div>
                </div>

                {canPromote ? (
                    <ParticleButton
                        variant="mustard"
                        onClick={async () => { await data.promote(item!); onClose(); }}
                        icon={<Check />}
                        pendingLabel="Marking"
                        successLabel="Visited"
                        className="self-start"
                    >
                        Been there
                    </ParticleButton>
                ) : null}

                <RpSection title="Status" icon={Globe}>
                    <div className="flex flex-wrap gap-2 py-2" role="group" aria-label="Status">
                        {STATUS_OPTIONS.map(opt => (
                            <RpChip
                                key={opt.value}
                                selected={statuses.includes(opt.value)}
                                onClick={() => setStatuses(s => toggleCountryResidenceStatus(s, opt.value))}
                            >
                                <opt.icon size={16} aria-hidden />
                                {opt.label}
                            </RpChip>
                        ))}
                    </div>
                    <p className="pb-2 text-xs text-rp-muted">Visited and lived can be combined; so can layover and wishlist.</p>
                </RpSection>

                <RpSection title="Details" icon={Suitcase}>
                    <Field label="Date">
                        {id => <input id={id} type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} className={cn(FIELD, 'rp-date rp-tabular')} />}
                    </Field>
                    <Field label="Notes">
                        {id => (
                            <textarea
                                id={id}
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                rows={3}
                                placeholder="Anything worth remembering"
                                className={cn(FIELD, 'resize-none py-2.5')}
                            />
                        )}
                    </Field>
                </RpSection>
            </div>
        </RpSheet>
    );
};

/* ------------------------------------------------------------------ */
/* City */
/* ------------------------------------------------------------------ */

export const CitySheet: React.FC<{ city: VisitedItem | null; onClose: () => void; data: AtlasData }> = ({ city, onClose, data }) => {
    const [name, setName] = useState('');
    const [visitDate, setVisitDate] = useState('');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        if (!city) return;
        setName(city.name);
        setVisitDate(city.visitDate || '');
        setNotes(city.notes || '');
    }, [city]);

    if (!city) return <RpSheet open={false} onClose={onClose} title="">{null}</RpSheet>;

    const save = async () => {
        const nameChanged = name.trim() !== city.name;
        await data.saveCity({
            name: name.trim() || city.name,
            countryCode: city.countryCode || 'XX',
            countryName: city.countryName || '',
            visitDate: visitDate || undefined,
            notes: notes.trim() || undefined,
            // A renamed city is geocoded again.
            lat: nameChanged ? undefined : city.lat,
            lng: nameChanged ? undefined : city.lng,
        }, city);
        onClose();
    };

    return (
        <RpSheet
            open
            onClose={onClose}
            title={city.name}
            subtitle={city.countryName || undefined}
            footer={
                <>
                    <HoldButton onHoldComplete={async () => { await data.remove(city); onClose(); }} resetAfter={0}>
                        Hold to delete
                    </HoldButton>
                    <ParticleButton onClick={save} disabled={!name.trim()} pendingLabel="Saving" successLabel="Saved" errorLabel="Try again">
                        Save
                    </ParticleButton>
                </>
            }
        >
            <RpSection title="Details" icon={Buildings}>
                <Field label="City">
                    {id => <input id={id} value={name} onChange={e => setName(e.target.value)} className={FIELD} autoComplete="off" />}
                </Field>
                <Field label="Date">
                    {id => <input id={id} type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} className={cn(FIELD, 'rp-date rp-tabular')} />}
                </Field>
                <Field label="Notes">
                    {id => <textarea id={id} value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={cn(FIELD, 'resize-none py-2.5')} />}
                </Field>
            </RpSection>
        </RpSheet>
    );
};

/* ------------------------------------------------------------------ */
/* Add a country */
/* ------------------------------------------------------------------ */

const UK_NAMES: Record<string, string> = { 'GB-ENG': 'England', 'GB-SCT': 'Scotland', 'GB-WLS': 'Wales', 'GB-NIR': 'Northern Ireland' };

export const AddCountrySheet: React.FC<{
    open: boolean;
    onClose: () => void;
    onPick: (code: string, name: string) => void;
    known: Set<string>;
}> = ({ open, onClose, onPick, known }) => {
    const items = useMemo<CommandItem[]>(() => {
        const codes = [...Object.keys(COUNTRY_REGION_MAP).filter(c => c !== 'GB'), ...UK_CONSTITUENTS];
        return codes
            .map(code => ({ code, name: UK_NAMES[code] || canonicalCountryName(code, code) }))
            .filter(c => c.name && c.name !== c.code)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(c => ({
                id: c.code,
                label: c.name,
                icon: <span aria-hidden className="text-base leading-none">{getFlagEmoji(c.code)}</span>,
                group: known.has(c.code) ? 'In your atlas' : 'Countries',
                keywords: [c.code, regionOf(c.code)],
            }));
    }, [known]);

    return (
        <RpSheet open={open} onClose={onClose} title="Add a country">
            {open ? (
                <ActionSearchBar
                    autoFocus
                    items={items}
                    onSelect={item => { onPick(item.id, item.label); }}
                    label="Find a country"
                    placeholder="Search countries"
                />
            ) : null}
        </RpSheet>
    );
};

/* ------------------------------------------------------------------ */
/* Find places in trips (history scan) */
/* ------------------------------------------------------------------ */

const SOURCE_ICON: Record<AtlasSource, typeof Airplane> = { flight: Airplane, layover: Airplane, trip: Suitcase, roadtrip: Car };
const SOURCE_LABEL: Record<AtlasSource, string> = { flight: 'Flight', layover: 'Layover', trip: 'Trip', roadtrip: 'Road trip' };

export const ScanSheet: React.FC<{ open: boolean; onClose: () => void; data: AtlasData }> = ({ open, onClose, data }) => {
    const [result, setResult] = useState<ScanResult | null>(null);
    const [scanning, setScanning] = useState(false);
    const [countries, setCountries] = useState<Set<string>>(new Set());
    const [cities, setCities] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!open) return;
        let alive = true;
        setScanning(true);
        setResult(null);
        data.scan()
            .then(r => {
                if (!alive) return;
                setResult(r);
                setCountries(new Set(r.countries.map(c => c.code)));
                setCities(new Set(r.cities.map(cityScanKey)));
            })
            .catch(() => { if (alive) setResult({ countries: [], cities: [] }); })
            .finally(() => { if (alive) setScanning(false); });
        return () => { alive = false; };
        // Scan once per opening; later data changes must not restart it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const toggle = (set: Set<string>, key: string, apply: (s: Set<string>) => void) => {
        const next = new Set(set);
        if (next.has(key)) next.delete(key); else next.add(key);
        apply(next);
    };
    const chosen = countries.size + cities.size;
    const empty = result && result.countries.length === 0 && result.cities.length === 0;

    return (
        <RpSheet
            open={open}
            onClose={onClose}
            title="Find places in your trips"
            subtitle={scanning ? 'Looking through flights, road trips and past trips' : undefined}
            width={440}
            footer={result && !empty ? (
                <>
                    <span className="rp-tabular text-sm text-rp-muted">{chosen} selected</span>
                    <ParticleButton
                        onClick={async () => { await data.importScan(result, countries, cities); onClose(); }}
                        disabled={chosen === 0}
                        pendingLabel="Adding"
                        successLabel="Added"
                        errorLabel="Try again"
                    >
                        Add {chosen} {chosen === 1 ? 'place' : 'places'}
                    </ParticleButton>
                </>
            ) : undefined}
        >
            {scanning || !result ? (
                <div className="flex flex-col gap-2 py-2" aria-busy="true">
                    {[0, 1, 2, 3].map(i => <div key={i} className="h-11 animate-pulse rounded-rp-inset bg-rp-inset" />)}
                </div>
            ) : empty ? (
                <RpEmpty title="Nothing new found">Every place in your trips is already in your atlas.</RpEmpty>
            ) : (
                <div className="flex flex-col gap-5">
                    {result.countries.length > 0 ? (
                        <RpSection title={`Countries · ${result.countries.length}`} icon={Globe}>
                            <div className="flex flex-col py-1">
                                {result.countries.map(c => (
                                    <ScanRow
                                        key={c.code}
                                        checked={countries.has(c.code)}
                                        onToggle={() => toggle(countries, c.code, setCountries)}
                                        flag={c.code}
                                        title={c.name}
                                        meta={`${SOURCE_LABEL[c.source]} · ${formatDate(c.date, 'month-year')}`}
                                        SourceIcon={SOURCE_ICON[c.source]}
                                    />
                                ))}
                            </div>
                        </RpSection>
                    ) : null}
                    {result.cities.length > 0 ? (
                        <RpSection title={`Cities · ${result.cities.length}`} icon={MapPin}>
                            <div className="flex flex-col py-1">
                                {result.cities.map(c => (
                                    <ScanRow
                                        key={cityScanKey(c)}
                                        checked={cities.has(cityScanKey(c))}
                                        onToggle={() => toggle(cities, cityScanKey(c), setCities)}
                                        flag={c.countryCode}
                                        title={c.name}
                                        meta={`${c.countryName} · ${SOURCE_LABEL[c.source]}`}
                                        SourceIcon={SOURCE_ICON[c.source]}
                                    />
                                ))}
                            </div>
                        </RpSection>
                    ) : null}
                </div>
            )}
        </RpSheet>
    );
};

const ScanRow: React.FC<{
    checked: boolean;
    onToggle: () => void;
    flag?: string;
    title: string;
    meta: string;
    SourceIcon: typeof Airplane;
}> = ({ checked, onToggle, flag, title, meta, SourceIcon }) => (
    <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        className="flex min-h-12 items-center gap-3 rounded-rp-inset px-1 text-left outline-none hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted"
    >
        <span
            aria-hidden
            className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full transition-colors',
                checked ? 'bg-rp-ink text-rp-on-ink' : 'bg-rp-surface ring-1 ring-inset ring-rp-line'
            )}
        >
            {checked ? <Check size={14} /> : null}
        </span>
        <span aria-hidden className="text-lg leading-none">{flag && flag !== 'XX' ? getFlagEmoji(flag) : '📍'}</span>
        <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-rp-ink">{title}</span>
            <span className="rp-tabular truncate text-xs text-rp-muted">{meta}</span>
        </span>
        <SourceIcon size={16} className="shrink-0 text-rp-muted" aria-hidden />
    </button>
);
