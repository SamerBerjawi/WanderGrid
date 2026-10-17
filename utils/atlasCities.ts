import type { Trip, VisitedItem } from '../types';
import { cleanCityName, formatPlaceName } from '../services/geocoding';
import { mergeCityRecords, splitCombinedPlaces } from '../services/cityRegistry';

type AirportResolver = Parameters<typeof mergeCityRecords>[1] extends { resolveAirport?: infer R } | undefined ? R : never;

/** Every city the user has been to: manual records plus cities derived from trips, road trips and flights.
 *  Copied from views/TravelAtlas.tsx (allTrackedCities) so the Golden Hour Atlas shows the same numbers. */
export function buildTrackedCities(
  visitedItems: VisitedItem[],
  trips: Trip[],
  roadTrips: any[],
  flights: any[],
  resolveAirportCity: AirportResolver
): VisitedItem[] {
  const cityMap = new Map<string, VisitedItem>();

  // 1. Manually registered cities from Visited collection
  visitedItems.filter(item => item.type === 'city').forEach(item => {
    const canonicalCity = cleanCityName(item.name, item.countryCode);
    const code = (item.countryCode || 'XX').toUpperCase();
    const key = `${canonicalCity.toLowerCase()}_${code.toLowerCase()}`;
    cityMap.set(key, {
      ...item,
      name: formatPlaceName(canonicalCity),
      countryName: item.countryName ? formatPlaceName(item.countryName) : item.countryName
    });
  });

  // 2. Cities from active/completed trips
  const pastTrips = trips.filter(t => t.status !== 'Planning' && t.status !== 'Cancelled');
  pastTrips.forEach(t => {
    const tripPlaces = t.location ? splitCombinedPlaces(t.location) : [];
    tripPlaces.forEach(place => {
      const single = tripPlaces.length === 1;
      const canonicalCity = cleanCityName(place, t.coordinates?.countryCode);
      const code = (t.coordinates?.countryCode || 'XX').toUpperCase();
      const key = `${canonicalCity.toLowerCase()}_${code.toLowerCase()}`;
      if (!cityMap.has(key)) {
        cityMap.set(key, {
          id: `trip_city_${key}`,
          type: 'city',
          code: code,
          name: formatPlaceName(canonicalCity),
          countryCode: code,
          countryName: t.coordinates?.country ? formatPlaceName(t.coordinates.country) : 'Imported',
          visitDate: t.endDate || t.startDate,
          lat: single ? t.coordinates?.lat : undefined,
          lng: single ? t.coordinates?.lng : undefined,
          notes: `Trip: ${t.name || t.location}`,
          isManual: false
        });
      }
    });

    // Waypoints inside Route Manager
    t.locations?.forEach(l => {
      if (l.name) {
        const canonicalCity = cleanCityName(l.name);
        const key = `${canonicalCity.toLowerCase()}_xx`;
        if (!cityMap.has(key)) {
          cityMap.set(key, {
            id: `trip_loc_${l.id || key}`,
            type: 'city',
            code: 'XX',
            name: formatPlaceName(canonicalCity),
            countryCode: 'XX',
            countryName: 'Trip Stop',
            visitDate: t.endDate,
            lat: l.coordinates?.lat,
            lng: l.coordinates?.lng,
            notes: `Stop in ${t.name}`,
            isManual: false
          });
        }
      }
    });

    // Pit Stops & Waypoints inside Transports (Road trips, Car rentals, Personal vehicles)
    t.transports?.forEach(tr => {
      tr.waypoints?.forEach(wp => {
        if (wp.name) {
          const canonicalCity = cleanCityName(wp.name);
          const key = `${canonicalCity.toLowerCase()}_xx`;
          if (!cityMap.has(key)) {
            cityMap.set(key, {
              id: `transport_wp_${wp.id || key}`,
              type: 'city',
              code: 'XX',
              name: formatPlaceName(canonicalCity),
              countryCode: 'XX',
              countryName: 'Road Trip Pit Stop',
              visitDate: wp.visitDate || tr.departureDate || t.startDate,
              lat: wp.coordinates?.lat,
              lng: wp.coordinates?.lng,
              notes: `Pit stop on ${tr.provider || tr.mode || 'road trip'}: ${tr.origin} → ${tr.destination}`,
              isManual: false
            });
          }
        }
      });
    });
  });

  // 3. Cities from land/road trips
  roadTrips.filter(r => r.status !== 'Cancelled').forEach(r => {
    if (r.origin) {
      const canonicalCity = cleanCityName(r.origin, r.countryCode);
      const key = `${canonicalCity.toLowerCase()}_xx`;
      if (!cityMap.has(key)) {
        cityMap.set(key, {
          id: `rt_origin_${key}`,
          type: 'city',
          code: 'XX',
          name: formatPlaceName(canonicalCity),
          countryCode: 'XX',
          countryName: 'Road Trip Origin',
          visitDate: r.departureDate || r.date,
          lat: r.originLat || r.lat,
          lng: r.originLng || r.lng,
          notes: `Road trip: ${r.name || r.origin}`,
          isManual: false
        });
      }
    }
    if (r.destination) {
      const canonicalCity = cleanCityName(r.destination, r.countryCode);
      const key = `${canonicalCity.toLowerCase()}_xx`;
      if (!cityMap.has(key)) {
        cityMap.set(key, {
          id: `rt_dest_${key}`,
          type: 'city',
          code: 'XX',
          name: formatPlaceName(canonicalCity),
          countryCode: 'XX',
          countryName: 'Road Trip Dest',
          visitDate: r.arrivalDate || r.date,
          lat: r.destLat || r.lat,
          lng: r.destLng || r.lng,
          notes: `Road trip: ${r.name || r.destination}`,
          isManual: false
        });
      }
    }
    // Waypoints and Pit Stops inside Road Trips
    r.waypoints?.forEach(wp => {
      if (wp.name) {
        const canonicalCity = cleanCityName(wp.name);
        const key = `${canonicalCity.toLowerCase()}_xx`;
        if (!cityMap.has(key)) {
          cityMap.set(key, {
            id: `rt_wp_${wp.id || key}`,
            type: 'city',
            code: 'XX',
            name: formatPlaceName(canonicalCity),
            countryCode: 'XX',
            countryName: 'Road Trip Pit Stop',
            visitDate: wp.visitDate || r.departureDate || r.date,
            lat: wp.coordinates?.lat,
            lng: wp.coordinates?.lng,
            notes: `Pit stop on road trip: ${r.origin} → ${r.destination}`,
            isManual: false
          });
        }
      }
    });
  });

  // 4. Cities from flights
  flights.filter(f => f.status !== 'Cancelled').forEach(f => {
    if (f.destCity || f.destination) {
      const canonicalCity = cleanCityName(f.destCity || f.destination, f.destCountryCode);
      const code = (f.destCountryCode || 'XX').toUpperCase();
      const key = `${canonicalCity.toLowerCase()}_${code.toLowerCase()}`;
      if (!cityMap.has(key)) {
        cityMap.set(key, {
          id: `flight_city_${key}`,
          type: 'city',
          code: code,
          name: formatPlaceName(canonicalCity),
          countryCode: code,
          countryName: f.destCountry ? formatPlaceName(f.destCountry) : 'Flight Arrival',
          visitDate: f.arrivalDate || f.date,
          lat: f.destLat,
          lng: f.destLng,
          notes: `Flight to ${f.destination || canonicalCity}`,
          isManual: false
        });
      }
    }
  });

  // The sources above describe the same place differently (country known/unknown, airport code, casing).
  return mergeCityRecords(Array.from(cityMap.values()), { resolveAirport: resolveAirportCity });
}
