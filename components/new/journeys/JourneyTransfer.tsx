import React, { useMemo, useRef, useState } from 'react';
import type { Transport } from '../../../types';
import { dataService } from '../../../services/mockDb';
import { flightImporter } from '../../../services/flightImportExport';
import ParticleButton from '../../kokonutui/particle-button';
import { ArrowRight, Columns, FileText, UploadSimple, X } from '../../ui/hugeicons';
import { RpChip, RpSection, RpSheet } from '../ui';
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

type FieldKey = 'from' | 'to' | 'date' | 'depTime' | 'depDateTime' | 'arrDate' | 'arrTime' | 'arrDateTime' | 'airline' | 'flight' | 'pnr' | 'seat' | 'cabin' | 'cost' | 'aircraft';
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
const build = (rows: Row[], map: Mapping, dayFirst: boolean): Transport[] => {
    const cell = (r: Row, k: FieldKey) => (map[k] ? r[map[k]!] : undefined);
    const out: Transport[] = [];
    for (const r of rows) {
        const origin = extractIata(String(cell(r, 'from') ?? '')).trim();
        const destination = extractIata(String(cell(r, 'to') ?? '')).trim();
        const dep = map.depDateTime ? splitStamp(cell(r, 'depDateTime'), dayFirst) : { date: splitStamp(cell(r, 'date'), dayFirst).date, time: timeOf(cell(r, 'depTime')) };
        if (!origin || !destination || !dep.date) continue;
        const arr = map.arrDateTime ? splitStamp(cell(r, 'arrDateTime'), dayFirst) : { date: splitStamp(cell(r, 'arrDate'), dayFirst).date, time: timeOf(cell(r, 'arrTime')) };
        const cost = parseFloat(String(cell(r, 'cost') ?? '').replace(/[^\d.\-]/g, ''));
        out.push({
            id: newId(), itineraryId: newId(), type: 'One-Way', mode: 'Flight',
            provider: String(cell(r, 'airline') ?? '').trim(), identifier: String(cell(r, 'flight') ?? '').trim().toUpperCase(),
            confirmationCode: String(cell(r, 'pnr') ?? '').trim().toUpperCase(), origin: origin.toUpperCase(), destination: destination.toUpperCase(),
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

export const ImportSheet: React.FC<{
    open: boolean;
    existing: JourneyRecord[];
    onClose: () => void;
    onImported: (count: number) => void;
    brandfetchApiKey?: string;
}> = ({ open, existing, onClose, onImported, brandfetchApiKey }) => {
    const input = useRef<HTMLInputElement>(null);
    const [name, setName] = useState('');
    const [rows, setRows] = useState<Row[] | null>(null);
    const [headers, setHeaders] = useState<string[]>([]);
    const [mapping, setMapping] = useState<Mapping>({});
    const [dayFirst, setDayFirst] = useState(false);
    const [folded, setFolded] = useState<Transport[] | null>(null);
    const [showColumns, setShowColumns] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const reset = () => { setName(''); setRows(null); setHeaders([]); setMapping({}); setFolded(null); setShowColumns(false); setError(''); setDayFirst(false); };
    const close = () => { reset(); onClose(); };

    const found = useMemo(() => (rows ? build(rows, mapping, dayFirst) : folded), [rows, mapping, dayFirst, folded]);
    const have = useMemo(() => new Set(existing.map(r => key(r.flight))), [existing]);
    const fresh = (found || []).filter(t => !have.has(key(t)));
    const skipped = (found?.length || 0) - fresh.length;
    const missing = REQUIRED.filter(k => !mapping[k]);
    const dateColumns = [mapping.date, mapping.depDateTime, mapping.arrDate, mapping.arrDateTime].filter(Boolean) as string[];
    const ambiguous = Boolean(rows?.some(r => dateColumns.some(c => /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/.test(String(r[c] ?? '')))));

    const pick = async (file: File) => {
        setBusy(true);
        setError('');
        setName(file.name);
        setRows(null);
        setFolded(null);
        try {
            const lower = file.name.toLowerCase();
            if (lower.endsWith('.json')) {
                const list = flightImporter.parseTransportsJson(await readText(file)).filter(t => !t.mode || t.mode === 'Flight').map(t => ({ ...t, mode: 'Flight' as const }));
                if (list.length === 0) throw new Error('No flights were found in that file.');
                setFolded(list);
            } else if (lower.endsWith('.csv') || lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
                const XLSX = await import('xlsx');
                const wb = XLSX.read(await readBuffer(file), { type: 'array' });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                const data = XLSX.utils.sheet_to_json<Row>(sheet, { defval: '', raw: true });
                if (data.length === 0) throw new Error('That file has no rows.');
                const cols = Object.keys(data[0]);
                const auto = detect(cols);
                setHeaders(cols);
                setMapping(auto);
                setRows(data);
                // A date like 20/03/2026 can only be day first; 03/20/2026 only month first.
                const dateCols = [auto.date, auto.depDateTime, auto.arrDate, auto.arrDateTime].filter(Boolean) as string[];
                let dayFirstSeen = false, monthFirstSeen = false;
                for (const r of data) for (const c of dateCols) {
                    const m = String(r[c] ?? '').match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-]\d{2,4}/);
                    if (m) { if (+m[1] > 12) dayFirstSeen = true; if (+m[2] > 12) monthFirstSeen = true; }
                }
                setDayFirst(dayFirstSeen && !monthFirstSeen);
                setShowColumns(REQUIRED.some(k => !auto[k]) || !(auto.date || auto.depDateTime));
            } else {
                throw new Error('Use a CSV, Excel or JSON file.');
            }
        } catch (e) {
            setError(errorMessage(e, "That file couldn't be read."));
        } finally {
            setBusy(false);
        }
    };

    const run = async () => {
        if (fresh.length === 0) throw new Error('Nothing new to import.');
        try {
            await dataService.addFlights(fresh.map(t => ({ ...t, id: newId(), itineraryId: newId() })));
            onImported(fresh.length);
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

    return (
        <RpSheet
            open={open}
            onClose={close}
            title="Import flights"
            width={460}
            footer={
                <>
                    <button type="button" onClick={close} className="inline-flex min-h-11 items-center rounded-full bg-rp-inset px-5 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">Cancel</button>
                    <ParticleButton onClick={run} disabled={fresh.length === 0} pendingLabel="Importing" successLabel="Imported" errorLabel="Couldn't import">
                        {fresh.length ? `Import ${fresh.length} ${fresh.length === 1 ? 'flight' : 'flights'}` : 'Import'}
                    </ParticleButton>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <input
                    ref={input}
                    type="file"
                    accept=".csv,.xlsx,.xls,.json"
                    className="sr-only"
                    tabIndex={-1}
                    aria-label="Flight file"
                    onChange={e => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ''; }}
                />
                <button
                    type="button"
                    onClick={() => input.current?.click()}
                    disabled={busy}
                    className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-rp-tile border-2 border-dashed border-rp-line bg-rp-inset/60 px-4 py-6 text-center outline-none transition-colors duration-150 hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted disabled:opacity-60"
                >
                    {name ? <FileText size={22} className="text-rp-muted" aria-hidden /> : <UploadSimple size={22} className="text-rp-muted" aria-hidden />}
                    <span className="text-sm font-medium text-rp-ink">{name || 'Choose a file'}</span>
                    <span className="text-xs text-rp-muted">{name ? 'Choose another file' : 'CSV, Excel or JSON'}</span>
                </button>
                {error ? <p role="alert" className="text-sm text-rp-rust">{error}</p> : null}

                {rows ? (
                    <RpSection
                        title="Columns"
                        icon={Columns}
                        action={
                            <button type="button" aria-expanded={showColumns} onClick={() => setShowColumns(v => !v)} className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-xs font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                                {showColumns ? 'Hide' : 'Change'}
                            </button>
                        }
                    >
                        {missing.length ? <p role="alert" className="py-2 text-sm text-rp-rust">Choose the column for {missing.map(k => FIELDS.find(f => f.key === k)!.label).join(' and ')}.</p> : null}
                        {showColumns ? (
                            <div className="flex flex-col py-1">
                                {FIELDS.map(f => (
                                    <div key={f.key} className="flex min-h-11 items-center justify-between gap-3 border-t border-rp-line first:border-t-0">
                                        <span className="text-sm text-rp-ink">{f.label}{REQUIRED.includes(f.key) ? <span className="text-rp-rust"> *</span> : null}</span>
                                        <TripMenu label={`Column for ${f.label}`} pill={{ label: mapping[f.key] || 'Not used', icon: Columns }} items={columnItems(f)} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="py-2 text-sm text-rp-muted">{Object.keys(mapping).length} of {headers.length} columns matched.</p>
                        )}
                        {ambiguous ? (
                            <div role="group" aria-label="Date order" className="flex flex-wrap gap-2 py-2">
                                <RpChip selected={!dayFirst} onClick={() => setDayFirst(false)}>Month first (3/9/2026 is 9 March)</RpChip>
                                <RpChip selected={dayFirst} onClick={() => setDayFirst(true)}>Day first (3/9/2026 is 3 September)</RpChip>
                            </div>
                        ) : null}
                    </RpSection>
                ) : null}

                {found ? (
                    <div className="flex flex-col gap-2">
                        <p className="text-sm text-rp-ink">
                            <span className="rp-tabular font-medium">{fresh.length}</span> new {fresh.length === 1 ? 'flight' : 'flights'}
                            {skipped ? <span className="text-rp-muted"> · {skipped} already in your log</span> : null}
                            {rows && found.length < rows.length ? <span className="text-rp-muted"> · {rows.length - found.length} rows left out (no places or date)</span> : null}
                        </p>
                        <ul className="flex flex-col rounded-rp-inset bg-rp-inset/60 px-3 py-1">
                            {fresh.slice(0, 3).map((t, i) => (
                                <li key={i} className="flex min-h-14 items-center justify-between gap-3 border-t border-rp-line py-2 first:border-t-0">
                                    <CarrierCell t={t} size="sm" brandfetchApiKey={brandfetchApiKey} className="min-w-0" />
                                    <span className="flex shrink-0 flex-col items-end">
                                        <span className="rp-tabular flex items-center gap-1.5 text-sm font-semibold text-rp-ink">{placeCode(t.origin)} <ArrowRight size={12} className="text-rp-rust" aria-hidden /> {placeCode(t.destination)}</span>
                                        <span className="rp-tabular text-xs text-rp-muted">{formatDate(t.departureDate, 'short-with-year')}{journeyKm(t) ? ` · ${journeyKm(t).toLocaleString('en-US')} km` : ''}</span>
                                    </span>
                                </li>
                            ))}
                            {fresh.length > 3 ? <li className="rp-tabular py-2 text-center text-xs text-rp-muted">+{fresh.length - 3} more</li> : null}
                        </ul>
                    </div>
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
