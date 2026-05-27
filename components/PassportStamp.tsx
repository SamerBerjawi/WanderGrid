import React, { useMemo, useState } from 'react';
import { REGION_STYLES } from '../views/regionStyles';

export interface VisitedCountry {
    code: string; 
    name: string;
    cities: Set<string> | string[];
    flag: string;
    tripCount: number;
    lastVisit: Date | string; 
    region: string; 
}

interface PassportStampProps {
    country: VisitedCountry;
}

export const PassportStamp: React.FC<PassportStampProps> = ({ country }) => {
    // Unique serial number based on country name, code, and date for distinct visual identification
    const serialNumber = useMemo(() => {
        const dateStr = country.lastVisit instanceof Date ? country.lastVisit.toISOString() : String(country.lastVisit);
        let hash = 0;
        const combined = `${country.code}-${country.name}-${dateStr}`;
        for (let i = 0; i < combined.length; i++) {
            hash = combined.charCodeAt(i) + ((hash << 5) - hash);
        }
        const num = Math.abs(hash) % 9000 + 1000;
        const section = String.fromCharCode(65 + (Math.abs(hash) % 26)) + String.fromCharCode(65 + ((Math.abs(hash) >> 2) % 26));
        return `№ ${section}-${country.code}-${num}`;
    }, [country.code, country.name, country.lastVisit]);

    // Unique Officer designation for authentic border patrol vibe
    const officerRef = useMemo(() => {
        let sum = 0;
        for (let i = 0; i < country.name.length; i++) {
            sum += country.name.charCodeAt(i);
        }
        const code = (sum % 900) + 100;
        const init1 = country.name.charAt(0).toUpperCase();
        const init2 = country.name.charAt(Math.min(country.name.length - 1, 3)).toUpperCase();
        return `OFFICER COMMISSION: ${init1}${init2}-${code}`;
    }, [country.name]);

    // Format target visit date
    const formattedDate = useMemo(() => {
        const d = new Date(country.lastVisit);
        if (isNaN(d.getTime())) return 'UNKNOWN';
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        return `${d.getDate().toString().padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }, [country.lastVisit]);

    // Fixed gentle tilt based on characters to prevent dynamic jumps of elements
    const tilt = useMemo(() => {
        const sum = country.code.charCodeAt(0) + (country.code.charCodeAt(1) || 0);
        return ((sum % 7) - 3) * 1.2; // -3.6 to +3.6 degrees range
    }, [country.code]);

    // Retrieve visual color styling from central region styles
    const styleObj = useMemo(() => {
        return REGION_STYLES[country.region] || REGION_STYLES['Unknown'];
    }, [country.region]);

    const citiesList = useMemo(() => {
        const arr = country.cities instanceof Set ? Array.from(country.cities) : Array.isArray(country.cities) ? country.cities : [];
        return arr.join(', ') || 'Airport Port of Entry';
    }, [country.cities]);

    // Precise visual colors matching flag colors
    const flagGlow = useMemo(() => {
        const uppercaseCode = country.code.toUpperCase();
        const namePart = country.name.toLowerCase();

        // Standard colors for common countries to ensure high fidelity
        const colorMap: Record<string, { r: number; g: number; b: number }> = {
            'US': { r: 59, g: 130, b: 246 },   // Royal Blue
            'CA': { r: 239, g: 68, b: 68 },   // vibrant Crimson Red
            'FR': { r: 37, g: 99, b: 235 },   // Royal French Blue
            'DE': { r: 245, g: 158, b: 11 },   // Gold/Amber
            'IT': { r: 16, g: 185, b: 129 },  // Emerald Green
            'ES': { r: 239, g: 68, b: 68 },   // Red/Yellow
            'GB': { r: 29, g: 78, b: 216 },   // Navy Blue
            'NL': { r: 220, g: 38, b: 38 },   // Red
            'CH': { r: 239, g: 68, b: 68 },   // Red
            'SE': { r: 14, g: 165, b: 233 },  // Sky Swedish Blue
            'NO': { r: 225, g: 29, b: 72 },   // Rose red
            'FI': { r: 29, g: 78, b: 216 },   // Blue
            'DK': { r: 225, g: 29, b: 72 },   // Rose
            'GR': { r: 14, g: 165, b: 233 },  // Sky Blue
            'PT': { r: 5, g: 150, b: 105 },   // Emerald
            'IE': { r: 249, g: 115, b: 22 },  // Orange
            'BE': { r: 251, g: 191, b: 36 },  // Amber/Yellow
            'AT': { r: 239, g: 68, b: 68 },   // Red
            'PL': { r: 244, g: 63, b: 94 },   // Pinky Red
            'JP': { r: 225, g: 29, b: 72 },   // Red
            'CN': { r: 239, g: 68, b: 68 },   // Red
            'KR': { r: 37, g: 99, b: 235 },   // Blue
            'IN': { r: 249, g: 115, b: 22 },  // Saffron Orange
            'SG': { r: 239, g: 68, b: 68 },   // Red
            'TH': { r: 29, g: 78, b: 216 },   // Royal Blue
            'VN': { r: 245, g: 158, b: 11 },   // Gold
            'MY': { r: 29, g: 78, b: 216 },   // Navy
            'ID': { r: 239, g: 68, b: 68 },   // Red
            'PH': { r: 37, g: 99, b: 235 },   // Blue
            'AU': { r: 29, g: 78, b: 216 },   // Navy
            'NZ': { r: 29, g: 78, b: 216 },   // Royal Blue
            'BR': { r: 16, g: 185, b: 129 },  // Green
            'MX': { r: 5, g: 150, b: 105 },   // Emerald
            'AR': { r: 14, g: 165, b: 233 },  // Arg Sky
            'ZA': { r: 16, g: 185, b: 129 },  // Green
            'EG': { r: 217, g: 119, b: 6 },   // Amber
            'TR': { r: 225, g: 29, b: 72 },   // Pink Rose
            'RU': { r: 37, g: 99, b: 235 },   // Blue
        };

        if (colorMap[uppercaseCode]) {
            return colorMap[uppercaseCode];
        }

        // Substrings fallback
        if (namePart.includes('states') || namePart.includes('america')) return { r: 59, g: 130, b: 246 };
        if (namePart.includes('kingdom') || namePart.includes('britain')) return { r: 29, g: 78, b: 216 };
        if (namePart.includes('france')) return { r: 37, g: 99, b: 235 };
        if (namePart.includes('canada')) return { r: 239, g: 68, b: 68 };
        if (namePart.includes('japan')) return { r: 225, g: 29, b: 72 };
        if (namePart.includes('swiss') || namePart.includes('switzerland')) return { r: 239, g: 68, b: 68 };
        if (namePart.includes('germany')) return { r: 245, g: 158, b: 11 };
        if (namePart.includes('brazil')) return { r: 16, g: 185, b: 129 };

        // Deterministic hash based on letters
        let sum = 0;
        for (let i = 0; i < country.code.length; i++) {
            sum += country.code.charCodeAt(i);
        }

        const presets = [
            { r: 244, g: 63, b: 94 },    // rose
            { r: 59, g: 130, b: 246 },   // blue
            { r: 16, g: 185, b: 129 },   // emerald
            { r: 245, g: 158, b: 11 },   // amber
            { r: 139, g: 92, b: 246 },   // violet
            { r: 14, g: 165, b: 233 },   // sky
            { r: 249, g: 115, b: 22 },   // orange
            { r: 20, g: 184, b: 166 }    // teal
        ];

        return presets[sum % presets.length];
    }, [country.code, country.name]);

    const [isHovered, setIsHovered] = useState(false);

    // Compute dynamic, beautiful glow style variables purely when hovered or fallback
    const dynamicStyle = useMemo(() => {
        const rgbStr = `${flagGlow.r}, ${flagGlow.g}, ${flagGlow.b}`;
        return {
            transform: `rotate(${tilt}deg)`,
            borderColor: isHovered ? `rgba(${rgbStr}, 0.5)` : undefined,
            boxShadow: isHovered 
                ? `0 20px 30px -4px rgba(${rgbStr}, 0.35), 0 10px 14px -6px rgba(${rgbStr}, 0.2), inset 0 0 14px rgba(${rgbStr}, 0.08)` 
                : 'inset 0 0 12px rgba(0,0,0,0.02)'
        } as React.CSSProperties;
    }, [tilt, flagGlow, isHovered]);

    const shapeIndex = useMemo(() => {
        let sum = 0;
        for (let i = 0; i < country.code.length; i++) {
            sum += country.code.charCodeAt(i);
        }
        return sum % 3;
    }, [country.code]);

    // Beautiful custom pastel-saturated vintage ink styles
    const inkColorClass = useMemo(() => {
        const colors = [
            'text-sky-600 dark:text-sky-400 border-sky-600/60 dark:border-sky-400/60 bg-sky-50/20 dark:bg-sky-500/5',
            'text-rose-500 dark:text-rose-400 border-rose-500/60 dark:border-rose-400/60 bg-rose-50/20 dark:bg-rose-500/5',
            'text-emerald-600 dark:text-emerald-400 border-emerald-600/60 dark:border-emerald-400/60 bg-emerald-50/20 dark:bg-emerald-500/5',
            'text-indigo-600 dark:text-indigo-400 border-indigo-600/60 dark:border-indigo-400/60 bg-indigo-50/20 dark:bg-indigo-500/5',
            'text-amber-600 dark:text-amber-405 border-amber-600/60 dark:border-amber-400/60 bg-amber-50/20 dark:bg-amber-500/5',
        ];
        const sum = country.code.charCodeAt(0) + (country.code.charCodeAt(1) || 0);
        return colors[sum % colors.length];
    }, [country.code]);

    return (
        <div 
            id={`passport-stamp-${country.code}`}
            style={dynamicStyle} 
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="group relative bg-white/70 dark:bg-zinc-900/60 backdrop-blur-md rounded-[2.5rem] border border-zinc-200/50 dark:border-white/5 p-6 flex flex-col justify-center items-center h-[14.5rem] w-full min-w-0 hover:scale-[1.04] hover:-translate-y-1 transition-all duration-300 overflow-hidden select-none"
        >
            {/* Inked Distress Background Grid for genuine hand-stamped passport page */}
            <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:10px_10px] pointer-events-none" />
            <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.04] pointer-events-none mix-blend-multiply dark:mix-blend-screen"
                style={{
                  backgroundImage: `repeating-radial-gradient(circle at 50% 50%, transparent 0, #000 8px), repeating-linear-gradient(#000, #000)`,
                  backgroundSize: '20px 20px',
                }}
            />

            {/* Centered Large Passport Ink Stamp Shape */}
            <div className="w-full h-full flex flex-col items-center justify-center transition-all duration-300 group-hover:scale-105 group-hover:opacity-40">
                {shapeIndex === 0 ? (
                    // 1. Circle Double-Border Ink Badge
                    <div className={`w-40 h-40 rounded-full border-2 border-current flex flex-col items-center justify-center p-1.5 ${inkColorClass} shrink-0 relative transition-transform duration-500`} style={{ transform: `rotate(${tilt * 1.5}deg)` }}>
                        <div className="absolute inset-1 rounded-full border border-dashed border-current opacity-80" />
                        <div className="w-full h-full rounded-full border border-current flex flex-col items-center justify-center gap-0.5 font-mono p-2">
                            <span className="text-3xl filter saturate-150 drop-shadow-sm mb-0.5">{country.flag}</span>
                            <span className="text-[10px] tracking-[0.2em] font-black uppercase text-center leading-none">{country.name.slice(0, 10)}</span>
                            <span className="text-[7px] tracking-widest font-black uppercase bg-current text-white dark:text-zinc-950 px-1 py-0.5 rounded-sm scale-90 mt-1 leading-none">BORDER ENTR</span>
                            <span className="text-[8px] font-black mt-1 tracking-tight">{formattedDate}</span>
                        </div>
                    </div>
                ) : shapeIndex === 1 ? (
                    // 2. Octagonal Border Decal
                    <div className={`w-40 h-40 rounded-2xl border-2 border-current flex flex-col items-center justify-center p-2.5 ${inkColorClass} shrink-1 relative transition-transform duration-505`} style={{ transform: `rotate(${tilt * 1.5}deg)` }}>
                        <div className="absolute inset-1.5 rounded-xl border border-dotted border-current opacity-80" />
                        <div className="w-full h-full rounded-lg border border-current flex flex-col items-center justify-center font-mono gap-0.5">
                            <span className="text-[8px] font-black tracking-[0.25em] uppercase leading-none opacity-85">APPROVED</span>
                            <span className="text-3xl filter saturate-150 my-1">{country.flag}</span>
                            <span className="text-xs font-black tracking-tight uppercase max-h-[14px] leading-none mb-1">{country.code} • {country.name.slice(0, 10)}</span>
                            <div className="border-t border-current w-5/6 text-center pt-1 mt-0.5">
                                <span className="text-[8px] font-black tracking-widest block leading-none">{formattedDate}</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    // 3. Pill-Shaped Stamp
                    <div className={`w-44 h-32 rounded-[2rem] border-2 border-current flex flex-col items-center justify-center p-2 ${inkColorClass} shrink-0 relative transition-transform duration-501`} style={{ transform: `rotate(${tilt * 1.5}deg)` }}>
                        <div className="absolute inset-1.5 rounded-[1.6rem] border-t border-b border-dashed border-current opacity-85" />
                        <div className="w-full h-full rounded-[1.6rem] flex flex-col items-center justify-center font-mono gap-0.5">
                            <span className="text-[7px] font-black tracking-[0.3em] uppercase leading-none mb-0.5">PASSPORT DEPT</span>
                            <div className="flex items-center gap-1.5 my-1 justify-center">
                                <span className="text-3xl filter saturate-150">{country.flag}</span>
                                <div className="text-left">
                                    <span className="text-sm font-black tracking-tighter block leading-none">{country.code}</span>
                                    <span className="text-[6.5px] font-bold text-zinc-400 dark:text-zinc-500 uppercase leading-none mt-0.5 block">{country.region.slice(0, 10)}</span>
                                </div>
                            </div>
                            <div className="border-t border-double border-current w-4/5 text-center pt-1">
                                <span className="text-[9px] font-black tracking-widest">{formattedDate}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Custom security reference footer when not hovered */}
            <div className={`absolute bottom-2 left-6 right-6 flex justify-between items-center text-[7px] font-mono tracking-widest font-black opacity-35 group-hover:opacity-0 transition-opacity duration-300 ${styleObj.text}`}>
                <span>{serialNumber}</span>
                <span>{country.tripCount} {country.tripCount === 1 ? 'ENTRY' : 'ENTRIES'}</span>
            </div>

            {/* Uniform Detail Backing panel shown on Hover with a subtle colored radial glow overlay */}
            <div 
                className="absolute inset-x-0 bottom-0 top-0 bg-slate-950/95 border border-white/10 p-5 text-white flex flex-col justify-between text-left opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-[2.5rem] z-20"
                style={{
                    backgroundImage: `radial-gradient(circle at top right, rgba(${flagGlow.r}, ${flagGlow.g}, ${flagGlow.b}, 0.18) 0%, transparent 65%)`
                }}
            >
                <div className="min-w-0">
                    <div className="flex justify-between items-start border-b border-white/10 pb-2 mb-3">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xl flex-shrink-0">{country.flag}</span>
                            <span className="text-xs font-black tracking-tight truncate uppercase text-white">{country.name}</span>
                        </div>
                        <span className="text-[8px] font-mono font-black bg-white/10 px-1.5 py-0.5 rounded flex-shrink-0 text-white">{country.code}</span>
                    </div>
 
                    <p className="text-[8px] uppercase tracking-wider font-extrabold text-indigo-400">Security Clearance</p>
                    <p className="text-[10px] font-bold text-gray-200 mt-0.5 truncate">{serialNumber}</p>
                    
                    <p className="text-[8px] uppercase tracking-wider font-extrabold text-indigo-400 mt-2">Port of Entry Logs</p>
                    <p className="text-[10px] font-semibold text-gray-300 mt-0.5 line-clamp-2 leading-snug" title={citiesList}>
                        {citiesList}
                    </p>
                </div>

                <div className="border-t border-white/10 pt-2 flex justify-between items-center text-[9px] font-mono text-gray-400">
                    <div>
                        <span className="block opacity-65 uppercase text-[8px] tracking-wide">Arrival Count</span>
                        <span className="text-xs font-black text-amber-500 block">{country.tripCount} entries</span>
                    </div>
                    <div className="text-right">
                        <span className="block opacity-65 uppercase text-[8px] tracking-wide">Last Arrival</span>
                        <span className="text-xs font-black text-indigo-400 block">{formattedDate}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
