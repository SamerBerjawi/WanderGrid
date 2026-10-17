import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { toast } from '../../services/toast';
import { confirmDialog } from '../../services/confirm';
import {
  Plus, MagnifyingGlass, PencilSimple, Trash, CaretDown, CaretUp, Car, MapTrifold, ArrowRight, Sparkle,
  NavigationArrow, Train, Bus, Boat, Info, DotsSixVertical, Check, X, ChartBar, CheckSquare,
} from '@/components/ui/hugeicons';
import { Button, Input, GlassSelect, TimeInput, Autocomplete, Modal } from '../../components/ui';
import { Trip, TransportMode, RoadTripWaypoint } from '../../types';
import { dataService } from '../../services/mockDb';
import { searchLocations, getCoordinates, getCoordinatesSync } from '../../services/geocoding';
import { fetchRoute } from '../../services/multiModalRouting';
import { formatDate, formatCurrency } from '../../utils/formatters';
import { getFlightDepartureUtcDate } from '../../utils/flightData';
import { GhButton, GhCard, GhChip, GhEmpty, GhPage, GhStat, GhTabs, GhTone } from '../../components/golden/Gh';
import { GhTextInput } from '../../components/golden/GhTextInput';
import type { GoldenViewProps } from './registry';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// recharts and the map are loaded only when their card renders
const TransitFootprintChart = lazy(() => import('../../components/TransitFootprintChart').then(m => ({ default: m.TransitFootprintChart })));
const DeckFlightMap = lazy(() => import('../../components/DeckFlightMap').then(m => ({ default: m.DeckFlightMap || m.default })));

type LandMode = Extract<TransportMode, 'Train' | 'Bus' | 'Car Rental' | 'Personal Car' | 'Cruise' | 'Ferry'>;

const useDarkMode = () => {
  const [isDark, setIsDark] = useState(typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false);
  useEffect(() => {
    const observer = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
};

const SPEEDS: Record<string, number> = { 'Train': 120, 'Bus': 70, 'Car Rental': 90, 'Personal Car': 95, 'Cruise': 30, 'Ferry': 40 };
const CO2_G_PER_KM: Record<string, number> = { 'Train': 14, 'Bus': 28, 'Car Rental': 120, 'Personal Car': 125, 'Cruise': 150, 'Ferry': 90 };

const MODE_META: Record<LandMode, { label: string; short: string; icon: any; tone: GhTone; eco: string }> = {
  'Train': { label: 'Train / Railway', short: 'Train', icon: Train, tone: 'sun', eco: 'Ultra-low carbon (14g CO2/km)' },
  'Bus': { label: 'Bus / Coach', short: 'Bus', icon: Bus, tone: 'teal', eco: 'Very low carbon (28g CO2/km)' },
  'Car Rental': { label: 'Car Rental', short: 'Rental car', icon: Car, tone: 'lilac', eco: 'Average carbon (120g CO2/km)' },
  'Personal Car': { label: 'Personal Car', short: 'My car', icon: Car, tone: 'lilac', eco: 'Average carbon (125g CO2/km)' },
  'Cruise': { label: 'Ferry / Cruise', short: 'Ferry', icon: Boat, tone: 'coral', eco: 'Moderate to high carbon (120g CO2/km)' },
  'Ferry': { label: 'Ferry / Cruise', short: 'Ferry', icon: Boat, tone: 'coral', eco: 'Moderate to high carbon (120g CO2/km)' },
};

/** IATA-style code when the value is short, otherwise a truncated place name. */
const toCode = (value: string): string => {
  const v = (value || '').trim();
  return v.length <= 4 ? v.toUpperCase() : v.slice(0, 3).toUpperCase();
};

const daysUntil = (tr: any): number => Math.ceil((getFlightDepartureUtcDate(tr).getTime() - Date.now()) / 86_400_000);

const durationOf = (tr: any): number => {
  let minutes = tr.duration || 0;
  if (!minutes && tr.departureDate && tr.arrivalDate) {
    const dep = new Date(`${tr.departureDate}T${tr.departureTime || '00:00'}`);
    const arr = new Date(`${tr.arrivalDate}T${tr.arrivalTime || '00:00'}`);
    const diff = arr.getTime() - dep.getTime();
    if (diff > 0) minutes = Math.floor(diff / 60000);
  }
  return minutes;
};

const MODE_CHIPS: { id: string; label: string; icon?: any }[] = [
  { id: 'All', label: 'Everything' },
  { id: 'Train', label: 'Train', icon: Train },
  { id: 'Bus', label: 'Bus', icon: Bus },
  { id: 'Car Rental', label: 'Rental car', icon: Car },
  { id: 'Personal Car', label: 'My car', icon: Car },
  { id: 'Cruise', label: 'Ferry', icon: Boat },
];

const SortableWaypointItem: React.FC<{ waypoint: RoadTripWaypoint; onRemove: (id: string) => void }> = ({ waypoint, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: waypoint.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="text-xs flex items-center justify-between gap-2 p-2.5 bg-white dark:bg-sunset-plum rounded-2xl"
    >
      <div className="flex items-center gap-2 min-w-0">
        <button type="button" {...attributes} {...listeners} className="min-w-[44px] min-h-[44px] flex items-center justify-center cursor-grab active:cursor-grabbing shrink-0" aria-label="Drag to reorder waypoint">
          <DotsSixVertical className="w-4 h-4" />
        </button>
        <span className="font-semibold truncate">{waypoint.name}</span>
        <GhChip tone="lilac" className="shrink-0">{waypoint.type}</GhChip>
        {waypoint.notes && <span className="text-2xs italic truncate hidden sm:inline opacity-70">"{waypoint.notes}"</span>}
      </div>
      <button type="button" onClick={() => onRemove(waypoint.id)} className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center cursor-pointer shrink-0 hover:bg-sunset-sand dark:hover:bg-sunset-dusk" aria-label="Remove waypoint">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

/** Boarding pass for the next journey, flat paper ticket with a sun-coloured stub. */
const NextPass: React.FC<{ tr: any; onOpen: () => void }> = ({ tr, onOpen }) => {
  const meta = MODE_META[tr.mode as LandMode] || MODE_META.Train;
  const Icon = meta.icon;
  const days = daysUntil(tr);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${tr.origin} to ${tr.destination}, ${tr.identifier || meta.label}`}
      className="w-full min-h-[44px] flex text-left rounded-3xl overflow-hidden bg-board-paper text-board-ink shadow-card cursor-pointer hover:-translate-y-0.5 transition-transform"
    >
      <div className="flex-1 min-w-0 p-4 sm:p-6">
        <div className="text-2xs tracking-[0.15em] text-board-muted uppercase font-mono truncate">
          Next up · {tr.provider || meta.label} {tr.identifier}
        </div>
        <div className="flex items-center gap-3 my-3 font-mono">
          <span className="text-3xl sm:text-5xl font-medium">{toCode(tr.origin)}</span>
          <span className="flex-1 border-t-2 border-dotted border-board-ink relative h-0">
            <Icon className="w-7 h-7 absolute left-1/2 -translate-x-1/2 -top-3.5 bg-board-paper px-1" />
          </span>
          <span className="text-3xl sm:text-5xl font-medium">{toCode(tr.destination)}</span>
        </div>
        <div className="text-sm font-semibold truncate">{tr.origin} → {tr.destination}</div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono text-board-muted mt-2">
          <span>DATE<br /><b className="text-board-ink font-medium text-sm">{formatDate(tr.departureDate, 'short')}</b></span>
          <span>TIME<br /><b className="text-board-ink font-medium text-sm">{tr.departureTime || '--:--'}</b></span>
          {tr.distance ? <span>KM<br /><b className="text-board-ink font-medium text-sm">{Math.round(tr.distance).toLocaleString()}</b></span> : null}
        </div>
      </div>
      <div className="w-0 border-l-2 border-dashed border-board-ink my-3" aria-hidden="true" />
      <div className="w-24 sm:w-28 shrink-0 flex flex-col items-center justify-center font-mono bg-sunset-sun text-sunset-ink">
        <span className="text-2xs tracking-wider">T-MINUS</span>
        <span className="text-4xl font-medium">{days > 0 ? days : 0}</span>
        <span className="text-2xs tracking-wider uppercase">{days > 0 ? 'days' : 'today'}</span>
      </div>
    </button>
  );
};

export const GoldenRoadTrips: React.FC<GoldenViewProps> = ({ onTripClick }) => {
  const savingRef = useRef(false);
  const [roadTrips, setRoadTrips] = useState<any[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'Upcoming' | 'Past' | 'All'>('All');
  const [sortBy, setSortBy] = useState<'date-asc' | 'date-desc' | 'cost-desc' | 'duration-desc'>('date-asc');
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [isMultiEditing, setIsMultiEditing] = useState(false);
  const [selectedTripIds, setSelectedTripIds] = useState<Set<string>>(new Set());

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransport, setEditingTransport] = useState<any | null>(null);

  const [formMode, setFormMode] = useState<LandMode>('Train');
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

  const [formWaypoints, setFormWaypoints] = useState<RoadTripWaypoint[]>([]);
  const [newWaypointName, setNewWaypointName] = useState('');
  const [newWaypointType, setNewWaypointType] = useState<RoadTripWaypoint['type']>('Stop');
  const [newWaypointNotes, setNewWaypointNotes] = useState('');

  const isDark = useDarkMode();
  const [hubTab, setHubTab] = useState<'map' | 'chart'>('map');
  const [importTripId, setImportTripId] = useState('');
  const [importMode, setImportMode] = useState<LandMode>('Train');
  const [importState, setImportState] = useState<{ status: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ status: 'idle', message: '' });
  const [pendingSuggestions, setPendingSuggestions] = useState<any[] | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleWaypointDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFormWaypoints(items => arrayMove(items, items.findIndex(i => i.id === active.id), items.findIndex(i => i.id === over.id)));
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
      let modeKey: string;
      if (tr.mode === 'Train') modeKey = 'Train';
      else if (tr.mode === 'Bus') modeKey = 'Bus';
      else if (tr.mode === 'Car Rental' || tr.mode === 'Personal Car') modeKey = 'Car';
      else if (tr.mode === 'Ferry' || tr.mode === 'Cruise') modeKey = 'Ferry / Cruise';
      else return;
      const durationMinutes = durationOf(tr);
      let distanceKm = tr.distance || 0;
      if (!distanceKm && durationMinutes > 0) distanceKm = Math.round((durationMinutes / 60) * (SPEEDS[tr.mode] || 80));
      sums[modeKey].distance += distanceKm;
      sums[modeKey].timeMinutes += durationMinutes;
      sums[modeKey].count += 1;
    });
    return Object.keys(sums).map(mode => ({
      name: mode,
      Distance: sums[mode].distance,
      Duration: Math.round((sums[mode].timeMinutes / 60) * 10) / 10,
      Count: sums[mode].count,
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
        const avgSpeed = SPEEDS[defaultMode] || 80;
        const dateA = new Date(locA.endDate || locA.startDate);
        const dateB = new Date(locB.startDate);
        let diffHours = Math.abs(dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60);
        if (isNaN(diffHours) || diffHours <= 0) diffHours = 4;
        if (diffHours > 24) diffHours = 6;
        suggestions.push({
          id: `land-trip-${Math.random().toString(36).substring(2, 11)}`,
          itineraryId: 'route-gen',
          type: 'One-Way',
          mode: defaultMode,
          origin: locA.name,
          destination: locB.name,
          originLat: locA.coordinates?.lat,
          originLng: locA.coordinates?.lng,
          destLat: locB.coordinates?.lat,
          destLng: locB.coordinates?.lng,
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
          duration: Math.round(diffHours * 60),
          distance: Math.round(diffHours * avgSpeed),
          tripId: trip.id,
        });
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
        setImportState({ status: 'success', message: 'All route segments for this trip already exist. Nothing to add.' });
      } else {
        setPendingSuggestions(suggs);
        setImportState({ status: 'idle', message: '' });
      }
    } catch (e: any) {
      console.error(e);
      setImportState({ status: 'error', message: e.message || 'Failed to detect segments.' });
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

  useEffect(() => { loadData(); }, []);

  const handleConfirmSaveSuggestions = async () => {
    if (!pendingSuggestions || pendingSuggestions.length === 0) return;
    try {
      setLoading(true);
      setImportState({ status: 'loading', message: 'Saving segment details...' });
      const tripId = pendingSuggestions[0].tripId;
      const trip = trips.find(t => t.id === tripId);
      if (!trip) throw new Error("Trip not found");
      for (const seg of pendingSuggestions) await dataService.addFlight(seg);
      await dataService.updateTrip({ ...trip, transports: [...(trip.transports || []), ...pendingSuggestions] });
      setImportState({ status: 'success', message: `Added ${pendingSuggestions.length} new segment${pendingSuggestions.length > 1 ? 's' : ''}.` });
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

  const toggleSelectSegment = (id: string) => {
    setSelectedTripIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedTripIds.size === 0) return;
    const count = selectedTripIds.size;
    if (!(await confirmDialog({ title: 'Delete journeys?', message: `Delete ${count} selected land journey${count > 1 ? 's' : ''}? This can't be undone.`, confirmLabel: 'Delete', danger: true }))) return;
    try {
      setLoading(true);
      // One atomic request: delete the journeys and strip them from each linked trip exactly once.
      const ids = Array.from(selectedTripIds);
      const removedByTrip: Record<string, string[]> = {};
      for (const id of ids) {
        const item = roadTrips.find(r => r.id === id);
        if (item?.tripId) (removedByTrip[item.tripId] = removedByTrip[item.tripId] || []).push(id);
      }
      const upsertTrips = Object.entries(removedByTrip)
        .map(([tripId, removed]) => {
          const linkedTrip = trips.find(t => t.id === tripId);
          return linkedTrip ? { ...linkedTrip, transports: (linkedTrip.transports || []).filter(tx => !removed.includes(tx.id)) } : null;
        })
        .filter(Boolean) as typeof trips;
      await dataService.applyBatch({ deleteFlights: ids, upsertTrips });
      setSelectedTripIds(new Set());
      setIsMultiEditing(false);
      await loadData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Could not delete the selected journeys.');
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    let totalKm = 0, totalMinutes = 0, totalExpense = 0, greenCount = 0, actualCo2Kg = 0;
    roadTrips.forEach(tr => {
      if (tr.cost) totalExpense += parseFloat(tr.cost) || 0;
      const durationMinutes = durationOf(tr);
      totalMinutes += durationMinutes;
      let distanceKm = tr.distance || 0;
      if (!distanceKm && durationMinutes > 0) distanceKm = Math.round((durationMinutes / 60) * (SPEEDS[tr.mode] || 80));
      totalKm += distanceKm;
      if (tr.mode === 'Train' || tr.mode === 'Bus') greenCount += 1;
      let trDist = tr.distance || 0;
      if (!trDist && tr.duration) trDist = (tr.duration / 60) * (SPEEDS[tr.mode] || 80);
      actualCo2Kg += (trDist * (CO2_G_PER_KM[tr.mode] || 100)) / 1000;
    });
    const co2SavedKg = Math.max(0, Math.round((totalKm * 115) / 1000 - actualCo2Kg));
    return {
      totalDistance: Math.round(totalKm),
      totalDurationHours: Math.round(totalMinutes / 60),
      totalExpense,
      co2SavedKg,
      treeEquivalent: Math.round(co2SavedKg / 22),
      greenRatio: roadTrips.length ? Math.round((greenCount / roadTrips.length) * 100) : 0,
    };
  }, [roadTrips]);

  const filteredRoadTrips = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return roadTrips.filter(tr => {
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = !query ||
        (tr.origin || '').toLowerCase().includes(query) ||
        (tr.destination || '').toLowerCase().includes(query) ||
        (tr.provider || '').toLowerCase().includes(query) ||
        (tr.identifier || '').toLowerCase().includes(query) ||
        (tr.confirmationCode || '').toLowerCase().includes(query) ||
        (tr.notes || '').toLowerCase().includes(query);
      const matchesMode = modeFilter === 'All' || tr.mode === modeFilter ||
        (modeFilter === 'Cruise' && tr.mode === 'Ferry') || (modeFilter === 'Ferry' && tr.mode === 'Cruise');
      const depDate = new Date(tr.departureDate);
      let matchesStatus = true;
      if (statusFilter === 'Upcoming') matchesStatus = depDate >= now;
      else if (statusFilter === 'Past') matchesStatus = depDate < now;
      return matchesSearch && matchesMode && matchesStatus;
    }).sort((a, b) => {
      const ta = new Date(`${a.departureDate}T${a.departureTime || '00:00'}`).getTime();
      const tb = new Date(`${b.departureDate}T${b.departureTime || '00:00'}`).getTime();
      if (sortBy === 'date-asc') return ta - tb;
      if (sortBy === 'date-desc') return tb - ta;
      if (sortBy === 'cost-desc') return (parseFloat(b.cost) || 0) - (parseFloat(a.cost) || 0);
      if (sortBy === 'duration-desc') return (b.duration || 0) - (a.duration || 0);
      return 0;
    });
  }, [roadTrips, searchQuery, modeFilter, statusFilter, sortBy]);

  /** Next upcoming journey (soonest departure) of the filtered set, shown as the boarding pass; the rest go to the board. */
  const { nextPass, restRows } = useMemo(() => {
    const byTime = [...filteredRoadTrips].sort((a, b) => getFlightDepartureUtcDate(a).getTime() - getFlightDepartureUtcDate(b).getTime());
    const next = byTime.find(t => daysUntil(t) >= 0) || null;
    return { nextPass: next, restRows: filteredRoadTrips.filter(t => t !== next) };
  }, [filteredRoadTrips]);

  const mapTrips = useMemo(() => {
    const existingTransportIds = new Set<string>();
    trips.forEach(t => t.transports?.forEach(tr => existingTransportIds.add(tr.id)));
    const standalone = roadTrips.filter(rt => !existingTransportIds.has(rt.id)).map(rt => {
      if (!rt.originLat || !rt.destLat) {
        const o = getCoordinatesSync(rt.origin);
        const d = getCoordinatesSync(rt.destination);
        return { ...rt, originLat: rt.originLat ?? o?.lat, originLng: rt.originLng ?? o?.lng, destLat: rt.destLat ?? d?.lat, destLng: rt.destLng ?? d?.lng };
      }
      return rt;
    });
    if (standalone.length === 0) return trips;
    const virtualTrip: Trip = {
      id: 'roadtrips-overview',
      name: 'Overland & Road Trips',
      location: 'Overland Routes',
      startDate: standalone[0]?.departureDate || '',
      endDate: standalone[standalone.length - 1]?.arrivalDate || '',
      status: 'Upcoming',
      participants: [],
      transports: standalone,
      locations: [],
      notes: '',
    };
    return [...trips, virtualTrip];
  }, [trips, roadTrips]);

  const resetWaypointInputs = () => {
    setNewWaypointName('');
    setNewWaypointType('Stop');
    setNewWaypointNotes('');
  };

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
    resetWaypointInputs();
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
    resetWaypointInputs();
    setIsModalOpen(true);
  };

  const handleCalculateRoute = async () => {
    if (!formOrigin.trim() || !formDestination.trim()) {
      toast.info("Enter the origin and destination first.");
      return;
    }
    setIsCalculatingRoute(true);
    try {
      const [originCoord, destCoord] = await Promise.all([getCoordinates(formOrigin), getCoordinates(formDestination)]);
      if (!originCoord || !destCoord) throw new Error("Could not find geographic coordinates for origin or destination.");
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
      const route = await fetchRoute('car', coords);
      if (route && route.distanceKm > 0) {
        setFormDistance(String(route.distanceKm));
        setIsDistanceEstimated(false);
        setRouteAttribution(route.attribution || '© OpenStreetMap contributors · routing by FOSSGIS');
        if (formDepDate && formDepTime && route.durationMin > 0) {
          const arrDateObj = new Date(new Date(`${formDepDate}T${formDepTime}`).getTime() + route.durationMin * 60000);
          setFormArrDate(arrDateObj.toISOString().split('T')[0]);
          setFormArrTime(arrDateObj.toTimeString().substring(0, 5));
        }
      } else {
        throw new Error("Routing service did not return a valid route.");
      }
    } catch (err: any) {
      console.warn("[RoadTrips] Routing calculation fallback to estimation:", err);
      let durationMinutes = 0;
      if (formDepDate && formArrDate) {
        const diffMs = new Date(`${formArrDate}T${formArrTime || '00:00'}`).getTime() - new Date(`${formDepDate}T${formDepTime || '00:00'}`).getTime();
        if (diffMs > 0) durationMinutes = Math.floor(diffMs / 60000);
      }
      const fallbackDist = durationMinutes > 0 ? Math.round((durationMinutes / 60) * (SPEEDS[formMode] || 80)) : 100;
      setFormDistance(String(fallbackDist));
      setIsDistanceEstimated(true);
      setRouteAttribution(null);
      toast.info("Routing service unavailable. The distance was estimated from the schedule; you can edit it.");
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  const handleSaveTransport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRef.current) return; // a double click must not create two journeys
    if (!formOrigin.trim() || !formDestination.trim() || !formDepDate) {
      toast.error("Origin, destination and departure date are required.");
      return;
    }
    savingRef.current = true;
    try {
      setLoading(true);
      const targetTrip = trips.find(t => t.id === formTripId);
      const isLinkedToTrip = formTripId !== 'unassigned' && Boolean(targetTrip);

      let durationMinutes = 0;
      if (formDepDate && formArrDate) {
        const diffMs = new Date(`${formArrDate}T${formArrTime || '00:00'}`).getTime() - new Date(`${formDepDate}T${formDepTime || '00:00'}`).getTime();
        if (diffMs > 0) durationMinutes = Math.floor(diffMs / 60000);
      }
      const estimatedDistance = durationMinutes > 0 ? Math.round((durationMinutes / 60) * (SPEEDS[formMode] || 80)) : 0;
      const finalDistance = formDistance ? parseFloat(formDistance) : estimatedDistance;

      const [originCoord, destCoord] = await Promise.all([getCoordinates(formOrigin.trim()), getCoordinates(formDestination.trim())]);

      const transportPayload: any = {
        id: editingTransport ? editingTransport.id : `land-${crypto.randomUUID()}`,
        type: 'One-Way',
        mode: formMode,
        origin: formOrigin.trim(),
        destination: formDestination.trim(),
        originLat: originCoord?.lat ?? editingTransport?.originLat,
        originLng: originCoord?.lng ?? editingTransport?.originLng,
        destLat: destCoord?.lat ?? editingTransport?.destLat,
        destLng: destCoord?.lng ?? editingTransport?.destLng,
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
        tripName: isLinkedToTrip ? targetTrip?.name : undefined,
      };

      if (editingTransport) await dataService.updateFlight(transportPayload);
      else await dataService.addFlight(transportPayload);

      if (isLinkedToTrip && targetTrip) {
        const currentTransports = targetTrip.transports || [];
        const updatedTransports = editingTransport
          ? currentTransports.map(t => t.id === editingTransport.id ? transportPayload : t)
          : [...currentTransports, transportPayload];
        await dataService.updateTrip({ ...targetTrip, transports: updatedTransports });
      }

      setIsModalOpen(false);
      window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
      await loadData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Could not save this journey.');
    } finally {
      savingRef.current = false;
      setLoading(false);
    }
  };

  const handleDeleteTransport = async (id: string, tripId?: string) => {
    if (!(await confirmDialog({ title: 'Delete journey?', message: 'Delete this land journey? This can\'t be undone.', confirmLabel: 'Delete', danger: true }))) return;
    try {
      setLoading(true);
      await dataService.deleteFlight(id);
      if (tripId) {
        const linkedTrip = trips.find(t => t.id === tripId);
        if (linkedTrip && linkedTrip.transports) {
          await dataService.updateTrip({ ...linkedTrip, transports: linkedTrip.transports.filter(tx => tx.id !== id) });
        }
      }
      window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
      loadData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Could not delete this journey.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddWaypoint = () => {
    if (!newWaypointName.trim()) return;
    setFormWaypoints(prev => [...prev, {
      id: `waypoint-${crypto.randomUUID()}`,
      name: newWaypointName.trim(),
      type: newWaypointType,
      notes: newWaypointNotes.trim() || undefined,
      addToVisited: true,
    }]);
    setNewWaypointName('');
    setNewWaypointNotes('');
  };

  const handleRemoveWaypoint = (id: string) => setFormWaypoints(prev => prev.filter(w => w.id !== id));

  const modeCounts = useMemo(() => {
    const c: Record<string, number> = { All: roadTrips.length };
    roadTrips.forEach(t => {
      const k = t.mode === 'Ferry' ? 'Cruise' : t.mode;
      c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [roadTrips]);

  /** One row of the split-flap board: select/expand/edit/delete stay reachable, plus the waypoint drawer. */
  const renderRow = (tr: any) => {
    const meta = MODE_META[tr.mode as LandMode] || MODE_META.Train;
    const Icon = meta.icon;
    const past = daysUntil(tr) < 0;
    const isExpanded = !!expandedCards[tr.id];
    const isSelected = selectedTripIds.has(tr.id);
    const isDraft = tr.itineraryId === 'route-gen' || tr.itineraryId === 'route-booked';
    const iconBtn = 'min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center cursor-pointer hover:bg-white/10 text-board-muted hover:text-board-amber transition-colors';
    return (
      <li key={tr.id} className={`border-b border-board-line last:border-b-0 ${isSelected ? 'bg-white/10 rounded-2xl' : ''}`}>
        <div className="flex items-center gap-1 sm:gap-2">
          {isMultiEditing && (
            <button
              type="button"
              onClick={() => toggleSelectSegment(tr.id)}
              className={`${iconBtn} shrink-0`}
              aria-label={isSelected ? 'Deselect segment' : 'Select segment'}
              aria-pressed={isSelected}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${isSelected ? 'bg-board-amber text-board-ink' : 'border-2 border-board-muted'}`}>
                {isSelected && <Check className="w-4 h-4" />}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => (isMultiEditing ? toggleSelectSegment(tr.id) : handleOpenEditModal(tr))}
            className="flex-1 min-w-0 min-h-[56px] flex items-center gap-3 py-2 text-left text-sm cursor-pointer"
            aria-label={`${isMultiEditing ? 'Select' : 'Edit'} ${tr.origin} to ${tr.destination}`}
          >
            <span className="w-16 sm:w-24 shrink-0 text-board-muted text-xs sm:text-sm">{formatDate(tr.departureDate, 'short')}</span>
            <span className="w-8 h-8 rounded-full bg-board-amber text-board-ink flex items-center justify-center shrink-0"><Icon className="w-4 h-4" /></span>
            <span className="flex-1 min-w-0">
              <span className="block truncate uppercase">{toCode(tr.origin)} → {toCode(tr.destination)}</span>
              <span className="block truncate text-2xs text-board-muted normal-case">
                {[tr.provider, tr.distance ? `${Math.round(tr.distance).toLocaleString()} km` : '', tr.tripName].filter(Boolean).join(' · ') || meta.label}
              </span>
            </span>
            <span className={`hidden sm:inline text-xs ${past ? 'text-board-muted' : 'text-board-ok'}`}>{past ? 'ARRIVED' : 'ON TIME'}</span>
          </button>
          <button type="button" onClick={e => { e.stopPropagation(); setExpandedCards(p => ({ ...p, [tr.id]: !p[tr.id] })); }} className={iconBtn} aria-label="Toggle stops and route details" aria-expanded={isExpanded}>
            {isExpanded ? <CaretUp className="w-4 h-4" /> : <CaretDown className="w-4 h-4" />}
          </button>
          {!isDraft && !isMultiEditing && (
            <>
              <button type="button" onClick={() => handleOpenEditModal(tr)} className={`${iconBtn} hidden sm:flex`} aria-label="Edit journey"><PencilSimple className="w-4 h-4" /></button>
              <button type="button" onClick={() => handleDeleteTransport(tr.id, tr.tripId)} className={`${iconBtn} hidden sm:flex`} aria-label="Delete journey"><Trash className="w-4 h-4" /></button>
            </>
          )}
        </div>
        {isExpanded && (
          <div className="pb-4 px-2 text-xs text-board-amber flex flex-col gap-3">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-board-muted">
              <span>{tr.departureTime || '--:--'} → {tr.arrivalTime || '--:--'}{tr.duration ? ` · ${Math.floor(tr.duration / 60)}h ${tr.duration % 60}m` : ''}</span>
              {tr.cost ? <span>{formatCurrency(parseFloat(tr.cost) || 0)}</span> : <span>No cost</span>}
              {tr.confirmationCode && <span>REF {tr.confirmationCode}</span>}
              <span>{meta.eco}</span>
            </div>
            {tr.tripId ? (
              <button type="button" onClick={() => onTripClick?.(tr.tripId)} className="self-start min-h-[44px] text-board-amber underline cursor-pointer" aria-label={`View trip ${tr.tripName || ''}`}>
                {tr.tripName || 'Go to trip'}
              </button>
            ) : (
              <span className="text-board-muted uppercase tracking-wider">Independent travel</span>
            )}
            {tr.waypoints && tr.waypoints.length > 0 ? (
              <ol className="flex flex-col gap-1">
                {tr.waypoints.map((wp: RoadTripWaypoint, i: number) => (
                  <li key={wp.id} className="flex items-baseline gap-2">
                    <span className="text-board-muted">{String(i + 1).padStart(2, '0')}</span>
                    <span className="text-board-amber">{wp.name}</span>
                    <span className="text-board-muted uppercase">{wp.type}</span>
                    {wp.notes && <span className="text-board-muted italic truncate">"{wp.notes}"</span>}
                  </li>
                ))}
              </ol>
            ) : (
              <span className="text-board-muted">No stops added yet.</span>
            )}
            {tr.notes && <p className="text-board-muted whitespace-pre-line italic">"{tr.notes}"</p>}
            {!isDraft && (
              <div className="flex gap-2 sm:hidden">
                <button type="button" onClick={() => handleOpenEditModal(tr)} className="min-h-[44px] px-4 rounded-full bg-board-amber text-board-ink font-semibold cursor-pointer">Edit</button>
                <button type="button" onClick={() => handleDeleteTransport(tr.id, tr.tripId)} className="min-h-[44px] px-4 rounded-full border border-board-muted text-board-amber cursor-pointer">Delete</button>
              </div>
            )}
          </div>
        )}
      </li>
    );
  };

  const fieldLabel = 'block text-xs font-bold uppercase tracking-wider text-sunset-ink/70 dark:text-white/70 mb-1.5 px-1';

  return (
    <GhPage
      title="Overland & sea"
      icon={<Car className="w-8 h-8 sm:w-10 sm:h-10" />}
      action={<GhButton onClick={handleOpenCreateModal} icon={<Plus className="w-4 h-4" />} label="Add journey">Add<span className="hidden sm:inline"> journey</span></GhButton>}
      controls={
        <GhButton variant={isMultiEditing ? 'primary' : 'soft'} onClick={() => { setIsMultiEditing(!isMultiEditing); if (isMultiEditing) setSelectedTripIds(new Set()); }} icon={<CheckSquare className="w-4 h-4" />} label="Toggle bulk selection">
          {isMultiEditing ? 'Done selecting' : 'Select'}
        </GhButton>
      }
    >
      {errorMessage && (
        <div className="p-4 rounded-3xl bg-sunset-coral text-white text-sm font-semibold flex items-center gap-2">
          <Info className="w-5 h-5 shrink-0" /><span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <GhStat tone="lilac" label="Journeys" value={roadTrips.length} hint={`${stats.greenRatio}% by train or bus`} />
        <GhStat tone="teal" label="Distance" value={<>{stats.totalDistance.toLocaleString()}<span className="text-base font-bold"> km</span></>} hint={`~${stats.totalDurationHours} hrs on the move`} />
        <GhStat tone="sun" label="CO2 saved" value={<>{stats.co2SavedKg.toLocaleString()}<span className="text-base font-bold"> kg</span></>} hint={`~${stats.treeEquivalent} trees' worth`} />
        <GhStat tone="coral" label="Spent" value={formatCurrency(stats.totalExpense)} hint="on the road and water" />
      </div>

      <section className="flex flex-col gap-3" aria-label="Filters">
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-2 px-2 sm:mx-0 sm:px-0 sm:flex-wrap">
          {MODE_CHIPS.map(c => {
            const active = modeFilter === c.id;
            const Icon = c.icon;
            const tone = c.id === 'All' ? 'bg-sunset-ink text-white' : { Train: 'bg-sunset-sun', Bus: 'bg-sunset-teal', 'Car Rental': 'bg-sunset-lilac', 'Personal Car': 'bg-sunset-lilac', Cruise: 'bg-sunset-orange text-white' }[c.id] + (c.id === 'Cruise' ? '' : ' text-sunset-ink');
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setModeFilter(c.id)}
                aria-pressed={active}
                className={`min-h-[44px] px-4 rounded-full inline-flex items-center gap-2 text-sm font-bold whitespace-nowrap cursor-pointer transition-all shrink-0 ${active ? `${tone} shadow-card scale-105` : 'bg-white dark:bg-sunset-dusk text-sunset-ink dark:text-white'}`}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {c.label}
                <span className="opacity-70">{modeCounts[c.id] || 0}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex-1 relative">
            <MagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-60 pointer-events-none" />
            <GhTextInput placeholder="Search stations, operators, tickets…" aria-label="Search journeys" className="pl-11" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <GhTabs
              tabs={[{ id: 'All', label: 'All' }, { id: 'Upcoming', label: 'Coming up' }, { id: 'Past', label: 'Done' }]}
              active={statusFilter}
              onChange={id => setStatusFilter(id as typeof statusFilter)}
            />
            <div className="sm:w-52">
              <GlassSelect value={sortBy} onChange={e => setSortBy(e.target.value as any)} aria-label="Sort journeys by">
                <option value="date-asc">Date (oldest first)</option>
                <option value="date-desc">Date (soonest first)</option>
                <option value="cost-desc">Cost (highest first)</option>
                <option value="duration-desc">Duration (longest first)</option>
              </GlassSelect>
            </div>
          </div>
        </div>
      </section>

      {loading && roadTrips.length === 0 && (
        <div className="flex items-center justify-center py-16" role="status" aria-label="Loading journeys">
          <div className="w-10 h-10 border-4 border-sunset-coral border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!(loading && roadTrips.length === 0) && (filteredRoadTrips.length === 0 ? (
        <GhEmpty
          title="No journeys yet"
          hint="Add a train, bus, car or ferry ride and it shows up here."
          action={<GhButton onClick={handleOpenCreateModal} icon={<Plus className="w-4 h-4" />}>Add journey</GhButton>}
        />
      ) : (
        <div className="wg-board rounded-3xl p-4 sm:p-6 flex flex-col gap-4">
          <div className="flex justify-between text-xs tracking-[0.2em] text-board-muted">
            <span>DEPARTURES</span>
            <span>{filteredRoadTrips.length}</span>
          </div>
          {nextPass && (
            <div className="flex items-stretch gap-2">
              {isMultiEditing && (
                <button
                  type="button"
                  onClick={() => toggleSelectSegment(nextPass.id)}
                  className="min-w-[44px] rounded-2xl flex items-center justify-center cursor-pointer bg-white/10"
                  aria-label={selectedTripIds.has(nextPass.id) ? 'Deselect segment' : 'Select segment'}
                  aria-pressed={selectedTripIds.has(nextPass.id)}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center ${selectedTripIds.has(nextPass.id) ? 'bg-board-amber text-board-ink' : 'border-2 border-board-muted'}`}>
                    {selectedTripIds.has(nextPass.id) && <Check className="w-4 h-4" />}
                  </span>
                </button>
              )}
              <div className="flex-1 min-w-0"><NextPass tr={nextPass} onOpen={() => (isMultiEditing ? toggleSelectSegment(nextPass.id) : handleOpenEditModal(nextPass))} /></div>
              {!isMultiEditing && (
                <div className="flex flex-col justify-center">
                  <button type="button" onClick={() => handleDeleteTransport(nextPass.id, nextPass.tripId)} className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-board-muted hover:text-board-amber cursor-pointer" aria-label="Delete next journey">
                    <Trash className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
          <ul className="flex flex-col">{restRows.map(renderRow)}</ul>
        </div>
      ))}

      {isMultiEditing && selectedTripIds.size > 0 && (
        <div className="fixed bottom-floating-bar left-1/2 -translate-x-1/2 z-sticky flex items-center gap-3 bg-sunset-ink text-white rounded-full pl-5 pr-2 py-2 shadow-card">
          <span className="text-sm font-bold"><span className="font-mono text-sunset-sun">{selectedTripIds.size}</span> picked</span>
          <GhButton onClick={handleBulkDelete} icon={<Trash className="w-4 h-4" />}>Delete</GhButton>
          <button type="button" onClick={() => setSelectedTripIds(new Set())} className="min-h-[44px] px-3 text-sm font-semibold cursor-pointer">Clear</button>
        </div>
      )}

      <GhCard className="!p-0 overflow-hidden">
        <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight">Your routes</h2>
          <GhTabs tabs={[{ id: 'map', label: 'Map' }, { id: 'chart', label: 'Footprint' }]} active={hubTab} onChange={id => setHubTab(id as 'map' | 'chart')} />
        </div>
        <div className="h-[360px] sm:h-[440px] relative bg-sunset-sand dark:bg-sunset-dusk">
          {hubTab === 'map' ? (
            <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><div className="w-10 h-10 border-4 border-sunset-coral border-t-transparent rounded-full animate-spin" /></div>}>
              <DeckFlightMap trips={mapTrips} showFlightRoutes={false} showLandSeaRoutes={true} showCityMarkers={true} showRoadTracing={true} activeLayer={'standard'} clusterMode={false} />
            </Suspense>
          ) : (
            <div className="w-full h-full p-4 sm:p-6 flex flex-col gap-3">
              <p className="text-sm font-semibold flex items-center gap-2"><ChartBar className="w-4 h-4" />Distance and hours by mode</p>
              <div className="flex-1 min-h-0">
                <Suspense fallback={<div className="w-full h-full animate-pulse rounded-3xl bg-white/50 dark:bg-white/5" aria-hidden="true" />}>
                  <TransitFootprintChart data={chartData} isDark={isDark} />
                </Suspense>
              </div>
            </div>
          )}
        </div>
      </GhCard>

      <GhCard tone="lilac" className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Sparkle className="w-6 h-6" />
          <h2 className="text-xl sm:text-2xl font-black tracking-tight">Fill in from a trip</h2>
        </div>
        <p className="text-sm font-medium">Pick a trip and a way to travel. We'll draft the legs between its stops.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <GlassSelect value={importTripId} onChange={e => setImportTripId(e.target.value)} aria-label="Target trip">
            <option value="">Select a trip…</option>
            {trips.filter(t => t.locations && t.locations.length >= 2).map(t => (
              <option key={t.id} value={t.id}>{t.name} ({t.locations?.length} stops)</option>
            ))}
          </GlassSelect>
          <GlassSelect value={importMode} onChange={e => setImportMode(e.target.value as LandMode)} aria-label="Way to travel">
            <option value="Train">Train / Railway</option>
            <option value="Bus">Bus / Coach</option>
            <option value="Car Rental">Car Rental</option>
            <option value="Personal Car">Personal Car</option>
            <option value="Cruise">Ferry / Cruise</option>
          </GlassSelect>
        </div>
        {importState.message && (
          <div role="status" className="p-3 rounded-2xl bg-white dark:bg-sunset-plum text-sm font-semibold">{importState.message}</div>
        )}
        <div>
          <GhButton onClick={handleTriggerImport} className={!importTripId || importState.status === 'loading' ? 'opacity-50 pointer-events-none' : ''}>
            {importState.status === 'loading' ? 'Drafting legs…' : 'Draft the legs'}
          </GhButton>
        </div>
      </GhCard>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTransport ? "Edit journey" : "Add a journey"}
        subtitle="Land and sea, door to door"
        icon="directions_car"
        maxWidth="max-w-4xl"
      >
        <form onSubmit={handleSaveTransport} className="space-y-6 font-sans text-left text-sunset-ink dark:text-white">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {(['Train', 'Bus', 'Car Rental', 'Personal Car', 'Cruise'] as const).map(modeKey => {
              const isActive = formMode === modeKey || (modeKey === 'Cruise' && formMode === 'Ferry');
              const item = MODE_META[modeKey];
              const Icon = item.icon;
              const toneCls = { sun: 'bg-sunset-sun text-sunset-ink', teal: 'bg-sunset-teal text-sunset-ink', lilac: 'bg-sunset-lilac text-sunset-ink', coral: 'bg-sunset-orange text-white', surface: '', ink: '' }[item.tone];
              return (
                <button
                  key={modeKey}
                  type="button"
                  onClick={() => setFormMode(modeKey)}
                  aria-pressed={isActive}
                  className={`flex flex-col items-center justify-center p-3 rounded-3xl transition-all cursor-pointer min-h-[64px] ${isActive ? `${toneCls} shadow-card scale-105` : 'bg-sunset-sand dark:bg-sunset-dusk'}`}
                >
                  <Icon className="w-5 h-5 mb-1" weight="duotone" />
                  <span className="text-2xs font-bold uppercase tracking-wider text-center leading-none">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Autocomplete label="From" placeholder="e.g. Paris Gare du Nord, Rome" value={formOrigin} onChange={val => setFormOrigin(val)} fetchSuggestions={searchLocations} />
            <Autocomplete label="To" placeholder="e.g. London St Pancras, Milan" value={formDestination} onChange={val => setFormDestination(val)} fetchSuggestions={searchLocations} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 rounded-3xl bg-sunset-sand dark:bg-sunset-dusk">
            <div className="space-y-3">
              <span className={fieldLabel}>Leaving</span>
              <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                <Input type="date" label="Departure date" value={formDepDate} onChange={e => setFormDepDate(e.target.value)} required />
                <TimeInput label="Dep. time" value={formDepTime} onChange={val => setFormDepTime(val)} />
              </div>
            </div>
            <div className="space-y-3">
              <span className={fieldLabel}>Arriving</span>
              <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                <Input type="date" label="Arrival date" value={formArrDate} onChange={e => setFormArrDate(e.target.value)} />
                <TimeInput label="Arr. time" value={formArrTime} onChange={val => setFormArrTime(val)} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Operator / provider" placeholder="e.g. Eurostar, Flixbus, Hertz, DFDS" value={formProvider} onChange={e => setFormProvider(e.target.value)} />
            <Input label="Vehicle plate / id" placeholder="e.g. Plate #, TGV 9102" value={formIdentifier} onChange={e => setFormIdentifier(e.target.value)} />
            <Input label="Booking reference" placeholder="e.g. CONFIRM-X9" value={formConfirmationCode} onChange={e => setFormConfirmationCode(e.target.value)} />
          </div>

          <div className="p-5 rounded-3xl bg-sunset-sand dark:bg-sunset-dusk space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className={`${fieldLabel} !mb-0 flex items-center gap-1.5`}><NavigationArrow className="w-4 h-4" />Distance</span>
              {formDistance && <GhChip tone={isDistanceEstimated ? 'sun' : 'teal'}>{isDistanceEstimated ? 'Estimated' : 'Routed'}</GhChip>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="md:col-span-2">
                <Input label="Distance (km)" placeholder="e.g. 465" type="number" min="0" step="0.1" value={formDistance} onChange={e => { setFormDistance(e.target.value); setIsDistanceEstimated(false); }} />
              </div>
              <Button type="button" variant="primary" onClick={handleCalculateRoute} disabled={isCalculatingRoute || !formOrigin.trim() || !formDestination.trim()} className="min-h-[44px] w-full flex items-center justify-center gap-1.5">
                <NavigationArrow className="w-4 h-4" />
                <span>{isCalculatingRoute ? 'Routing…' : 'Calculate route'}</span>
              </Button>
            </div>
            {routeAttribution && (
              <div className="flex items-center justify-between text-2xs opacity-80 pt-1">
                <span>{routeAttribution}</span>
                <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer" className="underline">Fix the map</a>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2">
              <GlassSelect label="Part of a trip?" value={formTripId} onChange={e => setFormTripId(e.target.value)}>
                <option value="unassigned">Keep as independent travel</option>
                {trips.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </GlassSelect>
            </div>
            <Input label="Total expense" placeholder="e.g. 150" type="number" min="0" step="0.01" value={formCost} onChange={e => setFormCost(e.target.value)} />
          </div>

          <div className="p-5 rounded-3xl bg-sunset-sand dark:bg-sunset-dusk space-y-4">
            <div className="flex items-center justify-between">
              <span className={`${fieldLabel} !mb-0 flex items-center gap-1.5`}><MapTrifold className="w-4 h-4" />Waypoints and pit stops (drag to reorder)</span>
              <span className="text-2xs font-mono">{formWaypoints.length} stop{formWaypoints.length !== 1 ? 's' : ''}</span>
            </div>
            {formWaypoints.length > 0 && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleWaypointDragEnd}>
                <SortableContext items={formWaypoints.map(w => w.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                    {formWaypoints.map(wp => <SortableWaypointItem key={wp.id} waypoint={wp} onRemove={handleRemoveWaypoint} />)}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
              <div className="md:col-span-5">
                <Input label="Stop location" placeholder="e.g. Reims Cathedral, Shell Station" value={newWaypointName} onChange={e => setNewWaypointName(e.target.value)} className="h-10 text-xs" />
              </div>
              <div className="md:col-span-3">
                <GlassSelect label="Stop type" value={newWaypointType} onChange={e => setNewWaypointType(e.target.value as any)}>
                  <option value="Stop">Sightseeing stop</option>
                  <option value="Food">Food / pitstop</option>
                  <option value="Lodging">Lodging stop</option>
                  <option value="Sightseeing">Sightseeing point</option>
                  <option value="Fuel">Gas / fuel station</option>
                </GlassSelect>
              </div>
              <div className="md:col-span-3">
                <Input label="Notes" placeholder="Snack, 20min" value={newWaypointNotes} onChange={e => setNewWaypointNotes(e.target.value)} className="h-10 text-xs" />
              </div>
              <div className="md:col-span-1">
                <Button type="button" onClick={handleAddWaypoint} className="h-10 w-full min-h-[44px] p-0 flex items-center justify-center rounded-xl">Add</Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className={fieldLabel}>Notes and directions</span>
            <textarea
              className="w-full px-4 py-3 rounded-3xl bg-sunset-sand dark:bg-sunset-dusk text-sm font-medium outline-none focus:ring-2 focus:ring-sunset-coral text-sunset-ink dark:text-white placeholder:text-sunset-ink/40 dark:placeholder:text-white/40"
              rows={3}
              placeholder="Ticket details, driving rules, parking, map notes…"
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <GhButton variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</GhButton>
            <GhButton type="submit">{editingTransport ? "Save journey" : "Create journey"}</GhButton>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={pendingSuggestions !== null}
        onClose={() => setPendingSuggestions(null)}
        title="Confirm drafted legs"
        subtitle="Consecutive stop segments"
        icon="auto_awesome"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-6 font-sans text-left text-sunset-ink dark:text-white">
          <p className="text-sm font-medium">We drafted these legs from your trip's stops. Save the ones you want.</p>
          <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
            {!pendingSuggestions || pendingSuggestions.length === 0 ? (
              <p className="text-sm italic py-4 text-center">Nothing missing. This trip is fully covered.</p>
            ) : (
              pendingSuggestions.map((seg, idx) => {
                const meta = MODE_META[seg.mode as LandMode] || MODE_META.Train;
                const ModeIcon = meta.icon;
                return (
                  <div key={seg.id || `${seg.origin}-${seg.destination}-${idx}`} className="p-4 rounded-3xl bg-sunset-sand dark:bg-sunset-dusk flex items-center gap-3">
                    <span className="w-10 h-10 rounded-full bg-sunset-sun text-sunset-ink flex items-center justify-center shrink-0"><ModeIcon className="w-5 h-5" /></span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-bold">
                        <span className="truncate">{seg.origin}</span>
                        <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{seg.destination}</span>
                      </div>
                      <div className="text-xs opacity-80 mt-1">{seg.departureDate} · about {seg.distance} km ({Math.round(seg.duration / 60)}h)</div>
                    </div>
                    <GhChip tone="coral">Draft</GhChip>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-end gap-3">
            <GhButton variant="ghost" onClick={() => setPendingSuggestions(null)}>Cancel</GhButton>
            {pendingSuggestions && pendingSuggestions.length > 0 && <GhButton onClick={handleConfirmSaveSuggestions}>Save all</GhButton>}
          </div>
        </div>
      </Modal>
    </GhPage>
  );
};
