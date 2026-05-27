
import * as XLSX from 'xlsx';
import { Trip, Transport } from '../types';

export const flightImporter = {
    parseFile: async (file: File): Promise<Transport[]> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    
                    const rows = XLSX.utils.sheet_to_json(sheet) as any[];
                    
                    const transports = rows.map((row): Transport | null => {
                        let depIso = row['Gate Departure (Scheduled)'] || row['Gate Departure (Actual)'] || row['Date'];
                        let arrIso = row['Gate Arrival (Scheduled)'] || row['Gate Arrival (Actual)'];

                        if (!depIso) return null;

                        const parseIso = (iso: any) => {
                            if (!iso) return { date: '', time: '' };
                            if (typeof iso === 'number') {
                                const utcDays = Math.floor(iso - 25569);
                                const vDate = new Date(utcDays * 86400 * 1000);
                                return {
                                    date: vDate.toISOString().split('T')[0],
                                    time: '12:00'
                                };
                            }
                            const str = String(iso);
                            if (str.includes('T')) {
                                const [d, t] = str.split('T');
                                return { date: d, time: t.slice(0, 5) };
                            }
                            // Date only fallback
                            return { date: str, time: '12:00' };
                        };

                        const dep = parseIso(depIso);
                        const arr = parseIso(arrIso);

                        return {
                            id: Math.random().toString(36).substr(2, 9),
                            itineraryId: Math.random().toString(36).substr(2, 9),
                            type: 'One-Way',
                            mode: 'Flight',
                            provider: String(row['Airline'] || ''),
                            identifier: String(row['Flight'] || ''),
                            origin: String(row['From'] || ''),
                            destination: String(row['To'] || ''),
                            departureDate: dep.date,
                            departureTime: dep.time,
                            arrivalDate: arr.date || dep.date,
                            arrivalTime: arr.time || '14:00',
                            confirmationCode: String(row['PNR'] || ''),
                            seatNumber: String(row['Seat'] || ''),
                            seatType: String(row['Seat Type'] || ''),
                            travelClass: String(row['Cabin Class'] || ''),
                            vehicleModel: String(row['Aircraft Type Name'] || ''),
                            reason: String(row['Flight Reason'] || ''),
                            // Custom notes or canceled status can go here if extending types
                        };
                    }).filter(Boolean) as Transport[];
                    
                    resolve(transports);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = (e) => reject(e);
            reader.readAsArrayBuffer(file);
        });
    },

    groupTransportsIntoTrips: (transports: Transport[], userId: string): Trip[] => {
        // Group chronologically
        const sorted = transports.sort((a, b) => {
            const d1 = new Date(`${a.departureDate}T${a.departureTime}`).getTime();
            const d2 = new Date(`${b.departureDate}T${b.departureTime}`).getTime();
            return d1 - d2;
        });

        // Simple grouping logic: every gap > 14 days or returning to the first origin completes a trip
        const trips: Trip[] = [];
        let currentBatch: Transport[] = [];
        let homeBase = '';

        for (const flight of sorted) {
            if (currentBatch.length === 0) {
                currentBatch.push(flight);
                homeBase = flight.origin;
                continue;
            }

            const last = currentBatch[currentBatch.length - 1];
            const lastTime = new Date(`${last.arrivalDate || last.departureDate}T${last.arrivalTime || '00:00'}`).getTime();
            const currTime = new Date(`${flight.departureDate}T${flight.departureTime}`).getTime();
            
            const gapDays = (currTime - lastTime) / (1000 * 60 * 60 * 24);

            const isDifferentCity = flight.origin.trim().toUpperCase() !== last.destination.trim().toUpperCase();

            if (gapDays > 14 || isDifferentCity || (flight.destination.trim().toUpperCase() === homeBase.trim().toUpperCase())) {
                if (isDifferentCity) {
                    trips.push(flightImporter._createTripFromBatch(currentBatch, userId));
                    currentBatch = [flight];
                    homeBase = flight.origin;
                } else {
                    currentBatch.push(flight);
                    trips.push(flightImporter._createTripFromBatch(currentBatch, userId));
                    currentBatch = [];
                    homeBase = '';
                }
            } else {
                currentBatch.push(flight);
            }
        }

        if (currentBatch.length > 0) {
            trips.push(flightImporter._createTripFromBatch(currentBatch, userId));
        }

        return trips;
    },

    _createTripFromBatch: (batch: Transport[], userId: string): Trip => {
        const first = batch[0];
        const last = batch[batch.length - 1];
        const distinctDestinations = new Set(batch.map(b => b.destination));
        const destArray = Array.from(distinctDestinations).filter(d => d !== first.origin);
        
        let name = 'Flight Sequence';
        if (destArray.length === 1) name = `Trip to ${destArray[0]}`;
        else if (destArray.length > 1) name = `Trip to ${destArray[0]} & ${destArray.length - 1} more`;

        // Share itineraryId
        const itineraryId = Math.random().toString(36).substr(2, 9);
        const transports = batch.map(t => ({ ...t, itineraryId, type: batch.length === 1 ? 'One-Way' : (last.destination === first.origin ? 'Round Trip' : 'Multi-City') as Transport['type'] }));

        return {
            id: Math.random().toString(36).substr(2, 9),
            name,
            location: destArray[0] || last.destination,
            startDate: first.departureDate,
            endDate: last.arrivalDate || last.departureDate,
            status: 'Planning',
            participants: [userId],
            icon: '✈️',
            transports,
            durationMode: 'all_full',
            startPortion: 'full',
            endPortion: 'full',
            accommodations: [],
            activities: [],
            locations: []
        };
    },

    exportCsv: (trips: Trip[]): string => {
        const headers = [
            'Date','Airline','Flight','From','To','Dep Terminal','Dep Gate',
            'Arr Terminal','Arr Gate','Canceled','Gate Departure (Scheduled)',
            'Gate Departure (Actual)','Gate Arrival (Scheduled)','Gate Arrival (Actual)',
            'Aircraft Type Name','Tail Number','PNR','Seat','Seat Type','Cabin Class',
            'Flight Reason','Notes'
        ];
        
        let csvContent = headers.join(',') + '\n';
        
        trips.forEach(t => {
            (t.transports || []).forEach(tr => {
                if (tr.mode === 'Flight') {
                    const row = [
                        tr.departureDate,
                        tr.provider || '',
                        tr.identifier || '',
                        tr.origin || '',
                        tr.destination || '',
                        '', '', '', '', 'FALSE', // Terminals, Gates, Canceled
                        `${tr.departureDate}T${tr.departureTime}`,
                        `${tr.departureDate}T${tr.departureTime}`,
                        `${tr.arrivalDate || tr.departureDate}T${tr.arrivalTime || '00:00'}`,
                        `${tr.arrivalDate || tr.departureDate}T${tr.arrivalTime || '00:00'}`,
                        tr.vehicleModel || '',
                        '', // Tail Number
                        tr.confirmationCode || '',
                        tr.seatNumber || '',
                        tr.seatType || '',
                        tr.travelClass || '',
                        tr.reason || '',
                        ''
                    ].map(v => `"${v}"`).join(',');
                    csvContent += row + '\n';
                }
            });
        });
        return csvContent;
    },

    exportXlsx: (trips: Trip[]): ArrayBuffer => {
        const rows: any[] = [];
        trips.forEach(t => {
            (t.transports || []).forEach(tr => {
                if (tr.mode === 'Flight') {
                    rows.push({
                        'Date': tr.departureDate,
                        'Airline': tr.provider,
                        'Flight': tr.identifier,
                        'From': tr.origin,
                        'To': tr.destination,
                        'Dep Terminal': '',
                        'Dep Gate': '',
                        'Arr Terminal': '',
                        'Arr Gate': '',
                        'Canceled': 'FALSE',
                        'Gate Departure (Scheduled)': `${tr.departureDate}T${tr.departureTime}`,
                        'Gate Departure (Actual)': `${tr.departureDate}T${tr.departureTime}`,
                        'Gate Arrival (Scheduled)': `${tr.arrivalDate || tr.departureDate}T${tr.arrivalTime || '00:00'}`,
                        'Gate Arrival (Actual)': `${tr.arrivalDate || tr.departureDate}T${tr.arrivalTime || '00:00'}`,
                        'Aircraft Type Name': tr.vehicleModel,
                        'Tail Number': '',
                        'PNR': tr.confirmationCode,
                        'Seat': tr.seatNumber,
                        'Seat Type': tr.seatType,
                        'Cabin Class': tr.travelClass,
                        'Flight Reason': tr.reason,
                        'Notes': ''
                    });
                }
            });
        });

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Flights');
        return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    }
};

