import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '../services/toast';
import { dataService } from '../services/mockDb';
import { Trip, Transport, User, WorkspaceSettings, FlightStatusResponse } from '../types';
import { flightTracker } from '../services/flightTracker';
import { calculateDurationMinutes } from '../services/geocoding';
import {
  getCityName, getCarrierName, getFlightStatusTags, getFlightDepartureUtcDate, getFlightArrivalUtcDate,
  getAirportsByQueryLocally, getCarriersByQueryLocally,
} from '../utils/flightData';

/**
 * Data, filters, sorting, grouping and mutations for the Flights page, shared by the Golden Hour variant.
 * The logic is a copy of views/Flights.tsx (which stays untouched); behaviour is the same.
 */

export type FlightRecord = { flight: Transport; trip: Trip };
export type SortField = 'flight' | 'sector' | 'status' | 'timing' | 'seat';
export type CabinClass = 'Economy' | 'Premium Economy' | 'Business' | 'First';

export interface FlightForm {
  tripId: string; airline: string; flightNum: string; confirmation: string; origin: string; destination: string;
  departureDate: string; departureTime: string; arrivalDate: string; arrivalTime: string; duration: number;
  travelClass: CabinClass; seatNumber: string; seatType: 'Window' | 'Aisle' | 'Middle'; cost: string;
  actualDepartureTime: string; actualArrivalTime: string;
}

export const isUnassigned = (tripId: string) => tripId === 'unassigned' || tripId.startsWith('unassigned');

export const extractIata = (val: string) => {
  if (!val) return '';
  return val.includes(' - ') ? val.split(' - ')[0].trim().toUpperCase() : val.trim().toUpperCase();
};

export const formatFlightDuration = (minutes: number) => {
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
};

/** Minutes between a leg's arrival and the next leg's departure when they connect at the same airport. */
export const getLayoverMinutes = (f1: Transport, f2: Transport): number => {
  try {
    if (!f1.destination || !f2.origin || f1.destination !== f2.origin) return 0;
    const diff = getFlightDepartureUtcDate(f2).getTime() - getFlightArrivalUtcDate(f1).getTime();
    return diff > 0 ? Math.floor(diff / 60000) : 0;
  } catch {
    return 0;
  }
};

export const fetchAirportSuggestions = async (query: string): Promise<string[]> => {
  if (!query || query.length < 2) return [];
  let apiResults: any[] = [];
  try {
    const token = localStorage.getItem('wandergrid_session_token');
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`/api/airports/search?q=${encodeURIComponent(query)}`, { headers });
    if (res.ok) apiResults = await res.json();
  } catch (e) {
    console.warn('Airport search API failed, using local dataset fallback:', e);
  }
  const seen = new Set<string>();
  const merged: any[] = [];
  if (Array.isArray(apiResults)) {
    for (const item of apiResults) {
      if (item.iata) { seen.add(item.iata.toUpperCase()); merged.push(item); }
    }
  }
  for (const item of getAirportsByQueryLocally(query)) {
    if (item.iata && !seen.has(item.iata.toUpperCase())) merged.push(item);
  }
  return merged.slice(0, 15).map((a: any) => `${a.iata} - ${a.city_name} (${a.airport_name})`);
};

export const fetchAirlineSuggestions = async (query: string): Promise<string[]> => {
  if (!query || query.length < 1) return [];
  let apiResults: any[] = [];
  try {
    const token = localStorage.getItem('wandergrid_session_token');
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`/api/carriers/search?q=${encodeURIComponent(query)}`, { headers });
    if (res.ok) apiResults = await res.json();
  } catch (e) {
    console.warn('Airline search API failed, using local dataset fallback:', e);
  }
  const seen = new Set<string>();
  const merged: string[] = [];
  if (Array.isArray(apiResults)) {
    for (const item of apiResults) {
      const name = item.company_name;
      if (name) { seen.add(name.toLowerCase()); merged.push(name); }
    }
  }
  for (const item of getCarriersByQueryLocally(query)) {
    const name = item.company_name;
    if (name && !seen.has(name.toLowerCase())) merged.push(name);
  }
  return merged.slice(0, 15);
};

const today = () => new Date().toISOString().split('T')[0];

const blankForm = (settings: WorkspaceSettings | null): FlightForm => ({
  tripId: 'unassigned', airline: '', flightNum: '', confirmation: '',
  origin: settings?.defaultStartingAirport || '', destination: '',
  departureDate: today(), departureTime: '10:00', arrivalDate: today(), arrivalTime: '14:00', duration: 120,
  travelClass: (settings?.defaultTravelClass as CabinClass) || 'Economy', seatNumber: '', seatType: 'Window', cost: '',
  actualDepartureTime: '', actualArrivalTime: '',
});

/** Short city-to-city title for a group of legs. */
const routeTitle = (legs: Transport[]) => {
  if (!legs || legs.length === 0) return 'No route';
  const cities: string[] = [];
  legs.forEach((f, idx) => {
    const originCity = getCityName(f.origin) || f.origin;
    const destCity = getCityName(f.destination) || f.destination;
    if (idx === 0) cities.push(originCity);
    else {
      const prevDest = getCityName(legs[idx - 1].destination) || legs[idx - 1].destination;
      if (originCity !== prevDest && cities[cities.length - 1] !== originCity) cities.push(originCity);
    }
    if (cities[cities.length - 1] !== destCity) cities.push(destCity);
  });
  if (cities.length <= 1) return cities[0] || 'Unknown route';
  if (cities.length <= 3) return cities.join(' → ');
  return `${cities[0]} → ${cities[1]} → ${cities[cities.length - 1]}`;
};

const sortValue = (a: Transport, field: SortField, sub: string): string | number => {
  if (field === 'flight') {
    if (sub === 'identifier') return a.identifier || '';
    if (sub === 'pnr') return a.confirmationCode || 'ZZZZZZ';
    return (getCarrierName(a.provider) || a.provider).toLowerCase() + ' ' + (a.identifier || '');
  }
  if (field === 'sector') {
    if (sub === 'origin') return a.origin || '';
    if (sub === 'destination') return a.destination || '';
    if (sub === 'duration') return a.duration || 0;
    return (a.origin || '') + ' ' + (a.destination || '');
  }
  if (field === 'status') {
    const s = getFlightStatusTags(a).label;
    if (sub === 'canceledFirst') return s === 'CANCELED' ? 0 : 1;
    if (sub === 'scheduledFirst') return s === 'SCHEDULED' ? 0 : 1;
    return s;
  }
  if (field === 'timing') {
    if (sub === 'departureHour') return parseInt((a.departureTime || '00:00').split(':')[0] || '0');
    if (sub === 'arrival') return getFlightArrivalUtcDate(a).getTime();
    if (sub === 'duration') return a.duration || 0;
    return getFlightDepartureUtcDate(a).getTime();
  }
  if (sub === 'cabinTier') {
    const tiers = { First: 0, Business: 1, 'Premium Economy': 2, Economy: 3 } as Record<string, number>;
    return tiers[a.travelClass as string] ?? 4;
  }
  if (sub === 'cost') return typeof a.cost === 'number' ? a.cost : (parseFloat(String(a.cost || '0')) || 0);
  return a.seatNumber || 'ZZZ';
};

export const SORT_DEFAULTS: Record<SortField, string> = { flight: 'airline', sector: 'route', status: 'statusLabel', timing: 'departure', seat: 'seatNumber' };

export const useFlightLog = () => {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [flights, setFlights] = useState<FlightRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings | null>(null);
  const [, setMetadataVersion] = useState(0);

  // Filters and sort
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all' | 'upcoming' | 'past'>('all');
  const [classFilter, setClassFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [colFilterFlight, setColFilterFlight] = useState('');
  const [colFilterSector, setColFilterSector] = useState('');
  const [colFilterStatus, setColFilterStatus] = useState('all');
  const [colFilterSeat, setColFilterSeat] = useState('all');
  const [colFilterTimingDay, setColFilterTimingDay] = useState('all');
  const [sortField, setSortField] = useState<SortField>('timing');
  const [sortSubOption, setSortSubOption] = useState('departure');
  const [sortAsc, setSortAsc] = useState(true);

  // Selection, bundling
  const [isMultiEditing, setIsMultiEditing] = useState(false);
  const [selectedFlightIds, setSelectedFlightIds] = useState<Set<string>>(new Set());
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ type: 'single' | 'multi'; singleRecord?: FlightRecord; multiCount?: number } | null>(null);
  const [isBundling, setIsBundling] = useState(false);
  const [bundleName, setBundleName] = useState('');
  const [bundleLocation, setBundleLocation] = useState('');
  const [createTripInPlanner, setCreateTripInPlanner] = useState(true);
  const [unbundleConfirmTarget, setUnbundleConfirmTarget] = useState<number | null>(null);
  const [isEditingBundle, setIsEditingBundle] = useState(false);
  const [editingBundleId, setEditingBundleId] = useState('');
  const [bundleForm, setBundleForm] = useState({ name: '', location: '', startDate: '', endDate: '' });
  const [isBundlingInFlight, setIsBundlingInFlight] = useState(false);

  // Flight form
  const [isEditing, setIsEditing] = useState(false);
  const [editingFlight, setEditingFlight] = useState<{ flight: Transport; tripId: string } | null>(null);
  const [form, setForm] = useState<FlightForm>(() => blankForm(null));
  const [flightFormError, setFlightFormError] = useState<string | null>(null);
  const [isSavingFlight, setIsSavingFlight] = useState(false);
  const [showManualFields, setShowManualFields] = useState(false);
  const [searchedFlights, setSearchedFlights] = useState<FlightStatusResponse[] | null>(null);
  const [isRouteSearching, setIsRouteSearching] = useState(false);
  const [routeSearchError, setRouteSearchError] = useState('');
  const newFlightIds = useRef({ id: '', itineraryId: '' });
  const savingRef = useRef(false);

  const patchForm = useCallback((p: Partial<FlightForm>) => setForm(f => ({ ...f, ...p })), []);

  useEffect(() => {
    const bump = () => setMetadataVersion(v => v + 1);
    window.addEventListener('wandergrid_metadata_resolved', bump);
    return () => window.removeEventListener('wandergrid_metadata_resolved', bump);
  }, []);

  const refreshData = useCallback(() => {
    setLoadError(null);
    Promise.all([dataService.getTrips(), dataService.getUsers(), dataService.getFlights(), dataService.getWorkspaceSettings()])
      .then(([t, u, independentFlights, s]) => {
        setTrips(t);
        setUsers(u);
        setWorkspaceSettings(s);
        const sessionRaw = localStorage.getItem('wandergrid_session_user');
        let sessionUser: User | null = null;
        if (sessionRaw) {
          try {
            const parsed = JSON.parse(sessionRaw);
            sessionUser = u.find(x => x.id === parsed.id) || parsed;
          } catch (e) { console.error(e); }
        }
        if (!sessionUser && u && u.length > 0) sessionUser = u[0];
        setCurrentUser(sessionUser);

        const extracted: FlightRecord[] = [];
        t.forEach(trip => (trip.transports || []).forEach(tr => { if (tr.mode === 'Flight') extracted.push({ flight: tr, trip }); }));
        const onlyFlights = (independentFlights || []).filter(fl => fl.mode === 'Flight' && (!fl.tripId || fl.tripId === 'unassigned'));
        const unassignedTrip: Trip = { id: 'unassigned', name: 'Independent Flights', location: 'Various', startDate: '', endDate: '', status: 'Planning', participants: [], transports: onlyFlights };
        onlyFlights.forEach(fl => extracted.push({ flight: fl, trip: unassignedTrip }));
        extracted.sort((a, b) => getFlightDepartureUtcDate(b.flight).getTime() - getFlightDepartureUtcDate(a.flight).getTime());
        setFlights(extracted);
        setLoaded(true);
      })
      .catch(err => {
        console.error('Failed to load flight lists:', err);
        setLoadError(err?.message || 'The flight log could not be loaded.');
        setLoaded(true);
      });
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  // Reload when other parts of the app change data
  useEffect(() => {
    window.addEventListener('wandergrid_db_updated', refreshData);
    return () => window.removeEventListener('wandergrid_db_updated', refreshData);
  }, [refreshData]);

  const handleSortHeader = (field: SortField) => {
    if (sortField === field) setSortAsc(a => !a);
    else { setSortField(field); setSortSubOption(SORT_DEFAULTS[field]); setSortAsc(true); }
  };

  const resetFilters = () => {
    setSearchQuery(''); setTimeFilter('all'); setClassFilter('all'); setYearFilter('all');
    setColFilterFlight(''); setColFilterSector(''); setColFilterStatus('all'); setColFilterSeat('all'); setColFilterTimingDay('all');
    setSortField('timing'); setSortSubOption('departure'); setSortAsc(true);
  };

  const hasActiveFilters = searchQuery !== '' || timeFilter !== 'all' || classFilter !== 'all' || yearFilter !== 'all'
    || colFilterFlight !== '' || colFilterSector !== '' || colFilterStatus !== 'all' || colFilterSeat !== 'all' || colFilterTimingDay !== 'all';

  // ---------------- Flight form ----------------

  const openFlightForm = (record?: FlightRecord) => {
    setFlightFormError(null);
    setSearchedFlights(null);
    setRouteSearchError('');
    newFlightIds.current = { id: Math.random().toString(36).substr(2, 9), itineraryId: Math.random().toString(36).substr(2, 9) };
    if (record) {
      const f = record.flight;
      const parentTripId = record.trip.id.startsWith('unassigned') ? 'unassigned' : record.trip.id;
      setShowManualFields(true);
      setEditingFlight({ flight: f, tripId: parentTripId });
      setForm({
        tripId: parentTripId, airline: f.provider || '', flightNum: f.identifier || '', confirmation: f.confirmationCode || '',
        origin: f.origin || '', destination: f.destination || '', departureDate: f.departureDate || '', departureTime: f.departureTime || '10:00',
        arrivalDate: f.arrivalDate || f.departureDate || '', arrivalTime: f.arrivalTime || '14:00', duration: f.duration || 120,
        travelClass: (f.travelClass as CabinClass) || 'Economy', seatNumber: f.seatNumber || '', seatType: f.seatType || 'Window',
        cost: f.cost ? f.cost.toString() : '', actualDepartureTime: f.actualDepartureTime || '', actualArrivalTime: f.actualArrivalTime || '',
      });
    } else {
      setShowManualFields(false);
      setEditingFlight(null);
      let next = blankForm(workspaceSettings);
      const draftStr = localStorage.getItem('flightFormDraft');
      if (draftStr) {
        try {
          const d = JSON.parse(draftStr);
          if (Object.keys(d).length > 0) {
            next = {
              tripId: d.formTripId || 'unassigned', airline: d.formAirline || '', flightNum: d.formFlightNum || '', confirmation: d.formConfirmation || '',
              origin: d.formOrigin || '', destination: d.formDestination || '', departureDate: d.formDepartureDate || today(),
              departureTime: d.formDepartureTime || '10:00', arrivalDate: d.formArrivalDate || today(), arrivalTime: d.formArrivalTime || '14:00',
              duration: d.formDuration || 120, travelClass: d.formClass || 'Economy', seatNumber: d.formSeatNumber || '',
              seatType: d.formSeatType || 'Window', cost: d.formCost || '', actualDepartureTime: d.formActualDepartureTime || '',
              actualArrivalTime: d.formActualArrivalTime || '',
            };
          }
        } catch { /* ignore */ }
      }
      setForm(next);
    }
    setIsEditing(true);
  };

  /** Keeps an in-progress new flight in localStorage, using the same draft keys as the original page. */
  const saveDraft = () => {
    if (editingFlight) return;
    localStorage.setItem('flightFormDraft', JSON.stringify({
      formTripId: form.tripId, formNewTripName: '', formAirline: form.airline, formFlightNum: form.flightNum, formConfirmation: form.confirmation,
      formOrigin: form.origin, formDestination: form.destination, formDepartureDate: form.departureDate, formDepartureTime: form.departureTime,
      formArrivalDate: form.arrivalDate, formArrivalTime: form.arrivalTime, formDuration: form.duration, formClass: form.travelClass,
      formSeatNumber: form.seatNumber, formSeatType: form.seatType, formCost: form.cost,
      formActualDepartureTime: form.actualDepartureTime, formActualArrivalTime: form.actualArrivalTime,
    }));
  };

  const searchRouteFlights = async () => {
    const o = extractIata(form.origin);
    const d = extractIata(form.destination);
    if (!o || !d || !form.departureDate) { toast.info('Enter the origin, destination and departure date first.'); return; }
    setIsRouteSearching(true);
    setRouteSearchError('');
    try {
      const results = await flightTracker.searchFlightsByRoute(workspaceSettings?.aviationStackApiKey || '', o, d, form.departureDate);
      if (results && results.length > 0) setSearchedFlights(results);
      else { setSearchedFlights([]); setRouteSearchError('No flights found on this route and date.'); }
    } catch (err: any) {
      console.error('Flight route search failed:', err);
      setRouteSearchError(err.message || 'Search request failed. Please check your config/network and try again.');
    } finally {
      setIsRouteSearching(false);
    }
  };

  const selectRouteFlight = (fl: FlightStatusResponse) => {
    const p: Partial<FlightForm> = { airline: fl.airline?.name || '', flightNum: fl.flight?.number || '' };
    setShowManualFields(true);
    if (fl.departure?.iata) p.origin = fl.departure.iata;
    if (fl.arrival?.iata) p.destination = fl.arrival.iata;
    let depTime = form.departureTime, arrTime = form.arrivalTime, depDate = form.departureDate, arrDate = form.arrivalDate || form.departureDate;
    if (fl.departure?.scheduled) {
      const parts = fl.departure.scheduled.split('T');
      if (parts.length === 2) { depDate = parts[0]; depTime = parts[1].substring(0, 5); p.departureDate = depDate; p.departureTime = depTime; }
    }
    if (fl.arrival?.scheduled) {
      const parts = fl.arrival.scheduled.split('T');
      if (parts.length === 2) { arrDate = parts[0]; arrTime = parts[1].substring(0, 5); p.arrivalDate = arrDate; p.arrivalTime = arrTime; }
    }
    p.duration = calculateDurationMinutes(fl.departure?.iata || extractIata(form.origin), fl.arrival?.iata || extractIata(form.destination), depDate, depTime, arrDate, arrTime);
    patchForm(p);
    setSearchedFlights(null);
  };

  const saveFlight = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (savingRef.current) return;
    if (!form.origin || !form.destination || !form.departureDate) {
      setFlightFormError('Departure airport, arrival airport and departure date are required.');
      return;
    }
    setFlightFormError(null);
    savingRef.current = true;
    setIsSavingFlight(true);
    try {
      let targetTrip: Trip | undefined;
      if (form.tripId !== 'unassigned') {
        const found = trips.find(t => t.id === form.tripId);
        if (!found) throw new Error('Selected trip not found.');
        targetTrip = found;
      }
      const costNum = form.cost ? parseFloat(form.cost) : undefined;
      const payload: Transport = {
        id: editingFlight ? editingFlight.flight.id : newFlightIds.current.id,
        itineraryId: editingFlight ? editingFlight.flight.itineraryId : newFlightIds.current.itineraryId,
        type: 'One-Way', mode: 'Flight', provider: form.airline, identifier: form.flightNum.toUpperCase(),
        confirmationCode: form.confirmation.toUpperCase(), origin: extractIata(form.origin).toUpperCase(), destination: extractIata(form.destination).toUpperCase(),
        departureDate: form.departureDate, departureTime: form.departureTime, arrivalDate: form.arrivalDate || form.departureDate, arrivalTime: form.arrivalTime,
        actualDepartureTime: form.actualDepartureTime || undefined, actualArrivalTime: form.actualArrivalTime || undefined,
        duration: form.duration, travelClass: form.travelClass, seatNumber: form.seatNumber, seatType: form.seatType,
        cost: isNaN(costNum as number) ? undefined : costNum,
      };
      if (editingFlight) {
        if (editingFlight.tripId !== form.tripId) {
          const move: { upsertTrips: Trip[]; deleteFlights: string[]; upsertFlights: Transport[] } = { upsertTrips: [], deleteFlights: [], upsertFlights: [] };
          if (editingFlight.tripId === 'unassigned') move.deleteFlights.push(editingFlight.flight.id);
          else {
            const oldTrip = trips.find(t => t.id === editingFlight.tripId);
            if (oldTrip && oldTrip.transports) move.upsertTrips.push({ ...oldTrip, transports: oldTrip.transports.filter(t => t.id !== editingFlight.flight.id) });
          }
          if (form.tripId === 'unassigned') move.upsertFlights.push(payload);
          else if (targetTrip) move.upsertTrips.push({ ...targetTrip, transports: [...(targetTrip.transports || []), payload] });
          await dataService.applyBatch(move);
        } else if (form.tripId === 'unassigned') {
          await dataService.updateFlight(payload);
        } else if (targetTrip) {
          if (!targetTrip.transports) targetTrip.transports = [];
          const idx = targetTrip.transports.findIndex(t => t.id === editingFlight.flight.id);
          if (idx >= 0) targetTrip.transports[idx] = payload; else targetTrip.transports.push(payload);
          await dataService.updateTrip(targetTrip);
        }
      } else if (form.tripId === 'unassigned') {
        await dataService.addFlight(payload);
      } else if (targetTrip) {
        if (!targetTrip.transports) targetTrip.transports = [];
        targetTrip.transports.push(payload);
        await dataService.updateTrip(targetTrip);
      }
      if (!editingFlight) localStorage.removeItem('flightFormDraft');
      setIsEditing(false);
      setEditingFlight(null);
      refreshData();
    } catch (err) {
      console.error(err);
      setFlightFormError(`Could not save this flight. ${err instanceof Error ? err.message : ''}`.trim());
    } finally {
      savingRef.current = false;
      setIsSavingFlight(false);
    }
  };

  // ---------------- Delete / bundle ----------------

  const executeSingleDelete = async (record: FlightRecord) => {
    if (isUnassigned(record.trip.id)) await dataService.deleteFlight(record.flight.id);
    else {
      const t = { ...record.trip };
      if (t.transports) {
        t.transports = t.transports.filter(x => x.id !== record.flight.id);
        await dataService.updateTrip(t);
      }
    }
    refreshData();
    setDeleteConfirmTarget(null);
  };

  const executeMultiDelete = async () => {
    const standaloneIds: string[] = [];
    const removedByTrip: Record<string, string[]> = {};
    for (const fid of Array.from(selectedFlightIds)) {
      const record = flights.find(f => f.flight.id === fid);
      if (!record) continue;
      if (isUnassigned(record.trip.id)) standaloneIds.push(fid);
      else (removedByTrip[record.trip.id] = removedByTrip[record.trip.id] || []).push(fid);
    }
    const upsertTrips = Object.entries(removedByTrip).map(([tripId, removed]) => {
      const trip = trips.find(t => t.id === tripId) || flights.find(f => f.trip.id === tripId)!.trip;
      return { ...trip, transports: (trip.transports || []).filter(t => !removed.includes(t.id)) };
    });
    try {
      await dataService.applyBatch({ deleteFlights: standaloneIds, upsertTrips });
    } catch (err: any) {
      toast.error(`Could not delete the selected flights. Nothing was changed. ${err?.message || ''}`.trim());
      return;
    }
    setSelectedFlightIds(new Set());
    setIsMultiEditing(false);
    refreshData();
    setDeleteConfirmTarget(null);
  };

  useEffect(() => {
    if (isBundling && selectedFlightIds.size > 0) {
      const selected = flights.filter(f => selectedFlightIds.has(f.flight.id));
      if (selected.length > 0) {
        const destinations = Array.from(new Set(selected.map(s => getCityName(s.flight.destination) || s.flight.destination))).filter(Boolean);
        if (destinations.length > 0) { setBundleLocation(destinations.join(', ')); setBundleName(`${destinations[0]} Getaway`); }
        else { setBundleLocation('Various'); setBundleName('New Flight Bundle'); }
      }
    }
  }, [isBundling, selectedFlightIds, flights]);

  const executeBundle = async () => {
    if (!bundleName.trim() || savingRef.current) return;
    const selectedRecords = flights.filter(f => selectedFlightIds.has(f.flight.id));
    if (selectedRecords.length === 0) return;
    savingRef.current = true;
    let oldest = '', newest = '';
    selectedRecords.forEach(r => {
      const d = r.flight.departureDate;
      if (d) { if (!oldest || d < oldest) oldest = d; if (!newest || d > newest) newest = d; }
    });
    const start = oldest || today();
    const end = newest || start;
    const newTripId = `trip-${Math.random().toString(36).substr(2, 9)}`;
    const bundledTransports: Transport[] = selectedRecords.map(r => ({ ...r.flight, itineraryId: `itinerary-${newTripId}` }));
    const tripsToUpdate: { [id: string]: Trip } = {};
    const independentToDelete: string[] = [];
    for (const r of selectedRecords) {
      const parentId = r.trip.id;
      if (isUnassigned(parentId)) independentToDelete.push(r.flight.id);
      else {
        if (!tripsToUpdate[parentId]) {
          const obj = trips.find(t => t.id === parentId);
          if (obj) tripsToUpdate[parentId] = JSON.parse(JSON.stringify(obj));
        }
        const mapped = tripsToUpdate[parentId];
        if (mapped && mapped.transports) mapped.transports = mapped.transports.filter(t => t.id !== r.flight.id);
      }
    }
    const newTrip: Trip & { isBundleOnly?: boolean; hideInPlanner?: boolean } = {
      id: newTripId, name: bundleName.trim(), location: bundleLocation.trim() || 'Various', startDate: start, endDate: end,
      status: 'Planning', participants: [], transports: bundledTransports,
      isBundleOnly: !createTripInPlanner, hideInPlanner: !createTripInPlanner,
    };
    setIsBundlingInFlight(true);
    try {
      await dataService.applyBatch({ newTrips: [newTrip], upsertTrips: Object.values(tripsToUpdate), deleteFlights: independentToDelete });
    } catch (err: any) {
      console.error('Bundling failed; no changes were saved', err);
      toast.error(`Could not create the bundle. Nothing was changed. ${err?.message || ''}`.trim());
      return;
    } finally {
      savingRef.current = false;
      setIsBundlingInFlight(false);
    }
    setSelectedFlightIds(new Set());
    setIsMultiEditing(false);
    setIsBundling(false);
    setBundleName('');
    setBundleLocation('');
    setCreateTripInPlanner(true);
    refreshData();
  };

  const executeUnbundle = async () => {
    if (!unbundleConfirmTarget) return;
    const selectedRecords = flights.filter(f => selectedFlightIds.has(f.flight.id) && !isUnassigned(f.trip.id));
    if (selectedRecords.length === 0) { setUnbundleConfirmTarget(null); return; }
    const tripsToUpdate: { [tripId: string]: { trip: Trip; remaining: Transport[] } } = {};
    const asIndependent: Transport[] = [];
    selectedRecords.forEach(r => {
      const id = r.trip.id;
      if (!tripsToUpdate[id]) tripsToUpdate[id] = { trip: r.trip, remaining: (r.trip.transports || []).filter(t => t.id !== r.flight.id) };
      else tripsToUpdate[id].remaining = tripsToUpdate[id].remaining.filter(t => t.id !== r.flight.id);
      asIndependent.push(r.flight);
    });
    const emptied: string[] = [];
    const remainingTrips: Trip[] = [];
    for (const id in tripsToUpdate) {
      const { trip, remaining } = tripsToUpdate[id];
      if (remaining.length === 0) emptied.push(id); else remainingTrips.push({ ...trip, transports: remaining });
    }
    try {
      await dataService.applyBatch({ upsertFlights: asIndependent.map(fl => ({ ...fl, itineraryId: '' })), upsertTrips: remainingTrips, deleteTrips: emptied });
    } catch (err: any) {
      console.error('Unbundling failed; no changes were saved', err);
      toast.error(`Could not unbundle these flights. Nothing was changed. ${err?.message || ''}`.trim());
      return;
    }
    setSelectedFlightIds(new Set());
    setIsMultiEditing(false);
    setUnbundleConfirmTarget(null);
    refreshData();
  };

  const openBundleEditor = (trip: { id: string; originalName?: string; name: string; location?: string; startDate?: string; endDate?: string }) => {
    setEditingBundleId(trip.id);
    setBundleForm({ name: trip.originalName || trip.name || '', location: trip.location || '', startDate: trip.startDate || '', endDate: trip.endDate || '' });
    setIsEditingBundle(true);
  };

  const saveBundleSettings = async () => {
    if (!editingBundleId) return;
    const target = trips.find(t => t.id === editingBundleId);
    if (!target) return;
    await dataService.updateTrip({
      ...target, name: bundleForm.name.trim(), location: bundleForm.location.trim(),
      startDate: bundleForm.startDate || target.startDate, endDate: bundleForm.endDate || target.endDate,
    });
    setIsEditingBundle(false);
    setEditingBundleId('');
    refreshData();
    window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
  };

  const disassembleBundle = async () => {
    if (!editingBundleId) return;
    const target = trips.find(t => t.id === editingBundleId);
    if (!target) return;
    const toMove = (target.transports || []).filter(t => !t.mode || t.mode === 'Flight').map(f => ({ ...f, tripId: 'unassigned', itineraryId: '' }));
    if (toMove.length > 0) await dataService.addFlights(toMove);
    await dataService.deleteTrip(editingBundleId);
    setIsEditingBundle(false);
    setEditingBundleId('');
    refreshData();
    window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
  };

  // ---------------- Whole-record writes (the New Flights page) ----------------

  /**
   * Saves a flight with every field it has (the form-based `saveFlight` rebuilds a flight from its own
   * fields, which would drop terminals, gates, aircraft and positions). Moves it between a trip and
   * "no trip" when `tripId` changed, and finds the map position of a place that has none yet.
   */
  const saveJourney = async (leg: Transport, tripId: string, original?: { flight: Transport; tripId: string }): Promise<void> => {
    const withPlaces: Transport = { ...leg };
    try {
      const { getCoordinates } = await import('../services/geocoding');
      if (withPlaces.origin?.trim() && (withPlaces.originLat == null || withPlaces.originGeoKey !== withPlaces.origin)) {
        const c = await getCoordinates(withPlaces.origin);
        if (c) { withPlaces.originLat = c.lat; withPlaces.originLng = c.lng; withPlaces.originGeoKey = withPlaces.origin; }
      }
      if (withPlaces.destination?.trim() && (withPlaces.destLat == null || withPlaces.destGeoKey !== withPlaces.destination)) {
        const c = await getCoordinates(withPlaces.destination);
        if (c) { withPlaces.destLat = c.lat; withPlaces.destLng = c.lng; withPlaces.destGeoKey = withPlaces.destination; }
      }
    } catch { /* positions are optional: the flight is saved without them */ }

    const target = tripId !== 'unassigned' ? trips.find(t => t.id === tripId) : undefined;
    if (tripId !== 'unassigned' && !target) throw new Error('That trip no longer exists.');
    const from = original?.tripId ?? 'unassigned';

    if (original && from === tripId) {
      if (tripId === 'unassigned') await dataService.updateFlight(withPlaces);
      else await dataService.updateTrip({ ...target!, transports: (target!.transports || []).map(t => (t.id === withPlaces.id ? withPlaces : t)) });
    } else if (original) {
      const move: { upsertTrips: Trip[]; deleteFlights: string[]; upsertFlights: Transport[] } = { upsertTrips: [], deleteFlights: [], upsertFlights: [] };
      if (from === 'unassigned') move.deleteFlights.push(original.flight.id);
      else {
        const old = trips.find(t => t.id === from);
        if (old) move.upsertTrips.push({ ...old, transports: (old.transports || []).filter(t => t.id !== original.flight.id) });
      }
      if (tripId === 'unassigned') move.upsertFlights.push(withPlaces);
      else move.upsertTrips.push({ ...target!, transports: [...(target!.transports || []), withPlaces] });
      await dataService.applyBatch(move);
    } else if (tripId === 'unassigned') {
      await dataService.addFlight(withPlaces);
    } else {
      await dataService.updateTrip({ ...target!, transports: [...(target!.transports || []), withPlaces] });
    }
    refreshData();
  };

  /** Moves flights to a trip, or to "no trip" (`'unassigned'`), in one transaction. */
  const assignJourneys = async (records: FlightRecord[], tripId: string): Promise<void> => {
    const target = tripId !== 'unassigned' ? trips.find(t => t.id === tripId) : undefined;
    if (tripId !== 'unassigned' && !target) throw new Error('That trip no longer exists.');
    const moving = records.filter(r => (isUnassigned(r.trip.id) ? 'unassigned' : r.trip.id) !== tripId);
    if (moving.length === 0) return;
    const deleteFlights: string[] = [];
    const touched = new Map<string, Trip>();
    const edit = (id: string) => {
      if (!touched.has(id)) { const t = trips.find(x => x.id === id); if (t) touched.set(id, { ...t, transports: [...(t.transports || [])] }); }
      return touched.get(id);
    };
    for (const r of moving) {
      if (isUnassigned(r.trip.id)) deleteFlights.push(r.flight.id);
      else { const t = edit(r.trip.id); if (t) t.transports = (t.transports || []).filter(x => x.id !== r.flight.id); }
    }
    const upsertFlights: Transport[] = [];
    if (tripId === 'unassigned') moving.forEach(r => upsertFlights.push({ ...r.flight, itineraryId: '' }));
    else { const t = edit(tripId)!; t.transports = [...(t.transports || []), ...moving.map(r => ({ ...r.flight }))]; }
    await dataService.applyBatch({ upsertTrips: Array.from(touched.values()), deleteFlights, upsertFlights });
    refreshData();
  };

  /**
   * Makes a trip from flights: named for where the first leg goes, spanning their dates, holding them. They
   * leave the independent list (or the trip they were on). Gives back the trip and a function that undoes it.
   */
  const createTripFromFlights = async (records: FlightRecord[]): Promise<{ tripId: string; name: string; undo: () => Promise<void> }> => {
    if (records.length === 0) throw new Error('Choose at least one flight.');
    const sorted = [...records].sort((a, b) => getFlightDepartureUtcDate(a.flight).getTime() - getFlightDepartureUtcDate(b.flight).getTime());
    const home = sorted[0].flight.origin;
    // Where the trip goes: the first place reached that is not where it started.
    const away = sorted.find(r => r.flight.destination !== home)?.flight.destination || sorted[0].flight.destination;
    const city = getCityName(away) || away;
    const start = sorted.map(r => r.flight.departureDate).filter(Boolean).sort()[0] || today();
    const end = sorted.map(r => r.flight.arrivalDate || r.flight.departureDate).filter(Boolean).sort().slice(-1)[0] || start;
    const id = `trip-${Math.random().toString(36).slice(2, 11)}`;
    const name = `Trip to ${city}`;
    const trip = {
      id, name, location: city, startDate: start, endDate: end,
      status: end < today() ? 'Past' : 'Planning',
      participants: currentUser ? [currentUser.id] : [],
      privacy: 'Private',
      locations: [{ id: `${id}-loc`, name: city, startDate: start, endDate: end }],
      transports: sorted.map(r => ({ ...r.flight, itineraryId: `itinerary-${id}` })),
      accommodations: [], activities: [],
    } as unknown as Trip;
    const snapshotFlights = sorted.filter(r => isUnassigned(r.trip.id)).map(r => r.flight);
    const touchedIds = Array.from(new Set(sorted.filter(r => !isUnassigned(r.trip.id)).map(r => r.trip.id)));
    const snapshotTrips = touchedIds.map(tid => trips.find(t => t.id === tid)).filter(Boolean).map(t => JSON.parse(JSON.stringify(t)) as Trip);
    // Add the trip first, then take the flights from where they were: a failure in between leaves a copy, never a loss.
    await dataService.addTrip(trip);
    const moved = new Set(sorted.map(r => r.flight.id));
    await dataService.applyBatch({
      deleteFlights: snapshotFlights.map(f => f.id),
      upsertTrips: snapshotTrips.map(t => ({ ...t, transports: (t.transports || []).filter(x => !moved.has(x.id)) })),
    });
    refreshData();
    return {
      tripId: id,
      name,
      undo: async () => {
        await dataService.deleteTrip(id);
        await dataService.applyBatch({ upsertTrips: snapshotTrips, upsertFlights: snapshotFlights });
        refreshData();
      },
    };
  };

  /** Deletes flights (from their trips, or the independent list) in one transaction. */
  const deleteJourneys = async (records: FlightRecord[]): Promise<void> => {
    const deleteFlights = records.filter(r => isUnassigned(r.trip.id)).map(r => r.flight.id);
    const byTrip = new Map<string, Trip>();
    for (const r of records) {
      if (isUnassigned(r.trip.id)) continue;
      const base = byTrip.get(r.trip.id) ?? trips.find(t => t.id === r.trip.id) ?? r.trip;
      byTrip.set(r.trip.id, { ...base, transports: (base.transports || []).filter(t => t.id !== r.flight.id) });
    }
    await dataService.applyBatch({ deleteFlights, upsertTrips: Array.from(byTrip.values()) });
    refreshData();
  };

  // ---------------- Derived ----------------

  const filteredFlights = useMemo(() => {
    const t0 = new Date();
    t0.setHours(0, 0, 0, 0);
    const q = searchQuery.toLowerCase();
    return flights.filter(item => {
      const f = item.flight;
      const hay = `${f.provider} ${f.identifier} ${f.origin} ${f.destination} ${item.trip.name} ${f.confirmationCode}`.toLowerCase();
      if (searchQuery && !hay.includes(q)) return false;
      const dep = getFlightDepartureUtcDate(f);
      if (timeFilter === 'upcoming' && dep < t0) return false;
      if (timeFilter === 'past' && dep >= t0) return false;
      if (classFilter !== 'all' && f.travelClass !== classFilter) return false;
      if (yearFilter !== 'all' && new Date(f.departureDate).getFullYear().toString() !== yearFilter) return false;
      if (colFilterFlight) {
        const airline = (getCarrierName(f.provider) || f.provider).toLowerCase();
        const num = (f.identifier || '').toLowerCase();
        const cq = colFilterFlight.toLowerCase();
        if (!airline.includes(cq) && !num.includes(cq)) return false;
      }
      if (colFilterSector) {
        const cq = colFilterSector.toLowerCase();
        const parts = [f.origin, f.destination, getCityName(f.origin), getCityName(f.destination)].map(s => (s || '').toLowerCase());
        if (!parts.some(p => p.includes(cq))) return false;
      }
      if (colFilterStatus !== 'all' && getFlightStatusTags(f).label.toLowerCase() !== colFilterStatus.toLowerCase()) return false;
      if (colFilterSeat !== 'all') {
        if (colFilterSeat === 'assigned' && !f.seatNumber) return false;
        if (colFilterSeat === 'unassigned' && f.seatNumber) return false;
        if (colFilterSeat === 'class-economy' && f.travelClass !== 'Economy') return false;
        if (colFilterSeat === 'class-premium' && f.travelClass !== 'Premium Economy') return false;
        if (colFilterSeat === 'class-business' && f.travelClass !== 'Business') return false;
        if (colFilterSeat === 'class-first' && f.travelClass !== 'First') return false;
      }
      if (colFilterTimingDay !== 'all') {
        const days: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
        const target = days[colFilterTimingDay.toLowerCase()];
        if (target !== undefined && new Date(f.departureDate).getDay() !== target) return false;
      }
      return true;
    });
  }, [flights, searchQuery, timeFilter, classFilter, yearFilter, colFilterFlight, colFilterSector, colFilterStatus, colFilterSeat, colFilterTimingDay]);

  type Group = { trip: Trip & { originalName?: string }; flights: Transport[]; isIndependent: boolean };

  /** Filtered flights grouped by trip (independent flights stand alone), legs sorted by the active sort. */
  const groupedFlights = useMemo(() => {
    const groups: Record<string, Group> = {};
    filteredFlights.forEach(item => {
      const key = item.trip.id === 'unassigned' ? `unassigned-${item.flight.id}` : item.trip.id;
      if (!groups[key]) groups[key] = { trip: { ...item.trip, id: key, originalName: item.trip.name, name: '' }, flights: [], isIndependent: key.startsWith('unassigned') };
      groups[key].flights.push(item.flight);
    });
    Object.values(groups).forEach(g => {
      g.flights.sort((a, b) => getFlightDepartureUtcDate(a).getTime() - getFlightDepartureUtcDate(b).getTime());
      g.trip.name = routeTitle(g.flights);
      // Within a bundle the legs follow the journey; the active sort applies when it is not the default timing sort.
      if (sortField !== 'timing' || sortSubOption !== 'departure') {
        g.flights.sort((a, b) => {
          const va = sortValue(a, sortField, sortSubOption);
          const vb = sortValue(b, sortField, sortSubOption);
          if (va < vb) return sortAsc ? -1 : 1;
          if (va > vb) return sortAsc ? 1 : -1;
          return 0;
        });
      }
    });
    return Object.values(groups).sort((a, b) => {
      const da = getFlightDepartureUtcDate(a.flights[0]).getTime();
      const db = getFlightDepartureUtcDate(b.flights[0]).getTime();
      if (sortField === 'timing') return sortAsc ? da - db : db - da;
      return timeFilter === 'past' ? db - da : da - db;
    });
  }, [filteredFlights, timeFilter, sortField, sortSubOption, sortAsc]);

  const groupedByYear = useMemo(() => {
    const map: Record<string, Group[]> = {};
    groupedFlights.forEach(g => {
      const yr = g.flights.length > 0 ? new Date(g.flights[0].departureDate).getFullYear().toString() : 'Unscheduled';
      (map[yr] = map[yr] || []).push(g);
    });
    return Object.keys(map)
      .sort((a, b) => {
        if (a === 'Unscheduled') return 1;
        if (b === 'Unscheduled') return -1;
        return sortField === 'timing' && sortAsc ? a.localeCompare(b) : b.localeCompare(a);
      })
      .map(year => ({ year, groups: map[year] }));
  }, [groupedFlights, sortField, sortAsc]);

  const nextUpcomingFlight = useMemo(() => {
    const t0 = new Date();
    t0.setHours(0, 0, 0, 0);
    const future = flights.filter(i => getFlightDepartureUtcDate(i.flight) >= t0);
    if (future.length === 0) return null;
    return [...future].sort((a, b) => getFlightDepartureUtcDate(a.flight).getTime() - getFlightDepartureUtcDate(b.flight).getTime())[0];
  }, [flights]);

  const metrics = useMemo(() => {
    const t0 = new Date();
    t0.setHours(0, 0, 0, 0);
    let upcoming = 0, past = 0, spend = 0, minutes = 0;
    const airlines: Record<string, number> = {};
    filteredFlights.forEach(i => {
      if (getFlightDepartureUtcDate(i.flight) >= t0) upcoming++; else past++;
      if (i.flight.cost) spend += i.flight.cost;
      if (i.flight.duration) minutes += i.flight.duration;
      if (i.flight.provider) airlines[i.flight.provider] = (airlines[i.flight.provider] || 0) + 1;
    });
    let topAirline = 'None', max = 0;
    Object.entries(airlines).forEach(([name, c]) => { if (c > max) { max = c; topAirline = name; } });
    return { total: filteredFlights.length, upcoming, past, spend, hours: Math.round(minutes / 60), topAirline };
  }, [filteredFlights]);

  const uniqueYears = useMemo(() => {
    const yrs = new Set<string>();
    flights.forEach(i => {
      if (i.flight.departureDate) {
        const yr = new Date(i.flight.departureDate).getFullYear().toString();
        if (yr && !isNaN(Number(yr))) yrs.add(yr);
      }
    });
    return Array.from(yrs).sort().reverse();
  }, [flights]);

  const monthlyData = useMemo(() => {
    const counts = new Array(12).fill(0) as number[];
    filteredFlights.forEach(i => {
      const d = new Date(i.flight.departureDate);
      if (!isNaN(d.getTime())) counts[d.getMonth()]++;
    });
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, i) => ({ month, flights: counts[i] }));
  }, [filteredFlights]);

  return {
    trips, users, currentUser, flights, loaded, loadError, workspaceSettings, refreshData,
    // filters
    searchQuery, setSearchQuery, timeFilter, setTimeFilter, classFilter, setClassFilter, yearFilter, setYearFilter,
    colFilterFlight, setColFilterFlight, colFilterSector, setColFilterSector, colFilterStatus, setColFilterStatus,
    colFilterSeat, setColFilterSeat, colFilterTimingDay, setColFilterTimingDay,
    sortField, setSortField, sortSubOption, setSortSubOption, sortAsc, setSortAsc, handleSortHeader, resetFilters, hasActiveFilters,
    // selection / bundling
    isMultiEditing, setIsMultiEditing, selectedFlightIds, setSelectedFlightIds,
    deleteConfirmTarget, setDeleteConfirmTarget, executeSingleDelete, executeMultiDelete,
    isBundling, setIsBundling, bundleName, setBundleName, bundleLocation, setBundleLocation, createTripInPlanner, setCreateTripInPlanner,
    isBundlingInFlight, executeBundle, unbundleConfirmTarget, setUnbundleConfirmTarget, executeUnbundle,
    isEditingBundle, setIsEditingBundle, bundleForm, setBundleForm, openBundleEditor, saveBundleSettings, disassembleBundle, setEditingBundleId,
    // form
    isEditing, setIsEditing, editingFlight, form, patchForm, openFlightForm, saveFlight, saveDraft, flightFormError, isSavingFlight,
    showManualFields, setShowManualFields, searchedFlights, setSearchedFlights, isRouteSearching, routeSearchError, searchRouteFlights, selectRouteFlight,
    // whole-record writes
    saveJourney, assignJourneys, deleteJourneys, createTripFromFlights,
    // derived
    filteredFlights, groupedFlights, groupedByYear, nextUpcomingFlight, metrics, uniqueYears, monthlyData,
  };
};
