import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { confirmDialog } from '../services/confirm';
import { affectsCollections } from '../hooks/useWanderSync';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { createPortal } from 'react-dom';
import { ViewState, VisitedItem, Trip, CountryResidenceStatus, getResidenceStatuses, toggleCountryResidenceStatus } from '../types';
import { dataService } from '../services/mockDb';
import { getFlagEmoji, getRegion } from '../services/geoData';
import { resolvePlaceName, getCoordinates, cleanCityName, formatPlaceName, refineUKCountry, STATIC_GEO_DATA } from '../services/geocoding';
import {
  mergeCountryRecords, planCountryCleanup, normalizeCountryCode, canonicalCountryName, countryId,
  findCountryRecord, ukNationsFromCities, excludedCountryCodes, type MergedCountry
} from '../services/countryRegistry';
import { motion, AnimatePresence } from 'motion/react';
import { Compass, MapPin, Globe, Plus, Trash as Trash2, PencilSimpleLine as Edit3, MapTrifold as MapIcon, ArrowsClockwise as RefreshCw, CheckCircle as CheckCircle2, Stack as Layers, Info, X, Sparkle as Sparkles, Funnel as Filter, Check, Star, Airplane as Plane, House as Home, Bank as Landmark, MagnifyingGlass } from '@phosphor-icons/react';
import { Button, Select, Tabs } from '../components/ui';
import { mergeCityRecords, planCityCleanup, splitCombinedPlaces } from '../services/cityRegistry';
import type { Tab } from '../components/ui';
import { EmptyState } from '../components/EmptyState';
import { formatDate } from '../utils/formatters';
import { GlassPanel } from '../components/glass/GlassPanel';
import { CLOSE_BTN_STYLE, INPUT_BASE_STYLE } from '../constants';

interface TravelAtlasProps {
  onTripClick?: (tripId: string) => void;
}

export const TravelAtlas: React.FC<TravelAtlasProps> = ({ onTripClick }) => {
  const [visitedItems, setVisitedItems] = useState<VisitedItem[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [flights, setFlights] = useState<any[]>([]);
  const [roadTrips, setRoadTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'visited' | 'layovers' | 'wishlist' | 'cities' | 'sync'>('visited');

  // Filter / Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [regionFilter, setRegionFilter] = useState('All');

  // Modal / Form state for Add/Edit Country/City
  const [isModalOpen, setIsModalOpen] = useState(false);
  useEscapeKey(isModalOpen, useCallback(() => setIsModalOpen(false), []));
  const [modalType, setModalType] = useState<'country' | 'city'>('country');
  const [editingItem, setEditingItem] = useState<VisitedItem | null>(null);

  // Form Fields
  const [formCountryCode, setFormCountryCode] = useState('');
  const [formCountryName, setFormCountryName] = useState('');
  const [formCityName, setFormCityName] = useState('');
  const [formLat, setFormLat] = useState('');
  const [formLng, setFormLng] = useState('');
  const [formVisitDate, setFormVisitDate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formIsTransit, setFormIsTransit] = useState(false);
  const [formResidenceStatuses, setFormResidenceStatuses] = useState<CountryResidenceStatus[]>(['visited']);

  // Interactive Scan results
  const [scanActive, setScanActive] = useState(false);
  const [scanResults, setScanResults] = useState<{
    countries: { code: string; name: string; source: 'flight' | 'trip' | 'layover' | 'roadtrip'; date: string }[];
    cities: { name: string; countryCode: string; countryName: string; source: 'flight' | 'trip' | 'layover' | 'roadtrip'; date: string; lat?: number; lng?: number }[];
  }>({ countries: [], cities: [] });
  
  const [selectedScanCountries, setSelectedScanCountries] = useState<Set<string>>(new Set());
  const [selectedScanCities, setSelectedScanCities] = useState<Set<string>>(new Set());

  // Load everything
  const loadData = async () => {
    setLoading(true);
    try {
      const visited = await dataService.getVisited();
      const allTrips = await dataService.getTrips();
      const allFlights = await dataService.getFlights();
      const allRoadTrips = await dataService.getRoadTrips();
      
      setVisitedItems(visited || []);
      setTrips(allTrips || []);
      setFlights(allFlights || []);
      setRoadTrips(allRoadTrips || []);
    } catch (e) {
      console.error("Failed to load Travel Atlas log data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Sync / Listen for updates
  useEffect(() => {
    const handleUpdate = (e: Event) => {
      if (affectsCollections(e, ['visited', 'trips', 'flights'])) void loadData();
    };
    window.addEventListener('wandergrid_db_updated', handleUpdate);
    return () => {
      window.removeEventListener('wandergrid_db_updated', handleUpdate);
    };
  }, []);

  const resolveAirportCity = useCallback((code: string) => {
    const ap = STATIC_GEO_DATA[code];
    if (!ap?.city) return undefined;
    return { city: ap.city as string, countryCode: ap.iso as string, lat: parseFloat(ap.lat), lng: parseFloat(ap.lon) };
  }, []);

  // Which UK nations a stored "Great Britain / United Kingdom" record stands for, judged by its tracked cities.
  const ukNationsFor = useCallback(
    () => ukNationsFromCities(visitedItems, name => refineUKCountry(name, 'United Kingdom', 'GB').countryCode),
    [visitedItems]
  );

  // One record per country: duplicates merged, the UK shown as its individual nations.
  const countryRecords = useMemo(
    () => mergeCountryRecords(visitedItems, { ukConstituentsFor: ukNationsFor }),
    [visitedItems, ukNationsFor]
  );

  const cleanupPlan = useMemo(
    () => planCountryCleanup(visitedItems, { ukConstituentsFor: ukNationsFor }),
    [visitedItems, ukNationsFor]
  );
  const cityCleanupPlan = useMemo(
    () => planCityCleanup(visitedItems, { resolveAirport: resolveAirportCity }),
    [visitedItems, resolveAirportCity]
  );
  const cleanupCount = cleanupPlan.upserts.length + cleanupPlan.deleteIds.length
    + cityCleanupPlan.upserts.length + cityCleanupPlan.deleteIds.length;
  const [cleaningUp, setCleaningUp] = useState(false);

  // Scopes and Unique regions
  const uniqueRegions = useMemo(() => {
    const regions = new Set<string>();
    countryRecords.forEach(item => regions.add(getRegion(item.code)));
    visitedItems.forEach(item => {
      if (item.type === 'city' && item.countryCode) regions.add(getRegion(normalizeCountryCode(item.countryCode)));
    });
    return ['All', ...Array.from(regions)];
  }, [countryRecords, visitedItems]);

  // Visited vs Layover vs Wishlist split
  const visitedCountriesList = useMemo(() => {
    return countryRecords.filter(item => {
      const statuses = getResidenceStatuses(item);
      return statuses.some(s => s === 'visited' || s === 'lived_past' || s === 'lived_current');
    });
  }, [countryRecords]);

  const layoverCountriesList = useMemo(() => {
    return countryRecords.filter(item => {
      const statuses = getResidenceStatuses(item);
      return statuses.includes('layover') || item.isTransit === true;
    });
  }, [countryRecords]);

  const wishlistCountriesList = useMemo(() => {
    return countryRecords.filter(item => {
      const statuses = getResidenceStatuses(item);
      return statuses.includes('wishlist');
    });
  }, [countryRecords]);

  // Filtering processed
  const filteredVisitedCountries = useMemo(() => {
    return visitedCountriesList.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.code.toLowerCase().includes(searchQuery.toLowerCase());
      const region = getRegion(item.code);
      const matchesRegion = regionFilter === 'All' || region === regionFilter;
      return matchesSearch && matchesRegion;
    }).sort((a,b) => a.name.localeCompare(b.name));
  }, [visitedCountriesList, searchQuery, regionFilter]);

  const filteredLayoverCountries = useMemo(() => {
    return layoverCountriesList.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.code.toLowerCase().includes(searchQuery.toLowerCase());
      const region = getRegion(item.code);
      const matchesRegion = regionFilter === 'All' || region === regionFilter;
      return matchesSearch && matchesRegion;
    }).sort((a,b) => a.name.localeCompare(b.name));
  }, [layoverCountriesList, searchQuery, regionFilter]);

  const filteredWishlistCountries = useMemo(() => {
    return wishlistCountriesList.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.code.toLowerCase().includes(searchQuery.toLowerCase());
      const region = getRegion(item.code);
      const matchesRegion = regionFilter === 'All' || region === regionFilter;
      return matchesSearch && matchesRegion;
    }).sort((a,b) => a.name.localeCompare(b.name));
  }, [wishlistCountriesList, searchQuery, regionFilter]);

  // Dynamically combine manual city registry entries with live trips, flights, and road trips
  const allTrackedCities = useMemo(() => {
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
  }, [visitedItems, trips, roadTrips, flights]);

  const filteredCities = useMemo(() => {
    return allTrackedCities.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || (item.countryName || '').toLowerCase().includes(searchQuery.toLowerCase());
      const region = item.countryCode ? getRegion(item.countryCode) : 'Unknown';
      const matchesRegion = regionFilter === 'All' || region === regionFilter;
      return matchesSearch && matchesRegion;
    }).sort((a,b) => a.name.localeCompare(b.name));
  }, [allTrackedCities, searchQuery, regionFilter]);

  // Statistics
  const stats = useMemo(() => {
    return {
      totalCountries: visitedCountriesList.length,
      wishlistCount: wishlistCountriesList.length,
      transitCount: layoverCountriesList.length,
      totalCities: allTrackedCities.length,
      worldPercentage: Math.max(0.1, Math.min(100, Math.round((visitedCountriesList.length / 198) * 1000) / 10))
    };
  }, [visitedCountriesList, wishlistCountriesList, layoverCountriesList, allTrackedCities]);

  // Launch Add/Edit Dialog
  const handleOpenAdd = (type: 'country' | 'layover' | 'wishlist' | 'city') => {
    setEditingItem(null);
    setModalType(type === 'city' ? 'city' : 'country');
    setFormCountryCode('');
    setFormCountryName('');
    setFormCityName('');
    setFormLat('');
    setFormLng('');
    setFormVisitDate(new Date().toISOString().split('T')[0]);
    setFormNotes('');
    setFormIsTransit(type === 'layover');
    setFormResidenceStatuses(type === 'wishlist' ? ['wishlist'] : type === 'layover' ? ['layover'] : ['visited']);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: VisitedItem) => {
    setEditingItem(item);
    setModalType(item.type);
    setFormCountryCode(item.countryCode || item.code);
    setFormCountryName(item.countryName || item.name);
    setFormCityName(item.type === 'city' ? item.name : '');
    setFormLat(item.lat ? String(item.lat) : '');
    setFormLng(item.lng ? String(item.lng) : '');
    setFormVisitDate(item.visitDate || '');
    setFormNotes(item.notes || '');
    setFormIsTransit(!!item.isTransit);
    setFormResidenceStatuses(getResidenceStatuses(item));
    setIsModalOpen(true);
  };

  // Merged records carry bookkeeping ids; never persist them, and remove the stale copies they replaced.
  const toStored = (item: VisitedItem): VisitedItem => {
    const { duplicateIds: _dup, ...rest } = item as MergedCountry;
    return rest;
  };
  const removeDuplicatesOf = async (item: VisitedItem) => {
    const stored = new Set(visitedItems.map(v => v.id));
    const dup = ((item as MergedCountry).duplicateIds || []).filter(id => stored.has(id));
    for (const id of dup) await dataService.deleteVisited(id);
  };

  // Promote a wishlist country to a visited country with 1 click
  const handlePromoteWishlistToVisited = async (item: VisitedItem) => {
    try {
      const current = getResidenceStatuses(item);
      const filtered = current.filter(s => s !== 'wishlist' && s !== 'layover');
      const nextStatuses = filtered.length > 0 ? filtered : ['visited' as CountryResidenceStatus];
      await dataService.updateVisited({
        ...toStored(item),
        residenceStatus: nextStatuses[0],
        residenceStatuses: nextStatuses,
        isTransit: false,
        visitDate: new Date().toISOString().split('T')[0]
      });
      await removeDuplicatesOf(item);
      void loadData();
      window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
    } catch (err) {
      console.error("Failed to promote wishlist country:", err);
    }
  };

  // Promote a layover country to a visited country with 1 click
  const handlePromoteLayoverToVisited = async (item: VisitedItem) => {
    try {
      const current = getResidenceStatuses(item);
      const filtered = current.filter(s => s !== 'wishlist' && s !== 'layover');
      const nextStatuses = filtered.length > 0 ? filtered : ['visited' as CountryResidenceStatus];
      await dataService.updateVisited({
        ...toStored(item),
        residenceStatus: nextStatuses[0],
        residenceStatuses: nextStatuses,
        isTransit: false,
        visitDate: item.visitDate || new Date().toISOString().split('T')[0]
      });
      await removeDuplicatesOf(item);
      void loadData();
      window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
    } catch (err) {
      console.error("Failed to promote layover country:", err);
    }
  };

  // Autocomplete geolocation coordinates when country changes in manual form
  const handleResolveCoordsForCity = async (cityName: string) => {
    if (!cityName.trim()) return;
    try {
      const coords = await getCoordinates(cityName);
      if (coords) {
        setFormLat(String(coords.lat));
        setFormLng(String(coords.lng));
      }
    } catch (e) {
      console.warn("Could not geocode city coords", e);
    }
  };

  // Save changes
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (modalType === 'country') {
        const statuses = formResidenceStatuses.length > 0 ? formResidenceStatuses : ['visited' as CountryResidenceStatus];
        const isLayover = statuses.includes('layover');
        const primaryStatus = statuses[0] || 'visited';
        const code = normalizeCountryCode(formCountryCode);
        // Adding a country that is already recorded updates that record instead of creating a second one.
        const existing = editingItem ? undefined : findCountryRecord(visitedItems, code, formCountryName);
        const target = editingItem || existing;
        const payload: VisitedItem = {
          id: target?.id || countryId(code),
          type: 'country',
          code,
          name: canonicalCountryName(code, formCountryName),
          visitDate: formVisitDate,
          notes: formNotes,
          isTransit: isLayover,
          residenceStatus: primaryStatus,
          residenceStatuses: statuses,
          excluded: false,
          isManual: target ? target.isManual : true
        };

        if (target) {
          await dataService.updateVisited({ ...toStored(target), ...payload });
          await removeDuplicatesOf(target);
        } else {
          await dataService.addVisited(payload);
        }
      } else {
        // Resolve coordinates double check
        let finalLat = parseFloat(formLat);
        let finalLng = parseFloat(formLng);
        if (isNaN(finalLat) || isNaN(finalLng)) {
          const rawCoords = await getCoordinates(`${formCityName}, ${formCountryName}`);
          if (rawCoords) {
            finalLat = rawCoords.lat;
            finalLng = rawCoords.lng;
          }
        }

        const payload: VisitedItem = {
          id: editingItem?.id || `city_${formCityName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
          type: 'city',
          code: formCityName,
          name: formCityName,
          countryCode: formCountryCode.toUpperCase(),
          countryName: formCountryName,
          lat: finalLat,
          lng: finalLng,
          visitDate: formVisitDate,
          notes: formNotes,
          isManual: editingItem ? editingItem.isManual : true
        };

        if (editingItem) {
          await dataService.updateVisited(payload);
          await removeDuplicatesOf(editingItem);
        } else {
          await dataService.addVisited(payload);
        }
      }

      setIsModalOpen(false);
      void loadData();
      
      // Dispatch standard model mutation trigger to synchronize SWR / external caches instantly!
      window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
    } catch (err) {
      console.error("Failed to save visited item:", err);
    }
  };

  // Toggle Transit Mode quickly in place
  const handleToggleTransit = async (item: VisitedItem) => {
    try {
      const updated = { ...toStored(item), isTransit: !item.isTransit };
      await dataService.updateVisited(updated);
      await removeDuplicatesOf(item);
      void loadData();
      window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
    } catch (err) {
      console.error("Failed to toggle transit mode of country:", err);
    }
  };

  // Delete visited item
  const handleDeleteItem = async (id: string) => {
    if (!(await confirmDialog({ title: 'Remove from Atlas?', message: 'Remove this item from your Atlas? Your maps and statistics update straight away.', confirmLabel: 'Remove', danger: true }))) return;
    try {
      await dataService.deleteVisited(id);
      // A merged country may stand for several stored records; remove them all or the copy reappears.
      const record = countryRecords.find(r => r.id === id) || allTrackedCities.find(r => r.id === id);
      if (record) await removeDuplicatesOf(record);
      void loadData();
      window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
    } catch (err) {
      console.error("Failed to delete visited item:", err);
    }
  };

  // Persist the merge so every other screen sees the same single record per country.
  const handleConsolidate = async () => {
    setCleaningUp(true);
    try {
      const storedIds = new Set(visitedItems.map(v => v.id));
      for (const record of [...cleanupPlan.upserts, ...cityCleanupPlan.upserts]) {
        if (storedIds.has(record.id)) await dataService.updateVisited(record);
        else await dataService.addVisited(record);
      }
      for (const id of [...cleanupPlan.deleteIds, ...cityCleanupPlan.deleteIds]) await dataService.deleteVisited(id);
      await loadData();
      window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
    } catch (err) {
      console.error("Failed to merge duplicate country records:", err);
    } finally {
      setCleaningUp(false);
    }
  };

  // Perform Historical Travel Scan (Flights, Planners, Stops)
  const handleRunScan = async () => {
    setScanActive(true);
    try {
      // Countries & Cities already logged in current visitedItems set to ignore duplicate suggestions
      const existingCountryCodes = new Set([
        ...countryRecords.map(item => normalizeCountryCode(item.code)),
        ...excludedCountryCodes(visitedItems),
      ]);
      const existingCityKeys = new Set(
        visitedItems.filter(item => item.type === 'city').map(item => `${cleanCityName(item.name, item.countryCode).toLowerCase()}_${(item.countryCode || '').toLowerCase()}`)
      );
      const existingCityNames = new Set(
        visitedItems.filter(item => item.type === 'city').map(item => cleanCityName(item.name, item.countryCode).toLowerCase())
      );

      const foundCountries: Record<string, { code: string; name: string; source: 'flight' | 'trip' | 'layover' | 'roadtrip'; date: string }> = {};
      const foundCities: Record<string, { name: string; countryCode: string; countryName: string; source: 'flight' | 'trip' | 'layover' | 'roadtrip'; date: string; lat?: number; lng?: number }> = {};

      const registerCandidate = async (
        rawLocation: string | undefined, 
        source: 'flight' | 'trip' | 'layover' | 'roadtrip', 
        dateStr?: string, 
        latFallback?: number, 
        lngFallback?: number
      ) => {
        if (!rawLocation || typeof rawLocation !== 'string' || !rawLocation.trim()) return;
        const res = await resolvePlaceName(rawLocation.trim());
        if (res && res.city) {
          const countryCode = normalizeCountryCode(res.countryCode || 'XX');
          const canonicalCity = cleanCityName(res.city, countryCode);
          const countryName = countryCode !== 'XX' ? canonicalCountryName(countryCode, res.country || 'Unknown') : (res.country || 'Unknown');
          const cityKey = `${canonicalCity.toLowerCase()}_${countryCode.toLowerCase()}`;
          const cityNameLower = canonicalCity.toLowerCase();

          // Register country if unrecorded
          if (countryCode !== 'XX' && !existingCountryCodes.has(countryCode) && !foundCountries[countryCode]) {
            foundCountries[countryCode] = {
              code: countryCode,
              name: countryName,
              source: source,
              date: dateStr || new Date().toISOString()
            };
          }

          // Register city if unrecorded
          if (!existingCityKeys.has(cityKey) && !existingCityNames.has(cityNameLower) && !foundCities[cityKey]) {
            const coords = (res as any).coordinates || (res as any);
            const resolvedLat = coords?.lat !== undefined ? coords.lat : undefined;
            const resolvedLng = coords?.lng !== undefined ? coords.lng : (coords?.lon !== undefined ? coords.lon : undefined);
            foundCities[cityKey] = {
              name: canonicalCity,
              countryCode: countryCode,
              countryName: countryName,
              source: source,
              date: dateStr || new Date().toISOString(),
              lat: latFallback !== undefined ? latFallback : resolvedLat,
              lng: lngFallback !== undefined ? lngFallback : resolvedLng
            };
          }
        }
      };

      // 1. Process flight log data
      for (const f of flights) {
        if (!f || f.status === 'Cancelled') continue;
        
        // Origin as potential layover or start
        if (f.origin && !f.layover) {
          await registerCandidate(f.origin, 'flight', f.departureDate || f.date, f.originLat, f.originLng);
        }

        // Destination as visited or layover
        if (f.destination) {
          await registerCandidate(f.destination, f.isLayover ? 'layover' : 'flight', f.arrivalDate || f.date, f.destLat, f.destLng);
        }
      }

      // 2. Process road trip / land travel log data
      for (const r of roadTrips) {
        if (!r || r.status === 'Cancelled') continue;
        
        if (r.origin) {
          await registerCandidate(r.origin, 'roadtrip', r.departureDate || r.date, r.originLat || r.lat, r.originLng || r.lng);
        }

        if (r.destination) {
          await registerCandidate(r.destination, 'roadtrip', r.arrivalDate || r.date, r.destLat || r.lat, r.destLng || r.lng);
        }
      }

      // 3. Process custom trips / planners (Accommodations / georoutes / stops)
      const pastTrips = trips.filter(t => t.status !== 'Planning' && t.status !== 'Cancelled');
      for (const t of pastTrips) {
        if (t.location) {
          await registerCandidate(t.location, 'trip', t.endDate, t.coordinates?.lat, t.coordinates?.lng);
        }

        // Stops / waypoints inside Route Manager
        if (t.locations && Array.isArray(t.locations)) {
          for (const l of t.locations) {
            if (l.name) {
              await registerCandidate(l.name, 'trip', t.endDate, l.coordinates?.lat, l.coordinates?.lng);
            }
          }
        }
      }

      const countriesList = Object.values(foundCountries);
      const citiesList = Object.values(foundCities);

      setScanResults({ countries: countriesList, cities: citiesList });

      // Automatically select candidates
      setSelectedScanCountries(new Set(countriesList.map(c => c.code)));
      setSelectedScanCities(new Set(citiesList.map(ci => ci.name)));

    } catch (err) {
      console.error("Scanning travel archives failed:", err);
    } finally {
      setScanActive(false);
    }
  };

  // Add selected scan suggestions to Visited DB
  const handleBulkImport = async () => {
    const importItems: VisitedItem[] = [];
    setLoading(true);

    try {
      // Countries to import
      for (const candidate of scanResults.countries) {
        // Re-check against current data: the scan may be stale, and the bulk write upserts by id.
        if (selectedScanCountries.has(candidate.code) && !findCountryRecord(countryRecords, candidate.code, candidate.name)) {
          importItems.push({
            id: countryId(candidate.code),
            type: 'country',
            code: normalizeCountryCode(candidate.code),
            name: canonicalCountryName(candidate.code, candidate.name),
            visitDate: candidate.date,
            isTransit: candidate.source === 'layover',
            isManual: false,
            notes: `Auto-scanned from ${candidate.source} history`
          });
        }
      }

      // Cities to import
      for (const candidate of scanResults.cities) {
        if (selectedScanCities.has(candidate.name)) {
          let lat = candidate.lat;
          let lng = candidate.lng;

          // If coordinates are missing, resolve them on import
          if (!lat || !lng) {
            try {
              const res = await getCoordinates(`${candidate.name}, ${candidate.countryName}`);
              if (res) {
                lat = res.lat;
                lng = res.lng;
              }
            } catch (e) {}
          }

          importItems.push({
            id: `city_${candidate.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
            type: 'city',
            code: candidate.name,
            name: candidate.name,
            countryCode: candidate.countryCode,
            countryName: candidate.countryName === 'Imported' ? '' : candidate.countryName,
            lat,
            lng,
            visitDate: candidate.date,
            isManual: false,
            notes: `Auto-scanned from ${candidate.source} logs`
          });
        }
      }

      if (importItems.length > 0) {
        // Perform bulk batch insert
        await dataService.addVisitedBulk(importItems);
        setIsModalOpen(false);
        setScanResults({ countries: [], cities: [] });
        await loadData();
        window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
      }
    } catch (err) {
      console.error("Bulk travel footprint import failed:", err);
    } finally {
      setLoading(false);
    }
  };

  // Run initial scan automatically if there are no items logged
  useEffect(() => {
    if (!loading && visitedItems.length === 0 && (flights.length > 0 || trips.length > 0)) {
      void handleRunScan();
    }
  }, [loading, visitedItems.length]);

  // ---- Dashboard derived data ----
  // Donut: top 5 regions + "Other". Colours are fixed slots from the dataviz palette (see .atlas-viz in styles.css).
  const [hoverRegion, setHoverRegion] = useState<string | null>(null);
  const DONUT_R = 38;
  const DONUT_C = 2 * Math.PI * DONUT_R;
  const regionSlices = useMemo(() => {
    const counts = new Map<string, number>();
    visitedCountriesList.forEach(item => {
      const region = getRegion(item.code);
      counts.set(region, (counts.get(region) || 0) + 1);
    });
    const sorted = Array.from(counts.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const head = sorted.length > 6 ? sorted.slice(0, 5) : sorted;
    const tail = sorted.length > 6 ? sorted.slice(5) : [];
    const rows = [
      ...head.map((r, i) => ({ ...r, color: `--viz-${i + 1}`, isOther: false })),
      ...(tail.length > 0 ? [{ label: 'Other', count: tail.reduce((n, r) => n + r.count, 0), color: '--viz-other', isOther: true }] : []),
    ];
    const total = rows.reduce((n, r) => n + r.count, 0) || 1;
    const GAP = rows.length > 1 ? 1.5 : 0;
    let cursor = 0;
    return rows.map(r => {
      const len = (r.count / total) * DONUT_C;
      const slice = { ...r, percent: Math.round((r.count / total) * 100), dash: Math.max(0, len - GAP), offset: cursor };
      cursor += len;
      return slice;
    });
  }, [visitedCountriesList]);
  const hoveredSlice = regionSlices.find(s => s.label === hoverRegion) || null;

  const atlasTabs: Tab[] = [
    { id: 'visited', label: 'Visited', count: visitedCountriesList.length, icon: <Globe className="w-5 h-5" weight="duotone" />, color: 'primary' },
    { id: 'layovers', label: 'Layovers', count: layoverCountriesList.length, icon: <Plane className="w-5 h-5" weight="duotone" />, color: 'amber' },
    { id: 'wishlist', label: 'Wishlist', count: wishlistCountriesList.length, icon: <Star className="w-5 h-5" weight="duotone" />, color: 'rose' },
    { id: 'cities', label: 'Cities', count: filteredCities.length, icon: <MapPin className="w-5 h-5" weight="duotone" />, color: 'blue' },
    { id: 'sync', label: 'Sync', count: scanResults.countries.length + scanResults.cities.length > 0 ? scanResults.countries.length + scanResults.cities.length : undefined, icon: <RefreshCw className="w-5 h-5" weight="duotone" />, color: 'indigo' },
  ];

  const statTiles = [
    { label: 'Countries', value: stats.totalCountries, icon: Globe, tone: 'text-primary-500', tab: 'visited' as const },
    { label: 'Cities', value: stats.totalCities, icon: MapPin, tone: 'text-blue-500', tab: 'cities' as const },
    { label: 'Layovers', value: stats.transitCount, icon: Plane, tone: 'text-amber-500', tab: 'layovers' as const },
    { label: 'Wishlist', value: stats.wishlistCount, icon: Star, tone: 'text-rose-500', tab: 'wishlist' as const },
  ];

  const STATUS_PILLS: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
    visited: { label: 'Visited', icon: Sparkles, cls: 'bg-primary-500/10 text-primary-700 dark:text-primary-300 border-primary-500/25' },
    lived_past: { label: 'Past home', icon: Landmark, cls: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/25' },
    lived_current: { label: 'Home', icon: Home, cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25' },
    layover: { label: 'Layover', icon: Plane, cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25' },
    wishlist: { label: 'Wishlist', icon: Star, cls: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25' },
  };

  const iconBtn = 'w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary transition-colors cursor-pointer';

  const renderRowActions = (item: VisitedItem, removeLabel: string) => (
    <div className="flex items-center shrink-0">
      <button type="button" onClick={() => handleOpenEdit(item)} className={`${iconBtn} hover:text-primary-500 hover:bg-black/5 dark:hover:bg-white/5`} aria-label={`Edit ${item.name}`}>
        <Edit3 className="w-5 h-5" />
      </button>
      <button type="button" onClick={() => handleDeleteItem(item.id)} className={`${iconBtn} hover:text-rose-500 hover:bg-rose-500/10`} aria-label={`${removeLabel} ${item.name}`}>
        <Trash2 className="w-5 h-5" />
      </button>
    </div>
  );

  const renderCountryRows = (items: VisitedItem[], kind: 'visited' | 'layover' | 'wishlist') => {
    const cfg = {
      visited: { dateLabel: 'Visited', actionLabel: 'To layovers', ActionIcon: Plane, act: handleToggleTransit },
      layover: { dateLabel: 'Transit', actionLabel: 'Mark visited', ActionIcon: Sparkles, act: handlePromoteLayoverToVisited },
      wishlist: { dateLabel: 'Target', actionLabel: 'Mark visited', ActionIcon: Sparkles, act: handlePromoteWishlistToVisited },
    }[kind];

    return (
      <GlassPanel className="wg-glass-card shadow-glass-card overflow-hidden border border-black/5 dark:border-white/10" overrides={{ borderRadius: 28 }} padding="0px">
        <ul className="divide-y divide-black/5 dark:divide-white/5 rounded-[28px] overflow-hidden">
          {items.map(item => {
            const statuses = kind === 'visited'
              ? getResidenceStatuses(item).filter(s => s === 'visited' || s === 'lived_past' || s === 'lived_current')
              : kind === 'layover'
                ? ['layover', ...(getResidenceStatuses(item).includes('wishlist') ? ['wishlist'] : [])]
                : ['wishlist'];
            return (
              <li key={item.id} className="p-4 sm:px-6 flex flex-col md:flex-row md:items-center gap-3 md:gap-6 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <span className="text-3xl shrink-0" role="img" aria-label={`${item.name} flag`}>{getFlagEmoji(item.code)}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="font-bold text-base tracking-tight truncate">{item.name}</h3>
                      {statuses.map(s => {
                        const pill = STATUS_PILLS[s];
                        if (!pill) return null;
                        const PillIcon = pill.icon;
                        return (
                          <span key={s} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider border leading-none ${pill.cls}`}>
                            <PillIcon className="w-3 h-3" weight="fill" />
                            {pill.label}
                          </span>
                        );
                      })}
                    </div>
                    <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary truncate mt-0.5">
                      {item.code} · {getRegion(item.code)}
                      {item.notes ? <span className="italic"> · {item.notes}</span> : null}
                    </p>
                  </div>
                </div>

                <div className="md:w-36 shrink-0">
                  <span className="block text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">{cfg.dateLabel}</span>
                  <span className="text-sm font-semibold tabular-nums">{item.visitDate ? formatDate(item.visitDate, 'short-with-year') : '—'}</span>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-2 shrink-0">
                  <Button variant="secondary" size="sm" onClick={() => cfg.act(item)} icon={<cfg.ActionIcon className="w-4 h-4" />}>
                    {cfg.actionLabel}
                  </Button>
                  {renderRowActions(item, 'Remove')}
                </div>
              </li>
            );
          })}
        </ul>
      </GlassPanel>
    );
  };

  const hasScanFindings = scanResults.countries.length > 0 || scanResults.cities.length > 0;
  const searchNoun = activeTab === 'visited' ? 'countries' : activeTab === 'layovers' ? 'layovers' : activeTab === 'wishlist' ? 'wishlist' : 'cities';

  return (
    <div className="w-full max-w-[1680px] mx-auto pt-2 sm:pt-4 px-1 sm:px-4 md:px-6 lg:px-8 flex flex-col gap-5 sm:gap-6 animate-fadeIn pb-16 text-light-text dark:text-dark-text">

      {/* HERO HEADER */}
      <div className="flex flex-row items-center justify-between gap-2.5 sm:gap-4 w-full pt-1 pb-1">
        <div className="flex items-center justify-start gap-2 sm:gap-3 md:gap-4 min-w-0">
          <Compass className="w-6 h-6 sm:w-9 sm:h-9 md:w-12 md:h-12 text-rose-500 dark:text-rose-400 shrink-0" weight="duotone" />
          <h1 className="text-xl sm:text-3xl md:text-5xl font-black text-light-text dark:text-dark-text tracking-tight leading-tight sm:leading-none truncate sm:overflow-visible">
            Travel Atlas
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button onClick={handleRunScan} variant="outline" id="btn-scan-log" aria-label="Scan travel history" icon={<RefreshCw className="w-4 h-4" />}>
            <span className="hidden sm:inline">Scan</span>
          </Button>
          <Button onClick={() => handleOpenAdd('city')} variant="outline" id="btn-add-city" aria-label="Add city" className="hidden md:inline-flex" icon={<Plus className="w-4 h-4" />}>
            City
          </Button>
          <Button variant="primary" vibrant onClick={() => handleOpenAdd('country')} id="btn-add-country" aria-label="Add visited country" icon={<Plus className="w-4 h-4" />}>
            Country
          </Button>
        </div>
      </div>

      {/* OVERVIEW: stats + coverage + region split in one compact card */}
      <GlassPanel className="atlas-viz wg-glass-card shadow-glass-card overflow-hidden border border-black/5 dark:border-white/10" overrides={{ borderRadius: 28 }} padding="0px">
        <div className="rounded-[28px] overflow-hidden grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-black/5 dark:divide-white/5">
          {/* Stats + coverage */}
          <div className="lg:col-span-7 flex flex-col">
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-black/5 dark:divide-white/5 flex-1">
              {statTiles.map((tile, i) => {
                const TileIcon = tile.icon;
                return (
                  <button
                    key={tile.label}
                    type="button"
                    onClick={() => setActiveTab(tile.tab)}
                    className={`px-4 py-3.5 min-h-[44px] flex items-center gap-3 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors cursor-pointer ${i >= 2 ? 'border-t sm:border-t-0 border-black/5 dark:border-white/5' : ''}`}
                    aria-label={`${tile.label}: ${tile.value}`}
                  >
                    <TileIcon className={`w-6 h-6 shrink-0 ${tile.tone}`} weight="duotone" />
                    <span className="min-w-0">
                      <span className="block text-2xl font-black tabular-nums leading-none">{tile.value}</span>
                      <span className="block text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary mt-1 truncate">{tile.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="px-4 py-3 border-t border-black/5 dark:border-white/5 flex items-center gap-3">
              <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary shrink-0">World</span>
              <div
                className="flex-1 h-2 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden"
                role="progressbar"
                aria-label="World coverage"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={stats.worldPercentage}
              >
                <div className="h-full rounded-full bg-primary-500 transition-all duration-500" style={{ width: `${stats.worldPercentage}%` }} />
              </div>
              <span className="text-xs font-bold tabular-nums shrink-0">{stats.worldPercentage}% · {stats.totalCountries}/198</span>
            </div>
          </div>

          {/* Region split */}
          <div className="lg:col-span-5 p-4 flex items-center gap-4">
            {regionSlices.length === 0 ? (
              <p className="text-sm font-semibold text-light-text-secondary dark:text-dark-text-secondary">No visited countries yet</p>
            ) : (
              <>
                <div className="relative w-24 h-24 shrink-0">
                  <svg
                    viewBox="0 0 100 100"
                    className="w-full h-full -rotate-90"
                    role="img"
                    aria-label={`Visited countries by region: ${regionSlices.map(s => `${s.label} ${s.count}`).join(', ')}`}
                  >
                    {regionSlices.map(slice => (
                      <circle
                        key={slice.label}
                        cx="50" cy="50" r={DONUT_R} fill="none"
                        stroke={`var(${slice.color})`}
                        strokeWidth={hoverRegion === slice.label ? 17 : 14}
                        strokeDasharray={`${slice.dash} ${DONUT_C - slice.dash}`}
                        strokeDashoffset={-slice.offset}
                        opacity={hoverRegion !== null && hoverRegion !== slice.label ? 0.35 : 1}
                        style={{ transition: 'opacity 150ms, stroke-width 150ms' }}
                        onMouseEnter={() => setHoverRegion(slice.label)}
                        onMouseLeave={() => setHoverRegion(null)}
                      />
                    ))}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-5">
                    <span className="text-xl font-black tabular-nums leading-none">{hoveredSlice ? hoveredSlice.count : stats.totalCountries}</span>
                    <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary mt-0.5 truncate max-w-full">
                      {hoveredSlice ? hoveredSlice.label : 'Total'}
                    </span>
                  </div>
                </div>

                <ul className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-x-3">
                  {regionSlices.map(slice => {
                    const isActive = !slice.isOther && regionFilter === slice.label;
                    const row = (
                      <>
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: `var(${slice.color})` }} aria-hidden="true" />
                        <span className={`flex-1 min-w-0 text-xs font-semibold truncate text-left ${isActive ? 'text-primary-600 dark:text-primary-400' : ''}`}>{slice.label}</span>
                        <span className="text-xs font-black tabular-nums">{slice.count}</span>
                      </>
                    );
                    return (
                      <li key={slice.label} onMouseEnter={() => setHoverRegion(slice.label)} onMouseLeave={() => setHoverRegion(null)}>
                        {slice.isOther ? (
                          <div className="min-h-[44px] flex items-center gap-2 px-1">{row}</div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setRegionFilter(isActive ? 'All' : slice.label); setActiveTab('visited'); }}
                            aria-pressed={isActive}
                            title={`${slice.percent}% of visited countries`}
                            className="w-full min-h-[44px] flex items-center gap-2 px-1 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                          >
                            {row}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </div>
      </GlassPanel>

      {/* DUPLICATE RECORDS */}
      {cleanupCount > 0 && (
        <div className="p-4 sm:p-5 rounded-3xl bg-primary-500/10 border border-primary-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Layers className="w-6 h-6 text-primary-500 shrink-0" weight="duotone" />
            <p className="text-sm font-bold">
              {cleanupCount} duplicate {cleanupCount === 1 ? 'record' : 'records'} can be merged
            </p>
          </div>
          <Button variant="secondary" onClick={handleConsolidate} isLoading={cleaningUp} className="shrink-0">Merge</Button>
        </div>
      )}

      {/* NEW FINDINGS */}
      {hasScanFindings && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 sm:p-5 rounded-3xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Sparkles className="w-6 h-6 text-amber-500 shrink-0" weight="duotone" />
            <p className="text-sm font-bold">
              {scanResults.countries.length} new {scanResults.countries.length === 1 ? 'country' : 'countries'} and {scanResults.cities.length} new {scanResults.cities.length === 1 ? 'city' : 'cities'} found
            </p>
          </div>
          <Button variant="secondary" onClick={() => setActiveTab('sync')} className="shrink-0">Review</Button>
        </motion.div>
      )}

      {/* TABS + FILTERS */}
      <div className="flex flex-col gap-4">
        <Tabs tabs={atlasTabs} activeTab={activeTab} onChange={id => setActiveTab(id as typeof activeTab)} />

        {activeTab !== 'sync' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 w-full">
            <div className="md:col-span-8 relative">
              <MagnifyingGlass className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                aria-label={`Search ${searchNoun}`}
                placeholder={`Search ${searchNoun}`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${INPUT_BASE_STYLE} pl-10 min-h-[44px] text-xs font-semibold`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="md:col-span-4 select-none">
              <Select
                aria-label="Filter by region"
                id="region-filter"
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                options={uniqueRegions.map(r => ({ label: r === 'All' ? 'All regions' : r, value: r }))}
              />
            </div>
          </div>
        )}
      </div>

      {/* CONTENT */}
      <div className="min-h-[300px]">
        {loading ? (
          <div className="flex items-center justify-center py-24" role="status" aria-label="Loading atlas">
            <RefreshCw className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : (
          <AnimatePresence mode="wait">

            {activeTab === 'visited' && (
              <motion.div key="visited-countries-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {filteredVisitedCountries.length === 0 ? (
                  <EmptyState
                    icon={<Globe className="w-10 h-10" weight="duotone" />}
                    title={searchQuery || regionFilter !== 'All' ? 'No matches' : 'No visited countries yet'}
                    action={{ label: 'Add country', onClick: () => handleOpenAdd('country'), icon: <Plus className="w-4 h-4" />, variant: 'primary' }}
                  />
                ) : renderCountryRows(filteredVisitedCountries, 'visited')}
              </motion.div>
            )}

            {activeTab === 'layovers' && (
              <motion.div key="layovers-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {filteredLayoverCountries.length === 0 ? (
                  <EmptyState
                    icon={<Plane className="w-10 h-10" weight="duotone" />}
                    title={searchQuery || regionFilter !== 'All' ? 'No matches' : 'No layovers yet'}
                    action={{ label: 'Add layover', onClick: () => handleOpenAdd('layover'), icon: <Plus className="w-4 h-4" />, variant: 'secondary' }}
                  />
                ) : renderCountryRows(filteredLayoverCountries, 'layover')}
              </motion.div>
            )}

            {activeTab === 'wishlist' && (
              <motion.div key="wishlist-grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {filteredWishlistCountries.length === 0 ? (
                  <EmptyState
                    icon={<Star className="w-10 h-10" weight="duotone" />}
                    title={searchQuery || regionFilter !== 'All' ? 'No matches' : 'Wishlist is empty'}
                    action={{ label: 'Add destination', onClick: () => handleOpenAdd('wishlist'), icon: <Plus className="w-4 h-4" />, variant: 'secondary' }}
                  />
                ) : renderCountryRows(filteredWishlistCountries, 'wishlist')}
              </motion.div>
            )}

            {activeTab === 'cities' && (
              <motion.div key="cities-table" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {filteredCities.length === 0 ? (
                  <EmptyState
                    icon={<MapPin className="w-10 h-10" weight="duotone" />}
                    title={searchQuery || regionFilter !== 'All' ? 'No matches' : 'No cities yet'}
                    action={{ label: 'Add city', onClick: () => handleOpenAdd('city'), icon: <Plus className="w-4 h-4" />, variant: 'secondary' }}
                  />
                ) : (
                  <GlassPanel className="wg-glass-card shadow-glass-card overflow-hidden border border-black/5 dark:border-white/10" overrides={{ borderRadius: 28 }} padding="0px">
                    <ul className="divide-y divide-black/5 dark:divide-white/5 rounded-[28px] overflow-hidden">
                      {filteredCities.map(item => (
                        <li key={item.id} className="p-4 sm:px-6 flex flex-col md:flex-row md:items-center gap-3 md:gap-6 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors">
                          <div className="flex items-center gap-4 min-w-0 flex-1">
                            <span className="text-3xl shrink-0" role="img" aria-label="flag">{item.countryCode && item.countryCode !== 'XX' ? getFlagEmoji(item.countryCode) : '🏳️'}</span>
                            <div className="min-w-0">
                              <h3 className="font-bold text-base tracking-tight truncate">{item.name}</h3>
                              <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary truncate mt-0.5">
                                {item.countryName || item.countryCode}
                                {item.notes ? <span className="italic"> · {item.notes}</span> : null}
                              </p>
                            </div>
                          </div>

                          <span className="hidden lg:inline-flex shrink-0 px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/5 text-xs font-mono font-bold tabular-nums">
                            {item.lat != null && item.lng != null ? `${item.lat.toFixed(2)}, ${item.lng.toFixed(2)}` : 'No coordinates'}
                          </span>

                          <div className="md:w-36 shrink-0">
                            <span className="block text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Visited</span>
                            <span className="text-sm font-semibold tabular-nums">{item.visitDate ? formatDate(item.visitDate, 'short-with-year') : '—'}</span>
                          </div>

                          <div className="flex justify-end shrink-0">{renderRowActions(item, 'Remove')}</div>
                        </li>
                      ))}
                    </ul>
                  </GlassPanel>
                )}
              </motion.div>
            )}

            {/* Sync Tab */}
            {activeTab === 'sync' && (
              <motion.div
                key="sync-panel"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Scanner */}
                  <div className="lg:col-span-4">
                    <GlassPanel className="wg-glass-card shadow-glass-card overflow-hidden border border-black/5 dark:border-white/10" overrides={{ borderRadius: 28 }} padding="0px">
                      <div className="rounded-[28px] overflow-hidden">
                        <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center gap-3 bg-gradient-to-r from-indigo-500/10 via-indigo-500/5 to-transparent">
                          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-500/20 flex items-center justify-center shrink-0">
                            <RefreshCw className="w-5 h-5" weight="duotone" />
                          </div>
                          <h2 className="text-base font-bold tracking-tight">History scan</h2>
                        </div>
                        <div className="p-5 sm:p-6 space-y-5">
                          <dl className="space-y-3">
                            <div className="flex items-baseline justify-between">
                              <dt className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Flights</dt>
                              <dd className="text-lg font-black tabular-nums">{flights.length}</dd>
                            </div>
                            <div className="flex items-baseline justify-between">
                              <dt className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Trips</dt>
                              <dd className="text-lg font-black tabular-nums">{trips.length}</dd>
                            </div>
                          </dl>
                          <Button
                            variant="primary"
                            color="blue"
                            vibrant
                            onClick={handleRunScan}
                            disabled={scanActive}
                            isLoading={scanActive}
                            className="w-full"
                            icon={<RefreshCw className="w-4 h-4" />}
                          >
                            {scanActive ? 'Scanning' : 'Scan again'}
                          </Button>
                          <p className="flex items-start gap-2 text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                            <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
                            Layovers are imported as layovers, not visits.
                          </p>
                        </div>
                      </div>
                    </GlassPanel>
                  </div>

                  {/* Results */}
                  <div className="lg:col-span-8 min-w-0">
                    {!hasScanFindings ? (
                      <EmptyState
                        icon={<CheckCircle2 className="w-10 h-10 text-emerald-500" weight="duotone" />}
                        title="Atlas is up to date"
                      />
                    ) : (
                      <div className="space-y-6">
                        <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-3xl bg-black/5 dark:bg-white/5">
                          <span className="text-sm font-bold tabular-nums">
                            {selectedScanCountries.size} countries · {selectedScanCities.size} cities selected
                          </span>
                          <Button
                            variant="primary"
                            vibrant
                            onClick={handleBulkImport}
                            disabled={selectedScanCountries.size + selectedScanCities.size === 0}
                            icon={<Plus className="w-4 h-4" />}
                          >
                            Add {selectedScanCountries.size + selectedScanCities.size} to Atlas
                          </Button>
                        </div>

                        {scanResults.countries.length > 0 && (
                          <GlassPanel className="wg-glass-card shadow-glass-card overflow-hidden border border-black/5 dark:border-white/10" overrides={{ borderRadius: 28 }} padding="0px">
                            <div className="rounded-[28px] overflow-hidden">
                              <div className="p-4 sm:px-6 flex items-center justify-between gap-3 border-b border-black/5 dark:border-white/5">
                                <h3 className="text-sm font-bold">Countries · {scanResults.countries.length}</h3>
                                <div className="flex items-center">
                                  <button type="button" onClick={() => setSelectedScanCountries(new Set(scanResults.countries.map(c => c.code)))} className="min-h-[44px] px-3 text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline cursor-pointer">Select all</button>
                                  <button type="button" onClick={() => setSelectedScanCountries(new Set())} className="min-h-[44px] px-3 text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary hover:underline cursor-pointer">Clear</button>
                                </div>
                              </div>
                              <ul className="divide-y divide-black/5 dark:divide-white/5">
                                {scanResults.countries.map(candidate => {
                                  const isSelected = selectedScanCountries.has(candidate.code);
                                  return (
                                    <li key={candidate.code}>
                                      <button
                                        type="button"
                                        role="checkbox"
                                        aria-checked={isSelected}
                                        onClick={() => {
                                          const next = new Set(selectedScanCountries);
                                          if (isSelected) next.delete(candidate.code); else next.add(candidate.code);
                                          setSelectedScanCountries(next);
                                        }}
                                        className={`w-full min-h-[44px] p-4 sm:px-6 flex items-center gap-4 text-left transition-colors cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.03] ${isSelected ? '' : 'opacity-60'}`}
                                      >
                                        <span className="text-2xl shrink-0">{getFlagEmoji(candidate.code)}</span>
                                        <span className="min-w-0 flex-1">
                                          <span className="block text-sm font-bold truncate">{candidate.name}</span>
                                          <span className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary capitalize">{candidate.code} · {candidate.source}</span>
                                        </span>
                                        <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-primary-500 border-primary-500 text-black' : 'border-black/20 dark:border-white/20'}`}>
                                          {isSelected && <Check className="w-3.5 h-3.5" weight="bold" />}
                                        </span>
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          </GlassPanel>
                        )}

                        {scanResults.cities.length > 0 && (
                          <GlassPanel className="wg-glass-card shadow-glass-card overflow-hidden border border-black/5 dark:border-white/10" overrides={{ borderRadius: 28 }} padding="0px">
                            <div className="rounded-[28px] overflow-hidden">
                              <div className="p-4 sm:px-6 flex items-center justify-between gap-3 border-b border-black/5 dark:border-white/5">
                                <h3 className="text-sm font-bold">Cities · {scanResults.cities.length}</h3>
                                <div className="flex items-center">
                                  <button type="button" onClick={() => setSelectedScanCities(new Set(scanResults.cities.map(c => c.name)))} className="min-h-[44px] px-3 text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline cursor-pointer">Select all</button>
                                  <button type="button" onClick={() => setSelectedScanCities(new Set())} className="min-h-[44px] px-3 text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary hover:underline cursor-pointer">Clear</button>
                                </div>
                              </div>
                              <ul className="max-h-[360px] overflow-y-auto custom-scrollbar divide-y divide-black/5 dark:divide-white/5">
                                {scanResults.cities.map(candidate => {
                                  const isSelected = selectedScanCities.has(candidate.name);
                                  return (
                                    <li key={candidate.name}>
                                      <button
                                        type="button"
                                        role="checkbox"
                                        aria-checked={isSelected}
                                        onClick={() => {
                                          const next = new Set(selectedScanCities);
                                          if (isSelected) next.delete(candidate.name); else next.add(candidate.name);
                                          setSelectedScanCities(next);
                                        }}
                                        className={`w-full min-h-[44px] p-4 sm:px-6 flex items-center gap-4 text-left transition-colors cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.03] ${isSelected ? '' : 'opacity-60'}`}
                                      >
                                        <span className="text-xl shrink-0">{candidate.countryCode ? getFlagEmoji(candidate.countryCode) : '🏳️'}</span>
                                        <span className="min-w-0 flex-1">
                                          <span className="block text-sm font-bold truncate">{candidate.name}</span>
                                          <span className="block text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary truncate capitalize">{candidate.countryName} · {candidate.source}</span>
                                        </span>
                                        <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-primary-500 border-primary-500 text-black' : 'border-black/20 dark:border-white/20'}`}>
                                          {isSelected && <Check className="w-3.5 h-3.5" weight="bold" />}
                                        </span>
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          </GlassPanel>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        )}
      </div>

      {/* Unified Register Visited Country / City Add & Edit Slide Tray Dialog */}
      {/* AnimatePresence must live inside the portal: it drops children that aren't React elements, and a portal isn't one.
          The overlay scrolls: on phones the form is taller than the screen. */}
      {createPortal(
        <AnimatePresence>
        {isModalOpen && (
          <div role="dialog" aria-modal="true" aria-label={editingItem ? 'Edit atlas record' : 'Add to atlas'} className="fixed inset-0 z-modal flex items-start sm:items-center justify-center p-4 font-sans overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 backdrop-blur-md bg-black/5 dark:bg-black/15"
              onClick={() => setIsModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg z-raised"
            >
              <GlassPanel
                className="wg-glass-card w-full shadow-2xl overflow-hidden"
                overrides={{ borderRadius: 28 }}
                padding="0px"
              >
                <div className="flex flex-col w-full overflow-hidden rounded-[28px] text-light-text dark:text-dark-text">
                  <div className="p-6 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-primary-500/5 to-transparent">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider bg-primary-500/10 text-primary-600 dark:text-primary-400 px-2 py-0.5 rounded-full border border-primary-500/20">
                    {editingItem ? 'Edit footprint record' : 'Add custom footprint'}
                  </span>
                  <h3 className="text-lg font-bold text-light-text dark:text-dark-text tracking-tight mt-1">
                    {modalType === 'country' ? 'Visited Country' : 'Visited City Hub'}
                  </h3>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className={CLOSE_BTN_STYLE}
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveItem} className="p-6 space-y-5">
                
                {modalType === 'country' ? (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-1 select-none">
                        <label className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block mb-1.5">Country Code</label>
                        <input 
                          type="text"
                          required
                          placeholder="e.g. GB-ENG"
                          maxLength={10}
                          value={formCountryCode}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase();
                            setFormCountryCode(val);
                            if (val === 'GB-ENG' || val === 'ENG') { setFormCountryCode('GB-ENG'); setFormCountryName('England'); }
                            else if (val === 'GB-SCT' || val === 'SCT') { setFormCountryCode('GB-SCT'); setFormCountryName('Scotland'); }
                            else if (val === 'GB-WLS' || val === 'WLS') { setFormCountryCode('GB-WLS'); setFormCountryName('Wales'); }
                            else if (val === 'GB-NIR' || val === 'NIR') { setFormCountryCode('GB-NIR'); setFormCountryName('Northern Ireland'); }
                          }}
                          className="w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl py-2.5 px-4 text-xs font-bold focus:outline-none focus:border-primary-500 text-light-text dark:text-dark-text transition-all"
                        />
                      </div>
                      <div className="col-span-2 select-none">
                        <label className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block mb-1.5">Full Country Name</label>
                        <input 
                          type="text"
                          required
                          placeholder="e.g. England"
                          value={formCountryName}
                          onChange={(e) => setFormCountryName(e.target.value)}
                          className="w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl py-2.5 px-4 text-xs font-bold focus:outline-none focus:border-primary-500 text-light-text dark:text-dark-text transition-all"
                        />
                      </div>
                    </div>

                    {/* Quick Constituent Countries Selector */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                        Quick Select Constituent Countries
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {[
                          { code: 'GB-ENG', name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
                          { code: 'GB-SCT', name: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
                          { code: 'GB-WLS', name: 'Wales', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿' },
                          { code: 'GB-NIR', name: 'Northern Ireland', flag: '🇬🇧' },
                        ].map((c) => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => {
                              setFormCountryCode(c.code);
                              setFormCountryName(c.name);
                            }}
                            className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                              formCountryCode === c.code
                                ? 'bg-primary-500/15 border-primary-500 text-primary-600 dark:text-primary-400'
                                : 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5 hover:border-black/15 text-light-text dark:text-dark-text'
                            }`}
                          >
                            <span>{c.flag}</span>
                            <span className="truncate">{c.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Classification Selector */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                          Classification & Tags
                        </label>
                        <span className="text-2xs font-medium text-light-text-secondary dark:text-dark-text-secondary">
                          {formResidenceStatuses.includes('wishlist') || formResidenceStatuses.includes('layover')
                            ? 'Wishlist & Layover can combine'
                            : 'Visited & Past Home can combine'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[
                          { id: 'visited', label: 'Visited', icon: Sparkles, color: 'primary', desc: 'Explored stay' },
                          { id: 'lived_past', label: 'Past Home', icon: Landmark, color: 'indigo', desc: 'Lived here' },
                          { id: 'lived_current', label: 'Current Home', icon: Home, color: 'emerald', desc: 'Live here' },
                          { id: 'layover', label: 'Layover', icon: Plane, color: 'amber', desc: 'Transit stop' },
                          { id: 'wishlist', label: 'Wishlist', icon: Star, color: 'rose', desc: 'Dream target' },
                        ].map(st => {
                          const IconComp = st.icon;
                          const isSelected = formResidenceStatuses.includes(st.id as CountryResidenceStatus);
                          
                          let activeClasses = 'bg-primary-500/15 border-primary-500 text-primary-600 dark:text-primary-400 font-bold shadow-sm';
                          let iconColorClasses = 'text-primary-500';
                          
                          if (st.color === 'emerald') {
                            activeClasses = 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 font-bold shadow-sm';
                            iconColorClasses = 'text-emerald-500';
                          } else if (st.color === 'indigo') {
                            activeClasses = 'bg-indigo-500/15 border-indigo-500 text-indigo-700 dark:text-indigo-300 font-bold shadow-sm';
                            iconColorClasses = 'text-indigo-500';
                          } else if (st.color === 'rose') {
                            activeClasses = 'bg-rose-500/15 border-rose-500 text-rose-700 dark:text-rose-300 font-bold shadow-sm';
                            iconColorClasses = 'text-rose-500';
                          } else if (st.color === 'amber') {
                            activeClasses = 'bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-300 font-bold shadow-sm';
                            iconColorClasses = 'text-amber-500';
                          }

                          return (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() => {
                                setFormResidenceStatuses(prev => toggleCountryResidenceStatus(prev, st.id as CountryResidenceStatus));
                              }}
                              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                                isSelected
                                  ? activeClasses
                                  : 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5 text-light-text dark:text-dark-text opacity-70 hover:opacity-100 hover:border-black/15'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${isSelected ? 'bg-white/80 dark:bg-white/10 shadow-xs' : 'bg-black/5 dark:bg-white/5'}`}>
                                  <IconComp className={`w-4 h-4 ${isSelected ? iconColorClasses : 'text-light-text-secondary dark:text-dark-text-secondary'}`} />
                                </div>
                                {isSelected && (
                                  <span className="w-5 h-5 rounded-full bg-current/15 flex items-center justify-center text-xs font-black">
                                    ✓
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-bold truncate leading-tight">{st.label}</p>
                              <p className="text-2xs opacity-70 truncate mt-0.5">{st.desc}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="select-none">
                      <label className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block mb-1.5">City Name</label>
                      <input 
                        type="text"
                        required
                        placeholder="e.g. Edinburgh"
                        value={formCityName}
                        onChange={(e) => {
                          setFormCityName(e.target.value);
                        }}
                        onBlur={() => handleResolveCoordsForCity(formCityName)}
                        className="w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl py-2.5 px-4 text-xs font-bold focus:outline-none focus:border-primary-500 text-light-text dark:text-dark-text transition-all"
                      />
                      <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary mt-1">Leaves field to auto-geocode coordinates</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="select-none">
                        <label className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block mb-1.5">Parent Country Code</label>
                        <input 
                          type="text"
                          required
                          placeholder="e.g. GB-SCT"
                          maxLength={10}
                          value={formCountryCode}
                          onChange={(e) => setFormCountryCode(e.target.value.toUpperCase())}
                          className="w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl py-2.5 px-4 text-xs font-bold focus:outline-none focus:border-primary-500 text-light-text dark:text-dark-text transition-all"
                        />
                      </div>
                      <div className="select-none">
                        <label className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block mb-1.5">Country Name</label>
                        <input 
                          type="text"
                          required
                          placeholder="e.g. Scotland"
                          value={formCountryName}
                          onChange={(e) => setFormCountryName(e.target.value)}
                          className="w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl py-2.5 px-4 text-xs font-bold focus:outline-none focus:border-primary-500 text-light-text dark:text-dark-text transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="select-none">
                        <label className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block mb-1.5">Latitude (Degree)</label>
                        <input 
                          type="text"
                          required
                          placeholder="e.g. 48.8566"
                          value={formLat}
                          onChange={(e) => setFormLat(e.target.value)}
                          className="w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl py-2.5 px-4 text-xs font-mono font-bold focus:outline-none focus:border-primary-500 text-light-text dark:text-dark-text transition-all"
                        />
                      </div>
                      <div className="select-none">
                        <label className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block mb-1.5">Longitude (Degree)</label>
                        <input 
                          type="text"
                          required
                          placeholder="e.g. 2.3522"
                          value={formLng}
                          onChange={(e) => setFormLng(e.target.value)}
                          className="w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl py-2.5 px-4 text-xs font-mono font-bold focus:outline-none focus:border-primary-500 text-light-text dark:text-dark-text transition-all"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-1 gap-4">
                  <div className="select-none">
                    <label className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block mb-1.5">Visit Date (YYYY-MM-DD)</label>
                    <input 
                      type="date"
                      value={formVisitDate}
                      onChange={(e) => setFormVisitDate(e.target.value)}
                      className="w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl py-2.5 px-4 text-xs font-bold focus:outline-none focus:border-primary-500 text-light-text dark:text-dark-text transition-all"
                    />
                  </div>
                  
                  <div className="select-none">
                    <label className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block mb-1.5">Optional Notes</label>
                    <textarea 
                      placeholder="e.g. Wonderful local bistros, beautiful culture..."
                      rows={2}
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      className="w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl py-2.5 px-4 text-xs font-medium focus:outline-none focus:border-primary-500 text-light-text dark:text-dark-text transition-all resize-none"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-black/10 dark:border-white/10 mt-6 flex gap-3">
                  <Button 
                    type="button" 
                    variant="secondary" 
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 text-xs min-h-[44px]"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    variant="primary"
                    className="flex-1 text-xs min-h-[44px]"
                  >
                    {editingItem ? 'Save Record' : 'Register to Atlas'}
                  </Button>
                </div>

              </form>
                </div>
              </GlassPanel>
            </motion.div>
          </div>
        )}
        </AnimatePresence>,
        document.body
      )}

    </div>
  );
};
