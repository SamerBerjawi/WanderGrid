import React, { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { Card, Button } from '../components/ui';
const ExpeditionMap = lazy(() => import('../components/ExpeditionMap').then(m => ({ default: m.ExpeditionMap })));
const ExpeditionMap3D = lazy(() => import('../components/ExpeditionMap3D').then(m => ({ default: m.ExpeditionMap3D })));
import { FlightTrackerModal } from '../components/FlightTrackerModal';
import { dataService } from '../services/mockDb';
import { User, Trip, EntitlementType, PublicHoliday } from '../types';
import { resolvePlaceName, calculateDistance, getCoordinates, getCoordinatesSync, refineUKCountry } from '../services/geocoding';
import { getRegion, getFlagEmoji } from '../services/geoData';
import { REGION_STYLES } from './regionStyles';
import { getTripsVersion, serializeVisitedData, deserializeVisitedData, runAfterFirstPaint, mapWithConcurrency } from '../services/utils';
import { StatCard, ExtremeFlightCard, DonutChart, TopList, ExtremeFlight, FlightTrendChart, FlightTrendPoint } from '../components/DashboardWidgets';
import { PassportStamp, VisitedCountry } from '../components/PassportStamp';
import { StampFlipBook } from '../components/StampFlipBook';
import { StickerStamp } from '../components/StickerStamp';
import { AchievementMilestones } from '../components/AchievementMilestones';
import { ICONIC_STICKERS, loadStickersProgress, StickerClaim, STICKER_CATEGORIES } from '../utils/stickersData';
import { motion, AnimatePresence } from 'motion/react';
import { Globe, Plane, Award, Compass, Search, MapPin, Calendar, CheckCircle, Shield, Briefcase, ChevronRight, TrendingUp } from 'lucide-react';

interface DashboardProps {
    onUserClick?: (userId: string) => void;
    onTripClick?: (tripId: string) => void;
}

const LEVEL_THRESHOLDS = [
    { level: 1, name: 'Backyard Explorer', countries: 0 },
    { level: 5, name: 'Wanderer', countries: 2 },
    { level: 10, name: 'Voyager', countries: 5 },
    { level: 20, name: 'Globetrotter', countries: 10 },
    { level: 30, name: 'Nomad', countries: 20 },
    { level: 50, name: 'Citizen of the World', countries: 30 },
];

const DASHBOARD_CACHE_KEY = 'wandergrid_dashboard_cache_v1';
const GEO_CONCURRENCY_LIMIT = 6;
const COORD_CACHE_KEY = 'wandergrid_coord_cache';
let coordCacheInstance: Map<string, { lat: number, lng: number }> | null = null;

const getCoordCache = () => {
    if (coordCacheInstance) return coordCacheInstance;
    try {
        const stored = localStorage.getItem(COORD_CACHE_KEY);
        coordCacheInstance = stored ? new Map(JSON.parse(stored)) : new Map();
    } catch {
        coordCacheInstance = new Map();
    }
    return coordCacheInstance!;
};

const saveCoordCache = (cache: Map<string, { lat: number, lng: number }>) => {
    try {
        localStorage.setItem(COORD_CACHE_KEY, JSON.stringify(Array.from(cache.entries())));
    } catch (e) {
        console.warn("Failed to save coord cache", e);
    }
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { 
    opacity: 1, 
    y: 0, 
    transition: { type: "spring", stiffness: 300, damping: 25 } 
  }
};

export const Dashboard: React.FC<DashboardProps> = ({ onUserClick, onTripClick }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [visitedData, setVisitedData] = useState<VisitedCountry[]>([]);
  const [totalCities, setTotalCities] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [activeStatsTab, setActiveStatsTab] = useState('stamps');

  // Interactive Stamps Filter States
  const [stampSearch, setStampSearch] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('All');

  // Gamification & Stickers Integrated States
  const [stickerSearch, setStickerSearch] = useState('');
  const [selectedStickerCategory, setSelectedStickerCategory] = useState('All');

  // Computed Past Trips, Sticker Claims and Stats
  const pastTrips = useMemo(() => {
    return trips.filter(t => t.status !== 'Planning' && t.status !== 'Cancelled');
  }, [trips]);

  const stickerClaims = useMemo(() => {
    return loadStickersProgress(trips).claimsMap;
  }, [trips]);

  const stickerStats = useMemo(() => {
    const totalCount = ICONIC_STICKERS.length;
    const unlockedCount = Array.from(stickerClaims.values()).length;
    const percent = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;
    
    // Category specific breakdowns
    const categoryBreakdowns = STICKER_CATEGORIES.map(cat => {
        const catStickers = ICONIC_STICKERS.filter(s => s.category === cat);
        const catTotal = catStickers.length;
        const catUnlocked = catStickers.filter(s => stickerClaims.has(s.id)).length;
        const catPercent = catTotal > 0 ? Math.round((catUnlocked / catTotal) * 100) : 0;
        return {
            category: cat,
            total: catTotal,
            unlocked: catUnlocked,
            percent: Math.min(100, catPercent),
            isCompleted: catTotal > 0 && catUnlocked === catTotal
        };
    });

    // Collector Ranks based on total unlocked percentage
    let rank = 'Backyard Explorer';
    let nextRank = 'Novice Surveyor';
    let rankDesc = 'You have just started finding stickers around the globe!';
    if (percent >= 15) {
        rank = 'Novice Surveyor';
        nextRank = 'Experienced Cartographer';
        rankDesc = 'You are mapping your footprint across notable historic regions.';
    }
    if (percent >= 40) {
        rank = 'Experienced Cartographer';
        nextRank = 'Elite Trailblazer';
        rankDesc = 'Your travels capture majestic peaks and natural wonders alike.';
    }
    if (percent >= 70) {
        rank = 'Elite Trailblazer';
        nextRank = 'Legendary World Voyager';
        rankDesc = 'An exceptional portfolio of historic claims and extreme alpine peaks!';
    }
    if (percent === 100) {
        rank = 'Legendary World Voyager';
        nextRank = 'Ultimate Completionist';
        rankDesc = 'You have stood before every historic wonder, park, and high summit on Earth.';
    }

    return {
        totalCount,
        unlockedCount,
        percent,
        rank,
        nextRank,
        rankDesc,
        categoryBreakdowns
    };
  }, [stickerClaims]);

  const [isFlightTrackerOpen, setIsFlightTrackerOpen] = useState(false);
  const [todaysFlight, setTodaysFlight] = useState<{ iata: string; origin: string; destination: string; date: string } | undefined>(undefined);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [mapViewMode, setMapViewMode] = useState<'3d' | '2d'>(() => {
    return (localStorage.getItem('wandergrid_map_view_mode') as '3d' | '2d') || '3d';
  });
  const [globalGradientRoutes, setGlobalGradientRoutes] = useState(() => {
    return localStorage.getItem('wandergrid_gradient_routes') !== 'false';
  });

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    // Current user loading for profile details
    const sessionUser = localStorage.getItem('wandergrid_session_user');
    if (sessionUser) {
        try {
            setCurrentUser(JSON.parse(sessionUser));
        } catch (e) {}
    }

    // Gentle clock ticking for header
    const timer = setInterval(() => setCurrentTime(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    refreshData();
  }, []);

  useEffect(() => {
    const handleDbUpdate = () => {
      refreshData();
    };
    window.addEventListener('wandergrid_db_updated', handleDbUpdate);
    return () => {
      window.removeEventListener('wandergrid_db_updated', handleDbUpdate);
    };
  }, []);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const activeTrip = trips.find(t => t.status !== 'Cancelled' && t.startDate <= today && t.endDate >= today);
    if (activeTrip?.transports) {
        const flight = activeTrip.transports
          .filter(t => t.mode === 'Flight' && t.departureDate === today)
          .sort((a,b) => (a.departureTime || '00:00').localeCompare(b.departureTime || '00:00'))[0];
        if (flight) {
            const iata = flight.providerCode && flight.identifier ? `${flight.providerCode}${flight.identifier}` : flight.identifier;
            if (iata) setTodaysFlight({ iata, origin: flight.origin, destination: flight.destination, date: today });
        }
    }
  }, [trips]);

  const refreshData = () => {
    Promise.all([
      dataService.getUsers(),
      dataService.getTrips(),
      dataService.getSavedConfigs(),
      dataService.getEntitlementTypes(),
      dataService.getFlights(),
      dataService.getVisited()
    ]).then(async ([u, t, configs, ents, flights, visited]) => {
      setUsers(u);
      setHolidays(configs.flatMap(c => c.holidays.map(h => ({ ...h, configId: c.id }))));
      setEntitlements(ents);

      const coordCache = getCoordCache();

      const getLocalCoordsSync = (place: string) => {
          if (!place) return null;
          const clean = place.trim();
          const uppercaseLoc = clean.toUpperCase();
          const cached = coordCache.get(clean) || coordCache.get(uppercaseLoc);
          if (cached) return { lat: cached.lat, lng: cached.lng };
          const syncRes = getCoordinatesSync(clean);
          if (syncRes) {
              coordCache.set(clean, { lat: syncRes.lat, lng: syncRes.lng });
              return { lat: syncRes.lat, lng: syncRes.lng };
          }
          return null;
      };

      const processTransportsSync = (transports: any[]) => {
          return (transports || []).map(tr => {
              const enriched = { ...tr };
              if (enriched.origin && (!enriched.originLat || !enriched.originLng)) {
                  const c = getLocalCoordsSync(enriched.origin);
                  if (c) { enriched.originLat = c.lat; enriched.originLng = c.lng; }
              }
              if (enriched.destination && (!enriched.destLat || !enriched.destLng)) {
                  const c = getLocalCoordsSync(enriched.destination);
                  if (c) { enriched.destLat = c.lat; enriched.destLng = c.lng; }
              }
              return enriched;
          });
      };

      const makeSyntheticTrips = (flightsList: any[]) => {
          const unassignedFlights = (flightsList || []).filter(f => !f.tripId || f.tripId === 'unassigned');
          return unassignedFlights.map((flight) => {
              const date = flight.departureDate || '';
              const todayStr = new Date().toISOString().split('T')[0];
              const isPast = date < todayStr;

              return {
                  id: `independent-flight-${flight.id}`,
                  name: `Independent: ${flight.provider} ${flight.identifier || 'Flight'}`,
                  location: `${flight.origin} ➔ ${flight.destination}`,
                  startDate: date,
                  endDate: flight.arrivalDate || date,
                  status: (isPast ? 'Past' : 'Upcoming') as 'Past' | 'Upcoming',
                  participants: [],
                  transports: [{
                      ...flight,
                      mode: flight.mode || 'Flight'
                  }],
                  privacy: 'Public' as const,
              };
          });
      };

      const flightsByTripIdMap = new Map<string, any[]>();
      (flights || []).forEach(f => {
          const tId = f.tripId;
          if (tId && tId !== 'unassigned') {
              if (!flightsByTripIdMap.has(tId)) {
                  flightsByTripIdMap.set(tId, []);
              }
              flightsByTripIdMap.get(tId)!.push(f);
          }
      });

      // Create instant visual set (fast sync lookup)
      const initialTrips = (t || []).map(trip => {
          const assignedFlights = flightsByTripIdMap.get(trip.id) || [];
          const existingTransports = trip.transports || [];
          const mergedTransports = [...existingTransports];
          
          assignedFlights.forEach(af => {
              const isDup = existingTransports.some(et => 
                  (et.id && et.id === af.id) || 
                  (et.identifier === af.identifier && et.departureDate === af.departureDate && et.origin === af.origin)
              );
              if (!isDup) {
                  mergedTransports.push(af);
              }
          });

          return {
              ...trip,
              transports: processTransportsSync(mergedTransports)
          };
      });
      const initialFlights = processTransportsSync(flights || []);
      const combinedState = [...initialTrips, ...makeSyntheticTrips(initialFlights)];
      setTrips(combinedState);

      const activeTrips = combinedState.filter(trip => trip.status !== 'Planning' && trip.status !== 'Cancelled');
      const tripsVersion = getTripsVersion(activeTrips);
      const visitedSignature = (visited || [])
          .map((v: any) => `${v.id}-${v.isTransit === true}-${v.visitDate || ''}`)
          .sort()
          .join(',');
      const version = `${tripsVersion}_${visitedSignature}`;
      const cachedRaw = localStorage.getItem(DASHBOARD_CACHE_KEY);
      
      if (cachedRaw) {
          try {
              const cached = JSON.parse(cachedRaw);
              if (cached.version === version) {
                  setVisitedData(deserializeVisitedData(cached.visitedData));
                  setTotalCities(cached.totalCities);
                  setTotalDistance(cached.totalDistance);
                  setLoading(false);
                  
                  // Run background geocoding in case anything is missing
                  runAfterFirstPaint(async () => {
                      let coordsDirty = false;
                      const resolveCoordsAsync = async (locName: string) => {
                          if (!locName) return null;
                          let c = coordCache.get(locName);
                          if (!c) {
                              const res = await getCoordinates(locName);
                              if (res) {
                                  c = { lat: res.lat, lng: res.lng };
                                  coordCache.set(locName, c);
                                  coordsDirty = true;
                              }
                          }
                          return c;
                      };

                      let updated = false;
                      for (const trip of combinedState) {
                          if (trip.transports) {
                              for (const tr of trip.transports) {
                                  if (tr.origin && (!tr.originLat || !tr.originLng)) {
                                      const c = await resolveCoordsAsync(tr.origin);
                                      if (c) { tr.originLat = c.lat; tr.originLng = c.lng; updated = true; }
                                  }
                                  if (tr.destination && (!tr.destLat || !tr.destLng)) {
                                      const c = await resolveCoordsAsync(tr.destination);
                                      if (c) { tr.destLat = c.lat; tr.destLng = c.lng; updated = true; }
                                  }
                              }
                          }
                      }

                      if (coordsDirty) {
                          saveCoordCache(coordCache);
                      }
                      if (updated) {
                          setTrips([...combinedState]);
                      }
                  });
                  return;
              }
          } catch (e) {}
      }

      setLoading(false);
      runAfterFirstPaint(async () => {
          let coordsDirty = false;

          const resolveCoordsAsync = async (locName: string) => {
              if (!locName) return null;
              let c = coordCache.get(locName);
              if (!c) {
                  const res = await getCoordinates(locName);
                  if (res) {
                      c = { lat: res.lat, lng: res.lng };
                      coordCache.set(locName, c);
                      coordsDirty = true;
                  }
              }
              return c;
          };

          const asyncEnrichedFlights = await mapWithConcurrency(flights || [], async (f) => {
              const enriched = { ...f };
              if (enriched.origin && (!enriched.originLat || !enriched.originLng)) {
                  const c = await resolveCoordsAsync(enriched.origin);
                  if (c) { enriched.originLat = c.lat; enriched.originLng = c.lng; }
              }
              if (enriched.destination && (!enriched.destLat || !enriched.destLng)) {
                  const c = await resolveCoordsAsync(enriched.destination);
                  if (c) { enriched.destLat = c.lat; enriched.destLng = c.lng; }
              }
              return enriched;
          }, GEO_CONCURRENCY_LIMIT);

          const asyncEnrichedTrips = await mapWithConcurrency(t || [], async (trip) => {
              if (!trip.transports) return trip;
              const enrichedTransports = await mapWithConcurrency(trip.transports, async (tr) => {
                  const enriched = { ...tr };
                  if (enriched.origin && (!enriched.originLat || !enriched.originLng)) {
                      const c = await resolveCoordsAsync(enriched.origin);
                      if (c) { enriched.originLat = c.lat; enriched.originLng = c.lng; }
                  }
                  if (enriched.destination && (!enriched.destLat || !enriched.destLng)) {
                      const c = await resolveCoordsAsync(enriched.destination);
                      if (c) { enriched.destLat = c.lat; enriched.destLng = c.lng; }
                  }
                  return enriched;
              }, GEO_CONCURRENCY_LIMIT);
              return { ...trip, transports: enrichedTransports };
          }, GEO_CONCURRENCY_LIMIT);

          if (coordsDirty) {
              saveCoordCache(coordCache);
          }

          const enrichedFlightsByTripId = new Map<string, any[]>();
          (asyncEnrichedFlights || []).forEach(f => {
              const tId = f.tripId;
              if (tId && tId !== 'unassigned') {
                  if (!enrichedFlightsByTripId.has(tId)) {
                      enrichedFlightsByTripId.set(tId, []);
                  }
                  enrichedFlightsByTripId.get(tId)!.push(f);
              }
          });

          const asyncEnrichedTripsMerged = asyncEnrichedTrips.map(trip => {
              const assignedFlights = enrichedFlightsByTripId.get(trip.id) || [];
              const existingTransports = trip.transports || [];
              const mergedTransports = [...existingTransports];
              
              assignedFlights.forEach(af => {
                  const isDup = existingTransports.some(et => 
                      (et.id && et.id === af.id) || 
                      (et.identifier === af.identifier && et.departureDate === af.departureDate && et.origin === af.origin)
                  );
                  if (!isDup) {
                      mergedTransports.push(af);
                  }
              });

              return {
                  ...trip,
                  transports: mergedTransports
              };
          });

          const finalCombined = [...asyncEnrichedTripsMerged, ...makeSyntheticTrips(asyncEnrichedFlights)];
          setTrips(finalCombined);

          const activeTripsFinal = finalCombined.filter(trip => trip.status !== 'Planning' && trip.status !== 'Cancelled');
          const finalTripsVersion = getTripsVersion(activeTripsFinal);
          const finalVisitedSignature = (visited || [])
              .map((v: any) => `${v.id}-${v.isTransit === true}-${v.visitDate || ''}`)
              .sort()
              .join(',');
          const finalVersion = `${finalTripsVersion}_${finalVisitedSignature}`;
          const processed = await processTravelHistory(activeTripsFinal);
          localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({
              version: finalVersion,
              totalCities: processed.totalCities,
              totalDistance: processed.totalDistance,
              visitedData: serializeVisitedData(processed.visitedData)
          }));
      });
    }).catch(err => {
      console.error("Failed to load dashboard metrics:", err);
      setLoading(false);
    });
  };

  const processTravelHistory = async (tripList: Trip[]) => {
        let kmCount = 0;
        tripList.forEach(trip => {
            if (trip.transports) {
                trip.transports.forEach(t => {
                    kmCount += t.distance || (t.originLat && t.originLng && t.destLat && t.destLng ? calculateDistance(t.originLat, t.originLng, t.destLat, t.destLng) : 0);
                });
            }
        });
        const totalDistance = Math.round(kmCount);

        try {
            const dbVisited = await dataService.getVisited();
            const hasSeededBefore = localStorage.getItem('wandergrid_visited_seeded') === 'true';
            if (dbVisited && (dbVisited.length > 0 || hasSeededBefore)) {
                // Read from database. Filter out transits!
                const countries = dbVisited.filter(item => item.type === 'country' && !item.isTransit);
                const cities = dbVisited.filter(item => item.type === 'city');

                const visitedDataList: VisitedCountry[] = [];
                countries.forEach(item => {
                    const countryId = item.code.toUpperCase();
                    const associatedCities = cities
                        .filter(ci => ci.countryCode?.toUpperCase() === countryId || (countryId === 'GB' && ['GB-ENG','GB-SCT','GB-WLS','GB-NIR'].includes(ci.countryCode?.toUpperCase() || '')))
                        .map(ci => ci.name);

                    if (countryId === 'GB' || countryId === 'UK') {
                        const subNationBuckets: Record<string, { name: string, cities: string[] }> = {
                            'GB-ENG': { name: 'England', cities: [] },
                            'GB-SCT': { name: 'Scotland', cities: [] },
                            'GB-WLS': { name: 'Wales', cities: [] },
                            'GB-NIR': { name: 'Northern Ireland', cities: [] }
                        };

                        associatedCities.forEach(city => {
                            const refined = refineUKCountry(city, 'United Kingdom');
                            const refCode = refined.countryCode || 'GB-ENG';
                            if (subNationBuckets[refCode]) {
                                subNationBuckets[refCode].cities.push(city);
                            }
                        });

                        let addedAny = false;
                        Object.entries(subNationBuckets).forEach(([code, snData]) => {
                            if (snData.cities.length > 0) {
                                visitedDataList.push({
                                    code,
                                    name: snData.name,
                                    cities: new Set(snData.cities),
                                    flag: getFlagEmoji(code),
                                    tripCount: tripList.filter(t => t.location && t.location.toLowerCase().includes(snData.name.toLowerCase())).length || 1,
                                    lastVisit: item.visitDate ? new Date(item.visitDate) : new Date(),
                                    region: getRegion(code)
                                });
                                addedAny = true;
                            }
                        });

                        if (!addedAny) {
                            visitedDataList.push({
                                code: 'GB-ENG',
                                name: 'England',
                                cities: new Set(associatedCities),
                                flag: getFlagEmoji('GB-ENG'),
                                tripCount: 1,
                                lastVisit: item.visitDate ? new Date(item.visitDate) : new Date(),
                                region: getRegion('GB-ENG')
                            });
                        }
                    } else if (['GB-ENG','GB-SCT','GB-WLS','GB-NIR'].includes(countryId)) {
                        visitedDataList.push({
                            code: countryId,
                            name: item.name,
                            cities: new Set(associatedCities),
                            flag: getFlagEmoji(countryId),
                            tripCount: tripList.filter(t => t.location && t.location.toLowerCase().includes(item.name.toLowerCase())).length || 1,
                            lastVisit: item.visitDate ? new Date(item.visitDate) : new Date(),
                            region: getRegion(countryId)
                        });
                    } else {
                        visitedDataList.push({
                            code: countryId,
                            name: item.name,
                            cities: new Set(associatedCities),
                            flag: getFlagEmoji(countryId),
                            tripCount: tripList.filter(t => t.location && t.location.toLowerCase().includes(item.name.toLowerCase())).length || 1,
                            lastVisit: item.visitDate ? new Date(item.visitDate) : new Date(),
                            region: getRegion(countryId)
                        });
                    }
                });

                const visitedData = visitedDataList.sort((a,b) => a.name.localeCompare(b.name));

                let totalC = 0;
                visitedData.forEach(val => { totalC += (val.cities as Set<string>).size; });

                setTotalCities(totalC);
                setTotalDistance(totalDistance);
                setVisitedData(visitedData);
                return { totalCities: totalC, totalDistance, visitedData };
            }
        } catch (dbErr) {
            console.warn("Could not fetch from database, using fallback computation:", dbErr);
        }

        // --- Schema Seed Fallback ---
        const countryMap = new Map<string, VisitedCountry>();
        const placesToResolve = new Set<string>();

        tripList.forEach(trip => {
            if (trip.transports) {
                trip.transports.forEach(t => {
                    if (t.destination) placesToResolve.add(t.destination);
                    if (t.origin) placesToResolve.add(t.origin);
                });
            }
            if (trip.location && !['Time Off', 'Remote', 'Trip', 'Vacation'].includes(trip.location)) placesToResolve.add(trip.location);
            trip.accommodations?.forEach(a => { if (a.address) placesToResolve.add(a.address); });
            trip.locations?.forEach(l => { if (l.name) placesToResolve.add(l.name); });
        });

        // Optimized batch resolution
        const uniquePlaces = Array.from(placesToResolve).filter(Boolean);
        const resolvedResults = await mapWithConcurrency(uniquePlaces, resolvePlaceName, GEO_CONCURRENCY_LIMIT);
        const resolvedData = new Map<string, any>();
        uniquePlaces.forEach((p, i) => { if (resolvedResults[i]) resolvedData.set(p, resolvedResults[i]); });

        tripList.forEach(trip => {
            const tripPlaces = new Set<string>();
            if (trip.location && !['Time Off', 'Remote', 'Trip', 'Vacation'].includes(trip.location)) tripPlaces.add(trip.location);
            trip.accommodations?.forEach(a => { if (a.address) tripPlaces.add(a.address); });
            trip.transports?.forEach(t => {
                if (t.destination) tripPlaces.add(t.destination);
                if (t.origin) tripPlaces.add(t.origin);
            }); 
            trip.locations?.forEach(l => { if (l.name) tripPlaces.add(l.name); });

            const countriesInThisTrip = new Set<string>();

            tripPlaces.forEach(place => {
                const resolved = resolvedData.get(place);
                if (resolved?.country && resolved.country !== 'Unknown') {
                    const countryKey = resolved.countryCode?.toUpperCase() || resolved.country;
                    countriesInThisTrip.add(countryKey);

                    if (!countryMap.has(countryKey)) {
                        countryMap.set(countryKey, { 
                            code: resolved.countryCode?.toUpperCase() || 'XX', 
                            name: resolved.country, 
                            cities: new Set(), 
                            flag: resolved.countryCode ? getFlagEmoji(resolved.countryCode) : '🏳️', 
                            tripCount: 0, 
                            lastVisit: new Date(trip.endDate), 
                            region: getRegion(resolved.countryCode?.toUpperCase() || 'XX') 
                        });
                    }
                    const entry = countryMap.get(countryKey)!;
                    if (resolved.city) entry.cities.add(resolved.city);
                    const tripEnd = new Date(trip.endDate);
                    if (tripEnd > entry.lastVisit) entry.lastVisit = tripEnd;
                }
            });

            countriesInThisTrip.forEach(countryKey => {
                const entry = countryMap.get(countryKey);
                if (entry) {
                    entry.tripCount = (entry.tripCount || 0) + 1;
                }
            });
        });

        let totalC = 0; const finalized: VisitedCountry[] = [];
        countryMap.forEach(val => { totalC += val.cities.size; finalized.push(val); });
        const visitedData = finalized.sort((a, b) => a.name.localeCompare(b.name));

        // Background write newly resolved dataset to Visited DB collection as permanent registry seed
        try {
            const bulkSeed: any[] = [];
            finalized.forEach(c => {
                bulkSeed.push({
                    id: `country_${c.code}`,
                    type: 'country',
                    code: c.code,
                    name: c.name,
                    visitDate: c.lastVisit instanceof Date ? c.lastVisit.toISOString().split('T')[0] : String(c.lastVisit),
                    isTransit: false,
                    isManual: false,
                    notes: 'Auto-seeded from travel history'
                });

                Array.from(c.cities).forEach((city: any) => {
                    bulkSeed.push({
                        id: `city_${city.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
                        type: 'city',
                        code: city,
                        name: city,
                        countryCode: c.code,
                        countryName: c.name,
                        visitDate: c.lastVisit instanceof Date ? c.lastVisit.toISOString().split('T')[0] : String(c.lastVisit),
                        isManual: false,
                        notes: 'Auto-seeded city'
                    });
                });
            });

            if (bulkSeed.length > 0) {
                void dataService.addVisitedBulk(bulkSeed);
            }
            localStorage.setItem('wandergrid_visited_seeded', 'true');
        } catch (seedErr) {
            console.error("Auto seeding of central Visited database failed:", seedErr);
        }

        setTotalCities(totalC);
        setTotalDistance(totalDistance);
        setVisitedData(visitedData);
        return { totalCities: totalC, totalDistance, visitedData };
  };

  const stats = useMemo(() => {
        const activeTrips = trips.filter(t => t.status !== 'Planning' && t.status !== 'Cancelled');
        let totalFlights = 0, totalDist = 0, totalDurationMinutes = 0;
        const airports = new Map<string, number>(), airlines = new Map<string, number>(), aircraft = new Map<string, number>(), routes = new Map<string, number>();
        const seatCounts: any = { Window: 0, Aisle: 0, Middle: 0 }, classCounts: any = { Economy: 0, Premium: 0, Business: 0, First: 0 };
        let longestFlight: ExtremeFlight | null = null, shortestFlight: ExtremeFlight | null = null;

        activeTrips.forEach(t => {
            t.transports?.forEach(tr => {
                if (tr.mode === 'Flight') {
                    totalFlights++;
                    let dist = tr.distance || (tr.originLat && tr.originLng && tr.destLat && tr.destLng ? calculateDistance(tr.originLat, tr.originLng, tr.destLat, tr.destLng) : 0);
                    totalDist += dist;
                    const flightInfo = { distance: dist, origin: tr.origin, destination: tr.destination, carrier: tr.provider, date: tr.departureDate };
                    if (!longestFlight || dist > longestFlight.distance) longestFlight = flightInfo;
                    if (!shortestFlight || (dist > 0 && dist < shortestFlight.distance)) shortestFlight = flightInfo;
                    if (tr.seatType) seatCounts[tr.seatType]++;
                    if (tr.travelClass) { const cls = tr.travelClass.toLowerCase(); if (cls.includes('economy')) classCounts['Economy']++; else if (cls.includes('premium')) classCounts['Premium']++; else if (cls.includes('business')) classCounts['Business']++; else if (cls.includes('first')) classCounts['First']++; }
                    if (tr.departureDate && tr.departureTime && tr.arrivalDate && tr.arrivalTime) { const diff = (new Date(`${tr.arrivalDate}T${tr.arrivalTime}`).getTime() - new Date(`${tr.departureDate}T${tr.departureTime}`).getTime()) / 60000; if (diff > 0) totalDurationMinutes += diff; }
                    if (tr.origin) airports.set(tr.origin, (airports.get(tr.origin) || 0) + 1);
                    if (tr.destination) airports.set(tr.destination, (airports.get(tr.destination) || 0) + 1);
                    if (tr.provider) airlines.set(tr.provider, (airlines.get(tr.provider) || 0) + 1);
                    if (tr.vehicleModel) aircraft.set(tr.vehicleModel, (aircraft.get(tr.vehicleModel) || 0) + 1);
                    if (tr.origin && tr.destination) { const key = `${tr.origin} → ${tr.destination}`; routes.set(key, (routes.get(key) || 0) + 1); }
                }
            });
        });

        return { totalFlights, totalDistance: Math.round(totalDist), totalDurationHours: Math.round(totalDurationMinutes / 60), topAirports: Array.from(airports.entries()).sort((a,b)=>b[1]-a[1]).map(([l,c])=>({label:l,count:c,code:l})), topAirlines: Array.from(airlines.entries()).sort((a,b)=>b[1]-a[1]).map(([l,c])=>({label:l,count:c})), earthCircumnavigations: (totalDist / 40075).toFixed(1), daysInAir: (totalDurationMinutes / 1440).toFixed(1), longestFlight, shortestFlight, seatCounts: [{ label: 'Window', value: seatCounts.Window, color: '#3b82f6' }, { label: 'Aisle', value: seatCounts.Aisle, color: '#8b5cf6' }, { label: 'Middle', value: seatCounts.Middle, color: '#94a3b8' }].filter(x => x.value > 0), classCounts: [{ label: 'Economy', value: classCounts.Economy, color: '#64748b' }, { label: 'Premium', value: classCounts.Premium, color: '#0ea5e9' }, { label: 'Business', value: classCounts.Business, color: '#f59e0b' }, { label: 'First', value: classCounts.First, color: '#a855f7' }].filter(x => x.value > 0) };
  }, [trips]);

  const flightTrendData = useMemo<FlightTrendPoint[]>(() => {
        const activeTrips = trips.filter(t => t.status !== 'Planning' && t.status !== 'Cancelled');
        const points: { date: string; distance: number; cumulative: number }[] = [];
        
        let cumulative = 0;
        const rawFlights: { date: string; distance: number }[] = [];
        
        activeTrips.forEach(t => {
            t.transports?.forEach(tr => {
                if (tr.mode === 'Flight' && tr.departureDate) {
                    let dist = tr.distance || (tr.originLat && tr.originLng && tr.destLat && tr.destLng ? calculateDistance(tr.originLat, tr.originLng, tr.destLat, tr.destLng) : 0);
                    rawFlights.push({
                        date: tr.departureDate,
                        distance: Math.round(dist)
                    });
                }
            });
        });

        rawFlights.sort((a, b) => a.date.localeCompare(b.date));

        const grouped: { [key: string]: number } = {};
        rawFlights.forEach(f => {
            const label = f.date.substring(0, 7); // YYYY-MM
            grouped[label] = (grouped[label] || 0) + f.distance;
        });

        const sortedLabels = Object.keys(grouped).sort();
        sortedLabels.forEach(label => {
            const dist = grouped[label];
            cumulative += dist;
            points.push({
                date: label,
                distance: dist,
                cumulative: cumulative
            });
        });

        if (points.length === 0) {
            return [
                { date: '2026-01', distance: 1200, cumulative: 1200 },
                { date: '2026-03', distance: 3800, cumulative: 5000 },
                { date: '2026-05', distance: 4200, cumulative: 9200 },
            ];
        }

        return points;
  }, [trips]);

  const currentLevel = useMemo(() => {
        const count = visitedData.length;
        return [...LEVEL_THRESHOLDS].reverse().find(t => count >= t.countries) || LEVEL_THRESHOLDS[0];
  }, [visitedData]);

  const nextLevel = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.findIndex(t => t.name === currentLevel.name) + 1];
  const progressToNext = nextLevel ? Math.min(100, Math.max(0, ((visitedData.length - currentLevel.countries) / (nextLevel.countries - currentLevel.countries)) * 100)) : 100;

  const availableRegions = useMemo(() => {
        const setOfReg = new Set<string>();
        visitedData.forEach(c => { if (c.region) setOfReg.add(c.region); });
        return ['All', ...Array.from(setOfReg).sort()];
  }, [visitedData]);

  const filteredVisitedData = useMemo(() => {
        return visitedData.filter(c => {
             const key = stampSearch.toLowerCase().trim();
             const matchSearch = !key || 
                 c.name.toLowerCase().includes(key) || 
                 c.code.toLowerCase().includes(key) || 
                 Array.from(c.cities).some(city => city.toLowerCase().includes(key));
             const matchRegion = selectedRegion === 'All' || c.region === selectedRegion;
             return matchSearch && matchRegion;
        });
  }, [visitedData, stampSearch, selectedRegion]);

  // Compute region frequencies for stamps progress visualization
  const regionalProgress = useMemo(() => {
    const counts: Record<string, number> = {};
    visitedData.forEach(c => {
        if (c.region) counts[c.region] = (counts[c.region] || 0) + 1;
    });
    return counts;
  }, [visitedData]);

  // Upcoming scheduled trips ledger
  const upcomingTripsList = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return trips
      .filter(t => t.status === 'Upcoming' || (t.status === 'Planning' && t.startDate >= today))
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 3);
  }, [trips]);

  if (loading) {
    return (
        <div className="w-full h-[60vh] flex flex-col items-center justify-center space-y-4">
            <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
                <div className="absolute inset-2 rounded-full border-4 border-emerald-500/20 border-b-emerald-500 animate-[spin_2s_linear_infinite_reverse]" />
            </div>
            <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-widest">Compiling Expeditions...</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">Aligning coordinate history & flight registries</p>
        </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in max-w-[102rem] mx-auto pb-20 px-2 sm:px-4">
        
        {/* ========================================================= */}
        {/* BRAND NEW LUXURY USER COMPASS HEADER */}
        {/* ========================================================= */}
        <div className="relative overflow-hidden bg-white/40 dark:bg-zinc-900/30 border border-zinc-200/50 dark:border-white/5 rounded-[2.5rem] p-6 sm:p-8 backdrop-blur-3xl shadow-sm transition-all duration-300">
            {/* Ambient subtle warm & blue flows inside header backing */}
            <div className="absolute top-0 right-0 w-[400px] h-[300px] bg-gradient-to-bl from-blue-500/10 via-indigo-500/5 to-transparent blur-3xl pointer-events-none" />
            
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
                {/* Explorer Identity Badge */}
                <div className="flex items-center gap-5">
                    <div className="relative group shrink-0">
                        <div className="absolute inset-0 bg-gradient-to-tr from-blue-600 via-indigo-500 to-amber-400 rounded-full blur-md opacity-50 group-hover:scale-105 transition-transform duration-500" />
                        <div className="relative w-16 h-16 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center font-black text-2xl border-2 border-white/20 shadow-xl select-none uppercase">
                            {currentUser?.name ? currentUser.name.charAt(0) : currentUser?.email ? currentUser.email.charAt(0) : 'E'}
                        </div>
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h2 className="text-2.5xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                                Welcome back, {currentUser?.name || currentUser?.email?.split('@')[0] || 'Explorer'}
                            </h2>
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-black uppercase bg-blue-500/10 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 py-1 px-2.5 rounded-lg leading-none">
                                <Shield className="w-3.5 h-3.5" /> Checked-In
                            </span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-1 dark:text-zinc-400 font-medium">
                            Status: <span className="font-bold text-zinc-800 dark:text-zinc-200">{currentLevel.name}</span> (Level {currentLevel.level}) • Airspace operational
                        </p>
                    </div>
                </div>

                {/* Swiss-Pairing Clock Panel */}
                <div className="flex flex-wrap items-center gap-4 lg:gap-8 border-t lg:border-t-0 border-zinc-200/50 dark:border-white/5 pt-4 lg:pt-0">
                    <div className="flex items-center gap-3 bg-zinc-100/50 dark:bg-white/[0.02] border border-zinc-200/40 dark:border-white/5 py-2.5 px-4 rounded-2xl">
                        <Calendar className="w-4 h-4 text-zinc-400" />
                        <div className="text-left font-mono">
                            <span className="block text-[11px] text-zinc-400 uppercase font-black tracking-widest">Chronometer</span>
                            <span className="text-xs font-black text-zinc-800 dark:text-zinc-100">
                                {currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 bg-zinc-100/50 dark:bg-white/[0.02] border border-zinc-200/40 dark:border-white/5 py-2.5 px-4 rounded-2xl">
                        <Compass className="w-4 h-4 text-amber-500 animate-[spin_12s_linear_infinite]" />
                        <div className="text-left font-mono">
                            <span className="block text-[11px] text-zinc-400 uppercase font-black tracking-widest font-mono">World Time</span>
                            <span className="text-xs font-black text-zinc-800 dark:text-zinc-100">
                                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                            </span>
                        </div>
                    </div>

                    <Button 
                        variant="primary" 
                        className="bg-blue-600 font-extrabold hover:bg-blue-700 shadow-xl text-white py-3 px-6 rounded-2xl flex items-center gap-2 text-xs uppercase tracking-wider" 
                        onClick={() => setIsFlightTrackerOpen(true)}
                    >
                        <Plane className="w-4 h-4" /> Track Active Flight
                    </Button>
                </div>
            </div>
        </div>

        {/* ========================================================= */}
        {/* ROW 2: PANORAMIC EXPEDITION MAP & TITANIUM LOYALTY CARD */}
        {/* ========================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            
            {/* Real Space 3D Expedition Globe / 2D Map (Col-span 2) */}
            <div className="lg:col-span-2 relative h-[31rem] rounded-[2.5rem] overflow-hidden border border-zinc-200/50 dark:border-white/5 shadow-xl bg-zinc-100/40 dark:bg-zinc-950/20 backdrop-blur-md group">
                <Suspense fallback={
                    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900/10 dark:bg-black/40 space-y-4">
                        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Loading Expedition Coordinates...</p>
                    </div>
                }>
                    {mapViewMode === '3d' ? (
                        <ExpeditionMap3D 
                            trips={trips.filter(t => t.status !== 'Cancelled')} 
                            animateRoutes={true} 
                            onTripClick={onTripClick}
                            showGradientRoutes={globalGradientRoutes}
                            onToggleGradientRoutes={(val) => setGlobalGradientRoutes(val)} 
                            showFlightRoutes={true}
                            showLandSeaRoutes={true}
                        />
                    ) : (
                        <ExpeditionMap 
                            trips={trips.filter(t => t.status !== 'Cancelled')} 
                            animateRoutes={false} 
                            showFrequencyWeight={false}
                            onTripClick={onTripClick}
                            showCountries={false}
                            clusterMode={false}
                            visitedCountries={visitedData.map(vd => vd.code)}
                            showGradientRoutes={globalGradientRoutes}
                            onToggleGradientRoutes={(val) => setGlobalGradientRoutes(val)}
                            showFlightRoutes={true}
                            showLandSeaRoutes={true}
                        />
                    )}
                </Suspense>
                
                {/* Visual Map Switch and Route Gradient Tactile Controller bar */}
                <div className="absolute bottom-6 left-6 z-20 flex flex-wrap items-center gap-3">
                    {/* View Switch: 3D Globe / 2D Map */}
                    <div className="bg-[#1e293b]/90 dark:bg-black/85 backdrop-blur-md p-1 rounded-2xl border border-white/10 flex items-center shadow-2xl">
                        <button
                            onClick={() => {
                                setMapViewMode('3d');
                                localStorage.setItem('wandergrid_map_view_mode', '3d');
                            }}
                            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold tracking-tight flex items-center gap-1.5 transition-all text-white ${mapViewMode === '3d' ? 'bg-blue-600 shadow-md border-white/5' : 'opacity-60 hover:opacity-100'}`}
                        >
                            <Globe className="w-3.5 h-3.5" /> 3D Globe
                        </button>
                        <button
                            onClick={() => {
                                setMapViewMode('2d');
                                localStorage.setItem('wandergrid_map_view_mode', '2d');
                            }}
                            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold tracking-tight flex items-center gap-1.5 transition-all text-white ${mapViewMode === '2d' ? 'bg-blue-600 shadow-md border-white/5' : 'opacity-60 hover:opacity-100'}`}
                        >
                            <span className="material-icons-outlined text-sm leading-none">map</span> 2D Map
                        </button>
                    </div>

                    {/* Gradient Routes On / Off Switch */}
                    <div className="bg-[#1e293b]/90 dark:bg-black/85 backdrop-blur-md px-3.5 py-1.5 rounded-2xl border border-white/10 flex items-center gap-3 shadow-2xl h-[34px]">
                        <span className="text-[9px] font-black font-mono text-zinc-300 uppercase tracking-widest">Gradient Routes</span>
                        <button
                            onClick={() => {
                                const nextVal = !globalGradientRoutes;
                                setGlobalGradientRoutes(nextVal);
                                localStorage.setItem('wandergrid_gradient_routes', String(nextVal));
                            }}
                            className={`w-8 h-4 px-0.5 rounded-full transition-all duration-200 flex items-center ${globalGradientRoutes ? 'bg-blue-500 justify-end' : 'bg-zinc-700 justify-start'}`}
                            title="Toggles multi-color gradient routes style matching country highlights"
                        >
                            <div className="w-3 h-3 bg-white rounded-full shadow-md" />
                        </button>
                    </div>
                </div>
                

            </div>

            {/* Exclusive Loyalty / Rank Card Column (Col-span 1) */}
            <div className="space-y-6 lg:col-span-1 h-full flex flex-col justify-between">
                
                {/* WANDERER EXECUTIVE TILE */}
                <div className="bg-white/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-white/5 rounded-[2rem] p-6 backdrop-blur-2xl relative overflow-hidden group hover:border-zinc-350 dark:hover:border-white/10 transition-all duration-300 flex flex-col justify-between">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl translate-x-1/2 -translate-y-1/2 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
                    
                    <div className="flex justify-between items-start">
                        <div>
                            <span className="block text-[10px] font-mono font-black tracking-widest text-amber-500 uppercase">Wanderer Executive</span>
                            <span className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mt-1">Elite Travel Status</span>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0">
                            <Award className="w-5 h-5 filter drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
                        </div>
                    </div>

                    <div className="mt-6 space-y-4">
                        <div className="flex justify-between items-center py-2.5 border-b border-zinc-100/40 dark:border-white/5">
                            <span className="text-xs text-zinc-400 font-bold uppercase">Member Name</span>
                            <span className="text-sm font-black text-zinc-800 dark:text-white uppercase tracking-wider">
                                {currentUser?.name ? currentUser.name : currentUser?.email ? currentUser.email.split('@')[0] : 'EXECUTIVE EXPLORER'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center py-2.5 border-b border-zinc-100/40 dark:border-white/5">
                            <span className="text-xs text-zinc-400 font-bold uppercase">Rank Standing</span>
                            <span className="text-sm font-black text-amber-500 dark:text-amber-400 uppercase tracking-wide">
                                {currentLevel.name}
                            </span>
                        </div>
                        <div className="flex justify-between items-center pt-2.5">
                            <span className="text-xs text-zinc-400 font-bold uppercase">Level Index</span>
                            <span className="text-sm font-mono font-black text-zinc-800 dark:text-white">
                                LVL-{String(currentLevel.level).padStart(2, '0')}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Rank Completion Ledger */}
                <div className="bg-white/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-white/5 rounded-[2rem] p-6 backdrop-blur-2xl">
                    <div className="flex justify-between items-end mb-2.5">
                        <span className="text-[10px] font-mono font-black text-zinc-400 uppercase tracking-widest">Wander Registry Progress</span>
                        <span className="text-xs font-mono font-black text-blue-500">{Math.round(progressToNext)}% Complete</span>
                    </div>
                    
                    <div className="h-4 w-full bg-zinc-200/50 dark:bg-white/5 rounded-full overflow-hidden p-[2.5px] border border-zinc-350 dark:border-white/5">
                        <div className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-amber-400 transition-all duration-1000 ease-out rounded-full relative shadow-[0_0_10px_rgba(59,130,246,0.3)] animate-pulse" style={{ width: `${progressToNext}%` }}>
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[pulse_1.5s_infinite]" />
                        </div>
                    </div>

                    {nextLevel && (
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-400 mt-3 font-semibold text-center uppercase tracking-wide">
                            Land <span className="font-bold text-zinc-700 dark:text-zinc-200">{nextLevel.countries - visitedData.length} more countries</span> to reach <span className="font-black text-amber-500 uppercase">{nextLevel.name}</span>
                        </p>
                    )}
                </div>

                {/* Upcoming Milestones Box */}
                <div className="bg-white/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-white/5 rounded-[2rem] p-5 backdrop-blur-2xl flex-1 flex flex-col justify-between">
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xs font-mono font-black text-zinc-400 uppercase tracking-widest">Planned Odysseys</h3>
                            <span className="text-[9px] font-mono font-black px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 uppercase leading-none">Schedule</span>
                        </div>
                        
                        {upcomingTripsList.length === 0 ? (
                            <div className="p-4 rounded-2xl bg-zinc-100/30 dark:bg-white/[0.01] border border-dashed border-zinc-200 dark:border-white/5 flex flex-col items-center justify-center text-center">
                                <Compass className="w-5 h-5 text-zinc-400 mb-1 leading-none" />
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Empty Flight Path</p>
                                <p className="text-[9px] text-zinc-400 mt-0.5">Use the Vacation Planner to queue upcoming arrivals</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {upcomingTripsList.map((t) => (
                                    <div 
                                        key={t.id} 
                                        onClick={() => onTripClick && onTripClick(t.id)}
                                        className="p-3 bg-zinc-100/50 dark:bg-white/[0.02] border border-zinc-200/40 dark:border-white/5 rounded-2xl flex items-center justify-between hover:bg-zinc-100 dark:hover:bg-white/5 cursor-pointer transition-colors"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-8 h-8 rounded-xl bg-indigo-505/10 bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 shrink-0 select-none">
                                                <span className="text-lg leading-none">{t.icon || '✈️'}</span>
                                            </div>
                                            <div className="min-w-0">
                                                <span className="block text-xs font-extrabold text-zinc-800 dark:text-zinc-100 truncate">{t.name}</span>
                                                <span className="block text-[9px] font-mono text-zinc-400 uppercase font-black tracking-wide mt-0.5">{t.location}</span>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className="block text-[10px] font-mono font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">
                                                {new Date(t.startDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                            </span>
                                            <span className="block text-[8px] font-mono text-zinc-400 uppercase mt-0.5">Deploying</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

        </div>

         {/* ========================================================= */}
        {/* ROW 3: UNIFIED GAMIFICATION & ANALYTICS WORKSPACE */}
        {/* ========================================================= */}
        <div className="space-y-6">
            
            {/* Sliding Pill Tab Toggle Header */}
            <div className="flex flex-col xl:flex-row gap-4 items-center justify-between border-b border-zinc-200/50 dark:border-white/5 pb-4">
                <div className="flex items-center p-1 bg-zinc-100 dark:bg-zinc-900 rounded-2xl gap-1 border border-zinc-200/30 dark:border-white/5 relative shrink-0 overflow-x-auto max-w-full no-scrollbar">
                    <button
                        onClick={() => setActiveStatsTab('stamps')}
                        className={`relative py-2.5 px-4 rounded-xl text-xs font-mono font-black uppercase tracking-wider transition-all duration-300 whitespace-nowrap ${
                            activeStatsTab === 'stamps' 
                            ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' 
                            : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-205'
                        }`}
                    >
                        PASSPORT STAMPS 🛂
                    </button>
                    <button
                        onClick={() => setActiveStatsTab('flipbook')}
                        className={`relative py-2.5 px-4 rounded-xl text-xs font-mono font-black uppercase tracking-wider transition-all duration-300 whitespace-nowrap ${
                            activeStatsTab === 'flipbook' 
                            ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' 
                            : 'text-zinc-400 hover:text-zinc-650 dark:text-zinc-400 dark:hover:text-zinc-205'
                        }`}
                    >
                        3D ALBUM 📖
                    </button>
                    <button
                        onClick={() => setActiveStatsTab('stickers')}
                        className={`relative py-2.5 px-4 rounded-xl text-xs font-mono font-black uppercase tracking-wider transition-all duration-300 whitespace-nowrap ${
                            activeStatsTab === 'stickers' 
                            ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' 
                            : 'text-zinc-400 hover:text-zinc-650 dark:text-zinc-400 dark:hover:text-zinc-205'
                        }`}
                    >
                        LANDMARK STICKERS ⭐️
                    </button>
                    <button
                        onClick={() => setActiveStatsTab('milestones')}
                        className={`relative py-2.5 px-4 rounded-xl text-xs font-mono font-black uppercase tracking-wider transition-all duration-300 whitespace-nowrap ${
                            activeStatsTab === 'milestones' 
                            ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' 
                            : 'text-zinc-400 hover:text-zinc-650 dark:text-zinc-400 dark:hover:text-zinc-205'
                        }`}
                    >
                        ACHIEVEMENTS 🏆
                    </button>
                    <button
                        onClick={() => setActiveStatsTab('analytics')}
                        className={`relative py-2.5 px-4 rounded-xl text-xs font-mono font-black uppercase tracking-wider transition-all duration-300 whitespace-nowrap ${
                            activeStatsTab === 'analytics' 
                            ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' 
                            : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-205'
                        }`}
                    >
                        FLIGHT COCKPIT 📊
                    </button>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono text-zinc-400 text-right">
                    <span className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Auto-Synchronized</span>
                    <span className="hidden sm:inline-block text-zinc-300">|</span>
                    <span className="hidden sm:inline-block">Total distance: <strong className="text-zinc-700 dark:text-zinc-200">{totalDistance.toLocaleString()} KM</strong></span>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {activeStatsTab === 'stamps' && (
                    <motion.div 
                        key="stamps-panel"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.25 }}
                        className="space-y-6"
                    >
                        {/* Cohesive Filtering & Region Search Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center bg-white/40 dark:bg-zinc-900/30 p-4 rounded-[2rem] border border-zinc-200/50 dark:border-white/5 backdrop-blur-3xl">
                             {/* Text input filter */}
                             <div className="relative md:col-span-1">
                                 <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
                                 <input
                                     type="text"
                                     placeholder="Query country or gateway..."
                                     value={stampSearch}
                                     onChange={(e) => setStampSearch(e.target.value)}
                                     className="w-full bg-zinc-100/70 dark:bg-black/30 border border-zinc-200/50 dark:border-white/5 rounded-xl pl-10 pr-8 py-2.5 text-xs font-bold text-zinc-800 dark:text-zinc-150 placeholder-zinc-400 focus:outline-none focus:border-blue-500"
                                 />
                                 {stampSearch && (
                                     <button onClick={() => setStampSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-xs leading-none">✕</button>
                                 )}
                             </div>

                             {/* Regional scroll selectors */}
                             <div className="md:col-span-3 flex items-center gap-2 overflow-x-auto w-full no-scrollbar px-1 py-0.5 max-w-full">
                                  {availableRegions.map(region => {
                                      const count = region === 'All' ? visitedData.length : (regionalProgress[region] || 0);
                                      return (
                                          <button
                                              key={region}
                                              onClick={() => setSelectedRegion(region)}
                                              className={`px-3 py-2 rounded-xl border text-[10px] font-mono font-black uppercase tracking-wider shrink-0 transition-all duration-200 ${
                                                  selectedRegion === region
                                                      ? 'bg-blue-600/10 border-blue-500/40 text-blue-600 dark:text-blue-400'
                                                      : 'bg-zinc-100/50 dark:bg-white/5 border-zinc-200/55 dark:border-white/10 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-150'
                                              }`}
                                          >
                                              {region} <span className="opacity-60 ml-1 font-bold">({count})</span>
                                          </button>
                                      );
                                  })}
                             </div>
                        </div>

                        {/* Visited Country Map Stamps Container */}
                        {filteredVisitedData.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-16 rounded-[2.5rem] bg-zinc-105/30 dark:bg-zinc-950/10 border border-zinc-200/50 dark:border-white/5 text-center">
                                <Compass className="w-10 h-10 text-zinc-400 mb-3" />
                                <h4 className="text-sm font-bold text-zinc-800 dark:text-white">Boundary Search Exhausted</h4>
                                <p className="text-xs text-zinc-500 mt-1">We couldn't resolve any passports stamped for your active filter constraints.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 perspective-1000">
                                {filteredVisitedData.map(c => (
                                    <PassportStamp key={c.name} country={c} />
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}

                {activeStatsTab === 'flipbook' && (
                    <motion.div 
                        key="flipbook-panel"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.25 }}
                        className="space-y-6"
                    >
                        <StampFlipBook visitedCountries={visitedData} stickerClaims={stickerClaims} />
                    </motion.div>
                )}

                {activeStatsTab === 'stickers' && (
                    <motion.div 
                        key="stickers-panel"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.25 }}
                        className="space-y-6"
                    >
                        {/* Header card with Collector Rank progress */}
                        <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-6 bg-white/40 dark:bg-zinc-900/30 p-6 rounded-[2.5rem] border border-zinc-200/50 dark:border-white/5 backdrop-blur-3xl">
                            <div className="space-y-2">
                                <span className="inline-block text-[10px] font-mono font-black uppercase tracking-wider bg-amber-500/10 text-amber-500 dark:text-amber-400 px-3 py-1 rounded-full border border-amber-500/20">
                                    ★ Collector Rank: {stickerStats.rank}
                                </span>
                                <h3 className="text-xl font-extrabold text-zinc-950 dark:text-zinc-150 tracking-tight">Landmark Sticker Album</h3>
                                <p className="text-xs text-zinc-500 font-semibold">{stickerStats.rankDesc}</p>
                            </div>

                            <div className="flex flex-col items-center justify-center shrink-0 w-full lg:w-48 space-y-2">
                                <div className="flex justify-between w-full text-xs font-mono font-black text-gray-400 dark:text-zinc-500">
                                    <span>ALBUM PROGRESS</span>
                                    <span className="text-amber-500 font-bold">{stickerStats.percent}%</span>
                                </div>
                                <div className="h-3 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden relative border border-white/10 shadow-inner">
                                    <div 
                                        className="h-full bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition-all duration-1000 ease-out rounded-full relative" 
                                        style={{ width: `${stickerStats.percent}%` }}
                                    />
                                </div>
                                <span className="text-[10px] font-mono font-bold text-gray-450 uppercase tracking-widest text-center">
                                    {stickerStats.unlockedCount} / {stickerStats.totalCount} stickers adhered
                                </span>
                            </div>
                        </div>

                        {/* Filter Categories and Landmark Search input */}
                        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                            <div className="flex flex-wrap gap-1.5 p-1 bg-zinc-100/65 dark:bg-zinc-900/65 rounded-2xl border border-zinc-200/40 dark:border-white/5 overflow-x-auto no-scrollbar max-w-full">
                                <button
                                    onClick={() => setSelectedStickerCategory('All')}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                                        selectedStickerCategory === 'All'
                                            ? 'bg-white dark:bg-zinc-850 text-gray-900 dark:text-white shadow-sm font-black'
                                            : 'text-zinc-500 hover:text-gray-950 dark:text-zinc-405 dark:hover:text-white font-bold'
                                    }`}
                                >
                                    All Categories
                                </button>
                                {STICKER_CATEGORIES.map(cat => {
                                    const stats = stickerStats.categoryBreakdowns.find(cb => cb.category === cat);
                                    return (
                                        <button
                                            key={cat}
                                            onClick={() => setSelectedStickerCategory(cat)}
                                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                                                selectedStickerCategory === cat
                                                    ? 'bg-white dark:bg-zinc-850 text-gray-900 dark:text-white shadow-sm font-black'
                                                    : 'text-zinc-500 hover:text-gray-950 dark:text-zinc-405 dark:hover:text-white font-bold'
                                            }`}
                                        >
                                            {cat}
                                            {stats && stats.unlocked > 0 && (
                                                <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-black ${stats.isCompleted ? 'bg-emerald-500 text-white' : 'bg-amber-500/15 text-amber-500'}`}>
                                                    {stats.unlocked}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="relative">
                                <span className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-zinc-400">
                                    <Search className="w-4 h-4" />
                                </span>
                                <input
                                    type="text"
                                    placeholder="Find landmarks or countries..."
                                    value={stickerSearch}
                                    onChange={(e) => setStickerSearch(e.target.value)}
                                    className="w-full md:w-64 pl-10 pr-4 py-2.5 text-xs rounded-2xl bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200 dark:border-white/5 outline-none focus:bg-white focus:border-indigo-500 dark:text-white font-medium"
                                />
                            </div>
                        </div>

                        {/* Booklet Table of Contents breakdown */}
                        {selectedStickerCategory === 'All' && !stickerSearch && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                                {stickerStats.categoryBreakdowns.map(item => (
                                    <div 
                                        key={item.category}
                                        onClick={() => setSelectedStickerCategory(item.category)}
                                        className={`p-4 rounded-3xl border transition-all cursor-pointer hover:-translate-y-1 active:scale-98 ${
                                            item.isCompleted 
                                                ? 'bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/10'
                                                : 'bg-zinc-50/50 dark:bg-zinc-900/30 border-zinc-200/50 dark:border-white/5 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/40'
                                        }`}
                                    >
                                        <span className="text-[9px] font-mono font-black text-zinc-400 uppercase tracking-widest">{item.unlocked === item.total ? '🏆 PERFECT' : 'ALBUM SECTION'}</span>
                                        <h4 className="text-xs font-black uppercase text-gray-900 dark:text-white mt-0.5 truncate">{item.category}</h4>
                                        <div className="mt-3 flex items-center justify-between text-[11px] font-semibold">
                                            <span className="text-zinc-500">{item.unlocked} of {item.total} acquired</span>
                                            <span className={item.isCompleted ? 'text-emerald-500 font-bold' : 'text-amber-500 font-bold'}>{item.percent}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-zinc-100 dark:bg-white/5 rounded-full overflow-hidden mt-1.5">
                                            <div 
                                                className={`h-full rounded-full transition-all duration-500 ${item.isCompleted ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                                                style={{ width: `${item.percent}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="p-4 rounded-2xl text-xs bg-indigo-500/5 text-indigo-700 dark:text-indigo-400 border border-indigo-500/10 font-semibold flex items-center gap-2">
                            <span className="material-icons-outlined text-lg">lightbulb</span>
                            <span>
                                💡 <strong>Sticker Verification Tip:</strong> Collect adhesive stamps automatically when you configure past trips within <strong>65km</strong> of any landmark, or trigger manual overrides to document elder memories!
                            </span>
                        </div>

                        {/* Active Grid Display of Stickers */}
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {ICONIC_STICKERS.filter(sticker => {
                                    const matchCategory = selectedStickerCategory === 'All' || sticker.category === selectedStickerCategory;
                                    const searchLower = stickerSearch.toLowerCase();
                                    const matchSearch = !stickerSearch || 
                                        sticker.name.toLowerCase().includes(searchLower) || 
                                        sticker.location.toLowerCase().includes(searchLower) || 
                                        sticker.countryCode.toLowerCase().includes(searchLower);
                                    return matchCategory && matchSearch;
                                }).map(sticker => (
                                    <StickerStamp 
                                        key={sticker.id}
                                        sticker={sticker}
                                        claim={stickerClaims.get(sticker.id)}
                                        availableTrips={pastTrips}
                                    />
                                ))}
                            </div>
                            {ICONIC_STICKERS.filter(sticker => {
                                const matchCategory = selectedStickerCategory === 'All' || sticker.category === selectedStickerCategory;
                                const searchLower = stickerSearch.toLowerCase();
                                const matchSearch = !stickerSearch || 
                                    sticker.name.toLowerCase().includes(searchLower) || 
                                    sticker.location.toLowerCase().includes(searchLower) || 
                                    sticker.countryCode.toLowerCase().includes(searchLower);
                                return matchCategory && matchSearch;
                            }).length === 0 && (
                                <div className="p-12 text-center text-zinc-400 font-mono font-bold uppercase tracking-wider border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl">
                                    No landmarks matched your active filters 🧭
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}

                {activeStatsTab === 'milestones' && (
                    <motion.div 
                        key="milestones-panel"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.25 }}
                        className="space-y-6"
                    >
                        <AchievementMilestones 
                            pastTrips={pastTrips} 
                            visitedCountries={visitedData} 
                            totalDistanceKm={totalDistance} 
                            stickersCount={stickerClaims.size} 
                        />
                    </motion.div>
                )}

                {activeStatsTab === 'analytics' && (
                    <motion.div 
                        key="analytics-panel"
                        variants={containerVariants}
                        initial="hidden"
                        animate="show"
                        exit="hidden"
                        className="space-y-8"
                    >
                        {/* ========================================================= */}
                        {/* FLIGHT ANALYTICS BENTO GRID */}
                        {/* ========================================================= */}
                        <motion.div variants={itemVariants} className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                            
                            {/* Cumulative trend span */}
                            <div className="xl:col-span-2">
                                <FlightTrendChart data={flightTrendData} />
                            </div>

                            {/* Circular cabin donut charts */}
                            <div className="xl:col-span-1">
                                <DonutChart title="Preferred Seat Profile" data={stats.seatCounts} />
                            </div>

                        </motion.div>

                        {/* Standard Quick Stats Panel */}
                        <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            <StatCard title="Continuous Air Journeys" value={stats.totalFlights} icon="flight_takeoff" color="blue" />
                            <StatCard title="Accumulated Coverage" value={`${(stats.totalDistance / 1005).toFixed(1)}k km`} subtitle={`${stats.earthCircumnavigations}x Globe Rotations`} icon="public" color="emerald" />
                            <StatCard title="Total Flight Hours" value={`${stats.totalDurationHours}h`} subtitle={`${stats.daysInAir} Days aloft`} icon="schedule" color="purple" />
                            <StatCard title="Main Airport Hub" value={stats.topAirports[0]?.label || '-'} subtitle={`${stats.topAirports[0]?.count || 0} landings recorded`} icon="place" color="amber" />
                        </motion.div>

                        {/* Record flight metrics details */}
                        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-1">
                                <ExtremeFlightCard type="Longest" flight={stats.longestFlight} color="indigo" />
                            </div>
                            <div className="lg:col-span-1">
                                <ExtremeFlightCard type="Shortest" flight={stats.shortestFlight} color="rose" />
                            </div>
                            <div className="lg:col-span-1">
                                {/* Route list summary showing frequency on top */}
                                <div className="bg-white/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-white/5 rounded-[2rem] p-6 backdrop-blur-2xl h-full flex flex-col justify-between">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-xs font-mono font-black text-zinc-400 uppercase tracking-widest">Preferred Class Segment</h3>
                                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                                    </div>
                                    <div className="flex-1 flex flex-col justify-center space-y-3">
                                        {stats.classCounts.map((cabin, idx) => (
                                            <div key={idx} className="space-y-1.5">
                                                <div className="flex justify-between text-xs font-mono">
                                                    <span className="font-extrabold text-zinc-650 dark:text-zinc-300">{cabin.label}</span>
                                                    <span className="font-black text-zinc-800 dark:text-zinc-100">{cabin.value} trips</span>
                                                </div>
                                                <div className="h-2 w-full bg-zinc-200/40 dark:bg-white/5 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full" style={{ width: `${(cabin.value / stats.totalFlights) * 100}%`, backgroundColor: cabin.color }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>

                        {/* Additional Donut Analysis and TopList Airport Details nested inside flight analysis */}
                        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <TopList title="Most Landed Airport Gateways" items={stats.topAirports} icon="apartment" color="amber" />
                            <TopList title="Primary Registered Airlines" items={stats.topAirlines} icon="flight" color="blue" />
                        </motion.div>

                    </motion.div>
                )}
            </AnimatePresence>

        </div>

        {/* Live Tracking Overlay Modal */}
        <FlightTrackerModal isOpen={isFlightTrackerOpen} onClose={() => setIsFlightTrackerOpen(false)} suggestedFlight={todaysFlight} />
    </div>
  );
};
