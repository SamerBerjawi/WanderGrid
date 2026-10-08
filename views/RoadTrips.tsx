import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { 
  Plus, MagnifyingGlass as Search, CalendarBlank as Calendar, MapPin, Trash as Trash2, PencilSimple as Edit2, 
  CaretDown as ChevronDown, CaretUp as ChevronUp, Clock, CurrencyDollar as DollarSign, Compass, Car, 
  MapTrifold as Map, ArrowRight, HardDrives as Server, Sparkle as Sparkles, NavigationArrow as Navigation, Train, 
  Bus, Boat, Info, DotsSixVertical, CheckSquare, Square, X, Check, ChartBar
} from '@phosphor-icons/react';
import { Button, Input, GlassSelect, Badge, TimeInput, Autocomplete, Modal, BentoGrid, BentoCard } from '../components/ui';
import GlassPanel from '../components/glass/GlassPanel';
import { INPUT_BASE_STYLE } from '../constants';
import { Trip, Transport, TransportMode, RoadTripWaypoint } from '../types';
import { dataService } from '../services/mockDb';
import { motion, AnimatePresence } from 'motion/react';
import { searchLocations, getCoordinates } from '../services/geocoding';
import { fetchRoute } from '../services/multiModalRouting';
import { formatDate, formatCurrency } from '../utils/formatters';

import { EmptyState } from '../components/EmptyState';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TooltipContent } from '../components/TooltipContent';

// Drag & Drop via @dnd-kit for Waypoints
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const DeckFlightMap = lazy(() => import('../components/DeckFlightMap').then(m => ({ default: m.DeckFlightMap || m.default })));

const useDarkMode = () => {
  const [isDark, setIsDark] = useState(typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false);
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
  ecoRating: string;
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
    icon: Car, 
    colorClass: 'text-blue-500 dark:text-blue-400', 
    bgClass: 'bg-blue-500/10 dark:bg-blue-400/5',
    borderClass: 'border-blue-500/20 dark:border-blue-400/10',
    ecoRating: 'Average carbon footprint (120g CO2/km)'
  },
  'Personal Car': { 
    label: 'Personal Car', 
    icon: Car, 
    colorClass: 'text-indigo-500 dark:text-indigo-400', 
    bgClass: 'bg-indigo-500/10 dark:bg-indigo-400/5',
    borderClass: 'border-indigo-500/20 dark:border-indigo-400/10',
    ecoRating: 'Average carbon footprint (125g CO2/km)'
  },
  'Cruise': { 
    label: 'Ferry / Cruise', 
    icon: Boat, 
    colorClass: 'text-cyan-500 dark:text-cyan-400', 
    bgClass: 'bg-cyan-500/10 dark:bg-cyan-400/5',
    borderClass: 'border-cyan-500/20 dark:border-cyan-400/10',
    ecoRating: 'Moderate to high transport footprint (120g CO2/km)'
  },
  'Ferry': { 
    label: 'Ferry / Cruise', 
    icon: Boat, 
    colorClass: 'text-cyan-500 dark:text-cyan-400', 
    bgClass: 'bg-cyan-500/10 dark:bg-cyan-400/5',
    borderClass: 'border-cyan-500/20 dark:border-cyan-400/10',
    ecoRating: 'Moderate to high transport footprint (120g CO2/km)'
  }
};

// Proposed Feature: Sortable Waypoint Item Component for DnD
interface SortableWaypointItemProps {
  waypoint: RoadTripWaypoint;
  onRemove: (id: string) => void;
}

const SortableWaypointItem: React.FC<SortableWaypointItemProps> = ({ waypoint, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: waypoint.id
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="text-xs flex items-center justify-between gap-2 p-2.5 bg-white/70 dark:bg-dark-card/80 border border-black/8 dark:border-white/10 rounded-xl shadow-xs group"
    >
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="p-1 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text cursor-grab active:cursor-grabbing shrink-0"
          aria-label="Drag to reorder waypoint"
        >
          <DotsSixVertical className="w-4 h-4" />
        </button>
        <span className="font-semibold text-light-text dark:text-dark-text truncate">{waypoint.name}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary-500/10 text-primary-600 dark:text-primary-400 shrink-0">
          {waypoint.type}
        </span>
        {waypoint.notes && (
          <span className="text-2xs text-light-text-secondary dark:text-dark-text-secondary italic truncate hidden sm:inline">
            "{waypoint.notes}"
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(waypoint.id)}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-light-text-secondary hover:text-rose-500 hover:bg-rose-500/10 transition-colors shrink-0 cursor-pointer"
        aria-label="Remove waypoint"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
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

  // Proposed Feature: Multi-Select Bulk Actions Mode
  const [isMultiEditing, setIsMultiEditing] = useState(false);
  const [selectedTripIds, setSelectedTripIds] = useState<Set<string>>(new Set());

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
  const [formDistance, setFormDistance] = useState('');
  const [isDistanceEstimated, setIsDistanceEstimated] = useState(false);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routeAttribution, setRouteAttribution] = useState<string | null>(null);
  
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

  // Dnd-kit Sensors for Waypoints
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleWaypointDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFormWaypoints((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const chartData = useMemo(() => {
    const sums: Record<string, { distance: number; timeMinutes: number; count: number }> = {
      'Train': { distance: 0, timeMinutes: 0, count: 0 },
      'Bus': { distance: 0, timeMinutes: 0, count: 0 },
      'Car': { distance: 0, timeMinutes: 0, count: 0 },
      'Ferry / Cruise': { distance: 0, timeMinutes: 0, count: 0 },
    };

    roadTrips.forEach(tr => {
      let modeKey = 'Train';
      if (tr.mode === 'Train') modeKey = 'Train';
      else if (tr.mode === 'Bus') modeKey = 'Bus';
      else if (tr.mode === 'Car Rental' || tr.mode === 'Personal Car') modeKey = 'Car';
      else if (tr.mode === 'Ferry' || tr.mode === 'Cruise') modeKey = 'Ferry / Cruise';
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

    locations.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    const suggestions: any[] = [];
    const currentTransports = [...(trip.transports || [])];

    for (let i = 0; i < locations.length - 1; i++) {
      const locA = locations[i];
      const locB = locations[i + 1];

      const alreadyExists = currentTransports.some(tr => 
        tr.origin?.toLowerCase().trim() === locA.name?.toLowerCase().trim() &&
        tr.destination?.toLowerCase().trim() === locB.name?.toLowerCase().trim()
      );

      if (!alreadyExists) {
        const speeds: Record<string, number> = {
          'Train': 120,
          'Bus': 70,
          'Car Rental': 90,
          'Personal Car': 95,
          'Cruise': 30,
          'Ferry': 40
        };
        const avgSpeed = speeds[defaultMode] || 80;
        
        const dateA = new Date(locA.endDate || locA.startDate);
        const dateB = new Date(locB.startDate);
        let diffHours = Math.abs(dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60);
        if (isNaN(diffHours) || diffHours <= 0) diffHours = 4;
        if (diffHours > 24) diffHours = 6;

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
          cost: 45,
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

      for (const seg of pendingSuggestions) {
        await dataService.addFlight(seg);
      }

      const updatedTransports = [...(trip.transports || []), ...pendingSuggestions];
      await dataService.updateTrip({
        ...trip,
        transports: updatedTransports
      });

      setImportState({
        status: 'success',
        message: `Success! Synchronized and imported ${pendingSuggestions.length} new land segment(s).`
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

  const toggleSelectSegment = (id: string) => {
    setSelectedTripIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedTripIds.size === 0) return;
    const count = selectedTripIds.size;
    if (!window.confirm(`Are you sure you want to delete ${count} selected road trip record${count > 1 ? 's' : ''}?`)) {
      return;
    }

    try {
      setLoading(true);
      for (const id of selectedTripIds) {
        const item = roadTrips.find(r => r.id === id);
        await dataService.deleteFlight(id);
        if (item?.tripId) {
          const linkedTrip = trips.find(t => t.id === item.tripId);
          if (linkedTrip && linkedTrip.transports) {
            const updated = linkedTrip.transports.filter(tx => tx.id !== id);
            await dataService.updateTrip({ ...linkedTrip, transports: updated });
          }
        }
      }
      setSelectedTripIds(new Set());
      setIsMultiEditing(false);
      window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
      await loadData();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to bulk delete records.');
    } finally {
      setLoading(false);
    }
  };

  // Compute analytics
  const stats = useMemo(() => {
    let totalKm = 0;
    let totalMinutes = 0;
    let totalExpense = 0;
    let totalTrainAndBusCount = 0;
    
    roadTrips.forEach(tr => {
      if (tr.cost) totalExpense += parseFloat(tr.cost) || 0;
      
      let durationMinutes = tr.duration || 0;
      if (!durationMinutes && tr.departureDate && tr.arrivalDate) {
        const dep = new Date(`${tr.departureDate}T${tr.departureTime || '00:00'}`);
        const arr = new Date(`${tr.arrivalDate}T${tr.arrivalTime || '00:00'}`);
        const diffMs = arr.getTime() - dep.getTime();
        if (diffMs > 0) durationMinutes = Math.floor(diffMs / 60000);
      }
      totalMinutes += durationMinutes;

      let distanceKm = tr.distance || 0;
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
      totalKm += distanceKm;

      if (tr.mode === 'Train' || tr.mode === 'Bus') {
        totalTrainAndBusCount += 1;
      }
    });

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
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = !query || 
        (tr.origin || '').toLowerCase().includes(query) ||
        (tr.destination || '').toLowerCase().includes(query) ||
        (tr.provider || '').toLowerCase().includes(query) ||
        (tr.identifier || '').toLowerCase().includes(query) ||
        (tr.confirmationCode || '').toLowerCase().includes(query) ||
        (tr.notes || '').toLowerCase().includes(query);

      const matchesMode = modeFilter === 'All' || 
        tr.mode === modeFilter || 
        (modeFilter === 'Cruise' && tr.mode === 'Ferry') ||
        (modeFilter === 'Ferry' && tr.mode === 'Cruise');

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

  const handleOpenCreateModal = () => {
    setEditingTransport(null);
    setFormMode('Train');
    setFormOrigin('');
    setFormDestination('');
    
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
    setFormDistance('');
    setIsDistanceEstimated(false);
    setRouteAttribution(null);
    
    setNewWaypointName('');
    setNewWaypointType('Stop');
    setNewWaypointNotes('');
    
    setIsModalOpen(true);
  };

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
    setFormDistance(tr.distance ? String(tr.distance) : '');
    setIsDistanceEstimated(false);
    setRouteAttribution(null);
    
    setNewWaypointName('');
    setNewWaypointType('Stop');
    setNewWaypointNotes('');
    
    setIsModalOpen(true);
  };

  const handleCalculateRoute = async () => {
    if (!formOrigin.trim() || !formDestination.trim()) {
      alert("Please enter origin and destination cities first.");
      return;
    }
    setIsCalculatingRoute(true);
    try {
      const [originCoord, destCoord] = await Promise.all([
        getCoordinates(formOrigin),
        getCoordinates(formDestination)
      ]);

      if (!originCoord || !destCoord) {
        throw new Error("Could not find geographic coordinates for origin or destination.");
      }

      const coords: [number, number][] = [[originCoord.lng, originCoord.lat]];

      for (const wp of formWaypoints) {
        if (wp.coordinates?.lat && wp.coordinates?.lng) {
          coords.push([wp.coordinates.lng, wp.coordinates.lat]);
        } else if (wp.name) {
          const wpCoord = await getCoordinates(wp.name);
          if (wpCoord) coords.push([wpCoord.lng, wpCoord.lat]);
        }
      }


      coords.push([destCoord.lng, destCoord.lat]);

      const profile = (formMode === 'Car Rental' || formMode === 'Personal Car' || formMode === 'Bus') ? 'car' : 'car';
      const route = await fetchRoute(profile, coords);

      if (route && route.distanceKm > 0) {
        setFormDistance(String(route.distanceKm));
        setIsDistanceEstimated(false);
        setRouteAttribution(route.attribution || '© OpenStreetMap contributors · routing by FOSSGIS');

        if (formDepDate && formDepTime && route.durationMin > 0) {
          const depDateObj = new Date(`${formDepDate}T${formDepTime}`);
          const arrDateObj = new Date(depDateObj.getTime() + route.durationMin * 60000);
          setFormArrDate(arrDateObj.toISOString().split('T')[0]);
          setFormArrTime(arrDateObj.toTimeString().substring(0, 5));
        }
      } else {
        throw new Error("Routing service did not return a valid route.");
      }
    } catch (err: any) {
      console.warn("[RoadTrips] Routing calculation fallback to estimation:", err);
      const speeds: Record<string, number> = {
        'Train': 120, 'Bus': 70, 'Car Rental': 90, 'Personal Car': 95, 'Cruise': 30, 'Ferry': 40
      };
      let durationMinutes = 0;
      if (formDepDate && formArrDate) {
        const dep = new Date(`${formDepDate}T${formDepTime || '00:00'}`);
        const arr = new Date(`${formArrDate}T${formArrTime || '00:00'}`);
        const diffMs = arr.getTime() - dep.getTime();
        if (diffMs > 0) durationMinutes = Math.floor(diffMs / 60000);
      }
      const avgSpeed = speeds[formMode] || 80;
      const fallbackDist = durationMinutes > 0 ? Math.round((durationMinutes / 60) * avgSpeed) : 100;
      setFormDistance(String(fallbackDist));
      setIsDistanceEstimated(true);
      setRouteAttribution(null);
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  const handleSaveTransport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formOrigin.trim() || !formDestination.trim() || !formDepDate) {
      alert("Origin, destination, and departure date are required fields.");
      return;
    }

    try {
      setLoading(true);

      const targetTrip = trips.find(t => t.id === formTripId);
      const isLinkedToTrip = formTripId !== 'unassigned' && Boolean(targetTrip);

      let durationMinutes = 0;
      if (formDepDate && formArrDate) {
        const dep = new Date(`${formDepDate}T${formDepTime || '00:00'}`);
        const arr = new Date(`${formArrDate}T${formArrTime || '00:00'}`);
        const diffMs = arr.getTime() - dep.getTime();
        if (diffMs > 0) durationMinutes = Math.floor(diffMs / 60000);
      }

      const speeds: Record<string, number> = {
        'Train': 120, 'Bus': 70, 'Car Rental': 90, 'Personal Car': 95, 'Cruise': 30, 'Ferry': 40
      };
      const avgSpeed = speeds[formMode] || 80;
      const estimatedDistance = durationMinutes > 0 ? Math.round((durationMinutes / 60) * avgSpeed) : 0;
      const finalDistance = formDistance ? parseFloat(formDistance) : estimatedDistance;

      const transportPayload: any = {
        id: editingTransport ? editingTransport.id : `land-${crypto.randomUUID()}`,
        type: 'One-Way',
        mode: formMode,
        origin: formOrigin.trim(),
        destination: formDestination.trim(),
        departureDate: formDepDate,
        departureTime: formDepTime,
        arrivalDate: formArrDate || formDepDate,
        arrivalTime: formArrTime,
        provider: formProvider.trim(),
        identifier: formIdentifier.trim(),
        confirmationCode: formConfirmationCode.trim(),
        cost: formCost ? parseFloat(formCost) : undefined,
        notes: formNotes.trim(),
        waypoints: formWaypoints,
        duration: durationMinutes,
        distance: finalDistance,

        tripId: isLinkedToTrip ? formTripId : undefined,
        tripName: isLinkedToTrip ? targetTrip?.name : undefined
      };

      if (editingTransport) {
        await dataService.updateFlight(transportPayload);
      } else {
        await dataService.addFlight(transportPayload);
      }

      if (isLinkedToTrip && targetTrip) {
        const currentTransports = targetTrip.transports || [];
        const updatedTransports = editingTransport
          ? currentTransports.map(t => t.id === editingTransport.id ? transportPayload : t)
          : [...currentTransports, transportPayload];

        await dataService.updateTrip({
          ...targetTrip,
          transports: updatedTransports
        });
      }

      setIsModalOpen(false);
      window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
      await loadData();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed saving land journey record.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTransport = async (id: string, tripId?: string) => {
    if (!window.confirm("Are you sure you want to delete this land journey?")) return;
    try {
      setLoading(true);
      await dataService.deleteFlight(id);

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

  const handleAddWaypoint = () => {
    if (!newWaypointName.trim()) return;
    const waypoint: RoadTripWaypoint = {
      id: `waypoint-${crypto.randomUUID()}`,
      name: newWaypointName.trim(),
      type: newWaypointType,
      notes: newWaypointNotes.trim() || undefined,
      addToVisited: true
    };
    setFormWaypoints(prev => [...prev, waypoint]);
    setNewWaypointName('');
    setNewWaypointNotes('');
  };

  const handleRemoveWaypoint = (id: string) => {
    setFormWaypoints(prev => prev.filter(w => w.id !== id));
  };

  return (
    <div className="w-full max-w-[1680px] mx-auto pt-2 sm:pt-4 px-1 sm:px-4 md:px-6 lg:px-8 flex flex-col gap-5 sm:gap-6 animate-fadeIn pb-16 text-light-text dark:text-dark-text">
      
      {/* ========================================================================= */}
      {/* HERO HEADER: Title Aligned Left, Button Aligned Right on Mobile & Desktop */}
      {/* ========================================================================= */}
      <div className="flex flex-row items-center justify-between gap-2.5 sm:gap-4 w-full pt-1 pb-1">
        {/* Left: Pure Icon + Responsive Scaled Title */}
        <div className="flex items-center justify-start gap-2 sm:gap-3 md:gap-4 min-w-0">
          <Car weight="duotone" className="w-7 h-7 sm:w-9 sm:h-9 md:w-12 md:h-12 text-violet-500 dark:text-violet-400 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-3xl md:text-5xl font-black text-light-text dark:text-dark-text tracking-tight leading-tight sm:leading-none truncate sm:overflow-visible">
                Road Trips & Land Travels
              </h1>
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Land & Sea
              </span>
            </div>
            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary truncate mt-0.5 font-medium">
              Buses, trains, vehicles & ferry routes
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center justify-end shrink-0 gap-2">
          {/* Proposed Multi-Select Mode Toggle */}
          <button
            type="button"
            onClick={() => {
              setIsMultiEditing(!isMultiEditing);
              if (isMultiEditing) setSelectedTripIds(new Set());
            }}
            className={`min-w-[44px] min-h-[44px] px-3.5 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
              isMultiEditing
                ? 'bg-primary-500 text-white border-primary-500 shadow-sm'
                : 'bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text border-black/10 dark:border-white/10'
            }`}
            title="Toggle bulk selection"
          >
            <CheckSquare className="w-4 h-4" weight={isMultiEditing ? 'fill' : 'duotone'} />
            <span className="hidden sm:inline">{isMultiEditing ? 'Done' : 'Select'}</span>
          </button>

          <Button 
            variant="primary" 
            color="emerald"
            onClick={handleOpenCreateModal} 
            className="shrink-0 min-h-[44px]"
            icon={<Plus className="w-4 h-4" />}
            aria-label="Add Land Journey"
          >
            <span className="hidden sm:inline">Add Land Journey</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-500 flex items-center gap-2">
          <Info className="w-4 h-4 mr-1 text-red-500" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Bento Metric Boxes */}
      <BentoGrid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <BentoCard
          className="min-h-[120px]"
          background={<div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 dark:bg-indigo-500/15 rounded-full blur-2xl translate-x-6 -translate-y-6 pointer-events-none group-hover:scale-125 transition-transform duration-500" />}
        >
          <div className="flex items-center justify-between w-full">
            <div className="space-y-1">
              <span className="text-2xs font-bold uppercase text-light-text-secondary dark:text-dark-text-secondary tracking-wider">Total Journeys</span>
              <div className="text-2xl md:text-3xl font-black font-mono leading-none text-light-text dark:text-dark-text">{roadTrips.length}</div>
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">Independent & Trip plans</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 dark:bg-indigo-400/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 dark:text-indigo-400 shrink-0">
              <Server className="w-5 h-5" />
            </div>
          </div>
        </BentoCard>

        {/* Metric 2 */}
        <BentoCard
          className="min-h-[120px]"
          background={<div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 dark:bg-amber-500/15 rounded-full blur-2xl translate-x-6 -translate-y-6 pointer-events-none group-hover:scale-125 transition-transform duration-500" />}
        >
          <div className="flex items-center justify-between w-full">
            <div className="space-y-1">
              <span className="text-2xs font-bold uppercase text-light-text-secondary dark:text-dark-text-secondary tracking-wider">Transit Distance</span>
              <div className="text-2xl md:text-3xl font-black font-mono leading-none text-light-text dark:text-dark-text">
                {stats.totalDistance.toLocaleString()} <span className="text-sm font-bold text-light-text-secondary dark:text-dark-text-secondary">km</span>
              </div>
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">~{stats.totalDurationHours} hrs of travel</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 flex items-center justify-center text-amber-500 dark:text-amber-400 shrink-0">
              <Compass className="w-5 h-5" />
            </div>
          </div>
        </BentoCard>

        {/* Metric 3: Carbon Saved */}
        <BentoCard
          className="min-h-[120px] border-emerald-500/20 dark:border-emerald-500/10"
          background={<div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 dark:bg-emerald-500/15 rounded-full blur-2xl translate-x-6 -translate-y-6 pointer-events-none group-hover:scale-125 transition-transform duration-500" />}
        >
          <div className="flex items-center justify-between w-full">
            <div className="space-y-1">
              <span className="text-2xs font-bold uppercase text-emerald-500 tracking-wider flex items-center gap-1">
                Eco Optimization
              </span>
              <div className="text-2xl md:text-3xl font-black font-mono leading-none text-emerald-600 dark:text-emerald-400">
                {stats.co2SavedKg.toLocaleString()} <span className="text-sm font-bold opacity-80">kg</span>
              </div>
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">~{stats.treeEquivalent} trees offset</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 dark:bg-emerald-400/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 dark:text-emerald-400 shrink-0">
              <Train className="w-5 h-5" />
            </div>
          </div>
        </BentoCard>

        {/* Metric 4 */}
        <BentoCard
          className="min-h-[120px]"
          background={<div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/10 dark:bg-teal-500/15 rounded-full blur-2xl translate-x-6 -translate-y-6 pointer-events-none group-hover:scale-125 transition-transform duration-500" />}
        >
          <div className="flex items-center justify-between w-full">
            <div className="space-y-1">
              <span className="text-2xs font-bold uppercase text-light-text-secondary dark:text-dark-text-secondary tracking-wider">Financial Expense</span>
              <div className="text-2xl md:text-3xl font-black font-mono leading-none text-light-text dark:text-dark-text">
                ${stats.totalExpense.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">{stats.greenRatio}% green transit</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 dark:bg-teal-400/10 border border-teal-500/20 flex items-center justify-center text-teal-500 dark:text-teal-400 shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
        </BentoCard>
      </BentoGrid>

      {/* Interactive Map & Insights Hud Card */}
      <GlassPanel
        className="wg-glass-card shadow-glass-card rounded-[28px] overflow-hidden border border-black/8 dark:border-white/10"
        overrides={{ borderRadius: 28 }}
        padding="0px"
      >
        <div className="p-5 md:p-6 border-b border-black/5 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-emerald-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/25">
              <Map className="w-5 h-5" weight="duotone" />
            </div>
            <div>
              <h3 className="text-sm font-black text-light-text dark:text-dark-text tracking-tight leading-none">Interactive Travel Hub</h3>
              <p className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary mt-1 uppercase tracking-wider">Map Network & Mode Emissions Analysis</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Sub-tabs inside Hub */}
            <div className="flex bg-black/5 dark:bg-white/5 p-1 rounded-2xl border border-black/5 dark:border-white/5">
              <button
                type="button"
                onClick={() => setHubTab('map')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  hubTab === 'map' 
                    ? 'bg-white text-primary-500 shadow-sm dark:bg-dark-card' 
                    : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text'
                }`}
              >
                <Map className="w-4 h-4 shrink-0" weight="duotone" />
                <span>Route Map</span>
              </button>
              <button
                type="button"
                onClick={() => setHubTab('chart')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  hubTab === 'chart' 
                    ? 'bg-white text-primary-500 shadow-sm dark:bg-dark-card' 
                    : 'text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text'
                }`}
              >
                <ChartBar className="w-4 h-4 shrink-0" weight="duotone" />
                <span>Mode Analytics</span>
              </button>
            </div>

            <Button 
              variant="secondary" 
              onClick={() => setIsHubExpanded(!isHubExpanded)}
              className="min-h-[44px] min-w-[44px] rounded-xl px-2.5 flex items-center justify-center"
            >
              {isHubExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              <span className="sr-only">Toggle Panel</span>
            </Button>
          </div>
        </div>

        {isHubExpanded && (
          <div className="grid grid-cols-1 md:grid-cols-12 border-t border-black/5 dark:border-white/5">
            <div className="md:col-span-8 h-[400px] border-r border-black/5 dark:border-white/5 relative">
              {hubTab === 'map' ? (
                <Suspense fallback={
                  <div className="w-full h-full flex flex-col items-center justify-center bg-black/5 dark:bg-white/5 space-y-4">
                    <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-2xs font-bold uppercase tracking-[0.2em] text-light-text-secondary dark:text-dark-text-secondary">Rendering Vector Engine...</p>
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
                    <h4 className="text-xs font-black uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">Transit Footprint Bar Chart</h4>
                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Shows travel distance (km) and total time spent (hours) across car, bus, train, ferry, and cruise modes.</p>
                  </div>
                  <div className="w-full h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} />
                        <XAxis dataKey="name" stroke={isDark ? "#888" : "#555"} fontSize={10} tickLine={false} />
                        <YAxis yAxisId="left" stroke="#3b82f6" label={{ value: 'Distance (km)', angle: -90, position: 'insideLeft', style: {fontSize: 10, fill: '#3b82f6'} }} fontSize={10} tickLine={false} />
                        <YAxis yAxisId="right" orientation="right" stroke="#10b981" label={{ value: 'Duration (hours)', angle: 90, position: 'insideRight', style: {fontSize: 10, fill: '#10b981'} }} fontSize={10} tickLine={false} />
                        <Tooltip 
                          cursor={{ fill: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              const rows = payload.map((entry) => ({
                                color: entry.color || '#3b82f6',
                                label: String(entry.name || entry.dataKey || ''),
                                value: entry.dataKey === 'Duration' 
                                  ? `${Number(entry.value).toFixed(1)} hrs` 
                                  : `${Number(entry.value).toLocaleString()} km`
                              }));
                              return (
                                <TooltipContent
                                  title={String(label)}
                                  rows={rows}
                                />
                              );
                            }
                            return null;
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

            {/* Right sidebar: Smart Sync Engine */}
            <div className="md:col-span-4 p-5 md:p-6 bg-black/[0.02] dark:bg-white/[0.02] flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-emerald-500 tracking-wider">
                  <Sparkles className="w-4 h-4" /> 
                  <span>Smart Sync Engine</span>
                </div>
                <h4 className="text-xs font-bold text-light-text dark:text-dark-text leading-tight">
                  Auto-Detect land segments from planned Trip itineraries
                </h4>
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary leading-relaxed">
                  Select an existing Trip. Our engine crawls the trip's sequential Route Planner stops and generates connected transit segments using your chosen travel mode.
                </p>

                {/* Dropdowns */}
                <div className="space-y-2 pt-2">
                  <div>
                    <span className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest pl-1">Target Trip planner</span>
                    <GlassSelect
                      value={importTripId}
                      onChange={e => setImportTripId(e.target.value)}
                      aria-label="Target Trip planner"
                    >
                      <option value="">Select a Trip...</option>
                      {trips.filter(t => t.locations && t.locations.length >= 2).map(t => (
                        <option key={t.id} value={t.id}>{t.name} ({t.locations?.length} stops)</option>
                      ))}
                    </GlassSelect>
                  </div>

                  <div>
                    <span className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest pl-1">Transit travel method</span>
                    {(() => {
                      const ModeIcon = MODE_META[importMode]?.icon || Train;
                      return (
                        <GlassSelect
                          value={importMode}
                          onChange={e => setImportMode(e.target.value as any)}
                          aria-label="Transit travel method"
                          leftElement={<ModeIcon className="w-4 h-4 text-primary-500" weight="duotone" />}
                        >
                          <option value="Train">Train / Railway</option>
                          <option value="Bus">Bus / Coach</option>
                          <option value="Car Rental">Car Rental</option>
                          <option value="Personal Car">Personal Car</option>
                          <option value="Cruise">Ferry / Cruise</option>
                        </GlassSelect>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Action button */}
              <div className="space-y-2">
                {importState.message && (
                  <div className={`p-2.5 rounded-xl border text-xs leading-snug ${
                    importState.status === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                      : importState.status === 'error'
                      ? 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                      : 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400'
                  }`}>
                    {importState.message}
                  </div>
                )}
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleTriggerImport}
                  disabled={!importTripId || importState.status === 'loading'}
                  className="w-full min-h-[44px] flex items-center justify-center rounded-xl text-xs font-bold shrink-0 cursor-pointer shadow-md disabled:opacity-50"
                >
                  {importState.status === 'loading' ? 'Syncing segments...' : '⚡ Auto-Sync Segments'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </GlassPanel>

      {/* Filter and Command Deck */}
      <GlassPanel className="wg-glass-card rounded-[28px] overflow-hidden p-4 sm:p-5 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between shadow-glass-card">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary pointer-events-none" />
          <input 
            type="text" 
            placeholder="Search land journey by station, operator, tickets, notes..."
            className={`${INPUT_BASE_STYLE} pl-11 pr-4 min-h-[44px] text-xs md:text-sm`}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-36">
            <GlassSelect
              value={modeFilter}
              onChange={e => setModeFilter(e.target.value)}
              aria-label="Filter by transport mode"
            >
              <option value="All">All Modes</option>
              <option value="Train">Train</option>
              <option value="Bus">Bus</option>
              <option value="Car Rental">Car Rental</option>
              <option value="Personal Car">Personal Car</option>
              <option value="Cruise">Ferry / Cruise</option>
            </GlassSelect>
          </div>

          <div className="w-full sm:w-36">
            <GlassSelect
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              aria-label="Filter by schedule"
            >
              <option value="All">All Schedules</option>
              <option value="Upcoming">Upcoming</option>
              <option value="Past">Past Journeys</option>
            </GlassSelect>
          </div>

          <div className="w-full sm:w-44">
            <GlassSelect
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              aria-label="Sort journeys by"
            >
              <option value="date-asc">Date (Oldest First)</option>
              <option value="date-desc">Date (Soonest First)</option>
              <option value="cost-desc">Cost (Expensive First)</option>
              <option value="duration-desc">Duration (Longest First)</option>
            </GlassSelect>
          </div>
        </div>
      </GlassPanel>

      {/* Proposed Floating Bulk Actions Toolbar */}
      <AnimatePresence>
        {isMultiEditing && selectedTripIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-sticky"
          >
            <GlassPanel
              className="wg-glass-pill shadow-2xl border border-primary-500/30"
              padding="8px 16px"
              overrides={{ borderRadius: 9999 }}
            >
              <div className="flex items-center gap-4">
                <span className="text-xs font-bold text-light-text dark:text-dark-text">
                  <span className="font-mono text-primary-500">{selectedTripIds.size}</span> selected
                </span>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="px-3.5 py-1.5 rounded-full bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-rose-600 transition-colors shadow-sm cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" weight="bold" />
                  <span>Delete Selected</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTripIds(new Set())}
                  className="text-xs text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text transition-colors cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </GlassPanel>
          </motion.div>
        )}
      </AnimatePresence>

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-light-text-secondary uppercase tracking-widest">Querying database...</span>
        </div>
      )}

      {/* Main List Layout */}
      {!loading && (
        <>
          {filteredRoadTrips.length === 0 ? (
            <EmptyState
              icon={<Compass className="w-8 h-8 text-primary-500" />}
              title="No Land Journeys Found"
              description="There are no journeys registered yet. Try adding a custom itinerary segment or assigning modes like Train, Bus, or Car."
              action={{
                label: "Add Land Journey",
                onClick: handleOpenCreateModal,
                icon: "add"
              }}
            />
          ) : (
            <div className="space-y-4">
              {filteredRoadTrips.map((tr) => {
                const isExpanded = !!expandedCards[tr.id];
                const modeDetails = MODE_META[tr.mode as keyof typeof MODE_META] || MODE_META['Train'];
                const ModeIcon = modeDetails.icon;
                const isSelected = selectedTripIds.has(tr.id);
                
                const isDraftPlannedRoute = tr.itineraryId === 'route-gen' || tr.itineraryId === 'route-booked';
                
                return (
                  <GlassPanel
                    key={tr.id}
                    className={`wg-glass-card rounded-[28px] overflow-hidden shadow-glass-card transition-all duration-300 ${
                      isSelected ? 'ring-2 ring-primary-500' : ''
                    } ${
                      isDraftPlannedRoute 
                        ? 'border-dashed border-emerald-500/30' 
                        : ''
                    }`}
                  >
                    <div className="p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Left: Multi-select checkbox + Icon & Route */}
                      <div className="flex flex-1 items-center gap-4 min-w-0">
                        {isMultiEditing && (
                          <button
                            type="button"
                            onClick={() => toggleSelectSegment(tr.id)}
                            className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-primary-500 hover:bg-primary-500/10 transition-colors shrink-0 cursor-pointer"
                            aria-label={isSelected ? "Deselect segment" : "Select segment"}
                          >
                            {isSelected ? (
                              <CheckSquare className="w-6 h-6 text-primary-500" weight="fill" />
                            ) : (
                              <Square className="w-6 h-6 text-light-text-secondary dark:text-dark-text-secondary" weight="bold" />
                            )}
                          </button>
                        )}

                        <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl ${modeDetails.bgClass} ${modeDetails.borderClass} border flex items-center justify-center ${modeDetails.colorClass} shrink-0 shadow-sm`}>
                          <ModeIcon className="w-6 h-6" weight="duotone" />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm md:text-base font-black tracking-tight text-light-text dark:text-dark-text truncate">
                              {tr.origin}
                            </span>
                            <ArrowRight className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary shrink-0" />
                            <span className="text-sm md:text-base font-black tracking-tight text-light-text dark:text-dark-text truncate">
                              {tr.destination}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1">
                            {tr.provider && (
                              <span className="font-bold text-light-text dark:text-dark-text pr-1.5 border-r border-black/10 dark:border-white/10 leading-none">
                                {tr.provider}
                              </span>
                            )}
                            {tr.identifier && (
                              <span className="font-mono pr-1.5 border-r border-black/10 dark:border-white/10 leading-none">
                                {tr.identifier}
                              </span>
                            )}
                            <span className="leading-none">{modeDetails.label}</span>
                          </div>
                        </div>
                      </div>

                      {/* Middle: Timing, Date & Distance */}
                      <div className="flex items-center gap-6 justify-between md:justify-center pr-3 border-black/5 dark:border-white/5 md:border-r shrink-0">
                        <div className="text-left md:text-center space-y-1">
                          <div className="flex items-center gap-1.5 md:justify-center text-xs font-bold text-light-text dark:text-dark-text leading-none">
                            <Calendar className="w-3.5 h-3.5 text-blue-500" />
                            <span>{formatDate(tr.departureDate, 'short-with-year')}</span>
                          </div>
                          
                          {tr.departureTime && (
                            <div className="text-xs font-sans font-medium text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1 leading-none justify-start md:justify-center">
                              <Clock className="w-3 h-3 text-light-text-secondary" />
                              <span>{tr.departureTime} - {tr.arrivalTime || 'Arrival'}</span>
                              {tr.duration && <span className="text-light-text dark:text-dark-text font-bold">({Math.round(tr.duration / 60)}h {tr.duration % 60}m)</span>}
                            </div>
                          )}
                        </div>

                        {tr.distance && (
                          <div className="hidden lg:flex flex-col items-center">
                            <span className="text-xs font-black font-mono tracking-tight text-light-text dark:text-dark-text">{tr.distance} km</span>
                            <span className="text-2xs font-bold text-light-text-secondary uppercase tracking-widest mt-0.5">EST. DISTANCE</span>
                          </div>
                        )}
                      </div>

                      {/* Right: Cost, Trip context & Actions */}
                      <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
                        <div className="flex flex-col items-start md:items-end justify-center">
                          {tr.cost ? (
                            <span className="text-sm md:text-base font-black font-mono text-light-text dark:text-dark-text">{formatCurrency(parseFloat(tr.cost) || 0)}</span>
                          ) : (
                            <span className="text-xs font-bold text-light-text-secondary">No cost</span>
                          )}
                          
                          {tr.tripId ? (
                            <button
                              type="button"
                              onClick={() => onTripClick && onTripClick(tr.tripId)}
                              className="text-xs font-bold text-blue-500 hover:text-blue-600 mt-1 cursor-pointer flex items-center"
                              aria-label={`View trip ${tr.tripName || ''}`}
                            >
                              <span className="truncate max-w-[120px]">{tr.tripName || 'Go to Trip'}</span>
                              <ChevronDown className="w-3 h-3 rotate-[270deg]" />
                            </button>
                          ) : (
                            <span className="text-2xs font-bold text-light-text-secondary uppercase tracking-wider mt-1">Independent Travel</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => handleToggleCard(tr.id, e)}
                            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 text-light-text-secondary hover:text-light-text transition-all cursor-pointer"
                            aria-label="Toggle Stops & Route Waypoints"
                            title="Toggle Stops & Route Waypoints"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>

                          {!isDraftPlannedRoute && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(tr)}
                                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center bg-blue-500/10 dark:bg-blue-400/10 text-blue-500 hover:bg-blue-500 hover:text-white border border-blue-500/20 transition-all cursor-pointer"
                                aria-label="Edit Itinerary Details"
                                title="Edit Itinerary Details"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTransport(tr.id, tr.tripId)}
                                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center bg-rose-500/10 dark:bg-rose-400/10 text-rose-500 hover:bg-rose-600 hover:text-white border border-rose-500/20 transition-all cursor-pointer"
                                aria-label="Delete Travel Record"
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
                          className="border-t border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] p-5 md:p-6"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Waypoints block */}
                            <div className="md:col-span-2 space-y-4">
                              <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-2">
                                <span className="text-xs font-black uppercase tracking-wider text-light-text-secondary flex items-center gap-1.5">
                                  <Map className="w-3.5 h-3.5 text-blue-500" /> Planned Waypoints & Stops
                                </span>
                                {tr.waypoints && tr.waypoints.length > 0 && (
                                  <span className="text-xs font-bold text-blue-500">{tr.waypoints.length} stops scheduled</span>
                                )}
                              </div>

                              {tr.waypoints && tr.waypoints.length > 0 ? (
                                <div className="relative pl-6 space-y-4">
                                  <div className="absolute left-2.5 top-2.5 bottom-2.5 w-0.5 bg-black/10 dark:bg-white/10" />

                                  {tr.waypoints.map((wp: RoadTripWaypoint) => (
                                    <div key={wp.id} className="relative flex items-start gap-3 text-xs">
                                      <div className="absolute -left-[21px] top-1 w-3.5 h-3.5 rounded-full border-2 border-emerald-500 bg-white dark:bg-dark-card flex items-center justify-center shadow-sm">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                      </div>

                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-light-text dark:text-dark-text">{wp.name}</span>
                                          <Badge variant="secondary" className="text-2xs px-1.5 py-0.5 bg-black/5 dark:bg-white/5 uppercase font-sans font-bold">
                                            {wp.type}
                                          </Badge>
                                        </div>
                                        {wp.notes && (
                                          <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5 italic">{wp.notes}</p>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-6 border border-dashed border-black/15 dark:border-white/10 rounded-2xl bg-black/[0.01] dark:bg-white/[0.01]">
                                  <p className="text-xs text-light-text-secondary">No scheduled waypoints/stops added yet on this roadtrip drive.</p>
                                </div>
                              )}
                            </div>

                            {/* Additional Information details card */}
                            <div className="bg-white/40 dark:bg-white/[0.04] rounded-2xl p-4 border border-black/5 dark:border-white/5 space-y-3">
                              <span className="text-2xs font-bold uppercase tracking-widest text-light-text-secondary">Itinerary Diagnostics</span>
                              
                              <div className="space-y-2 text-xs">
                                {tr.confirmationCode && (
                                  <div className="flex justify-between items-center text-light-text dark:text-dark-text">
                                    <span>Booking ticket:</span>
                                    <span className="font-mono font-bold">{tr.confirmationCode}</span>
                                  </div>
                                )}
                                <div className="flex justify-between items-center text-light-text dark:text-dark-text">
                                  <span>CO2 Multiplier:</span>
                                  <span className="text-light-text-secondary">{modeDetails.ecoRating}</span>
                                </div>
                                {tr.notes && (
                                  <div className="space-y-1 border-t border-dashed border-black/10 dark:border-white/10 pt-2">
                                    <span className="font-bold text-2xs text-light-text-secondary">DRIVE NOTES</span>
                                    <p className="text-xs text-light-text-secondary whitespace-pre-line leading-relaxed italic">
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
                  </GlassPanel>
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {(['Train', 'Bus', 'Car Rental', 'Personal Car', 'Cruise'] as const).map(modeKey => {
              const isActive = formMode === modeKey || (modeKey === 'Cruise' && formMode === 'Ferry');
              const item = MODE_META[modeKey];
              const Icon = item.icon;
              return (
                <button
                  key={modeKey}
                  type="button"
                  onClick={() => setFormMode(modeKey)}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all cursor-pointer min-h-[56px] ${
                    isActive 
                      ? 'bg-primary-500/15 border-primary-500/40 text-primary-600 dark:text-primary-400 shadow-sm' 
                      : 'bg-white/60 dark:bg-white/[0.04] border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/10 text-light-text-secondary dark:text-dark-text-secondary'
                  }`}
                >
                  <Icon className="w-5 h-5 mb-1" weight="duotone" />
                  <span className="text-2xs font-bold uppercase tracking-wider text-center leading-none">{item.label}</span>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 rounded-3xl bg-white/40 dark:bg-white/[0.03] border border-black/5 dark:border-white/5">
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400 block">Departure Timeline</span>
              <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
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
              <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
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

          {/* Real Routing & Distance Calculation */}
          <div className="p-5 rounded-3xl bg-white/40 dark:bg-white/[0.03] border border-black/5 dark:border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1.5">
                <Navigation className="w-4 h-4 text-primary-500" />
                Distance & Routing Intelligence
              </span>
              {formDistance && (
                <span className={`px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider ${
                  isDistanceEstimated 
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                }`}>
                  {isDistanceEstimated ? 'Estimated' : 'OSRM Verified'}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="md:col-span-2">
                <Input 
                  label="Distance (km)"
                  placeholder="e.g. 465"
                  type="number"
                  min="0"
                  step="0.1"
                  value={formDistance}
                  onChange={e => {
                    setFormDistance(e.target.value);
                    setIsDistanceEstimated(false);
                  }}
                />
              </div>
              <Button
                type="button"
                variant="primary"
                onClick={handleCalculateRoute}
                disabled={isCalculatingRoute || !formOrigin.trim() || !formDestination.trim()}
                className="min-h-[44px] w-full flex items-center justify-center gap-1.5"
              >
                <Navigation className="w-4 h-4" />
                <span>{isCalculatingRoute ? 'Routing...' : 'Calculate Route'}</span>
              </Button>
            </div>
            {routeAttribution && (
              <div className="flex items-center justify-between text-2xs text-light-text-secondary dark:text-dark-text-secondary pt-1">
                <span>{routeAttribution}</span>
                <a 
                  href="https://www.openstreetmap.org/fixthemap" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-primary-500 hover:underline inline-flex items-center gap-0.5"
                >
                  Fix the map
                </a>
              </div>
            )}
          </div>

          {/* Associated Trip linking dropdown */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2">
              <GlassSelect
                label="Associate Trip Grouping"
                value={formTripId}
                onChange={e => setFormTripId(e.target.value)}
              >
                <option value="unassigned">Keep as Independent Travel</option>
                {trips.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </GlassSelect>
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

          {/* Waypoint segment designer box with Proposed DnD-Kit Sorting */}
          <div className="p-5 rounded-3xl bg-white/40 dark:bg-white/[0.03] border border-black/5 dark:border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1.5">
                <Map className="w-4 h-4 text-emerald-500" /> Waypoints & Pit Stops (Drag to reorder)
              </span>
              <span className="text-2xs font-mono text-light-text-secondary">
                {formWaypoints.length} stop{formWaypoints.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Sortable Waypoints via @dnd-kit */}
            {formWaypoints.length > 0 && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleWaypointDragEnd}
              >
                <SortableContext
                  items={formWaypoints.map(w => w.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                    {formWaypoints.map(wp => (
                      <SortableWaypointItem
                        key={wp.id}
                        waypoint={wp}
                        onRemove={handleRemoveWaypoint}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {/* Waypoint insertion row */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end bg-white/60 dark:bg-white/[0.04] p-3 rounded-2xl border border-black/5 dark:border-white/5">
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
                <GlassSelect
                  label="Stop type"
                  value={newWaypointType}
                  onChange={e => setNewWaypointType(e.target.value as any)}
                >
                  <option value="Stop">Sightseeing Stop</option>
                  <option value="Food">Food / Pitstop</option>
                  <option value="Lodging">Lodging stop</option>
                  <option value="Sightseeing">Sightseeing Point</option>
                  <option value="Fuel">Gas / Fuel Station</option>
                </GlassSelect>
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
                  className="h-10 w-full min-h-[40px] p-0 flex items-center justify-center rounded-xl"
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
              className="w-full px-4 py-3 rounded-2xl bg-white/40 dark:bg-white/[0.03] border border-black/5 dark:border-white/5 text-xs focus:bg-white dark:focus:bg-dark-card focus:border-primary-500 outline-none text-light-text dark:text-dark-text placeholder-light-text-secondary/50 dark:placeholder-dark-text-secondary/50 font-medium"
              rows={3}
              placeholder="Insert any relevant ticket details, driving rules, parking arrangements, or maps notes."
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
            />
          </div>

          {/* Actions Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-black/5 dark:border-white/5">
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)} className="min-h-[44px]">
              Cancel
            </Button>
            <Button variant="primary" type="submit" className="min-h-[44px]">
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
                  <div key={seg.id || `${seg.origin}-${seg.destination}-${seg.departureDate}-${idx}`} className="p-4 rounded-2xl border border-black/5 dark:border-white/5 bg-white/70 dark:bg-dark-card/80 shadow-sm flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-2xl ${modeMeta?.bgClass || 'bg-primary-500/10'} ${modeMeta?.borderClass || 'border-primary-500/20'} border flex items-center justify-center ${modeMeta?.colorClass || 'text-primary-500'}`}>
                      <ModeIcon className="w-5 h-5" weight="duotone" />
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
            <Button variant="secondary" onClick={() => setPendingSuggestions(null)} className="min-h-[44px]">
              Cancel
            </Button>
            {pendingSuggestions && pendingSuggestions.length > 0 && (
              <Button 
                variant="primary" 
                onClick={handleConfirmSaveSuggestions}
                className="min-h-[44px]"
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
