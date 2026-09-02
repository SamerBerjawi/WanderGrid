const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const util = require('util');

const pbkdf2Async = util.promisify(crypto.pbkdf2);

async function hashPassword(password) {
    if (!password) return '';
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = await pbkdf2Async(password, salt, 100000, 64, 'sha512');
    return `${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
    if (!storedHash) return false;
    if (!storedHash.includes(':')) {
        return password === storedHash;
    }
    const [salt, hash] = storedHash.split(':');
    const verifyHash = await pbkdf2Async(password, salt, 100000, 64, 'sha512');
    return hash === verifyHash.toString('hex');
}

function buildResourceQuery(table, queryParams = {}) {
    const { limit, offset, status, tripId, after, before, privacy, sort } = queryParams;
    const conditions = [];
    const params = [];

    if (status) {
        params.push(status);
        conditions.push(`(data->>'status') = $${params.length}`);
    }
    if (privacy) {
        params.push(privacy);
        conditions.push(`(data->>'privacy') = $${params.length}`);
    }
    if (tripId) {
        params.push(tripId);
        conditions.push(`(data->>'tripId') = $${params.length}`);
    }
    if (after) {
        params.push(after);
        if (table === 'flights') {
            conditions.push(`(data->>'departureDate') >= $${params.length}`);
        } else {
            conditions.push(`(data->>'startDate') >= $${params.length}`);
        }
    }
    if (before) {
        params.push(before);
        if (table === 'flights') {
            conditions.push(`(data->>'departureDate') <= $${params.length}`);
        } else {
            conditions.push(`(data->>'endDate') <= $${params.length}`);
        }
    }

    let query = `SELECT data FROM ${table}`;
    if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
    }

    if (sort === 'desc') {
        if (table === 'flights') {
            query += ` ORDER BY (data->>'departureDate') DESC`;
        } else if (table === 'trips' || table === 'events') {
            query += ` ORDER BY (data->>'startDate') DESC`;
        }
    } else if (sort === 'asc') {
        if (table === 'flights') {
            query += ` ORDER BY (data->>'departureDate') ASC`;
        } else if (table === 'trips' || table === 'events') {
            query += ` ORDER BY (data->>'startDate') ASC`;
        }
    }

    const parsedLimit = parseInt(limit, 10);
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
        params.push(parsedLimit);
        query += ` LIMIT $${params.length}`;
    }

    const parsedOffset = parseInt(offset, 10);
    if (!isNaN(parsedOffset) && parsedOffset >= 0) {
        params.push(parsedOffset);
        query += ` OFFSET $${params.length}`;
    }

    return { query, params };
}

test('hashPassword generates valid salt:hash format and verifies successfully', async () => {
    const password = 'CorrectHorseBatteryStaple123!';
    const hashed = await hashPassword(password);
    
    assert.ok(hashed.includes(':'), 'Hash must contain salt delimiter');
    const [salt, hex] = hashed.split(':');
    assert.equal(salt.length, 32, 'Salt should be 16 bytes in hex');
    assert.equal(hex.length, 128, 'SHA-512 derived key should be 64 bytes in hex');

    const isValid = await verifyPassword(password, hashed);
    assert.equal(isValid, true, 'Valid password must verify');

    const isWrongValid = await verifyPassword('WrongPassword', hashed);
    assert.equal(isWrongValid, false, 'Invalid password must fail verification');
});

test('verifyPassword handles legacy plain text passwords for smooth migration', async () => {
    const plain = 'legacy_unhashed_secret';
    assert.equal(await verifyPassword(plain, plain), true);
    assert.equal(await verifyPassword('other', plain), false);
});

test('buildResourceQuery generates unfiltered query when no params provided', () => {
    const { query, params } = buildResourceQuery('trips');
    assert.equal(query, 'SELECT data FROM trips');
    assert.deepEqual(params, []);
});

test('buildResourceQuery builds parameterized SQL for status and pagination', () => {
    const { query, params } = buildResourceQuery('trips', { status: 'Confirmed', limit: '10', offset: '20' });
    assert.equal(query, "SELECT data FROM trips WHERE (data->>'status') = $1 LIMIT $2 OFFSET $3");
    assert.deepEqual(params, ['Confirmed', 10, 20]);
});

test('buildResourceQuery targets departureDate expression index on flights table', () => {
    const { query, params } = buildResourceQuery('flights', { after: '2026-06-01', sort: 'desc', limit: '50' });
    assert.equal(query, "SELECT data FROM flights WHERE (data->>'departureDate') >= $1 ORDER BY (data->>'departureDate') DESC LIMIT $2");
    assert.deepEqual(params, ['2026-06-01', 50]);
});
