import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dataService } from '../../services/mockDb';

// Reads of one collection that overlap share a single request (audit F-08).
const api = dataService as any;

describe('dataService reads', () => {
  let calls: string[];
  beforeEach(() => {
    calls = [];
    api._useApi = true;
    api.inflightReads.clear();
    vi.stubGlobal('fetch', undefined);
    window.fetch = vi.fn(async (url: any, init?: any) => {
      calls.push(`${init?.method || 'GET'} ${url}`);
      await Promise.resolve();
      return new Response(JSON.stringify([{ id: 't1' }]), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as any;
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('sends one request for overlapping reads and gives each caller its own copy', async () => {
    const [a, b] = await Promise.all([api.fetch('/visited'), api.fetch('/visited')]);
    expect(calls.filter(c => c === 'GET /api/visited')).toHaveLength(1);
    a.push({ id: 'extra' });
    expect(b).toHaveLength(1);
  });

  it('reads again once the first read has finished', async () => {
    await api.fetch('/visited');
    await api.fetch('/visited');
    expect(calls.filter(c => c === 'GET /api/visited')).toHaveLength(2);
  });

  it('does not reuse a read that started before a write', async () => {
    const first = api.fetch('/visited');
    const write = api.fetch('/visited', { method: 'PUT', body: '{}' });
    const second = api.fetch('/visited');
    await Promise.all([first, write, second]);
    expect(calls.filter(c => c === 'GET /api/visited')).toHaveLength(2);
  });
});
