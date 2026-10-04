import React, { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '../components/ui';
const DeckFlightMap = lazy(() => import('../components/DeckFlightMap').then(m => ({ default: m.DeckFlightMap || m.default })));
const FlightTrackerModal = lazy(() => import('../components/FlightTrackerModal').then(m => ({ default: m.FlightTrackerModal })));
import { dataService } from '../services/mockDb';
import { User, Trip, EntitlementType, PublicHoliday, getResidenceStatuses } from '../types';
import { resolvePlaceName, calculateDistance, getCoordinates, getCoordinatesSync, refineUKCountry, formatPlaceName } from '../services/geocoding';
import { getRegion, getFlagEmoji } from '../services/geoData';
import { getTripsVersion, serializeVisitedData, deserializeVisitedData, runAfterFirstPaint, mapWithConcurrency } from '../services/utils';
import { StatCard, ExtremeFlightCard, DonutChart, TopList, ExtremeFlight, FlightTrendChart, FlightTrendPoint } from '../components/DashboardWidgets';
import { PassportStamp, VisitedCountry } from '../components/PassportStamp';
import { StickerStamp } from '../components/StickerStamp';
import { AchievementMilestones } from '../components/AchievementMilestones';
import { ICONIC_STICKERS, loadStickersProgress, STICKER_CATEGORIES } from '../utils/stickersData';
import { formatDate } from '../utils/formatters';
import { GlassPanel } from '../components/glass/GlassPanel';
import { LiveClock } from '../components/LiveClock';
import { EmptyState } from '../components/EmptyState';
import { 
    Globe, 
    AirplaneTakeoff, 
    Airplane as Plane, 
    Compass, 
    MagnifyingGlass as Search, 
    MapPin, 
    CheckCircle, 
    ShieldCheck as Shield, 
    Ticket, 
    Sparkle as Sparkles, 
    IdentificationCard,
    Star,
    Trophy,
    ChartBar,
    Lightbulb,
    X,
    ArrowUpRight,
    Clock,
    Broadcast,
    NavigationArrow,
    Planet,
    TrendUp
} from '@phosphor-icons/react';

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

const DASHBOARD_CACHE_KEY = 'wandergrid_dashboard_cache_v2';
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
    transition: { type: "spring" as const, stiffness: 300, damping: 25 } 
  }
};

type StatsTabKey = 'stamps' | 'stickers' | 'milestones' | 'analytics';

export const Dashboard: React.FC<DashboardProps> = ({ onUserClick, onTripClick }) => {
  const [, setUsers] = useState<User[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [, setEntitlements] = useState<EntitlementType[]>([]);
  const [, setHolidays] = useState<PublicHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [visitedData, setVisitedData] = useState<VisitedCountry[]>([]);
  const [totalCities, setTotalCities] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [activeStatsTab, setActiveStatsTab] = useState<StatsTabKey>('stamps');

  // Interactive Stamps Filter States
  const [stampSearch, setStampSearch] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('All');

  // Gamification & Stickers Integrated States
  const [stickerSearch, setStickerSearch] = useState('');
  const [selectedStickerCategory, setSelectedStickerCategory] = useState('All');

  // Interactive Map View Modes & Touch Safety
  const [mapViewMode, setMapViewMode] = useState<'3d' | '2d'>(() => {
    return (localStorage.getItem('wandergrid_map_view_mode') as '3d' | '2d') || '2d';
  });

  const [isFlightTrackerOpen, setIsFlightTrackerOpen] = useState(false);
  const [todaysFlight, setTodaysFlight] = useState<{ iata: string; origin: string; destination: string; date: string } | undefined>(undefined);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

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
    let rankDesc = 'Start finding landmark stickers around the globe!';
    if (percent >= 15) {
        rank = 'Novice Surveyor';
        nextRank = 'Experienced Cartographer';
        rankDesc = 'Mapping your footprint across historic territories.';
    }
    if (percent >= 40) {
        rank = 'Experienced Cartographer';
        nextRank = 'Elite Trailblazer';
        rankDesc = 'Capturing majestic peaks and natural wonders alike.';
    }
    if (percent >= 70) {
        rank = 'Elite Trailblazer';
        nextRank = 'Legendary World Voyager';
        rankDesc = 'Exceptional portfolio of historic claims and summits.';
    }
    if (percent === 100) {
        rank = 'Legendary World Voyager';
        nextRank = 'Ultimate Completionist';
        rankDesc = 'Stood before every historic wonder, park, and summit on Earth.';
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

  useEffect(() => {
    const sessionUser = localStorage.getItem('wandergrid_session_user');
    if (sessionUser) {
        try {
            setCurrentUser(JSON.parse(sessionUser));
        } catch (e) {
            console.warn("Could not parse session user", e);
        }
    }
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
          .map((v: any) => `${v.id}-${v.isTransit === true}-${(v.residenceStatuses || [v.residenceStatus || '']).join('_')}-${v.visitDate || ''}`)
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
          } catch (e) {
              console.warn("Could not deserialize cache", e);
          }
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
              .map((v: any) => `${v.id}-${v.isTransit === true}-${(v.residenceStatuses || [v.residenceStatus || '']).join('_')}-${v.visitDate || ''}`)
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
                const countries = dbVisited.filter(item => {
                    if (item.type !== 'country') return false;
                    const statuses = getResidenceStatuses(item);
                    return statuses.some(s => s === 'visited' || s === 'lived_past' || s === 'lived_current') && !statuses.includes('layover') && !statuses.includes('wishlist') && !item.isTransit;
                });
                const cities = dbVisited.filter(item => {
                    if (item.type !== 'city') return false;
                    const statuses = getResidenceStatuses(item);
                    return !statuses.includes('layover') && !statuses.includes('wishlist') && !item.isTransit;
                });

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

                const mergedVisitedMap = new Map<string, VisitedCountry>();
                visitedDataList.forEach(entry => {
                    const existing = mergedVisitedMap.get(entry.code);
                    if (existing) {
                        const mergedCities = new Set<string>();
                        if (existing.cities instanceof Set) {
                            existing.cities.forEach(c => mergedCities.add(c));
                        } else if (Array.isArray(existing.cities)) {
                            existing.cities.forEach(c => mergedCities.add(c));
                        }
                        if (entry.cities instanceof Set) {
                            entry.cities.forEach(c => mergedCities.add(c));
                        } else if (Array.isArray(entry.cities)) {
                            entry.cities.forEach(c => mergedCities.add(c));
                        }

                        const d1 = existing.lastVisit instanceof Date ? existing.lastVisit : new Date(existing.lastVisit);
                        const d2 = entry.lastVisit instanceof Date ? entry.lastVisit : new Date(entry.lastVisit);
                        const latestDate = d1 > d2 ? d1 : d2;

                        mergedVisitedMap.set(entry.code, {
                            ...existing,
                            cities: mergedCities,
                            tripCount: Math.max(existing.tripCount, entry.tripCount),
                            lastVisit: latestDate
                        });
                    } else {
                        mergedVisitedMap.set(entry.code, {
                            ...entry,
                            cities: entry.cities instanceof Set ? entry.cities : new Set(entry.cities)
                        });
                    }
                });
                const visitedData = Array.from(mergedVisitedMap.values()).sort((a,b) => a.name.localeCompare(b.name));

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
                            name: formatPlaceName(resolved.country), 
                            cities: new Set(), 
                            flag: resolved.countryCode ? getFlagEmoji(resolved.countryCode) : '🏳️', 
                            tripCount: 0, 
                            lastVisit: new Date(trip.endDate), 
                            region: getRegion(resolved.countryCode?.toUpperCase() || 'XX') 
                        });
                    }
                    const entry = countryMap.get(countryKey)!;
                    if (resolved.city) (entry.cities as Set<string>).add(formatPlaceName(resolved.city));
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
        countryMap.forEach(val => { 
            const cityCount = Array.isArray(val.cities) ? val.cities.length : (val.cities?.size || 0);
            totalC += cityCount; 
            finalized.push(val); 
        });
        const visitedData = finalized.sort((a, b) => a.name.localeCompare(b.name));

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

        return { 
            totalFlights, 
            totalDistance: Math.round(totalDist), 
            totalDurationHours: Math.round(totalDurationMinutes / 60), 
            topAirports: Array.from(airports.entries()).sort((a,b)=>b[1]-a[1]).map(([l,c])=>({label:l,count:c,code:l})), 
            topAirlines: Array.from(airlines.entries()).sort((a,b)=>b[1]-a[1]).map(([l,c])=>({label:l,count:c})), 
            earthCircumnavigations: (totalDist / 40075).toFixed(1), 
            daysInAir: (totalDurationMinutes / 1440).toFixed(1), 
            longestFlight, 
            shortestFlight, 
            seatCounts: [{ label: 'Window', value: seatCounts.Window, color: '#3b82f6' }, { label: 'Aisle', value: seatCounts.Aisle, color: '#8b5cf6' }, { label: 'Middle', value: seatCounts.Middle, color: '#94a3b8' }].filter(x => x.value > 0), 
            classCounts: [{ label: 'Economy', value: classCounts.Economy, color: '#64748b' }, { label: 'Premium', value: classCounts.Premium, color: '#0ea5e9' }, { label: 'Business', value: classCounts.Business, color: '#f59e0b' }, { label: 'First', value: classCounts.First, color: '#a855f7' }].filter(x => x.value > 0) 
        };
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
            const label = f.date.substring(0, 7);
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

  const regionalProgress = useMemo(() => {
    const counts: Record<string, number> = {};
    visitedData.forEach(c => {
        if (c.region) counts[c.region] = (counts[c.region] || 0) + 1;
    });
    return counts;
  }, [visitedData]);

  const upcomingTripsList = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return trips
      .filter(t => t.status === 'Upcoming' || (t.status === 'Planning' && t.startDate >= today))
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 3);
  }, [trips]);

  // Next imminent journey for dynamic hero island
  const nextDepartureTrip = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return trips
      .filter(t => t.status !== 'Cancelled' && t.status !== 'Past' && t.startDate && new Date(t.startDate) >= today)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0] || null;
  }, [trips]);

  const daysUntilNextTrip = useMemo(() => {
    if (!nextDepartureTrip?.startDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(nextDepartureTrip.startDate);
    start.setHours(0, 0, 0, 0);
    const diff = start.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [nextDepartureTrip]);

  if (loading) {
    return (
        <div className="w-full h-[60vh] flex flex-col items-center justify-center space-y-4">
            <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-primary-500/20 border-t-primary-500 animate-spin" />
                <div className="absolute inset-2 rounded-full border-4 border-emerald-500/20 border-b-emerald-500 animate-[spin_2s_linear_infinite_reverse]" />
            </div>
            <h4 className="text-xs font-bold text-light-text dark:text-dark-text uppercase tracking-widest">Compiling Expeditions...</h4>
            <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary">Aligning coordinate history & telemetry</p>
        </div>
    );
  }

  return (
    <div className="w-full max-w-[1680px] mx-auto pt-2 sm:pt-4 px-1 sm:px-4 md:px-6 lg:px-8 flex flex-col gap-5 sm:gap-6 animate-fadeIn pb-16">
        
        {/* Soft background ambient glow */}
        <div className="absolute top-0 left-1/4 w-[40rem] h-[30rem] bg-gradient-to-tr from-primary-500/[0.04] to-indigo-500/[0.04] dark:from-primary-600/[0.07] dark:to-indigo-500/[0.05] rounded-full blur-[140px] pointer-events-none select-none -z-10" />
        <div className="absolute top-[35%] right-10 w-[35rem] h-[35rem] bg-gradient-to-bl from-amber-500/[0.03] to-orange-500/[0.03] dark:from-amber-500/[0.04] dark:to-orange-500/[0.04] rounded-full blur-[140px] pointer-events-none select-none -z-10" />

        {/* ========================================================= */}
        {/* 1. HERO HEADER (The Planner Standard §2.2)                */}
        {/* Title Left, Primary Action Button Right on Mobile & Desktop */}
        {/* ========================================================= */}
        <div className="flex flex-row items-center justify-between gap-2.5 sm:gap-4 w-full pt-1 pb-1 text-left">
            <div className="flex items-center justify-start gap-2.5 sm:gap-3 md:gap-4 min-w-0">
                <Compass 
                    className="w-7 h-7 sm:w-10 sm:h-10 md:w-12 md:h-12 text-primary-500 shrink-0" 
                    weight="duotone" 
                />
                <div className="min-w-0">
                    <h1 className="text-xl sm:text-3xl md:text-5xl font-black text-light-text dark:text-dark-text tracking-tight leading-tight sm:leading-none truncate sm:overflow-visible">
                        Expedition Command
                    </h1>
                </div>
            </div>

            <div className="flex items-center justify-end shrink-0 gap-2">
                <Button 
                    variant="primary" 
                    className="shrink-0 min-h-[44px]"
                    onClick={() => setIsFlightTrackerOpen(true)}
                    icon={<AirplaneTakeoff className="w-4 h-4" weight="bold" />}
                >
                    <span className="hidden xs:inline sm:inline">Track Flight</span>
                    <span className="xs:hidden sm:hidden">Track</span>
                </Button>
            </div>
        </div>

        {/* ========================================================= */}
        {/* 2. DYNAMIC ISLAND & CONTEXTUAL STATUS STRIP (Mobile First)*/}
        {/* ========================================================= */}
        <GlassPanel className="wg-glass-card rounded-2xl sm:rounded-[28px] overflow-hidden p-3.5 sm:p-5 shadow-xs border border-black/5 dark:border-white/10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 relative z-10">
                
                {/* Explorer Profile & Beacon */}
                <div className="flex items-center gap-3 min-w-0">
                    <div 
                        onClick={() => currentUser?.id && onUserClick && onUserClick(currentUser.id)}
                        className="relative group shrink-0 select-none cursor-pointer"
                        title="View profile details"
                    >
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary-500/10 dark:bg-primary-400/10 text-primary-600 dark:text-primary-400 flex items-center justify-center font-black text-base sm:text-lg border border-primary-500/20 shadow-xs transition-transform group-hover:scale-105">
                            {currentUser?.name ? currentUser.name.charAt(0) : currentUser?.email ? currentUser.email.charAt(0).toUpperCase() : 'E'}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 rounded-full p-0.5 sm:p-1 border-2 border-white dark:border-[#0c0c0e]">
                            <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping absolute" />
                            <div className="w-1.5 h-1.5 bg-white rounded-full" />
                        </div>
                    </div>
                    
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm sm:text-base font-bold text-light-text dark:text-dark-text tracking-tight truncate">
                                Welcome, {currentUser?.name || currentUser?.email?.split('@')[0] || 'Explorer'}
                            </h2>
                            <span className="px-1.5 py-0.5 rounded-full text-3xs sm:text-2xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1 shrink-0">
                                <Shield className="w-2.5 h-2.5 sm:w-3 sm:h-3" weight="duotone" /> Active
                            </span>
                        </div>
                        <p className="text-2xs sm:text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium truncate mt-0.5">
                            <span className="font-semibold text-light-text dark:text-dark-text">{currentLevel.name}</span> • Level {currentLevel.level}
                        </p>
                    </div>
                </div>

                {/* Right: Live Flight Status or Imminent Trip Countdown + Clock */}
                <div className="flex items-center justify-between sm:justify-end gap-2 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-black/5 dark:border-white/5 w-full sm:w-auto">
                    {todaysFlight ? (
                        <div 
                            onClick={() => setIsFlightTrackerOpen(true)}
                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 cursor-pointer hover:bg-sky-500/15 transition-all text-xs font-mono font-bold truncate max-w-[200px]"
                            title="Active flight scheduled today"
                        >
                            <Broadcast className="w-3.5 h-3.5 text-sky-500 animate-pulse shrink-0" weight="duotone" />
                            <span className="truncate">{todaysFlight.iata}: {todaysFlight.origin}➔{todaysFlight.destination}</span>
                        </div>
                    ) : nextDepartureTrip ? (
                        <div 
                            onClick={() => onTripClick && onTripClick(nextDepartureTrip.id)}
                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-primary-500/10 text-primary-700 dark:text-primary-300 border border-primary-500/20 cursor-pointer hover:bg-primary-500/15 transition-all text-xs font-medium truncate max-w-[220px]"
                            title="Click to inspect upcoming expedition"
                        >
                            <NavigationArrow className="w-3.5 h-3.5 text-primary-500 shrink-0" weight="duotone" />
                            <span className="truncate font-semibold">{nextDepartureTrip.name}</span>
                            <strong className="font-mono text-primary-600 dark:text-primary-400 shrink-0">in {daysUntilNextTrip === 0 ? 'today' : `${daysUntilNextTrip}d`}</strong>
                        </div>
                    ) : null}

                    <LiveClock />
                </div>
            </div>
        </GlassPanel>

        {/* ========================================================= */}
        {/* 3. CORE TELEMETRY METRIC CARDS (Responsive 4-Card Grid)   */}
        {/* ========================================================= */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
            <StatCard 
                title="Nations" 
                value={visitedData.length} 
                subtitle={`${Math.round((visitedData.length / 195) * 100)}% World`} 
                icon="public" 
                color="blue" 
            />
            <StatCard 
                title="Distance" 
                value={`${(totalDistance / 1000).toFixed(1)}k km`} 
                subtitle={`${stats.earthCircumnavigations}x Orbits`} 
                icon="flight_takeoff" 
                color="emerald" 
            />
            <StatCard 
                title="Cities" 
                value={totalCities} 
                subtitle={`${availableRegions.length - 1} Regions`} 
                icon="place" 
                color="amber" 
            />
            <StatCard 
                title="Flights" 
                value={`${stats.totalFlights}`} 
                subtitle={`${stats.totalDurationHours}h Airtime`} 
                icon="schedule" 
                color="purple" 
            />
        </div>

        {/* ========================================================= */}
        {/* 4. BENTO HUB: INTERACTIVE MAP & EXPLORER CREDENTIALS      */}
        {/* ========================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-stretch">
            
            {/* Interactive World Expedition Map (lg:col-span-8) */}
            <div className="lg:col-span-8 flex flex-col">
                <GlassPanel 
                    className="wg-glass-card rounded-[28px] overflow-hidden flex flex-col h-[26rem] sm:h-[32rem] lg:h-[36rem] relative border border-black/5 dark:border-white/10 shadow-glass-card"
                    overrides={{ borderRadius: 28 }}
                    padding="0px"
                >
                    {/* Map Banner Header */}
                    <div className="p-3.5 sm:p-5 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-primary-500/10 via-primary-500/5 to-transparent shrink-0 z-10">
                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-600 text-white shadow-md shadow-primary-500/20 flex items-center justify-center shrink-0">
                                <Globe className="w-4 h-4 sm:w-5 sm:h-5" weight="duotone" />
                            </div>
                            <h2 className="text-sm sm:text-base font-bold text-light-text dark:text-dark-text tracking-tight truncate">
                                Expedition Map
                            </h2>
                        </div>

                        {/* Floating Tactile 2D/3D Mode Pill */}
                        <button
                            type="button"
                            onClick={() => {
                                const nextMode = mapViewMode === '3d' ? '2d' : '3d';
                                setMapViewMode(nextMode);
                                localStorage.setItem('wandergrid_map_view_mode', nextMode);
                            }}
                            aria-label={mapViewMode === '3d' ? 'Switch to 2D Map' : 'Switch to 3D Globe'}
                            className="bg-white/80 dark:bg-white/10 hover:bg-white dark:hover:bg-white/15 px-3 py-1.5 rounded-xl sm:rounded-2xl border border-black/10 dark:border-white/15 flex items-center gap-2 shadow-xs min-h-[40px] cursor-pointer transition-all text-light-text dark:text-dark-text"
                            title={mapViewMode === '3d' ? 'Switch to 2D Map' : 'Switch to 3D Globe'}
                        >
                            <Planet className={`w-4 h-4 transition-colors ${mapViewMode === '3d' ? 'text-primary-500' : 'text-zinc-400'}`} weight="duotone" />
                            <span className="text-xs font-bold tracking-tight select-none">
                                {mapViewMode === '3d' ? '3D' : '2D'}
                            </span>
                            <div className={`w-7 h-4 p-0.5 rounded-full transition-all duration-300 flex items-center ${mapViewMode === '3d' ? 'bg-primary-500 justify-end' : 'bg-black/20 dark:bg-white/20 justify-start'}`}>
                                <div className="w-3 h-3 bg-white rounded-full shadow-xs" />
                            </div>
                        </button>
                    </div>

                    {/* DeckGL Map Container */}
                    <div className="w-full h-full flex-1 relative min-h-[300px]">
                        <Suspense fallback={
                            <div className="w-full h-full flex flex-col items-center justify-center space-y-4">
                                <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        }>
                            <DeckFlightMap 
                                trips={trips.filter(t => t.status !== 'Cancelled')} 
                                animateRoutes={false} 
                                showFrequencyWeight={true}
                                onTripClick={onTripClick}
                                showCountries={false}
                                clusterMode={false}
                                visitedCountries={visitedData.map(vd => vd.code)}
                                showGradientRoutes={true}
                                showFlightRoutes={true}
                                showLandSeaRoutes={true}
                                projection={mapViewMode === '3d' ? 'globe' : 'flat'}
                                elevatedRoutes={mapViewMode === '3d'}
                                embedded={true}
                            />
                        </Suspense>
                    </div>
                </GlassPanel>
            </div>

            {/* Explorer Telemetry & Membership Column (lg:col-span-4) */}
            <div className="lg:col-span-4 flex flex-col justify-between gap-4 sm:gap-6">
                
                {/* REIMAGINED LIQUID GLASS EXPLORER CREDENTIAL CARD */}
                <GlassPanel 
                    className="wg-glass-card rounded-2xl sm:rounded-[28px] overflow-hidden p-5 sm:p-6 relative group transition-all duration-300 flex flex-col justify-between h-[13.5rem] sm:h-[15.5rem] border border-primary-500/20 shadow-md"
                    overrides={{ borderRadius: 28 }}
                    padding="0px"
                >
                    <div className="p-5 sm:p-6 h-full flex flex-col justify-between relative z-10">
                        {/* Iridescent shimmer overlays */}
                        <div className="absolute -top-10 -right-10 w-36 h-36 bg-gradient-to-br from-primary-500/15 via-indigo-500/10 to-transparent rounded-full blur-[40px] pointer-events-none" />
                        <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-gradient-to-tr from-amber-500/15 via-pink-500/10 to-transparent rounded-full blur-[40px] pointer-events-none" />

                        {/* Top Card Bar */}
                        <div className="flex justify-between items-start w-full">
                            <div className="flex items-center gap-1.5">
                                <span className="text-2xs font-mono font-bold tracking-widest text-primary-600 dark:text-primary-400 uppercase">Executive Pass</span>
                                <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-pulse" />
                            </div>
                            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                <Sparkles className="w-3.5 h-3.5" weight="duotone" />
                            </div>
                        </div>

                        {/* Card Identifier & Numbers */}
                        <div className="space-y-2.5 mt-2">
                            <div className="font-mono text-xs sm:text-sm tracking-[0.22em] text-light-text dark:text-dark-text font-bold flex justify-between">
                                <span>EX-{currentLevel.level.toString().padStart(2, '0')}</span>
                                <span>5024</span>
                                <span>2196</span>
                                <span className="text-primary-600 dark:text-primary-400">{2026 + currentLevel.level}</span>
                            </div>

                            {/* Cardholder Footnote */}
                            <div className="flex justify-between items-end border-t border-black/10 dark:border-white/10 pt-2">
                                <div>
                                    <span className="block text-3xs font-mono text-light-text-secondary dark:text-dark-text-secondary uppercase font-bold tracking-widest">Cardholder</span>
                                    <span className="text-xs font-bold text-light-text dark:text-dark-text uppercase tracking-wider truncate max-w-[130px] block">
                                        {currentUser?.name ? currentUser.name : currentUser?.email ? currentUser.email.split('@')[0] : 'EXPLORER'}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <span className="block text-3xs font-mono text-light-text-secondary dark:text-dark-text-secondary uppercase font-bold tracking-widest">Tier</span>
                                    <span className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider">
                                        {currentLevel.name}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </GlassPanel>

                {/* Level Progress Milestone Card */}
                <GlassPanel className="wg-glass-card rounded-2xl sm:rounded-[28px] overflow-hidden p-4 sm:p-5 shadow-xs border border-black/5 dark:border-white/10">
                    <div className="flex justify-between items-end mb-2">
                        <span className="text-2xs font-mono font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest">Tier Progress</span>
                        <span className="text-xs font-mono font-bold text-primary-600 dark:text-primary-400">{Math.round(progressToNext)}%</span>
                    </div>
                    
                    <div className="h-2.5 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden p-0.5 border border-black/5 dark:border-white/5">
                        <div className="h-full bg-gradient-to-r from-primary-500 via-indigo-500 to-amber-500 transition-all duration-700 ease-out rounded-full" style={{ width: `${progressToNext}%` }} />
                    </div>

                    {nextLevel && (
                        <p className="text-2xs font-mono font-semibold text-light-text-secondary dark:text-dark-text-secondary mt-2 text-center uppercase tracking-wider">
                            {nextLevel.countries - visitedData.length} to <strong className="text-light-text dark:text-dark-text">{nextLevel.name}</strong>
                        </p>
                    )}
                </GlassPanel>

                {/* Boarding Slip Register */}
                <GlassPanel className="wg-glass-card rounded-2xl sm:rounded-[28px] overflow-hidden p-4 sm:p-5 flex-1 flex flex-col justify-between shadow-xs border border-black/5 dark:border-white/10 min-h-[12rem]">
                    <div>
                        <div className="flex justify-between items-center mb-2.5">
                            <h3 className="text-2xs font-mono font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest">Upcoming</h3>
                            <span className="text-2xs font-mono bg-primary-500/10 text-primary-600 dark:text-primary-400 py-0.5 px-2 rounded-full uppercase font-bold border border-primary-500/20">
                                {upcomingTripsList.length}
                            </span>
                        </div>
                        
                        {upcomingTripsList.length === 0 ? (
                            <div className="p-4 py-6 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-dashed border-black/10 dark:border-white/10 flex flex-col items-center justify-center text-center">
                                <Compass className="w-5 h-5 text-zinc-400 mb-1" weight="duotone" />
                                <p className="text-xs font-mono text-light-text-secondary dark:text-dark-text-secondary">No upcoming trips</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {upcomingTripsList.map((t) => (
                                    <div 
                                        key={t.id} 
                                        onClick={() => onTripClick && onTripClick(t.id)}
                                        className="relative overflow-hidden p-2.5 bg-white/50 dark:bg-white/[0.04] border border-black/5 dark:border-white/10 rounded-xl flex items-center justify-between hover:bg-white/80 dark:hover:bg-white/[0.08] cursor-pointer transition-all duration-150 min-h-[44px] group"
                                        title="View expedition details"
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0 z-10">
                                            <div className="w-7 h-7 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-600 dark:text-primary-400 shrink-0">
                                                <span className="text-xs">{t.icon || '✈️'}</span>
                                            </div>
                                            <div className="min-w-0">
                                                <span className="block text-xs font-bold text-light-text dark:text-dark-text truncate">{t.name}</span>
                                                <span className="block text-3xs font-mono text-light-text-secondary dark:text-dark-text-secondary uppercase truncate">{t.location}</span>
                                            </div>
                                        </div>
                                        
                                        <div className="text-right shrink-0 font-mono z-10 pl-2">
                                            <span className="block text-xs font-bold text-primary-600 dark:text-primary-400 uppercase">
                                                {formatDate(t.startDate, 'short')}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </GlassPanel>
            </div>
        </div>

        {/* ========================================================= */}
        {/* 5. MULTI-SUITE EXPLORATION TABS (The Planner Standard §2.3) */}
        {/* Centered on mobile! 3D Album deleted completely!          */}
        {/* ========================================================= */}
        <div className="space-y-5">
            
            {/* Centered Floating Liquid Glass Tab Switcher */}
            <div className="flex items-center justify-center sm:justify-start overflow-x-auto sm:overflow-visible no-scrollbar p-2 -m-2 shrink-0 w-full">
                <GlassPanel
                    className="wg-glass-pill shadow-lg shadow-black/5 dark:shadow-black/25 shrink-0"
                    padding="3px 5px"
                    overrides={{ borderRadius: 9999 }}
                >
                    <div className="flex gap-1 relative items-center">
                        {[
                            { id: 'stamps' as const, label: 'Stamps', icon: IdentificationCard, count: visitedData.length },
                            { id: 'stickers' as const, label: 'Stickers', icon: Star, count: `${stickerStats.unlockedCount}/${stickerStats.totalCount}` },
                            { id: 'milestones' as const, label: 'Milestones', icon: Trophy },
                            { id: 'analytics' as const, label: 'Analytics', icon: ChartBar },
                        ].map((tab) => {
                            const isSelected = activeStatsTab === tab.id;
                            const IconComponent = tab.icon;

                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveStatsTab(tab.id)}
                                    aria-label={tab.label}
                                    className={`relative rounded-full text-xs font-bold transition-all duration-200 flex items-center justify-center cursor-pointer select-none active:scale-95 min-h-[44px] ${
                                        isSelected
                                            ? 'text-primary-700 dark:text-primary-300 px-3.5 sm:px-5 py-2'
                                            : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text px-3 sm:px-4 py-2'
                                    }`}
                                >
                                    {isSelected && (
                                        <motion.div
                                            layoutId="dashboardActiveTab"
                                            className="absolute inset-0 rounded-full bg-primary-500/20 dark:bg-primary-500/30 backdrop-blur-md border border-primary-500/40 dark:border-primary-400/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_2px_10px_rgba(99,102,241,0.3)] z-0"
                                            style={{ WebkitBackdropFilter: 'blur(12px)' }}
                                            transition={{ type: "spring", stiffness: 450, damping: 32 }}
                                        />
                                    )}
                                    <span className="relative z-10 flex items-center gap-1.5 sm:gap-2">
                                        <IconComponent className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" weight="duotone" />
                                        <span className={`tracking-tight ${isSelected ? 'inline' : 'hidden sm:inline'}`}>
                                            {tab.label}
                                        </span>
                                        {tab.count !== undefined && (
                                            <span className="text-3xs font-mono px-1.5 py-0.2 rounded-full font-bold border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/10">
                                                {tab.count}
                                            </span>
                                        )}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </GlassPanel>
            </div>

            {/* Tab Body Panels */}
            <AnimatePresence mode="wait">
                
                {/* 1. PASSPORT STAMPS VIEW PANEL (Compact Multi-Column Grid) */}
                {activeStatsTab === 'stamps' && (
                    <motion.div 
                        key="stamps-panel"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-4 sm:space-y-5"
                    >
                        {/* Interactive Pill Filtering Bar */}
                        <GlassPanel className="wg-glass-card rounded-2xl sm:rounded-[28px] overflow-hidden p-2.5 sm:p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 border border-black/5 dark:border-white/10">
                             <div className="relative shrink-0 sm:w-56">
                                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-3.5 h-3.5" />
                                 <input
                                     type="text"
                                     placeholder="Search stamps..."
                                     value={stampSearch}
                                     onChange={(e) => setStampSearch(e.target.value)}
                                     className="w-full bg-white/70 dark:bg-dark-card/70 border border-black/10 dark:border-white/10 rounded-xl pl-8 pr-7 py-2 min-h-[40px] text-xs font-bold text-light-text dark:text-dark-text placeholder-light-text-secondary/50 focus:outline-none focus:border-primary-500"
                                 />
                                 {stampSearch && (
                                     <button 
                                         onClick={() => setStampSearch('')} 
                                         aria-label="Clear stamp search"
                                         className="w-6 h-6 flex items-center justify-center absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-black dark:hover:text-white rounded-lg transition-colors cursor-pointer"
                                     >
                                         <X className="w-3.5 h-3.5" />
                                     </button>
                                 )}
                             </div>

                             <div className="flex items-center gap-1.5 overflow-x-auto w-full no-scrollbar py-0.5">
                                  {availableRegions.map(region => {
                                      const count = region === 'All' ? visitedData.length : (regionalProgress[region] || 0);
                                      const isSelected = selectedRegion === region;
                                      return (
                                          <button
                                              key={region}
                                              onClick={() => setSelectedRegion(region)}
                                              className={`px-3 py-1.5 min-h-[40px] rounded-xl border text-2xs font-mono font-bold uppercase tracking-wide shrink-0 transition-all duration-150 cursor-pointer ${
                                                  isSelected
                                                      ? 'bg-primary-500/20 border-primary-500/30 text-primary-700 dark:text-primary-300 shadow-xs'
                                                      : 'bg-white/50 dark:bg-white/[0.04] border-black/5 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary hover:bg-white/80 dark:hover:bg-white/[0.08]'
                                              }`}
                                          >
                                              {region} <span className="opacity-60 font-normal">({count})</span>
                                          </button>
                                      );
                                  })}
                             </div>
                        </GlassPanel>

                        {/* Stamped Passports Compact Multi-Column Grid */}
                        {filteredVisitedData.length === 0 ? (
                            <EmptyState 
                                icon={<Compass className="w-8 h-8 text-zinc-400" weight="duotone" />}
                                title="No Stamps Found"
                                description="Try adjusting your active filter."
                            />
                        ) : (
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4 items-center justify-items-center py-2">
                                {filteredVisitedData.map(c => (
                                    <PassportStamp key={c.name} country={c} />
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}

                {/* 2. LANDMARK STICKERS VIEW PANEL */}
                {activeStatsTab === 'stickers' && (
                    <motion.div 
                        key="stickers-panel"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-5"
                    >
                        {/* Sticker Status Overview */}
                        <GlassPanel className="wg-glass-card rounded-2xl sm:rounded-[28px] overflow-hidden p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 border border-black/5 dark:border-white/10">
                            <div className="flex items-center gap-3">
                                <span className="text-2xs font-mono font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2.5 py-1 rounded-lg border border-amber-500/20 shrink-0">
                                    {stickerStats.rank}
                                </span>
                                <h3 className="text-base sm:text-lg font-bold text-light-text dark:text-dark-text tracking-tight">Landmark Stickers</h3>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 sm:w-64">
                                <div className="h-2.5 flex-1 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden relative border border-black/5 dark:border-white/5">
                                    <div 
                                        className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-700 ease-out rounded-full relative" 
                                        style={{ width: `${stickerStats.percent}%` }}
                                    />
                                </div>
                                <span className="text-2xs font-mono font-bold text-light-text-secondary dark:text-dark-text-secondary shrink-0 whitespace-nowrap">
                                    {stickerStats.unlockedCount}/{stickerStats.totalCount} ({stickerStats.percent}%)
                                </span>
                            </div>
                        </GlassPanel>

                        {/* Search and Category Filters */}
                        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
                            <div className="flex flex-wrap gap-1.5 p-1 bg-white/50 dark:bg-white/[0.04] rounded-2xl border border-black/5 dark:border-white/10 overflow-x-auto no-scrollbar max-w-full">
                                <button
                                    onClick={() => setSelectedStickerCategory('All')}
                                    className={`px-3 py-1.5 min-h-[40px] rounded-xl text-xs font-bold uppercase tracking-wide transition-all cursor-pointer whitespace-nowrap ${
                                        selectedStickerCategory === 'All'
                                            ? 'bg-white dark:bg-dark-card text-light-text dark:text-dark-text shadow-xs font-black'
                                            : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text'
                                    }`}
                                >
                                    All
                                </button>
                                {STICKER_CATEGORIES.map(cat => {
                                    const catStats = stickerStats.categoryBreakdowns.find(cb => cb.category === cat);
                                    const isSelected = selectedStickerCategory === cat;
                                    return (
                                        <button
                                            key={cat}
                                            onClick={() => setSelectedStickerCategory(cat)}
                                            className={`px-3 py-1.5 min-h-[40px] rounded-xl text-xs font-bold uppercase tracking-wide transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                                                isSelected
                                                    ? 'bg-white dark:bg-dark-card text-light-text dark:text-dark-text shadow-xs font-black'
                                                    : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text'
                                            }`}
                                        >
                                            {cat}
                                            {catStats && catStats.unlocked > 0 && (
                                                <span className={`text-2xs px-1.5 py-0.5 rounded font-bold leading-none ${catStats.isCompleted ? 'bg-emerald-500 text-white' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'}`}>
                                                    {catStats.unlocked}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="relative">
                                <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-zinc-400">
                                    <Search className="w-3.5 h-3.5" />
                                </span>
                                <input
                                    type="text"
                                    placeholder="Search stickers..."
                                    value={stickerSearch}
                                    onChange={(e) => setStickerSearch(e.target.value)}
                                    className="w-full md:w-60 pl-9 pr-4 py-2 min-h-[40px] text-xs rounded-xl bg-white/70 dark:bg-dark-card/70 border border-black/10 dark:border-white/10 outline-none focus:border-primary-500 text-light-text dark:text-dark-text font-medium"
                                />
                            </div>
                        </div>

                        {/* Category Progress Tiles */}
                        {selectedStickerCategory === 'All' && !stickerSearch && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                {stickerStats.categoryBreakdowns.map(item => (
                                    <div 
                                        key={item.category}
                                        onClick={() => setSelectedStickerCategory(item.category)}
                                        className={`p-3.5 rounded-2xl border transition-all duration-150 cursor-pointer hover:-translate-y-0.5 min-h-[44px] ${
                                            item.isCompleted 
                                                ? 'bg-emerald-500/[0.04] dark:bg-emerald-500/10 border-emerald-500/20'
                                                : 'bg-white/50 dark:bg-white/[0.04] border-black/5 dark:border-white/10 hover:bg-white/80 dark:hover:bg-white/[0.08]'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-xs font-bold uppercase text-light-text dark:text-dark-text truncate">{item.category}</h4>
                                            {item.isCompleted && <span className="text-2xs">🏆</span>}
                                        </div>
                                        <div className="mt-2 flex items-center justify-between text-2xs font-mono text-light-text-secondary dark:text-dark-text-secondary">
                                            <span>{item.unlocked}/{item.total}</span>
                                            <span className={item.isCompleted ? 'text-emerald-500 font-bold' : 'text-amber-500 font-bold'}>{item.percent}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden mt-1.5">
                                            <div 
                                                className={`h-full rounded-full transition-all duration-500 ${item.isCompleted ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                                                style={{ width: `${item.percent}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Landmarks Grid */}
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
                        </div>
                    </motion.div>
                )}

                {/* 3. ACHIEVEMENTS VIEW PANEL */}
                {activeStatsTab === 'milestones' && (
                    <motion.div 
                        key="milestones-panel"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
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

                {/* 4. FLIGHT COCKPIT ANALYTICS */}
                {activeStatsTab === 'analytics' && (
                    <motion.div 
                        key="analytics-panel"
                        variants={containerVariants}
                        initial="hidden"
                        animate="show"
                        exit="hidden"
                        className="space-y-6 sm:space-y-8 animate-fade-in"
                    >
                        {/* Trend Chart & Cabin Donut */}
                        <motion.div variants={itemVariants} className="grid grid-cols-1 xl:grid-cols-3 gap-6 sm:gap-8">
                            <div className="xl:col-span-2">
                                <FlightTrendChart data={flightTrendData} />
                            </div>
                            <div className="xl:col-span-1">
                                <DonutChart title="Cabin Classes" data={stats.seatCounts} />
                            </div>
                        </motion.div>

                        {/* Extreme Flights & Travel Class */}
                        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-1">
                                <ExtremeFlightCard type="Longest" flight={stats.longestFlight} color="indigo" />
                            </div>
                            <div className="lg:col-span-1">
                                <ExtremeFlightCard type="Shortest" flight={stats.shortestFlight} color="rose" />
                            </div>
                            <div className="lg:col-span-1">
                                <GlassPanel className="wg-glass-card rounded-[28px] overflow-hidden p-6 h-full flex flex-col justify-between border border-black/5 dark:border-white/10">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest">Travel Classes</h3>
                                        <TrendUp className="w-4 h-4 text-emerald-500" weight="duotone" />
                                    </div>
                                    <div className="flex-1 flex flex-col justify-center space-y-3.5">
                                        {stats.classCounts.map((cabin) => (
                                            <div key={cabin.label} className="space-y-1.5">
                                                <div className="flex justify-between text-xs font-mono">
                                                    <span className="font-bold text-light-text dark:text-dark-text">{cabin.label}</span>
                                                    <span className="font-bold text-light-text dark:text-dark-text">{cabin.value} trips</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full" style={{ width: `${(cabin.value / stats.totalFlights) * 100}%`, backgroundColor: cabin.color }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </GlassPanel>
                            </div>
                        </motion.div>

                        {/* Top Hubs & Airlines */}
                        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                            <TopList title="Top Airports" items={stats.topAirports} icon="apartment" color="amber" />
                            <TopList title="Top Airlines" items={stats.topAirlines} icon="flight" color="blue" />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

        {/* Live Active Flight Modal */}
        <Suspense fallback={null}>
          <FlightTrackerModal isOpen={isFlightTrackerOpen} onClose={() => setIsFlightTrackerOpen(false)} suggestedFlight={todaysFlight} />
        </Suspense>
    </div>
  );
};
