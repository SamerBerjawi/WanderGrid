import React from 'react';
import { GlassPanel } from './glass/GlassPanel';
import { 
    AirplaneTakeoff, 
    Globe, 
    Clock, 
    MapPin, 
    Airplane, 
    AirplaneTilt, 
    Buildings 
} from '@/components/ui/hugeicons';

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
            return <AirplaneTakeoff weight="duotone" className="w-4 h-4 sm:w-5 sm:h-5" />;
        case 'public':
            return <Globe weight="duotone" className="w-4 h-4 sm:w-5 sm:h-5" />;
        case 'schedule':
            return <Clock weight="duotone" className="w-4 h-4 sm:w-5 sm:h-5" />;
        case 'place':
            return <MapPin weight="duotone" className="w-4 h-4 sm:w-5 sm:h-5" />;
        default:
            return <Airplane weight="duotone" className="w-4 h-4 sm:w-5 sm:h-5" />;
    }
};

// Liquid Glass Styled Stat Card (Responsive, Mobile-First)
export const StatCard: React.FC<{ 
  title: string; 
  value: string | number; 
  subtitle?: string; 
  icon: string; 
  color?: string 
}> = React.memo(({ title, value, subtitle, icon, color = 'blue' }) => {
    return (
        <GlassPanel className={`wg-glass-card wg-stat-tile wg-stat-${color} rounded-2xl sm:rounded-[28px] overflow-hidden p-3.5 sm:p-5 flex flex-col justify-between relative group transition-all duration-300 hover:-translate-y-0.5 border border-black/5 dark:border-white/10`}>
            {/* Ambient Accent Spot */}
            <div className={`absolute -right-8 -top-8 w-24 h-24 bg-${color}-500/10 dark:bg-${color}-500/15 rounded-full blur-[30px] pointer-events-none transition-all duration-500 group-hover:scale-125`} />
            
            {/* Top row: Compact Icon Pill + Label */}
            <div className="flex items-center gap-2 sm:gap-2.5 relative z-raised min-w-0">
                <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-${color}-500/10 border border-${color}-500/20 text-${color}-600 dark:text-${color}-400 flex items-center justify-center shrink-0`}>
                    {renderStatIcon(icon)}
                </div>
                <span className="text-2xs sm:text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider truncate">
                    {title}
                </span>
            </div>
            
            {/* Metric Value & Subtitle */}
            <div className="relative z-raised mt-2 sm:mt-3 min-w-0">
                <div className="text-lg sm:text-2xl lg:text-3xl font-black text-light-text dark:text-dark-text leading-tight tracking-tight">
                    {value}
                </div>
                {subtitle && (
                    <div className="text-2xs sm:text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary mt-0.5 sm:mt-1 truncate">
                        {subtitle}
                    </div>
                )}
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
            
            <div className="flex justify-between items-start relative z-raised">
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

            <div className="mt-6 relative z-raised">
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
const LazyDonutChart = React.lazy(() => import('./DashboardCharts').then(m => ({ default: m.DonutChart })));
const LazyFlightTrendChart = React.lazy(() => import('./DashboardCharts').then(m => ({ default: m.FlightTrendChart })));
const ChartPlaceholder = () => <div className="wg-glass-card rounded-[28px] h-[22rem] w-full animate-pulse bg-black/5 dark:bg-white/5" aria-hidden="true" />;

export const DonutChart: React.FC<{ data: { label: string; value: number; color: string }[]; title: string }> = (props) => (
    <React.Suspense fallback={<ChartPlaceholder />}><LazyDonutChart {...props} /></React.Suspense>
);

// Liquid Glass FlightTrendChart (Memoized)
export const FlightTrendChart: React.FC<{ data: FlightTrendPoint[] }> = (props) => (
    <React.Suspense fallback={<ChartPlaceholder />}><LazyFlightTrendChart {...props} /></React.Suspense>
);

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
                        <div className="flex justify-between items-center mb-2 relative z-raised">
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
