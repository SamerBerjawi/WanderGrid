import { describe, expect, it } from 'vitest';
import fixtureJson from '../fixtures/trip-interchange-japan-korea.json';
import type { Trip } from '../../types';
import { readInterchange, MAX_INTERCHANGE_BYTES } from '../../utils/tripInterchangeSchema';
import { adaptInterchange, addedTotal, exportTrip, mapMode, planImport, previousImport, type AdaptedImport } from '../../utils/tripInterchange';
import { bookingStatusOf, isProposed, planBadges } from '../../utils/tripPlan';
import { buildDays, tripStats } from '../../utils/tripItinerary';
import { costSplit } from '../../utils/tripItinerary';

const FIXTURE = JSON.stringify(fixtureJson);
let n = 0;
const seq = () => `id-${++n}`;

const read = (text: string) => {
    const r = readInterchange(text);
    if (!r.ok) throw new Error(r.errors.map(e => `${e.path}: ${e.message}`).join('\n'));
    return r.value;
};
const adapt = (text = FIXTURE, workspaceCurrency = 'EUR'): AdaptedImport => adaptInterchange(read(text), { workspaceCurrency, id: seq, now: '2026-11-23T10:00:00Z' });
const mutate = (fn: (f: any) => void) => { const f = JSON.parse(FIXTURE); fn(f); return JSON.stringify(f); };
const errorsOf = (text: string) => { const r = readInterchange(text); return r.ok ? [] : r.errors; };
const fresh = () => planImport(adapt(), undefined, { tripId: 'trip-1', id: seq });

describe('reading an interchange file', () => {
    it('accepts the Japan and Korea fixture', () => {
        const r = readInterchange(FIXTURE);
        expect(r.ok).toBe(true);
    });

    it('refuses files that are not JSON, too large, another format or another major version', () => {
        expect(errorsOf('not json')[0].message).toMatch(/JSON object/);
        expect(errorsOf('{"a":')[0].message).toMatch(/not valid JSON/);
        expect(errorsOf(' '.repeat(10) + '{' + 'x'.repeat(MAX_INTERCHANGE_BYTES) + '}')[0].message).toMatch(/larger than/);
        expect(errorsOf(mutate(f => { f.format = 'other'; }))[0].path).toBe('format');
        expect(errorsOf(mutate(f => { f.schema_version = '2.0.0'; }))[0].message).toMatch(/isn't supported/);
    });

    it('reports bad fields with their path', () => {
        const errs = errorsOf(mutate(f => { f.days[2].activities[0].start_time = '25:00'; f.trip.start_date = '2027-02-30'; }));
        expect(errs.map(e => e.path)).toEqual(expect.arrayContaining(['days[2].activities[0].start_time', 'trip.start_date']));
        expect(errorsOf(mutate(f => { f.budget.target = -5; }))[0].path).toBe('budget.target');
        expect(errorsOf(mutate(f => { f.trip.currency = 'euro'; }))[0].path).toBe('trip.currency');
        expect(errorsOf(mutate(f => { f.accommodation_stays[0].booking = { website: 'javascript:alert(1)' }; }))[0].path).toBe('accommodation_stays[0].booking.website');
    });

    it('checks dates, references and repeated ids across the plan', () => {
        expect(errorsOf(mutate(f => { f.trip.end_date = '2027-10-01'; }))[0].message).toMatch(/before the start/);
        expect(errorsOf(mutate(f => { f.days[3].destination_id = 'atlantis'; }))[0].message).toMatch(/atlantis/);
        expect(errorsOf(mutate(f => { f.transport[1].id = f.transport[0].id; }))[0].message).toMatch(/more than once/);
        expect(errorsOf(mutate(f => { f.days[4].activities[0].id = f.days[3].activities[0].id; }))[0].message).toMatch(/more than once/);
        expect(errorsOf(mutate(f => { f.accommodation_stays[0].check_out = f.accommodation_stays[0].check_in; }))[0].message).toMatch(/after check-in/);
        expect(errorsOf(mutate(f => { f.days[0].date = '2027-12-25'; }))[0].message).toMatch(/outside/);
    });

    it('drops prototype-polluting keys and keeps fields it does not know', () => {
        const text = FIXTURE.replace('"schema_version"', '"__proto__": {"polluted": true}, "x_source": "planner-app", "schema_version"')
            .replace('"label":"Adult 1"', '"label":"Adult 1","constructor":{"prototype":{"bad":1}},"shoe_size":44');
        const v = read(text);
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        expect(v.warnings.some(w => /__proto__/.test(w.message))).toBe(true);
        expect(v.unmapped).toEqual({ x_source: 'planner-app', 'trip.travelers[0].shoe_size': 44 });
    });

    it('reads JSON pasted from an AI assistant, inside a code fence or with text around it', () => {
        const fenced = read(`Here is your itinerary:\n\n\`\`\`json\n${FIXTURE}\n\`\`\`\nEnjoy the trip!`);
        expect(fenced.file.trip.external_id).toBe('japan-korea-family-2027');
        expect(fenced.warnings.some(w => /was ignored/.test(w.message))).toBe(true);
        expect(read(`Sure! ${FIXTURE} Let me know.`).file.days).toHaveLength(22);
        expect(errorsOf('Sorry, I cannot help with that.')[0].message).toMatch(/JSON object/);
    });

    it("accepts the template's instructions for AI assistants without storing them", () => {
        const v = read(FIXTURE.replace('{', '{"$comment":["Instructions for the assistant"],'));
        expect(v.unmapped).toEqual({});
        expect(v.warnings.some(w => w.path === '$comment')).toBe(false);
    });

    it('strips control characters and keeps Unicode names', () => {
        const v = read(FIXTURE.replace('"title":"Sensō-ji"', '"title":"Sensō-ji\\u0007"'));
        expect(v.file.days[2].activities[0].title).toBe('Sensō-ji');
        expect(v.file.trip.travelers[2].label).toBe('Zoé');
    });

    it('warns when the shortlist targets exceed the accommodation allowance', () => {
        expect(read(FIXTURE).warnings.some(w => w.path === 'budget.categories.accommodation')).toBe(true);
    });
});

describe('turning the file into trip records', () => {
    it('imports the fixture as one trip with every day, stop, leg and attraction', () => {
        const { trip, summary } = fresh();
        expect(trip.startDate).toBe('2027-10-16');
        expect(trip.endDate).toBe('2027-11-06');
        expect(buildDays(trip)).toHaveLength(22);
        expect(trip.plan?.days).toHaveLength(22);
        expect(trip.locations).toHaveLength(6);
        expect(trip.activities).toHaveLength(63);
        expect(trip.transports).toHaveLength(9);
        expect(trip.plan?.stays).toHaveLength(6);
        expect(trip.plan?.stays?.flatMap(s => s.candidates)).toHaveLength(18);
        expect(trip.plan?.hiddenGems).toHaveLength(13);
        expect(trip.plan?.dayTrips).toHaveLength(4);
        expect(summary.added).toMatchObject({ stops: 6, activities: 63, transports: 9, stays: 6, bookedStays: 0, candidates: 18, hiddenGems: 13, days: 22 });
        expect(trip.status).toBe('Planning');
        expect(trip.intent).toBe('planned');
        expect(trip.classification).toBe('Family');
        expect(trip.location).toBe('Tokyo, Japan');
    });

    it('keeps hotel candidates off the bookings: no stays, no booked nights', () => {
        const { trip } = fresh();
        expect(trip.accommodations).toEqual([]);
        expect(tripStats(trip).nightsBooked).toBe(0);
        expect(trip.plan?.stays?.every(s => s.status === 'unbooked' && s.candidates.every(c => c.status === 'candidate'))).toBe(true);
        expect(trip.plan?.stays?.[0]).toMatchObject({ checkIn: '2027-10-17', checkOut: '2027-10-22', nights: 5, targetPerNight: 200, area: 'Shinjuku-sanchome or quieter Sendagaya' });
    });

    it('sets the budget as a target estimate and never adds spending', () => {
        const { trip } = fresh();
        expect(trip.targetBudget).toBe(10035);
        expect(trip.plan?.budget?.categories?.accommodation).toBe(3315);
        expect(trip.expenses).toBeUndefined();
        expect(costSplit(trip).total).toBe(0);
        expect(trip.ledgerCurrency).toBe('EUR');
    });

    it('keeps a budget in another currency as an estimate only', () => {
        const a = adapt(FIXTURE, 'GBP');
        expect(a.head.targetBudget).toBeUndefined();
        expect(a.plan.budget?.target).toBe(10035);
        expect(a.warnings.some(w => w.path === 'budget.currency')).toBe(true);
    });

    it('leaves times, numbers and coordinates empty rather than inventing them', () => {
        const { trip } = fresh();
        expect(trip.activities!.every(a => a.time === '' && a.plan?.timeStatus === 'unscheduled' && !a.coordinates)).toBe(true);
        expect(trip.transports!.every(t => t.departureTime === '' && t.arrivalTime === '' && t.identifier === '' && t.confirmationCode === '' && t.originLat === undefined)).toBe(true);
        expect(trip.locations!.every(l => !l.coordinates)).toBe(true);
    });

    it('keeps dates as written, with no time-zone shift', () => {
        const { trip } = fresh();
        const sensoji = trip.activities!.find(a => a.title === 'Sensō-ji')!;
        expect(sensoji.date).toBe('2027-10-18');
        expect(trip.transports![0].departureDate).toBe('2027-10-16');
        expect(trip.transports![0].arrivalDate).toBe('2027-10-16');
    });

    it('maps rail and multi-mode legs explicitly and flags the ones it simplifies', () => {
        expect(mapMode('Shinkansen')).toEqual({ mode: 'Train', multimodal: false });
        expect(mapMode('KTX')).toEqual({ mode: 'Train', multimodal: false });
        expect(mapMode('Train/Bus')).toEqual({ mode: 'Train', multimodal: true });
        expect(mapMode('Bus/Train')).toEqual({ mode: 'Bus', multimodal: true });
        expect(mapMode('Hovercraft').mode).toBeUndefined();
        const a = adapt();
        const byExt = (id: string) => a.transports.find(t => t.plan?.externalId === id)!;
        expect(byExt('transport-05')).toMatchObject({ mode: 'Train', identifier: '', plan: { modeLabel: 'Shinkansen' } });
        expect(byExt('transport-02')).toMatchObject({ mode: 'Train', plan: { modeLabel: 'Train/Bus' } });
        expect(byExt('transport-03')).toMatchObject({ mode: 'Bus', plan: { modeLabel: 'Bus/Train' } });
        expect(byExt('transport-01').plan?.modeLabel).toBeUndefined();
        expect(a.warnings.filter(w => /more than one mode/.test(w.message))).toHaveLength(2);
    });

    it('stops on a transport mode it cannot map', () => {
        const a = adapt(mutate(f => { f.transport[0].mode = 'Hovercraft'; }));
        expect(a.errors[0].path).toBe('transport[0].mode');
        expect(a.transports).toHaveLength(8);
    });

    it('keeps priorities, optional items, alternatives and hidden gems', () => {
        const { trip } = fresh();
        const acts = trip.activities!;
        expect(acts.filter(a => a.plan?.priority === 'optional')).toHaveLength(16);
        expect(acts.filter(a => a.plan?.hiddenGem)).toHaveLength(13);
        const koishikawa = acts.find(a => a.title === 'Koishikawa Korakuen' && a.date === '2027-10-20')!;
        expect(koishikawa.plan).toMatchObject({ priority: 'optional', hiddenGem: true, bookingStatus: 'unbooked' });
        expect(trip.plan?.hiddenGems?.find(g => g.name === 'Ahopsan Forest')?.status).toBe('alternative');
        expect(trip.plan?.dayTrips?.find(d => d.destination === 'Nikko')).toMatchObject({ date: '2027-10-20', priority: 'optional', hours: '9–11' });
        expect(planBadges(koishikawa)).toEqual([{ tone: 'optional', label: 'Optional' }, { tone: 'gem', label: 'Hidden gem' }]);
    });

    it('treats the proposed legs as not booked until a number or reference is added', () => {
        const leg = fresh().trip.transports![0];
        expect(isProposed(leg)).toBe(true);
        expect(isProposed({ ...leg, identifier: 'TK1938' })).toBe(false);
        expect(bookingStatusOf({ ...leg, confirmationCode: 'X7Q' })).toBe('booked');
        expect(isProposed({ ...leg, plan: undefined })).toBe(false);
    });

    it('turns a stay booked in the file into a stay, with its hotel', () => {
        const text = mutate(f => {
            f.accommodation_stays[0].status = 'booked';
            f.accommodation_stays[0].hotel_options[1].status = 'booked';
            f.accommodation_stays[0].booking = { check_in_time: '15:00', confirmation_code: 'ABC123' };
        });
        const { trip } = planImport(adapt(text), undefined, { tripId: 't', id: seq });
        expect(trip.accommodations).toHaveLength(1);
        expect(trip.accommodations![0]).toMatchObject({ name: 'HOTEL GROOVE SHINJUKU', checkInDate: '2027-10-17', checkOutDate: '2027-10-22', checkInTime: '15:00', confirmationCode: 'ABC123' });
        expect(trip.plan?.stays?.[0].status).toBe('booked');
        expect(trip.plan?.stays?.[0].candidates[1].accommodationId).toBe(trip.accommodations![0].id);
    });

    it('leaves out what the preview deselects', () => {
        const a = adapt();
        const optional = a.entries.filter(e => e.optional).map(e => e.key);
        const { trip, summary } = planImport(a, undefined, { tripId: 't', excluded: new Set([...optional, 'transport:transport-05', 'stay:stay-kawaguchiko']) });
        expect(trip.activities).toHaveLength(63 - optional.length);
        expect(trip.transports).toHaveLength(8);
        expect(trip.plan?.stays).toHaveLength(5);
        expect(summary.skipped).toBe(optional.length + 2);
    });
});

describe('importing into a trip that already has things in it', () => {
    it('imports the same file twice without adding anything', () => {
        const first = fresh().trip;
        const again = planImport(adapt(), first);
        expect(addedTotal(again.summary)).toBe(0);
        expect(again.summary.added).toMatchObject({ candidates: 0, hiddenGems: 0, days: 0 });
        expect(again.conflicts).toEqual([]);
        expect(again.summary.unchanged).toBe(6 + 63 + 9);
        expect(again.trip.activities).toHaveLength(63);
        expect(again.trip.plan?.stays).toHaveLength(6);
        expect(again.trip.notes).toBe(first.notes);
        expect(previousImport([first], 'japan-korea-family-2027')?.id).toBe('trip-1');
    });

    it('updates what nobody edited and keeps what someone did, field by field', () => {
        const first = fresh().trip;
        const edited: Trip = { ...first, activities: first.activities!.map(a => (a.title === 'Sensō-ji' ? { ...a, time: '08:30' } : a)) };
        const changed = mutate(f => {
            f.days[2].activities[0].start_time = '09:00';
            f.days[2].activities[1].notes = 'Go early.';
        });
        const plan = planImport(adapt(changed), edited);
        expect(plan.summary.updated).toBe(1);
        expect(plan.conflicts).toEqual([expect.objectContaining({ key: 'activities:activity-2027-10-18-01:time', current: '08:30', incoming: '09:00' })]);
        expect(plan.trip.activities!.find(a => a.title === 'Sensō-ji')!.time).toBe('08:30');
        expect(plan.trip.activities!.find(a => a.title === 'Nakamise Street')!.description).toBe('Go early.');
        const taken = planImport(adapt(changed), edited, { choices: { 'activities:activity-2027-10-18-01:time': 'incoming' } });
        expect(taken.trip.activities!.find(a => a.title === 'Sensō-ji')!.time).toBe('09:00');
    });

    it('never changes a booked leg on its own', () => {
        const first = fresh().trip;
        const booked: Trip = { ...first, transports: first.transports!.map(t => (t.plan?.externalId === 'transport-01' ? { ...t, identifier: 'TK1938', confirmationCode: 'QX7P2L', departureTime: '11:05', cost: 1800 } : t)) };
        const plan = planImport(adapt(mutate(f => { f.transport[0].departure_time = '09:00'; })), booked);
        const leg = plan.trip.transports!.find(t => t.plan?.externalId === 'transport-01')!;
        expect(leg).toMatchObject({ identifier: 'TK1938', confirmationCode: 'QX7P2L', departureTime: '11:05', cost: 1800 });
        expect(plan.conflicts.map(c => c.field)).toEqual(expect.arrayContaining(['departureTime', 'identifier']));
    });

    it('keeps a candidate booked since the last import', () => {
        const first = fresh().trip;
        const stays = first.plan!.stays!.map((s, i) => (i === 0 ? { ...s, status: 'booked' as const, candidates: s.candidates.map((c, j) => (j === 0 ? { ...c, status: 'booked' as const, accommodationId: 'acc-1' } : c)) } : s));
        const plan = planImport(adapt(), { ...first, plan: { ...first.plan, stays } });
        expect(plan.trip.plan!.stays![0].status).toBe('booked');
        expect(plan.trip.plan!.stays![0].candidates[0]).toMatchObject({ status: 'booked', accommodationId: 'acc-1' });
    });

    it('merges into a trip with hand-entered items: links look-alikes, adds the rest, keeps its own', () => {
        const existing: Trip = {
            id: 'mine', name: 'Japan 2027', location: 'Tokyo', startDate: '2027-10-17', endDate: '2027-10-30', status: 'Upcoming', participants: ['u1'], targetBudget: 9000, notes: 'Bring the carrier.',
            activities: [{ id: 'a1', date: '2027-10-18', time: '10:00', title: 'Senso-ji', cost: 0 }, { id: 'a2', date: '2027-10-19', time: '', title: 'Ramen lunch' }],
            accommodations: [{ id: 'h1', name: 'Hotel Gracery', address: 'Kabukicho', type: 'Hotel', checkInDate: '2027-10-17', checkInTime: '15:00', checkOutDate: '2027-10-22', checkOutTime: '11:00', confirmationCode: 'BK-1' }],
            expenses: [{ id: 'e1', date: '2027-01-02', title: 'Deposit', category: 'Stay', amount: 100, currency: 'EUR', rate: 1, paidBy: 'u1', split: { mode: 'equal', among: ['u1'] } }],
        };
        const plan = planImport(adapt(), existing);
        const t = plan.trip;
        expect(t.name).toBe('Japan 2027');
        expect(t.status).toBe('Upcoming');
        expect(t.startDate).toBe('2027-10-16');
        expect(t.endDate).toBe('2027-11-06');
        expect(t.targetBudget).toBe(9000);
        expect(plan.conflicts.map(c => c.field)).toEqual(expect.arrayContaining(['name', 'targetBudget']));
        expect(t.activities).toHaveLength(64);
        expect(t.activities!.find(a => a.id === 'a1')).toMatchObject({ time: '10:00', plan: { externalId: 'activity-2027-10-18-01' } });
        expect(plan.summary.duplicates).toBe(1);
        expect(t.accommodations).toEqual(existing.accommodations);
        expect(t.expenses).toEqual(existing.expenses);
        expect(t.participants).toEqual(['u1']);
        expect(t.notes!.startsWith('Bring the carrier.\n')).toBe(true);
        expect(t.ledgerCurrency).toBeUndefined();
    });
});

describe('exporting a trip', () => {
    it('round-trips: the export reads back and re-imports into the same trip without changes', () => {
        const first = fresh().trip;
        const file = exportTrip(first, { now: '2026-11-23T10:00:00Z' });
        const text = JSON.stringify(file);
        const back = read(text);
        expect(back.file.days).toHaveLength(22);
        expect(back.file.days.flatMap(d => d.activities)).toHaveLength(63);
        expect(back.file.accommodation_stays.flatMap(s => s.hotel_options)).toHaveLength(18);
        expect(back.file.transport.map(t => t.mode)).toEqual(fixtureJson.transport.map(t => t.mode));
        expect(back.file.trip.external_id).toBe('japan-korea-family-2027');
        expect(back.file.budget).toMatchObject({ currency: 'EUR', target: 10035, categories: fixtureJson.budget.categories });
        const again = planImport(adaptInterchange(back, { workspaceCurrency: 'EUR' }), first);
        expect(addedTotal(again.summary)).toBe(0);
        expect(again.summary.updated).toBe(0);
        expect(again.conflicts).toEqual([]);
    });

    it('keeps the file ids, priorities and unknown fields', () => {
        const text = FIXTURE.replace('"schema_version"', '"x_source": "planner-app", "schema_version"').replace('"label":"Adult 1"', '"label":"Adult 1","shoe_size":44');
        const { trip } = planImport(adaptInterchange(read(text)), undefined, { tripId: 't' });
        const out = exportTrip(trip) as Record<string, any>;
        expect(out.x_source).toBe('planner-app');
        expect(out.unmapped_fields).toEqual({ 'trip.travelers[0].shoe_size': 44 });
        expect(out.days[2].activities[0]).toMatchObject({ id: 'activity-2027-10-18-01', title: 'Sensō-ji', priority: 'recommended', booking_status: 'unbooked', start_time: null, time_status: 'unscheduled' });
        expect(out.hidden_gems).toHaveLength(13);
    });

    it('leaves booking references, seats and spending out unless asked', () => {
        const first = fresh().trip;
        const trip: Trip = {
            ...first,
            transports: first.transports!.map((t, i) => (i === 0 ? { ...t, identifier: 'TK1938', confirmationCode: 'QX7P2L', seatNumber: '32A', paidBy: 'u1', cost: 900 } : t)),
            expenses: [{ id: 'e1', date: '2027-01-02', title: 'Deposit', category: 'Stay', amount: 100, currency: 'EUR', rate: 1, paidBy: 'u1', split: { mode: 'equal', among: ['u1'] } }],
            companions: [{ id: 'c1', name: 'Grandma', role: 'Family' }],
        };
        const safe = JSON.stringify(exportTrip(trip));
        expect(safe).not.toMatch(/QX7P2L|32A|Deposit|paidBy|u1/);
        expect(safe).toMatch(/TK1938/);
        const full = exportTrip(trip, { includePrivate: true }) as Record<string, any>;
        expect(full.transport[0]).toMatchObject({ booking_reference: 'QX7P2L', seat: '32A', status: 'booked' });
        expect(JSON.stringify(full)).not.toMatch(/Deposit/);
    });

    it('exports a trip that was never imported, and that export imports cleanly', () => {
        const trip: Trip = {
            id: 'lisbon', name: 'Lisbon weekend', location: 'Lisbon', startDate: '2027-03-05', endDate: '2027-03-08', status: 'Upcoming', participants: [],
            transports: [{ id: 'f1', itineraryId: 'x', type: 'One-Way', mode: 'Flight', provider: 'TAP', identifier: 'TP643', confirmationCode: 'ZZ9', origin: 'BRU', destination: 'LIS', departureDate: '2027-03-05', departureTime: '07:00', arrivalDate: '2027-03-05', arrivalTime: '08:45' }],
            accommodations: [{ id: 'h1', name: 'Memmo Alfama', address: 'Travessa das Merceeiras 27', type: 'Hotel', checkInDate: '2027-03-05', checkInTime: '15:00', checkOutDate: '2027-03-08', checkOutTime: '12:00' }],
            activities: [{ id: 'a1', date: '2027-03-06', time: '19:30', title: 'Fado dinner', type: 'Dining' }],
        };
        const back = read(JSON.stringify(exportTrip(trip)));
        const { trip: copy } = planImport(adaptInterchange(back), undefined, { tripId: 'copy' });
        expect(copy.transports![0]).toMatchObject({ mode: 'Flight', identifier: 'TP643', departureTime: '07:00', confirmationCode: '' });
        expect(copy.accommodations![0]).toMatchObject({ name: 'Memmo Alfama', checkInTime: '15:00' });
        expect(copy.activities![0]).toMatchObject({ title: 'Fado dinner', time: '19:30', type: 'Dining' });
        expect(addedTotal(planImport(adaptInterchange(back), trip).summary)).toBe(0);
    });
});

describe('the downloadable template', () => {
    it('reads and imports without warnings that need attention', async () => {
        const text = JSON.stringify((await import('../../public/samples/wandergrid-trip-template.json')).default);
        const r = readInterchange(text);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.warnings).toEqual([]);
        const a = adaptInterchange(r.value, { workspaceCurrency: 'EUR' });
        expect(a.errors).toEqual([]);
        const { trip } = planImport(a, undefined, { tripId: 't' });
        expect(trip.accommodations).toHaveLength(1);
        expect(trip.accommodations![0]).toMatchObject({ name: 'Example Hotel Ribeira', cost: 260 });
        expect(trip.plan?.stays?.[0].candidates.every(c => c.status === 'candidate')).toBe(true);
    });
});

describe('the backend test fixture', () => {
    // backend_files/test/api/trip-import.test.js saves the importer's output through the real API. It can't run the
    // TypeScript importer, so it reads this file; regenerate it with UPDATE_FIXTURES=1 npx vitest run tests/unit/tripInterchange.test.ts
    it('is what the importer produces for the fixture', async () => {
        const { readFileSync, writeFileSync } = await import('node:fs');
        const path = `${process.cwd()}/backend_files/test/fixtures/imported-trip.json`;
        let i = 0;
        const a = adaptInterchange(read(FIXTURE), { workspaceCurrency: 'EUR', id: () => `ix-${++i}`, now: '2026-11-23T10:00:00.000Z' });
        const { trip } = planImport(a, undefined, { tripId: 'imported-japan-korea' });
        const text = `${JSON.stringify(trip, null, 1)}\n`;
        if (process.env.UPDATE_FIXTURES) writeFileSync(path, text);
        expect(readFileSync(path, 'utf8')).toBe(text);
    });
});
