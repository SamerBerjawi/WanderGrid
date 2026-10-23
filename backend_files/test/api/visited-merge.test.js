// POST /api/visited/merge: one atlas merge step (survivors written, duplicates removed) in one transaction.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('../helpers/testServer');

let srv, ann, bob;
before(async () => { srv = await startTestServer(); });
after(async () => { await srv.close(); });
beforeEach(async () => {
    await srv.reset();
    ann = (await srv.api('POST', '/api/auth/register', { body: { name: 'Ann', email: 'ann@test.dev', password: 'ann-pass-123' } })).json;
    bob = (await srv.api('POST', '/api/auth/register', { body: { name: 'Bob', email: 'bob@test.dev', password: 'bob-pass-123' } })).json;
});

const city = (id, name) => ({ id, type: 'city', code: name, name, countryCode: 'FR' });

test('writes the survivors and removes the folded records together', async () => {
    const seed = Array.from({ length: 300 }, (_, i) => city(`c${i}`, `Town ${i}`));
    await srv.api('POST', '/api/visited/bulk', { token: ann.token, body: seed });
    const got = (await srv.api('GET', '/api/visited', { token: ann.token })).json;
    const survivors = got.slice(0, 100).map(r => ({ ...r, notes: 'merged' }));
    const r = await srv.api('POST', '/api/visited/merge', { token: ann.token, body: { upserts: survivors, deleteIds: got.slice(100, 200).map(x => x.id) } });
    assert.equal(r.status, 200);
    assert.equal(r.json.upserted, 100);
    assert.equal(r.json.deleted, 100);
    const after = (await srv.api('GET', '/api/visited', { token: ann.token })).json;
    assert.equal(after.length, 200);
    assert.equal(after.filter(x => x.notes === 'merged').length, 100);
});

test('is all or nothing: a record the caller may not delete rolls the whole step back', async () => {
    await srv.api('POST', '/api/visited', { token: ann.token, body: city('a1', 'Ann town') });
    await srv.api('POST', '/api/visited', { token: bob.token, body: city('b1', 'Bob town') });
    // Bob (a Partner) may change his own record but not Ann's.
    const r = await srv.api('POST', '/api/visited/merge', { token: bob.token, body: { upserts: [{ ...city('b1', 'Bob town'), notes: 'x' }], deleteIds: ['a1'] } });
    assert.equal(r.status, 403);
    const bobs = (await srv.api('GET', '/api/visited', { token: bob.token })).json;
    assert.equal(bobs.find(x => x.id === 'b1').notes, undefined, 'the upsert was rolled back');
    assert.ok(bobs.some(x => x.id === 'a1'), 'ann record kept');
});

test('rejects malformed and oversized steps', async () => {
    assert.equal((await srv.api('POST', '/api/visited/merge', { token: ann.token, body: { upserts: 'x' } })).status, 400);
    const big = Array.from({ length: 501 }, (_, i) => `id${i}`);
    assert.equal((await srv.api('POST', '/api/visited/merge', { token: ann.token, body: { deleteIds: big } })).status, 413);
});

test('a deleted id that is also an upsert survives', async () => {
    await srv.api('POST', '/api/visited', { token: ann.token, body: city('k1', 'Keep') });
    const r = await srv.api('POST', '/api/visited/merge', { token: ann.token, body: { upserts: [city('k1', 'Keep')], deleteIds: ['k1'] } });
    assert.equal(r.status, 200);
    assert.equal((await srv.api('GET', '/api/visited', { token: ann.token })).json.length, 1);
});
