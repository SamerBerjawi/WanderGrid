
import { Trip, Transport, TransportMode, User } from '../types';

// --- Helpers ---

const parseIso = (iso: string) => {
    if (!iso) return { date: '', time: '' };
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { date: '', time: '' };
    return {
        date: d.toISOString().split('T')[0],
        time: d.toTimeString().slice(0, 5)
    };
};

const getDateTime = (dateStr: string, timeStr: string) => {
    return new Date(`${dateStr}T${timeStr || '00:00'}`).getTime();
};

const csvToArray = (str: string, delimiter = ",") => {
    const headers = str.slice(0, str.indexOf("\n")).split(delimiter).map(h => h.trim());
    const rows = str.slice(str.indexOf("\n") + 1).split("\n");

    return rows.map(row => {
        if (!row.trim()) return null;
        // Handle quotes if necessary, simplified for this specific format
        const values = row.split(delimiter); 
        const el = headers.reduce((object: any, header, index) => {
            let val = values[index]?.trim();
            // Remove quotes if wrapping
            if (val && val.startsWith('"') && val.endsWith('"')) {
                val = val.substring(1, val.length - 1);
            }
            object[header] = val;
            return object;
        }, {});
        return el;
    }).filter(row => row !== null);
};

// --- Mappers ---

const mapJsonFlightToTransport = (f: any): Transport => {
    const { date: depDate, time: depTime } = parseIso(f.departure);
    const { date: arrDate, time: arrTime } = parseIso(f.arrival);
    
    return {
        id: Math.random().toString(36).substr(2, 9),
        itineraryId: '', // Placeholder, set by grouper
        type: 'One-Way', // Placeholder
        mode: 'Flight',
        provider: f.airline?.name || f.airline?.iata || 'Unknown Airline',
        identifier: f.flightNumber || '',
        confirmationCode: '', 
        origin: f.from?.iata || '',
        destination: f.to?.iata || '',
        departureDate: depDate,
        departureTime: depTime,
        arrivalDate: arrDate,
        arrivalTime: arrTime,
        travelClass: f.seats?.[0]?.seatClass,
        seatNumber: f.seats?.[0]?.seatNumber,
        seatType: f.seats?.[0]?.seat,
        originLat: f.from?.lat,
        originLng: f.from?.lon,
        destLat: f.to?.lat,
        destLng: f.to?.lon,
        vehicleModel: f.aircraft?.name,
        reason: f.flightReason
    };
};

const mapCsvRowToTransport = (row: any): Transport => {
    // CSV Keys based on provided example:
    // Date, Airline, Flight, From, To, Dep Terminal, Dep Gate, Arr Terminal, Arr Gate, Canceled, Diverted To, 
    // Gate Departure (Scheduled), Gate Departure (Actual), Gate Arrival (Scheduled), Gate Arrival (Actual), 
    // Aircraft Type Name, Tail Number, PNR, Seat, Seat Type, Cabin Class, Flight Reason

    const depIso = row['Gate Departure (Scheduled)'] || row['Gate Departure (Actual)'] || row['Date']; 
    // If only Date provided, default time
    const arrIso = row['Gate Arrival (Scheduled)'] || row['Gate Arrival (Actual)'];

    // Handle simple Date column if ISO missing
    let depDate = '', depTime = '12:00';
    
    if (depIso && depIso.includes('T')) {
        const p = parseIso(depIso);
        depDate = p.date;
        depTime = p.time;
    } else if (depIso) {
        // Assume DD/MM/YYYY
        const parts = depIso.split('/');
        if (parts.length === 3) {
            depDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
    }

    let arrDate = depDate, arrTime = '14:00';
    if (arrIso && arrIso.includes('T')) {
        const p = parseIso(arrIso);
        arrDate = p.date;
        arrTime = p.time;
    }

    return {
        id: Math.random().toString(36).substr(2, 9),
        itineraryId: '', // Placeholder
        type: 'One-Way', // Placeholder
        mode: 'Flight',
        provider: row['Airline'] || 'Unknown',
        identifier: row['Flight'] || '',
        confirmationCode: row['PNR'] || '',
        origin: row['From'] || '',
        destination: row['To'] || '',
        departureDate: depDate,
        departureTime: depTime,
        arrivalDate: arrDate,
        arrivalTime: arrTime,
        travelClass: row['Cabin Class'],
        seatNumber: row['Seat'],
        seatType: row['Seat Type'],
        vehicleModel: row['Aircraft Type Name'],
        reason: row['Flight Reason']
    };
};

// --- Smart Structure Analysis ---

const analyzeAndStructureTrip = (transports: Transport[], userId: string): Trip => {
    if (transports.length === 0) throw new Error("No transports to create trip");

    // 1. Sort Chronologically
    const sorted = [...transports].sort((a, b) => 
        getDateTime(a.departureDate, a.departureTime) - getDateTime(b.departureDate, b.departureTime)
    );

    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    
    // 2. Determine Structure
    let type: Transport['type'] = 'One-Way';
    const isRoundTrip = last.destination === first.origin && sorted.length > 1;
    
    if (isRoundTrip) {
        type = 'Round Trip';
    } else {
        // Check if Multi-City (Gap > 24h between any connection)
        let isMultiCity = false;
        for (let i = 0; i < sorted.length - 1; i++) {
            const curr = sorted[i];
            const next = sorted[i+1];
            const arrival = getDateTime(curr.arrivalDate, curr.arrivalTime);
            const departure = getDateTime(next.departureDate, next.departureTime);
            // 24 hours in ms
            if ((departure - arrival) > 86400000) {
                isMultiCity = true;
                break;
            }
        }
        if (isMultiCity) type = 'Multi-City';
    }

    // 3. Assign IDs and Type
    // Using a shared Itinerary ID groups them visually in the app
    const itineraryId = Math.random().toString(36).substr(2, 9);
    
    const structuredTransports = sorted.map(t => ({
        ...t,
        itineraryId,
        type
    }));

    // 4. Generate Name
    const origin = first.origin;
    const distinctDestinations = new Set<string>();
    
    // Identify major destinations (ignore layovers)
    // A destination is "major" if the stopover is > 4h or it's the final stop
    structuredTransports.forEach((t, i) => {
        if (i === structuredTransports.length - 1) {
            if (t.destination !== origin) distinctDestinations.add(t.destination);
        } else {
            const next = structuredTransports[i+1];
            const arr = getDateTime(t.arrivalDate, t.arrivalTime);
            const dep = getDateTime(next.departureDate, next.departureTime);
            if ((dep - arr) > 14400000) { // > 4 hours considered a stop worth mentioning
                 if (t.destination !== origin) distinctDestinations.add(t.destination);
            }
        }
    });

    let name = '';
    const destArray = Array.from(distinctDestinations);
    
    if (destArray.length === 0) {
        name = `Trip to ${last.destination}`; // Fallback
    } else if (destArray.length === 1) {
        name = `Trip to ${destArray[0]}`;
    } else if (destArray.length === 2) {
        name = `Trip to ${destArray[0]} & ${destArray[1]}`;
    } else {
        name = `Tour: ${destArray[0]}, ${destArray[1]}...`;
    }

    return {
        id: Math.random().toString(36).substr(2, 9),
        name: name,
        location: destArray[0] || last.destination,
        startDate: first.departureDate,
        endDate: last.arrivalDate || last.departureDate,
        status: 'Planning', // Always import as planning
        participants: [userId],
        icon: '✈️',
        transports: structuredTransports,
        durationMode: 'all_full',
        startPortion: 'full',
        endPortion: 'full',
        accommodations: [],
        activities: [],
        locations: []
    };
};

const groupTransportsIntoTrips = (transports: Transport[], userId: string): Trip[] => {
    if (transports.length === 0) return [];

    // Global Sort
    const sorted = transports.sort((a, b) => 
        getDateTime(a.departureDate, a.departureTime) - getDateTime(b.departureDate, b.departureTime)
    );

    const trips: Trip[] = [];
    let currentBatch: Transport[] = [];
    let currentHomeBase = ''; 

    for (let i = 0; i < sorted.length; i++) {
        const flight = sorted[i];

        // Start a new batch?
        if (currentBatch.length === 0) {
            currentBatch.push(flight);
            currentHomeBase = flight.origin;
            continue;
        }

        const lastFlight = currentBatch[currentBatch.length - 1];
        const lastArrival = getDateTime(lastFlight.arrivalDate, lastFlight.arrivalTime);
        const currDep = getDateTime(flight.departureDate, flight.departureTime);
        
        // Gap Analysis (Days)
        const gapDays = (currDep - lastArrival) / (1000 * 60 * 60 * 24);

        // Heuristics for "Is this the same trip?"
        const isReturningHome = flight.destination === currentHomeBase;
        const isConnected = flight.origin === lastFlight.destination;
        
        let addToCurrent = false;

        if (gapDays > 21) {
            // Gap too large, likely separate trip
            addToCurrent = false;
        } else if (isReturningHome) {
            // Returning to start usually closes a trip
            addToCurrent = true;
        } else if (isConnected) {
            // Direct connection
            addToCurrent = true;
        } else if (gapDays < 5) {
            // Short gap, probably multi-city or return leg
            addToCurrent = true;
        }

        if (addToCurrent) {
            currentBatch.push(flight);
            // If we just returned home, close the batch
            if (isReturningHome) {
                trips.push(analyzeAndStructureTrip(currentBatch, userId));
                currentBatch = [];
                currentHomeBase = '';
            }
        } else {
            // Close previous batch
            trips.push(analyzeAndStructureTrip(currentBatch, userId));
            // Start new
            currentBatch = [flight];
            currentHomeBase = flight.origin;
        }
    }

    // Flush remaining
    if (currentBatch.length > 0) {
        trips.push(analyzeAndStructureTrip(currentBatch, userId));
    }

    // Explicitly sort groupings by start date before returning
    return trips.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
};

// --- Public API ---

export const flightImporter = {
    // New: Parse RAW transports for adding to existing trips
    parseTransportsJson: (jsonContent: string): Transport[] => {
        try {
            const data = JSON.parse(jsonContent);
            const flights = data.flights || (Array.isArray(data) ? data : []);
            return flights.map(mapJsonFlightToTransport).filter((t: Transport) => t.departureDate);
        } catch (e) {
            console.error("JSON Parse Error", e);
            return [];
        }
    },

    parseTransportsCsv: (csvContent: string): Transport[] => {
        try {
            const rows = csvToArray(csvContent);
            return rows.map(mapCsvRowToTransport).filter((t: Transport) => t.departureDate);
        } catch (e) {
            console.error("CSV Parse Error", e);
            return [];
        }
    },

    validateTransport: (t: Transport): string[] => {
        const errors: string[] = [];
        if (!t.departureDate) errors.push("Missing departure date");
        if (!t.origin) errors.push("Missing origin");
        if (!t.destination) errors.push("Missing destination");
        // Check dates validity
        if (t.departureDate && isNaN(new Date(t.departureDate).getTime())) errors.push("Invalid departure date format");
        return errors;
    },

    // Exposed Logic
    groupTransports: (transports: Transport[], userId: string) => groupTransportsIntoTrips(transports, userId),

    // Standard Import logic (creates new trips)
    importJson: async (jsonContent: string, userId: string): Promise<Trip[]> => {
        const transports = flightImporter.parseTransportsJson(jsonContent);
        return groupTransportsIntoTrips(transports, userId);
    },

    importCsv: async (csvContent: string, userId: string): Promise<Trip[]> => {
        const transports = flightImporter.parseTransportsCsv(csvContent);
        return groupTransportsIntoTrips(transports, userId);
    },

    exportJson: (trips: Trip[]): string => {
        const allFlights: any[] = [];
        trips.forEach(t => {
            if (t.transports) {
                t.transports.filter(tr => tr.mode === 'Flight').forEach(tr => {
                    allFlights.push({
                        date: tr.departureDate,
                        departure: `${tr.departureDate}T${tr.departureTime}:00.000Z`,
                        arrival: `${tr.arrivalDate}T${tr.arrivalTime}:00.000Z`,
                        flightNumber: tr.identifier,
                        flightReason: tr.reason,
                        from: { iata: tr.origin, lat: tr.originLat, lon: tr.originLng },
                        to: { iata: tr.destination, lat: tr.destLat, lon: tr.destLng },
                        airline: { name: tr.provider },
                        aircraft: { name: tr.vehicleModel },
                        seats: [{
                            seatNumber: tr.seatNumber,
                            seatClass: tr.travelClass,
                            seat: tr.seatType
                        }]
                    });
                });
            }
        });
        return JSON.stringify({ flights: allFlights }, null, 2);
    },

    exportCsv: (trips: Trip[]): string => {
        const headers = [
            'Date','Airline','Flight','From','To',
            'Gate Departure (Scheduled)','Gate Arrival (Scheduled)',
            'Aircraft Type Name','PNR','Seat','Seat Type','Cabin Class','Flight Reason'
        ];
        
        const rows = [headers.join(',')];

        trips.forEach(t => {
            if (t.transports) {
                t.transports.filter(tr => tr.mode === 'Flight').forEach(tr => {
                    const row = [
                        tr.departureDate,
                        `"${tr.provider}"`,
                        tr.identifier,
                        tr.origin,
                        tr.destination,
                        `${tr.departureDate}T${tr.departureTime}`,
                        `${tr.arrivalDate}T${tr.arrivalTime}`,
                        `"${tr.vehicleModel || ''}"`,
                        tr.confirmationCode,
                        tr.seatNumber,
                        tr.seatType,
                        tr.travelClass,
                        tr.reason
                    ];
                    rows.push(row.join(','));
                });
            }
        });
        return rows.join('\n');
    }
};
