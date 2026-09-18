
import React, { useEffect, useState } from 'react';
import { ViewState, Trip, User } from '../types';
import { dataService } from '../services/mockDb';
import { motion, AnimatePresence } from 'motion/react';
import GlassPanel from './glass/GlassPanel';

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
    { label: 'Vacation Calendar', value: ViewState.VACATION_CALENDAR, icon: 'calendar_month' }, 
    { label: 'Travel Atlas', value: ViewState.TRAVEL_ATLAS, icon: 'explore' },
    { label: 'Flights', value: ViewState.FLIGHTS, icon: 'flight_takeoff' }, 
    { label: 'Road Trips', value: ViewState.ROADTRIPS, icon: 'directions_car' }, 
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
      <aside className={`hidden md:flex flex-shrink-0 flex-col h-full border-r border-gray-200/5 bg-white/[0.02] dark:bg-zinc-950/20 backdrop-blur-xl transition-all duration-300 relative z-30 border-t-white/5 shadow-[0_8px_32px_0_rgba(0,0,0,0.08)] ${isCollapsed ? 'w-24' : 'w-72'}`}>
        
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
                className={`flex items-center gap-4 px-4 py-3 rounded-2xl text-sm font-bold select-none cursor-pointer relative transition-all duration-200
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
                <GlassPanel
                  className="wg-glass-card shadow-lg"
                  overrides={{ borderRadius: 20 }}
                  padding="14px"
                >
                  <p className="text-2xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1.5">Coming Up Next</p>
                  <div className="flex items-center gap-3 mb-1">
                      <span className="text-xl filter drop-shadow">{nextTrip.icon || '✈️'}</span>
                      <p className="font-semibold text-xs truncate text-zinc-700 dark:text-zinc-200" title={nextTrip.name}>{nextTrip.name}</p>
                  </div>
                  <p className="text-xs font-bold tracking-wide text-indigo-500 dark:text-indigo-400">
                      {daysUntil > 0 ? `In ${daysUntil} days` : daysUntil === 0 ? 'Starts today!' : 'Ongoing'}
                  </p>
                </GlassPanel>
              ) : (
                <div className="p-4 rounded-2xl bg-white/5 dark:bg-white/5 border border-dashed border-zinc-250 dark:border-white/10 text-center">
                  <span className="material-icons-outlined text-zinc-400 text-xl mb-1">explore</span>
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest leading-none">No trips planned</p>
                  <button 
                      onClick={() => onNavigate(ViewState.DASHBOARD)} 
                      className="text-xs text-indigo-500 dark:text-indigo-400 font-bold mt-2 hover:underline cursor-pointer"
                  >
                      Book next adventure
                  </button>
                </div>
              )
          ) : (
               nextTrip ? (
                  <GlassPanel
                    className="wg-glass-pill shadow-md cursor-help flex items-center justify-center w-12 h-12"
                    overrides={{ borderRadius: 16 }}
                    padding="0px"
                  >
                    <span className="text-lg leading-none" title={`Next: ${nextTrip.name} (${daysUntil} days)`}>{nextTrip.icon || '✈️'}</span>
                  </GlassPanel>
              ) : null
          )}

          {/* Bottom Settings / Action Cluster */}
          <div className="flex items-center justify-between pt-4 border-t border-zinc-200/50 dark:border-white/5">
              <button 
                  onClick={handleThemeCycle}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-zinc-200/30 dark:hover:bg-white/[0.04] transition-all cursor-pointer"
                  title="Toggle Visual Appearance Mode"
              >
                  <span className="material-icons-outlined text-lg">{theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
              </button>

              <button 
                  onClick={() => onNavigate(ViewState.SETTINGS)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                      currentView === ViewState.SETTINGS 
                      ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/20' 
                      : 'text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-zinc-200/30 dark:hover:bg-white/[0.04]'
                  }`}
                  title="Settings & Workspace Preferences"
              >
                  <span className="material-icons-outlined text-lg">settings</span>
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
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center text-2xs font-bold text-white bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-sm shrink-0">
                          {currentUser.name.charAt(0)}
                      </div>
                  </button>
              )}
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation with Liquid Glass */}
      <div className="flex md:hidden fixed bottom-2 left-0 right-0 z-50 items-center justify-center px-3 pointer-events-none">
        <GlassPanel
          className="wg-glass-pill shadow-2xl pointer-events-auto w-full max-w-md"
          overrides={{ borderRadius: 28 }}
          padding="4px 10px"
        >
          <div className="flex items-center justify-around w-full">
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
                  className={`flex flex-col items-center justify-center flex-1 h-14 min-w-0 rounded-2xl transition-all duration-300 relative select-none cursor-pointer px-0.5
                    ${isActive 
                      ? 'text-primary-500 font-extrabold scale-105' 
                      : 'text-gray-400 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                >
                  <span className="material-icons-outlined text-xl leading-none">{item.icon}</span>
                  <span className="text-2xs font-bold uppercase tracking-wider mt-1 text-center leading-tight max-w-full line-clamp-2 hyphens-auto font-sans">
                    {item.label}
                  </span>
                  {isActive && (
                    <motion.div 
                      layoutId="mobileActiveIndicatorDot"
                      className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-primary-500 shadow-[0_0_8px_0_rgba(250,154,29,0.8)]"
                      transition={{ type: "spring", stiffness: 350, damping: 25 }}
                    />
                  )}
                </button>
              );
            })}

            {/* Dynamic More popup trigger */}
            <button
              onClick={() => setIsMoreOpen(!isMoreOpen)}
              className={`flex flex-col items-center justify-center flex-1 h-14 min-w-0 rounded-2xl transition-all duration-300 relative select-none cursor-pointer px-0.5
                ${(currentView === ViewState.PLANNER || currentView === ViewState.SETTINGS || currentView === ViewState.USER_DETAIL || currentView === ViewState.ROADTRIPS)
                  ? 'text-primary-500 font-extrabold scale-105'
                  : 'text-gray-400 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
            >
              <span className="material-icons-outlined text-xl leading-none">more_horiz</span>
              <span className="text-2xs font-bold uppercase tracking-wider mt-1 text-center leading-tight font-sans">More</span>
              {(currentView === ViewState.PLANNER || currentView === ViewState.SETTINGS || currentView === ViewState.USER_DETAIL || currentView === ViewState.ROADTRIPS) && (
                <motion.div 
                  layoutId="mobileActiveIndicatorDot"
                  className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-primary-500 shadow-[0_0_8px_0_rgba(250,154,29,0.8)]"
                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                />
              )}
            </button>
          </div>
        </GlassPanel>
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
            {/* Elegant Minimalist Floating Menu Box with Liquid Glass */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12, x: 0 }}
              animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12, x: 0 }}
              transition={{ type: "spring", stiffness: 450, damping: 32 }}
              className="md:hidden fixed bottom-[5.5rem] right-4 w-56 z-[60]"
            >
              <GlassPanel
                className="wg-glass-card shadow-2xl"
                overrides={{ borderRadius: 24 }}
                padding="12px"
              >
                <div className="flex flex-col gap-1 w-full">
                  {/* Planner button option */}
                  <button
                    onClick={() => {
                      onNavigate(ViewState.PLANNER);
                      setIsMoreOpen(false);
                    }}
                    className={`flex items-center justify-between w-full p-2.5 px-3 rounded-xl text-left text-xs font-bold font-sans transition-all duration-150 border cursor-pointer ${
                      currentView === ViewState.PLANNER
                        ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400 border-primary-500/20'
                        : 'text-light-text dark:text-dark-text bg-transparent border-transparent hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="material-icons-outlined text-lg">map</span>
                      <span>Planner</span>
                    </div>
                    {currentView === ViewState.PLANNER && <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />}
                  </button>

                  {/* Road Trips option */}
                  <button
                    onClick={() => {
                      onNavigate(ViewState.ROADTRIPS);
                      setIsMoreOpen(false);
                    }}
                    className={`flex items-center justify-between w-full p-2.5 px-3 rounded-xl text-left text-xs font-bold font-sans transition-all duration-150 border cursor-pointer ${
                      currentView === ViewState.ROADTRIPS
                        ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400 border-primary-500/20'
                        : 'text-light-text dark:text-dark-text bg-transparent border-transparent hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="material-icons-outlined text-lg">directions_car</span>
                      <span>Road Trips</span>
                    </div>
                    {currentView === ViewState.ROADTRIPS && <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />}
                  </button>

                  {/* Settings button option */}
                  <button
                    onClick={() => {
                      onNavigate(ViewState.SETTINGS);
                      setIsMoreOpen(false);
                    }}
                    className={`flex items-center justify-between w-full p-2.5 px-3 rounded-xl text-left text-xs font-bold font-sans transition-all duration-150 border cursor-pointer ${
                      currentView === ViewState.SETTINGS
                        ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400 border-primary-500/20'
                        : 'text-light-text dark:text-dark-text bg-transparent border-transparent hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="material-icons-outlined text-lg">settings</span>
                      <span>Settings</span>
                    </div>
                    {currentView === ViewState.SETTINGS && <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />}
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
                          ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400 border-primary-500/20'
                          : 'text-light-text dark:text-dark-text bg-transparent border-transparent hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center text-2xs font-black text-white shrink-0 ${
                          currentUser.role === 'Partner' ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'
                        }`}>
                          {currentUser.name.charAt(0)}
                        </div>
                        <div className="flex flex-col text-left min-w-0">
                          <span className="truncate max-w-[8rem] text-xs font-bold">{currentUser.name}</span>
                        </div>
                      </div>
                      {currentView === ViewState.USER_DETAIL && <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />}
                    </button>
                  )}
                </div>
              </GlassPanel>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
