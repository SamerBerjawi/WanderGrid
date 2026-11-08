import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/mockDb', () => ({ dataService: { isDatabaseMode: () => false } }));

import { fromFrankfurter, getRate, isFresh, rateKey } from '../../services/fxRates';

const answer = (status: number, body: unknown) => ({ status, json: async () => body }) as Response;

describe('rates from Frankfurter', () => {
    it('reads an answer and rejects the unusable', () => {
        expect(fromFrankfurter({ date: '2027-03-05', rates: { USD: 1.0821 } }, 'usd')).toEqual({ rate: 1.0821, date: '2027-03-05' });
        expect(fromFrankfurter({ date: '2027-03-05', rates: { USD: 0 } }, 'USD')).toBeNull();
        expect(fromFrankfurter({ rates: { USD: 1.1 } }, 'USD')).toBeNull();
        expect(fromFrankfurter(null, 'USD')).toBeNull();
    });

    it('keeps a past day for ever and today for six hours', () => {
        const entry = { rate: 1.1, date: '2027-03-05', at: 1_000 };
        expect(isFresh(entry, '2027-03-05', '2027-03-06', 9_999_999_999)).toBe(true);
        expect(isFresh(entry, '2027-03-06', '2027-03-06', 1_000 + 5 * 3_600_000)).toBe(true);
        expect(isFresh(entry, '2027-03-06', '2027-03-06', 1_000 + 7 * 3_600_000)).toBe(false);
        expect(rateKey('2027-03-05', 'EUR', 'USD')).toBe('2027-03-05|EUR|USD');
    });
});

describe('getRate', () => {
    beforeEach(() => { localStorage.clear(); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('is 1 for the same currency, without asking', async () => {
        const f = vi.spyOn(globalThis, 'fetch');
        expect(await getRate('2026-03-05', 'eur', 'EUR')).toEqual({ rate: 1, date: '2026-03-05' });
        expect(f).not.toHaveBeenCalled();
    });

    it('asks for the day, then answers a past day from the cache', async () => {
        const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(answer(200, { base: 'EUR', date: '2026-03-05', rates: { USD: 1.09 } }));
        expect(await getRate('2026-03-05', 'EUR', 'USD')).toEqual({ rate: 1.09, date: '2026-03-05' });
        expect(String(f.mock.calls[0][0])).toBe('https://api.frankfurter.dev/v1/2026-03-05?base=EUR&symbols=USD');
        expect(await getRate('2026-03-05', 'eur', 'usd')).toEqual({ rate: 1.09, date: '2026-03-05' });
        expect(f).toHaveBeenCalledTimes(1);
    });

    it('uses the latest rate for a day that has not come', async () => {
        const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(answer(200, { base: 'EUR', date: '2026-11-06', rates: { GBP: 0.87 } }));
        const r = await getRate('2099-01-01', 'EUR', 'GBP');
        expect(r.rate).toBe(0.87);
        expect(String(f.mock.calls[0][0])).toMatch(/\/latest\?base=EUR&symbols=GBP$/);
    });

    it('says what to do when there is no rate or no connection', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(answer(404, { message: 'not found' }));
        await expect(getRate('2026-03-05', 'EUR', 'XYZ')).rejects.toThrow(/Enter one by hand/);
        vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
        await expect(getRate('2026-03-06', 'EUR', 'USD')).rejects.toThrow(/could not be reached/);
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(answer(200, { hello: 'world' }));
        await expect(getRate('2026-03-07', 'EUR', 'USD')).rejects.toThrow(/No rate came back/);
    });
});
