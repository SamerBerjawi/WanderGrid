import React, { useState } from 'react';
import type { Trip } from '../../../types';
import { exportFileName, exportTrip } from '../../../utils/tripInterchange';
import { getActiveCurrency } from '../../../utils/formatters';
import { toast } from '../../../services/toast';
import { DownloadSimple, Warning } from '../../ui/hugeicons';
import { RpSheet } from '../ui';
import { cn } from '../../../utils/cn';

/**
 * Export trip as JSON, in the format Import itinerary reads (docs/TRIP_INTERCHANGE.md). Booking references, seats
 * and companions' names stay out unless asked for; spending and who paid never go in.
 */

const BTN = 'inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-rp-muted';

export const TripExportSheet: React.FC<{ trip: Trip | null; onClose: () => void }> = ({ trip, onClose }) => {
    const [includePrivate, setIncludePrivate] = useState(false);
    const close = () => { setIncludePrivate(false); onClose(); };
    const download = () => {
        if (!trip) return;
        const file = exportTrip(trip, { includePrivate, workspaceCurrency: getActiveCurrency(), now: new Date().toISOString() });
        const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = exportFileName(trip);
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.success(`Exported ${trip.name}`);
        close();
    };
    return (
        <RpSheet
            open={Boolean(trip)}
            onClose={close}
            title="Export as JSON"
            subtitle={trip?.name}
            width={440}
            footer={
                <>
                    <button type="button" onClick={close} className={cn(BTN, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}>Cancel</button>
                    <button type="button" onClick={download} className={cn(BTN, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}><DownloadSimple size={16} aria-hidden /> Download</button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <p className="text-sm text-rp-muted">The whole plan as one file: days, activities, stops, transport, stays and their shortlists, hidden gems and the budget estimate. Import it into another WanderGrid, or back into this trip, which then changes nothing.</p>
                <p className="text-sm text-rp-muted">Expenses, who paid, and the people with accounts on the trip are never included.</p>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-rp-inset bg-rp-inset/60 px-3 py-3">
                    <input type="checkbox" checked={includePrivate} onChange={e => setIncludePrivate(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-rp-ink" />
                    <span className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-rp-ink">Include booking references, seats and companions' names</span>
                        <span className="text-xs text-rp-muted">Off by default.</span>
                    </span>
                </label>
                {includePrivate ? (
                    <p role="alert" className="flex gap-2 rounded-rp-inset bg-rp-rust/10 px-3 py-2 text-xs text-rp-ink">
                        <Warning size={14} className="mt-0.5 shrink-0 text-rp-rust" aria-hidden />
                        Anyone with the file can use a booking reference to see, change or cancel a booking. Only share it with people you trust.
                    </p>
                ) : null}
            </div>
        </RpSheet>
    );
};

export default TripExportSheet;
