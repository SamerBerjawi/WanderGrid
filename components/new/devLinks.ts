/**
 * Dev-only links to the New pages (UI_UX_DESIGN_REFERENCE.md §5.0). Production builds keep the rule
 * that nothing in the existing UI links to a `-new` page until it is approved.
 */
export const SHOW_NEW_PAGE_LINKS = import.meta.env.DEV;

export const NEW_PAGE_LINKS = [
    { path: '/map-new', label: 'Map (new)', short: 'Map new', icon: 'public' },
    { path: '/atlas-new', label: 'Atlas (new)', short: 'Atlas new', icon: 'explore' },
    { path: '/trips-new', label: 'Trips (new)', short: 'Trips new', icon: 'luggage' },
    { path: '/dashboard-new', label: 'Dashboard (new)', short: 'Dashboard new', icon: 'dashboard' },
] as const;

/** Opens a New page in place: App.tsx listens for popstate and renders it inside ShellNew. */
export const openNewPage = (path: string) => {
    try {
        if (window.location.pathname !== path) window.history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
    } catch {
        window.location.assign(path);
    }
};
