import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const answer = (status: string) => new Response(JSON.stringify({ results: { ferry: { status } } }), { headers: { 'Content-Type': 'application/json' } });
const coords: [number, number][] = [[4, 50], [5, 51]];

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('mapped ferry recovery', () => {
    it.each(['network', 'http', 'provider', 'json'])('retries after a transient %s failure', async kind => {
        const fetch = vi.fn().mockImplementationOnce(() => {
            if (kind === 'network') return Promise.reject(new TypeError('offline'));
            if (kind === 'http') return Promise.resolve(new Response('', { status: 503 }));
            if (kind === 'json') return Promise.resolve(new Response('broken-json'));
            return Promise.resolve(answer('error'));
        }).mockResolvedValue(answer('none'));
        vi.stubGlobal('fetch', fetch);
        const { fetchFerryLine } = await import('../../services/ferryLines');
        expect((await fetchFerryLine(coords)).status).toBe('error');
        expect((await fetchFerryLine(coords)).status).toBe('none');
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('coalesces identical requests and retains authoritative no-ferry answers', async () => {
        const fetch = vi.fn().mockImplementation(async () => answer('none'));
        vi.stubGlobal('fetch', fetch);
        const { fetchFerryLine } = await import('../../services/ferryLines');
        const [a, b] = await Promise.all([fetchFerryLine(coords), fetchFerryLine(coords)]);
        expect(a.status).toBe('none');
        expect(b).toBe(a);
        expect((await fetchFerryLine(coords)).status).toBe('none');
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('aborts a stalled request and allows retry', async () => {
        vi.useFakeTimers();
        const fetch = vi.fn().mockImplementationOnce((_url, { signal }) => new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        })).mockResolvedValue(answer('none'));
        vi.stubGlobal('fetch', fetch);
        const { fetchFerryLine } = await import('../../services/ferryLines');
        const first = fetchFerryLine(coords);
        await vi.advanceTimersByTimeAsync(15_000);
        expect((await first).status).toBe('error');
        expect((await fetchFerryLine(coords)).status).toBe('none');
    });
});
