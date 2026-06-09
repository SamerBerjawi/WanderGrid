const test = require('node:test');
const assert = require('node:assert/strict');
const {
    AviationStackError,
    normalizeFutureFlight,
    requestAviationStack
} = require('../aviationStack');

test('requestAviationStack uses HTTPS and current query parameters', async () => {
    let requestedUrl;
    const payload = await requestAviationStack('flightsFuture', {
        access_key: 'secret',
        iataCode: 'JFK',
        type: 'departure',
        date: '2026-06-20'
    }, {
        fetchImpl: async (url) => {
            requestedUrl = url;
            return new Response(JSON.stringify({ data: [] }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        }
    });

    assert.deepEqual(payload, { data: [] });
    assert.equal(requestedUrl.protocol, 'https:');
    assert.equal(requestedUrl.pathname, '/v1/flightsFuture');
    assert.equal(requestedUrl.searchParams.get('iataCode'), 'JFK');
    assert.equal(requestedUrl.searchParams.get('date'), '2026-06-20');
    assert.equal(requestedUrl.searchParams.get('dep_iata'), null);
});

test('requestAviationStack preserves actionable provider errors', async () => {
    await assert.rejects(
        requestAviationStack('flights', { access_key: 'bad' }, {
            fetchImpl: async () => new Response(JSON.stringify({
                error: { code: 'invalid_access_key', message: 'Invalid access key' }
            }), { status: 401 })
        }),
        (error) => {
            assert.ok(error instanceof AviationStackError);
            assert.equal(error.status, 401);
            assert.match(error.message, /authentication failed/i);
            return true;
        }
    );
});

test('normalizeFutureFlight converts AviationStack future schedule fields', () => {
    const normalized = normalizeFutureFlight({
        status: 'scheduled',
        departure: { iataCode: 'JFK', scheduledTime: '08:15', terminal: '4' },
        arrival: { iataCode: 'LAX', scheduledTime: '11:30', gate: '52B' },
        airline: { name: 'Example Air', iataCode: 'EA' },
        flight: { number: '123', iataNumber: 'EA123' },
        aircraft: { modelCode: 'A320', modelText: 'Airbus A320' }
    }, '2026-06-20');

    assert.equal(normalized.departure.iata, 'JFK');
    assert.equal(normalized.arrival.iata, 'LAX');
    assert.equal(normalized.departure.scheduled, '2026-06-20T08:15:00');
    assert.equal(normalized.flight.iata, 'EA123');
    assert.equal(normalized.aircraft.model, 'Airbus A320');
});
