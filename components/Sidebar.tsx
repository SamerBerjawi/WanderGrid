
import React, { useEffect, useState } from 'react';
import { ViewState, Trip, User } from '../types';
import { dataService } from '../services/mockDb';

interface SidebarProps {
  currentView: ViewState;
  onNavigate: (view: ViewState, id?: string) => void;
  theme: 'light' | 'dark' | 'auto';
  onThemeToggle: (theme: 'light' | 'dark' | 'auto') => void;
  onLogout?: () => void;
  currentUser: User | null;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, theme, onThemeToggle, onLogout, currentUser }) => {
  const [nextTrip, setNextTrip] = useState<Trip | null>(null);
  const [daysUntil, setDaysUntil] = useState<number>(0);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    dataService.getTrips().then(trips => {
      // Find upcoming trips where the end date hasn't passed yet
      const upcoming = trips
        .filter(t => {
            const startDate = new Date(t.startDate);
            const endDate = new Date(t.endDate);
            // Include trips that are currently happening or starting in the future
            return t.status === 'Upcoming' && endDate >= today;
        })
        .sort((a,b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
      
      if (upcoming.length > 0) {
        const trip = upcoming[0];
        setNextTrip(trip);
        const start = new Date(trip.startDate);
        start.setHours(0,0,0,0);
        const diff = start.getTime() - today.getTime();
        setDaysUntil(Math.ceil(diff / (1000 * 60 * 60 * 24)));
      } else {
        setNextTrip(null);
      }
    });
  }, [currentView]); // Re-check when view changes (likely after a booking)

  const navItems = [
    { label: 'Dashboard', value: ViewState.DASHBOARD, icon: 'grid_view' },
    { label: 'Map', value: ViewState.MAP, icon: 'public' },
    { label: 'Planner', value: ViewState.PLANNER, icon: 'map' }, 
    { label: 'Flights', value: ViewState.FLIGHTS, icon: 'flight_takeoff' }, 
    { label: 'Settings', value: ViewState.SETTINGS, icon: 'settings' },
  ];

  const handleThemeCycle = () => {
      const nextTheme = theme === 'dark' ? 'light' : 'dark';
      onThemeToggle(nextTheme);
  };

  const getThemeIcon = () => {
      return theme === 'dark' ? 'dark_mode' : 'light_mode';
  };

  const getThemeLabel = () => {
      return theme === 'dark' ? 'Dark Mode' : 'Light Mode';
  };

  return (
    <>
      {/* Desktop Sidebar with Crystal edge styles */}
      <aside className={`hidden md:flex flex-shrink-0 flex-col h-full border-r border-gray-200/10 bg-white/[0.04] dark:bg-zinc-950/25 backdrop-blur-2xl transition-all duration-300 relative border-t-white/10 dark:border-t-white/5 shadow-[0_8px_32px_0_rgba(0,0,0,0.15)] ${isCollapsed ? 'w-24' : 'w-72'}`}>
        
        <button 
           onClick={() => setIsCollapsed(!isCollapsed)}
           className="absolute -right-3 top-10 w-6 h-6 rounded-full bg-white/80 dark:bg-slate-900/80 border border-gray-200/20 dark:border-white/10 flex items-center justify-center text-gray-500 hover:text-blue-500 transition-all z-50 shadow-[0_4px_12px_0_rgba(0,0,0,0.1)] hover:scale-110 active:scale-95 cursor-pointer backdrop-blur-md"
           title={isCollapsed ? "Expand" : "Collapse"}
        >
           <span className="material-icons-outlined text-sm">{isCollapsed ? 'chevron_right' : 'chevron_left'}</span>
        </button>

        <div className={`p-8 ${isCollapsed ? 'px-4' : 'px-8'}`}>
          <div className={`flex items-center gap-4 mb-8 ${isCollapsed ? 'justify-center' : ''}`}>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 shadow-lg shadow-blue-500/20 flex items-center justify-center text-white font-extrabold text-2xl shrink-0 border border-white/20">
              W
            </div>
            {!isCollapsed && (
               <h1 className="text-2xl font-black text-gray-800 dark:text-white tracking-tight bg-gradient-to-r from-gray-900 via-gray-800 to-indigo-950 dark:from-white dark:via-blue-100 dark:to-indigo-200 bg-clip-text text-transparent whitespace-nowrap overflow-hidden">WanderGrid</h1>
            )}
          </div>

          <nav className="flex flex-col gap-2">
            {navItems.map((item) => (
              <button
                key={item.value}
                onClick={() => onNavigate(item.value)}
                className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 text-base font-bold select-none cursor-pointer
                  ${currentView === item.value 
                    ? 'bg-white/60 dark:bg-white/[0.12] shadow-sm text-blue-600 dark:text-blue-400 border border-white/20 dark:border-white/10 scale-[1.02]' 
                    : 'text-gray-500 hover:bg-white/10 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white border border-transparent'
                  }
                  ${isCollapsed ? 'justify-center px-2' : ''}
                `}
                title={isCollapsed ? item.label : undefined}
              >
                <span className="material-icons-outlined text-2xl opacity-90">{item.icon}</span>
                {!isCollapsed && <span>{item.label}</span>}
              </button>
            ))}
          </nav>
        </div>

        <div className={`mt-auto pb-8 pt-0 animate-fade-in flex flex-col gap-3 ${isCollapsed ? 'px-3 items-center' : 'px-8'}`}>
          
          {/* User Profile Quick Access */}
          {currentUser && (
              <button 
                  onClick={() => onNavigate(ViewState.USER_DETAIL, currentUser.id)}
                  className={`group flex items-center gap-4 p-3.5 rounded-2xl transition-all border select-none cursor-pointer ${
                      currentView === ViewState.USER_DETAIL 
                      ? 'bg-white/60 border-white/30 shadow-sm dark:bg-white/10 dark:border-white/10' 
                      : 'bg-white/10 border-gray-100/10 dark:bg-slate-900/20 dark:border-white/5 hover:border-gray-200/20 dark:hover:border-white/10 hover:bg-white/20 dark:hover:bg-white/5'
                  } ${isCollapsed ? 'justify-center w-12 h-12 p-0' : 'w-full'}`}
                  title={isCollapsed ? `Profile: ${currentUser.name}` : undefined}
              >
                  <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black text-white shadow-sm transition-transform group-hover:scale-110 ${currentUser.role === 'Partner' ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>
                      {currentUser.name.charAt(0)}
                  </div>
                  {!isCollapsed && (
                      <div className="flex-1 text-left overflow-hidden">
                          <p className="text-xs font-black text-gray-800 dark:text-gray-200 truncate leading-none">{currentUser.name}</p>
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">My Identity</p>
                      </div>
                  )}
                  {!isCollapsed && (
                      <span className="material-icons-outlined text-gray-450 group-hover:text-blue-500 transition-colors text-sm">settings_account_box</span>
                  )}
              </button>
          )}

          {!isCollapsed ? (
               nextTrip ? (
                <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-600/30 to-purple-700/30 hover:from-blue-600/40 hover:to-purple-700/40 border border-white/20 dark:border-white/5 backdrop-blur-md text-gray-800 dark:text-white transition-all duration-300">
                  <p className="text-[9px] font-black text-gray-500 dark:text-blue-200 opacity-90 uppercase tracking-widest mb-1.5">Coming Up Next</p>
                  <div className="flex items-center gap-3 mb-1">
                      <span className="text-2xl filter drop-shadow">{nextTrip.icon || '✈️'}</span>
                      <p className="font-extrabold text-sm truncate" title={nextTrip.name}>{nextTrip.name}</p>
                  </div>
                  <p className="text-[10px] font-black tracking-wide text-blue-600 dark:text-blue-400">
                      {daysUntil > 0 ? `In ${daysUntil} days` : daysUntil === 0 ? 'Starts today!' : 'Ongoing'}
                  </p>
                </div>
              ) : (
                <div className="p-5 rounded-2xl bg-white/5 dark:bg-white/5 border border-dashed border-gray-300 dark:border-white/10 text-center">
                  <span className="material-icons-outlined text-gray-400 text-2xl mb-1">explore</span>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No trips planned</p>
                  <button 
                      onClick={() => onNavigate(ViewState.DASHBOARD)} 
                      className="text-[10px] text-blue-500 dark:text-blue-400 font-extrabold mt-2 hover:underline cursor-pointer"
                  >
                      Book next adventure
                  </button>
                </div>
              )
          ) : (
               nextTrip ? (
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center text-white shadow-md cursor-help border border-white/10" title={`Next: ${nextTrip.name} (${daysUntil} days)`}>
                      <span className="text-xl">{nextTrip.icon || '✈️'}</span>
                  </div>
               ) : (
                  <div className="w-12 h-12 rounded-2xl bg-gray-150 dark:bg-white/5 flex items-center justify-center text-gray-450 border border-dashed border-gray-250 dark:border-white/5" title="No trips planned">
                      <span className="material-icons-outlined text-xl">explore_off</span>
                  </div>
               )
          )}

          <button 
              onClick={handleThemeCycle}
              className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-200 text-base font-bold text-gray-500 hover:bg-white/20 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white w-full border border-gray-100/10 dark:border-white/5 hover:border-gray-200/20 dark:hover:border-white/10 select-none cursor-pointer ${isCollapsed ? 'justify-center px-0' : ''}`}
              title={isCollapsed ? getThemeLabel() : undefined}
          >
              <span className="material-icons-outlined text-2xl opacity-80">{getThemeIcon()}</span>
              {!isCollapsed && <span>{getThemeLabel()}</span>}
          </button>

          {onLogout && (
              <button 
                  onClick={onLogout}
                  className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-200 text-base font-bold text-rose-500 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 w-full border border-transparent hover:border-rose-100/30 dark:hover:border-rose-950/30 cursor-pointer ${isCollapsed ? 'justify-center px-0' : ''}`}
                  title="Logout"
              >
                  <span className="material-icons-outlined text-2xl opacity-80">logout</span>
                  {!isCollapsed && <span>Logout</span>}
              </button>
          )}
        </div>
      </aside>

      {/* Mobile Bottom Navigation (Glassmorphic 2.0 / Crystal Edge) */}
      <div className="flex md:hidden fixed bottom-0 left-0 right-0 z-50 h-20 items-center justify-around px-2 rounded-t-[2.5rem] border-t border-l border-r border-white/20 dark:border-white/10 bg-white/40 dark:bg-zinc-950/35 backdrop-blur-2xl shadow-[0_-8px_32px_0_rgba(0,0,0,0.25)]">
        {navItems.map((item) => {
          const isActive = currentView === item.value;
          return (
            <button
              key={item.value}
              onClick={() => onNavigate(item.value)}
              className={`flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition-all duration-300 relative select-none cursor-pointer
                ${isActive 
                  ? 'text-blue-600 dark:text-blue-400 scale-105' 
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white'
                }`}
            >
              <span className="material-icons-outlined text-2xl leading-none">{item.icon}</span>
              <span className="text-[9px] font-black uppercase tracking-wider mt-1">{item.label.substring(0, 4)}</span>
              {isActive && (
                <div className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_0_rgba(59,130,246,0.8)]" />
              )}
            </button>
          );
        })}
        {currentUser && (
          <button
            onClick={() => onNavigate(ViewState.USER_DETAIL, currentUser.id)}
            className={`flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition-all duration-300 relative select-none cursor-pointer
              ${currentView === ViewState.USER_DETAIL 
                ? 'text-blue-650 dark:text-blue-400 scale-105' 
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
          >
            <div className={`w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-black text-white shadow-sm transition-transform ${currentUser.role === 'Partner' ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>
              {currentUser.name.charAt(0)}
            </div>
            <span className="text-[9px] font-black uppercase tracking-wider mt-1">Me</span>
            {currentView === ViewState.USER_DETAIL && (
              <div className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_0_rgba(59,130,246,0.8)]" />
            )}
          </button>
        )}
      </div>
    </>
  );
};
