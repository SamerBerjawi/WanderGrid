import React, { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { Card, Button } from '../components/ui';
const DeckFlightMap = lazy(() => import('../components/DeckFlightMap').then(m => ({ default: m.DeckFlightMap || m.default })));
import { FlightTrackerModal } from '../components/FlightTrackerModal';
import { dataService } from '../services/mockDb';
import { User, Trip, EntitlementType, PublicHoliday } from '../types';
import { resolvePlaceName, calculateDistance, getCoordinates, getCoordinatesSync, refineUKCountry, formatPlaceName } from '../services/geocoding';
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
import { Globe, Plane, Award, Compass, Search, MapPin, Calendar, CheckCircle, Shield, Briefcase, ChevronRight, TrendingUp, Cpu, Layers, Wifi, Sparkles, Ticket, Activity, Info } from 'lucide-react';

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
    transition: { type: "spring" as const, stiffness: 300, damping: 25 } 
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
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
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
        <div className="w-full h-[60vh] flex flex-col items-center justify-center space-y-4 bg-zinc-50 dark:bg-zinc-950">
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
    <div className="relative pb-24 px-4 sm:px-8 max-w-[108rem] mx-auto space-y-8 animate-fade-in text-gray-900 dark:text-gray-100">
        
        {/* Soft designer lighting gradients */}
        <div className="absolute top-0 left-1/4 w-[40rem] h-[30rem] bg-gradient-to-tr from-blue-500/[0.04] to-indigo-500/[0.04] dark:from-blue-600/[0.08] dark:to-indigo-500/[0.06] rounded-full blur-[120px] pointer-events-none select-none -z-10" />
        <div className="absolute top-[40%] right-10 w-[35rem] h-[35rem] bg-gradient-to-bl from-amber-500/[0.03] to-orange-500/[0.03] dark:from-amber-500/[0.04] dark:to-orange-550/[0.04] rounded-full blur-[140px] pointer-events-none select-none -z-10" />

        {/* ========================================================= */}
        {/* SWISS MODERN DESIGNER PROFILE TERMINAL HEADER */}
        {/* ========================================================= */}
        <div className="relative overflow-hidden bg-white/70 dark:bg-[#0c0c0e]/80 border border-gray-200/50 dark:border-white/5 rounded-[2rem] p-6 sm:p-8 backdrop-blur-3xl shadow-sm transition-all duration-350">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 relative z-10">
                
                {/* Explorer Terminal Profile Info */}
                <div className="flex items-center gap-5">
                    <div className="relative group shrink-0 select-none">
                        <div className="absolute inset-0 bg-gradient-to-tr from-blue-600 via-indigo-500 to-amber-500 rounded-full blur opacity-25 group-hover:scale-105 transition-all duration-550" />
                        <div className="relative w-16 h-16 rounded-full bg-slate-100 dark:bg-zinc-900 text-zinc-900 dark:text-white flex items-center justify-center font-black text-2xl border border-gray-200/50 dark:border-white/10 shadow-sm">
                            <span className="bg-gradient-to-tr from-blue-600 to-indigo-400 dark:from-white dark:to-zinc-300 bg-clip-text text-transparent font-extrabold">
                                {currentUser?.name ? currentUser.name.charAt(0) : currentUser?.email ? currentUser.email.charAt(0) : 'E'}
                            </span>
                        </div>
                        <div className="absolute bottom-0 right-0 bg-emerald-500 rounded-full p-1 border-2 border-white dark:border-[#0c0c0e] shadow-md">
                            <div className="w-2 h-2 bg-white rounded-full animate-ping absolute" />
                            <div className="w-2 h-2 bg-white rounded-full" />
                        </div>
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h2 id="explorer-name-banner" className="text-2xl sm:text-3xl font-black tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
                                Welcome back, {currentUser?.name || currentUser?.email?.split('@')[0] || 'Explorer'}
                                <Sparkles className="w-5 h-5 text-amber-550 dark:text-amber-400 animate-pulse text-amber-500 shrink-0" />
                            </h2>
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 py-1 px-2.5 rounded-lg leading-none">
                                <Shield className="w-3.5 h-3.5" /> Checked-In
                            </span>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold tracking-wide mt-1.5 leading-relaxed">
                            Status: <span className="font-extrabold text-zinc-800 dark:text-zinc-200">{currentLevel.name}</span> (Level {currentLevel.level}) • Airport registries operational
                        </p>
                    </div>
                </div>

                {/* Swiss chronometric live timers and actions */}
                <div className="flex flex-wrap items-center gap-4 border-t xl:border-t-0 border-gray-200/40 dark:border-white/5 pt-4 xl:pt-0">
                    <div className="flex items-center gap-3 bg-slate-50/50 dark:bg-white/[0.02] border border-gray-200/40 dark:border-white/5 py-2 px-4 rounded-xl shadow-sm">
                        <Calendar className="w-4 h-4 text-zinc-400" />
                        <div className="text-left font-mono">
                            <span className="block text-[8px] text-zinc-400 uppercase font-bold tracking-widest leading-none mb-0.5">Chronometer</span>
                            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-100">
                                {currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 bg-slate-50/50 dark:bg-white/[0.02] border border-gray-200/40 dark:border-white/5 py-2 px-4 rounded-xl shadow-sm">
                        <Compass className="w-4 h-4 text-blue-500 animate-[spin_24s_linear_infinite]" />
                        <div className="text-left font-mono">
                            <span className="block text-[8px] text-zinc-400 uppercase font-bold tracking-widest leading-none mb-0.5">World Time</span>
                            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-100">
                                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                            </span>
                        </div>
                    </div>

                    <Button 
                        variant="primary" 
                        className="bg-blue-600 font-extrabold hover:bg-blue-700 shadow-md text-white py-2.5 px-5 rounded-xl flex items-center gap-2 text-xs uppercase tracking-wider transition-all duration-200 border-t border-white/25 shrink-0" 
                        onClick={() => setIsFlightTrackerOpen(true)}
                    >
                        <Plane className="w-4 h-4 text-white" /> Track Active Flight
                    </Button>
                </div>
            </div>
        </div>

        {/* ========================================================= */}
        {/* ROW 2: BENTO HUB (MAP CONSOLE & MEMBERSHIP COMPOSITION) */}
        {/* ========================================================= */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-stretch">
            
            {/* Interactive World Map Widget (Col-span 2) */}
            <div className="xl:col-span-2 relative h-[36rem] rounded-[2rem] overflow-hidden border border-gray-200/60 dark:border-white/5 shadow-sm bg-slate-50/40 dark:bg-black/10 backdrop-blur-2xl flex flex-col">
                <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-white/35 dark:from-black/10 to-transparent pointer-events-none z-10" />
                
                <Suspense fallback={
                    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900/5 dark:bg-black/30 space-y-4">
                        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Loading Expedition Coordinates...</p>
                    </div>
                }>
                    <DeckFlightMap 
                        trips={trips.filter(t => t.status !== 'Cancelled')} 
                        animateRoutes={mapViewMode === '3d'} 
                        showFrequencyWeight={true}
                        onTripClick={onTripClick}
                        showCountries={false}
                        clusterMode={false}
                        visitedCountries={visitedData.map(vd => vd.code)}
                        showGradientRoutes={globalGradientRoutes}
                        showFlightRoutes={true}
                        showLandSeaRoutes={true}
                        projection={mapViewMode === '3d' ? 'globe' : 'flat'}
                        elevatedRoutes={mapViewMode === '3d'}
                    />
                </Suspense>
                
                {/* Floating Glass Tactile Map Overlays (Top Right of Map) */}
                <div className="absolute top-5 right-5 z-20 flex items-center gap-2.5">
                    <div className="bg-slate-900/90 dark:bg-[#09090b]/90 backdrop-blur-xl p-1 rounded-2xl border border-white/10 flex items-center shadow-lg">
                        <button
                            onClick={() => {
                                setMapViewMode('3d');
                                localStorage.setItem('wandergrid_map_view_mode', '3d');
                            }}
                            className={`px-3 py-1.5 rounded-xl text-[10px] font-bold tracking-tight flex items-center gap-1.5 transition-all text-white cursor-pointer ${mapViewMode === '3d' ? 'bg-blue-600 shadow-sm' : 'opacity-60 hover:opacity-100'}`}
                        >
                            <Globe className="w-3.5 h-3.5" /> 3D Globe
                        </button>
                        <button
                            onClick={() => {
                                setMapViewMode('2d');
                                localStorage.setItem('wandergrid_map_view_mode', '2d');
                            }}
                            className={`px-3 py-1.5 rounded-xl text-[10px] font-bold tracking-tight flex items-center gap-1.5 transition-all text-white cursor-pointer ${mapViewMode === '2d' ? 'bg-blue-600 shadow-sm' : 'opacity-60 hover:opacity-100'}`}
                        >
                            <span className="material-icons-outlined text-sm leading-none">map</span> 2D Map
                        </button>
                    </div>

                    <div className="bg-slate-900/90 dark:bg-[#09090b]/90 backdrop-blur-xl px-3 py-1.5 rounded-2xl border border-white/10 flex items-center gap-2.5 shadow-lg h-[34px]">
                        <span className="text-[9px] font-bold font-mono text-zinc-300 uppercase tracking-wider select-none">Gradients</span>
                        <button
                            onClick={() => {
                                const nextVal = !globalGradientRoutes;
                                setGlobalGradientRoutes(nextVal);
                                localStorage.setItem('wandergrid_gradient_routes', String(nextVal));
                            }}
                            className={`w-7 h-4 p-0.5 rounded-full transition-all duration-300 flex items-center cursor-pointer ${globalGradientRoutes ? 'bg-blue-500 justify-end' : 'bg-zinc-700 justify-start'}`}
                            title="Toggle multi-color gradient routes"
                        >
                            <div className="w-3 h-3 bg-white rounded-full shadow-sm" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Exclusive Loyalty & Passing Column (Col-span 1) */}
            <div className="xl:col-span-1 h-full flex flex-col justify-between gap-6">
                
                {/* REVOLUTIONARY METALLIC MEMBERSHIP CARD */}
                <div id="holographic-titanium-card" className="relative overflow-hidden rounded-[1.8rem] p-6 bg-gradient-to-br from-zinc-900 via-zinc-950 to-slate-950 border border-white/10 shadow-lg group flex flex-col justify-between h-[15.5rem] transition-all duration-350">
                    
                    {/* Iridescent security holographic chip and light vectors */}
                    <div className="absolute top-[30%] right-[8%] w-11 h-14 bg-gradient-to-tr from-cyan-400 via-purple-400 to-yellow-300 opacity-20 blur-[1.5px] rounded rotate-12 pointer-events-none group-hover:opacity-45 transition-all duration-700 mx-auto select-none" />
                    <div className="absolute -top-12 -left-12 w-32 h-32 bg-amber-500/5 rounded-full blur-[40px] group-hover:bg-amber-500/10 transition-all duration-550 pointer-events-none" />
                    <div className="absolute -bottom-16 -right-16 w-40 h-40 bg-blue-500/10 rounded-full blur-[50px] pointer-events-none" />

                    <div className="flex justify-between items-start relative z-10 w-full">
                        <div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-mono font-bold tracking-widest text-[#f59e0b] uppercase">Wander Executive</span>
                                <span className="w-1.5 h-1.5 bg-[#f59e0b] rounded-full animate-pulse" />
                            </div>
                            <span className="block text-[8px] font-mono text-zinc-400 mt-0.5 uppercase tracking-wider">Holographic Membership Card</span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-sm">
                                <Cpu className="w-4 h-4 text-amber-500" />
                            </div>
                            <span className="text-[7px] font-mono text-zinc-500 uppercase tracking-widest leading-none">Security RFID</span>
                        </div>
                    </div>

                    <div className="space-y-4 relative z-10 mt-2">
                        {/* Mock Card Numbers */}
                        <div className="font-mono text-xs sm:text-sm tracking-[0.22em] text-zinc-200 font-bold flex justify-between">
                            <span>EX-{currentLevel.level.toString().padStart(2, '0')}</span>
                            <span>5024</span>
                            <span>2196</span>
                            <span className="text-amber-500">{2026 + currentLevel.level}</span>
                        </div>

                        {/* Holder Metrics */}
                        <div className="flex justify-between items-end border-t border-white/10 pt-3">
                            <div>
                                <span className="block text-[7px] font-mono text-zinc-500 uppercase font-black tracking-widest mb-0.5">Cardholder</span>
                                <span className="text-xs font-bold text-white uppercase tracking-wider truncate max-w-[150px]">
                                    {currentUser?.name ? currentUser.name : currentUser?.email ? currentUser.email.split('@')[0] : 'EXECUTIVE EXPLORER'}
                                </span>
                            </div>
                            <div className="text-right">
                                <span className="block text-[7px] font-mono text-zinc-500 uppercase font-black tracking-widest mb-0.5">Tier LEVEL</span>
                                <span className="text-xs font-bold text-amber-550 uppercase tracking-wider">
                                    {currentLevel.name}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Altitude level details progress */}
                <div className="bg-white/75 dark:bg-[#0c0c0e]/80 border border-gray-200/50 dark:border-white/5 rounded-[1.8rem] p-5 shadow-sm">
                    <div className="flex justify-between items-end mb-2.5">
                        <span className="text-[8px] font-mono font-bold text-zinc-400 uppercase tracking-widest">Altitudal completion</span>
                        <span className="text-xs font-mono font-bold text-blue-500">{Math.round(progressToNext)}% Completed</span>
                    </div>
                    
                    <div className="h-3.5 w-full bg-slate-100 dark:bg-zinc-950 rounded-full overflow-hidden p-[2.5px] border border-gray-200/45 dark:border-white/5">
                        <div className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-amber-500 transition-all duration-1000 ease-out rounded-full relative" style={{ width: `${progressToNext}%` }}>
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[pulse_1.5s_infinite]" />
                        </div>
                    </div>

                    {nextLevel && (
                        <p className="text-[9px] text-[#94a3b8] mt-2.5 font-bold text-center uppercase tracking-wider leading-relaxed">
                            Arrive in <span className="font-extrabold text-gray-800 dark:text-zinc-200">{nextLevel.countries - visitedData.length} countries</span> to achieve <span className="font-bold text-amber-555 text-amber-500">{nextLevel.name}</span>
                        </p>
                    )}
                </div>

                {/* BOARDING PASSES TRANSITING slips */}
                <div id="transit-passes-scroller" className="bg-white/75 dark:bg-[#0c0c0e]/80 border border-gray-200/50 dark:border-white/5 rounded-[1.8rem] p-5 flex-1 flex flex-col justify-between shadow-sm min-h-[14rem]">
                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-widest">Active Boarding Register</h3>
                            <span className="text-[8px] font-mono bg-slate-100 dark:bg-white/5 py-0.5 px-2 rounded text-zinc-500 border border-gray-200/40 dark:border-white/5 uppercase font-bold">Gate</span>
                        </div>
                        
                        {upcomingTripsList.length === 0 ? (
                            <div className="p-4 py-8 rounded-2xl bg-zinc-150/10 dark:bg-white/[0.005] border border-dashed border-gray-200 dark:border-white/5 flex flex-col items-center justify-center text-center">
                                <Compass className="w-5 h-5 text-zinc-400 mb-1.5 animate-[spin_32s_linear_infinite]" />
                                <p className="text-[9px] font-mono font-bold text-zinc-450 dark:text-zinc-400 uppercase tracking-wider">No Active Slips queued</p>
                                <p className="text-[8px] text-zinc-500 mt-1 font-medium leading-relaxed">Create itineraries in standard views to configure active transit keys</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {upcomingTripsList.map((t) => (
                                    <div 
                                        key={t.id} 
                                        onClick={() => onTripClick && onTripClick(t.id)}
                                        className="relative overflow-hidden p-3 bg-white/40 dark:bg-zinc-950/20 border border-gray-200/60 dark:border-white/5 rounded-xl flex items-center justify-between hover:bg-zinc-50/80 dark:hover:bg-zinc-950/40 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 shadow-sm group"
                                        title="Click to view boarding details"
                                    >
                                        {/* Classic boarding ticket side cutouts */}
                                        <div className="absolute top-[40%] -left-1.5 w-3 h-3 bg-slate-100 dark:bg-zinc-950 border border-gray-250 dark:border-transparent rounded-full z-10" />
                                        <div className="absolute top-[40%] -right-1.5 w-3 h-3 bg-slate-100 dark:bg-zinc-950 border border-gray-250 dark:border-transparent rounded-full z-10" />

                                        <div className="flex items-center gap-3 min-w-0 pl-1 z-10">
                                            <div className="w-8.5 h-8.5 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">
                                                <span className="text-lg leading-none">{t.icon || '✈️'}</span>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="block text-xs font-bold text-zinc-800 dark:text-zinc-150 truncate leading-none">{t.name}</span>
                                                    <Ticket className="w-3 h-3 text-zinc-450 shrink-0" />
                                                </div>
                                                <span className="block text-[8px] font-mono font-bold text-zinc-400 uppercase mt-1 truncate tracking-wider">{t.location}</span>
                                            </div>
                                        </div>
                                        
                                        <div className="text-right shrink-0 pr-1 font-mono z-10">
                                            <span className="block text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">
                                                {new Date(t.startDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                            </span>
                                            <div className="flex gap-[1px] justify-end opacity-20 h-3.5 mt-1">
                                                <span className="w-[1px] bg-zinc-800 dark:bg-white h-full" />
                                                <span className="w-[2px] bg-zinc-800 dark:bg-white h-full" />
                                                <span className="w-[1px] bg-zinc-800 dark:bg-white h-full" />
                                                <span className="w-[3px] bg-zinc-800 dark:bg-white h-full" />
                                                <span className="w-[1px] bg-zinc-800 dark:bg-white h-full" />
                                            </div>
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
        {/* ROW 3: SWISS OPTIMIZED CONTROL REGISTRATION AND TABS */}
        {/* ========================================================= */}
        <div id="stats-tab-console" className="space-y-6">
            
            {/* Segmentation Switch Box (Horizontal sliding pill headers) */}
            <div className="flex flex-col xl:flex-row gap-4 items-center justify-between border-b border-gray-205 dark:border-white/5 pb-4">
                <div className="flex p-1 bg-zinc-100/80 dark:bg-[#0c0c0e]/80 rounded-2xl gap-1 border border-gray-250/20 dark:border-white/5 relative shrink-0 overflow-x-auto max-w-full no-scrollbar">
                    <button
                        onClick={() => setActiveStatsTab('stamps')}
                        className={`relative py-2.5 px-4 rounded-xl text-[10px] font-mono font-black uppercase tracking-wider transition-all duration-350 whitespace-nowrap ${
                            activeStatsTab === 'stamps' 
                            ? 'bg-white dark:bg-zinc-900 text-gray-900 dark:text-white shadow-sm font-black' 
                            : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 font-bold'
                        }`}
                    >
                        PASSPORT STAMPS 🛂
                    </button>
                    <button
                        onClick={() => setActiveStatsTab('flipbook')}
                        className={`relative py-2.5 px-4 rounded-xl text-[10px] font-mono font-black uppercase tracking-wider transition-all duration-350 whitespace-nowrap ${
                            activeStatsTab === 'flipbook' 
                            ? 'bg-white dark:bg-zinc-900 text-gray-900 dark:text-white shadow-sm font-black' 
                            : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 font-bold'
                        }`}
                    >
                        3D ALBUM 📖
                    </button>
                    <button
                        onClick={() => setActiveStatsTab('stickers')}
                        className={`relative py-2.5 px-4 rounded-xl text-[10px] font-mono font-black uppercase tracking-wider transition-all duration-350 whitespace-nowrap ${
                            activeStatsTab === 'stickers' 
                            ? 'bg-white dark:bg-zinc-900 text-gray-900 dark:text-white shadow-sm font-black' 
                            : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 font-bold'
                        }`}
                    >
                        LANDMARK STICKERS ⭐️
                    </button>
                    <button
                        onClick={() => setActiveStatsTab('milestones')}
                        className={`relative py-2.5 px-4 rounded-xl text-[10px] font-mono font-black uppercase tracking-wider transition-all duration-350 whitespace-nowrap ${
                            activeStatsTab === 'milestones' 
                            ? 'bg-white dark:bg-zinc-900 text-gray-900 dark:text-white shadow-sm font-black' 
                            : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 font-bold'
                        }`}
                    >
                        ACHIEVEMENTS 🏆
                    </button>
                    <button
                        onClick={() => setActiveStatsTab('analytics')}
                        className={`relative py-2.5 px-4 rounded-xl text-[10px] font-mono font-black uppercase tracking-wider transition-all duration-350 whitespace-nowrap ${
                            activeStatsTab === 'analytics' 
                            ? 'bg-white dark:bg-zinc-900 text-gray-900 dark:text-white shadow-sm font-black' 
                            : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 font-bold'
                        }`}
                    >
                        FLIGHT COCKPIT 📊
                    </button>
                </div>

                <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-400 text-right">
                    <span className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Auto-Synchronized</span>
                    <span className="hidden sm:inline-block text-zinc-300">|</span>
                    <span className="hidden sm:inline-block">Total distance: <strong className="text-zinc-700 dark:text-zinc-200">{totalDistance.toLocaleString()} KM</strong></span>
                </div>
            </div>

            <AnimatePresence mode="wait">
                
                {/* 1. PASSPORT STAMPS VIEW PANEL */}
                {activeStatsTab === 'stamps' && (
                    <motion.div 
                        key="stamps-panel"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.22 }}
                        className="space-y-6"
                    >
                        {/* Interactive Pill filtering controllers */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center bg-white/70 dark:bg-[#0c0c0e]/80 p-4 rounded-[2rem] border border-gray-200/55 dark:border-white/5 backdrop-blur-3xl shadow-sm">
                             <div className="relative md:col-span-1">
                                 <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
                                 <input
                                     type="text"
                                     placeholder="Query country or gateway..."
                                     value={stampSearch}
                                     onChange={(e) => setStampSearch(e.target.value)}
                                     className="w-full bg-slate-50 dark:bg-black/40 border border-gray-200/50 dark:border-white/10 rounded-xl pl-10 pr-8 py-2 text-xs font-bold text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-blue-500"
                                 />
                                 {stampSearch && (
                                     <button onClick={() => setStampSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-black dark:hover:text-white text-xs leading-none">✕</button>
                                 )}
                             </div>

                             <div className="md:col-span-3 flex items-center gap-2 overflow-x-auto w-full no-scrollbar py-0.5">
                                  {availableRegions.map(region => {
                                      const count = region === 'All' ? visitedData.length : (regionalProgress[region] || 0);
                                      return (
                                          <button
                                              key={region}
                                              onClick={() => setSelectedRegion(region)}
                                              className={`px-3 py-2 rounded-xl border text-[9px] font-mono font-bold uppercase tracking-wide shrink-0 transition-all duration-200 ${
                                                  selectedRegion === region
                                                      ? 'bg-blue-600/10 border-blue-500/20 text-blue-600 dark:text-blue-400 shadow-sm'
                                                      : 'bg-slate-50/50 dark:bg-white/5 border-gray-250/50 dark:border-white/10 text-zinc-500 dark:text-zinc-400 hover:bg-slate-100'
                                              }`}
                                          >
                                              {region} <span className="opacity-60 ml-1 font-bold">({count})</span>
                                          </button>
                                      );
                                  })}
                             </div>
                        </div>

                        {/* Stamped passports grid container */}
                        {filteredVisitedData.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-16 rounded-[2.5rem] bg-slate-50/50 dark:bg-zinc-950/20 border border-dashed border-gray-200 dark:border-white/5 text-center">
                                <Compass className="w-10 h-10 text-zinc-400 mb-3" />
                                <h4 className="text-sm font-bold text-zinc-850 dark:text-white">Boundary Search Exhausted</h4>
                                <p className="text-xs text-zinc-500 mt-1">We couldn't resolve any passports stamped for your active filter constraints.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 perspective-[1200px]">
                                {filteredVisitedData.map(c => (
                                    <PassportStamp key={c.name} country={c} />
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}

                {/* 2. 3D FLIPBOOK VIEW PANEL */}
                {activeStatsTab === 'flipbook' && (
                    <motion.div 
                        key="flipbook-panel"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.22 }}
                        className="space-y-6"
                    >
                        <StampFlipBook visitedCountries={visitedData} stickerClaims={stickerClaims} />
                    </motion.div>
                )}

                {/* 3. LANDMARK STICKERS VIEW PANEL */}
                {activeStatsTab === 'stickers' && (
                    <motion.div 
                        key="stickers-panel"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.22 }}
                        className="space-y-6"
                    >
                        {/* Category and unlocked percentages metrics panel */}
                        <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-6 bg-white/70 dark:bg-[#0c0c0e]/80 p-6 rounded-[2rem] border border-gray-200/50 dark:border-white/5 shadow-sm">
                            <div className="space-y-1.5">
                                <span className="inline-block text-[9px] font-mono font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2.5 py-1 rounded-lg border border-amber-500/20">
                                    ★ Collector Rank: {stickerStats.rank}
                                </span>
                                <h3 className="text-xl font-extrabold text-gray-900 dark:text-zinc-150 tracking-tight">Landmark Sticker Album</h3>
                                <p className="text-xs text-zinc-505 dark:text-zinc-400 font-semibold">{stickerStats.rankDesc}</p>
                            </div>

                            <div className="flex flex-col items-center justify-center shrink-0 w-full lg:w-48 space-y-2">
                                <div className="flex justify-between w-full text-[10px] font-mono font-bold text-zinc-400">
                                    <span>ALBUM PROGRESS</span>
                                    <span className="text-amber-500">{stickerStats.percent}%</span>
                                </div>
                                <div className="h-3 w-full bg-slate-100 dark:bg-zinc-950 rounded-full overflow-hidden relative border border-[#eeeeee] dark:border-white/5">
                                    <div 
                                        className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-1000 ease-out rounded-full relative" 
                                        style={{ width: `${stickerStats.percent}%` }}
                                    />
                                </div>
                                <span className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-widest text-center">
                                    {stickerStats.unlockedCount} / {stickerStats.totalCount} stickers adhered
                                </span>
                            </div>
                        </div>

                        {/* Searching categories filters */}
                        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                            <div className="flex flex-wrap gap-1.5 p-1 bg-zinc-100/60 dark:bg-[#0c0c0e]/60 rounded-xl border border-gray-200/30 dark:border-white/5 overflow-x-auto no-scrollbar max-w-full">
                                <button
                                    onClick={() => setSelectedStickerCategory('All')}
                                    className={`px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all cursor-pointer whitespace-nowrap ${
                                        selectedStickerCategory === 'All'
                                            ? 'bg-white dark:bg-zinc-850 text-gray-900 dark:text-white shadow-sm font-black'
                                            : 'text-zinc-500 hover:text-gray-950 dark:text-zinc-400 dark:hover:text-white'
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
                                            className={`px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                                                selectedStickerCategory === cat
                                                    ? 'bg-white dark:bg-zinc-850 text-gray-900 dark:text-white shadow-sm font-black'
                                                    : 'text-zinc-500 hover:text-gray-950 dark:text-zinc-400 dark:hover:text-white'
                                            }`}
                                        >
                                            {cat}
                                            {stats && stats.unlocked > 0 && (
                                                <span className={`text-[8px] px-1.5 py-0.2 rounded font-black leading-none ${stats.isCompleted ? 'bg-emerald-555 bg-emerald-500 text-white' : 'bg-amber-500/10 text-amber-500'}`}>
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
                                    className="w-full md:w-64 pl-10 pr-4 py-2 text-xs rounded-xl bg-white/70 dark:bg-zinc-900/60 border border-gray-200/50 dark:border-white/10 outline-none focus:border-indigo-555 focus:border-indigo-500 text-gray-800 dark:text-white font-medium"
                                />
                            </div>
                        </div>

                        {/* Booklet breakdown section */}
                        {selectedStickerCategory === 'All' && !stickerSearch && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                                {stickerStats.categoryBreakdowns.map(item => (
                                    <div 
                                        key={item.category}
                                        onClick={() => setSelectedStickerCategory(item.category)}
                                        className={`p-4 rounded-2xl border transition-all cursor-pointer hover:-translate-y-0.5 active:scale-98 ${
                                            item.isCompleted 
                                                ? 'bg-emerald-500/[0.03] dark:bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/[0.05]'
                                                : 'bg-[#fafafa] dark:bg-zinc-900/20 border-gray-200/40 dark:border-white/5 hover:bg-slate-100/50 dark:hover:bg-zinc-900/40'
                                        }`}
                                    >
                                        <span className="text-[8px] font-mono font-bold text-zinc-400 uppercase tracking-wider">{item.unlocked === item.total ? '🏆 PERFECT' : 'ALBUM SECTION'}</span>
                                        <h4 className="text-xs font-extrabold uppercase text-gray-900 dark:text-white mt-0.5 truncate">{item.category}</h4>
                                        <div className="mt-3 flex items-center justify-between text-[10px] font-mono text-zinc-400">
                                            <span className="text-zinc-500">{item.unlocked} of {item.total}</span>
                                            <span className={item.isCompleted ? 'text-emerald-500 font-bold' : 'text-amber-500 font-bold'}>{item.percent}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-100 dark:bg-zinc-950 rounded-full overflow-hidden mt-1.5">
                                            <div 
                                                className={`h-full rounded-full transition-all duration-500 ${item.isCompleted ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                                                style={{ width: `${item.percent}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="p-4 rounded-xl text-xs bg-indigo-500/5 text-indigo-700 dark:text-indigo-400 border border-indigo-500/10 font-semibold flex items-center gap-2">
                            <span className="material-icons-outlined text-md">lightbulb</span>
                            <span>
                                💡 <strong>Sticker Verification Tip:</strong> Collect adhesive stamps automatically when you configure past trips within <strong>65km</strong> of any landmark, or trigger manual overrides to document elder memories!
                            </span>
                        </div>

                        {/* Landmarks Grid and claims */}
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
                            {ICONIC_STICKERS.filter(sticker => {
                                const matchCategory = selectedStickerCategory === 'All' || sticker.category === selectedStickerCategory;
                                const searchLower = stickerSearch.toLowerCase();
                                const matchSearch = !stickerSearch || 
                                    sticker.name.toLowerCase().includes(searchLower) || 
                                    sticker.location.toLowerCase().includes(searchLower) || 
                                    sticker.countryCode.toLowerCase().includes(searchLower);
                                return matchCategory && matchSearch;
                            }).length === 0 && (
                                <div className="p-12 text-center text-zinc-400 font-mono font-bold uppercase tracking-wider border border-dashed border-gray-205 dark:border-zinc-805 rounded-xl">
                                    No landmarks matched your active filters 🧭
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}

                {/* 4. ACHIEVEMENTS VIEW PANEL */}
                {activeStatsTab === 'milestones' && (
                    <motion.div 
                        key="milestones-panel"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.22 }}
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

                {/* 5. COCKPIT ANALYTICS COCKPIT */}
                {activeStatsTab === 'analytics' && (
                    <motion.div 
                        key="analytics-panel"
                        variants={containerVariants}
                        initial="hidden"
                        animate="show"
                        exit="hidden"
                        className="space-y-8 animate-fade-in"
                    >
                        <motion.div variants={itemVariants} className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                            <div className="xl:col-span-2">
                                <FlightTrendChart data={flightTrendData} />
                            </div>
                            <div className="xl:col-span-1">
                                <DonutChart title="Preferred Cabin Profile" data={stats.seatCounts} />
                            </div>
                        </motion.div>

                        <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            <StatCard title="Continuous Air Journeys" value={stats.totalFlights} icon="flight_takeoff" color="blue" />
                            <StatCard title="Accumulated Coverage" value={`${(stats.totalDistance / 1000).toFixed(1)}k km`} subtitle={`${stats.earthCircumnavigations}x Globe Rotations`} icon="public" color="emerald" />
                            <StatCard title="Total Flight Hours" value={`${stats.totalDurationHours}h`} subtitle={`${stats.daysInAir} Days aloft`} icon="schedule" color="purple" />
                            <StatCard title="Main Airport Hub" value={stats.topAirports[0]?.label || '-'} subtitle={`${stats.topAirports[0]?.count || 0} landings recorded`} icon="place" color="amber" />
                        </motion.div>

                        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-1">
                                <ExtremeFlightCard type="Longest" flight={stats.longestFlight} color="indigo" />
                            </div>
                            <div className="lg:col-span-1">
                                <ExtremeFlightCard type="Shortest" flight={stats.shortestFlight} color="rose" />
                            </div>
                            <div className="lg:col-span-1">
                                <div className="bg-white/70 dark:bg-[#0c0c0e]/80 border border-gray-200/50 dark:border-white/5 rounded-[2.2rem] p-6 backdrop-blur-2xl h-full flex flex-col justify-between">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest">Preferred Class Segment</h3>
                                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                                    </div>
                                    <div className="flex-1 flex flex-col justify-center space-y-3.5">
                                        {stats.classCounts.map((cabin, idx) => (
                                            <div key={idx} className="space-y-1.5">
                                                <div className="flex justify-between text-[11px] font-mono">
                                                    <span className="font-bold text-zinc-650 dark:text-zinc-350">{cabin.label}</span>
                                                    <span className="font-bold text-zinc-800 dark:text-zinc-100">{cabin.value} trips</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full" style={{ width: `${(cabin.value / stats.totalFlights) * 100}%`, backgroundColor: cabin.color }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>

                        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <TopList title="Most Landed Airport Hubs" items={stats.topAirports} icon="apartment" color="amber" />
                            <TopList title="Primary Registered Airlines" items={stats.topAirlines} icon="flight" color="blue" />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

        {/* Live Active Flights dialog modal */}
        <FlightTrackerModal isOpen={isFlightTrackerOpen} onClose={() => setIsFlightTrackerOpen(false)} suggestedFlight={todaysFlight} />
    </div>
  );
};
