import React, { useMemo, useRef, useState } from 'react';
import SmoothDrawer from '../../kokonutui/smooth-drawer';
import HoldButton from '../../kokonutui/hold-button';
import { ArrowRight, ArrowUndo, ArrowClockwise, CheckCircle, Stack, Trash, WarningCircle, X } from '../../ui/hugeicons';
import { getFlagEmoji } from '../../../services/geoData';
import { canonicalCountryName } from '../../../services/countryRegistry';
import type { MergeGroup, MergeChunk } from '../../../utils/atlasMergePlan';
import { sectionMergeGroups, type ReviewSection } from '../../../utils/atlasMergePlan';
import type { BatchRunState } from '../../../hooks/useBatchRun';
import { RpChipLabel } from './AtlasParts';
import { cn } from '../../../utils/cn';

const BTN = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted active:scale-[0.97]';
/** Rows shown per section before "Show more": a merge of hundreds of records never mounts hundreds of rows. */
const PAGE = 8;

export interface MergeControls {
    run: BatchRunState<MergeChunk>;
    start: () => void | Promise<void>;
    retry: () => void | Promise<void>;
    cancel: () => void;
    undo: () => void | Promise<void>;
    undoable: boolean;
    reset: () => void;
    summary: { before: number; after: number; removed: number } | null;
}

/**
 * Merge review: the duplicate records the merge would fold together, in a Smooth Drawer, grouped by country.
 * The merge only starts after a press-and-hold on the confirm button, then runs in steps with progress, can be
 * cancelled, retried where a step failed, and undone once it is done.
 */
export const MergeDrawer: React.FC<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    review: MergeGroup[];
    merge: MergeControls;
}> = ({ open, onOpenChange, review, merge }) => {
    const { run } = merge;
    // The list stays as it was reviewed while the merge runs and after it, since the stored records change under it.
    const frozen = useRef(review);
    if (run.status === 'idle') frozen.current = review;
    const listed = run.status === 'idle' ? review : frozen.current;
    const sections = useMemo(() => sectionMergeGroups(listed, code => canonicalCountryName(code)), [listed]);
    const merges = useMemo(() => listed.filter(r => r.kind === 'merge').length, [listed]);
    const running = run.status === 'running';
    const finished = run.status === 'done';

    const close = (next: boolean) => {
        if (!next && running) return; // keep the drawer while records are being written
        if (!next && finished) merge.reset();
        onOpenChange(next);
    };

    const description = running
        ? `Merging step ${Math.min(run.completed + 1, run.total)} of ${run.total}. Keep this page open.`
        : finished
            ? 'Done. Here is what changed.'
            : `${listed.length} ${listed.length === 1 ? 'place' : 'places'} to tidy up. Review them before merging.`;

    return (
        <SmoothDrawer
            open={open}
            onOpenChange={close}
            title="Merge duplicates"
            description={description}
            aside={finished ? undefined : <RpChipLabel>{merges} {merges === 1 ? 'merge' : 'merges'}</RpChipLabel>}
            detailsLabel={finished ? 'Show what changed' : 'Review the list'}
            hideDetailsLabel={finished ? 'Hide what changed' : 'Hide the list'}
            defaultExpanded
            action={
                running || finished
                    ? <RunPanel merge={merge} onClose={() => close(false)} />
                    : (
                        <HoldButton
                            variant="neutral"
                            icon={Stack}
                            holdingLabel="Keep holding to merge"
                            completeLabel="Merging"
                            resetAfter={0}
                            onHoldComplete={() => { void merge.start(); }}
                        >
                            Hold to merge
                        </HoldButton>
                    )
            }
        >
            <div className="flex flex-col gap-3">
                {sections.map((section, i) => <Section key={section.key} section={section} defaultOpen={i === 0} />)}
            </div>
        </SmoothDrawer>
    );
};

const RunPanel: React.FC<{ merge: MergeControls; onClose: () => void }> = ({ merge, onClose }) => {
    const { run, summary } = merge;
    const pct = run.total > 0 ? Math.round(((run.completed + run.failed.length) / run.total) * 100) : 0;
    if (run.status === 'running') {
        return (
            <div className="flex w-full flex-col gap-3" role="status" aria-live="polite">
                <div className="h-2 w-full overflow-hidden rounded-full bg-rp-inset" aria-hidden>
                    <div className="h-full rounded-full bg-rp-green transition-[width] duration-200" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <span className="rp-tabular text-sm text-rp-ink">{run.completed} of {run.total} steps done</span>
                    <button type="button" onClick={merge.cancel} className={cn(BTN, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}><X size={16} aria-hidden /> Stop</button>
                </div>
            </div>
        );
    }
    const failed = run.failed.length;
    const left = Math.max(0, run.total - run.completed - failed);
    const seconds = (run.durationMs / 1000).toFixed(1);
    const merged = summary ? summary.removed : 0;
    return (
        <div className="flex w-full flex-col gap-3" role="status" aria-live="polite">
            <div className="flex items-start gap-2">
                {failed > 0 || run.cancelled
                    ? <WarningCircle size={20} className="mt-0.5 shrink-0 text-rp-rust" aria-hidden />
                    : <CheckCircle size={20} className="mt-0.5 shrink-0 text-rp-green" aria-hidden />}
                <p className="text-sm text-rp-ink">
                    {failed === 0 && !run.cancelled
                        ? <>Merged {merged} duplicate {merged === 1 ? 'record' : 'records'}{summary ? <>: {summary.before} records are now {summary.after}</> : null}. Took {seconds}s.</>
                        : <>
                            {run.completed} of {run.total} steps merged{run.cancelled ? ` (stopped, ${left} left)` : ''}.
                            {failed > 0 ? <> {failed} {failed === 1 ? 'step' : 'steps'} didn't go through: {run.failed[0].error} Nothing in {failed === 1 ? 'it was' : 'them was'} changed.</> : null}
                        </>}
                </p>
            </div>
            <div className="flex flex-wrap gap-2">
                {failed > 0 || run.cancelled ? <button type="button" onClick={() => void merge.retry()} className={cn(BTN, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}><ArrowClockwise size={16} aria-hidden /> {run.cancelled && failed === 0 ? 'Continue' : 'Retry'}</button> : null}
                {merge.undoable && run.completed > 0 ? <button type="button" onClick={() => void merge.undo()} className={cn(BTN, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}><ArrowUndo size={16} aria-hidden /> Undo</button> : null}
                <button type="button" onClick={onClose} className={cn(BTN, failed > 0 || run.cancelled ? 'bg-rp-inset text-rp-ink hover:bg-rp-line' : 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}>Done</button>
            </div>
        </div>
    );
};

const sourceLabel = (s: MergeGroup['sources'][number]) =>
    s.type === 'country' ? `${s.name}${s.code ? ` · ${s.code}` : ''}` : `${s.name}${s.countryName ? ` · ${s.countryName}` : ''}`;

const Section: React.FC<{ section: ReviewSection; defaultOpen: boolean }> = ({ section, defaultOpen }) => {
    const [open, setOpen] = useState(defaultOpen);
    const [shown, setShown] = useState(PAGE);
    const merges = section.groups.filter(g => g.kind === 'merge').length;
    const visible = section.groups.slice(0, shown);
    return (
        <section className="flex flex-col gap-2">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                className="flex min-h-11 items-center gap-3 rounded-rp-inset px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-rp-muted"
            >
                <span aria-hidden className="text-lg leading-none">{section.code ? getFlagEmoji(section.code) : section.type === 'country' ? '🌍' : '📍'}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-rp-ink">{section.label}</span>
                <span className="rp-tabular shrink-0 text-xs text-rp-muted">{merges > 0 ? `${merges} ${merges === 1 ? 'merge' : 'merges'}` : `${section.groups.length}`}</span>
            </button>
            {open ? (
                <>
                    <ul className="flex flex-col gap-2">
                        {visible.map(group => <Row key={group.id} group={group} />)}
                    </ul>
                    {shown < section.groups.length ? (
                        <button type="button" onClick={() => setShown(n => n + 25)} className={cn(BTN, 'self-start bg-rp-inset text-rp-ink hover:bg-rp-line')}>
                            Show {Math.min(25, section.groups.length - shown)} more <span className="rp-tabular text-rp-muted">of {section.groups.length - shown}</span>
                        </button>
                    ) : null}
                </>
            ) : null}
        </section>
    );
};

const Row: React.FC<{ group: MergeGroup }> = React.memo(({ group }) => {
    const { record: rec } = group;
    return (
        <li className="flex items-start gap-3 rounded-rp-inset bg-rp-inset/60 p-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-rp-ink">{rec.name}</span>
                    <span className="shrink-0 text-2xs font-semibold text-rp-muted">
                        {group.kind === 'merge' ? `${group.sources.length} records` : group.kind === 'remove' ? 'Remove' : 'Tidy'}
                    </span>
                </div>
                {group.kind === 'remove' ? (
                    <span className="flex items-center gap-1.5 text-xs text-rp-muted">
                        <Trash size={12} aria-hidden /> Already covered by another record
                    </span>
                ) : (
                    <ul className="flex flex-col gap-0.5">
                        {group.sources.map(s => (
                            <li key={s.id} className="flex items-center gap-1.5 text-xs text-rp-muted">
                                <ArrowRight size={12} aria-hidden className="shrink-0" />
                                <span className="truncate">{sourceLabel(s)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </li>
    );
});
