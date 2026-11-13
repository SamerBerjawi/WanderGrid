import { describe, it, expect } from 'vitest';
import { fetchSeaRoute } from '../../services/maritimeRouting';

// Without a mapped ferry line a sea leg must follow a shipping lane, not the straight-ish curve that cuts across land.
// searoute-js rejected the 'km' units the call used to pass, so every leg silently took that curve.
describe('sea routes without a ferry line', () => {
  it('goes round the toe of Italy from Civitavecchia to Piraeus', async () => {
    const route = await fetchSeaRoute(42.094, 11.795, 37.94, 23.64);
    expect(route).not.toBeNull();
    // The Strait of Messina lies between 38.0 and 38.5 N and 15.5 and 15.8 E; the old curve ran far north of it, over land.
    const nearMessina = route!.some(([lng, lat]) => lat > 37.9 && lat < 38.6 && lng > 15.3 && lng < 15.9);
    expect(nearMessina).toBe(true);
  });

  it('still ends at the stated ports', async () => {
    const route = (await fetchSeaRoute(41.352, 2.167, 42.094, 11.795))!;
    expect(route[0].slice(0, 2)).toEqual([2.167, 41.352]);
    expect(route[route.length - 1].slice(0, 2)).toEqual([11.795, 42.094]);
  });

  it('does not send Helsinki to Tallinn out past Åland and back', async () => {
    const route = (await fetchSeaRoute(60.1699, 24.9684, 59.437, 24.7536))!;
    // The Marnet graph has no link across the gulf; the route must stay in it (east of 23.5 E).
    expect(route.every(([lng]) => lng > 23.5)).toBe(true);
  });
});
