import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ViewState, VisitedItem, Trip, CountryResidenceStatus } from '../types';
import { dataService } from '../services/mockDb';
import { getFlagEmoji, getRegion } from '../services/geoData';
import { resolvePlaceName, getCoordinates } from '../services/geocoding';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Compass, MapPin, Globe, Calendar, Plus, Trash2, Edit3, 
  Map, RefreshCw, Layers, CheckCircle2, AlertTriangle, Info,
  Bookmark, Shield, ChevronRight, X, Sparkles, Filter, Check,
  Star, Heart, Plane
} from 'lucide-react';
import { Card, Button, Input, Select } from '../components/ui';

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
  const [formResidenceStatus, setFormResidenceStatus] = useState<CountryResidenceStatus>('visited');

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
    const handleUpdate = () => {
      void loadData();
    };
    window.addEventListener('wandergrid_db_updated', handleUpdate);
    return () => {
      window.removeEventListener('wandergrid_db_updated', handleUpdate);
    };
  }, []);

  // Scopes and Unique regions
  const uniqueRegions = useMemo(() => {
    const regions = new Set<string>();
    visitedItems.forEach(item => {
      if (item.type === 'country') {
        regions.add(getRegion(item.code));
      } else if (item.countryCode) {
        regions.add(getRegion(item.countryCode));
      }
    });
    return ['All', ...Array.from(regions)];
  }, [visitedItems]);

  // Visited vs Layover vs Wishlist split
  const visitedCountriesList = useMemo(() => {
    return visitedItems.filter(item => item.type === 'country' && item.residenceStatus !== 'wishlist' && !item.isTransit && item.residenceStatus !== 'layover');
  }, [visitedItems]);

  const layoverCountriesList = useMemo(() => {
    return visitedItems.filter(item => item.type === 'country' && item.residenceStatus !== 'wishlist' && (item.isTransit || item.residenceStatus === 'layover'));
  }, [visitedItems]);

  const wishlistCountriesList = useMemo(() => {
    return visitedItems.filter(item => item.type === 'country' && item.residenceStatus === 'wishlist');
  }, [visitedItems]);

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

  const filteredCities = useMemo(() => {
    return visitedItems.filter(item => {
      if (item.type !== 'city') return false;
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || (item.countryName || '').toLowerCase().includes(searchQuery.toLowerCase());
      const region = item.countryCode ? getRegion(item.countryCode) : 'Unknown';
      const matchesRegion = regionFilter === 'All' || region === regionFilter;
      return matchesSearch && matchesRegion;
    }).sort((a,b) => a.name.localeCompare(b.name));
  }, [visitedItems, searchQuery, regionFilter]);

  // Statistics
  const stats = useMemo(() => {
    const visited = visitedItems.filter(item => item.type === 'country' && item.residenceStatus !== 'wishlist' && !item.isTransit && item.residenceStatus !== 'layover');
    const wishlist = visitedItems.filter(item => item.type === 'country' && item.residenceStatus === 'wishlist');
    const transit = visitedItems.filter(item => item.type === 'country' && (item.isTransit || item.residenceStatus === 'layover'));
    const cities = visitedItems.filter(item => item.type === 'city');
    
    return {
      totalCountries: visited.length,
      wishlistCount: wishlist.length,
      transitCount: transit.length,
      totalCities: cities.length,
      worldPercentage: Math.max(0.1, Math.min(100, Math.round((visited.length / 198) * 1000) / 10))
    };
  }, [visitedItems]);

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
    setFormResidenceStatus(type === 'wishlist' ? 'wishlist' : type === 'layover' ? 'layover' : 'visited');
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
    setFormResidenceStatus(item.residenceStatus || (item.isTransit ? 'layover' : 'visited'));
    setIsModalOpen(true);
  };

  // Promote a wishlist country to a visited country with 1 click
  const handlePromoteWishlistToVisited = async (item: VisitedItem) => {
    try {
      await dataService.updateVisited({
        ...item,
        residenceStatus: 'visited',
        isTransit: false,
        visitDate: new Date().toISOString().split('T')[0]
      });
      void loadData();
      window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
    } catch (err) {
      console.error("Failed to promote wishlist country:", err);
    }
  };

  // Promote a layover country to a visited country with 1 click
  const handlePromoteLayoverToVisited = async (item: VisitedItem) => {
    try {
      await dataService.updateVisited({
        ...item,
        residenceStatus: 'visited',
        isTransit: false,
        visitDate: item.visitDate || new Date().toISOString().split('T')[0]
      });
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
        const isLayover = formResidenceStatus === 'layover' || formIsTransit;
        const payload: VisitedItem = {
          id: editingItem?.id || `country_${formCountryCode.toUpperCase()}`,
          type: 'country',
          code: formCountryCode.toUpperCase(),
          name: formCountryName,
          visitDate: formVisitDate,
          notes: formNotes,
          isTransit: isLayover,
          residenceStatus: isLayover ? 'layover' : formResidenceStatus,
          isManual: editingItem ? editingItem.isManual : true
        };

        if (editingItem) {
          await dataService.updateVisited(payload);
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
      const updated = { ...item, isTransit: !item.isTransit };
      await dataService.updateVisited(updated);
      void loadData();
      window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
    } catch (err) {
      console.error("Failed to toggle transit mode of country:", err);
    }
  };

  // Delete visited item
  const handleDeleteItem = async (id: string) => {
    if (!window.confirm("Are you sure you want to remove this item from your Atlas? This will update your maps and statistics dynamically.")) return;
    try {
      await dataService.deleteVisited(id);
      void loadData();
      window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
    } catch (err) {
      console.error("Failed to delete visited item:", err);
    }
  };

  // Perform Historical Travel Scan (Flights, Planners, Stops)
  const handleRunScan = async () => {
    setScanActive(true);
    try {
      // Countries & Cities already logged in current visitedItems set to ignore duplicate suggestions
      const existingCountryCodes = new Set(visitedItems.filter(item => item.type === 'country').map(item => item.code.toUpperCase()));
      const existingCityNames = new Set(visitedItems.filter(item => item.type === 'city').map(item => item.name.toLowerCase()));

      const foundCountries: Record<string, { code: string; name: string; source: 'flight' | 'trip' | 'layover' | 'roadtrip'; date: string }> = {};
      const foundCities: Record<string, { name: string; countryCode: string; countryName: string; source: 'flight' | 'trip' | 'layover' | 'roadtrip'; date: string; lat?: number; lng?: number }> = {};

      // 1. Process flight log data
      for (const f of flights) {
        if (!f || f.status === 'Cancelled') continue;
        
        // Origin as potential layover or start
        if (f.origin && !f.layover) {
          const res = await resolvePlaceName(f.origin);
          if (res && res.countryCode) {
            const code = res.countryCode.toUpperCase();
            if (!existingCountryCodes.has(code)) {
              foundCountries[code] = { code, name: res.country, source: 'flight', date: f.departureDate || f.date || new Date().toISOString() };
            }
            const cityName = res.city || f.originCity || f.origin;
            if (!existingCityNames.has(cityName.toLowerCase())) {
              foundCities[cityName.toLowerCase()] = {
                name: cityName,
                countryCode: code,
                countryName: res.country,
                source: 'flight',
                date: f.departureDate || f.date || new Date().toISOString(),
                lat: f.originLat,
                lng: f.originLng
              };
            }
          }
        }

        // Destination as visited
        if (f.destination) {
          const res = await resolvePlaceName(f.destination);
          if (res && res.countryCode) {
            const code = res.countryCode.toUpperCase();
            if (!existingCountryCodes.has(code)) {
              foundCountries[code] = { code, name: res.country, source: 'flight', date: f.arrivalDate || f.date || new Date().toISOString() };
            }
            const cityName = res.city || f.destCity || f.destination;
            if (!existingCityNames.has(cityName.toLowerCase())) {
              foundCities[cityName.toLowerCase()] = {
                name: cityName,
                countryCode: code,
                countryName: res.country,
                source: f.isLayover ? 'layover' : 'flight',
                date: f.arrivalDate || f.date || new Date().toISOString(),
                lat: f.destLat,
                lng: f.destLng
              };
            }
          }
        }
      }

      // 1.5. Process road trip / land travel log data
      for (const r of roadTrips) {
        if (!r || r.status === 'Cancelled') continue;
        
        // Origin
        if (r.origin) {
          const res = await resolvePlaceName(r.origin);
          if (res && res.countryCode) {
            const code = res.countryCode.toUpperCase();
            if (!existingCountryCodes.has(code)) {
              foundCountries[code] = { code, name: res.country, source: 'roadtrip', date: r.departureDate || r.date || new Date().toISOString() };
            }
            const cityName = res.city || r.originCity || r.origin;
            if (!existingCityNames.has(cityName.toLowerCase())) {
              foundCities[cityName.toLowerCase()] = {
                name: cityName,
                countryCode: code,
                countryName: res.country,
                source: 'roadtrip',
                date: r.departureDate || r.date || new Date().toISOString(),
                lat: r.originLat || r.lat,
                lng: r.originLng || r.lng
              };
            }
          }
        }

        // Destination
        if (r.destination) {
          const res = await resolvePlaceName(r.destination);
          if (res && res.countryCode) {
            const code = res.countryCode.toUpperCase();
            if (!existingCountryCodes.has(code)) {
              foundCountries[code] = { code, name: res.country, source: 'roadtrip', date: r.arrivalDate || r.date || new Date().toISOString() };
            }
            const cityName = res.city || r.destCity || r.destination;
            if (!existingCityNames.has(cityName.toLowerCase())) {
              foundCities[cityName.toLowerCase()] = {
                name: cityName,
                countryCode: code,
                countryName: res.country,
                source: 'roadtrip',
                date: r.arrivalDate || r.date || new Date().toISOString(),
                lat: r.destLat || r.lat,
                lng: r.destLng || r.lng
              };
            }
          }
        }
      }

      // 2. Process custom trips / planners (Accommodations / georoutes)
      const pastTrips = trips.filter(t => t.status !== 'Planning' && t.status !== 'Cancelled');
      for (const t of pastTrips) {
        if (t.location) {
          const res = await resolvePlaceName(t.location);
          if (res && res.countryCode) {
            const code = res.countryCode.toUpperCase();
            if (!existingCountryCodes.has(code)) {
              foundCountries[code] = { code, name: res.country, source: 'trip', date: t.endDate };
            }
            const cityName = res.city || t.location;
            if (!existingCityNames.has(cityName.toLowerCase())) {
              foundCities[cityName.toLowerCase()] = {
                name: cityName,
                countryCode: code,
                countryName: res.country,
                source: 'trip',
                date: t.endDate,
                lat: t.coordinates?.lat,
                lng: t.coordinates?.lng
              };
            }
          }
        }

        // Stops / waypoints inside Route Manager
        t.locations?.forEach(l => {
          if (l.name) {
            // Treat as city candidate
            const cleanName = l.name.toLowerCase();
            if (!existingCityNames.has(cleanName)) {
              foundCities[cleanName] = {
                name: l.name,
                countryCode: 'XX', // Will resolve country code on save, or place temporary 
                countryName: 'Imported',
                source: 'trip',
                date: t.endDate,
                lat: l.coordinates?.lat,
                lng: l.coordinates?.lng
              };
            }
          }
        });
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
        if (selectedScanCountries.has(candidate.code)) {
          importItems.push({
            id: `country_${candidate.code}`,
            type: 'country',
            code: candidate.code,
            name: candidate.name,
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

  return (
    <div className="container mx-auto px-4 lg:px-8 py-8 md:py-12 max-w-7xl animate-fade-in text-gray-900 dark:text-gray-100">
      
      {/* Dynamic tactile Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 pb-6 border-b border-gray-100 dark:border-white/5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-2 rounded-2xl bg-indigo-500/10 text-indigo-500">
              <Compass className="w-6 h-6 animate-spin-slow" />
            </span>
            <span className="text-xs font-black tracking-widest uppercase text-indigo-500 dark:text-indigo-400">Footprint Registry</span>
          </div>
          <h1 className="text-4xl lg:text-5xl font-black text-gray-900 dark:text-white tracking-tight">Travel Atlas</h1>
          <p className="text-sm text-gray-400 mt-1 max-w-xl leading-relaxed">
            Your absolute source of truth. Manage curated lists of countries and cities visited vs wishlist destinations. Reclaim control of maps, passport stamps, and exclude transition points dynamically.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button 
            onClick={handleRunScan} 
            variant="outline" 
            className="rounded-full shadow-sm hover:shadow"
            id="btn-scan-log"
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Scan History
          </Button>
          <Button 
            onClick={() => handleOpenAdd('country')} 
            className="rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md hover:opacity-95"
            id="btn-add-country"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Visited Country
          </Button>
          <Button 
            onClick={() => handleOpenAdd('layover')} 
            variant="outline"
            className="rounded-full border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 shadow-sm"
            id="btn-add-layover"
          >
            <Plane className="mr-1.5 h-4 w-4" /> Layover Country
          </Button>
          <Button 
            onClick={() => handleOpenAdd('wishlist')} 
            className="rounded-full bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-md hover:opacity-95"
            id="btn-add-wishlist"
          >
            <Star className="mr-1.5 h-4 w-4 fill-white" /> Wishlist Target
          </Button>
          <Button 
            onClick={() => handleOpenAdd('city')} 
            variant="outline" 
            className="rounded-full shadow-sm"
            id="btn-add-city"
          >
            <Plus className="mr-1.5 h-4 w-4" /> City
          </Button>
        </div>
      </div>

      {/* Stats Bento Grid Header */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        
        <Card 
          onClick={() => setActiveTab('visited')}
          className="!bg-white/80 dark:!bg-zinc-900/60 border border-gray-50 dark:border-white/5 !rounded-[2rem] shadow-sm relative overflow-hidden cursor-pointer hover:border-indigo-500/30 transition-all" 
          noPadding
        >
          <div className="p-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">Visited Nations</span>
            <span className="text-3xl font-black text-gray-900 dark:text-white">{stats.totalCountries}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500 block mt-1">Explored & Lived</span>
            <div className="absolute right-4 bottom-4 text-indigo-600/10">
              <Globe className="w-12 h-12" />
            </div>
          </div>
        </Card>

        <Card 
          onClick={() => setActiveTab('layovers')}
          className="!bg-white/80 dark:!bg-zinc-900/60 border border-amber-500/10 dark:border-amber-500/10 !rounded-[2rem] shadow-sm relative overflow-hidden cursor-pointer hover:border-amber-500/30 transition-all" 
          noPadding
        >
          <div className="p-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 block mb-1">Layover Stops</span>
            <span className="text-3xl font-black text-amber-500">{stats.transitCount}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500 block mt-1">Airport connections</span>
            <div className="absolute right-4 bottom-4 text-amber-600/10">
              <Plane className="w-12 h-12 text-amber-500" />
            </div>
          </div>
        </Card>

        <Card 
          onClick={() => setActiveTab('wishlist')}
          className="!bg-white/80 dark:!bg-zinc-900/60 border border-rose-500/10 dark:border-rose-500/10 !rounded-[2rem] shadow-sm relative overflow-hidden cursor-pointer hover:border-rose-500/30 transition-all" 
          noPadding
        >
          <div className="p-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 block mb-1">Wishlist Targets</span>
            <span className="text-3xl font-black text-rose-600 dark:text-rose-400">{stats.wishlistCount}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500 block mt-1">Dream destinations</span>
            <div className="absolute right-4 bottom-4 text-rose-500/10">
              <Star className="w-12 h-12 fill-rose-500/20 text-rose-500" />
            </div>
          </div>
        </Card>

        <Card 
          onClick={() => setActiveTab('cities')}
          className="!bg-white/80 dark:!bg-zinc-900/60 border border-gray-50 dark:border-white/5 !rounded-[2rem] shadow-sm relative overflow-hidden cursor-pointer hover:border-blue-500/30 transition-all" 
          noPadding
        >
          <div className="p-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">Tracked Cities</span>
            <span className="text-3xl font-black text-gray-900 dark:text-white">{stats.totalCities}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500 block mt-1">Urban footprints</span>
            <div className="absolute right-4 bottom-4 text-blue-600/10">
              <MapPin className="w-12 h-12" />
            </div>
          </div>
        </Card>

        <Card className="!bg-gradient-to-br from-indigo-600 to-blue-700 border-0 !rounded-[2rem] shadow-md relative overflow-hidden text-white col-span-2 lg:col-span-1" noPadding>
          <div className="p-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-200 block mb-1">Coverage</span>
            <span className="text-3xl font-black tracking-tight">{stats.worldPercentage}%</span>
            <div className="w-full bg-white/20 h-1.5 rounded-full mt-2 relative overflow-hidden">
              <div className="bg-amber-300 h-full rounded-full" style={{ width: `${stats.worldPercentage}%` }} />
            </div>
            <span className="text-xs text-white/70 block mt-2">{stats.totalCountries} / 198</span>
          </div>
        </Card>
      </div>

      {/* Scanning Feed Warning Trigger */}
      {scanResults.countries.length > 0 || scanResults.cities.length > 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 p-5 bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-500/10 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 mt-0.5">
              <Sparkles className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-indigo-950 dark:text-indigo-200">New Footprints Discovered! ({scanResults.countries.length} countries, {scanResults.cities.length} cities)</h4>
              <p className="text-xs text-indigo-700/80 dark:text-indigo-300/70 mt-0.5">We scanned your flight registry and planner logs and found uncatalogued places. Keep your atlas up-to-date.</p>
            </div>
          </div>
          <Button 
            onClick={() => setActiveTab('sync')} 
            className="rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm font-bold text-xs"
          >
            Review Footprint Map
          </Button>
        </motion.div>
      ) : null}

      {/* Main Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-gray-100 dark:border-white/5 mb-6 overflow-x-auto custom-scrollbar">
        <button 
          onClick={() => setActiveTab('visited')}
          className={`pb-4 px-3 text-sm font-black tracking-wider uppercase transition-all border-b-2 relative flex items-center gap-2 shrink-0 ${
            activeTab === 'visited' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <span>Visited Countries</span>
          <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            {visitedCountriesList.length}
          </span>
        </button>
        <button 
          onClick={() => setActiveTab('layovers')}
          className={`pb-4 px-3 text-sm font-black tracking-wider uppercase transition-all border-b-2 relative flex items-center gap-2 shrink-0 ${
            activeTab === 'layovers' ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Plane className="w-3.5 h-3.5" />
            <span>Layover Countries</span>
          </span>
          <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            {layoverCountriesList.length}
          </span>
        </button>
        <button 
          onClick={() => setActiveTab('wishlist')}
          className={`pb-4 px-3 text-sm font-black tracking-wider uppercase transition-all border-b-2 relative flex items-center gap-2 shrink-0 ${
            activeTab === 'wishlist' ? 'border-rose-500 text-rose-600 dark:text-rose-400' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 fill-current" />
            <span>Wishlist Destinations</span>
          </span>
          <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            {wishlistCountriesList.length}
          </span>
        </button>
        <button 
          onClick={() => setActiveTab('cities')}
          className={`pb-4 px-3 text-sm font-black tracking-wider uppercase transition-all border-b-2 relative flex items-center gap-2 shrink-0 ${
            activeTab === 'cities' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <span>Track Cities</span>
          <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            {filteredCities.length}
          </span>
        </button>
        <button 
          onClick={() => setActiveTab('sync')}
          className={`pb-4 px-3 text-sm font-black tracking-wider uppercase transition-all border-b-2 relative flex items-center gap-1.5 shrink-0 ${
            activeTab === 'sync' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <span>Sync Scanner</span>
          {scanResults.countries.length + scanResults.cities.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          )}
        </button>
      </div>

      {/* Filtering Section - Skip for Scan tab */}
      {activeTab !== 'sync' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
          <div className="md:col-span-8 relative">
            <input 
              type="text"
              placeholder={`Search ${activeTab === 'visited' ? 'visited countries' : activeTab === 'layovers' ? 'layover countries' : activeTab === 'wishlist' ? 'wishlist destinations' : 'cities'}...`} 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/50 dark:bg-zinc-900/40 border border-gray-200 dark:border-white/10 rounded-2xl py-3 pl-11 pr-4 text-xs font-medium focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
            />
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <Filter className="w-4 h-4" />
            </div>
          </div>

          <div className="md:col-span-4 select-none">
            <Select 
              id="region-filter"
              value={regionFilter}
              onChange={(val) => setRegionFilter(val)}
              options={uniqueRegions.map(r => ({ label: r, value: r }))}
              placeholder="Filter by Region"
            />
          </div>
        </div>
      )}

      {/* Main Tab Content */}
      <div className="min-h-[300px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <RefreshCw className="w-10 h-10 animate-spin text-indigo-500 mb-3" />
            <span className="text-xs font-bold uppercase tracking-wider">Syncing Atlas Registry...</span>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            
            {/* Visited Countries tab */}
            {activeTab === 'visited' && (
              <motion.div 
                key="visited-countries-grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {filteredVisitedCountries.length === 0 ? (
                  <div className="col-span-full py-16 text-center text-gray-400 bg-white/40 dark:bg-zinc-900/20 border border-dashed border-gray-200 dark:border-white/5 rounded-3xl">
                    <Globe className="w-10 h-10 mx-auto text-gray-300 dark:text-zinc-700 mb-2" />
                    <p className="text-sm font-bold">No visited countries resolved yet</p>
                    <p className="text-xs text-gray-500 mt-1">Try to Scan history from top right, or manually register your first visited country.</p>
                    <Button 
                      onClick={() => handleOpenAdd('country')} 
                      className="mt-4 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold"
                    >
                      <Plus className="mr-1.5 h-4 w-4" /> Add Visited Country
                    </Button>
                  </div>
                ) : (
                  filteredVisitedCountries.map(item => (
                    <motion.div 
                      key={item.id} 
                      layout
                      className="p-6 rounded-[2rem] border relative transition-all bg-white dark:bg-zinc-900/50 shadow-sm hover:shadow-md border-gray-100 dark:border-white/5"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-4xl" role="img" aria-label="flag">
                            {getFlagEmoji(item.code)}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-black text-lg text-gray-900 dark:text-white tracking-tight leading-tight">{item.name}</h3>
                              {item.residenceStatus === 'lived_current' ? (
                                <span className="px-2 py-0.5 rounded-full text-3xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                  🏠 Current Home
                                </span>
                              ) : item.residenceStatus === 'lived_past' ? (
                                <span className="px-2 py-0.5 rounded-full text-3xs font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                                  🏛️ Past Home
                                </span>
                              ) : null}
                            </div>
                            <span className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest">{item.code} • {getRegion(item.code)}</span>
                          </div>
                        </div>

                        {/* Top corner actions */}
                        <div className="flex items-center gap-1 bg-gray-50 dark:bg-white/5 p-1.5 rounded-2xl">
                          <button 
                            onClick={() => handleOpenEdit(item)}
                            title="Edit Record" 
                            className="p-1 px-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-black dark:hover:text-white hover:bg-white dark:hover:bg-zinc-800 transition-all flex items-center"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleDeleteItem(item.id)}
                            title="Remove country" 
                            className="p-1 px-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-red-500 hover:bg-white dark:hover:bg-zinc-800 transition-all flex items-center"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {item.notes && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/5 p-3 rounded-2xl mb-4 italic">
                          "{item.notes}"
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-xs border-t border-gray-100 dark:border-white/5 pt-4">
                        <div>
                          <span className="text-gray-400 block text-[9px] font-bold uppercase tracking-wider">Visited Date</span>
                          <span className="font-semibold">{item.visitDate || 'Not specified'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[9px] font-bold uppercase tracking-wider">Record Origin</span>
                          <span className="font-semibold text-zinc-500">{item.isManual ? 'Manual Edit' : 'Scanned'}</span>
                        </div>
                      </div>

                      {/* Convert to Layover button */}
                      <button 
                        onClick={() => handleToggleTransit(item)}
                        className="w-full mt-4 flex items-center justify-between text-[11px] font-extrabold tracking-wider uppercase px-4.5 py-3 rounded-2xl border transition-all duration-200 bg-indigo-100/50 hover:bg-indigo-100/70 border-indigo-200/50 text-indigo-900 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/50 dark:border-indigo-900/30 dark:text-indigo-300"
                      >
                        <span className="flex items-center gap-1.5">
                          <Plane className="w-3.5 h-3.5" />
                          Move to Layovers
                        </span>
                        <span className="font-bold underline text-[9px]">Transit</span>
                      </button>
                    </motion.div>
                  ))
                )}
              </motion.div>
            )}

            {/* Layover Countries tab */}
            {activeTab === 'layovers' && (
              <motion.div 
                key="layovers-grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {filteredLayoverCountries.length === 0 ? (
                  <div className="col-span-full py-16 text-center text-gray-400 bg-white/40 dark:bg-zinc-900/20 border border-dashed border-amber-500/20 dark:border-amber-500/10 rounded-3xl">
                    <Plane className="w-10 h-10 mx-auto text-amber-500/60 mb-2" />
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-300">No Layover Countries Catalogued</p>
                    <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                      Airport transfers and transit stops are tracked here. They are highlighted with special amber tones on your map and kept distinct from fully explored countries.
                    </p>
                    <Button 
                      onClick={() => handleOpenAdd('layover')} 
                      className="mt-4 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 text-white text-xs font-bold"
                    >
                      <Plus className="mr-1.5 h-4 w-4" /> Add Layover Country
                    </Button>
                  </div>
                ) : (
                  filteredLayoverCountries.map(item => (
                    <motion.div 
                      key={item.id} 
                      layout
                      className="p-6 rounded-[2rem] border relative transition-all bg-white dark:bg-zinc-900/50 shadow-sm hover:shadow-md border-amber-500/20 dark:border-amber-500/15 bg-gradient-to-b from-amber-500/[0.03] to-transparent"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-4xl" role="img" aria-label="flag">
                            {getFlagEmoji(item.code)}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-black text-lg text-gray-900 dark:text-white tracking-tight leading-tight">{item.name}</h3>
                              <span className="px-2 py-0.5 rounded-full text-3xs font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-0.5">
                                <Plane className="w-2.5 h-2.5" /> Layover
                              </span>
                            </div>
                            <span className="text-[10px] font-bold text-amber-500 dark:text-amber-400 uppercase tracking-widest">{item.code} • {getRegion(item.code)}</span>
                          </div>
                        </div>

                        {/* Top corner actions */}
                        <div className="flex items-center gap-1 bg-gray-50 dark:bg-white/5 p-1.5 rounded-2xl">
                          <button 
                            onClick={() => handleOpenEdit(item)}
                            title="Edit Record" 
                            className="p-1 px-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-black dark:hover:text-white hover:bg-white dark:hover:bg-zinc-800 transition-all flex items-center"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleDeleteItem(item.id)}
                            title="Remove country" 
                            className="p-1 px-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-red-500 hover:bg-white dark:hover:bg-zinc-800 transition-all flex items-center"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {item.notes && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/5 p-3 rounded-2xl mb-4 italic">
                          "{item.notes}"
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-xs border-t border-gray-100 dark:border-white/5 pt-4">
                        <div>
                          <span className="text-gray-400 block text-[9px] font-bold uppercase tracking-wider">Transit Date</span>
                          <span className="font-semibold">{item.visitDate || 'Transit connection'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[9px] font-bold uppercase tracking-wider">Classification</span>
                          <span className="font-semibold text-amber-500">Transit Only</span>
                        </div>
                      </div>

                      {/* 1-Click Promote to Visited */}
                      <button 
                        onClick={() => handlePromoteLayoverToVisited(item)}
                        className="w-full mt-4 flex items-center justify-center gap-2 text-[11px] font-extrabold tracking-wider uppercase px-4.5 py-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 transition-all duration-200 cursor-pointer shadow-sm active:scale-[0.98]"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <span>Promote to Explored / Visited</span>
                      </button>
                    </motion.div>
                  ))
                )}
              </motion.div>
            )}

            {/* Wishlist Destinations Tab */}
            {activeTab === 'wishlist' && (
              <motion.div 
                key="wishlist-grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {filteredWishlistCountries.length === 0 ? (
                  <div className="col-span-full py-16 text-center text-gray-400 bg-white/40 dark:bg-zinc-900/20 border border-dashed border-rose-500/20 dark:border-rose-500/10 rounded-3xl">
                    <Star className="w-10 h-10 mx-auto text-rose-400 dark:text-rose-500/40 mb-2 fill-current" />
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-300">No Wishlist Destinations Added Yet</p>
                    <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                      Save dream expeditions to your wishlist. You can add them here or click any unexplored territory on the Scratch Map.
                    </p>
                    <Button 
                      onClick={() => handleOpenAdd('wishlist')} 
                      className="mt-4 rounded-full bg-gradient-to-r from-rose-500 to-pink-600 text-white text-xs font-bold"
                    >
                      <Plus className="mr-1.5 h-4 w-4" /> Add Wishlist Destination
                    </Button>
                  </div>
                ) : (
                  filteredWishlistCountries.map(item => (
                    <motion.div 
                      key={item.id} 
                      layout
                      className="p-6 rounded-[2rem] border relative transition-all bg-white dark:bg-zinc-900/50 shadow-sm hover:shadow-md border-rose-500/20 dark:border-rose-500/15 bg-gradient-to-b from-rose-500/[0.03] to-transparent"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-4xl" role="img" aria-label="flag">
                            {getFlagEmoji(item.code)}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-black text-lg text-gray-900 dark:text-white tracking-tight leading-tight">{item.name}</h3>
                              <span className="px-2 py-0.5 rounded-full text-3xs font-bold uppercase tracking-wider bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-0.5">
                                <Star className="w-2.5 h-2.5 fill-current" /> Wishlist
                              </span>
                            </div>
                            <span className="text-[10px] font-bold text-rose-500 dark:text-rose-400 uppercase tracking-widest">{item.code} • {getRegion(item.code)}</span>
                          </div>
                        </div>

                        {/* Top corner actions */}
                        <div className="flex items-center gap-1 bg-gray-50 dark:bg-white/5 p-1.5 rounded-2xl">
                          <button 
                            onClick={() => handleOpenEdit(item)}
                            title="Edit Record" 
                            className="p-1 px-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-black dark:hover:text-white hover:bg-white dark:hover:bg-zinc-800 transition-all flex items-center"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleDeleteItem(item.id)}
                            title="Remove country" 
                            className="p-1 px-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-red-500 hover:bg-white dark:hover:bg-zinc-800 transition-all flex items-center"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {item.notes && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/5 p-3 rounded-2xl mb-4 italic">
                          "{item.notes}"
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-xs border-t border-gray-100 dark:border-white/5 pt-4">
                        <div>
                          <span className="text-gray-400 block text-[9px] font-bold uppercase tracking-wider">Target Voyage</span>
                          <span className="font-semibold">{item.visitDate || 'Future dream'}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[9px] font-bold uppercase tracking-wider">Classification</span>
                          <span className="font-semibold text-rose-500">Dream Destination</span>
                        </div>
                      </div>

                      {/* 1-Click Promote to Visited */}
                      <button 
                        onClick={() => handlePromoteWishlistToVisited(item)}
                        className="w-full mt-4 flex items-center justify-center gap-2 text-[11px] font-extrabold tracking-wider uppercase px-4.5 py-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 transition-all duration-200 cursor-pointer shadow-sm active:scale-[0.98]"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <span>Mark as Explored / Visited</span>
                      </button>
                    </motion.div>
                  ))
                )}
              </motion.div>
            )}

            {/* Cities tab */}
            {activeTab === 'cities' && (
              <motion.div 
                key="cities-table"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white/80 dark:bg-zinc-900/30 border border-gray-100 dark:border-white/5 rounded-[2.5rem] overflow-hidden"
              >
                {filteredCities.length === 0 ? (
                  <div className="py-20 text-center text-gray-400">
                    <MapPin className="w-10 h-10 mx-auto text-gray-300 dark:text-zinc-700 mb-2" />
                    <p className="text-sm font-bold">No cities registered in your map dataset yet</p>
                    <p className="text-xs text-gray-500 mt-1">Try to trigger History Scanner or custom Register city with Coordinates manually.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto min-w-full">
                    <table className="min-w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-white/5 text-gray-400 uppercase tracking-widest font-black text-[9px] bg-gray-50/50 dark:bg-white/5">
                          <th className="p-5 pl-8">City Name</th>
                          <th className="p-5">Country</th>
                          <th className="p-5">Map coordinates</th>
                          <th className="p-5">Visit Date</th>
                          <th className="p-5">Notes</th>
                          <th className="p-5 pr-8 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCities.map((item, idx) => (
                          <tr key={item.id} className="border-b border-gray-100 dark:border-white/5 hover:bg-gray-50/50 dark:hover:bg-whiteScale-5 transition-all">
                            <td className="p-5 pl-8 font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                              <span className="font-mono text-[10px] text-zinc-400">#{idx + 1}</span>
                              {item.name}
                            </td>
                            <td className="p-5">
                              <span className="flex items-center gap-1.5 font-bold">
                                <span className="text-lg">{item.countryCode ? getFlagEmoji(item.countryCode) : '🏳️'}</span>
                                {item.countryName || item.countryCode}
                              </span>
                            </td>
                            <td className="p-5">
                              <span className="font-mono bg-indigo-50/60 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 p-2 py-1 px-3 rounded-xl border border-indigo-500/10 font-bold block w-fit">
                                Lat: {item.lat?.toFixed(4) || '??'} • Lng: {item.lng?.toFixed(4) || '??'}
                              </span>
                            </td>
                            <td className="p-5 font-semibold text-gray-500">{item.visitDate || 'No date Logged'}</td>
                            <td className="p-5 text-gray-500 italic max-w-xs truncate" title={item.notes}>{item.notes || '—'}</td>
                            <td className="p-5 pr-8 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button 
                                  onClick={() => handleOpenEdit(item)}
                                  className="p-2 bg-gray-50 hover:bg-indigo-500 hover:text-white dark:bg-zinc-800 text-gray-500 rounded-xl transition-all"
                                  title="Edit Coordinates & Details"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="p-2 bg-gray-50 hover:bg-red-500 hover:text-white dark:bg-zinc-800 text-gray-500 rounded-xl transition-all"
                                  title="Remove City"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
                className="space-y-8"
              >
                
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Controls / Info */}
                  <div className="lg:col-span-4 space-y-6">
                    <Card className="!bg-gradient-to-b from-indigo-500//5 to-blue-500/5 border border-indigo-500/10 !rounded-[2rem]">
                      <h3 className="font-black text-lg tracking-tight mb-2">Automated Scanner</h3>
                      <p className="text-xs text-gray-500 leading-relaxed mb-4">
                        WanderGrid scans all historical details across flight paths and georoute itineraries to extract visited territory candidates.
                      </p>

                      <div className="bg-white/40 dark:bg-zinc-950/20 p-4 rounded-2xl border border-gray-100 dark:border-white/5 space-y-3 mb-6">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-400 font-bold block">Flights Audited:</span>
                          <span className="font-extrabold">{flights.length}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-400 font-bold block">Itineraries Checked:</span>
                          <span className="font-extrabold">{trips.length}</span>
                        </div>
                      </div>

                      <Button 
                        onClick={handleRunScan} 
                        disabled={scanActive}
                        className="w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white shadow font-bold"
                      >
                        {scanActive ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Analyzing Logs...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Re-Scan Database
                          </>
                        )}
                      </Button>
                    </Card>

                    <Card className="!rounded-[2rem] border border-gray-100 dark:border-white/5">
                      <div className="flex items-start gap-2.5">
                        <Info className="w-5 h-5 text-indigo-500 shrink-0" />
                        <div className="text-xs leading-relaxed text-gray-500">
                          <strong className="text-gray-900 dark:text-white font-bold block mb-1">Exclude Transits & Layovers</strong>
                          When layovers are discovered, WanderGrid marks them as transits so your map does not highlight countries you did not actively explore. Uncheck anything you want to omit before importing.
                        </div>
                      </div>
                    </Card>
                  </div>

                  {/* Scanned Candidates results */}
                  <div className="lg:col-span-8">
                    {scanResults.countries.length === 0 && scanResults.cities.length === 0 ? (
                      <div className="text-center py-20 bg-white/50 dark:bg-zinc-900/20 border border-dashed border-gray-200 dark:border-white/5 rounded-3xl text-gray-400">
                        <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-2 animate-bounce" />
                        <h4 className="font-bold text-sm text-gray-900 dark:text-white">All Clear! No uncatalogued spots.</h4>
                        <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">Every country and city from your vacation logs is already recorded in your curated atlas.</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        
                        {/* Header controls for import */}
                        <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-white/5 rounded-3xl">
                          <span className="text-xs font-bold text-gray-500">
                            Selected footprint: <strong className="text-indigo-600 dark:text-indigo-400">{selectedScanCountries.size}</strong> countries & <strong className="text-indigo-600 dark:text-indigo-400">{selectedScanCities.size}</strong> cities
                          </span>
                          
                          <Button 
                            onClick={handleBulkImport}
                            className="rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2 px-6"
                          >
                            <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-300" />
                            Register to Atlas ({selectedScanCountries.size + selectedScanCities.size} items)
                          </Button>
                        </div>

                        {/* Country Suggestions */}
                        {scanResults.countries.length > 0 && (
                          <div className="space-y-3">
                            <h4 className="text-xs font-black tracking-widest uppercase text-gray-400 flex items-center justify-between">
                              <span>Nations Discovered ({scanResults.countries.length})</span>
                              <div className="flex items-center gap-1.5 select-none">
                                <button 
                                  onClick={() => setSelectedScanCountries(new Set(scanResults.countries.map(c => c.code)))}
                                  className="text-[10px] text-indigo-500 lowercase hover:underline"
                                >
                                  select all
                                </button>
                                <span className="text-[9px] text-gray-300">•</span>
                                <button 
                                  onClick={() => setSelectedScanCountries(new Set())}
                                  className="text-[10px] text-gray-400 lowercase hover:underline"
                                >
                                  clear
                                </button>
                              </div>
                            </h4>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {scanResults.countries.map(candidate => {
                                const isSelected = selectedScanCountries.has(candidate.code);
                                return (
                                  <div 
                                    key={candidate.code}
                                    onClick={() => {
                                      const next = new Set(selectedScanCountries);
                                      if (isSelected) next.delete(candidate.code);
                                      else next.add(candidate.code);
                                      setSelectedScanCountries(next);
                                    }}
                                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                                      isSelected 
                                        ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-500/40' 
                                        : 'bg-white/50 dark:bg-zinc-900/10 border-gray-100 hover:border-gray-200 dark:border-white/5'
                                    }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <span className="text-3xl">{getFlagEmoji(candidate.code)}</span>
                                      <div>
                                        <span className="font-extrabold text-sm block leading-tight">{candidate.name}</span>
                                        <span className="text-[9px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest">{candidate.code} • source: {candidate.source}</span>
                                      </div>
                                    </div>
                                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                                      isSelected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-gray-200'
                                    }`}>
                                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Cities Suggestions */}
                        {scanResults.cities.length > 0 && (
                          <div className="space-y-3 pt-4">
                            <h4 className="text-xs font-black tracking-widest uppercase text-gray-400 flex items-center justify-between">
                              <span>Cities Discovered ({scanResults.cities.length})</span>
                              <div className="flex items-center gap-1.5 select-none">
                                <button 
                                  onClick={() => setSelectedScanCities(new Set(scanResults.cities.map(c => c.name)))}
                                  className="text-[10px] text-indigo-500 lowercase hover:underline"
                                >
                                  select all
                                </button>
                                <span className="text-[9px] text-gray-300">•</span>
                                <button 
                                  onClick={() => setSelectedScanCities(new Set())}
                                  className="text-[10px] text-gray-400 lowercase hover:underline"
                                >
                                  clear
                                </button>
                              </div>
                            </h4>

                            <div className="bg-white/50 dark:bg-zinc-900/30 border border-gray-100 dark:border-white/5 rounded-[2rem] overflow-hidden select-none">
                              <div className="p-3 bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-white/5 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
                                Click to toggle city exclusion before registration
                              </div>
                              <div className="max-h-[300px] overflow-y-auto divide-y divide-gray-100 dark:divide-white/5">
                                {scanResults.cities.map(candidate => {
                                  const isSelected = selectedScanCities.has(candidate.name);
                                  return (
                                    <div 
                                      key={candidate.name}
                                      onClick={() => {
                                        const next = new Set(selectedScanCities);
                                        if (isSelected) next.delete(candidate.name);
                                        else next.add(candidate.name);
                                        setSelectedScanCities(next);
                                      }}
                                      className={`p-4 hover:bg-gray-50/50 dark:hover:bg-whiteScale-5 transition-all cursor-pointer flex items-center justify-between ${
                                        isSelected ? 'bg-indigo-50/20 dark:bg-indigo-950/10' : 'bg-transparent text-gray-400'
                                      }`}
                                    >
                                      <div className="flex items-center gap-3">
                                        <span className="text-lg">{candidate.countryCode ? getFlagEmoji(candidate.countryCode) : '🏳️'}</span>
                                        <div>
                                          <span className="font-extrabold text-xs block leading-tight text-gray-900 dark:text-white">{candidate.name}</span>
                                          <span className="text-[9px] text-gray-400">country: {candidate.countryName} • source: {candidate.source} {candidate.lat ? `(Lat: ${candidate.lat.toFixed(2)})` : ''}</span>
                                        </div>
                                      </div>
                                      
                                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                                        isSelected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-gray-200'
                                      }`}>
                                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
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
      <AnimatePresence>
        {isModalOpen && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 font-sans" style={{ WebkitBackdropFilter: 'blur(4px)' }}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-light-card/90 dark:bg-dark-card/90 backdrop-blur-xl border border-black/10 dark:border-white/10 w-full max-w-lg rounded-3xl shadow-2xl relative overflow-hidden text-light-text dark:text-dark-text"
              style={{ WebkitBackdropFilter: 'blur(24px)' }}
            >
              <div className="p-6 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-primary-500/5 to-transparent">
                <div>
                  <span className="text-2xs font-bold uppercase tracking-wider bg-primary-500/10 text-primary-600 dark:text-primary-400 px-2 py-0.5 rounded-full border border-primary-500/20">
                    {editingItem ? 'Edit footprint record' : 'Add custom footprint'}
                  </span>
                  <h3 className="text-lg font-bold text-light-text dark:text-dark-text tracking-tight mt-1">
                    {modalType === 'country' ? 'Visited Country' : 'Visited City Hub'}
                  </h3>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
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
                      <span className="text-[10px] font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
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
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                        Classification
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'visited', label: 'Visited', icon: '✨', desc: 'Explored stay' },
                          { id: 'wishlist', label: 'Wishlist', icon: '🌟', desc: 'Dream target' },
                          { id: 'layover', label: 'Layover', icon: '🛫', desc: 'Transit only' },
                          { id: 'lived_current', label: 'Current Home', icon: '🏠', desc: 'Live here' },
                          { id: 'lived_past', label: 'Past Home', icon: '🏛️', desc: 'Lived here' },
                        ].map(st => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => {
                              setFormResidenceStatus(st.id as CountryResidenceStatus);
                              setFormIsTransit(st.id === 'layover');
                            }}
                            className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                              formResidenceStatus === st.id
                                ? st.id === 'wishlist'
                                  ? 'bg-rose-500/15 border-rose-500 text-rose-600 dark:text-rose-400 font-bold shadow-sm'
                                  : st.id === 'layover'
                                  ? 'bg-amber-500/15 border-amber-500 text-amber-600 dark:text-amber-400 font-bold shadow-sm'
                                  : 'bg-primary-500/15 border-primary-500 text-primary-600 dark:text-primary-400 font-bold shadow-sm'
                                : 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5 text-light-text dark:text-dark-text opacity-70 hover:opacity-100'
                            }`}
                          >
                            <span className="text-base block mb-0.5">{st.icon}</span>
                            <span className="text-xs font-bold block leading-tight">{st.label}</span>
                            <span className="text-[9px] text-light-text-secondary dark:text-dark-text-secondary block mt-0.5">{st.desc}</span>
                          </button>
                        ))}
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

                <div className="pt-4 border-t border-black/5 dark:border-white/5 flex gap-3">
                  <Button 
                    type="button" 
                    variant="secondary" 
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    variant="primary"
                    className="flex-1 text-xs"
                  >
                    {editingItem ? 'Save Record' : 'Register to Atlas'}
                  </Button>
                </div>

              </form>
            </motion.div>
          </div>,
          document.body
        )}
      </AnimatePresence>

    </div>
  );
};
