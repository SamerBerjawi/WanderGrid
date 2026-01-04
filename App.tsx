
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Sidebar } from './components/Sidebar';
import { ViewState, User } from './types';
import { dataService } from './services/mockDb';

// Lazy load views to split the bundle and improve performance
const Dashboard = lazy(() => import('./views/Dashboard').then(m => ({ default: m.Dashboard })));
const Settings = lazy(() => import('./views/Settings').then(m => ({ default: m.Settings })));
const TimeOff = lazy(() => import('./views/TimeOff').then(m => ({ default: m.TimeOff })));
const UserDetail = lazy(() => import('./views/UserDetail').then(m => ({ default: m.UserDetail })));
const VacationPlanner = lazy(() => import('./views/VacationPlanner').then(m => ({ default: m.VacationPlanner })));
const TripDetail = lazy(() => import('./views/TripDetail').then(m => ({ default: m.TripDetail })));
const ExpeditionMapView = lazy(() => import('./views/ExpeditionMapView').then(m => ({ default: m.ExpeditionMapView })));
const Gamification = lazy(() => import('./views/Gamification').then(m => ({ default: m.Gamification })));
const Auth = lazy(() => import('./views/Auth').then(m => ({ default: m.Auth })));

const getUrlState = () => {
    try {
        const path = window.location.pathname;
        if (path === '/settings') return { view: ViewState.SETTINGS };
        if (path === '/time-off') return { view: ViewState.TIME_OFF };
        if (path === '/planner') return { view: ViewState.PLANNER };
        if (path === '/map') return { view: ViewState.MAP };
        if (path === '/gamification') return { view: ViewState.GAMIFICATION };
        
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

export default function App() {
  const initialState = getUrlState();
  const [view, setView] = useState<ViewState>(initialState.view);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(initialState.userId || null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(initialState.tripId || null);
  
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>('dark');
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Handle URL Navigation (Push State)
  const navigate = (newView: ViewState, id?: string) => {
      let path = '/';
      switch(newView) {
          case ViewState.SETTINGS: path = '/settings'; break;
          case ViewState.TIME_OFF: path = '/time-off'; break;
          case ViewState.PLANNER: path = '/planner'; break;
          case ViewState.MAP: path = '/map'; break;
          case ViewState.GAMIFICATION: path = '/gamification'; break;
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
    dataService.getWorkspaceSettings().then(settings => {
      setTheme(settings.theme);
    });
    
    const storedUser = localStorage.getItem('wandergrid_session_user');
    if (storedUser) {
        setCurrentUser(JSON.parse(storedUser));
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (currentTheme: 'light' | 'dark' | 'auto') => {
        if (currentTheme === 'dark') {
            root.classList.add('dark');
        } else if (currentTheme === 'light') {
            root.classList.remove('dark');
        } else {
            if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                root.classList.add('dark');
            } else {
                root.classList.remove('dark');
            }
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
      navigate(ViewState.DASHBOARD);
  };

  const handleUserClick = (userId: string) => {
      navigate(ViewState.USER_DETAIL, userId);
  };

  const handleTripClick = (tripId: string) => {
      navigate(ViewState.TRIP_DETAIL, tripId);
  };

  const renderView = () => {
    switch (view) {
      case ViewState.DASHBOARD:
        return <Dashboard onUserClick={handleUserClick} onTripClick={handleTripClick} />;
      case ViewState.SETTINGS:
        return <Settings onThemeChange={setTheme} />;
      case ViewState.TIME_OFF:
        return <TimeOff onTripClick={handleTripClick} />;
      case ViewState.USER_DETAIL:
        return <UserDetail userId={selectedUserId!} onBack={() => navigate(ViewState.DASHBOARD)} />;
      case ViewState.PLANNER:
        return <VacationPlanner onTripClick={handleTripClick} />;
      case ViewState.TRIP_DETAIL:
        return <TripDetail tripId={selectedTripId!} onBack={() => navigate(ViewState.DASHBOARD)} />;
      case ViewState.MAP:
        return <ExpeditionMapView onTripClick={handleTripClick} />;
      case ViewState.GAMIFICATION:
        return <Gamification onTripClick={handleTripClick} />;
      default:
        return <Dashboard onUserClick={handleUserClick} onTripClick={handleTripClick} />;
    }
  };

  if (!currentUser) {
      return (
        <div className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-gray-50 to-gray-200 dark:from-black dark:to-[#171717] transition-colors duration-500 text-gray-900 dark:text-gray-100">
            <div className="absolute inset-0 pointer-events-none opacity-20 dark:opacity-10" 
                style={{
                    backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(37, 99, 235, 0.05) 0%, transparent 20%), radial-gradient(circle at 90% 80%, rgba(124, 58, 237, 0.05) 0%, transparent 20%)'
                }}
            />
            <div className="w-full h-full relative z-10">
                <Suspense fallback={<ViewLoader />}>
                    <Auth onLogin={handleLogin} />
                </Suspense>
            </div>
        </div>
      );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-gray-50 to-gray-200 dark:from-black dark:to-[#171717] transition-colors duration-500 text-gray-900 dark:text-gray-100">
      <div className="absolute inset-0 pointer-events-none opacity-20 dark:opacity-10" 
           style={{
             backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(37, 99, 235, 0.05) 0%, transparent 20%), radial-gradient(circle at 90% 80%, rgba(124, 58, 237, 0.05) 0%, transparent 20%)'
           }}
      />
      <Sidebar 
        currentView={view} 
        onNavigate={(v, id) => navigate(v, id)} 
        theme={theme}
        onThemeToggle={handleThemeChange}
        onLogout={handleLogout}
        currentUser={currentUser}
      />
      <main className="flex-1 h-full overflow-y-auto relative z-10 p-8 custom-scrollbar">
        <Suspense fallback={<ViewLoader />}>
            {renderView()}
        </Suspense>
      </main>
    </div>
  );
}
