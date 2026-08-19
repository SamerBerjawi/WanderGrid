import React, { useState } from 'react';
import { X, RotateCcw, Map as MapIcon, Plane, Layers, Compass, Sparkles } from 'lucide-react';
import { MapAppearanceSettings, DEFAULT_MAP_APPEARANCE } from '../types/mapAppearance';

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
                basemap: 'default',
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
                basemap: 'satellite',
                airportDetail: 'standard',
                routeColorMode: 'default',
                routeScale: 'thick',
                timeOfDay: false,
                rainRadar: true
            });
        } else {
            onChangeSettings({
                ...settings,
                projection: 'flat',
                basemap: 'default',
                airportDetail: 'standard',
                routeColorMode: 'default',
                routeScale: 'thin',
                timeOfDay: false,
                rainRadar: false
            });
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xl animate-fade-in select-none">
            {/* Modal Dialog */}
            <div 
                className="w-full max-w-lg bg-[#0b0f17]/95 text-white rounded-[32px] border border-white/15 shadow-[0_25px_70px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[88vh] backdrop-blur-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header with WanderGrid Studio Brand */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/25 border border-white/20">
                            <Sparkles className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-white tracking-tight">WanderGrid Map Studio</h2>
                            <p className="text-[10px] font-bold text-zinc-400">Cartography & Telemetry Customizer</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleReset}
                            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                            title="Reset to defaults"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                            title="Close modal"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Quick Presets Ribbon */}
                <div className="px-6 py-2.5 bg-zinc-950/60 border-b border-white/5 flex items-center gap-2 overflow-x-auto custom-scrollbar">
                    <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 shrink-0">Presets:</span>
                    <button
                        onClick={() => applyPreset('command')}
                        className="px-2.5 py-1 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 text-[11px] font-bold shrink-0 transition-all cursor-pointer"
                    >
                        🌐 Aviation Command
                    </button>
                    <button
                        onClick={() => applyPreset('satellite')}
                        className="px-2.5 py-1 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold shrink-0 transition-all cursor-pointer"
                    >
                        🛰️ Earth Orbit
                    </button>
                    <button
                        onClick={() => applyPreset('minimal')}
                        className="px-2.5 py-1 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 border border-white/10 text-zinc-300 text-[11px] font-bold shrink-0 transition-all cursor-pointer"
                    >
                        🗺️ Minimal Atlas
                    </button>
                </div>

                {/* Tab Navigation Pill Bar */}
                <div className="px-6 py-3 border-b border-white/5">
                    <div className="flex p-1 bg-zinc-950/80 rounded-2xl border border-white/5 gap-1">
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
                                    className={`flex-1 py-2 rounded-xl text-xs font-bold tracking-wide transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                        isSelected
                                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md font-black border border-white/20'
                                            : 'text-zinc-400 hover:text-zinc-200'
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
                <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar text-white">
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
                                        <div>
                                            <h3 className="text-xs font-black uppercase tracking-wider text-white">Projection Engine</h3>
                                            <p className="text-[10px] text-zinc-400">Choose between 3D Globe and 2D Mercator</p>
                                        </div>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                        {settings.projection === 'globe' ? '3D Orbital' : '2D Planar'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2.5 pt-1">
                                    <button
                                        onClick={() => updateField('projection', 'globe')}
                                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between h-20 ${
                                            settings.projection === 'globe'
                                                ? 'bg-blue-600/20 border-blue-400 ring-2 ring-blue-500/30 text-white'
                                                : 'bg-zinc-900/60 border-white/10 text-zinc-400 hover:border-white/20'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="material-icons-outlined text-lg text-blue-400">public</span>
                                            {settings.projection === 'globe' && <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_#60a5fa]" />}
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-white">3D Celestial Globe</p>
                                            <p className="text-[9px] text-zinc-400">Spherical geodesics</p>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => updateField('projection', 'flat')}
                                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between h-20 ${
                                            settings.projection === 'flat'
                                                ? 'bg-blue-600/20 border-blue-400 ring-2 ring-blue-500/30 text-white'
                                                : 'bg-zinc-900/60 border-white/10 text-zinc-400 hover:border-white/20'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="material-icons-outlined text-lg text-indigo-400">map</span>
                                            {settings.projection === 'flat' && <div className="w-2 h-2 rounded-full bg-indigo-400 shadow-[0_0_8px_#818cf8]" />}
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-white">2D Mercator Atlas</p>
                                            <p className="text-[9px] text-zinc-400">Flat planar view</p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* BASEMAP TILES */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-[11px] font-black text-zinc-400 tracking-wider uppercase">Cartographic Basemap</h3>
                                    <span className="text-[10px] font-bold text-zinc-500">4 Curated Tilesets</span>
                                </div>

                                <div className="grid grid-cols-2 gap-2.5">
                                    {[
                                        { 
                                            id: 'default', 
                                            label: 'Adaptive Atlas', 
                                            desc: 'Auto theme matching (Day/Night)',
                                            renderSwatch: () => (
                                                <div className="w-full h-8 rounded-xl border border-white/15 flex items-center px-2.5 justify-between bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-800 relative overflow-hidden">
                                                    <div className="flex items-center gap-1.5 z-10">
                                                        <span className="text-[10px]">🌙</span>
                                                        <span className="text-[10px] font-bold text-zinc-300">Dark</span>
                                                        <span className="text-[9px] text-zinc-500">/</span>
                                                        <span className="text-[10px]">☀️</span>
                                                        <span className="text-[10px] font-bold text-zinc-300">Light</span>
                                                    </div>
                                                    <div className="w-2 h-2 rounded-full border border-white/40 z-10" />
                                                </div>
                                            )
                                        },
                                        { 
                                            id: 'citylights', 
                                            label: 'NASA Earth at Night', 
                                            desc: 'VIIRS HD city light radiance',
                                            renderSwatch: () => (
                                                <div className="w-full h-8 rounded-xl border border-amber-500/30 flex items-center px-2.5 justify-between bg-[#040711] relative overflow-hidden">
                                                    <div className="absolute top-2 left-10 w-1 h-1 rounded-full bg-amber-400 shadow-[0_0_4px_#f59e0b] animate-pulse" />
                                                    <div className="absolute bottom-2 left-20 w-1.5 h-1.5 rounded-full bg-amber-300 shadow-[0_0_6px_#f59e0b]" />
                                                    <div className="flex items-center gap-1.5 z-10">
                                                        <span className="text-[10px]">✨</span>
                                                        <span className="text-[10px] font-black text-amber-200">NASA Lights</span>
                                                    </div>
                                                    <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b] z-10" />
                                                </div>
                                            )
                                        },
                                        { 
                                            id: 'satellite', 
                                            label: 'Earth Observation', 
                                            desc: 'High-res orbital imagery',
                                            renderSwatch: () => (
                                                <div className="w-full h-8 rounded-xl border border-emerald-500/20 flex items-center px-2.5 justify-between bg-gradient-to-r from-[#0a1a14] to-[#0d2a1f] relative overflow-hidden">
                                                    <div className="flex items-center gap-1.5 z-10">
                                                        <span className="text-[10px]">🛰️</span>
                                                        <span className="text-[10px] font-bold text-emerald-200">Satellite</span>
                                                    </div>
                                                    <div className="w-2 h-2 rounded-full border border-emerald-400/50 z-10" />
                                                </div>
                                            )
                                        },
                                        { 
                                            id: 'ocean', 
                                            label: 'Ocean Bathymetry', 
                                            desc: 'Marine sea floor topography',
                                            renderSwatch: () => (
                                                <div className="w-full h-8 rounded-xl border border-cyan-500/20 flex items-center px-2.5 justify-between bg-gradient-to-r from-[#041424] to-[#08223a] relative overflow-hidden">
                                                    <div className="flex items-center gap-1.5 z-10">
                                                        <span className="text-[10px]">🌊</span>
                                                        <span className="text-[10px] font-bold text-cyan-200">Bathymetry</span>
                                                    </div>
                                                    <div className="w-2 h-2 rounded-full border border-cyan-400/50 z-10" />
                                                </div>
                                            )
                                        }
                                    ].map(b => (
                                        <button
                                            key={b.id}
                                            onClick={() => updateField('basemap', b.id as any)}
                                            className={`p-3 rounded-2xl border transition-all text-left flex flex-col justify-between gap-2 cursor-pointer ${
                                                settings.basemap === b.id
                                                    ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                    : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                            }`}
                                        >
                                            {b.renderSwatch()}
                                            <div>
                                                <p className="text-xs font-bold text-zinc-100">{b.label}</p>
                                                <p className="text-[9px] text-zinc-400">{b.desc}</p>
                                            </div>
                                        </button>
                                    ))}
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
                                        <h3 className="text-xs font-black uppercase tracking-wider text-white">Aerodrome Infrastructure</h3>
                                        <p className="text-[10px] text-zinc-400">Physical runways & taxiways</p>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                        {settings.airportDetail === 'detailed' ? 'True Layout' : 'Beacon'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2.5">
                                    <button
                                        onClick={() => updateField('airportDetail', 'standard')}
                                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                                            settings.airportDetail === 'standard'
                                                ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30 text-white'
                                                : 'border-white/10 bg-zinc-900/60 text-zinc-400 hover:border-white/20'
                                        }`}
                                    >
                                        <p className="text-xs font-black text-white">Minimal Beacon</p>
                                        <p className="text-[9px] text-zinc-400 mt-0.5">Circular hub nodes</p>
                                    </button>

                                    <button
                                        onClick={() => updateField('airportDetail', 'detailed')}
                                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                                            settings.airportDetail === 'detailed'
                                                ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30 text-white'
                                                : 'border-white/10 bg-zinc-900/60 text-zinc-400 hover:border-white/20'
                                        }`}
                                    >
                                        <p className="text-xs font-black text-white">True Runways</p>
                                        <p className="text-[9px] text-zinc-400 mt-0.5">Meter-accurate strips</p>
                                    </button>
                                </div>
                            </div>

                            {/* HUB NODES */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-[11px] font-black text-zinc-400 tracking-wider uppercase">Airport Hub Sizing</h3>
                                    <span className="text-[10px] text-zinc-400 capitalize">{settings.airportSize} • {settings.airportMode}</span>
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
                                                    : 'bg-zinc-900/60 border-white/10 text-zinc-400 hover:text-white'
                                            }`}
                                        >
                                            {sz.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* ROUTE PRESENTATION */}
                            <div className="space-y-4 pt-3 border-t border-white/5">
                                <h3 className="text-[11px] font-black text-zinc-400 tracking-wider uppercase">Route Arcs Presentation</h3>

                                {/* Color Palette */}
                                <div>
                                    <span className="text-xs text-zinc-300 font-semibold mb-2 block">Color Palette</span>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { id: 'gradient', label: 'Aurora Gradient', desc: 'Regional spectrum' },
                                            { id: 'frequency', label: 'Heatmap Density', desc: 'Traffic colored' },
                                            { id: 'default', label: 'Cobalt Standard', desc: 'Uniform blue' }
                                        ].map((cl) => (
                                            <button
                                                key={cl.id}
                                                onClick={() => updateField('routeColorMode', cl.id as any)}
                                                className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                                                    settings.routeColorMode === cl.id
                                                        ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                        : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                                }`}
                                            >
                                                <p className="text-xs font-bold text-white">{cl.label}</p>
                                                <p className="text-[9px] text-zinc-400">{cl.desc}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: ATMOSPHERE */}
                    {activeTab === 'atmosphere' && (
                        <div className="space-y-6">
                            <h3 className="text-[11px] font-black text-zinc-400 tracking-wider uppercase mb-3">
                                Atmospheric Telemetry
                            </h3>

                            <div className="space-y-3">
                                {/* Time of Day */}
                                <div className="p-4 rounded-3xl bg-zinc-900/60 border border-white/10 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                                                <span>Solar Twilight Shading</span>
                                                {settings.timeOfDay && (
                                                    <span className="px-2 py-0.5 text-[9px] font-black rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                                        14-Band Penumbra
                                                    </span>
                                                )}
                                            </h4>
                                            <p className="text-[10px] text-zinc-400 mt-0.5">Atmospheric multi-band twilight gradient</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => updateField('timeOfDay', !settings.timeOfDay)}
                                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                                settings.timeOfDay ? 'bg-blue-600' : 'bg-zinc-700'
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
                                <div className="p-4 rounded-3xl bg-zinc-900/60 border border-white/10 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                                                <span>Doppler Rain Radar</span>
                                                {settings.rainRadar && (
                                                    <span className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-black rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                        Live Stream
                                                    </span>
                                                )}
                                            </h4>
                                            <p className="text-[10px] text-zinc-400 mt-0.5">Global precipitation radar telemetry</p>
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
                                                <div className="flex items-center justify-between text-[10px] font-bold text-zinc-300 mb-1">
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

                                            {/* Radar Color Palette */}
                                            <div>
                                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">Radar Palette</span>
                                                <div className="grid grid-cols-3 gap-1.5">
                                                    {[
                                                        { id: 2, label: 'Universal' },
                                                        { id: 1, label: 'Classic' },
                                                        { id: 6, label: 'NEXRAD' }
                                                    ].map(p => (
                                                        <button
                                                            key={p.id}
                                                            onClick={() => updateField('rainRadarColorScheme', p.id)}
                                                            className={`py-1.5 px-1 rounded-lg text-[10px] font-bold text-center border transition-all cursor-pointer ${
                                                                (settings.rainRadarColorScheme || 2) === p.id
                                                                    ? 'bg-blue-600 text-white border-blue-400 shadow-sm'
                                                                    : 'bg-zinc-800/80 border-white/5 text-zinc-400 hover:text-white'
                                                            }`}
                                                        >
                                                            {p.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
