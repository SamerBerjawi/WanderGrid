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

/**
 * Keyless flight resolution using ADSBdb and adsb.lol open telemetry APIs.
 * Resolves flight route (origin, destination), airline, and aircraft info without requiring API keys.
 */
export async function lookupKeylessFlight(
    flightIataOrCallsign: string,
    date?: string
): Promise<FlightStatusResponse | null> {
    const clean = flightIataOrCallsign.trim().toUpperCase().replace(/\s/g, '');
    if (!clean) return null;

    let routeData: any = null;
    let liveData: any = null;
    let aircraftData: any = null;

    // 1. Query ADSBdb for flight route (origin, destination, airline) via backend proxy (P-00 / P-01)
    try {
        const res = await fetch(`/api/proxy/adsbdb/callsign/${encodeURIComponent(clean)}`);
        if (res.ok) {
            const json = await res.json();
            routeData = json?.response?.flightroute || null;
        }
    } catch (err) {
        console.warn('[FlightTracker] ADSBdb proxy route lookup failed:', err);
    }

    // 2. Query adsb.lol for live transponder status, tail number & aircraft type
    try {
        const res = await fetch(`/api/proxy/adsb-lol/callsign/${encodeURIComponent(clean)}`);
        if (res.ok) {
            const json = await res.json();
            if (Array.isArray(json?.ac) && json.ac.length > 0) {
                liveData = json.ac[0];
            }
        }
    } catch {}

    // 2.b OpenSky Network fallback if adsb.lol has no live transponder
    if (!liveData) {
        try {
            const res = await fetch(`/api/proxy/opensky/states?callsign=${encodeURIComponent(clean)}`);
            if (res.ok) {
                const json = await res.json();
                if (Array.isArray(json?.states) && json.states.length > 0) {
                    const st = json.states[0];
                    liveData = {
                        hex: st[0],
                        r: st[0],
                        flight: (st[1] || '').trim(),
                        lon: st[5],
                        lat: st[6],
                        alt_baro: st[7] ? Math.round(st[7] * 3.28084) : 0, // meters to feet
                        gs: st[9] ? Math.round(st[9] * 1.94384) : 0, // m/s to knots
                        track: st[10] || 0,
                        baro_rate: st[11] ? Math.round(st[11] * 196.85) : 0 // m/s to fpm
                    };
                }
            }
        } catch {}
    }

    // 3. If hex or registration was found, enrich aircraft details from ADSBdb
    const hexOrReg = liveData?.hex || liveData?.r;
    if (hexOrReg) {
        try {
            const res = await fetch(`/api/proxy/adsbdb/aircraft/${encodeURIComponent(hexOrReg)}`);
            if (res.ok) {
                const json = await res.json();
                aircraftData = json?.response?.aircraft || null;
            }
        } catch {}
    }

    if (!routeData && !liveData) {
        return null;
    }

    const todayDate = date || new Date().toISOString().split('T')[0];
    const isAirborne = Boolean(liveData && liveData.lat && liveData.lon && (liveData.alt_baro > 500 || liveData.gs > 80));

    const airlineName = routeData?.airline?.name || aircraftData?.registered_owner || 'Commercial Airline';
    const airlineIata = routeData?.airline?.iata || clean.slice(0, 2);
    const airlineIcao = routeData?.airline?.icao || (clean.length > 3 && isNaN(Number(clean[2])) ? clean.slice(0, 3) : '');
    const flightNum = routeData?.callsign_iata?.replace(/^[A-Z]+/g, '') || clean.replace(/^[A-Z]+/g, '');

    const depIata = routeData?.origin?.iata_code || 'DEP';
    const depIcao = routeData?.origin?.icao_code || '';
    const depName = routeData?.origin?.name || (routeData?.origin?.municipality ? `${routeData.origin.municipality} Airport` : 'Departure Airport');

    const arrIata = routeData?.destination?.iata_code || 'ARR';
    const arrIcao = routeData?.destination?.icao_code || '';
    const arrName = routeData?.destination?.name || (routeData?.destination?.municipality ? `${routeData.destination.municipality} Airport` : 'Arrival Airport');

    const aircraftModel = aircraftData?.type 
        ? `${aircraftData.manufacturer || ''} ${aircraftData.type}`.trim()
        : (liveData?.t || 'Commercial Aircraft');
    const registration = liveData?.r || aircraftData?.registration || 'N/A';

    return {
        source: 'adsbdb-route',
        flight_date: todayDate,
        flight_status: isAirborne ? 'active' : undefined,
        departure: {
            airport: depName,
            iata: depIata,
            icao: depIcao,
            terminal: '',
            gate: '',
            delay: 0,
            scheduled: undefined,
            estimated: undefined,
            actual: undefined,
            estimated_runway: '',
            actual_runway: ''
        },
        arrival: {
            airport: arrName,
            iata: arrIata,
            icao: arrIcao,
            terminal: '',
            gate: '',
            baggage: '',
            delay: 0,
            scheduled: undefined,
            estimated: undefined,
            actual: undefined,
            estimated_runway: '',
            actual_runway: ''
        },
        airline: {
            name: airlineName,
            iata: airlineIata,
            icao: airlineIcao
        },
        flight: {
            number: flightNum,
            iata: routeData?.callsign_iata || clean,
            icao: routeData?.callsign_icao || clean,
            codeshared: null
        },
        aircraft: {
            registration,
            iata: liveData?.t || aircraftData?.icao_type || 'N/A',
            model: aircraftModel,
            country: aircraftData?.registered_owner_country_name || ''
        },

        ...(liveData && liveData.lat && liveData.lon ? {
            live: {
                updated: new Date().toISOString(),
                latitude: liveData.lat,
                longitude: liveData.lon,
                altitude: liveData.alt_baro || liveData.alt_geom || 0,
                direction: liveData.track || 0,
                speed_horizontal: liveData.gs || 0,
                speed_vertical: liveData.baro_rate || 0,
                is_ground: Boolean(liveData.alt_baro === 0 || liveData.alt_baro === 'ground')
            }
        } : {})
    };
}

export const flightTracker = {
    getFlightStatus: async (
        apiKey: string, 
        flightIata: string, 
        date?: string, 
        provider: string = 'aviationstack',
        geminiKey?: string
    ): Promise<FlightStatusResponse> => {
        const cleanIata = flightIata.trim().toUpperCase().replace(/\s/g, '');

        // 1. Keyless Provider or Pre-lookup when no API key is supplied
        if (provider === 'adsbdb' || provider === 'keyless' || (!apiKey && (provider === 'aerodatabox' || provider === 'aviationstack'))) {
            const keylessResult = await lookupKeylessFlight(cleanIata, date);
            if (keylessResult) {
                return keylessResult;
            }
            if (!apiKey) {
                throw new Error(`Could not find flight ${cleanIata} in open radar. Please enter an API key in Settings for full carrier schedules.`);
            }
        }

        // 2. AeroDataBox Provider
        if (provider === 'aerodatabox') {
            try {
                // AeroDataBox API lookup via backend proxy (protects key and bypasses CORS)
                const query = new URLSearchParams();
                if (date) query.set('date', date);

                const headers: Record<string, string> = {
                    'X-AeroDataBox-Key': apiKey
                };
                try {
                    const wsSettingsStr = typeof window !== 'undefined' ? localStorage.getItem('wandergrid_workspace_settings') : null;
                    if (wsSettingsStr) {
                        const parsed = JSON.parse(wsSettingsStr);
                        if (parsed.aeroDataBoxEndpoint) {
                            headers['X-AeroDataBox-Endpoint'] = parsed.aeroDataBoxEndpoint;
                        }
                    }
                } catch {}

                const url = `/api/proxy/aerodatabox/flights/number/${encodeURIComponent(cleanIata)}${query.toString() ? `?${query.toString()}` : ''}`;
                const res = await fetch(url, { headers });
                const json = await readApiResponse(res);

                if (Array.isArray(json) && json.length > 0) {
                    const f = json[0];
                    const depScheduled = f.departure?.scheduledTime?.local || f.departure?.scheduledTimeLocal || (date ? `${date}T12:00:00` : '');
                    const depActual = f.departure?.actualTime?.local || f.departure?.revisedTime?.local || f.departure?.actualTimeLocal || depScheduled;
                    const arrScheduled = f.arrival?.scheduledTime?.local || f.arrival?.scheduledTimeLocal || (date ? `${date}T14:30:00` : '');
                    const arrActual = f.arrival?.actualTime?.local || f.arrival?.revisedTime?.local || f.arrival?.actualTimeLocal || arrScheduled;

                    return {
                        flight_date: date || (depScheduled ? depScheduled.split('T')[0] : new Date().toISOString().split('T')[0]),
                        flight_status: (f.status || 'scheduled').toLowerCase(),
                        departure: {
                            airport: f.departure?.airport?.name || f.departure?.airport?.municipalityName || 'Departure Airport',
                            timezone: f.departure?.airport?.timeZone || 'UTC',
                            iata: f.departure?.airport?.iata || 'DEP',
                            icao: f.departure?.airport?.icao || '',
                            terminal: f.departure?.terminal || '',
                            gate: f.departure?.gate || '',
                            delay: 0,
                            scheduled: depScheduled,
                            estimated: depActual,
                            actual: depActual,
                            estimated_runway: '',
                            actual_runway: ''
                        },
                        arrival: {
                            airport: f.arrival?.airport?.name || f.arrival?.airport?.municipalityName || 'Arrival Airport',
                            timezone: f.arrival?.airport?.timeZone || 'UTC',
                            iata: f.arrival?.airport?.iata || 'ARR',
                            icao: f.arrival?.airport?.icao || '',
                            terminal: f.arrival?.terminal || '',
                            gate: f.arrival?.gate || '',
                            baggage: f.arrival?.baggageBelt || '',
                            delay: 0,
                            scheduled: arrScheduled,
                            estimated: arrActual,
                            actual: arrActual,
                            estimated_runway: '',
                            actual_runway: ''
                        },
                        airline: {
                            name: f.airline?.name || 'Airlines',
                            iata: f.airline?.iata || cleanIata.slice(0, 2),
                            icao: f.airline?.icao || ''
                        },
                        flight: {
                            number: f.number || cleanIata.replace(/^[A-Z]+/g, ''),
                            iata: f.callSign || cleanIata,
                            icao: f.airline?.icao ? `${f.airline.icao}${f.number || ''}` : '',
                            codeshared: null
                        },
                        aircraft: {
                            registration: f.aircraft?.reg || 'N/A',
                            iata: f.aircraft?.modeS || f.aircraft?.icao || 'N/A',
                            model: f.aircraft?.model || 'Aircraft',
                            country: ''
                        }
                    };
                }

                // If AeroDataBox yielded no results, fallback to keyless lookup rather than hard erroring
                const keylessFallback = await lookupKeylessFlight(cleanIata, date);
                if (keylessFallback) {
                    return keylessFallback;
                }

                throw new Error(`No matching AeroDataBox flights found for ${cleanIata}${date ? ` on ${date}` : ''}.`);
            } catch (e: any) {
                console.warn("AeroDataBox call failed, attempting keyless fallback", e);
                const keylessFallback = await lookupKeylessFlight(cleanIata, date);
                if (keylessFallback) return keylessFallback;
                throw e;
            }
        }

        // 3. AviationStack Provider
        // Requests are backend-only to avoid CORS/mixed-content issues and key exposure
        try {
            const query = new URLSearchParams({ flight_iata: cleanIata });
            if (date) query.set('flight_date', date);
            const response = await fetch(`/api/proxy/flight-status?${query.toString()}`, {
                headers: authenticatedHeaders(apiKey)
            });
            const json = await readApiResponse(response);

            if (Array.isArray(json.data) && json.data.length > 0) {
                const exactDateMatch = date
                    ? json.data.find((flight: FlightStatusResponse) => flight.flight_date === date)
                    : undefined;
                return (exactDateMatch || json.data[0]) as FlightStatusResponse;
            }
        } catch (e) {
            console.warn("AviationStack call failed, attempting keyless fallback", e);
        }

        // Final keyless fallback attempt
        const keylessFallback = await lookupKeylessFlight(cleanIata, date);
        if (keylessFallback) return keylessFallback;

        throw new Error(`No flight record was found for ${cleanIata}${date ? ` on ${date}` : ''}.`);
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
