
import React, { useEffect, useState } from 'react';
import { ViewState, Trip, User } from '../types';
import { dataService } from '../services/mockDb';
import { motion, AnimatePresence } from 'motion/react';
import GlassPanel from './glass/GlassPanel';
import Icon from './ui/Icon';
import { PAGE_THEMES } from '../config/pageThemes';
import { 
  Moon, 
  Sun, 
  Desktop, 
  SidebarSimple, 
  Compass
} from '@phosphor-icons/react';

interface SidebarProps {
  currentView: ViewState;
  onNavigate: (view: ViewState, id?: string) => void;
  theme: 'light' | 'dark' | 'auto';
  onThemeToggle: (theme: 'light' | 'dark' | 'auto') => void;
  onLogout?: () => void;
  currentUser: User | null;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  onNavigate, 
  theme, 
  onThemeToggle, 
  onLogout, 
  currentUser,
  isCollapsed: controlledIsCollapsed,
  onToggleCollapse,
}) => {
  const [nextTrip, setNextTrip] = useState<Trip | null>(null);
  const [daysUntil, setDaysUntil] = useState<number>(0);
  const [internalIsCollapsed, setInternalIsCollapsed] = useState(false);
  const isCollapsed = controlledIsCollapsed !== undefined ? controlledIsCollapsed : internalIsCollapsed;
  const toggleCollapse = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalIsCollapsed(!internalIsCollapsed);
    }
  };
  const [isDbMode, setIsDbMode] = useState<boolean>(true);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  useEffect(() => {
    setIsDbMode(dataService.isDatabaseMode());
  }, []);

  useEffect(() => {
    const loadNextTrip = () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      dataService.getTrips().then(trips => {
        // Find upcoming or planned future trips where the end date (or start date) hasn't passed yet
        const upcoming = trips
          .filter(t => {
              if (t.status === 'Cancelled' || t.status === 'Past') return false;
              
              if (t.endDate) {
                  return new Date(t.endDate) >= today;
              }
              if (t.startDate) {
                  return new Date(t.startDate) >= today;
              }
              return t.status === 'Planning' || t.status === 'Upcoming';
          })
          .sort((a, b) => {
              const dateA = a.startDate ? new Date(a.startDate).getTime() : Infinity;
              const dateB = b.startDate ? new Date(b.startDate).getTime() : Infinity;
              return dateA - dateB;
          });
        
        if (upcoming.length > 0) {
          const trip = upcoming[0];
          setNextTrip(trip);
          if (trip.startDate) {
            const start = new Date(trip.startDate);
            start.setHours(0, 0, 0, 0);
            const diff = start.getTime() - today.getTime();
            setDaysUntil(Math.ceil(diff / (1000 * 60 * 60 * 24)));
          } else {
            setDaysUntil(0);
          }
        } else {
          setNextTrip(null);
        }
      });
    };

    loadNextTrip();

    const handleDbUpdate = () => {
      loadNextTrip();
    };
    window.addEventListener('wandergrid_db_updated', handleDbUpdate);
    return () => window.removeEventListener('wandergrid_db_updated', handleDbUpdate);
  }, [currentView]);

  const isDark = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const navItems = [
    { label: 'Dashboard', value: ViewState.DASHBOARD, icon: 'grid_view' },
    { label: 'Map', value: ViewState.MAP, icon: 'public' },
    { label: 'Planner', value: ViewState.PLANNER, icon: 'map' }, 
    { label: 'Planner-2', value: ViewState.PLANNER_2, icon: 'calendar_month' }, 
    { label: 'Vacation Calendar', value: ViewState.VACATION_CALENDAR, icon: 'calendar_today' }, 
    { label: 'Travel Atlas', value: ViewState.TRAVEL_ATLAS, icon: 'explore' },
    { label: 'Flights', value: ViewState.FLIGHTS, icon: 'flight_takeoff' }, 
    { label: 'Road Trips', value: ViewState.ROADTRIPS, icon: 'directions_car' }, 
    { label: 'Settings', value: ViewState.SETTINGS, icon: 'settings' },
  ];

  const handleThemeCycle = () => {
      // 3-way toggle: dark -> light -> auto -> dark
      const nextTheme = theme === 'dark' ? 'light' : theme === 'light' ? 'auto' : 'dark';
      onThemeToggle(nextTheme);
  };

  const getThemeIcon = () => {
      return theme === 'dark' ? 'dark_mode' : theme === 'light' ? 'light_mode' : 'auto_mode';
  };

  const getThemeLabel = () => {
      return theme === 'dark' ? 'Dark Mode' : theme === 'light' ? 'Light Mode' : 'Auto (System)';
  };

  const nameParts = currentUser ? currentUser.name.split(' ') : ['Guest', ''];
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ');

  return (
    <>
      {/* Desktop Fixed Sidebar with Liquid Glass */}
      <aside className={`hidden md:flex flex-shrink-0 flex-col fixed top-4 left-4 bottom-4 z-40 transition-all duration-300 pointer-events-none ${isCollapsed ? 'w-20' : 'w-72'}`}>
        <div className="relative w-full h-full pointer-events-auto">
          <GlassPanel
            className="wg-glass-card shadow-2xl h-full flex flex-col"
            overrides={{ borderRadius: 28 }}
            padding="0px"
          >
            <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px]">
              <div className={`p-6 ${isCollapsed ? 'px-2' : 'px-6'} pb-4`}>
                <div className={`flex items-center gap-3.5 mb-8 ${isCollapsed ? 'justify-center' : ''}`}>
                  <img 
                    src="/app-icon.png" 
                    alt="WanderGrid" 
                    className="w-10 h-10 rounded-xl object-contain shrink-0 shadow-md transition-transform group-hover:scale-105" 
                  />
                  {!isCollapsed && (
                     <h1 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight whitespace-nowrap overflow-hidden bg-gradient-to-r from-gray-950 via-zinc-800 to-zinc-900 dark:from-white dark:via-white dark:to-zinc-100 bg-clip-text text-transparent">WanderGrid</h1>
                  )}
                </div>

                <nav className={`flex flex-col gap-1.5 ${isCollapsed ? 'items-center animate-fade-in' : ''}`}>
                  {navItems.map((item) => {
                    const itemTheme = PAGE_THEMES[item.value] || PAGE_THEMES[ViewState.DASHBOARD];
                    const isActive = currentView === item.value;
                    return (
                      <button
                        key={item.value}
                        onClick={() => onNavigate(item.value)}
                        className={`flex items-center gap-4 px-4 py-3 rounded-2xl text-sm font-bold select-none cursor-pointer relative transition-all duration-200 group
                          ${isActive 
                            ? 'font-black z-10' 
                            : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-white hover:bg-zinc-100/50 dark:hover:bg-white/[0.08] z-0'
                          }
                          ${isCollapsed ? 'justify-center px-0 w-12 h-12 border border-transparent' : 'w-full'}
                        `}
                        title={isCollapsed ? item.label : undefined}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="activeTabGlow"
                            className={`absolute inset-0 rounded-2xl ${isDark ? itemTheme.activeSidebarDark : itemTheme.activeSidebarLight}`}
                            transition={{ type: "spring", stiffness: 385, damping: 32 }}
                            style={{ originY: "center" }}
                          />
                        )}
                        <Icon 
                          name={item.icon} 
                          className={`text-xl relative z-20 shrink-0 transition-transform duration-200 group-hover:scale-105 ${itemTheme.color} ${
                            isActive ? 'opacity-100' : 'opacity-75 group-hover:opacity-100'
                          }`} 
                        />
                        {!isCollapsed && (
                          <span className={`relative z-20 font-bold tracking-tight ${isActive ? itemTheme.color : ''}`}>
                            {item.label}
                          </span>
                        )}
                        {isActive && !isCollapsed && (
                          <span className={`ml-auto relative z-20 w-1.5 h-3.5 rounded-full ${itemTheme.indicator}`} />
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className={`mt-auto pb-6 pt-0 animate-fade-in flex flex-col gap-3 ${isCollapsed ? 'px-2 items-center' : 'px-6'}`}>
                {!isCollapsed ? (
                   nextTrip ? (
                    <GlassPanel
                      className="wg-glass-card shadow-lg cursor-pointer hover:scale-[1.01] transition-transform"
                      overrides={{ borderRadius: 20 }}
                      padding="14px"
                    >
                      <div onClick={() => onNavigate(ViewState.TRIP_DETAIL, nextTrip.id)}>
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-2xs font-bold text-zinc-500 dark:text-zinc-300 uppercase tracking-widest">
                            {nextTrip.status === 'Planning' ? 'Planned Trip' : 'Coming Up Next'}
                          </p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            nextTrip.status === 'Planning' 
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20' 
                              : 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20'
                          }`}>
                            {nextTrip.status === 'Planning' ? 'Planned' : 'Confirmed'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mb-1">
                            <span className="text-xl filter drop-shadow">{nextTrip.icon || '✈️'}</span>
                            <p className="font-bold text-xs truncate text-zinc-800 dark:text-white" title={nextTrip.name}>{nextTrip.name}</p>
                        </div>
                        <p className="text-xs font-extrabold tracking-wide text-indigo-600 dark:text-indigo-300">
                            {daysUntil > 0 
                              ? `In ${daysUntil} ${daysUntil === 1 ? 'day' : 'days'}` 
                              : daysUntil === 0 
                              ? (nextTrip.startDate ? 'Starts today!' : 'Timeline pending') 
                              : 'Ongoing'}
                        </p>
                      </div>
                    </GlassPanel>
                  ) : (
                    <div className="p-4 rounded-2xl bg-white/5 dark:bg-white/[0.08] border border-dashed border-zinc-250 dark:border-white/20 text-center">
                      <Compass size={22} weight="duotone" className="w-5 h-5 text-zinc-400 dark:text-zinc-300 mx-auto mb-1.5" />
                      <p className="text-xs font-bold text-zinc-500 dark:text-zinc-300 uppercase tracking-widest leading-none">No trips planned</p>
                      <button 
                          onClick={() => onNavigate(ViewState.PLANNER)} 
                          className="text-xs text-indigo-600 dark:text-indigo-300 font-bold mt-2 hover:underline cursor-pointer"
                      >
                          Plan next adventure
                      </button>
                    </div>
                  )
                ) : (
                   nextTrip ? (
                      <GlassPanel
                        className="wg-glass-pill shadow-md cursor-pointer hover:scale-105 transition-transform flex items-center justify-center w-12 h-12"
                        overrides={{ borderRadius: 16 }}
                        padding="0px"
                      >
                        <button 
                          type="button"
                          onClick={() => onNavigate(ViewState.TRIP_DETAIL, nextTrip.id)}
                          className="w-full h-full flex items-center justify-center cursor-pointer"
                          title={`Next: ${nextTrip.name} (${daysUntil > 0 ? `${daysUntil} days` : 'today'})`}
                        >
                          <span className="text-lg leading-none">{nextTrip.icon || '✈️'}</span>
                        </button>
                      </GlassPanel>
                  ) : null
                )}

                {/* Bottom Action Cluster: User Profile, Theme Toggle (Dark/Light/Auto), Collapse Button */}
                <div className={`pt-3 border-t border-zinc-200/50 dark:border-white/10 ${
                    isCollapsed 
                      ? 'flex flex-col items-center gap-2.5 w-full' 
                      : 'flex items-center justify-between px-1'
                }`}>
                    {/* 1. User Profile Avatar with User Photo */}
                    {currentUser && (
                        <button 
                            onClick={() => onNavigate(ViewState.USER_DETAIL, currentUser.id)}
                            className={`${isCollapsed ? 'w-10 h-10' : 'w-9 h-9'} rounded-xl flex items-center justify-center transition-all border cursor-pointer overflow-hidden p-0.5 group hover:scale-105 active:scale-95 ${
                                currentView === ViewState.USER_DETAIL 
                                ? `${isDark ? PAGE_THEMES[ViewState.USER_DETAIL].activeSidebarDark : PAGE_THEMES[ViewState.USER_DETAIL].activeSidebarLight} border-primary-500/50` 
                                : 'bg-transparent border-transparent hover:border-zinc-200/40 dark:hover:border-white/20 hover:bg-zinc-200/30 dark:hover:bg-white/[0.08]'
                            }`}
                            title={`Profile: ${currentUser.name} (${currentUser.role})`}
                        >
                            <img 
                                src={currentUser.profilePicture || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'} 
                                alt={currentUser.name} 
                                className="w-full h-full object-cover rounded-[10px] shadow-sm"
                                referrerPolicy="no-referrer"
                            />
                        </button>
                    )}

                    {/* 2. Theme Toggle (Dark / Light / Auto) */}
                    <button 
                        onClick={handleThemeCycle}
                        className={`${isCollapsed ? 'w-10 h-10' : 'w-9 h-9'} rounded-xl flex items-center justify-center text-zinc-500 hover:text-zinc-800 dark:text-zinc-200 dark:hover:text-white hover:bg-zinc-200/30 dark:hover:bg-white/[0.08] transition-all cursor-pointer hover:scale-105 active:scale-95`}
                        title={
                          theme === 'dark' 
                            ? 'Appearance: Dark Mode (Click for Light)' 
                            : theme === 'light' 
                            ? 'Appearance: Light Mode (Click for Auto)' 
                            : 'Appearance: System Auto (Click for Dark)'
                        }
                    >
                        {theme === 'dark' ? (
                          <Moon weight="duotone" className="w-5 h-5 text-indigo-400" />
                        ) : theme === 'light' ? (
                          <Sun weight="duotone" className="w-5 h-5 text-amber-500" />
                        ) : (
                          <Desktop weight="duotone" className="w-5 h-5 text-sky-400" />
                        )}
                    </button>

                    {/* 3. Collapse Button (Moved from top right of sidebar) */}
                    <button 
                        onClick={toggleCollapse}
                        className={`${isCollapsed ? 'w-10 h-10' : 'w-9 h-9'} rounded-xl flex items-center justify-center text-zinc-500 hover:text-zinc-800 dark:text-zinc-200 dark:hover:text-white hover:bg-zinc-200/30 dark:hover:bg-white/[0.08] transition-all cursor-pointer hover:scale-105 active:scale-95`}
                        title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                    >
                        <SidebarSimple weight="duotone" className="w-5 h-5" />
                    </button>
                </div>
              </div>
            </div>
          </GlassPanel>
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
              { label: 'Dashboard', shortLabel: 'Dashboard', value: ViewState.DASHBOARD, icon: 'grid_view' },
              { label: 'Flights', shortLabel: 'Flights', value: ViewState.FLIGHTS, icon: 'flight_takeoff' },
              { label: 'Map', shortLabel: 'Map', value: ViewState.MAP, icon: 'public' },
              { label: 'Travel Atlas', shortLabel: 'Atlas', value: ViewState.TRAVEL_ATLAS, icon: 'explore' },
            ].map((item) => {
              const isActive = currentView === item.value;
              const itemTheme = PAGE_THEMES[item.value] || PAGE_THEMES[ViewState.DASHBOARD];
              return (
                <button
                  key={item.value}
                  onClick={() => {
                    onNavigate(item.value);
                    setIsMoreOpen(false);
                  }}
                  className={`flex flex-col items-center justify-center flex-1 h-14 min-w-0 rounded-2xl transition-all duration-300 relative select-none cursor-pointer px-0.5
                    ${isActive 
                      ? `${itemTheme.color} font-extrabold scale-105` 
                      : 'text-gray-500 dark:text-zinc-200 hover:text-gray-900 dark:hover:text-white'
                    }`}
                >
                  <Icon name={item.icon} className={`text-xl leading-none ${isActive ? itemTheme.color : ''}`} />
                  <span className={`text-[10px] font-bold uppercase tracking-tight mt-1 text-center leading-tight max-w-full truncate font-sans ${isActive ? itemTheme.color : ''}`}>
                    {item.shortLabel || item.label}
                  </span>
                  {isActive && (
                    <motion.div 
                      layoutId="mobileActiveIndicatorDot"
                      className="absolute -bottom-1 w-1.5 h-1.5 rounded-full"
                      style={{ 
                        backgroundColor: itemTheme.accentHex,
                        boxShadow: `0 0 8px 0 ${itemTheme.accentHex}` 
                      }}
                      transition={{ type: "spring", stiffness: 350, damping: 25 }}
                    />
                  )}
                </button>
              );
            })}

            {/* Dynamic More popup trigger */}
            {(() => {
              const isMoreActive = (currentView === ViewState.PLANNER || currentView === ViewState.PLANNER_2 || currentView === ViewState.VACATION_CALENDAR || currentView === ViewState.SETTINGS || currentView === ViewState.USER_DETAIL || currentView === ViewState.ROADTRIPS);
              const moreTheme = isMoreActive ? (PAGE_THEMES[currentView] || PAGE_THEMES[ViewState.PLANNER]) : null;
              return (
                <button
                  onClick={() => setIsMoreOpen(!isMoreOpen)}
                  className={`flex flex-col items-center justify-center flex-1 h-14 min-w-0 rounded-2xl transition-all duration-300 relative select-none cursor-pointer px-0.5
                    ${isMoreActive
                      ? `${moreTheme?.color} font-extrabold scale-105`
                      : 'text-gray-500 dark:text-zinc-200 hover:text-gray-900 dark:hover:text-white'
                    }`}
                >
                  <Icon name="more_horiz" className={`text-xl leading-none ${isMoreActive ? moreTheme?.color : ''}`} />
                  <span className={`text-[10px] font-bold uppercase tracking-tight mt-1 text-center leading-tight font-sans ${isMoreActive ? moreTheme?.color : ''}`}>More</span>
                  {isMoreActive && (
                    <motion.div 
                      layoutId="mobileActiveIndicatorDot"
                      className="absolute -bottom-1 w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: moreTheme?.accentHex,
                        boxShadow: `0 0 8px 0 ${moreTheme?.accentHex}`
                      }}
                      transition={{ type: "spring", stiffness: 350, damping: 25 }}
                    />
                  )}
                </button>
              );
            })()}
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
              className="md:hidden fixed inset-0 bg-black/25 dark:bg-black/50 backdrop-blur-xs z-[55]"
              style={{ WebkitBackdropFilter: 'blur(4px)' }}
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
                        ? `${isDark ? PAGE_THEMES[ViewState.PLANNER].activeSidebarDark : PAGE_THEMES[ViewState.PLANNER].activeSidebarLight} ${PAGE_THEMES[ViewState.PLANNER].color}`
                        : 'text-light-text dark:text-dark-text bg-transparent border-transparent hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon name="map" className={`text-lg ${PAGE_THEMES[ViewState.PLANNER].color}`} />
                      <span>Planner</span>
                    </div>
                    {currentView === ViewState.PLANNER && (
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PAGE_THEMES[ViewState.PLANNER].accentHex }} />
                    )}
                  </button>

                  {/* Planner-2 button option */}
                  <button
                    onClick={() => {
                      onNavigate(ViewState.PLANNER_2);
                      setIsMoreOpen(false);
                    }}
                    className={`flex items-center justify-between w-full p-2.5 px-3 rounded-xl text-left text-xs font-bold font-sans transition-all duration-150 border cursor-pointer ${
                      currentView === ViewState.PLANNER_2
                        ? `${isDark ? PAGE_THEMES[ViewState.PLANNER_2].activeSidebarDark : PAGE_THEMES[ViewState.PLANNER_2].activeSidebarLight} ${PAGE_THEMES[ViewState.PLANNER_2].color}`
                        : 'text-light-text dark:text-dark-text bg-transparent border-transparent hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon name="calendar_month" className={`text-lg ${PAGE_THEMES[ViewState.PLANNER_2].color}`} />
                      <span>Planner-2</span>
                    </div>
                    {currentView === ViewState.PLANNER_2 && (
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PAGE_THEMES[ViewState.PLANNER_2].accentHex }} />
                    )}
                  </button>

                  {/* Vacation Calendar option */}
                  <button
                    onClick={() => {
                      onNavigate(ViewState.VACATION_CALENDAR);
                      setIsMoreOpen(false);
                    }}
                    className={`flex items-center justify-between w-full p-2.5 px-3 rounded-xl text-left text-xs font-bold font-sans transition-all duration-150 border cursor-pointer ${
                      currentView === ViewState.VACATION_CALENDAR
                        ? `${isDark ? PAGE_THEMES[ViewState.VACATION_CALENDAR].activeSidebarDark : PAGE_THEMES[ViewState.VACATION_CALENDAR].activeSidebarLight} ${PAGE_THEMES[ViewState.VACATION_CALENDAR].color}`
                        : 'text-light-text dark:text-dark-text bg-transparent border-transparent hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon name="calendar_today" className={`text-lg ${PAGE_THEMES[ViewState.VACATION_CALENDAR].color}`} />
                      <span>Vacation Calendar</span>
                    </div>
                    {currentView === ViewState.VACATION_CALENDAR && (
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PAGE_THEMES[ViewState.VACATION_CALENDAR].accentHex }} />
                    )}
                  </button>

                  {/* Road Trips option */}
                  <button
                    onClick={() => {
                      onNavigate(ViewState.ROADTRIPS);
                      setIsMoreOpen(false);
                    }}
                    className={`flex items-center justify-between w-full p-2.5 px-3 rounded-xl text-left text-xs font-bold font-sans transition-all duration-150 border cursor-pointer ${
                      currentView === ViewState.ROADTRIPS
                        ? `${isDark ? PAGE_THEMES[ViewState.ROADTRIPS].activeSidebarDark : PAGE_THEMES[ViewState.ROADTRIPS].activeSidebarLight} ${PAGE_THEMES[ViewState.ROADTRIPS].color}`
                        : 'text-light-text dark:text-dark-text bg-transparent border-transparent hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon name="directions_car" className={`text-lg ${PAGE_THEMES[ViewState.ROADTRIPS].color}`} />
                      <span>Road Trips</span>
                    </div>
                    {currentView === ViewState.ROADTRIPS && (
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PAGE_THEMES[ViewState.ROADTRIPS].accentHex }} />
                    )}
                  </button>

                  {/* Settings button option */}
                  <button
                    onClick={() => {
                      onNavigate(ViewState.SETTINGS);
                      setIsMoreOpen(false);
                    }}
                    className={`flex items-center justify-between w-full p-2.5 px-3 rounded-xl text-left text-xs font-bold font-sans transition-all duration-150 border cursor-pointer ${
                      currentView === ViewState.SETTINGS
                        ? `${isDark ? PAGE_THEMES[ViewState.SETTINGS].activeSidebarDark : PAGE_THEMES[ViewState.SETTINGS].activeSidebarLight} ${PAGE_THEMES[ViewState.SETTINGS].color}`
                        : 'text-light-text dark:text-dark-text bg-transparent border-transparent hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon name="gear" className={`text-lg ${PAGE_THEMES[ViewState.SETTINGS].color}`} />
                      <span>Settings</span>
                    </div>
                    {currentView === ViewState.SETTINGS && (
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PAGE_THEMES[ViewState.SETTINGS].accentHex }} />
                    )}
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
                          ? `${isDark ? PAGE_THEMES[ViewState.USER_DETAIL].activeSidebarDark : PAGE_THEMES[ViewState.USER_DETAIL].activeSidebarLight} ${PAGE_THEMES[ViewState.USER_DETAIL].color}`
                          : 'text-light-text dark:text-dark-text bg-transparent border-transparent hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-md flex items-center justify-center overflow-hidden shrink-0 shadow-xs border border-white/10">
                          <img 
                            src={currentUser.profilePicture || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'} 
                            alt={currentUser.name} 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer" 
                          />
                        </div>
                        <div className="flex flex-col text-left min-w-0">
                          <span className="truncate max-w-[8rem] text-xs font-bold">{currentUser.name}</span>
                        </div>
                      </div>
                      {currentView === ViewState.USER_DETAIL && (
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PAGE_THEMES[ViewState.USER_DETAIL].accentHex }} />
                      )}
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
