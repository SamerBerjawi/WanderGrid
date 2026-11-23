import React, { useMemo, useRef, useState } from 'react';
import type { Trip } from '../../../types';
import { dataService } from '../../../services/mockDb';
import { errorMessage } from '../../../services/toast';
import { MAX_INTERCHANGE_BYTES, readInterchange, type InterchangeIssue } from '../../../utils/tripInterchangeSchema';
import {
    adaptInterchange, addedTotal, newId, planImport, previousImport,
    type AdaptedImport, type ConflictChoice, type ImportSummary,
} from '../../../utils/tripInterchange';
import { planBadges } from '../../../utils/tripPlan';
import { formatCurrency, formatDate, formatDateRange, getActiveCurrency } from '../../../utils/formatters';
import ParticleButton from '../../kokonutui/particle-button';
import { ArrowLeft, ArrowRight, ArrowUpRight, Bed, CalendarBlank, DownloadSimple, FileText, Path, Plus, Receipt, Sparkle, Suitcase, UploadSimple, Warning, X } from '../../ui/hugeicons';
import { RpSection, RpSheet, useIsMobile } from '../ui';
import { RpField, RP_FIELD } from '../fields';
import { TripMenu, type TripMenuItem } from './TripMenu';
import { PlanBadge, PlanBadges } from '../trip/PlanBadge';
import { cn } from '../../../utils/cn';

/**
 * Import itinerary: a whole travel plan from a WanderGrid trip file (docs/TRIP_INTERCHANGE.md) into a new or existing
 * trip. Upload or paste → check → preview by day, stays, transport, hidden gems, budget and warnings → choose the trip
 * → review what changes and settle conflicts → import (one atomic save) → summary. Nothing is saved before the last
 * step; the reading, mapping and merging are utils/tripInterchangeSchema.ts and utils/tripInterchange.ts.
 */

export interface TripImportResult {
    trip: Trip;
    /** The trip as it was before, or null when the import created it. */
    previous: Trip | null;
    summary: ImportSummary;
}

const BTN = 'inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-rp-muted';
const SMALL_BTN = 'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted';
const NEW = '__new__';
type Step = 'source' | 'preview' | 'review' | 'done';
type Tab = 'days' | 'stays' | 'transport' | 'gems' | 'budget' | 'warnings';

const readText = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
});

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const IssueList: React.FC<{ issues: InterchangeIssue[]; tone: 'error' | 'warning'; label: string }> = ({ issues, tone, label }) => (
    <ul aria-label={label} className={cn('flex flex-col gap-1.5 rounded-rp-inset px-3 py-2', tone === 'error' ? 'bg-rp-rust/10' : 'bg-rp-inset/60')}>
        {issues.slice(0, 40).map((e, i) => (
            <li key={i} className="flex gap-2 text-xs leading-relaxed">
                <Warning size={14} className={cn('mt-0.5 shrink-0', tone === 'error' ? 'text-rp-rust' : 'text-rp-ochre')} aria-hidden />
                <span className="min-w-0 break-words text-rp-ink">{e.path ? <code className="mr-1 rounded bg-rp-surface px-1 text-2xs text-rp-muted">{e.path}</code> : null}{e.message}</span>
            </li>
        ))}
        {issues.length > 40 ? <li className="text-xs text-rp-muted">And {issues.length - 40} more.</li> : null}
    </ul>
);

const Check: React.FC<{ checked: boolean; onChange: () => void; label: string; children: React.ReactNode; disabled?: boolean }> = ({ checked, onChange, label, children, disabled }) => (
    <label className={cn('flex min-h-11 cursor-pointer items-center gap-3 py-1.5', disabled && 'cursor-default')}>
        <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} className="size-5 shrink-0 accent-rp-ink" aria-label={label} />
        <span className={cn('flex min-w-0 flex-1 flex-col gap-0.5', !checked && 'opacity-50')}>{children}</span>
    </label>
);

export const TripImportSheet: React.FC<{
    open: boolean;
    trips: Trip[];
    onClose: () => void;
    onImported: (result: TripImportResult) => void;
    /** Start with this trip chosen (from a trip's own page). */
    tripId?: string;
    onOpenTrip?: (id: string) => void;
    /** Opens the guide to making a trip file with an AI assistant. */
    onShowGuide?: () => void;
}> = ({ open, trips, onClose, onImported, tripId: presetTripId, onOpenTrip, onShowGuide }) => {
    const fileInput = useRef<HTMLInputElement>(null);
    const mobile = useIsMobile();
    const newTripId = useRef(newId());
    const [step, setStep] = useState<Step>('source');
    const [text, setText] = useState('');
    const [fileName, setFileName] = useState('');
    const [fileText, setFileText] = useState('');
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState('');
    const [issues, setIssues] = useState<InterchangeIssue[]>([]);
    const [adapted, setAdapted] = useState<AdaptedImport | null>(null);
    const [target, setTarget] = useState<string>(NEW);
    const [excluded, setExcluded] = useState<Set<string>>(new Set());
    const [choices, setChoices] = useState<Record<string, ConflictChoice>>({});
    const [tab, setTab] = useState<Tab>('days');
    const [done, setDone] = useState<TripImportResult | null>(null);

    const reset = () => {
        setStep('source'); setText(''); setFileName(''); setFileText(''); setError(''); setIssues([]); setAdapted(null);
        setTarget(NEW); setExcluded(new Set()); setChoices({}); setTab('days'); setDone(null); newTripId.current = newId();
    };
    const close = () => { reset(); onClose(); };

    const usable = useMemo(() => trips.filter(t => !t.archived && t.status !== 'Cancelled').sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '')), [trips]);
    const chosenTrip = target === NEW ? undefined : trips.find(t => t.id === target);
    const before = adapted ? previousImport(trips, adapted.externalId) : undefined;
    const plan = useMemo(
        () => (adapted && !adapted.errors.length ? planImport(adapted, chosenTrip, { excluded, choices, tripId: newTripId.current }) : null),
        [adapted, chosenTrip, excluded, choices],
    );

    const takeFile = async (file: File | undefined) => {
        setError(''); setIssues([]);
        if (!file) return;
        if (file.size > MAX_INTERCHANGE_BYTES) { setError(`${file.name} is larger than ${MAX_INTERCHANGE_BYTES / 1024 / 1024} MB, too large for a trip file.`); return; }
        try {
            setFileText(await readText(file));
            setFileName(file.name);
        } catch (e) {
            setError(errorMessage(e, "That file couldn't be read."));
        }
    };

    const check = async () => {
        setError('');
        const result = readInterchange(fileText || text);
        if (!result.ok) { setIssues(result.errors); setError("This file can't be imported. Fix these and try again:"); return; }
        // The workspace currency decides whether the budget can be the trip's target; read it from the settings, since
        // the cache getActiveCurrency reads may still be empty when this page opened first.
        const settings = await dataService.getWorkspaceSettings().catch(() => null);
        const a = adaptInterchange(result.value, { workspaceCurrency: getActiveCurrency(settings), now: new Date().toISOString() });
        setIssues([]);
        setAdapted(a);
        setExcluded(new Set());
        setChoices({});
        const again = previousImport(trips, a.externalId);
        setTarget(presetTripId && trips.some(t => t.id === presetTripId) ? presetTripId : again ? again.id : NEW);
        setTab(a.errors.length ? 'warnings' : 'days');
        setStep('preview');
    };

    const toggle = (k: string) => setExcluded(ex => { const n = new Set(ex); if (n.has(k)) n.delete(k); else n.add(k); return n; });
    const optionalKeys = adapted?.entries.filter(e => e.optional).map(e => e.key) || [];
    const allOptionalOff = optionalKeys.length > 0 && optionalKeys.every(k => excluded.has(k));

    const run = async () => {
        if (!plan || !adapted) throw new Error('Nothing to import.');
        try {
            if (chosenTrip) await dataService.applyBatch({ upsertTrips: [plan.trip] });
            else await dataService.applyBatch({ newTrips: [plan.trip] });
            const result: TripImportResult = { trip: plan.trip, previous: chosenTrip ?? null, summary: plan.summary };
            onImported(result);
            setDone(result);
            setStep('done');
        } catch (e) {
            setError(errorMessage(e, "The trip didn't save, so nothing was changed. Try again."));
            throw e;
        }
    };

    const tripItems: TripMenuItem[] = [
        { id: NEW, label: 'New trip', icon: Plus, selected: target === NEW, onSelect: () => { setTarget(NEW); setChoices({}); } },
        ...usable.slice(0, 40).map((t, i) => ({ id: t.id, label: t.name, icon: Suitcase, selected: target === t.id, separated: i === 0, onSelect: () => { setTarget(t.id); setChoices({}); } })),
    ];

    const title = step === 'done' ? 'Itinerary imported' : 'Import itinerary';
    const head = adapted?.head;
    const warnings = adapted ? [...adapted.errors, ...adapted.warnings] : [];
    const s = plan?.summary;
    const added = s ? addedTotal(s) : 0;

    const footer = step === 'source' ? (
        <>
            <button type="button" onClick={close} className={cn(BTN, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}>Cancel</button>
            <button type="button" disabled={!(fileText || text.trim())} onClick={() => void check()} className={cn(BTN, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90 disabled:opacity-40')}>Check file <ArrowRight size={16} aria-hidden /></button>
        </>
    ) : step === 'preview' ? (
        <>
            <button type="button" onClick={() => { setStep('source'); setError(''); }} className={cn(BTN, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}><ArrowLeft size={16} aria-hidden /> Back</button>
            <button type="button" disabled={!plan} onClick={() => setStep('review')} className={cn(BTN, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90 disabled:opacity-40')}>Review changes <ArrowRight size={16} aria-hidden /></button>
        </>
    ) : step === 'review' ? (
        <>
            <button type="button" onClick={() => { setStep('preview'); setError(''); }} className={cn(BTN, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}><ArrowLeft size={16} aria-hidden /> Back</button>
            <ParticleButton onClick={run} disabled={!plan} pendingLabel="Importing" successLabel="Imported" errorLabel="Couldn't import">
                {chosenTrip ? `Import into ${chosenTrip.name}` : 'Create trip'}
            </ParticleButton>
        </>
    ) : (
        <>
            <button type="button" onClick={close} className={cn(BTN, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}>Close</button>
            {onOpenTrip && done && done.trip.id !== presetTripId ? (
                <button type="button" onClick={() => { const id = done.trip.id; close(); onOpenTrip(id); }} className={cn(BTN, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}>Open trip <ArrowUpRight size={16} aria-hidden /></button>
            ) : null}
        </>
    );

    const tabs: { id: Tab; label: string; icon: typeof CalendarBlank; count?: number }[] = adapted ? [
        { id: 'days', label: 'Days', icon: CalendarBlank, count: adapted.plan.days?.length || 0 },
        { id: 'stays', label: 'Stays', icon: Bed, count: adapted.plan.stays?.length || 0 },
        { id: 'transport', label: 'Transport', icon: Path, count: adapted.transports.length },
        { id: 'gems', label: 'Hidden gems', icon: Sparkle, count: adapted.plan.hiddenGems?.length || 0 },
        { id: 'budget', label: 'Budget', icon: Receipt },
        { id: 'warnings', label: 'Warnings', icon: Warning, count: warnings.length },
    ] : [];

    return (
        <RpSheet open={open} onClose={close} title={title} subtitle={step !== 'source' && head ? head.name : undefined} width={560} footer={footer}>
            <div className="flex flex-col gap-4">
                <input ref={fileInput} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-label="Trip file to import" onChange={e => { void takeFile(e.target.files?.[0]); e.target.value = ''; }} />
                {error ? <p role="alert" className="text-sm text-rp-rust">{error}</p> : null}
                {issues.length ? <IssueList issues={issues} tone="error" label="Problems in the file" /> : null}

                {step === 'source' ? (
                    <>
                        <p className="text-sm text-rp-muted">A WanderGrid trip file holds a whole plan: days and activities, stops, transport, the stays you're considering, hidden gems and a budget estimate. You'll see everything before anything is saved, and nothing booked is made up.</p>
                        <div
                            onDragOver={e => { e.preventDefault(); setDragging(true); }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={e => { e.preventDefault(); setDragging(false); void takeFile(e.dataTransfer.files?.[0]); }}
                        >
                            <button
                                type="button"
                                onClick={() => fileInput.current?.click()}
                                className={cn('flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-rp-tile border-2 border-dashed px-4 py-6 text-center outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted motion-reduce:transition-none', dragging ? 'border-rp-ink bg-rp-inset' : 'border-rp-line bg-rp-inset/60 hover:bg-rp-inset')}
                            >
                                {fileName ? <FileText size={22} className="text-rp-muted" aria-hidden /> : <UploadSimple size={22} className="text-rp-muted" aria-hidden />}
                                <span className="text-sm font-medium text-rp-ink">{fileName || (mobile ? 'Choose the trip file' : 'Drop the trip file here')}</span>
                                <span className="text-xs text-rp-muted">{fileName ? 'Choose another file' : 'A .json file up to 2 MB, or click to choose'}</span>
                            </button>
                        </div>
                        {fileName ? (
                            <button type="button" onClick={() => { setFileName(''); setFileText(''); }} className={cn(SMALL_BTN, 'self-start')}><X size={14} aria-hidden /> Paste the JSON instead</button>
                        ) : (
                            <RpField label="Or paste the JSON" icon={FileText}>
                                {id => <textarea id={id} value={text} onChange={e => setText(e.target.value)} rows={6} spellCheck={false} placeholder='{ "format": "wandergrid-trip-interchange", … }' className={cn(RP_FIELD, 'resize-y py-2.5 font-mono text-xs leading-relaxed')} />}
                            </RpField>
                        )}
                        <div className="flex flex-wrap gap-1">
                            <a href="/samples/wandergrid-trip-template.json" download="wandergrid-trip-template.json" className={SMALL_BTN}>
                                <DownloadSimple size={14} aria-hidden /> Download the template
                            </a>
                            {onShowGuide ? <button type="button" onClick={onShowGuide} className={SMALL_BTN}><Sparkle size={14} aria-hidden /> Make one with an AI assistant</button> : null}
                        </div>
                        {!onShowGuide ? <p className="text-xs text-rp-muted">No file yet? Give the template to ChatGPT, Claude or another AI assistant with your trip: its instructions tell the assistant how to write the plan. Settings › Data › Make a trip file with AI explains it step by step.</p> : null}
                    </>
                ) : null}

                {step === 'preview' && adapted && head ? (
                    <>
                        <p className="text-sm text-rp-ink">
                            <span className="rp-tabular text-rp-muted">{formatDateRange(head.startDate, head.endDate)}</span>
                            {' · '}{[plural(adapted.plan.days?.length || 0, 'day'), plural(adapted.locations.length, 'stop'), plural(adapted.activities.length, 'activity', 'activities'), plural(adapted.transports.length, 'leg'), plural(adapted.plan.stays?.length || 0, 'stay plan'), plural(adapted.plan.hiddenGems?.length || 0, 'hidden gem')].join(' · ')}
                        </p>

                        <RpSection title="Import into" icon={Suitcase}>
                            <div className="flex min-h-11 items-center justify-between gap-3 py-1">
                                <span className="flex min-w-0 flex-col">
                                    <span className="truncate text-sm text-rp-ink">{chosenTrip ? chosenTrip.name : 'A new trip'}</span>
                                    <span className="rp-tabular truncate text-xs text-rp-muted">{chosenTrip ? `${formatDateRange(chosenTrip.startDate, chosenTrip.endDate)} · added to, nothing removed` : `${head.name}, planned`}</span>
                                </span>
                                <TripMenu label="Choose the trip" pill={{ label: 'Change', icon: Suitcase }} items={tripItems} />
                            </div>
                            {before && target !== before.id ? <p className="text-xs text-rp-ochre">This plan was imported before into {before.name}. Importing it into {chosenTrip ? 'another trip' : 'a new trip'} makes a second copy.</p> : null}
                            {before && target === before.id ? <p className="text-xs text-rp-muted">Imported before: importing again updates what changed and adds nothing twice.</p> : null}
                        </RpSection>

                        <div role="tablist" aria-label="Preview" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
                            {tabs.map(t => (
                                <button
                                    key={t.id}
                                    type="button"
                                    role="tab"
                                    id={`ix-tab-${t.id}`}
                                    aria-selected={tab === t.id}
                                    aria-controls="ix-panel"
                                    onClick={() => setTab(t.id)}
                                    onKeyDown={e => {
                                        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                                        const i = tabs.findIndex(x => x.id === tab) + (e.key === 'ArrowRight' ? 1 : -1);
                                        const next = tabs[(i + tabs.length) % tabs.length];
                                        setTab(next.id);
                                        document.getElementById(`ix-tab-${next.id}`)?.focus();
                                    }}
                                    tabIndex={tab === t.id ? 0 : -1}
                                    className={cn('inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-rp-muted', tab === t.id ? 'bg-rp-ink text-rp-on-ink' : 'bg-rp-inset text-rp-ink hover:bg-rp-line', t.id === 'warnings' && adapted.errors.length && tab !== t.id && 'text-rp-rust')}
                                >
                                    <t.icon size={14} aria-hidden /> {t.label}{t.count != null ? <span className="rp-tabular opacity-70">{t.count}</span> : null}
                                </button>
                            ))}
                        </div>

                        <div id="ix-panel" role="tabpanel" aria-labelledby={`ix-tab-${tab}`} className="flex flex-col gap-3">
                            {tab === 'days' ? (
                                <>
                                    {optionalKeys.length ? (
                                        <button type="button" onClick={() => setExcluded(ex => { const n = new Set(ex); optionalKeys.forEach(k => (allOptionalOff ? n.delete(k) : n.add(k))); return n; })} className={cn(SMALL_BTN, 'self-start bg-rp-inset text-rp-ink')}>
                                            {allOptionalOff ? `Include the ${optionalKeys.length} optional and alternative items` : `Leave out the ${optionalKeys.length} optional and alternative items`}
                                        </button>
                                    ) : null}
                                    <ol className="flex flex-col gap-2" aria-label="Days">
                                        {(adapted.plan.days || []).map((d, i) => {
                                            const acts = adapted.activities.filter(a => a.date === d.date);
                                            const legs = adapted.transports.filter(t => t.departureDate === d.date);
                                            const trip = adapted.plan.dayTrips?.find(x => x.date === d.date);
                                            return (
                                                <li key={d.date} className="rounded-rp-inset bg-rp-inset/60 px-3 py-2">
                                                    <p className="text-sm font-medium text-rp-ink"><span className="rp-tabular text-rp-muted">Day {i + 1} · {formatDate(d.date, 'short')}</span>{d.title ? ` · ${d.title}` : ''}</p>
                                                    {d.summary ? <p className="text-xs text-rp-muted">{d.summary}</p> : null}
                                                    {trip ? <p className="mt-1"><PlanBadge tone={trip.priority === 'optional' ? 'optional' : 'recommended'}>{trip.priority === 'optional' ? 'Optional day trip' : 'Day trip'}: {trip.destination}</PlanBadge></p> : null}
                                                    {legs.map(t => <p key={t.id} className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-rp-ink"><Path size={12} className="text-rp-rust" aria-hidden /> {t.origin} → {t.destination}<span className="text-rp-muted">{t.plan?.modeLabel || t.mode}</span><PlanBadge tone="unbooked">Not booked</PlanBadge></p>)}
                                                    {acts.length ? (
                                                        <ul className="mt-1">
                                                            {acts.map(a => {
                                                                const k = `activity:${a.plan?.externalId}`;
                                                                return (
                                                                    <li key={a.id} className="border-t border-rp-line first:border-t-0">
                                                                        <Check checked={!excluded.has(k)} onChange={() => toggle(k)} label={`Include ${a.title}`}>
                                                                            <span className="flex flex-wrap items-center gap-1.5 text-sm text-rp-ink">{a.title}<PlanBadges badges={planBadges(a)} /></span>
                                                                            {a.description ? <span className="truncate text-xs text-rp-muted">{a.description}</span> : null}
                                                                        </Check>
                                                                    </li>
                                                                );
                                                            })}
                                                        </ul>
                                                    ) : null}
                                                </li>
                                            );
                                        })}
                                    </ol>
                                </>
                            ) : null}

                            {tab === 'stays' ? (
                                <>
                                    <p className="text-xs text-rp-muted">Each stay is imported as a plan with its shortlist of hotels. Candidates are not bookings: no stay is added until you book one (on the trip's Bookings tab).</p>
                                    <ul className="flex flex-col gap-2" aria-label="Stays">
                                        {(adapted.plan.stays || []).map(st => {
                                            const k = `stay:${st.externalId}`;
                                            const place = adapted.locations.find(l => l.plan?.externalId === st.destinationId)?.name;
                                            return (
                                                <li key={k} className="rounded-rp-inset bg-rp-inset/60 px-3 py-1">
                                                    <Check checked={!excluded.has(k)} onChange={() => toggle(k)} label={`Include the stay in ${place || st.area || 'this place'}`}>
                                                        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-rp-ink">{place || st.area || 'Stay'}<PlanBadge tone={st.status === 'booked' ? 'booked' : 'unbooked'}>{st.status === 'booked' ? 'Booked' : 'Not booked'}</PlanBadge></span>
                                                        <span className="rp-tabular text-xs text-rp-muted">{[formatDateRange(st.checkIn, st.checkOut), plural(st.nights || 0, 'night'), st.targetPerNight ? `target ${formatCurrency(st.targetPerNight, adapted.plan.budget?.currency)}/night` : ''].filter(Boolean).join(' · ')}</span>
                                                    </Check>
                                                    <ol className="mb-2 ml-8 flex flex-col gap-1">
                                                        {st.candidates.map(c => <li key={c.externalId || c.name} className="flex items-center gap-2 text-xs text-rp-ink"><span className="rp-tabular w-5 text-rp-muted">{c.rank ? `#${c.rank}` : ''}</span><span className="min-w-0 flex-1 truncate">{c.name}</span><PlanBadge tone={c.status === 'booked' ? 'booked' : 'candidate'}>{c.status === 'booked' ? 'Booked' : 'Candidate'}</PlanBadge></li>)}
                                                    </ol>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </>
                            ) : null}

                            {tab === 'transport' ? (
                                <>
                                    <p className="text-xs text-rp-muted">Legs are added as proposed, not booked: no times, numbers or references are invented. They stay out of the flight log until you add a flight number or booking reference.</p>
                                    <ul className="flex flex-col rounded-rp-inset bg-rp-inset/60 px-3" aria-label="Transport">
                                        {adapted.transports.map(t => {
                                            const k = `transport:${t.plan?.externalId}`;
                                            return (
                                                <li key={t.id} className="border-t border-rp-line first:border-t-0">
                                                    <Check checked={!excluded.has(k)} onChange={() => toggle(k)} label={`Include ${t.origin} to ${t.destination}`}>
                                                        <span className="flex flex-wrap items-center gap-1.5 text-sm text-rp-ink">{t.origin} → {t.destination}<PlanBadges badges={planBadges(t, { showUnbooked: true })} /></span>
                                                        <span className="rp-tabular text-xs text-rp-muted">{[formatDate(t.departureDate, 'short-with-year'), t.plan?.modeLabel ? `${t.plan.modeLabel}, saved as ${t.mode}` : t.mode, t.notes].filter(Boolean).join(' · ')}</span>
                                                    </Check>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </>
                            ) : null}

                            {tab === 'gems' ? (
                                <ul className="flex flex-col rounded-rp-inset bg-rp-inset/60 px-3" aria-label="Hidden gems">
                                    {(adapted.plan.hiddenGems || []).map(g => (
                                        <li key={g.externalId || g.name} className="flex min-h-11 flex-col justify-center gap-0.5 border-t border-rp-line py-2 first:border-t-0">
                                            <span className="flex flex-wrap items-center gap-1.5 text-sm text-rp-ink">{g.name}<PlanBadge tone={g.status === 'alternative' ? 'alternative' : g.status === 'optional' ? 'optional' : 'gem'}>{g.status === 'alternative' ? 'Alternative' : g.status === 'optional' ? 'Optional' : 'Planned'}</PlanBadge></span>
                                            <span className="text-xs text-rp-muted">{[g.date ? formatDate(g.date, 'short') : '', g.notes].filter(Boolean).join(' · ')}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}

                            {tab === 'budget' ? (
                                adapted.plan.budget ? (
                                    <div className="flex flex-col gap-2 rounded-rp-inset bg-rp-inset/60 p-3">
                                        <p className="flex flex-wrap items-center gap-2 text-sm text-rp-ink">Target <span className="rp-tabular font-semibold">{formatCurrency(adapted.plan.budget.target || 0, adapted.plan.budget.currency)}</span><PlanBadge tone="optional">Estimate</PlanBadge></p>
                                        <p className="text-xs text-rp-muted">{head.targetBudget ? "Sets the trip's target budget." : "Kept as an estimate; the trip's target budget isn't changed."} No expenses are recorded: only payments you log count as spending.</p>
                                        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs">
                                            {Object.entries(adapted.plan.budget.categories || {}).map(([k, v]) => (
                                                <React.Fragment key={k}><dt className="text-rp-muted">{k.replace(/_/g, ' ')}</dt><dd className="rp-tabular text-right text-rp-ink">{formatCurrency(v, adapted.plan.budget!.currency)}</dd></React.Fragment>
                                            ))}
                                        </dl>
                                    </div>
                                ) : <p className="text-sm text-rp-muted">The file has no budget.</p>
                            ) : null}

                            {tab === 'warnings' ? (
                                <>
                                    {adapted.errors.length ? <><p className="text-sm text-rp-rust">These stop the import:</p><IssueList issues={adapted.errors} tone="error" label="Errors" /></> : null}
                                    {adapted.warnings.length ? <IssueList issues={adapted.warnings} tone="warning" label="Warnings" /> : !adapted.errors.length ? <p className="text-sm text-rp-muted">Nothing to check.</p> : null}
                                </>
                            ) : null}
                        </div>
                    </>
                ) : null}

                {step === 'review' && plan && s ? (
                    <>
                        <RpSection title={chosenTrip ? `Changes to ${chosenTrip.name}` : 'The new trip'} icon={Suitcase}>
                            <ul className="flex flex-col gap-1 text-sm text-rp-ink" aria-label="What the import does">
                                <li>{added || s.added.days || s.added.candidates || s.added.hiddenGems ? `Adds ${[
                                    s.added.stops && plural(s.added.stops, 'stop'),
                                    s.added.activities && plural(s.added.activities, 'activity', 'activities'),
                                    s.added.transports && plural(s.added.transports, 'proposed leg'),
                                    s.added.stays && `${plural(s.added.stays, 'stay plan')} with ${plural(s.added.candidates, 'hotel candidate')}`,
                                    s.added.bookedStays && plural(s.added.bookedStays, 'booked stay'),
                                    s.added.hiddenGems && plural(s.added.hiddenGems, 'hidden gem'),
                                    s.added.days && plural(s.added.days, 'day heading'),
                                ].filter(Boolean).join(', ')}.` : 'Adds nothing new.'}</li>
                                {s.updated ? <li>Updates {plural(s.updated, 'item')} nobody had changed.</li> : null}
                                {s.unchanged ? <li className="text-rp-muted">{plural(s.unchanged, 'item')} already as in the file.</li> : null}
                                {s.duplicates ? <li className="text-rp-muted">{plural(s.duplicates, 'item')} already in the trip, entered by hand: linked to the file, not copied.</li> : null}
                                {s.skipped ? <li className="text-rp-muted">{plural(s.skipped, 'item')} left out.</li> : null}
                                {plan.trip.targetBudget && (!chosenTrip || !chosenTrip.targetBudget) ? <li>Sets the target budget to {formatCurrency(plan.trip.targetBudget, plan.trip.ledgerCurrency)} (an estimate; no expenses).</li> : null}
                                {chosenTrip ? <li className="text-rp-muted">Nothing is removed. Bookings, costs and your own edits are kept.</li> : null}
                            </ul>
                        </RpSection>
                        {plan.conflicts.length ? (
                            <RpSection title={`${plural(plan.conflicts.length, 'conflict')} with your edits`} icon={Warning}>
                                <div className="flex flex-wrap gap-1">
                                    <button type="button" onClick={() => setChoices(Object.fromEntries(plan.conflicts.map(c => [c.key, 'keep'])))} className={cn(SMALL_BTN, 'bg-rp-inset text-rp-ink')}>Keep all of mine</button>
                                    <button type="button" onClick={() => setChoices(Object.fromEntries(plan.conflicts.map(c => [c.key, 'incoming'])))} className={cn(SMALL_BTN, 'bg-rp-inset text-rp-ink')}>Use the file for all</button>
                                </div>
                                <ul className="flex flex-col gap-2" aria-label="Conflicts">
                                    {plan.conflicts.map(c => {
                                        const choice = choices[c.key] || 'keep';
                                        return (
                                            <li key={c.key} className="rounded-rp-inset bg-rp-inset/60 px-3 py-2">
                                                <fieldset>
                                                    <legend className="text-sm font-medium text-rp-ink">{c.label} · {c.fieldLabel}</legend>
                                                    {(['keep', 'incoming'] as const).map(v => (
                                                        <label key={v} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                                                            <input type="radio" name={c.key} checked={choice === v} onChange={() => setChoices(ch => ({ ...ch, [c.key]: v }))} className="size-5 shrink-0 accent-rp-ink" />
                                                            <span className="min-w-0"><span className="text-rp-muted">{v === 'keep' ? 'Keep mine: ' : 'Use the file: '}</span><span className="break-words text-rp-ink">{v === 'keep' ? c.current : c.incoming}</span></span>
                                                        </label>
                                                    ))}
                                                </fieldset>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </RpSection>
                        ) : null}
                        <p className="text-xs text-rp-muted">Everything is saved together, or nothing is. Places are looked up on the map as they save; check them on the Route tab. You can undo the import from the message that follows.</p>
                    </>
                ) : null}

                {step === 'done' && done ? (
                    <div className="flex flex-col gap-2 text-sm text-rp-ink" role="status">
                        <p>{done.previous ? `Imported into ${done.trip.name}.` : `Created ${done.trip.name}.`}</p>
                        <p className="text-rp-muted">{[
                            plural(done.summary.added.activities, 'activity', 'activities'),
                            plural(done.summary.added.transports, 'proposed leg'),
                            `${plural(done.summary.added.stays, 'stay plan')} (${plural(done.summary.added.candidates, 'hotel candidate')}, not booked)`,
                            plural(done.summary.added.hiddenGems, 'hidden gem'),
                        ].join(' · ')} added{done.summary.updated ? `, ${done.summary.updated} updated` : ''}.</p>
                        <p className="text-rp-muted">Nothing is booked or paid: look for the "Not booked" labels on the trip.</p>
                    </div>
                ) : null}
            </div>
        </RpSheet>
    );
};

export default TripImportSheet;
