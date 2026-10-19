
import { isFeatureEnabled } from './config/featureFlags';
import { getUiTheme } from './config/uiTheme';
import { goldenViews } from './views/golden/registry';
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { ViewState, User } from './types';
import { dataService } from './services/mockDb';
import { motion, AnimatePresence } from 'motion/react';
import { IconContext } from '@/components/ui/hugeicons';

// Lazy load views to split the bundle and improve performance
const Dashboard = lazy(() => import('./views/Dashboard').then(m => ({ default: m.Dashboard })));
const Settings = lazy(() => import('./views/Settings').then(m => ({ default: m.Settings })));
const UserDetail = lazy(() => import('./views/UserDetail').then(m => ({ default: m.UserDetail })));
const PlannerView = lazy(() => import('./views/PlannerView').then(m => ({ default: m.PlannerView })));
const TripDetail = lazy(() => import('./views/TripDetail').then(m => ({ default: m.TripDetail })));
const ExpeditionMapView = lazy(() => import('./views/ExpeditionMapView').then(m => ({ default: m.ExpeditionMapView })));
const Flights = lazy(() => import('./views/Flights').then(m => ({ default: m.Flights })));
const RoadTrips = lazy(() => import('./views/RoadTrips').then(m => ({ default: m.RoadTrips })));
const TravelAtlas = lazy(() => import('./views/TravelAtlas').then(m => ({ default: m.TravelAtlas })));
const VacationCalendar = lazy(() => import('./views/VacationCalendar').then(m => ({ default: m.VacationCalendar })));
// Signed-out visitors always need the sign-in screen: start fetching it immediately instead of after
// the app shell has rendered (removes one round trip from the login page's LCP).
const loadAuth = () => import('./views/Auth');
try { if (!localStorage.getItem('wandergrid_session_token')) void loadAuth(); } catch (e) {}
const Auth = lazy(() => loadAuth().then(m => ({ default: m.Auth })));
// The navigation shell (and most of its icon set) is only needed after sign-in; keep it off the login page's
// critical path (PERF-001/005).
const Sidebar = lazy(() => import('./components/Sidebar').then(m => ({ default: m.Sidebar })));
const GoldenSidebar = lazy(() => import('./components/golden/GoldenSidebar').then(m => ({ default: m.GoldenSidebar })));
// Redesigned pages (UI_UX_DESIGN_REFERENCE.md §5.0): reached only at their own `-new` URLs, inside ShellNew.
const ShellNew = lazy(() => import('./components/new/ShellNew').then(m => ({ default: m.ShellNew })));
const MapNew = lazy(() => import('./views/new/MapNew').then(m => ({ default: m.MapNew })));
const AtlasNew = lazy(() => import('./views/new/AtlasNew').then(m => ({ default: m.AtlasNew })));
const TripsNew = lazy(() => import('./views/new/TripsNew').then(m => ({ default: m.TripsNew })));
type NewPage = 'map' | 'atlas' | 'trips';
const NEW_PAGES: Record<string, NewPage> = { '/map-new': 'map', '/atlas-new': 'atlas', '/trips-new': 'trips' };
const getNewPage = (): NewPage | null => {
    try { return NEW_PAGES[window.location.pathname] ?? null; } catch (e) { return null; }
};

import { PWAInstallBanner } from './components/PWAInstallBanner';
import { Toaster } from './components/Toaster';
import { ConfirmHost } from './components/ConfirmHost';
import { toast, errorMessage } from './services/toast';

// Ids in URLs may arrive percent-encoded (e.g. `@` as %40 from mail/chat apps).
const safeDecode = (value: string) => {
    try { return decodeURIComponent(value); } catch (e) { return value; }
};

const getUrlState = () => {
    try {
        const path = window.location.pathname;
        const search = new URLSearchParams(window.location.search);
        const queryView = search.get('view');

        if (path === '/settings' || queryView === 'settings') return { view: ViewState.SETTINGS };
        // Planner-2 was removed; its old URLs open the Planner.
        if (path === '/planner' || path === '/planner-2' || path === '/planner2' || queryView === 'planner' || queryView === 'planner-2') return { view: ViewState.PLANNER };
        if (path === '/map' || queryView === 'map') return { view: ViewState.MAP };
        if (path === '/gamification' || queryView === 'gamification') return { view: ViewState.DASHBOARD };
        // Legacy "-2" URLs of the retired duplicate views resolve to the main pages.
        if (path === '/flights' || path === '/flights-2' || path === '/flights2' || queryView === 'flights' || queryView === 'flights-2') return { view: ViewState.FLIGHTS };
        if (path === '/roadtrips' || path === '/roadtrips-2' || path === '/roadtrips2' || queryView === 'roadtrips' || queryView === 'roadtrips-2') return { view: ViewState.ROADTRIPS };
        if (path === '/atlas' || path === '/travel-atlas' || queryView === 'atlas') return { view: ViewState.TRAVEL_ATLAS };
        if (path === '/calendar' || path === '/vacation-calendar' || queryView === 'calendar') return { view: ViewState.VACATION_CALENDAR };
        
        const userMatch = path.match(/^\/user\/([^/]+)$/);
        if (userMatch) return { view: ViewState.USER_DETAIL, userId: safeDecode(userMatch[1]) };

        const tripMatch = path.match(/^\/trip(?:-2)?\/([^/]+)$/);
        if (tripMatch) return { view: ViewState.TRIP_DETAIL, tripId: safeDecode(tripMatch[1]) };
    } catch (e) {
        console.warn("Failed to parse URL state", e);
    }

    return { view: ViewState.DASHBOARD };
};

import ViewSkeleton from './components/skeletons/ViewSkeleton';

// Content-shaped Liquid Glass skeleton fallback for lazy components
const ViewLoader: React.FC<{ view?: ViewState | string }> = ({ view = 'dashboard' }) => (
    <ViewSkeleton view={view} />
);

import { AmbientBackground } from './components/AmbientBackground';
import { getPageTheme } from './config/pageThemes';

export default function App() {
  const initialState = getUrlState();
  const [view, setView] = useState<ViewState>(initialState.view);
  const [newPage, setNewPage] = useState<NewPage | null>(getNewPage);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(initialState.userId || null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(initialState.tripId || null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>('dark');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);

  // Handle URL Navigation (Push State)
  const navigate = (newView: ViewState, id?: string) => {
      setNewPage(null);
      let path = '/';
      switch(newView) {
          case ViewState.SETTINGS: path = '/settings'; break;
          case ViewState.PLANNER: path = '/planner'; break;
          case ViewState.MAP: path = '/map'; break;
          case ViewState.GAMIFICATION: path = '/gamification'; break;
          case ViewState.FLIGHTS: path = '/flights'; break;
          case ViewState.ROADTRIPS: path = '/roadtrips'; break;
          case ViewState.TRAVEL_ATLAS: path = '/atlas'; break;
          case ViewState.VACATION_CALENDAR: path = '/calendar'; break;
          case ViewState.USER_DETAIL: path = id ? `/user/${id}` : '/'; break;
          case ViewState.TRIP_DETAIL: path = id ? `/trip/${id}` : '/'; break;
          case ViewState.DASHBOARD: 
          default: path = '/'; break;
      }
      
      try {
          if (window.location.pathname !== path) {
              window.history.pushState({}, '', path);
          }
      } catch (e) {
          console.debug("URL update blocked by environment.");
      }
      
      setView(newView);
      if (newView === ViewState.USER_DETAIL && id) setSelectedUserId(id);
      if (newView === ViewState.TRIP_DETAIL && id) setSelectedTripId(id);
  };

  useEffect(() => {
      const handlePopState = () => {
          setNewPage(getNewPage());
          const state = getUrlState();
          setView(state.view);
          if (state.userId) setSelectedUserId(state.userId);
          if (state.tripId) setSelectedTripId(state.tripId);
      };
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
        root.classList.toggle('theme-golden', isFeatureEnabled('UI_GOLDEN_HOUR'));
        root.classList.toggle('theme-board', getUiTheme() === 'board');

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
      if (!options?.keepLocation) navigate(ViewState.DASHBOARD);
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
        handleLogout({ keepLocation: true });
    };
    window.addEventListener('wandergrid-unauthorized', handleUnauthorized);
    window.addEventListener('wandergrid:unauthorized', handleUnauthorized);
    return () => {
        window.removeEventListener('wandergrid-unauthorized', handleUnauthorized);
        window.removeEventListener('wandergrid:unauthorized', handleUnauthorized);
    };
  }, []);

  const handleUserClick = (userId: string) => {
      navigate(ViewState.USER_DETAIL, userId);
  };

  const handleTripClick = (tripId: string) => {
      if (tripId && tripId.startsWith('independent-flight-')) {
          navigate(ViewState.FLIGHTS);
      } else {
          navigate(ViewState.TRIP_DETAIL, tripId);
      }
  };

  const getStableRouteKey = () => {
    switch (view) {
      case ViewState.USER_DETAIL:
        return `view-user-${selectedUserId || 'none'}`;
      case ViewState.TRIP_DETAIL:
        return `view-trip-${selectedTripId || 'none'}`;
      default:
        return `view-${view}`;
    }
  };

  const routeKey = getStableRouteKey();

  const NavSidebar = isFeatureEnabled('UI_GOLDEN_HOUR') ? GoldenSidebar : Sidebar;

  const renderView = () => {
    const Golden = isFeatureEnabled('UI_GOLDEN_HOUR') ? goldenViews[view] : undefined;
    if (Golden) {
      return (
        <Golden
          onUserClick={handleUserClick}
          onTripClick={handleTripClick}
          onBack={() => navigate(view === ViewState.TRIP_DETAIL ? ViewState.PLANNER : ViewState.DASHBOARD)}
          onLogout={() => handleLogout()}
          onThemeChange={applyPersonalTheme}
          userId={selectedUserId ?? undefined}
          tripId={selectedTripId ?? undefined}
          isSidebarCollapsed={isSidebarCollapsed}
        />
      );
    }
    switch (view) {
      case ViewState.DASHBOARD:
        return <Dashboard onUserClick={handleUserClick} onTripClick={handleTripClick} />;
      case ViewState.SETTINGS:
        return <Settings onThemeChange={applyPersonalTheme} />;
      case ViewState.USER_DETAIL:
        return <UserDetail userId={selectedUserId!} onBack={() => navigate(ViewState.DASHBOARD)} onLogout={() => handleLogout()} />;
      case ViewState.PLANNER:
        return <PlannerView onTripClick={handleTripClick} />;
      case ViewState.TRIP_DETAIL:
        return <TripDetail tripId={selectedTripId!} onBack={() => navigate(ViewState.PLANNER)} />;
      case ViewState.MAP:
        return <ExpeditionMapView onTripClick={handleTripClick} isSidebarCollapsed={isSidebarCollapsed} />;
      case ViewState.GAMIFICATION:
        return <Dashboard onUserClick={handleUserClick} onTripClick={handleTripClick} />;
      case ViewState.FLIGHTS:
        return <Flights onTripClick={handleTripClick} />;
      case ViewState.ROADTRIPS:
        return <RoadTrips onTripClick={handleTripClick} />;
      case ViewState.TRAVEL_ATLAS:
        return <TravelAtlas onTripClick={handleTripClick} />;
      case ViewState.VACATION_CALENDAR:
        return <VacationCalendar onTripClick={handleTripClick} />;
      default:
        return <Dashboard onUserClick={handleUserClick} onTripClick={handleTripClick} />;
    }
  };

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

  if (!currentUser) {
      return (
        <div className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-indigo-50/50 via-slate-100/60 to-blue-50/50 dark:from-slate-950 dark:via-slate-900/90 dark:to-indigo-950/95 transition-colors duration-500 text-gray-900 dark:text-gray-100 relative safe-top safe-bottom safe-x">
            {/* Pulsing ambient spots */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute -top-40 -left-40 w-[550px] h-[550px] rounded-full bg-blue-500/2 dark:bg-blue-600/3 blur-[120px] animate-[pulse_10s_infinite]" />
                <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-purple-500/2 dark:bg-purple-600/3 blur-[130px] animate-[pulse_14s_infinite] delay-1000" />
            </div>
            <div className="w-full h-full relative z-raised">
                <Suspense fallback={<ViewLoader />}>
                    <Auth onLogin={handleLogin} />
                </Suspense>
            </div>
        </div>
      );
  }

  const isDarkMode = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Links from the New shell: another New page stays in the shell; anything else opens the current page.
  const navigateFromShell = (path: string) => {
      try { if (window.location.pathname !== path) window.history.pushState({}, '', path); } catch (e) {}
      const next = getNewPage();
      setNewPage(next);
      if (!next) {
          const state = getUrlState();
          setView(state.view);
          if (state.userId) setSelectedUserId(state.userId);
          if (state.tripId) setSelectedTripId(state.tripId);
      }
  };

  if (newPage) {
      return (
        <Suspense fallback={null}>
          <ShellNew
            currentPath={window.location.pathname}
            onNavigate={navigateFromShell}
            user={currentUser}
            isDark={isDarkMode}
            onThemeChange={t => handleThemeChange(t)}
            onLogout={() => handleLogout()}
            localMode={!dataService.isDatabaseMode()}
            fullBleed={newPage === 'map'}
            hideBrandOnMobile={newPage === 'map'}
          >
            <AppErrorBoundary routeKey={`new-${newPage}`} onResetToDashboard={() => navigate(ViewState.DASHBOARD)}>
              <Suspense fallback={null}>
                {newPage === 'map' ? <MapNew onTripClick={handleTripClick} isSidebarCollapsed={isSidebarCollapsed} onThemeChange={t => handleThemeChange(t)} /> : null}
                {newPage === 'atlas' ? <AtlasNew onTripClick={handleTripClick} /> : null}
                {newPage === 'trips' ? <TripsNew onTripClick={handleTripClick} /> : null}
              </Suspense>
            </AppErrorBoundary>
          </ShellNew>
          <Toaster />
          <ConfirmHost />
        </Suspense>
      );
  }

  return (
    <IconContext.Provider value={{ weight: 'duotone' }}>
      <div className="flex h-screen w-full overflow-hidden bg-light-bg dark:bg-dark-bg transition-colors duration-700 text-light-text dark:text-dark-text relative safe-x">
        {/* Dynamic Ambient Background Glow representing current page theme */}
        <AmbientBackground 
          theme={getPageTheme(view)} 
          darkMode={isDarkMode} 
        />
        <Suspense fallback={null}>
        <NavSidebar 
          currentView={view} 
          onNavigate={(v, id) => navigate(v, id)} 
          theme={theme}
          onThemeToggle={handleThemeChange}
          onLogout={() => handleLogout()}
          currentUser={currentUser}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />
        </Suspense>
        <main className={`flex-1 h-full relative z-raised transition-all duration-300 ${
          view === ViewState.MAP 
            ? 'p-0 overflow-hidden' 
            : `px-2 sm:px-4 md:px-8 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] sm:pt-4 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] md:pb-8 overflow-y-auto custom-scrollbar ${isSidebarCollapsed ? 'md:pl-28' : 'md:pl-80'}`
        }`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={routeKey}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="w-full h-full"
            >
              <Suspense fallback={<ViewLoader view={view} />}>
                <AppErrorBoundary routeKey={routeKey} onResetToDashboard={() => navigate(ViewState.DASHBOARD)}>
                  {renderView()}
                </AppErrorBoundary>
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
        <PWAInstallBanner />
        <Toaster />
        <ConfirmHost />
        {!dataService.isDatabaseMode() && (
          <div className="fixed top-safe-offset right-3 z-toast px-3 py-1.5 rounded-full bg-amber-500 text-black text-xs font-bold shadow-lg pointer-events-none" role="status">
            Local mode · data stays in this browser
          </div>
        )}
      </div>
    </IconContext.Provider>
  );
}
