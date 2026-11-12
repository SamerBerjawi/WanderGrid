import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dataService } from '../../services/mockDb';

// Workspace settings are served from a short-lived copy so each page change does not refetch them (audit F-08).
const api = dataService as any;

describe('dataService workspace settings', () => {
  let calls: string[];
  let remote: Record<string, unknown>;
  beforeEach(() => {
    calls = [];
    remote = { defaultStartingAirport: 'BRU' };
    api._useApi = true;
    api.inflightReads.clear();
    api.settingsCache = null;
    vi.useFakeTimers({ toFake: ['Date'] });
    window.fetch = vi.fn(async (url: any, init?: any) => {
      const method = init?.method || 'GET';
      calls.push(`${method} ${url}`);
      if (method === 'PATCH') remote = { ...remote, ...JSON.parse(init.body) };
      return new Response(JSON.stringify(remote), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as any;
  });
  afterEach(() => { vi.useRealTimers(); });
  const reads = () => calls.filter(c => c === 'GET /api/settings').length;

  it('fetches once for repeated reads and hands each caller its own copy', async () => {
    const a = await api.getWorkspaceSettings();
    const b = await api.getWorkspaceSettings();
    expect(reads()).toBe(1);
    a.defaultStartingAirport = 'XXX';
    expect(b.defaultStartingAirport).toBe('BRU');
    expect((await api.getWorkspaceSettings()).defaultStartingAirport).toBe('BRU');
  });

  it('asks again after the copy has expired', async () => {
    await api.getWorkspaceSettings();
    vi.setSystemTime(Date.now() + 31_000);
    await api.getWorkspaceSettings();
    expect(reads()).toBe(2);
  });

  it('shows a saved change at once without another read', async () => {
    await api.getWorkspaceSettings();
    await api.updateWorkspaceSettings({ defaultStartingAirport: 'LIS' });
    expect((await api.getWorkspaceSettings()).defaultStartingAirport).toBe('LIS');
    expect(reads()).toBe(1);
  });

  it('drops the copy on sign-out so the next person never sees it', async () => {
    await api.getWorkspaceSettings();
    await api.logout();
    await api.getWorkspaceSettings();
    expect(reads()).toBe(2);
  });
});
