import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowCounterClockwise as RotateCcw, MapTrifold as MapIcon, Airplane as Plane, Stack as Layers, Compass, Sparkle as Sparkles, Globe } from '@phosphor-icons/react';
import { MapAppearanceSettings, DEFAULT_MAP_APPEARANCE, getEffectiveBasemap } from '../types/mapAppearance';
import GlassPanel from './glass/GlassPanel';

const useDarkMode = () => {
    const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'));
    useEffect(() => {
        const observer = new MutationObserver(() => {
            setIsDark(document.documentElement.classList.contains('dark'));
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);
    return isDark;
};

interface MapAppearanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: MapAppearanceSettings;
    onChangeSettings: (newSettings: MapAppearanceSettings) => void;
}

export const MapAppearanceModal: React.FC<MapAppearanceModalProps> = ({
    isOpen,
    onClose,
    settings,
    onChangeSettings
}) => {
    const isDark = useDarkMode();
    const [activeTab, setActiveTab] = useState<'atlas' | 'aviation' | 'atmosphere'>('atlas');

    if (!isOpen) return null;

    const updateField = <K extends keyof MapAppearanceSettings>(field: K, value: MapAppearanceSettings[K]) => {
        onChangeSettings({
            ...settings,
            [field]: value
        });
    };

    const handleReset = () => {
        onChangeSettings({ ...DEFAULT_MAP_APPEARANCE });
    };

    // Quick Presets
    const applyPreset = (preset: 'command' | 'satellite' | 'minimal') => {
        if (preset === 'command') {
            onChangeSettings({
                ...settings,
                projection: 'globe',
                basemap: isDark ? 'onyx' : 'snow',
                airportDetail: 'detailed',
                routeColorMode: 'gradient',
                routeScale: 'normal',
                timeOfDay: true,
                rainRadar: false
            });
        } else if (preset === 'satellite') {
            onChangeSettings({
                ...settings,
                projection: 'globe',
                basemap: isDark ? 'satellite' : 'vibrant',
                airportDetail: 'standard',
                routeColorMode: 'default',
                routeScale: 'normal',
                timeOfDay: true,
                rainRadar: false
            });
        } else if (preset === 'minimal') {
            onChangeSettings({
                ...settings,
                projection: 'flat',
                basemap: isDark ? 'onyx' : 'snow',
                airportDetail: 'standard',
                routeColorMode: 'default',
                routeScale: 'thin',
                timeOfDay: false,
                rainRadar: false
            });
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-sans select-none">
            {/* Scrim Backdrop */}
            <div 
                className="fixed inset-0 bg-black/40 dark:bg-black/60 transition-opacity" 
                onClick={onClose} 
            />

            {/* Modal Dialog with Liquid Glass */}
            <GlassPanel
                className="wg-glass-card w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[88vh] z-10"
                padding="0px"
                overrides={{ borderRadius: 28 }}
            >
                <div 
                    className="flex flex-col h-full w-full overflow-hidden rounded-[28px]"
                    onClick={(e) => e.stopPropagation()}
                >
                {/* Header with WanderGrid Studio Brand */}
                <div className="p-6 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-primary-500/5 to-transparent shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white bg-primary-500 shrink-0 shadow-md transition-transform hover:scale-105">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-light-text dark:text-dark-text tracking-tight truncate">WanderGrid Map Studio</h2>
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-0.5">Cartography & Telemetry Customizer</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleReset}
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                            title="Reset to defaults"
                        >
                            <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                            onClick={onClose}
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                            aria-label="Close modal"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Quick Presets Ribbon */}
                <div className="px-6 py-3 bg-black/[0.02] dark:bg-white/[0.02] border-b border-black/5 dark:border-white/5 flex items-center gap-2 overflow-x-auto custom-scrollbar">
                    <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary shrink-0">Presets:</span>
                    <button
                        onClick={() => applyPreset('command')}
                        className="px-3 py-1 rounded-xl bg-primary-500/10 hover:bg-primary-500/20 border border-primary-500/20 text-primary-600 dark:text-primary-400 text-xs font-bold shrink-0 transition-all cursor-pointer"
                    >
                        🌐 Aviation Command
                    </button>
                    <button
                        onClick={() => applyPreset('satellite')}
                        className="px-3 py-1 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold shrink-0 transition-all cursor-pointer"
                    >
                        🛰️ Earth Orbit
                    </button>
                    <button
                        onClick={() => applyPreset('minimal')}
                        className="px-3 py-1 rounded-xl bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 border border-black/5 dark:border-white/5 text-light-text-secondary dark:text-dark-text-secondary text-xs font-bold shrink-0 transition-all cursor-pointer"
                    >
                        🗺️ Minimal Atlas
                    </button>
                </div>

                {/* Tab Navigation Pill Bar */}
                <div className="px-6 py-3 border-b border-black/5 dark:border-white/5">
                    <div className="flex p-1 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5 gap-1">
                        {[
                            { id: 'atlas', label: 'Atlas & Cartography', icon: MapIcon },
                            { id: 'aviation', label: 'Aviation & Hubs', icon: Plane },
                            { id: 'atmosphere', label: 'Atmosphere & Radar', icon: Layers }
                        ].map((tab) => {
                            const isSelected = activeTab === tab.id;
                            const IconComponent = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                        isSelected
                                            ? 'bg-white dark:bg-dark-card text-primary-500 shadow-sm'
                                            : 'text-light-text-secondary dark:text-dark-text-secondary opacity-60 hover:opacity-100'
                                    }`}
                                >
                                    <IconComponent className="w-3.5 h-3.5" />
                                    <span>{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Content Body */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar text-light-text dark:text-dark-text">
                    {/* TAB 1: ATLAS */}
                    {activeTab === 'atlas' && (
                        <div className="space-y-6">
                            {/* PROJECTION ENGINE */}
                            <div className="p-4 rounded-3xl bg-gradient-to-b from-white/[0.07] to-white/[0.02] border border-white/10 shadow-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                            <Compass className="w-4 h-4" />
                                        </div>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">Projection Engine</h3>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                        {settings.projection === 'globe' ? '3D Orbital' : '2D Planar'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 pt-1">
                                    <button
                                        onClick={() => updateField('projection', 'globe')}
                                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                            settings.projection === 'globe'
                                                ? 'bg-blue-600/20 border-blue-400 ring-1 ring-blue-500/30 text-light-text dark:text-dark-text font-bold'
                                                : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/20 dark:hover:border-white/20'
                                        }`}
                                    >
                                        <Globe className={`w-4 h-4 shrink-0 transition-colors duration-200 ${
                                            settings.projection === 'globe' ? 'text-blue-400' : 'text-zinc-400'
                                        }`} />
                                        <span className="text-xs font-bold leading-tight truncate">3D Globe</span>
                                    </button>

                                    <button
                                        onClick={() => updateField('projection', 'flat')}
                                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                                            settings.projection === 'flat'
                                                ? 'bg-blue-600/20 border-blue-400 ring-1 ring-blue-500/30 text-light-text dark:text-dark-text font-bold'
                                                : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/20 dark:hover:border-white/20'
                                        }`}
                                    >
                                        <MapIcon className={`w-4 h-4 shrink-0 transition-colors duration-200 ${
                                            settings.projection === 'flat' ? 'text-blue-400' : 'text-zinc-400'
                                        }`} />
                                        <span className="text-xs font-bold leading-tight truncate">2D Flat Map</span>
                                    </button>
                                </div>
                            </div>

                            {/* BASEMAP TILES */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-xs font-bold text-zinc-400 tracking-wider uppercase">Cartographic Basemap</h3>
                                    <span className="text-xs font-medium text-zinc-500">3 Curated Tilesets ({isDark ? 'Dark Mode' : 'Light Mode'})</span>
                                </div>

                                <div className="grid grid-cols-3 gap-2.5">
                                    {(isDark ? [
                                        { 
                                            id: 'onyx', 
                                            label: 'Onyx', 
                                            desc: 'High-contrast deep black',
                                            renderSwatch: () => (
                                                <div className="w-full h-8 rounded-xl border border-white/15 flex items-center px-2.5 justify-between bg-gradient-to-r from-black via-zinc-950 to-zinc-900 relative overflow-hidden">
                                                    <div className="flex items-center gap-1.5 z-10">
                                                        <span className="text-xs">🌑</span>
                                                        <span className="text-xs font-bold text-light-text dark:text-dark-text drop-shadow">Onyx</span>
                                                    </div>
                                                    <div className="w-2 h-2 rounded-full border border-white/40 z-10" />
                                                </div>
                                            )
                                        },
                                        { 
                                            id: 'citylights', 
                                            label: 'NASA Lights', 
                                            desc: 'VIIRS night city lights',
                                            renderSwatch: () => (
                                                <div className="w-full h-8 rounded-xl border border-amber-500/30 flex items-center px-2.5 justify-between bg-[#040711] relative overflow-hidden">
                                                    <div className="absolute top-1.5 right-12 w-1.5 h-1.5 rounded-full bg-amber-400/90 shadow-[0_0_6px_#f59e0b] animate-pulse" />
                                                    <div className="absolute bottom-1.5 right-7 w-1 h-1 rounded-full bg-amber-300/80 shadow-[0_0_4px_#f59e0b]" />
                                                    <div className="flex items-center gap-1.5 z-10">
                                                         <span className="text-xs">✨</span>
                                                         <span className="text-xs font-bold text-amber-100 drop-shadow-sm">NASA</span>
                                                    </div>
                                                    <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b] z-10" />
                                                </div>
                                            )
                                        },
                                        { 
                                            id: 'satellite', 
                                            label: 'Satellite', 
                                            desc: 'High-res orbital imagery',
                                            renderSwatch: () => (
                                                <div className="w-full h-8 rounded-xl border border-emerald-500/20 flex items-center px-2.5 justify-between bg-gradient-to-r from-[#0a1a14] to-[#0d2a1f] relative overflow-hidden">
                                                    <div className="flex items-center gap-1.5 z-10">
                                                        <span className="text-xs">🛰️</span>
                                                        <span className="text-xs font-bold text-emerald-200">Satellite</span>
                                                    </div>
                                                    <div className="w-2 h-2 rounded-full border border-emerald-400/50 z-10" />
                                                </div>
                                            )
                                        }
                                    ] : [
                                        { 
                                            id: 'snow', 
                                            label: 'Snow', 
                                            desc: 'Clean high-contrast white',
                                            renderSwatch: () => (
                                                <div className="w-full h-8 rounded-xl border border-black/10 flex items-center px-2.5 justify-between bg-gradient-to-r from-zinc-100 via-white to-zinc-200 relative overflow-hidden">
                                                    <div className="flex items-center gap-1.5 z-10">
                                                        <span className="text-xs">❄️</span>
                                                        <span className="text-xs font-bold text-zinc-800">Snow</span>
                                                    </div>
                                                    <div className="w-2 h-2 rounded-full border border-zinc-400 z-10" />
                                                </div>
                                            )
                                        },
                                        { 
                                            id: 'vibrant', 
                                            label: 'Vibrant', 
                                            desc: 'Parks, water & roads',
                                            renderSwatch: () => (
                                                <div className="w-full h-8 rounded-xl border border-emerald-500/30 flex items-center px-2.5 justify-between bg-gradient-to-r from-[#e0f2fe] via-[#ecfdf5] to-[#fef3c7] relative overflow-hidden">
                                                    <div className="flex items-center gap-1.5 z-10">
                                                        <span className="text-xs">🎨</span>
                                                        <span className="text-xs font-bold text-emerald-800">Vibrant</span>
                                                    </div>
                                                    <div className="flex items-center gap-1 z-10">
                                                        <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_4px_#38bdf8]" title="Water" />
                                                        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_4px_#34d399]" title="Parks" />
                                                    </div>
                                                </div>
                                            )
                                        },
                                        { 
                                            id: 'ocean', 
                                            label: 'Bathymetry', 
                                            desc: 'Marine sea floor topography',
                                            renderSwatch: () => (
                                                <div className="w-full h-8 rounded-xl border border-cyan-500/30 flex items-center px-2.5 justify-between bg-gradient-to-r from-[#e0f7fa] to-[#b2ebf2] relative overflow-hidden">
                                                    <div className="flex items-center gap-1.5 z-10">
                                                        <span className="text-xs">🌊</span>
                                                        <span className="text-xs font-bold text-cyan-900">Bathymetry</span>
                                                    </div>
                                                    <div className="w-2 h-2 rounded-full border border-cyan-500/60 z-10" />
                                                </div>
                                            )
                                        }
                                    ]).map(b => {
                                        const effectiveBasemap = getEffectiveBasemap(settings.basemap, isDark);
                                        const isSelected = effectiveBasemap === b.id;
                                        return (
                                            <button
                                                key={b.id}
                                                onClick={() => updateField('basemap', b.id as any)}
                                                className={`p-2.5 rounded-2xl border transition-all text-left flex flex-col justify-between gap-2 cursor-pointer ${
                                                    isSelected
                                                        ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                        : 'border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:border-black/20 dark:hover:border-white/20'
                                                }`}
                                            >
                                                {b.renderSwatch()}
                                                <div>
                                                    <p className="text-xs font-bold text-light-text dark:text-dark-text truncate">{b.label}</p>
                                                    <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary line-clamp-1">{b.desc}</p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* SCRATCH CITY PINS */}
                            <div className="p-4 rounded-3xl bg-gradient-to-b from-white/[0.07] to-white/[0.02] border border-white/10 shadow-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">Scratch City Pins</h3>
                                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Marker sizing & visibility on foil</p>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                        {settings.scratchCitySize === 'off' ? 'Hidden' : settings.scratchCitySize || 'Normal'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-4 gap-1.5">
                                    {[
                                        { id: 'off', label: 'Hidden' },
                                        { id: 'small', label: 'Micro' },
                                        { id: 'medium', label: 'Normal' },
                                        { id: 'large', label: 'Expansive' }
                                    ].map((sz) => (
                                        <button
                                            key={sz.id}
                                            type="button"
                                            onClick={() => updateField('scratchCitySize', sz.id as any)}
                                            className={`py-2 rounded-xl text-xs font-bold text-center border transition-all cursor-pointer ${
                                                (settings.scratchCitySize || 'medium') === sz.id
                                                    ? 'bg-blue-600 text-white border-blue-400'
                                                    : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-white hover:border-black/20 dark:hover:border-white/20'
                                            }`}
                                        >
                                            {sz.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* SCRATCH HIGHLIGHT TOGGLES (LIVED & WISHLIST) */}
                            <div className="p-4 rounded-3xl bg-gradient-to-b from-white/[0.07] to-white/[0.02] border border-white/10 shadow-xl space-y-3">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">Territory Highlights</h3>

                                {/* Lived Residences Toggle */}
                                <div className="flex items-center justify-between pt-1">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-sm">
                                            🏠
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-light-text dark:text-dark-text">Lived Residences</p>
                                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Current & past homes on foil</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => updateField('showLivedCountries', settings.showLivedCountries === false ? true : false)}
                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                            settings.showLivedCountries !== false ? 'bg-emerald-500' : 'bg-zinc-700'
                                        }`}
                                    >
                                        <span
                                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                                settings.showLivedCountries !== false ? 'translate-x-5' : 'translate-x-0'
                                            }`}
                                        />
                                    </button>
                                </div>

                                <div className="h-px bg-white/5" />

                                {/* Layover Territories Toggle */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-sm">
                                            🛫
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-light-text dark:text-dark-text">Layover Territories</p>
                                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Airport transit & connections</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => updateField('showLayoverCountries', settings.showLayoverCountries === false ? true : false)}
                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                            settings.showLayoverCountries !== false ? 'bg-amber-500' : 'bg-zinc-700'
                                        }`}
                                    >
                                        <span
                                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                                settings.showLayoverCountries !== false ? 'translate-x-5' : 'translate-x-0'
                                            }`}
                                        />
                                    </button>
                                </div>

                                <div className="h-px bg-white/5" />

                                {/* Wishlist Destinations Toggle */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-7 h-7 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-sm">
                                            🌟
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-light-text dark:text-dark-text">Wishlist Destinations</p>
                                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Dream expedition targets</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => updateField('showWishlistCountries', settings.showWishlistCountries === false ? true : false)}
                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                            settings.showWishlistCountries !== false ? 'bg-rose-500' : 'bg-zinc-700'
                                        }`}
                                    >
                                        <span
                                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                                settings.showWishlistCountries !== false ? 'translate-x-5' : 'translate-x-0'
                                            }`}
                                        />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: AVIATION */}
                    {activeTab === 'aviation' && (
                        <div className="space-y-6">
                            {/* AERODROME MARKINGS */}
                            <div className="p-4 rounded-3xl bg-gradient-to-b from-white/[0.07] to-white/[0.02] border border-white/10 shadow-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-light-text dark:text-dark-text">Aerodrome Infrastructure</h3>
                                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Physical runways & taxiways</p>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                        {settings.airportDetail === 'detailed' ? 'True Layout' : 'Beacon'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2.5">
                                    <button
                                        onClick={() => updateField('airportDetail', 'standard')}
                                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                                            settings.airportDetail === 'standard'
                                                ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30 text-light-text dark:text-dark-text'
                                                : 'border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/20 dark:hover:border-white/20'
                                        }`}
                                    >
                                        <p className="text-xs font-bold text-light-text dark:text-dark-text">Minimal Beacon</p>
                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">Circular hub nodes</p>
                                    </button>

                                    <button
                                        onClick={() => updateField('airportDetail', 'detailed')}
                                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                                            settings.airportDetail === 'detailed'
                                                ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30 text-light-text dark:text-dark-text'
                                                : 'border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary hover:border-black/20 dark:hover:border-white/20'
                                        }`}
                                    >
                                        <p className="text-xs font-bold text-light-text dark:text-dark-text">True Runways</p>
                                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">Meter-accurate strips</p>
                                    </button>
                                </div>
                            </div>

                            {/* HUB NODES */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-xs font-bold text-zinc-400 tracking-wider uppercase">Airport Hub Sizing</h3>
                                    <span className="text-xs text-zinc-400 capitalize">{settings.airportSize} • {settings.airportMode}</span>
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
                                            className={`py-2 rounded-xl text-xs font-bold text-center border transition-all cursor-pointer ${
                                                settings.airportSize === sz.id
                                                    ? 'bg-blue-600 text-white border-blue-400'
                                                    : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-white hover:border-black/20 dark:hover:border-white/20'
                                            }`}
                                        >
                                            {sz.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => updateField('airportMode', 'frequency')}
                                        className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                                            settings.airportMode === 'frequency'
                                                ? 'border-blue-500 bg-blue-500/10 text-blue-500 dark:text-blue-300 ring-2 ring-blue-500/20'
                                                : 'border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-white hover:border-black/20 dark:hover:border-white/20'
                                        }`}
                                    >
                                        Weighted by Traffic
                                    </button>
                                    <button
                                        onClick={() => updateField('airportMode', 'uniform')}
                                        className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                                            settings.airportMode === 'uniform'
                                                ? 'border-blue-500 bg-blue-500/10 text-blue-500 dark:text-blue-300 ring-2 ring-blue-500/20'
                                                : 'border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-white hover:border-black/20 dark:hover:border-white/20'
                                        }`}
                                    >
                                        Uniform Scale
                                    </button>
                                </div>
                            </div>

                            {/* ROUTE PRESENTATION */}
                            <div className="space-y-4 pt-3 border-t border-black/5 dark:border-white/5">
                                <h3 className="text-xs font-bold text-light-text-secondary dark:text-zinc-400 tracking-wider uppercase">Route Arcs Presentation</h3>

                                {/* Color Palette */}
                                <div>
                                    <span className="text-xs text-light-text dark:text-zinc-300 font-semibold mb-2 block">Color Palette</span>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { id: 'gradient', label: 'Aurora Gradient', desc: 'Regional spectrum' },
                                            { id: 'frequency', label: 'Heatmap Density', desc: 'Thermal energy spectrum' },
                                            { id: 'default', label: 'Cobalt Standard', desc: 'Uniform blue' }
                                        ].map((cl) => (
                                            <button
                                                key={cl.id}
                                                onClick={() => updateField('routeColorMode', cl.id as any)}
                                                className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                                                    settings.routeColorMode === cl.id
                                                        ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                        : 'border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:border-black/20 dark:hover:border-white/20'
                                                }`}
                                            >
                                                <p className="text-xs font-bold text-light-text dark:text-dark-text">{cl.label}</p>
                                                <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary">{cl.desc}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* MULTI-MODAL ROUTE INTELLIGENCE */}
                                <div className="space-y-3 pt-3 border-t border-black/5 dark:border-white/5">
                                    <h3 className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider uppercase">
                                        Multi-Modal Route Intelligence
                                    </h3>

                                    {/* Unified Route Tracing (Road, Rail & Sea) */}
                                    <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 flex items-center justify-between">
                                        <div>
                                            <h4 className="text-xs font-bold text-light-text dark:text-dark-text flex items-center gap-1.5">
                                                <span>Realistic Route Tracing</span>
                                                <span className="px-2 py-0.5 text-2xs font-bold uppercase tracking-wider rounded-full bg-primary-500/20 text-primary-600 dark:text-primary-400 border border-primary-500/30">
                                                    Road & Rail
                                                </span>
                                            </h4>
                                            <p className="text-xs text-light-text-secondary dark:text-zinc-400 mt-0.5">
                                                Follows real highways (OSRM) and railway tracks (OSM Rail)
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => updateField('routeTracing', settings.routeTracing === false ? true : false)}
                                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                                settings.routeTracing !== false ? 'bg-primary-500' : 'bg-zinc-300 dark:bg-zinc-700'
                                            }`}
                                        >
                                            <span
                                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                                    settings.routeTracing !== false ? 'translate-x-5' : 'translate-x-0'
                                                }`}
                                            />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: ATMOSPHERE */}
                    {activeTab === 'atmosphere' && (
                        <div className="space-y-6">
                            <h3 className="text-xs font-bold text-zinc-400 tracking-wider uppercase mb-3">
                                Atmospheric Telemetry
                            </h3>

                            <div className="space-y-3">
                                {/* Time of Day */}
                                <div className="p-4 rounded-3xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="text-xs font-bold text-light-text dark:text-dark-text flex items-center gap-1.5">
                                                <span>Solar Twilight Shading</span>
                                                {settings.timeOfDay && (
                                                    <span className="px-2 py-0.5 text-2xs font-bold uppercase tracking-wider rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                                        14-Band Penumbra
                                                    </span>
                                                )}
                                            </h4>
                                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5">Atmospheric multi-band twilight gradient</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => updateField('timeOfDay', !settings.timeOfDay)}
                                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                                settings.timeOfDay ? 'bg-blue-600' : 'bg-black/10 dark:bg-white/10'
                                            }`}
                                        >
                                            <span
                                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                                    settings.timeOfDay ? 'translate-x-5' : 'translate-x-0'
                                                }`}
                                            />
                                        </button>
                                    </div>
                                </div>

                                {/* Rain Radar */}
                                <div className="p-4 rounded-3xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="text-xs font-bold text-light-text dark:text-dark-text flex items-center gap-1.5">
                                                <span>Doppler Rain Radar</span>
                                                {settings.rainRadar && (
                                                    <span className="flex items-center gap-1 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                        Live Stream
                                                    </span>
                                                )}
                                            </h4>
                                            <p className="text-xs text-zinc-400 mt-0.5">Global precipitation radar telemetry</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => updateField('rainRadar', !settings.rainRadar)}
                                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                                settings.rainRadar ? 'bg-blue-600' : 'bg-zinc-700'
                                            }`}
                                        >
                                            <span
                                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                                    settings.rainRadar ? 'translate-x-5' : 'translate-x-0'
                                                }`}
                                            />
                                        </button>
                                    </div>

                                    {settings.rainRadar && (
                                        <div className="pt-2.5 border-t border-white/5 space-y-3 animate-fade-in">
                                            {/* Opacity Slider */}
                                            <div>
                                                <div className="flex items-center justify-between text-xs font-medium text-zinc-300 mb-1">
                                                    <span>Radar Intensity</span>
                                                    <span className="text-blue-400">{Math.round((settings.rainRadarOpacity || 0.85) * 100)}%</span>
                                                </div>
                                                <input 
                                                    type="range" 
                                                    min="0.2" 
                                                    max="1.0" 
                                                    step="0.05"
                                                    value={settings.rainRadarOpacity || 0.85}
                                                    onChange={(e) => updateField('rainRadarOpacity', parseFloat(e.target.value))}
                                                    className="w-full accent-blue-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                </div>
            </GlassPanel>
        </div>,
        document.body
    );
};
