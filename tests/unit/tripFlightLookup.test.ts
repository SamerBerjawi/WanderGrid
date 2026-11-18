import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transport, Trip, User } from '../../types';
import type { LookupResult } from '../../services/flightLookup';
import type { TripDraft } from '../../hooks/useTripsData';
import { useFlightLegAssist } from '../../hooks/useFlightLegAssist';
import { TripSheet } from '../../components/new/trips/TripSheets';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const end = (iata: string, local: string | null) => ({
    iata,
    icao: '',
    name: iata,
    city: iata,
    country: '',
    timezone: '',
    terminal: '1',
    gate: 'B7',
    baggage: '',
    scheduledLocal: local,
    scheduledUtc: null,
    estimatedLocal: null,
    estimatedUtc: null,
    actualLocal: null,
    actualUtc: null,
    delay: 0,
});

const sampleResult = (date = '2026-11-20'): LookupResult => ({
    ok: true,
    query: { flight: 'ME215', carrier: 'ME', number: '215', date },
    candidates: [{
        source: 'flightstats',
        sourceLabel: 'FlightStats',
        confidence: 'schedule',
        flightIata: 'ME215',
        airline: { name: 'Middle East Airlines', iata: 'ME', icao: 'MEA' },
        status: 'scheduled',
        statusText: 'Scheduled',
        departure: end('BEY', `${date}T07:05`),
        arrival: end('BRU', `${date}T10:35`),
        aircraft: { model: 'Airbus A320', registration: 'T7-ME8' },
        durationMinutes: 270,
        live: null,
    }],
    attempts: [{ source: 'flightstats', state: 'found', count: 1, ms: 20 }],
});

const emptyResult = (date = '2026-11-20'): LookupResult => ({
    ok: true,
    query: { flight: 'ME215', carrier: 'ME', number: '215', date },
    candidates: [],
    attempts: [{ source: 'flightstats', state: 'none', ms: 10 }],
});

const mount = (el: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(el); });
    return {
        container,
        unmount: () => {
            act(() => { root.unmount(); });
            container.remove();
        },
    };
};

const setNativeValue = (input: HTMLInputElement, value: string) => {
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    proto?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('useFlightLegAssist', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('auto-fetches and fills a new flight leg when untouched', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => sampleResult('2026-11-20'),
        } as unknown as Response);

        let latestLeg: Partial<Transport> = {};
        const assistRef: { current: ReturnType<typeof useFlightLegAssist> | null } = { current: null };

        const Harness: React.FC<{ initial: Partial<Transport>; editing?: boolean; resetKey?: number }> = ({ initial, editing = false, resetKey = 0 }) => {
            const [leg, setLeg] = useState<Partial<Transport>>(initial);
            const assist = useFlightLegAssist({ leg, setLeg, editing, resetKey });
            latestLeg = leg;
            assistRef.current = assist;
            return null;
        };

        const { unmount } = mount(React.createElement(Harness, {
            initial: { mode: 'Flight', identifier: 'ME215', departureDate: '2026-11-20', origin: '', destination: '' },
        }));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(600);
        });

        expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/api/flights/lookup?flight=ME215&date=2026-11-20'), expect.any(Object));
        expect(latestLeg.origin).toBe('BEY');
        expect(latestLeg.destination).toBe('BRU');
        expect(latestLeg.provider).toBe('Middle East Airlines');
        expect(latestLeg.departureTime).toBe('07:05');
        expect(latestLeg.arrivalTime).toBe('10:35');
        expect(latestLeg.duration).toBe(270);
        expect(assistRef.current?.appliedIndex).toBe(0);
        unmount();
    });

    it('does not overwrite manually entered places and does not auto-fetch when editing', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => sampleResult('2026-11-20'),
        } as unknown as Response);

        let latestLeg: Partial<Transport> = {};
        const assistRef: { current: ReturnType<typeof useFlightLegAssist> | null } = { current: null };

        const Harness: React.FC<{ initial: Partial<Transport>; editing: boolean }> = ({ initial, editing }) => {
            const [leg, setLeg] = useState<Partial<Transport>>(initial);
            const assist = useFlightLegAssist({ leg, setLeg, editing, resetKey: 0 });
            latestLeg = leg;
            assistRef.current = assist;
            return null;
        };

        const view1 = mount(React.createElement(Harness, {
            initial: { mode: 'Flight', identifier: 'ME215', departureDate: '2026-11-20', origin: 'CDG', destination: 'LHR' },
            editing: false,
        }));
        await act(async () => { await vi.advanceTimersByTimeAsync(600); });
        expect(latestLeg.origin).toBe('CDG');
        expect(latestLeg.destination).toBe('LHR');
        expect(assistRef.current?.appliedIndex).toBe(-1);
        view1.unmount();

        fetchSpy.mockClear();
        const view2 = mount(React.createElement(Harness, {
            initial: { mode: 'Flight', identifier: 'ME215', departureDate: '2026-11-20', origin: 'AMS', destination: 'LHR' },
            editing: true,
        }));
        await act(async () => { await vi.advanceTimersByTimeAsync(600); });
        expect(fetchSpy).not.toHaveBeenCalled();
        view2.unmount();
    });

    it('offers previously logged flight times when lookup finds no schedule', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => emptyResult('2027-06-15'),
        } as unknown as Response);

        let latestLeg: Partial<Transport> = {};
        const assistRef: { current: ReturnType<typeof useFlightLegAssist> | null } = { current: null };
        const pastTrip = { id: 't1', name: 'Past' } as Trip;
        const pastFlight = {
            id: 'f1',
            itineraryId: 'i1',
            type: 'One-Way',
            mode: 'Flight',
            provider: 'Middle East Airlines',
            identifier: 'ME215',
            confirmationCode: '',
            origin: 'BEY',
            destination: 'BRU',
            departureDate: '2026-10-01',
            departureTime: '07:05',
            arrivalDate: '2026-10-01',
            arrivalTime: '10:35',
            duration: 270,
        } as Transport;

        const Harness: React.FC = () => {
            const [leg, setLeg] = useState<Partial<Transport>>({ mode: 'Flight', identifier: 'ME215', departureDate: '2027-06-15', origin: '', destination: '' });
            const assist = useFlightLegAssist({ leg, setLeg, editing: false, resetKey: 0, history: [{ flight: pastFlight, trip: pastTrip }] });
            latestLeg = leg;
            assistRef.current = assist;
            return null;
        };

        const { unmount } = mount(React.createElement(Harness));
        await act(async () => { await vi.advanceTimersByTimeAsync(600); });
        expect(assistRef.current?.logged?.identifier).toBe('ME215');

        act(() => { assistRef.current?.useLogged(); });
        expect(latestLeg.origin).toBe('BEY');
        expect(latestLeg.destination).toBe('BRU');
        expect(latestLeg.departureTime).toBe('07:05');
        expect(latestLeg.arrivalTime).toBe('10:35');
        expect(latestLeg.arrivalDate).toBe('2027-06-15');
        unmount();
    });
});

describe('TripSheet new trip flight auto-fetch', () => {
    const origMatchMedia = window.matchMedia;
    const origResizeObserver = globalThis.ResizeObserver;

    beforeEach(() => {
        vi.useFakeTimers();
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
        globalThis.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        } as unknown as typeof ResizeObserver;
    });

    afterEach(() => {
        vi.useRealTimers();
        window.matchMedia = origMatchMedia;
        globalThis.ResizeObserver = origResizeObserver;
    });

    it('fetches flight info on Step 2 when creating a new trip and saves it with the trip', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
            if (url.includes('/api/flights/lookup')) {
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers({ 'content-type': 'application/json' }),
                    json: async () => sampleResult('2026-11-20'),
                } as unknown as Response;
            }
            return {
                ok: true,
                status: 200,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: async () => [],
            } as unknown as Response;
        });

        const testUser: User = { id: 'u1', name: 'Samer', email: 's@example.com', role: 'Admin', leaveBalance: 20, takenLeave: 0, allowance: 20 };
        const onSave = vi.fn<(draft: TripDraft, trip?: Trip) => Promise<void>>(async () => undefined);
        const { unmount } = mount(React.createElement(TripSheet, {
            target: {
                kind: 'create',
                bucket: 'planned',
                prefill: { name: 'Brussels', destination: 'Brussels, Belgium', startDate: '2026-11-20', endDate: '2026-11-23' },
            },
            trips: [],
            users: [testUser],
            entitlements: [],
            currentUserId: 'u1',
            onClose: vi.fn(),
            onSave,
            onDelete: vi.fn(),
            onOpenTrip: vi.fn(),
        }));

        // Step 1 -> Step 2 (Transport)
        const nextBtn1 = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.includes('Next'));
        expect(nextBtn1).toBeTruthy();
        act(() => { nextBtn1!.click(); });

        // Flight number input should be visible at the top of the Flight form
        const flightInput = document.body.querySelector('input[placeholder="ME215"]') as HTMLInputElement | null;
        expect(flightInput).toBeTruthy();

        act(() => { setNativeValue(flightInput!, 'ME215'); });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(650);
        });

        expect(document.body.textContent).toContain('Middle East Airlines');
        expect(document.body.textContent).toContain('Filled in');

        // Advance to Step 3 (Stays) without clicking "Add transport" first: the fetched flight should be committed automatically
        const nextBtn2 = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.includes('Next'));
        expect(nextBtn2).toBeTruthy();
        act(() => { nextBtn2!.click(); });

        // Create trip on Step 3
        const createBtn = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.includes('Create trip'));
        expect(createBtn).toBeTruthy();
        await act(async () => {
            createBtn!.click();
        });

        expect(onSave).toHaveBeenCalledTimes(1);
        const [savedDraft] = onSave.mock.calls[0];
        expect(savedDraft.transports).toHaveLength(1);
        expect(savedDraft.transports?.[0]).toMatchObject({
            mode: 'Flight',
            identifier: 'ME215',
            origin: 'BEY',
            destination: 'BRU',
            provider: 'Middle East Airlines',
            providerCode: 'ME',
            departureDate: '2026-11-20',
            departureTime: '07:05',
            arrivalDate: '2026-11-20',
            arrivalTime: '10:35',
            departureTerminal: '1',
            departureGate: 'B7',
            vehicleModel: 'Airbus A320',
            tailNumber: 'T7-ME8',
            duration: 270,
        });

        unmount();
    });

    it('lets you add multiple fetched flights, switch transport modes, and check flight data on demand when editing a leg', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
            if (url.includes('/api/flights/lookup')) {
                const isReturn = url.includes('ME216');
                const res = sampleResult('2026-11-20');
                if (isReturn) {
                    res.query = { flight: 'ME216', carrier: 'ME', number: '216', date: '2026-11-20' };
                    res.candidates[0] = {
                        ...res.candidates[0],
                        flightIata: 'ME216',
                        departure: end('BRU', '2026-11-20T12:00'),
                        arrival: end('BEY', '2026-11-20T17:15'),
                        durationMinutes: 255,
                    };
                }
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers({ 'content-type': 'application/json' }),
                    json: async () => res,
                } as unknown as Response;
            }
            return {
                ok: true,
                status: 200,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: async () => [],
            } as unknown as Response;
        });

        const testUser: User = { id: 'u1', name: 'Samer', email: 's@example.com', role: 'Admin', leaveBalance: 20, takenLeave: 0, allowance: 20 };
        const onSave = vi.fn<(draft: TripDraft, trip?: Trip) => Promise<void>>(async () => undefined);
        const { unmount } = mount(React.createElement(TripSheet, {
            target: {
                kind: 'create',
                bucket: 'planned',
                prefill: { name: 'Brussels', destination: 'Brussels, Belgium', startDate: '2026-11-20', endDate: '2026-11-23' },
            },
            trips: [],
            users: [testUser],
            entitlements: [],
            currentUserId: 'u1',
            onClose: vi.fn(),
            onSave,
            onDelete: vi.fn(),
            onOpenTrip: vi.fn(),
        }));

        // Step 1 -> Step 2 (Transport)
        const nextBtn1 = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.includes('Next'));
        act(() => { nextBtn1!.click(); });

        // First flight: ME215
        const flightInput = () => document.body.querySelector('input[placeholder="ME215"]') as HTMLInputElement;
        act(() => { setNativeValue(flightInput(), 'ME215'); });
        await act(async () => { await vi.advanceTimersByTimeAsync(650); });

        // Click "Add transport" to add leg 1 and reset form
        const addBtn = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.includes('Add transport'));
        expect(addBtn).toBeTruthy();
        act(() => { addBtn!.click(); });
        expect(document.body.textContent).toContain('Added (1)');

        // Second flight: ME216 (resetSeq cleared applied state so ME216 auto-fills too)
        act(() => { setNativeValue(flightInput(), 'ME216'); });
        await act(async () => { await vi.advanceTimersByTimeAsync(650); });
        expect(document.body.textContent).toContain('BRU');

        // Switch mode to Train and back to Flight: flight lead hides on Train and returns on Flight
        const trainChip = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Train');
        act(() => { trainChip!.click(); });
        expect(document.body.querySelector('input[placeholder="ME215"]')).toBeNull();
        const flightChip = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Flight');
        act(() => { flightChip!.click(); });
        expect(document.body.querySelector('input[placeholder="ME215"]')).toBeTruthy();

        // Click "Edit BEY → BRU" on the first added flight: should NOT auto-fetch flight lookup, should show "Check flight data"
        fetchSpy.mockClear();
        const editLegBtn = document.body.querySelector('button[aria-label^="Edit BEY"]') as HTMLButtonElement;
        expect(editLegBtn).toBeTruthy();
        act(() => { editLegBtn.click(); });
        await act(async () => { await vi.advanceTimersByTimeAsync(650); });
        const lookupCalls = () => fetchSpy.mock.calls.filter(([u]) => String(u).includes('/api/flights/lookup'));
        expect(lookupCalls()).toHaveLength(0);
        const checkBtn = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.includes('Check flight data'));
        expect(checkBtn).toBeTruthy();
        await act(async () => { checkBtn!.click(); });
        expect(lookupCalls()).toHaveLength(1);

        unmount();
    });
});
