import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { TooltipContent } from './TooltipContent';
import { GlassPanel } from './glass/GlassPanel';
import { 
    AirplaneTakeoff, 
    Globe, 
    Clock, 
    MapPin, 
    Airplane, 
    AirplaneTilt, 
    Buildings 
} from '@phosphor-icons/react';

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

const renderStatIcon = (icon: string) => {
    switch (icon) {
        case 'flight_takeoff':
            return <AirplaneTakeoff weight="duotone" className="w-7 h-7" />;
        case 'public':
            return <Globe weight="duotone" className="w-7 h-7" />;
        case 'schedule':
            return <Clock weight="duotone" className="w-7 h-7" />;
        case 'place':
            return <MapPin weight="duotone" className="w-7 h-7" />;
        default:
            return <Airplane weight="duotone" className="w-7 h-7" />;
    }
};

// Liquid Glass Styled Stat Card (Memoized)
export const StatCard: React.FC<{ 
  title: string; 
  value: string | number; 
  subtitle?: string; 
  icon: string; 
  color?: string 
}> = React.memo(({ title, value, subtitle, icon, color = 'blue' }) => {
    return (
        <GlassPanel className="wg-glass-card rounded-[28px] overflow-hidden p-6 flex items-center gap-5 relative group transition-all duration-300 hover:-translate-y-0.5">
            {/* Ambient Accent Spot */}
            <div className={`absolute -right-12 -top-12 w-32 h-32 bg-${color}-500/10 dark:bg-${color}-500/15 rounded-full blur-[40px] pointer-events-none transition-all duration-500 group-hover:scale-125`} />
            
            {/* Edge Catch Icon Wrapper */}
            <div className={`w-14 h-14 rounded-2xl bg-${color}-500/10 border border-${color}-500/20 dark:border-${color}-400/20 text-${color}-600 dark:text-${color}-400 flex items-center justify-center shadow-inner relative shrink-0`}>
                {renderStatIcon(icon)}
            </div>
            
            <div className="relative z-10 min-w-0">
                <div className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest mb-1 truncate">{title}</div>
                <div className="text-3xl font-black text-light-text dark:text-dark-text leading-none tracking-tight truncate">{value}</div>
                {subtitle && <div className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary mt-1.5 truncate">{subtitle}</div>}
            </div>
        </GlassPanel>
    );
});

StatCard.displayName = 'StatCard';

// ExtremeFlightCard (Memoized)
export const ExtremeFlightCard: React.FC<{ 
  type: 'Longest' | 'Shortest'; 
  flight: ExtremeFlight | null; 
  color: string 
}> = React.memo(({ type, flight, color }) => {
    if (!flight) return null;

    return (
        <GlassPanel className="wg-glass-card rounded-[28px] overflow-hidden p-6 relative group transition-all duration-300 flex flex-col justify-between h-full">
            <div className={`absolute top-0 right-0 w-44 h-44 bg-${color}-500/5 rounded-full blur-[60px] -translate-y-1/2 translate-x-1/3 pointer-events-none transition-all duration-500 group-hover:scale-125`} />
            
            <div className="flex justify-between items-start relative z-10">
                <div className={`p-3 rounded-2xl bg-${color}-500/10 border border-${color}-500/25 text-${color}-600 dark:text-${color}-400`}>
                    {type === 'Longest' ? (
                        <Globe weight="duotone" className="w-5 h-5" />
                    ) : (
                        <Clock weight="duotone" className="w-5 h-5" />
                    )}
                </div>
                <div className="text-right">
                    <div className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest">{type} Flight</div>
                    <div className={`text-2xl font-black text-${color}-600 dark:text-${color}-400 tracking-tight mt-0.5`}>{flight.distance.toLocaleString()} km</div>
                </div>
            </div>

            <div className="mt-6 relative z-10">
                <div className="flex justify-between items-center mb-3">
                    <span className="text-3xl font-black text-light-text dark:text-dark-text tracking-tighter">{flight.origin}</span>
                    <div className="flex-1 mx-4 relative h-0.5 bg-black/10 dark:bg-white/10">
                        {/* Dynamic map pin connector */}
                        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-1.5 rounded-full bg-light-card dark:bg-dark-card border border-${color}-500/30 shadow-[0_0_12px_rgba(59,130,246,0.3)]`}>
                            <AirplaneTilt weight="duotone" className={`w-3.5 h-3.5 text-${color}-500 rotate-90 leading-none`} />
                        </div>
                    </div>
                    <span className="text-3xl font-black text-light-text dark:text-dark-text tracking-tighter">{flight.destination}</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary">
                    <span className="font-extrabold">{flight.carrier}</span>
                    <span className="font-mono">{new Date(flight.date).getFullYear()}</span>
                </div>
            </div>
        </GlassPanel>
    );
});

ExtremeFlightCard.displayName = 'ExtremeFlightCard';

// Liquid Glass Recharts DonutChart (Memoized)
export const DonutChart: React.FC<{ 
  data: { label: string; value: number; color: string }[]; 
  title: string 
}> = React.memo(({ data, title }) => {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) return null;

    const chartData = data.map(item => ({
        name: item.label,
        value: item.value,
        color: item.color
    }));

    return (
        <GlassPanel className="wg-glass-card rounded-[28px] overflow-hidden p-6 flex flex-col h-[22rem] w-full transition-all">
            <h4 className="text-xs font-black text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest mb-4 w-full text-left">{title}</h4>
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
                                    fillOpacity={0.55} 
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
                                        <TooltipContent
                                            title={curr.name}
                                            rows={[
                                                { color: curr.color, label: 'Flights', value: `${curr.value} (${pct}%)` }
                                            ]}
                                        />
                                    );
                                }
                                return null;
                            }}
                        />
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-black text-light-text dark:text-dark-text leading-none">{total}</span>
                    <span className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider mt-1">Flights</span>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4">
                {chartData.map((item) => (
                    <div key={item.name} className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2 truncate">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color, boxShadow: `0 0 6px ${item.color}` }} />
                            <span className="font-extrabold text-light-text dark:text-dark-text truncate max-w-[100px]">{item.name}</span>
                        </div>
                        <span className="font-bold text-light-text dark:text-dark-text shrink-0 ml-1">{Math.round((item.value / total) * 100)}%</span>
                    </div>
                ))}
            </div>
        </GlassPanel>
    );
});

DonutChart.displayName = 'DonutChart';

// Liquid Glass FlightTrendChart (Memoized)
export const FlightTrendChart: React.FC<{ data: FlightTrendPoint[] }> = React.memo(({ data }) => {
    if (!data || data.length === 0) return null;

    return (
        <GlassPanel className="wg-glass-card rounded-[28px] overflow-hidden p-6 flex flex-col h-[22rem] w-full transition-all">
            <div className="flex justify-between items-start mb-6 w-full">
                <div>
                    <h4 className="text-xs font-black text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest leading-none">Global Coverage Trend</h4>
                    <p className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest mt-1.5">Cumulative Distance (KM)</p>
                </div>
                <div className="text-right">
                    <span className="text-2xs font-mono font-bold bg-primary-500/10 border border-primary-500/20 px-2 py-1 rounded-lg text-primary-600 dark:text-primary-400 uppercase tracking-widest">
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
                                        <TooltipContent
                                            title={curr.date}
                                            rows={[
                                                { color: '#3b82f6', label: 'Total Distance', value: `${curr.cumulative.toLocaleString()} km` },
                                                { color: '#06b6d4', label: 'Increment', value: `+${curr.distance.toLocaleString()} km` }
                                            ]}
                                        />
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
        </GlassPanel>
    );
});

FlightTrendChart.displayName = 'FlightTrendChart';

// Liquid Glass TopList (Memoized)
export const TopList: React.FC<{ 
  title: string; 
  items: { label: string; sub?: string; count: number; code?: string }[]; 
  icon: string; 
  color: string 
}> = React.memo(({ title, items, icon, color }) => {
    if (items.length === 0) return null;
    const max = items[0].count;

    return (
        <GlassPanel className="wg-glass-card rounded-[28px] overflow-hidden p-6 flex flex-col h-full transition-all">
            <div className="flex items-center gap-3 mb-6">
                <div className={`w-10 h-10 rounded-xl bg-${color}-500/15 border border-${color}-500/20 text-${color}-600 dark:text-${color}-400 flex items-center justify-center`}>
                    {icon === 'apartment' ? (
                        <Buildings weight="duotone" className="w-5 h-5" />
                    ) : (
                        <Airplane weight="duotone" className="w-5 h-5" />
                    )}
                </div>
                <h3 className="font-black text-lg text-light-text dark:text-dark-text uppercase tracking-tight">{title}</h3>
            </div>
            <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-2">
                {items.slice(0, 8).map((item, idx) => (
                    <div key={`${item.code || item.label}-${item.sub || idx}`} className="relative group">
                        <div className="flex justify-between items-center mb-2 relative z-10">
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary w-4">{idx + 1}</span>
                                <div>
                                    <div className="text-sm font-bold text-light-text dark:text-dark-text flex items-center gap-2">
                                        {item.code && <span className="font-mono text-2xs bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded text-light-text-secondary dark:text-dark-text-secondary border border-black/5 dark:border-white/10">{item.code}</span>}
                                        <span className="truncate max-w-[140px]" title={item.label}>{item.label}</span>
                                    </div>
                                    {item.sub && <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-bold truncate max-w-[140px] mt-0.5">{item.sub}</div>}
                                </div>
                            </div>
                            <span className="text-xs font-black text-light-text dark:text-dark-text">{item.count}</span>
                        </div>
                        <div className="h-1.5 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                            <div className={`h-full bg-${color}-500 rounded-full transition-all duration-500 opacity-60 group-hover:opacity-100`} style={{ width: `${(item.count / max) * 100}%` }} />
                        </div>
                    </div>
                ))}
            </div>
        </GlassPanel>
    );
});

TopList.displayName = 'TopList';
