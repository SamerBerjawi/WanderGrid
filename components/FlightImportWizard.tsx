import React, { useRef, useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Trip, Transport, User } from '../types';
import { Button, Input, Select } from './ui';
import { flightImporter } from '../services/flightImportExport';
import { dataService } from '../services/mockDb';
import { getCarrierName, onlineCarrierIcaoToIata } from '../utils/flightData';
import { 
    Upload, 
    Columns, 
    Check, 
    ChevronRight, 
    Eye, 
    AlertCircle, 
    Sparkles, 
    Plane, 
    Calendar, 
    MapPin, 
    Tag, 
    Grid,
    Clock,
    UserCheck,
    XCircle,
    Filter
} from 'lucide-react';

interface FlightImportWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onImportComplete: (trips: Trip[]) => void;
    users?: User[];
    existingTripId?: string;
}

// 21 custom available fields requested by user
const TARGET_FIELDS = [
    { key: 'departureDate', label: 'Date', required: true, desc: 'Primary departure date (e.g., 2026-05-24)', icons: '📅' },
    { key: 'provider', label: 'Airline', required: true, desc: 'Name or IATA carrier code (e.g. Delta, Qantas, DL)', icons: '✈️' },
    { key: 'identifier', label: 'Flight', required: true, desc: 'Flight number (e.g., QF401, DL102)', icons: '🔢' },
    { key: 'origin', label: 'From', required: true, desc: 'Airport IATA code or city name (e.g., SFO, London)', icons: '↗️' },
    { key: 'destination', label: 'To', required: true, desc: 'Airport IATA code or city name (e.g., JFK, Paris)', icons: '↘️' },
    { key: 'departureTerminal', label: 'Dep Terminal', required: false, desc: 'Departure terminal letter/number', icons: '🏛️' },
    { key: 'departureGate', label: 'Dep Gate', required: false, desc: 'Departure gate number', icons: '🚪' },
    { key: 'arrivalTerminal', label: 'Arr Terminal', required: false, desc: 'Arrival terminal letter/number', icons: '🏛️' },
    { key: 'arrivalGate', label: 'Arr Gate', required: false, desc: 'Arrival gate number', icons: '🚪' },
    { key: 'isCancelled', label: 'Canceled', required: false, desc: 'TRUE or FALSE indicator', icons: '❌' },
    { key: 'departureDateTimeScheduled', label: 'Gate Departure (Scheduled)', required: false, desc: 'Scheduled departure datetime (combined, e.g. 2026-05-24 10:45)', icons: '⏰' },
    { key: 'departureDateTimeActual', label: 'Gate Departure (Actual)', required: false, desc: 'Actual departure datetime', icons: '⏱️' },
    { key: 'arrivalDateTimeScheduled', label: 'Gate Arrival (Scheduled)', required: false, desc: 'Scheduled arrival datetime', icons: '⏰' },
    { key: 'arrivalDateTimeActual', label: 'Gate Arrival (Actual)', required: false, desc: 'Actual arrival datetime', icons: '⏱️' },
    { key: 'vehicleModel', label: 'Aircraft Type Name', required: false, desc: 'e.g., Boeing 787-9, Airbus A350', icons: '🛩️' },
    { key: 'tailNumber', label: 'Tail Number', required: false, desc: 'e.g., N502DN, VH-OQL', icons: '🏷️' },
    { key: 'confirmationCode', label: 'PNR', required: false, desc: 'Booking confirmation / passenger locator', icons: '🎫' },
    { key: 'seatNumber', label: 'Seat', required: false, desc: 'e.g., 12A, 3B', icons: '💺' },
    { key: 'seatType', label: 'Seat Type', required: false, desc: 'Aisle, Window, Middle', icons: '🛋️' },
    { key: 'travelClass', label: 'Cabin Class', required: false, desc: 'Economy, Business, First', icons: '✨' },
    { key: 'reason', label: 'Flight Reason', required: false, desc: 'Business, Vacation, Commute', icons: '💡' }
];

// Rich datasets for fuzzy matching
const COMMON_AIRLINES: Record<string, { name: string; code: string }> = {
    'AA': { name: 'American Airlines', code: 'AA' },
    'DL': { name: 'Delta Air Lines', code: 'DL' },
    'UA': { name: 'United Airlines', code: 'UA' },
    'LH': { name: 'Lufthansa', code: 'LH' },
    'BA': { name: 'British Airways', code: 'BA' },
    'AF': { name: 'Air France', code: 'AF' },
    'EK': { name: 'Emirates', code: 'EK' },
    'QF': { name: 'Qantas', code: 'QF' },
    'SQ': { name: 'Singapore Airlines', code: 'SQ' },
    'CX': { name: 'Cathay Pacific', code: 'CX' },
    'JL': { name: 'Japan Airlines', code: 'JL' },
    'NH': { name: 'All Nippon Airways', code: 'NH' },
    'NZ': { name: 'Air New Zealand', code: 'NZ' },
    'VA': { name: 'Virgin Australia', code: 'VA' },
    'AC': { name: 'Air Canada', code: 'AC' },
    'KL': { name: 'KLM Royal Dutch Airlines', code: 'KL' },
    'IB': { name: 'Iberia', code: 'IB' },
    'AY': { name: 'Finnair', code: 'AY' },
    'QR': { name: 'Qatar Airways', code: 'QR' },
    'EY': { name: 'Etihad Airways', code: 'EY' },
    'WN': { name: 'Southwest Airlines', code: 'WN' },
    'B6': { name: 'JetBlue Airways', code: 'B6' },
    'AS': { name: 'Alaska Airlines', code: 'AS' },
    'FR': { name: 'Ryanair', code: 'FR' },
    'EZY': { name: 'EasyJet', code: 'EZY' },
    'U2': { name: 'EasyJet', code: 'EZY' },
    'TK': { name: 'Turkish Airlines', code: 'TK' },
    'ME': { name: 'Middle East Airlines', code: 'ME' },
    'MS': { name: 'EgyptAir', code: 'MS' },
    'SV': { name: 'Saudia', code: 'SV' },
    'RJ': { name: 'Royal Jordanian', code: 'RJ' },
    'LY': { name: 'El Al', code: 'LY' },
    'WY': { name: 'Oman Air', code: 'WY' },
    'GF': { name: 'Gulf Air', code: 'GF' },
    'KU': { name: 'Kuwait Airways', code: 'KU' },
    'EI': { name: 'Aer Lingus', code: 'EI' },
    'AZ': { name: 'ITA Airways', code: 'AZ' },
    'LX': { name: 'Swiss International Air Lines', code: 'LX' },
    'OS': { name: 'Austrian Airlines', code: 'OS' },
    'SN': { name: 'Brussels Airlines', code: 'SN' },
    'SK': { name: 'Scandinavian Airlines', code: 'SK' },
    'TP': { name: 'TAP Air Portugal', code: 'TP' },
    'SU': { name: 'Aeroflot', code: 'SU' },
    'KE': { name: 'Korean Air', code: 'KE' },
    'CZ': { name: 'China Southern Airlines', code: 'CZ' },
    'MU': { name: 'China Eastern Airlines', code: 'MU' },
    'CA': { name: 'Air China', code: 'CA' },
    'VN': { name: 'Vietnam Airlines', code: 'VN' },
    'MH': { name: 'Malaysia Airlines', code: 'MH' },
    'TG': { name: 'Thai Airways', code: 'TG' },
    'AI': { name: 'Air India', code: 'AI' },
    'ET': { name: 'Ethiopian Airlines', code: 'ET' },
    'SA': { name: 'South African Airways', code: 'SA' },
    'HA': { name: 'Hawaiian Airlines', code: 'HA' },
    'LA': { name: 'LATAM Airlines', code: 'LA' },
    'AM': { name: 'Aeroméxico', code: 'AM' },
    'WS': { name: 'WestJet', code: 'WS' },
    'NK': { name: 'Spirit Airlines', code: 'NK' },
    'F9': { name: 'Frontier Airlines', code: 'F9' },
};

const COMMON_AIRPORTS: Record<string, { code: string; city: string; name: string }> = {
    'JFK': { code: 'JFK', city: 'New York', name: 'John F. Kennedy International Airport' },
    'LGA': { code: 'LGA', city: 'New York', name: 'LaGuardia Airport' },
    'EWR': { code: 'EWR', city: 'New York', name: 'Newark Liberty International Airport' },
    'LHR': { code: 'LHR', city: 'London', name: 'Heathrow Airport' },
    'LGW': { code: 'LGW', city: 'London', name: 'Gatwick Airport' },
    'STN': { code: 'STN', city: 'London', name: 'Stansted Airport' },
    'CDG': { code: 'CDG', city: 'Paris', name: 'Charles de Gaulle Airport' },
    'ORY': { code: 'ORY', city: 'Paris', name: 'Orly Airport' },
    'DXB': { code: 'DXB', city: 'Dubai', name: 'Dubai International Airport' },
    'SFO': { code: 'SFO', city: 'San Francisco', name: 'San Francisco International Airport' },
    'LAX': { code: 'LAX', city: 'Los Angeles', name: 'Los Angeles International Airport' },
    'ORD': { code: 'ORD', city: 'Chicago', name: 'O\'Hare International Airport' },
    'HND': { code: 'HND', city: 'Tokyo', name: 'Haneda Airport' },
    'NRT': { code: 'NRT', city: 'Tokyo', name: 'Narita International Airport' },
    'SIN': { code: 'SIN', city: 'Singapore', name: 'Changi Airport' },
    'SYD': { code: 'SYD', city: 'Sydney', name: 'Sydney Airport' },
    'MEL': { code: 'MEL', city: 'Melbourne', name: 'Melbourne Airport' },
    'HKG': { code: 'HKG', city: 'Hong Kong', name: 'Hong Kong International Airport' },
    'FRA': { code: 'FRA', city: 'Frankfurt', name: 'Frankfurt Airport' },
    'AMS': { code: 'AMS', city: 'Amsterdam', name: 'Amsterdam Airport Schiphol' },
    'BEY': { code: 'BEY', city: 'Beirut', name: 'Beirut International Airport' },
    'IST': { code: 'IST', city: 'Istanbul', name: 'Istanbul Airport' },
    'AUH': { code: 'AUH', city: 'Abu Dhabi', name: 'Abu Dhabi International Airport' },
    'DOH': { code: 'DOH', city: 'Doha', name: 'Hamad International Airport' },
    'YVR': { code: 'YVR', city: 'Vancouver', name: 'Vancouver International Airport' },
    'YYZ': { code: 'YYZ', city: 'Toronto', name: 'Toronto Pearson International Airport' },
    'FCO': { code: 'FCO', city: 'Rome', name: 'Leonardo da Vinci-Fiumicino Airport' },
    'MAD': { code: 'MAD', city: 'Madrid', name: 'Adolfo Suárez Madrid-Barajas Airport' },
    'MUC': { code: 'MUC', city: 'Munich', name: 'Munich Airport' },
    'ATH': { code: 'ATH', city: 'Athens', name: 'Athens International Airport' },
    'ZRH': { code: 'ZRH', city: 'Zurich', name: 'Zurich Airport' },
    'CPH': { code: 'CPH', city: 'Copenhagen', name: 'Copenhagen Airport' },
    'BKK': { code: 'BKK', city: 'Bangkok', name: 'Suvarnabhumi Airport' },
    'ICN': { code: 'ICN', city: 'Seoul', name: 'Incheon International Airport' },
    'PEK': { code: 'PEK', city: 'Beijing', name: 'Beijing Capital Airport' },
    'PVG': { code: 'PVG', city: 'Shanghai', name: 'Shanghai Pudong Airport' },
    'TPE': { code: 'TPE', city: 'Taipei', name: 'Taiwan Taoyuan Airport' },
    'KIX': { code: 'KIX', city: 'Osaka', name: 'Kansai International Airport' },
    'DEL': { code: 'DEL', city: 'Delhi', name: 'Indira Gandhi International Airport' },
    'BOM': { code: 'BOM', city: 'Mumbai', name: 'Chhatrapati Shivaji Maharaj Airport' },
    'ATL': { code: 'ATL', city: 'Atlanta', name: 'Hartsfield-Jackson Atlanta Airport' },
    'DFW': { code: 'DFW', city: 'Dallas', name: 'Dallas/Fort Worth International Airport' },
    'MIA': { code: 'MIA', city: 'Miami', name: 'Miami International Airport' },
    'SEA': { code: 'SEA', city: 'Seattle', name: 'Seattle-Tacoma International Airport' },
    'BOS': { code: 'BOS', city: 'Boston', name: 'Logan International Airport' },
    'LAS': { code: 'LAS', city: 'Las Vegas', name: 'Harry Reid International Airport' },
    'DEN': { code: 'DEN', city: 'Denver', name: 'Denver International Airport' },
};

// Carrier name/code smart resolver
function resolveAirline(input: string, codeType: 'IATA' | 'ICAO' = 'IATA'): { name: string; code: string } {
    const clean = String(input || '').trim();
    if (!clean) return { name: 'Unknown Carrier', code: '' };

    const upper = clean.toUpperCase();

    // If ICAO code type, translate ICAO -> IATA using online map
    if (codeType === 'ICAO') {
        if (upper.length === 3 && onlineCarrierIcaoToIata.has(upper)) {
            const iata = onlineCarrierIcaoToIata.get(upper)!;
            const companyName = getCarrierName(iata) !== iata ? getCarrierName(iata) : (COMMON_AIRLINES[iata]?.name || '');
            return { name: companyName || iata, code: iata };
        }
        // Prefixed ICAO flight number (e.g. "DAL123", "DAL 123A")
        const icaoPrefixMatch = upper.match(/^([A-Z]{3})\s*\d+[A-Z]?$/);
        if (icaoPrefixMatch) {
            const prefix = icaoPrefixMatch[1];
            if (onlineCarrierIcaoToIata.has(prefix)) {
                const iata = onlineCarrierIcaoToIata.get(prefix)!;
                const companyName = getCarrierName(iata) !== iata ? getCarrierName(iata) : (COMMON_AIRLINES[iata]?.name || '');
                return { name: companyName || iata, code: iata };
            }
        }
    }

    // 1. Direct code lookup
    if (COMMON_AIRLINES[upper]) {
        return { name: COMMON_AIRLINES[upper].name, code: COMMON_AIRLINES[upper].code };
    }

    // Check if the online map can map it otherwise
    if (upper.length === 3 && onlineCarrierIcaoToIata.has(upper)) {
        const iata = onlineCarrierIcaoToIata.get(upper)!;
        const companyName = getCarrierName(iata) !== iata ? getCarrierName(iata) : (COMMON_AIRLINES[iata]?.name || '');
        return { name: companyName || iata, code: iata };
    }

    // 2. Exact or partial name match
    for (const [code, info] of Object.entries(COMMON_AIRLINES)) {
        if (info.name.toUpperCase().includes(upper) || upper.includes(info.name.toUpperCase())) {
            return { name: info.name, code: info.code };
        }
    }

    // 3. Fallback matching first word
    for (const [code, info] of Object.entries(COMMON_AIRLINES)) {
        const firstWord = info.name.split(/\s+/)[0].toUpperCase();
        if (firstWord.length > 3 && (upper.startsWith(firstWord) || firstWord.startsWith(upper))) {
            return { name: info.name, code: info.code };
        }
    }

    // 4. Fallback matching flight prefixes (e.g. "DL123", "DAL 123A")
    const codeMatch = upper.match(/^([A-Z]{2,3})\s*\d+[A-Z]?$/);
    if (codeMatch) {
        const prefix = codeMatch[1];
        if (prefix.length === 3 && onlineCarrierIcaoToIata.has(prefix)) {
            const iata = onlineCarrierIcaoToIata.get(prefix)!;
            const companyName = getCarrierName(iata) !== iata ? getCarrierName(iata) : (COMMON_AIRLINES[iata]?.name || iata);
            return { name: companyName, code: iata };
        }
        if (COMMON_AIRLINES[prefix]) {
            return { name: COMMON_AIRLINES[prefix].name, code: COMMON_AIRLINES[prefix].code };
        }
    }

    return { name: clean, code: '' };
}

// City/Airport smart resolver
function resolveAirport(input: string): { code: string; label: string } {
    const clean = String(input || '').trim();
    if (!clean) return { code: 'ZZZ', label: 'Unknown Airport' };

    const upper = clean.toUpperCase();

    // 1. 3-letter IATA code directly
    if (/^[A-Z]{3}$/.test(upper)) {
        if (COMMON_AIRPORTS[upper]) {
            return { code: upper, label: `${COMMON_AIRPORTS[upper].city} (${upper})` };
        }
        return { code: upper, label: `${clean} (${upper})` };
    }

    // 2. Match city name perfectly
    for (const [code, info] of Object.entries(COMMON_AIRPORTS)) {
        if (info.city.toUpperCase() === upper) {
            return { code, label: `${info.city} (${code})` };
        }
    }

    // 3. Match airport full name or partial city word
    for (const [code, info] of Object.entries(COMMON_AIRPORTS)) {
        if (info.city.toUpperCase().includes(upper) || 
            info.name.toUpperCase().includes(upper) || 
            upper.includes(info.city.toUpperCase()) || 
            upper.includes(info.name.toUpperCase())) {
            return { code, label: `${info.city} (${code})` };
        }
    }

    // Failsafe: first 3 alphabetical letters
    const justLetters = clean.replace(/[^A-Za-z]/g, '').toUpperCase();
    const fallbackCode = justLetters.slice(0, 3) || 'ZZZ';
    return { code: fallbackCode, label: `${clean} (${fallbackCode})` };
}

// Clean date only YYYY-MM-DD
function cleanDateFormat(dateStr: string): string {
    const clean = String(dateStr || '').trim();
    if (!clean) return '';

    // Standard YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
        return clean;
    }

    // US or EU style with / or -
    const usMatch = clean.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (usMatch) {
        const m = usMatch[1].padStart(2, '0');
        const d = usMatch[2].padStart(2, '0');
        const y = usMatch[3];
        // Guess if it's DD/MM/YYYY or MM/DD/YYYY
        if (parseInt(m, 10) > 12) {
            return `${y}-${d}-${m}`; // was DD/MM/YYYY
        }
        return `${y}-${m}-${d}`;
    }

    try {
        const d = new Date(clean);
        if (!isNaN(d.getTime())) {
            return d.toISOString().split('T')[0];
        }
    } catch {}

    return clean;
}

// Clean time only HH:MM
function cleanTimeFormat(timeStr: string): string {
    let clean = String(timeStr || '').trim().toUpperCase();
    if (!clean) return '';

    // Standard 12-hour AM/PM format
    const ampmMatch = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
    if (ampmMatch) {
        let hrs = parseInt(ampmMatch[1], 10);
        const mins = ampmMatch[2] || '00';
        const meridian = ampmMatch[3];

        if (meridian === 'PM' && hrs < 12) hrs += 12;
        if (meridian === 'AM' && hrs === 12) hrs = 0;

        return `${String(hrs).padStart(2, '0')}:${mins}`;
    }

    // 24-hour format (e.g. 14:35 or 09:12 or 14:35:00)
    const hhmmMatch = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (hhmmMatch) {
        const hrs = hhmmMatch[1].padStart(2, '0');
        const mins = hhmmMatch[2];
        return `${hrs}:${mins}`;
    }

    return '';
}

// Master Date/Time parser (handles single cell combined datetime)
function parseDateAndTime(dateVal: any, timeVal?: any): { date: string; time: string } {
    const defaultTime = '12:00';
    if (!dateVal) {
        return { date: '', time: defaultTime };
    }

    // JS Date object
    if (dateVal instanceof Date) {
        return {
            date: dateVal.toISOString().split('T')[0],
            time: dateVal.toTimeString().slice(0, 5)
        };
    }

    // Excel serial serial date
    if (typeof dateVal === 'number') {
        if (dateVal > 25569 && dateVal < 50000) {
            const dateObj = new Date((dateVal - 25569) * 24 * 3600 * 1000);
            const iso = dateObj.toISOString();
            return {
                date: iso.split('T')[0],
                time: iso.split('T')[1].slice(0, 5)
            };
        }
    }

    const dateStr = String(dateVal).trim();

    // Check if contains ISO "2026-05-24T12:00"
    if (dateStr.includes('T')) {
        const parts = dateStr.split('T');
        return {
            date: cleanDateFormat(parts[0]),
            time: cleanTimeFormat(parts[1]) || defaultTime
        };
    }

    // Check if contains whitespace separator "2026-05-24 14:35" or "05/24/2026 14:35"
    if (dateStr.includes(' ') && (dateStr.includes('/') || dateStr.includes('-'))) {
        const lastSpace = dateStr.lastIndexOf(' ');
        const dPart = dateStr.slice(0, lastSpace);
        const tPart = dateStr.slice(lastSpace + 1);
        const dResult = cleanDateFormat(dPart);
        const tResult = cleanTimeFormat(tPart);
        if (dResult) {
            return { date: dResult, time: tResult || defaultTime };
        }
    }

    // Fallback: Check if separate time parameter possesses high fidelity
    let finalTime = defaultTime;
    if (timeVal !== undefined && timeVal !== null) {
        if (typeof timeVal === 'number' && timeVal >= 0 && timeVal < 1) {
            const minutesTotal = Math.round(timeVal * 24 * 60);
            const hrs = Math.floor(minutesTotal / 60);
            const mins = minutesTotal % 60;
            finalTime = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
        } else {
            const cleanedTime = cleanTimeFormat(String(timeVal));
            if (cleanedTime) {
                finalTime = cleanedTime;
            }
        }
    }

    return {
        date: cleanDateFormat(dateStr),
        time: finalTime
    };
}

export const FlightImportWizard: React.FC<FlightImportWizardProps> = ({
    isOpen,
    onClose,
    onImportComplete,
    users = [],
    existingTripId
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [fileName, setFileName] = useState('');
    const [rawRows, setRawRows] = useState<any[]>([]);
    const [availableHeaders, setAvailableHeaders] = useState<string[]>([]);
    const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState(users[0]?.id || '');
    const [airlineCodeType, setAirlineCodeType] = useState<'IATA' | 'ICAO'>('IATA');

    // Backup restore states
    const [importMode, setImportMode] = useState<'spreadsheet' | 'backup'>('spreadsheet');
    const [backupDataState, setBackupDataState] = useState<string | null>(null);
    const [backupParsedCount, setBackupParsedCount] = useState<{ trips: number; flights: number; visited?: number } | null>(null);
    const [backupRestoreSuccess, setBackupRestoreSuccess] = useState(false);
    const [backupRestoreError, setBackupRestoreError] = useState('');

    // Advanced filtering state in Step 3
    const [importSearch, setImportSearch] = useState('');
    const [importAirlineFilter, setImportAirlineFilter] = useState('all');
    const [importClassFilter, setImportClassFilter] = useState('all');
    const [selectedImportIndexes, setSelectedImportIndexes] = useState<Set<number>>(new Set());

    const [importStartDateFilter, setImportStartDateFilter] = useState('');
    const [importEndDateFilter, setImportEndDateFilter] = useState('');
    const [duplicateResolutions, setDuplicateResolutions] = useState<Record<number, 'skip' | 'merge' | 'overwrite'>>({});
    const [dbFlights, setDbFlights] = useState<Transport[]>([]);
    const [dbTrips, setDbTrips] = useState<Trip[]>([]);

    useEffect(() => {
        dataService.getFlights().then(setDbFlights).catch(console.error);
        dataService.getTrips().then(setDbTrips).catch(console.error);
    }, []);

    const cleanIdString = (val: string) => {
        return (val || '').trim().split(' ').join('').toUpperCase();
    };

    const allExistingFlights = useMemo(() => {
        const list: Transport[] = [...dbFlights];
        dbTrips.forEach(t => {
            if (t.transports) {
                t.transports.forEach(tr => {
                    if (tr.mode === 'Flight') {
                        list.push(tr);
                    }
                });
            }
        });
        return list;
    }, [dbFlights, dbTrips]);

    // Synthesize raw rows using mapping into standard Transport[] list
    const mappedFlights = useMemo((): Transport[] => {
        if (rawRows.length === 0) return [];
        return rawRows.map(row => {
            const getRawVal = (fieldKey: string) => {
                const colName = columnMapping[fieldKey];
                return colName ? row[colName] : undefined;
            };

            const getStrVal = (fieldKey: string) => {
                const val = getRawVal(fieldKey);
                return val !== undefined && val !== null ? String(val).trim() : '';
            };

            // Carrier smart resolution
            const providerRaw = getStrVal('provider');
            const resolvedAirline = resolveAirline(providerRaw, airlineCodeType);

            // Origin / Destination smart resolution
            const originRaw = getStrVal('origin');
            const destinationRaw = getStrVal('destination');
            const resolvedOrigin = resolveAirport(originRaw);
            const resolvedDestination = resolveAirport(destinationRaw);

            // Smart Scheduled Date & Time parser
            const scheduledDepRaw = getRawVal('departureDateTimeScheduled') || getRawVal('departureDate');
            const depTimeRaw = getRawVal('departureTime');
            const { date: depDate, time: depTime } = parseDateAndTime(scheduledDepRaw, depTimeRaw);

            // Smart Scheduled Arrival Date & Time parser (defaults to departure date if not found)
            const scheduledArrRaw = getRawVal('arrivalDateTimeScheduled') || getRawVal('arrivalDate');
            const arrTimeRaw = getRawVal('arrivalTime');
            const { date: arrDate, time: arrTime } = parseDateAndTime(scheduledArrRaw || scheduledDepRaw, arrTimeRaw);

            const isCanceledRaw = getStrVal('isCancelled').toUpperCase();
            const isCanceled = isCanceledRaw === 'TRUE' || isCanceledRaw === 'YES' || isCanceledRaw === '1';

            // Custom fields containing actual values or cancel states
            const customFieldsList: Array<{ key: string; value: string }> = [];
            if (isCanceled) {
                customFieldsList.push({ key: 'Canceled', value: 'TRUE' });
            }
            const actualDep = getStrVal('departureDateTimeActual');
            if (actualDep) {
                customFieldsList.push({ key: 'Actual Departure', value: actualDep });
            }
            const actualArr = getStrVal('arrivalDateTimeActual');
            if (actualArr) {
                customFieldsList.push({ key: 'Actual Arrival', value: actualArr });
            }

            // Convert ICAO flight prefix to IATA if applicable
            let identifier = getStrVal('identifier') || 'FL-UNKNOWN';
            const idUpper = identifier.toUpperCase().trim();
            const idMatch = idUpper.match(/^([A-Z]{3})\s*(\d+[A-Z]?)$/);
            if (idMatch) {
                const icao = idMatch[1];
                const rest = idMatch[2];
                if (onlineCarrierIcaoToIata.has(icao)) {
                    identifier = onlineCarrierIcaoToIata.get(icao) + rest;
                }
            } else if (resolvedAirline.code && !idUpper.startsWith(resolvedAirline.code)) {
                // If identifier is just numbers but we know the provider code, prepend it nicely for standardization
                const numberOnlyMatch = identifier.match(/^\d+$/);
                if (numberOnlyMatch) {
                    identifier = resolvedAirline.code + identifier;
                }
            }

            return {
                id: Math.random().toString(36).substr(2, 9),
                itineraryId: Math.random().toString(36).substr(2, 9),
                type: 'One-Way',
                mode: 'Flight',
                provider: resolvedAirline.name,
                providerCode: resolvedAirline.code,
                identifier: identifier,
                origin: resolvedOrigin.code,
                destination: resolvedDestination.code,
                departureDate: depDate,
                departureTime: depTime,
                arrivalDate: arrDate || depDate,
                arrivalTime: arrTime || '14:00',
                departureTerminal: getStrVal('departureTerminal'),
                departureGate: getStrVal('departureGate'),
                arrivalTerminal: getStrVal('arrivalTerminal'),
                arrivalGate: getStrVal('arrivalGate'),
                tailNumber: getStrVal('tailNumber'),
                vehicleModel: getStrVal('vehicleModel') || 'Boeing 737', // Aircraft Type Name
                confirmationCode: getStrVal('confirmationCode'),
                seatNumber: getStrVal('seatNumber'),
                seatType: (getStrVal('seatType') || 'Aisle') as Transport['seatType'],
                travelClass: (getStrVal('travelClass') || 'Economy') as Transport['travelClass'],
                reason: getStrVal('reason') || 'Personal',
                isApproximate: isCanceled, // flag canceled
                customFields: customFieldsList
            };
        });
    }, [rawRows, columnMapping]);

    useEffect(() => {
        if (step === 3 && mappedFlights.length > 0) {
            const resolutions: Record<number, 'skip' | 'merge' | 'overwrite'> = {};
            mappedFlights.forEach((flight, idx) => {
                const isDuplicate = allExistingFlights.some(ex => 
                    ex.departureDate === flight.departureDate && 
                    cleanIdString(ex.identifier) === cleanIdString(flight.identifier) && 
                    ex.origin.trim().toUpperCase() === flight.origin.trim().toUpperCase()
                );
                if (isDuplicate) {
                    resolutions[idx] = 'skip';
                }
            });
            setDuplicateResolutions(resolutions);
            
            const initialSelected = new Set<number>();
            mappedFlights.forEach((_, idx) => {
                initialSelected.add(idx);
            });
            setSelectedImportIndexes(initialSelected);
        }
    }, [step, mappedFlights, allExistingFlights]);

    const findExistingFlightSource = (flight: Transport) => {
        const indep = dbFlights.find(ex => 
            ex.departureDate === flight.departureDate && 
            cleanIdString(ex.identifier) === cleanIdString(flight.identifier) && 
            ex.origin.trim().toUpperCase() === flight.origin.trim().toUpperCase()
        );
        if (indep) {
            return { type: 'independent' as const, id: indep.id, item: indep };
        }
        for (const trip of dbTrips) {
            if (trip.transports) {
                const tr = trip.transports.find(ex => 
                    ex.mode === 'Flight' &&
                    ex.departureDate === flight.departureDate && 
                    cleanIdString(ex.identifier) === cleanIdString(flight.identifier) && 
                    ex.origin.trim().toUpperCase() === flight.origin.trim().toUpperCase()
                );
                if (tr) {
                    return { type: 'trip' as const, tripId: trip.id, id: tr.id, item: tr };
                }
            }
        }
        return null;
    };

    const mergeFlights = (existing: Transport, incoming: Transport): Transport => {
        const merged = { ...existing };
        (Object.keys(incoming) as Array<keyof Transport>).forEach(key => {
            const val = incoming[key];
            if (key === 'customFields') {
                const combinedCustom = [...(existing.customFields || [])];
                (incoming.customFields || []).forEach(cf => {
                    if (!combinedCustom.some(c => c.key === cf.key)) {
                        combinedCustom.push(cf);
                    }
                });
                merged.customFields = combinedCustom;
            } else if (val !== undefined && val !== null && val !== '' && val !== 0) {
                (merged as any)[key] = val;
            }
        });
        merged.id = existing.id;
        merged.itineraryId = existing.itineraryId;
        return merged;
    };

    const overwriteFlight = (existing: Transport, incoming: Transport): Transport => {
        return {
            ...incoming,
            id: existing.id,
            itineraryId: existing.itineraryId
        };
    };

    const handleProcessBackupRestore = async () => {
        if (!backupDataState) return;
        try {
            setBackupRestoreError('');
            await dataService.importFullState(backupDataState);
            setBackupRestoreSuccess(true);
            setTimeout(() => {
                onImportComplete([]);
                onClose();
                window.location.reload();
            }, 1800);
        } catch (e: any) {
            console.error(e);
            setBackupRestoreError(e.message || "Failed to parse restore state");
        }
    };

    // Read general excel/csv/json file to raw state
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setFileName(file.name);

        // Check for JSON backup file format
        if (file.name.toLowerCase().endsWith('.json')) {
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const content = evt.target?.result as string;
                    const parsed = JSON.parse(content);
                    let flightsNum = 0;
                    let tripsNum = 0;
                    let visitedNum = 0;
                    if (parsed.independent_flights && Array.isArray(parsed.independent_flights)) {
                        flightsNum += parsed.independent_flights.length;
                    }
                    if (parsed.flights && Array.isArray(parsed.flights)) {
                        flightsNum += parsed.flights.length;
                    }
                    if (parsed.trips && Array.isArray(parsed.trips)) {
                        tripsNum = parsed.trips.length;
                        parsed.trips.forEach((t: any) => {
                            if (t.transports && Array.isArray(t.transports)) {
                                flightsNum += t.transports.length;
                            }
                        });
                    }
                    if (parsed.visited && Array.isArray(parsed.visited)) {
                        visitedNum = parsed.visited.length;
                    }
                    setBackupDataState(content);
                    setBackupParsedCount({ trips: tripsNum, flights: flightsNum, visited: visitedNum });
                    setImportMode('backup');
                    setBackupRestoreSuccess(false);
                    setBackupRestoreError('');
                } catch (err: any) {
                    console.error(err);
                    alert("This JSON file does not appear to be a valid backup file.");
                    setBackupDataState(null);
                    setBackupParsedCount(null);
                }
            };
            reader.readAsText(file);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        // Spreadsheet flow
        setImportMode('spreadsheet');
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const jsonRows = XLSX.utils.sheet_to_json(sheet) as any[];

                if (jsonRows.length === 0) {
                    alert("The uploaded file contains no rows.");
                    return;
                }

                setRawRows(jsonRows);

                // Collect unique keys/headers
                const headersSet = new Set<string>();
                jsonRows.forEach(row => {
                    Object.keys(row).forEach(key => headersSet.add(key));
                });
                const headers = Array.from(headersSet);
                setAvailableHeaders(headers);

                // Extended smart auto-mapping covering all requested fields
                const initialMapping: Record<string, string> = {};
                TARGET_FIELDS.forEach(tf => {
                    const matchedHeader = headers.find(h => {
                        const hLower = h.toLowerCase().trim();
                        const keyLower = tf.key.toLowerCase();
                        
                        if (hLower === keyLower) return true;
                        
                        if (tf.key === 'departureDate' && (hLower === 'date' || hLower === 'departure date' || hLower.includes('date of travel') || hLower.includes('dep date'))) return true;
                        if (tf.key === 'provider' && (hLower === 'airline' || hLower === 'carrier' || hLower === 'operator' || hLower === 'provider')) return true;
                        if (tf.key === 'identifier' && (hLower === 'flight' || hLower === 'flight number' || hLower === 'flightno' || hLower === 'identifier' || hLower === 'flight_number')) return true;
                        if (tf.key === 'origin' && (hLower === 'from' || hLower === 'origin' || hLower.includes('dep airport') || hLower.includes('from_airport') || hLower === 'dep')) return true;
                        if (tf.key === 'destination' && (hLower === 'to' || hLower === 'destination' || hLower.includes('arr airport') || hLower.includes('to_airport') || hLower === 'arr')) return true;
                        if (tf.key === 'departureTerminal' && (hLower === 'dep terminal' || hLower.includes('departure terminal') || hLower === 'from terminal')) return true;
                        if (tf.key === 'departureGate' && (hLower === 'dep gate' || hLower.includes('departure gate') || hLower === 'from gate')) return true;
                        if (tf.key === 'arrivalTerminal' && (hLower === 'arr terminal' || hLower.includes('arrival terminal') || hLower === 'to terminal')) return true;
                        if (tf.key === 'arrivalGate' && (hLower === 'arr gate' || hLower.includes('arrival gate') || hLower === 'to gate')) return true;
                        if (tf.key === 'isCancelled' && (hLower === 'canceled' || hLower === 'is_canceled' || hLower === 'cancelled')) return true;
                        if (tf.key === 'departureDateTimeScheduled' && (hLower === 'gate departure (scheduled)' || hLower.includes('departure (scheduled)') || hLower.includes('scheduled departure time'))) return true;
                        if (tf.key === 'departureDateTimeActual' && (hLower === 'gate departure (actual)' || hLower.includes('departure (actual)') || hLower.includes('actual departure time'))) return true;
                        if (tf.key === 'arrivalDateTimeScheduled' && (hLower === 'gate arrival (scheduled)' || hLower.includes('arrival (scheduled)') || hLower.includes('scheduled arrival time'))) return true;
                        if (tf.key === 'arrivalDateTimeActual' && (hLower === 'gate arrival (actual)' || hLower.includes('arrival (actual)') || hLower.includes('actual arrival time'))) return true;
                        if (tf.key === 'vehicleModel' && (hLower === 'aircraft type name' || hLower.includes('aircraft type') || hLower === 'aircraft' || hLower === 'aircraft_type' || hLower.includes('equipment'))) return true;
                        if (tf.key === 'tailNumber' && (hLower === 'tail number' || hLower === 'tailno' || hLower === 'tail_number' || hLower === 'reg' || hLower === 'registration')) return true;
                        if (tf.key === 'confirmationCode' && (hLower === 'pnr' || hLower.includes('confirmation') || hLower === 'booking ref' || hLower === 'booking_reference')) return true;
                        if (tf.key === 'seatNumber' && (hLower === 'seat' || hLower === 'seat number' || hLower === 'seat_number' || hLower === 'seatno')) return true;
                        if (tf.key === 'seatType' && (hLower === 'seat type' || hLower === 'seat_type')) return true;
                        if (tf.key === 'travelClass' && (hLower === 'cabin class' || hLower === 'cabin' || hLower === 'class' || hLower === 'travel_class')) return true;
                        if (tf.key === 'reason' && (hLower === 'flight reason' || hLower === 'reason' || hLower === 'flight_reason')) return true;

                        return false;
                    });
                    if (matchedHeader) {
                        initialMapping[tf.key] = matchedHeader;
                    } else {
                        initialMapping[tf.key] = '';
                    }
                });

                setColumnMapping(initialMapping);
                setStep(2);
            } catch (err) {
                console.error(err);
                alert("Failed to read sheet. Ensure it is a valid Excel or CSV table.");
            }
        };
        reader.readAsArrayBuffer(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };



    if (!isOpen) return null;

    const handleConfirmMapping = () => {
        // Validation: Verify key items have some mapping
        const missingRequired = TARGET_FIELDS.find(t => t.required && !columnMapping[t.key]);
        if (missingRequired) {
            alert(`Please map the required field: ${missingRequired.label}`);
            return;
        }
        setStep(3);
    };

    const handleProcessAndSave = async () => {
        const targetTripId = existingTripId;
        const targetUser = selectedUserId || 'user_holder';
        
        // Filter mappedFlights based on active filters and selected indices
        const filteredMappedFlights = mappedFlights.filter((flight, index) => {
            if (importSearch) {
                const q = importSearch.toLowerCase();
                const searchStr = `${flight.provider} ${flight.identifier} ${flight.origin} ${flight.destination} ${flight.confirmationCode || ''} ${flight.tailNumber || ''}`.toLowerCase();
                if (!searchStr.includes(q)) return false;
            }
            if (importAirlineFilter !== 'all') {
                if (flight.provider !== importAirlineFilter) return false;
            }
            if (importClassFilter !== 'all') {
                if (flight.travelClass !== importClassFilter) return false;
            }
            if (importStartDateFilter) {
                if (!flight.departureDate || flight.departureDate < importStartDateFilter) return false;
            }
            if (importEndDateFilter) {
                if (!flight.departureDate || flight.departureDate > importEndDateFilter) return false;
            }
            return true;
        });

        const flightsToSave = filteredMappedFlights.filter((flight) => {
            const originalIndex = mappedFlights.indexOf(flight);
            return selectedImportIndexes.has(originalIndex);
        });

        setIsProcessing(true);
        try {
            if (targetTripId) {
                const trip = await dataService.getTripById(targetTripId);
                if (trip) {
                    const currentTransports = trip.transports || [];
                    const mergedTransports = [...currentTransports, ...flightsToSave.map(leg => ({
                        ...leg,
                        itineraryId: currentTransports[0]?.itineraryId || Math.random().toString(36).substr(2, 9),
                        type: trip.transports?.length ? trip.transports[0].type : 'Multi-City'
                    }))];

                    const updatedTrip: Trip = {
                        ...trip,
                        transports: mergedTransports,
                        startDate: mergedTransports[0]?.departureDate || trip.startDate,
                        endDate: mergedTransports[mergedTransports.length - 1]?.arrivalDate || mergedTransports[mergedTransports.length - 1]?.departureDate || trip.endDate,
                    };
                    await dataService.updateTrip(updatedTrip);
                    onImportComplete([updatedTrip]);
                }
            } else {
                // Save flights as independent unassigned flights using bulk upsert
                await dataService.addFlights(flightsToSave);
                onImportComplete([]);
            }
            onClose();
        } catch (e) {
            console.error('Import error', e);
            alert('An error occurred while saving imported data.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div 
            className="fixed inset-0 bg-gray-900/50 dark:bg-black/80 backdrop-blur-md flex items-center justify-center z-[9000] p-4 text-light-text dark:text-dark-text animate-fade-in"
            style={{ WebkitBackdropFilter: 'blur(12px)' }}
        >
            <div className="bg-white/95 dark:bg-dark-card/95 backdrop-blur-sm border border-black/10 dark:border-white/15 rounded-3xl shadow-glass-modal flex flex-col w-full max-w-6xl h-[85vh] overflow-hidden animate-scale-up" style={{ WebkitBackdropFilter: 'blur(4px)' }}>
                
                {/* Header section with stepper */}
                <div className="p-6 border-b border-slate-150/50 dark:border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50 dark:bg-zinc-800/40">
                    <div>
                        <span className="text-2xs font-bold uppercase text-blue-500 tracking-widest flex items-center gap-1.5 mb-1">
                            <Sparkles className="w-3.5 h-3.5" /> Core Data Ingestion
                        </span>
                        <h3 className="text-2xl font-black text-gray-900 dark:text-white leading-none">Smart Flight Spreadsheet Loader</h3>
                    </div>
                    
                    {/* Stepper display */}
                    <div className="flex items-center gap-2">
                        <div className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${step === 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-zinc-800 text-zinc-400'}`}>
                            <span className="w-4 h-4 rounded-full bg-white/20 text-center text-2xs leading-4 font-bold">1</span>
                            Upload File
                        </div>
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                        <div className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${step === 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-zinc-800 text-zinc-400'}`}>
                            <span className="w-4 h-4 rounded-full bg-white/20 text-center text-2xs leading-4 font-bold">2</span>
                            Field Mapping
                        </div>
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                        <div className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${step === 3 ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-zinc-800 text-zinc-400'}`}>
                            <span className="w-4 h-4 rounded-full bg-white/20 text-center text-2xs leading-4 font-bold">3</span>
                            Confirm Flights
                        </div>
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                    {step === 1 && (
                        <div className="max-w-xl mx-auto space-y-8 py-6">
                            {/* Toggle import mode selection tabs */}
                            <div className="flex bg-gray-150 dark:bg-zinc-805 p-1 rounded-2xl relative border border-zinc-200/50 dark:border-white/5 shadow-inner">
                                <button
                                    type="button"
                                    onClick={() => { setImportMode('spreadsheet'); setBackupDataState(null); }}
                                    className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                                        importMode === 'spreadsheet'
                                            ? 'bg-blue-600 text-white shadow-md font-extrabold'
                                            : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                                    }`}
                                >
                                    📊 Ingest Spreadsheet (CSV / Excel)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setImportMode('backup'); }}
                                    className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                                        importMode === 'backup'
                                            ? 'bg-amber-600 dark:bg-amber-500 text-white shadow-md font-extrabold'
                                            : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                                    }`}
                                >
                                    📥 Restore Backup File (.json)
                                </button>
                            </div>

                            {importMode === 'spreadsheet' ? (
                                <div className="space-y-6 text-center">
                                    <div className="space-y-2">
                                        <h4 className="text-xl font-black text-gray-950 dark:text-white">Ingest Flight Logs via Excel or CSV</h4>
                                        <p className="text-sm font-medium text-zinc-500 max-w-md mx-auto">
                                            Upload standard spreadsheets containing lists of booked business flights or passenger logs, and assign them easily.
                                        </p>
                                    </div>
                                    <div 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="border-3 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-blue-500 dark:hover:border-blue-500 rounded-3xl p-16 cursor-pointer bg-slate-50/50 dark:bg-zinc-800/10 group transition-all duration-300"
                                    >
                                        <Upload className="w-12 h-12 text-blue-500 mx-auto mb-4 group-hover:-translate-y-1 transition-transform" />
                                        <p className="text-base font-black text-gray-800 dark:text-zinc-200 mb-1">Click to browse computer files</p>
                                        <p className="text-xs text-zinc-500">Supports .csv, .xlsx, .xls</p>
                                    </div>
                                    <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.xlsx,.xls" onChange={handleFileChange} />
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {!backupDataState ? (
                                        <div className="space-y-6 text-center">
                                            <div className="space-y-2">
                                                <h4 className="text-xl font-black text-gray-950 dark:text-white">Restore Session State from Backup</h4>
                                                <p className="text-sm font-medium text-zinc-500 max-w-md mx-auto">
                                                    Restoring database backups lets you retrieve previously cataloged flight boards, travel rosters, historical segments, and settings.
                                                </p>
                                            </div>
                                            <div 
                                                onClick={() => fileInputRef.current?.click()}
                                                className="border-3 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-amber-500 dark:hover:border-amber-500 rounded-3xl p-16 cursor-pointer bg-slate-50/50 dark:bg-zinc-800/10 group transition-all duration-300"
                                            >
                                                <Upload className="w-12 h-12 text-amber-500 mx-auto mb-4 group-hover:-translate-y-1 transition-transform" />
                                                <p className="text-base font-black text-gray-800 dark:text-zinc-200 mb-1">Select backup .json file</p>
                                                <p className="text-xs text-zinc-500">Supports Wandergrid JSON file format</p>
                                            </div>
                                            <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileChange} />
                                        </div>
                                    ) : (
                                        <div className="max-w-xl mx-auto text-left space-y-6 p-6 bg-amber-500/5 dark:bg-amber-500/10 rounded-3xl border border-amber-500/20 shadow-md">
                                            <div className="flex items-start gap-3">
                                                <span className="text-3xl">📤</span>
                                                <div>
                                                    <h4 className="text-lg font-black text-gray-950 dark:text-white">Workspace State Backup Loaded</h4>
                                                    <p className="text-xs text-zinc-400">File: <span className="font-mono text-zinc-500 dark:text-zinc-300 font-bold">{fileName}</span></p>
                                                </div>
                                            </div>
                                            
                                            <div className="space-y-2 border-t border-b border-zinc-200/50 dark:border-white/5 py-4">
                                                <p className="text-sm font-bold text-zinc-850 dark:text-zinc-200">Detected Database Metrics:</p>
                                                <ul className="text-xs font-bold text-zinc-650 dark:text-zinc-400 list-disc list-inside space-y-1">
                                                    <li>Trips cataloged: <span className="font-mono text-amber-500">{backupParsedCount?.trips || 0} items</span></li>
                                                    <li>Total flight legs: <span className="font-mono text-amber-500">{backupParsedCount?.flights || 0} routes</span></li>
                                                    <li>Travel Atlas (visited): <span className="font-mono text-amber-500">{backupParsedCount?.visited || 0} places</span></li>
                                                </ul>
                                            </div>

                                            <div className="rounded-2xl p-4 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
                                                <span className="font-extrabold uppercase tracking-widest block mb-1">⚠️ Crucial Warning</span>
                                                Restoring from a backup will overwrite your *entire database state*. All current travel configurations, active family member profiles, mapped airports, and ticket schedules will be completely overridden. This process cannot be undone!
                                            </div>

                                            {backupRestoreSuccess ? (
                                                <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-550 text-emerald-600 dark:text-emerald-450 text-sm font-bold text-center">
                                                    🎉 Database backup successfully restored! Reloading session parameters...
                                                </div>
                                            ) : (
                                                <div className="flex gap-4">
                                                    <Button variant="secondary" onClick={() => { setBackupDataState(null); }} className="flex-1 font-bold">Cancel</Button>
                                                    <Button variant="danger" onClick={handleProcessBackupRestore} className="flex-1 font-bold">Yes, Restore Backup</Button>
                                                </div>
                                            )}

                                            {backupRestoreError && (
                                                <div className="p-3 bg-rose-100 text-rose-600 rounded-xl text-xs font-bold border border-rose-300">
                                                    Failed to restore state: {backupRestoreError}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6">
                            <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/20 flex gap-3 items-center">
                                <Columns className="w-5 h-5 text-blue-500 shrink-0" />
                                <div className="text-left font-sans">
                                    <p className="text-xs font-black uppercase text-blue-600 dark:text-blue-400">Automated Parser Engaged</p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Match targeted fields with your spreadsheet headers in <span className="font-bold text-gray-700 dark:text-white">({fileName})</span>. Our system fuzzily parses carrier lookup names, airport cities vs code, and combined datetimes.</p>
                                </div>
                            </div>

                            {/* Carrier Format Input Toggle */}
                            <div className="p-4 rounded-3xl bg-slate-50 dark:bg-zinc-800/40 border border-zinc-200/50 dark:border-zinc-805 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-left">
                                <div>
                                    <p className="text-xs font-black uppercase text-zinc-800 dark:text-zinc-200">Carrier Code Column Format</p>
                                    <p className="text-xs text-zinc-500">Is your spreadsheet using 2-letter IATA (DL) or 3-letter ICAO (DAL) codes for airlines?</p>
                                </div>
                                <div className="flex bg-gray-200 dark:bg-zinc-800 p-1 rounded-2xl shrink-0 self-stretch sm:self-auto">
                                    <button
                                        type="button"
                                        onClick={() => setAirlineCodeType('IATA')}
                                        className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                            airlineCodeType === 'IATA'
                                                ? 'bg-blue-600 text-white shadow-md'
                                                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                                        }`}
                                    >
                                        IATA Code (DL)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAirlineCodeType('ICAO')}
                                        className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                            airlineCodeType === 'ICAO'
                                                ? 'bg-blue-600 text-white shadow-md'
                                                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                                        }`}
                                    >
                                        ICAO Code (DAL)
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
                                {/* Mappings column */}
                                <div className="lg:col-span-5 space-y-4">
                                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest block ml-1">Spreadsheet Column Mapping</span>
                                    <div className="space-y-3 max-h-[48vh] overflow-y-auto pr-2 custom-scrollbar">
                                        {TARGET_FIELDS.map((tf) => (
                                            <div key={tf.key} className="flex items-center gap-3 p-3 bg-slate-50/50 dark:bg-zinc-800/10 hover:bg-slate-50 dark:hover:bg-zinc-800/20 rounded-2xl border border-zinc-200/50 dark:border-zinc-850">
                                                <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-sm shrink-0">
                                                    {tf.icons}
                                                </div>
                                                <div className="flex-1 text-left min-w-0">
                                                    <span className="text-xs font-black text-gray-800 dark:text-zinc-200">
                                                        {tf.label} {tf.required && <span className="text-red-500">*</span>}
                                                    </span>
                                                    <p className="text-xs text-zinc-500 truncate">{tf.desc}</p>
                                                </div>
                                                <div className="w-1/2">
                                                    <select
                                                        value={columnMapping[tf.key] || ''}
                                                        onChange={(e) => setColumnMapping(prev => ({ ...prev, [tf.key]: e.target.value }))}
                                                        className="w-full text-xs p-2 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 outline-none focus:border-blue-500 font-medium"
                                                    >
                                                        <option value="">-- Ignored / Not Set --</option>
                                                        {availableHeaders.map((header) => (
                                                            <option key={header} value={header}>{header}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Live preview visualizer */}
                                <div className="lg:col-span-7 space-y-4 flex flex-col">
                                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                                        <Eye className="w-4 h-4 text-zinc-400" /> Intelligent Preview (First 4 Rows)
                                    </span>
                                    <div className="border border-zinc-200/50 dark:border-zinc-800 dark:bg-zinc-900/40 rounded-3xl p-4 flex-1 overflow-y-auto max-h-[48vh] space-y-3 custom-scrollbar">
                                        {mappedFlights.slice(0, 4).map((f, index) => (
                                            <div key={index} className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-205 dark:border-white/5 shadow-sm text-left flex flex-col gap-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-black text-gray-900 dark:text-white flex items-center gap-1.5">
                                                            <Plane className="w-3.5 h-3.5 text-blue-500" />
                                                            {f.provider || 'Unmapped Airline'}
                                                        </span>
                                                        {f.providerCode && (
                                                            <span className="text-2xs font-mono font-bold bg-blue-100 dark:bg-blue-900/45 px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-400">{f.providerCode}</span>
                                                        )}
                                                        <span className="text-2xs font-mono font-bold bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500 uppercase tracking-wide">{f.identifier || 'No Flight #'}</span>
                                                    </div>

                                                    {f.isApproximate && (
                                                        <span className="text-2xs font-bold uppercase tracking-wide bg-red-100 dark:bg-red-950/40 text-red-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                            <XCircle className="w-2.5 h-2.5" /> Checked Canceled
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 border-t border-b border-zinc-150/50 dark:border-zinc-800 py-2.5 my-0.5">
                                                    <div>
                                                        <span className="text-2xs uppercase font-bold text-zinc-400 block">Departure</span>
                                                        <span className="text-xs font-black text-blue-600 dark:text-blue-450">{f.origin || '???'}</span>
                                                        {f.departureTerminal && <span className="text-xs font-bold text-zinc-500"> (T{f.departureTerminal})</span>}
                                                    </div>
                                                    <div>
                                                        <span className="text-2xs uppercase font-bold text-zinc-400 block">Arrival</span>
                                                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-405">{f.destination || '???'}</span>
                                                        {f.arrivalTerminal && <span className="text-xs font-bold text-zinc-500"> (T{f.arrivalTerminal})</span>}
                                                    </div>
                                                    <div>
                                                        <span className="text-2xs uppercase font-bold text-zinc-400 block">Schedule</span>
                                                        <span className="text-xs font-bold text-gray-800 dark:text-zinc-200">{f.departureDate || 'Unmapped'}</span>
                                                        <span className="text-xs font-mono text-zinc-500 block">{f.departureTime}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-2xs uppercase font-bold text-zinc-400 block">Aircraft / Tail</span>
                                                        <span className="text-xs font-bold text-gray-800 dark:text-zinc-200 truncate block">{f.vehicleModel || 'N/A'}</span>
                                                        {f.tailNumber && <span className="text-2xs font-mono text-zinc-500 block">{f.tailNumber}</span>}
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
                                                    {f.confirmationCode && <span>PNR: <strong className="font-bold text-gray-700 dark:text-zinc-300">{f.confirmationCode}</strong></span>}
                                                    {f.seatNumber && <span>Seat: <strong className="font-bold text-gray-700 dark:text-zinc-300">{f.seatNumber} ({f.seatType})</strong></span>}
                                                    {f.travelClass && <span>Cabin: <strong className="font-bold text-gray-700 dark:text-zinc-300">{f.travelClass}</strong></span>}
                                                    {f.reason && <span>Reason: <strong className="font-bold text-gray-700 dark:text-zinc-300">{f.reason}</strong></span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4 border-t border-zinc-150/50 dark:border-white/5">
                                <Button variant="secondary" onClick={() => setStep(1)} className="flex-1 py-3 font-bold !rounded-2xl">Cancel & Reupload</Button>
                                <Button variant="primary" onClick={handleConfirmMapping} className="flex-1 py-3 font-bold !rounded-2xl">
                                    Next: Verify Flight Details
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (() => {
                        // Extract unique airlines from mapped flights for select options Filter
                        const uniqueAirlines = Array.from(new Set(mappedFlights.map(f => f.provider).filter(Boolean)));
                        const uniqueClasses = Array.from(new Set(mappedFlights.map(f => f.travelClass).filter(Boolean)));

                        // Apply actual filters to mappedFlights
                        const displayedImportFlights = mappedFlights.map((flight, index) => ({ flight, index })).filter(({ flight }) => {
                            if (importSearch) {
                                const q = importSearch.toLowerCase();
                                const searchStr = `${flight.provider} ${flight.identifier} ${flight.origin} ${flight.destination} ${flight.confirmationCode || ''} ${flight.tailNumber || ''}`.toLowerCase();
                                if (!searchStr.includes(q)) return false;
                            }
                            if (importAirlineFilter !== 'all') {
                                if (flight.provider !== importAirlineFilter) return false;
                            }
                            if (importClassFilter !== 'all') {
                                if (flight.travelClass !== importClassFilter) return false;
                            }
                            if (importStartDateFilter) {
                                if (!flight.departureDate || flight.departureDate < importStartDateFilter) return false;
                            }
                            if (importEndDateFilter) {
                                if (!flight.departureDate || flight.departureDate > importEndDateFilter) return false;
                            }
                            return true;
                        });

                        const handleToggleSelectAll = () => {
                            const isAllSelected = displayedImportFlights.every(({ index }) => selectedImportIndexes.has(index));
                            const updated = new Set<number>();
                            if (!isAllSelected) {
                                // select all displayed flights and clear others so only filtered results are selected
                                displayedImportFlights.forEach(({ index }) => {
                                    updated.add(index);
                                });
                            }
                            setSelectedImportIndexes(updated);
                        };

                        const handleToggleIndex = (idx: number) => {
                            const updated = new Set(selectedImportIndexes);
                            if (updated.has(idx)) {
                                updated.delete(idx);
                            } else {
                                updated.add(idx);
                            }
                            setSelectedImportIndexes(updated);
                        };

                        return (
                            <div className="space-y-6">
                                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/30 flex gap-3 items-center animate-fade-in">
                                    <Check className="w-5 h-5 shrink-0" />
                                    <div className="text-left font-medium-sans">
                                        <p className="text-xs font-black uppercase text-emerald-600 dark:text-emerald-400">Ingested Spreadsheet Fully Validated</p>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Smart resolvers successfully mapped <span className="font-bold text-gray-800 dark:text-white">{mappedFlights.length} flights</span>. Dates, carrier codes, and airport locations have been standardized.</p>
                                    </div>
                                </div>

                                {/* Advanced Filters inside Ingestion Dialog */}
                                <div className="p-4 bg-slate-50 dark:bg-zinc-800/20 border border-zinc-200/50 dark:border-zinc-800 rounded-3xl space-y-3.5 text-left">
                                    <div className="flex items-center justify-between border-b border-zinc-150 dark:border-white/5 pb-2">
                                        <span className="text-2xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                                            <Filter className="w-3.5 h-3.5 text-blue-500" /> Advanced Pipeline Filtering
                                        </span>
                                        <span className="text-xs font-mono font-bold text-zinc-550 mr-1.5">
                                            Selected: <span className="text-blue-500 font-extrabold">{selectedImportIndexes.size}</span> / {mappedFlights.length} total
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                                        <div>
                                            <label className="text-2xs font-bold text-zinc-450 uppercase block mb-1">Search flight text</label>
                                            <input
                                                type="text"
                                                value={importSearch}
                                                onChange={e => setImportSearch(e.target.value)}
                                                placeholder="e.g. Origin, destination, PNR..."
                                                className="w-full text-xs p-2 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-blue-500 font-medium"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-2xs font-bold text-zinc-450 uppercase block mb-1">Filter by Carrier</label>
                                            <select
                                                value={importAirlineFilter}
                                                onChange={e => setImportAirlineFilter(e.target.value)}
                                                className="w-full text-xs p-2 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-blue-500 font-medium cursor-pointer"
                                            >
                                                <option value="all">All Airlines</option>
                                                {uniqueAirlines.map(airline => (
                                                    <option key={airline} value={airline}>{airline}</option>
                                                 ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-2xs font-bold text-zinc-450 uppercase block mb-1">Filter by Cabin</label>
                                            <select
                                                value={importClassFilter}
                                                onChange={e => setImportClassFilter(e.target.value)}
                                                className="w-full text-xs p-2 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-blue-500 font-medium cursor-pointer"
                                            >
                                                <option value="all">All Cabin Classes</option>
                                                {uniqueClasses.map(cls => (
                                                    <option key={cls} value={cls}>{cls}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-2xs font-bold text-zinc-450 uppercase block mb-1">Start Date</label>
                                            <input
                                                type="date"
                                                value={importStartDateFilter}
                                                onChange={e => setImportStartDateFilter(e.target.value)}
                                                className="w-full text-xs p-2 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-blue-500 font-medium cursor-pointer"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-2xs font-bold text-zinc-450 uppercase block mb-1">End Date</label>
                                            <input
                                                type="date"
                                                value={importEndDateFilter}
                                                onChange={e => setImportEndDateFilter(e.target.value)}
                                                className="w-full text-xs p-2 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-blue-500 font-medium cursor-pointer"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* User attribution */}
                                {!existingTripId && users.length > 0 && (
                                    <div className="space-y-2 p-4 bg-slate-50 dark:bg-zinc-800/10 rounded-2xl border border-zinc-150/50 dark:border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                        <div className="text-left font-sans">
                                            <label className="text-2xs font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Assign Passenger Ledger</label>
                                            <p className="text-xs text-zinc-500 leading-none">Who will be the designated passenger traveler for this trip sequence?</p>
                                        </div>
                                        <div className="w-full md:w-1/3">
                                            <select
                                                value={selectedUserId}
                                                onChange={(e) => setSelectedUserId(e.target.value)}
                                                className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-zinc-750 bg-white dark:bg-zinc-800 outline-none focus:border-blue-500 font-bold text-xs cursor-pointer"
                                            >
                                                {users.map(u => (
                                                    <option key={u.id} value={u.id}>{u.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center justify-between ml-1">
                                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest block text-left">
                                        Import Pipeline Flights ({displayedImportFlights.length} showing)
                                    </span>
                                    <button
                                        type="button"
                                        onClick={handleToggleSelectAll}
                                        className="text-xs text-blue-500 hover:text-blue-600 font-bold uppercase tracking-wider cursor-pointer"
                                    >
                                        {displayedImportFlights.every(({ index }) => selectedImportIndexes.has(index)) ? '🔒 Deselect All' : '🔓 Select All Visible'}
                                    </button>
                                </div>

                                <div className="border border-zinc-150/50 dark:border-zinc-800 dark:bg-zinc-900/40 rounded-3xl p-4 max-h-[35vh] overflow-y-auto space-y-3 custom-scrollbar">
                                    {displayedImportFlights.length === 0 ? (
                                        <div className="p-8 text-center text-zinc-500 font-semibold-sans text-xs">
                                            No flights match active pipelining filters.
                                        </div>
                                    ) : (
                                        displayedImportFlights.map(({ flight: f, index }) => {
                                            const isSelected = selectedImportIndexes.has(index);
                                            return (
                                                <div 
                                                    key={index} 
                                                    onClick={() => handleToggleIndex(index)}
                                                    className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 text-left cursor-pointer select-none ${
                                                        isSelected 
                                                            ? 'bg-blue-500/5 dark:bg-blue-500/10 border-blue-500 dark:border-blue-450 shadow-xs' 
                                                            : 'bg-white dark:bg-zinc-900 border-zinc-150/50 dark:border-white/5 opacity-60 hover:opacity-90'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3 font-sans">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={isSelected}
                                                            onChange={() => {}} // toggled on card container click
                                                            className="w-4.5 h-4.5 accent-blue-500 rounded cursor-pointer shrink-0"
                                                        />
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2 flex-wrap text-sm font-black text-gray-850 dark:text-zinc-100">
                                                                <span>{f.provider}</span>
                                                                {f.providerCode && (
                                                                    <span className="text-2xs font-mono font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-550 px-1 py-0.5 rounded">{f.providerCode}</span>
                                                                )}
                                                                <span className="text-2xs font-mono font-bold bg-blue-50 dark:bg-blue-950/30 text-blue-600 px-1 py-0.5 rounded uppercase">{f.identifier}</span>
                                                                {f.vehicleModel && (
                                                                    <span className="text-2xs font-bold text-zinc-400 italic">({f.vehicleModel})</span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs font-mono font-bold text-zinc-400 uppercase">
                                                                <span className="text-blue-500">{f.origin}</span>
                                                                <span>&rarr;</span>
                                                                <span className="text-indigo-500">{f.destination}</span>
                                                                {f.tailNumber && <span className="text-emerald-500 text-xs">({f.tailNumber})</span>}
                                                            </div>
                                                            {allExistingFlights.some(ex => 
                                                                ex.departureDate === f.departureDate && 
                                                                cleanIdString(ex.identifier) === cleanIdString(f.identifier) && 
                                                                ex.origin.trim().toUpperCase() === f.origin.trim().toUpperCase()
                                                            ) && (
                                                                <div 
                                                                    onClick={(e) => e.stopPropagation()} 
                                                                    className="mt-2.5 p-2 bg-amber-50 dark:bg-amber-950/15 border border-amber-200 dark:border-amber-900/30 rounded-xl space-y-1.5"
                                                                >
                                                                    <div className="flex items-center gap-1">
                                                                        <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                                                        <span className="text-xs font-bold text-amber-700 dark:text-amber-400">Potential Duplicate Flight Found. Resolution choice:</span>
                                                                    </div>
                                                                    <div className="flex gap-1.5">
                                                                        {(['skip', 'merge', 'overwrite'] as const).map(res => (
                                                                            <button
                                                                                key={res}
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    setDuplicateResolutions(prev => ({ ...prev, [index]: res }));
                                                                                }}
                                                                                className={`flex-1 text-2xs font-bold uppercase tracking-wider py-1 px-2 rounded-lg border transition-all ${
                                                                                    duplicateResolutions[index] === res 
                                                                                        ? 'bg-amber-500 text-white border-amber-500 ring-2 ring-amber-500/20' 
                                                                                        : 'bg-white dark:bg-zinc-800 text-amber-700 dark:text-amber-450 border-amber-200 dark:border-amber-950/40 hover:bg-amber-100/40'
                                                                                }`}
                                                                            >
                                                                                {res}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="text-right shrink-0">
                                                        <p className="text-xs font-black text-gray-800 dark:text-zinc-300">{f.departureDate || 'Jan 1, 2026'}</p>
                                                        <p className="text-xs text-zinc-500 font-bold uppercase">{f.travelClass || 'Economy'}</p>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>

                                <div className="flex gap-4 pt-4 border-t border-zinc-150/50 dark:border-white/5">
                                    <Button variant="secondary" onClick={() => setStep(2)} className="flex-1 py-3 font-bold !rounded-2xl">Modify Mapping</Button>
                                     <Button 
                                        variant="primary" 
                                        onClick={async () => {
                                            const targetTripId = existingTripId;
                                            setIsProcessing(true);
                                            try {
                                                const flightsToSaveIndexes = Array.from(selectedImportIndexes);
                                                if (flightsToSaveIndexes.length === 0) {
                                                    alert("Please select at least one flight to import.");
                                                    setIsProcessing(false);
                                                    return;
                                                }

                                                // Build copies of trips/flights state to update incrementally
                                                let localTrips = [...dbTrips];

                                                for (const idx of flightsToSaveIndexes) {
                                                    const incoming = mappedFlights[idx];
                                                    const isDuplicate = allExistingFlights.some(ex => 
                                                        ex.departureDate === incoming.departureDate && 
                                                        cleanIdString(ex.identifier) === cleanIdString(incoming.identifier) && 
                                                        ex.origin.trim().toUpperCase() === incoming.origin.toUpperCase()
                                                    );

                                                    if (isDuplicate) {
                                                        const res = duplicateResolutions[idx];
                                                        if (res === 'skip') {
                                                            continue;
                                                        }

                                                        const source = findExistingFlightSource(incoming);
                                                        if (source) {
                                                            const existingItem = source.item;
                                                            const finalItem = res === 'merge' 
                                                                ? mergeFlights(existingItem, incoming) 
                                                                : overwriteFlight(existingItem, incoming);

                                                            if (source.type === 'trip') {
                                                                const tIdx = localTrips.findIndex(t => t.id === source.tripId);
                                                                if (tIdx !== -1) {
                                                                    const updatedTransports = (localTrips[tIdx].transports || []).map(tr => tr.id === source.id ? finalItem : tr);
                                                                    localTrips[tIdx] = {
                                                                        ...localTrips[tIdx],
                                                                        transports: updatedTransports,
                                                                        startDate: updatedTransports[0]?.departureDate || localTrips[tIdx].startDate,
                                                                        endDate: updatedTransports[updatedTransports.length - 1]?.departureDate || localTrips[tIdx].endDate
                                                                    };
                                                                    await dataService.updateTrip(localTrips[tIdx]);
                                                                }
                                                            } else {
                                                                // Independent flight
                                                                await dataService.updateFlight(finalItem);
                                                            }
                                                        }
                                                    } else {
                                                        // Brand new flight
                                                        if (targetTripId) {
                                                            const tIdx = localTrips.findIndex(t => t.id === targetTripId);
                                                            if (tIdx !== -1) {
                                                                const trip = localTrips[tIdx];
                                                                const currentTransports = trip.transports || [];
                                                                const mergedTransports = [...currentTransports, {
                                                                    ...incoming,
                                                                    itineraryId: currentTransports[0]?.itineraryId || Math.random().toString(36).substr(2, 9),
                                                                    type: currentTransports.length ? currentTransports[0].type : 'Multi-City'
                                                                }];
                                                                localTrips[tIdx] = {
                                                                    ...trip,
                                                                    transports: mergedTransports,
                                                                    startDate: mergedTransports[0]?.departureDate || trip.startDate,
                                                                    endDate: mergedTransports[mergedTransports.length - 1]?.arrivalDate || mergedTransports[mergedTransports.length - 1]?.departureDate || trip.endDate
                                                                };
                                                                await dataService.updateTrip(localTrips[tIdx]);
                                                            }
                                                        } else {
                                                            await dataService.addFlight(incoming);
                                                        }
                                                    }
                                                }

                                                onImportComplete(localTrips);
                                                onClose();
                                                window.location.reload();
                                            } catch (e) {
                                                console.error('Import error', e);
                                                alert('An error occurred while saving imported data.');
                                            } finally {
                                                setIsProcessing(false);
                                            }
                                        }} 
                                        className="flex-1 py-3 font-bold !rounded-2xl" 
                                        disabled={isProcessing || selectedImportIndexes.size === 0}
                                    >
                                        {isProcessing ? 'Importing...' : `Import Selected Flights (${selectedImportIndexes.size})`}
                                    </Button>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
};
