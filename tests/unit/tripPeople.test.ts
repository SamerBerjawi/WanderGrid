import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Expense, Trip, TripCompanion, User } from '../../types';
import type { TripDraft } from '../../hooks/useTripsData';
import {
    COMPANION_ROLES,
    TRIP_CLASSIFICATIONS,
    defaultCompanionFlags,
    includedItemCost,
    isCostExcluded,
    knownCompanions,
    ledgerMembersFor,
    personName,
    tripAllPeople,
    tripClassification,
    tripCostSummary,
    tripTravellers,
} from '../../utils/tripPeople';
import { costSplit } from '../../utils/tripItinerary';
import { tripCost } from '../../utils/tripsModel';
import { spendSeries } from '../../utils/dashboardModel';
import { byPassenger, journeyTotals, passengersOf, totalsByYear, type JourneyRecord } from '../../utils/journeysModel';
import { balances, includedExpenses, settle, totals } from '../../utils/expenses';
import { TripSheet } from '../../components/new/trips/TripSheets';
import { CostsPanel } from '../../components/new/trip/TripPanels';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const userMe: User = { id: 'u1', name: 'Samer', email: 'samer@example.com', role: 'Admin', leaveBalance: 20, takenLeave: 0, allowance: 20 };
const partner: TripCompanion = { id: 'c_partner', name: 'Maya', role: 'Partner' };
const friend: TripCompanion = { id: 'c_friend', name: 'Alex', role: 'Friend' };
const employer: TripCompanion = { id: 'c_employer', name: 'Acme Corp', role: 'Employer', isPayerOnly: true, excludeFromAnalytics: true };

const makeTrip = (over: Partial<Trip> = {}): Trip => ({
    id: 'trip1',
    name: 'London',
    location: 'London',
    startDate: '2026-11-20',
    endDate: '2026-11-23',
    status: 'Upcoming',
    participants: ['u1'],
    companions: [partner, employer],
    transports: [],
    accommodations: [],
    activities: [],
    ...over,
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

describe('trip classifications and non-account companions', () => {
    it('supports Personal, Business, Family, Bleisure and Other classifications with Personal default', () => {
        expect(TRIP_CLASSIFICATIONS).toEqual(['Personal', 'Business', 'Family', 'Bleisure', 'Other']);
        expect(tripClassification(undefined)).toBe('Personal');
        expect(tripClassification(makeTrip({ classification: 'Business' }))).toBe('Business');
    });

    it('defaults Employer companions to payer-only and excluded from personal analytics', () => {
        expect(COMPANION_ROLES).toContain('Employer');
        expect(COMPANION_ROLES).toContain('Partner');
        expect(COMPANION_ROLES).toContain('Family');
        expect(COMPANION_ROLES).toContain('Friend');
        expect(defaultCompanionFlags('Employer')).toEqual({ isPayerOnly: true, excludeFromAnalytics: true });
        expect(defaultCompanionFlags('Partner')).toEqual({ isPayerOnly: false, excludeFromAnalytics: false });
    });

    it('separates travelling companions from payer-only entities and harvests prior companions', () => {
        const trip = makeTrip({ companions: [partner, friend, employer] });
        expect(tripAllPeople(trip, [userMe]).map(p => p.name)).toEqual(['Samer', 'Maya', 'Alex', 'Acme Corp']);
        expect(tripTravellers(trip, [userMe]).map(p => p.name)).toEqual(['Samer', 'Maya', 'Alex']);
        expect(personName('c_employer', trip, [userMe])).toBe('Acme Corp');

        const earlier = makeTrip({ id: 'old', companions: [partner, { id: 'c_mom', name: 'Mom', role: 'Family' }] });
        const suggestions = knownCompanions([earlier], [partner]);
        expect(suggestions.map(s => s.name)).toEqual(['Mom']);
    });
});

describe('cost analytics exclusion and granular item sharing', () => {
    it('applies item override > excluded payer > trip-level exclusion precedence', () => {
        const bizTrip = makeTrip({ classification: 'Business', excludeCostsFromAnalytics: false });
        expect(isCostExcluded({ cost: 500, paidBy: 'c_employer' }, bizTrip)).toBe(true);
        expect(isCostExcluded({ cost: 500, paidBy: 'c_employer', excludeFromAnalytics: false }, bizTrip)).toBe(false);
        expect(isCostExcluded({ cost: 100, paidBy: 'u1' }, bizTrip)).toBe(false);
        expect(isCostExcluded({ cost: 100, paidBy: 'u1', excludeFromAnalytics: true }, bizTrip)).toBe(true);

        const fullyExcludedTrip = makeTrip({ classification: 'Business', excludeCostsFromAnalytics: true });
        expect(isCostExcluded({ cost: 100, paidBy: 'u1' }, fullyExcludedTrip)).toBe(true);
        expect(isCostExcluded({ cost: 40, paidBy: 'u1', excludeFromAnalytics: false }, fullyExcludedTrip)).toBe(false);
        expect(includedItemCost({ cost: 500, paidBy: 'c_employer' }, bizTrip)).toBe(0);
    });

    it('computes granular per-person shares when members are added to flights and stays but not activities', () => {
        const trip = makeTrip({
            classification: 'Bleisure',
            companions: [partner, employer],
            transports: [
                {
                    id: 'f1', itineraryId: 'i1', type: 'One-Way', mode: 'Flight', provider: 'BA', identifier: 'BA1',
                    confirmationCode: '', origin: 'BEY', destination: 'LHR', departureDate: '2026-11-20',
                    departureTime: '08:00', arrivalDate: '2026-11-20', arrivalTime: '11:00',
                    cost: 800, paidBy: 'c_employer', passengers: ['u1'],
                },
                {
                    id: 'f2', itineraryId: 'i2', type: 'One-Way', mode: 'Flight', provider: 'BA', identifier: 'BA2',
                    confirmationCode: '', origin: 'LHR', destination: 'BEY', departureDate: '2026-11-23',
                    departureTime: '14:00', arrivalDate: '2026-11-23', arrivalTime: '21:00',
                    cost: 400, paidBy: 'u1', passengers: ['u1', 'c_partner'],
                },
            ],
            accommodations: [
                {
                    id: 's1', name: 'Hotel One', address: 'London', type: 'Hotel',
                    checkInDate: '2026-11-20', checkInTime: '15:00', checkOutDate: '2026-11-23', checkOutTime: '11:00',
                    cost: 300, paidBy: 'c_partner', participants: ['u1', 'c_partner'],
                },
            ],
            activities: [
                {
                    id: 'a1', date: '2026-11-21', time: '18:00', title: 'Client Dinner',
                    cost: 120, paidBy: 'u1', participants: ['u1'],
                },
            ],
        });

        const summary = tripCostSummary(trip, [userMe]);
        expect(summary.excluded).toEqual({ transport: 800, stays: 0, activities: 0, total: 800 });
        expect(summary.included).toEqual({ transport: 400, stays: 300, activities: 120, total: 820 });
        expect(summary.gross.total).toBe(1620);

        // Samer: 200 (flight) + 150 (hotel) + 120 (activity) = 470; Maya: 200 (flight) + 150 (hotel) + 0 (activity) = 350
        const samer = summary.byPerson.find(p => p.id === 'u1')!;
        const maya = summary.byPerson.find(p => p.id === 'c_partner')!;
        const acme = summary.byPerson.find(p => p.id === 'c_employer')!;
        expect(samer.shareIncluded).toBe(470);
        expect(samer.paidIncluded).toBe(520);
        expect(maya.shareIncluded).toBe(350);
        expect(maya.paidIncluded).toBe(300);
        expect(acme.paidExcluded).toBe(800);
        expect(acme.isPayerOnly).toBe(true);

        // Downstream analytics helpers agree on personal cost totals
        expect(costSplit(trip)).toEqual({ transport: 400, stays: 300, activities: 120, total: 820 });
        expect(tripCost(trip)).toBe(820);

        const axis = ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'];
        const spend = spendSeries([trip], axis);
        const totalOnAxis = spend.data.reduce((sum, d) => sum + d.parts.reduce((a, b) => a + b, 0), 0);
        expect(totalOnAxis).toBe(820);

        const records: JourneyRecord[] = (trip.transports || []).map(flight => ({ flight, trip }));
        expect(journeyTotals(records).cost).toBe(400);
        expect(totalsByYear(records)[0].cost).toBe(400);
        expect(passengersOf(records[0])).toEqual(['u1']);
        expect(passengersOf(records[1])).toEqual(['u1', 'c_partner']);
        expect(byPassenger(records, (id, t) => personName(id, t, [userMe])).map(r => [r.label, r.count])).toEqual([
            ['Samer', 2],
            ['Maya', 1],
        ]);
    });

    it('includes non-account companions in Expenses and excludes employer-paid expenses from personal totals', () => {
        const trip = makeTrip({ companions: [partner, employer] });
        const members = ledgerMembersFor(trip, [userMe]);
        expect(members.map(m => m.id)).toEqual(['u1', 'c_partner', 'c_employer']);

        const expList: Expense[] = [
            {
                id: 'e1', date: '2026-11-20', title: 'Flight', category: 'Transport',
                amount: 800, currency: 'EUR', rate: 1, paidBy: 'c_employer',
                split: { mode: 'equal', among: ['u1'] },
            },
            {
                id: 'e2', date: '2026-11-21', title: 'Dinner', category: 'Food',
                amount: 100, currency: 'EUR', rate: 1, paidBy: 'c_partner',
                split: { mode: 'equal', among: ['u1', 'c_partner'] },
            },
        ];

        const personal = includedExpenses(expList, trip);
        expect(personal.map(e => e.id)).toEqual(['e2']);
        expect(totals(personal).cents).toBe(10000);

        const bal = balances(personal, ['u1', 'c_partner']);
        expect(settle(bal)).toEqual([{ from: 'u1', to: 'c_partner', cents: 5000 }]);
    });
});

describe('TripSheet and CostsPanel UI integration', () => {
    const origMatchMedia = window.matchMedia;
    const origResizeObserver = globalThis.ResizeObserver;

    beforeEach(() => {
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
        window.matchMedia = origMatchMedia;
        globalThis.ResizeObserver = origResizeObserver;
    });

    it('lets the user pick Business classification, add Employer + Partner without accounts, and exclude employer-paid flight cost', async () => {
        const onSave = vi.fn<(draft: TripDraft, trip?: Trip) => Promise<void>>(async () => undefined);
        const { unmount } = mount(React.createElement(TripSheet, {
            target: {
                kind: 'create',
                bucket: 'planned',
                prefill: { name: 'Berlin Summit', destination: 'Berlin, Germany', startDate: '2026-12-01', endDate: '2026-12-03' },
            },
            trips: [],
            users: [userMe],
            entitlements: [],
            currentUserId: 'u1',
            onClose: vi.fn(),
            onSave,
            onDelete: vi.fn(),
            onOpenTrip: vi.fn(),
        }));

        // Select Business classification
        const bizChip = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Business');
        expect(bizChip).toBeTruthy();
        act(() => { bizChip!.click(); });

        // Add non-account companion: Employer
        const addCompanionBtn = () => Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.includes('Add person or payer'));
        act(() => { addCompanionBtn()!.click(); });
        const compInput = () => document.body.querySelector('input[placeholder="Sarah, Mom or Employer"]') as HTMLInputElement;
        act(() => { setNativeValue(compInput(), 'Acme Corp'); });
        const employerRoleChip = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Employer');
        act(() => { employerRoleChip!.click(); });
        const confirmAddComp = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Add');
        act(() => { confirmAddComp!.click(); });

        // Add non-account companion: Partner
        act(() => { addCompanionBtn()!.click(); });
        act(() => { setNativeValue(compInput(), 'Maya'); });
        const partnerRoleChip = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Partner');
        act(() => { partnerRoleChip!.click(); });
        const confirmAddComp2 = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Add');
        act(() => { confirmAddComp2!.click(); });

        expect(document.body.textContent).toContain('Acme Corp');
        expect(document.body.textContent).toContain('Maya');

        // Step 1 -> Step 2 (Transport)
        const next1 = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.includes('Next'));
        act(() => { next1!.click(); });

        // Fill flight origin, destination, cost, untick Maya from this flight, and mark Paid by Acme Corp
        const allPlaceInputs = Array.from(document.body.querySelectorAll('input[placeholder="Airport or city (AMS)"]')) as HTMLInputElement[];
        expect(allPlaceInputs.length).toBe(2);
        const fromInput = allPlaceInputs[0];
        act(() => {
            setNativeValue(fromInput, 'BEY');
            setNativeValue(allPlaceInputs[1], 'BER');
        });
        const costInput = document.body.querySelector('input[placeholder="0"]') as HTMLInputElement;
        act(() => { setNativeValue(costInput, '650'); });

        // Who's flying should have Samer & Maya (NOT Acme Corp since Employer is payer-only)
        const whoFlyingGroup = document.body.querySelector('[aria-label="Who\'s flying"]')!;
        expect(whoFlyingGroup.textContent).toContain('Samer');
        expect(whoFlyingGroup.textContent).toContain('Maya');
        expect(whoFlyingGroup.textContent).not.toContain('Acme Corp');

        // Untick Maya on this flight
        const mayaFlyChip = Array.from(whoFlyingGroup.querySelectorAll('button')).find(b => b.textContent?.includes('Maya'));
        act(() => { mayaFlyChip!.click(); });

        // Paid by Acme Corp (auto-excludes from personal analytics)
        const paidByGroup = document.body.querySelector('[aria-label="Paid by"]')!;
        const acmePayChip = Array.from(paidByGroup.querySelectorAll('button')).find(b => b.textContent?.includes('Acme Corp'));
        act(() => { acmePayChip!.click(); });

        // Advance to Step 3 (Stays) and create trip
        const next2 = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.includes('Next'));
        act(() => { next2!.click(); });
        const createBtn = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent?.includes('Create trip'));
        await act(async () => { createBtn!.click(); });

        expect(onSave).toHaveBeenCalledTimes(1);
        const [savedDraft] = onSave.mock.calls[0];
        expect(savedDraft.classification).toBe('Business');
        expect(savedDraft.companions).toHaveLength(2);
        expect(savedDraft.transports).toHaveLength(1);
        expect(savedDraft.transports?.[0]).toMatchObject({
            origin: 'BEY',
            destination: 'BER',
            cost: 650,
            passengers: ['u1'],
        });
        expect(savedDraft.transports?.[0].paidBy).toBe(savedDraft.companions?.[0].id);
        expect(isCostExcluded(savedDraft.transports?.[0], { excludeCostsFromAnalytics: savedDraft.excludeCostsFromAnalytics, companions: savedDraft.companions })).toBe(true);

        unmount();
    });

    it('renders excluded totals and per-person breakdown in CostsPanel', () => {
        const trip = makeTrip({
            classification: 'Business',
            companions: [partner, employer],
            transports: [{
                id: 'f1', itineraryId: 'i1', type: 'One-Way', mode: 'Flight', provider: 'LH', identifier: 'LH1',
                confirmationCode: '', origin: 'BEY', destination: 'BER', departureDate: '2026-12-01',
                departureTime: '08:00', arrivalDate: '2026-12-01', arrivalTime: '11:00',
                cost: 650, paidBy: 'c_employer', passengers: ['u1'],
            }],
            activities: [{
                id: 'a1', date: '2026-12-02', time: '19:00', title: 'Museum', cost: 40, paidBy: 'u1', participants: ['u1'],
            }],
        });

        const { container, unmount } = mount(React.createElement(CostsPanel, {
            trip,
            members: 2,
            users: [userMe],
            onSaveBudget: vi.fn(),
        }));

        expect(container.textContent).toContain('Personal total');
        expect(container.textContent).toContain('excluded from analytics');
        expect(container.textContent).toContain('Cost by person');
        expect(container.textContent).toContain('Acme Corp');
        expect(container.textContent).toContain('Maya');
        unmount();
    });
});
