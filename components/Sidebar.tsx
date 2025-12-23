import React, { useEffect, useState } from 'react';
import { ViewState, Trip } from '../types';
import { dataService } from '../services/mockDb';

interface SidebarProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
  theme: 'light' | 'dark' | 'auto';
  onThemeToggle: (theme: 'light' | 'dark' | 'auto') => void;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, theme, onThemeToggle, onLogout }) => {
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
    { label: 'Planner', value: ViewState.PLANNER, icon: 'map' }, // New Item
    { label: 'Time Off', value: ViewState.TIME_OFF, icon: 'date_range' },
    { label: 'Settings', value: ViewState.SETTINGS, icon: 'settings' },
  ];

  const handleThemeCycle = () => {
      // Toggle only between light and dark.
      // If current is dark, go light. If light (or auto), go dark.
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
    <aside className={`flex-shrink-0 flex flex-col h-full border-r border-gray-200/50 bg-white/40 backdrop-blur-2xl dark:bg-gray-900/80 dark:border-white/5 transition-all duration-300 relative ${isCollapsed ? 'w-24' : 'w-72'}`}>
      
      <button 
         onClick={() => setIsCollapsed(!isCollapsed)}
         className="absolute -right-3 top-10 w-6 h-6 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 flex items-center justify-center text-gray-500 hover:text-blue-500 transition-all z-50 shadow-sm hover:scale-110 active:scale-95 cursor-pointer"
         title={isCollapsed ? "Expand" : "Collapse"}
      >
         <span className="material-icons-outlined text-sm">{isCollapsed ? 'chevron_right' : 'chevron_left'}</span>
      </button>

      <div className={`p-8 ${isCollapsed ? 'px-4' : 'px-8'}`}>
        <div className={`flex items-center gap-4 mb-8 ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30 flex items-center justify-center text-white font-bold text-2xl shrink-0">
            W
          </div>
          {!isCollapsed && (
             <h1 className="text-2xl font-bold text-gray-800 dark:text-white tracking-tight whitespace-nowrap overflow-hidden">WanderGrid</h1>
          )}
        </div>

        <nav className="flex flex-col gap-2">
          {navItems.map((item) => (
            <button
              key={item.value}
              onClick={() => onNavigate(item.value)}
              className={`flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-200 text-base font-medium
                ${currentView === item.value 
                  ? 'bg-white shadow-md text-blue-600 dark:bg-white/10 dark:text-blue-400 dark:shadow-none' 
                  : 'text-gray-500 hover:bg-white/50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white'
                }
                ${isCollapsed ? 'justify-center px-2' : ''}
              `}
              title={isCollapsed ? item.label : undefined}
            >
              <span className="material-icons-outlined text-2xl opacity-80">{item.icon}</span>
              {!isCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>
      </div>

      <div className={`mt-auto pb-8 pt-0 animate-fade-in flex flex-col gap-3 ${isCollapsed ? 'px-3 items-center' : 'px-8'}`}>
        {!isCollapsed ? (
             nextTrip ? (
              <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-purple-500/30 border border-white/10">
                <p className="text-xs font-black opacity-70 uppercase tracking-widest mb-1.5">Coming Up Next</p>
                <div className="flex items-center gap-3 mb-1">
                    <span className="text-2xl">{nextTrip.icon || '✈️'}</span>
                    <p className="font-bold text-base truncate" title={nextTrip.name}>{nextTrip.name}</p>
                </div>
                <p className="text-xs font-medium opacity-80">
                    {daysUntil > 0 ? `In ${daysUntil} days` : daysUntil === 0 ? 'Starts today!' : 'Ongoing'}
                </p>
              </div>
            ) : (
              <div className="p-5 rounded-2xl bg-gray-100/50 dark:bg-white/5 border border-dashed border-gray-300 dark:border-white/10 text-center">
                <span className="material-icons-outlined text-gray-400 text-2xl mb-1">explore</span>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No trips planned</p>
                <button 
                    onClick={() => onNavigate(ViewState.DASHBOARD)} 
                    className="text-[10px] text-blue-500 dark:text-blue-400 font-bold mt-2 hover:underline"
                >
                    Book your next adventure
                </button>
              </div>
            )
        ) : (
             // Collapsed State for Next Trip
             nextTrip ? (
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md cursor-help" title={`Next: ${nextTrip.name} (${daysUntil} days)`}>
                    <span className="text-xl">{nextTrip.icon || '✈️'}</span>
                </div>
             ) : (
                <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-300" title="No trips planned">
                    <span className="material-icons-outlined text-xl">explore_off</span>
                </div>
             )
        )}

        <button 
            onClick={handleThemeCycle}
            className={`flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-200 text-base font-medium text-gray-500 hover:bg-white/50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white w-full border border-gray-100/50 dark:border-white/5 hover:border-gray-200 dark:hover:border-white/10 ${isCollapsed ? 'justify-center px-0' : ''}`}
            title={isCollapsed ? getThemeLabel() : undefined}
        >
            <span className="material-icons-outlined text-2xl opacity-80">{getThemeIcon()}</span>
            {!isCollapsed && <span>{getThemeLabel()}</span>}
        </button>

        {onLogout && (
            <button 
                onClick={onLogout}
                className={`flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-200 text-base font-medium text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 w-full border border-transparent hover:border-rose-100 dark:hover:border-rose-900/30 ${isCollapsed ? 'justify-center px-0' : ''}`}
                title="Logout"
            >
                <span className="material-icons-outlined text-2xl opacity-80">logout</span>
                {!isCollapsed && <span>Logout</span>}
            </button>
        )}
      </div>
    </aside>
  );
};