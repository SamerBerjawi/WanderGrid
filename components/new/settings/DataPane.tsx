import React, { useEffect, useRef, useState } from 'react';
import type { BackupSelectionOptions } from '../../../types';
import type { SettingsData } from '../../../hooks/useSettingsData';
import { dataService } from '../../../services/mockDb';
import { ALL_OFF, ALL_ON, BACKUP_CATEGORIES, availableCategories, countBackup, parseBackupText, type BackupCategory, type BackupCounts } from '../../../utils/backupModel';
import { errorMessage, toast } from '../../../services/toast';
import { formatDate } from '../../../utils/formatters';
import { StackPanel, type StackPage } from '../../kokonutui/stack-panel';
import ParticleButton from '../../kokonutui/particle-button';
import HoldButton from '../../kokonutui/hold-button';
import { RpChip, RpSection, RpSheet, RpToggle } from '../ui';
import { ArrowsClockwise, ArrowsMerge, Database, DownloadSimple, Airplane, Trash, UploadSimple, WarningCircle } from '../../ui/hugeicons';
import { cn } from '../../../utils/cn';
import { card, CANCEL_BTN, HoldSheet, PaneHeader } from './SettingsParts';

const hasServer = () => dataService.isDatabaseMode() || import.meta.env.PROD;

const Progress: React.FC<{ percent: number; label: string }> = ({ percent, label }) => (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} className="flex flex-col gap-1.5">
        <div className="h-2 overflow-hidden rounded-full bg-rp-inset">
            <div className="h-full rounded-full bg-rp-green transition-[width] duration-300" style={{ width: `${Math.max(4, Math.min(100, percent))}%` }} />
        </div>
        <span className="rp-tabular text-xs text-rp-muted">{label} · {Math.round(percent)}%</span>
    </div>
);

const CATEGORY_LABEL = Object.fromEntries(BACKUP_CATEGORIES.map(c => [c.key, c.label])) as Record<BackupCategory, string>;
const picked = (sel: Required<BackupSelectionOptions>) => BACKUP_CATEGORIES.filter(c => sel[c.key]).length;

const download = (name: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

/** Pick what goes in a backup, then download it. With a server the tables are read by a background job. */
const BackupSheet: React.FC<{ open: boolean; data: SettingsData; onClose: () => void }> = ({ open, data, onClose }) => {
    const [sel, setSel] = useState<Required<BackupSelectionOptions>>(ALL_ON);
    const [counts, setCounts] = useState<BackupCounts | null>(null);
    const [percent, setPercent] = useState<number | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open) return;
        setSel(ALL_ON); setPercent(null); setError(''); setCounts(null);
        let live = true;
        (async () => {
            try {
                const [trips, visited, events, entitlements] = await Promise.all([
                    dataService.getTrips(), dataService.getVisited(), dataService.getCustomEvents().catch(() => []), dataService.getEntitlementTypes().catch(() => []),
                ]);
                if (live) setCounts(countBackup({ trips, visited, events, entitlements, configs: data.savedConfigs, users: data.users, workspaceSettings: data.settings }));
            } catch { /* counts are a nicety */ }
        })();
        return () => { live = false; };
    }, [open, data.users, data.savedConfigs, data.settings]);

    const run = async () => {
        if (picked(sel) === 0) { setError('Pick something to back up.'); throw new Error('Nothing picked'); }
        setError(''); setPercent(2);
        try {
            const json = await dataService.exportFullState(sel, p => setPercent(p));
            download(`wandergrid-backup-${new Date().toISOString().split('T')[0]}.json`, json);
            setPercent(100);
            setTimeout(onClose, 900);
        } catch (e) {
            setPercent(null);
            setError(errorMessage(e, "The backup couldn't be made."));
            throw e;
        }
    };

    return (
        <RpSheet
            open={open}
            onClose={onClose}
            title="Back up"
            subtitle="A JSON file of what you pick. API keys are never included."
            footer={
                <>
                    <button type="button" onClick={onClose} className={CANCEL_BTN}>Cancel</button>
                    <ParticleButton onClick={run} successDuration={900} onError={() => undefined} pendingLabel="Backing up" successLabel="Downloaded" errorLabel="Try again" icon={<DownloadSimple aria-hidden />} className="!min-h-11">
                        Run backup
                    </ParticleButton>
                </>
            }
        >
            <div className="flex flex-col gap-3">
                <RpSection
                    title={`${picked(sel)} of ${BACKUP_CATEGORIES.length} included`}
                    icon={Database}
                    action={
                        <button type="button" onClick={() => setSel(picked(sel) === BACKUP_CATEGORIES.length ? ALL_OFF : ALL_ON)} className="inline-flex min-h-11 items-center rounded-full px-3 text-xs font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                            {picked(sel) === BACKUP_CATEGORIES.length ? 'Clear all' : 'Select all'}
                        </button>
                    }
                >
                    {BACKUP_CATEGORIES.map(c => (
                        <RpToggle key={c.key} label={c.label} hint={counts ? (c.key === 'settings' ? (counts.settings ? 'Configured' : 'Defaults') : `${counts[c.key]} ${counts[c.key] === 1 ? 'item' : 'items'}`) : c.hint} checked={sel[c.key]} onChange={on => setSel(s => ({ ...s, [c.key]: on }))} />
                    ))}
                </RpSection>
                {percent !== null ? <Progress percent={percent} label="Reading your data" /> : null}
                {error ? <p role="alert" className="text-sm text-rp-rust">{error}</p> : null}
            </div>
        </RpSheet>
    );
};

/** Restore from a backup file: merge keeps what is there, replace overwrites the groups you pick (a Hold button). */
const RestoreSheet: React.FC<{ file: { name: string; state: any } | null; onClose: () => void }> = ({ file, onClose }) => {
    const [mode, setMode] = useState<'merge' | 'replace'>('merge');
    const [sel, setSel] = useState<Required<BackupSelectionOptions>>(ALL_OFF);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);
    const counts = file ? countBackup(file.state) : null;

    useEffect(() => {
        if (file) { setMode('merge'); setSel(availableCategories(countBackup(file.state))); setError(''); setDone(false); }
    }, [file]);

    const run = async () => {
        if (!file) return;
        setError('');
        try {
            await dataService.importFullState(JSON.stringify(file.state), { mode, selectedCategories: sel });
            setDone(true);
            toast.success('Restored. Reloading…');
            setTimeout(() => window.location.reload(), 1100);
        } catch (e) {
            setError(errorMessage(e, 'The restore failed. Nothing may have changed; check the file and try again.'));
            throw e;
        }
    };

    const count = picked(sel);
    return (
        <RpSheet
            open={Boolean(file)}
            onClose={() => { if (!done) onClose(); }}
            title="Restore"
            subtitle={file ? <span className="block truncate">{file.name}{counts?.version ? ` · v${counts.version}` : ''}{counts?.timestamp ? ` · ${formatDate(counts.timestamp, 'short-with-year')}` : ''}</span> : undefined}
            footer={
                <>
                    <button type="button" onClick={onClose} disabled={done} className={CANCEL_BTN}>Cancel</button>
                    {mode === 'replace' ? (
                        <HoldButton resetAfter={0} disabled={count === 0 || done} onHoldComplete={() => { void run().catch(() => undefined); }} completeLabel="Restoring">
                            Hold to replace {count}
                        </HoldButton>
                    ) : (
                        <ParticleButton onClick={run} successDuration={1200} onError={() => undefined} pendingLabel="Merging" successLabel="Merged" errorLabel="Try again" disabled={count === 0 || done} icon={<ArrowsMerge aria-hidden />} className="!min-h-11">
                            Merge {count} {count === 1 ? 'group' : 'groups'}
                        </ParticleButton>
                    )}
                </>
            }
        >
            {file && counts ? (
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <span className="text-xs text-rp-muted" id="restore-mode">How</span>
                        <div role="group" aria-labelledby="restore-mode" className="flex flex-wrap gap-2">
                            <RpChip selected={mode === 'merge'} onClick={() => setMode('merge')}><ArrowsMerge size={16} aria-hidden /> Merge</RpChip>
                            <RpChip selected={mode === 'replace'} onClick={() => setMode('replace')}><ArrowsClockwise size={16} aria-hidden /> Replace</RpChip>
                        </div>
                        <p className="text-xs text-rp-muted">
                            {mode === 'merge' ? 'Adds new records and updates matching ones. Nothing is deleted.' : 'The groups you pick are replaced with the file. Everything else stays.'}
                        </p>
                    </div>
                    <RpSection title="What to restore" icon={Database}>
                        {BACKUP_CATEGORIES.map(c => {
                            const n = counts[c.key];
                            return (
                                <RpToggle
                                    key={c.key}
                                    label={c.label}
                                    hint={n > 0 ? (c.key === 'settings' ? 'In the file' : `${n} in the file`) : 'Not in the file'}
                                    checked={sel[c.key] && n > 0}
                                    disabled={n === 0}
                                    onChange={on => setSel(s => ({ ...s, [c.key]: on }))}
                                />
                            );
                        })}
                    </RpSection>
                    <p className="text-xs text-rp-muted">Your own sign-in and the workspace's API keys are kept.</p>
                    {mode === 'replace' ? (
                        <p className="flex items-start gap-2 rounded-rp-inset bg-rp-mustard/25 p-3 text-sm text-rp-ink">
                            <WarningCircle size={16} className="mt-0.5 shrink-0 text-rp-ochre" aria-hidden />
                            <span>Replacing overwrites your current {BACKUP_CATEGORIES.filter(c => sel[c.key]).map(c => CATEGORY_LABEL[c.key].toLowerCase()).join(', ') || 'data'}. Download a backup first if you may need it.</span>
                        </p>
                    ) : null}
                    {error ? <p role="alert" className="text-sm text-rp-rust">{error}</p> : null}
                </div>
            ) : null}
        </RpSheet>
    );
};

/** Reloads the airport and carrier lists on the server (a background job with progress). */
const RefreshSheet: React.FC<{ open: boolean; onClose: () => void; onDone: (message: string) => void }> = ({ open, onClose, onDone }) => {
    const [percent, setPercent] = useState<number | null>(null);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    useEffect(() => { if (open) { setPercent(null); setMessage(''); setError(''); } }, [open]);
    const available = hasServer();

    const run = async () => {
        setError(''); setMessage(''); setPercent(2);
        try {
            const result = await dataService.runServerJob('/jobs/refresh', p => setPercent(p));
            const text = result?.message || 'Airports and carriers are up to date.';
            setPercent(100); setMessage(text); onDone(text);
        } catch (e) {
            setPercent(null);
            setError(errorMessage(e, "The refresh didn't finish. The existing data was kept."));
            throw e;
        }
    };

    return (
        <RpSheet
            open={open}
            onClose={onClose}
            title="Refresh airports and carriers"
            subtitle="Downloads the latest lists. This also runs weekly."
            footer={
                <>
                    <button type="button" onClick={onClose} className={CANCEL_BTN}>Close</button>
                    <ParticleButton onClick={run} successDuration={1200} onError={() => undefined} pendingLabel="Refreshing" successLabel="Up to date" errorLabel="Try again" disabled={!available} icon={<ArrowsClockwise aria-hidden />} className="!min-h-11">
                        Refresh data
                    </ParticleButton>
                </>
            }
        >
            <div className="flex flex-col gap-3">
                {!available ? <p className="text-sm text-rp-muted">This needs the server. Local mode has no lists to refresh.</p> : null}
                {percent !== null ? <Progress percent={percent} label="Refreshing" /> : null}
                {message ? <p role="status" className="text-sm text-rp-green">{message}</p> : null}
                {error ? <p role="alert" className="text-sm text-rp-rust">{error}</p> : null}
            </div>
        </RpSheet>
    );
};

export const DataPane: React.FC<{ data: SettingsData; onNavigate: (path: string) => void }> = ({ data, onNavigate }) => {
    const [sheet, setSheet] = useState<'backup' | 'refresh' | 'wipe' | null>(null);
    const [restore, setRestore] = useState<{ name: string; state: any } | null>(null);
    const [lastRefresh, setLastRefresh] = useState<string>('');
    const fileRef = useRef<HTMLInputElement>(null);

    const pickFile = (file?: File) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                setRestore({ name: file.name, state: parseBackupText(String(reader.result || '')) });
            } catch (e) {
                toast.error(errorMessage(e, "That file couldn't be read."));
            }
        };
        reader.onerror = () => toast.error("That file couldn't be read.");
        reader.readAsText(file);
    };

    const pages: Record<string, StackPage> = {
        data: {
            title: 'Data',
            sections: [
                {
                    title: 'Backup',
                    rows: [
                        { id: 'backup', icon: DownloadSimple, label: 'Back up', detail: 'JSON file', onSelect: () => setSheet('backup') },
                        { id: 'restore', icon: UploadSimple, label: 'Restore from file', onSelect: () => fileRef.current?.click() },
                    ],
                },
                {
                    title: 'Lists',
                    rows: [
                        { id: 'refresh', icon: ArrowsClockwise, label: 'Refresh airports and carriers', detail: lastRefresh ? 'Just now' : hasServer() ? undefined : 'Needs the server', onSelect: () => setSheet('refresh') },
                        { id: 'import', icon: Airplane, label: 'Import flights', detail: 'On the Flights page', onSelect: () => onNavigate('/flights-new') },
                    ],
                    footer: 'Flights import CSV, Excel and JSON files, with column matching.',
                },
                {
                    title: 'Danger',
                    rows: [{ id: 'wipe', icon: Trash, label: 'Reset workspace', tone: 'danger' as const, onSelect: () => setSheet('wipe') }],
                },
            ],
        },
    };

    return (
        <section aria-label="Data">
            <PaneHeader icon={Database} title="Data" />
            <div className={cn(card, 'p-2 sm:p-3')}>
                <StackPanel pages={pages} root="data" bare />
            </div>
            <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-label="Backup file" onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />

            <BackupSheet open={sheet === 'backup'} data={data} onClose={() => setSheet(null)} />
            <RestoreSheet file={restore} onClose={() => setRestore(null)} />
            <RefreshSheet open={sheet === 'refresh'} onClose={() => setSheet(null)} onDone={setLastRefresh} />
            <HoldSheet
                open={sheet === 'wipe'}
                title="Reset the workspace?"
                holdLabel="Hold to reset everything"
                onClose={() => setSheet(null)}
                onConfirm={async () => { await dataService.wipeDatabase(); window.location.reload(); }}
            >
                This deletes every member, trip, flight, road trip, place, calendar entry, carrier and setting, and signs everyone out. It can't be undone. Download a backup first.
            </HoldSheet>
        </section>
    );
};
