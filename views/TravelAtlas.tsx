import React, { useEffect, useState, useMemo } from 'react';
import { ViewState, VisitedItem, Trip } from '../types';
import { dataService } from '../services/mockDb';
import { getFlagEmoji, getRegion } from '../services/geoData';
import { resolvePlaceName, getCoordinates } from '../services/geocoding';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Compass, MapPin, Globe, Calendar, Plus, Trash2, Edit3, 
  Map, RefreshCw, Layers, CheckCircle2, AlertTriangle, Info,
  Bookmark, Shield, ChevronRight, X, Sparkles, Filter, Check
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
  const [activeTab, setActiveTab] = useState<'countries' | 'cities' | 'sync'>('countries');

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

  // Filtering processed
  const filteredCountries = useMemo(() => {
    return visitedItems.filter(item => {
      if (item.type !== 'country') return false;
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.code.toLowerCase().includes(searchQuery.toLowerCase());
      const region = getRegion(item.code);
      const matchesRegion = regionFilter === 'All' || region === regionFilter;
      return matchesSearch && matchesRegion;
    }).sort((a,b) => a.name.localeCompare(b.name));
  }, [visitedItems, searchQuery, regionFilter]);

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
    const nonTransitCountries = visitedItems.filter(item => item.type === 'country' && !item.isTransit);
    const transitCountries = visitedItems.filter(item => item.type === 'country' && item.isTransit);
    const cities = visitedItems.filter(item => item.type === 'city');
    
    return {
      totalCountries: nonTransitCountries.length,
      transitCount: transitCountries.length,
      totalCities: cities.length,
      worldPercentage: Math.max(0.1, Math.min(100, Math.round((nonTransitCountries.length / 195) * 1000) / 10))
    };
  }, [visitedItems]);

  // Launch Add/Edit Dialog
  const handleOpenAdd = (type: 'country' | 'city') => {
    setEditingItem(null);
    setModalType(type);
    setFormCountryCode('');
    setFormCountryName('');
    setFormCityName('');
    setFormLat('');
    setFormLng('');
    setFormVisitDate(new Date().toISOString().split('T')[0]);
    setFormNotes('');
    setFormIsTransit(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: VisitedItem) => {
    setEditingItem(item);
    setModalType(item.type);
    setFormCountryCode(item.code);
    setFormCountryName(item.name);
    setFormCityName(item.type === 'city' ? item.name : '');
    setFormCountryCode(item.countryCode || item.code);
    setFormCountryName(item.countryName || item.name);
    setFormLat(item.lat ? String(item.lat) : '');
    setFormLng(item.lng ? String(item.lng) : '');
    setFormVisitDate(item.visitDate || '');
    setFormNotes(item.notes || '');
    setFormIsTransit(!!item.isTransit);
    setIsModalOpen(true);
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
        const payload: VisitedItem = {
          id: editingItem?.id || `country_${formCountryCode.toUpperCase()}`,
          type: 'country',
          code: formCountryCode.toUpperCase(),
          name: formCountryName,
          visitDate: formVisitDate,
          notes: formNotes,
          isTransit: formIsTransit,
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
            Your absolute source of truth. Manage curated lists of countries and cities visited. Reclaim control of maps, passport stamps, and exclude transition points dynamically.
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
            <Plus className="mr-1.5 h-4 w-4" /> Country
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        
        <Card className="!bg-white/80 dark:!bg-zinc-900/60 border border-gray-50 dark:border-white/5 !rounded-[2rem] shadow-sm relative overflow-hidden" noPadding>
          <div className="p-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">Visited Nations</span>
            <span className="text-3xl font-black text-gray-900 dark:text-white">{stats.totalCountries}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500 block mt-1">Countries fully registered</span>
            <div className="absolute right-4 bottom-4 text-indigo-600/10">
              <Globe className="w-12 h-12" />
            </div>
          </div>
        </Card>

        <Card className="!bg-white/80 dark:!bg-zinc-900/60 border border-gray-50 dark:border-white/5 !rounded-[2rem] shadow-sm relative overflow-hidden" noPadding>
          <div className="p-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">Transit Nodes</span>
            <span className="text-3xl font-black text-amber-500">{stats.transitCount}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500 block mt-1">Ignored in maps & stamps</span>
            <div className="absolute right-4 bottom-4 text-amber-600/10">
              <Layers className="w-12 h-12" />
            </div>
          </div>
        </Card>

        <Card className="!bg-white/80 dark:!bg-zinc-900/60 border border-gray-50 dark:border-white/5 !rounded-[2rem] shadow-sm relative overflow-hidden" noPadding>
          <div className="p-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">Footprint Cities</span>
            <span className="text-3xl font-black text-gray-900 dark:text-white">{stats.totalCities}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500 block mt-1">Map markers highlighted</span>
            <div className="absolute right-4 bottom-4 text-blue-600/10">
              <MapPin className="w-12 h-12" />
            </div>
          </div>
        </Card>

        <Card className="!bg-gradient-to-br from-indigo-600 to-blue-700 border-0 !rounded-[2rem] shadow-md relative overflow-hidden text-white" noPadding>
          <div className="p-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-200 block mb-1">Global Coverage</span>
            <span className="text-3xl font-black tracking-tight">{stats.worldPercentage}%</span>
            <div className="w-full bg-white/20 h-1.5 rounded-full mt-2 relative overflow-hidden">
              <div className="bg-amber-300 h-full rounded-full" style={{ width: `${stats.worldPercentage}%` }} />
            </div>
            <span className="text-xs text-white/70 block mt-2">Nations: {stats.totalCountries} / 195</span>
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
      <div className="flex items-center gap-2 border-b border-gray-100 dark:border-white/5 mb-6">
        <button 
          onClick={() => setActiveTab('countries')}
          className={`pb-4 px-2 text-sm font-black tracking-wider uppercase transition-all border-b-2 relative ${
            activeTab === 'countries' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Countries List
        </button>
        <button 
          onClick={() => setActiveTab('cities')}
          className={`pb-4 px-2 text-sm font-black tracking-wider uppercase transition-all border-b-2 relative ${
            activeTab === 'cities' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Track Cities
        </button>
        <button 
          onClick={() => setActiveTab('sync')}
          className={`pb-4 px-2 text-sm font-black tracking-wider uppercase transition-all border-b-2 relative flex items-center gap-1.5 ${
            activeTab === 'sync' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Sync Scanner
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
              placeholder={`Search visited ${activeTab}...`} 
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
            
            {/* Countries tab */}
            {activeTab === 'countries' && (
              <motion.div 
                key="countries-grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {filteredCountries.length === 0 ? (
                  <div className="col-span-full py-16 text-center text-gray-400 bg-white/40 dark:bg-zinc-900/20 border border-dashed border-gray-200 dark:border-white/5 rounded-3xl">
                    <Globe className="w-10 h-10 mx-auto text-gray-300 dark:text-zinc-700 mb-2" />
                    <p className="text-sm font-bold">No countries resolved here</p>
                    <p className="text-xs text-gray-500 mt-1">Try to Scan history from top right, or manually register your first country.</p>
                  </div>
                ) : (
                  filteredCountries.map(item => (
                    <motion.div 
                      key={item.id} 
                      layout
                      className={`p-6 rounded-[2rem] border relative transition-all bg-white dark:bg-zinc-900/50 shadow-sm hover:shadow-md ${
                        item.isTransit 
                          ? 'border-dashed border-amber-300/60 dark:border-amber-500/20 bg-amber-50/5 dark:bg-amber-950/5' 
                          : 'border-gray-100 dark:border-white/5'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-4xl" role="img" aria-label="flag">
                            {getFlagEmoji(item.code)}
                          </span>
                          <div>
                            <h3 className="font-black text-lg text-gray-900 dark:text-white tracking-tight leading-tight">{item.name}</h3>
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

                      {/* Transit toggle */}
                      <button 
                        onClick={() => handleToggleTransit(item)}
                        className={`w-full mt-4 flex items-center justify-between text-[11px] font-extrabold tracking-wider uppercase px-4.5 py-3 rounded-2xl border transition-all duration-200 ${
                          item.isTransit 
                            ? 'bg-amber-100/50 hover:bg-amber-100/70 border-amber-300/60 text-amber-900 dark:bg-amber-950/35 dark:hover:bg-amber-950/50 dark:border-amber-900/40 dark:text-amber-300' 
                            : 'bg-indigo-100/50 hover:bg-indigo-100/70 border-indigo-200/50 text-indigo-900 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/50 dark:border-indigo-900/30 dark:text-indigo-300'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5" />
                          {item.isTransit ? 'Transit Point (Transit Only)' : 'Active Visited'}
                        </span>
                        <span className="font-bold underline text-[9px]">Toggle</span>
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
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-white/5 w-full max-w-lg rounded-[2.5rem] shadow-2xl relative overflow-hidden text-gray-900 dark:text-gray-100"
            >
              <div className="p-8 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
                <div>
                  <span className="text-xs font-black uppercase text-indigo-500 tracking-wider">
                    {editingItem ? 'Edit footprint record' : 'Add custom footprint'}
                  </span>
                  <h3 className="text-2xl font-black mt-1">
                    {modalType === 'country' ? 'Visited Country' : 'Visited City Hub'}
                  </h3>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 bg-gray-50 hover:bg-gray-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-full transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveItem} className="p-8 space-y-5">
                
                {modalType === 'country' ? (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-1 select-none">
                        <label className="text-[10px] font-bold uppercase text-gray-400 block mb-2">Country Code</label>
                        <input 
                          type="text"
                          required
                          placeholder="e.g. US"
                          maxLength={2}
                          value={formCountryCode}
                          onChange={(e) => setFormCountryCode(e.target.value.toUpperCase())}
                          className="w-full bg-white dark:bg-zinc-950 border border-gray-200 dark:border-white/10 rounded-2xl py-3 px-4 text-xs font-extrabold focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                        />
                      </div>
                      <div className="col-span-2 select-none">
                        <label className="text-[10px] font-bold uppercase text-gray-400 block mb-2">Full Country Name</label>
                        <input 
                          type="text"
                          required
                          placeholder="e.g. United States"
                          value={formCountryName}
                          onChange={(e) => setFormCountryName(e.target.value)}
                          className="w-full bg-white dark:bg-zinc-950 border border-gray-200 dark:border-white/10 rounded-2xl py-3 px-4 text-xs font-bold focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-2xl">
                      <div>
                        <span className="text-xs font-bold block mb-0.5">Layover / Transit Only</span>
                        <span className="text-[10px] text-gray-500">If checked, ignores this from standard visited lists and maps</span>
                      </div>
                      <input 
                        type="checkbox"
                        checked={formIsTransit}
                        onChange={(e) => setFormIsTransit(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-200 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="select-none">
                      <label className="text-[10px] font-bold uppercase text-gray-400 block mb-2">City Name</label>
                      <input 
                        type="text"
                        required
                        placeholder="e.g. Paris"
                        value={formCityName}
                        onChange={(e) => {
                          setFormCityName(e.target.value);
                        }}
                        onBlur={() => handleResolveCoordsForCity(formCityName)}
                        className="w-full bg-white dark:bg-zinc-950 border border-gray-200 dark:border-white/10 rounded-2xl py-3 px-4 text-xs font-bold focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">Leaves field to auto-geocode coordinates</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="select-none">
                        <label className="text-[10px] font-bold uppercase text-gray-400 block mb-2">Parent Country Code</label>
                        <input 
                          type="text"
                          required
                          placeholder="e.g. FR"
                          maxLength={2}
                          value={formCountryCode}
                          onChange={(e) => setFormCountryCode(e.target.value.toUpperCase())}
                          className="w-full bg-white dark:bg-zinc-950 border border-gray-200 dark:border-white/10 rounded-2xl py-3 px-4 text-xs font-extrabold focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                        />
                      </div>
                      <div className="select-none">
                        <label className="text-[10px] font-bold uppercase text-gray-400 block mb-2">Country Name</label>
                        <input 
                          type="text"
                          required
                          placeholder="e.g. France"
                          value={formCountryName}
                          onChange={(e) => setFormCountryName(e.target.value)}
                          className="w-full bg-white dark:bg-zinc-950 border border-gray-200 dark:border-white/10 rounded-2xl py-3 px-4 text-xs font-bold focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="select-none">
                        <label className="text-[10px] font-bold uppercase text-gray-400 block mb-2">Latitude (Degree)</label>
                        <input 
                          type="text"
                          required
                          placeholder="e.g. 48.8566"
                          value={formLat}
                          onChange={(e) => setFormLat(e.target.value)}
                          className="w-full bg-white dark:bg-zinc-950 border border-gray-200 dark:border-white/10 rounded-2xl py-3 px-4 text-xs font-mono focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                        />
                      </div>
                      <div className="select-none">
                        <label className="text-[10px] font-bold uppercase text-gray-400 block mb-2">Longitude (Degree)</label>
                        <input 
                          type="text"
                          required
                          placeholder="e.g. 2.3522"
                          value={formLng}
                          onChange={(e) => setFormLng(e.target.value)}
                          className="w-full bg-white dark:bg-zinc-950 border border-gray-200 dark:border-white/10 rounded-2xl py-3 px-4 text-xs font-mono focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-1 gap-4">
                  <div className="select-none">
                    <label className="text-[10px] font-bold uppercase text-gray-400 block mb-2">Visit Date (YYYY-MM-DD)</label>
                    <input 
                      type="date"
                      value={formVisitDate}
                      onChange={(e) => setFormVisitDate(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-950 border border-gray-200 dark:border-white/10 rounded-2xl py-3 px-4 text-xs font-bold focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                    />
                  </div>
                  
                  <div className="select-none">
                    <label className="text-[10px] font-bold uppercase text-gray-400 block mb-2">Optional Notes</label>
                    <textarea 
                      placeholder="e.g. Wonderful local bistros, beautiful culture..."
                      rows={2}
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-950 border border-gray-200 dark:border-white/10 rounded-2xl py-3 px-4 text-xs font-medium focus:ring-2 focus:ring-indigo-500 transition-all outline-none resize-none"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 dark:border-white/5 flex gap-3">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 rounded-2xl text-xs font-bold"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-1 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow"
                  >
                    {editingItem ? 'Save Record' : 'Register to Atlas'}
                  </Button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
