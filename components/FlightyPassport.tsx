import React, { useMemo } from 'react';
import { Transport, User } from '../types';
import { ComposableMap, Geographies, Geography, Line, Marker } from 'react-simple-maps';
import { Plane, Award, Compass, Globe, Shield, Navigation } from 'lucide-react';
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
  LHR: 'GB-ENG', ZRH: 'CH', NCE: 'FR', WAW: 'PL', KUL: 'MY', LGK: 'MY', DPS: 'ID', SIN: 'SG', FCO: 'IT', NAP: 'IT',
  OPO: 'PT', BUD: 'HU', TFS: 'ES', LAX: 'US', SFO: 'US', ORY: 'FR', SOF: 'BG', AGP: 'ES', DOH: 'QA', CMB: 'LK',
  PNH: 'KH', TLL: 'EE', ARN: 'SE', DUB: 'IE', CLE: 'US', BRI: 'IT', CAI: 'EG', ASW: 'EG', LXR: 'EG', PDL: 'PT',
  BER: 'DE', VIE: 'AT',
};

const COUNTRY_NAMES: Record<string, string> = {
  LB: 'LEBANON', CZ: 'CZECH REP.', ES: 'SPAIN', FR: 'FRANCE', US: 'USA', DE: 'GERMANY',
  JO: 'JORDAN', TN: 'TUNISIA', TR: 'TURKEY', DK: 'DENMARK', PT: 'PORTUGAL', GR: 'GREECE',
  OM: 'OMAN', AE: 'U.A.E.', IT: 'ITALY', NL: 'NETHERLANDS', RO: 'ROMANIA', BE: 'BELGIUM',
  CY: 'CYPRUS', GB: 'U.K.', 'GB-ENG': 'ENGLAND', 'GB-SCT': 'SCOTLAND', 'GB-WLS': 'WALES', 'GB-NIR': 'N. IRELAND', CH: 'SWISS', PL: 'POLAND', MY: 'MALAYSIA',
  ID: 'INDONESIA', SG: 'SINGAPORE', HU: 'HUNGARY', BG: 'BULGARIA', QA: 'QATAR', LK: 'SRI LANKA',
  KH: 'CAMBODIA', EE: 'ESTONIA', SE: 'SWEDEN', IE: 'IRELAND', EG: 'EGYPT', AT: 'AUSTRIA',
};

const getFlagEmoji = (countryCode: string) => {
  if (!countryCode) return '';
  const code = countryCode.toUpperCase();
  if (code === 'GB-ENG') return '🏴󠁧󠁢󠁥󠁮󠁧󠁿';
  if (code === 'GB-SCT') return '🏴󠁧󠁢󠁳󠁣󠁴󠁿';
  if (code === 'GB-WLS') return '🏴󠁧󠁢󠁷󠁬󠁳󠁿';
  if (code === 'GB-NIR') return '🇬🇧';
  if (countryCode.length !== 2) return '🏳️';
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
  const namePart = name.toUpperCase().replace(/[^A-Z]/g, '<').padEnd(23, '<');
  const yearStr = yearFilter === 'all' ? 'ALLTIME' : `YEAR${yearFilter}`;
  const paddedYear = yearStr.padEnd(9, '<');
  return `P<LBN${namePart}<<PASSPORT<<<<<<\nWG859214<8LBN8505247M${paddedYear}<<<<<<<<02`;
};

// Hook to centralize calculations so each bento module stays synchronized
export const useBentoStats = (flights: Transport[]) => {
  return useMemo(() => {
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
};

// -------------------------------------------------------------
// Module 1: Passport Owner ID Card (Fidelity Biometric Passport)
// -------------------------------------------------------------
interface PassportIdCardProps {
  flights: Transport[];
  yearFilter: string;
  currentUser?: User | null;
}

export const PassportIdCard: React.FC<PassportIdCardProps> = ({ flights, yearFilter, currentUser }) => {
  const stats = useBentoStats(flights);
  const daysHour = Math.floor(stats.hours / 24);
  const remHours = Math.floor(stats.hours % 24);

  const travelerName = currentUser?.name || "SAMER BERJAWI";
  const initials = travelerName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || "SB";
  
  // Split travelerName into Surname and Given Names
  const nameParts = travelerName.trim().split(/\s+/);
  const surname = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0] || "BERJAWI";
  const givenNames = nameParts.length > 1 ? nameParts.slice(0, nameParts.length - 1).join(' ') : "SAMER";

  const nationality = currentUser?.nationality || "LEBANESE";
  
  // Format Date of Birth
  let dobStr = "24 MAY 85";
  if (currentUser?.dateOfBirth) {
    try {
      const d = new Date(currentUser.dateOfBirth);
      if (!isNaN(d.getTime())) {
        const day = d.getDate();
        const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
        const year = d.getFullYear().toString().substring(2);
        dobStr = `${day} ${month} ${year}`;
      }
    } catch (e) {
      console.error(e);
    }
  }

  const authority = currentUser?.passportIssuingEntity || "WG Aviation HQ";
  const passportNumber = currentUser?.passportNumber || `WG-${124589 + flights.length}`;

  const mrz = generateMRZ(travelerName, flights.length, yearFilter, currentUser?.passportIssueDate || "24 MAY 26");

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-zinc-950 border border-zinc-200/50 dark:border-white/5 shadow-2xl rounded-[2.5rem] p-6 text-white flex flex-col justify-between h-full group transition-all duration-300 hover:shadow-indigo-500/10 hover:border-zinc-805/50">
      {/* Background patterns */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none group-hover:scale-125 transition-transform duration-700" />
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-screen"
        style={{
          backgroundImage: `repeating-radial-gradient(circle at 100% 100%, transparent 0, #3b82f6 10px), repeating-linear-gradient(#fff, #fff)`,
          backgroundSize: '24px 24px',
        }}
      />
      
      <div className="space-y-4">
        {/* Visual header */}
        <div className="flex justify-between items-center border-b border-white/5 pb-3">
          <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-zinc-400">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            GLOBAL PASSPORT • PORTAL
          </div>
          <div className="text-[8px] font-mono text-indigo-400 font-extrabold uppercase tracking-widest bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/10">
            {passportNumber}
          </div>
        </div>

        {/* Biometric Row */}
        <div className="flex flex-col sm:flex-row gap-5 items-center">
          {/* Photos slot */}
          <div className="flex flex-col items-center gap-2.5 shrink-0">
            <div className="w-28 h-32 rounded-2xl bg-gradient-to-tr from-zinc-800 via-indigo-950/40 to-zinc-900 border border-white/5 flex flex-col items-center justify-center relative overflow-hidden shadow-inner group-hover:border-zinc-700 transition-colors">
              <div className="absolute inset-x-0 top-0 h-10 bg-indigo-500/5 blur-md" />
              <div className="absolute -left-5 -bottom-5 w-16 h-16 bg-sky-500/5 rounded-full blur-xl animate-pulse" />
              
              {/* Profile icon structure */}
              {currentUser?.profilePicture ? (
                <img src={currentUser.profilePicture} alt={travelerName} className="w-full h-full object-cover relative z-10" referrerPolicy="no-referrer" />
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-zinc-700/80 border border-zinc-600 flex items-center justify-center text-zinc-300 relative z-10 shrink-0 font-bold text-lg shadow-sm">
                    {initials}
                  </div>
                  <div className="w-20 h-10 rounded-t-[50%] bg-zinc-700/50 border border-zinc-650/40 relative z-10 -mt-2 shadow-sm" />
                </>
              )}
              
              {/* Waterproof security print */}
              <div className="absolute bottom-2 right-2 w-12 h-12 rounded-full border border-teal-500/20 flex items-center justify-center text-[5px] font-black text-teal-400 rotate-12 select-none pointer-events-none uppercase bg-teal-500/[0.02]">
                <div className="text-center leading-[1.1]">
                  WG VALID
                  <br />
                  ★ ADMITTED ★
                </div>
              </div>
            </div>
            <span className="text-[7px] font-black tracking-widest uppercase text-zinc-400 font-mono text-center">BIOMETRIC PASS</span>
          </div>

          {/* Core metadata columns */}
          <div className="flex-1 grid grid-cols-2 gap-y-3 gap-x-2.5">
            <div>
              <span className="block text-[7px] text-zinc-400 font-black uppercase tracking-wider">Surname</span>
              <span className="text-[11px] font-extrabold uppercase tracking-tight text-white">{surname}</span>
            </div>
            <div>
              <span className="block text-[7px] text-zinc-400 font-black uppercase tracking-wider">Given Names</span>
              <span className="text-[11px] font-extrabold uppercase tracking-tight text-white">{givenNames}</span>
            </div>
            <div>
              <span className="block text-[7px] text-zinc-400 font-black uppercase tracking-wider">Nationality</span>
              <span className="text-[11px] font-extrabold uppercase tracking-tight text-white">{nationality}</span>
            </div>
            <div>
              <span className="block text-[7px] text-zinc-400 font-black uppercase tracking-wider">Sex / DOB</span>
              <span className="text-[11px] font-extrabold uppercase tracking-tight text-white">M / {dobStr}</span>
            </div>
            <div>
              <span className="block text-[7px] text-zinc-400 font-black uppercase tracking-wider">Authority</span>
              <span className="text-[11px] font-extrabold uppercase tracking-tight text-zinc-300 truncate leading-none block">{authority}</span>
            </div>
            <div>
              <span className="block text-[7px] text-zinc-400 font-black uppercase tracking-wider">Document Type</span>
              <span className="text-[11px] font-extrabold uppercase tracking-tight text-zinc-300">P / CITIZEN</span>
            </div>
          </div>
        </div>

        {/* Dynamic numerical tracking summary */}
        <div className="grid grid-cols-3 gap-2 border-t border-b border-dashed border-white/5 py-3 my-2 text-center">
          <div>
            <span className="block text-[7px] font-black uppercase text-zinc-400">Total Flights</span>
            <span className="text-xs font-black text-blue-400 font-mono mt-0.5 block">{flights.length}</span>
          </div>
          <div>
            <span className="block text-[7px] font-black uppercase text-zinc-400">Distance</span>
            <span className="text-xs font-black text-zinc-200 font-mono mt-0.5 block truncate">{stats.distance.toLocaleString()} <span className="text-[8px] font-sans text-zinc-400">km</span></span>
          </div>
          <div>
            <span className="block text-[7px] font-black uppercase text-zinc-400">Hours Airward</span>
            <span className="text-xs font-black text-zinc-200 font-mono mt-0.5 block">{daysHour}d {remHours}h</span>
          </div>
        </div>
      </div>

      {/* Machine Readable Zone MRZ Code block */}
      <div className="mt-4 pt-2 text-center select-none bg-black/40 p-2.5 rounded-xl border border-white/5">
        <div className="font-mono text-[8.5px] sm:text-[9.5px] leading-tight tracking-[0.14em] whitespace-normal sm:whitespace-pre-wrap font-bold text-zinc-500">
          {mrz}
        </div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// Module 2: Passport Stamps Page (VISA Admissions Badge Gallery)
// -------------------------------------------------------------
interface PassportStampsPageProps {
  flights: Transport[];
  yearFilter: string;
}

export const PassportStampsPage: React.FC<PassportStampsPageProps> = ({ flights, yearFilter }) => {
  const stats = useBentoStats(flights);

  return (
    <div className="relative bg-white/70 dark:bg-zinc-900/40 border border-zinc-200/65 dark:border-white/5 shadow-xl rounded-[2.5rem] p-5 backdrop-blur-xl flex flex-col justify-between h-full group transition-all duration-300 hover:shadow-2xl overflow-visible">
      {/* Grid Pattern overlays to simulate vintage passport pages */}
      <div 
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none mix-blend-multiply dark:mix-blend-screen rounded-[2.5rem]"
        style={{
          backgroundImage: `repeating-linear-gradient(45deg, #000 0, #000 1px, transparent 0, transparent 8px)`,
          backgroundSize: '12px 12px',
        }}
      />
      
      <div className="space-y-4 overflow-visible">
        <div className="flex justify-between items-center border-b border-zinc-200/40 dark:border-white/5 pb-2.5 select-none">
          <h3 className="text-xs font-black uppercase text-zinc-500 tracking-widest flex items-center gap-1.5">
            <Award className="w-4 h-4 text-emerald-500" />
            Visa stamps
          </h3>
          <span className="text-[7.5px] font-black uppercase tracking-widest text-zinc-400 bg-zinc-150 dark:bg-zinc-800 px-2.5 py-0.5 rounded-full">
            {stats.flags.length} ADMITTED
          </span>
        </div>

        {/* Vintage-style stamp gallery */}
        {stats.flags.length > 0 ? (
          <div className="flex flex-wrap gap-3 py-3 px-2 justify-center max-h-[140px] overflow-y-auto overflow-x-visible custom-scrollbar">
            {stats.flags.map((stamp, idx) => {
              const name = COUNTRY_NAMES[stamp.code] || stamp.code;
              const colors = [
                { text: 'text-sky-600 dark:text-sky-400', border: 'border-sky-500/20 dark:border-sky-450/20', bg: 'bg-gradient-to-tr from-sky-500/[0.02] to-sky-500/[0.08]' },
                { text: 'text-rose-600 dark:text-rose-405', border: 'border-rose-500/20 dark:border-rose-455/20', bg: 'bg-gradient-to-tr from-rose-500/[0.02] to-rose-500/[0.08]' },
                { text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/20 dark:border-emerald-400/20', bg: 'bg-gradient-to-tr from-emerald-500/[0.02] to-emerald-500/[0.08]' },
                { text: 'text-indigo-600 dark:text-indigo-405', border: 'border-indigo-500/20 dark:border-indigo-405/20', bg: 'bg-gradient-to-tr from-indigo-500/[0.02] to-indigo-500/[0.08]' },
                { text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/20 dark:border-amber-400/20', bg: 'bg-gradient-to-tr from-amber-500/[0.02] to-amber-500/[0.08]' },
              ];
              const color = colors[idx % colors.length];
              const stableRotate = Math.sin(idx * 17) * 7;
              
              return (
                <div
                  key={stamp.code}
                  className={`w-9 h-9 rounded-full border border-dashed ${color.border} ${color.text} ${color.bg} flex items-center justify-center font-mono select-none shadow-sm cursor-pointer transition-all duration-300 relative`}
                  style={{
                    transform: `rotate(${stableRotate}deg)`,
                    zIndex: idx + 1,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.zIndex = '99';
                    e.currentTarget.style.transform = 'scale(1.3) rotate(0deg)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.zIndex = (idx + 1).toString();
                    e.currentTarget.style.transform = `scale(1) rotate(${stableRotate}deg)`;
                  }}
                  title={`${name} (Official Stamp)`}
                >
                  <span className="text-xl leading-none filter saturate-150 select-none pb-0.5">{stamp.flag}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="w-full text-center py-7 text-[8px] uppercase font-bold text-zinc-400 border border-dashed border-zinc-200/50 dark:border-white/5 rounded-2xl bg-zinc-500/5 select-none">
            No stamps recorded for this era
          </div>
        )}
      </div>

      <div className="mt-3 text-[7.5px] font-black uppercase text-zinc-400/60 font-mono tracking-widest text-center border-t border-dashed border-zinc-200/50 dark:border-white/5 pt-3 select-none">
        WanderGrid ADMISSION SEALS
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// Module 3: Passport Travel Map (Global Routes Tracking Stage)
// -------------------------------------------------------------
interface PassportTravelMapProps {
  flights: Transport[];
  yearFilter: string;
}

export const PassportTravelMap: React.FC<PassportTravelMapProps> = ({ flights, yearFilter }) => {
  const stats = useBentoStats(flights);

  return (
    <div className="relative overflow-hidden bg-white/70 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-white/5 shadow-xl rounded-[2.5rem] backdrop-blur-xl h-full flex flex-col justify-end group transition-all duration-300 hover:shadow-2xl">
      {/* Floating Status Indicator Tag */}
      <div className="absolute top-5 left-5 z-20 bg-white/90 dark:bg-black/55 px-3 py-2 rounded-2xl border border-zinc-200 dark:border-white/10 backdrop-blur-md shadow-sm pointer-events-none">
        <div className="flex items-center gap-2 text-[8px] md:text-[9.5px] font-black uppercase tracking-widest text-zinc-800 dark:text-zinc-250">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping shrink-0" />
          Live Route Network
        </div>
      </div>

      {/* Floating Network Statistics Tag */}
      <div className="absolute top-5 right-5 z-20 bg-white/90 dark:bg-black/55 px-3 py-2 rounded-2xl border border-zinc-200 dark:border-white/10 backdrop-blur-md shadow-sm pointer-events-none">
        <div className="flex items-center gap-1 text-[8.5px] font-bold text-zinc-500 dark:text-zinc-400">
          <Globe className="w-3.5 h-3.5 text-indigo-500" />
          {stats.routes.length} Active Segments
        </div>
      </div>

      {/* Map stage */}
      <div className="relative w-full h-[280px] sm:h-[340px] md:h-full min-h-[300px] overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <ComposableMap 
            projection="geoEquirectangular" 
            projectionConfig={{ scale: 145, center: [0, 0] }} 
            className="w-full h-full p-2"
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
                    className="dark:fill-zinc-800/80 dark:stroke-zinc-750 transition-colors"
                    style={{ outline: "none" }}
                  />
                ))
              }
            </Geographies>
            
            {/* Solid route lines */}
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
            
            {/* Glowing sector endpoints */}
            {stats.routes.map((r, i) => (
              <React.Fragment key={`bento-pts-${i}`}>
                <Marker coordinates={r.source}>
                  <circle r={3} fill="#3b82f6" stroke="#ffffff" strokeWidth={1} className="dark:stroke-zinc-900 dark:fill-sky-400 shadow-md animate-none" />
                </Marker>
                <Marker coordinates={r.target}>
                  <circle r={3} fill="#3b82f6" stroke="#ffffff" strokeWidth={1} className="dark:stroke-zinc-900 dark:fill-sky-400 shadow-md animate-none" />
                </Marker>
              </React.Fragment>
            ))}
          </ComposableMap>
        </div>
      </div>
    </div>
  );
};

// Keeping retro-compatibility wrapper for any direct import of older full passport
export const FlightyPassport: React.FC<PassportIdCardProps> = ({ flights, yearFilter }) => {
  return <PassportIdCard flights={flights} yearFilter={yearFilter} />;
};
