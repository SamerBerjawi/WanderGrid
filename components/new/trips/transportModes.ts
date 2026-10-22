import type { TransportMode } from '../../../types';
import type { Place, PlaceKind, SearchMode } from '../../../services/placeSearch';
import { Airplane, Bus, Car, CarProfile, Ferry, Ship, Train, type Icon } from '../../ui/hugeicons';

/**
 * One place for what each kind of transport looks like on the New pages: its icon, its own accent
 * colour (UI_UX_DESIGN_REFERENCE.md decision 50) and the label for its number field. Class names are
 * written out in full so Tailwind finds them.
 */
export interface ModeLook {
    mode: TransportMode;
    label: string;
    icon: Icon;
    number: string;
    /** Icon and text colour. */
    text: string;
    /** A soft pill in the same accent, for codes and tags. */
    tint: string;
    /** A solid fill in the same accent, for a selected chip. */
    fill: string;
}

export const MODE_LOOKS: ModeLook[] = [
    { mode: 'Flight', label: 'Flight', icon: Airplane, number: 'Flight number', text: 'text-rp-rust', tint: 'bg-rp-rust/15 text-rp-rust', fill: 'bg-rp-rust text-rp-paper' },
    { mode: 'Train', label: 'Train', icon: Train, number: 'Train number', text: 'text-rp-green', tint: 'bg-rp-green/15 text-rp-green', fill: 'bg-rp-green text-rp-paper' },
    { mode: 'Bus', label: 'Bus', icon: Bus, number: 'Route number', text: 'text-rp-ochre', tint: 'bg-rp-mustard/25 text-rp-ochre', fill: 'bg-rp-mustard text-rp-on-mustard' },
    { mode: 'Car Rental', label: 'Car rental', icon: Car, number: 'Booking number', text: 'text-rp-ink', tint: 'bg-rp-ink/10 text-rp-ink', fill: 'bg-rp-ink text-rp-on-ink' },
    { mode: 'Personal Car', label: 'Own car', icon: CarProfile, number: 'Plate', text: 'text-rp-plum', tint: 'bg-rp-plum/15 text-rp-plum', fill: 'bg-rp-plum text-rp-paper' },
    { mode: 'Cruise', label: 'Cruise', icon: Ship, number: 'Booking number', text: 'text-rp-navy', tint: 'bg-rp-navy/15 text-rp-navy', fill: 'bg-rp-navy text-rp-paper' },
    { mode: 'Ferry', label: 'Ferry', icon: Ferry, number: 'Booking number', text: 'text-rp-sea', tint: 'bg-rp-sea/15 text-rp-sea', fill: 'bg-rp-sea text-rp-paper' },
];

const FALLBACK = MODE_LOOKS[0];
export const modeLook = (mode?: string): ModeLook => MODE_LOOKS.find(m => m.mode === mode) ?? FALLBACK;

/** What to search for in From and To, by kind of transport: the search mode and the kinds to list first. */
export const LEG_PLACES: Record<TransportMode, { mode: SearchMode; prefer: PlaceKind[]; hint: string }> = {
    Flight: { mode: 'airport', prefer: ['airport', 'city'], hint: 'Airport or city (AMS)' },
    Train: { mode: 'station', prefer: ['station', 'city'], hint: 'Station or city' },
    Bus: { mode: 'bus', prefer: ['station', 'city'], hint: 'Station or city' },
    Cruise: { mode: 'auto', prefer: ['port', 'city'], hint: 'Port or city' },
    Ferry: { mode: 'auto', prefer: ['port', 'city'], hint: 'Port or city' },
    'Car Rental': { mode: 'auto', prefer: ['city', 'airport', 'station'], hint: 'City, airport or station' },
    'Personal Car': { mode: 'auto', prefer: ['city'], hint: 'City or address' },
};
/** Flights keep the airport's IATA code (as the Map and flight tracking expect); other legs keep the place name. */
export const legText = (mode: TransportMode | undefined) => (p: Place) => (mode === 'Flight' && p.iata ? p.iata : p.name);

