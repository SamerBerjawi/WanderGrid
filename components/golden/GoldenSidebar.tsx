import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { affectsCollections } from '../../hooks/useWanderSync';
import { dataService } from '../../services/mockDb';
import { Trip, User, ViewState } from '../../types';
import { APP_VERSION } from '../../version';
import Icon from '../ui/Icon';
import { Compass, Moon, SidebarSimple, SignOut, Sun, Desktop } from '@/components/ui/hugeicons';
import { GhTone } from './Gh';

interface GoldenSidebarProps {
  currentView: ViewState;
  onNavigate: (view: ViewState, id?: string) => void;
  theme: 'light' | 'dark' | 'auto';
  onThemeToggle: (theme: 'light' | 'dark' | 'auto') => void;
  onLogout?: () => void;
  currentUser: User | null;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const TONE_BG: Record<GhTone, string> = {
  surface: 'bg-white',
  coral: 'bg-sunset-orange text-white',
  sun: 'bg-sunset-sun text-sunset-ink',
  teal: 'bg-sunset-teal text-sunset-ink',
  lilac: 'bg-sunset-lilac text-sunset-ink',
  ink: 'bg-sunset-ink text-white',
};

const NAV: { label: string; short: string; value: ViewState; icon: string; tone: GhTone }[] = [
  { label: 'Dashboard', short: 'Home', value: ViewState.DASHBOARD, icon: 'grid_view', tone: 'coral' },
  { label: 'Map', short: 'Map', value: ViewState.MAP, icon: 'public', tone: 'lilac' },
  { label: 'Planner', short: 'Planner', value: ViewState.PLANNER, icon: 'map', tone: 'teal' },
  { label: 'Vacation Calendar', short: 'Calendar', value: ViewState.VACATION_CALENDAR, icon: 'calendar_today', tone: 'sun' },
  { label: 'Travel Atlas', short: 'Atlas', value: ViewState.TRAVEL_ATLAS, icon: 'explore', tone: 'coral' },
  { label: 'Flights', short: 'Flights', value: ViewState.FLIGHTS, icon: 'flight_takeoff', tone: 'lilac' },
  { label: 'Road Trips', short: 'Journeys', value: ViewState.ROADTRIPS, icon: 'directions_car', tone: 'teal' },
  { label: 'Settings', short: 'Settings', value: ViewState.SETTINGS, icon: 'settings', tone: 'sun' },
];

const MOBILE_MAIN = [ViewState.DASHBOARD, ViewState.FLIGHTS, ViewState.MAP, ViewState.TRAVEL_ATLAS];

/** Golden Hour navigation: solid rounded rail on desktop, floating pill bar and sheet on mobile. */
export const GoldenSidebar: React.FC<GoldenSidebarProps> = ({
  currentView, onNavigate, theme, onThemeToggle, onLogout, currentUser, isCollapsed = false, onToggleCollapse,
}) => {
  const [nextTrip, setNextTrip] = useState<Trip | null>(null);
  const [daysUntil, setDaysUntil] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const load = () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dataService.getTrips().then(trips => {
        const upcoming = trips
          .filter(t => t.status !== 'Cancelled' && t.status !== 'Past' && (t.endDate ? new Date(t.endDate) >= today : t.startDate ? new Date(t.startDate) >= today : true))
          .sort((a, b) => (a.startDate ? new Date(a.startDate).getTime() : Infinity) - (b.startDate ? new Date(b.startDate).getTime() : Infinity));
        const trip = upcoming[0] ?? null;
        setNextTrip(trip);
        if (trip?.startDate) {
          const start = new Date(trip.startDate);
          start.setHours(0, 0, 0, 0);
          setDaysUntil(Math.ceil((start.getTime() - today.getTime()) / 86_400_000));
        } else setDaysUntil(0);
      });
    };
    load();
    const onUpdate = (e: Event) => { if (affectsCollections(e, ['trips'])) load(); };
    window.addEventListener('wandergrid_db_updated', onUpdate);
    return () => window.removeEventListener('wandergrid_db_updated', onUpdate);
  }, [currentView]);

  const nextTheme = theme === 'dark' ? 'light' : theme === 'light' ? 'auto' : 'dark';
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Desktop;
  const themeLabel = theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'Auto';
  const initial = (currentUser?.name || currentUser?.email || '?').charAt(0).toUpperCase();
  const mainItems = useMemo(() => NAV.filter(n => MOBILE_MAIN.includes(n.value)), []);
  const moreItems = useMemo(() => NAV.filter(n => !MOBILE_MAIN.includes(n.value)), []);
  const moreActive = moreItems.some(n => n.value === currentView) || currentView === ViewState.USER_DETAIL;

  const go = (v: ViewState, id?: string) => { setMoreOpen(false); onNavigate(v, id); };

  return (
    <>
      <aside className={`hidden md:flex flex-shrink-0 flex-col fixed top-4 left-4 bottom-4 z-sticky transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-72'}`}>
        <div className="h-full rounded-[28px] bg-white dark:bg-sunset-plum shadow-card flex flex-col p-3 gap-3 text-sunset-ink dark:text-white">
          <div className={`flex items-center gap-3 p-2 ${isCollapsed ? 'justify-center' : ''}`}>
            <div className="w-11 h-11 rounded-2xl bg-sunset-coral text-white flex items-center justify-center shrink-0">
              <Compass className="w-6 h-6" weight="duotone" />
            </div>
            {!isCollapsed && <span className="text-xl font-black tracking-tight">WanderGrid</span>}
          </div>

          <nav className="flex-1 flex flex-col gap-1.5 overflow-y-auto no-scrollbar" aria-label="Main">
            {NAV.map(item => {
              const active = currentView === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => go(item.value)}
                  aria-label={item.label}
                  aria-current={active ? 'page' : undefined}
                  title={isCollapsed ? item.label : undefined}
                  className={`min-h-[44px] flex items-center gap-3 rounded-full px-3 text-sm font-semibold cursor-pointer transition-all ${isCollapsed ? 'justify-center' : ''} ${
                    active ? `${TONE_BG[item.tone]} shadow-card` : 'hover:bg-sunset-sand dark:hover:bg-sunset-dusk'
                  }`}
                >
                  <Icon name={item.icon} className="text-xl leading-none shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </nav>

          {!isCollapsed && (
            <button
              type="button"
              disabled={!nextTrip}
              onClick={() => nextTrip && go(ViewState.TRIP_DETAIL, nextTrip.id)}
              className="rounded-3xl bg-sunset-orange text-white p-4 text-left cursor-pointer min-h-[44px]"
              aria-label={nextTrip ? `Open next trip ${nextTrip.name}` : 'No trip planned'}
            >
              <div className="text-2xs font-semibold uppercase tracking-wider opacity-90">Coming up</div>
              <div className="text-base font-black leading-tight truncate">{nextTrip ? nextTrip.name : 'No trip yet'}</div>
              <div className="text-xs font-semibold opacity-90">{nextTrip ? (daysUntil <= 0 ? 'Happening now' : `${daysUntil} days to go`) : 'Plan your next one'}</div>
            </button>
          )}

          <div className={`flex items-center gap-2 ${isCollapsed ? 'flex-col' : 'justify-between'}`}>
            <button
              type="button"
              onClick={() => currentUser && go(ViewState.USER_DETAIL, currentUser.id)}
              aria-label="Open your profile"
              className="w-11 h-11 rounded-full bg-sunset-lilac text-sunset-ink font-black flex items-center justify-center cursor-pointer shrink-0"
            >
              {initial}
            </button>
            <div className={`flex items-center gap-1 ${isCollapsed ? 'flex-col' : ''}`}>
              <button type="button" onClick={() => onThemeToggle(nextTheme)} aria-label={`Theme: ${themeLabel}. Switch theme`} className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-sunset-sand dark:hover:bg-sunset-dusk cursor-pointer">
                <ThemeIcon className="w-5 h-5" />
              </button>
              {onLogout && (
                <button type="button" onClick={onLogout} aria-label="Sign out" className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-sunset-sand dark:hover:bg-sunset-dusk cursor-pointer">
                  <SignOut className="w-5 h-5" />
                </button>
              )}
              <button type="button" onClick={onToggleCollapse} aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-sunset-sand dark:hover:bg-sunset-dusk cursor-pointer">
                <SidebarSimple className="w-5 h-5" />
              </button>
            </div>
          </div>
          {!isCollapsed && <div className="text-center text-2xs font-semibold opacity-50">{APP_VERSION}</div>}
        </div>
      </aside>

      <div className="flex md:hidden fixed bottom-safe-nav left-0 right-0 z-modal-backdrop justify-center px-3 pointer-events-none safe-x">
        <nav aria-label="Main" className="pointer-events-auto w-full max-w-md rounded-full bg-white dark:bg-sunset-plum shadow-modal flex items-center justify-around p-1.5 text-sunset-ink dark:text-white">
          {[...mainItems, null].map(item => {
            const active = item ? currentView === item.value : moreActive;
            const tone = item ? item.tone : 'sun';
            return (
              <button
                key={item ? item.value : 'more'}
                type="button"
                onClick={() => (item ? go(item.value) : setMoreOpen(o => !o))}
                aria-label={item ? item.label : 'More'}
                aria-expanded={item ? undefined : moreOpen}
                aria-current={active ? 'page' : undefined}
                className={`flex-1 min-w-0 min-h-[44px] h-14 rounded-full flex flex-col items-center justify-center text-2xs font-bold cursor-pointer transition-all ${active ? TONE_BG[tone] : ''}`}
              >
                <Icon name={item ? item.icon : 'more_horiz'} className="text-xl leading-none" />
                <span className="truncate max-w-full">{item ? item.short : 'More'}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="md:hidden fixed inset-0 bg-sunset-ink/40 z-modal-backdrop" onClick={() => setMoreOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
              className="md:hidden fixed bottom-safe-menu left-4 right-4 z-modal rounded-[28px] bg-white dark:bg-sunset-plum shadow-modal p-3 flex flex-col gap-1.5 text-sunset-ink dark:text-white"
            >
              {moreItems.map(item => (
                <button key={item.value} type="button" onClick={() => go(item.value)} aria-current={currentView === item.value ? 'page' : undefined} className={`min-h-[44px] rounded-full px-4 flex items-center gap-3 text-sm font-semibold cursor-pointer ${currentView === item.value ? TONE_BG[item.tone] : ''}`}>
                  <Icon name={item.icon} className="text-xl leading-none" />
                  {item.label}
                </button>
              ))}
              {currentUser && (
                <button type="button" onClick={() => go(ViewState.USER_DETAIL, currentUser.id)} aria-current={currentView === ViewState.USER_DETAIL ? 'page' : undefined} className={`min-h-[44px] rounded-full px-4 flex items-center gap-3 text-sm font-semibold cursor-pointer ${currentView === ViewState.USER_DETAIL ? TONE_BG.lilac : ''}`}>
                  <span className="w-7 h-7 rounded-full bg-sunset-lilac text-sunset-ink font-black text-xs flex items-center justify-center">{initial}</span>
                  Your profile
                </button>
              )}
              <div className="flex items-center gap-2 pt-1">
                <button type="button" onClick={() => onThemeToggle(nextTheme)} className="flex-1 min-h-[44px] rounded-full bg-sunset-sand dark:bg-sunset-dusk text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer">
                  <ThemeIcon className="w-4 h-4" /> {themeLabel}
                </button>
                {onLogout && (
                  <button type="button" onClick={() => { setMoreOpen(false); onLogout(); }} className="flex-1 min-h-[44px] rounded-full bg-sunset-sand dark:bg-sunset-dusk text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer">
                    <SignOut className="w-4 h-4" /> Sign out
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

export default GoldenSidebar;
