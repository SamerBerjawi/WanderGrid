// Road-trip transit chart (recharts). Lazy-loaded by views/RoadTrips.tsx so recharts isn't on that page's critical path.
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TooltipContent } from './TooltipContent';

export const TransitFootprintChart: React.FC<{ data: any[]; isDark: boolean }> = ({ data: chartData, isDark }) => (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} />
        <XAxis dataKey="name" stroke={isDark ? "#888" : "#555"} fontSize={10} tickLine={false} />
        <YAxis yAxisId="left" stroke="#3b82f6" label={{ value: 'Distance (km)', angle: -90, position: 'insideLeft', style: {fontSize: 10, fill: '#3b82f6'} }} fontSize={10} tickLine={false} />
        <YAxis yAxisId="right" orientation="right" stroke="#10b981" label={{ value: 'Duration (hours)', angle: 90, position: 'insideRight', style: {fontSize: 10, fill: '#10b981'} }} fontSize={10} tickLine={false} />
        <Tooltip 
          cursor={{ fill: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}
          content={({ active, payload, label }) => {
            if (active && payload && payload.length) {
              const rows = payload.map((entry) => ({
                color: entry.color || '#3b82f6',
                label: String(entry.name || entry.dataKey || ''),
                value: entry.dataKey === 'Duration' 
                  ? `${Number(entry.value).toFixed(1)} hrs` 
                  : `${Number(entry.value).toLocaleString()} km`
              }));
              return (
                <TooltipContent
                  title={String(label)}
                  rows={rows}
                />
              );
            }
            return null;
          }}
        />
        <Legend wrapperStyle={{ fontSize: '10px' }} />
        <Bar yAxisId="left" dataKey="Distance" fill="#3b82f6" name="Distance (km)" radius={[4, 4, 0, 0]} />
        <Bar yAxisId="right" dataKey="Duration" fill="#10b981" name="Duration (hrs)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
);
