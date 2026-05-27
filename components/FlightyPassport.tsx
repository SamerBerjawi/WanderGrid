import React, { useMemo } from 'react';
import { Transport } from '../types';
import { ComposableMap, Geographies, Geography, Line, Marker } from 'react-simple-maps';
import { Plane } from 'lucide-react';
import { getCoordinatesSync } from '../services/geocoding';

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
  BER: [13.50, 52.37],
  VIE: [16.57, 48.11],
};

const AIRPORT_COUNTRIES: Record<string, string> = {
  BEY: 'LB', PRG: 'CZ', BCN: 'ES', CDG: 'FR', ORD: 'US', DTW: 'US', IAD: 'US', GRR: 'US', ATL: 'US', FRA: 'DE',
  AMM: 'JO', MAD: 'ES', TUN: 'TN', DJE: 'TN', SAW: 'TR', IST: 'TR', ISL: 'TR', CPH: 'DK', LIS: 'PT', ATH: 'GR',
  MCT: 'OM', AUH: 'AE', PSA: 'IT', AMS: 'NL', FLR: 'IT', OTP: 'RO', BRU: 'BE', LCA: 'CY', CRL: 'BE',
  LHR: 'GB', ZRH: 'CH', NCE: 'FR', WAW: 'PL', KUL: 'MY', LGK: 'MY', DPS: 'ID', SIN: 'SG', FCO: 'IT', NAP: 'IT',
  OPO: 'PT', BUD: 'HU', TFS: 'ES', LAX: 'US', SFO: 'US', ORY: 'FR', SOF: 'BG', AGP: 'ES', DOH: 'QA', CMB: 'LK',
  PNH: 'KH', TLL: 'EE', ARN: 'SE', DUB: 'IE', CLE: 'US', BRI: 'IT', CAI: 'EG', ASW: 'EG', LXR: 'EG', PDL: 'PT',
  BER: 'DE', VIE: 'AT',
};

const COUNTRY_NAMES: Record<string, string> = {
  LB: 'LEBANON', CZ: 'CZECH REP.', ES: 'SPAIN', FR: 'FRANCE', US: 'USA', DE: 'GERMANY',
  JO: 'JORDAN', TN: 'TUNISIA', TR: 'TURKEY', DK: 'DENMARK', PT: 'PORTUGAL', GR: 'GREECE',
  OM: 'OMAN', AE: 'U.A.E.', IT: 'ITALY', NL: 'NETHERLANDS', RO: 'ROMANIA', BE: 'BELGIUM',
  CY: 'CYPRUS', GB: 'U.K.', CH: 'SWISS', PL: 'POLAND', MY: 'MALAYSIA',
  ID: 'INDONESIA', SG: 'SINGAPORE', HU: 'HUNGARY', BG: 'BULGARIA', QA: 'QATAR', LK: 'SRI LANKA',
  KH: 'CAMBODIA', EE: 'ESTONIA', SE: 'SWEDEN', IE: 'IRELAND', EG: 'EGYPT', AT: 'AUSTRIA',
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

const generateMRZ = (name: string, flightCount: number, yearFilter: string, issueDate: string) => {
  const namePart = name.toUpperCase().replace(/[^A-Z]/g, '<').padEnd(20, '<');
  const datePart = issueDate.replace(/ /g, '').toUpperCase();
  const yearStr = yearFilter === 'all' ? 'ALLTIME' : `YEAR${yearFilter}`;
  return `${yearStr}<<${namePart}<<PASSPORT<<<<<<<<<<<<\nISSUED${datePart}BEY<<<<<<<<<<<<<<<<<<GLOBAL.CITIZEN`;
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
    
    const getHashCoords = (iata: string): [number, number] => {
      let hash = 0;
      for (let i = 0; i < iata.length; i++) hash = iata.charCodeAt(i) + ((hash << 5) - hash);
      return [(hash % 360) - 180, (hash % 160) - 80];
    };

    const extractIataCode = (input: string): string => {
      if (!input) return '';
      const clean = input.trim().toUpperCase();
      if (/^[A-Z]{3}$/.test(clean)) return clean;
      const match1 = clean.match(/^([A-Z]{3})\s*-\s*/);
      if (match1) return match1[1];
      const match2 = clean.match(/\(([A-Z]{3})\)/);
      if (match2) return match2[1];
      const words = clean.split(/[^A-Z]/);
      for (const w of words) {
        if (w.length === 3 && AIRPORT_COORDS[w]) {
          return w;
        }
      }
      return clean;
    };

    const routes: { source: [number, number], target: [number, number] }[] = [];

    flights.forEach(f => {
      const originRaw = f.origin || '';
      const destRaw = f.destination || '';
      const originCode = extractIataCode(originRaw);
      const destCode = extractIataCode(destRaw);

      const geo1 = getCoordinatesSync(originRaw);
      const geo2 = getCoordinatesSync(destRaw);

      if (originCode) {
        airports.add(originCode);
        const code = AIRPORT_COUNTRIES[originCode] || geo1?.countryCode;
        if (code) countriesSet.add(code);
      }
      if (destCode) {
        airports.add(destCode);
        const code = AIRPORT_COUNTRIES[destCode] || geo2?.countryCode;
        if (code) countriesSet.add(code);
      }
      if (f.provider) airlines.add(f.provider);

      let hours = 2.5; 
      if (f.departureTime && f.arrivalTime && f.departureDate) {
        const d1 = new Date(`${f.departureDate}T${f.departureTime}`);
        const arrDay = f.arrivalDate || f.departureDate;
        const d2 = new Date(`${arrDay}T${f.arrivalTime}`);
        if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
          let diffHr = (d2.getTime() - d1.getTime()) / (1000 * 60 * 60);
          if (diffHr < 0) diffHr += 24; 
          if (diffHr > 0 && diffHr < 24) hours = diffHr;
        }
      }
      totalHours += hours;

      let c1: [number, number] | undefined;
      if (f.originLng !== undefined && f.originLat !== undefined && f.originLng !== 0 && f.originLat !== 0) {
        c1 = [f.originLng, f.originLat];
      } else if (geo1 && geo1.lng && geo1.lat) {
        c1 = [geo1.lng, geo1.lat];
      } else if (AIRPORT_COORDS[originCode]) {
        c1 = AIRPORT_COORDS[originCode];
      } else {
        c1 = getHashCoords(originCode);
      }

      let c2: [number, number] | undefined;
      if (f.destLng !== undefined && f.destLat !== undefined && f.destLng !== 0 && f.destLat !== 0) {
        c2 = [f.destLng, f.destLat];
      } else if (geo2 && geo2.lng && geo2.lat) {
        c2 = [geo2.lng, geo2.lat];
      } else if (AIRPORT_COORDS[destCode]) {
        c2 = AIRPORT_COORDS[destCode];
      } else {
        c2 = getHashCoords(destCode);
      }
      
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
      flags: Array.from(countriesSet).map(code => ({
        code,
        flag: getFlagEmoji(code)
      }))
    };
  }, [flights]);

  const daysHour = Math.floor(userStats.hours / 24);
  const remHours = Math.floor(userStats.hours % 24);
  const mrz = generateMRZ("SAMER BERJAWI", flights.length, yearFilter, "24 MAY 26");

  return (
    <div className="w-full relative rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col bg-white/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-white/5 backdrop-blur-xl group transition-all duration-300">
      {/* Premium Ambient Light Gradients */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-110 transition-transform duration-700" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-110 transition-transform duration-700" />

      {/* Pattern overlay representing passport booklet paper texture */}
      <div 
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none mix-blend-multiply dark:mix-blend-screen"
        style={{
          backgroundImage: `repeating-radial-gradient(circle at 0 0, transparent 0, #000 14px), repeating-linear-gradient(#000, #000)`,
          backgroundSize: '30px 30px',
        }}
      />
      
      {/* Top Half: Stats and Info */}
      <div className="w-full flex flex-col relative justify-between shrink-0">
        <div className="relative z-10 p-5 md:p-6 pb-2 w-full text-zinc-900 dark:text-white flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <div className="space-y-0.5">
              <h2 className="text-2xl md:text-3xl font-black tracking-tight uppercase">My Passport</h2>
              <div className="flex items-center gap-2 text-[8px] md:text-[9px] font-black uppercase text-zinc-400 dark:text-zinc-500/60 tracking-wider">
                PASSPORT • PASS • PASAPORTE
              </div>
            </div>
            <div className="w-9 h-9 bg-indigo-500/10 dark:bg-sky-500/25 rounded-full flex items-center justify-center relative shadow-inner shrink-0 leading-none">
              <Plane className="w-4.5 h-4.5 text-indigo-600 dark:text-sky-400 transform rotate-45" />
            </div>
          </div>

          <div className="flex w-full my-2 items-center">
            <div className="flex items-center gap-2.5">
              <div className="text-5xl md:text-6xl font-black leading-none -ml-1 text-zinc-905 dark:text-white drop-shadow-xs">
                {flights.length}
              </div>
              <div className="text-xl font-light opacity-85 mt-1 uppercase tracking-widest text-zinc-450 dark:text-zinc-550">
                flights
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-4 mb-2">
            <div>
              <div className="text-[8px] font-black tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mb-0.5">Distance</div>
              <div className="text-lg md:text-xl font-black flex items-baseline gap-0.5 break-all font-mono">
                {userStats.distance.toLocaleString()} <span className="text-[9px] font-mono font-black text-indigo-500 dark:text-sky-400 uppercase">km</span>
              </div>
            </div>
            <div>
              <div className="text-[8px] font-black tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mb-0.5">Time</div>
              <div className="text-lg md:text-xl font-black flex items-baseline gap-0.5 break-all font-mono">
                {daysHour}d {remHours}h
              </div>
            </div>
            <div>
              <div className="text-[8px] font-black tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mb-0.5">Airports</div>
              <div className="text-lg md:text-xl font-black break-all font-mono">{userStats.airports}</div>
            </div>
            <div>
              <div className="text-[8px] font-black tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mb-0.5">Airlines</div>
              <div className="text-lg md:text-xl font-black break-all font-mono">{userStats.airlines}</div>
            </div>
          </div>
          
          {children && (
            <div className="mt-2 pt-2 border-t border-zinc-200/50 dark:border-white/10 relative z-20">
              {children}
            </div>
          )}
        </div>
      </div>

      {/* Middle Section: Flags/Stamps Overlapping Tray */}
      <div className="w-full shrink-0 py-2 px-5 border-t border-b border-dashed border-zinc-200 dark:border-white/5 bg-zinc-500/5 overflow-visible relative z-20">
        {userStats.flags.length > 0 ? (
          <div className="flex justify-center items-center py-0.5 overflow-visible">
            <div className="flex flex-wrap justify-center items-center gap-1.5 overflow-visible max-w-full px-2">
              {userStats.flags.map((stamp, idx) => {
                const name = COUNTRY_NAMES[stamp.code] || stamp.code;
                const colors = [
                  { text: 'text-sky-600 dark:text-sky-400', border: 'border-sky-500/30 dark:border-sky-400/30', bg: 'bg-sky-50 dark:bg-sky-950/80' },
                  { text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-500/30 dark:border-rose-400/30', bg: 'bg-rose-50 dark:bg-rose-950/80' },
                  { text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/30 dark:border-emerald-400/30', bg: 'bg-emerald-50 dark:bg-emerald-950/80' },
                  { text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-500/30 dark:border-indigo-400/30', bg: 'bg-indigo-50 dark:bg-indigo-950/80' },
                  { text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/30 dark:border-amber-400/30', bg: 'bg-amber-50 dark:bg-amber-950/80' },
                ];
                const color = colors[idx % colors.length];
                const stableRotate = Math.sin(idx * 13) * 6;
                
                return (
                  <div
                    key={stamp.code}
                    className={`w-7 h-7 rounded-full border ${color.border} ${color.text} ${color.bg} flex items-center justify-center font-mono select-none shadow-sm cursor-pointer transition-all duration-300 relative`}
                    style={{
                      transform: `rotate(${stableRotate}deg)`,
                      zIndex: idx + 1,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.zIndex = '999';
                      e.currentTarget.style.transform = 'scale(1.3) rotate(0deg)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.zIndex = (idx + 1).toString();
                      e.currentTarget.style.transform = `scale(1) rotate(${stableRotate}deg)`;
                    }}
                    title={`${name} (Admitted)`}
                  >
                    <span className="text-base leading-none filter saturate-150">{stamp.flag}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="w-full text-center py-1.5 text-[8px] uppercase font-bold text-zinc-400/70 tracking-widest border border-dashed border-zinc-200 dark:border-white/5 rounded-lg bg-zinc-500/5">
            No stamps recorded for this era
          </div>
        )}
      </div>

      {/* Bottom Section: Map Overlay */}
      <div className="relative w-full h-[260px] sm:h-[320px] overflow-hidden shrink-0 m-0 p-0">
        <div className="absolute inset-0 flex items-center justify-center p-0 m-0">
          <ComposableMap projection="geoEquirectangular" projectionConfig={{ scale: 145, center: [0, 0] }} style={{ width: "100%", height: "100%" }}>
            <Geographies geography={geoUrl}>
              {({ geographies }) =>
                geographies.map(geo => (
                  <Geography 
                    key={geo.rsmKey} 
                    geography={geo} 
                    fill="#cbd5e1" 
                    stroke="#94a3b8"
                    strokeWidth={0.5} 
                    className="dark:fill-zinc-800 dark:stroke-zinc-700 transition-all"
                    style={{ outline: "none" }}
                  />
                ))
              }
            </Geographies>
            
            {/* Map flight arcs represented as premium dashed coordinates */}
            {userStats.routes.map((r, i) => (
              <Line
                key={`route-${i}`}
                from={r.source}
                to={r.target}
                stroke="#6366f1"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeDasharray="2 2"
                className="stroke-indigo-500 dark:stroke-sky-400"
                style={{ opacity: 0.8 }}
              />
            ))}
            
            {/* Elegant glowing sector endpoints */}
            {userStats.routes.map((r, i) => (
              <React.Fragment key={`pts-${i}`}>
                <Marker coordinates={r.source}>
                  <circle r={2.5} fill="#6366f1" stroke="#ffffff" strokeWidth={0.5} className="dark:stroke-zinc-950 dark:fill-sky-400" />
                </Marker>
                <Marker coordinates={r.target}>
                  <circle r={2.5} fill="#6366f1" stroke="#ffffff" strokeWidth={0.5} className="dark:stroke-zinc-950 dark:fill-sky-400" />
                </Marker>
              </React.Fragment>
            ))}
          </ComposableMap>
        </div>
      </div>

      {/* MRZ Footer */}
      <div className="mt-auto px-5 py-2 md:py-3 bg-zinc-50/60 dark:bg-black/45 z-10 w-full overflow-hidden border-t border-dashed border-zinc-200/85 dark:border-white/10 shrink-0 text-center">
        <div className="font-mono text-[8px] sm:text-[10px] leading-tight tracking-[0.12em] whitespace-pre-wrap font-black text-zinc-400 dark:text-zinc-505">
          {mrz}
        </div>
      </div>
    </div>
  );
};
