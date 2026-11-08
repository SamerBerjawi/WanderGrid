import { describe, expect, it } from 'vitest';
import { jetLagPlan, localClock, localDay, nightHoursAtDestination, offsetMinutes, shiftHours, shiftText, zoneFacts } from '../../utils/jetLag';

const BRU = 'Europe/Brussels', LIS = 'Europe/Lisbon', LON = 'Europe/London', NRT = 'Asia/Tokyo', JFK = 'America/New_York', DEL = 'Asia/Kolkata';
const at = (iso: string) => new Date(iso);

describe('zones', () => {
    it('reads the offset of a zone at an instant, summer time included', () => {
        const may = at('2027-05-10T12:00:00Z');
        expect(offsetMinutes(BRU, may)).toBe(120);
        expect(offsetMinutes(JFK, may)).toBe(-240);
        expect(offsetMinutes(DEL, may)).toBe(330);
        expect(offsetMinutes(BRU, at('2027-01-10T12:00:00Z'))).toBe(60);
        expect(offsetMinutes(JFK, at('2027-01-10T12:00:00Z'))).toBe(-300);
    });

    it('gives the shift from origin to destination, with half hours', () => {
        const may = at('2027-05-10T12:00:00Z');
        expect(shiftHours(BRU, LIS, may)).toBe(-1);
        expect(shiftHours(BRU, NRT, may)).toBe(7);
        expect(shiftHours(BRU, JFK, may)).toBe(-6);
        expect(shiftHours(BRU, DEL, may)).toBe(3.5);
        expect(shiftHours(BRU, BRU, may)).toBe(0);
        // The US changes its clocks on 14 March and Europe on 28 March: for those two weeks the gap is 5 hours, not 6.
        expect(shiftHours(BRU, JFK, at('2027-03-20T12:00:00Z'))).toBe(-5);
        expect(shiftHours(BRU, JFK, at('2027-03-30T12:00:00Z'))).toBe(-6);
    });

    it('says it in words', () => {
        expect(shiftText(1)).toBe('1 hour ahead');
        expect(shiftText(-3)).toBe('3 hours behind');
        expect(shiftText(3.5)).toBe('3.5 hours ahead');
        expect(shiftText(0)).toBe('the same time');
    });

    it('reads the clock and the day in a zone', () => {
        expect(localClock(NRT, at('2027-05-10T10:00:00Z'))).toBe('19:00');
        expect(localClock(JFK, at('2027-05-10T10:00:00Z'))).toBe('06:00');
        expect(localDay(NRT, at('2027-05-10T20:00:00Z'))).toBe('2027-05-11');
        expect(localDay(JFK, at('2027-05-10T02:00:00Z'))).toBe('2027-05-09');
    });
});

describe('night at the destination', () => {
    it('counts the hours of the flight that are night there', () => {
        // Leaves Brussels 12:00 (19:00 in Tokyo), lands 06:00 Tokyo the next day: 22:00 to 06:00 is night.
        expect(nightHoursAtDestination(NRT, at('2027-05-10T10:00:00Z'), at('2027-05-10T21:00:00Z'))).toBe(8);
        // London 11:00 to New York 13:30: only 06:00 to 07:00 is night there.
        expect(nightHoursAtDestination(JFK, at('2027-05-10T10:00:00Z'), at('2027-05-10T17:30:00Z'))).toBe(1);
    });
});

describe('the plan', () => {
    it('has nothing to plan for under two hours of difference', () => {
        const plan = jetLagPlan({ fromTz: BRU, toTz: LIS, departure: at('2027-05-10T08:00:00Z'), arrival: at('2027-05-10T11:00:00Z') });
        expect(plan).toMatchObject({ level: 'none', direction: 'none', recoveryDays: 0, steps: [] });
        expect(plan.shift).toBe(-1);
    });

    it('plans a westward crossing: evening light, a later bedtime, a nap if it lands in the afternoon', () => {
        // Brussels 10:00 to New York 12:30 (8h30).
        const plan = jetLagPlan({ fromTz: BRU, toTz: JFK, departure: at('2027-05-10T08:00:00Z'), arrival: at('2027-05-10T16:30:00Z') });
        expect(plan).toMatchObject({ shift: -6, direction: 'west', level: 'moderate', recoveryDays: 4, landsAt: '12:30' });
        expect(plan.light).toEqual({ seek: ['16:00', '20:00'], avoid: ['06:00', '10:00'] });
        const titles = plan.steps.map(s => s.title);
        expect(titles[0]).toBe('Start shifting 3 days before');
        expect(plan.steps[0].detail).toMatch(/hour later/);
        expect(titles).toContain('Switch to destination time on boarding');
        expect(titles).toContain('A short nap, then out');
        expect(titles).toContain('Look for evening light');
        expect(titles[titles.length - 1]).toBe('About 4 days to catch up');
    });

    it('plans an eastward crossing: morning light, an earlier bedtime, stay up if it lands in the morning', () => {
        // Brussels 12:00 to Tokyo 06:00 the next day (11h).
        const plan = jetLagPlan({ fromTz: BRU, toTz: NRT, departure: at('2027-05-10T10:00:00Z'), arrival: at('2027-05-10T21:00:00Z') });
        expect(plan).toMatchObject({ shift: 7, direction: 'east', level: 'moderate', recoveryDays: 6, landsAt: '06:00' });
        expect(plan.light.seek).toEqual(['08:00', '12:00']);
        const titles = plan.steps.map(s => s.title);
        expect(plan.steps[0].detail).toMatch(/hour earlier/);
        expect(titles).toContain('Sleep through the night there');
        expect(titles).toContain('Stay up and get outside');
        expect(titles).toContain('Look for morning light');
    });

    it('says to go straight to bed after a night landing, and to eat lightly after an evening one', () => {
        const night = jetLagPlan({ fromTz: BRU, toTz: JFK, departure: at('2027-05-10T14:00:00Z'), arrival: at('2027-05-11T03:30:00Z') });
        expect(night.landsAt).toBe('23:30');
        expect(night.steps.map(s => s.title)).toContain('Go straight to bed');
        const evening = jetLagPlan({ fromTz: BRU, toTz: JFK, departure: at('2027-05-10T13:00:00Z'), arrival: at('2027-05-10T22:30:00Z') });
        expect(evening.landsAt).toBe('18:30');
        expect(evening.steps.map(s => s.title)).toContain('Eat lightly and go to bed on time');
    });

    it('skips the pre-shift for a mild difference and does not suggest sleeping when little of the flight is night there', () => {
        const mild = jetLagPlan({ fromTz: LON, toTz: JFK, departure: at('2027-05-10T10:00:00Z'), arrival: at('2027-05-10T17:30:00Z') });
        expect(mild).toMatchObject({ shift: -5, level: 'moderate' });
        expect(mild.steps.map(s => s.title)).not.toContain('Sleep through the night there');
        const small = jetLagPlan({ fromTz: BRU, toTz: DEL, departure: at('2027-05-10T08:00:00Z'), arrival: at('2027-05-10T16:00:00Z') });
        expect(small).toMatchObject({ shift: 3.5, level: 'mild', direction: 'east' });
        expect(small.steps[0].when).toBe('flight');
        expect(small.steps.some(s => s.when === 'before')).toBe(false);
    });

    it('calls a very big difference hard and caps the recovery', () => {
        const hard = jetLagPlan({ fromTz: JFK, toTz: 'Asia/Singapore', departure: at('2027-05-10T10:00:00Z'), arrival: at('2027-05-11T05:00:00Z') });
        expect(hard.level).toBe('hard');
        expect(hard.recoveryDays).toBeLessThanOrEqual(10);
    });
});

describe('facts for the chips', () => {
    it('gives the gap, the clock at each end now, and when it lands on both', () => {
        const input = { fromTz: BRU, toTz: NRT, departure: at('2027-05-10T10:00:00Z'), arrival: at('2027-05-10T21:00:00Z') };
        const facts = zoneFacts(input, at('2027-05-10T12:00:00Z'));
        expect(facts).toEqual({ shift: 7, nowThere: '21:00', nowHere: '14:00', landsThere: '06:00', landsHere: '23:00 the day before' });
        expect(zoneFacts({ fromTz: BRU, toTz: JFK, departure: at('2027-05-10T08:00:00Z'), arrival: at('2027-05-10T16:30:00Z') }, at('2027-05-10T08:00:00Z')).landsHere).toBe('18:30');
        expect(zoneFacts({ fromTz: JFK, toTz: NRT, departure: at('2027-05-10T10:00:00Z'), arrival: at('2027-05-11T05:00:00Z') }, at('2027-05-10T08:00:00Z')).landsHere).toBe('01:00');
        // Lands 16:00 in New York on the 10th: already 05:00 on the 11th in Tokyo.
        expect(zoneFacts({ fromTz: NRT, toTz: JFK, departure: at('2027-05-10T08:00:00Z'), arrival: at('2027-05-10T20:00:00Z') }, at('2027-05-10T08:00:00Z')).landsHere).toBe('05:00 the next day');
    });
});
