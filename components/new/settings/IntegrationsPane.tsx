import React, { useEffect, useState } from 'react';
import type { WorkspaceSettings } from '../../../types';
import type { SettingsData } from '../../../hooks/useSettingsData';
import { testKeyed, testKeyless, type KeyedService, type KeylessProvider, type TestResult } from '../../../services/integrationTest';
import { errorMessage } from '../../../services/toast';
import { StackPanel, type StackPage } from '../../kokonutui/stack-panel';
import ParticleButton from '../../kokonutui/particle-button';
import HoldButton from '../../kokonutui/hold-button';
import { RpChip, RpSheet } from '../ui';
import { RP_FIELD, RpField } from '../fields';
import { ArrowSquareOut, Compass, Database, Eye, EyeSlash, Globe, MapsGlobal, Plugs, Pulse, Sparkle, Airplane, Key, WifiHigh, Cloud, Path, MapPin, Planet, type Icon } from '../../ui/hugeicons';
import { cn } from '../../../utils/cn';
import { card, CANCEL_BTN, maskKey, PaneHeader, StatusChip } from './SettingsParts';

type KeyField = 'googleGeminiApiKey' | 'aviationStackApiKey' | 'aeroDataBoxApiKey' | 'openAipApiKey' | 'brandfetchApiKey' | 'cartoApiKey';

interface KeyService {
    id: string;
    label: string;
    purpose: string;
    icon: Icon;
    field: KeyField;
    /** Server-held keys are never sent back to the browser (only a mask); public ids are readable. */
    secret: boolean;
    test?: KeyedService;
    docs: string;
}

const KEY_SERVICES: KeyService[] = [
    { id: 'gemini', label: 'Google Gemini', purpose: 'Trip planning and packing ideas', icon: Sparkle, field: 'googleGeminiApiKey', secret: true, test: 'gemini', docs: 'https://aistudio.google.com/apikey' },
    { id: 'aviationstack', label: 'AviationStack', purpose: 'Flight lookup by number and date', icon: Airplane, field: 'aviationStackApiKey', secret: true, test: 'aviationstack', docs: 'https://aviationstack.com' },
    { id: 'aerodatabox', label: 'AeroDataBox', purpose: 'Gates, terminals, schedules and aircraft', icon: Database, field: 'aeroDataBoxApiKey', secret: true, test: 'aerodatabox', docs: 'https://aerodatabox.com' },
    { id: 'openaip', label: 'OpenAIP', purpose: 'Airspaces and navigation aids on the map', icon: Compass, field: 'openAipApiKey', secret: true, test: 'openaip', docs: 'https://www.openaip.net' },
    { id: 'brandfetch', label: 'Brandfetch', purpose: 'Airline and hotel logos', icon: Globe, field: 'brandfetchApiKey', secret: false, test: 'brandfetch', docs: 'https://brandfetch.com/developers' },
    { id: 'carto', label: 'CARTO', purpose: 'Optional key for CARTO basemaps', icon: MapsGlobal, field: 'cartoApiKey', secret: false, docs: 'https://carto.com' },
];

const FREE_SERVICES: Array<{ id: KeylessProvider; label: string; purpose: string; icon: Icon; docs: string }> = [
    { id: 'adsbdb', label: 'ADSBdb', purpose: 'Aircraft routes by callsign', icon: Pulse, docs: 'https://adsbdb.com' },
    { id: 'osrm', label: 'FOSSGIS OSRM', purpose: 'Road routes and drive times', icon: Path, docs: 'https://routing.openstreetmap.de' },
    { id: 'geocoding', label: 'Open-Meteo geocoding', purpose: 'Place search, with Photon and Nominatim behind it', icon: MapPin, docs: 'https://open-meteo.com/en/docs/geocoding-api' },
    { id: 'openfreemap', label: 'OpenFreeMap', purpose: 'Vector basemaps', icon: Planet, docs: 'https://openfreemap.org' },
    { id: 'gibs', label: 'NASA GIBS', purpose: 'Satellite imagery', icon: Cloud, docs: 'https://earthdata.nasa.gov/eosdis' },
];

/** The state of one key: where it comes from and whether it is there at all. */
const keyState = (settings: WorkspaceSettings, s: KeyService): { has: boolean; source: 'workspace' | 'env' | 'none'; tail: string } => {
    if (s.secret) {
        const source = settings.keySources?.[s.field as keyof NonNullable<WorkspaceSettings['keySources']>] ?? (settings.configuredKeys?.[s.field as keyof NonNullable<WorkspaceSettings['configuredKeys']>] ? 'workspace' : 'none');
        return { has: source !== 'none', source, tail: '' };
    }
    const value = String(settings[s.field] || '');
    return { has: Boolean(value), source: value ? 'workspace' : 'none', tail: maskKey(value) };
};

const ResultLine: React.FC<{ result?: TestResult; pending?: boolean }> = ({ result, pending }) => {
    if (pending) return <p className="text-sm text-rp-muted" role="status">Testing…</p>;
    if (!result) return null;
    return (
        <p role="status" className={cn('flex items-center gap-2 text-sm', result.success ? 'text-rp-green' : 'text-rp-rust')}>
            <span className={cn('size-2 shrink-0 rounded-full', result.success ? 'bg-rp-green' : 'bg-rp-rust')} aria-hidden />
            <span className="min-w-0">{result.message}{result.latencyMs > 0 ? <span className="rp-tabular text-rp-muted"> · {result.latencyMs} ms</span> : null}</span>
        </p>
    );
};

/** One service's key: where it comes from, a field to replace it, a test of the saved key and a hold to remove it. */
const KeySheet: React.FC<{
    service: KeyService | null;
    settings: WorkspaceSettings;
    onClose: () => void;
    onSave: (changes: Partial<WorkspaceSettings>) => Promise<void>;
    onTested: (id: string, result: TestResult) => void;
    result?: TestResult;
}> = ({ service, settings, onClose, onSave, onTested, result }) => {
    const [draft, setDraft] = useState('');
    const [endpoint, setEndpoint] = useState<'rapidapi' | 'direct'>('rapidapi');
    const [show, setShow] = useState(false);
    const [error, setError] = useState('');
    const [removing, setRemoving] = useState(false);

    useEffect(() => {
        if (service) {
            setDraft('');
            setShow(false);
            setError('');
            setEndpoint(settings.aeroDataBoxEndpoint === 'direct' ? 'direct' : 'rapidapi');
        }
        // Reset only when a different service opens.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [service?.id]);

    if (!service) return <RpSheet open={false} onClose={onClose} title="">{null}</RpSheet>;
    const state = keyState(settings, service);
    const isAdb = service.id === 'aerodatabox';
    const endpointChanged = isAdb && endpoint !== (settings.aeroDataBoxEndpoint === 'direct' ? 'direct' : 'rapidapi');

    const changes = (): Partial<WorkspaceSettings> => ({
        ...(draft.trim() ? { [service.field]: draft.trim() } : {}),
        ...(endpointChanged ? { aeroDataBoxEndpoint: endpoint } : {}),
    });

    const save = async () => {
        const c = changes();
        if (Object.keys(c).length === 0) { setError('Paste a key first.'); throw new Error('Nothing to save'); }
        setError('');
        try {
            await onSave(c);
            setDraft('');
            onClose();
        } catch (e) {
            setError(errorMessage(e, "That didn't save. Try again."));
            throw e;
        }
    };

    // Tests the saved key; a key typed but not yet saved is saved first.
    const test = async () => {
        if (!service.test) return;
        const c = changes();
        if (Object.keys(c).length > 0) {
            try { await onSave(c); setDraft(''); } catch (e) { setError(errorMessage(e, "That didn't save. Try again.")); throw e; }
        }
        const r = await testKeyed(service.test);
        onTested(service.id, r);
        if (!r.success) throw new Error(r.message);
    };

    const remove = async () => {
        try { await onSave({ [service.field]: '' } as Partial<WorkspaceSettings>); setRemoving(false); onClose(); } catch (e) { setError(errorMessage(e, "The key couldn't be removed.")); }
    };

    return (
        <RpSheet
            open
            onClose={onClose}
            title={service.label}
            subtitle={service.purpose}
            footer={
                <>
                    <button type="button" onClick={onClose} className={CANCEL_BTN}>Close</button>
                    <ParticleButton onClick={save} successDuration={700} onError={() => undefined} className="!min-h-11">Save key</ParticleButton>
                </>
            }
        >
            <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    {state.source === 'env' ? <StatusChip tone="green" icon={Plugs}>From the host</StatusChip>
                        : state.has ? <StatusChip tone="green" icon={Key}>{state.tail ? `Saved ${state.tail}` : 'Saved on the server'}</StatusChip>
                        : <StatusChip tone="muted">No key</StatusChip>}
                    <a href={service.docs} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                        Get a key <ArrowSquareOut size={14} aria-hidden />
                    </a>
                </div>

                {isAdb ? (
                    <div className="flex flex-col gap-1.5 py-1.5">
                        <span className="text-xs text-rp-muted" id="adb-endpoint">Gateway</span>
                        <div role="group" aria-labelledby="adb-endpoint" className="flex flex-wrap gap-2">
                            <RpChip selected={endpoint === 'rapidapi'} onClick={() => setEndpoint('rapidapi')}>RapidAPI</RpChip>
                            <RpChip selected={endpoint === 'direct'} onClick={() => setEndpoint('direct')}>aerodatabox.com</RpChip>
                        </div>
                    </div>
                ) : null}

                <RpField label={state.has ? 'Replace key' : 'API key'} icon={Key}>
                    {id => (
                        <div className="relative">
                            <input
                                id={id}
                                type={show ? 'text' : 'password'}
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                placeholder={state.has ? 'Leave empty to keep the current key' : 'Paste your key'}
                                autoComplete="off"
                                spellCheck={false}
                                className={cn(RP_FIELD, 'pr-12 font-mono')}
                            />
                            <button type="button" aria-label={show ? 'Hide key' : 'Show key'} onClick={() => setShow(v => !v)} className="absolute top-0 right-0 flex size-11 items-center justify-center rounded-full text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                                {show ? <EyeSlash size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                            </button>
                        </div>
                    )}
                </RpField>

                {service.test ? (
                    <div className="flex flex-col gap-2 rounded-rp-inset bg-rp-inset/60 p-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <ParticleButton variant="inset" onClick={test} successDuration={900} onError={() => undefined} pendingLabel="Testing" successLabel="Works" errorLabel="Failed" className="!min-h-11" disabled={!state.has && !draft.trim()}>
                                Test key
                            </ParticleButton>
                            <span className="text-xs text-rp-muted">{draft.trim() ? 'Saves the new key, then tests it.' : 'Tests the saved key.'}</span>
                        </div>
                        <ResultLine result={result} />
                    </div>
                ) : null}

                {state.source === 'workspace' ? (
                    removing ? (
                        <div className="flex flex-wrap items-center gap-3">
                            <HoldButton resetAfter={0} onHoldComplete={() => void remove()}>Hold to remove</HoldButton>
                            <button type="button" onClick={() => setRemoving(false)} className={CANCEL_BTN}>Keep key</button>
                        </div>
                    ) : (
                        <div>
                            <button type="button" onClick={() => setRemoving(true)} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-rp-rust outline-none hover:bg-rp-rust/10 focus-visible:ring-2 focus-visible:ring-rp-muted">
                                Remove key
                            </button>
                        </div>
                    )
                ) : null}

                {error ? <p role="alert" className="text-sm text-rp-rust">{error}</p> : null}
            </div>
        </RpSheet>
    );
};

export const IntegrationsPane: React.FC<{ data: SettingsData }> = ({ data }) => {
    const { settings, isAdmin } = data;
    const [open, setOpen] = useState<KeyService | null>(null);
    const [results, setResults] = useState<Record<string, TestResult>>({});
    const [testing, setTesting] = useState<string | null>(null);
    if (!settings) return null;

    const record = (id: string, r: TestResult) => setResults(prev => ({ ...prev, [id]: r }));
    const runFree = async (id: KeylessProvider) => {
        setTesting(id);
        record(id, await testKeyless(id));
        setTesting(null);
    };
    const testAll = async () => {
        for (const s of FREE_SERVICES) await runFree(s.id);
        if (isAdmin) {
            for (const s of KEY_SERVICES) {
                if (!s.test || !keyState(settings, s).has) continue;
                setTesting(s.id);
                record(s.id, await testKeyed(s.test));
                setTesting(null);
            }
        }
    };

    const states = KEY_SERVICES.map(s => ({ s, ...keyState(settings, s) }));
    const connected = states.filter(x => x.has).length;
    const chipFor = (id: string): React.ReactNode => {
        if (testing === id) return 'Testing…';
        const r = results[id];
        if (!r) return null;
        return <StatusChip tone={r.success ? 'green' : 'rust'}>{r.success ? 'Works' : 'Failed'}</StatusChip>;
    };

    const pages: Record<string, StackPage> = {
        integrations: {
            title: 'Integrations',
            sections: [
                {
                    title: 'API keys',
                    rows: states.map(({ s, has, source, tail }) => ({
                        id: s.id,
                        icon: s.icon,
                        label: s.label,
                        detail: chipFor(s.id) ?? (source === 'env' ? 'From the host' : has ? (tail || 'Saved') : 'No key'),
                        onSelect: isAdmin ? () => setOpen(s) : undefined,
                    })),
                    footer: isAdmin ? 'Keys stay on the server. Only the last four characters of public ids are shown.' : 'Only admins change keys.',
                },
                {
                    title: 'Free services',
                    rows: FREE_SERVICES.map(s => ({
                        id: s.id,
                        icon: s.icon,
                        label: s.label,
                        detail: chipFor(s.id) ?? 'Tap to test',
                        onSelect: () => void runFree(s.id),
                        disabled: testing !== null && testing !== s.id,
                    })),
                    footer: 'These need no key.',
                },
            ],
        },
    };

    const failed = Object.entries(results).filter(([, r]) => !r.success);

    return (
        <section aria-label="Integrations">
            <PaneHeader
                icon={Plugs}
                title="Integrations"
                count={`${connected} of ${KEY_SERVICES.length} keys`}
                actions={
                    <ParticleButton variant="inset" onClick={testAll} successDuration={900} onError={() => undefined} pendingLabel="Testing" successLabel="Done" errorLabel="Try again" icon={<WifiHigh aria-hidden />}>
                        Test all
                    </ParticleButton>
                }
            />
            <div className={cn(card, 'p-2 sm:p-3')}>
                <StackPanel pages={pages} root="integrations" bare />
            </div>
            {failed.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-1 px-1" aria-label="Failed tests">
                    {failed.map(([id, r]) => (
                        <li key={id} className="text-sm text-rp-rust">{r.message}</li>
                    ))}
                </ul>
            ) : null}

            <KeySheet
                service={open}
                settings={settings}
                onClose={() => setOpen(null)}
                onSave={data.save}
                onTested={record}
                result={open ? results[open.id] : undefined}
            />
        </section>
    );
};
