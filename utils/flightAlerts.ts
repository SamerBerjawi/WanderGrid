import type { Transport } from '../types';

/**
 * What worth telling the traveller changed about a flight between two looks at its live status: a delay
 * that grew (or ended), a new gate or terminal, a baggage belt, a cancellation or diversion, and a
 * connection that is no longer safe. Pure functions over plain snapshots, so they are easy to test; the
 * polling and notifying live in hooks/useFlightAlerts.ts.
 */

export interface FlightSnapshot {
    status: string;
    depDelay: number;
    arrDelay: number;
    depGate: string;
    depTerminal: string;
    arrGate: string;
    arrTerminal: string;
    baggage: string;
}

export type AlertKind = 'delay' | 'on-time' | 'gate' | 'terminal' | 'baggage' | 'cancelled' | 'diverted' | 'connection';
export type AlertSeverity = 'info' | 'warn' | 'bad';

export interface FlightAlert {
    id: string;
    flightId: string;
    kind: AlertKind;
    severity: AlertSeverity;
    title: string;
    detail: string;
    at: number;
}

/** A delay smaller than this is not worth an alert, and a change smaller than STEP is not a new one. */
export const DELAY_MIN = 15;
export const DELAY_STEP = 10;
/** The shortest connection that is comfortable, in minutes. */
export const SAFE_CONNECTION = 60;

const label = (t: Pick<Transport, 'origin' | 'destination' | 'identifier'>) => `${t.identifier || 'Flight'} ${t.origin} → ${t.destination}`.trim();

export const diffAlerts = (flight: Transport, prev: FlightSnapshot | undefined, next: FlightSnapshot, now = Date.now()): FlightAlert[] => {
    const out: FlightAlert[] = [];
    const add = (kind: AlertKind, severity: AlertSeverity, title: string, detail: string, key = '') =>
        out.push({ id: `${flight.id}:${kind}:${key || title}`, flightId: flight.id, kind, severity, title, detail, at: now });

    if (next.status === 'cancelled' && prev?.status !== 'cancelled') add('cancelled', 'bad', 'Flight cancelled', label(flight));
    if (next.status === 'diverted' && prev?.status !== 'diverted') add('diverted', 'bad', 'Flight diverted', label(flight));

    const was = prev?.arrDelay ?? 0;
    if (next.arrDelay >= DELAY_MIN && Math.abs(next.arrDelay - was) >= (prev ? DELAY_STEP : 0)) {
        add('delay', next.arrDelay >= 60 ? 'bad' : 'warn', `Delayed ${next.arrDelay} min`, prev && was >= DELAY_MIN ? `${label(flight)} (was ${was} min)` : label(flight), String(next.arrDelay));
    } else if (prev && was >= DELAY_MIN && next.arrDelay < 5) {
        add('on-time', 'info', 'Back on time', label(flight));
    }

    if (prev) {
        if (next.depGate && next.depGate !== prev.depGate) add('gate', 'warn', prev.depGate ? `Gate changed ${prev.depGate} → ${next.depGate}` : `Gate ${next.depGate}`, label(flight), `dep:${next.depGate}`);
        if (next.depTerminal && next.depTerminal !== prev.depTerminal) add('terminal', 'warn', prev.depTerminal ? `Terminal changed ${prev.depTerminal} → ${next.depTerminal}` : `Terminal ${next.depTerminal}`, label(flight), `dep:${next.depTerminal}`);
        if (next.arrGate && next.arrGate !== prev.arrGate && prev.arrGate) add('gate', 'info', `Arrival gate changed ${prev.arrGate} → ${next.arrGate}`, label(flight), `arr:${next.arrGate}`);
        if (next.baggage && next.baggage !== prev.baggage) add('baggage', 'info', `Baggage belt ${next.baggage}`, label(flight), next.baggage);
    }
    return out;
};

/**
 * Whether the plane for the next leg will still be there. `etaMs` is the live arrival of the first leg and
 * `nextDepartureMs` the second one's departure; both in epoch ms.
 */
export const connectionAlert = (first: Transport, second: Transport, etaMs: number, nextDepartureMs: number, now = Date.now(), safe = SAFE_CONNECTION): FlightAlert | null => {
    if (!Number.isFinite(etaMs) || !Number.isFinite(nextDepartureMs)) return null;
    const minutes = Math.round((nextDepartureMs - etaMs) / 60000);
    if (minutes >= safe) return null;
    const place = second.origin;
    return minutes <= 0
        ? { id: `${second.id}:connection:missed`, flightId: second.id, kind: 'connection', severity: 'bad', title: `You may miss ${second.identifier || 'your connection'}`, detail: `${label(first)} lands after ${label(second)} leaves from ${place}`, at: now }
        : { id: `${second.id}:connection:${minutes}`, flightId: second.id, kind: 'connection', severity: minutes < 30 ? 'bad' : 'warn', title: `Tight connection in ${place}: ${minutes} min`, detail: `${label(first)} then ${label(second)}`, at: now };
};
