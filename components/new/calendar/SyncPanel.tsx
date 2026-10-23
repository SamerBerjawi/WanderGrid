import React from 'react';
import { StackPanel, type StackPage, type StackRow } from '../../kokonutui/stack-panel';
import { Airplane, Bed, Bell, CalendarCheck, Clock, Eye, Flag, Lock, Suitcase, Sun, Ticket, Train } from '../../ui/hugeicons';
import type { FeedOptions } from '../../../utils/icsContext';

/**
 * "What to sync": which parts of your trips the subscribed calendar holds. Each switch changes the feed link
 * at once (one link is one choice); the choices that are not on or off open a small list.
 */

const STAY_LABEL: Record<FeedOptions['stay'], string> = { split: 'Check-in and check-out', span: 'One event for the stay' };
const STAY_SHORT: Record<FeedOptions['stay'], string> = { split: 'In and out', span: 'One event' };
const PRIVATE_LABEL: Record<FeedOptions['private'], string> = { full: 'Show details', busy: 'Show as "Private trip"', hide: 'Leave out' };
const PRIVATE_SHORT: Record<FeedOptions['private'], string> = { full: 'Details', busy: 'Block only', hide: 'Left out' };

export const SyncPanel: React.FC<{ options: FeedOptions; onChange: (patch: Partial<FeedOptions>) => void }> = ({ options, onChange }) => {
    const toggle = (id: keyof FeedOptions, label: string, icon: StackRow['icon'], detail?: string): StackRow => ({
        id, label, icon, detail, checked: Boolean(options[id]), onSelect: () => onChange({ [id]: !options[id] } as Partial<FeedOptions>),
    });
    const pick = <K extends 'stay' | 'private'>(key: K, labels: Record<FeedOptions[K], string>): StackPage => ({
        title: key === 'stay' ? 'Stays' : 'Private trips',
        sections: [{
            rows: (Object.keys(labels) as FeedOptions[K][]).map(value => ({
                id: String(value), label: labels[value], selected: options[key] === value,
                onSelect: () => onChange({ [key]: value } as Partial<FeedOptions>),
            })),
            footer: key === 'stay'
                ? 'Check-in and check-out are timed events with the address and confirmation code. One event spans the days you stay.'
                : 'Trips marked Private. The link is yours alone, so details show by default. Pick another option before you share the link with someone else.',
        }],
    });

    const pages: Record<string, StackPage> = {
        root: {
            title: 'Sync',
            sections: [
                {
                    title: 'Trips and bookings',
                    rows: [
                        toggle('trips', 'Trips', Suitcase, 'All-day span'),
                        toggle('flights', 'Flights', Airplane, 'One event each'),
                        toggle('transport', 'Trains, buses and ferries', Train),
                        toggle('stays', 'Stays', Bed),
                        toggle('activities', 'Activities', Ticket),
                    ],
                },
                {
                    title: 'Also',
                    rows: [
                        toggle('leave', 'Time off', Sun),
                        toggle('holidays', 'Public holidays', Flag),
                        toggle('planning', 'Trips still being planned', Clock),
                    ],
                    footer: 'Off by default so they do not repeat your own calendars. Holidays come from the calendars you follow.',
                },
                {
                    title: 'Details',
                    rows: [
                        ...(options.stays ? [{ id: 'stay', label: 'Stays appear as', icon: Bed, detail: STAY_SHORT[options.stay], to: 'stay' }] : []),
                        { id: 'private', label: 'Private trips', icon: options.private === 'full' ? Eye : Lock, detail: PRIVATE_SHORT[options.private], to: 'private' },
                        toggle('cost', 'Prices in notes', CalendarCheck),
                        toggle('reminders', 'Reminders', Bell),
                    ],
                    footer: 'Reminders alert 3 hours before a flight or train, 1 day before a check-in and 1 hour before an activity.',
                },
            ],
        },
        stay: pick('stay', STAY_LABEL),
        private: pick('private', PRIVATE_LABEL),
    };

    return <StackPanel pages={pages} root="root" bare />;
};
