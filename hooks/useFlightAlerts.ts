import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Transport } from '../types';
import { lookupFlight, type FlightCandidate } from '../services/flightLookup';
import { connectionAlert, diffAlerts, type FlightAlert, type FlightSnapshot } from '../utils/flightAlerts';
import { groupJourneys, isLiveWindow, type JourneyRecord } from '../utils/journeysModel';
import { getFlightDepartureUtcDate } from '../utils/flightData';

/**
 * Watches the flights that leave within 12 hours or are in the air: every few minutes, while the page is
 * visible, looks each one up, compares it with the last look (kept in localStorage, so a reload doesn't
 * forget) and raises an alert for a new delay, gate, terminal, baggage belt, cancellation, diversion, or a
 * connection that is no longer safe. With permission, alerts also appear as browser notifications.
 * It can only watch while the app is open: there is no server that pushes to a closed browser.
 */

const SNAP_KEY = 'wandergrid_flight_snapshots';
const SEEN_KEY = 'wandergrid_flight_alerts_dismissed';
const NOTIFY_KEY = 'wandergrid_flight_notify';
const EVERY_MS = 3 * 60_000;
const MAX_WATCHED = 6;

const read = <T,>(key: string, fallback: T): T => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; } };
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } };

const snapshotOf = (c: FlightCandidate): FlightSnapshot => ({
    status: c.status,
    depDelay: c.departure.delay || 0,
    arrDelay: c.arrival.delay || 0,
    depGate: c.departure.gate || '',
    depTerminal: c.departure.terminal || '',
    arrGate: c.arrival.gate || '',
    arrTerminal: c.arrival.terminal || '',
    baggage: c.arrival.baggage || '',
});

const pick = (list: FlightCandidate[], t: Transport): FlightCandidate | null => {
    const code = (s: string) => (s || '').trim().toUpperCase().slice(0, 3);
    const sched = list.filter(c => c.confidence === 'schedule');
    return sched.find(c => c.departure.iata === code(t.origin) && c.arrival.iata === code(t.destination)) ?? sched.find(c => c.departure.iata === code(t.origin)) ?? sched[0] ?? null;
};

export const useFlightAlerts = (records: JourneyRecord[]) => {
    const [alerts, setAlerts] = useState<FlightAlert[]>([]);
    const [dismissed, setDismissed] = useState<string[]>(() => read<string[]>(SEEN_KEY, []));
    const [notify, setNotify] = useState<boolean>(() => read<string>(NOTIFY_KEY, '') === '1');
    const [checkedAt, setCheckedAt] = useState<number | null>(null);
    const snaps = useRef<Record<string, FlightSnapshot>>(read(SNAP_KEY, {}));
    const raised = useRef(new Set<string>());
    const latest = useRef({ records, notify });
    latest.current = { records, notify };

    const canNotify = typeof window !== 'undefined' && 'Notification' in window;

    const watched = useMemo(() => records
        .filter(r => r.flight.mode === 'Flight' && r.flight.identifier && isLiveWindow(r.flight, 12))
        .sort((a, b) => getFlightDepartureUtcDate(a.flight).getTime() - getFlightDepartureUtcDate(b.flight).getTime())
        .slice(0, MAX_WATCHED), [records]);
    const watchKey = watched.map(r => r.flight.id).join(',');

    const check = useCallback(async () => {
        const { records: all, notify: notifyOn } = latest.current;
        const list = all.filter(r => r.flight.mode === 'Flight' && r.flight.identifier && isLiveWindow(r.flight, 12)).slice(0, MAX_WATCHED);
        if (list.length === 0) return;
        const units = groupJourneys(all);
        const found: FlightAlert[] = [];
        for (const rec of list) {
            const f = rec.flight;
            try {
                const r = await lookupFlight(f.identifier.replace(/\s/g, ''), f.departureDate);
                const c = pick(r.candidates, f);
                if (!c) continue;
                const next = snapshotOf(c);
                found.push(...diffAlerts(f, snaps.current[f.id], next));
                snaps.current[f.id] = next;
                // The next leg of its journey: will it still be there?
                const unit = units.find(u => u.kind === 'journey' && u.group.legs.some(l => l.flight.id === f.id));
                if (unit && unit.kind === 'journey') {
                    const i = unit.group.legs.findIndex(l => l.flight.id === f.id);
                    const after = unit.group.legs[i + 1];
                    const eta = c.arrival.actualUtc || c.arrival.estimatedUtc || c.arrival.scheduledUtc;
                    if (after && eta && after.flight.origin.trim().toUpperCase() === f.destination.trim().toUpperCase()) {
                        const a = connectionAlert(f, after.flight, Date.parse(eta), getFlightDepartureUtcDate(after.flight).getTime());
                        if (a && getFlightDepartureUtcDate(after.flight).getTime() - Date.now() < 36 * 3_600_000) found.push(a);
                    }
                }
            } catch { /* one flight failing must not stop the rest */ }
        }
        write(SNAP_KEY, snaps.current);
        setCheckedAt(Date.now());
        if (found.length === 0) return;
        setAlerts(prev => {
            const byId = new Map(prev.map(a => [a.id, a]));
            found.forEach(a => byId.set(a.id, a));
            return [...byId.values()].sort((a, b) => b.at - a.at).slice(0, 20);
        });
        if (notifyOn && canNotify && Notification.permission === 'granted') {
            found.filter(a => !raised.current.has(a.id) && a.severity !== 'info').forEach(a => { raised.current.add(a.id); try { new Notification(a.title, { body: a.detail, tag: a.id }); } catch { /* not allowed here */ } });
        } else found.forEach(a => raised.current.add(a.id));
    }, [canNotify]);

    useEffect(() => {
        if (!watchKey) return;
        const run = () => { if (document.visibilityState === 'visible') void check(); };
        run();
        const timer = window.setInterval(run, EVERY_MS);
        document.addEventListener('visibilitychange', run);
        return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', run); };
    }, [watchKey, check]);

    const dismiss = useCallback((id: string) => {
        setDismissed(d => { const next = [...new Set([...d, id])].slice(-100); write(SEEN_KEY, next); return next; });
    }, []);

    const toggleNotify = useCallback(async () => {
        if (!canNotify) return;
        if (notify) { setNotify(false); write(NOTIFY_KEY, ''); return; }
        const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
        if (perm === 'granted') { setNotify(true); write(NOTIFY_KEY, '1'); }
    }, [canNotify, notify]);

    const visible = alerts.filter(a => !dismissed.includes(a.id));
    return { alerts: visible, dismiss, notify, canNotify, toggleNotify, watching: watched.length, checkedAt };
};
