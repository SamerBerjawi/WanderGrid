// Recharts-based dashboard charts. Loaded lazily by DashboardWidgets so recharts (~100 KB gzip)
// isn't parsed before the rest of the Dashboard renders (PERF-004).
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { TooltipContent } from './TooltipContent';
import { GlassPanel } from './glass/GlassPanel';
import type { FlightTrendPoint } from './DashboardWidgets';

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
