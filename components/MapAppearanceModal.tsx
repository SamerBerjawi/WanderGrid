import React, { useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
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
    const [activeTab, setActiveTab] = useState<'map' | 'flights' | 'layers'>('map');

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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in select-none">
            {/* Modal Dialog */}
            <div 
                className="w-full max-w-md bg-[#12141a] text-white rounded-3xl border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-white/5">
                    <h2 className="text-lg font-bold text-white tracking-tight">Map appearance</h2>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleReset}
                            className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-white/5"
                        >
                            Reset
                        </button>
                        <button
                            onClick={onClose}
                            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Tab Navigation Pill Switch */}
                <div className="px-6 py-3 border-b border-white/5">
                    <div className="flex p-1 bg-zinc-900/90 rounded-xl border border-white/5">
                        {(['map', 'flights', 'layers'] as const).map((tab) => {
                            const isSelected = activeTab === tab;
                            const label = tab === 'map' ? 'Map' : tab === 'flights' ? 'Flights' : 'Layers';
                            return (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                                        isSelected
                                            ? 'bg-zinc-800 text-white shadow-sm font-bold'
                                            : 'text-zinc-400 hover:text-zinc-200'
                                    }`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Content Body */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
                    {/* TAB 1: MAP */}
                    {activeTab === 'map' && (
                        <div className="space-y-6">
                            {/* BASEMAP */}
                            <div>
                                <h3 className="text-[11px] font-bold text-zinc-400 tracking-wider uppercase mb-3">
                                    Basemap
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {/* Default Basemap */}
                                    <button
                                        onClick={() => updateField('basemap', 'default')}
                                        className={`p-2.5 rounded-2xl border transition-all text-center flex flex-col items-center gap-2 cursor-pointer ${
                                            settings.basemap === 'default'
                                                ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                        }`}
                                    >
                                        <div className="w-full h-16 rounded-xl bg-[#161a23] border border-white/5 flex items-center justify-center overflow-hidden relative">
                                            {/* Map Grid Vector */}
                                            <svg className="w-full h-full opacity-60" viewBox="0 0 120 60">
                                                <path d="M0,20 L120,20 M0,40 L120,40 M40,0 L40,60 M80,0 L80,60" stroke="#384252" strokeWidth="1.5" />
                                                <path d="M10,10 L35,50 M60,10 L105,45" stroke="#4b5563" strokeWidth="2" strokeDasharray="3 2" />
                                                <text x="60" y="34" fill="#9ca3af" fontSize="8" textAnchor="middle" fontWeight="bold">City Center</text>
                                            </svg>
                                        </div>
                                        <span className="text-xs font-bold text-zinc-200">Default</span>
                                    </button>

                                    {/* Satellite Basemap */}
                                    <button
                                        onClick={() => updateField('basemap', 'satellite')}
                                        className={`p-2.5 rounded-2xl border transition-all text-center flex flex-col items-center gap-2 cursor-pointer ${
                                            settings.basemap === 'satellite'
                                                ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                        }`}
                                    >
                                        <div className="w-full h-16 rounded-xl bg-[#0f2316] border border-white/5 flex items-center justify-center overflow-hidden relative">
                                            {/* Satellite Texture Vector */}
                                            <svg className="w-full h-full" viewBox="0 0 120 60">
                                                <rect width="120" height="60" fill="#1b3022" />
                                                <circle cx="90" cy="15" r="30" fill="#2d4a36" />
                                                <path d="M-10,35 Q40,20 80,45 T130,30" fill="#403c2a" opacity="0.8" />
                                                <path d="M20,60 L70,0 L85,0 L35,60 Z" fill="#4a5568" />
                                                <line x1="27" y1="60" x2="77" y2="0" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 3" />
                                            </svg>
                                        </div>
                                        <span className="text-xs font-bold text-zinc-200">Satellite</span>
                                    </button>
                                </div>
                            </div>

                            {/* AIRPORT DETAIL */}
                            <div>
                                <h3 className="text-[11px] font-bold text-zinc-400 tracking-wider uppercase mb-3">
                                    Airport Detail
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {/* Standard Detail */}
                                    <button
                                        onClick={() => updateField('airportDetail', 'standard')}
                                        className={`p-2.5 rounded-2xl border transition-all text-center flex flex-col items-center gap-2 cursor-pointer ${
                                            settings.airportDetail === 'standard'
                                                ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                        }`}
                                    >
                                        <div className="w-full h-16 rounded-xl bg-zinc-950 border border-white/5 flex items-center justify-center overflow-hidden relative">
                                            <svg className="w-full h-full" viewBox="0 0 120 60">
                                                {/* Simple Runway Line */}
                                                <path d="M40,55 L80,5" stroke="#334155" strokeWidth="16" strokeLinecap="round" />
                                                <path d="M40,55 L80,5" stroke="#f8fafc" strokeWidth="2" strokeDasharray="6 4" />
                                            </svg>
                                        </div>
                                        <span className="text-xs font-bold text-zinc-200">Standard</span>
                                    </button>

                                    {/* Detailed Detail */}
                                    <button
                                        onClick={() => updateField('airportDetail', 'detailed')}
                                        className={`p-2.5 rounded-2xl border transition-all text-center flex flex-col items-center gap-2 cursor-pointer ${
                                            settings.airportDetail === 'detailed'
                                                ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                        }`}
                                    >
                                        <div className="w-full h-16 rounded-xl bg-zinc-950 border border-white/5 flex items-center justify-center overflow-hidden relative">
                                            <svg className="w-full h-full" viewBox="0 0 120 60">
                                                {/* Runway Strip */}
                                                <path d="M35,58 L85,2" stroke="#1e293b" strokeWidth="22" />
                                                {/* Yellow Taxiway Line */}
                                                <path d="M55,60 L98,25 L108,12" fill="none" stroke="#eab308" strokeWidth="2" />
                                                {/* Dashed Centerline */}
                                                <path d="M35,58 L85,2" stroke="#f8fafc" strokeWidth="2" strokeDasharray="5 3" />
                                                {/* Piano Keys Threshold Markings */}
                                                <line x1="68" y1="20" x2="80" y2="10" stroke="#f8fafc" strokeWidth="2.5" strokeDasharray="2 1.5" />
                                            </svg>
                                        </div>
                                        <span className="text-xs font-bold text-zinc-200">Detailed</span>
                                    </button>
                                </div>
                            </div>

                            {/* PROJECTION */}
                            <div>
                                <h3 className="text-[11px] font-bold text-zinc-400 tracking-wider uppercase mb-3">
                                    Projection
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {/* Flat Map */}
                                    <button
                                        onClick={() => updateField('projection', 'flat')}
                                        className={`p-2.5 rounded-2xl border transition-all text-center flex flex-col items-center gap-2 cursor-pointer ${
                                            settings.projection === 'flat'
                                                ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                        }`}
                                    >
                                        <div className="w-full h-16 rounded-xl bg-zinc-950 border border-white/5 flex items-center justify-center overflow-hidden relative">
                                            <svg className="w-full h-full" viewBox="0 0 120 60">
                                                {/* Grid */}
                                                <line x1="20" y1="20" x2="100" y2="20" stroke="#334155" strokeWidth="1" />
                                                <line x1="20" y1="40" x2="100" y2="40" stroke="#334155" strokeWidth="1" />
                                                <line x1="40" y1="10" x2="40" y2="50" stroke="#334155" strokeWidth="1" />
                                                <line x1="60" y1="10" x2="60" y2="50" stroke="#334155" strokeWidth="1" />
                                                <line x1="80" y1="10" x2="80" y2="50" stroke="#334155" strokeWidth="1" />
                                                {/* Arc */}
                                                <path d="M25,45 Q60,10 95,45" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
                                            </svg>
                                        </div>
                                        <span className="text-xs font-bold text-zinc-200">Flat</span>
                                    </button>

                                    {/* Globe */}
                                    <button
                                        onClick={() => updateField('projection', 'globe')}
                                        className={`p-2.5 rounded-2xl border transition-all text-center flex flex-col items-center gap-2 cursor-pointer ${
                                            settings.projection === 'globe'
                                                ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                        }`}
                                    >
                                        <div className="w-full h-16 rounded-xl bg-zinc-950 border border-white/5 flex items-center justify-center overflow-hidden relative">
                                            <svg className="w-full h-full" viewBox="0 0 120 60">
                                                {/* Circle Globe */}
                                                <circle cx="60" cy="30" r="24" fill="none" stroke="#334155" strokeWidth="1.5" />
                                                <ellipse cx="60" cy="30" rx="12" ry="24" fill="none" stroke="#334155" strokeWidth="1" />
                                                <line x1="36" y1="30" x2="84" y2="30" stroke="#334155" strokeWidth="1" />
                                                {/* Orbital Arc */}
                                                <path d="M42,34 Q60,14 78,34" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
                                            </svg>
                                        </div>
                                        <span className="text-xs font-bold text-zinc-200">Globe</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: FLIGHTS */}
                    {activeTab === 'flights' && (
                        <div className="space-y-6">
                            {/* AIRPORTS SECTION */}
                            <div className="space-y-4">
                                <h3 className="text-[11px] font-bold text-zinc-400 tracking-wider uppercase">
                                    Airports
                                </h3>

                                {/* Size Selection */}
                                <div>
                                    <span className="text-xs text-zinc-300 font-semibold mb-2 block">Size</span>
                                    <div className="grid grid-cols-4 gap-2">
                                        {[
                                            { id: 'off', label: 'Off', icon: (
                                                <svg className="w-6 h-6 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <line x1="4" y1="20" x2="20" y2="4" strokeLinecap="round" />
                                                </svg>
                                            )},
                                            { id: 'small', label: 'Small', icon: (
                                                <div className="w-1.5 h-1.5 rounded-full border-2 border-blue-400" />
                                            )},
                                            { id: 'medium', label: 'Medium', icon: (
                                                <div className="w-3 h-3 rounded-full border-2 border-blue-400" />
                                            )},
                                            { id: 'large', label: 'Large', icon: (
                                                <div className="w-4.5 h-4.5 rounded-full border-2 border-blue-400" />
                                            )},
                                        ].map((size) => (
                                            <button
                                                key={size.id}
                                                onClick={() => updateField('airportSize', size.id as any)}
                                                className={`py-3 px-1 rounded-xl border transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                                                    settings.airportSize === size.id
                                                        ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                        : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                                }`}
                                            >
                                                <div className="h-6 flex items-center justify-center">
                                                    {size.icon}
                                                </div>
                                                <span className="text-[11px] font-bold text-zinc-200">{size.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Mode Selection */}
                                <div>
                                    <span className="text-xs text-zinc-300 font-semibold mb-2 block">Mode</span>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => updateField('airportMode', 'frequency')}
                                            className={`p-2.5 rounded-2xl border transition-all text-center flex flex-col items-center gap-2 cursor-pointer ${
                                                settings.airportMode === 'frequency'
                                                    ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                    : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                            }`}
                                        >
                                            <div className="w-full h-12 rounded-xl bg-zinc-950 border border-white/5 flex items-center justify-center gap-3">
                                                <div className="w-1.5 h-1.5 rounded-full border border-blue-400" />
                                                <div className="w-4 h-4 rounded-full border-2 border-blue-400" />
                                                <div className="w-2.5 h-2.5 rounded-full border border-blue-400" />
                                            </div>
                                            <span className="text-xs font-bold text-zinc-200">By frequency</span>
                                        </button>

                                        <button
                                            onClick={() => updateField('airportMode', 'uniform')}
                                            className={`p-2.5 rounded-2xl border transition-all text-center flex flex-col items-center gap-2 cursor-pointer ${
                                                settings.airportMode === 'uniform'
                                                    ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                    : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                            }`}
                                        >
                                            <div className="w-full h-12 rounded-xl bg-zinc-950 border border-white/5 flex items-center justify-center gap-3">
                                                <div className="w-3 h-3 rounded-full border-2 border-blue-400" />
                                                <div className="w-3 h-3 rounded-full border-2 border-blue-400" />
                                                <div className="w-3 h-3 rounded-full border-2 border-blue-400" />
                                            </div>
                                            <span className="text-xs font-bold text-zinc-200">Uniform</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* ROUTES SECTION */}
                            <div className="space-y-4 pt-2 border-t border-white/5">
                                <h3 className="text-[11px] font-bold text-zinc-400 tracking-wider uppercase">
                                    Routes
                                </h3>

                                {/* Width */}
                                <div>
                                    <span className="text-xs text-zinc-300 font-semibold mb-2 block">Width</span>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => updateField('routeWidthMode', 'uniform')}
                                            className={`p-2.5 rounded-2xl border transition-all text-center flex flex-col items-center gap-2 cursor-pointer ${
                                                settings.routeWidthMode === 'uniform'
                                                    ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                    : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                            }`}
                                        >
                                            <div className="w-full h-12 rounded-xl bg-zinc-950 border border-white/5 flex items-center justify-center">
                                                <svg className="w-24 h-10" viewBox="0 0 100 40">
                                                    <path d="M10,32 Q50,8 90,32" fill="none" stroke="#38bdf8" strokeWidth="2" />
                                                    <path d="M10,26 Q50,2 90,26" fill="none" stroke="#38bdf8" strokeWidth="2" />
                                                    <path d="M10,38 Q50,14 90,38" fill="none" stroke="#38bdf8" strokeWidth="2" />
                                                </svg>
                                            </div>
                                            <span className="text-xs font-bold text-zinc-200">Uniform</span>
                                        </button>

                                        <button
                                            onClick={() => updateField('routeWidthMode', 'frequency')}
                                            className={`p-2.5 rounded-2xl border transition-all text-center flex flex-col items-center gap-2 cursor-pointer ${
                                                settings.routeWidthMode === 'frequency'
                                                    ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                    : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                            }`}
                                        >
                                            <div className="w-full h-12 rounded-xl bg-zinc-950 border border-white/5 flex items-center justify-center">
                                                <svg className="w-24 h-10" viewBox="0 0 100 40">
                                                    <path d="M10,32 Q50,8 90,32" fill="none" stroke="#38bdf8" strokeWidth="4.5" strokeLinecap="round" />
                                                    <path d="M10,24 Q50,0 90,24" fill="none" stroke="#38bdf8" strokeWidth="2" />
                                                    <path d="M10,38 Q50,14 90,38" fill="none" stroke="#38bdf8" strokeWidth="1.2" />
                                                </svg>
                                            </div>
                                            <span className="text-xs font-bold text-zinc-200">By frequency</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Scale */}
                                <div>
                                    <span className="text-xs text-zinc-300 font-semibold mb-2 block">Scale</span>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { id: 'thin', label: 'Thin', strokeWidth: 1.2 },
                                            { id: 'normal', label: 'Normal', strokeWidth: 2.5 },
                                            { id: 'thick', label: 'Thick', strokeWidth: 4.5 },
                                        ].map((scale) => (
                                            <button
                                                key={scale.id}
                                                onClick={() => updateField('routeScale', scale.id as any)}
                                                className={`p-2.5 rounded-2xl border transition-all text-center flex flex-col items-center gap-2 cursor-pointer ${
                                                    settings.routeScale === scale.id
                                                        ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                        : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                                }`}
                                            >
                                                <div className="w-full h-10 rounded-xl bg-zinc-950 border border-white/5 flex items-center justify-center">
                                                    <svg className="w-20 h-8" viewBox="0 0 80 30">
                                                        <path d="M10,24 Q40,6 70,24" fill="none" stroke="#38bdf8" strokeWidth={scale.strokeWidth} strokeLinecap="round" />
                                                    </svg>
                                                </div>
                                                <span className="text-xs font-bold text-zinc-200">{scale.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Color */}
                                <div>
                                    <span className="text-xs text-zinc-300 font-semibold mb-2 block">Color</span>
                                    <div className="grid grid-cols-3 gap-2">
                                        {/* Default Color */}
                                        <button
                                            onClick={() => updateField('routeColorMode', 'default')}
                                            className={`p-2 rounded-2xl border transition-all text-center flex flex-col items-center gap-1.5 cursor-pointer ${
                                                settings.routeColorMode === 'default'
                                                    ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                    : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                            }`}
                                        >
                                            <div className="w-full h-10 rounded-xl bg-zinc-950 border border-white/5 flex items-center justify-center">
                                                <svg className="w-20 h-8" viewBox="0 0 80 30">
                                                    <path d="M10,24 Q40,8 70,24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
                                                    <path d="M10,18 Q40,2 70,18" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
                                                </svg>
                                            </div>
                                            <span className="text-[11px] font-bold text-zinc-200">Default</span>
                                        </button>

                                        {/* By frequency Color */}
                                        <button
                                            onClick={() => updateField('routeColorMode', 'frequency')}
                                            className={`p-2 rounded-2xl border transition-all text-center flex flex-col items-center gap-1.5 cursor-pointer ${
                                                settings.routeColorMode === 'frequency'
                                                    ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                    : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                            }`}
                                        >
                                            <div className="w-full h-10 rounded-xl bg-zinc-950 border border-white/5 flex items-center justify-center">
                                                <svg className="w-20 h-8" viewBox="0 0 80 30">
                                                    <path d="M10,26 Q40,12 70,26" fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" />
                                                    <path d="M10,20 Q40,6 70,20" fill="none" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" />
                                                    <path d="M10,14 Q40,0 70,14" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
                                                </svg>
                                            </div>
                                            <span className="text-[11px] font-bold text-zinc-200">By frequency</span>
                                        </button>

                                        {/* Continental Gradient Color */}
                                        <button
                                            onClick={() => updateField('routeColorMode', 'gradient')}
                                            className={`p-2 rounded-2xl border transition-all text-center flex flex-col items-center gap-1.5 cursor-pointer ${
                                                settings.routeColorMode === 'gradient'
                                                    ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                                                    : 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                                            }`}
                                        >
                                            <div className="w-full h-10 rounded-xl bg-zinc-950 border border-white/5 flex items-center justify-center">
                                                <svg className="w-20 h-8" viewBox="0 0 80 30">
                                                    <defs>
                                                        <linearGradient id="contGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                                            <stop offset="0%" stopColor="#3b82f6" />
                                                            <stop offset="50%" stopColor="#10b981" />
                                                            <stop offset="100%" stopColor="#f59e0b" />
                                                        </linearGradient>
                                                    </defs>
                                                    <path d="M10,22 Q40,6 70,22" fill="none" stroke="url(#contGrad)" strokeWidth="3" strokeLinecap="round" />
                                                </svg>
                                            </div>
                                            <span className="text-[11px] font-bold text-zinc-200">Gradient</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: LAYERS */}
                    {activeTab === 'layers' && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-[11px] font-bold text-zinc-400 tracking-wider uppercase mb-4">
                                    Environment
                                </h3>

                                <div className="space-y-4">
                                    {/* Time of Day */}
                                    <div className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-900/60 border border-white/5 hover:border-white/10 transition-colors">
                                        <div>
                                            <h4 className="text-sm font-bold text-white">Time of day</h4>
                                            <p className="text-xs text-zinc-400 mt-0.5">Live day/night shading</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => updateField('timeOfDay', !settings.timeOfDay)}
                                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
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

                                    {/* Rain Radar */}
                                    <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-white/5 hover:border-white/10 transition-colors space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                                                    <span>Rain radar</span>
                                                    {settings.rainRadar && (
                                                        <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-black rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                            Live
                                                        </span>
                                                    )}
                                                </h4>
                                                <p className="text-xs text-zinc-400 mt-0.5">Latest RainViewer precipitation</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => updateField('rainRadar', !settings.rainRadar)}
                                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
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
                                            <div className="pt-2.5 border-t border-white/5 space-y-3">
                                                <div>
                                                    <div className="flex items-center justify-between text-[10px] font-bold text-zinc-300 mb-1">
                                                        <span>Radar Intensity / Opacity</span>
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

                                                <div>
                                                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">Color Palette</span>
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
                                                                        ? 'bg-blue-600 text-white border-blue-400/40 shadow-sm'
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
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
