const AVIATIONSTACK_BASE_URL = 'https://api.aviationstack.com/v1';

class AviationStackError extends Error {
    constructor(message, code = 'aviationstack_error', status = 502) {
        super(message);
        this.name = 'AviationStackError';
        this.code = code;
        this.status = status;
    }
}

function providerErrorMessage(error) {
    const code = error?.code || 'aviationstack_error';
    const message = error?.message || 'AviationStack rejected the request.';

    switch (code) {
        case 'invalid_access_key':
        case 'missing_access_key':
        case 'inactive_user':
            return `AviationStack authentication failed: ${message}`;
        case 'usage_limit_reached':
        case 'rate_limit_reached':
            return `AviationStack request limit reached: ${message}`;
        case 'function_access_restricted':
        case 'https_access_restricted':
            return `AviationStack plan restriction: ${message}`;
        case 'validation_error':
            return `AviationStack could not process this search: ${message}`;
        default:
            return `AviationStack error: ${message}`;
    }
}

async function requestAviationStack(pathname, params, options = {}) {
    const fetchImpl = options.fetchImpl || global.fetch;
    const timeoutMs = options.timeoutMs || 3000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const url = new URL(`${AVIATIONSTACK_BASE_URL}/${pathname}`);

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, String(value));
        }
    });

    try {
        const response = await fetchImpl(url, { signal: controller.signal });
        const payload = await response.json().catch(() => null);

        if (payload?.error) {
            const status = response.status >= 400 ? response.status : 502;
            throw new AviationStackError(providerErrorMessage(payload.error), payload.error.code, status);
        }
        if (!response.ok) {
            throw new AviationStackError(`AviationStack returned HTTP ${response.status}.`, 'http_error', response.status);
        }
        if (!payload || typeof payload !== 'object') {
            throw new AviationStackError('AviationStack returned an invalid response.', 'invalid_response');
        }
        return payload;
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new AviationStackError('AviationStack timed out. Please try again.', 'timeout', 504);
        }
        if (error instanceof AviationStackError) throw error;
        throw new AviationStackError(`Unable to contact AviationStack: ${error.message || 'network error'}`);
    } finally {
        clearTimeout(timeout);
    }
}

function scheduledDateTime(date, value) {
    if (!value) return '';
    if (value.includes('T')) return value;
    return `${date}T${value.length === 5 ? `${value}:00` : value}`;
}

function normalizeFutureFlight(item, flightDate) {
    const departure = item.departure || {};
    const arrival = item.arrival || {};
    const airline = item.airline || {};
    const flight = item.flight || {};
    const aircraft = item.aircraft || {};

    return {
        flight_date: flightDate,
        flight_status: item.status || item.flight_status || 'scheduled',
        departure: {
            airport: departure.airport || departure.name || '',
            timezone: departure.timezone || '',
            iata: departure.iataCode || departure.iata || '',
            icao: departure.icaoCode || departure.icao || '',
            terminal: departure.terminal || '',
            gate: departure.gate || '',
            delay: departure.delay || 0,
            scheduled: scheduledDateTime(flightDate, departure.scheduledTime || departure.scheduled),
            estimated: scheduledDateTime(flightDate, departure.estimatedTime || departure.estimated),
            actual: scheduledDateTime(flightDate, departure.actualTime || departure.actual),
            estimated_runway: scheduledDateTime(flightDate, departure.estimatedRunway || departure.estimated_runway),
            actual_runway: scheduledDateTime(flightDate, departure.actualRunway || departure.actual_runway)
        },
        arrival: {
            airport: arrival.airport || arrival.name || '',
            timezone: arrival.timezone || '',
            iata: arrival.iataCode || arrival.iata || '',
            icao: arrival.icaoCode || arrival.icao || '',
            terminal: arrival.terminal || '',
            gate: arrival.gate || '',
            baggage: arrival.baggage || '',
            delay: arrival.delay || 0,
            scheduled: scheduledDateTime(flightDate, arrival.scheduledTime || arrival.scheduled),
            estimated: scheduledDateTime(flightDate, arrival.estimatedTime || arrival.estimated),
            actual: scheduledDateTime(flightDate, arrival.actualTime || arrival.actual),
            estimated_runway: scheduledDateTime(flightDate, arrival.estimatedRunway || arrival.estimated_runway),
            actual_runway: scheduledDateTime(flightDate, arrival.actualRunway || arrival.actual_runway)
        },
        airline: {
            name: airline.name || '',
            iata: airline.iataCode || airline.iata || '',
            icao: airline.icaoCode || airline.icao || ''
        },
        flight: {
            number: flight.number || '',
            iata: flight.iataNumber || flight.iata || '',
            icao: flight.icaoNumber || flight.icao || '',
            codeshared: item.codeshared || null
        },
        aircraft: {
            registration: aircraft.registration || '',
            iata: aircraft.modelCode || aircraft.iata || '',
            model: aircraft.modelText || aircraft.model || '',
            country: aircraft.country || ''
        }
    };
}

module.exports = {
    AviationStackError,
    normalizeFutureFlight,
    requestAviationStack
};
