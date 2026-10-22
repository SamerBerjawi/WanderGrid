import type { FlightStatusResponse, Transport } from '../types';

/**
 * Finding a flight from its number and date. The server asks several sources at once (FlightStats,
 * AeroDataBox, AviationStack, ADSBdb; see backend_files/flightLookup.js) and answers with the candidate
 * flights and what each source said. Times are local to their airport, as the app stores them.
 */

export type LookupSource = 'flightstats' | 'aerodatabox' | 'aviationstack' | 'adsbdb';
export type LookupState = 'scheduled' | 'active' | 'landed' | 'cancelled' | 'diverted' | 'unknown';

export interface LookupEnd {
    iata: string; icao: string; name: string; city: string; country: string; timezone: string;
    terminal: string; gate: string; baggage: string;
    scheduledLocal: string | null; scheduledUtc: string | null;
    estimatedLocal: string | null; estimatedUtc: string | null;
    actualLocal: string | null; actualUtc: string | null;
    delay: number;
}

export interface FlightCandidate {
    source: LookupSource;
    sourceLabel: string;
    /** `schedule`: has times. `route-only`: the airports the number flies, no times. */
    confidence: 'schedule' | 'route-only';
    flightIata: string;
    airline: { name: string; iata: string; icao: string };
    status: LookupState;
    statusText: string;
    departure: LookupEnd;
    arrival: LookupEnd;
    aircraft: { model: string; registration: string };
    durationMinutes: number | null;
    live: { lat: number; lng: number; altitudeFt: number | null; speedKn: number | null; heading: number | null; updated: string | null; onGround: boolean } | null;
    alsoFrom?: string[];
}

export interface LookupAttempt { source: LookupSource; state: 'found' | 'none' | 'error' | 'skipped'; note?: string; count?: number; ms: number }
export interface LookupResult {
    ok: boolean;
    error?: string;
    message?: string;
    query?: { flight: string; carrier: string; number: string; date: string };
    candidates: FlightCandidate[];
    attempts: LookupAttempt[];
}

const authHeaders = (): Record<string, string> => {
    try {
        const token = localStorage.getItem('wandergrid_session_token');
        return token ? { Authorization: `Bearer ${token}` } : {};
    } catch { return {}; }
};

/** Looks a flight up. Never throws for "not found": check `candidates`. Throws for a network failure. */
export const lookupFlight = async (flight: string, date: string, signal?: AbortSignal): Promise<LookupResult> => {
    let res: Response;
    try {
        res = await fetch(`/api/flights/lookup?flight=${encodeURIComponent(flight)}&date=${encodeURIComponent(date)}`, { headers: authHeaders(), signal });
    } catch (e) {
        if ((e as Error)?.name === 'AbortError') throw e;
        // The browser could not reach the app's own server: it is stopped, restarted, or older than this route.
        throw new Error("Can't reach the WanderGrid server. If you run the dev server or the container, restart it so it has the flight lookup.");
    }
    const body = await res.json().catch(() => null);
    if (!body || typeof body !== 'object' || !Array.isArray(body.candidates)) throw new Error(`The flight lookup returned HTTP ${res.status}.`);
    return body as LookupResult;
};

/** True when the text could be a flight number (ME215, KL 641, MEA215), so the app can look it up as it is typed. */
export const looksLikeFlightNumber = (text: string): boolean => /^([A-Za-z][A-Za-z0-9]|[0-9][A-Za-z])\s*-?\s*0*\d{1,4}[A-Za-z]?$/.test(text.trim()) || /^[A-Za-z]{3}\s*-?\s*0*\d{1,4}[A-Za-z]?$/.test(text.trim());

const hhmm = (local: string | null) => (local ? local.slice(11, 16) : '');
const ymd = (local: string | null) => (local ? local.slice(0, 10) : '');

/** The leg's form fields from a candidate: airports, times, airline, gates, aircraft and length. */
export const candidateToLeg = (c: FlightCandidate): Partial<Transport> => ({
    mode: 'Flight',
    origin: c.departure.iata,
    destination: c.arrival.iata,
    ...(c.airline.name ? { provider: c.airline.name } : {}),
    ...(c.airline.iata ? { providerCode: c.airline.iata } : {}),
    ...(c.departure.scheduledLocal ? { departureDate: ymd(c.departure.scheduledLocal), departureTime: hhmm(c.departure.scheduledLocal) } : {}),
    ...(c.arrival.scheduledLocal ? { arrivalDate: ymd(c.arrival.scheduledLocal), arrivalTime: hhmm(c.arrival.scheduledLocal) } : {}),
    ...(c.departure.actualLocal ? { actualDepartureTime: hhmm(c.departure.actualLocal) } : {}),
    ...(c.arrival.actualLocal ? { actualArrivalTime: hhmm(c.arrival.actualLocal) } : {}),
    ...(c.departure.terminal ? { departureTerminal: c.departure.terminal } : {}),
    ...(c.departure.gate ? { departureGate: c.departure.gate } : {}),
    ...(c.arrival.terminal ? { arrivalTerminal: c.arrival.terminal } : {}),
    ...(c.arrival.gate ? { arrivalGate: c.arrival.gate } : {}),
    ...(c.aircraft.model ? { vehicleModel: c.aircraft.model } : {}),
    ...(c.aircraft.registration ? { tailNumber: c.aircraft.registration } : {}),
    ...(c.durationMinutes ? { duration: c.durationMinutes } : {}),
    ...(c.status === 'cancelled' ? { customFields: [{ key: 'canceled', value: 'TRUE' }] } : {}),
});

/** The candidate as the older status shape the Live panel reads. */
export const candidateToStatus = (c: FlightCandidate): FlightStatusResponse => {
    const end = (e: LookupEnd) => ({
        airport: e.name, timezone: e.timezone, iata: e.iata, icao: e.icao, terminal: e.terminal, gate: e.gate, baggage: e.baggage, delay: e.delay,
        scheduled: e.scheduledLocal ?? undefined, estimated: e.estimatedLocal ?? undefined, actual: e.actualLocal ?? undefined,
    });
    return {
        source: c.source,
        flight_date: ymd(c.departure.scheduledLocal),
        flight_status: c.status === 'unknown' ? undefined : c.status,
        departure: end(c.departure),
        arrival: end(c.arrival),
        airline: c.airline,
        flight: { number: c.flightIata.replace(/^[A-Z0-9]{2}/, ''), iata: c.flightIata, icao: '' },
        aircraft: { registration: c.aircraft.registration, model: c.aircraft.model, iata: '' },
        ...(c.live ? { live: { updated: c.live.updated || new Date().toISOString(), latitude: c.live.lat, longitude: c.live.lng, altitude: c.live.altitudeFt ?? 0, direction: c.live.heading ?? 0, speed_horizontal: c.live.speedKn != null ? Math.round(c.live.speedKn * 1.852) : 0, speed_vertical: 0, is_ground: c.live.onGround } } : {}),
    } as FlightStatusResponse;
};

/** One plain sentence on why nothing was found, from what the sources said. */
export const whyNotFound = (r: LookupResult, date: string): string => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((new Date(`${date}T12:00:00`).getTime() - today.getTime()) / 86400000);
    const keyless = r.attempts.find(a => a.source === 'flightstats');
    const errored = r.attempts.filter(a => a.state === 'error');
    if (errored.length && errored.length === r.attempts.filter(a => a.state !== 'skipped').length) return "The flight data services didn't answer. Check the connection and try again.";
    if (Math.abs(days) > 3 && keyless && keyless.state !== 'found') return `No schedule is published this far ${days > 0 ? 'ahead' : 'back'} for free. Add an AeroDataBox key in Settings for flights months away, or enter the times yourself.`;
    return `No flight ${r.query?.flight || ''} on that date. Check the number and the departure date.`;
};
