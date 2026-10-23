import { describe, expect, it } from 'vitest';
import { ViewState } from '../../types';
import { classicPathFor, classicTripPath, navPathFor, PATHS, resolveRoute } from '../../utils/routes';

const page = (path: string, search = '') => {
    const r = resolveRoute(path, search);
    if (r.shell !== 'new') throw new Error(`${path} is not a New page`);
    return r;
};

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

describe('/classic keeps the original pages', () => {
    it('opens the old views', () => {
        expect(resolveRoute('/classic')).toMatchObject({ shell: 'classic', view: ViewState.DASHBOARD });
        expect(resolveRoute('/classic/planner')).toMatchObject({ shell: 'classic', view: ViewState.PLANNER });
        expect(resolveRoute('/classic/flights')).toMatchObject({ shell: 'classic', view: ViewState.FLIGHTS });
        expect(resolveRoute('/classic/roadtrips')).toMatchObject({ shell: 'classic', view: ViewState.ROADTRIPS });
        expect(resolveRoute('/classic/atlas')).toMatchObject({ shell: 'classic', view: ViewState.TRAVEL_ATLAS });
        expect(resolveRoute('/classic/settings')).toMatchObject({ shell: 'classic', view: ViewState.SETTINGS });
        expect(resolveRoute('/classic/trip/abc')).toMatchObject({ shell: 'classic', view: ViewState.TRIP_DETAIL, tripId: 'abc' });
        expect(resolveRoute('/classic/user/u1')).toMatchObject({ shell: 'classic', view: ViewState.USER_DETAIL, userId: 'u1' });
    });
    it('never redirects and falls back to the old Dashboard', () => {
        expect(resolveRoute('/classic/nope').redirectTo).toBeNull();
        expect(resolveRoute('/classic/nope')).toMatchObject({ shell: 'classic', view: ViewState.DASHBOARD });
    });
    it('does not match a path that only starts with the word', () => {
        expect(page('/classics')).toMatchObject({ page: 'notfound' });
    });
    it('builds /classic paths', () => {
        expect(classicPathFor(ViewState.FLIGHTS)).toBe('/classic/flights');
        expect(classicPathFor(ViewState.DASHBOARD)).toBe('/classic');
        expect(classicTripPath('a b')).toBe('/classic/trip/a%20b');
        expect(resolveRoute(classicTripPath('a b'))).toMatchObject({ view: ViewState.TRIP_DETAIL, tripId: 'a b' });
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
