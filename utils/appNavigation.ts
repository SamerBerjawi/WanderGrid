/**
 * Opens a page of the app in place: pushes the path and lets App.tsx re-read the location (it listens for
 * popstate), so the shell, the Suspense boundary and the scroll position are not torn down.
 */
export const openPage = (path: string) => {
    try {
        if (`${window.location.pathname}${window.location.search}` !== path) window.history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
    } catch {
        window.location.assign(path);
    }
};
