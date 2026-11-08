import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Transport, Trip } from '../../../types';
import { dataService } from '../../../services/mockDb';
import { errorMessage } from '../../../services/toast';
import { parseBookings, type ParseResult, type ParsedBooking } from '../../../utils/bookingParser';
import { pdfToText } from '../../../services/pdfText';
import { candidateToLeg, lookupFlight } from '../../../services/flightLookup';
import { addToTrip, bookingSpan, describeBookings, destinationOf, matchTrip, newTripFrom, placeLabel, planItems, type BookingChanges } from '../../../utils/bookingImport';
import { formatDate, formatDateRange } from '../../../utils/formatters';
import ParticleButton from '../../kokonutui/particle-button';
import { ArrowLeft, ArrowRight, Bed, Envelope, FileText, ForkKnife, Plus, Suitcase, Ticket, UploadSimple, X } from '../../ui/hugeicons';
import { RpSection, RpSheet, useIsMobile } from '../ui';
import { RpField, RP_FIELD } from '../fields';
import { TripMenu, type TripMenuItem } from './TripMenu';
import { CarrierCell } from '../journeys/JourneyParts';
import { cn } from '../../../utils/cn';

/**
 * Import a booking: paste a confirmation email or drop the saved email file, and the flights, trains,
 * car hire, hotel stays and reservations in it go into the trip they belong to (or a new one).
 * The parsing is rule-based (utils/bookingParser.ts); where it goes is utils/bookingImport.ts.
 */

export interface BookingImportResult {
    trip: Trip;
    /** The trip as it was before, or null when this import created it. */
    previous: Trip | null;
    /** Independent flights that moved into the trip (to put back on undo). */
    adopted: Transport[];
    added: number;
}

const BTN = 'inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-rp-muted';
const NEW = '__new__';
const AUTO = '__auto__';
const ACCEPT = '.eml,.html,.htm,.txt,.mht,.pdf,application/pdf';

const readText = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
});

const readBuffer = (file: File) => new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
});
const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

const today = () => new Date().toISOString().slice(0, 10);

const isIncomplete = (b: ParsedBooking) => b.kind === 'transport' && Boolean(b.incomplete);
const blankFlight = (): ParsedBooking => ({
    kind: 'transport', source: 'text', incomplete: true,
    transport: { mode: 'Flight', provider: '', identifier: '', confirmationCode: '', origin: '', destination: '', departureDate: today(), departureTime: '', arrivalDate: today(), arrivalTime: '' },
});

const SMALL = cn(RP_FIELD, '!min-h-11 !px-3 text-sm');

/** A flight found without both airports (or added by hand): look it up, or type the airports. */
const IncompleteRow: React.FC<{ booking: Extract<ParsedBooking, { kind: 'transport' }>; state: 'idle' | 'looking' | 'none'; onChange: (patch: Partial<Extract<ParsedBooking, { kind: 'transport' }>['transport']>) => void; onLookup: () => void }> = ({ booking, state, onChange, onLookup }) => {
    const t = booking.transport;
    const code = (v: string) => v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    return (
        <span className="flex min-w-0 flex-1 flex-col gap-2 py-1">
            <span className="text-xs text-rp-muted">
                {state === 'looking' ? 'Looking the flight up…' : state === 'none' ? "The flight wasn't found. Check the number and date, or type the airports." : 'Add the details to include this flight.'}
            </span>
            <span className="grid grid-cols-2 gap-2">
                <input aria-label="Flight number" value={t.identifier} onChange={e => onChange({ identifier: e.target.value.toUpperCase(), provider: e.target.value.trim().slice(0, 2).toUpperCase(), providerCode: e.target.value.trim().slice(0, 2).toUpperCase() })} placeholder="Flight, e.g. TP 1234" className={SMALL} />
                <input aria-label="Flight date" type="date" value={t.departureDate} onChange={e => onChange({ departureDate: e.target.value, arrivalDate: e.target.value })} className={cn(SMALL, 'rp-date rp-tabular')} />
                <input aria-label="From airport code" value={t.origin} onChange={e => onChange({ origin: code(e.target.value) })} placeholder="From, e.g. BRU" className={cn(SMALL, 'rp-tabular')} />
                <input aria-label="To airport code" value={t.destination} onChange={e => onChange({ destination: code(e.target.value) })} placeholder="To, e.g. LIS" className={cn(SMALL, 'rp-tabular')} />
            </span>
            <button type="button" onClick={onLookup} disabled={state === 'looking' || !t.identifier.trim() || !t.departureDate} className="inline-flex min-h-11 items-center self-start rounded-full bg-rp-inset px-4 text-xs font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted disabled:opacity-40">Look it up from the number</button>
        </span>
    );
};

const ItemRow: React.FC<{ booking: ParsedBooking; brandfetchApiKey?: string }> = ({ booking, brandfetchApiKey }) => {
    if (booking.kind === 'transport') {
        const t = booking.transport;
        const when = `${formatDate(t.departureDate, 'short-with-year')}${t.departureTime ? `, ${t.departureTime}` : ''}`;
        return (
            <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <CarrierCell t={t as Transport} size="sm" brandfetchApiKey={brandfetchApiKey} className="min-w-0" />
                <span className="flex min-w-0 shrink flex-col items-end text-right">
                    <span className="rp-tabular flex max-w-full items-center gap-1.5 text-sm font-semibold text-rp-ink">
                        <span className="truncate">{t.mode === 'Flight' ? t.origin : placeLabel(t.origin)}</span>
                        <ArrowRight size={12} className="shrink-0 text-rp-rust" aria-hidden />
                        <span className="truncate">{t.mode === 'Flight' ? t.destination : placeLabel(t.destination)}</span>
                    </span>
                    <span className="rp-tabular text-xs text-rp-muted">{when}</span>
                </span>
            </span>
        );
    }
    const isStay = booking.kind === 'stay';
    const IconC = isStay ? Bed : booking.activity.type === 'Dining' ? ForkKnife : Ticket;
    const title = isStay ? booking.stay.name : booking.activity.title;
    const sub = isStay
        ? formatDateRange(booking.stay.checkInDate, booking.stay.checkOutDate)
        : `${formatDate(booking.activity.date, 'short-with-year')}${booking.activity.time ? `, ${booking.activity.time}` : ''}`;
    const place = isStay ? booking.stay.address : booking.activity.location;
    return (
        <span className="flex min-w-0 flex-1 items-center gap-3">
            <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-rp-surface', isStay ? 'text-rp-ochre' : 'text-rp-green')}><IconC size={18} aria-hidden /></span>
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-rp-ink">{title}</span>
                <span className="rp-tabular truncate text-xs text-rp-muted">{sub}{place ? ` · ${place}` : ''}</span>
            </span>
        </span>
    );
};

export const BookingImportSheet: React.FC<{
    open: boolean;
    trips: Trip[];
    onClose: () => void;
    onImported: (result: BookingImportResult) => void;
    brandfetchApiKey?: string;
    /** Start with this trip chosen (from a trip's own page). */
    tripId?: string;
}> = ({ open, trips, onClose, onImported, brandfetchApiKey, tripId: presetTripId }) => {
    const fileInput = useRef<HTMLInputElement>(null);
    const mobile = useIsMobile();
    const [step, setStep] = useState<0 | 1>(0);
    const [text, setText] = useState('');
    const [pastedHtml, setPastedHtml] = useState('');
    const [fileName, setFileName] = useState('');
    const [fileBody, setFileBody] = useState('');
    const [dragging, setDragging] = useState(false);
    const [bookings, setBookings] = useState<ParsedBooking[]>([]);
    const [subject, setSubject] = useState<string | undefined>();
    const [target, setTarget] = useState<string>(NEW);
    const [choice, setChoice] = useState<string>(AUTO);
    const [manual, setManual] = useState(false);
    const [lookups, setLookups] = useState<Record<number, 'idle' | 'looking' | 'none'>>({});
    const [name, setName] = useState('');
    const [excluded, setExcluded] = useState<Set<number>>(new Set());
    const [independent, setIndependent] = useState<Transport[]>([]);
    const [error, setError] = useState('');

    const reset = () => { setStep(0); setText(''); setPastedHtml(''); setFileName(''); setFileBody(''); setBookings([]); setSubject(undefined); setTarget(NEW); setChoice(AUTO); setManual(false); setLookups({}); setName(''); setExcluded(new Set()); setError(''); };
    const close = () => { reset(); onClose(); };

    // Independent flights in the log: a booked flight that is already there moves into the trip.
    useEffect(() => {
        if (!open) return;
        let live = true;
        dataService.getIndependentTransports().then(list => { if (live) setIndependent((list || []) as Transport[]); }).catch(() => { /* adoption is optional */ });
        return () => { live = false; };
    }, [open]);

    const usable = useMemo(() => trips.filter(t => !t.archived && t.status !== 'Cancelled').sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '')), [trips]);
    const chosenTrip = target === NEW ? undefined : trips.find(t => t.id === target);
    const items = useMemo(() => planItems(bookings, chosenTrip, independent), [bookings, chosenTrip, independent]);
    const picked = items.filter((it, i) => !it.inTrip && !excluded.has(i) && !isIncomplete(it.booking));
    const already = items.filter(it => it.inTrip).length;
    const adopting = picked.filter(it => it.adopt).length;

    const takeFiles = async (files: File[]) => {
        setError('');
        if (!files.length) return;
        try {
            const parts: string[] = [];
            for (const file of files) {
                if (isPdf(file)) {
                    const text = await pdfToText(await readBuffer(file));
                    if (!text.trim()) throw new Error(`${file.name} has no text to read (it may be a scan). Try the confirmation email instead.`);
                    parts.push(text);
                } else parts.push(await readText(file));
            }
            setFileName(files.map(f => f.name).join(', '));
            setFileBody(parts.join('\n\n'));
        } catch (e) {
            setError(errorMessage(e, "That file couldn't be read."));
        }
    };

    const find = () => {
        setError('');
        const sources = fileBody ? [fileBody] : [pastedHtml, text].filter(s => s.trim());
        let result: ParseResult = { bookings: [] };
        for (const s of sources) {
            result = parseBookings(s, today());
            if (result.bookings.length) break;
        }
        if (!result.bookings.length) {
            setError("No bookings found in that. Try the whole email, a PDF of the ticket, or save the email as a file (in Gmail: ⋮ › Download message; in Apple Mail: File › Save As › Raw Message Source). You can also add the flight by hand below.");
            return;
        }
        setBookings(result.bookings);
        setSubject(result.subject);
        setExcluded(new Set());
        const match = presetTripId ? trips.find(t => t.id === presetTripId) : choice === AUTO ? matchTrip(usable, result.bookings) : choice === NEW ? undefined : trips.find(t => t.id === choice);
        setManual(false);
        setLookups({});
        setTarget(match ? match.id : NEW);
        setName(destinationOf(result.bookings));
        setStep(1);
    };

    const patchLeg = (i: number, patch: Partial<Extract<ParsedBooking, { kind: 'transport' }>['transport']>) => setBookings(list => list.map((b, j) => {
        if (j !== i || b.kind !== 'transport') return b;
        const transport = { ...b.transport, ...patch };
        return { ...b, transport, incomplete: !(transport.origin.length === 3 && transport.destination.length === 3 && transport.identifier.trim() && transport.departureDate) || undefined };
    }));

    const lookUp = async (i: number) => {
        const b = bookings[i];
        if (!b || b.kind !== 'transport') return;
        setLookups(l => ({ ...l, [i]: 'looking' }));
        try {
            const result = await lookupFlight(b.transport.identifier, b.transport.departureDate);
            const found = result.candidates.find(c => c.departure.iata && c.arrival.iata);
            if (!found) { setLookups(l => ({ ...l, [i]: 'none' })); return; }
            const leg = candidateToLeg(found);
            patchLeg(i, { origin: leg.origin || '', destination: leg.destination || '', providerCode: leg.providerCode || b.transport.providerCode, provider: leg.provider || b.transport.provider, departureTime: b.transport.departureTime || leg.departureTime || '', arrivalDate: leg.arrivalDate || b.transport.arrivalDate, arrivalTime: b.transport.arrivalTime || leg.arrivalTime || '' });
            setLookups(l => ({ ...l, [i]: 'idle' }));
        } catch {
            setLookups(l => ({ ...l, [i]: 'none' }));
        }
    };

    // A flight found by number and date alone is looked up once, so its airports usually fill in by themselves.
    const tried = useRef<Set<string>>(new Set());
    useEffect(() => {
        if (step !== 1) return;
        bookings.forEach((b, i) => {
            if (b.kind !== 'transport' || !b.incomplete || !b.transport.identifier.trim() || !b.transport.departureDate) return;
            const key = `${i}|${b.transport.identifier}|${b.transport.departureDate}`;
            if (tried.current.has(key)) return;
            tried.current.add(key);
            void lookUp(i);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, bookings.length]);

    const run = async () => {
        if (!picked.length) throw new Error('Nothing to add.');
        try {
            const kept = items.map((it, i) => (excluded.has(i) || isIncomplete(it.booking) ? { ...it, inTrip: true } : it));
            let changes: BookingChanges;
            if (chosenTrip) {
                changes = addToTrip(chosenTrip, kept);
                await dataService.applyBatch({ upsertTrips: [changes.trip], deleteFlights: changes.adoptedIds });
            } else {
                changes = newTripFrom(kept.filter(it => !it.inTrip), name, today());
                await dataService.applyBatch({ newTrips: [changes.trip], deleteFlights: changes.adoptedIds });
            }
            const adopted = independent.filter(f => changes.adoptedIds.includes(f.id));
            onImported({ trip: changes.trip, previous: chosenTrip ?? null, adopted, added: changes.added });
            reset();
            onClose();
        } catch (e) {
            setError(errorMessage(e, "The booking didn't save. Try again."));
            throw e;
        }
    };

    const span = bookingSpan(bookings);
    const tripItems: TripMenuItem[] = [
        { id: NEW, label: 'New trip', icon: Plus, selected: target === NEW, onSelect: () => setTarget(NEW) },
        ...usable.slice(0, 40).map((t, i) => ({ id: t.id, label: t.name, icon: Suitcase, selected: target === t.id, separated: i === 0, onSelect: () => setTarget(t.id) })),
    ];
    const hasInput = Boolean(fileBody || text.trim());
    const actionLabel = !picked.length ? 'Nothing to add' : chosenTrip ? `Add ${picked.length} to ${chosenTrip.name}` : `Create trip with ${picked.length}`;

    return (
        <RpSheet
            open={open}
            onClose={close}
            title="Import a booking"
            subtitle={step === 1 ? subject || fileName || undefined : undefined}
            width={480}
            footer={
                <>
                    {step === 1
                        ? <button type="button" onClick={() => { setStep(0); setError(''); }} className={cn(BTN, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}><ArrowLeft size={16} aria-hidden /> Back</button>
                        : <button type="button" onClick={close} className={cn(BTN, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}>Cancel</button>}
                    {step === 1 ? (
                        <ParticleButton onClick={run} disabled={!picked.length} pendingLabel="Adding" successLabel="Added" errorLabel="Couldn't add">{actionLabel}</ParticleButton>
                    ) : (
                        <button type="button" disabled={!hasInput} onClick={find} className={cn(BTN, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90 disabled:opacity-40')}>Find bookings <ArrowRight size={16} aria-hidden /></button>
                    )}
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <input ref={fileInput} type="file" multiple accept={ACCEPT} className="sr-only" tabIndex={-1} aria-label="Email file to import" onChange={e => { const f = Array.from(e.target.files || []); if (f.length) void takeFiles(f); e.target.value = ''; }} />
                {error ? <p role="alert" className="text-sm text-rp-rust">{error}</p> : null}

                {step === 0 ? (
                    <>
                        <p className="text-sm text-rp-muted">Flights, trains, buses, ferries, car hire, hotels and restaurant or event bookings are read from the confirmation email or PDF ticket and added to the trip they belong to.</p>
                        <div
                            onDragOver={e => { e.preventDefault(); setDragging(true); }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={e => { e.preventDefault(); setDragging(false); const f = Array.from(e.dataTransfer.files || []); if (f.length) void takeFiles(f); }}
                        >
                            <button
                                type="button"
                                onClick={() => fileInput.current?.click()}
                                className={cn('flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-rp-tile border-2 border-dashed px-4 py-6 text-center outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted', dragging ? 'border-rp-ink bg-rp-inset' : 'border-rp-line bg-rp-inset/60 hover:bg-rp-inset')}
                            >
                                {fileName ? <FileText size={22} className="text-rp-muted" aria-hidden /> : <UploadSimple size={22} className="text-rp-muted" aria-hidden />}
                                <span className="text-sm font-medium text-rp-ink">{fileName || (mobile ? 'Choose the email or PDF' : 'Drop the email or PDF here')}</span>
                                <span className="text-xs text-rp-muted">{fileName ? 'Choose other files' : mobile ? 'A PDF ticket or a saved email' : 'PDF, .eml or .html, or click to choose'}</span>
                            </button>
                        </div>
                        {!presetTripId ? (
                            <div className="flex min-h-11 items-center justify-between gap-3 rounded-rp-inset bg-rp-inset/60 px-4">
                                <span className="flex min-w-0 flex-col">
                                    <span className="text-xs text-rp-muted">Add to</span>
                                    <span className="truncate text-sm font-medium text-rp-ink">{choice === AUTO ? 'The trip it matches, or a new trip' : choice === NEW ? 'A new trip' : trips.find(t => t.id === choice)?.name || 'A trip'}</span>
                                </span>
                                <TripMenu label="Choose where to add the booking" pill={{ label: 'Change', icon: Suitcase }} items={[
                                    { id: AUTO, label: 'Match by dates', icon: Ticket, selected: choice === AUTO, onSelect: () => setChoice(AUTO) },
                                    { id: NEW, label: 'New trip', icon: Plus, selected: choice === NEW, onSelect: () => setChoice(NEW) },
                                    ...usable.slice(0, 40).map((t, i) => ({ id: t.id, label: t.name, icon: Suitcase, selected: choice === t.id, separated: i === 0, onSelect: () => setChoice(t.id) })),
                                ]} />
                            </div>
                        ) : null}
                        {fileName ? (
                            <button type="button" onClick={() => { setFileName(''); setFileBody(''); }} className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-full px-3 text-xs font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted"><X size={14} aria-hidden /> Use pasted text instead</button>
                        ) : (
                            <RpField label="Or paste the email" icon={Envelope}>
                                {id => (
                                    <textarea
                                        id={id}
                                        value={text}
                                        onChange={e => { setText(e.target.value); if (!e.target.value) setPastedHtml(''); }}
                                        onPaste={e => { const html = e.clipboardData.getData('text/html'); if (html) setPastedHtml(html); }}
                                        rows={8}
                                        placeholder="Paste the whole confirmation, including the booking reference and dates"
                                        className={cn(RP_FIELD, 'resize-y py-2.5 leading-relaxed')}
                                    />
                                )}
                            </RpField>
                        )}
                        <button type="button" onClick={() => { const match = presetTripId ? trips.find(t => t.id === presetTripId) : choice !== AUTO && choice !== NEW ? trips.find(t => t.id === choice) : undefined; setManual(true); setBookings([blankFlight()]); setSubject(undefined); setExcluded(new Set()); setLookups({}); setTarget(match ? match.id : NEW); setName(''); setError(''); setStep(1); }} className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-full px-3 text-xs font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                            <Plus size={14} aria-hidden /> Add a flight by hand
                        </button>
                    </>
                ) : (
                    <>
                        <p className="text-sm text-rp-ink">
                            Found <span className="font-medium">{describeBookings(bookings)}</span>
                            {span ? <span className="rp-tabular text-rp-muted"> · {formatDateRange(span.start, span.end)}</span> : null}
                        </p>

                        <RpSection title="Trip" icon={Suitcase}>
                            <div className="flex min-h-11 items-center justify-between gap-3 py-1">
                                <span className="flex min-w-0 flex-col">
                                    <span className="truncate text-sm text-rp-ink">{chosenTrip ? chosenTrip.name : 'A new trip'}</span>
                                    <span className="rp-tabular truncate text-xs text-rp-muted">
                                        {chosenTrip ? formatDateRange(chosenTrip.startDate, chosenTrip.endDate) : 'Booked, with these dates'}
                                    </span>
                                </span>
                                <TripMenu label="Choose the trip" pill={{ label: 'Change', icon: Suitcase }} items={tripItems} />
                            </div>
                            {!chosenTrip ? (
                                <RpField label="Trip name">
                                    {id => <input id={id} value={name} onChange={e => setName(e.target.value)} placeholder={destinationOf(bookings) || 'New trip'} className={RP_FIELD} />}
                                </RpField>
                            ) : null}
                        </RpSection>

                        {already || adopting ? (
                            <p className="text-xs text-rp-muted">
                                {already ? `${already} already in this trip, left out.` : ''}
                                {already && adopting ? ' ' : ''}
                                {adopting ? `${adopting} ${adopting === 1 ? 'flight is' : 'flights are'} in your flight log and will move into the trip.` : ''}
                            </p>
                        ) : null}

                        <ul className="flex flex-col rounded-rp-inset bg-rp-inset/60 px-3 py-1" aria-label="Bookings found">
                            {items.map((it, i) => {
                                const off = it.inTrip || excluded.has(i);
                                const label = it.booking.kind === 'transport' ? `${it.booking.transport.identifier || it.booking.transport.mode} ${it.booking.transport.origin} to ${it.booking.transport.destination}` : it.booking.kind === 'stay' ? it.booking.stay.name : it.booking.activity.title;
                                return (
                                    <li key={i} className="border-t border-rp-line first:border-t-0">
                                        <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
                                            <input
                                                type="checkbox"
                                                checked={!off}
                                                disabled={it.inTrip || isIncomplete(it.booking)}
                                                onChange={() => setExcluded(ex => { const n = new Set(ex); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                                                className="size-5 shrink-0 accent-rp-ink"
                                                aria-label={`Include ${label}`}
                                            />
                                            <span className={cn('flex min-w-0 flex-1 flex-col gap-0.5', off && 'opacity-50')}>
                                                {it.booking.kind === 'transport' && it.booking.incomplete
                                                    ? <IncompleteRow booking={it.booking} state={lookups[i] || 'idle'} onChange={patch => patchLeg(i, patch)} onLookup={() => void lookUp(i)} />
                                                    : <ItemRow booking={it.booking} brandfetchApiKey={brandfetchApiKey} />}
                                                {it.inTrip ? <span className="pl-12 text-xs text-rp-muted">Already in this trip</span> : it.adopt ? <span className="pl-12 text-xs text-rp-green">In your flight log: moves into the trip</span> : null}
                                            </span>
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                        {!manual && bookings.some(b => b.source === 'text') ? (
                            <p className="text-xs text-rp-muted">This email has no booking data, so it was read as text. Check the times before adding.</p>
                        ) : null}
                    </>
                )}
            </div>
        </RpSheet>
    );
};
