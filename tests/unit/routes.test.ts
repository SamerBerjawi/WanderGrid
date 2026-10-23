import { describe, expect, it } from 'vitest';
import { navPathFor, PATHS, resolveRoute } from '../../utils/routes';

const page = (path: string, search = '') => resolveRoute(path, search);

describe('canonical paths open the New pages', () => {
    it.each([
        ['/', 'dashboard'], ['/dashboard', 'dashboard'], ['/planner', 'trips'], ['/trips', 'trips'],
        ['/flights', 'flights'], ['/roadtrips', 'roadtrips'], ['/map', 'map'], ['/atlas', 'atlas'], ['/travel-atlas', 'atlas'],
        ['/calendar', 'calendar'], ['/vacation-calendar', 'calendar'], ['/settings', 'settings'],
    ])('%s -> %s without a redirect', (path, expected) => {
        const r = page(path);
        expect(r.page).toBe(expected);
        expect(r.redirectTo).toBeNull();
    });

    it('opens one trip and one member, decoding the id', () => {
        expect(page('/trip/abc')).toMatchObject({ page: 'trip', id: 'abc', redirectTo: null });
        expect(page('/trip/a%40b')).toMatchObject({ page: 'trip', id: 'a@b' });
        expect(page('/user/u1')).toMatchObject({ page: 'member', id: 'u1', redirectTo: null });
        expect(page('/member/u1')).toMatchObject({ page: 'member', id: 'u1', redirectTo: null });
    });

    it('ignores a trailing slash', () => {
        expect(page('/flights/')).toMatchObject({ page: 'flights', redirectTo: null });
    });
});

describe('legacy aliases keep resolving', () => {
    it.each([['/flights-2', 'flights'], ['/flights2', 'flights'], ['/planner-2', 'trips'], ['/planner2', 'trips'], ['/roadtrips-2', 'roadtrips']])('%s', (path, expected) => {
        expect(page(path).page).toBe(expected);
    });
    it('/trip-2/:id opens the trip', () => {
        expect(page('/trip-2/abc')).toMatchObject({ page: 'trip', id: 'abc' });
    });
    it('old ?view= links at the root open the page and replace the URL', () => {
        expect(page('/', '?view=settings')).toMatchObject({ page: 'settings', redirectTo: '/settings' });
        expect(page('/', '?view=flights-2&x=1')).toMatchObject({ page: 'flights', redirectTo: '/flights?x=1' });
    });
});

describe('-new URLs redirect to their canonical path', () => {
    it.each([
        ['/dashboard-new', '/dashboard'], ['/trips-new', '/trips'], ['/flights-new', '/flights'], ['/roadtrips-new', '/roadtrips'],
        ['/map-new', '/map'], ['/atlas-new', '/atlas'], ['/calendar-new', '/calendar'], ['/settings-new', '/settings'], ['/auth-new', '/'], ['/auth', '/'],
    ])('%s -> %s', (path, to) => {
        expect(page(path).redirectTo).toBe(to);
    });
    it('keeps the query string', () => {
        expect(page('/trips-new', '?new=1').redirectTo).toBe('/trips?new=1');
        expect(page('/map-new', '?route=JFK-CDG').redirectTo).toBe('/map?route=JFK-CDG');
    });
    it('redirects trip and member ids without re-encoding them', () => {
        expect(page('/trip-new/a%40b')).toMatchObject({ id: 'a@b', redirectTo: '/trip/a%40b' });
        expect(page('/member-new/u1')).toMatchObject({ page: 'member', id: 'u1', redirectTo: '/user/u1' });
    });
});

describe('the removed /classic prefix redirects to the page', () => {
    it.each([
        ['/classic', 'dashboard', '/'], ['/classic/planner', 'trips', '/planner'], ['/classic/flights', 'flights', '/flights'],
        ['/classic/atlas', 'atlas', '/atlas'], ['/classic/settings', 'settings', '/settings'], ['/classic/map', 'map', '/map'],
    ])('%s', (path, expected, to) => {
        expect(page(path)).toMatchObject({ page: expected, redirectTo: to });
    });
    it('keeps ids and the query string', () => {
        expect(page('/classic/trip/abc')).toMatchObject({ page: 'trip', id: 'abc', redirectTo: '/trip/abc' });
        expect(page('/classic/user/u1', '?x=1')).toMatchObject({ page: 'member', id: 'u1', redirectTo: '/user/u1?x=1' });
    });
    it('sends an unknown classic path home', () => {
        expect(page('/classic/nope').redirectTo).toBe('/');
    });
    it('resolves the canonical target of an alias too', () => {
        expect(page('/classic/trips-new').redirectTo).toBe('/trips');
    });
    it('does not match a path that only starts with the word', () => {
        expect(page('/classics')).toMatchObject({ page: 'notfound', redirectTo: null });
    });
});

describe('unknown paths and helpers', () => {
    it('shows the not-found page, not the dashboard', () => {
        expect(page('/nope').page).toBe('notfound');
        expect(page('/trip/a/b').page).toBe('notfound');
    });
    it('the shell tab follows the page', () => {
        expect(navPathFor('trip')).toBe(PATHS.trips);
        expect(navPathFor('roadtrips')).toBe(PATHS.flights);
        expect(navPathFor('settings')).toBe('');
        expect(navPathFor('dashboard')).toBe(PATHS.dashboard);
    });
});
