import { ViewState } from '../types';

/**
 * The app's route table as pure functions (UI_UX_DESIGN_REFERENCE.md §5.0).
 *
 * The redesigned ("New") pages own the clean paths (`/`, `/trips`, `/flights`, ...). The original
 * pages and their shell are kept under the `/classic` prefix. Old `-new` URLs and the retired `-2`
 * aliases keep resolving; `-new` ones also say which canonical path to replace themselves with.
 */

export const CLASSIC_PREFIX = '/classic';

export type NewPage = 'dashboard' | 'trips' | 'trip' | 'flights' | 'roadtrips' | 'map' | 'atlas' | 'calendar' | 'member' | 'settings' | 'notfound';

export type Route =
    | { shell: 'new'; page: NewPage; id?: string; redirectTo: string | null }
    | { shell: 'classic'; view: ViewState; userId?: string; tripId?: string; redirectTo: null };

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

/** The old pages' own path table (what `/classic/<path>` resolves). Unknown paths open the old Dashboard. */
const resolveClassic = (rest: string, search: string): Route => {
    const params = new URLSearchParams(search);
    const q = params.get('view');
    const path = rest || '/';
    if (path === '/settings' || q === 'settings') return { shell: 'classic', view: ViewState.SETTINGS, redirectTo: null };
    if (path === '/planner' || path === '/planner-2' || path === '/planner2' || path === '/trips' || q === 'planner' || q === 'planner-2') return { shell: 'classic', view: ViewState.PLANNER, redirectTo: null };
    if (path === '/map' || q === 'map') return { shell: 'classic', view: ViewState.MAP, redirectTo: null };
    if (path === '/gamification' || q === 'gamification') return { shell: 'classic', view: ViewState.DASHBOARD, redirectTo: null };
    if (path === '/flights' || path === '/flights-2' || path === '/flights2' || q === 'flights' || q === 'flights-2') return { shell: 'classic', view: ViewState.FLIGHTS, redirectTo: null };
    if (path === '/roadtrips' || path === '/roadtrips-2' || path === '/roadtrips2' || q === 'roadtrips' || q === 'roadtrips-2') return { shell: 'classic', view: ViewState.ROADTRIPS, redirectTo: null };
    if (path === '/atlas' || path === '/travel-atlas' || q === 'atlas') return { shell: 'classic', view: ViewState.TRAVEL_ATLAS, redirectTo: null };
    if (path === '/calendar' || path === '/vacation-calendar' || q === 'calendar') return { shell: 'classic', view: ViewState.VACATION_CALENDAR, redirectTo: null };
    const user = path.match(/^\/(?:user|member)\/([^/]+)$/);
    if (user) return { shell: 'classic', view: ViewState.USER_DETAIL, userId: safeDecode(user[1]), redirectTo: null };
    const trip = path.match(/^\/trip(?:-2)?\/([^/]+)$/);
    if (trip) return { shell: 'classic', view: ViewState.TRIP_DETAIL, tripId: safeDecode(trip[1]), redirectTo: null };
    return { shell: 'classic', view: ViewState.DASHBOARD, redirectTo: null };
};

/** Which page (and shell) a location shows, and the canonical URL to replace it with when it is an alias. */
export const resolveRoute = (pathname: string, search = ''): Route => {
    const path = normalise(pathname);

    if (path === CLASSIC_PREFIX || path.startsWith(`${CLASSIC_PREFIX}/`)) return resolveClassic(path.slice(CLASSIC_PREFIX.length), search);

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
        return { shell: 'new', page: known.page, redirectTo: known.to && known.to !== path ? withSearch(known.to, search) : null };
    }

    const trip = path.match(TRIP_PATH);
    if (trip) return { shell: 'new', page: 'trip', id: safeDecode(trip[2]), redirectTo: trip[1] === '-new' ? withSearch(`/trip/${trip[2]}`, search) : null };

    const member = path.match(MEMBER_PATH);
    if (member) return { shell: 'new', page: 'member', id: safeDecode(member[2]), redirectTo: member[1] === 'member-new' ? withSearch(`/user/${member[2]}`, search) : null };

    return { shell: 'new', page: 'notfound', redirectTo: null };
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

/** Path of an old page under `/classic` (the old app's own navigation uses this). */
export const classicPathFor = (view: ViewState, id?: string): string => {
    switch (view) {
        case ViewState.SETTINGS: return `${CLASSIC_PREFIX}/settings`;
        case ViewState.PLANNER: return `${CLASSIC_PREFIX}/planner`;
        case ViewState.MAP: return `${CLASSIC_PREFIX}/map`;
        case ViewState.GAMIFICATION: return `${CLASSIC_PREFIX}/gamification`;
        case ViewState.FLIGHTS: return `${CLASSIC_PREFIX}/flights`;
        case ViewState.ROADTRIPS: return `${CLASSIC_PREFIX}/roadtrips`;
        case ViewState.TRAVEL_ATLAS: return `${CLASSIC_PREFIX}/atlas`;
        case ViewState.VACATION_CALENDAR: return `${CLASSIC_PREFIX}/calendar`;
        case ViewState.USER_DETAIL: return id ? `${CLASSIC_PREFIX}/user/${encodeURIComponent(id)}` : CLASSIC_PREFIX;
        case ViewState.TRIP_DETAIL: return id ? `${CLASSIC_PREFIX}/trip/${encodeURIComponent(id)}` : CLASSIC_PREFIX;
        default: return CLASSIC_PREFIX;
    }
};

/** The two deliberate ways into the old interface (decision 200). */
export const CLASSIC_HOME = CLASSIC_PREFIX;
export const classicTripPath = (id: string) => classicPathFor(ViewState.TRIP_DETAIL, id);
