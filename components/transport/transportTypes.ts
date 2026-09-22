import React from 'react';
import { 
    AirplaneTilt, 
    Train, 
    Bus, 
    Boat, 
    Key, 
    Car,
    Anchor
} from '@phosphor-icons/react';
import { TransportMode, Transport } from '../../types';

export type TripType = 'Round Trip' | 'One-Way' | 'Multi-City';

export interface SegmentForm {
    id: string;
    origin: string;
    destination: string;
    date: string; // Departure Date
    time: string; // Departure Time
    actualDepartureTime?: string;
    arrivalDate: string; // Arrival Date
    arrivalTime: string; // Arrival Time
    actualArrivalTime?: string;
    duration: number; // Duration in minutes
    provider: string; 
    providerCode: string; 
    identifier: string; 
    travelClass: string;
    seatType: string;
    seatNumber: string;
    isExitRow: boolean;
    website?: string;
    distance?: number;
    logoUrl?: string;
    section: 'outbound' | 'return';
    
    // Explicit & Logistics Fields
    departureTerminal?: string;
    departureGate?: string;
    arrivalTerminal?: string;
    arrivalGate?: string;
    tailNumber?: string;
    cabin?: string;
    isApproximate?: boolean;
    approximateYear?: number;
    customFields?: Array<{ key: string; value: string }>;
}

export interface CarForm {
    pickupLocation: string;
    dropoffLocation: string;
    pickupDate: string;
    pickupTime: string;
    dropoffDate: string;
    dropoffTime: string;
    duration: number; // Duration in minutes
    agency: string; 
    model: string; 
    confirmationCode: string;
    cost?: number;
    website?: string;
    distance?: number;
    logoUrl?: string;
    notes?: string;
}

export interface AirportData {
    iata: string;
    name: string;
    city: string;
    country: string;
}

export interface AirlineData {
    name: string;
    iata: string;
    icao?: string;
}

export const AVERAGE_SPEEDS: Record<TransportMode, number> = {
    'Flight': 800,
    'Train': 100,
    'Bus': 60,
    'Car Rental': 80,
    'Personal Car': 80,
    'Cruise': 30,
    'Ferry': 35
};

export const TRANSPORT_MODES: { mode: TransportMode; label: string; icon: React.ElementType }[] = [
    { mode: 'Flight', label: 'Flight', icon: AirplaneTilt },
    { mode: 'Train', label: 'Train', icon: Train },
    { mode: 'Bus', label: 'Bus', icon: Bus },
    { mode: 'Cruise', label: 'Ferry / Cruise', icon: Boat },
    { mode: 'Car Rental', label: 'Rental', icon: Key },
    { mode: 'Personal Car', label: 'My Car', icon: Car },
];

export const createDefaultSegment = (defaults?: Partial<SegmentForm>): SegmentForm => ({
    id: crypto.randomUUID(),
    origin: '',
    destination: '',
    date: '',
    time: '10:00',
    actualDepartureTime: '',
    arrivalDate: '',
    arrivalTime: '14:00',
    actualArrivalTime: '',
    duration: 240,
    provider: '',
    providerCode: '',
    identifier: '',
    travelClass: 'Economy',
    seatType: 'Window',
    seatNumber: '',
    isExitRow: false,
    section: 'outbound',
    departureTerminal: '',
    departureGate: '',
    arrivalTerminal: '',
    arrivalGate: '',
    tailNumber: '',
    cabin: '',
    isApproximate: false,
    approximateYear: new Date().getFullYear(),
    customFields: [],
    ...defaults
});
