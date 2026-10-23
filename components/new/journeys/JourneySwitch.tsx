import React from 'react';
import { openPage } from '../../../utils/appNavigation';
import { Airplane, Train } from '../../ui/hugeicons';
import { cn } from '../../../utils/cn';

/** Flights | Road trips: the two journey logs share one place in the menu, and this switches between them. */
const ITEMS = [
    { id: 'flights', label: 'Flights', path: '/flights', icon: Airplane },
    { id: 'roadtrips', label: 'Road trips', path: '/roadtrips', icon: Train },
] as const;

export const JourneySwitch: React.FC<{ current: 'flights' | 'roadtrips' }> = ({ current }) => (
    <nav aria-label="Journey logs" className="flex w-fit items-center gap-1 rounded-full bg-rp-surface p-1 rp-shadow-soft">
        {ITEMS.map(i => (
            <button
                key={i.id}
                type="button"
                aria-current={i.id === current ? 'page' : undefined}
                onClick={() => { if (i.id !== current) openPage(i.path); }}
                className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted',
                    i.id === current ? 'bg-rp-ink text-rp-on-ink' : 'text-rp-ink hover:bg-rp-inset'
                )}
            >
                <i.icon size={16} aria-hidden /> {i.label}
            </button>
        ))}
    </nav>
);
