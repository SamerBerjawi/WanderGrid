import React, { useEffect, useMemo, useState } from 'react';
import type { Carrier } from '../../../types';
import type { SettingsData } from '../../../hooks/useSettingsData';
import { dataService } from '../../../services/mockDb';
import { getCarrierName } from '../../../utils/flightData';
import { errorMessage, toast } from '../../../services/toast';
import ParticleButton from '../../kokonutui/particle-button';
import { RpEmpty, RpLogo, RpSheet } from '../ui';
import { RpField } from '../fields';
import { useUndoToast } from '../UndoToast';
import { Airplane, ArrowsClockwise, Globe, MagnifyingGlass, PencilSimple, Plus, Tag, Trash } from '../../ui/hugeicons';
import { cn } from '../../../utils/cn';
import { card, FIELD, CANCEL_BTN, PaneHeader } from './SettingsParts';

const SHOWN = 8;

const POPULAR: Array<{ name: string; code: string; domain: string }> = [
    { name: 'Delta Air Lines', code: 'DL', domain: 'delta.com' },
    { name: 'United Airlines', code: 'UA', domain: 'united.com' },
    { name: 'American Airlines', code: 'AA', domain: 'aa.com' },
    { name: 'British Airways', code: 'BA', domain: 'britishairways.com' },
    { name: 'Lufthansa', code: 'LH', domain: 'lufthansa.com' },
    { name: 'Emirates', code: 'EK', domain: 'emirates.com' },
    { name: 'Air France', code: 'AF', domain: 'airfrance.com' },
    { name: 'Qatar Airways', code: 'QR', domain: 'qatarairways.com' },
    { name: 'Singapore Airlines', code: 'SQ', domain: 'singaporeair.com' },
    { name: 'KLM', code: 'KL', domain: 'klm.com' },
    { name: 'Middle East Airlines', code: 'ME', domain: 'mea.com.lb' },
    { name: 'Turkish Airlines', code: 'TK', domain: 'turkishairlines.com' },
];

/** Known sites for airline names found in the log. */
const DOMAIN_HINTS: Record<string, string> = {
    deltaairlines: 'delta.com', delta: 'delta.com', americanairlines: 'aa.com', american: 'aa.com',
    unitedairlines: 'united.com', united: 'united.com', southwestairlines: 'southwest.com', southwest: 'southwest.com',
    britishairways: 'britishairways.com', emirates: 'emirates.com', qatarairways: 'qatarairways.com', qatar: 'qatarairways.com',
    lufthansa: 'lufthansa.com', airfrance: 'airfrance.com', klm: 'klm.com', singaporeairlines: 'singaporeair.com',
    cathaypacific: 'cathaypacific.com', ana: 'ana.co.jp', japanairlines: 'jal.com', jal: 'jal.com',
    ryanair: 'ryanair.com', easyjet: 'easyjet.com',
};

/** A carrier's name, with a bare code ("DL") turned into the airline's name when it is known. */
const cleanName = (c: Carrier) => {
    if ((c.name.length <= 3 && c.name === c.name.toUpperCase()) || c.name === c.code) {
        const resolved = getCarrierName(c.code);
        if (resolved && resolved !== c.code) return resolved;
    }
    return c.name;
};

const newId = () => Math.random().toString(36).slice(2, 11);

const CarrierSheet: React.FC<{
    open: boolean;
    carrier: Carrier | null;
    carriers: Carrier[];
    onClose: () => void;
    onSave: (carrier: Carrier) => Promise<void>;
    onRemove: (carrier: Carrier) => Promise<void>;
}> = ({ open, carrier, carriers, onClose, onSave, onRemove }) => {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [domain, setDomain] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        if (!open) return;
        setName(carrier ? cleanName(carrier) : '');
        setCode(carrier?.code ?? '');
        setDomain(carrier?.domain ?? '');
        setError('');
    }, [open, carrier]);

    const save = async () => {
        const cleanCode = code.trim().toUpperCase();
        const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        if (!name.trim() || !cleanCode || !cleanDomain) { setError('Fill in the name, code and website.'); throw new Error('Incomplete'); }
        if (carriers.some(c => c.code === cleanCode && c.id !== carrier?.id)) { setError(`The code ${cleanCode} is already listed.`); throw new Error('Duplicate'); }
        setError('');
        try {
            await onSave({ id: carrier?.id ?? newId(), name: name.trim(), code: cleanCode, domain: cleanDomain });
            onClose();
        } catch (e) {
            setError(errorMessage(e, "That didn't save. Try again."));
            throw e;
        }
    };

    return (
        <RpSheet
            open={open}
            onClose={onClose}
            title={carrier ? 'Edit carrier' : 'Add carrier'}
            subtitle="The code and website decide which logo shows."
            footer={
                <>
                    <button type="button" onClick={onClose} className={CANCEL_BTN}>Cancel</button>
                    <ParticleButton onClick={save} successDuration={700} onError={() => undefined} className="!min-h-11">Save changes</ParticleButton>
                </>
            }
        >
            <div className="flex flex-col gap-2">
                {!carrier ? (
                    <div className="flex flex-col gap-1.5 py-1.5">
                        <span className="text-xs text-rp-muted">Start from</span>
                        <div className="-m-3 flex gap-2 overflow-x-auto p-3 [scrollbar-width:none]">
                            {POPULAR.filter(p => !carriers.some(c => c.code === p.code)).slice(0, 8).map(p => (
                                <button key={p.code} type="button" onClick={() => { setName(p.name); setCode(p.code); setDomain(p.domain); }} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-rp-inset px-3 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">
                                    <RpLogo name={p.code} carriers={[{ id: p.code, name: p.name, code: p.code, domain: p.domain }]} fallback={Airplane} size="sm" />
                                    {p.name}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}
                <RpField label="Name" icon={Airplane}>
                    {id => <input id={id} value={name} onChange={e => setName(e.target.value)} placeholder="Delta Air Lines" autoComplete="off" autoFocus className={FIELD} />}
                </RpField>
                <div className="grid grid-cols-[6rem_1fr] gap-3">
                    <RpField label="Code" icon={Tag}>
                        {id => <input id={id} value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={3} placeholder="DL" autoComplete="off" className={cn(FIELD, 'font-mono uppercase')} />}
                    </RpField>
                    <RpField label="Website" icon={Globe}>
                        {id => <input id={id} value={domain} onChange={e => setDomain(e.target.value)} placeholder="delta.com" autoComplete="off" inputMode="url" className={FIELD} />}
                    </RpField>
                </div>
                {error ? <p role="alert" className="text-sm text-rp-rust">{error}</p> : null}
                {carrier ? (
                    <div>
                        <button type="button" onClick={() => { void onRemove(carrier).then(onClose); }} className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-rp-rust outline-none hover:bg-rp-rust/10 focus-visible:ring-2 focus-visible:ring-rp-muted">
                            <Trash size={16} aria-hidden /> Remove carrier
                        </button>
                    </div>
                ) : null}
            </div>
        </RpSheet>
    );
};

export const CarriersPane: React.FC<{ data: SettingsData }> = ({ data }) => {
    const { settings } = data;
    const undo = useUndoToast();
    const [sheet, setSheet] = useState<{ carrier: Carrier | null } | null>(null);
    const [query, setQuery] = useState('');
    const [all, setAll] = useState(false);

    const carriers = settings?.carriers ?? [];
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return carriers
            .filter(c => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.domain.toLowerCase().includes(q))
            .sort((a, b) => cleanName(a).localeCompare(cleanName(b)));
    }, [carriers, query]);
    if (!settings) return null;

    const persist = (next: Carrier[]) => data.save({ carriers: next });
    const save = async (carrier: Carrier) => {
        await persist(carriers.some(c => c.id === carrier.id) ? carriers.map(c => (c.id === carrier.id ? carrier : c)) : [...carriers, carrier]);
    };
    const remove = async (carrier: Carrier) => {
        try {
            await persist(carriers.filter(c => c.id !== carrier.id));
            undo.show(`Removed ${cleanName(carrier)}`, async () => { await persist([...carriers]); });
        } catch (e) {
            toast.error(errorMessage(e, "The carrier couldn't be removed."));
        }
    };

    /** Adds the airlines found in the flight log that are not listed yet. */
    const autoFill = async () => {
        const [trips, flights] = await Promise.all([dataService.getTrips(), dataService.getFlights()]);
        const legs: any[] = [...flights];
        trips.forEach((t: any) => (t.transports || []).forEach((x: any) => { if (x.mode === 'Flight') legs.push(x); }));
        const found = new Map<string, Carrier>();
        legs.forEach(f => {
            const raw = String(f.carrierCode || f.flightNumber?.substring(0, 2) || '').trim().toUpperCase();
            if (raw.length < 2 || carriers.some(c => c.code === raw) || found.has(raw)) return;
            const name = f.carrierName || f.operator || f.airline || getCarrierName(raw) || raw;
            const simple = String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
            found.set(raw, { id: newId(), name, code: raw, domain: DOMAIN_HINTS[simple] || `${simple || 'airline'}.com` });
        });
        if (found.size === 0) { toast.info(legs.length === 0 ? 'No flights to read carriers from.' : 'No new carriers in your flights.'); return; }
        await persist([...carriers, ...found.values()]);
        toast.success(`Added ${found.size} ${found.size === 1 ? 'carrier' : 'carriers'}`);
    };

    const shown = all || query ? filtered : filtered.slice(0, SHOWN);

    return (
        <section aria-label="Carriers">
            <PaneHeader
                icon={Airplane}
                title="Carriers"
                count={carriers.length}
                actions={
                    <>
                        <ParticleButton variant="inset" onClick={autoFill} successDuration={900} onError={() => undefined} pendingLabel="Reading flights" successLabel="Done" errorLabel="Try again" icon={<ArrowsClockwise aria-hidden />}>
                            Fill from flights
                        </ParticleButton>
                        <button type="button" onClick={() => setSheet({ carrier: null })} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink outline-none hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-canvas">
                            <Plus size={16} aria-hidden /> Add carrier
                        </button>
                    </>
                }
            />
            <div className={cn(card, 'p-2 sm:p-3')}>
                {carriers.length === 0 ? (
                    <RpEmpty title="No carriers yet" action={<button type="button" onClick={() => setSheet({ carrier: null })} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink"><Plus size={16} aria-hidden /> Add carrier</button>}>
                        Set a website for an airline to fix its logo.
                    </RpEmpty>
                ) : (
                    <>
                        {carriers.length > SHOWN ? (
                            <label className="relative mb-2 flex items-center">
                                <span className="sr-only">Search carriers</span>
                                <MagnifyingGlass size={16} className="pointer-events-none absolute left-4 text-rp-muted" aria-hidden />
                                <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search carriers" className="min-h-11 w-full rounded-full bg-rp-inset pr-4 pl-10 text-sm text-rp-ink outline-none placeholder:text-rp-muted focus-visible:ring-2 focus-visible:ring-rp-muted [&::-webkit-search-cancel-button]:hidden" />
                            </label>
                        ) : null}
                        {filtered.length === 0 ? (
                            <RpEmpty title="No match">Nothing named “{query}”.</RpEmpty>
                        ) : (
                            <ul className="flex flex-col">
                                {shown.map(c => (
                                    <li key={c.id} className="flex min-h-14 items-center gap-3 rounded-rp-inset px-2 hover:bg-rp-inset sm:px-3">
                                        <RpLogo name={c.name} carriers={carriers} brandfetchApiKey={settings.brandfetchApiKey} fallback={Airplane} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium">{cleanName(c)}</span>
                                            <span className="block truncate text-xs text-rp-muted"><span className="font-mono">{c.code}</span> · {c.domain}</span>
                                        </span>
                                        <button type="button" aria-label={`Edit ${cleanName(c)}`} onClick={() => setSheet({ carrier: c })} className="flex size-11 shrink-0 items-center justify-center rounded-full text-rp-muted outline-none hover:bg-rp-line hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                                            <PencilSimple size={16} aria-hidden />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {!query && filtered.length > SHOWN ? (
                            <div className="flex justify-center pt-1">
                                <button type="button" onClick={() => setAll(v => !v)} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                                    {all ? 'Show fewer' : `Show all ${filtered.length}`}
                                </button>
                            </div>
                        ) : null}
                    </>
                )}
            </div>
            <CarrierSheet open={sheet !== null} carrier={sheet?.carrier ?? null} carriers={carriers} onClose={() => setSheet(null)} onSave={save} onRemove={remove} />
            {undo.host}
        </section>
    );
};
