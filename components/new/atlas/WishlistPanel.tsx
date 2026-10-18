import React, { useMemo } from 'react';
import type { VisitedItem } from '../../../types';
import ThrowDeck, { type DeckCard } from '../../kokonutui/throw-deck';
import { Check } from '../../ui/hugeicons';
import { groupByRegion, regionOf } from '../../../utils/atlasModel';
import { CountryTile, FlagArt, RegionHeading } from './AtlasParts';

/**
 * Wishlist: a Throw Deck to triage (flick a card to send it under the deck and keep it, or tap
 * "Been there" to mark the top country visited), beside the full list for keyboard and quick edits.
 */
export const WishlistPanel: React.FC<{
    items: VisitedItem[];
    onOpen: (item: VisitedItem) => void;
    onPromote: (item: VisitedItem) => void;
}> = ({ items, onOpen, onPromote }) => {
    const cards = useMemo<DeckCard[]>(() => items.map(item => ({
        id: item.id,
        title: item.name,
        subtitle: regionOf(item.code),
        art: <FlagArt code={item.code} tone="wishlist" />,
        description: item.notes,
    })), [items]);
    const byId = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
    const groups = useMemo(() => groupByRegion(items, i => i.code), [items]);

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start">
            <section aria-label="Triage your wishlist" className="rounded-rp-card bg-rp-surface px-2 pt-4 pb-6 rp-shadow-rest lg:sticky lg:top-4">
                <div className="px-4">
                    <h3 className="text-base font-medium text-rp-ink">Where next?</h3>
                    <p className="text-xs text-rp-muted">Flick a card to keep it for later.</p>
                </div>
                <ThrowDeck
                    key={cards.map(c => c.id).join('|')}
                    cards={cards}
                    label="Wishlist deck. Drag the top card away, or use the arrow keys, to see the next country."
                    actionLabel="Open"
                    onAction={card => { const item = byId.get(card.id); if (item) onOpen(item); }}
                    topActionLabel="Been there"
                    topActionIcon={<Check size={16} />}
                    onTopAction={card => { const item = byId.get(card.id); if (item) onPromote(item); }}
                    className="min-h-0 py-4"
                />
            </section>
            <div>
                {groups.map(group => (
                    <section key={group.region} className="mt-7 first:mt-0">
                        <RegionHeading region={group.region} count={group.items.length} />
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {group.items.map(item => <CountryTile key={item.id} item={item} onClick={() => onOpen(item)} />)}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
};
