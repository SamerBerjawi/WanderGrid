import React, { useMemo } from 'react';
import { Transport } from '../types';
import { ComposableMap, Geographies, Geography, Line, Marker } from 'react-simple-maps';
import { Plane } from 'lucide-react';

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const AIRPORT_COORDS: Record<string, [number, number]> = {
  BEY: [35.49, 33.82],
  PRG: [14.26, 50.10],
  BCN: [2.07, 41.29],
  CDG: [2.54, 49.00],
  ORD: [-87.90, 41.97],
  DTW: [-83.35, 42.21],
  IAD: [-77.45, 38.95],
  GRR: [-85.52, 42.88],
  ATL: [-84.42, 33.64],
  FRA: [8.57, 50.03],
  AMM: [35.99, 31.72],
  MAD: [-3.56, 40.49],
  TUN: [10.22, 36.85],
  DJE: [10.77, 33.86],
  SAW: [29.30, 40.89],
  IST: [28.74, 41.27],
  ISL: [28.74, 41.27],
  CPH: [12.65, 55.61],
  LIS: [-9.13, 38.77],
  ATH: [23.94, 37.93],
  MCT: [58.28, 23.59],
  AUH: [54.65, 24.43],
  PSA: [10.39, 43.68],
  AMS: [4.76, 52.31],
  SXF: [13.52, 52.38],
  FLR: [11.20, 43.81],
  OTP: [26.10, 44.57],
  BRU: [4.48, 50.90],
  LCA: [33.62, 34.87],
  CRL: [4.45, 50.45],
  LHR: [-0.45, 51.47],
  ZRH: [8.54, 47.46],
  NCE: [7.21, 43.66],
  WAW: [20.96, 52.16],
  KUL: [101.70, 2.74],
  LGK: [99.73, 6.32],
  DPS: [115.16, -8.74],
  SIN: [103.99, 1.36],
  FCO: [12.24, 41.80],
  NAP: [14.29, 40.88],
  OPO: [-8.67, 41.24],
  BUD: [19.26, 47.43],
  TFS: [-16.57, 28.04],
  LAX: [-118.40, 33.94],
  SFO: [-122.37, 37.62],
  ORY: [2.36, 48.72],
  SOF: [23.41, 42.69],
  AGP: [-4.49, 36.67],
  DOH: [51.60, 25.27],
  CMB: [79.88, 7.18],
  PNH: [104.84, 11.54],
  TLL: [24.83, 59.41],
  ARN: [17.91, 59.65],
  DUB: [-6.24, 53.42],
  CLE: [-81.85, 41.41],
  BRI: [16.76, 41.13],
  CAI: [31.40, 30.12],
  ASW: [32.81, 23.96],
  LXR: [32.70, 25.67],
  PDL: [-25.69, 37.74],
};

const AIRPORT_COUNTRIES: Record<string, string> = {
  BEY: 'LB', PRG: 'CZ', BCN: 'ES', CDG: 'FR', ORD: 'US', DTW: 'US', IAD: 'US', GRR: 'US', ATL: 'US', FRA: 'DE',
  AMM: 'JO', MAD: 'ES', TUN: 'TN', DJE: 'TN', SAW: 'TR', IST: 'TR', ISL: 'TR', CPH: 'DK', LIS: 'PT', ATH: 'GR',
  MCT: 'OM', AUH: 'AE', PSA: 'IT', AMS: 'NL', SXF: 'DE', FLR: 'IT', OTP: 'RO', BRU: 'BE', LCA: 'CY', CRL: 'BE',
  LHR: 'GB', ZRH: 'CH', NCE: 'FR', WAW: 'PL', KUL: 'MY', LGK: 'MY', DPS: 'ID', SIN: 'SG', FCO: 'IT', NAP: 'IT',
  OPO: 'PT', BUD: 'HU', TFS: 'ES', LAX: 'US', SFO: 'US', ORY: 'FR', SOF: 'BG', AGP: 'ES', DOH: 'QA', CMB: 'LK',
  PNH: 'KH', TLL: 'EE', ARN: 'SE', DUB: 'IE', CLE: 'US', BRI: 'IT', CAI: 'EG', ASW: 'EG', LXR: 'EG', PDL: 'PT',
};

const getFlagEmoji = (countryCode: string) => {
  if (!countryCode) return '';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

const haversineDistance = (coords1: [number, number], coords2: [number, number]) => {
  const toRad = (x: number) => x * Math.PI / 180;
  const lon1 = coords1[0];
  const lat1 = coords1[1];
  const lon2 = coords2[0];
  const lat2 = coords2[1];
  const R = 6371; // km
  const x1 = lat2 - lat1;
  const dLat = toRad(x1);
  const x2 = lon2 - lon1;
  const dLon = toRad(x2);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + 
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Fun pseudo-encryption for the MRZ line
const generateMRZ = (name: string, flightCount: number, yearFilter: string, issueDate: string) => {
  const namePart = name.toUpperCase().replace(/[^A-Z]/g, '<').padEnd(20, '<');
  const datePart = issueDate.replace(/ /g, '').toUpperCase();
  const yearStr = yearFilter === 'all' ? 'ALLTIME' : `YEAR${yearFilter}`;
  return `${yearStr}<<${namePart}<<PASSPORT<<<<<<<<<<<<
ISSUED${datePart}BEY<<<<<<<<<<<<<<<<<<GLOBAL.CITIZEN`;
};

interface FlightyPassportProps {
  flights: Transport[];
  yearFilter: string;
  children?: React.ReactNode;
}

export const FlightyPassport: React.FC<FlightyPassportProps> = ({ flights, yearFilter, children }) => {
  const userStats = useMemo(() => {
    let totalDistance = 0;
    let totalHours = 0;
    const airports = new Set<string>();
    const airlines = new Set<string>();
    const countriesSet = new Set<string>();
    
    // Fallback coords for hashing unknown airports
    const getHashCoords = (iata: string): [number, number] => {
      let hash = 0;
      for (let i = 0; i < iata.length; i++) hash = iata.charCodeAt(i) + ((hash << 5) - hash);
      // Generate some dummy lat/lon based on string hash to at least show something
      return [(hash % 360) - 180, (hash % 160) - 80];
    };

    const routes: { source: [number, number], target: [number, number] }[] = [];

    flights.forEach(f => {
      const origin = f.origin?.toUpperCase() || '';
      const dest = f.destination?.toUpperCase() || '';
      if (origin) {
        airports.add(origin);
        if (AIRPORT_COUNTRIES[origin]) countriesSet.add(AIRPORT_COUNTRIES[origin]);
      }
      if (dest) {
        airports.add(dest);
        if (AIRPORT_COUNTRIES[dest]) countriesSet.add(AIRPORT_COUNTRIES[dest]);
      }
      if (f.provider) airlines.add(f.provider);

      // Estimate time:
      let hours = 2.5; // fallback
      if (f.departureTime && f.arrivalTime && f.departureDate) {
        const d1 = new Date(`${f.departureDate}T${f.departureTime}`);
        const arrDay = f.arrivalDate || f.departureDate;
        const d2 = new Date(`${arrDay}T${f.arrivalTime}`);
        if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
          let diffHr = (d2.getTime() - d1.getTime()) / (1000 * 60 * 60);
          if (diffHr < 0) diffHr += 24; // Simple timezone hack
          if (diffHr > 0 && diffHr < 24) hours = diffHr;
        }
      }
      totalHours += hours;

      const c1 = AIRPORT_COORDS[origin] || getHashCoords(origin);
      const c2 = AIRPORT_COORDS[dest] || getHashCoords(dest);
      
      if (c1 && c2) {
        totalDistance += haversineDistance(c1, c2);
        routes.push({ source: c1, target: c2 });
      }
    });

    return {
      distance: Math.round(totalDistance),
      hours: totalHours,
      airports: airports.size,
      airlines: airlines.size,
      routes,
      flags: Array.from(countriesSet).map(getFlagEmoji)
    };
  }, [flights]);

  const daysHour = Math.floor(userStats.hours / 24);
  const remHours = Math.floor(userStats.hours % 24);
  const mrz = generateMRZ("SAMER BERJAWI", flights.length, yearFilter, "24 MAY 26");

  return (
    <div className="w-full relative rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col md:flex-row bg-white/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-white/5 backdrop-blur-xl group transition-all duration-300">
      {/* Gradient Blur Effects */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-110 transition-transform duration-700" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-110 transition-transform duration-700" />

      {/* Pattern overlay representing passport booklet paper */}
      <div 
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none mix-blend-multiply dark:mix-blend-screen"
        style={{
          backgroundImage: `repeating-radial-gradient(circle at 0 0, transparent 0, #000 14px), repeating-linear-gradient(#000, #000)`,
          backgroundSize: '30px 30px',
        }}
      />
      
      {/* Left Page: Map and Stamps */}
      <div className="w-full md:w-1/2 md:shrink-0 flex-1 border-b md:border-b-0 md:border-r border-dashed border-zinc-300/50 dark:border-white/10 relative p-6 flex flex-col items-center justify-between min-h-[400px]">
        {/* Visa page header */}
        <div className="w-full text-center text-[10px] tracking-[0.4em] uppercase text-zinc-400 dark:text-zinc-500 font-black mb-4">
          Visas
        </div>
        
        {/* The Map */}
        <div className="relative w-full flex-1 min-h-[220px] overflow-hidden dark:opacity-90 dark:mix-blend-screen -mx-4">
          <ComposableMap projection="geoEquirectangular" projectionConfig={{ scale: 130, center: [0, 20] }} style={{ width: "100%", height: "100%" }}>
            <Geographies geography={geoUrl}>
              {({ geographies }) =>
                geographies.map(geo => (
                  <Geography 
                    key={geo.rsmKey} 
                    geography={geo} 
                    fill="#e2e8f0" 
                    stroke="#ffffff"
                    strokeWidth={0.75} 
                    className="dark:fill-zinc-800 dark:stroke-zinc-900"
                  />
                ))
              }
            </Geographies>
            {userStats.routes.map((r, i) => (
              <Line
                key={i}
                from={r.source}
                to={r.target}
                stroke="#3b82f6"
                strokeWidth={1.2}
                strokeLinecap="round"
                className="dark:stroke-blue-400"
                style={{ opacity: 0.5 }}
              />
            ))}
            {userStats.routes.map((r, i) => (
              <React.Fragment key={`pts-${i}`}>
                <Marker coordinates={r.source}>
                  <circle r={2.5} fill="#ffffff" stroke="#3b82f6" strokeWidth={1} className="dark:stroke-blue-400 dark:fill-blue-900" />
                </Marker>
                <Marker coordinates={r.target}>
                  <circle r={2.5} fill="#ffffff" stroke="#3b82f6" strokeWidth={1} className="dark:stroke-blue-400 dark:fill-blue-900" />
                </Marker>
              </React.Fragment>
            ))}
          </ComposableMap>
        </div>

        {/* Stamps (Flags) */}
        {userStats.flags.length > 0 && (
          <div className="w-full flex-wrap flex gap-3 mt-6 justify-center">
            {userStats.flags.slice(0, 18).map((flag, idx) => (
              <div 
                key={idx} 
                className="w-10 h-10 rounded-full border border-white/40 shadow-sm flex items-center justify-center text-xl bg-white/20 dark:bg-black/20 backdrop-blur-md"
                style={{ transform: `rotate(${Math.random() * 40 - 20}deg)` }}
              >
                {flag}
              </div>
            ))}
            {userStats.flags.length > 18 && (
              <div className="w-10 h-10 rounded-full border border-blue-500/30 flex items-center justify-center text-xs font-black text-blue-600 dark:text-blue-400 bg-white/40 dark:bg-blue-500/10 backdrop-blur-md">
                +{userStats.flags.length - 18}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Page: Stats and Info */}
      <div className="w-full md:w-1/2 md:shrink-0 flex-1 flex flex-col relative">
        <div className="relative z-10 p-6 md:p-8 w-full text-zinc-900 dark:text-white">
          <div className="flex justify-between items-start mb-6">
            <div className="space-y-1">
              <h2 className="text-3xl font-black tracking-tight">MY PASSPORT</h2>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase text-zinc-400 dark:text-zinc-500 tracking-wider">
                PASSPORT • PASS • PASAPORTE
              </div>
            </div>
            <div className="w-12 h-12 bg-blue-500/10 dark:bg-blue-500/20 rounded-full flex items-center justify-center relative">
              <Plane className="w-6 h-6 text-blue-600 dark:text-blue-400 transform rotate-45" />
            </div>
          </div>

          <div className="flex w-full mb-8 items-center">
            <div className="flex items-center gap-4">
              <div className="text-7xl font-black leading-none -ml-1 text-zinc-900 dark:text-white drop-shadow-sm">
                {flights.length}
              </div>
              <div className="text-4xl font-light opacity-80 mt-1">
                flights
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-y-6 gap-x-4 mb-4">
            <div>
              <div className="text-[10px] font-black tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mb-1">Distance</div>
              <div className="text-2xl font-black flex items-baseline gap-1 break-words">
                {userStats.distance.toLocaleString()} <span className="text-xs font-mono font-black text-blue-500 uppercase">km</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-black tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mb-1">Time</div>
              <div className="text-2xl font-black flex items-baseline gap-1 break-words">
                {daysHour}d {remHours}h
              </div>
            </div>
            <div>
              <div className="text-[10px] font-black tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mb-1">Airports</div>
              <div className="text-3xl font-black break-words">{userStats.airports}</div>
            </div>
            <div>
              <div className="text-[10px] font-black tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mb-1">Airlines</div>
              <div className="text-3xl font-black break-words">{userStats.airlines}</div>
            </div>
          </div>
          
          {children && (
            <div className="mt-6 pt-6 border-t border-zinc-200/50 dark:border-white/10 relative z-20">
              {children}
            </div>
          )}
        </div>

        {/* MRZ Footer */}
        <div className="mt-auto px-6 py-4 bg-white/20 dark:bg-black/20 z-10 w-full overflow-hidden border-t border-dashed border-zinc-200/80 dark:border-white/10">
          <div className="font-mono text-[11px] sm:text-[13px] leading-tight tracking-[0.1em] sm:tracking-[0.2em] whitespace-pre-wrap word-break font-black text-zinc-500 dark:text-zinc-400">
            {mrz}
          </div>
        </div>
      </div>
    </div>
  );
};
