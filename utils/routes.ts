/**
 * The app's route table as pure functions (UI_UX_DESIGN_REFERENCE.md §5.0).
 *
 * The redesigned pages own the clean paths (`/`, `/trips`, `/flights`, ...). Old `-new` URLs, the
 * retired `-2` aliases and the removed `/classic/...` prefix keep resolving; aliases also say which
 * canonical path to replace themselves with.
 */

/** The prefix the removed original interface lived under (the git tag `classic-final` has it). */
const REMOVED_CLASSIC_PREFIX = '/classic';

export type NewPage = 'dashboard' | 'trips' | 'trip' | 'flights' | 'roadtrips' | 'map' | 'atlas' | 'calendar' | 'member' | 'settings' | 'notfound';

export type Route = { page: NewPage; id?: string; redirectTo: string | null };

/** Canonical paths, used by every link in the New pages and shell. */
export const PATHS = {
    home: '/',
    dashboard: '/dashboard',
    trips: '/trips',
    flights: '/flights',
    roadtrips: '/roadtrips',
    calendar: '/calendar',
    atlas: '/atlas',
    map: '/map',
    settings: '/settings',
    trip: (id: string) => `/trip/${encodeURIComponent(id)}`,
    member: (id: string) => `/user/${encodeURIComponent(id)}`,
} as const;

// Ids in URLs may arrive percent-encoded (e.g. `@` as %40 from mail/chat apps).
const safeDecode = (value: string) => {
    try { return decodeURIComponent(value); } catch { return value; }
};

/** Static paths of the New pages: the page, and where a non-canonical alias should be replaced to. */
const NEW_STATIC: Record<string, { page: NewPage; to?: string }> = {
    '/': { page: 'dashboard' },
    '/dashboard': { page: 'dashboard' },
    '/gamification': { page: 'dashboard' },
    '/dashboard-new': { page: 'dashboard', to: '/dashboard' },
    // The sign-in screen is not a page: signed out, any path shows it in place; signed in, it is home.
    '/auth': { page: 'dashboard', to: '/' },
    '/auth-new': { page: 'dashboard', to: '/' },
    '/planner': { page: 'trips' },
    '/planner-2': { page: 'trips' },
    '/planner2': { page: 'trips' },
    '/trips': { page: 'trips' },
    '/trips-new': { page: 'trips', to: '/trips' },
    '/flights': { page: 'flights' },
    '/flights-2': { page: 'flights' },
    '/flights2': { page: 'flights' },
    '/flights-new': { page: 'flights', to: '/flights' },
    '/roadtrips': { page: 'roadtrips' },
    '/roadtrips-2': { page: 'roadtrips' },
    '/roadtrips2': { page: 'roadtrips' },
    '/roadtrips-new': { page: 'roadtrips', to: '/roadtrips' },
    '/map': { page: 'map' },
    '/map-new': { page: 'map', to: '/map' },
    '/atlas': { page: 'atlas' },
    '/travel-atlas': { page: 'atlas' },
    '/atlas-new': { page: 'atlas', to: '/atlas' },
    '/calendar': { page: 'calendar' },
    '/vacation-calendar': { page: 'calendar' },
    '/calendar-new': { page: 'calendar', to: '/calendar' },
    '/settings': { page: 'settings' },
    '/settings-new': { page: 'settings', to: '/settings' },
};

/** `?view=` links of the old app (`/?view=settings`) still open the matching page. */
const QUERY_VIEW: Record<string, string> = {
    settings: '/settings', planner: '/planner', 'planner-2': '/planner', map: '/map', gamification: '/dashboard',
    flights: '/flights', 'flights-2': '/flights', roadtrips: '/roadtrips', 'roadtrips-2': '/roadtrips', atlas: '/atlas', calendar: '/calendar',
};

const TRIP_PATH = /^\/trip(-2|-new)?\/([^/]+)$/;
const MEMBER_PATH = /^\/(user|member|member-new)\/([^/]+)$/;

const normalise = (pathname: string) => (pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname) || '/';

const withSearch = (path: string, search: string) => (search && search !== '?' ? `${path}${search.startsWith('?') ? search : `?${search}`}` : path);

/** Which page a location shows, and the canonical URL to replace it with when it is an alias. */
export const resolveRoute = (pathname: string, search = ''): Route => {
    const path = normalise(pathname);

    // Bookmarks of the removed original interface: drop the prefix and land on the same page (or home).
    if (path === REMOVED_CLASSIC_PREFIX || path.startsWith(`${REMOVED_CLASSIC_PREFIX}/`)) {
        const rest = path.slice(REMOVED_CLASSIC_PREFIX.length) || '/';
        const target = resolveRoute(rest, search);
        return { ...target, redirectTo: target.page === 'notfound' ? '/' : target.redirectTo ?? withSearch(rest, search) };
    }

    const known = NEW_STATIC[path];
    if (known) {
        // The old `?view=x` form only counts at the root (`/?view=settings`).
        if (path === '/') {
            const q = new URLSearchParams(search).get('view');
            const target = q ? QUERY_VIEW[q] : undefined;
            if (target) {
                const params = new URLSearchParams(search);
                params.delete('view');
                const rest = params.toString();
                return { ...resolveRoute(target), redirectTo: withSearch(target, rest ? `?${rest}` : '') } as Route;
            }
        }
        return { page: known.page, redirectTo: known.to && known.to !== path ? withSearch(known.to, search) : null };
    }

    const trip = path.match(TRIP_PATH);
    if (trip) return { page: 'trip', id: safeDecode(trip[2]), redirectTo: trip[1] === '-new' ? withSearch(`/trip/${trip[2]}`, search) : null };

    const member = path.match(MEMBER_PATH);
    if (member) return { page: 'member', id: safeDecode(member[2]), redirectTo: member[1] === 'member-new' ? withSearch(`/user/${member[2]}`, search) : null };

    return { page: 'notfound', redirectTo: null };
};

/** The shell tab that is current on a page ('' when the page has no tab: Settings, a member, not found). */
export const navPathFor = (page: NewPage): string => {
    switch (page) {
        case 'dashboard': return PATHS.dashboard;
        case 'trips': case 'trip': return PATHS.trips;
        case 'flights': case 'roadtrips': return PATHS.flights;
        case 'calendar': return PATHS.calendar;
        case 'atlas': return PATHS.atlas;
        case 'map': return PATHS.map;
        default: return '';
    }
};
