import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MorphicNavbar } from '../kokonutui/split-nav';
import SwitchButton from '../kokonutui/switch-button';
import {
    Airplane, CalendarBlank, DotsThreeOutline, Gear, Globe, House, MapTrifold, Plus, SignOut, Suitcase, type Icon,
} from '../ui/hugeicons';
import type { User } from '../../types';
import { RpSheet } from './ui';
import { cn } from '../../utils/cn';
import './new.css';

/**
 * App shell for the New pages (UI_UX_DESIGN_REFERENCE.md §2.1, §2.4, §5.0): grouped top tabs on
 * tablet and desktop, a bottom tab bar with a centre "+" on mobile. It only wraps `-new` URLs.
 */

export interface ShellNavItem {
    path: string;
    label: string;
    icon: Icon;
}

/** Grouped top tabs (decision 6). Pages without a New version open their current page. */
export const SHELL_NAV: ShellNavItem[] = [
    { path: '/', label: 'Dashboard', icon: House },
    { path: '/planner', label: 'Trips', icon: Suitcase },
    { path: '/flights', label: 'Flights', icon: Airplane },
    { path: '/calendar', label: 'Calendar', icon: CalendarBlank },
    { path: '/atlas', label: 'Atlas', icon: Globe },
    { path: '/map-new', label: 'Map', icon: MapTrifold },
];

const MOBILE_TABS = ['/', '/planner', '/map-new', '/flights'];

export interface ShellNewProps {
    currentPath: string;
    onNavigate: (path: string) => void;
    user: User | null;
    isDark: boolean;
    onThemeChange: (theme: 'light' | 'dark') => void;
    onLogout: () => void;
    localMode?: boolean;
    /** Page content fills the shell and the header floats above it (the map). */
    fullBleed?: boolean;
    children: ReactNode;
}

const initials = (name?: string) =>
    (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join('');

const AccountButton: React.FC<{ user: User | null; onNavigate: (p: string) => void; onLogout: () => void }> = ({ user, onNavigate, onLogout }) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('pointerdown', onDown);
        window.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
    }, [open]);
    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                aria-label="Account"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen(o => !o)}
                className="flex size-11 items-center justify-center rounded-full bg-rp-mustard text-sm font-semibold text-rp-on-mustard rp-shadow-rest outline-none focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-canvas"
            >
                {initials(user?.name)}
            </button>
            <AnimatePresence>
                {open ? (
                    <motion.div
                        role="menu"
                        initial={{ opacity: 0, scale: 0.96, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: -4 }}
                        transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                        className="absolute right-0 top-full z-popover mt-2 w-60 origin-top-right rounded-rp-tile bg-rp-surface p-2 rp-shadow-float"
                    >
                        <div className="px-3 pt-2 pb-3">
                            <p className="truncate text-sm font-medium text-rp-ink">{user?.name}</p>
                            <p className="truncate text-xs text-rp-muted">{user?.email}</p>
                        </div>
                        <button role="menuitem" type="button" onClick={() => { setOpen(false); onNavigate('/settings'); }} className="flex min-h-11 w-full items-center gap-3 rounded-[14px] px-3 text-sm text-rp-ink hover:bg-rp-inset">
                            <Gear size={18} /> Settings
                        </button>
                        <button role="menuitem" type="button" onClick={() => { setOpen(false); onLogout(); }} className="flex min-h-11 w-full items-center gap-3 rounded-[14px] px-3 text-sm text-rp-ink hover:bg-rp-inset">
                            <SignOut size={18} /> Sign out
                        </button>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    );
};

export const ShellNew: React.FC<ShellNewProps> = ({ currentPath, onNavigate, user, isDark, onThemeChange, onLogout, localMode, fullBleed, children }) => {
    const [sheet, setSheet] = useState<'more' | 'add' | null>(null);
    const navItems = Object.fromEntries(SHELL_NAV.map(i => [i.path, { name: i.label }]));
    const go = (path: string) => { setSheet(null); onNavigate(path); };

    return (
        <div className="rp-root rp-canvas-glow relative flex h-[100dvh] w-full flex-col overflow-hidden bg-rp-canvas font-rp text-rp-ink antialiased">
            {/* Header: floats over full-bleed pages */}
            <header
                className={cn(
                    'pointer-events-none z-sticky flex items-center justify-between gap-3 px-3 pt-[calc(12px+env(safe-area-inset-top,0px))] sm:px-4',
                    fullBleed ? 'absolute inset-x-0 top-0' : 'relative pb-3'
                )}
            >
                <button
                    type="button"
                    onClick={() => go('/')}
                    aria-label="WanderGrid home"
                    className="pointer-events-auto flex min-h-11 items-center gap-2.5 rounded-full bg-rp-surface py-1.5 pr-4 pl-1.5 rp-shadow-rest outline-none focus-visible:ring-2 focus-visible:ring-rp-muted"
                >
                    <span className="flex size-8 items-center justify-center rounded-[10px] bg-rp-ink text-sm font-semibold text-rp-on-ink">W</span>
                    <span className="hidden text-base font-medium text-rp-ink sm:inline">WanderGrid</span>
                </button>

                <div className="pointer-events-auto hidden min-w-0 md:block">
                    <MorphicNavbar items={navItems} currentPath={currentPath} onNavigate={go} className="px-0 py-0" />
                </div>

                <div className="pointer-events-auto flex items-center gap-2">
                    {localMode ? (
                        <span className="hidden min-h-8 items-center rounded-full bg-rp-mustard px-3 text-xs font-medium text-rp-on-mustard lg:inline-flex" role="status">
                            Local mode
                        </span>
                    ) : null}
                    <SwitchButton
                        showLabel={false}
                        className="rp-shadow-rest"
                        theme={isDark ? 'dark' : 'light'}
                        onThemeChange={onThemeChange}
                    />
                    <AccountButton user={user} onNavigate={go} onLogout={onLogout} />
                </div>
            </header>

            <main className="relative min-h-0 flex-1">{children}</main>

            {/* Mobile bottom tab bar (decision 7) */}
            <nav aria-label="Main" className="pointer-events-none absolute inset-x-0 bottom-0 z-sticky px-3 pb-[calc(10px+env(safe-area-inset-bottom,0px))] md:hidden">
                <div className="pointer-events-auto mx-auto flex max-w-md items-center justify-between rounded-full bg-rp-ink p-1.5 rp-shadow-float">
                    {MOBILE_TABS.slice(0, 2).map(path => <TabButton key={path} path={path} active={currentPath === path} onClick={() => go(path)} />)}
                    <button
                        type="button"
                        aria-label="Quick actions"
                        onClick={() => setSheet('add')}
                        className="flex size-12 items-center justify-center rounded-full bg-rp-mustard text-rp-on-mustard outline-none focus-visible:ring-2 focus-visible:ring-rp-on-ink"
                    >
                        <Plus size={22} />
                    </button>
                    {MOBILE_TABS.slice(2).map(path => <TabButton key={path} path={path} active={currentPath === path} onClick={() => go(path)} />)}
                    <button
                        type="button"
                        aria-label="More"
                        onClick={() => setSheet('more')}
                        className="flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-full px-2 text-rp-on-ink/70 outline-none focus-visible:ring-2 focus-visible:ring-rp-on-ink"
                    >
                        <DotsThreeOutline size={20} />
                        <span className="text-xs">More</span>
                    </button>
                </div>
            </nav>

            <RpSheet open={sheet === 'more'} onClose={() => setSheet(null)} title="More">
                <div className="flex flex-col gap-1">
                    {SHELL_NAV.filter(i => !MOBILE_TABS.includes(i.path)).map(i => (
                        <button key={i.path} type="button" onClick={() => go(i.path)} className="flex min-h-12 items-center gap-3 rounded-rp-inset px-3 text-base text-rp-ink hover:bg-rp-inset">
                            <i.icon size={20} /> {i.label}
                        </button>
                    ))}
                    <button type="button" onClick={() => go('/settings')} className="flex min-h-12 items-center gap-3 rounded-rp-inset px-3 text-base text-rp-ink hover:bg-rp-inset">
                        <Gear size={20} /> Settings
                    </button>
                    <button type="button" onClick={() => { setSheet(null); onLogout(); }} className="flex min-h-12 items-center gap-3 rounded-rp-inset px-3 text-base text-rp-ink hover:bg-rp-inset">
                        <SignOut size={20} /> Sign out
                    </button>
                </div>
            </RpSheet>
            <RpSheet open={sheet === 'add'} onClose={() => setSheet(null)} title="Quick actions">
                <div className="flex flex-col gap-1">
                    <button type="button" onClick={() => go('/planner')} className="flex min-h-12 items-center gap-3 rounded-rp-inset px-3 text-base text-rp-ink hover:bg-rp-inset">
                        <Suitcase size={20} /> New trip
                    </button>
                    <button type="button" onClick={() => go('/flights')} className="flex min-h-12 items-center gap-3 rounded-rp-inset px-3 text-base text-rp-ink hover:bg-rp-inset">
                        <Airplane size={20} /> Log a flight
                    </button>
                </div>
            </RpSheet>
        </div>
    );
};

const TabButton: React.FC<{ path: string; active: boolean; onClick: () => void }> = ({ path, active, onClick }) => {
    const item = SHELL_NAV.find(i => i.path === path)!;
    return (
        <button
            type="button"
            onClick={onClick}
            aria-current={active ? 'page' : undefined}
            className={cn(
                'flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-full px-2 outline-none focus-visible:ring-2 focus-visible:ring-rp-on-ink',
                active ? 'text-rp-on-ink' : 'text-rp-on-ink/70'
            )}
        >
            <item.icon size={20} />
            <span className="text-xs">{item.label}</span>
        </button>
    );
};
