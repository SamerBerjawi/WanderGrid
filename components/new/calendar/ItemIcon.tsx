import React from 'react';
import type { CalendarItem } from '../../../utils/calendarModel';
import { RpHugeicon } from '../RpHugeicon';
import { itemIcon } from './calendarStyles';

/**
 * A calendar item's icon: the icon chosen for a trip (as on the Trips page), else the item kind's own icon (a suitcase
 * for a trip, a sun for leave, a flag for a holiday, a star for an event).
 */
export const ItemIcon: React.FC<{ item: CalendarItem; size: number; className?: string }> = ({ item, size, className }) => {
    const Fallback = itemIcon(item);
    const fallback = <Fallback size={size} className={className} aria-hidden />;
    if (item.kind !== 'trip' || !item.trip?.hugeicon) return fallback;
    return <RpHugeicon name={item.trip.hugeicon} data={item.trip.hugeiconData} size={size} className={className} fallback={fallback} />;
};
