import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Transport, User, Trip } from '../types';
import GlassPanel from './glass/GlassPanel';
import { 
  Airplane as Plane, 
  Trophy as Award, 
  Globe, 
  ShieldCheck as Shield, 
  IdentificationCard,
  ChartBar
} from '@phosphor-icons/react';
import { ComposableMap, Geographies, Geography, Line, Marker } from 'react-simple-maps';
import { useBentoStats, COUNTRY_NAMES, geoUrl } from './FlightyPassport';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid 
} from 'recharts';
import { TooltipContent } from './TooltipContent';
import { motion } from 'motion/react';
import { 
  getCityName, getCarrierName, getFlightDepartureUtcDate 
} from '../utils/flightData';

export interface FlightsHeroBentoProps {
  flights: Transport[];
  filteredFlights: Array<{ flight: Transport; trip?: Trip }>;
  nextUpcomingFlight?: { flight: Transport; trip?: Trip } | null;
  yearFilter: string;
  currentUser?: User | null;
  metrics: {
    spend: number;
    topAirline: string;
    upcoming: number;
    completed?: number;
    past?: number;
    total?: number;
    hours?: number;
    totalDurationHours?: number;
  };
  monthlyData: Array<{ month: string; flights: number }>;
  AirlineLogo?: React.ComponentType<{ provider?: string; fallback: React.ReactNode }>;
}

export const FlightsHeroBento: React.FC<FlightsHeroBentoProps> = ({
  flights,
  filteredFlights,
  nextUpcomingFlight,
  yearFilter,
  currentUser,
  metrics,
  monthlyData,
  AirlineLogo,
}) => {
  // Mobile Tab State: 'passport' | 'map' | 'stats'
  const [mobileTab, setMobileTab] = useState<'passport' | 'map' | 'stats'>('passport');

  const statsFlights = useMemo(() => filteredFlights.map(f => f.flight), [filteredFlights]);
  const stats = useBentoStats(statsFlights);

  const daysHour = Math.floor(stats.hours / 24);
  const remHours = Math.floor(stats.hours % 24);

  // Traveler biographical info
  const travelerName = currentUser?.name || 'SAMER BERJAWI';
  const initials = travelerName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'SB';
  const nationality = currentUser?.nationality || 'LEBANESE';
  const passportNumber = currentUser?.passportNumber || `WG-${124589 + flights.length}`;

  let dobStr = '24 MAY 85';
  if (currentUser?.dateOfBirth) {
    try {
      const d = new Date(currentUser.dateOfBirth);
      if (!isNaN(d.getTime())) {
        const day = d.getDate();
        const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
        const year = d.getFullYear().toString().substring(2);
        dobStr = `${day} ${month} ${year}`;
      }
    } catch {}
  }

// -------------------------------------------------------------
// Helper: Dynamically Responsive Visa Seals Grid
// -------------------------------------------------------------
const DynamicVisaSeals: React.FC<{ flags: Array<{ code: string; flag: string }> }> = ({ flags }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState<number>(6);

  useEffect(() => {
    if (!containerRef.current) return;
    const calculateCapacity = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      if (clientWidth === 0 || clientHeight === 0) return;
      
      const itemW = 28; // 24px stamp + 4px gap
      const itemH = 28; // 24px stamp + 4px gap
      
      const cols = Math.max(1, Math.floor((clientWidth + 4) / itemW));
      const rows = Math.max(1, Math.floor((clientHeight + 4) / itemH));
      const totalSlots = cols * rows;
      
      setCapacity(totalSlots);
    };

    calculateCapacity();
    const ro = new ResizeObserver(calculateCapacity);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const total = flags.length;
  const needsOverflow = total > capacity;
  const visibleCount = needsOverflow ? Math.max(0, capacity - 1) : total;
  const visibleStamps = flags.slice(0, visibleCount);
  const remainingCount = total - visibleCount;

  if (total === 0) {
    return (
      <div className="text-3xs uppercase font-bold text-light-text-secondary dark:text-dark-text-secondary opacity-60 py-1 text-center font-mono">
        No admission seals
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      className="flex-1 min-h-0 w-full flex flex-wrap gap-1 content-start overflow-hidden pt-1"
    >
      {visibleStamps.map((stamp) => {
        const name = COUNTRY_NAMES[stamp.code] || stamp.code;
        return (
          <div
            key={stamp.code}
            className="w-6 h-6 rounded-full border border-dashed border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10 flex items-center justify-center shrink-0 shadow-2xs hover:scale-110 transition-transform cursor-pointer"
            title={`${name} (Official Stamp)`}
          >
            <span className="text-2xs leading-none select-none">{stamp.flag}</span>
          </div>
        );
      })}
      {needsOverflow && remainingCount > 0 && (
        <span 
          className="w-6 h-6 rounded-full border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/10 flex items-center justify-center text-3xs font-mono font-bold text-light-text-secondary dark:text-dark-text-secondary shrink-0 shadow-2xs"
          title={`${remainingCount} more admitted countries`}
        >
          +{remainingCount}
        </span>
      )}
    </div>
  );
};
  const renderCombinedPassportTicketCard = () => {
    const flight = nextUpcomingFlight?.flight;
    const isFuture = flight ? getFlightDepartureUtcDate(flight) >= new Date() : false;

    let daysDiffText = '';
    if (flight) {
      if (isFuture) {
        const depDate = getFlightDepartureUtcDate(flight);
        const diffTime = Math.abs(depDate.getTime() - new Date().getTime());
        const dVal = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        daysDiffText = dVal === 1 ? 'Tomorrow' : `In ${dVal} days`;
      } else {
        daysDiffText = 'Completed';
      }
    }

    return (
      <GlassPanel 
        className="wg-glass-card shadow-lg hover:shadow-xl transition-all duration-300 h-full flex flex-col justify-between"
        overrides={{ borderRadius: 24 }}
        padding="14px"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 h-full items-stretch">
          {/* LEFT SUB-TILE: Biometric Global Passport */}
          <div className="flex flex-col justify-between sm:border-r sm:border-dashed sm:border-black/10 sm:dark:border-white/10 sm:pr-3.5">
            {/* Passport Header */}
            <div className="flex justify-between items-center pb-2 border-b border-black/5 dark:border-white/10 shrink-0">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Shield className="w-3.5 h-3.5" weight="duotone" />
                </div>
                <span className="text-2xs font-extrabold uppercase tracking-widest text-light-text-secondary dark:text-dark-text-secondary">
                  Global Passport
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-3xs font-mono font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {passportNumber}
              </span>
            </div>

            {/* Traveler Bio Row */}
            <div className="flex items-center gap-2.5 py-2 shrink-0">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-500/15 via-indigo-500/10 to-sky-500/15 border border-black/10 dark:border-white/10 flex items-center justify-center font-bold text-xs text-light-text dark:text-dark-text overflow-hidden shrink-0 shadow-xs">
                {currentUser?.profilePicture ? (
                  <img src={currentUser.profilePicture} alt={travelerName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-black uppercase text-light-text dark:text-dark-text tracking-tight truncate">
                  {travelerName}
                </h4>
                <div className="flex items-center gap-1 mt-0.5 text-3xs font-bold text-light-text-secondary dark:text-dark-text-secondary truncate">
                  <span className="text-blue-600 dark:text-blue-400 font-extrabold uppercase">{nationality}</span>
                  <span>&bull;</span>
                  <span className="font-mono">DOB {dobStr}</span>
                </div>
              </div>
            </div>

            {/* Visa Seals Dynamically Filling Empty Space */}
            <div className="pt-2 border-t border-black/5 dark:border-white/10 flex-1 min-h-0 flex flex-col justify-between overflow-hidden">
              <div className="flex items-center justify-between mb-0.5 shrink-0">
                <span className="text-3xs font-extrabold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1">
                  <Award className="w-3 h-3 text-emerald-500" />
                  Visa Seals
                </span>
                <span className="text-3xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-mono">
                  {stats.flags.length} Admitted
                </span>
              </div>

              <DynamicVisaSeals flags={stats.flags} />
            </div>
          </div>

          {/* RIGHT SUB-TILE: Ticket / Boarding Pass */}
          <div className="flex flex-col justify-between pt-2.5 sm:pt-0 border-t sm:border-t-0 border-black/5 dark:border-white/10">
            {flight ? (
              <>
                {/* Ticket Header */}
                <div className="flex justify-between items-center pb-2 border-b border-black/5 dark:border-white/10 shrink-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-5 h-5 rounded-lg bg-white dark:bg-white/10 flex items-center justify-center border border-black/5 dark:border-white/10 overflow-hidden shadow-2xs shrink-0 p-0.5">
                      {AirlineLogo ? (
                        <AirlineLogo provider={flight.provider} fallback={<Plane className="w-3 h-3 text-blue-500" />} />
                      ) : (
                        <Plane className="w-3 h-3 text-blue-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="text-2xs font-black uppercase text-light-text dark:text-dark-text tracking-tight truncate block leading-none">
                        {flight.identifier || getCarrierName(flight.provider) || 'Flight'}
                      </span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-3xs font-black uppercase tracking-wider shrink-0 ${
                    isFuture
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                      : 'bg-black/5 dark:bg-white/10 text-light-text-secondary dark:text-dark-text-secondary'
                  }`}>
                    {daysDiffText}
                  </span>
                </div>

                {/* Sector Origin -> Destination */}
                <div className="flex items-center justify-between px-1 py-1.5">
                  <div>
                    <span className="text-lg sm:text-xl font-black text-light-text dark:text-dark-text leading-none font-mono">
                      {flight.origin}
                    </span>
                    <span className="block text-3xs font-bold text-light-text-secondary dark:text-dark-text-secondary truncate max-w-[65px] mt-0.5">
                      {getCityName(flight.origin)}
                    </span>
                  </div>

                  <div className="flex-1 flex flex-col items-center justify-center px-2">
                    <span className="text-3xs font-extrabold uppercase text-blue-600 dark:text-blue-400 tracking-wider mb-0.5 font-mono">
                      {flight.duration ? `${Math.floor(flight.duration / 60)}h ${flight.duration % 60}m` : 'Direct'}
                    </span>
                    <div className="relative w-full flex items-center justify-center">
                      <div className="w-full h-[1px] border-t border-dashed border-black/15 dark:border-white/15" />
                      <Plane className="w-3 h-3 text-blue-500 rotate-90 absolute bg-white/80 dark:bg-zinc-800/90 rounded-full p-0.5" />
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-lg sm:text-xl font-black text-light-text dark:text-dark-text leading-none font-mono">
                      {flight.destination}
                    </span>
                    <span className="block text-3xs font-bold text-light-text-secondary dark:text-dark-text-secondary truncate max-w-[65px] mt-0.5">
                      {getCityName(flight.destination)}
                    </span>
                  </div>
                </div>

                {/* Departure & Seat Details Bar */}
                <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-white/40 dark:bg-white/[0.04] rounded-xl border border-black/5 dark:border-white/5 text-3xs shrink-0">
                  <div>
                    <span className="block text-3xs font-extrabold uppercase text-light-text-secondary dark:text-dark-text-secondary">
                      Departure
                    </span>
                    <span className="font-mono text-3xs font-black text-light-text dark:text-dark-text mt-0.5 block truncate">
                      {flight.departureDate} &bull; <strong className="text-blue-600 dark:text-blue-400">{flight.departureTime || 'TBD'}</strong>
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block text-3xs font-extrabold uppercase text-light-text-secondary dark:text-dark-text-secondary">
                      Seat &bull; Class
                    </span>
                    <span className="font-mono text-3xs font-black text-light-text dark:text-dark-text mt-0.5 block truncate">
                      {flight.seatNumber ? `Row ${flight.seatNumber}` : 'Standard'} &bull; {flight.travelClass || 'Economy'}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-3 text-center rounded-2xl bg-white/30 dark:bg-white/[0.03] border border-black/5 dark:border-white/5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-1.5">
                  <Plane className="w-4 h-4" weight="duotone" />
                </div>
                <span className="text-2xs font-extrabold uppercase text-light-text dark:text-dark-text tracking-wider">
                  No Upcoming Flight
                </span>
                <span className="text-3xs text-light-text-secondary dark:text-dark-text-secondary font-medium mt-0.5">
                  Ready for your next journey
                </span>
              </div>
            )}
          </div>
        </div>
      </GlassPanel>
    );
  };

  // -------------------------------------------------------------
  // Tile 2: Interactive Global Route Map Card
  // -------------------------------------------------------------
  const renderRouteMapCard = () => (
    <GlassPanel 
      className="wg-glass-card shadow-lg hover:shadow-xl transition-all duration-300 h-full relative overflow-hidden flex flex-col justify-between"
      overrides={{ borderRadius: 24 }}
      padding="0px"
    >
      {/* Floating Status Indicator Tag */}
      <div className="absolute top-3 left-3 z-10 bg-white/80 dark:bg-black/50 px-2.5 py-1 rounded-xl border border-black/5 dark:border-white/10 backdrop-blur-md shadow-xs pointer-events-none">
        <div className="flex items-center gap-1.5 text-3xs font-extrabold uppercase tracking-widest text-light-text dark:text-dark-text">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping shrink-0" />
          Route Network
        </div>
      </div>

      {/* Floating Network Statistics Tag */}
      <div className="absolute top-3 right-3 z-10 bg-white/80 dark:bg-black/50 px-2.5 py-1 rounded-xl border border-black/5 dark:border-white/10 backdrop-blur-md shadow-xs pointer-events-none">
        <div className="flex items-center gap-1 text-3xs font-bold text-light-text-secondary dark:text-dark-text-secondary">
          <Globe className="w-3 h-3 text-indigo-500" />
          {stats.routes.length} Active Segments
        </div>
      </div>

      {/* Map Stage */}
      <div className="relative w-full h-full min-h-[200px] overflow-hidden flex items-center justify-center pt-6">
        <ComposableMap 
          projection="geoEquirectangular" 
          projectionConfig={{ scale: 140, center: [10, 18] }} 
          className="w-full h-full p-1"
        >
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map(geo => (
                <Geography 
                  key={geo.rsmKey} 
                  geography={geo} 
                  fill="#e2e8f0" 
                  stroke="#cbd5e1" 
                  strokeWidth={0.5} 
                  className="dark:fill-white/[0.07] dark:stroke-white/10 transition-colors"
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none" },
                    pressed: { outline: "none" }
                  }}
                />
              ))
            }
          </Geographies>
          
          {/* Flight Route Lines */}
          {stats.routes.map((r, i) => (
            <Line
              key={`bento-route-${i}`}
              from={r.source}
              to={r.target}
              stroke="#3b82f6"
              strokeWidth={1.5}
              strokeLinecap="round"
              className="stroke-blue-500 dark:stroke-sky-400"
              style={{ opacity: 0.85 }}
            />
          ))}
          
          {/* Airport Markers */}
          {stats.routes.map((r, i) => (
            <React.Fragment key={`bento-pts-${i}`}>
              <Marker coordinates={r.source}>
                <circle r={2.5} fill="#3b82f6" stroke="#ffffff" strokeWidth={1} className="dark:stroke-zinc-900 dark:fill-sky-400 shadow-sm" />
              </Marker>
              <Marker coordinates={r.target}>
                <circle r={2.5} fill="#3b82f6" stroke="#ffffff" strokeWidth={1} className="dark:stroke-zinc-900 dark:fill-sky-400 shadow-sm" />
              </Marker>
            </React.Fragment>
          ))}
        </ComposableMap>
      </div>

      {/* Subtle Bottom Ticker */}
      <div className="px-4 py-2 bg-white/40 dark:bg-white/[0.03] border-t border-black/5 dark:border-white/5 flex items-center justify-between text-3xs font-mono text-light-text-secondary dark:text-dark-text-secondary shrink-0">
        <span>{stats.airports} AIRPORTS CONNECTED</span>
        <span>{stats.airlines} AIRLINES</span>
      </div>
    </GlassPanel>
  );

  // -------------------------------------------------------------
  // Tile 3: Dedicated Flight Analytics & Stats Card
  // -------------------------------------------------------------
  const renderStatsCard = () => (
    <GlassPanel 
      className="wg-glass-card shadow-lg hover:shadow-xl transition-all duration-300 h-full flex flex-col justify-between"
      overrides={{ borderRadius: 24 }}
      padding="14px"
    >
      {/* Top Header */}
      <div className="flex justify-between items-center pb-2 border-b border-black/5 dark:border-white/10 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <ChartBar className="w-3.5 h-3.5" weight="duotone" />
          </div>
          <span className="text-2xs font-extrabold uppercase tracking-widest text-light-text-secondary dark:text-dark-text-secondary">
            Flight Analytics
          </span>
        </div>
        <span className="px-2 py-0.5 rounded-full text-3xs font-mono font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          {yearFilter === 'all' ? 'All Time' : yearFilter}
        </span>
      </div>

      {/* Metric Ticker */}
      <div className="grid grid-cols-3 gap-1.5 py-1.5">
        <div className="p-1.5 bg-white/40 dark:bg-white/[0.04] rounded-xl border border-black/5 dark:border-white/5 text-center">
          <span className="block text-3xs font-extrabold uppercase text-light-text-secondary dark:text-dark-text-secondary">
            Spend
          </span>
          <span className="text-xs font-black text-amber-500 font-mono mt-0.5 block truncate">
            ${metrics.spend.toLocaleString()}
          </span>
        </div>
        <div className="p-1.5 bg-white/40 dark:bg-white/[0.04] rounded-xl border border-black/5 dark:border-white/5 text-center">
          <span className="block text-3xs font-extrabold uppercase text-light-text-secondary dark:text-dark-text-secondary">
            Airward
          </span>
          <span className="text-xs font-black text-light-text dark:text-dark-text font-mono mt-0.5 block truncate">
            {daysHour}d {remHours}h
          </span>
        </div>
        <div className="p-1.5 bg-white/40 dark:bg-white/[0.04] rounded-xl border border-black/5 dark:border-white/5 text-center">
          <span className="block text-3xs font-extrabold uppercase text-light-text-secondary dark:text-dark-text-secondary">
            Top Airline
          </span>
          <span className="text-xs font-black text-light-text dark:text-dark-text mt-0.5 block truncate" title={metrics.topAirline}>
            {metrics.topAirline || 'N/A'}
          </span>
        </div>
      </div>

      {/* Mini Monthly Bar Chart */}
      <div className="flex-1 min-h-[90px] w-full pt-1 flex flex-col justify-end">
        <div className="h-[95px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 2, right: 2, left: -36, bottom: -2 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#888888" strokeOpacity={0.08} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: '#888888', fontWeight: 700 }} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: '#888888', fontWeight: 700 }} />
              <Tooltip 
                cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const curr = payload[0].payload;
                    return (
                      <TooltipContent
                        title={curr.month}
                        rows={[{ color: '#3b82f6', label: 'Flights', value: curr.flights }]}
                      />
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="flights" name="Flights" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Subtle Bottom Ticker */}
      <div className="pt-1.5 border-t border-black/5 dark:border-white/10 flex items-center justify-between text-3xs font-mono text-light-text-secondary dark:text-dark-text-secondary shrink-0">
        <span>{statsFlights.length} FLIGHTS LOGGED</span>
        <span>{stats.distance.toLocaleString()} KM TOTAL</span>
      </div>
    </GlassPanel>
  );

  return (
    <div className="w-full">
      {/* ------------------------------------------------------------- */}
      {/* Mobile-Only Segmented Navigation Bar (< lg breakpoint)        */}
      {/* ------------------------------------------------------------- */}
      <div className="block lg:hidden mb-3">
        <div className="bg-black/5 dark:bg-white/5 p-1 rounded-2xl flex border border-black/10 dark:border-white/5 relative">
          {[
            { id: 'passport' as const, label: 'Passport & Ticket', icon: IdentificationCard },
            { id: 'map' as const, label: 'Route Map', icon: Globe },
            { id: 'stats' as const, label: 'Flight Stats', icon: ChartBar },
          ].map((tab) => {
            const isSelected = mobileTab === tab.id;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMobileTab(tab.id)}
                className={`relative flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px] ${
                  isSelected 
                    ? 'text-blue-600 dark:text-blue-400 font-extrabold' 
                    : 'text-light-text-secondary dark:text-dark-text-secondary opacity-60 hover:opacity-100'
                }`}
                aria-label={`View ${tab.label}`}
              >
                {isSelected && (
                  <motion.div
                    layoutId="flightsHeroMobileTab"
                    className="absolute inset-0 rounded-xl bg-white dark:bg-white/10 shadow-sm border border-black/5 dark:border-white/10"
                    transition={{ type: "spring", stiffness: 450, damping: 32 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <TabIcon className="w-3.5 h-3.5" weight="duotone" />
                  <span className="text-2xs truncate">{tab.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Mobile Card Display (< lg breakpoint): Min-Height ~250px      */}
      {/* ------------------------------------------------------------- */}
      <div className="block lg:hidden min-h-[250px]">
        {mobileTab === 'passport' && renderCombinedPassportTicketCard()}
        {mobileTab === 'map' && renderRouteMapCard()}
        {mobileTab === 'stats' && renderStatsCard()}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Desktop Bento Grid (>= lg breakpoint): Single Row             */}
      {/* ------------------------------------------------------------- */}
      <div className="hidden lg:grid lg:grid-cols-12 gap-5 items-stretch min-h-[250px]">
        {/* Col 1: Combined Global Passport & Ticket (5 cols) */}
        <div className="lg:col-span-5 h-full flex flex-col">
          {renderCombinedPassportTicketCard()}
        </div>

        {/* Col 2: Interactive Route Map (3 cols) */}
        <div className="lg:col-span-3 h-full flex flex-col">
          {renderRouteMapCard()}
        </div>

        {/* Col 3: Dedicated Flight Analytics & Stats (4 cols) */}
        <div className="lg:col-span-4 h-full flex flex-col">
          {renderStatsCard()}
        </div>
      </div>
    </div>
  );
};

export default FlightsHeroBento;
