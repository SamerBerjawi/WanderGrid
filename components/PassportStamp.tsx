import React, { useMemo } from 'react';

export interface VisitedCountry {
    code: string; 
    name: string;
    cities: Set<string> | string[];
    flag: string;
    tripCount: number;
    lastVisit: Date | string; 
    region: string; 
    rarity?: 'gold' | 'silver' | 'bronze' | 'Legendary' | 'Rare' | 'Uncommon' | 'Common';
}

interface PassportStampProps {
    country: VisitedCountry;
}

export const PassportStamp: React.FC<PassportStampProps> = ({ country }) => {
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
            'GB-ENG': { r: 206, g: 17, b: 38 },  // St George Red
            'GB-SCT': { r: 0, g: 101, b: 189 },  // Scottish Saltire Blue
            'GB-WLS': { r: 0, g: 173, b: 95 },   // Welsh Green/White
            'GB-NIR': { r: 210, g: 12, b: 35 },  // Red Cross / Ulster
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

    const shapeIndex = useMemo(() => {
        let sum = 0;
        for (let i = 0; i < country.code.length; i++) {
            sum += country.code.charCodeAt(i);
        }
        return sum % 3;
    }, [country.code]);

    // Beautiful custom pastel-saturated vintage ink styles dynamically matching major flag color
    const inkStyle = useMemo(() => {
        const rgbStr = `${flagGlow.r}, ${flagGlow.g}, ${flagGlow.b}`;
        return {
            color: `rgba(${rgbStr}, 0.85)`,
            borderColor: `rgba(${rgbStr}, 0.55)`,
            backgroundColor: `rgba(${rgbStr}, 0.04)`,
        } as React.CSSProperties;
    }, [flagGlow]);

    return (
        <div 
            id={`passport-stamp-${country.code}`}
            style={{ transform: `rotate(${tilt}deg)` }}
            className="group relative flex flex-col justify-center items-center select-none cursor-pointer p-1.5 transition-transform duration-200"
            title={`${country.name} (${country.code}) • ${country.tripCount} ${country.tripCount === 1 ? 'trip' : 'trips'} • ${formattedDate}`}
        >
            {/* The Authentic Ink Stamp Graphic */}
            <div className="flex flex-col items-center justify-center transition-all duration-200">
                {shapeIndex === 0 ? (
                    // 1. Circle Double-Border Badge
                    <div 
                        className="w-18 h-18 sm:w-22 sm:h-22 rounded-full border-2 border-current flex flex-col items-center justify-center p-1 shrink-0 relative transition-transform duration-200 group-hover:scale-110 active:scale-95" 
                        style={{ 
                            ...inkStyle, 
                            transform: `rotate(${tilt * 1.5}deg)`,
                        }}
                    >
                        <div className="absolute inset-0.5 rounded-full border border-dashed border-current opacity-70" />
                        <div className="w-full h-full rounded-full border border-current flex flex-col items-center justify-center font-mono">
                            <span className="text-base sm:text-xl leading-none mb-0.5">{country.flag}</span>
                            <span className="text-[8px] sm:text-[10px] tracking-tight font-black uppercase text-center leading-none truncate max-w-[50px] sm:max-w-[62px]">{country.name}</span>
                            <span className="text-[7px] sm:text-[8px] font-mono font-bold mt-0.5 tracking-tight opacity-75">{formattedDate}</span>
                        </div>
                    </div>
                ) : shapeIndex === 1 ? (
                    // 2. Octagonal Border Decal
                    <div 
                        className="w-18 h-18 sm:w-22 sm:h-22 rounded-xl sm:rounded-2xl border-2 border-current flex flex-col items-center justify-center p-1 shrink-0 relative transition-transform duration-200 group-hover:scale-110 active:scale-95" 
                        style={{ 
                            ...inkStyle, 
                            transform: `rotate(${tilt * 1.5}deg)`,
                        }}
                    >
                        <div className="absolute inset-0.5 rounded-lg border border-dotted border-current opacity-70" />
                        <div className="w-full h-full rounded-md border border-current flex flex-col items-center justify-center font-mono">
                            <span className="text-[7px] sm:text-[8px] font-bold tracking-widest uppercase leading-none opacity-70 scale-90">ENTRY</span>
                            <span className="text-base sm:text-xl leading-none my-0.5">{country.flag}</span>
                            <span className="text-[8px] sm:text-[10px] font-black tracking-tight uppercase leading-none truncate max-w-[50px] sm:max-w-[62px]">{country.name}</span>
                            <span className="text-[7px] sm:text-[8px] font-bold tracking-tight block leading-none mt-0.5 opacity-75">{formattedDate}</span>
                        </div>
                    </div>
                ) : (
                    // 3. Pill-Shaped Stamp
                    <div 
                        className="w-20 h-15 sm:w-24 sm:h-18 rounded-xl sm:rounded-2xl border-2 border-current flex flex-col items-center justify-center p-1 shrink-0 relative transition-transform duration-200 group-hover:scale-110 active:scale-95" 
                        style={{ 
                            ...inkStyle, 
                            transform: `rotate(${tilt * 1.5}deg)`,
                        }}
                    >
                        <div className="absolute inset-0.5 rounded-lg border-t border-b border-dashed border-current opacity-70" />
                        <div className="w-full h-full rounded-lg flex flex-col items-center justify-center font-mono">
                            <span className="text-[7px] sm:text-[8px] font-bold tracking-widest uppercase leading-none opacity-70 scale-90">PORT</span>
                            <div className="flex items-center gap-1 my-0.5 justify-center">
                                <span className="text-sm sm:text-base leading-none">{country.flag}</span>
                                <span className="text-[10px] sm:text-xs font-bold tracking-tight block leading-none">{country.code}</span>
                            </div>
                            <span className="text-[7px] sm:text-[8px] font-bold tracking-tight opacity-75">{formattedDate}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Micro Floating Tooltip on Hover */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 z-30 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-black/85 dark:bg-white/90 text-white dark:text-black whitespace-nowrap shadow-md flex items-center gap-1">
                <span>{country.name}</span>
                <span className="opacity-60">•</span>
                <span>{country.tripCount}x</span>
            </div>
        </div>
    );
};
