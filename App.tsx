
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { User } from './types';
import { resolveRoute, navPathFor, PATHS, type Route } from './utils/routes';
import { dataService } from './services/mockDb';

// Lazy load views to split the bundle and improve performance
// Pages (UI_UX_DESIGN_REFERENCE.md §5.0), inside ShellNew. Signed-out visitors always need the sign-in
// screen: start fetching it immediately instead of after the app shell has rendered (removes one round trip
// from the login page's LCP).
const ShellNew = lazy(() => import('./components/new/ShellNew').then(m => ({ default: m.ShellNew })));
const MapNew = lazy(() => import('./views/new/MapNew').then(m => ({ default: m.MapNew })));
const AtlasNew = lazy(() => import('./views/new/AtlasNew').then(m => ({ default: m.AtlasNew })));
const TripsNew = lazy(() => import('./views/new/TripsNew').then(m => ({ default: m.TripsNew })));
const TripNew = lazy(() => import('./views/new/TripNew').then(m => ({ default: m.TripNew })));
const DashboardNew = lazy(() => import('./views/new/DashboardNew').then(m => ({ default: m.DashboardNew })));
const FlightsNew = lazy(() => import('./views/new/FlightsNew').then(m => ({ default: m.FlightsNew })));
const RoadTripsNew = lazy(() => import('./views/new/RoadTripsNew').then(m => ({ default: m.RoadTripsNew })));
const CalendarNew = lazy(() => import('./views/new/CalendarNew').then(m => ({ default: m.CalendarNew })));
const MemberNew = lazy(() => import('./views/new/MemberNew').then(m => ({ default: m.MemberNew })));
const SettingsNew = lazy(() => import('./views/new/SettingsNew').then(m => ({ default: m.SettingsNew })));
const loadAuth = () => import('./views/new/AuthNew');
try { if (!localStorage.getItem('wandergrid_session_token')) void loadAuth(); } catch (e) {}
const AuthNew = lazy(() => loadAuth().then(m => ({ default: m.AuthNew })));
const NotFoundNew = lazy(() => import('./components/new/NotFoundNew').then(m => ({ default: m.NotFoundNew })));

import { PWAInstallBanner } from './components/PWAInstallBanner';
import { Toaster } from './components/Toaster';
import { ConfirmHost } from './components/ConfirmHost';
import { toast, errorMessage } from './services/toast';

/** Reads the current location. An alias (`-new`, `?view=`) is replaced by its canonical URL right away. */
const readRoute = (): Route => {
    try {
        const route = resolveRoute(window.location.pathname, window.location.search);
        if (route.redirectTo) {
            window.history.replaceState(window.history.state, '', `${route.redirectTo}${window.location.hash}`);
            return resolveRoute(window.location.pathname, window.location.search);
        }
        return route;
    } catch (e) {
        console.warn('Failed to parse URL state', e);
        return { page: 'dashboard', redirectTo: null };
    }
};

import ViewSkeleton from './components/skeletons/ViewSkeleton';

// Content-shaped New-style skeleton fallback for lazy components
const ViewLoader: React.FC<{ view?: string; fullScreen?: boolean }> = ({ view = 'dashboard', fullScreen }) => (
    <ViewSkeleton view={view} fullScreen={fullScreen} />
);

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>('dark');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);

  // Every in-app link goes through here: push the path (once), then re-read the location, which also
  // replaces an alias such as a `-new` URL with its canonical path.
  const navigateTo = (path: string) => {
      try {
          if (`${window.location.pathname}${window.location.search}` !== path) window.history.pushState({}, '', path);
      } catch (e) {
          console.debug("URL update blocked by environment.");
      }
      setRoute(readRoute());
  };

  useEffect(() => {
      const handlePopState = () => setRoute(readRoute());
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const applySettings = (settings: any) => {
      let personal: string | null = null;
      try { personal = localStorage.getItem('wandergrid_theme_preference'); } catch (e) {}
      if (personal === 'light' || personal === 'dark' || personal === 'auto') setTheme(personal);
      else if (settings?.theme) setTheme(settings.theme);
    };

    dataService.getWorkspaceSettings().then(applySettings).catch(err => {
      console.warn("Failed to load workspace settings:", err);
    });

    const handleSettingsUpdated = (e: any) => {
      if (e?.detail) applySettings(e.detail);
    };

    window.addEventListener('wandergrid_settings_updated', handleSettingsUpdated);
    return () => window.removeEventListener('wandergrid_settings_updated', handleSettingsUpdated);
  }, []);
    
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1' && !localStorage.getItem('wandergrid_session_user')) {
      const demoUser = { id: 'admin-auto', name: 'Admin User', email: 'admin@wandergrid.app', role: 'Admin' as const };
      localStorage.setItem('wandergrid_session_user', JSON.stringify(demoUser));
      setCurrentUser(demoUser as any);
      setIsAuthReady(true);
      return;
    }
    const storedUserStr = localStorage.getItem('wandergrid_session_user');
    if (storedUserStr) {
        try {
            const parsedUser = JSON.parse(storedUserStr);
            dataService.getSessionUser(parsedUser).then(matched => {
                if (matched) {
                    setCurrentUser(matched);
                    localStorage.setItem('wandergrid_session_user', JSON.stringify(matched));
                } else {
                    // The account is gone or the session was revoked: sign out (never switch identity).
                    setCurrentUser(null);
                    localStorage.removeItem('wandergrid_session_user');
                    localStorage.removeItem('wandergrid_session_token');
                }
                setIsAuthReady(true);
            }).catch(err => {
                console.warn("Roster validation offline, logging in from cache:", err);
                setCurrentUser(parsedUser);
                setIsAuthReady(true);
            });
        } catch (e) {
            localStorage.removeItem('wandergrid_session_user');
            localStorage.removeItem('wandergrid_session_token');
            setIsAuthReady(true);
        }
    } else {
        setIsAuthReady(true);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (currentTheme: 'light' | 'dark' | 'auto') => {
        let isDark = false;
        if (currentTheme === 'dark') {
            isDark = true;
        } else if (currentTheme === 'light') {
            isDark = false;
        } else {
            isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        root.classList.toggle('dark', isDark);
        // A Golden Hour / Departure Board choice stored by the removed interface is ignored; drop its classes.
        root.classList.remove('theme-golden', 'theme-board');

        // Update meta theme-color for iOS / Android PWA status bar
        const metaThemeColor = document.getElementById('theme-color-meta');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', isDark ? '#050505' : '#FAFAFA');
        }
        document.querySelectorAll('meta[name="theme-color"]').forEach(el => {
            el.setAttribute('content', isDark ? '#050505' : '#FAFAFA');
        });
    };
    
    applyTheme(theme);

    if (theme === 'auto') {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = () => applyTheme('auto');
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [theme]);

  // The workspace theme is an admin setting; other users keep their choice in this browser only.
  // A personal preference wins over the workspace theme on load, so every explicit choice must update it too;
  // otherwise a stale preference (for example the dark one the Board theme sets) overrides later toggles.
  const applyPersonalTheme = (newTheme: 'light' | 'dark' | 'auto') => {
      setTheme(newTheme);
      try { localStorage.setItem('wandergrid_theme_preference', newTheme); } catch (e) {}
  };

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'auto') => {
      applyPersonalTheme(newTheme);
      if (currentUser?.role !== 'Admin') return;
      dataService.updateWorkspaceSettings({ theme: newTheme }).catch(err => {
          toast.error(`Couldn't save the theme: ${errorMessage(err)}`);
      });
  };

  const handleLogin = (user: User) => {
      setCurrentUser(user);
      localStorage.setItem('wandergrid_session_user', JSON.stringify(user));
  };

  // Explicit sign-out returns to the Dashboard; an expired/invalid session keeps the current URL so
  // signing in again lands on the page the user was trying to open.
  const handleLogout = (options?: { keepLocation?: boolean }) => {
      void dataService.logout(); // reads the token synchronously before it is cleared below
      setCurrentUser(null);
      localStorage.removeItem('wandergrid_session_user');
      localStorage.removeItem('wandergrid_session_token');
      if (!options?.keepLocation) navigateTo(PATHS.home);
  };

  // Async failures in event handlers bypass error boundaries; surface them instead of failing silently.
  useEffect(() => {
    const onUnhandled = (event: PromiseRejectionEvent) => {
      const reason: any = event.reason;
      if (reason?.name === 'AbortError' || reason?.status === 401) return; // aborted requests / sign-out flow
      console.error('Unhandled async error:', reason);
      toast.error(errorMessage(reason, 'Something went wrong. Please try again.'));
    };
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => window.removeEventListener('unhandledrejection', onUnhandled);
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
        toast.info('Your session ended. Sign in again to continue.', { key: 'session-ended' });
        handleLogout({ keepLocation: true });
    };
    window.addEventListener('wandergrid-unauthorized', handleUnauthorized);
    window.addEventListener('wandergrid:unauthorized', handleUnauthorized);
    return () => {
        window.removeEventListener('wandergrid-unauthorized', handleUnauthorized);
        window.removeEventListener('wandergrid:unauthorized', handleUnauthorized);
    };
  }, []);

  // A trip opens on its page; a flight that belongs to no trip goes to Flights.
  const openTripNew = (id: string) => navigateTo(id.startsWith('independent-flight-') ? PATHS.flights : PATHS.trip(id));
  const openMemberNew = (id: string) => navigateTo(PATHS.member(id));

  if (!isAuthReady) {
      return (
        <div className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-indigo-50/50 via-slate-100/60 to-blue-50/50 dark:from-slate-950 dark:via-slate-900/90 dark:to-indigo-950/95 transition-colors duration-500 text-gray-900 dark:text-gray-100 relative safe-top safe-bottom safe-x">
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute -top-40 -left-40 w-[550px] h-[550px] rounded-full bg-blue-500/2 dark:bg-blue-600/3 blur-[120px] animate-[pulse_10s_infinite]" />
                <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-purple-500/2 dark:bg-purple-600/3 blur-[130px] animate-[pulse_14s_infinite] delay-1000" />
            </div>
            <div className="w-full h-full relative z-raised flex items-center justify-center">
                <ViewLoader />
            </div>
        </div>
      );
  }

  // Signed out: AuthNew in place on any URL, so a deep link survives signing in.
  if (!currentUser) {
      return (
        <Suspense fallback={<ViewLoader fullScreen />}>
          <AuthNew
            preview={false}
            isDark={theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)}
            onThemeChange={t => handleThemeChange(t)}
            onClosePreview={() => undefined}
            onLogin={handleLogin}
          />
          <Toaster />
          <ConfirmHost />
        </Suspense>
      );
  }

  const isDarkMode = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const page = route.page;
  return (
        <Suspense fallback={<ViewLoader view={page} fullScreen />}>
          <ShellNew
            currentPath={navPathFor(page)}
            onNavigate={navigateTo}
            user={currentUser}
            isDark={isDarkMode}
            onThemeChange={t => handleThemeChange(t)}
            onLogout={() => handleLogout()}
            localMode={!dataService.isDatabaseMode()}
            fullBleed={page === 'map'}
            hideBrandOnMobile={page === 'map'}
          >
            <AppErrorBoundary routeKey={`new-${page}-${route.id ?? ''}`} onResetToDashboard={() => navigateTo(PATHS.home)}>
              <Suspense fallback={<ViewLoader view={page} />}>
                {page === 'map' ? <MapNew onTripClick={openTripNew} onThemeChange={t => handleThemeChange(t)} /> : null}
                {page === 'atlas' ? <AtlasNew onTripClick={openTripNew} /> : null}
                {page === 'trips' ? <TripsNew onTripClick={openTripNew} /> : null}
                {page === 'dashboard' ? <DashboardNew onTripClick={openTripNew} onMemberClick={openMemberNew} /> : null}
                {page === 'flights' ? <FlightsNew onTripClick={openTripNew} /> : null}
                {page === 'roadtrips' ? <RoadTripsNew onTripClick={openTripNew} /> : null}
                {page === 'settings' ? <SettingsNew theme={theme} isDark={isDarkMode} onThemeChange={t => handleThemeChange(t)} onOpenMember={openMemberNew} onNavigate={navigateTo} /> : null}
                {page === 'calendar' ? <CalendarNew onTripClick={openTripNew} onMemberClick={openMemberNew} /> : null}
                {page === 'member' && route.id ? (
                  <MemberNew
                    key={route.id}
                    memberId={route.id}
                    onBack={() => (window.history.length > 1 ? window.history.back() : navigateTo(PATHS.trips))}
                    onOpenTrip={openTripNew}
                    onLogout={() => handleLogout()}
                  />
                ) : null}
                {page === 'trip' && route.id ? (
                  <TripNew key={route.id} tripId={route.id} onOpenMember={openMemberNew} onBack={() => navigateTo(PATHS.trips)} />
                ) : null}
                {page === 'notfound' ? <NotFoundNew onHome={() => navigateTo(PATHS.home)} /> : null}
              </Suspense>
            </AppErrorBoundary>
          </ShellNew>
          <PWAInstallBanner />
          <Toaster />
          <ConfirmHost />
        </Suspense>
  );
}
