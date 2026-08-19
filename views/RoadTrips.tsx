import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { 
  Plus, Search, Filter, Calendar, MapPin, Trash2, Edit2, 
  ChevronDown, ChevronUp, Clock, DollarSign, Compass, 
  Map, ArrowRight, Server, Sparkles, Navigation, Train, 
  Bus, HelpCircle, RefreshCw, Leaf, Anchor, Grid, Info
} from 'lucide-react';
import { Card, Button, Input, Select, Badge, TimeInput, Autocomplete, Modal } from '../components/ui';
import { Trip, Transport, TransportMode, RoadTripWaypoint, ViewState } from '../types';
import { dataService } from '../services/mockDb';
import { motion, AnimatePresence } from 'motion/react';
import L from 'leaflet';
import { getCoordinates, getCoordinatesSync, searchLocations } from '../services/geocoding';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const DeckFlightMap = lazy(() => import('../components/DeckFlightMap').then(m => ({ default: m.DeckFlightMap || m.default })));

const useDarkMode = () => {
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
};

const MODE_META: Record<Extract<TransportMode, 'Train' | 'Bus' | 'Car Rental' | 'Personal Car' | 'Cruise' | 'Ferry'>, {
  label: string;
  icon: any;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  ecoRating: string; // Description of ecological index
}> = {
  'Train': { 
    label: 'Train / Railway', 
    icon: Train, 
    colorClass: 'text-amber-500 dark:text-amber-400', 
    bgClass: 'bg-amber-500/10 dark:bg-amber-400/5',
    borderClass: 'border-amber-500/20 dark:border-amber-400/10',
    ecoRating: 'Ultra-low carbon emission (14g CO2/km)'
  },
  'Bus': { 
    label: 'Bus / Coach', 
    icon: Bus, 
    colorClass: 'text-emerald-500 dark:text-emerald-400', 
    bgClass: 'bg-emerald-500/10 dark:bg-emerald-400/5',
    borderClass: 'border-emerald-500/20 dark:border-emerald-400/10',
    ecoRating: 'Very low carbon footprint (28g CO2/km)'
  },
  'Car Rental': { 
    label: 'Car Rental', 
    icon: Navigation, 
    colorClass: 'text-blue-500 dark:text-blue-400', 
    bgClass: 'bg-blue-500/10 dark:bg-blue-400/5',
    borderClass: 'border-blue-500/20 dark:border-blue-400/10',
    ecoRating: 'Average carbon footprint (120g CO2/km)'
  },
  'Personal Car': { 
    label: 'Personal Car', 
    icon: Navigation, 
    colorClass: 'text-indigo-500 dark:text-indigo-400', 
    bgClass: 'bg-indigo-500/10 dark:bg-indigo-400/5',
    borderClass: 'border-indigo-500/20 dark:border-indigo-400/10',
    ecoRating: 'Average carbon footprint (125g CO2/km)'
  },
  'Cruise': { 
    label: 'Cruise Voyage', 
    icon: Compass, 
    colorClass: 'text-cyan-500 dark:text-cyan-400', 
    bgClass: 'bg-cyan-500/10 dark:bg-cyan-400/5',
    borderClass: 'border-cyan-500/20 dark:border-cyan-400/10',
    ecoRating: 'High transport footprint (150g CO2/km)'
  },
  'Ferry': { 
    label: 'Ferry Crossing', 
    icon: Anchor, 
    colorClass: 'text-teal-500 dark:text-teal-400', 
    bgClass: 'bg-teal-500/10 dark:bg-teal-400/5',
    borderClass: 'border-teal-500/20 dark:border-teal-400/10',
    ecoRating: 'Moderate transport footprint (90g CO2/km)'
  }
};

export const RoadTrips: React.FC<{ onTripClick?: (id: string) => void }> = ({ onTripClick }) => {
  const [roadTrips, setRoadTrips] = useState<any[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Filtering & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'Upcoming' | 'Past' | 'All'>('All');
  const [sortBy, setSortBy] = useState<'date-asc' | 'date-desc' | 'cost-desc' | 'duration-desc'>('date-asc');
  
  // Track expanded cards for waypoints/timeline toggle
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  // Editing state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransport, setEditingTransport] = useState<any | null>(null);

  // Modal Form States
  const [formMode, setFormMode] = useState<Extract<TransportMode, 'Train' | 'Bus' | 'Car Rental' | 'Personal Car' | 'Cruise' | 'Ferry'>>('Train');
  const [formOrigin, setFormOrigin] = useState('');
  const [formDestination, setFormDestination] = useState('');
  const [formDepDate, setFormDepDate] = useState('');
  const [formDepTime, setFormDepTime] = useState('12:00');
  const [formArrDate, setFormArrDate] = useState('');
  const [formArrTime, setFormArrTime] = useState('14:00');
  const [formProvider, setFormProvider] = useState('');
  const [formIdentifier, setFormIdentifier] = useState('');
  const [formConfirmationCode, setFormConfirmationCode] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formTripId, setFormTripId] = useState('unassigned');
  
  // Waypoints in current form
  const [formWaypoints, setFormWaypoints] = useState<RoadTripWaypoint[]>([]);
  const [newWaypointName, setNewWaypointName] = useState('');
  const [newWaypointType, setNewWaypointType] = useState<RoadTripWaypoint['type']>('Stop');
  const [newWaypointNotes, setNewWaypointNotes] = useState('');

  // Interactive Map & Insights Hud States
  const isDark = useDarkMode();
  const [hubTab, setHubTab] = useState<'map' | 'chart'>('map');
  const [isHubExpanded, setIsHubExpanded] = useState(true);
  const [importTripId, setImportTripId] = useState('');
  const [importMode, setImportMode] = useState<'Train' | 'Bus' | 'Car Rental' | 'Personal Car' | 'Cruise' | 'Ferry'>('Train');
  const [importState, setImportState] = useState<{ status: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ status: 'idle', message: '' });
  const [pendingSuggestions, setPendingSuggestions] = useState<any[] | null>(null);

  const chartData = useMemo(() => {
    const sums: Record<string, { distance: number; timeMinutes: number; count: number }> = {
      'Train': { distance: 0, timeMinutes: 0, count: 0 },
      'Bus': { distance: 0, timeMinutes: 0, count: 0 },
      'Car': { distance: 0, timeMinutes: 0, count: 0 },
      'Ferry': { distance: 0, timeMinutes: 0, count: 0 },
      'Cruise': { distance: 0, timeMinutes: 0, count: 0 },
    };

    roadTrips.forEach(tr => {
      let modeKey = 'Train';
      if (tr.mode === 'Train') modeKey = 'Train';
      else if (tr.mode === 'Bus') modeKey = 'Bus';
      else if (tr.mode === 'Car Rental' || tr.mode === 'Personal Car') modeKey = 'Car';
      else if (tr.mode === 'Ferry') modeKey = 'Ferry';
      else if (tr.mode === 'Cruise') modeKey = 'Cruise';
      else return;

      let distanceKm = tr.distance || 0;
      let durationMinutes = tr.duration || 0;
      if (!durationMinutes && tr.departureDate && tr.arrivalDate) {
        const dep = new Date(`${tr.departureDate}T${tr.departureTime || '00:00'}`);
        const arr = new Date(`${tr.arrivalDate}T${tr.arrivalTime || '00:00'}`);
        const diffMs = arr.getTime() - dep.getTime();
        if (diffMs > 0) durationMinutes = Math.floor(diffMs / 60000);
      }

      if (!distanceKm && durationMinutes > 0) {
        const speeds: Record<string, number> = {
          'Train': 120,
          'Bus': 70,
          'Car Rental': 90,
          'Personal Car': 95,
          'Cruise': 30,
          'Ferry': 40
        };
        const avgSpeed = speeds[tr.mode] || 80;
        distanceKm = Math.round((durationMinutes / 60) * avgSpeed);
      }

      sums[modeKey].distance += distanceKm;
      sums[modeKey].timeMinutes += durationMinutes;
      sums[modeKey].count += 1;
    });

    return Object.keys(sums).map(mode => ({
      name: mode,
      Distance: sums[mode].distance,
      Duration: Math.round((sums[mode].timeMinutes / 60) * 10) / 10,
      Count: sums[mode].count
    }));
  }, [roadTrips]);

  const generateImportSuggestions = (tripId: string, defaultMode: any) => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return [];

    const locations = [...(trip.locations || [])];
    if (locations.length < 2) {
      throw new Error("Trip must have at least 2 locations in the Visual Route Planner to auto-detect and import route segments.");
    }

    // Sort locations chronologically
    locations.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    const suggestions: any[] = [];
    const currentTransports = [...(trip.transports || [])];

    for (let i = 0; i < locations.length - 1; i++) {
      const locA = locations[i];
      const locB = locations[i + 1];

      // Check for existing transport between consecutive locations to avoid duplicating
      const alreadyExists = currentTransports.some(tr => 
        tr.origin.toLowerCase().trim() === locA.name.toLowerCase().trim() &&
        tr.destination.toLowerCase().trim() === locB.name.toLowerCase().trim()
      );

      if (!alreadyExists) {
        // Estimate distance based on speed
        const speeds: Record<string, number> = {
          'Train': 120,
          'Bus': 70,
          'Car Rental': 90,
          'Personal Car': 95,
          'Cruise': 30,
          'Ferry': 40
        };
        const avgSpeed = speeds[defaultMode] || 80;
        
        // Calculate duration based on time between locations, capped to a reasonable duration
        const dateA = new Date(locA.endDate || locA.startDate);
        const dateB = new Date(locB.startDate);
        let diffHours = Math.abs(dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60);
        if (isNaN(diffHours) || diffHours <= 0) diffHours = 4; // default 4 hours
        if (diffHours > 24) diffHours = 6; // cap to 6 hours for a single transit segment

        const durationMinutes = Math.round(diffHours * 60);
        const calculatedDistance = Math.round(diffHours * avgSpeed);

        const newSegment: any = {
          id: `land-trip-${Math.random().toString(36).substring(2, 11)}`,
          itineraryId: 'route-gen',
          type: 'One-Way',
          mode: defaultMode,
          origin: locA.name,
          destination: locB.name,
          departureDate: locA.endDate || locA.startDate,
          departureTime: '10:00',
          arrivalDate: locB.startDate,
          arrivalTime: '14:00',
          provider: defaultMode === 'Train' ? 'National Rail' : (defaultMode === 'Bus' ? 'Coach Express' : 'Road Link'),
          identifier: `${defaultMode.toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`,
          confirmationCode: `AUTO-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          cost: 45, // reasonable guess
          notes: `Automatically imported from trip visual route segment.`,
          waypoints: [],
          duration: durationMinutes,
          distance: calculatedDistance,
          tripId: trip.id
        };

        suggestions.push(newSegment);
      }
    }

    return suggestions;
  };

  const handleTriggerImport = async () => {
    if (!importTripId) return;
    try {
      setImportState({ status: 'loading', message: 'Analyzing itinerary routes...' });
      const suggs = generateImportSuggestions(importTripId, importMode);
      
      if (suggs.length === 0) {
        setImportState({ 
          status: 'success', 
          message: 'Itinerary sync analysis completed! All potential route segments already exist inside this road trips list.' 
        });
      } else {
        setPendingSuggestions(suggs);
        setImportState({ 
          status: 'idle', 
          message: '' 
        });
      }
    } catch (e: any) {
      console.error(e);
      setImportState({ status: 'error', message: e.message || 'Failed to detect segments.' });
    }
  };

  const handleConfirmSaveSuggestions = async () => {
    if (!pendingSuggestions || pendingSuggestions.length === 0) return;
    try {
      setLoading(true);
      setImportState({ status: 'loading', message: 'Saving segment details...' });

      const tripId = pendingSuggestions[0].tripId;
      const trip = trips.find(t => t.id === tripId);
      if (!trip) throw new Error("Trip not found");

      // Save each segment independently in flights
      for (const seg of pendingSuggestions) {
        await dataService.addFlight(seg);
      }

      // Add to trip transports list
      const updatedTransports = [...(trip.transports || []), ...pendingSuggestions];
      await dataService.updateTrip({
        ...trip,
        transports: updatedTransports
      });

      setImportState({
        status: 'success',
        message: `Success! Synchronized and imported ${pendingSuggestions.length} new land segment(s) into this master registry.`
      });
      setPendingSuggestions(null);

      window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
      await loadData();
    } catch (e: any) {
      console.error(e);
      setImportState({ status: 'error', message: e.message || 'Failed to verify suggestions.' });
    } finally {
      setLoading(false);
    }
  };

  // Fetch initial data
  const loadData = async () => {
    try {
      setLoading(true);
      const data = await dataService.getRoadTrips();
      const loadedTrips = await dataService.getTrips();
      setRoadTrips(data);
      setTrips(loadedTrips);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Failed to fetch road trip records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleCard = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCards(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Compute analytics based on current matching road trips
  const stats = useMemo(() => {
    let totalKm = 0;
    let totalMinutes = 0;
    let totalExpense = 0;
    let totalTrainAndBusCount = 0;
    
    roadTrips.forEach(tr => {
      // Parse cost
      if (tr.cost) totalExpense += parseFloat(tr.cost) || 0;
      
      // Attempt to estimate duration if missing
      let durationMinutes = tr.duration || 0;
      if (!durationMinutes && tr.departureDate && tr.arrivalDate) {
        const dep = new Date(`${tr.departureDate}T${tr.departureTime || '00:00'}`);
        const arr = new Date(`${tr.arrivalDate}T${tr.arrivalTime || '00:00'}`);
        const diffMs = arr.getTime() - dep.getTime();
        if (diffMs > 0) durationMinutes = Math.floor(diffMs / 60000);
      }
      totalMinutes += durationMinutes;

      // Estimate distance in km based on duration if missing
      let distanceKm = tr.distance || 0;
      if (!distanceKm && durationMinutes > 0) {
        // Approximate average speeds (km/h)
        const speeds: Record<string, number> = {
          'Train': 120,
          'Bus': 70,
          'Car Rental': 90,
          'Personal Car': 95,
          'Cruise': 30,
          'Ferry': 40
        };
        const avgSpeed = speeds[tr.mode] || 80;
        distanceKm = Math.round((durationMinutes / 60) * avgSpeed);
      }
      totalKm += distanceKm;

      if (tr.mode === 'Train' || tr.mode === 'Bus') {
        totalTrainAndBusCount += 1;
      }
    });

    // Assume 1km of flight is ~115g CO2, whereas trains average 14g, buses 28g.
    // Savings = (Flight emissions - Actual emissions) * distance
    let flightsHypotheticalCo2Kg = (totalKm * 115) / 1000;
    let actualCo2Kg = 0;
    roadTrips.forEach(tr => {
      let trDist = tr.distance || 0;
      if (!trDist && tr.duration) {
        const speeds: Record<string, number> = { 'Train': 120, 'Bus': 70, 'Car Rental': 90, 'Personal Car': 95, 'Cruise': 30, 'Ferry': 40 };
        const avgSpeed = speeds[tr.mode] || 80;
        trDist = (tr.duration / 60) * avgSpeed;
      }
      const multipliers: Record<string, number> = {
        'Train': 14,
        'Bus': 28,
        'Car Rental': 120,
        'Personal Car': 125,
        'Cruise': 150,
        'Ferry': 90
      };
      const factor = multipliers[tr.mode] || 100;
      actualCo2Kg += (trDist * factor) / 1000;
    });

    const co2SavedKg = Math.max(0, Math.round(flightsHypotheticalCo2Kg - actualCo2Kg));
    // 1 standard tree absorbs roughly 22kg CO2 per year
    const treeEquivalent = Math.round(co2SavedKg / 22);

    return {
      totalDistance: Math.round(totalKm),
      totalDurationHours: Math.round(totalMinutes / 60),
      totalExpense,
      co2SavedKg,
      treeEquivalent,
      greenRatio: roadTrips.length ? Math.round((totalTrainAndBusCount / roadTrips.length) * 100) : 0
    };
  }, [roadTrips]);

  // Filter schedules
  const filteredRoadTrips = useMemo(() => {
    return roadTrips.filter(tr => {
      // 1. Keyword query search
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = !query || 
        (tr.origin || '').toLowerCase().includes(query) ||
        (tr.destination || '').toLowerCase().includes(query) ||
        (tr.provider || '').toLowerCase().includes(query) ||
        (tr.identifier || '').toLowerCase().includes(query) ||
        (tr.confirmationCode || '').toLowerCase().includes(query) ||
        (tr.notes || '').toLowerCase().includes(query);

      // 2. Mode category filter
      const matchesMode = modeFilter === 'All' || tr.mode === modeFilter;

      // 3. Status filter
      const now = new Date();
      now.setHours(0,0,0,0);
      const depDate = new Date(tr.departureDate);
      let matchesStatus = true;
      if (statusFilter === 'Upcoming') {
        matchesStatus = depDate >= now;
      } else if (statusFilter === 'Past') {
        matchesStatus = depDate < now;
      }

      return matchesSearch && matchesMode && matchesStatus;
    }).sort((a, b) => {
      // 4. In-memory sorting
      if (sortBy === 'date-asc') {
        const timeA = new Date(`${a.departureDate}T${a.departureTime || '00:00'}`).getTime();
        const timeB = new Date(`${b.departureDate}T${b.departureTime || '00:00'}`).getTime();
        return timeA - timeB;
      }
      if (sortBy === 'date-desc') {
        const timeA = new Date(`${a.departureDate}T${a.departureTime || '00:00'}`).getTime();
        const timeB = new Date(`${b.departureDate}T${b.departureTime || '00:00'}`).getTime();
        return timeB - timeA;
      }
      if (sortBy === 'cost-desc') {
        return (parseFloat(b.cost) || 0) - (parseFloat(a.cost) || 0);
      }
      if (sortBy === 'duration-desc') {
        const durA = a.duration || 0;
        const durB = b.duration || 0;
        return durB - durA;
      }
      return 0;
    });
  }, [roadTrips, searchQuery, modeFilter, statusFilter, sortBy]);

  // Reset modal fields for create
  const handleOpenCreateModal = () => {
    setEditingTransport(null);
    setFormMode('Train');
    setFormOrigin('');
    setFormDestination('');
    
    // Default to current date
    const todayStr = new Date().toISOString().split('T')[0];
    setFormDepDate(todayStr);
    setFormDepTime('12:00');
    setFormArrDate(todayStr);
    setFormArrTime('15:00');
    
    setFormProvider('');
    setFormIdentifier('');
    setFormConfirmationCode('');
    setFormCost('');
    setFormNotes('');
    setFormTripId('unassigned');
    setFormWaypoints([]);
    
    setNewWaypointName('');
    setNewWaypointType('Stop');
    setNewWaypointNotes('');
    
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleOpenEditModal = (tr: any) => {
    setEditingTransport(tr);
    setFormMode(tr.mode || 'Train');
    setFormOrigin(tr.origin || '');
    setFormDestination(tr.destination || '');
    setFormDepDate(tr.departureDate || '');
    setFormDepTime(tr.departureTime || '12:00');
    setFormArrDate(tr.arrivalDate || '');
    setFormArrTime(tr.arrivalTime || '14:00');
    setFormProvider(tr.provider || '');
    setFormIdentifier(tr.identifier || '');
    setFormConfirmationCode(tr.confirmationCode || '');
    setFormCost(tr.cost ? String(tr.cost) : '');
    setFormNotes(tr.notes || '');
    setFormTripId(tr.tripId || 'unassigned');
    setFormWaypoints(tr.waypoints || []);
    
    setNewWaypointName('');
    setNewWaypointType('Stop');
    setNewWaypointNotes('');
    
    setIsModalOpen(true);
  };

  // Save changes
  const handleSaveTransport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formOrigin.trim() || !formDestination.trim() || !formDepDate) {
      alert("Origin city, Destination city, and Departure Date are required.");
      return;
    }

    try {
      setLoading(true);
      const isNew = !editingTransport;
      
      // Compute estimated travel duration (in minutes)
      const depDateTime = new Date(`${formDepDate}T${formDepTime || '00:00'}`);
      const arrDateTime = new Date(`${formArrDate || formDepDate}T${formArrTime || '00:00'}`);
      let calculatedDuration = 0;
      if (arrDateTime.getTime() > depDateTime.getTime()) {
        calculatedDuration = Math.round((arrDateTime.getTime() - depDateTime.getTime()) / 60000);
      }

      // Estimate distance based on mode and minutes
      const speeds: Record<string, number> = {
        'Train': 120,
        'Bus': 70,
        'Car Rental': 90,
        'Personal Car': 95,
        'Cruise': 30,
        'Ferry': 40
      };
      const kmSpeed = speeds[formMode] || 80;
      const calculatedDistance = Math.round((calculatedDuration / 60) * kmSpeed);

      // Resolve coordinates on-the-fly for persistence
      let originLat = editingTransport?.originLat;
      let originLng = editingTransport?.originLng;
      let destLat = editingTransport?.destLat;
      let destLng = editingTransport?.destLng;

      try {
        const originCoords = await getCoordinates(formOrigin.trim());
        if (originCoords) {
          originLat = originCoords.lat;
          originLng = originCoords.lng;
        }
      } catch (err) {
        console.warn("Could not geocode origin", err);
      }

      try {
        const destCoords = await getCoordinates(formDestination.trim());
        if (destCoords) {
          destLat = destCoords.lat;
          destLng = destCoords.lng;
        }
      } catch (err) {
        console.warn("Could not geocode destination", err);
      }

      const transportPayload: any = {
        id: isNew ? `land-trip-${Math.random().toString(36).substring(2, 11)}` : editingTransport.id,
        itineraryId: editingTransport?.itineraryId || 'roadtrip-ref',
        type: editingTransport?.type || 'One-Way',
        mode: formMode,
        origin: formOrigin.trim(),
        destination: formDestination.trim(),
        originLat,
        originLng,
        destLat,
        destLng,
        departureDate: formDepDate,
        departureTime: formDepTime,
        arrivalDate: formArrDate || formDepDate,
        arrivalTime: formArrTime,
        provider: formProvider.trim(),
        identifier: formIdentifier.trim(),
        confirmationCode: formConfirmationCode.trim(),
        cost: formCost ? parseFloat(formCost) || undefined : undefined,
        notes: formNotes,
        waypoints: formWaypoints,
        duration: calculatedDuration,
        distance: calculatedDistance,
        tripId: formTripId === 'unassigned' ? undefined : formTripId,
      };

      // Ensure if we link this to a trip, we also add it to that trip's transports array in the db,
      // and update the trip!
      
      if (formTripId !== 'unassigned') {
        const selectedTrip = trips.find(t => t.id === formTripId);
        if (selectedTrip) {
          const tripTransports = selectedTrip.transports ? [...selectedTrip.transports] : [];
          // Remove old version if updating
          const index = tripTransports.findIndex(tx => tx.id === transportPayload.id);
          if (index >= 0) {
            tripTransports[index] = transportPayload;
          } else {
            tripTransports.push(transportPayload);
          }
          await dataService.updateTrip({
            ...selectedTrip,
            transports: tripTransports
          });
        }
      }

      // Also persist independently in the general transports table using `addFlight`/`updateFlight` API proxy endpoints.
      if (isNew) {
        await dataService.addFlight(transportPayload);
      } else {
        await dataService.updateFlight(transportPayload);
      }

      // If we switched from a previously assigned trip, clean it up from there
      if (!isNew && editingTransport.tripId && editingTransport.tripId !== formTripId) {
        const oldTrip = trips.find(t => t.id === editingTransport.tripId);
        if (oldTrip && oldTrip.transports) {
          const updatedOldTransports = oldTrip.transports.filter(tx => tx.id !== editingTransport.id);
          await dataService.updateTrip({
            ...oldTrip,
            transports: updatedOldTransports
          });
        }
      }

      // Dispatch invalidation to invoke global Window sync
      window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error occurred while saving travel ticket.');
    } finally {
      setLoading(false);
    }
  };

  // Delete transport ticket
  const handleDeleteTransport = async (id: string, tripId?: string) => {
    if (!confirm("Are you sure you want to delete this land travel?")) return;
    try {
      setLoading(true);
      // Delete independent
      await dataService.deleteFlight(id);

      // If associated to a trip, remove it from the trip's transports list
      if (tripId) {
        const linkedTrip = trips.find(t => t.id === tripId);
        if (linkedTrip && linkedTrip.transports) {
          const updatedTripTransports = linkedTrip.transports.filter(tx => tx.id !== id);
          await dataService.updateTrip({
            ...linkedTrip,
            transports: updatedTripTransports
          });
        }
      }

      window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
      loadData();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failure deleting travel ticket.');
    } finally {
      setLoading(false);
    }
  };

  // Add waypoint row
  const handleAddWaypoint = () => {
    if (!newWaypointName.trim()) return;
    const waypoint: RoadTripWaypoint = {
      id: `waypoint-${Math.random().toString(36).substring(2, 9)}`,
      name: newWaypointName.trim(),
      type: newWaypointType,
      notes: newWaypointNotes.trim() || undefined
    };
    setFormWaypoints(prev => [...prev, waypoint]);
    setNewWaypointName('');
    setNewWaypointNotes('');
  };

  // Remove waypoint row
  const handleRemoveWaypoint = (id: string) => {
    setFormWaypoints(prev => prev.filter(w => w.id !== id));
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in pb-12">
      {/* Upper Title Hub */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/30 dark:bg-zinc-900/10 p-4 md:p-6 rounded-[2rem] border border-gray-200/40 dark:border-white/5 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="primary" className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10">
              <Sparkles className="w-3 h-3 mr-1 inline-block" /> Land & Sea Hub
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3.5xl font-extrabold font-sans text-gray-900 dark:text-white tracking-tight mt-1">
            Road Trips & Land Travels
          </h1>
          <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xl">
            Single source of truth for buses, trains, personal cars, and cruises. Automatically pulls information from planned itineraries.
          </p>
        </div>
        <Button 
          variant="primary" 
          onClick={handleOpenCreateModal} 
          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl shadow-emerald-500/20 w-full md:w-auto"
          icon={<Plus className="w-4 h-4" />}
        >
          Add Land Journey
        </Button>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-500/10 text-xs text-red-500 flex items-center gap-2">
          <Info className="w-4 h-4 mr-1 text-red-500" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Bento Metric Boxes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <Card noPadding className="shadow-md">
          <div className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Total Journeys</span>
              <div className="text-2xl md:text-3xl font-black font-sans leading-none">{roadTrips.length}</div>
              <p className="text-[10px] text-zinc-400 mt-1">Independent & Trip plans</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 dark:bg-indigo-400/5 border border-indigo-500/20 flex items-center justify-center text-indigo-500 dark:text-indigo-400">
              <Server className="w-5 h-5" />
            </div>
          </div>
        </Card>

        {/* Metric 2 */}
        <Card noPadding className="shadow-md">
          <div className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Transit Distance</span>
              <div className="text-2xl md:text-3xl font-black font-sans leading-none">
                {stats.totalDistance.toLocaleString()} <span className="text-sm font-bold text-zinc-400">km</span>
              </div>
              <p className="text-[10px] text-zinc-400 mt-1">~{stats.totalDurationHours} hrs of travel</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 dark:bg-amber-400/5 border border-amber-500/20 flex items-center justify-center text-amber-500 dark:text-amber-400">
              <Compass className="w-5 h-5" />
            </div>
          </div>
        </Card>

        {/* Metric 3: Carbon Saved */}
        <Card noPadding className="shadow-md border-emerald-500/20 dark:border-emerald-500/10">
          <div className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-emerald-500 tracking-wider flex items-center gap-1">
                <Leaf className="w-3 h-3 text-emerald-500 animate-pulse" /> Eco Optimization
              </span>
              <div className="text-2xl md:text-3xl font-black font-sans leading-none text-emerald-600 dark:text-emerald-400">
                {stats.co2SavedKg.toLocaleString()} <span className="text-sm font-bold opacity-80">kg</span>
              </div>
              <p className="text-[10px] text-zinc-400 mt-1">相当于种植了 <strong>{stats.treeEquivalent}</strong> 棵树</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 dark:bg-emerald-400/5 border border-emerald-500/20 flex items-center justify-center text-emerald-500 dark:text-emerald-400">
              <Leaf className="w-5 h-5" />
            </div>
          </div>
        </Card>

        {/* Metric 4 */}
        <Card noPadding className="shadow-md">
          <div className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Financial Expense</span>
              <div className="text-2xl md:text-3xl font-black font-sans leading-none">
                ${stats.totalExpense.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <p className="text-[10px] text-zinc-400 mt-1">{stats.greenRatio}% of green transits</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 dark:bg-teal-400/5 border border-teal-500/20 flex items-center justify-center text-teal-500 dark:text-teal-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* Interactive Map & Insights Hud Card */}
      <Card noPadding className="shadow-lg border border-zinc-200/50 dark:border-white/5 overflow-hidden rounded-[2.2rem]">
        <div className="p-5 md:p-6 border-b border-zinc-100 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-50/50 dark:bg-zinc-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20">
              <Map className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-50 tracking-tight leading-none">Interactive Travel Hub</h3>
              <p className="text-[10px] font-bold text-zinc-400 mt-1 uppercase tracking-wider">Map Network & Mode Emissions Analysis</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Sub-tabs inside the Hub */}
            <div className="flex bg-zinc-100 dark:bg-white/5 p-1 rounded-xl border border-zinc-200/50 dark:border-white/5">
              <button
                type="button"
                onClick={() => setHubTab('map')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  hubTab === 'map' 
                    ? 'bg-white text-zinc-950 shadow-sm dark:bg-white/10 dark:text-white' 
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                }`}
              >
                🗺️ Route Map
              </button>
              <button
                type="button"
                onClick={() => setHubTab('chart')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  hubTab === 'chart' 
                    ? 'bg-white text-zinc-950 shadow-sm dark:bg-white/10 dark:text-white' 
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                }`}
              >
                📊 Mode Analytics
              </button>
            </div>

            <Button 
              variant="secondary" 
              onClick={() => setIsHubExpanded(!isHubExpanded)}
              className="h-8 rounded-xl px-2 flex items-center gap-1 text-xs border border-zinc-200/50 dark:border-white/5"
            >
              {isHubExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              <span className="sr-only">Toggle Panel</span>
            </Button>
          </div>
        </div>

        {isHubExpanded && (
          <div className="grid grid-cols-1 md:grid-cols-12 border-t border-zinc-100 dark:border-white/5">
            <div className="md:col-span-8 h-[400px] border-r border-zinc-100 dark:border-white/5 relative">
              {hubTab === 'map' ? (
                <Suspense fallback={
                  <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950/70 border border-white/5 space-y-4">
                    <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Booting Real-Time Vector Engine...</p>
                  </div>
                }>
                  <DeckFlightMap
                    trips={trips}
                    showFlightRoutes={false}
                    showLandSeaRoutes={true}
                    showCityMarkers={true}
                    showRoadTracing={true}
                    activeLayer={'standard'}
                    clusterMode={false}
                  />
                </Suspense>
              ) : (
                <div className="w-full h-full p-6 flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-zinc-400">Transit Footprint Bar Chart</h4>
                    <p className="text-[10px] text-zinc-500">Shows integrated travel distance (km) and total time spent (hours) across car, bus, train, ferry, and cruise modes.</p>
                  </div>
                  <div className="w-full h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} />
                        <XAxis dataKey="name" stroke={isDark ? "#888" : "#555"} fontSize={10} tickLine={false} />
                        <YAxis yAxisId="left" stroke="#3b82f6" label={{ value: 'Distance (km)', angle: -90, position: 'insideLeft', style: {fontSize: 10, fill: '#3b82f6'} }} fontSize={10} tickLine={false} />
                        <YAxis yAxisId="right" orientation="right" stroke="#10b981" label={{ value: 'Duration (hours)', angle: 90, position: 'insideRight', style: {fontSize: 10, fill: '#10b981'} }} fontSize={10} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: isDark ? '#18181b' : '#ffffff', 
                            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', 
                            borderRadius: '16px',
                            fontSize: '11px'
                          }} 
                        />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                        <Bar yAxisId="left" dataKey="Distance" fill="#3b82f6" name="Distance (km)" radius={[4, 4, 0, 0]} />
                        <Bar yAxisId="right" dataKey="Duration" fill="#10b981" name="Duration (hrs)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            {/* Right sidebar inside the Hub: Smart Sync Engine! */}
            <div className="md:col-span-4 p-5 md:p-6 bg-zinc-50/10 dark:bg-black/10 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-[11px] font-black uppercase text-emerald-500 tracking-wider">
                  <Sparkles className="w-4 h-4" /> 
                  <span>Smart Sync Engine</span>
                </div>
                <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 leading-tight">
                  Auto-Detect land segments from planned Trip itineraries
                </h4>
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  Select any of your existing Trips. Our engine will crawl the trip's sequential visual route planner stops and generate connected transit segments using your chosen travel mode.
                </p>

                {/* Dropdowns */}
                <div className="space-y-2 pt-2">
                  <div>
                    <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest pl-1">Target Trip planner</span>
                    <select
                      value={importTripId}
                      onChange={e => setImportTripId(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-xl bg-white border border-gray-200 outline-none text-xs text-zinc-800 dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100 cursor-pointer"
                    >
                      <option value="" className="dark:bg-zinc-900 dark:text-zinc-100">Select a Trip...</option>
                      {trips.filter(t => t.locations && t.locations.length >= 2).map(t => (
                        <option key={t.id} value={t.id} className="dark:bg-zinc-900 dark:text-zinc-100">{t.name} ({t.locations?.length} stops)</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest pl-1">Transit travel method</span>
                    <select
                      value={importMode}
                      onChange={e => setImportMode(e.target.value as any)}
                      className="w-full mt-1 px-3 py-2 rounded-xl bg-white border border-gray-200 outline-none text-xs text-zinc-800 dark:bg-zinc-900 dark:border-white/10 dark:text-zinc-100 cursor-pointer"
                    >
                      <option value="Train" className="dark:bg-zinc-900 dark:text-zinc-100">🚂 Train / Railway</option>
                      <option value="Bus" className="dark:bg-zinc-900 dark:text-zinc-100">🚌 Bus / coach</option>
                      <option value="Car Rental" className="dark:bg-zinc-900 dark:text-zinc-100">🚙 Car rental</option>
                      <option value="Personal Car" className="dark:bg-zinc-900 dark:text-zinc-100">🚗 Personal car</option>
                      <option value="Ferry" className="dark:bg-zinc-900 dark:text-zinc-100">Ferry crossing</option>
                      <option value="Cruise" className="dark:bg-zinc-900 dark:text-zinc-100">Cruise voyage</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Action button */}
              <div className="space-y-2">
                {importState.message && (
                  <div className={`p-2.5 rounded-xl border text-[10px] leading-snug ${
                    importState.status === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                      : importState.status === 'error'
                      ? 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
                      : 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400'
                  }`}>
                    {importState.message}
                  </div>
                )}
                <Button
                  type="button"
                  onClick={handleTriggerImport}
                  disabled={!importTripId || importState.status === 'loading'}
                  className="w-full bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-700 h-9 p-0 flex items-center justify-center rounded-xl text-xs font-bold leading-none shrink-0 cursor-pointer shadow-md disabled:opacity-50"
                >
                  {importState.status === 'loading' ? 'Syncing segments...' : '⚡ Automatically Sync segments'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Filter and Command Deck */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between bg-white/40 dark:bg-zinc-900/30 p-4 rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500" />
          <input 
            type="text" 
            placeholder="Search land journey by station, operator, tickets, notes..."
            className="w-full pl-11 pr-4 py-3 text-xs md:text-sm bg-gray-50/50 border border-gray-200 focus:bg-white focus:border-blue-500 rounded-2xl dark:bg-gray-800/40 dark:border-white/10 dark:text-zinc-200 placeholder-zinc-500 outline-none transition-all"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-32">
            <select
              value={modeFilter}
              onChange={e => setModeFilter(e.target.value)}
              className="w-full px-3 py-2.5 text-xs bg-gray-50/50 border border-gray-200 rounded-xl dark:bg-gray-800/40 dark:border-white/10 text-zinc-700 dark:text-zinc-200 outline-none cursor-pointer"
            >
              <option value="All">All Modes</option>
              <option value="Train">Train</option>
              <option value="Bus">Bus</option>
              <option value="Car Rental">Car Rental</option>
              <option value="Personal Car">Personal Car</option>
              <option value="Ferry">Ferry</option>
              <option value="Cruise">Cruise</option>
            </select>
          </div>

          <div className="w-32">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2.5 text-xs bg-gray-50/50 border border-gray-200 rounded-xl dark:bg-gray-800/40 dark:border-white/10 text-zinc-700 dark:text-zinc-200 outline-none cursor-pointer"
            >
              <option value="All">All Schedules</option>
              <option value="Upcoming">Upcoming</option>
              <option value="Past">Past Journeys</option>
            </select>
          </div>

          <div className="w-40">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="w-full px-3 py-2.5 text-xs bg-gray-50/50 border border-gray-200 rounded-xl dark:bg-gray-800/40 dark:border-white/10 text-zinc-700 dark:text-zinc-200 outline-none cursor-pointer"
            >
              <option value="date-asc">Date (Oldest First)</option>
              <option value="date-desc">Date (Soonest First)</option>
              <option value="cost-desc">Cost (Expensive First)</option>
              <option value="duration-desc">Duration (Longest First)</option>
            </select>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Querying database...</span>
        </div>
      )}

      {/* Main List Layout */}
      {!loading && (
        <>
          {filteredRoadTrips.length === 0 ? (
            <Card className="flex flex-col items-center justify-center py-16 border-dashed border-gray-200 dark:border-white/5 bg-transparent shadow-none rounded-[2rem]">
              <div className="w-16 h-16 rounded-3xl bg-zinc-500/10 dark:bg-white/[0.02] border border-zinc-500/20 text-zinc-400 flex items-center justify-center mb-4">
                <Compass className="w-8 h-8 text-zinc-400" />
              </div>
              <h3 className="text-lg font-bold">No land journeys found</h3>
              <p className="text-xs text-zinc-500 max-w-sm text-center mt-1">
                There are no journeys registered yet. Try adding a custom itinerary segment or assigning modes like Train/Bus/Car inside the Route Planner.
              </p>
              <Button variant="secondary" onClick={handleOpenCreateModal} className="mt-4 text-xs font-bold rounded-xl">
                Add Your First land journey
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredRoadTrips.map((tr) => {
                const isExpanded = !!expandedCards[tr.id];
                const modeDetails = MODE_META[tr.mode as keyof typeof MODE_META] || MODE_META['Train'];
                const ModeIcon = modeDetails.icon;
                
                // If it is from internal trip itinerary planners, show badge indicating Draft
                const isDraftPlannedRoute = tr.itineraryId === 'route-gen' || tr.itineraryId === 'route-booked';
                
                return (
                  <motion.div
                    key={tr.id}
                    layout
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className={`group relative flex flex-col bg-white/70 dark:bg-gray-900/60 backdrop-blur-2xl border ${
                      isDraftPlannedRoute 
                        ? 'border-dashed border-emerald-500/30' 
                        : 'border-zinc-200/50 dark:border-white/5'
                    } hover:border-zinc-300 dark:hover:border-white/10 shadow-lg hover:shadow-xl rounded-[1.8rem] overflow-hidden transition-all duration-300`}
                  >
                    <div className="p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Left side: Icon & Origin/Destination */}
                      <div className="flex flex-1 items-center gap-4 min-w-0">
                        <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl ${modeDetails.bgClass} ${modeDetails.borderClass} border flex items-center justify-center ${modeDetails.colorClass} shrink-0`}>
                          <ModeIcon className="w-6 h-6" />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          {/* Station/City route string */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm md:text-base font-black font-sans tracking-tight text-zinc-950 dark:text-zinc-50 truncate">
                              {tr.origin}
                            </span>
                            <ArrowRight className="w-4 h-4 text-zinc-400" />
                            <span className="text-sm md:text-base font-black font-sans tracking-tight text-zinc-950 dark:text-zinc-50 truncate">
                              {tr.destination}
                            </span>
                          </div>

                          {/* Carrier details and identification */}
                          <div className="flex items-center gap-2 flex-wrap text-[11px] text-zinc-500 mt-1">
                            {tr.provider && (
                              <span className="font-bold text-zinc-700 dark:text-zinc-300 pr-1.5 border-r border-zinc-200 dark:border-white/10 leading-none">
                                {tr.provider}
                              </span>
                            )}
                            {tr.identifier && (
                              <span className="font-mono pr-1.5 border-r border-zinc-200 dark:border-white/10 leading-none">
                                {tr.identifier}
                              </span>
                            )}
                            <span className="leading-none">{modeDetails.label}</span>
                          </div>
                        </div>
                      </div>

                      {/* Middle side: Timing, Date & Distance estimation */}
                      <div className="flex items-center gap-6 justify-between md:justify-center pr-3 border-zinc-200 dark:border-white/10 md:border-r shrink-0">
                        <div className="text-left md:text-center space-y-1">
                          <div className="flex items-center gap-1.5 md:justify-center text-[11px] font-bold text-zinc-700 dark:text-zinc-300 leading-none">
                            <Calendar className="w-3.5 h-3.5 text-blue-500" />
                            <span>{new Date(tr.departureDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          </div>
                          
                          {tr.departureTime && (
                            <div className="text-[10px] font-sans font-medium text-zinc-400 flex items-center gap-1 leading-none justify-start md:justify-center">
                              <Clock className="w-3 h-3 text-zinc-400" />
                              <span>{tr.departureTime} - {tr.arrivalTime || 'Arrival'}</span>
                              {tr.duration && <span className="text-zinc-500 font-bold">({Math.round(tr.duration / 60)}h {tr.duration % 60}m)</span>}
                            </div>
                          )}
                        </div>

                        {tr.distance && (
                          <div className="hidden lg:flex flex-col items-center">
                            <span className="text-xs font-black font-mono tracking-tight">{tr.distance} km</span>
                            <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">EST. DISTANCE</span>
                          </div>
                        )}
                      </div>

                      {/* Right side: Cost, Trip context and Actions toggle button */}
                      <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
                        {/* Cost & Trip badges */}
                        <div className="flex flex-col items-start md:items-end justify-center">
                          {tr.cost ? (
                            <span className="text-sm md:text-base font-black font-mono text-zinc-900 dark:text-zinc-100">${parseFloat(tr.cost).toFixed(2)}</span>
                          ) : (
                            <span className="text-xs font-bold text-zinc-400">No cost</span>
                          )}
                          
                          {/* Associate trip link trigger */}
                          {tr.tripId ? (
                            <button
                              onClick={() => onTripClick && onTripClick(tr.tripId)}
                              className="text-[10px] font-bold text-blue-500 hover:text-blue-600 mt-1 cursor-pointer flex items-center"
                            >
                              <span className="truncate max-w-[120px]">{tr.tripName || 'Go to Trip'}</span>
                              <ChevronDown className="w-3 h-3 rotate-[270deg]" />
                            </button>
                          ) : (
                            <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wider mt-1">Independent Travel</span>
                          )}
                        </div>

                        {/* Dropdown Toggle for details */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => handleToggleCard(tr.id, e)}
                            className="p-2.5 rounded-xl bg-gray-100 dark:bg-white/5 border border-zinc-200/50 dark:border-white/5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-150 transition-all cursor-pointer"
                            title="Toggle Stops & Route Waypoints"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>

                          {!isDraftPlannedRoute && (
                            <>
                              <button
                                onClick={() => handleOpenEditModal(tr)}
                                className="p-2.5 rounded-xl bg-blue-500/10 dark:bg-blue-400/5 text-blue-500 hover:bg-blue-500 hover:text-white border border-blue-500/20 transition-all cursor-pointer"
                                title="Edit Itinerary Details"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteTransport(tr.id, tr.tripId)}
                                className="p-2.5 rounded-xl bg-red-500/10 dark:bg-red-400/5 text-red-500 hover:bg-red-600 hover:text-white border border-red-500/20 transition-all cursor-pointer"
                                title="Delete Travel Record"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Collapsed Segment details / Waypoints Timeline */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t border-zinc-200/50 dark:border-white/5 bg-zinc-50/50 dark:bg-zinc-950/20 p-5 md:p-6"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Waypoints block */}
                            <div className="md:col-span-2 space-y-4">
                              <div className="flex items-center justify-between border-b pb-2">
                                <span className="text-xs font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                                  <Map className="w-3.5 h-3.5 text-blue-500" /> Planned Waypoints & Stops
                                </span>
                                {tr.waypoints && tr.waypoints.length > 0 && (
                                  <span className="text-[10px] font-bold text-blue-500">{tr.waypoints.length} stops scheduled</span>
                                )}
                              </div>

                              {tr.waypoints && tr.waypoints.length > 0 ? (
                                <div className="relative pl-6 space-y-4">
                                  {/* Line background */}
                                  <div className="absolute left-2.5 top-2.5 bottom-2.5 w-0.5 bg-zinc-200 dark:bg-white/10" />

                                  {tr.waypoints.map((wp: RoadTripWaypoint, idx: number) => (
                                    <div key={wp.id} className="relative flex items-start gap-3 text-xs">
                                      {/* bullet circle */}
                                      <div className="absolute -left-[21px] top-1 w-3.5 h-3.5 rounded-full border-2 border-emerald-500 bg-white dark:bg-zinc-950 flex items-center justify-center shadow-sm">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                      </div>

                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-zinc-900 dark:text-zinc-150">{wp.name}</span>
                                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5 bg-zinc-100 dark:bg-white/5 uppercase font-sans">
                                            {wp.type}
                                          </Badge>
                                        </div>
                                        {wp.notes && (
                                          <p className="text-[11px] text-zinc-500 mt-0.5 italic">{wp.notes}</p>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-6 border border-dashed rounded-2xl bg-white/30 dark:bg-black/10">
                                  <p className="text-xs text-zinc-400">No scheduled waypoints/stops added yet on this roadtrip drive.</p>
                                </div>
                              )}
                            </div>

                            {/* Additional Information details card */}
                            <div className="bg-white/40 dark:bg-black/10 rounded-2xl p-4 border border-zinc-200/50 dark:border-white/5 space-y-3">
                              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Itinerary Diagnostics</span>
                              
                              <div className="space-y-2 text-xs">
                                {tr.confirmationCode && (
                                  <div className="flex justify-between items-center text-zinc-650 dark:text-zinc-300">
                                    <span>Booking ticket:</span>
                                    <span className="font-mono font-bold">{tr.confirmationCode}</span>
                                  </div>
                                )}
                                <div className="flex justify-between items-center text-zinc-650 dark:text-zinc-300">
                                  <span>CO2 Multiplier:</span>
                                  <span className="text-zinc-500">{modeDetails.ecoRating}</span>
                                </div>
                                {tr.notes && (
                                  <div className="space-y-1 border-t border-dashed pt-2">
                                    <span className="font-bold text-[10px] text-zinc-400">DRIVE NOTES</span>
                                    <p className="text-[11px] text-zinc-500 whitespace-pre-line leading-relaxed italic">
                                      "{tr.notes}"
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Creation and Edit Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={editingTransport ? "Edit Land Itinerary Details" : "Add Land / Sea Voyage"}
        subtitle="Voyage Parameters & Route Planning"
        icon="directions_car"
        maxWidth="max-w-4xl"
      >
        <form onSubmit={handleSaveTransport} className="space-y-6 font-sans text-left">
          {/* Type Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {(Object.keys(MODE_META) as Array<keyof typeof MODE_META>).map(modeKey => {
              const isActive = formMode === modeKey;
              const item = MODE_META[modeKey];
              const Icon = item.icon;
              return (
                <button
                  key={modeKey}
                  type="button"
                  onClick={() => setFormMode(modeKey)}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all cursor-pointer ${
                    isActive 
                      ? 'bg-primary-500/10 border-primary-500/30 text-primary-600 dark:text-primary-400 shadow-sm' 
                      : 'bg-white dark:bg-dark-card border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary'
                  }`}
                >
                  <Icon className="w-5 h-5 mb-1" />
                  <span className="text-2xs font-bold uppercase tracking-wider text-center leading-none">{modeKey}</span>
                </button>
              );
            })}
          </div>

          {/* Geo Info Rows */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Autocomplete 
              label="Origin City / Port" 
              placeholder="e.g. Paris Gare du Nord, Rome"
              value={formOrigin}
              onChange={val => setFormOrigin(val)}
              fetchSuggestions={searchLocations}
            />
            <Autocomplete 
              label="Destination City / Port" 
              placeholder="e.g. London St Pancras, Milan"
              value={formDestination}
              onChange={val => setFormDestination(val)}
              fetchSuggestions={searchLocations}
            />
          </div>

          {/* Departure Arrival timeline input */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 rounded-3xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5">
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400 block">Departure Timeline</span>
              <div className="grid grid-cols-2 gap-2">
                <Input 
                  type="date" 
                  label="Departure date"
                  value={formDepDate}
                  onChange={e => setFormDepDate(e.target.value)}
                  required
                />
                <TimeInput 
                  label="Dep. Time"
                  value={formDepTime}
                  onChange={val => setFormDepTime(val)}
                />
              </div>
            </div>

            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400 block">Arrival Timeline</span>
              <div className="grid grid-cols-2 gap-2">
                <Input 
                  type="date" 
                  label="Arrival date"
                  value={formArrDate}
                  onChange={e => setFormArrDate(e.target.value)}
                />
                <TimeInput 
                  label="Arr. Time"
                  value={formArrTime}
                  onChange={val => setFormArrTime(val)}
                />
              </div>
            </div>
          </div>

          {/* Provider details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input 
              label="Operator / Provider" 
              placeholder="e.g. Eurostar, Flixbus, Hertz, DFDS"
              value={formProvider}
              onChange={e => setFormProvider(e.target.value)}
            />
            <Input 
              label="Vehicle Plate / Id" 
              placeholder="e.g. Plate #, TGV 9102"
              value={formIdentifier}
              onChange={e => setFormIdentifier(e.target.value)}
            />
            <Input 
              label="Confirmation tickets / booking ref" 
              placeholder="e.g. CONFIRM-X9"
              value={formConfirmationCode}
              onChange={e => setFormConfirmationCode(e.target.value)}
            />
          </div>

          {/* Associated Trip linking dropdown */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2">
              <span className="block text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary mb-2">Associate Trip Grouping</span>
              <select
                value={formTripId}
                onChange={e => setFormTripId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 outline-none text-xs font-bold text-light-text dark:text-dark-text cursor-pointer h-10"
              >
                <option value="unassigned">Keep as Independent Travel</option>
                {trips.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <Input 
              label="Total Expense ($)" 
              placeholder="e.g. 150"
              type="number"
              min="0"
              step="0.01"
              value={formCost}
              onChange={e => setFormCost(e.target.value)}
            />
          </div>

          {/* Waypoint segment designer box */}
          <div className="p-5 rounded-3xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1.5">
              <Map className="w-4 h-4 text-emerald-500" /> Waypoint segment designer (Stops, Sightseeing, Food, Lodging)
            </span>

            {/* current waypoints pills inside modal */}
            {formWaypoints.length > 0 && (
              <div className="flex flex-wrap gap-2 py-1 max-h-32 overflow-y-auto custom-scrollbar">
                {formWaypoints.map(wp => (
                  <div key={wp.id} className="text-xs flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-dark-card border border-black/5 dark:border-white/5 rounded-xl font-medium animate-fade-in text-light-text dark:text-dark-text shadow-sm">
                    <span>{wp.name}</span>
                    <span className="text-2xs font-bold uppercase opacity-60">({wp.type})</span>
                    <button 
                      type="button" 
                      onClick={() => handleRemoveWaypoint(wp.id)} 
                      className="hover:text-rose-500 hover:scale-110 ml-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Waypoint insertion row */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end bg-white dark:bg-dark-card p-3 rounded-2xl border border-black/5 dark:border-white/5">
              <div className="md:col-span-5">
                <Input 
                  label="Waypoint location" 
                  placeholder="e.g. Reims Cathedral, Shell Station"
                  value={newWaypointName}
                  onChange={e => setNewWaypointName(e.target.value)}
                  className="h-10 text-xs"
                />
              </div>
              <div className="md:col-span-3">
                <span className="block text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary mb-1">Stop type</span>
                <select
                  value={newWaypointType}
                  onChange={e => setNewWaypointType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 outline-none text-xs text-light-text dark:text-dark-text cursor-pointer h-10 font-bold"
                >
                  <option value="Stop">Sightseeing Stop</option>
                  <option value="Food">Food / Pitstop</option>
                  <option value="Lodging">Lodging stop</option>
                  <option value="Sightseeing">Sightseeing Point</option>
                  <option value="Fuel">Gas / Fuel Station</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <Input 
                  label="Optional stop notes" 
                  placeholder="Snack, 20min"
                  value={newWaypointNotes}
                  onChange={e => setNewWaypointNotes(e.target.value)}
                  className="h-10 text-xs"
                />
              </div>
              <div className="md:col-span-1">
                <Button 
                  type="button" 
                  onClick={handleAddWaypoint} 
                  className="h-10 w-full p-0 flex items-center justify-center rounded-xl"
                >
                  Add
                </Button>
              </div>
            </div>
          </div>

          {/* Waypoint drive notes */}
          <div className="flex flex-col gap-2">
            <span className="block text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Overall Itinerary notes / Driving directions</span>
            <textarea
              className="w-full px-4 py-3 rounded-2xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 text-xs focus:bg-white dark:focus:bg-dark-card focus:border-primary-500 outline-none text-light-text dark:text-dark-text placeholder-light-text-secondary/50 dark:placeholder-dark-text-secondary/50 font-medium"
              rows={3}
              placeholder="Insert any relevant ticket details, driving rules, parking arrangements, or maps notes."
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
            />
          </div>

          {/* Actions Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-black/5 dark:border-white/5">
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              {editingTransport ? "Save Itinerary" : "Create Journey"}
            </Button>
          </div>

        </form>
      </Modal>

      {/* Suggestions Confirmation Modal */}
      <Modal 
        isOpen={pendingSuggestions !== null} 
        onClose={() => setPendingSuggestions(null)} 
        title="Confirm Auto-Generated Segments"
        subtitle="Consecutive Stop Segments Generated"
        icon="auto_awesome"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-6 font-sans text-left">
          <div className="space-y-1">
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium">
              We analyzed your planned trip stops and generated consecutive segments below. Please confirm if you want to create and save these transit segments.
            </p>
          </div>

          <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
            {!pendingSuggestions || pendingSuggestions.length === 0 ? (
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary italic py-4 text-center">No missing segments detected. Your trip is fully synchronized!</p>
            ) : (
              pendingSuggestions.map((seg, idx) => {
                const modeMeta = MODE_META[seg.mode as keyof typeof MODE_META];
                const ModeIcon = modeMeta?.icon || Train;
                return (
                  <div key={idx} className="p-4 rounded-2xl border border-black/5 dark:border-white/5 bg-white dark:bg-dark-card shadow-sm flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-2xl ${modeMeta?.bgClass || 'bg-primary-500/10'} ${modeMeta?.borderClass || 'border-primary-500/20'} border flex items-center justify-center ${modeMeta?.colorClass || 'text-primary-500'}`}>
                      <ModeIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-bold font-sans">
                        <span className="truncate">{seg.origin}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-light-text-secondary dark:text-dark-text-secondary" />
                        <span className="truncate">{seg.destination}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium">
                        <span>{seg.departureDate}</span>
                        <span>•</span>
                        <span>Est. {seg.distance} km ({Math.round(seg.duration / 60)}h)</span>
                      </div>
                    </div>
                    <Badge variant="primary" className="text-2xs font-bold">
                      Proposed
                    </Badge>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-black/5 dark:border-white/5">
            <Button variant="secondary" onClick={() => setPendingSuggestions(null)}>
              Cancel
            </Button>
            {pendingSuggestions && pendingSuggestions.length > 0 && (
              <Button 
                variant="primary" 
                onClick={handleConfirmSaveSuggestions}
              >
                Save All Segments
              </Button>
            )}
          </div>
        </div>
      </Modal>

    </div>
  );
};
