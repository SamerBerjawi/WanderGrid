import React, { useEffect, useState } from 'react';
import { fetchWeather, weatherKind, type PlaceWeather, type WeatherKind } from '../../services/weather';
import { Cloud, CloudFog, CloudRain, CloudSun, Lightning, Snowflake, Sun, type Icon } from '../ui/hugeicons';
import { cn } from '../../utils/cn';

/**
 * The weather at a place, as a small pill: the forecast for `date` when it falls in the next two
 * weeks, otherwise how it is there now. Shows nothing while loading or when there is no answer.
 */

const ICON: Record<WeatherKind, { icon: Icon; tone: string }> = {
    clear: { icon: Sun, tone: 'text-rp-ochre' },
    partly: { icon: CloudSun, tone: 'text-rp-ochre' },
    cloud: { icon: Cloud, tone: 'text-rp-muted' },
    fog: { icon: CloudFog, tone: 'text-rp-muted' },
    rain: { icon: CloudRain, tone: 'text-rp-sea' },
    snow: { icon: Snowflake, tone: 'text-rp-navy' },
    storm: { icon: Lightning, tone: 'text-rp-plum' },
};

const deg = (n: number) => `${Math.round(n)}°`;

export const usePlaceWeather = (lat?: number, lng?: number): PlaceWeather | null => {
    const [weather, setWeather] = useState<PlaceWeather | null>(null);
    useEffect(() => {
        if (lat == null || lng == null) { setWeather(null); return; }
        let live = true;
        void fetchWeather(lat, lng).then(w => { if (live) setWeather(w); });
        return () => { live = false; };
    }, [lat, lng]);
    return weather;
};

export const WeatherChip: React.FC<{ lat?: number; lng?: number; date?: string; className?: string }> = ({ lat, lng, date, className }) => {
    const weather = usePlaceWeather(lat, lng);
    if (!weather) return null;
    const day = date ? weather.daily[date] : undefined;
    const code = day ? day.code : weather.current.code;
    const { kind, label } = weatherKind(code);
    const { icon: IconC, tone } = ICON[kind];
    const text = day ? `${deg(day.max)} / ${deg(day.min)}` : `${deg(weather.current.temp)} now`;
    return (
        <span
            className={cn('inline-flex min-h-7 items-center gap-1.5 rounded-full bg-rp-inset px-2.5 text-xs font-medium text-rp-ink', className)}
            title={day ? `${label}, forecast for ${date}` : `${label} right now${date ? '. The forecast opens two weeks ahead.' : ''}`}
        >
            <IconC size={14} className={tone} aria-hidden />
            <span className="rp-tabular">{text}</span>
            <span className="sr-only">{label}</span>
        </span>
    );
};
