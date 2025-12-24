
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './views/Dashboard';
import { Settings } from './views/Settings';
import { TimeOff } from './views/TimeOff';
import { UserDetail } from './views/UserDetail';
import { VacationPlanner } from './views/VacationPlanner';
import { TripDetail } from './views/TripDetail';
import { ExpeditionMapView } from './views/ExpeditionMapView';
import { Auth } from './views/Auth';
import { ViewState, User } from './types';
import { dataService } from './services/mockDb';

export default function App() {
  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>('dark');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Initialize theme from settings on mount
  useEffect(() => {
    dataService.getWorkspaceSettings().then(settings => {
      setTheme(settings.theme);
    });
    
    // Check for existing session (simplified for mock)
    const storedUser = localStorage.getItem('wandergrid_session_user');
    if (storedUser) {
        setCurrentUser(JSON.parse(storedUser));
    }
  }, []);

  // Theme Management Logic
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (currentTheme: 'light' | 'dark' | 'auto') => {
        if (currentTheme === 'dark') {
            root.classList.add('dark');
        } else if (currentTheme === 'light') {
            root.classList.remove('dark');
        } else {
            // Auto
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
      // Persist to DB
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
      setView(ViewState.DASHBOARD);
  };

  const handleUserClick = (userId: string) => {
      setSelectedUserId(userId);
      setView(ViewState.USER_DETAIL);
  };

  const handleTripClick = (tripId: string) => {
      setSelectedTripId(tripId);
      setView(ViewState.TRIP_DETAIL);
  };

  const renderView = () => {
    switch (view) {
      case ViewState.DASHBOARD:
        return <Dashboard onUserClick={handleUserClick} onTripClick={handleTripClick} />;
      case ViewState.SETTINGS:
        return <Settings onThemeChange={setTheme} />;
      case ViewState.TIME_OFF:
        return <TimeOff />;
      case ViewState.USER_DETAIL:
        return <UserDetail userId={selectedUserId!} onBack={() => setView(ViewState.DASHBOARD)} />;
      case ViewState.PLANNER:
        return <VacationPlanner onTripClick={handleTripClick} />;
      case ViewState.TRIP_DETAIL:
        return <TripDetail tripId={selectedTripId!} onBack={() => setView(ViewState.DASHBOARD)} />;
      case ViewState.MAP:
        return <ExpeditionMapView onTripClick={handleTripClick} />;
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
                <Auth onLogin={handleLogin} />
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
        onNavigate={setView} 
        theme={theme}
        onThemeToggle={handleThemeChange}
        onLogout={handleLogout}
      />
      <main className="flex-1 h-full overflow-y-auto relative z-10 p-8 custom-scrollbar">
        {renderView()}
      </main>
    </div>
  );
}
