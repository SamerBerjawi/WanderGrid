
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Sidebar } from './components/Sidebar';
import { ViewState, User } from './types';
import { dataService } from './services/mockDb';
import { motion, AnimatePresence } from 'motion/react';

// Lazy load views to split the bundle and improve performance
const Dashboard = lazy(() => import('./views/Dashboard').then(m => ({ default: m.Dashboard })));
const Settings = lazy(() => import('./views/Settings').then(m => ({ default: m.Settings })));
const UserDetail = lazy(() => import('./views/UserDetail').then(m => ({ default: m.UserDetail })));
const VacationPlanner = lazy(() => import('./views/VacationPlanner').then(m => ({ default: m.VacationPlanner })));
const TripDetail = lazy(() => import('./views/TripDetail').then(m => ({ default: m.TripDetail })));
const ExpeditionMapView = lazy(() => import('./views/ExpeditionMapView').then(m => ({ default: m.ExpeditionMapView })));
const Gamification = lazy(() => import('./views/Gamification').then(m => ({ default: m.Gamification })));
const Flights = lazy(() => import('./views/Flights').then(m => ({ default: m.Flights })));
const Auth = lazy(() => import('./views/Auth').then(m => ({ default: m.Auth })));

const getUrlState = () => {
    try {
        const path = window.location.pathname;
        if (path === '/settings') return { view: ViewState.SETTINGS };
        if (path === '/planner') return { view: ViewState.PLANNER };
        if (path === '/map') return { view: ViewState.MAP };
        if (path === '/gamification') return { view: ViewState.GAMIFICATION };
        if (path === '/flights') return { view: ViewState.FLIGHTS };
        
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

const VIEW_ACCENTS: Record<ViewState, { glow1: string; glow2: string; glow3: string }> = {
  [ViewState.DASHBOARD]: { 
    glow1: 'bg-sky-500/10 dark:bg-sky-500/15', 
    glow2: 'bg-indigo-500/10 dark:bg-indigo-500/15',
    glow3: 'bg-blue-500/5 dark:bg-blue-500/5' 
  },
  [ViewState.SETTINGS]: { 
    glow1: 'bg-emerald-500/10 dark:bg-emerald-500/15', 
    glow2: 'bg-teal-500/10 dark:bg-teal-500/15',
    glow3: 'bg-green-500/5 dark:bg-green-500/5'
  },
  [ViewState.USER_DETAIL]: { 
    glow1: 'bg-rose-500/10 dark:bg-rose-500/15', 
    glow2: 'bg-pink-500/10 dark:bg-pink-500/15',
    glow3: 'bg-orange-500/5 dark:bg-orange-500/5'
  },
  [ViewState.PLANNER]: { 
    glow1: 'bg-violet-500/10 dark:bg-violet-500/15', 
    glow2: 'bg-fuchsia-500/10 dark:bg-fuchsia-500/15',
    glow3: 'bg-purple-500/5 dark:bg-purple-500/5'
  },
  [ViewState.TRIP_DETAIL]: { 
    glow1: 'bg-amber-500/10 dark:bg-amber-500/15', 
    glow2: 'bg-orange-500/10 dark:bg-orange-500/15',
    glow3: 'bg-yellow-500/5 dark:bg-yellow-500/5'
  },
  [ViewState.MAP]: { 
    glow1: 'bg-cyan-500/10 dark:bg-cyan-500/15', 
    glow2: 'bg-blue-500/10 dark:bg-blue-500/15',
    glow3: 'bg-indigo-500/5 dark:bg-indigo-500/5'
  },
  [ViewState.GAMIFICATION]: { 
    glow1: 'bg-yellow-500/10 dark:bg-yellow-500/15', 
    glow2: 'bg-amber-500/10 dark:bg-amber-500/15',
    glow3: 'bg-orange-500/5 dark:bg-orange-500/5'
  },
  [ViewState.FLIGHTS]: { 
    glow1: 'bg-cyan-500/20 dark:bg-cyan-500/25', 
    glow2: 'bg-teal-500/15 dark:bg-teal-500/20',
    glow3: 'bg-blue-500/10 dark:bg-blue-500/10' 
  },
};

export default function App() {
  const initialState = getUrlState();
  const [view, setView] = useState<ViewState>(initialState.view);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(initialState.userId || null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(initialState.tripId || null);
  
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>('dark');
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const currentAccent = VIEW_ACCENTS[view] || VIEW_ACCENTS[ViewState.DASHBOARD];

  // Handle URL Navigation (Push State)
  const navigate = (newView: ViewState, id?: string) => {
      let path = '/';
      switch(newView) {
          case ViewState.SETTINGS: path = '/settings'; break;
          case ViewState.PLANNER: path = '/planner'; break;
          case ViewState.MAP: path = '/map'; break;
          case ViewState.GAMIFICATION: path = '/gamification'; break;
          case ViewState.FLIGHTS: path = '/flights'; break;
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
      if (tripId && tripId.startsWith('independent-flight-')) {
          navigate(ViewState.FLIGHTS);
      } else {
          navigate(ViewState.TRIP_DETAIL, tripId);
      }
  };

  const renderView = () => {
    switch (view) {
      case ViewState.DASHBOARD:
        return <Dashboard onUserClick={handleUserClick} onTripClick={handleTripClick} />;
      case ViewState.SETTINGS:
        return <Settings onThemeChange={setTheme} />;
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
      case ViewState.FLIGHTS:
        return <Flights onTripClick={handleTripClick} />;
      default:
        return <Dashboard onUserClick={handleUserClick} onTripClick={handleTripClick} />;
    }
  };

  if (!currentUser) {
      return (
        <div className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-indigo-50/50 via-slate-100/60 to-blue-50/50 dark:from-slate-950 dark:via-slate-900/90 dark:to-indigo-950/95 transition-colors duration-500 text-gray-900 dark:text-gray-100 relative">
            {/* Pulsing ambient spots */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute -top-40 -left-40 w-[550px] h-[550px] rounded-full bg-blue-500/10 dark:bg-blue-600/15 blur-[120px] animate-[pulse_10s_infinite]" />
                <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-purple-500/10 dark:bg-purple-600/15 blur-[130px] animate-[pulse_14s_infinite] delay-1000" />
            </div>
            <div className="w-full h-full relative z-10">
                <Suspense fallback={<ViewLoader />}>
                    <Auth onLogin={handleLogin} />
                </Suspense>
            </div>
        </div>
      );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-zinc-50/40 via-neutral-100/30 to-zinc-100/40 dark:from-zinc-950 dark:via-[#0c0c0f] dark:to-zinc-950 transition-colors duration-700 text-gray-900 dark:text-gray-100 relative">
      {/* Dynamic Ambient Spot Glow Filter representing current state */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className={`absolute -top-52 -left-52 w-[650px] h-[650px] rounded-full ${currentAccent.glow1} blur-[140px] animate-[pulse_12s_infinite] transition-colors duration-[1.5s]`} />
          <div className={`absolute top-[25%] -right-52 w-[600px] h-[600px] rounded-full ${currentAccent.glow2} blur-[130px] animate-[pulse_15s_infinite] delay-1000 transition-colors duration-[1.5s]`} />
          <div className={`absolute -bottom-52 left-[25%] w-[550px] h-[550px] rounded-full ${currentAccent.glow3} blur-[140px] animate-[pulse_13s_infinite] delay-2000 transition-colors duration-[1.5s]`} />
      </div>
      <Sidebar 
        currentView={view} 
        onNavigate={(v, id) => navigate(v, id)} 
        theme={theme}
        onThemeToggle={handleThemeChange}
        onLogout={handleLogout}
        currentUser={currentUser}
      />
      <main className="flex-1 h-full overflow-y-auto relative z-10 p-4 md:p-8 pb-28 md:pb-8 custom-scrollbar">
        <Suspense fallback={<ViewLoader />}>
          <AnimatePresence mode="wait">
            <motion.div
              key={view + (view === ViewState.USER_DETAIL ? selectedUserId : '') + (view === ViewState.TRIP_DETAIL ? selectedTripId : '')}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="w-full h-full"
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </Suspense>
      </main>
    </div>
  );
}
