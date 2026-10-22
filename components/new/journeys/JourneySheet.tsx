import React, { useEffect, useRef, useState } from 'react';
import type { Carrier, Transport, Trip } from '../../../types';
import SmoothDrawer from '../../kokonutui/smooth-drawer';
import HoldButton from '../../kokonutui/hold-button';
import { ArrowUpRight, MapTrifold, PencilSimple, Plus, Seat, Suitcase, Trash, X } from '../../ui/hugeicons';
import { RpSection, RpSheet, useIsMobile } from '../ui';
import { TripMenu } from '../trips/TripMenu';
import { BoardingPass } from './BoardingPass';
import { DelayChip, StatusPill } from './JourneyParts';
import { TrackPanel } from './TrackPanel';
import { SeatMap } from './SeatMap';
import { formatDate } from '../../../utils/formatters';
import { carrierLabel, isIndependent, journeyStatus, placeCode, type JourneyRecord } from '../../../utils/journeysModel';
import { cn } from '../../../utils/cn';

/**
 * The detail sheet of one journey (the invoice sheet of the reference video): its boarding pass, the
 * trip it belongs to (change it, or take it off), live status for flights, and Edit, Show on map and
 * Delete. A right sheet from tablets up, a Smooth Drawer on phones. Mode-aware, so Road trips reuse it.
 */

const GHOST = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted';

/** Keeps showing the last journey while the sheet animates closed. */
const useLast = <T,>(value: T | null): T | null => {
    const ref = useRef<T | null>(value);
    if (value) ref.current = value;
    return value ?? ref.current;
};

export const JourneySheet: React.FC<{
    record: JourneyRecord | null;
    trips: Trip[];
    noun: string;
    onClose: () => void;
    onEdit: (record: JourneyRecord) => void;
    onDelete: (record: JourneyRecord) => Promise<void> | void;
    onAssign: (record: JourneyRecord, tripId: string) => void;
    onCreateTrip?: (record: JourneyRecord) => void;
    onOpenTrip?: (tripId: string) => void;
    onShowOnMap?: (record: JourneyRecord) => void;
    onSaveDetails?: (record: JourneyRecord, patch: Partial<Transport>) => Promise<void>;
    brandfetchApiKey?: string;
    carriers?: Carrier[];
}> = ({ record, trips, noun, onClose, onEdit, onDelete, onAssign, onCreateTrip, onOpenTrip, onShowOnMap, onSaveDetails, brandfetchApiKey, carriers }) => {
    const mobile = useIsMobile();
    const shown = useLast(record);
    const [confirming, setConfirming] = useState(false);
    useEffect(() => { setConfirming(false); }, [record?.flight.id]);
    if (!shown) return null;

    const t = shown.flight;
    const independent = isIndependent(shown.trip.id);
    const status = journeyStatus(t);
    const title = `${placeCode(t.origin, t.mode)} → ${placeCode(t.destination, t.mode)}`;
    const subtitle = [carrierLabel(t), t.identifier].filter(Boolean).join(' ') + ` · ${formatDate(t.departureDate, 'short-with-year')}`;

    const tripItems = [
        ...(independent && onCreateTrip ? [{ id: 'new', label: `New trip from this ${noun}`, icon: Plus, selected: undefined as boolean | undefined, onSelect: () => onCreateTrip(shown) }] : []),
        { id: 'unassigned', label: 'No trip', icon: X, selected: independent, onSelect: () => onAssign(shown, 'unassigned') },
        ...trips.map(tr => ({ id: tr.id, label: tr.name, icon: Suitcase, selected: tr.id === shown.trip.id, onSelect: () => onAssign(shown, tr.id) })),
    ];

    const actions = (
        <>
            <button type="button" onClick={() => setConfirming(true)} className={cn(GHOST, 'text-rp-rust hover:bg-rp-rust/10')}>
                <Trash size={16} aria-hidden /> Delete
            </button>
            <span className="flex flex-wrap items-center justify-end gap-2">
                {onShowOnMap ? (
                    <button type="button" onClick={() => onShowOnMap(shown)} className={cn(GHOST, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}>
                        <MapTrifold size={16} aria-hidden /> Map
                    </button>
                ) : null}
                <button type="button" onClick={() => onEdit(shown)} className={cn(GHOST, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}>
                    <PencilSimple size={16} aria-hidden /> Edit
                </button>
            </span>
        </>
    );

    const body = confirming ? (
        <div className="flex flex-col gap-4 py-2">
            <p className="text-sm text-rp-muted">Delete {title} on {formatDate(t.departureDate, 'short-with-year')}? This can't be undone.</p>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="button" onClick={() => setConfirming(false)} className={cn(GHOST, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}>Keep {noun}</button>
                <HoldButton onHoldComplete={() => { void onDelete(shown); }} resetAfter={0}>Hold to delete</HoldButton>
            </div>
        </div>
    ) : (
        <div className="flex flex-col gap-5">
            <BoardingPass t={t} brandfetchApiKey={brandfetchApiKey} carriers={carriers} />
            <RpSection title="Trip" icon={Suitcase}>
                <div className="flex min-h-11 items-center justify-between gap-3 py-1">
                    <span className="min-w-0 truncate text-sm text-rp-ink">{independent ? 'Not on a trip' : shown.trip.name}</span>
                    <span className="flex shrink-0 items-center gap-1">
                        {!independent && onOpenTrip ? (
                            <button type="button" aria-label={`Open ${shown.trip.name}`} onClick={() => onOpenTrip(shown.trip.id)} className="inline-flex size-11 items-center justify-center rounded-full text-rp-muted outline-none hover:bg-rp-line hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">
                                <ArrowUpRight size={18} />
                            </button>
                        ) : null}
                        <TripMenu label="Choose a trip" pill={{ label: independent ? 'Add to trip' : 'Change', icon: Suitcase }} items={tripItems} />
                    </span>
                </div>
            </RpSection>
            {t.mode === 'Flight' && t.seatNumber && /\d+\s*[A-Za-z]/.test(t.seatNumber) ? (
                <RpSection title="Seat" icon={Seat}><SeatMap t={t} /></RpSection>
            ) : null}
            {t.mode === 'Flight' && status.state !== 'cancelled' ? (
                <TrackPanel flight={t} onSave={onSaveDetails ? patch => onSaveDetails(shown, patch) : undefined} />
            ) : null}
            {mobile ? <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rp-line pt-4">{actions}</div> : null}
        </div>
    );

    if (mobile) {
        return (
            <SmoothDrawer
                open={Boolean(record)}
                onOpenChange={o => { if (!o) onClose(); }}
                title={title}
                description={subtitle}
                aside={<span className="flex flex-col items-end gap-1"><StatusPill status={status} mode={t.mode} /><DelayChip delay={status.delay} /></span>}
                detailsLabel="Show pass and details"
                hideDetailsLabel="Hide details"
                defaultExpanded
                peekHeight={150}
            >
                {body}
            </SmoothDrawer>
        );
    }

    return (
        <RpSheet
            open={Boolean(record)}
            onClose={onClose}
            title={title}
            subtitle={subtitle}
            width={440}
            footer={confirming ? undefined : actions}
        >
            {body}
        </RpSheet>
    );
};
