import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Transport, TransportMode, Trip } from '../../../types';
import { dataService } from '../../../services/mockDb';
import { flightImporter } from '../../../services/flightImportExport';
import ParticleButton from '../../kokonutui/particle-button';
import { ArrowLeft, ArrowRight, Check, Columns, FileText, Suitcase, UploadSimple, X } from '../../ui/hugeicons';
import { RpChip, RpSection, RpSheet, RpToggle } from '../ui';
import { TripMenu, type TripMenuItem } from '../trips/TripMenu';
import { extractIata } from '../../../hooks/useFlightLog';
import { CarrierCell } from './JourneyParts';
import { formatDate } from '../../../utils/formatters';
import { journeyKm, placeCode, type JourneyRecord } from '../../../utils/journeysModel';
import { errorMessage } from '../../../services/toast';
import { cn } from '../../../utils/cn';

/**
 * Bringing journeys in and taking them out. Import reads a spreadsheet (CSV, Excel) or a JSON file.
 * For a spreadsheet the columns are matched to flight fields by their names; anything it can't place
 * can be chosen under "Columns". The sheet shows what it found and what is already in the log, and
 * adds the rest as independent flights.
 */

const newId = () => Math.random().toString(36).slice(2, 11);
const key = (t: Transport) => [t.origin, t.destination, t.departureDate, t.identifier].map(v => String(v || '').trim().toUpperCase()).join('|');

type FieldKey = 'from' | 'to' | 'date' | 'depTime' | 'depDateTime' | 'arrDate' | 'arrTime' | 'arrDateTime' | 'airline' | 'flight' | 'pnr' | 'seat' | 'cabin' | 'cost' | 'aircraft' | 'mode';
interface FieldDef { key: FieldKey; label: string; match: RegExp }

/** The flight fields a spreadsheet column can fill, with the header names that usually mean them (first match wins). */
const FIELDS: FieldDef[] = [
    { key: 'from', label: 'From', match: /^(from|origin|departure airport|dep airport|orig|departure iata|from airport|leaving|departing|depart|leaving from|from city)$/ },
    { key: 'to', label: 'To', match: /^(to|destination|arrival airport|arr airport|dest|arrival iata|to airport|arriving|arrive|going to|to city|arriving at)$/ },
    { key: 'depDateTime', label: 'Departure (date and time)', match: /gate departure \(scheduled\)|scheduled departure|departure (date ?time|datetime)|departure scheduled|^dep(arture)? at$/ },
    { key: 'arrDateTime', label: 'Arrival (date and time)', match: /gate arrival \(scheduled\)|scheduled arrival|arrival (date ?time|datetime)|arrival scheduled|^arr(ival)? at$/ },
    { key: 'date', label: 'Date', match: /^(date|departure date|flight date|dep date|day|trip day|travel date|trip date)$/ },
    { key: 'depTime', label: 'Departure time', match: /^(departure time|dep time|time|std|scheduled departure time)$/ },
    { key: 'arrDate', label: 'Arrival date', match: /^(arrival date|arr date)$/ },
    { key: 'arrTime', label: 'Arrival time', match: /^(arrival time|arr time|sta|scheduled arrival time)$/ },
    { key: 'airline', label: 'Airline', match: /^(airline|carrier|operator|airline name)$/ },
    { key: 'flight', label: 'Flight number', match: /^(flight|flight number|flight no|flight #|flight no\.|number)$/ },
    { key: 'pnr', label: 'Confirmation', match: /^(pnr|confirmation|confirmation code|booking|booking reference|booking ref|record locator|reference|ref|conf|pnr code)$/ },
    { key: 'seat', label: 'Seat', match: /^(seat|seat number|seat no)$/ },
    { key: 'cabin', label: 'Class', match: /^(cabin|class|cabin class|travel class)$/ },
    { key: 'cost', label: 'Cost', match: /^(cost|price|fare|amount|total)$/ },
    { key: 'mode', label: 'Mode', match: /^(mode|type|transport|transport type|vehicle type)$/ },
    { key: 'aircraft', label: 'Aircraft', match: /^(aircraft|aircraft type|aircraft type name|plane|aircraft model)$/ },
];
const REQUIRED: FieldKey[] = ['from', 'to'];
type Mapping = Partial<Record<FieldKey, string>>;
type Row = Record<string, unknown>;

const detect = (headers: string[]): Mapping => {
    const out: Mapping = {};
    const used = new Set<string>();
    for (const f of FIELDS) {
        const h = headers.find(x => !used.has(x) && f.match.test(x.trim().toLowerCase()));
        if (h) { out[f.key] = h; used.add(h); }
    }
    return out;
};

const pad = (n: number) => String(n).padStart(2, '0');
/** A spreadsheet cell as date and time: Excel serial numbers, ISO text, or "d/m/y" text (day first or month first). */
const splitStamp = (v: unknown, dayFirst: boolean): { date: string; time: string } => {
    if (v == null || v === '') return { date: '', time: '' };
    if (typeof v === 'number' && Number.isFinite(v)) {
        const ms = Math.round((v - 25569) * 86400000);
        const d = new Date(ms);
        return { date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, time: v % 1 ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : '' };
    }
    const text = String(v).trim();
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2}))?/);
    if (iso) return { date: `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`, time: iso[4] ? `${pad(+iso[4])}:${iso[5]}` : '' };
    const slash = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2}))?/);
    if (slash) {
        let [a, b] = [+slash[1], +slash[2]];
        if (a > 12) [a, b] = [b, a]; // only a day-first reading is possible
        else if (b > 12) { /* only month-first is possible: a is the month */ }
        else if (dayFirst) [a, b] = [b, a];
        const year = +slash[3] < 100 ? 2000 + +slash[3] : +slash[3];
        return { date: `${year}-${pad(a)}-${pad(b)}`, time: slash[4] ? `${pad(+slash[4])}:${slash[5]}` : '' };
    }
    const hm = text.match(/^(\d{1,2}):(\d{2})/);
    if (hm) return { date: '', time: `${pad(+hm[1])}:${hm[2]}` };
    return { date: '', time: '' };
};
const timeOf = (v: unknown): string => {
    if (typeof v === 'number' && Number.isFinite(v)) { const f = v % 1; return `${pad(Math.floor(f * 24))}:${pad(Math.round((f * 24 * 60) % 60))}`; }
    return splitStamp(v, false).time;
};
const cabinOf = (v: unknown): Transport['travelClass'] | undefined => {
    const t = String(v || '').toLowerCase();
    if (!t) return undefined;
    if (t.includes('first') || t === 'f') return 'First';
    if (t.includes('business') || t === 'j' || t === 'c') return 'Business';
    if (t.includes('premium')) return 'Premium Economy';
    if (t.includes('econ') || t === 'y' || t === 'm') return 'Economy';
    return undefined;
};

/** Turns spreadsheet rows into flights using the column mapping. Rows without both places and a date are left out. */
/** The transport mode a cell names ("Train", "coach", "Rental car", "ferry"), or the fallback. */
const modeOf = (v: unknown, fallback: TransportMode): TransportMode => {
    const t = String(v ?? '').toLowerCase();
    if (/train|rail/.test(t)) return 'Train';
    if (/bus|coach/.test(t)) return 'Bus';
    if (/rental|hire/.test(t)) return 'Car Rental';
    if (/cruise/.test(t)) return 'Cruise';
    if (/ferry|boat/.test(t)) return 'Ferry';
    if (/car|drive|road/.test(t)) return 'Personal Car';
    if (/flight|plane|air/.test(t)) return 'Flight';
    return fallback;
};

const build = (rows: Row[], map: Mapping, dayFirst: boolean, modes: TransportMode[] = ['Flight']): Transport[] => {
    const cell = (r: Row, k: FieldKey) => (map[k] ? r[map[k]!] : undefined);
    const out: Transport[] = [];
    for (const r of rows) {
        const land = modes[0] !== 'Flight';
        const place = (v: unknown) => (land ? String(v ?? '').trim() : extractIata(String(v ?? '')).trim());
        const origin = place(cell(r, 'from'));
        const destination = place(cell(r, 'to'));
        const dep = map.depDateTime ? splitStamp(cell(r, 'depDateTime'), dayFirst) : { date: splitStamp(cell(r, 'date'), dayFirst).date, time: timeOf(cell(r, 'depTime')) };
        if (!origin || !destination || !dep.date) continue;
        const arr = map.arrDateTime ? splitStamp(cell(r, 'arrDateTime'), dayFirst) : { date: splitStamp(cell(r, 'arrDate'), dayFirst).date, time: timeOf(cell(r, 'arrTime')) };
        const cost = parseFloat(String(cell(r, 'cost') ?? '').replace(/[^\d.\-]/g, ''));
        out.push({
            id: newId(), itineraryId: newId(), type: 'One-Way', mode: map.mode && modes.length > 1 ? modeOf(cell(r, 'mode'), modes[0]) : modes[0],
            provider: String(cell(r, 'airline') ?? '').trim(), identifier: String(cell(r, 'flight') ?? '').trim().toUpperCase(),
            confirmationCode: String(cell(r, 'pnr') ?? '').trim().toUpperCase(), origin: land ? origin : origin.toUpperCase(), destination: land ? destination : destination.toUpperCase(),
            departureDate: dep.date, departureTime: dep.time || '12:00', arrivalDate: arr.date || dep.date, arrivalTime: arr.time || '',
            seatNumber: String(cell(r, 'seat') ?? '').trim() || undefined, travelClass: cabinOf(cell(r, 'cabin')),
            vehicleModel: String(cell(r, 'aircraft') ?? '').trim() || undefined, cost: Number.isFinite(cost) ? cost : undefined,
        });
    }
    return out;
};

const readBuffer = (file: File) => new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
});
const readText = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
});

type Step = 0 | 1 | 2;
const STEPS = ['File', 'Columns', 'Review'];
type Raw = unknown[][];

/** Header names from the first row (or "Column A…" when the file has none), and the rest as objects keyed by them. */
const shape = (raw: Raw, hasHeader: boolean): { headers: string[]; rows: Row[] } => {
    const width = Math.max(0, ...raw.map(r => r.length));
    const letter = (i: number) => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + (i % 26));
    const first = raw[0] || [];
    const used = new Set<string>();
    const headers = Array.from({ length: width }, (_, i) => {
        let h = hasHeader ? String(first[i] ?? '').trim() : '';
        if (!h) h = `Column ${letter(i)}`;
        while (used.has(h)) h = `${h} (${i + 1})`;
        used.add(h);
        return h;
    });
    const body = (hasHeader ? raw.slice(1) : raw).filter(r => r.some(c => String(c ?? '').trim() !== ''));
    return { headers, rows: body.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? '']))) };
};

export const ImportSheet: React.FC<{
    open: boolean;
    existing: JourneyRecord[];
    trips?: Trip[];
    onClose: () => void;
    onImported: (count: number) => void;
    brandfetchApiKey?: string;
    /** Kinds of transport this import creates (flights by default); with several, a "Mode" column can pick per row. */
    modes?: TransportMode[];
    noun?: { one: string; many: string };
}> = ({ open, existing, trips = [], onClose, onImported, brandfetchApiKey, modes = ['Flight'], noun = { one: 'flight', many: 'flights' } }) => {
    const fields = useMemo(() => FIELDS.filter(f => f.key !== 'mode' || modes.length > 1).map(f => (modes[0] === 'Flight' ? f : f.key === 'airline' ? { ...f, label: 'Operator' } : f.key === 'flight' ? { ...f, label: 'Service number' } : f.key === 'aircraft' ? { ...f, label: 'Vehicle' } : f.key === 'cabin' ? { ...f, label: 'Class' } : f)), [modes]);
    const input = useRef<HTMLInputElement>(null);
    const book = useRef<{ sheets: Record<string, Raw> } | null>(null);
    const [step, setStep] = useState<Step>(0);
    const [name, setName] = useState('');
    const [sheetNames, setSheetNames] = useState<string[]>([]);
    const [sheet, setSheet] = useState('');
    const [hasHeader, setHasHeader] = useState(true);
    const [raw, setRaw] = useState<Raw | null>(null);
    const [mapping, setMapping] = useState<Mapping>({});
    const [dayFirst, setDayFirst] = useState(false);
    const [folded, setFolded] = useState<Transport[] | null>(null);
    const [dupes, setDupes] = useState<'skip' | 'import'>('skip');
    const [excluded, setExcluded] = useState<Set<number>>(new Set());
    const [tripId, setTripId] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const reset = () => { book.current = null; setStep(0); setName(''); setSheetNames([]); setSheet(''); setHasHeader(true); setRaw(null); setMapping({}); setDayFirst(false); setFolded(null); setDupes('skip'); setExcluded(new Set()); setTripId(''); setError(''); };
    const close = () => { reset(); onClose(); };

    const { headers, rows } = useMemo(() => (raw ? shape(raw, hasHeader) : { headers: [] as string[], rows: [] as Row[] }), [raw, hasHeader]);
    // A new file, sheet or header choice starts the column match over.
    useEffect(() => {
        if (!raw) return;
        const auto = detect(headers);
        setMapping(auto);
        const dateCols = [auto.date, auto.depDateTime, auto.arrDate, auto.arrDateTime].filter(Boolean) as string[];
        let dayFirstSeen = false, monthFirstSeen = false;
        for (const r of rows) for (const c of dateCols) {
            const m = String(r[c] ?? '').match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-]\d{2,4}/);
            if (m) { if (+m[1] > 12) dayFirstSeen = true; if (+m[2] > 12) monthFirstSeen = true; }
        }
        setDayFirst(dayFirstSeen && !monthFirstSeen);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [raw, hasHeader]);

    const built = useMemo(() => (raw ? build(rows, mapping, dayFirst, modes) : folded || []), [raw, rows, mapping, dayFirst, folded]);
    const have = useMemo(() => new Set(existing.map(r => key(r.flight))), [existing]);
    const flags = useMemo(() => built.map(t => have.has(key(t))), [built, have]);
    const duplicateCount = flags.filter(Boolean).length;
    useEffect(() => { setExcluded(new Set()); }, [built.length, dupes]);
    const chosen = built.filter((_, i) => !excluded.has(i) && (dupes === 'import' || !flags[i]));
    const missing = raw ? REQUIRED.filter(k => !mapping[k]) : [];
    const noDate = raw ? !(mapping.date || mapping.depDateTime) : false;
    const dateColumns = [mapping.date, mapping.depDateTime, mapping.arrDate, mapping.arrDateTime].filter(Boolean) as string[];
    const ambiguous = Boolean(raw && rows.some(r => dateColumns.some(c => /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/.test(String(r[c] ?? '')))));

    const pickSheet = (n: string) => { setSheet(n); setRaw(book.current?.sheets[n] ?? null); };

    const pick = async (file: File) => {
        setBusy(true); setError(''); setName(file.name); setRaw(null); setFolded(null); setStep(0);
        try {
            const lower = file.name.toLowerCase();
            if (lower.endsWith('.json')) {
                const list = flightImporter.parseTransportsJson(await readText(file)).filter(t => modes.includes(t.mode || 'Flight')).map(t => ({ ...t, mode: t.mode || modes[0] }));
                if (list.length === 0) throw new Error(`No ${noun.many} were found in that file.`);
                setFolded(list); setSheetNames([]);
                setStep(2);
            } else if (lower.endsWith('.csv') || lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
                const XLSX = await import('xlsx');
                // A text file keeps its cells as text: otherwise "05/03/2026" would be turned into a date the wrong way round.
                const isText = /\.(csv|tsv|txt)$/.test(lower);
                const wb = XLSX.read(await readBuffer(file), { type: 'array', ...(isText ? { raw: true, codepage: 65001 } : {}) });
                const sheets: Record<string, Raw> = {};
                for (const n of wb.SheetNames) sheets[n] = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: '', raw: true, blankrows: false });
                const usable = wb.SheetNames.filter(n => sheets[n].length > 1);
                if (usable.length === 0) throw new Error('That file has no rows.');
                book.current = { sheets };
                setSheetNames(usable);
                setSheet(usable[0]);
                setRaw(sheets[usable[0]]);
            } else {
                throw new Error('Use a CSV or Excel file (or a JSON export).');
            }
        } catch (e) {
            setError(errorMessage(e, "That file couldn't be read."));
        } finally {
            setBusy(false);
        }
    };

    const run = async () => {
        if (chosen.length === 0) throw new Error('Nothing to import.');
        try {
            const list = chosen.map(t => ({ ...t, id: newId(), itineraryId: newId() }));
            const trip = trips.find(t => t.id === tripId);
            if (trip) await dataService.updateTrip({ ...trip, transports: [...(trip.transports || []), ...list.map(t => ({ ...t, itineraryId: `itinerary-${trip.id}` }))] });
            else await dataService.addFlights(list);
            onImported(list.length);
            reset();
            onClose();
        } catch (e) {
            setError(errorMessage(e, "The import didn't save. Try again."));
            throw e;
        }
    };

    const columnItems = (field: FieldDef): TripMenuItem[] => [
        { id: '', label: 'Not used', icon: X, selected: !mapping[field.key], onSelect: () => setMapping(m => { const n = { ...m }; delete n[field.key]; return n; }) },
        ...headers.map(h => ({ id: h, label: h, icon: Columns, selected: mapping[field.key] === h, onSelect: () => setMapping(m => ({ ...m, [field.key]: h })) })),
    ];
    const sample = (field: FieldDef) => { const h = mapping[field.key]; const v = h ? rows.find(r => String(r[h] ?? '').trim() !== '')?.[h] : undefined; return v == null ? '' : String(v).slice(0, 24); };

    const canNext = step === 0 ? Boolean(raw || folded) : step === 1 ? missing.length === 0 && !noDate && built.length > 0 : false;
    const last = step === 2;
    const tripName = trips.find(t => t.id === tripId)?.name;

    return (
        <RpSheet
            open={open}
            onClose={close}
            title={`Import ${noun.many}`}
            subtitle={name || undefined}
            width={480}
            footer={
                <>
                    {step > 0 && !(folded && step === 2) ? (
                        <button type="button" onClick={() => setStep(s => (s - 1) as Step)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-inset px-5 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted"><ArrowLeft size={16} aria-hidden /> Back</button>
                    ) : <button type="button" onClick={close} className="inline-flex min-h-11 items-center rounded-full bg-rp-inset px-5 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">Cancel</button>}
                    {last ? (
                        <ParticleButton onClick={run} disabled={chosen.length === 0} pendingLabel="Importing" successLabel="Imported" errorLabel="Couldn't import">
                            {chosen.length ? `Import ${chosen.length} ${chosen.length === 1 ? noun.one : noun.many}` : 'Import'}
                        </ParticleButton>
                    ) : (
                        <button type="button" disabled={!canNext} onClick={() => setStep(s => (s + 1) as Step)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink outline-none hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted disabled:opacity-40">Next <ArrowRight size={16} aria-hidden /></button>
                    )}
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <ol className="flex items-center gap-2" aria-label="Steps">
                    {STEPS.map((label, i) => (
                        <li key={label} aria-current={i === step ? 'step' : undefined} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium ${i === step ? 'bg-rp-ink text-rp-on-ink' : i < step ? 'bg-rp-green/15 text-rp-green' : 'bg-rp-inset text-rp-muted'}`}>
                            <span className="rp-tabular text-xs">{i < step ? <Check size={14} aria-hidden /> : i + 1}</span> {label}
                        </li>
                    ))}
                </ol>
                <input ref={input} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.json" className="sr-only" tabIndex={-1} aria-label="File to import" onChange={e => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ''; }} />
                {error ? <p role="alert" className="text-sm text-rp-rust">{error}</p> : null}

                {step === 0 ? (
                    <>
                        <button type="button" onClick={() => input.current?.click()} disabled={busy} className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-rp-tile border-2 border-dashed border-rp-line bg-rp-inset/60 px-4 py-6 text-center outline-none transition-colors duration-150 hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted disabled:opacity-60">
                            {name ? <FileText size={22} className="text-rp-muted" aria-hidden /> : <UploadSimple size={22} className="text-rp-muted" aria-hidden />}
                            <span className="text-sm font-medium text-rp-ink">{name || 'Choose a file'}</span>
                            <span className="text-xs text-rp-muted">{name ? 'Choose another file' : 'CSV or Excel'}</span>
                        </button>
                        {sheetNames.length > 1 ? (
                            <div role="group" aria-label="Worksheet" className="flex flex-wrap gap-2">
                                {sheetNames.map(n => <RpChip key={n} selected={sheet === n} onClick={() => pickSheet(n)}>{n}</RpChip>)}
                            </div>
                        ) : null}
                        {raw ? (
                            <>
                                <RpToggle label="First row has the column names" checked={hasHeader} onChange={setHasHeader} />
                                <div className="flex flex-col gap-1">
                                    <p className="px-1 text-xs font-medium text-rp-muted">{rows.length} {rows.length === 1 ? 'row' : 'rows'}, {headers.length} columns</p>
                                    <div className="custom-scrollbar overflow-x-auto rounded-rp-inset bg-rp-inset/60">
                                        <table className="min-w-full text-left text-xs">
                                            <thead><tr>{headers.slice(0, 8).map(h => <th key={h} className="whitespace-nowrap px-3 py-2 font-medium text-rp-muted">{h}</th>)}</tr></thead>
                                            <tbody>{rows.slice(0, 4).map((r, i) => <tr key={i} className="border-t border-rp-line">{headers.slice(0, 8).map(h => <td key={h} className="rp-tabular max-w-[9rem] truncate whitespace-nowrap px-3 py-2 text-rp-ink">{String(r[h] ?? '')}</td>)}</tr>)}</tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        ) : null}
                    </>
                ) : null}

                {step === 1 ? (
                    <>
                        {missing.length || noDate ? <p role="alert" className="text-sm text-rp-rust">Choose the column for {[...missing.map(k => fields.find(f => f.key === k)!.label), ...(noDate ? ['the date'] : [])].join(' and ')}.</p> : <p className="text-sm text-rp-muted">{Object.keys(mapping).length} of {headers.length} columns matched. Change any that are wrong.</p>}
                        <RpSection title="Match columns" icon={Columns} action={<button type="button" onClick={() => setMapping(detect(headers))} className="inline-flex min-h-11 items-center rounded-full px-3 text-xs font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">Detect again</button>}>
                            <div className="flex flex-col py-1">
                                {fields.map(f => (
                                    <div key={f.key} className="flex min-h-14 items-center justify-between gap-3 border-t border-rp-line first:border-t-0">
                                        <span className="flex min-w-0 flex-col">
                                            <span className="text-sm text-rp-ink">{f.label}{REQUIRED.includes(f.key) ? <span className="text-rp-rust"> *</span> : null}</span>
                                            {sample(f) ? <span className="rp-tabular truncate text-xs text-rp-muted">{sample(f)}</span> : null}
                                        </span>
                                        <TripMenu label={`Column for ${f.label}`} pill={{ label: mapping[f.key] || 'Not used', icon: Columns }} items={columnItems(f)} />
                                    </div>
                                ))}
                            </div>
                        </RpSection>
                        {ambiguous ? (
                            <div role="group" aria-label="Date order" className="flex flex-wrap gap-2">
                                <RpChip selected={!dayFirst} onClick={() => setDayFirst(false)}>Month first (3/9/2026 is 9 March)</RpChip>
                                <RpChip selected={dayFirst} onClick={() => setDayFirst(true)}>Day first (3/9/2026 is 3 September)</RpChip>
                            </div>
                        ) : null}
                    </>
                ) : null}

                {step === 2 ? (
                    <>
                        <p className="text-sm text-rp-ink">
                            <span className="rp-tabular font-medium">{chosen.length}</span> {chosen.length === 1 ? noun.one : noun.many} to import
                            {duplicateCount ? <span className="text-rp-muted"> · {duplicateCount} already in your log</span> : null}
                            {raw && built.length < rows.length ? <span className="text-rp-muted"> · {rows.length - built.length} rows left out (no places or date)</span> : null}
                        </p>
                        {duplicateCount ? (
                            <div role="group" aria-label="Duplicates" className="flex flex-wrap gap-2">
                                <RpChip selected={dupes === 'skip'} onClick={() => setDupes('skip')}>Skip duplicates</RpChip>
                                <RpChip selected={dupes === 'import'} onClick={() => setDupes('import')}>Import them too</RpChip>
                            </div>
                        ) : null}
                        {trips.length > 0 ? (
                            <RpSection title="Add to a trip" icon={Suitcase}>
                                <div className="flex min-h-11 items-center justify-between gap-3 py-1">
                                    <span className="min-w-0 truncate text-sm text-rp-ink">{tripName || `Keep them as independent ${noun.many}`}</span>
                                    <TripMenu label="Choose a trip" pill={{ label: tripName ? 'Change' : 'Add to trip', icon: Suitcase }} items={[{ id: '', label: 'No trip', icon: X, selected: !tripId, onSelect: () => setTripId('') }, ...trips.slice(0, 40).map(t => ({ id: t.id, label: t.name, icon: Suitcase, selected: t.id === tripId, onSelect: () => setTripId(t.id) }))]} />
                                </div>
                            </RpSection>
                        ) : null}
                        <ul className="flex flex-col rounded-rp-inset bg-rp-inset/60 px-3 py-1">
                            {built.slice(0, 40).map((t, i) => {
                                const dup = flags[i];
                                const off = excluded.has(i) || (dup && dupes === 'skip');
                                return (
                                    <li key={i} className="border-t border-rp-line first:border-t-0">
                                        <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
                                            <input type="checkbox" checked={!off} disabled={dup && dupes === 'skip'} onChange={() => setExcluded(ex => { const n = new Set(ex); if (n.has(i)) n.delete(i); else n.add(i); return n; })} className="size-5 shrink-0 accent-rp-ink" aria-label={`Include ${t.origin} to ${t.destination} on ${t.departureDate}`} />
                                            <span className={`flex min-w-0 flex-1 items-center justify-between gap-3 ${off ? 'opacity-50' : ''}`}>
                                                <CarrierCell t={t} size="sm" brandfetchApiKey={brandfetchApiKey} className="min-w-0" />
                                                <span className="flex shrink-0 flex-col items-end">
                                                    <span className="rp-tabular flex items-center gap-1.5 text-sm font-semibold text-rp-ink">{placeCode(t.origin, t.mode)} <ArrowRight size={12} className="text-rp-rust" aria-hidden /> {placeCode(t.destination, t.mode)}</span>
                                                    <span className="rp-tabular text-xs text-rp-muted">{formatDate(t.departureDate, 'short-with-year')}{dup ? ' · in your log' : ''}</span>
                                                </span>
                                            </span>
                                        </label>
                                    </li>
                                );
                            })}
                            {built.length > 40 ? <li className="rp-tabular py-2 text-center text-xs text-rp-muted">+{built.length - 40} more, imported with the rest</li> : null}
                        </ul>
                    </>
                ) : null}
            </div>
        </RpSheet>
    );
};

export type ExportFormat = 'csv' | 'xlsx' | 'json' | 'airtrail';

const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Writes the given journeys to a file in the chosen format and downloads it. */
export const exportJourneys = async (records: JourneyRecord[], format: ExportFormat, base = 'wandergrid-flights'): Promise<void> => {
    // Land and sea journeys have their own columns (the flight formats only carry flights).
    if (records.some(r => r.flight.mode !== 'Flight')) return exportLandJourneys(records, format === 'airtrail' ? 'json' : format, base === 'wandergrid-flights' ? 'wandergrid-journeys' : base);
    const bundle = [{
        id: 'export', name: 'Flights', location: '', startDate: '', endDate: '', status: 'Past' as const, participants: [],
        transports: records.map(r => r.flight),
    }];
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'csv') download(new Blob([flightImporter.exportCsv(bundle as any)], { type: 'text/csv;charset=utf-8' }), `${base}-${stamp}.csv`);
    else if (format === 'json') download(new Blob([flightImporter.exportJson(bundle as any)], { type: 'application/json' }), `${base}-${stamp}.json`);
    else if (format === 'airtrail') download(new Blob([flightImporter.exportAirTrailJson(bundle as any)], { type: 'application/json' }), `${base}-airtrail-${stamp}.json`);
    else download(new Blob([await flightImporter.exportXlsx(bundle as any)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${base}-${stamp}.xlsx`);
};

const LAND_COLUMNS: [string, (t: Transport) => string | number | undefined][] = [
    ['Date', t => t.departureDate], ['Mode', t => t.mode], ['Operator', t => t.provider], ['Number', t => t.identifier], ['From', t => t.origin], ['To', t => t.destination],
    ['Departure time', t => t.departureTime], ['Arrival date', t => t.arrivalDate], ['Arrival time', t => t.arrivalTime], ['Distance km', t => t.distance], ['Cost', t => t.cost],
    ['Confirmation', t => t.confirmationCode], ['Stops', t => (t.waypoints || []).map(w => w.name).join(' > ')], ['Notes', t => t.notes],
];

/** Writes land and sea journeys as CSV, Excel or JSON. */
export const exportLandJourneys = async (records: JourneyRecord[], format: 'csv' | 'xlsx' | 'json', base = 'wandergrid-journeys'): Promise<void> => {
    const stamp = new Date().toISOString().slice(0, 10);
    const rows = records.map(r => Object.fromEntries(LAND_COLUMNS.map(([h, get]) => [h, get(r.flight) ?? ''])));
    if (format === 'json') { download(new Blob([JSON.stringify(records.map(r => r.flight), null, 2)], { type: 'application/json' }), `${base}-${stamp}.json`); return; }
    if (format === 'csv') {
        const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const csv = [LAND_COLUMNS.map(([h]) => esc(h)).join(','), ...rows.map(r => LAND_COLUMNS.map(([h]) => esc(r[h])).join(','))].join('\n');
        download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${base}-${stamp}.csv`);
        return;
    }
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Journeys');
    download(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${base}-${stamp}.xlsx`);
};
