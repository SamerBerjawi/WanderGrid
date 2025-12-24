
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
        itineraryId: '',
        type: 'One-Way',
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
    
    if (depIso.includes('T')) {
        const p = parseIso(depIso);
        depDate = p.date;
        depTime = p.time;
    } else {
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
        itineraryId: '',
        type: 'One-Way',
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

// --- Grouping Logic ---

const groupTransportsIntoTrips = (transports: Transport[], userId: string): Trip[] => {
    if (transports.length === 0) return [];

    // Sort by departure
    const sorted = transports.sort((a, b) => new Date(`${a.departureDate}T${a.departureTime}`).getTime() - new Date(`${b.departureDate}T${b.departureTime}`).getTime());

    const trips: Trip[] = [];
    let currentTripTransports: Transport[] = [];

    sorted.forEach((t, index) => {
        if (currentTripTransports.length === 0) {
            currentTripTransports.push(t);
        } else {
            const last = currentTripTransports[currentTripTransports.length - 1];
            const lastEnd = new Date(`${last.arrivalDate}T${last.arrivalTime}`).getTime();
            const currStart = new Date(`${t.departureDate}T${t.departureTime}`).getTime();
            
            // If gap is less than 48 hours, group together
            const diffHours = (currStart - lastEnd) / (1000 * 60 * 60);
            
            if (diffHours < 48) {
                currentTripTransports.push(t);
            } else {
                // Finalize current trip
                trips.push(createTripFromTransports(currentTripTransports, userId));
                currentTripTransports = [t];
            }
        }
    });

    if (currentTripTransports.length > 0) {
        trips.push(createTripFromTransports(currentTripTransports, userId));
    }

    return trips;
};

const createTripFromTransports = (transports: Transport[], userId: string): Trip => {
    const first = transports[0];
    const last = transports[transports.length - 1];
    const mainDest = last.destination; // Simple logic: last destination is the trip name

    return {
        id: Math.random().toString(36).substr(2, 9),
        name: `Trip to ${mainDest}`,
        location: mainDest,
        startDate: first.departureDate,
        endDate: last.arrivalDate || last.departureDate,
        status: new Date(last.arrivalDate) < new Date() ? 'Past' : 'Upcoming',
        participants: [userId],
        icon: '✈️',
        transports: transports,
        durationMode: 'all_full',
        startPortion: 'full',
        endPortion: 'full',
        accommodations: [],
        activities: [],
        locations: []
    };
};

// --- Public API ---

export const flightImporter = {
    importJson: async (jsonContent: string, userId: string): Promise<Trip[]> => {
        try {
            const data = JSON.parse(jsonContent);
            const flights = data.flights || (Array.isArray(data) ? data : []);
            const transports = flights.map(mapJsonFlightToTransport).filter((t: Transport) => t.departureDate); // Ensure valid date
            return groupTransportsIntoTrips(transports, userId);
        } catch (e) {
            console.error("JSON Import Error", e);
            throw new Error("Invalid JSON format");
        }
    },

    importCsv: async (csvContent: string, userId: string): Promise<Trip[]> => {
        try {
            const rows = csvToArray(csvContent);
            const transports = rows.map(mapCsvRowToTransport).filter((t: Transport) => t.departureDate);
            return groupTransportsIntoTrips(transports, userId);
        } catch (e) {
            console.error("CSV Import Error", e);
            throw new Error("Invalid CSV format");
        }
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
