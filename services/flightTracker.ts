import { FlightStatusResponse } from '../types';

const authenticatedHeaders = (aviationStackKey?: string): Record<string, string> => {
    const headers: Record<string, string> = {};
    const token = typeof window !== 'undefined' ? localStorage.getItem('wandergrid_session_token') : null;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (aviationStackKey) headers['X-AviationStack-Key'] = aviationStackKey;
    return headers;
};

const readApiResponse = async (response: Response): Promise<any> => {
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        const message = typeof payload?.error === 'string'
            ? payload.error
            : payload?.error?.message || `Flight service returned HTTP ${response.status}.`;
        throw new Error(message);
    }
    return payload;
};


export const flightTracker = {
    getFlightStatus: async (
        apiKey: string, 
        flightIata: string, 
        date?: string, 
        provider: string = 'aviationstack',
        geminiKey?: string
    ): Promise<FlightStatusResponse> => {
        const cleanIata = flightIata.trim().toUpperCase().replace(/\s/g, '');

        if ((provider === 'aviationstack' || provider === 'aerodatabox') && !apiKey) {
            throw new Error("An API key is required for the selected flight data provider. Please configure it in Settings.");
        }

        if (provider === 'adsbdb') {
            try {
                // Free public ADSBdb lookup
                const url = `https://adsbdb.com/api/flights/${cleanIata}`;
                const corsUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
                const res = await fetch(corsUrl);
                if (res.ok) {
                    const json = await res.json();
                    if (json && json.response) {
                        const r = json.response;
                        return {
                            flight_date: date || new Date().toISOString().split('T')[0],
                            flight_status: 'landed',
                            departure: {
                                airport: r.origin?.name || 'Departure Airport',
                                timezone: 'UTC',
                                iata: r.origin?.iata || 'DEP',
                                icao: r.origin?.icao || 'DEP',
                                terminal: '',
                                gate: '',
                                delay: 0,
                                scheduled: `${date || new Date().toISOString().split('T')[0]}T12:05:00Z`,
                                estimated: `${date || new Date().toISOString().split('T')[0]}T12:05:00Z`,
                                actual: `${date || new Date().toISOString().split('T')[0]}T12:05:00Z`,
                                estimated_runway: '',
                                actual_runway: ''
                            },
                            arrival: {
                                airport: r.destination?.name || 'Arrival Airport',
                                timezone: 'UTC',
                                iata: r.destination?.iata || 'ARR',
                                icao: r.destination?.icao || 'ARR',
                                terminal: '',
                                gate: '',
                                baggage: '',
                                delay: 0,
                                scheduled: `${date || new Date().toISOString().split('T')[0]}T14:35:00Z`,
                                estimated: `${date || new Date().toISOString().split('T')[0]}T14:35:00Z`,
                                actual: `${date || new Date().toISOString().split('T')[0]}T14:35:00Z`,
                                estimated_runway: '',
                                actual_runway: ''
                            },
                            airline: {
                                name: r.airline?.name || 'Unknown Airline',
                                iata: cleanIata.slice(0, 2),
                                icao: ''
                            },
                            flight: {
                                number: cleanIata.replace(/^[A-Z]+/g, ''),
                                iata: cleanIata,
                                icao: '',
                                codeshared: null
                            },
                            aircraft: {
                                registration: r.aircraft_registration || r.registration || 'N/A',
                                iata: r.aircraft_type || 'N/A',
                                model: r.aircraft_model || 'Aircraft',
                                country: ''
                            }
                        };
                    }
                }
            } catch (e) {
                console.warn("ADSBdb call failed", e);
            }
        }

        if (provider === 'aerodatabox') {
            try {
                // AeroDataBox API lookup
                const url = `https://aerodatabox.p.rapidapi.com/flights/number/${cleanIata}/${date || new Date().toISOString().split('T')[0]}`;
                const res = await fetch(url, {
                    headers: {
                        'x-rapidapi-key': apiKey,
                        'x-rapidapi-host': 'aerodatabox.p.rapidapi.com'
                    }
                });
                if (res.ok) {
                    const json = await res.json();
                    if (Array.isArray(json) && json.length > 0) {
                        const f = json[0];
                        return {
                            flight_date: date || new Date().toISOString().split('T')[0],
                            flight_status: 'landed',
                            departure: {
                                airport: f.departure?.airport?.name || 'Departure Airport',
                                timezone: f.departure?.airport?.timeZone || 'UTC',
                                iata: f.departure?.airport?.iata || 'DEP',
                                icao: f.departure?.airport?.icao || '',
                                terminal: f.departure?.terminal || '',
                                gate: f.departure?.gate || '',
                                delay: 0,
                                scheduled: f.departure?.scheduledTimeLocal || '',
                                estimated: f.departure?.actualTimeLocal || '',
                                actual: f.departure?.actualTimeLocal || '',
                                estimated_runway: '',
                                actual_runway: ''
                            },
                            arrival: {
                                airport: f.arrival?.airport?.name || 'Arrival Airport',
                                timezone: f.arrival?.airport?.timeZone || 'UTC',
                                iata: f.arrival?.airport?.iata || 'ARR',
                                icao: f.arrival?.airport?.icao || '',
                                terminal: f.arrival?.terminal || '',
                                gate: f.arrival?.gate || '',
                                baggage: '',
                                delay: 0,
                                scheduled: f.arrival?.scheduledTimeLocal || '',
                                estimated: f.arrival?.actualTimeLocal || '',
                                actual: f.arrival?.actualTimeLocal || '',
                                estimated_runway: '',
                                actual_runway: ''
                            },
                            airline: {
                                name: f.airline?.name || 'Airlines',
                                iata: cleanIata.slice(0, 2),
                                icao: ''
                            },
                            flight: {
                                number: cleanIata.replace(/^[A-Z]+/g, ''),
                                iata: cleanIata,
                                icao: '',
                                codeshared: null
                            },
                            aircraft: {
                                registration: f.aircraft?.reg || 'N/A',
                                iata: f.aircraft?.icao || 'N/A',
                                model: f.aircraft?.model || 'Aircraft',
                                country: ''
                            }
                        };
                    }
                }
            } catch (e) {
                console.warn("AeroDataBox call failed", e);
            }
        }

        // AviationStack requests are intentionally backend-only. Browser-side calls are
        // blocked by CORS/mixed-content rules and would expose the workspace API key.
        const query = new URLSearchParams({ flight_iata: cleanIata });
        if (date) query.set('flight_date', date);
        const response = await fetch(`/api/proxy/flight-status?${query.toString()}`, {
            headers: authenticatedHeaders(apiKey)
        });
        const json = await readApiResponse(response);

        if (!Array.isArray(json.data) || json.data.length === 0) {
            throw new Error(`No AviationStack flight record was found for ${cleanIata}${date ? ` on ${date}` : ''}.`);
        }

        const exactDateMatch = date
            ? json.data.find((flight: FlightStatusResponse) => flight.flight_date === date)
            : undefined;
        return (exactDateMatch || json.data[0]) as FlightStatusResponse;
    },

    searchFlightsByRoute: async (
        apiKey: string,
        depIata: string,
        arrIata: string,
        date: string
    ): Promise<FlightStatusResponse[]> => {
        const cleanDep = depIata.trim().toUpperCase().replace(/\s/g, '').split('-')[0].trim();
        const cleanArr = arrIata.trim().toUpperCase().replace(/\s/g, '').split('-')[0].trim();
        const cleanDate = date.trim();

        if (!apiKey) {
            throw new Error("An AviationStack API Key must be set in Settings to search flight schedules.");
        }
        if (!/^[A-Z]{3}$/.test(cleanDep) || !/^[A-Z]{3}$/.test(cleanArr)) {
            throw new Error("Select valid three-letter origin and destination airport codes.");
        }

        const query = new URLSearchParams({
            dep_iata: cleanDep,
            arr_iata: cleanArr,
            flight_date: cleanDate
        });
        const response = await fetch(`/api/proxy/route-flights?${query.toString()}`, {
            headers: authenticatedHeaders(apiKey)
        });
        const json = await readApiResponse(response);
        return Array.isArray(json.data) ? json.data as FlightStatusResponse[] : [];
    }
};
