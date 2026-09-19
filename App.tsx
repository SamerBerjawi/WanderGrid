
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Sidebar } from './components/Sidebar';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { ViewState, User } from './types';
import { dataService } from './services/mockDb';
import { motion, AnimatePresence } from 'motion/react';
import { IconContext } from '@phosphor-icons/react';

// Lazy load views to split the bundle and improve performance
const Dashboard = lazy(() => import('./views/Dashboard').then(m => ({ default: m.Dashboard })));
const Settings = lazy(() => import('./views/Settings').then(m => ({ default: m.Settings })));
const UserDetail = lazy(() => import('./views/UserDetail').then(m => ({ default: m.UserDetail })));
const PlannerView = lazy(() => import('./views/PlannerView').then(m => ({ default: m.PlannerView })));
const VacationPlanner = lazy(() => import('./views/VacationPlanner').then(m => ({ default: m.VacationPlanner })));
const TripDetail = lazy(() => import('./views/TripDetail').then(m => ({ default: m.TripDetail })));
const ExpeditionMapView = lazy(() => import('./views/ExpeditionMapView').then(m => ({ default: m.ExpeditionMapView })));
const Flights = lazy(() => import('./views/Flights').then(m => ({ default: m.Flights })));
const RoadTrips = lazy(() => import('./views/RoadTrips').then(m => ({ default: m.RoadTrips })));
const TravelAtlas = lazy(() => import('./views/TravelAtlas').then(m => ({ default: m.TravelAtlas })));
const VacationCalendar = lazy(() => import('./views/VacationCalendar').then(m => ({ default: m.VacationCalendar })));
const Auth = lazy(() => import('./views/Auth').then(m => ({ default: m.Auth })));

const getUrlState = () => {
    try {
        const path = window.location.pathname;
        if (path === '/settings') return { view: ViewState.SETTINGS };
        if (path === '/planner') return { view: ViewState.PLANNER };
        if (path === '/planner-2' || path === '/planner2') return { view: ViewState.PLANNER_2 };
        if (path === '/map') return { view: ViewState.MAP };
        if (path === '/gamification') return { view: ViewState.DASHBOARD };
        if (path === '/flights') return { view: ViewState.FLIGHTS };
        if (path === '/roadtrips') return { view: ViewState.ROADTRIPS };
        if (path === '/atlas' || path === '/travel-atlas') return { view: ViewState.TRAVEL_ATLAS };
        if (path === '/calendar' || path === '/vacation-calendar') return { view: ViewState.VACATION_CALENDAR };
        
        const userMatch = path.match(/^\/user\/([^/]+)$/);
        if (userMatch) return { view: ViewState.USER_DETAIL, userId: userMatch[1] };

        const tripMatch = path.match(/^\/trip\/([^/]+)$/);
        if (tripMatch) return { view: ViewState.TRIP_DETAIL, tripId: tripMatch[1] };
    } catch (e) {
        console.warn("Failed to parse URL state", e);
    }

    return { view: ViewState.DASHBOARD };
};

// Beautiful loading state for lazy components
const ViewLoader = () => (
    <div className="w-full h-full flex flex-col items-center justify-center space-y-4 animate-fade-in">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Loading Module...</p>
    </div>
);

import { AmbientBackground } from './components/AmbientBackground';
import { getPageTheme } from './config/pageThemes';

export default function App() {
  const initialState = getUrlState();
  const [view, setView] = useState<ViewState>(initialState.view);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(initialState.userId || null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(initialState.tripId || null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>('dark');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);

  // Handle URL Navigation (Push State)
  const navigate = (newView: ViewState, id?: string) => {
      let path = '/';
      switch(newView) {
          case ViewState.SETTINGS: path = '/settings'; break;
          case ViewState.PLANNER: path = '/planner'; break;
          case ViewState.PLANNER_2: path = '/planner-2'; break;
          case ViewState.MAP: path = '/map'; break;
          case ViewState.GAMIFICATION: path = '/gamification'; break;
          case ViewState.FLIGHTS: path = '/flights'; break;
          case ViewState.ROADTRIPS: path = '/roadtrips'; break;
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
      if (settings?.theme) setTheme(settings.theme);
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
    const storedUserStr = localStorage.getItem('wandergrid_session_user');
    if (storedUserStr) {
        try {
            const parsedUser = JSON.parse(storedUserStr);
            dataService.getUsers().then(users => {
                const matched = users.find(u => u.id === parsedUser.id || u.email?.toLowerCase() === parsedUser.email?.toLowerCase());
                if (matched) {
                    setCurrentUser(matched);
                    localStorage.setItem('wandergrid_session_user', JSON.stringify(matched));
                } else {
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

        // Update meta theme-color for iOS / Android PWA status bar
        const metaThemeColor = document.getElementById('theme-color-meta');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', isDark ? '#050505' : '#FAFAFA');
        }
    };
    
    applyTheme(theme);

    if (theme === 'auto') {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = () => applyTheme('auto');
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [theme]);

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'auto') => {
      setTheme(newTheme);
      dataService.getWorkspaceSettings().then(s => {
          dataService.updateWorkspaceSettings({ ...s, theme: newTheme });
      });
  };

  const handleLogin = (user: User) => {
      setCurrentUser(user);
      localStorage.setItem('wandergrid_session_user', JSON.stringify(user));
  };

  const handleLogout = () => {
      setCurrentUser(null);
      localStorage.removeItem('wandergrid_session_user');
      localStorage.removeItem('wandergrid_session_token');
      navigate(ViewState.DASHBOARD);
  };

  useEffect(() => {
    const handleUnauthorized = () => {
        handleLogout();
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

  const renderView = () => {
    switch (view) {
      case ViewState.DASHBOARD:
        return <Dashboard onUserClick={handleUserClick} onTripClick={handleTripClick} />;
      case ViewState.SETTINGS:
        return <Settings onThemeChange={setTheme} />;
      case ViewState.USER_DETAIL:
        return <UserDetail userId={selectedUserId!} onBack={() => navigate(ViewState.DASHBOARD)} onLogout={handleLogout} />;
      case ViewState.PLANNER:
        return <PlannerView onTripClick={handleTripClick} />;
      case ViewState.PLANNER_2:
        return <VacationPlanner onTripClick={handleTripClick} />;
      case ViewState.TRIP_DETAIL:
        return <TripDetail tripId={selectedTripId!} onBack={() => navigate(ViewState.DASHBOARD)} />;
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
        <div className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-indigo-50/50 via-slate-100/60 to-blue-50/50 dark:from-slate-950 dark:via-slate-900/90 dark:to-indigo-950/95 transition-colors duration-500 text-gray-900 dark:text-gray-100 relative">
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute -top-40 -left-40 w-[550px] h-[550px] rounded-full bg-blue-500/2 dark:bg-blue-600/3 blur-[120px] animate-[pulse_10s_infinite]" />
                <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-purple-500/2 dark:bg-purple-600/3 blur-[130px] animate-[pulse_14s_infinite] delay-1000" />
            </div>
            <div className="w-full h-full relative z-10 flex items-center justify-center">
                <ViewLoader />
            </div>
        </div>
      );
  }

  if (!currentUser) {
      return (
        <div className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-indigo-50/50 via-slate-100/60 to-blue-50/50 dark:from-slate-950 dark:via-slate-900/90 dark:to-indigo-950/95 transition-colors duration-500 text-gray-900 dark:text-gray-100 relative">
            {/* Pulsing ambient spots */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute -top-40 -left-40 w-[550px] h-[550px] rounded-full bg-blue-500/2 dark:bg-blue-600/3 blur-[120px] animate-[pulse_10s_infinite]" />
                <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-purple-500/2 dark:bg-purple-600/3 blur-[130px] animate-[pulse_14s_infinite] delay-1000" />
            </div>
            <div className="w-full h-full relative z-10">
                <Suspense fallback={<ViewLoader />}>
                    <Auth onLogin={handleLogin} />
                </Suspense>
            </div>
        </div>
      );
  }

  const isDarkMode = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <IconContext.Provider value={{ weight: 'duotone' }}>
      <div className="flex h-screen w-full overflow-hidden bg-[#FAFAFA] dark:bg-[#050505] transition-colors duration-700 text-light-text dark:text-dark-text relative">
        {/* Dynamic Ambient Background Glow representing current page theme */}
        <AmbientBackground 
          theme={getPageTheme(view)} 
          darkMode={isDarkMode} 
        />
        <Sidebar 
          currentView={view} 
          onNavigate={(v, id) => navigate(v, id)} 
          theme={theme}
          onThemeToggle={handleThemeChange}
          onLogout={handleLogout}
          currentUser={currentUser}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />
        <main className={`flex-1 h-full relative z-10 transition-all duration-300 ${
          view === ViewState.MAP 
            ? 'p-0 overflow-hidden' 
            : `px-2 sm:px-4 md:px-8 pt-2 sm:pt-4 pb-28 md:pb-8 overflow-y-auto custom-scrollbar ${isSidebarCollapsed ? 'md:pl-28' : 'md:pl-80'}`
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
              <Suspense fallback={<ViewLoader />}>
                <AppErrorBoundary routeKey={routeKey} onResetToDashboard={() => navigate(ViewState.DASHBOARD)}>
                  {renderView()}
                </AppErrorBoundary>
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </IconContext.Provider>
  );
}
