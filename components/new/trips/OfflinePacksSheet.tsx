import React from 'react';
import type { PackMeta } from '../../../utils/offlinePack';
import { describeAge, describePack } from '../../../utils/offlinePack';
import { getPack } from '../../../services/offlinePack';
import { formatDateRange } from '../../../utils/formatters';
import { ArrowUpRight, ArrowsClockwise, DownloadSimple, Trash } from '../../ui/hugeicons';
import { RpEmpty, RpSheet } from '../ui';
import { cn } from '../../../utils/cn';

/**
 * The trips saved for offline: open one to read it without a connection (the same details view, read-only), update
 * it from the live trip while online, or remove it. A copy is a snapshot kept on this device, refreshed whenever
 * the trip changes while you are online.
 */

const pill = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-rp-muted';

export const OfflinePacksSheet: React.FC<{
    open: boolean;
    onClose: () => void;
    packs: PackMeta[];
    online: boolean;
    /** Whether the live trip is loaded, so Update can refresh the copy from it. */
    canUpdate: (tripId: string) => boolean;
    onOpen: (tripId: string) => void;
    onUpdate: (tripId: string) => void;
    onRemove: (tripId: string) => void;
}> = ({ open, onClose, packs, online, canUpdate, onOpen, onUpdate, onRemove }) => (
    <RpSheet open={open} onClose={onClose} title="Saved for offline" subtitle={online ? `${packs.length} ${packs.length === 1 ? 'trip' : 'trips'} on this device` : "You're offline: these still work"} width={440}>
        {packs.length === 0 ? (
            <RpEmpty title="Nothing saved yet">Open a trip's menu and choose Save for offline. Its dates, bookings and booking references, stays and notes are kept on this device.</RpEmpty>
        ) : (
            <ul className="flex flex-col gap-3 py-1" aria-label="Saved trips">
                {packs.map(p => {
                    const snap = getPack(p.tripId);
                    return (
                        <li key={p.tripId} className="flex flex-col gap-3 rounded-rp-tile bg-rp-inset px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                                <span className="truncate text-base font-medium text-rp-ink">{p.name}</span>
                                <span className="rp-tabular text-xs text-rp-muted">{formatDateRange(p.startDate, p.endDate)}</span>
                                <span className="text-xs text-rp-muted">{snap ? describePack(snap.trip) : 'Copy missing'} · saved {describeAge(p.savedAt)}{p.tiles ? ` · ${p.tiles} map tiles` : ''}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <button type="button" onClick={() => onOpen(p.tripId)} disabled={!snap} className={cn(pill, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90 disabled:opacity-40')}>Open <ArrowUpRight size={14} aria-hidden /></button>
                                {online && canUpdate(p.tripId) ? <button type="button" onClick={() => onUpdate(p.tripId)} className={cn(pill, 'bg-rp-surface text-rp-ink hover:bg-rp-line')}><ArrowsClockwise size={14} aria-hidden /> Update</button> : null}
                                <button type="button" onClick={() => onRemove(p.tripId)} aria-label={`Remove ${p.name} from this device`} className={cn(pill, 'ml-auto text-rp-rust hover:bg-rp-rust/10')}><Trash size={14} aria-hidden /> Remove</button>
                            </div>
                        </li>
                    );
                })}
            </ul>
        )}
        <p className="flex items-start gap-2 px-1 pt-3 text-xs text-rp-muted"><DownloadSimple size={14} className="mt-0.5 shrink-0" aria-hidden /> Maps for the saved area are fetched when you save, and show offline when the installed app has kept them.</p>
    </RpSheet>
);
