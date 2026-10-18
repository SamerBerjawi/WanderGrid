import React, { useMemo } from 'react';
import SmoothDrawer from '../../kokonutui/smooth-drawer';
import HoldButton from '../../kokonutui/hold-button';
import { Stack, Trash, ArrowRight } from '../../ui/hugeicons';
import { getFlagEmoji } from '../../../services/geoData';
import type { CleanupReviewItem } from '../../../hooks/useAtlasData';
import { RpChipLabel } from './AtlasParts';

/**
 * Merge review: the duplicate records the merge would fold together, in a Smooth Drawer. The merge
 * only runs after a press-and-hold on the confirm button.
 */
export const MergeDrawer: React.FC<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    review: CleanupReviewItem[];
    onConfirm: () => Promise<void>;
}> = ({ open, onOpenChange, review, onConfirm }) => {
    const countries = useMemo(() => review.filter(r => r.record.type === 'country'), [review]);
    const cities = useMemo(() => review.filter(r => r.record.type === 'city'), [review]);
    const merges = review.filter(r => r.kind === 'merge').length;

    return (
        <SmoothDrawer
            open={open}
            onOpenChange={onOpenChange}
            title="Merge duplicates"
            description={`${review.length} ${review.length === 1 ? 'place' : 'places'} to tidy up. Review them before merging.`}
            aside={<RpChipLabel>{merges} {merges === 1 ? 'merge' : 'merges'}</RpChipLabel>}
            detailsLabel="Review the list"
            hideDetailsLabel="Hide the list"
            defaultExpanded
            action={
                <HoldButton
                    variant="neutral"
                    icon={Stack}
                    holdingLabel="Keep holding to merge"
                    completeLabel="Merged"
                    resetAfter={0}
                    onHoldComplete={async () => { await onConfirm(); onOpenChange(false); }}
                >
                    Hold to merge
                </HoldButton>
            }
        >
            <div className="flex flex-col gap-5">
                {countries.length > 0 ? <ReviewGroup title="Countries" items={countries} /> : null}
                {cities.length > 0 ? <ReviewGroup title="Cities" items={cities} /> : null}
            </div>
        </SmoothDrawer>
    );
};

const sourceLabel = (s: CleanupReviewItem['sources'][number]) =>
    s.type === 'country' ? `${s.name}${s.code ? ` · ${s.code}` : ''}` : `${s.name}${s.countryName ? ` · ${s.countryName}` : ''}`;

const ReviewGroup: React.FC<{ title: string; items: CleanupReviewItem[] }> = ({ title, items }) => (
    <section className="flex flex-col gap-2">
        <h3 className="px-1 text-xs font-medium text-rp-muted">{title} · {items.length}</h3>
        <ul className="flex flex-col gap-2">
            {items.map(item => {
                const code = item.record.type === 'country' ? item.record.code : item.record.countryCode;
                return (
                    <li key={item.id} className="flex items-start gap-3 rounded-rp-inset bg-rp-inset/60 p-3">
                        <span aria-hidden className="mt-0.5 text-lg leading-none">{code && code !== 'XX' ? getFlagEmoji(code) : '📍'}</span>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-medium text-rp-ink">{item.record.name}</span>
                                <span className="shrink-0 text-2xs font-semibold text-rp-muted">
                                    {item.kind === 'merge' ? `${item.sources.length} records` : item.kind === 'remove' ? 'Remove' : 'Tidy'}
                                </span>
                            </div>
                            {item.kind === 'remove' ? (
                                <span className="flex items-center gap-1.5 text-xs text-rp-muted">
                                    <Trash size={12} aria-hidden /> Already covered by another record
                                </span>
                            ) : (
                                <ul className="flex flex-col gap-0.5">
                                    {item.sources.map(s => (
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
            })}
        </ul>
    </section>
);
