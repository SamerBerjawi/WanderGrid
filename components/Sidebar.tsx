
import React, { useEffect, useState } from 'react';
import { ViewState, Trip, User } from '../types';
import { dataService } from '../services/mockDb';
import { motion, AnimatePresence } from 'motion/react';

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
  const [isDbMode, setIsDbMode] = useState<boolean>(true);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  useEffect(() => {
    setIsDbMode(dataService.isDatabaseMode());
  }, []);

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
    { label: 'Travel Atlas', value: ViewState.TRAVEL_ATLAS, icon: 'explore' },
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

  const nameParts = currentUser ? currentUser.name.split(' ') : ['Guest', ''];
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ');

  return (
    <>
      {/* Desktop Sidebar with Crystal edge styles */}
      <aside className={`hidden md:flex flex-shrink-0 flex-col h-full border-r border-gray-200/5 bg-white/[0.02] dark:bg-zinc-950/20 backdrop-blur-3xl transition-all duration-300 relative border-t-white/5 shadow-[0_8px_32px_0_rgba(0,0,0,0.08)] ${isCollapsed ? 'w-24' : 'w-72'}`}>
        
        <button 
           onClick={() => setIsCollapsed(!isCollapsed)}
           className="absolute -right-3 top-10 w-6 h-6 rounded-full bg-white/90 dark:bg-zinc-900/90 border border-zinc-200/20 dark:border-white/5 flex items-center justify-center text-zinc-400 hover:text-indigo-500 transition-all z-50 shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:scale-110 active:scale-95 cursor-pointer backdrop-blur-md"
           title={isCollapsed ? "Expand" : "Collapse"}
        >
           <span className="material-icons-outlined text-xs">{isCollapsed ? 'chevron_right' : 'chevron_left'}</span>
        </button>

        <div className={`p-8 ${isCollapsed ? 'px-4' : 'px-8'} pb-4`}>
          <div className={`flex items-center gap-3.5 mb-8 ${isCollapsed ? 'justify-center' : ''}`}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500/10 to-purple-600/10 dark:from-indigo-500/20 dark:to-purple-600/20 border border-indigo-500/20 dark:border-indigo-500/30 flex items-center justify-center text-xl shrink-0 shadow-inner">
              🏔️
            </div>
            {!isCollapsed && (
               <h1 className="text-xl font-bold text-gray-800 dark:text-white tracking-tight whitespace-nowrap overflow-hidden bg-gradient-to-r from-gray-950 via-zinc-800 to-zinc-900 dark:from-white dark:via-zinc-200 dark:to-zinc-400 bg-clip-text text-transparent">WanderGrid</h1>
            )}
          </div>

          <nav className={`flex flex-col gap-1.5 ${isCollapsed ? 'items-center animate-fade-in' : ''}`}>
            {navItems.map((item) => (
              <button
                key={item.value}
                onClick={() => onNavigate(item.value)}
                className={`flex items-center gap-4 px-4 py-3 rounded-2xl text-[14px] font-bold select-none cursor-pointer relative transition-all duration-200
                  ${currentView === item.value 
                    ? 'text-indigo-600 dark:text-indigo-400 font-extrabold z-10' 
                    : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100/50 dark:hover:bg-white/[0.02] z-0'
                  }
                  ${isCollapsed ? 'justify-center px-0 w-12 h-12 border border-transparent' : 'w-full'}
                `}
                title={isCollapsed ? item.label : undefined}
              >
                {currentView === item.value && (
                  <motion.div
                    layoutId="activeTabGlow"
                    className="absolute inset-0 bg-zinc-100 dark:bg-white/[0.06] rounded-2xl border border-zinc-200/50 dark:border-white/10 shadow-sm"
                    transition={{ type: "spring", stiffness: 385, damping: 32 }}
                    style={{ originY: "center" }}
                  />
                )}
                <span className="material-icons-outlined text-xl opacity-90 relative z-20 shrink-0">{item.icon}</span>
                {!isCollapsed && <span className="relative z-20 font-medium tracking-tight">{item.label}</span>}
              </button>
            ))}
          </nav>
        </div>

        <div className={`mt-auto pb-8 pt-0 animate-fade-in flex flex-col gap-3 ${isCollapsed ? 'px-3 items-center' : 'px-8'}`}>
          
          {!isCollapsed ? (
               nextTrip ? (
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200/40 dark:border-white/5 text-gray-800 dark:text-white transition-all duration-300">
                  <p className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1.5">Coming Up Next</p>
                  <div className="flex items-center gap-3 mb-1">
                      <span className="text-xl filter drop-shadow">{nextTrip.icon || '✈️'}</span>
                      <p className="font-semibold text-xs truncate text-zinc-700 dark:text-zinc-300" title={nextTrip.name}>{nextTrip.name}</p>
                  </div>
                  <p className="text-[10px] font-bold tracking-wide text-indigo-500 dark:text-indigo-400">
                      {daysUntil > 0 ? `In ${daysUntil} days` : daysUntil === 0 ? 'Starts today!' : 'Ongoing'}
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-white/5 dark:bg-white/5 border border-dashed border-zinc-250 dark:border-white/10 text-center">
                  <span className="material-icons-outlined text-zinc-400 text-xl mb-1">explore</span>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none">No trips planned</p>
                  <button 
                      onClick={() => onNavigate(ViewState.DASHBOARD)} 
                      className="text-[10px] text-indigo-500 dark:text-indigo-400 font-bold mt-2 hover:underline cursor-pointer"
                  >
                      Book next adventure
                  </button>
                </div>
              )
          ) : (
               nextTrip ? (
                  <div className="w-12 h-12 rounded-2xl bg-zinc-500/5 dark:bg-white/5 flex items-center justify-center text-white shadow-md cursor-help border border-zinc-200/10 dark:border-white/5" title={`Next: ${nextTrip.name} (${daysUntil} days)`}>
                      <span className="text-lg leading-none">{nextTrip.icon || '✈️'}</span>
                  </div>
               ) : (
                  <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-white/5 flex items-center justify-center text-gray-450 border border-dashed border-gray-200 dark:border-white/5" title="No trips planned">
                      <span className="material-icons-outlined text-lg leading-none">explore_off</span>
                  </div>
               )
          )}

          {/* Connection, Theme & User Profile Unified Row */}
          <div className={`flex items-center gap-1.5 p-1.5 bg-zinc-50/50 dark:bg-zinc-950/30 border border-zinc-200/40 dark:border-white/5 rounded-3xl shadow-sm ${
              isCollapsed ? 'flex-col w-12' : 'flex-row justify-around w-full'
          }`}>
              {/* Connection Mode Status Icon */}
              <div 
                  title={isDbMode ? 'PostgreSQL Database: Sync Active' : 'LocalStorage Cache: Offline Mode'}
                  className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-all border ${
                      isDbMode 
                      ? 'bg-emerald-500/[0.04] border-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                      : 'bg-amber-500/[0.04] border-amber-500/10 text-amber-600 dark:text-amber-400'
                  }`}
              >
                  <span className="material-icons-outlined text-lg">{isDbMode ? 'cloud_done' : 'cloud_off'}</span>
                  <span className="absolute top-1.5 right-1.5 flex h-1.5 w-1.5">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isDbMode ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                      <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isDbMode ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                  </span>
              </div>

              {/* Theme Toggle Icon Button */}
              <button 
                  onClick={handleThemeCycle}
                  title={getThemeLabel()}
                  className="w-9 h-9 rounded-xl flex items-center justify-center transition-all text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/40 dark:hover:bg-white/5 border border-transparent hover:border-zinc-200/20 dark:hover:border-white/5 select-none cursor-pointer"
              >
                  <span className="material-icons-outlined text-lg opacity-80">{getThemeIcon()}</span>
              </button>

              {/* User Profile Avatar Icon Button */}
              {currentUser && (
                  <button 
                      onClick={() => onNavigate(ViewState.USER_DETAIL, currentUser.id)}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all border cursor-pointer ${
                          currentView === ViewState.USER_DETAIL 
                          ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-bold' 
                          : 'bg-transparent border-transparent hover:border-zinc-200/40 dark:hover:border-white/10 hover:bg-zinc-200/30 dark:hover:bg-white/[0.04]'
                      }`}
                      title={`Profile: ${currentUser.name} (${currentUser.role})`}
                  >
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-sm shrink-0">
                          {currentUser.name.charAt(0)}
                      </div>
                  </button>
              )}
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation (Glassmorphic 2.0 / Crystal Edge) */}
      <div className="flex md:hidden fixed bottom-0 left-0 right-0 z-50 h-20 items-center justify-around px-2 rounded-t-[2.5rem] border-t border-l border-r border-white/20 dark:border-white/10 bg-white/40 dark:bg-zinc-950/35 backdrop-blur-2xl bleed-glass shadow-[0_-8px_32px_0_rgba(0,0,0,0.25)]">
        {[
          { label: 'Dashboard', value: ViewState.DASHBOARD, icon: 'grid_view' },
          { label: 'Map', value: ViewState.MAP, icon: 'public' },
          { label: 'Flights', value: ViewState.FLIGHTS, icon: 'flight_takeoff' },
          { label: 'Travel Atlas', value: ViewState.TRAVEL_ATLAS, icon: 'explore' },
        ].map((item) => {
          const isActive = currentView === item.value;
          return (
            <button
              key={item.value}
              onClick={() => {
                onNavigate(item.value);
                setIsMoreOpen(false);
              }}
              className={`flex flex-col items-center justify-center flex-1 h-16 min-w-0 rounded-2xl transition-all duration-300 relative select-none cursor-pointer px-0.5
                ${isActive 
                  ? 'text-blue-600 dark:text-blue-400 scale-105' 
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white'
                }`}
            >
              <span className="material-icons-outlined text-2xl leading-none">{item.icon}</span>
              <span className="text-[8px] font-black uppercase tracking-wider mt-1 text-center leading-tight max-w-full line-clamp-2 hyphens-auto font-sans">
                {item.label}
              </span>
              {isActive && (
                <motion.div 
                  layoutId="mobileActiveIndicatorDot"
                  className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_0_rgba(59,130,246,0.8)]"
                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                />
              )}
            </button>
          );
        })}

        {/* Dynamic More popup trigger */}
        <button
          onClick={() => setIsMoreOpen(!isMoreOpen)}
          className={`flex flex-col items-center justify-center flex-1 h-16 min-w-0 rounded-2xl transition-all duration-300 relative select-none cursor-pointer px-0.5
            ${(currentView === ViewState.PLANNER || currentView === ViewState.SETTINGS || currentView === ViewState.USER_DETAIL)
              ? 'text-blue-600 dark:text-blue-400 scale-105'
              : 'text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white'
            }`}
        >
          <span className="material-icons-outlined text-2xl leading-none">more_horiz</span>
          <span className="text-[8px] font-black uppercase tracking-wider mt-1 text-center leading-tight font-sans">More</span>
          {(currentView === ViewState.PLANNER || currentView === ViewState.SETTINGS || currentView === ViewState.USER_DETAIL) && (
            <motion.div 
              layoutId="mobileActiveIndicatorDot"
              className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_0_rgba(59,130,246,0.8)]"
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
            />
          )}
        </button>
      </div>

      {/* More popup drawer menu overlay */}
      <AnimatePresence>
        {isMoreOpen && (
          <>
            {/* Backdrop blur dismissal layer */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 bg-black/35 backdrop-blur-xs z-[55]"
              onClick={() => setIsMoreOpen(false)}
            />
            {/* Elegant Minimalist Floating Menu Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12, x: 0 }}
              animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12, x: 0 }}
              transition={{ type: "spring", stiffness: 450, damping: 32 }}
              className="md:hidden fixed bottom-[5.5rem] right-4 w-52 z-[60] p-4 rounded-[1.8rem] border border-white/20 dark:border-white/10 bg-white/45 dark:bg-zinc-950/35 backdrop-blur-2xl shadow-[0_12px_32px_rgba(0,0,0,0.2)] flex flex-col gap-1"
            >
              <div className="flex flex-col gap-1">
                {/* Planner button option */}
                <button
                  onClick={() => {
                    onNavigate(ViewState.PLANNER);
                    setIsMoreOpen(false);
                  }}
                  className={`flex items-center justify-between w-full p-2.5 px-3 rounded-xl text-left text-xs font-bold font-sans transition-all duration-150 border cursor-pointer ${
                    currentView === ViewState.PLANNER
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/10'
                      : 'text-zinc-700 dark:text-zinc-300 bg-transparent border-transparent hover:bg-zinc-50 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="material-icons-outlined text-lg">map</span>
                    <span>Planner</span>
                  </div>
                  {currentView === ViewState.PLANNER && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                </button>

                {/* Settings button option */}
                <button
                  onClick={() => {
                    onNavigate(ViewState.SETTINGS);
                    setIsMoreOpen(false);
                  }}
                  className={`flex items-center justify-between w-full p-2.5 px-3 rounded-xl text-left text-xs font-bold font-sans transition-all duration-150 border cursor-pointer ${
                    currentView === ViewState.SETTINGS
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/10'
                      : 'text-zinc-700 dark:text-zinc-300 bg-transparent border-transparent hover:bg-zinc-50 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="material-icons-outlined text-lg">settings</span>
                    <span>Settings</span>
                  </div>
                  {currentView === ViewState.SETTINGS && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                </button>

                {/* Me (User profile) button option */}
                {currentUser && (
                  <button
                    onClick={() => {
                      onNavigate(ViewState.USER_DETAIL, currentUser.id);
                      setIsMoreOpen(false);
                    }}
                    className={`flex items-center justify-between w-full p-2.5 px-3 rounded-xl text-left text-xs font-bold font-sans transition-all duration-150 border cursor-pointer ${
                      currentView === ViewState.USER_DETAIL
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/10'
                        : 'text-zinc-700 dark:text-zinc-300 bg-transparent border-transparent hover:bg-zinc-50 dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-4.5 h-4.5 rounded-md flex items-center justify-center text-[8.5px] font-black text-white shrink-0 ${
                        currentUser.role === 'Partner' ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'
                      }`}>
                        {currentUser.name.charAt(0)}
                      </div>
                      <div className="flex flex-col text-left min-w-0">
                        <span className="truncate max-w-[8rem] text-xs">{currentUser.name}</span>
                      </div>
                    </div>
                    {currentView === ViewState.USER_DETAIL && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
