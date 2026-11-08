/**
 * Time zones and jet lag for a journey: how far apart the two ends are, what time it is there, and a sleep and
 * light plan for the days after. The plan is the general rule of thumb (west: stay up later and look for evening
 * light; east: sleep earlier and look for morning light; about a day to recover for every hour or two crossed), not
 * medical advice, and it only needs the two zones and the times. Pure: callers supply the instants.
 */

/** Minutes a zone is ahead of UTC at an instant (negative for the Americas), DST included. */
export const offsetMinutes = (tz: string, at: Date): number => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at);
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
};

/** The wall clock in a zone at an instant, "HH:mm". */
export const localClock = (tz: string, at: Date): string => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(at);
    return `${parts.find(p => p.type === 'hour')?.value}:${parts.find(p => p.type === 'minute')?.value}`;
};

/** The calendar day in a zone at an instant, "YYYY-MM-DD". */
export const localDay = (tz: string, at: Date): string => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
    return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
};

/** Hours the destination is ahead of the origin at an instant (negative when behind); half hours for zones like India. */
export const shiftHours = (fromTz: string, toTz: string, at: Date): number => (offsetMinutes(toTz, at) - offsetMinutes(fromTz, at)) / 60;

const hoursWord = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)} ${h === 1 ? 'hour' : 'hours'}`;

/** "1 hour ahead", "3 hours behind", "the same time". */
export const shiftText = (shift: number): string => (shift === 0 ? 'the same time' : `${hoursWord(Math.abs(shift))} ${shift > 0 ? 'ahead' : 'behind'}`);

export type Direction = 'east' | 'west' | 'none';
export type Level = 'none' | 'mild' | 'moderate' | 'hard';

export interface PlanStep { when: 'before' | 'flight' | 'arrival' | 'after'; title: string; detail: string }
export interface JetLagPlan {
    /** Hours the destination is ahead of the origin. */
    shift: number;
    direction: Direction;
    level: Level;
    /** About how many days the body clock takes to catch up. */
    recoveryDays: number;
    /** The destination's local time you land. */
    landsAt: string;
    sleep: { bed: string; wake: string };
    light: { seek: [string, string]; avoid: [string, string] };
    steps: PlanStep[];
}

export interface PlanInput { fromTz: string; toTz: string; departure: Date; arrival: Date }

/** Hours of the trip that are night (22:00 to 07:00) at the destination: the part worth sleeping through. */
export const nightHoursAtDestination = (toTz: string, departure: Date, arrival: Date): number => {
    let minutes = 0;
    for (let t = departure.getTime(); t < arrival.getTime(); t += 15 * 60000) {
        const hour = Number(localClock(toTz, new Date(t)).slice(0, 2));
        if (hour >= 22 || hour < 7) minutes += 15;
    }
    return minutes / 60;
};

const levelOf = (hours: number): Level => (hours < 2 ? 'none' : hours < 4 ? 'mild' : hours < 8 ? 'moderate' : 'hard');
const hourOf = (clock: string) => Number(clock.slice(0, 2)) + Number(clock.slice(3, 5)) / 60;

/** The plan for one journey. Under two hours of difference there is nothing to plan (no steps). */
export const jetLagPlan = ({ fromTz, toTz, departure, arrival }: PlanInput): JetLagPlan => {
    const shift = shiftHours(fromTz, toTz, arrival);
    const abs = Math.abs(shift);
    const direction: Direction = abs < 2 ? 'none' : shift > 0 ? 'east' : 'west';
    const level = levelOf(abs);
    const landsAt = localClock(toTz, arrival);
    const recoveryDays = level === 'none' ? 0 : direction === 'east' ? Math.min(10, Math.max(1, Math.round(abs * 0.9))) : Math.min(8, Math.max(1, Math.round(abs * 0.6)));
    const sleep = { bed: '22:30', wake: '07:00' };
    const light: JetLagPlan['light'] = direction === 'west' ? { seek: ['16:00', '20:00'], avoid: ['06:00', '10:00'] } : { seek: ['08:00', '12:00'], avoid: ['17:00', '21:00'] };
    const steps: PlanStep[] = [];
    if (level === 'none') return { shift, direction, level, recoveryDays, landsAt, sleep, light, steps };

    if (level !== 'mild') {
        const days = Math.min(3, Math.ceil(abs / 2));
        steps.push({
            when: 'before',
            title: `Start shifting ${days} ${days === 1 ? 'day' : 'days'} before`,
            detail: direction === 'east'
                ? `Go to bed and get up an hour earlier each day, and have your meals earlier, so you leave ${hoursWord(days)} closer to their time.`
                : `Go to bed and get up an hour later each day, and have your meals later, so you leave ${hoursWord(days)} closer to their time.`,
        });
    }
    steps.push({ when: 'flight', title: 'Switch to destination time on boarding', detail: `It is ${localClock(toTz, departure)} at the destination when you take off. Set your watch to it, and eat and drink to that clock.` });
    const night = nightHoursAtDestination(toTz, departure, arrival);
    if (night >= 3) steps.push({ when: 'flight', title: 'Sleep through the night there', detail: `About ${hoursWord(Math.round(night))} of the flight is night at the destination (22:00 to 07:00). Sleep then, and keep the rest of the flight for light and a walk.` });

    const arrives = hourOf(landsAt);
    if (arrives < 5 || arrives >= 21) steps.push({ when: 'arrival', title: 'Go straight to bed', detail: `You land at ${landsAt}. Sleep as soon as you can, and set no early alarm.` });
    else if (arrives < 12) steps.push({ when: 'arrival', title: 'Stay up and get outside', detail: `You land at ${landsAt}. Get into daylight and keep going until about ${sleep.bed}; a nap makes the first night worse.` });
    else if (arrives < 17) steps.push({ when: 'arrival', title: 'A short nap, then out', detail: `You land at ${landsAt}. If you must sleep, keep it to 20 or 30 minutes before 15:00, then get out into the light and hold on until about ${sleep.bed}.` });
    else steps.push({ when: 'arrival', title: 'Eat lightly and go to bed on time', detail: `You land at ${landsAt}. Have a light meal and go to bed around ${sleep.bed}.` });

    steps.push({
        when: 'after',
        title: direction === 'east' ? 'Look for morning light' : 'Look for evening light',
        detail: direction === 'east'
            ? `For the first few days get bright light between ${light.seek[0]} and ${light.seek[1]}, and dim the lights and screens after ${light.avoid[0]}.`
            : `For the first few days get bright light between ${light.seek[0]} and ${light.seek[1]}, and keep out of strong light before ${light.avoid[1]}.`,
    });
    steps.push({ when: 'after', title: `About ${recoveryDays} ${recoveryDays === 1 ? 'day' : 'days'} to catch up`, detail: `Aim for bed at ${sleep.bed} and up at ${sleep.wake} destination time from the first night, even if you are tired at the wrong hours.` });
    return { shift, direction, level, recoveryDays, landsAt, sleep, light, steps };
};

export interface ZoneFacts {
    shift: number;
    /** The time at the destination now, and at the origin now. */
    nowThere: string;
    nowHere: string;
    /** When the journey lands on the destination's clock and on the origin's ("the day before" or "the next day" when it differs). */
    landsThere: string;
    landsHere: string;
}

/** Plain facts for the chips on a pass: the gap, the time at each end now, and when it lands on both clocks. */
export const zoneFacts = ({ fromTz, toTz, arrival }: PlanInput, now: Date = new Date()): ZoneFacts => {
    const dayHere = localDay(fromTz, arrival), dayThere = localDay(toTz, arrival);
    const suffix = dayHere < dayThere ? ' the day before' : dayHere > dayThere ? ' the next day' : '';
    return {
        shift: shiftHours(fromTz, toTz, arrival),
        nowThere: localClock(toTz, now),
        nowHere: localClock(fromTz, now),
        landsThere: localClock(toTz, arrival),
        landsHere: `${localClock(fromTz, arrival)}${suffix}`,
    };
};
