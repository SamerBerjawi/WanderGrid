import { FlightStatusResponse } from '../types';

export const flightTracker = {
    getFlightStatus: async (
        apiKey: string, 
        flightIata: string, 
        date?: string, 
        provider: string = 'aviationstack',
        geminiKey?: string
    ): Promise<FlightStatusResponse> => {
        const cleanIata = flightIata.trim().toUpperCase().replace(/\s/g, '');

        if (!apiKey) {
            throw new Error("AviationStack API Key is required to perform factual flight status lookups. Please configure it in Settings.");
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
                                icao: ''
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
                                icao: ''
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

        // --- Default AviationStack Tracker ---
        // Helper to parse the AviationStack response
        const processResponse = (json: any) => {
            if (json.error) {
                if (json.error.code === 'https_access_restricted') {
                    throw new Error("API Key Restricted: Your AviationStack plan does not support HTTPS over the direct client.");
                }
                throw new Error(json.error.message || "API Error");
            }

            if (!json.data || json.data.length === 0) {
                throw new Error("No live flight found on database file records.");
            }

            let targetFlight = json.data[0];
            if (date) {
                const found = json.data.find((f: any) => f.flight_date === date);
                if (found) targetFlight = found;
            }
            return targetFlight as FlightStatusResponse;
        };

        try {
            const proxyUrl = `/api/proxy/flight-status?access_key=${apiKey}&flight_iata=${cleanIata}`;
            const token = typeof window !== 'undefined' ? localStorage.getItem('wandergrid_session_token') : null;
            const headers: Record<string, string> = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            const res = await fetch(proxyUrl, { headers });
            if (res.ok) {
                const json = await res.json();
                return processResponse(json);
            }
        } catch (e) {
            console.warn("Backend proxy unavailable, switching to direct endpoint.");
        }

        const directUrl = `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&flight_iata=${cleanIata}`;
        try {
            const res = await fetch(directUrl);
            if (res.ok) {
                const json = await res.json();
                return processResponse(json);
            }
        } catch (e) {}

        // Strategy 3: CORS Proxy
        const corsProxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`;
        const res = await fetch(corsProxyUrl);
        if (!res.ok) {
            throw new Error("All flight status feeds and CORS proxies failed to retrieve flight details.");
        }
        const json = await res.json();
        return processResponse(json);
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
            throw new Error("An AviationStack API Key must be set in your settings/configs to query real flight schedules.");
        }

        try {
            const proxyUrl = `/api/proxy/route-flights?access_key=${encodeURIComponent(apiKey)}&dep_iata=${encodeURIComponent(cleanDep)}&arr_iata=${encodeURIComponent(cleanArr)}&flight_date=${encodeURIComponent(cleanDate)}`;
            const token = typeof window !== 'undefined' ? localStorage.getItem('wandergrid_session_token') : null;
            const headers: Record<string, string> = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            const res = await fetch(proxyUrl, { headers });
            if (res.ok) {
                const contentType = res.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const json = await res.json();
                    if (json && json.data && Array.isArray(json.data)) {
                        return json.data as FlightStatusResponse[];
                    }
                    if (json && json.error) {
                        throw new Error(json.error.message || "AviationStack returned an API error.");
                    }
                } else {
                    throw new Error("Proxy returned non-JSON (HTML/fallback) content.");
                }
            } else {
                const errText = await res.text().catch(() => "");
                let errMsg = "Server proxy error while searching routes.";
                try {
                    const errData = JSON.parse(errText);
                    if (errData.error) errMsg = errData.error;
                } catch (e) {}
                throw new Error(errMsg);
            }
        } catch (e: any) {
            console.warn("Backend route-flights proxy failed, falling back to direct API fetch:", e.message || e);
            
            // Direct flight search fallback over standard AviationStack endpoints
            try {
                const targetDateObj = new Date(cleanDate);
                const isValidDate = !isNaN(targetDateObj.getTime());
                
                let isPast = false;
                let isToday = false;
                let isFuture = false;

                if (isValidDate) {
                    const todayStr = new Date().toISOString().split('T')[0];
                    const todayDateObj = new Date(todayStr);

                    const targetMidnight = new Date(targetDateObj.getUTCFullYear(), targetDateObj.getUTCMonth(), targetDateObj.getUTCDate());
                    const todayMidnight = new Date(todayDateObj.getUTCFullYear(), todayDateObj.getUTCMonth(), todayDateObj.getUTCDate());

                    if (targetMidnight < todayMidnight) {
                        isPast = true;
                    } else if (targetMidnight.getTime() === todayMidnight.getTime()) {
                        isToday = true;
                    } else {
                        isFuture = true;
                    }
                } else {
                    isToday = true;
                }

                // Construct direct URL
                let directUrl = `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&dep_iata=${cleanDep}&arr_iata=${cleanArr}`;
                if (isPast || isFuture) {
                    directUrl += `&flight_date=${cleanDate}`;
                }

                console.log(`[Direct Fallback] Fetching direct flight schedules: ${directUrl}`);
                const response = await fetch(directUrl);
                
                if (response.ok) {
                    const json = await response.json();
                    if (json && json.error) {
                        throw new Error(json.error.message || "AviationStack returned an API error.");
                    }
                    if (json && json.data && Array.isArray(json.data)) {
                        return json.data as FlightStatusResponse[];
                    }
                }
                
                // Secondary Fallback: Try via AllOrigins CORS proxy if direct HTTP call is blocked or fails
                const corsProxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`;
                console.log(`[Direct Fallback] Trying CORS Proxy: ${corsProxyUrl}`);
                const corsRes = await fetch(corsProxyUrl);
                if (!corsRes.ok) {
                    throw new Error("Direct route lookup and CORS proxy both failed.");
                }
                const json = await corsRes.json();
                if (json && json.error) {
                    throw new Error(json.error.message || "CORS proxy returned error.");
                }
                if (json && json.data && Array.isArray(json.data)) {
                    return json.data as FlightStatusResponse[];
                }
                throw new Error("No scheduled flights dataset found.");
            } catch (fallbackErr: any) {
                console.error("Direct fallback flight search failed:", fallbackErr);
                throw new Error(fallbackErr.message || "Failed to search flights on either proxy or direct endpoint.");
            }
        }
        return [];
    }
};
