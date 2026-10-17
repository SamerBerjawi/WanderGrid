import React, { useEffect, useState } from 'react';
import {
  AirplaneTakeoff, Train, Bus, Key, Car, Boat, Buildings, Sparkle, House, ForkKnife, Compass, Ticket, Moon, MapPin, Clock,
  Sun, CloudSun, Cloud, CloudFog, CloudRain, Snowflake, CloudLightning,
} from '@/components/ui/hugeicons';
import { Accommodation, Activity, Carrier, Transport, TransportMode, Trip } from '../../types';
import { getCoordinates } from '../../services/geocoding';
import { getMerchantLogoUrl } from '../../utils/brandfetch';
import { getTransportScheduleEventsForDate, getTransportScheduleLocation, getTransportScheduleTitle } from '../../utils/transportSchedule';

/** Shared logic for the Golden Hour trip page. Copied from views/TripDetail.tsx so the original stays untouched. */

const ICONS: Record<string, React.ElementType> = {
  wb_sunny: Sun, partly_cloudy_day: CloudSun, cloud: Cloud, foggy: CloudFog, umbrella: CloudRain, rainy: CloudRain,
  ac_unit: Snowflake, thunderstorm: CloudLightning,
  flight_takeoff: AirplaneTakeoff, flight: AirplaneTakeoff, Flight: AirplaneTakeoff,
  train: Train, Train, directions_bus: Bus, Bus, key: Key, 'Car Rental': Key,
  directions_car: Car, 'Personal Car': Car, directions_boat: Boat, Cruise: Boat, Ferry: Boat,
  hotel: Buildings, Hotel: Buildings, apartment: Buildings, Apartment: Buildings,
  spa: Sparkle, Resort: Sparkle, home_work: House, Airbnb: House,
  restaurant: ForkKnife, tour: Compass, local_activity: Ticket, nights_stay: Moon,
  pin_drop: MapPin, place: MapPin, fmd_good: MapPin, schedule: Clock,
};

export const TripIcon: React.FC<{ name: string; className?: string }> = ({ name, className = 'w-5 h-5' }) => {
  const Icon = ICONS[name] || Ticket;
  return <Icon className={className} weight="duotone" />;
};

export const formatTime = (time24?: string): string => {
  if (!time24) return '';
  const [h, m] = time24.split(':');
  const hour = parseInt(h);
  if (isNaN(hour)) return time24;
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
};

export const transportIconName = (mode: TransportMode): string => {
  switch (mode) {
    case 'Train': return 'train';
    case 'Bus': return 'directions_bus';
    case 'Car Rental': return 'key';
    case 'Personal Car': return 'directions_car';
    case 'Cruise': case 'Ferry': return 'directions_boat';
    default: return 'flight_takeoff';
  }
};

export const calculateDuration = (t: Transport): string => {
  if (t.duration) return `${Math.floor(t.duration / 60)}h ${Math.round(t.duration % 60)}m`;
  if (!t.departureTime || !t.arrivalTime) return '';
  const [dh, dm] = t.departureTime.split(':').map(Number);
  const [ah, am] = t.arrivalTime.split(':').map(Number);
  let diff = (ah * 60 + am) - (dh * 60 + dm);
  if (diff < 0) diff += 24 * 60;
  if (t.departureDate && t.arrivalDate) {
    const start = new Date(`${t.departureDate}T${t.departureTime}`);
    const end = new Date(`${t.arrivalDate}T${t.arrivalTime}`);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) diff = (end.getTime() - start.getTime()) / 60000;
  }
  return `${Math.floor(diff / 60)}h ${Math.round(diff % 60)}m`;
};

export const calculateNights = (start: string, end: string): number => {
  const d1 = new Date(start);
  const d2 = new Date(end);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  return Math.ceil((d2.getTime() - d1.getTime()) / 86_400_000);
};

export const compareTransports = (a: Transport, b: Transport): number => {
  const dateA = a.departureDate || '1970-01-01';
  const dateB = b.departureDate || '1970-01-01';
  if (dateA !== dateB) return dateA.localeCompare(dateB);
  return (a.departureTime || '00:00').localeCompare(b.departureTime || '00:00');
};

export const getTripDates = (trip: Trip): string[] => {
  if (!trip.startDate || !trip.endDate) return [];
  const dates: string[] = [];
  try {
    const s = trip.startDate.split('-').map(Number);
    const e = trip.endDate.split('-').map(Number);
    if (s.length === 3 && e.length === 3) {
      const curr = new Date(Date.UTC(s[0], s[1] - 1, s[2]));
      const last = new Date(Date.UTC(e[0], e[1] - 1, e[2]));
      if (!isNaN(curr.getTime()) && !isNaN(last.getTime())) {
        while (curr <= last) {
          dates.push(curr.toISOString().split('T')[0]);
          curr.setUTCDate(curr.getUTCDate() + 1);
        }
      }
    }
  } catch {
    return trip.startDate ? [trip.startDate] : [];
  }
  return dates.length > 0 ? dates : [trip.startDate];
};

/** Local calendar day as YYYY-MM-DD. */
export const todayString = (): string => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

export type DayItemKind = 'Transport' | 'Accommodation' | 'Activity' | 'Reservation' | 'Tour';

export interface DayItem {
  id: string;
  type: DayItemKind;
  time: string;
  title: string;
  location?: string;
  cost?: number;
  icon: string;
  ref: Transport | Accommodation | Activity;
  meta?: string;
  isDropoff?: boolean;
  isCheckOut?: boolean;
  isOvernight?: boolean;
}

/** Everything happening on one day: transports, stay check-in/out/overnight and activities, by time. */
export const getDayItems = (trip: Trip, dateStr: string): DayItem[] => {
  const items: DayItem[] = [];
  getTransportScheduleEventsForDate(trip.transports, dateStr).forEach(t => {
    const dur = !t.isDropoff ? calculateDuration(t) : '';
    const dist = t.distance ? `${t.distance} km` : '';
    items.push({
      id: t.id + (t.isDropoff ? '_drop' : ''),
      type: 'Transport',
      time: t.isDropoff ? t.arrivalTime || '00:00' : t.departureTime || '00:00',
      title: getTransportScheduleTitle(t, t.isDropoff),
      location: getTransportScheduleLocation(t, t.isDropoff),
      cost: (t.cost || 0) > 0 ? t.cost : undefined,
      icon: transportIconName(t.mode),
      ref: t,
      meta: !t.isDropoff ? `${dur}${dist ? ` • ${dist}` : ''}` : 'Arrival',
      isDropoff: t.isDropoff,
    });
  });
  trip.accommodations?.forEach(a => {
    if (a.checkInDate === dateStr) {
      const nights = calculateNights(a.checkInDate, a.checkOutDate);
      items.push({ id: a.id + '_checkin', type: 'Accommodation', time: a.checkInTime || '15:00', title: `${a.name} (Check-in)`, location: a.address, cost: a.cost, icon: 'hotel', ref: a, meta: `${nights} night${nights > 1 ? 's' : ''}` });
    }
    if (a.checkOutDate === dateStr) {
      items.push({ id: a.id + '_checkout', type: 'Accommodation', time: a.checkOutTime || '11:00', title: `${a.name} (Check-out)`, location: a.address, icon: 'hotel', ref: a, isCheckOut: true });
    }
    if (dateStr > a.checkInDate && dateStr < a.checkOutDate) {
      items.push({ id: a.id + '_overnight', type: 'Accommodation', time: '08:00', title: `${a.name} (Overnight stay)`, location: a.address, icon: 'hotel', ref: a, isOvernight: true });
    }
  });
  trip.activities?.forEach(a => {
    if (a.date === dateStr) {
      items.push({
        id: a.id, type: (a.type as DayItemKind) || 'Activity', time: a.time || '12:00', title: a.title, location: a.location, cost: a.cost,
        icon: a.type === 'Reservation' ? 'restaurant' : a.type === 'Tour' ? 'tour' : 'local_activity', ref: a, meta: a.description,
      });
    }
  });
  return items.sort((a, b) => {
    const diff = (a.time || '23:59').localeCompare(b.time || '23:59');
    if (diff !== 0) return diff;
    if (a.isDropoff !== b.isDropoff) return a.isDropoff ? 1 : -1;
    return 0;
  });
};

/** Flat colour per kind of plan item (colour carries meaning). */
export const KIND_STYLE: Record<DayItemKind, string> = {
  Transport: 'bg-sunset-teal text-sunset-ink',
  Accommodation: 'bg-sunset-lilac text-sunset-ink',
  Activity: 'bg-sunset-sun text-sunset-ink',
  Tour: 'bg-sunset-sun text-sunset-ink',
  Reservation: 'bg-sunset-orange text-white',
};

export const weatherDescription = (code: number): string => {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Foggy';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code === 56 || code === 57) return 'Freezing drizzle';
  if (code >= 61 && code <= 65) return 'Rainy';
  if (code === 66 || code === 67) return 'Freezing rain';
  if (code >= 71 && code <= 75) return 'Snowy';
  if (code === 77) return 'Snow grains';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code === 85 || code === 86) return 'Snow showers';
  if (code === 95) return 'Thunderstorm';
  if (code === 96 || code === 99) return 'Thunderstorm with hail';
  return 'Cloudy';
};

export const weatherIconName = (code: number | undefined): string => {
  if (code === undefined) return 'cloud';
  if (code <= 1) return 'wb_sunny';
  if (code <= 3) return 'partly_cloudy_day';
  if (code <= 48) return 'foggy';
  if (code <= 67 || (code >= 80 && code <= 82)) return 'umbrella';
  if (code <= 77 || (code >= 85 && code <= 86)) return 'ac_unit';
  if (code <= 99) return 'thunderstorm';
  return 'cloud';
};

/** Current weather for the trip destination (Open-Meteo, 3s timeout, silent on failure). */
export const useTripWeather = (trip: Trip | null) => {
  const [weather, setWeather] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const location = trip?.location;
  const coordinates = trip?.coordinates;
  useEffect(() => {
    if (!location && !coordinates) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      let lat = coordinates?.lat;
      let lng = coordinates?.lng;
      if (!lat || !lng) {
        const coords = await getCoordinates(location || '');
        if (coords) { lat = coords.lat; lng = coords.lng; }
      }
      if (lat && lng) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        try {
          const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto`,
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);
          if (res.ok) {
            const data = await res.json();
            if (!cancelled && data?.current_weather && data?.daily?.temperature_2m_max?.length) setWeather(data);
          }
        } catch {
          clearTimeout(timeoutId);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [location, coordinates]);
  return { weather, loading };
};

/** Carrier logo with the same fallback chain as the original page (Brandfetch, avs.io, Clearbit, favicon), then `fallback`. */
export const CarrierLogo: React.FC<{ provider?: string; brandfetchApiKey?: string; carriers?: Carrier[]; fallback: React.ReactNode }> = ({
  provider, brandfetchApiKey, carriers = [], fallback,
}) => {
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [provider]);
  if (!provider) return <>{fallback}</>;

  const name = provider.trim().toLowerCase();
  const match = carriers.find(c => c.code?.toLowerCase().trim() === name || c.name?.toLowerCase().trim() === name);
  const cleaned = name.replace(/[^a-z0-9]/g, '');
  const domain = match?.domain?.trim() || `${cleaned}.com`;
  const overrides: Record<string, string> = {};
  carriers.forEach(c => {
    if (c.code) overrides[c.code.toLowerCase().trim()] = c.domain;
    if (c.name) overrides[c.name.toLowerCase().trim()] = c.domain;
  });
  const steps: string[] = [];
  if (brandfetchApiKey) {
    const bf = getMerchantLogoUrl(provider.trim(), brandfetchApiKey, overrides, { type: 'icon', fallback: '404' });
    if (bf) steps.push(bf);
  }
  const iata = (match?.code || (provider.trim().length === 2 ? provider.trim() : '')).toUpperCase();
  if (iata.length === 2) steps.push(`https://pics.avs.io/200/200/${iata}.png`);
  steps.push(`https://logo.clearbit.com/${domain}`, `https://www.google.com/s2/favicons?sz=128&domain=${domain}`);

  const src = steps[attempt];
  if (!src) return <>{fallback}</>;
  return <img src={src} alt={provider} className="w-full h-full object-contain" referrerPolicy="no-referrer" onError={() => setAttempt(a => a + 1)} />;
};
