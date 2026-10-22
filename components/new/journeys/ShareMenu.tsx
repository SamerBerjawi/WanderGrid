import React from 'react';
import { TripMenu } from '../trips/TripMenu';
import { CalendarBlank, Copy, Export } from '../../ui/hugeicons';
import { exportJourneys } from './JourneyTransfer';
import { flightsToText } from '../../../utils/flightShare';
import { errorMessage, toast } from '../../../services/toast';
import type { JourneyRecord } from '../../../utils/journeysModel';

/**
 * Takes one flight or a whole journey out of the app: into the calendar (an .ics file with a reminder), onto
 * the clipboard as a plain itinerary, or through the device's share sheet when it has one.
 */
export const ShareMenu: React.FC<{ records: JourneyRecord[]; name?: string; className?: string }> = ({ records, name = 'flight', className }) => {
    const text = () => flightsToText(records);
    const items = [
        { id: 'ics', label: 'Add to calendar', icon: CalendarBlank, onSelect: () => { void exportJourneys(records, 'ics', `wandergrid-${name}`).then(() => toast.success('Calendar file downloaded')).catch(e => toast.error(errorMessage(e, "The calendar file didn't download."))); } },
        { id: 'copy', label: 'Copy itinerary', icon: Copy, onSelect: () => { void navigator.clipboard.writeText(text()).then(() => toast.success('Itinerary copied')).catch(() => toast.error("Couldn't copy. Select and copy it by hand.")); } },
        ...(typeof navigator !== 'undefined' && 'share' in navigator
            ? [{ id: 'share', label: 'Share…', icon: Export, onSelect: () => { void navigator.share({ title: records.length > 1 ? 'Itinerary' : 'Flight', text: text() }).catch(() => undefined); } }]
            : []),
    ];
    return <TripMenu label="Share" pill={{ label: 'Share', icon: Export }} items={items} triggerClassName={className} />;
};
