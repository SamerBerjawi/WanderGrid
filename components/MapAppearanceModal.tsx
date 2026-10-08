import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    X,
    ArrowsClockwise as RefreshCw,
    MapTrifold as MapIcon,
    Airplane as Plane,
    Stack as Layers,
    Compass,
    Sparkle as Sparkles,
    Globe,
    SlidersHorizontal,
    Moon,
    Funnel as Filter,
    Play,
    Radio,
    Lightning as Zap,
    CaretLeft,
    CaretRight
} from '@phosphor-icons/react';
import { MapAppearanceSettings, DEFAULT_MAP_APPEARANCE, getEffectiveBasemap, getYesterdayDateString, adjustDateString } from '../types/mapAppearance';
import { FEATURE_FLAGS } from '../config/featureFlags';
import GlassPanel from './glass/GlassPanel';

const useDarkMode = () => {
    const [isDark, setIsDark] = useState(() => {
        if (typeof document !== 'undefined') {
            return document.documentElement.classList.contains('dark');
        }
        return false;
    });
    useEffect(() => {
        const observer = new MutationObserver(() => {
            setIsDark(document.documentElement.classList.contains('dark'));
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);
    return isDark;
};

export interface MapAppearanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: MapAppearanceSettings;
    onChangeSettings: (newSettings: MapAppearanceSettings) => void;
    onResetCamera?: () => void;
    // Optional Expedition view mode & dynamics controls (when used in ExpeditionMapView or interactive views)
    viewMode?: 'flights' | 'land_sea' | 'scratch' | 'all';
    onSelectViewMode?: (mode: 'flights' | 'land_sea' | 'scratch' | 'all') => void;
    showIndependentFlights?: boolean;
    onToggleIndependentFlights?: () => void;
    showLandSeaRoutes?: boolean;
    onToggleLandSeaRoutes?: () => void;
    animateRoutes?: boolean;
    onToggleAnimateRoutes?: () => void;
    clusterMode?: boolean;
    onToggleClusterMode?: () => void;
    showRoadTracing?: boolean;
    onToggleRoadTracing?: () => void;
    // Optional 4th tab: Filters
    filterTabContent?: React.ReactNode;
}

export const MapAppearanceModal: React.FC<MapAppearanceModalProps> = ({
    isOpen,
    onClose,
    settings,
    onChangeSettings,
    onResetCamera,
    viewMode,
    onSelectViewMode,
    showIndependentFlights,
    onToggleIndependentFlights,
    showLandSeaRoutes,
    onToggleLandSeaRoutes,
    animateRoutes,
    onToggleAnimateRoutes,
    clusterMode,
    onToggleClusterMode,
    showRoadTracing,
    onToggleRoadTracing,
    filterTabContent
}) => {
    const isDark = useDarkMode();
    const [activeTab, setActiveTab] = useState<'cartography' | 'aviation' | 'atmosphere' | 'filters'>('cartography');
    const [hasOpenAipKey, setHasOpenAipKey] = useState<boolean>(true);
    const [cartoKey, setCartoKey] = useState<string>('');

    // Internal state fallbacks when dynamics handlers are not passed by parent view
    const [internalFlightsOnly, setInternalFlightsOnly] = useState(false);
    const [internalLandSea, setInternalLandSea] = useState(false);
    const [internalCometFlow, setInternalCometFlow] = useState(true);
    const [internalCluster, setInternalCluster] = useState(false);

    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => setIsVisible(true), 20);
            return () => clearTimeout(timer);
        } else {
            setIsVisible(false);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                handleClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    const handleClose = () => {
        setIsVisible(false);
        setTimeout(onClose, 250);
    };

    useEffect(() => {
        if (!isOpen) return;
        try {
            const raw = localStorage.getItem('wandergrid_workspace_settings') || localStorage.getItem('wandergrid_settings');
            if (raw) {
                const parsed = JSON.parse(raw);
                setHasOpenAipKey(Boolean(parsed.openAipApiKey));
                setCartoKey(parsed.cartoApiKey ? String(parsed.cartoApiKey).trim() : '');
            }
        } catch {}
    }, [isOpen]);

    if (!isOpen && !isVisible) return null;

    const updateField = <K extends keyof MapAppearanceSettings>(field: K, value: MapAppearanceSettings[K]) => {
        onChangeSettings({
            ...settings,
            [field]: value
        });
    };

    const handleReset = () => {
        if (onResetCamera) {
            onResetCamera();
        }
        onChangeSettings({ ...DEFAULT_MAP_APPEARANCE });
    };

    const tabs = [
        {
            id: 'cartography' as const,
            label: 'Cartography',
            icon: Globe,
            activeClass: 'text-sky-700 dark:text-sky-300 bg-sky-500/15 dark:bg-sky-500/25 backdrop-blur-md border border-sky-500/35 dark:border-sky-400/45 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(14,165,233,0.15)]',
            iconColor: 'text-sky-600 dark:text-sky-400'
        },
        {
            id: 'aviation' as const,
            label: 'Sectors & Arcs',
            icon: Plane,
            activeClass: 'text-indigo-700 dark:text-indigo-300 bg-indigo-500/15 dark:bg-indigo-500/25 backdrop-blur-md border border-indigo-500/35 dark:border-indigo-400/45 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.15)]',
            iconColor: 'text-indigo-600 dark:text-indigo-400'
        },
        {
            id: 'atmosphere' as const,
            label: 'Atmosphere',
            icon: Moon,
            activeClass: 'text-amber-700 dark:text-amber-300 bg-amber-500/15 dark:bg-amber-500/25 backdrop-blur-md border border-amber-500/35 dark:border-amber-400/45 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(245,158,11,0.15)]',
            iconColor: 'text-amber-600 dark:text-amber-400'
        },
        ...(filterTabContent ? [{
            id: 'filters' as const,
            label: 'Filters',
            icon: Filter,
            activeClass: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 dark:bg-emerald-500/25 backdrop-blur-md border border-emerald-500/35 dark:border-emerald-400/45 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(16,185,129,0.15)]',
            iconColor: 'text-emerald-600 dark:text-emerald-400'
        }] : [])
    ];

    return createPortal(
        <div className="fixed inset-0 z-modal overflow-hidden font-sans select-none pointer-events-auto">
            {/* 1. Translucent Scrim Backdrop (clean darkening without double-blur) */}
            <div 
                className={`fixed inset-0 bg-black/40 dark:bg-black/60 transition-opacity duration-300 ${
                    isVisible ? 'opacity-100' : 'opacity-0'
                }`}
                onClick={handleClose}
            />

            {/* 2. Slide-out Floating Shell with Liquid Glass (Floating 28px standard) */}
            <div className="fixed top-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:top-4 right-[calc(0.75rem+env(safe-area-inset-right,0px))] sm:right-4 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:bottom-4 z-modal flex max-w-full pl-0 sm:pl-10 pointer-events-none">
                <div 
                    className={`w-screen max-w-lg sm:w-[500px] md:w-[540px] h-full flex flex-col transform transition-transform duration-300 ease-out pointer-events-auto ${
                        isVisible ? 'translate-x-0' : 'translate-x-full'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <GlassPanel
                        className="wg-glass-card shadow-2xl h-full w-full flex flex-col overflow-hidden"
                        padding="0px"
                        overrides={{ borderRadius: 28 }}
                    >
                        <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px] text-light-text dark:text-dark-text">
                            {/* Header with Mission Control Brand */}
                            <div className="flex items-center justify-between px-6 pt-[calc(1.25rem+env(safe-area-inset-top,0px))] md:pt-5 pb-4 border-b border-black/5 dark:border-white/5 bg-gradient-to-r from-primary-500/10 via-transparent to-transparent shrink-0">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-primary-500/15 dark:bg-primary-500/25 border border-primary-500/30 dark:border-primary-400/40 flex items-center justify-center text-primary-600 dark:text-primary-400 shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_6px_rgba(234,88,12,0.15)] backdrop-blur-md">
                                        <SlidersHorizontal className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h2 className="text-sm font-bold text-light-text dark:text-dark-text tracking-tight">Mission Control</h2>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={handleReset}
                                        className="w-8 h-8 rounded-xl bg-white/50 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/15 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text transition-all duration-150 flex items-center justify-center cursor-pointer border border-black/5 dark:border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.25)] active:scale-95 backdrop-blur-md"
                                        title="Reset Camera & Telemetry"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={handleClose}
                                        className="w-8 h-8 rounded-xl bg-white/50 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/15 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text transition-all duration-150 flex items-center justify-center cursor-pointer border border-black/5 dark:border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.25)] active:scale-95 backdrop-blur-md"
                                        aria-label="Close Mission Control"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                        {/* Sidebar Navigation Tabs */}
                        <div className={`grid ${tabs.length === 4 ? 'grid-cols-4' : 'grid-cols-3'} border-b border-black/5 dark:border-white/5 px-4 pt-2 gap-1.5 bg-black/[0.02] dark:bg-white/[0.02] shrink-0`}>
                            {tabs.map((tab) => {
                                const isActive = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-t-xl text-xs font-bold transition-all duration-200 cursor-pointer relative truncate ${
                                            isActive
                                                ? tab.activeClass
                                                : `${tab.iconColor} opacity-75 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5`
                                        }`}
                                        style={isActive ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                        title={tab.label}
                                    >
                                        <tab.icon className={`w-4 h-4 shrink-0 ${tab.iconColor}`} />
                                        <span className="truncate">{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Sidebar Scrollable Body */}
                        <div className="flex-1 overflow-y-auto p-6 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] md:pb-6 space-y-6 custom-scrollbar text-light-text dark:text-dark-text">
                            
                            {/* TAB 1: CARTOGRAPHY (PROJECTION & BASEMAPS) - SKY ACCENT */}
                            {activeTab === 'cartography' && (
                                <div className="space-y-6">
                                    {/* PROJECTION ENGINE */}
                                    <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 space-y-2.5">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">Projection Engine</h4>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => updateField('projection', 'globe')}
                                                className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                                    settings.projection === 'globe'
                                                        ? 'bg-sky-500/15 dark:bg-sky-500/25 backdrop-blur-md border-sky-500/40 dark:border-sky-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(14,165,233,0.15)] text-sky-700 dark:text-sky-300 font-bold'
                                                        : 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                                }`}
                                                style={settings.projection === 'globe' ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                            >
                                                <Globe className={`w-4 h-4 shrink-0 transition-colors duration-200 ${
                                                    settings.projection === 'globe' ? 'text-sky-500 dark:text-sky-400' : 'text-light-text-secondary dark:text-dark-text-secondary'
                                                }`} />
                                                <span className="text-xs font-bold leading-tight truncate">3D Globe</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => updateField('projection', 'flat')}
                                                className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                                    settings.projection === 'flat'
                                                        ? 'bg-sky-500/15 dark:bg-sky-500/25 backdrop-blur-md border-sky-500/40 dark:border-sky-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(14,165,233,0.15)] text-sky-700 dark:text-sky-300 font-bold'
                                                        : 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                                }`}
                                                style={settings.projection === 'flat' ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                            >
                                                <MapIcon className={`w-4 h-4 shrink-0 transition-colors duration-200 ${
                                                    settings.projection === 'flat' ? 'text-sky-500 dark:text-sky-400' : 'text-light-text-secondary dark:text-dark-text-secondary'
                                                }`} />
                                                <span className="text-xs font-bold leading-tight truncate">2D Flat Map</span>
                                            </button>
                                        </div>

                                        {settings.projection === 'globe' && (
                                            <div className="pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <Sparkles className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
                                                    <span className="text-xs font-semibold text-light-text dark:text-dark-text">Atmospheric Cosmos</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => updateField('atmosphere', settings.atmosphere === false ? true : false)}
                                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-black/10 dark:border-white/15 transition-all duration-200 ease-in-out backdrop-blur-md ${
                                                        settings.atmosphere !== false
                                                            ? 'bg-sky-500/85 dark:bg-sky-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_8px_rgba(14,165,233,0.3)]'
                                                            : 'bg-black/15 dark:bg-white/15'
                                                    }`}
                                                >
                                                    <span
                                                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                                                            settings.atmosphere !== false ? 'translate-x-4' : 'translate-x-0'
                                                        }`}
                                                    />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* BASEMAP PALETTE */}
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase">Cartographic Basemap</h3>
                                                {cartoKey ? (
                                                    <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                        CARTO Active
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                                                        Zero-Key Canvas
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            {(isDark ? [
                                                {
                                                    id: 'onyx',
                                                    label: 'Onyx',
                                                    renderSwatch: () => (
                                                        <div className="w-full h-8 rounded-xl border border-white/15 flex items-center px-2.5 justify-between bg-gradient-to-r from-black via-zinc-950 to-zinc-900 relative overflow-hidden">
                                                            <div className="flex items-center gap-1.5 z-10">
                                                                <span className="text-2xs">🌑</span>
                                                                <span className="text-2xs font-bold text-white drop-shadow">Onyx</span>
                                                            </div>
                                                            <div className="w-2 h-2 rounded-full border border-white/40 z-10" />
                                                        </div>
                                                    )
                                                },
                                                {
                                                    id: 'citylights',
                                                    label: 'NASA Lights',
                                                    renderSwatch: () => (
                                                        <div className="w-full h-8 rounded-xl border border-amber-500/30 flex items-center px-2.5 justify-between bg-[#040711] relative overflow-hidden">
                                                            <div className="absolute top-1.5 right-12 w-1.5 h-1.5 rounded-full bg-amber-400/90 shadow-[0_0_6px_#f59e0b] animate-pulse" />
                                                            <div className="absolute bottom-1.5 right-7 w-1 h-1 rounded-full bg-amber-300/80 shadow-[0_0_4px_#f59e0b]" />
                                                            <div className="flex items-center gap-1.5 z-10">
                                                                <span className="text-2xs">✨</span>
                                                                <span className="text-2xs font-bold text-amber-100 drop-shadow-sm">NASA</span>
                                                            </div>
                                                            <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b] z-10" />
                                                        </div>
                                                    )
                                                },
                                                {
                                                    id: 'ocean',
                                                    label: 'Bathymetry',
                                                    renderSwatch: () => (
                                                        <div className="w-full h-8 rounded-xl border border-cyan-500/30 flex items-center px-2.5 justify-between bg-[#041a2f] relative overflow-hidden">
                                                            <div className="flex items-center gap-1.5 z-10">
                                                                <span className="text-2xs">🌊</span>
                                                                <span className="text-2xs font-bold text-cyan-200">Ocean</span>
                                                            </div>
                                                            <div className="w-2 h-2 rounded-full border border-cyan-400/60 z-10" />
                                                        </div>
                                                    )
                                                },
                                                {
                                                    id: 'satellite',
                                                    label: 'Satellite',
                                                    renderSwatch: () => (
                                                        <div className="w-full h-8 rounded-xl border border-emerald-500/20 flex items-center px-2.5 justify-between bg-gradient-to-r from-[#0a1a14] to-[#0d2a1f] relative overflow-hidden">
                                                            <div className="flex items-center gap-1.5 z-10">
                                                                <span className="text-2xs">🛰️</span>
                                                                <span className="text-2xs font-bold text-emerald-200">Satellite</span>
                                                            </div>
                                                            <div className="w-2 h-2 rounded-full border border-emerald-400/50 z-10" />
                                                        </div>
                                                    )
                                                },
                                                ...(FEATURE_FLAGS.GEV_P04B_OPENFREEMAP ? [
                                                    {
                                                        id: 'ofm_positron',
                                                        label: 'Positron Vector',
                                                        renderSwatch: () => (
                                                            <div className="w-full h-8 rounded-xl border border-white/20 flex items-center px-2.5 justify-between bg-white/10 relative overflow-hidden">
                                                                <div className="flex items-center gap-1.5 z-10">
                                                                    <span className="text-2xs">🧭</span>
                                                                    <span className="text-2xs font-bold text-white drop-shadow">Positron</span>
                                                                </div>
                                                                <div className="w-2 h-2 rounded-full border border-sky-400 z-10" />
                                                            </div>
                                                        )
                                                    },
                                                    {
                                                        id: 'ofm_liberty',
                                                        label: 'Liberty Vector',
                                                        renderSwatch: () => (
                                                            <div className="w-full h-8 rounded-xl border border-emerald-500/30 flex items-center px-2.5 justify-between bg-gradient-to-r from-sky-900/40 via-emerald-900/40 to-amber-900/40 relative overflow-hidden">
                                                                <div className="flex items-center gap-1.5 z-10">
                                                                    <span className="text-2xs">🗽</span>
                                                                    <span className="text-2xs font-bold text-emerald-200 drop-shadow">Liberty</span>
                                                                </div>
                                                                <div className="w-2 h-2 rounded-full border border-emerald-400/60 z-10" />
                                                            </div>
                                                        )
                                                    }
                                                ] : [])
                                            ] : [
                                                {
                                                    id: 'snow',
                                                    label: 'Snow',
                                                    renderSwatch: () => (
                                                        <div className="w-full h-8 rounded-xl border border-black/10 flex items-center px-2.5 justify-between bg-gradient-to-r from-zinc-100 via-white to-zinc-200 relative overflow-hidden">
                                                            <div className="flex items-center gap-1.5 z-10">
                                                                <span className="text-2xs">❄️</span>
                                                                <span className="text-2xs font-bold text-zinc-800">Snow</span>
                                                            </div>
                                                            <div className="w-2 h-2 rounded-full border border-zinc-400 z-10" />
                                                        </div>
                                                    )
                                                },
                                                {
                                                    id: 'vibrant',
                                                    label: 'Vibrant',
                                                    renderSwatch: () => (
                                                        <div className="w-full h-8 rounded-xl border border-emerald-500/30 flex items-center px-2.5 justify-between bg-gradient-to-r from-[#e0f2fe] via-[#ecfdf5] to-[#fef3c7] relative overflow-hidden">
                                                            <div className="flex items-center gap-1.5 z-10">
                                                                <span className="text-2xs">🎨</span>
                                                                <span className="text-2xs font-bold text-emerald-800">Vibrant</span>
                                                            </div>
                                                            <div className="flex items-center gap-1 z-10">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_4px_#38bdf8]" title="Water" />
                                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_#34d399]" title="Parks" />
                                                            </div>
                                                        </div>
                                                    )
                                                },
                                                {
                                                    id: 'ocean',
                                                    label: 'Bathymetry',
                                                    renderSwatch: () => (
                                                        <div className="w-full h-8 rounded-xl border border-cyan-500/30 flex items-center px-2.5 justify-between bg-gradient-to-r from-[#e0f7fa] to-[#b2ebf2] relative overflow-hidden">
                                                            <div className="flex items-center gap-1.5 z-10">
                                                                <span className="text-2xs">🌊</span>
                                                                <span className="text-2xs font-bold text-cyan-900">Bathymetry</span>
                                                            </div>
                                                            <div className="w-2 h-2 rounded-full border border-cyan-500/60 z-10" />
                                                        </div>
                                                    )
                                                },
                                                {
                                                    id: 'satellite',
                                                    label: 'Satellite',
                                                    renderSwatch: () => (
                                                        <div className="w-full h-8 rounded-xl border border-emerald-500/20 flex items-center px-2.5 justify-between bg-gradient-to-r from-[#0a1a14] to-[#0d2a1f] relative overflow-hidden">
                                                            <div className="flex items-center gap-1.5 z-10">
                                                                <span className="text-2xs">🛰️</span>
                                                                <span className="text-2xs font-bold text-emerald-200">Satellite</span>
                                                            </div>
                                                            <div className="w-2 h-2 rounded-full border border-emerald-400/50 z-10" />
                                                        </div>
                                                    )
                                                },
                                                ...(FEATURE_FLAGS.GEV_P04B_OPENFREEMAP ? [
                                                    {
                                                        id: 'ofm_liberty',
                                                        label: 'Liberty Vector',
                                                        renderSwatch: () => (
                                                            <div className="w-full h-8 rounded-xl border border-emerald-500/30 flex items-center px-2.5 justify-between bg-gradient-to-r from-sky-100 via-emerald-100 to-amber-100 relative overflow-hidden">
                                                                <div className="flex items-center gap-1.5 z-10">
                                                                    <span className="text-2xs">🗽</span>
                                                                    <span className="text-2xs font-bold text-emerald-900">Liberty</span>
                                                                </div>
                                                                <div className="flex items-center gap-1 z-10">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                                </div>
                                                            </div>
                                                        )
                                                    },
                                                    {
                                                        id: 'ofm_bright',
                                                        label: 'Bright Vector',
                                                        renderSwatch: () => (
                                                            <div className="w-full h-8 rounded-xl border border-amber-500/30 flex items-center px-2.5 justify-between bg-gradient-to-r from-amber-100 via-yellow-100 to-orange-100 relative overflow-hidden">
                                                                <div className="flex items-center gap-1.5 z-10">
                                                                    <span className="text-2xs">☀️</span>
                                                                    <span className="text-2xs font-bold text-amber-900">Bright</span>
                                                                </div>
                                                                <div className="w-2 h-2 rounded-full border border-amber-500/60 z-10" />
                                                            </div>
                                                        )
                                                    },
                                                    {
                                                        id: 'ofm_positron',
                                                        label: 'Positron Vector',
                                                        renderSwatch: () => (
                                                            <div className="w-full h-8 rounded-xl border border-black/10 flex items-center px-2.5 justify-between bg-gradient-to-r from-zinc-100 to-white relative overflow-hidden">
                                                                <div className="flex items-center gap-1.5 z-10">
                                                                    <span className="text-2xs">🧭</span>
                                                                    <span className="text-2xs font-bold text-zinc-800">Positron</span>
                                                                </div>
                                                                <div className="w-2 h-2 rounded-full border border-sky-500/50 z-10" />
                                                            </div>
                                                        )
                                                    }
                                                ] : [])
                                            ]).map(b => {
                                                const effectiveBasemap = getEffectiveBasemap(settings.basemap, isDark);
                                                const isSelected = effectiveBasemap === b.id;
                                                return (
                                                    <button
                                                        key={b.id}
                                                        onClick={() => updateField('basemap', b.id as any)}
                                                        className={`p-2.5 rounded-2xl border transition-all duration-150 text-left flex flex-col justify-between gap-2 cursor-pointer active:scale-[0.98] ${
                                                            isSelected
                                                                ? 'border-sky-500/40 bg-sky-500/15 dark:bg-sky-500/25 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(14,165,233,0.15)] ring-1 ring-sky-500/30'
                                                                : 'border-black/5 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm hover:border-black/15 dark:hover:border-white/20'
                                                        }`}
                                                        style={isSelected ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                                    >
                                                        {b.renderSwatch()}
                                                        <div>
                                                            <p className="text-xs font-bold text-light-text dark:text-dark-text truncate">{b.label}</p>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* EXPEDITION VIEW MODES (when handler passed) */}
                                    {onSelectViewMode && (
                                        <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 space-y-2.5">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">Expedition View Mode</h4>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                {[
                                                    { id: 'flights' as const, label: 'Flights', icon: Plane, color: 'text-sky-500 dark:text-sky-400' },
                                                    { id: 'land_sea' as const, label: 'Land & Sea', icon: Compass, color: 'text-emerald-500 dark:text-emerald-400' },
                                                    { id: 'scratch' as const, label: 'Scratch Map', icon: MapIcon, color: 'text-amber-500 dark:text-amber-400' },
                                                    { id: 'all' as const, label: 'All Expeditions', icon: Globe, color: 'text-indigo-500 dark:text-indigo-400' }
                                                ].map((mode) => {
                                                    const isSelected = viewMode === mode.id;
                                                    const IconComponent = mode.icon;
                                                    return (
                                                        <button
                                                            key={mode.id}
                                                            type="button"
                                                            onClick={() => onSelectViewMode(mode.id)}
                                                            className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                                                isSelected
                                                                    ? 'bg-primary-500/15 dark:bg-primary-500/25 backdrop-blur-md border border-primary-500/40 text-primary-600 dark:text-primary-400 font-bold'
                                                                    : 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                                            }`}
                                                            style={isSelected ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                                        >
                                                            <IconComponent className={`w-4 h-4 shrink-0 transition-colors duration-200 ${isSelected ? mode.color : 'text-light-text-secondary dark:text-dark-text-secondary'}`} />
                                                            <span className="text-xs font-bold leading-tight truncate">{mode.label}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* SCRATCH CITY PINS */}
                                    <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">Scratch City Pins</h4>
                                        </div>

                                        <div className="grid grid-cols-4 gap-1.5">
                                            {[
                                                { id: 'off', label: 'Hidden' },
                                                { id: 'small', label: 'Micro' },
                                                { id: 'medium', label: 'Normal' },
                                                { id: 'large', label: 'Expansive' }
                                            ].map(sz => (
                                                <button
                                                    key={sz.id}
                                                    type="button"
                                                    onClick={() => updateField('scratchCitySize', sz.id as any)}
                                                    className={`py-2 rounded-xl text-xs font-semibold text-center border transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                                                        (settings.scratchCitySize || 'medium') === sz.id
                                                            ? 'bg-sky-500/20 dark:bg-sky-500/30 backdrop-blur-md text-sky-700 dark:text-sky-300 font-bold border border-sky-500/40 dark:border-sky-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(14,165,233,0.15)]'
                                                            : 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text'
                                                    }`}
                                                    style={(settings.scratchCitySize || 'medium') === sz.id ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                                >
                                                    {sz.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* SCRATCH HIGHLIGHT TOGGLES (LIVED, LAYOVER, WISHLIST) */}
                                    <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 space-y-3">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">Territory Highlights</h4>

                                        {/* Lived Residences */}
                                        <div className="flex items-center justify-between pt-1">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-sm">
                                                    🏠
                                                </div>
                                                <p className="text-xs font-bold text-light-text dark:text-dark-text">Lived Residences</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => updateField('showLivedCountries', settings.showLivedCountries === false ? true : false)}
                                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-black/10 dark:border-white/15 transition-all duration-200 ease-in-out backdrop-blur-md ${
                                                    settings.showLivedCountries !== false
                                                        ? 'bg-emerald-500/85 dark:bg-emerald-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(16,185,129,0.3)]'
                                                        : 'bg-black/15 dark:bg-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
                                                }`}
                                            >
                                                <span
                                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.8)] ring-0 transition duration-200 ease-in-out ${
                                                        settings.showLivedCountries !== false ? 'translate-x-5' : 'translate-x-0'
                                                    }`}
                                                />
                                            </button>
                                        </div>

                                        <div className="h-px bg-black/5 dark:bg-white/5" />

                                        {/* Layover Territories */}
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-sm">
                                                    🛫
                                                </div>
                                                <p className="text-xs font-bold text-light-text dark:text-dark-text">Layover Territories</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => updateField('showLayoverCountries', settings.showLayoverCountries === false ? true : false)}
                                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-black/10 dark:border-white/15 transition-all duration-200 ease-in-out backdrop-blur-md ${
                                                    settings.showLayoverCountries !== false
                                                        ? 'bg-amber-500/85 dark:bg-amber-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(245,158,11,0.3)]'
                                                        : 'bg-black/15 dark:bg-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
                                                }`}
                                            >
                                                <span
                                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.8)] ring-0 transition duration-200 ease-in-out ${
                                                        settings.showLayoverCountries !== false ? 'translate-x-5' : 'translate-x-0'
                                                    }`}
                                                />
                                            </button>
                                        </div>

                                        <div className="h-px bg-black/5 dark:bg-white/5" />

                                        {/* Wishlist Destinations */}
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-sm">
                                                    🌟
                                                </div>
                                                <p className="text-xs font-bold text-light-text dark:text-dark-text">Wishlist Destinations</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => updateField('showWishlistCountries', settings.showWishlistCountries === false ? true : false)}
                                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-black/10 dark:border-white/15 transition-all duration-200 ease-in-out backdrop-blur-md ${
                                                    settings.showWishlistCountries !== false
                                                        ? 'bg-rose-500/85 dark:bg-rose-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(244,63,94,0.3)]'
                                                        : 'bg-black/15 dark:bg-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
                                                }`}
                                            >
                                                <span
                                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.8)] ring-0 transition duration-200 ease-in-out ${
                                                        settings.showWishlistCountries !== false ? 'translate-x-5' : 'translate-x-0'
                                                    }`}
                                                />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* TAB 2: AVIATION (FLIGHTS, RUNWAYS & ARCS) - INDIGO ACCENT */}
                            {activeTab === 'aviation' && (
                                <div className="space-y-6">
                                    {/* AERODROME RUNWAY INFRASTRUCTURE */}
                                    <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 shadow-sm space-y-3">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">Aerodrome Markings</h3>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2.5">
                                            <button
                                                type="button"
                                                onClick={() => updateField('airportDetail', 'standard')}
                                                className={`p-3 rounded-xl border text-center transition-all duration-150 cursor-pointer active:scale-[0.98] flex items-center justify-center ${
                                                    settings.airportDetail === 'standard'
                                                        ? 'bg-indigo-500/15 dark:bg-indigo-500/25 backdrop-blur-md border border-indigo-500/40 dark:border-indigo-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.15)] text-indigo-700 dark:text-indigo-300 font-bold'
                                                        : 'border-black/5 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                                }`}
                                                style={settings.airportDetail === 'standard' ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                            >
                                                <span className="text-xs font-bold">Minimal Beacon</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => updateField('airportDetail', 'detailed')}
                                                className={`p-3 rounded-xl border text-center transition-all duration-150 cursor-pointer active:scale-[0.98] flex items-center justify-center ${
                                                    settings.airportDetail === 'detailed'
                                                        ? 'bg-indigo-500/15 dark:bg-indigo-500/25 backdrop-blur-md border border-indigo-500/40 dark:border-indigo-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.15)] text-indigo-700 dark:text-indigo-300 font-bold'
                                                        : 'border-black/5 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                                }`}
                                                style={settings.airportDetail === 'detailed' ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                            >
                                                <span className="text-xs font-bold">Full Layout</span>
                                            </button>
                                        </div>

                                        {/* Solo Mode: Only show airports on the map and nothing else */}
                                        <div className="pt-2.5 border-t border-black/5 dark:border-white/5 flex items-center justify-between">
                                            <div className="min-w-0 pr-3">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs font-bold text-light-text dark:text-dark-text">Airports Only</span>
                                                    {settings.airportsOnly && (
                                                        <span className="px-1.5 py-0.2 rounded-full text-2xs font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                                            Solo Focus
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">
                                                    Only show airports on map (hides flights, roads, cities, rain & territories)
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => updateField('airportsOnly', !settings.airportsOnly)}
                                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-black/10 dark:border-white/15 transition-all duration-200 ease-in-out backdrop-blur-md ${
                                                    settings.airportsOnly
                                                        ? 'bg-indigo-500/85 dark:bg-indigo-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(99,102,241,0.3)]'
                                                        : 'bg-black/15 dark:bg-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
                                                }`}
                                                aria-label="Toggle airports only solo mode"
                                            >
                                                <span
                                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.8)] ring-0 transition duration-200 ease-in-out ${
                                                        settings.airportsOnly ? 'translate-x-5' : 'translate-x-0'
                                                    }`}
                                                />
                                            </button>
                                        </div>
                                    </div>

                                    {/* AIRPORT HUB SIZING */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase">Airport Hub Nodes</h3>
                                        </div>

                                        <div className="grid grid-cols-4 gap-1.5 mb-2.5">
                                            {[
                                                { id: 'off', label: 'Hidden' },
                                                { id: 'small', label: 'Micro' },
                                                { id: 'medium', label: 'Normal' },
                                                { id: 'large', label: 'Expansive' }
                                            ].map((sz) => (
                                                <button
                                                    key={sz.id}
                                                    onClick={() => updateField('airportSize', sz.id as any)}
                                                    className={`py-2 rounded-xl text-xs font-semibold text-center border transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                                                        settings.airportSize === sz.id
                                                            ? 'bg-indigo-500/20 dark:bg-indigo-500/30 backdrop-blur-md text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-500/40 dark:border-indigo-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.15)]'
                                                            : 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text'
                                                    }`}
                                                    style={settings.airportSize === sz.id ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                                >
                                                    {sz.label}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => updateField('airportMode', 'frequency')}
                                                className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                                                    settings.airportMode === 'frequency'
                                                        ? 'bg-indigo-500/15 dark:bg-indigo-500/25 backdrop-blur-md border border-indigo-500/40 dark:border-indigo-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.15)] text-indigo-700 dark:text-indigo-300 font-bold'
                                                        : 'border-black/5 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                                }`}
                                                style={settings.airportMode === 'frequency' ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                            >
                                                Weighted by Traffic
                                            </button>
                                            <button
                                                onClick={() => updateField('airportMode', 'uniform')}
                                                className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                                                    settings.airportMode === 'uniform'
                                                        ? 'bg-indigo-500/15 dark:bg-indigo-500/25 backdrop-blur-md border border-indigo-500/40 dark:border-indigo-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.15)] text-indigo-700 dark:text-indigo-300 font-bold'
                                                        : 'border-black/5 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                                }`}
                                                style={settings.airportMode === 'uniform' ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                            >
                                                Uniform Scale
                                            </button>
                                        </div>
                                    </div>

                                    {/* ROUTE ARCS STYLING */}
                                    <div className="space-y-4 pt-3 border-t border-black/5 dark:border-white/5">
                                        <h3 className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase">Route Presentation</h3>

                                        {/* Color Palette */}
                                        <div>
                                            <span className="text-xs text-light-text dark:text-dark-text font-semibold mb-2 block">Color Palette</span>
                                            <div className="grid grid-cols-3 gap-2">
                                                {[
                                                    { id: 'gradient', label: 'Aurora Gradient' },
                                                    { id: 'frequency', label: 'Heatmap Density' },
                                                    { id: 'default', label: 'Warm Amber' }
                                                ].map((cl) => (
                                                    <button
                                                        key={cl.id}
                                                        onClick={() => updateField('routeColorMode', cl.id as any)}
                                                        className={`py-2 px-2.5 rounded-xl border text-center transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                                                            settings.routeColorMode === cl.id
                                                                ? 'bg-indigo-500/15 dark:bg-indigo-500/25 backdrop-blur-md border border-indigo-500/40 dark:border-indigo-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.15)] font-bold text-indigo-700 dark:text-indigo-300'
                                                                : 'border-black/5 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                                        }`}
                                                        style={settings.routeColorMode === cl.id ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                                    >
                                                        <span className="text-xs font-bold">{cl.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Scale */}
                                        <div>
                                            <span className="text-xs text-light-text dark:text-dark-text font-semibold mb-2 block">Stroke Weight</span>
                                            <div className="grid grid-cols-3 gap-2">
                                                {[
                                                    { id: 'thin', label: 'Fine (1px)' },
                                                    { id: 'normal', label: 'Balanced (2px)' },
                                                    { id: 'thick', label: 'Bold (3.5px)' }
                                                ].map((sc) => (
                                                    <button
                                                        key={sc.id}
                                                        onClick={() => updateField('routeScale', sc.id as any)}
                                                        className={`py-2 rounded-xl border text-center transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                                                            settings.routeScale === sc.id
                                                                ? 'bg-indigo-500/15 dark:bg-indigo-500/25 backdrop-blur-md border border-indigo-500/40 dark:border-indigo-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.15)] text-indigo-700 dark:text-indigo-300 font-bold'
                                                                : 'border-black/5 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                                        }`}
                                                        style={settings.routeScale === sc.id ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                                    >
                                                        <span className="text-xs">{sc.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* ADVANCED ROUTE DYNAMICS */}
                                    <div className="space-y-2.5 pt-3 border-t border-black/5 dark:border-white/5">
                                        <h3 className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase">Motion & Dynamics</h3>

                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={onToggleIndependentFlights || (() => setInternalFlightsOnly(!internalFlightsOnly))}
                                                className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                                    (showIndependentFlights ?? internalFlightsOnly)
                                                        ? 'bg-indigo-500/15 dark:bg-indigo-500/25 backdrop-blur-md border border-indigo-500/40 dark:border-indigo-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.15)] text-indigo-700 dark:text-indigo-300 font-bold'
                                                        : 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                                }`}
                                                style={(showIndependentFlights ?? internalFlightsOnly) ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                            >
                                                <Plane className="w-4 h-4 text-indigo-500 shrink-0" />
                                                <span className="text-xs font-bold">Flights Only</span>
                                            </button>

                                            <button
                                                onClick={onToggleLandSeaRoutes || (() => setInternalLandSea(!internalLandSea))}
                                                className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                                    (showLandSeaRoutes ?? internalLandSea)
                                                        ? 'bg-amber-500/15 dark:bg-amber-500/25 backdrop-blur-md border border-amber-500/40 dark:border-amber-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(245,158,11,0.15)] text-amber-700 dark:text-amber-300 font-bold'
                                                        : 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                                }`}
                                                style={(showLandSeaRoutes ?? internalLandSea) ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                            >
                                                <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                                                <span className="text-xs font-bold">Overland Transit</span>
                                            </button>

                                            <button
                                                onClick={onToggleAnimateRoutes || (() => setInternalCometFlow(!internalCometFlow))}
                                                className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                                    (animateRoutes ?? internalCometFlow)
                                                        ? 'bg-cyan-500/15 dark:bg-cyan-500/25 backdrop-blur-md border border-cyan-500/40 dark:border-cyan-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(6,182,212,0.15)] text-cyan-700 dark:text-cyan-300 font-bold'
                                                        : 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                                }`}
                                                style={(animateRoutes ?? internalCometFlow) ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                            >
                                                <Play className="w-4 h-4 text-cyan-500 shrink-0" />
                                                <span className="text-xs font-bold">Comet Flow</span>
                                            </button>

                                            <button
                                                onClick={onToggleClusterMode || (() => setInternalCluster(!internalCluster))}
                                                className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                                    (clusterMode ?? internalCluster)
                                                        ? 'bg-purple-500/15 dark:bg-purple-500/25 backdrop-blur-md border border-purple-500/40 dark:border-purple-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(168,85,247,0.15)] text-purple-700 dark:text-purple-300 font-bold'
                                                        : 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                                }`}
                                                style={(clusterMode ?? internalCluster) ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                            >
                                                <Layers className="w-4 h-4 text-purple-500 shrink-0" />
                                                <span className="text-xs font-bold">Cluster Hubs</span>
                                            </button>
                                        </div>

                                        <div className="space-y-2 pt-2 border-t border-black/5 dark:border-white/5">
                                            {/* Route Tracing (Road & Rail) */}
                                            <button
                                                onClick={onToggleRoadTracing || (() => {
                                                    const newVal = !(settings.routeTracing !== false);
                                                    updateField('routeTracing', newVal);
                                                })}
                                                className={`w-full p-2.5 rounded-xl border text-left flex items-center gap-2.5 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                                    (showRoadTracing ?? (settings.routeTracing !== false))
                                                        ? 'bg-indigo-500/15 dark:bg-indigo-500/25 backdrop-blur-md border border-indigo-500/40 dark:border-indigo-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(99,102,241,0.15)] text-indigo-700 dark:text-indigo-300 font-bold'
                                                        : 'bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/15 dark:hover:border-white/20'
                                                }`}
                                                style={(showRoadTracing ?? (settings.routeTracing !== false)) ? { WebkitBackdropFilter: 'blur(12px)' } : undefined}
                                            >
                                                <Radio className="w-4 h-4 text-indigo-500 shrink-0" />
                                                <div className="min-w-0 flex-1 leading-none">
                                                    <p className="text-xs font-bold">Route Tracing (Road & Rail)</p>
                                                </div>
                                            </button>

                                            {/* Flight Motion Interpolation */}
                                            <div className="p-3 rounded-xl bg-white/40 dark:bg-white/[0.04] backdrop-blur-sm border border-black/5 dark:border-white/10 flex items-center justify-between">
                                                <div>
                                                    <h4 className="text-xs font-bold text-light-text dark:text-dark-text flex items-center gap-1.5">
                                                        <span>Flight Motion Interpolation</span>
                                                        {settings.flightInterpolation !== false && (
                                                            <span className="px-1.5 py-0.2 rounded-full text-2xs font-bold uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                                60 FPS
                                                            </span>
                                                        )}
                                                    </h4>
                                                    <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">Smooth dead-reckoning trajectory smoothing</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => updateField('flightInterpolation', settings.flightInterpolation === false ? true : false)}
                                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-black/10 dark:border-white/15 transition-all duration-200 ease-in-out backdrop-blur-md ${
                                                        settings.flightInterpolation !== false ? 'bg-indigo-600' : 'bg-black/15 dark:bg-white/15'
                                                    }`}
                                                >
                                                    <span
                                                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                                                            settings.flightInterpolation !== false ? 'translate-x-4' : 'translate-x-0'
                                                        }`}
                                                    />
                                                </button>
                                            </div>
                                        </div>

                                        {/* OpenAIP Aeronautical Vector Charts */}
                                        <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h4 className="text-xs font-bold text-light-text dark:text-dark-text flex items-center gap-1.5">
                                                        <span>OpenAIP Aero Charts</span>
                                                        {settings.openAipOverlay && (
                                                            <span className="flex items-center gap-1 px-2 py-0.5 text-2xs font-bold rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                                                                Vector Charts
                                                            </span>
                                                        )}
                                                    </h4>
                                                    <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">Airspaces, navaids, waypoints & airfields</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => updateField('openAipOverlay', !settings.openAipOverlay)}
                                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-black/10 dark:border-white/15 transition-all duration-200 ease-in-out backdrop-blur-md ${
                                                        settings.openAipOverlay
                                                            ? 'bg-indigo-500/85 dark:bg-indigo-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(99,102,241,0.3)]'
                                                            : 'bg-black/15 dark:bg-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
                                                    }`}
                                                >
                                                    <span
                                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.8)] ring-0 transition duration-200 ease-in-out ${
                                                            settings.openAipOverlay ? 'translate-x-5' : 'translate-x-0'
                                                        }`}
                                                    />
                                                </button>
                                            </div>

                                            {settings.openAipOverlay && (
                                                <div className="pt-2.5 border-t border-black/5 dark:border-white/5 space-y-2 animate-fade-in">
                                                    <div className="flex items-center justify-between text-2xs font-bold">
                                                        <span className="uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Layers</span>
                                                        <span className={`px-1.5 py-0.2 rounded-full ${hasOpenAipKey ? 'text-emerald-500 bg-emerald-500/10' : 'text-amber-500 bg-amber-500/10'}`}>
                                                            {hasOpenAipKey ? 'Key Active' : 'Key Required'}
                                                        </span>
                                                    </div>

                                                    {!hasOpenAipKey && (
                                                        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2 text-2xs text-amber-700 dark:text-amber-300 leading-tight">
                                                            <span className="text-sm shrink-0">⚠️</span>
                                                            <div>
                                                                <span className="font-bold">OpenAIP Key Required:</span> Register a free key at{' '}
                                                                <a href="https://www.openaip.net" target="_blank" rel="noopener noreferrer" className="underline font-semibold hover:text-amber-900 dark:hover:text-amber-100">
                                                                    openaip.net
                                                                </a>{' '}
                                                                and add it in <strong>Settings → Integrations</strong> to display aeronautical vector charts.
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="grid grid-cols-2 gap-1.5">
                                                        {[
                                                            { id: 'airspaces', label: 'Airspaces' },
                                                            { id: 'airspaceLabels', label: 'Labels' },
                                                            { id: 'navaids', label: 'Navaids' },
                                                            { id: 'reportingPoints', label: 'Waypoints' },
                                                            { id: 'airports', label: 'Airfields' }
                                                        ].map(group => {
                                                            const currentGroups = settings.openAipGroups || ['airspaces', 'airspaceLabels', 'airports', 'navaids', 'reportingPoints'];
                                                            const active = currentGroups.includes(group.id as any);
                                                            return (
                                                                <button
                                                                    key={group.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const next = active
                                                                            ? currentGroups.filter(g => g !== group.id)
                                                                            : [...currentGroups, group.id as any];
                                                                        updateField('openAipGroups', next);
                                                                    }}
                                                                    className={`py-1 px-2 rounded-xl text-2xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                                                        active
                                                                            ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                                                                            : 'bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary opacity-60 hover:opacity-100'
                                                                    }`}
                                                                >
                                                                    {group.label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* TAB 3: ATMOSPHERE (SOLAR & WEATHER TELEMETRY) - AMBER ACCENT */}
                            {activeTab === 'atmosphere' && (
                                <div className="space-y-6">
                                    <div>
                                        <h3 className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase mb-3">
                                            Atmospheric Overlays
                                        </h3>

                                        <div className="space-y-3">
                                            {/* 3D Celestial Cosmos */}
                                            <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h4 className="text-xs font-bold text-light-text dark:text-dark-text flex items-center gap-1.5">
                                                            <span>Celestial Cosmos</span>
                                                            {settings.atmosphere !== false && (
                                                                <span className="px-2 py-0.5 text-2xs font-bold rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                                                                    Stars, Sun & Halo
                                                                </span>
                                                            )}
                                                        </h4>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateField('atmosphere', settings.atmosphere === false ? true : false)}
                                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-black/10 dark:border-white/15 transition-all duration-200 ease-in-out backdrop-blur-md ${
                                                            settings.atmosphere !== false
                                                                ? 'bg-sky-500/85 dark:bg-sky-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(14,165,233,0.3)]'
                                                                : 'bg-black/15 dark:bg-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
                                                        }`}
                                                    >
                                                        <span
                                                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.8)] ring-0 transition duration-200 ease-in-out ${
                                                                settings.atmosphere !== false ? 'translate-x-5' : 'translate-x-0'
                                                            }`}
                                                        />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Solar Twilight Shading */}
                                            <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h4 className="text-xs font-bold text-light-text dark:text-dark-text flex items-center gap-1.5">
                                                            <span>Solar Twilight Shading</span>
                                                            {settings.timeOfDay && (
                                                                <span className="px-2 py-0.5 text-2xs font-bold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                                                    14-Band Penumbra
                                                                </span>
                                                            )}
                                                        </h4>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateField('timeOfDay', !settings.timeOfDay)}
                                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-black/10 dark:border-white/15 transition-all duration-200 ease-in-out backdrop-blur-md ${
                                                            settings.timeOfDay
                                                                ? 'bg-amber-500/85 dark:bg-amber-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(245,158,11,0.3)]'
                                                                : 'bg-black/15 dark:bg-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
                                                        }`}
                                                    >
                                                        <span
                                                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.8)] ring-0 transition duration-200 ease-in-out ${
                                                                settings.timeOfDay ? 'translate-x-5' : 'translate-x-0'
                                                            }`}
                                                        />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Doppler Rain Radar */}
                                            <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h4 className="text-xs font-bold text-light-text dark:text-dark-text flex items-center gap-1.5">
                                                            <span>Doppler Rain Radar</span>
                                                            {settings.rainRadar && (
                                                                <span className="flex items-center gap-1 px-2 py-0.5 text-2xs font-bold rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                                    RainViewer Global
                                                                </span>
                                                            )}
                                                        </h4>
                                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">Precipitation radar telemetry & mosaic</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateField('rainRadar', !settings.rainRadar)}
                                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-black/10 dark:border-white/15 transition-all duration-200 ease-in-out backdrop-blur-md ${
                                                            settings.rainRadar
                                                                ? 'bg-amber-500/85 dark:bg-amber-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(245,158,11,0.3)]'
                                                                : 'bg-black/15 dark:bg-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
                                                        }`}
                                                    >
                                                        <span
                                                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.8)] ring-0 transition duration-200 ease-in-out ${
                                                                settings.rainRadar ? 'translate-x-5' : 'translate-x-0'
                                                            }`}
                                                        />
                                                    </button>
                                                </div>

                                                {settings.rainRadar && (
                                                    <div className="pt-2.5 border-t border-black/5 dark:border-white/5 space-y-3 animate-fade-in">
                                                        <div>
                                                            <div className="flex items-center justify-between text-2xs font-bold text-light-text dark:text-dark-text mb-1">
                                                                <span>Radar Intensity</span>
                                                                <span className="text-amber-500">{Math.round((settings.rainRadarOpacity || 0.85) * 100)}%</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min="0.2"
                                                                max="1.0"
                                                                step="0.05"
                                                                value={settings.rainRadarOpacity || 0.85}
                                                                onChange={(e) => updateField('rainRadarOpacity', parseFloat(e.target.value))}
                                                                className="w-full accent-amber-500 cursor-pointer h-1.5 bg-black/10 dark:bg-white/10 rounded-lg"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Terrain 3D Hillshade (Esri World Hillshade 3D Relief) */}
                                            <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h4 className="text-xs font-bold text-light-text dark:text-dark-text flex items-center gap-1.5">
                                                            <span>Terrain 3D Hillshade</span>
                                                            {settings.terrainHillshade && (
                                                                <span className="px-2 py-0.5 text-2xs font-bold rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                                                    Topography
                                                                </span>
                                                            )}
                                                        </h4>
                                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">3D mountain elevation and topographic slope relief</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateField('terrainHillshade', !settings.terrainHillshade)}
                                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-black/10 dark:border-white/15 transition-all duration-200 ease-in-out backdrop-blur-md ${
                                                            settings.terrainHillshade
                                                                ? 'bg-amber-500/85 dark:bg-amber-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(245,158,11,0.3)]'
                                                                : 'bg-black/15 dark:bg-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
                                                        }`}
                                                    >
                                                        <span
                                                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.8)] ring-0 transition duration-200 ease-in-out ${
                                                                settings.terrainHillshade ? 'translate-x-5' : 'translate-x-0'
                                                            }`}
                                                        />
                                                    </button>
                                                </div>

                                                {settings.terrainHillshade && (
                                                    <div className="pt-2.5 border-t border-black/5 dark:border-white/5 space-y-3 animate-fade-in">
                                                        <div>
                                                            <div className="flex items-center justify-between text-2xs font-bold text-light-text dark:text-dark-text mb-1">
                                                                <span>Hillshade Intensity</span>
                                                                <span className="text-amber-500">{Math.round((settings.terrainHillshadeOpacity || 0.8) * 100)}%</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min="0.1"
                                                                max="1.0"
                                                                step="0.05"
                                                                value={settings.terrainHillshadeOpacity || 0.8}
                                                                onChange={(e) => updateField('terrainHillshadeOpacity', parseFloat(e.target.value))}
                                                                className="w-full accent-amber-500 cursor-pointer h-1.5 bg-black/10 dark:bg-white/10 rounded-lg"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* True 3D Terrain Elevation (AWS Terrarium DEM) (P-04d) */}
                                            {FEATURE_FLAGS.GEV_P04D_TERRAIN && (
                                                <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <h4 className="text-xs font-bold text-light-text dark:text-dark-text flex items-center gap-1.5">
                                                                <span>True 3D Terrain Mesh</span>
                                                                {settings.terrain3d && (
                                                                    <span className="px-2 py-0.5 text-2xs font-bold rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                                                        Terrarium DEM
                                                                    </span>
                                                                )}
                                                            </h4>
                                                            <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">Physical 3D elevation mesh with pitch tilt</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => updateField('terrain3d', !settings.terrain3d)}
                                                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-black/10 dark:border-white/15 transition-all duration-200 ease-in-out backdrop-blur-md ${
                                                                settings.terrain3d
                                                                    ? 'bg-emerald-500/85 dark:bg-emerald-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(16,185,129,0.3)]'
                                                                    : 'bg-black/15 dark:bg-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
                                                            }`}
                                                            aria-label="Toggle 3D Terrain Elevation Mesh"
                                                        >
                                                            <span
                                                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.8)] ring-0 transition duration-200 ease-in-out ${
                                                                    settings.terrain3d ? 'translate-x-5' : 'translate-x-0'
                                                                }`}
                                                            />
                                                        </button>
                                                    </div>

                                                    {settings.terrain3d && (
                                                        <div className="pt-2.5 border-t border-black/5 dark:border-white/5 space-y-3 animate-fade-in">
                                                            <div>
                                                                <div className="flex items-center justify-between text-2xs font-bold text-light-text dark:text-dark-text mb-1">
                                                                    <span>Elevation Exaggeration</span>
                                                                    <span className="text-emerald-500">{(settings.terrain3dExaggeration ?? 1.0).toFixed(1)}x</span>
                                                                </div>
                                                                <input
                                                                    type="range"
                                                                    min="0.5"
                                                                    max="2.5"
                                                                    step="0.1"
                                                                    value={settings.terrain3dExaggeration ?? 1.0}
                                                                    onChange={(e) => updateField('terrain3dExaggeration', parseFloat(e.target.value))}
                                                                    className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-black/10 dark:bg-white/10 rounded-lg"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Global Railway & Transit (OpenRailwayMap - Minimal Hairline Styling) */}
                                            <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h4 className="text-xs font-bold text-light-text dark:text-dark-text flex items-center gap-1.5">
                                                            <span>Global Railway & Transit</span>
                                                            {settings.transitOverlay && (
                                                                <span className="px-2 py-0.5 text-2xs font-bold rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                                                    OpenRailway
                                                                </span>
                                                            )}
                                                        </h4>
                                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">High-speed rail, passenger tracks & metro lines</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateField('transitOverlay', !settings.transitOverlay)}
                                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-black/10 dark:border-white/15 transition-all duration-200 ease-in-out backdrop-blur-md ${
                                                            settings.transitOverlay
                                                                ? 'bg-emerald-500/85 dark:bg-emerald-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(16,185,129,0.3)]'
                                                                : 'bg-black/15 dark:bg-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
                                                        }`}
                                                    >
                                                        <span
                                                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.8)] ring-0 transition duration-200 ease-in-out ${
                                                                settings.transitOverlay ? 'translate-x-5' : 'translate-x-0'
                                                            }`}
                                                        />
                                                    </button>
                                                </div>

                                                {settings.transitOverlay && (
                                                    <div className="pt-2.5 border-t border-black/5 dark:border-white/5 space-y-3 animate-fade-in">
                                                        <div>
                                                            <div className="flex items-center justify-between text-2xs font-bold text-light-text dark:text-dark-text mb-1">
                                                                <span>Transit Layer Opacity</span>
                                                                <span className="text-emerald-500">{Math.round((settings.transitOverlayOpacity || 0.4) * 100)}%</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min="0.1"
                                                                max="1.0"
                                                                step="0.05"
                                                                value={settings.transitOverlayOpacity || 0.4}
                                                                onChange={(e) => updateField('transitOverlayOpacity', parseFloat(e.target.value))}
                                                                className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-black/10 dark:bg-white/10 rounded-lg"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Satellite Clouds (NOAA nowCOAST Global Longwave) */}
                                            <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h4 className="text-xs font-bold text-light-text dark:text-dark-text flex items-center gap-1.5">
                                                            <span>Satellite Clouds</span>
                                                            {settings.weatherClouds && (
                                                                <span className="flex items-center gap-1 px-2 py-0.5 text-2xs font-bold rounded-full bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                                                    NOAA nowCOAST
                                                                </span>
                                                            )}
                                                        </h4>
                                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">Real-time global infrared cloud tops</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateField('weatherClouds', !settings.weatherClouds)}
                                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-black/10 dark:border-white/15 transition-all duration-200 ease-in-out backdrop-blur-md ${
                                                            settings.weatherClouds
                                                                ? 'bg-cyan-500/85 dark:bg-cyan-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(6,182,212,0.3)]'
                                                                : 'bg-black/15 dark:bg-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
                                                        }`}
                                                    >
                                                        <span
                                                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.8)] ring-0 transition duration-200 ease-in-out ${
                                                                settings.weatherClouds ? 'translate-x-5' : 'translate-x-0'
                                                            }`}
                                                        />
                                                    </button>
                                                </div>

                                                {settings.weatherClouds && (
                                                    <div className="pt-2.5 border-t border-black/5 dark:border-white/5 space-y-3 animate-fade-in">
                                                        <div>
                                                            <div className="flex items-center justify-between text-2xs font-bold text-light-text dark:text-dark-text mb-1">
                                                                <span>Cloud Layer Opacity</span>
                                                                <span className="text-cyan-500">{Math.round((settings.weatherCloudsOpacity || 0.75) * 100)}%</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min="0.2"
                                                                max="1.0"
                                                                step="0.05"
                                                                value={settings.weatherCloudsOpacity || 0.75}
                                                                onChange={(e) => updateField('weatherCloudsOpacity', parseFloat(e.target.value))}
                                                                className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-black/10 dark:bg-white/10 rounded-lg"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* NASA GIBS Recent Satellite (Daily True-Color Mosaic) (P-04c) */}
                                            {FEATURE_FLAGS.GEV_P04C_GIBS_DAILY && (
                                                <div className="p-4 rounded-2xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <h4 className="text-xs font-bold text-light-text dark:text-dark-text flex items-center gap-1.5">
                                                                <span>Recent Satellite Mosaic</span>
                                                                {settings.gibsDaily && (
                                                                    <span className="flex items-center gap-1 px-2 py-0.5 text-2xs font-bold rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                                        NASA GIBS VIIRS
                                                                    </span>
                                                                )}
                                                            </h4>
                                                            <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">Daily true-color optical satellite imagery (yesterday & prior)</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => updateField('gibsDaily', !settings.gibsDaily)}
                                                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-black/10 dark:border-white/15 transition-all duration-200 ease-in-out backdrop-blur-md ${
                                                                settings.gibsDaily
                                                                    ? 'bg-emerald-500/85 dark:bg-emerald-500/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_0_10px_rgba(16,185,129,0.3)]'
                                                                    : 'bg-black/15 dark:bg-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]'
                                                            }`}
                                                            aria-label="Toggle NASA GIBS Daily Satellite"
                                                        >
                                                            <span
                                                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.8)] ring-0 transition duration-200 ease-in-out ${
                                                                    settings.gibsDaily ? 'translate-x-5' : 'translate-x-0'
                                                                }`}
                                                            />
                                                        </button>
                                                    </div>

                                                    {settings.gibsDaily && (
                                                        <div className="pt-2.5 border-t border-black/5 dark:border-white/5 space-y-3 animate-fade-in">
                                                            {/* Date Stepper */}
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-2xs font-bold text-light-text dark:text-dark-text">Imagery Date</span>
                                                                <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 rounded-xl p-1 border border-black/5 dark:border-white/5">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const cur = settings.gibsDailyDate || getYesterdayDateString();
                                                                            updateField('gibsDailyDate', adjustDateString(cur, -1));
                                                                        }}
                                                                        className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-light-text dark:text-dark-text transition-colors cursor-pointer"
                                                                        aria-label="Previous day imagery"
                                                                    >
                                                                        <CaretLeft size={16} weight="bold" />
                                                                    </button>
                                                                    <span className="px-2 font-mono font-bold text-xs text-light-text dark:text-dark-text">
                                                                        {settings.gibsDailyDate || getYesterdayDateString()}
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const cur = settings.gibsDailyDate || getYesterdayDateString();
                                                                            const yesterday = getYesterdayDateString();
                                                                            if (cur < yesterday) {
                                                                                updateField('gibsDailyDate', adjustDateString(cur, 1));
                                                                            }
                                                                        }}
                                                                        disabled={(settings.gibsDailyDate || getYesterdayDateString()) >= getYesterdayDateString()}
                                                                        className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-light-text dark:text-dark-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                                                        aria-label="Next day imagery"
                                                                    >
                                                                        <CaretRight size={16} weight="bold" />
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Opacity Slider */}
                                                            <div>
                                                                <div className="flex items-center justify-between text-2xs font-bold text-light-text dark:text-dark-text mb-1">
                                                                    <span>Layer Opacity</span>
                                                                    <span className="text-emerald-500">{Math.round((settings.gibsDailyOpacity || 0.9) * 100)}%</span>
                                                                </div>
                                                                <input
                                                                    type="range"
                                                                    min="0.2"
                                                                    max="1.0"
                                                                    step="0.05"
                                                                    value={settings.gibsDailyOpacity || 0.9}
                                                                    onChange={(e) => updateField('gibsDailyOpacity', parseFloat(e.target.value))}
                                                                    className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-black/10 dark:bg-white/10 rounded-lg"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* TAB 4: FILTERS (when filterTabContent provided by parent) */}
                            {activeTab === 'filters' && filterTabContent && (
                                <div className="space-y-5 animate-fade-in">
                                    {filterTabContent}
                                </div>
                            )}
                        </div>
                        </div>
                    </GlassPanel>
                </div>
            </div>
        </div>,
        document.body
    );
};
