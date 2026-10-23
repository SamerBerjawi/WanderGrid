import React, { useEffect, useId, useMemo, useState } from 'react';
import type { VisitedItem } from '../../../types';
import { RpEmpty, RpSection, RpSheet } from '../ui';
import ParticleButton from '../../kokonutui/particle-button';
import { ArrowClockwise, ArrowUndo, Check, CheckCircle, MagnifyingGlass, MapPin, Sparkle, WarningCircle, X } from '../../ui/hugeicons';
import { getFlagEmoji } from '../../../services/geoData';
import { isUnknownPlaceName } from '../../../services/cityRegistry';
import { reverseGeocode, type ReversePlace } from '../../../services/reverseGeocode';
import type { CitySource } from '../../../utils/atlasSources';
import type { AtlasData } from '../../../hooks/useAtlasData';
import { useFindNames, type FindNames } from '../../../hooks/useFindNames';
import { cn } from '../../../utils/cn';

const FIELD = 'min-h-11 w-full rounded-rp-inset bg-rp-surface px-3 text-sm text-rp-ink outline-none placeholder:text-rp-muted focus-visible:ring-2 focus-visible:ring-rp-muted';
const BTN = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40';

const coords = (c: { lat?: number; lng?: number }) =>
    Number.isFinite(c.lat) && Number.isFinite(c.lng) ? `${(c.lat as number).toFixed(4)}, ${(c.lng as number).toFixed(4)}` : null;

const CheckRow: React.FC<{ checked: boolean; onToggle: () => void; title: string; meta?: string; flag?: string }> = ({ checked, onToggle, title, meta, flag }) => (
    <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        className="flex min-h-12 w-full items-center gap-3 rounded-rp-inset px-1 text-left outline-none hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted"
    >
        <span aria-hidden className={cn('flex size-6 shrink-0 items-center justify-center rounded-full transition-colors', checked ? 'bg-rp-ink text-rp-on-ink' : 'bg-rp-surface ring-1 ring-inset ring-rp-line')}>
            {checked ? <Check size={14} /> : null}
        </span>
        {flag !== undefined ? <span aria-hidden className="text-lg leading-none">{flag && flag !== 'XX' ? getFlagEmoji(flag) : '📍'}</span> : null}
        <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm text-rp-ink">{title}</span>
            {meta ? <span className="truncate text-xs text-rp-muted">{meta}</span> : null}
        </span>
    </button>
);

/* ------------------------------------------------------------------ */
/* One unknown place */
/* ------------------------------------------------------------------ */

/**
 * Name a place that has no usable name: type a name or find it from the coordinates, pick which of the records it
 * comes from to update, and save. The name goes into the atlas and into those trips, stops and transports in one step.
 */
export const NamePlaceSheet: React.FC<{ city: VisitedItem; onClose: () => void; data: AtlasData }> = ({ city, onClose, data }) => {
    const nameId = useId();
    const sources = useMemo(() => data.sourcesFor(city), [data, city]);
    const [name, setName] = useState('');
    const [country, setCountry] = useState<{ code: string; name: string } | undefined>();
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [finding, setFinding] = useState(false);
    const [found, setFound] = useState<ReversePlace | null | 'none'>(null);
    const [error, setError] = useState<string | null>(null);
    const where = coords(city);

    useEffect(() => { setPicked(new Set(sources.map(s => s.key))); }, [sources]);
    useEffect(() => { setName(''); setCountry(undefined); setFound(null); setError(null); }, [city.id]);

    const find = async () => {
        setFinding(true);
        setError(null);
        try {
            const place = await reverseGeocode(city.lat as number, city.lng as number);
            setFound(place || 'none');
            if (place) setName(place.name);
            if (place && place.countryCode !== 'XX') setCountry({ code: place.countryCode, name: place.countryName });
        } catch {
            setFound('none');
        } finally { setFinding(false); }
    };

    const toggle = (s: CitySource) => setPicked(p => { const n = new Set(p); if (n.has(s.key)) n.delete(s.key); else n.add(s.key); return n; });
    const ready = name.trim().length > 0 && !isUnknownPlaceName(name);

    const save = async () => {
        setError(null);
        try {
            await data.nameCity(city, name, country, sources.filter(s => picked.has(s.key)));
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not save the name.');
            throw e;
        }
    };

    return (
        <RpSheet
            open
            onClose={onClose}
            title="Name this place"
            subtitle={where ? `At ${where}` : 'No coordinates'}
            footer={
                <ParticleButton onClick={save} disabled={!ready} pendingLabel="Saving" successLabel="Saved" errorLabel="Try again">
                    Save the name
                </ParticleButton>
            }
        >
            <RpSection title="Name" icon={MapPin}>
                <div className="flex flex-col gap-1.5 py-1.5">
                    <label htmlFor={nameId} className="text-xs text-rp-muted">City</label>
                    <input id={nameId} value={name} onChange={e => { setName(e.target.value); setCountry(c => (found && found !== 'none' && e.target.value.trim() === found.name ? c : undefined)); }} placeholder="Porto" className={FIELD} autoComplete="off" />
                </div>
                {where ? (
                    <div className="flex flex-col gap-2 py-1.5">
                        <button type="button" onClick={() => void find()} disabled={finding} className={cn(BTN, 'self-start bg-rp-inset text-rp-ink hover:bg-rp-line')}>
                            <MagnifyingGlass size={16} aria-hidden /> {finding ? 'Looking' : 'Find the name'}
                        </button>
                        <p role="status" aria-live="polite" className="text-xs text-rp-muted">
                            {found === 'none'
                                ? "Couldn't find a name for these coordinates. Type one above."
                                : found
                                    ? `Found ${found.name}${found.countryName ? `, ${found.countryName}` : ''}. Change it above if it isn't right.`
                                    : 'Looks up the place at these coordinates. The coordinates stay as they are.'}
                        </p>
                    </div>
                ) : null}
                {country ? <p className="py-1 text-xs text-rp-muted"><span aria-hidden>{getFlagEmoji(country.code)}</span> {country.name} will be saved with it.</p> : null}
            </RpSection>

            <RpSection title={`Where it is used · ${sources.length}`} icon={Sparkle}>
                {sources.length === 0 ? (
                    <p className="py-2 text-sm text-rp-muted">No trip or transport uses this place, so only your atlas changes.</p>
                ) : (
                    <>
                        <p className="py-1 text-xs text-rp-muted">The new name is written into these. Untick any you want to leave.</p>
                        <div className="flex flex-col py-1">
                            {sources.map(s => <CheckRow key={s.key} checked={picked.has(s.key)} onToggle={() => toggle(s)} title={s.label} meta={`Now: ${s.current || 'empty'}`} />)}
                        </div>
                    </>
                )}
            </RpSection>
            {error ? <p role="alert" className="flex items-start gap-2 text-sm text-rp-rust"><WarningCircle size={16} className="mt-0.5 shrink-0" aria-hidden /> {error}</p> : null}
        </RpSheet>
    );
};

/* ------------------------------------------------------------------ */
/* Find names for all unknown places */
/* ------------------------------------------------------------------ */

export const FindNamesSheet: React.FC<{ open: boolean; onClose: () => void; data: AtlasData }> = ({ open, onClose, data }) => {
    const fn = useFindNames(data);
    const { lookup, apply, proposals, candidates } = fn;
    const looking = lookup.state.status === 'running';
    const writing = apply.state.status === 'running';
    const lookedUp = lookup.state.status === 'done';
    const written = apply.state.status === 'done';

    // Stop and clear when the sheet closes, so a half-done lookup never keeps running behind it.
    useEffect(() => { if (!open) { fn.lookup.cancel(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const close = () => { if (!writing) { if (looking) lookup.cancel(); if (written) fn.reset(); onClose(); } };
    const found = proposals.filter(p => p.place).length;

    return (
        <RpSheet
            open={open}
            onClose={close}
            title="Find names"
            subtitle={`${candidates.length} ${candidates.length === 1 ? 'place has' : 'places have'} no name`}
            width={440}
            footer={<Footer fn={fn} onClose={close} looking={looking} writing={writing} lookedUp={lookedUp} written={written} />}
        >
            {candidates.length === 0 && !written ? (
                <RpEmpty title="Every place has a name">Places with coordinates but no name will be listed here.</RpEmpty>
            ) : (
                <div className="flex flex-col gap-4">
                    {!looking && !lookedUp && !written ? (
                        <p className="text-sm text-rp-muted">
                            Looks up each place by its coordinates and proposes a name and country. You review the names before anything is saved; the coordinates are never changed.
                        </p>
                    ) : null}
                    {looking ? <Progress label={`Looking up ${lookup.state.completed} of ${lookup.state.total}`} done={lookup.state.completed} total={lookup.state.total} /> : null}
                    {writing ? <Progress label={`Saving step ${Math.min(apply.state.completed + 1, apply.state.total)} of ${apply.state.total}`} done={apply.state.completed} total={apply.state.total} /> : null}
                    {lookedUp && !written && !writing ? (
                        <p role="status" className="text-sm text-rp-ink">
                            {lookup.state.cancelled ? 'Stopped. ' : ''}Found names for {found} of {proposals.length} {proposals.length === 1 ? 'place' : 'places'}.
                            {found < proposals.length ? ' The others can be named one by one.' : ''}
                        </p>
                    ) : null}
                    {written ? (
                        <div role="status" className="flex items-start gap-2 text-sm text-rp-ink">
                            {apply.state.failed.length > 0 ? <WarningCircle size={20} className="mt-0.5 shrink-0 text-rp-rust" aria-hidden /> : <CheckCircle size={20} className="mt-0.5 shrink-0 text-rp-green" aria-hidden />}
                            <span>
                                {apply.state.failed.length > 0
                                    ? `${apply.state.completed} of ${apply.state.total} steps saved. ${apply.state.failed.length} didn't go through: ${apply.state.failed[0].error} Nothing in a failed step was changed.`
                                    : `Named ${fn.chosen.length} ${fn.chosen.length === 1 ? 'place' : 'places'} in ${fn.applied?.plan.written ?? 0} records.`}
                            </span>
                        </div>
                    ) : null}
                    {fn.error ? <p role="alert" className="flex items-start gap-2 text-sm text-rp-rust"><WarningCircle size={16} className="mt-0.5 shrink-0" aria-hidden /> {fn.error}</p> : null}

                    {proposals.length > 0 && !written ? (
                        <RpSection title={`Proposed names · ${proposals.length}`} icon={MapPin}>
                            <ul className="flex flex-col py-1">
                                {proposals.map(p => (
                                    <li key={p.city.id} className="flex flex-col gap-1 py-1">
                                        <CheckRow
                                            checked={p.include && !!p.name.trim()}
                                            onToggle={() => fn.edit(p.city.id, { include: !p.include })}
                                            title={p.place ? `${p.place.name}${p.place.countryName ? `, ${p.place.countryName}` : ''}` : 'No name found'}
                                            meta={coords(p.city) || undefined}
                                            flag={p.place?.countryCode}
                                        />
                                        {p.place ? (
                                            <input
                                                aria-label={`Name for the place at ${coords(p.city)}`}
                                                value={p.name}
                                                onChange={e => fn.edit(p.city.id, { name: e.target.value })}
                                                className={cn(FIELD, 'ml-9 w-[calc(100%-2.25rem)]')}
                                                autoComplete="off"
                                            />
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        </RpSection>
                    ) : null}
                </div>
            )}
        </RpSheet>
    );
};

const Progress: React.FC<{ label: string; done: number; total: number }> = ({ label, done, total }) => (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
        <div className="h-2 w-full overflow-hidden rounded-full bg-rp-inset" aria-hidden>
            <div className="h-full rounded-full bg-rp-green transition-[width] duration-200" style={{ width: `${total > 0 ? Math.round((done / total) * 100) : 0}%` }} />
        </div>
        <span className="rp-tabular text-sm text-rp-ink">{label}</span>
    </div>
);

const Footer: React.FC<{ fn: FindNames; onClose: () => void; looking: boolean; writing: boolean; lookedUp: boolean; written: boolean }> = ({ fn, onClose, looking, writing, lookedUp, written }) => {
    if (looking) return <button type="button" onClick={fn.lookup.cancel} className={cn(BTN, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}><X size={16} aria-hidden /> Stop</button>;
    if (writing) return <button type="button" onClick={fn.apply.cancel} className={cn(BTN, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}><X size={16} aria-hidden /> Stop</button>;
    if (written) {
        const failed = fn.apply.state.failed.length > 0;
        return (
            <>
                {failed ? <button type="button" onClick={() => void fn.retry()} className={cn(BTN, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}><ArrowClockwise size={16} aria-hidden /> Retry</button> : null}
                {fn.apply.state.completed > 0 ? <button type="button" onClick={() => void fn.undo()} className={cn(BTN, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}><ArrowUndo size={16} aria-hidden /> Undo</button> : null}
                <button type="button" onClick={onClose} className={cn(BTN, failed ? 'bg-rp-inset text-rp-ink hover:bg-rp-line' : 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}>Done</button>
            </>
        );
    }
    if (lookedUp) {
        return (
            <>
                <button type="button" onClick={() => void fn.find()} className={cn(BTN, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}><ArrowClockwise size={16} aria-hidden /> Look again</button>
                <button type="button" disabled={fn.chosen.length === 0} onClick={() => void fn.writeNames()} className={cn(BTN, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}>
                    Save {fn.chosen.length} {fn.chosen.length === 1 ? 'name' : 'names'}
                </button>
            </>
        );
    }
    return (
        <button type="button" disabled={fn.candidates.length === 0} onClick={() => void fn.find()} className={cn(BTN, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}>
            <MagnifyingGlass size={16} aria-hidden /> Find {fn.candidates.length} {fn.candidates.length === 1 ? 'name' : 'names'}
        </button>
    );
};
