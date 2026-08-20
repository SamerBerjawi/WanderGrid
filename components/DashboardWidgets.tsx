import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { TooltipContent } from '@/components/charts/tooltip';

export interface ExtremeFlight {
    distance: number;
    origin: string;
    destination: string;
    carrier: string;
    date: string;
}

export interface FlightTrendPoint {
    date: string;
    distance: number;
    cumulative: number;
}

// Crystal Glassmorphism 2.0 Styled Stat Card
export const StatCard: React.FC<{ 
  title: string; 
  value: string | number; 
  subtitle?: string; 
  icon: string; 
  color?: string 
}> = ({ title, value, subtitle, icon, color = 'blue' }) => {
    // Dynamic glows
    const shadowMap: { [key: string]: string } = {
        blue: 'shadow-[0_8px_32px_0_rgba(59,130,246,0.12)] border-t-blue-400/20 border-l-blue-400/20',
        emerald: 'shadow-[0_8px_32px_0_rgba(16,185,129,0.12)] border-t-emerald-400/20 border-l-emerald-400/20',
        purple: 'shadow-[0_8px_32px_0_rgba(139,92,246,0.12)] border-t-purple-400/20 border-l-purple-400/20',
        amber: 'shadow-[0_8px_32px_0_rgba(245,158,11,0.12)] border-t-amber-400/20 border-l-amber-400/20',
        indigo: 'shadow-[0_8px_32px_0_rgba(99,102,241,0.12)] border-t-indigo-400/20 border-l-indigo-400/20',
        rose: 'shadow-[0_8px_32px_0_rgba(244,63,94,0.12)] border-t-rose-400/20 border-l-rose-400/20',
    };

    const gradientClass = shadowMap[color] || 'shadow-[0_8px_32px_0_rgba(0,0,0,0.1)]';

    return (
        <div className={`p-6 rounded-[2rem] bg-white/[0.04] dark:bg-slate-900/40 backdrop-blur-2xl border border-white/20 dark:border-white/5 ${gradientClass} flex items-center gap-5 relative overflow-hidden group hover:border-white/35 dark:hover:border-white/10 transition-all duration-300 hover:-translate-y-0.5`}>
            {/* Ambient Back Blur Spot */}
            <div className={`absolute -right-12 -top-12 w-32 h-32 bg-${color}-500/10 dark:bg-${color}-500/15 rounded-full blur-[40px] transition-all duration-500 group-hover:scale-125`} />
            
            {/* Crystal Edge Catch Icon Wrapper */}
            <div className={`w-14 h-14 rounded-2xl bg-${color}-500/10 border border-${color}-500/20 dark:border-${color}-400/20 text-${color}-600 dark:text-${color}-400 flex items-center justify-center text-3xl shadow-inner relative overflow-hidden`}>
                <span className="material-icons-outlined select-none">{icon}</span>
                {/* Micro reflection shimmer */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out" />
            </div>
            
            <div className="relative z-10">
                <div className="text-[9px] font-black text-gray-400 dark:text-gray-450 uppercase tracking-widest mb-1">{title}</div>
                <div className="text-3xl font-black text-gray-900 dark:text-white leading-none tracking-tight">{value}</div>
                {subtitle && <div className="text-xs font-bold text-gray-500 dark:text-gray-400 mt-1.5">{subtitle}</div>}
            </div>
        </div>
    );
};

// Refactored ExtremeFlightCard with directional Crystal Borders
export const ExtremeFlightCard: React.FC<{ 
  type: 'Longest' | 'Shortest'; 
  flight: ExtremeFlight | null; 
  color: string 
}> = ({ type, flight, color }) => {
    if (!flight) return null;

    const highlightColors: { [key: string]: string } = {
        indigo: 'border-t-indigo-400/20 border-l-indigo-400/20 shadow-[0_8px_32px_0_rgba(99,102,241,0.08)]',
        rose: 'border-t-rose-400/20 border-l-rose-400/20 shadow-[0_8px_32px_0_rgba(244,63,94,0.08)]',
    };

    const gradientClass = highlightColors[color] || 'border-t-white/20 border-l-white/20';

    return (
        <div className={`p-6 rounded-[2rem] bg-white/[0.04] dark:bg-slate-900/40 backdrop-blur-2xl border border-white/25 dark:border-white/5 ${gradientClass} transition-all duration-300 hover:border-white/35 dark:hover:border-white/10 relative overflow-hidden group`}>
            <div className={`absolute top-0 right-0 w-44 h-44 bg-${color}-500/5 rounded-full blur-[60px] -translate-y-1/2 translate-x-1/3 transition-all duration-500 group-hover:scale-125`} />
            
            <div className="flex justify-between items-start relative z-10">
                <div className={`p-3 rounded-2xl bg-${color}-500/10 border border-${color}-500/25 text-${color}-600 dark:text-${color}-400`}>
                    <span className="material-icons-outlined text-xl">{type === 'Longest' ? 'public' : 'short_text'}</span>
                </div>
                <div className="text-right">
                    <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{type} Flight</div>
                    <div className={`text-2xl font-black text-${color}-600 dark:text-${color}-400 tracking-tight mt-0.5`}>{flight.distance.toLocaleString()} km</div>
                </div>
            </div>

            <div className="mt-6 relative z-10">
                <div className="flex justify-between items-center mb-3">
                    <span className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter">{flight.origin}</span>
                    <div className="flex-1 mx-4 relative h-0.5 bg-gray-200/40 dark:bg-white/10">
                        {/* Glowing dynamic map pin connector */}
                        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white dark:bg-slate-900 border border-${color}-500/30 shadow-[0_0_12px_rgba(59,130,246,0.3)]`}>
                            <span className={`material-icons-outlined text-${color}-500 text-xs transform rotate-90 leading-none flex items-center justify-center`}>flight</span>
                        </div>
                    </div>
                    <span className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter">{flight.destination}</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-gray-400 dark:text-gray-450">
                    <span className="font-extrabold">{flight.carrier}</span>
                    <span className="font-mono">{new Date(flight.date).getFullYear()}</span>
                </div>
            </div>
        </div>
    );
};

// Beautiful Glassmorphic Recharts DonutChart
export const DonutChart: React.FC<{ 
  data: { label: string; value: number; color: string }[]; 
  title: string 
}> = ({ data, title }) => {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) return null;

    const chartData = data.map(item => ({
        name: item.label,
        value: item.value,
        color: item.color
    }));

    return (
        <div className="p-6 rounded-[2rem] bg-white/[0.04] dark:bg-slate-900/40 backdrop-blur-2xl border border-white/20 dark:border-white/5 shadow-[0_8px_32px_0_rgba(0,0,0,0.15)] flex flex-col h-[22rem] w-full transition-all hover:border-white/30 dark:hover:border-white/10">
            <h4 className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-4 w-full text-left">{title}</h4>
            <div className="relative flex-1 min-h-0 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={75}
                            paddingAngle={4}
                            dataKey="value"
                        >
                            {chartData.map((entry, index) => (
                                <Cell 
                                    key={`cell-${index}`} 
                                    fill={entry.color} 
                                    fillOpacity={0.45} 
                                    stroke={entry.color} 
                                    strokeWidth={1.5}
                                    style={{ filter: `drop-shadow(0 0 6px ${entry.color}85)` }}
                                />
                            ))}
                        </Pie>
                        <Tooltip
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const curr = payload[0].payload;
                                    const pct = Math.round((curr.value / total) * 100);
                                    return (
                                        <div className="rounded-2xl border border-black/10 dark:border-white/15 bg-white/90 dark:bg-dark-card/90 backdrop-blur-2xl shadow-glass-modal overflow-hidden">
                                            <TooltipContent
                                                title={curr.name}
                                                rows={[
                                                    { color: curr.color, label: 'Flights', value: `${curr.value} (${pct}%)` }
                                                ]}
                                            />
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-black text-gray-900 dark:text-white leading-none">{total}</span>
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-1">Flights</span>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4">
                {chartData.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2 truncate">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color, boxShadow: `0 0 6px ${item.color}` }} />
                            <span className="font-extrabold text-gray-650 dark:text-gray-300 truncate max-w-[100px]">{item.name}</span>
                        </div>
                        <span className="font-bold text-gray-900 dark:text-white shrink-0 ml-1">{Math.round((item.value / total) * 100)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// Premium FlightTrendChart using Recharts dynamic curves and translucent fills
export const FlightTrendChart: React.FC<{ data: FlightTrendPoint[] }> = ({ data }) => {
    if (!data || data.length === 0) return null;

    return (
        <div className="p-6 rounded-[2rem] bg-white/[0.04] dark:bg-slate-900/40 backdrop-blur-2xl border border-white/20 dark:border-white/5 shadow-[0_8px_32px_0_rgba(0,0,0,0.15)] flex flex-col h-[22rem] w-full transition-all hover:border-white/30 dark:hover:border-white/10">
            <div className="flex justify-between items-start mb-6 w-full">
                <div>
                    <h4 className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest leading-none">Global Coverage Trend</h4>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1.5">Cumulative Distance (KM)</p>
                </div>
                <div className="text-right">
                    <span className="text-[9px] font-mono font-black bg-blue-500/10 dark:bg-white/10 border border-blue-500/20 px-2 py-1 rounded-lg text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                        Analytics
                    </span>
                </div>
            </div>
            <div className="flex-1 min-h-0 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: -22, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0}/>
                            </linearGradient>
                        </defs>
                        <XAxis 
                            dataKey="date" 
                            stroke="#94a3b8" 
                            fontSize={9} 
                            tickLine={false} 
                            axisLine={false} 
                            dy={8}
                        />
                        <YAxis 
                            stroke="#94a3b8" 
                            fontSize={9} 
                            tickLine={false} 
                            axisLine={false} 
                            dx={-8}
                            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                        />
                        <CartesianGrid stroke="#cbd5e115" strokeDasharray="3 3" vertical={false} />
                        <Tooltip
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const curr = payload[0].payload;
                                    return (
                                        <div className="rounded-2xl border border-black/10 dark:border-white/15 bg-white/90 dark:bg-dark-card/90 backdrop-blur-2xl shadow-glass-modal overflow-hidden">
                                            <TooltipContent
                                                title={curr.date}
                                                rows={[
                                                    { color: '#3b82f6', label: 'Total Distance', value: `${curr.cumulative.toLocaleString()} km` },
                                                    { color: '#06b6d4', label: 'Increment', value: `+${curr.distance.toLocaleString()} km` }
                                                ]}
                                            />
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="cumulative" 
                            stroke="#3b82f6" 
                            strokeWidth={3}
                            fillOpacity={1} 
                            fill="url(#colorCumulative)" 
                            style={{ filter: 'drop-shadow(0 4px 8px rgba(59, 130, 246, 0.35))' }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

// Refactored TopList using Glassmorphic layout
export const TopList: React.FC<{ 
  title: string; 
  items: { label: string; sub?: string; count: number; code?: string }[]; 
  icon: string; 
  color: string 
}> = ({ title, items, icon, color }) => {
    if (items.length === 0) return null;
    const max = items[0].count;

    return (
        <div className="p-6 rounded-[2rem] bg-white/[0.04] dark:bg-slate-900/40 backdrop-blur-2xl border border-white/20 dark:border-white/5 shadow-[0_8px_32px_0_rgba(0,0,0,0.15)] flex flex-col h-full transition-all hover:border-white/30 dark:hover:border-white/10">
            <div className="flex items-center gap-3 mb-6">
                <div className={`w-10 h-10 rounded-xl bg-${color}-500/15 border border-${color}-500/20 text-${color}-600 dark:text-${color}-400 flex items-center justify-center`}>
                    <span className="material-icons-outlined text-lg">{icon}</span>
                </div>
                <h3 className="font-black text-lg text-gray-900 dark:text-white uppercase tracking-tight">{title}</h3>
            </div>
            <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-2">
                {items.slice(0, 8).map((item, idx) => (
                    <div key={idx} className="relative group">
                        <div className="flex justify-between items-center mb-2 relative z-10">
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 w-4">{idx + 1}</span>
                                <div>
                                    <div className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                        {item.code && <span className="font-mono text-[9px] bg-gray-150 dark:bg-white/10 px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-400 border border-gray-200/20">{item.code}</span>}
                                        <span className="truncate max-w-[140px]" title={item.label}>{item.label}</span>
                                    </div>
                                    {item.sub && <div className="text-[10px] text-gray-400 dark:text-gray-500 font-bold truncate max-w-[140px] mt-0.5">{item.sub}</div>}
                                </div>
                            </div>
                            <span className="text-xs font-black text-gray-900 dark:text-white">{item.count}</span>
                        </div>
                        <div className="h-1.5 w-full bg-gray-100/30 dark:bg-white/5 rounded-full overflow-hidden">
                            <div className={`h-full bg-${color}-500 rounded-full transition-all duration-500 opacity-50 group-hover:opacity-100`} style={{ width: `${(item.count / max) * 100}%` }} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
