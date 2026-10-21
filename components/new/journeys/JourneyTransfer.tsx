import React, { useRef, useState } from 'react';
import type { Transport } from '../../../types';
import { dataService } from '../../../services/mockDb';
import { flightImporter } from '../../../services/flightImportExport';
import ParticleButton from '../../kokonutui/particle-button';
import { ArrowRight, Columns, FileText, UploadSimple } from '../../ui/hugeicons';
import { RpSheet } from '../ui';
import { CarrierCell } from './JourneyParts';
import { formatDate } from '../../../utils/formatters';
import { journeyKm, placeCode, type JourneyRecord } from '../../../utils/journeysModel';
import { errorMessage } from '../../../services/toast';
import { cn } from '../../../utils/cn';

/**
 * Bringing journeys in and taking them out. Import reads a spreadsheet (CSV, Excel) or a JSON file,
 * shows what it found and what is already in the log, and adds the rest as independent flights.
 * "Map columns" opens the full import wizard for files with their own column names.
 */

const newId = () => Math.random().toString(36).slice(2, 11);
const key = (t: Transport) => [t.origin, t.destination, t.departureDate, t.identifier].map(v => String(v || '').trim().toUpperCase()).join('|');

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
    onOpenWizard?: () => void;
    brandfetchApiKey?: string;
}> = ({ open, existing, onClose, onImported, onOpenWizard, brandfetchApiKey }) => {
    const input = useRef<HTMLInputElement>(null);
    const [name, setName] = useState('');
    const [found, setFound] = useState<Transport[] | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const reset = () => { setName(''); setFound(null); setError(''); };
    const close = () => { reset(); onClose(); };

    const have = new Set(existing.map(r => key(r.flight)));
    const fresh = (found || []).filter(t => !have.has(key(t)));
    const skipped = (found?.length || 0) - fresh.length;

    const pick = async (file: File) => {
        setBusy(true);
        setError('');
        setName(file.name);
        try {
            const lower = file.name.toLowerCase();
            let list: Transport[] = [];
            if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) list = await flightImporter.parseFile(file);
            else if (lower.endsWith('.csv')) list = flightImporter.parseTransportsCsv(await readText(file));
            else if (lower.endsWith('.json')) list = flightImporter.parseTransportsJson(await readText(file));
            else throw new Error('Use a CSV, Excel or JSON file.');
            const flights = list.filter(t => !t.mode || t.mode === 'Flight').map(t => ({ ...t, mode: 'Flight' as const }));
            if (flights.length === 0) throw new Error('No flights were found in that file.');
            setFound(flights);
        } catch (e) {
            setFound(null);
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

    return (
        <RpSheet
            open={open}
            onClose={close}
            title="Import flights"
            width={440}
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

                {found ? (
                    <div className="flex flex-col gap-2">
                        <p className="text-sm text-rp-ink">
                            <span className="rp-tabular font-medium">{fresh.length}</span> new {fresh.length === 1 ? 'flight' : 'flights'}
                            {skipped ? <span className="text-rp-muted"> · {skipped} already in your log</span> : null}
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

                {onOpenWizard ? (
                    <button type="button" onClick={() => { close(); onOpenWizard(); }} className={cn('inline-flex min-h-11 items-center gap-2 self-start rounded-full px-4 text-sm font-medium text-rp-ink outline-none transition-colors duration-150 hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted')}>
                        <Columns size={16} className="text-rp-muted" aria-hidden /> Map columns
                    </button>
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
