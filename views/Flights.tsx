import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Filter, Plus, Calendar, MapPin, Trash2, Edit2, Check, Square, CheckSquare, Edit3, ChevronRight,
  ArrowRight, Plane, Landmark, Award, Clock, DollarSign, BarChart2, Briefcase, FileText, Compass, Heart, HelpCircle, RefreshCw, Upload, Download, Tag, UserCheck, Star, Sparkles, Grid, List,
  ArrowUpRight, ArrowDownLeft, FolderPlus, FolderMinus
} from 'lucide-react';
import { Card, Button, Input, Select, Badge, TimeInput } from '../components/ui';
import { Trip, Transport, User, Carrier } from '../types';
import { getMerchantLogoUrl } from '../utils/brandfetch';
import { dataService } from '../services/mockDb';
import { FlightyPassport } from '../components/FlightyPassport';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { getCityName, getCarrierName, getFlightStatusTags, getFlightDepartureUtcDate, getFlightArrivalUtcDate } from '../utils/flightData';

const SeatLayoutOverlay = ({ cabinClass, seatNumber }: { cabinClass: string, seatNumber: string }) => {
  const match = (seatNumber || '').trim().toUpperCase().match(/^(\d+)([A-Z])$/);
  let centerRow = 12;
  let targetCol = '';
  
  if (match) {
    centerRow = parseInt(match[1], 10);
    targetCol = match[2];
  } else if (cabinClass === 'First' || cabinClass === 'Business') {
    centerRow = 2;
  } else if (cabinClass === 'Premium Economy') {
    centerRow = 10;
  } else {
    centerRow = 22;
  }

  const startRow = Math.max(1, centerRow - 1);
  const rows = [startRow, startRow + 1, startRow + 2];

  let cols = ['A', 'B', 'C', '', 'D', 'E', 'F'];
  if (cabinClass === 'First' || cabinClass === 'Business') {
    cols = ['A', '', 'D', 'G', '', 'K'];
  } else if (cabinClass === 'Premium Economy') {
    cols = ['A', 'C', '', 'D', 'E', 'F', 'G', '', 'H', 'K'];
  }

  return (
    <div className="bg-white/40 dark:bg-zinc-900/50 w-full p-4 rounded-xl border border-zinc-200 dark:border-white/10 flex flex-col items-center col-span-full">
       <span className="text-[10px] font-black uppercase text-zinc-500 mb-2">Cabin Seat Map Preview</span>
       <div className="flex gap-4">
         <div className="flex flex-col gap-1 mt-4">
           {rows.map(r => (
             <div key={r} className="h-6 flex items-center justify-end text-[9px] font-bold text-zinc-400 w-4">{r}</div>
           ))}
         </div>
         <div className="flex flex-col gap-1">
           <div className="flex gap-1 mb-1 px-1">
              {cols.map((c, i) => (
                <div key={i} className={`w-6 text-center text-[9px] font-bold text-zinc-400 ${!c && 'w-3'}`}>{c}</div>
              ))}
           </div>
           {rows.map((rowNum) => (
              <div key={rowNum} className="flex gap-1 items-center justify-center px-1">
                 {cols.map((colStr, cIdx) => {
                   if (!colStr) return <div key={cIdx} className="w-3" />; // Aisle
                   const isTarget = rowNum === centerRow && colStr === targetCol;
                   return (
                     <div 
                       key={cIdx} 
                       className={`w-6 h-6 rounded border flex items-center justify-center text-[8px] font-bold ${
                         isTarget 
                           ? 'bg-blue-500 text-white border-blue-600 shadow-md ring-2 ring-blue-500/30' 
                           : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 border-zinc-300 dark:border-zinc-700/50'
                       }`}
                     >
                       {isTarget && <Star className="w-3 h-3 fill-white" />}
                     </div>
                   );
                 })}
              </div>
           ))}
         </div>
       </div>
    </div>
  );
};

const AirlineLogo: React.FC<{ provider?: string, fallback: React.ReactNode }> = ({ provider, fallback }) => {
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [attempt, setAttempt] = useState(0);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [brandfetchApiKey, setBrandfetchApiKey] = useState<string>('');

  useEffect(() => {
    dataService.getWorkspaceSettings().then(settings => {
      if (settings) {
        if (settings.carriers) {
          setCarriers(settings.carriers);
        }
        if (settings.brandfetchApiKey) {
          setBrandfetchApiKey(settings.brandfetchApiKey);
        }
      }
    }).catch(e => console.warn("Failed to load carriers for AirlineLogo:", e));
  }, []);

  const getAirlineLogoUrl = (airlineName: string, currentAttempt: number, currentCarriers: Carrier[]): string => {
    let domain = '';
    
    if (currentCarriers && currentCarriers.length > 0) {
      const custom = currentCarriers.find(
        (c: any) => c.code?.toLowerCase().trim() === airlineName.toLowerCase().trim() ||
                    c.name?.toLowerCase().trim() === airlineName.toLowerCase().trim()
      );
      if (custom && custom.domain) {
        domain = custom.domain.trim();
      }
    }

    if (!domain) {
      try {
        const stored = localStorage.getItem('wandergrid_settings');
        if (stored) {
          const settings = JSON.parse(stored);
          if (settings.carriers && Array.isArray(settings.carriers)) {
            const custom = settings.carriers.find(
              (c: any) => c.code?.toLowerCase().trim() === airlineName.toLowerCase().trim() ||
                          c.name?.toLowerCase().trim() === airlineName.toLowerCase().trim()
            );
            if (custom && custom.domain) {
              domain = custom.domain.trim();
            }
          }
        }
      } catch (e) {
        console.warn("Error loading custom carriers logo from localStorage:", e);
      }
    }

    if (!domain) {
      const cleaned = airlineName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const mappings: Record<string, string> = {
        'deltaairlines': 'delta.com', 'delta': 'delta.com', 'americanairlines': 'aa.com', 'american': 'aa.com',
        'unitedairlines': 'united.com', 'united': 'united.com', 'southwestairlines': 'southwest.com', 'southwest': 'southwest.com',
        'britishairways': 'britishairways.com', 'emirates': 'emirates.com', 'qatarairways': 'qatarairways.com', 'qatar': 'qatarairways.com',
        'lufthansa': 'lufthansa.com', 'airfrance': 'airfrance.com', 'klm': 'klm.com', 'singaporeairlines': 'singaporeair.com',
        'cathaypacific': 'cathaypacific.com', 'ana': 'ana.co.jp', 'japanairlines': 'jal.com', 'jal': 'jal.com',
        'ryanair': 'ryanair.com', 'easyjet': 'easyjet.com'
      };
      domain = mappings[cleaned] || `${cleaned}.com`;
    }

    // Convert carriers list to record of overrides
    const overrides: Record<string, string> = {};
    if (currentCarriers && Array.isArray(currentCarriers)) {
      currentCarriers.forEach(c => {
        if (c.code) overrides[c.code.toLowerCase().trim()] = c.domain;
        if (c.name) overrides[c.name.toLowerCase().trim()] = c.domain;
      });
    }

    // Try to build a fallback steps queue
    const steps: string[] = [];
    
    if (brandfetchApiKey) {
      const bfUrl = getMerchantLogoUrl(airlineName, brandfetchApiKey, overrides, { type: 'icon', fallback: '404' });
      if (bfUrl) steps.push(bfUrl);
    }
    
    steps.push(`https://logo.clearbit.com/${domain}`);
    steps.push(`https://asset.brandfetch.io/${domain}/logo?theme=light`);
    steps.push(`https://www.google.com/s2/favicons?sz=128&domain=${domain}`);

    return steps[currentAttempt] || '';
  };

  useEffect(() => {
    if (provider) {
      setLogoUrl(getAirlineLogoUrl(provider, 0, carriers));
      setAttempt(0);
    }
  }, [provider, carriers, brandfetchApiKey]);

  const handleError = () => {
    if (provider && attempt < 3) {
      const nextAttempt = attempt + 1;
      setAttempt(nextAttempt);
      setLogoUrl(getAirlineLogoUrl(provider, nextAttempt, carriers));
    } else {
      setLogoUrl('__failed__');
    }
  };

  if (!provider || logoUrl === '__failed__') return <>{fallback}</>;

  return (
    <img 
      src={logoUrl || getAirlineLogoUrl(provider, 0, carriers)} 
      alt={provider} 
      className="w-full h-full object-contain" 
      referrerPolicy="no-referrer"
      onError={handleError}
    />
  );
};

const SeatMap: React.FC<{ assignedSeat: string }> = ({ assignedSeat }) => {
  const match = assignedSeat.match(/(\d+)([A-Z])/i);
  let assignedRow = -1;
  let assignedLetter = '';

  if (match) {
    assignedRow = parseInt(match[1]);
    assignedLetter = match[2].toUpperCase();
  }

  const startRow = Math.max(1, assignedRow - 1);
  const endRow = assignedRow > 0 ? assignedRow + 1 : 3;

  return (
    <div className="flex flex-col gap-1 items-center bg-gray-50 dark:bg-zinc-800 p-2 rounded-xl border border-gray-200/50 dark:border-white/5 w-max">
      {Array.from({ length: endRow - startRow + 1 }, (_, i) => startRow + i).map(row => (
        <div key={row} className="flex gap-2 items-center">
          <div className="flex gap-1">
            {['A', 'B', 'C'].map(letter => {
              const isAssigned = row === assignedRow && letter === assignedLetter;
              return (
                <div 
                  key={letter} 
                  className={`w-3 h-4 rounded-sm flex items-center justify-center text-[7px] font-bold ${
                    isAssigned 
                      ? 'bg-emerald-500 text-white shadow-md' 
                      : 'bg-white dark:bg-zinc-700 text-gray-400 border border-gray-200 dark:border-zinc-600'
                  }`}
                >
                  {isAssigned ? letter : ''}
                </div>
              )
            })}
          </div>
          <div className="w-2.5 text-[8px] text-center font-mono text-gray-400">{row}</div>
          <div className="flex gap-1">
            {['D', 'E', 'F'].map(letter => {
              const isAssigned = row === assignedRow && letter === assignedLetter;
              return (
                <div 
                  key={letter} 
                  className={`w-3 h-4 rounded-sm flex items-center justify-center text-[7px] font-bold ${
                    isAssigned 
                      ? 'bg-emerald-500 text-white shadow-md' 
                      : 'bg-white dark:bg-zinc-700 text-gray-400 border border-gray-200 dark:border-zinc-600'
                  }`}
                >
                  {isAssigned ? letter : ''}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

interface FlightsProps {
  onTripClick?: (tripId: string) => void;
}

export const Flights: React.FC<FlightsProps> = ({ onTripClick }) => {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [flights, setFlights] = useState<{ flight: Transport; trip: Trip }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all' | 'upcoming' | 'past'>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [yearFilter, setYearFilter] = useState<string>('all');

  // Column specific filtering states
  const [colFilterFlight, setColFilterFlight] = useState('');
  const [colFilterSector, setColFilterSector] = useState('');
  const [colFilterStatus, setColFilterStatus] = useState('all');
  const [colFilterSeat, setColFilterSeat] = useState('all');
  const [colFilterTimingDay, setColFilterTimingDay] = useState<string>('all');
  const [activeFilterPopup, setActiveFilterPopup] = useState<'flight' | 'sector' | 'status' | 'seat' | 'timing' | null>(null);

  // Interactive sorting states
  const [sortField, setSortField] = useState<'flight' | 'sector' | 'status' | 'timing' | 'seat'>('timing');
  const [sortSubOption, setSortSubOption] = useState<string>('default');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Multi-edit states
  const [isMultiEditing, setIsMultiEditing] = useState<boolean>(false);
  const [selectedFlightIds, setSelectedFlightIds] = useState<Set<string>>(new Set());

  // Delete confirm modal states
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    type: 'single' | 'multi';
    singleRecord?: { flight: Transport; trip: Trip };
    multiCount?: number;
  } | null>(null);

  // Bundling states
  const [isBundling, setIsBundling] = useState<boolean>(false);
  const [bundleName, setBundleName] = useState<string>('');
  const [bundleLocation, setBundleLocation] = useState<string>('');
  const [createTripInPlanner, setCreateTripInPlanner] = useState<boolean>(true);
  const [unbundleConfirmTarget, setUnbundleConfirmTarget] = useState<number | null>(null);

  const handleHeaderSort = (field: 'flight' | 'sector' | 'status' | 'timing' | 'seat') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortSubOption('default');
      setSortAsc(true);
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setTimeFilter('all');
    setClassFilter('all');
    setYearFilter('all');
    setColFilterFlight('');
    setColFilterSector('');
    setColFilterStatus('all');
    setColFilterSeat('all');
    setColFilterTimingDay('all');
    setSortSubOption('default');
  };

  const getSortIcon = (field: 'flight' | 'sector' | 'status' | 'timing' | 'seat') => {
    if (sortField !== field) return <span className="text-zinc-300 dark:text-zinc-700 ml-1">↕</span>;
    return sortAsc ? <span className="text-blue-500 ml-1 font-bold">↑</span> : <span className="text-blue-500 ml-1 font-bold">↓</span>;
  };

  const renderSortableHeader = (label: string, field: 'flight' | 'sector' | 'status' | 'timing' | 'seat') => {
    return (
      <button
        onClick={() => handleHeaderSort(field)}
        className="flex items-center gap-1 hover:text-blue-500 font-mono font-black uppercase tracking-widest cursor-pointer select-none border-0 bg-transparent text-left focus:outline-none p-0"
      >
        <span>{label}</span>
        {getSortIcon(field)}
      </button>
    );
  };

  // Flight creation / edit modal state
  const [isEditing, setIsEditing] = useState(false);
  const [editingFlight, setEditingFlight] = useState<{ flight: Transport; tripId: string } | null>(null);
  
  // Custom form state for a flight leg
  const [formTripId, setFormTripId] = useState<string>('');
  const [formNewTripName, setFormNewTripName] = useState<string>('');
  const [formAirline, setFormAirline] = useState('');
  const [formFlightNum, setFormFlightNum] = useState('');
  const [formConfirmation, setFormConfirmation] = useState('');
  const [formOrigin, setFormOrigin] = useState('');
  const [formDestination, setFormDestination] = useState('');
  const [formDepartureDate, setFormDepartureDate] = useState('');
  const [formDepartureTime, setFormDepartureTime] = useState('10:00');
  const [formArrivalDate, setFormArrivalDate] = useState('');
  const [formArrivalTime, setFormArrivalTime] = useState('14:00');
  const [formDuration, setFormDuration] = useState<number>(120);
  const [formClass, setFormClass] = useState<'Economy' | 'Premium Economy' | 'Business' | 'First'>('Economy');
  const [formSeatNumber, setFormSeatNumber] = useState('');
  const [formSeatType, setFormSeatType] = useState<'Window' | 'Aisle' | 'Middle'>('Window');
  const [formCost, setFormCost] = useState<string>('');
  const [formActualDepartureTime, setFormActualDepartureTime] = useState('');
  const [formActualArrivalTime, setFormActualArrivalTime] = useState('');

  // State to force-refresh display names when dynamic AviationStack lookups resolve
  const [, setMetadataVersion] = useState(0);

  useEffect(() => {
    const handleMetadataResolved = () => {
      setMetadataVersion(v => v + 1);
    };
    window.addEventListener('wandergrid_metadata_resolved', handleMetadataResolved);
    return () => {
      window.removeEventListener('wandergrid_metadata_resolved', handleMetadataResolved);
    };
  }, []);

  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = () => {
    Promise.all([
      dataService.getTrips(),
      dataService.getUsers(),
      dataService.getFlights()
    ]).then(([t, u, independentFlights]) => {
      setTrips(t);
      setUsers(u);

      // Extract all transports that are Flights
      const extracted: { flight: Transport; trip: Trip }[] = [];
      t.forEach((trip) => {
        if (trip.transports) {
          trip.transports.forEach((transport) => {
            if (transport.mode === 'Flight') {
              extracted.push({ flight: transport, trip });
            }
          });
        }
      });
      
      const onlyFlights = (independentFlights || []).filter(fl => fl.mode === 'Flight');
      const unassignedTrip: Trip = {
          id: 'unassigned',
          name: 'Independent Flights',
          location: 'Various',
          startDate: '',
          endDate: '',
          status: 'Planning',
          participants: [],
          transports: onlyFlights
      };

      onlyFlights.forEach(fl => {
          extracted.push({ flight: fl, trip: unassignedTrip });
      });

      // Sort by departureDate ascending
      extracted.sort((a, b) => {
        const dateA = getFlightDepartureUtcDate(a.flight);
        const dateB = getFlightDepartureUtcDate(b.flight);
        return dateB.getTime() - dateA.getTime(); // Newest first
      });
      setFlights(extracted);
    });
  };

  // Set up form state for edit or new
  const openFlightForm = (record?: { flight: Transport; trip: Trip }) => {
    if (record) {
      const parentTripId = record.trip.id.startsWith('unassigned') ? 'unassigned' : record.trip.id;
      setEditingFlight({ flight: record.flight, tripId: parentTripId });
      setFormTripId(parentTripId);
      setFormNewTripName('');
      setFormAirline(record.flight.provider || '');
      setFormFlightNum(record.flight.identifier || '');
      setFormConfirmation(record.flight.confirmationCode || '');
      setFormOrigin(record.flight.origin || '');
      setFormDestination(record.flight.destination || '');
      setFormDepartureDate(record.flight.departureDate || '');
      setFormDepartureTime(record.flight.departureTime || '10:00');
      setFormArrivalDate(record.flight.arrivalDate || record.flight.departureDate || '');
      setFormArrivalTime(record.flight.arrivalTime || '14:00');
      setFormDuration(record.flight.duration || 120);
      setFormClass(record.flight.travelClass || 'Economy');
      setFormSeatNumber(record.flight.seatNumber || '');
      setFormSeatType(record.flight.seatType || 'Window');
      setFormCost(record.flight.cost ? record.flight.cost.toString() : '');
      setFormActualDepartureTime(record.flight.actualDepartureTime || '');
      setFormActualArrivalTime(record.flight.actualArrivalTime || '');
    } else {
      setEditingFlight(null);
      const draftStr = localStorage.getItem('flightFormDraft');
      let loaded = false;
      if (draftStr) {
        try {
          const draft = JSON.parse(draftStr);
          if (Object.keys(draft).length > 0) {
             setFormTripId(draft.formTripId || 'unassigned');
             setFormNewTripName(draft.formNewTripName || '');
             setFormAirline(draft.formAirline || '');
             setFormFlightNum(draft.formFlightNum || '');
             setFormConfirmation(draft.formConfirmation || '');
             setFormOrigin(draft.formOrigin || '');
             setFormDestination(draft.formDestination || '');
             const todayString = new Date().toISOString().split('T')[0];
             setFormDepartureDate(draft.formDepartureDate || todayString);
             setFormDepartureTime(draft.formDepartureTime || '10:00');
             setFormArrivalDate(draft.formArrivalDate || todayString);
             setFormArrivalTime(draft.formArrivalTime || '14:00');
             setFormDuration(draft.formDuration || 120);
             setFormClass(draft.formClass || 'Economy');
             setFormSeatNumber(draft.formSeatNumber || '');
             setFormSeatType(draft.formSeatType || 'Window');
             setFormCost(draft.formCost || '');
             setFormActualDepartureTime(draft.formActualDepartureTime || '');
             setFormActualArrivalTime(draft.formActualArrivalTime || '');
             loaded = true;
          }
        } catch (e) {
          // ignore
        }
      }
      if (!loaded) {
        setFormTripId('unassigned');
        setFormNewTripName('');
        setFormAirline('');
        setFormFlightNum('');
        setFormConfirmation('');
        setFormOrigin('');
        setFormDestination('');
        const todayString = new Date().toISOString().split('T')[0];
        setFormDepartureDate(todayString);
        setFormDepartureTime('10:00');
        setFormArrivalDate(todayString);
        setFormArrivalTime('14:00');
        setFormDuration(120);
        setFormClass('Economy');
        setFormSeatNumber('');
        setFormSeatType('Window');
        setFormCost('');
        setFormActualDepartureTime('');
        setFormActualArrivalTime('');
      }
    }
    setIsEditing(true);
  };

  const handleSaveFlight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formOrigin || !formDestination || !formDepartureDate) {
      alert("Please fill in Departure, Arrival, Airfields, and Dates.");
      return;
    }

    try {
      let targetTrip: Trip | undefined;

      if (formTripId !== 'unassigned') {
        const found = trips.find(t => t.id === formTripId);
        if (!found) throw new Error("Selected trip not found.");
        targetTrip = found;
      }

      const costNum = formCost ? parseFloat(formCost) : undefined;
      const flightPayload: Transport = {
        id: editingFlight ? editingFlight.flight.id : Math.random().toString(36).substr(2, 9),
        itineraryId: editingFlight ? editingFlight.flight.itineraryId : Math.random().toString(36).substr(2, 9),
        type: 'One-Way',
        mode: 'Flight',
        provider: formAirline,
        identifier: formFlightNum.toUpperCase(),
        confirmationCode: formConfirmation.toUpperCase(),
        origin: formOrigin.toUpperCase(),
        destination: formDestination.toUpperCase(),
        departureDate: formDepartureDate,
        departureTime: formDepartureTime,
        arrivalDate: formArrivalDate || formDepartureDate,
        arrivalTime: formArrivalTime,
        actualDepartureTime: formActualDepartureTime || undefined,
        actualArrivalTime: formActualArrivalTime || undefined,
        duration: formDuration,
        travelClass: formClass,
        seatNumber: formSeatNumber,
        seatType: formSeatType,
        cost: isNaN(costNum as number) ? undefined : costNum
      };

      if (editingFlight) {
        // We might be changing the trip as well as the flight leg
        if (editingFlight.tripId !== formTripId) {
          // Remove from old location
          if (editingFlight.tripId === 'unassigned') {
             await dataService.deleteFlight(editingFlight.flight.id);
          } else {
             const oldTrip = trips.find(t => t.id === editingFlight.tripId);
             if (oldTrip && oldTrip.transports) {
               oldTrip.transports = oldTrip.transports.filter(t => t.id !== editingFlight.flight.id);
               await dataService.updateTrip(oldTrip);
             }
          }
          // Add to new location
          if (formTripId === 'unassigned') {
             await dataService.addFlight(flightPayload);
          } else if (targetTrip) {
             if (!targetTrip.transports) targetTrip.transports = [];
             targetTrip.transports.push(flightPayload);
             await dataService.updateTrip(targetTrip);
          }
        } else {
          // Editing in place
          if (formTripId === 'unassigned') {
             await dataService.updateFlight(flightPayload);
          } else if (targetTrip) {
             if (!targetTrip.transports) targetTrip.transports = [];
             const idx = targetTrip.transports.findIndex(t => t.id === editingFlight.flight.id);
             if (idx >= 0) {
               targetTrip.transports[idx] = flightPayload;
             } else {
               targetTrip.transports.push(flightPayload);
             }
             await dataService.updateTrip(targetTrip);
          }
        }
      } else {
        // Create new flight payload
        if (formTripId === 'unassigned') {
            await dataService.addFlight(flightPayload);
        } else if (targetTrip) {
            if (!targetTrip.transports) targetTrip.transports = [];
            targetTrip.transports.push(flightPayload);
            await dataService.updateTrip(targetTrip);
        }
      }

      if (!editingFlight) {
        localStorage.removeItem('flightFormDraft');
      }
      setIsEditing(false);
      setEditingFlight(null);
      refreshData();
    } catch (e) {
      console.error(e);
      alert("Failed to save flight records.");
    }
  };

  const handleDeleteFlight = (flightRecord: { flight: Transport; trip: Trip }) => {
    setDeleteConfirmTarget({
      type: 'single',
      singleRecord: flightRecord
    });
  };

  const executeSingleDelete = async (flightRecord: { flight: Transport; trip: Trip }) => {
    if (flightRecord.trip.id === 'unassigned' || flightRecord.trip.id.startsWith('unassigned')) {
       await dataService.deleteFlight(flightRecord.flight.id);
    } else {
       const targetTrip = { ...flightRecord.trip };
       if (targetTrip.transports) {
         targetTrip.transports = targetTrip.transports.filter(t => t.id !== flightRecord.flight.id);
         await dataService.updateTrip(targetTrip);
       }
    }
    refreshData();
    setDeleteConfirmTarget(null);
  };

  const executeMultiDelete = async () => {
    const idsToDelete = Array.from(selectedFlightIds);
    for (const fid of idsToDelete) {
       const record = flights.find(f => f.flight.id === fid);
       if (record) {
         if (record.trip.id === 'unassigned' || record.trip.id.startsWith('unassigned')) {
            await dataService.deleteFlight(fid);
         } else {
            const targetTrip = { ...record.trip };
            if (targetTrip.transports) {
              targetTrip.transports = targetTrip.transports.filter(t => t.id !== fid);
              await dataService.updateTrip(targetTrip);
            }
         }
       }
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
        const destinations = Array.from(new Set(selected.map(s => getCityName(s.flight.destination) || s.flight.destination)))
          .filter(Boolean);
        if (destinations.length > 0) {
          setBundleLocation(destinations.join(', '));
          setBundleName(`${destinations[0]} Getaway`);
        } else {
          setBundleLocation('Various');
          setBundleName('New Flight Bundle');
        }
      }
    }
  }, [isBundling, selectedFlightIds, flights]);

  const executeBundle = async () => {
    if (!bundleName.trim()) return;
    
    // Find all selected flight objects
    const selectedRecords = flights.filter(f => selectedFlightIds.has(f.flight.id));
    if (selectedRecords.length === 0) return;

    // Determine startDate and endDate from selected flights
    let oldestDate = '';
    let newestDate = '';
    selectedRecords.forEach(r => {
      const depDate = r.flight.departureDate;
      if (depDate) {
        if (!oldestDate || depDate < oldestDate) oldestDate = depDate;
        if (!newestDate || depDate > newestDate) newestDate = depDate;
      }
    });

    const finalStartDate = oldestDate || new Date().toISOString().split('T')[0];
    const finalEndDate = newestDate || finalStartDate;

    // Create new Trip / Bundle representation
    const newTripId = `trip-${Math.random().toString(36).substr(2, 9)}`;
    
    // Convert selected flight records to Transport list, ensuring their itineraryId matches the new trip!
    const bundledTransports: Transport[] = selectedRecords.map(r => ({
      ...r.flight,
      itineraryId: `itinerary-${newTripId}`
    }));

    // Step 1: Clean up old references
    const tripsToUpdateMap: { [id: string]: Trip } = {};
    const independentFlightsToDelete: string[] = [];

    for (const r of selectedRecords) {
      const parentId = r.trip.id;
      if (parentId === 'unassigned' || parentId.startsWith('unassigned')) {
        independentFlightsToDelete.push(r.flight.id);
      } else {
        if (!tripsToUpdateMap[parentId]) {
          const tripObj = trips.find(t => t.id === parentId);
          if (tripObj) {
            tripsToUpdateMap[parentId] = JSON.parse(JSON.stringify(tripObj));
          }
        }
        const mappedTrip = tripsToUpdateMap[parentId];
        if (mappedTrip && mappedTrip.transports) {
          mappedTrip.transports = mappedTrip.transports.filter(t => t.id !== r.flight.id);
        }
      }
    }

    // Process old trip updates sequentially
    for (const tripId in tripsToUpdateMap) {
      await dataService.updateTrip(tripsToUpdateMap[tripId]);
    }

    // Process independent deletions
    for (const fid of independentFlightsToDelete) {
      await dataService.deleteFlight(fid);
    }

    // Step 2: Save the new bundle as a Trip!
    const newTrip: Trip & { isBundleOnly?: boolean; hideInPlanner?: boolean } = {
      id: newTripId,
      name: bundleName.trim(),
      location: bundleLocation.trim() || 'Various',
      startDate: finalStartDate,
      endDate: finalEndDate,
      status: 'Planning',
      participants: [],
      transports: bundledTransports,
      isBundleOnly: !createTripInPlanner,
      hideInPlanner: !createTripInPlanner
    };

    await dataService.addTrip(newTrip);

    // Reset everything
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

    // Find all selected flights that are part of a bundle
    const selectedRecords = flights.filter(f => 
      selectedFlightIds.has(f.flight.id) && 
      f.trip.id !== 'unassigned' && 
      !f.trip.id.startsWith('unassigned')
    );

    if (selectedRecords.length === 0) {
      setUnbundleConfirmTarget(null);
      return;
    }

    // Step 1: Group by trip id so we can update trips
    const tripsToUpdate: { [tripId: string]: { trip: Trip; remainingTransports: Transport[] } } = {};
    const flightsToAddAsIndependent: Transport[] = [];

    selectedRecords.forEach(r => {
      const tripId = r.trip.id;
      if (!tripsToUpdate[tripId]) {
        tripsToUpdate[tripId] = {
          trip: r.trip,
          remainingTransports: (r.trip.transports || []).filter(t => t.id !== r.flight.id)
        };
      } else {
        tripsToUpdate[tripId].remainingTransports = tripsToUpdate[tripId].remainingTransports.filter(t => t.id !== r.flight.id);
      }
      
      flightsToAddAsIndependent.push(r.flight);
    });

    // Step 2: Save independent flights to DB
    for (const fl of flightsToAddAsIndependent) {
      const independentFlight = {
        ...fl,
        itineraryId: '' // Clear custom grouping itinerary ID
      };
      await dataService.addFlight(independentFlight);
    }

    // Step 3: Update or delete the parent trips
    for (const tripId in tripsToUpdate) {
      const { trip, remainingTransports } = tripsToUpdate[tripId];
      if (remainingTransports.length === 0) {
        await dataService.deleteTrip(tripId);
      } else {
        const updatedTrip = {
          ...trip,
          transports: remainingTransports
        };
        await dataService.updateTrip(updatedTrip);
      }
    }

    // Reset state & refresh
    setSelectedFlightIds(new Set());
    setIsMultiEditing(false);
    setUnbundleConfirmTarget(null);
    refreshData();
  };

  // Handle smart fuzzy search and filters
  const filteredFlights = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return flights.filter(item => {
      // Search Box filter
      const searchStr = `${item.flight.provider} ${item.flight.identifier} ${item.flight.origin} ${item.flight.destination} ${item.trip.name} ${item.flight.confirmationCode}`.toLowerCase();
      if (searchQuery && !searchStr.includes(searchQuery.toLowerCase())) {
        return false;
      }

      // Time range filter
      const deptDate = getFlightDepartureUtcDate(item.flight);
      if (timeFilter === 'upcoming' && deptDate < today) return false;
      if (timeFilter === 'past' && deptDate >= today) return false;

      // Cabin filter
      if (classFilter !== 'all' && item.flight.travelClass !== classFilter) return false;

      // Year filter
      if (yearFilter !== 'all') {
        const yr = new Date(item.flight.departureDate).getFullYear().toString();
        if (yr !== yearFilter) return false;
      }

      // Column Specific Filters
      if (colFilterFlight) {
        const airlineName = (getCarrierName(item.flight.provider) || item.flight.provider).toLowerCase();
        const flightNum = (item.flight.identifier || '').toLowerCase();
        const q = colFilterFlight.toLowerCase();
        if (!airlineName.includes(q) && !flightNum.includes(q)) {
          return false;
        }
      }

      if (colFilterSector) {
        const origin = (item.flight.origin || '').toLowerCase();
        const destination = (item.flight.destination || '').toLowerCase();
        const originCity = (getCityName(item.flight.origin) || '').toLowerCase();
        const destCity = (getCityName(item.flight.destination) || '').toLowerCase();
        const q = colFilterSector.toLowerCase();
        if (!origin.includes(q) && !destination.includes(q) && !originCity.includes(q) && !destCity.includes(q)) {
          return false;
        }
      }

      if (colFilterStatus !== 'all') {
        const tags = getFlightStatusTags(item.flight);
        if (tags.label.toLowerCase() !== colFilterStatus.toLowerCase()) {
          return false;
        }
      }

      if (colFilterSeat !== 'all') {
        if (colFilterSeat === 'assigned' && !item.flight.seatNumber) return false;
        if (colFilterSeat === 'unassigned' && item.flight.seatNumber) return false;
        if (colFilterSeat === 'class-economy' && item.flight.travelClass !== 'Economy') return false;
        if (colFilterSeat === 'class-premium' && item.flight.travelClass !== 'Premium Economy') return false;
        if (colFilterSeat === 'class-business' && item.flight.travelClass !== 'Business') return false;
        if (colFilterSeat === 'class-first' && item.flight.travelClass !== 'First') return false;
      }

      // Timing Day Filter
      if (colFilterTimingDay !== 'all') {
        const dayOfWeek = new Date(item.flight.departureDate).getDay(); // 0-6
        const daysMap: Record<string, number> = {
          'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6
        };
        const targetDay = daysMap[colFilterTimingDay.toLowerCase()];
        if (targetDay !== undefined && dayOfWeek !== targetDay) {
          return false;
        }
      }

      return true;
    });
  }, [flights, searchQuery, timeFilter, classFilter, yearFilter, colFilterFlight, colFilterSector, colFilterStatus, colFilterSeat, colFilterTimingDay]);

  const groupedFlights = useMemo(() => {
    const groups: { [tripId: string]: { trip: Trip; flights: Transport[]; outbound: Transport[]; returnLegs: Transport[] } } = {};
    filteredFlights.forEach(item => {
      let key = item.trip.id;
      if (key === 'unassigned') {
        const yr = item.flight.departureDate ? new Date(item.flight.departureDate).getFullYear().toString() : 'Unscheduled';
        key = `unassigned-${yr}`;
      }
      if (!groups[key]) {
        groups[key] = { 
          trip: {
            ...item.trip,
            id: key,
            name: 'Independent Flights'
          }, 
          flights: [], 
          outbound: [], 
          returnLegs: [] 
        };
      }
      groups[key].flights.push(item.flight);
    });
    
    // Sort flights inside each group by departure date/time
    Object.values(groups).forEach(g => {
      g.flights.sort((a, b) => {
        const da = getFlightDepartureUtcDate(a);
        const db = getFlightDepartureUtcDate(b);
        return da.getTime() - db.getTime();
      });

      // No Outbound and Return split - put everything in outbound and returnLegs empty
      g.outbound = g.flights;
      g.returnLegs = [];

      // Sort both itineraries by active sort fields
      const sortFlightsFunc = (a: Transport, b: Transport) => {
        let valA: any = '';
        let valB: any = '';

        if (sortField === 'flight') {
          if (sortSubOption === 'identifier') {
            valA = a.identifier || '';
            valB = b.identifier || '';
          } else if (sortSubOption === 'pnr') {
            valA = a.confirmationCode || 'ZZZZZZ';
            valB = b.confirmationCode || 'ZZZZZZ';
          } else { // default or 'airline'
            valA = (getCarrierName(a.provider) || a.provider).toLowerCase() + ' ' + (a.identifier || '');
            valB = (getCarrierName(b.provider) || b.provider).toLowerCase() + ' ' + (b.identifier || '');
          }
        } else if (sortField === 'sector') {
          if (sortSubOption === 'origin') {
            valA = a.origin || '';
            valB = b.origin || '';
          } else if (sortSubOption === 'destination') {
            valA = a.destination || '';
            valB = b.destination || '';
          } else if (sortSubOption === 'duration') {
            valA = a.duration || 0;
            valB = b.duration || 0;
          } else { // default 'route'
            valA = (a.origin || '') + ' ' + (a.destination || '');
            valB = (b.origin || '') + ' ' + (b.destination || '');
          }
        } else if (sortField === 'status') {
          const statusA = getFlightStatusTags(a).label;
          const statusB = getFlightStatusTags(b).label;
          if (sortSubOption === 'canceledFirst') {
            valA = statusA === 'Canceled' ? 0 : 1;
            valB = statusB === 'Canceled' ? 0 : 1;
          } else if (sortSubOption === 'scheduledFirst') {
            valA = statusA === 'Scheduled' ? 0 : 1;
            valB = statusB === 'Scheduled' ? 0 : 1;
          } else {
            valA = statusA;
            valB = statusB;
          }
        } else if (sortField === 'timing') {
          const timeA = getFlightDepartureUtcDate(a).getTime();
          const timeB = getFlightDepartureUtcDate(b).getTime();
          if (sortSubOption === 'departureHour') {
            valA = parseInt((a.departureTime || '00:00').split(':')[0] || '0');
            valB = parseInt((b.departureTime || '00:00').split(':')[0] || '0');
          } else if (sortSubOption === 'arrival') {
            valA = getFlightArrivalUtcDate(a).getTime();
            valB = getFlightArrivalUtcDate(b).getTime();
          } else if (sortSubOption === 'duration') {
            valA = a.duration || 0;
            valB = b.duration || 0;
          } else { // default 'departure'
            valA = timeA;
            valB = timeB;
          }
        } else if (sortField === 'seat') {
          if (sortSubOption === 'cabinTier') {
            const tiers = { 'First': 0, 'Business': 1, 'Premium Economy': 2, 'Economy': 3 };
            valA = tiers[a.travelClass as keyof typeof tiers] ?? 4;
            valB = tiers[b.travelClass as keyof typeof tiers] ?? 4;
          } else if (sortSubOption === 'cost') {
            valA = parseFloat(a.cost || '0') || 0;
            valB = parseFloat(b.cost || '0') || 0;
          } else { // default 'seatNumber'
            valA = a.seatNumber || 'ZZZ';
            valB = b.seatNumber || 'ZZZ';
          }
        }

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      };

      g.outbound.sort(sortFlightsFunc);
      g.returnLegs.sort(sortFlightsFunc);
    });

    // Sort groups themselves by the first flight's departure date/time
    const sortedGroups = Object.values(groups).sort((a, b) => {
      if (a.flights.length === 0) return 1;
      if (b.flights.length === 0) return -1;
      const da = getFlightDepartureUtcDate(a.flights[0]);
      const db = getFlightDepartureUtcDate(b.flights[0]);
      
      const isTimingSort = sortField === 'timing';
      if (isTimingSort) {
        return sortAsc ? da.getTime() - db.getTime() : db.getTime() - da.getTime();
      }

      // If timeFilter is 'past' we might want descending
      if (timeFilter === 'past') {
        return db.getTime() - da.getTime();
      }
      return da.getTime() - db.getTime(); // default ascending
    });

    return sortedGroups;
  }, [filteredFlights, timeFilter, sortField, sortSubOption, sortAsc]);

  const groupedByYear = useMemo(() => {
    const yearsMap: { [year: string]: typeof groupedFlights } = {};
    groupedFlights.forEach(g => {
      let yr = 'Unscheduled';
      if (g.flights.length > 0) {
        yr = new Date(g.flights[0].departureDate).getFullYear().toString();
      } else if (g.trip.startDate) {
        yr = new Date(g.trip.startDate).getFullYear().toString();
      }
      if (!yearsMap[yr]) {
        yearsMap[yr] = [];
      }
      yearsMap[yr].push(g);
    });

    return Object.keys(yearsMap)
      .sort((a, b) => {
        if (a === 'Unscheduled') return 1;
        if (b === 'Unscheduled') return -1;
        const isTimingSort = sortField === 'timing';
        if (isTimingSort) {
          return sortAsc ? a.localeCompare(b) : b.localeCompare(a);
        }
        return b.localeCompare(a); // default descending
      })
      .map(yr => ({
        year: yr,
        groups: yearsMap[yr]
      }));
  }, [groupedFlights, sortField, sortAsc]);

  // Next Upcoming Flight Highlight for the live ticket card
  const nextUpcomingFlight = useMemo(() => {
    if (flights.length === 0) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Find upcoming flights first
    const future = flights.filter(item => {
      const d = getFlightDepartureUtcDate(item.flight);
      return d >= today;
    });
    if (future.length > 0) {
      // Sort nearest upcoming first
      return [...future].sort((a, b) => {
        const da = getFlightDepartureUtcDate(a.flight);
        const db = getFlightDepartureUtcDate(b.flight);
        return da.getTime() - db.getTime();
      })[0];
    }
    // Fallback to the most recent flight
    return flights[0];
  }, [flights]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let upcomingCount = 0;
    let pastCount = 0;
    let totalSpend = 0;
    let totalDurationMinutes = 0;
    const airlines: Record<string, number> = {};

    filteredFlights.forEach(item => {
      const deptDate = getFlightDepartureUtcDate(item.flight);
      if (deptDate >= today) {
        upcomingCount++;
      } else {
        pastCount++;
      }

      if (item.flight.cost) {
        totalSpend += item.flight.cost;
      }

      if (item.flight.duration) {
        totalDurationMinutes += item.flight.duration;
      }

      if (item.flight.provider) {
        airlines[item.flight.provider] = (airlines[item.flight.provider] || 0) + 1;
      }
    });

    let topAirline = 'None';
    let maxCount = 0;
    Object.entries(airlines).forEach(([name, count]) => {
      if (count > maxCount) {
        maxCount = count;
        topAirline = name;
      }
    });

    return {
      total: filteredFlights.length,
      upcoming: upcomingCount,
      past: pastCount,
      spend: totalSpend,
      hours: Math.round(totalDurationMinutes / 60),
      topAirline
    };
  }, [filteredFlights]);

  // Unique Years list for Filters
  const uniqueYears = useMemo(() => {
    const yrs = new Set<string>();
    flights.forEach(item => {
      if (item.flight.departureDate) {
        const yr = new Date(item.flight.departureDate).getFullYear().toString();
        if (yr && !isNaN(Number(yr))) yrs.add(yr);
      }
    });
    return Array.from(yrs).sort().reverse();
  }, [flights]);

  // Flights per month chart data
  const monthlyData = useMemo(() => {
    const monthCounts: Record<string, number> = {
      'Jan': 0, 'Feb': 0, 'Mar': 0, 'Apr': 0, 'May': 0, 'Jun': 0,
      'Jul': 0, 'Aug': 0, 'Sep': 0, 'Oct': 0, 'Nov': 0, 'Dec': 0
    };
    
    // Only count filtered flights for the chart
    filteredFlights.forEach(item => {
      if (item.flight.departureDate) {
        const date = new Date(item.flight.departureDate);
        if (!isNaN(date.getTime())) {
          const month = date.toLocaleString('default', { month: 'short' });
          monthCounts[month] = (monthCounts[month] || 0) + 1;
        }
      }
    });

    return Object.entries(monthCounts).map(([month, count]) => ({
      month,
      flights: count
    }));
  }, [filteredFlights]);

  const renderGridFlight = (flight: Transport, idx: number, legsList: Transport[], trip: Trip) => {
    const isFuture = getFlightDepartureUtcDate(flight) >= new Date();
    const isSelected = selectedFlightIds.has(flight.id);
    
    // Calculate days remaining
    let daysRemaining = null;
    if (isFuture) {
       const depDate = getFlightDepartureUtcDate(flight);
       const today = new Date();
       const diffTime = Math.abs(depDate.getTime() - today.getTime());
       daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Check if there is a layover to the next flight
    let layoverStr = null;
    if (idx < legsList.length - 1) {
      const nextFlight = legsList[idx + 1];
      const arrDate = getFlightArrivalUtcDate(flight);
      const nextDep = getFlightDepartureUtcDate(nextFlight);
      const diffMs = nextDep.getTime() - arrDate.getTime();
      if (diffMs > 0 && diffMs < 24 * 60 * 60 * 1000) {
        const hrs = Math.floor(diffMs / (1000 * 60 * 60));
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        layoverStr = `${hrs}h ${mins}m layover at ${getCityName(flight.destination)}`;
      }
    }

    const statusInfo = getFlightStatusTags(flight);

    return (
      <div 
        key={flight.id} 
        onClick={() => {
          if (isMultiEditing) {
            const newSelected = new Set(selectedFlightIds);
            if (newSelected.has(flight.id)) {
              newSelected.delete(flight.id);
            } else {
              newSelected.add(flight.id);
            }
            setSelectedFlightIds(newSelected);
          }
        }}
        className={`relative group transition-transform duration-300 hover:scale-[1.01] ${isMultiEditing ? 'cursor-pointer' : ''}`}
      >
        {/* Boarding Pass Container */}
        <div className={`relative overflow-hidden bg-white/70 dark:bg-zinc-900/70 border ${isSelected ? 'border-blue-500/80 ring-2 ring-blue-500/10' : 'border-zinc-200/40 dark:border-white/5'} rounded-[2.2rem] flex flex-col justify-between shadow-xl h-full`}>
          <div className="flex h-full">
            {/* Left Column for Days or Checkbox (multi-editing) */}
            <div className={`w-24 ${isSelected ? 'bg-blue-600' : 'bg-zinc-900 dark:bg-black/40'} flex flex-col items-center justify-center text-white p-4 shrink-0 border-r border-zinc-800 dark:border-white/5 transition-colors duration-200 select-none`}>
              {isMultiEditing ? (
                isSelected ? (
                  <CheckSquare className="w-8 h-8 text-white stroke-[2.5px] animate-scale-up" />
                ) : (
                  <Square className="w-8 h-8 text-white/50 stroke-[1.5px] hover:text-white transition-colors" />
                )
              ) : (
                isFuture && daysRemaining !== null ? (
                  <>
                    <span className="text-4xl font-black leading-none tracking-tighter">{daysRemaining}</span>
                    <span className="text-[10px] font-black uppercase tracking-widest mt-1 opacity-60">DAYS</span>
                  </>
                ) : (
                    <span className="text-xs font-black uppercase tracking-widest opacity-60">PAST</span>
                )
              )}
            </div>
            
            {/* Main Pass Area */}
            <div className="flex-1 flex flex-col justify-between">
              <div className="p-5 pb-3">
                {/* Carrier header */}
                <div className="flex items-center justify-between mb-3 border-b border-zinc-200/50 dark:border-white/5 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-extrabold border border-zinc-200 dark:border-zinc-700/50 overflow-hidden shrink-0">
                      <AirlineLogo 
                        provider={flight.provider} 
                        fallback={<Plane className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />}
                      />
                    </div>
                    <div>
                      <span className="block font-black text-sm text-gray-805 dark:text-white tracking-wide truncate max-w-[150px]">
                        {getCarrierName(flight.provider) || flight.provider}
                      </span>
                      <span className="block font-mono text-[10px] text-gray-450 dark:text-gray-500 font-extrabold tracking-widest">
                        Flight {flight.identifier}
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest ${statusInfo.bgClass} inline-flex items-center gap-1`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass}`} />
                      {statusInfo.label}
                    </span>
                  </div>
                </div>

                {/* Cities & Times */}
                <div className="flex items-start justify-between gap-2 pt-1">
                  <div className="text-left w-2/5 flex flex-col">
                    <span className="font-black text-lg text-gray-900 dark:text-white tracking-tight leading-none mb-1 truncate">{getCityName(flight.origin)}</span>
                    <span className="font-mono text-xs text-zinc-500 font-bold tracking-widest uppercase">{flight.origin}</span>
                    
                    <div className="mt-2 space-y-1">
                      <div>
                        <div className="text-[8px] font-black uppercase text-zinc-400 tracking-wider">Scheduled Dep</div>
                        <div className="font-mono text-[10px] font-bold text-zinc-600 dark:text-zinc-400 leading-tight">
                          {statusInfo.depScheduledDate}<br />
                          <span className="font-black text-xs text-zinc-800 dark:text-zinc-200">{statusInfo.depScheduledTime}</span>
                        </div>
                      </div>
                      {statusInfo.depActualTime && statusInfo.depActualTime !== statusInfo.depScheduledTime && (
                        <div>
                          <div className="text-[8px] font-black uppercase text-zinc-400 tracking-wider mt-1">Actual Dep</div>
                          <div className={`font-mono text-[10px] font-black ${statusInfo.textClass} leading-tight`}>
                            {statusInfo.depActualDate}<br />
                            <span className="font-black text-xs">{statusInfo.depActualTime}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col items-center justify-start mt-3 px-1">
                    <div className="w-full h-[1px] bg-zinc-300 dark:bg-zinc-700 relative flex justify-center">
                       <Plane className="w-3.5 h-3.5 text-zinc-400 absolute top-1/2 -translate-y-1/2 rotate-90" />
                    </div>
                    <span className="text-[9px] font-black uppercase text-zinc-400 mt-2 text-center">
                      {flight.duration ? `${Math.floor(flight.duration / 60)}h ${flight.duration % 60}m` : 'Direct'}
                    </span>
                  </div>

                  <div className="text-right w-2/5 flex flex-col items-end">
                    <span className="font-black text-lg text-gray-900 dark:text-white tracking-tight leading-none mb-1 truncate">{getCityName(flight.destination)}</span>
                    <span className="font-mono text-xs text-zinc-500 font-bold tracking-widest uppercase">{flight.destination}</span>
                    
                    <div className="mt-2 space-y-1 text-right">
                      <div>
                        <div className="text-[8px] font-black uppercase text-zinc-400 tracking-wider">Scheduled Arr</div>
                        <div className="font-mono text-[10px] font-bold text-zinc-600 dark:text-zinc-400 leading-tight">
                          {statusInfo.arrScheduledDate}<br />
                          <span className="font-black text-xs text-zinc-805 dark:text-zinc-200">{statusInfo.arrScheduledTime}</span>
                        </div>
                      </div>
                      {statusInfo.arrActualTime && statusInfo.arrActualTime !== statusInfo.arrScheduledTime && (
                        <div>
                          <div className="text-[8px] font-black uppercase text-zinc-400 tracking-wider mt-1">Actual Arr</div>
                          <div className={`font-mono text-[10px] font-black ${statusInfo.textClass} leading-tight`}>
                            {statusInfo.arrActualDate}<br />
                            <span className="font-black text-xs">{statusInfo.arrActualTime}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom strip */}
              <div className="px-5 py-3 bg-zinc-50/50 dark:bg-white/5 border-t border-zinc-200/50 dark:border-white/5 flex items-center justify-between mt-auto">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black uppercase text-zinc-500 tracking-wider">Seat / Booking</span>
                  <span className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300 bg-white dark:bg-black/20 px-2 py-0.5 rounded border border-zinc-200 dark:border-white/10 mt-1 inline-block w-fit">
                    {flight.seatNumber || 'TBD'} &bull; {flight.confirmationCode || 'PNR'} 
                  </span>
                </div>
                {!isMultiEditing && (
                  <div className="flex items-center gap-1.5">
                    <button 
                      onClick={(e) => { e.stopPropagation(); openFlightForm({ flight, trip }); }}
                      className="p-2 rounded-lg bg-white dark:bg-zinc-800 text-zinc-500 hover:text-blue-500 border border-zinc-200 dark:border-white/10 shadow-sm transition-all cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteFlight({ flight, trip }); }}
                      className="p-2 rounded-lg bg-white dark:bg-zinc-800 text-zinc-500 hover:text-red-500 border border-zinc-200 dark:border-white/10 shadow-sm transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* Layover Badge */}
        {layoverStr && (
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 px-3 py-1 rounded-full text-[10px] font-black uppercase shadow-sm z-10 hidden md:block whitespace-nowrap">
              {layoverStr}
            </div>
        )}
      </div>
    );
  };

  const formatTo12Hour = (timeStr: string | undefined): string => {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    let hrs = parseInt(parts[0], 10);
    const mins = parts[1];
    if (isNaN(hrs)) return timeStr;
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    hrs = hrs % 12;
    if (hrs === 0) hrs = 12;
    const paddedHrs = hrs < 10 ? `0${hrs}` : hrs;
    return `${paddedHrs}:${mins} ${ampm}`;
  };

  const getTimeDiffMinutes = (actualTime?: string, scheduledTime?: string): number => {
    if (!actualTime || !scheduledTime) return 0;
    const partsActual = actualTime.split(':');
    const partsSched = scheduledTime.split(':');
    if (partsActual.length < 2 || partsSched.length < 2) return 0;
    const actH = parseInt(partsActual[0], 10);
    const actM = parseInt(partsActual[1], 10);
    const schedH = parseInt(partsSched[0], 10);
    const schedM = parseInt(partsSched[1], 10);
    if (isNaN(actH) || isNaN(actM) || isNaN(schedH) || isNaN(schedM)) return 0;
    return (actH * 60 + actM) - (schedH * 60 + schedM);
  };

  const renderFlightyLegRow = (flight: Transport, idx: number, legsList: Transport[], trip: Trip) => {
    const statusInfo = getFlightStatusTags(flight);

    // Compute 12-hour formatted times
    const scheduledDepStr = formatTo12Hour(statusInfo.depScheduledTime);
    const scheduledArrStr = formatTo12Hour(statusInfo.arrScheduledTime);
    const actualDepStr = statusInfo.depActualTime ? formatTo12Hour(statusInfo.depActualTime) : scheduledDepStr;
    const actualArrStr = statusInfo.arrActualTime ? formatTo12Hour(statusInfo.arrActualTime) : scheduledArrStr;

    // Check if flight is delayed/different
    const isDepartureDelay = statusInfo.depActualTime && statusInfo.depActualTime !== statusInfo.depScheduledTime;
    const isArrivalDelay = statusInfo.arrActualTime && statusInfo.arrActualTime !== statusInfo.arrScheduledTime;

    // Calculate exact delay minutes based on timestamps from status tags
    const depDiffMinutes = getTimeDiffMinutes(statusInfo.depActualTime, statusInfo.depScheduledTime);
    const arrDiffMinutes = getTimeDiffMinutes(statusInfo.arrActualTime, statusInfo.arrScheduledTime);
    const delayMins = arrDiffMinutes || depDiffMinutes;

    const hasActualData = !!(flight.actualDepartureTime || flight.actualArrivalTime || 
                             flight.customFields?.find(f => f.key.toLowerCase().includes('actual departure') || f.key.toLowerCase() === 'actual_departure')?.value ||
                             flight.customFields?.find(f => f.key.toLowerCase().includes('actual arrival') || f.key.toLowerCase() === 'actual_arrival')?.value);

    let delayLabel = "on time";
    let delayColorClass = "text-emerald-600 dark:text-emerald-400 font-black";
    if (hasActualData) {
      if (delayMins > 0) {
        delayLabel = `${delayMins}m late`;
        delayColorClass = "text-rose-500 font-black";
      } else if (delayMins < 0) {
        delayLabel = `${Math.abs(delayMins)}m early`;
        delayColorClass = "text-emerald-600 dark:text-emerald-400 font-black";
      } else {
        delayLabel = "on time";
        delayColorClass = "text-emerald-600 dark:text-emerald-400 font-black";
      }
    } else {
      delayLabel = "scheduled";
      delayColorClass = "text-zinc-400 dark:text-zinc-500 font-extrabold";
    }

    return (
      <div 
        key={flight.id}
        onClick={() => {
          if (isMultiEditing) {
            const newSelected = new Set(selectedFlightIds);
            if (newSelected.has(flight.id)) {
              newSelected.delete(flight.id);
            } else {
              newSelected.add(flight.id);
            }
            setSelectedFlightIds(newSelected);
          }
        }}
        className={`flex flex-col gap-3.5 relative transition-all group py-1.5 ${
          isMultiEditing ? 'cursor-pointer' : ''
        }`}
      >
        {/* ROW 1: Logo, Flight number, and Status Badge */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            {isMultiEditing && (
              <div 
                className="flex items-center justify-center select-none mr-1 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  const newSelected = new Set(selectedFlightIds);
                  if (newSelected.has(flight.id)) {
                    newSelected.delete(flight.id);
                  } else {
                    newSelected.add(flight.id);
                  }
                  setSelectedFlightIds(newSelected);
                }}
              >
                {selectedFlightIds.has(flight.id) ? (
                  <CheckSquare className="w-5 h-5 text-blue-500" />
                ) : (
                  <Square className="w-5 h-5 text-zinc-400 hover:text-blue-500" />
                )}
              </div>
            )}
            <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center border border-zinc-200/90 dark:border-white/10 overflow-hidden shrink-0 shadow-xs">
              <AirlineLogo provider={flight.provider} fallback={<Plane className="w-3.5 h-3.5 text-zinc-400" />} />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-[13px] text-zinc-950 dark:text-zinc-100 uppercase tracking-tight leading-tight">
                {flight.provider ? (getCarrierName(flight.provider) || flight.providerCode || flight.provider) : 'Carrier'}
              </span>
              <span className="font-mono text-[11px] text-zinc-450 dark:text-zinc-500 leading-none mt-0.5">
                Flight {flight.identifier}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black tracking-widest ${statusInfo.bgClass} shadow-xs`}>
              {statusInfo.label}
            </span>
            
            {/* Action buttons (always visible or on hover) */}
            <div className="flex gap-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 rounded-lg overflow-hidden shrink-0">
              <button 
                onClick={(e) => { e.stopPropagation(); openFlightForm({ flight, trip }); }} 
                className="p-1.5 text-zinc-500 hover:text-blue-500 transition-colors cursor-pointer"
                title="Edit Flight"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); handleDeleteFlight({ flight, trip }); }} 
                className="p-1.5 text-zinc-500 hover:text-red-500 transition-colors cursor-pointer"
                title="Delete Flight"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ROW 2: Core Flighty Visuals (BEY -> FRA) */}
        <div className="grid grid-cols-3 items-center py-2 bg-zinc-50/50 dark:bg-zinc-900/40 rounded-2xl px-4 border border-zinc-150 dark:border-white/5">
          {/* Origin Side */}
          <div className="flex flex-col text-left">
            <span className="font-black text-2xl tracking-tight text-zinc-900 dark:text-zinc-50 leading-none">
              {flight.origin}
            </span>
            <span className="text-[11px] font-bold text-zinc-450 dark:text-zinc-500 uppercase tracking-wide mt-1.5 leading-none truncate max-w-[95px]" title={getCityName(flight.origin)}>
              {getCityName(flight.origin)}
            </span>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 leading-none font-mono text-[12px]">
              <span className={isDepartureDelay ? `text-rose-500 dark:text-rose-400 font-extrabold` : "font-extrabold text-zinc-800 dark:text-zinc-200"}>
                {actualDepStr}
              </span>
              {isDepartureDelay && (
                <span className="line-through opacity-50 text-zinc-400 dark:text-zinc-500 text-[10px]">
                  {scheduledDepStr}
                </span>
              )}
            </div>
          </div>

          {/* Plane & Delay indicators */}
          <div className="flex flex-col items-center justify-center text-center">
            <Plane className="w-5 h-5 text-zinc-400 dark:text-zinc-500 transform rotate-45 animate-pulse" />
            <span className={`text-[10px] uppercase font-black tracking-widest mt-3 leading-none ${delayColorClass}`}>
              {delayLabel}
            </span>
          </div>

          {/* Destination Side */}
          <div className="flex flex-col text-right items-end">
            <span className="font-black text-2xl tracking-tight text-zinc-900 dark:text-zinc-50 leading-none">
              {flight.destination}
            </span>
            <span className="text-[11px] font-bold text-zinc-450 dark:text-zinc-500 uppercase tracking-wide mt-1.5 leading-none truncate max-w-[95px]" title={getCityName(flight.destination)}>
              {getCityName(flight.destination)}
            </span>
            <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5 leading-none font-mono text-[12px] text-right">
              <span className={isArrivalDelay ? `text-rose-500 dark:text-rose-400 font-extrabold` : "font-extrabold text-zinc-800 dark:text-zinc-200"}>
                {actualArrStr}
              </span>
              {isArrivalDelay && (
                <span className="line-through opacity-50 text-zinc-400 dark:text-zinc-500 text-[10px]">
                  {scheduledArrStr}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Info detail bar: travel class, seat, exit-row */}
        {(flight.travelClass || flight.seatNumber) && (
          <div className="flex items-center gap-2 mt-0.5 px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-905 rounded-xl border border-zinc-200/55 dark:border-white/5 text-[11px] text-zinc-550 dark:text-zinc-400 self-start">
            <span className="font-black uppercase tracking-widest text-[9px] text-zinc-400 dark:text-zinc-500">
              {flight.travelClass || 'Economy'}
            </span>
            {flight.seatNumber && (
              <>
                <span className="inline-block w-1 h-1 rounded-full bg-zinc-350 dark:bg-zinc-700" />
                <span className="font-mono font-bold text-amber-550 dark:text-amber-405">Seat {flight.seatNumber}</span>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderMobileTripContainer = (legs: Transport[], label: string, trip: Trip) => {
    if (!legs || legs.length === 0) return null;
    const startCity = getCityName(legs[0].origin);
    const endCity = getCityName(legs[legs.length - 1].destination);
    const flightCount = legs.length;
    
    // Format the date label elegantly like "Sun, Sep 2, 2012 · 3 flights"
    let dateLabel = "";
    if (legs[0].departureDate) {
      const d = getFlightDepartureUtcDate(legs[0]);
      const options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
      dateLabel = d.toLocaleDateString('en-US', options);
    } else {
      dateLabel = "Planned Route";
    }

    return (
      <div className="flex flex-col gap-2.5 w-full mt-3">
        {/* Date / Flight count heading */}
        <div className="flex items-center justify-between px-1.5 text-[11px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          <span>{dateLabel}</span>
          <span>{flightCount} {flightCount === 1 ? 'flight' : 'flights'}</span>
        </div>

        {/* Content Card resembling Flighty with beautiful ambient glow instead of white border */}
        <div className="p-5 rounded-[2rem] bg-gradient-to-br from-blue-50/45 via-white/50 to-blue-50/10 dark:from-blue-950/10 dark:via-zinc-900/40 dark:to-blue-950/5 border-2 border-blue-500/20 dark:border-blue-400/15 shadow-md shadow-blue-500/5 flex flex-col gap-4">
          {/* Card Route Title */}
          <div className="flex items-center justify-between pb-3 border-b border-dashed border-zinc-200 dark:border-zinc-800">
            <h4 className="font-black text-[15px] text-zinc-900 dark:text-zinc-50 flex items-center gap-1.5 leading-none">
              <span>{startCity}</span>
              <span className="text-zinc-400 dark:text-zinc-650 flex font-extrabold pb-0.5">→</span>
              <span>{endCity}</span>
            </h4>
            <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border border-zinc-200/50 dark:border-white/5">
              {label}
            </span>
          </div>

          {/* Flights list */}
          <div className="flex flex-col gap-3">
            {legs.map((flight, idx) => {
              const elements = [];
              elements.push(renderFlightyLegRow(flight, idx, legs, trip));
              
              // Layover connector pill between this leg and next
              if (idx < legs.length - 1) {
                const nextFlight = legs[idx + 1];
                const arrDate = getFlightArrivalUtcDate(flight);
                const nextDep = getFlightDepartureUtcDate(nextFlight);
                const diffMs = nextDep.getTime() - arrDate.getTime();
                if (diffMs > 0 && diffMs < 24 * 60 * 60 * 1000) {
                  const hrs = Math.floor(diffMs / (1000 * 60 * 60));
                  const trueMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                  const layoverStr = `${hrs}h ${trueMins}m at ${flight.destination}`;
                  elements.push(
                    <div 
                      key={`layover-${flight.id}`}
                      className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100/50 dark:hover:bg-zinc-850 px-4 py-2.5 rounded-2xl text-[11px] font-extrabold text-zinc-700 dark:text-zinc-200 shadow-xs transition-all cursor-pointer my-1 w-full"
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-amber-550 dark:text-amber-400 font-bold" />
                        <span>{layoverStr}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
                    </div>
                  );
                }
              }
              return elements;
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderTableRow = (flight: Transport, idx: number, legsList: Transport[], trip: Trip) => {
    let layoverStr = null;
    if (idx < legsList.length - 1) {
      const nextFlight = legsList[idx + 1];
      const arrDate = getFlightArrivalUtcDate(flight);
      const nextDep = getFlightDepartureUtcDate(nextFlight);
      const diffMs = nextDep.getTime() - arrDate.getTime();
      if (diffMs > 0 && diffMs < 24 * 60 * 60 * 1000) {
        const hrs = Math.floor(diffMs / (1000 * 60 * 60));
        const trueMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        layoverStr = `${hrs}h ${trueMins}m at ${flight.destination}`;
      }
    }

    const statusInfo = getFlightStatusTags(flight);

    return (
      <React.Fragment key={flight.id}>
        <tr 
          onClick={() => {
            if (isMultiEditing) {
              const newSelected = new Set(selectedFlightIds);
              if (newSelected.has(flight.id)) {
                newSelected.delete(flight.id);
              } else {
                newSelected.add(flight.id);
              }
              setSelectedFlightIds(newSelected);
            }
          }}
          className={`transition-all duration-300 group ${isMultiEditing ? 'cursor-pointer' : ''}`}
        >
          {isMultiEditing && (
            <td className="py-4 pl-4 align-middle text-center w-[4%] bg-white/45 dark:bg-zinc-950/20 group-hover:bg-blue-500/5 dark:group-hover:bg-blue-500/5 border-y border-zinc-200/40 dark:border-zinc-800/40 first:border-l last:border-r first:rounded-l-2xl last:rounded-r-2xl">
              <div 
                className="flex items-center justify-center select-none"
                onClick={(e) => {
                  e.stopPropagation();
                  const newSelected = new Set(selectedFlightIds);
                  if (newSelected.has(flight.id)) {
                    newSelected.delete(flight.id);
                  } else {
                    newSelected.add(flight.id);
                  }
                  setSelectedFlightIds(newSelected);
                }}
              >
                {selectedFlightIds.has(flight.id) ? (
                  <CheckSquare className="w-4 h-4 text-blue-500" />
                ) : (
                  <Square className="w-4 h-4 text-zinc-400 hover:text-blue-500 transition-colors" />
                )}
              </div>
            </td>
          )}
          {/* 1. FLIGHT & CARRIER */}
          <td className="py-4 pl-4 align-middle bg-white/45 dark:bg-zinc-950/20 group-hover:bg-blue-500/5 dark:group-hover:bg-blue-500/5 border-y border-zinc-200/40 dark:border-zinc-800/40 first:border-l last:border-r first:rounded-l-2xl last:rounded-r-2xl">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center border border-zinc-200 dark:border-zinc-800 overflow-hidden shrink-0 shadow-xs">
                <AirlineLogo provider={flight.provider} fallback={<Plane className="w-4 h-4 text-zinc-400" />} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-extrabold text-[13px] text-zinc-900 dark:text-zinc-100 uppercase tracking-tight truncate max-w-[140px]">
                  {getCarrierName(flight.provider) || flight.provider}
                </span>
                <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-550 leading-tight">
                  Flight {flight.identifier}
                </span>
              </div>
            </div>
          </td>

          {/* 2. SECTOR / ROUTE */}
          <td className="py-4 align-middle bg-white/45 dark:bg-zinc-950/20 group-hover:bg-blue-500/5 dark:group-hover:bg-blue-500/5 border-y border-zinc-200/40 dark:border-zinc-800/40 first:border-l last:border-r first:rounded-l-2xl last:rounded-r-2xl">
            <div className="flex items-center gap-3">
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-[14px] text-zinc-900 dark:text-zinc-100 leading-none truncate max-w-[110px]" title={getCityName(flight.origin)}>
                  {getCityName(flight.origin)}
                </span>
                <span className="font-mono text-[11px] text-zinc-450 dark:text-zinc-550 uppercase tracking-wide leading-none mt-1">
                  {flight.origin}
                </span>
              </div>
              
              <div className="flex flex-col items-center justify-center shrink-0 px-1 text-center w-12">
                <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-550 uppercase tracking-widest leading-none mb-0.5">
                  {flight.duration ? `${Math.floor(flight.duration / 60)}h ${flight.duration % 60}m` : 'Direct'}
                </span>
                <div className="flex items-center justify-center w-full mt-1">
                  <div className="w-3 h-[1px] bg-zinc-250 dark:bg-zinc-755" />
                  <Plane className="w-2.5 h-2.5 text-zinc-400 dark:text-zinc-550 rotate-90 shrink-0 mx-0.5" />
                  <div className="w-3 h-[1px] bg-zinc-250 dark:bg-zinc-755" />
                </div>
              </div>

              <div className="flex flex-col min-w-0">
                <span className="font-bold text-[14px] text-zinc-900 dark:text-zinc-100 leading-none truncate max-w-[110px]" title={getCityName(flight.destination)}>
                  {getCityName(flight.destination)}
                </span>
                <span className="font-mono text-[11px] text-zinc-450 dark:text-zinc-550 uppercase tracking-wide leading-none mt-1">
                  {flight.destination}
                </span>
              </div>
            </div>
          </td>

          {/* 3. STATUS BADGE */}
          <td className="py-4 align-middle bg-white/45 dark:bg-zinc-950/20 group-hover:bg-blue-500/5 dark:group-hover:bg-blue-500/5 border-y border-zinc-200/40 dark:border-zinc-800/40 first:border-l last:border-r first:rounded-l-2xl last:rounded-r-2xl">
            <div className="flex items-center gap-2 origin-left">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-widest ${statusInfo.bgClass} inline-flex items-center gap-1 shadow-xs`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass}`} />
                {statusInfo.label}
              </span>
              {flight.departureDate && (
                <div className="shrink-0">
                  {getFlightDepartureUtcDate(flight) >= new Date() ? (
                    <span className="text-[11px] font-bold text-emerald-655 dark:text-emerald-450 flex items-center gap-0.5">
                      <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                      In {Math.ceil(Math.abs(getFlightDepartureUtcDate(flight).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))}d
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                      Done
                    </span>
                  )}
                </div>
              )}
            </div>
          </td>

          {/* 4. DETAILS ON SCHEDULES */}
          <td className="py-4 align-middle bg-white/45 dark:bg-zinc-950/20 group-hover:bg-blue-500/5 dark:group-hover:bg-blue-500/5 border-y border-zinc-200/40 dark:border-zinc-800/40 first:border-l last:border-r first:rounded-l-2xl last:rounded-r-2xl">
            <div className="flex flex-col min-w-[150px]">
              <span className="font-mono text-[11px] text-zinc-450 dark:text-zinc-550 leading-tight">
                {statusInfo.depScheduledDate}
              </span>
              <div className="font-mono text-[13px] mt-0.5 flex items-center gap-1.5 leading-none">
                <span className={statusInfo.isDifferent && statusInfo.label !== 'CANCELED' ? 'line-through opacity-50 text-[11px] text-zinc-400 dark:text-zinc-500' : 'font-black text-zinc-800 dark:text-zinc-200'}>
                  {statusInfo.depScheduledTime} → {statusInfo.arrScheduledTime}
                </span>
                {statusInfo.isDifferent && statusInfo.label !== 'CANCELED' && (
                  <span className={`font-black ${statusInfo.textClass}`}>
                    {statusInfo.depActualTime} → {statusInfo.arrActualTime}
                  </span>
                )}
              </div>
            </div>
          </td>

          {/* 5. SEAT & EXPERIENCE */}
          <td className="py-4 align-middle bg-white/45 dark:bg-zinc-950/20 group-hover:bg-blue-500/5 dark:group-hover:bg-blue-500/5 border-y border-zinc-200/40 dark:border-zinc-800/40 first:border-l last:border-r first:rounded-l-2xl last:rounded-r-2xl">
            <div className="flex flex-col items-start gap-1 leading-none">
              <span className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200">
                {flight.travelClass || 'Economy'}
              </span>
              {flight.seatNumber ? (
                <span className="font-mono text-[10px] font-bold text-amber-500 bg-amber-500/5 dark:bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/20 leading-none">
                  Seat {flight.seatNumber}
                </span>
              ) : (
                <span className="text-[11px] text-zinc-400 dark:text-zinc-550">Unassigned</span>
              )}
            </div>
          </td>

          {/* 6. ACTIONS */}
          <td className="py-4 text-right pr-4 align-middle bg-white/45 dark:bg-zinc-950/20 group-hover:bg-blue-500/5 dark:group-hover:bg-blue-500/5 border-y border-zinc-200/40 dark:border-zinc-800/40 first:border-l last:border-r first:rounded-l-2xl last:rounded-r-2xl">
            <div className="flex justify-end gap-1.5 opacity-80 md:opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => openFlightForm({ flight, trip })} className="p-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:text-blue-500 hover:border-blue-500/40 dark:hover:border-blue-500/40 hover:shadow-xs transition-colors cursor-pointer" title="Edit Flight Bookings">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => handleDeleteFlight({ flight, trip })} className="p-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:text-red-500 hover:border-red-500/40 dark:hover:border-red-500/40 hover:shadow-xs transition-colors cursor-pointer" title="Delete Flight">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </td>
        </tr>
        {layoverStr && (
          <tr>
            <td colSpan={isMultiEditing ? 7 : 6} className="py-2.5 px-1 align-middle">
              <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100/50 dark:hover:bg-zinc-850 px-4 py-2 rounded-2xl text-[11px] font-extrabold text-zinc-700 dark:text-zinc-200 shadow-xs transition-all w-full max-w-xl mx-auto my-1">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-550 dark:text-amber-400 font-bold" />
                  <span>{layoverStr}</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
              </div>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Dynamic Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
            <Plane className="w-10 h-10 text-blue-500 animate-pulse rotate-45 shrink-0" />
            Flight Center
          </h1>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-2">
            Add, track, schedule, and view the global timeline of your family expeditions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <Button 
            variant="primary" 
            className="rounded-2xl cursor-pointer"
            onClick={() => openFlightForm()}
            icon={<Plus className="w-4 h-4" />}
          >
            Add Flight
          </Button>
        </div>
      </div>
          {/* Search & Filters Board */}
      <div className="bg-white/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-white/5 shadow-md rounded-[2rem] p-6 backdrop-blur-xl">
        <div className="space-y-5">
          {/* Search and Dropdowns */}
          <div className="flex flex-col xl:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500/60 dark:text-blue-200/50 w-[18px] h-[18px] pointer-events-none" />
              <input 
                type="text"
                placeholder="Search by airline, code, city, booking locator..."
                className="w-full pl-[2.6rem] pr-5 py-2.5 rounded-2xl bg-white/50 border border-white/40 focus:border-white/80 focus:bg-white outline-none font-medium text-sm text-zinc-900 dark:bg-black/20 dark:border-white/10 dark:text-blue-50 dark:placeholder-blue-200/50 dark:focus:bg-black/30 shadow-sm transition-all placeholder:text-zinc-400"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {/* Travel Timeline Indicator */}
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setTimeFilter('all')}
                  className={`px-5 py-2.5 text-sm rounded-2xl font-bold transition-all cursor-pointer ${timeFilter === 'all' ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-white/40 text-zinc-850 dark:text-zinc-100 hover:bg-white/60 dark:bg-black/20 dark:hover:bg-black/40 border border-white/30 dark:border-white/10'}`}
                >
                  All
                </button>
                <button 
                  onClick={() => setTimeFilter('upcoming')}
                  className={`px-5 py-2.5 text-sm rounded-2xl font-bold transition-all cursor-pointer ${timeFilter === 'upcoming' ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-white/40 text-zinc-850 dark:text-zinc-100 hover:bg-white/60 dark:bg-black/20 dark:hover:bg-black/40 border border-white/30 dark:border-white/10'}`}
                >
                  Upcoming
                </button>
                <button 
                  onClick={() => setTimeFilter('past')}
                  className={`px-5 py-2.5 text-sm rounded-2xl font-bold transition-all cursor-pointer ${timeFilter === 'past' ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-white/40 text-zinc-850 dark:text-zinc-100 hover:bg-white/60 dark:bg-black/20 dark:hover:bg-black/40 border border-white/30 dark:border-white/10'}`}
                >
                  Past
                </button>
              </div>

              {/* Cabin Class Select filter */}
              <select
                className="px-5 py-2.5 text-sm rounded-2xl font-bold bg-white/40 text-zinc-850 dark:text-zinc-100 border border-white/30 hover:bg-white/60 shadow-sm dark:bg-black/20 dark:border-white/10 dark:hover:bg-black/40 outline-none cursor-pointer transition-all appearance-none pr-8"
                value={classFilter}
                onChange={e => setClassFilter(e.target.value)}
              >
                <option value="all" className="text-black">Any Cabin</option>
                <option value="Economy" className="text-black">Economy</option>
                <option value="Premium Economy" className="text-black">Premium Economy</option>
                <option value="Business" className="text-black">Business</option>
                <option value="First" className="text-black">First Only</option>
              </select>

              {/* Reset Filters button */}
              {(searchQuery !== '' ||
                timeFilter !== 'all' ||
                classFilter !== 'all' ||
                yearFilter !== 'all' ||
                colFilterFlight !== '' ||
                colFilterSector !== '' ||
                colFilterStatus !== 'all' ||
                colFilterSeat !== 'all') && (
                <button
                  onClick={handleResetFilters}
                  className="px-5 py-2.5 text-sm rounded-2xl font-bold transition-all bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-600 dark:text-rose-450 flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Year Filter Horizontal Scroll Bar */}
          <div className="flex overflow-x-auto gap-3 pb-1 custom-scrollbar items-center">
            <button
              onClick={() => setYearFilter('all')}
              className={`shrink-0 px-5 py-2.5 text-sm rounded-2xl font-bold transition-all whitespace-nowrap cursor-pointer ${yearFilter === 'all' ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-white/40 text-zinc-850 dark:text-zinc-100 border border-white/30 hover:bg-white/60 shadow-sm dark:bg-black/20 dark:border-white/10 dark:hover:bg-black/40'}`}
            >
              All Time
            </button>
            
            <div className="w-[1px] h-6 bg-zinc-300 dark:bg-white/10 shrink-0 mx-1"></div>
            
            {uniqueYears.map(yr => (
              <button
                key={yr}
                onClick={() => setYearFilter(yr)}
                className={`shrink-0 px-5 py-2.5 text-sm rounded-2xl font-bold transition-all whitespace-nowrap cursor-pointer ${yearFilter === yr ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-white/40 text-zinc-855 dark:text-zinc-100 border border-white/30 hover:bg-white/60 shadow-sm dark:bg-black/20 dark:border-white/10 dark:hover:bg-black/40'}`}
              >
                {yr}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Unequal Multi-Column Dashboard Section: Passport, Boarding Hero Ticket & Financial Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Column 1: Passport booklet Card (Primary Visual - Wider: 6/12 width) */}
        <div className="col-span-12 xl:col-span-6 flex">
          <FlightyPassport flights={filteredFlights.map(f => f.flight)} yearFilter={yearFilter} />
        </div>

        {/* Column 2: Boarding Ticket Hero Card (Upcoming Journey - Narrower: 3/12 width) */}
        <div className="col-span-12 md:col-span-6 xl:col-span-3">
          {nextUpcomingFlight ? (() => {
            const flight = nextUpcomingFlight.flight;
            const trip = nextUpcomingFlight.trip;
            const isFuture = getFlightDepartureUtcDate(flight) >= new Date();
            const statusInfo = getFlightStatusTags(flight);
            
            let daysDiffText = '';
            if (isFuture) {
              const depDate = getFlightDepartureUtcDate(flight);
              const diffTime = Math.abs(depDate.getTime() - new Date().getTime());
              const dVal = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              daysDiffText = dVal === 1 ? 'Tomorrow' : `In ${dVal} days`;
            } else {
              daysDiffText = 'Completed';
            }

            return (
              <div className="relative bg-white/40 dark:bg-zinc-900/30 border border-zinc-200/45 dark:border-white/5 shadow-md rounded-[2.5rem] overflow-hidden backdrop-blur-xl flex flex-col justify-between h-full group">
                {/* Ticket Header */}
                <div className="p-6 pb-4 border-b border-dashed border-zinc-200 dark:border-white/10 relative">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase text-blue-500 dark:text-blue-400 tracking-widest">
                      {isFuture ? 'UPCOMING TICKET' : 'LATEST PILOT'}
                    </span>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${isFuture ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-zinc-500/10 text-zinc-500'}`}>
                      {daysDiffText}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2.5 mt-3">
                    <div className="w-8 h-8 rounded-lg bg-white/80 dark:bg-zinc-800 flex items-center justify-center border border-zinc-250/50 dark:border-white/5 overflow-hidden shadow-xs shrink-0">
                      <AirlineLogo provider={flight.provider} fallback={<Plane className="w-4 h-4 text-zinc-400" />} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-black text-zinc-800 dark:text-zinc-200 uppercase leading-none truncate block">
                        {getCarrierName(flight.provider) || flight.provider}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-400 mt-1 leading-none block">
                        Flight {flight.identifier} &bull; {flight.travelClass || 'Economy'}
                      </span>
                    </div>
                  </div>

                  {/* Perforated ticket punches */}
                  <div className="absolute -bottom-3 -left-3 w-6 h-6 rounded-full bg-zinc-50/40 dark:bg-zinc-950/80 border-r border-zinc-200/40 dark:border-white/5 pointer-events-none" />
                  <div className="absolute -bottom-3 -right-3 w-6 h-6 rounded-full bg-zinc-50/40 dark:bg-zinc-950/80 border-l border-zinc-200/40 dark:border-white/5 pointer-events-none" />
                </div>

                {/* Ticket Body: Sector */}
                <div className="p-6 flex-1 flex flex-col justify-center">
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex flex-col">
                      <span className="font-mono text-[9px] font-black text-zinc-400 tracking-wider">FROM</span>
                      <span className="text-3xl font-black text-zinc-850 dark:text-white leading-none mt-1">{flight.origin}</span>
                      <span className="text-[10px] font-bold text-zinc-400 truncate mt-1 max-w-[80px]" title={getCityName(flight.origin)}>
                        {getCityName(flight.origin)}
                      </span>
                    </div>
                    
                    <div className="flex-1 flex flex-col items-center justify-center px-2">
                      <div className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-1">
                        {flight.duration ? `${Math.floor(flight.duration / 60)}h ${flight.duration % 60}m` : 'Direct'}
                      </div>
                      <div className="relative w-full flex items-center justify-center my-1.5">
                        <div className="w-full h-[1px] bg-dashed border-t border-zinc-300 dark:border-white/10" />
                        <Plane className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 rotate-90 absolute" />
                      </div>
                      <span className="text-[8px] font-black uppercase text-zinc-400 tracking-wider">Non-stop</span>
                    </div>

                    <div className="flex flex-col items-end">
                      <span className="font-mono text-[9px] font-black text-zinc-400 tracking-wider">TO</span>
                      <span className="text-3xl font-black text-zinc-850 dark:text-white leading-none mt-1">{flight.destination}</span>
                      <span className="text-[10px] font-bold text-zinc-400 truncate mt-1 max-w-[80px]" title={getCityName(flight.destination)}>
                        {getCityName(flight.destination)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-y-4 gap-x-2 border-t border-zinc-200/40 dark:border-white/5 pt-4">
                    <div>
                      <span className="block text-[8px] font-black text-zinc-450 dark:text-zinc-505 uppercase tracking-wider">Departure</span>
                      <span className="font-mono text-xs font-black text-zinc-700 dark:text-zinc-300 mt-1 block">
                        {flight.departureDate} &bull; <strong className="text-zinc-850 dark:text-zinc-150">{flight.departureTime || 'TBD'}</strong>
                      </span>
                    </div>
                    <div>
                      <span className="block text-[8px] font-black text-zinc-450 dark:text-zinc-505 uppercase tracking-wider">Arrival</span>
                      <span className="font-mono text-xs font-black text-zinc-700 dark:text-zinc-300 mt-1 block font-medium">
                        {flight.arrivalDate || flight.departureDate} &bull; <strong className="text-zinc-855 dark:text-zinc-150">{flight.arrivalTime || 'TBD'}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Ticket Footer */}
                <div className="px-6 py-4 bg-zinc-50/50 dark:bg-white/5 border-t border-zinc-200/50 dark:border-white/5 flex items-center justify-between">
                  <div className="flex flex-col min-w-0 mr-2">
                    <span className="text-[8px] font-black uppercase text-zinc-400 tracking-wider">Seat Code</span>
                    <span className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300 mt-0.5 truncate block">
                      {flight.seatNumber ? `Row ${flight.seatNumber}` : 'Unassigned'}
                    </span>
                  </div>
                  <div className="text-right flex flex-col min-w-0">
                    <span className="text-[8px] font-black uppercase text-zinc-400 tracking-wider">Locator</span>
                    <span className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase mt-0.5 tracking-wider truncate block">
                      {flight.confirmationCode || 'PNR'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })() : (
            <div className="relative bg-white/40 dark:bg-zinc-900/30 border border-zinc-200/40 dark:border-white/5 shadow-md rounded-[2.5rem] p-6 backdrop-blur-xl flex flex-col justify-center items-center h-full text-center">
              <div className="w-14 h-14 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500 dark:text-blue-400 mb-4 border border-blue-500/20">
                <Compass className="w-6 h-6 animate-spin-slow" />
              </div>
              <h3 className="text-sm font-black text-zinc-800 dark:text-white uppercase tracking-wider">Ready for Takeoff</h3>
              <p className="text-xs text-zinc-500 mt-2 max-w-[180px] leading-relaxed">
                No scheduled flights found. Register your next expedition ticket to showcase!
              </p>
            </div>
          )}
        </div>

        {/* Column 3: Stats Analytics & Spending Insights (Narrower: 3/12 width) */}
        {/* We have removed redundant flights counts/airports/airlines (since they are in the Passport Booklet) */}
        <div className="col-span-12 md:col-span-6 xl:col-span-3">
          <div className="bg-white/40 dark:bg-zinc-900/30 border border-zinc-200/40 dark:border-white/5 shadow-md rounded-[2.5rem] p-6 backdrop-blur-xl flex flex-col justify-between h-full space-y-6">
            <div>
              <h3 className="text-sm font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                <BarChart2 className="w-4 h-4 text-blue-500" />
                Flight Insights
              </h3>
              
              <div className="grid grid-cols-1 gap-4">
                {/* 1. Estimated Spend */}
                <div className="p-4 bg-white/35 dark:bg-black/20 rounded-2xl border border-zinc-200/25 dark:border-white/5 flex flex-col justify-center transition-all hover:bg-white/50 dark:hover:bg-black/30">
                  <span className="block text-[9px] font-black uppercase text-zinc-400 dark:text-zinc-505 tracking-wider">Estimated Spend</span>
                  <div className="text-2xl font-black text-amber-500 dark:text-amber-400 mt-1">
                    ${metrics.spend.toLocaleString()}
                  </div>
                </div>

                {/* 2. Top Carrier */}
                <div className="p-4 bg-white/35 dark:bg-black/20 rounded-2xl border border-zinc-200/25 dark:border-white/5 flex flex-col justify-center transition-all hover:bg-white/50 dark:hover:bg-black/30">
                  <span className="block text-[9px] font-black uppercase text-zinc-400 dark:text-zinc-505 tracking-wider">Top Airline</span>
                  <div className="text-lg font-black text-zinc-800 dark:text-zinc-200 mt-1 truncate" title={metrics.topAirline}>
                    {metrics.topAirline}
                  </div>
                </div>

                {/* 3. Upcoming Trips Left */}
                <div className="p-4 bg-white/35 dark:bg-black/20 rounded-2xl border border-zinc-200/25 dark:border-white/5 flex flex-col justify-center transition-all hover:bg-white/50 dark:hover:bg-black/30 w-full">
                  <span className="block text-[9px] font-black uppercase text-zinc-400 dark:text-zinc-550 tracking-wider">Scheduled Ahead</span>
                  <div className="text-xl font-black text-emerald-600 dark:text-emerald-450 mt-1 break-words">
                    {metrics.upcoming} <span className="text-[10px] uppercase font-bold text-zinc-400">flights pending</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Embedded Recharts Monthly Flight Frequency Chart */}
            <div className="pt-4 border-t border-zinc-200/30 dark:border-white/10">
              <h4 className="text-[10px] font-black uppercase text-zinc-400 tracking-wider mb-2">Monthly Frequency</h4>
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: -32, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#888888" strokeOpacity={0.1} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#888888', fontWeight: 605 }} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#888888', fontWeight: 605 }} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', padding: '6px 10px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', background: 'rgba(255, 255, 255, 0.95)' }}
                      itemStyle={{ color: '#111827', fontWeight: 'bold', fontSize: '10px' }}
                    />
                    <Bar dataKey="flights" name="Flights" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

      </div>

      <div className="flex justify-between items-center bg-white/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-white/5 shadow-md rounded-[2rem] p-4 backdrop-blur-xl">
        <h3 className="text-xl font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100 pl-4">
          <Plane className="w-5 h-5 text-blue-500" />
          Flight Board ({filteredFlights.length})
        </h3>
        
        {/* Edit and View Mode Control Group */}
        <div className="flex items-center gap-3 pr-2">
          {/* Edit Flights icon-only button */}
          <button
            onClick={() => {
              setIsMultiEditing(!isMultiEditing);
              setSelectedFlightIds(new Set());
            }}
            title={isMultiEditing ? "Done Editing" : "Edit Flights"}
            className={`p-2 rounded-xl transition-all border cursor-pointer ${
              isMultiEditing 
                ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' 
                : 'bg-white dark:bg-black/20 text-zinc-500 hover:text-blue-500 hover:bg-zinc-100 dark:hover:bg-white/10 dark:hover:text-zinc-300 shadow-sm border-zinc-200 dark:border-white/10'
            }`}
          >
            {isMultiEditing ? <Check className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
          </button>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-white dark:bg-black/20 rounded-xl p-1 border border-zinc-200 dark:border-white/10 shadow-sm">
            <button 
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-lg transition-all cursor-pointer ${viewMode === 'table' ? 'bg-blue-500 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-blue-500 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
              title="Grid View"
            >
              <Grid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Flight Board Display Modes */}
      {filteredFlights.length === 0 ? (
        <div className="bg-white/40 dark:bg-zinc-900/20 border border-zinc-200/30 dark:border-white/5 rounded-[2.5rem] p-12 text-center select-none">
          <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto text-blue-500 dark:text-blue-400 mb-6 border border-blue-500/20 animate-bounce">
            <Plane className="w-8 h-8 rotate-45" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">No Flights Found</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-md mx-auto">
            Try tweaking your filters, or click &quot;Add Boarding Pass&quot; to book a flight leg manually.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="flex flex-col gap-10">
          <AnimatePresence mode="popLayout">
            {groupedByYear.map(({ year, groups }) => (
              <div key={year} className="space-y-6">
                {/* Year Header Banner */}
                <div className="flex items-center gap-2 pb-2 border-b border-zinc-200 dark:border-white/10 ml-2">
                  <Calendar className="w-5 h-5 text-blue-500" />
                  <h3 className="text-sm font-black uppercase tracking-widest text-zinc-900 dark:text-white">Year {year}</h3>
                </div>

                <div className="flex flex-col gap-8">
                  {groups.map(({ trip, outbound, returnLegs }) => {
                    const isIndependent = trip.id.startsWith('unassigned');
                    return (
                      <motion.div
                        layout
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        key={trip.id}
                        className={`p-6 backdrop-blur-xl animate-fade-in rounded-[2.5rem] shadow-lg transition-all duration-300
                          ${isIndependent 
                            ? "bg-white/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-white/5 shadow-md" 
                            : "bg-gradient-to-br from-blue-50/40 via-white/50 to-blue-50/10 dark:from-blue-950/10 dark:via-zinc-900/40 dark:to-blue-950/5 border-2 border-blue-500/15 dark:border-blue-400/10 shadow-blue-500/5"
                          }`}
                      >
                        {!isIndependent && (
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-zinc-200/40 dark:border-white/5 ml-2">
                            <div className="flex items-center gap-3">
                              <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-2xl border border-blue-500/15">
                                <Compass className="w-5 h-5 shadow-sm" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-base font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-widest leading-none">{trip.name}</h4>
                                </div>
                                {trip.location && (
                                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-bold mt-1 flex items-center gap-1">
                                    <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                                    {trip.location}
                                  </p>
                                )}
                              </div>
                            </div>
                            {(trip.startDate || trip.endDate) && (
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/60 dark:bg-white/5 rounded-2xl text-[10px] font-mono font-bold text-zinc-500 dark:text-zinc-400 w-fit shadow-sm border border-zinc-200/40 dark:border-transparent">
                                <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                                {trip.startDate} {trip.endDate && trip.endDate !== trip.startDate ? `→ ${trip.endDate}` : ''}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="space-y-6">
                          {outbound && outbound.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {outbound.map((flight, idx) => renderGridFlight(flight, idx, outbound, trip))}
                            </div>
                          )}

                          {returnLegs && returnLegs.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                              {returnLegs.map((flight, idx) => renderGridFlight(flight, idx, returnLegs, trip))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="relative space-y-6 pr-1">
          {/* Master Sticky Table Header Card */}
          <table className="hidden md:table w-full text-left border-collapse min-w-[950px] sticky top-0 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md z-30 shadow-md border-2 border-blue-500/20 dark:border-blue-400/15 rounded-3xl overflow-hidden table-fixed shadow-blue-500/5">
            <colgroup>
              {isMultiEditing && <col style={{ width: '4%' }} />}
              <col style={{ width: '18%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '2%' }} />
            </colgroup>
            <thead>
              <tr className="border-b border-zinc-200/50 dark:border-zinc-850/50 font-mono text-zinc-400 dark:text-zinc-500">
                {isMultiEditing && (
                  <th className="sticky top-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md z-30 pb-3 text-[11px] font-black uppercase tracking-widest pl-4 w-[4%] text-center border-b border-zinc-200/50 dark:border-white/10">
                    <CheckSquare className="w-4 h-4 text-zinc-400 inline" />
                  </th>
                )}
                <th className="sticky top-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md z-30 pb-3 text-[11px] font-black uppercase tracking-widest pl-4 w-[18%] text-left border-b border-zinc-200/50 dark:border-white/10">
                  <div className="flex items-center gap-1.5 relative">
                    {renderSortableHeader('Flight', 'flight')}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveFilterPopup(activeFilterPopup === 'flight' ? null : 'flight');
                      }}
                      className={`p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer ${colFilterFlight ? 'text-blue-500 font-bold' : 'text-zinc-400 dark:text-zinc-500'}`}
                      title="Filter flights"
                    >
                      <Filter className="w-3.5 h-3.5" />
                    </button>
                    
                    {activeFilterPopup === 'flight' && (
                      <>
                        <div className="fixed inset-0 z-40 bg-transparent cursor-default" onClick={(e) => { e.stopPropagation(); setActiveFilterPopup(null); }} />
                        <div className="absolute top-full left-0 mt-2 p-3.5 bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-white/10 rounded-2xl shadow-xl z-50 w-64 text-left font-sans normal-case tracking-normal">
                          <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-zinc-150 dark:border-white/5">
                            <span className="text-xs font-black text-zinc-900 dark:text-white flex items-center gap-1.5 font-sans">
                              <Filter className="w-3.5 h-3.5 text-blue-500" />
                              Filter by Flight
                            </span>
                            {colFilterFlight && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); setColFilterFlight(''); }} 
                                className="text-[10px] text-zinc-400 hover:text-rose-500 font-bold cursor-pointer uppercase tracking-wider font-sans"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          
                          <input 
                            type="text"
                            value={colFilterFlight}
                            onChange={(e) => setColFilterFlight(e.target.value)}
                            placeholder="e.g. DL, Delta, DL104..."
                            className="w-full text-xs bg-zinc-50 dark:bg-black/30 border border-zinc-200 dark:border-white/5 rounded-xl px-2.5 py-2 focus:outline-none focus:border-blue-500/50 transition-colors placeholder-zinc-400 text-zinc-850 dark:text-zinc-100 font-sans mb-3"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />

                          <div className="border-t border-zinc-100 dark:border-white/5 pt-2.5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1.5 font-mono">Sort Flight Column By</span>
                            <div className="space-y-1">
                              {[
                                { key: 'airline', label: 'Airline Name' },
                                { key: 'identifier', label: 'Flight Number' },
                                { key: 'pnr', label: 'Booking Code (PNR)' }
                              ].map(opt => (
                                <button
                                  key={opt.key}
                                  onClick={(e) => { e.stopPropagation(); setSortField('flight'); setSortSubOption(opt.key); setActiveFilterPopup(null); }}
                                  className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg font-bold flex items-center justify-between transition-colors font-sans ${
                                    sortField === 'flight' && sortSubOption === opt.key
                                      ? 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400'
                                      : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-650 dark:text-zinc-400'
                                  }`}
                                >
                                  <span>{opt.label}</span>
                                  {sortField === 'flight' && sortSubOption === opt.key && <span className="text-[9px]">● Selected</span>}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </th>
                <th className="sticky top-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md z-30 pb-3 text-[11px] font-black uppercase tracking-widest w-[24%] text-left border-b border-zinc-200/50 dark:border-white/10">
                  <div className="flex items-center gap-1.5 relative">
                    {renderSortableHeader('Sector / Route', 'sector')}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveFilterPopup(activeFilterPopup === 'sector' ? null : 'sector');
                      }}
                      className={`p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer ${colFilterSector ? 'text-blue-500 font-bold' : 'text-zinc-400 dark:text-zinc-500'}`}
                      title="Filter sectors"
                    >
                      <Filter className="w-3.5 h-3.5" />
                    </button>
                    
                    {activeFilterPopup === 'sector' && (
                      <>
                        <div className="fixed inset-0 z-40 bg-transparent cursor-default" onClick={(e) => { e.stopPropagation(); setActiveFilterPopup(null); }} />
                        <div className="absolute top-full left-0 mt-2 p-3.5 bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-white/10 rounded-2xl shadow-xl z-50 w-64 text-left font-sans normal-case tracking-normal">
                          <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-zinc-150 dark:border-white/5 font-sans">
                            <span className="text-xs font-black text-zinc-900 dark:text-white flex items-center gap-1.5">
                              <Filter className="w-3.5 h-3.5 text-blue-500" />
                              Filter by Route
                            </span>
                            {colFilterSector && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); setColFilterSector(''); }} 
                                className="text-[10px] text-zinc-400 hover:text-rose-500 font-bold cursor-pointer uppercase tracking-wider font-sans"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          <input 
                            type="text"
                            value={colFilterSector}
                            onChange={(e) => setColFilterSector(e.target.value)}
                            placeholder="e.g. JFK, SFO, Paris..."
                            className="w-full text-xs bg-zinc-50 dark:bg-black/30 border border-zinc-200 dark:border-white/5 rounded-xl px-2.5 py-2 focus:outline-none focus:border-blue-500/50 transition-colors placeholder-zinc-400 text-zinc-850 dark:text-zinc-100 font-sans mb-3"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />

                          <div className="border-t border-zinc-100 dark:border-white/5 pt-2.5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1.5 font-mono">Sort Route Column By</span>
                            <div className="space-y-1">
                              {[
                                { key: 'route', label: 'Full Route Code' },
                                { key: 'origin', label: 'Origin Code Only' },
                                { key: 'destination', label: 'Destination Code' },
                                { key: 'duration', label: 'Flight Duration' }
                              ].map(opt => (
                                <button
                                  key={opt.key}
                                  onClick={(e) => { e.stopPropagation(); setSortField('sector'); setSortSubOption(opt.key); setActiveFilterPopup(null); }}
                                  className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg font-bold flex items-center justify-between transition-colors font-sans ${
                                    sortField === 'sector' && sortSubOption === opt.key
                                      ? 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400'
                                      : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-650 dark:text-zinc-400'
                                  }`}
                                >
                                  <span>{opt.label}</span>
                                  {sortField === 'sector' && sortSubOption === opt.key && <span className="text-[9px]">● Selected</span>}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </th>
                <th className="sticky top-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md z-30 pb-3 text-[11px] font-black uppercase tracking-widest w-[20%] text-left border-b border-zinc-200/50 dark:border-white/10">
                  <div className="flex items-center gap-1.5 relative">
                    {renderSortableHeader('Status', 'status')}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveFilterPopup(activeFilterPopup === 'status' ? null : 'status');
                      }}
                      className={`p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer ${colFilterStatus !== 'all' ? 'text-blue-500 font-bold' : 'text-zinc-400 dark:text-zinc-500'}`}
                      title="Filter status"
                    >
                      <Filter className="w-3.5 h-3.5" />
                    </button>
                    
                    {activeFilterPopup === 'status' && (
                      <>
                        <div className="fixed inset-0 z-40 bg-transparent cursor-default" onClick={(e) => { e.stopPropagation(); setActiveFilterPopup(null); }} />
                        <div className="absolute top-full left-0 mt-2 p-3.5 bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-white/10 rounded-2xl shadow-xl z-50 w-64 text-left font-sans normal-case tracking-normal">
                          <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-zinc-150 dark:border-white/5 font-sans">
                            <span className="text-xs font-black text-zinc-900 dark:text-white flex items-center gap-1.5">
                              <Filter className="w-3.5 h-3.5 text-blue-500" />
                              Filter by Status
                            </span>
                            {colFilterStatus !== 'all' && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); setColFilterStatus('all'); }} 
                                className="text-[10px] text-zinc-400 hover:text-rose-500 font-bold cursor-pointer uppercase tracking-wider font-sans"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                          <select
                            value={colFilterStatus}
                            onChange={(e) => setColFilterStatus(e.target.value)}
                            className="w-full text-xs bg-zinc-50 dark:bg-black/30 border border-zinc-200 dark:border-white/5 rounded-xl px-2.5 py-2 focus:outline-none focus:border-blue-500/50 transition-colors text-zinc-850 dark:text-zinc-100 font-sans cursor-pointer mb-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="all">All States</option>
                            <option value="scheduled">Scheduled</option>
                            <option value="delayed">Delayed</option>
                            <option value="boarded">Boarded</option>
                            <option value="canceled">Canceled</option>
                            <option value="on-time">On Time</option>
                          </select>

                          <div className="border-t border-zinc-100 dark:border-white/5 pt-2.5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1.5 font-mono">Sort Status Column By</span>
                            <div className="space-y-1">
                              {[
                                { key: 'statusLabel', label: 'Status Label Text' },
                                { key: 'scheduledFirst', label: 'Scheduled First' },
                                { key: 'canceledFirst', label: 'Canceled First' }
                              ].map(opt => (
                                <button
                                  key={opt.key}
                                  onClick={(e) => { e.stopPropagation(); setSortField('status'); setSortSubOption(opt.key); setActiveFilterPopup(null); }}
                                  className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg font-bold flex items-center justify-between transition-colors font-sans ${
                                    sortField === 'status' && sortSubOption === opt.key
                                      ? 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400'
                                      : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-650 dark:text-zinc-400'
                                  }`}
                                >
                                  <span>{opt.label}</span>
                                  {sortField === 'status' && sortSubOption === opt.key && <span className="text-[9px]">● Selected</span>}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </th>
                <th className="sticky top-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md z-30 pb-3 text-[11px] font-black uppercase tracking-widest w-[24%] text-left border-b border-zinc-200/50 dark:border-white/10">
                  <div className="flex items-center gap-1.5 relative">
                    {renderSortableHeader('Schedules & Timing', 'timing')}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveFilterPopup(activeFilterPopup === 'timing' ? null : 'timing');
                      }}
                      className={`p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer ${colFilterTimingDay !== 'all' ? 'text-blue-500 font-bold' : 'text-zinc-400 dark:text-zinc-500'}`}
                      title="Filter schedule days"
                    >
                      <Filter className="w-3.5 h-3.5" />
                    </button>
                    
                    {activeFilterPopup === 'timing' && (
                      <>
                        <div className="fixed inset-0 z-40 bg-transparent cursor-default" onClick={(e) => { e.stopPropagation(); setActiveFilterPopup(null); }} />
                        <div className="absolute top-full left-0 mt-2 p-3.5 bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-white/10 rounded-2xl shadow-xl z-50 w-64 text-left font-sans normal-case tracking-normal">
                          <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-zinc-150 dark:border-white/5 font-sans">
                            <span className="text-xs font-black text-zinc-900 dark:text-white flex items-center gap-1.5">
                              <Filter className="w-3.5 h-3.5 text-blue-500" />
                              Filter by Day of Week
                            </span>
                            {colFilterTimingDay !== 'all' && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); setColFilterTimingDay('all'); }} 
                                className="text-[10px] text-zinc-400 hover:text-rose-500 font-bold cursor-pointer uppercase tracking-wider font-sans"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                          
                          <select
                            value={colFilterTimingDay}
                            onChange={(e) => setColFilterTimingDay(e.target.value)}
                            className="w-full text-xs bg-zinc-50 dark:bg-black/30 border border-zinc-200 dark:border-white/5 rounded-xl px-2.5 py-2 focus:outline-none focus:border-blue-500/50 transition-colors text-zinc-850 dark:text-zinc-100 font-sans cursor-pointer mb-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="all">All Days of Week</option>
                            <option value="mon">Monday</option>
                            <option value="tue">Tuesday</option>
                            <option value="wed">Wednesday</option>
                            <option value="thu">Thursday</option>
                            <option value="fri">Friday</option>
                            <option value="sat">Saturday</option>
                            <option value="sun">Sunday</option>
                          </select>

                          <div className="border-t border-zinc-100 dark:border-white/5 pt-2.5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1.5 font-mono">Sort Schedules Column By</span>
                            <div className="space-y-1">
                              {[
                                { key: 'departure', label: 'Departure Date & Time' },
                                { key: 'departureHour', label: 'Departure Hour (0-23)' },
                                { key: 'arrival', label: 'Arrival Date & Time' },
                                { key: 'duration', label: 'Flight Duration Minutes' }
                              ].map(opt => (
                                <button
                                  key={opt.key}
                                  onClick={(e) => { e.stopPropagation(); setSortField('timing'); setSortSubOption(opt.key); setActiveFilterPopup(null); }}
                                  className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg font-bold flex items-center justify-between transition-colors font-sans ${
                                    sortField === 'timing' && sortSubOption === opt.key
                                      ? 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400'
                                      : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-650 dark:text-zinc-400'
                                  }`}
                                >
                                  <span>{opt.label}</span>
                                  {sortField === 'timing' && sortSubOption === opt.key && <span className="text-[9px]">● Selected</span>}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </th>
                <th className="sticky top-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md z-30 pb-3 text-[11px] font-black uppercase tracking-widest w-[14%] text-left border-b border-zinc-200/50 dark:border-white/10">
                  <div className="flex items-center gap-1.5 relative">
                    {renderSortableHeader('Seat & Class', 'seat')}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveFilterPopup(activeFilterPopup === 'seat' ? null : 'seat');
                      }}
                      className={`p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer ${colFilterSeat !== 'all' ? 'text-blue-500 font-bold' : 'text-zinc-400 dark:text-zinc-500'}`}
                      title="Filter seats"
                    >
                      <Filter className="w-3.5 h-3.5" />
                    </button>
                    
                    {activeFilterPopup === 'seat' && (
                      <>
                        <div className="fixed inset-0 z-40 bg-transparent cursor-default" onClick={(e) => { e.stopPropagation(); setActiveFilterPopup(null); }} />
                        <div className="absolute top-full right-0 mt-2 p-3.5 bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-white/10 rounded-2xl shadow-xl z-50 w-64 text-left font-sans normal-case tracking-normal">
                          <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-zinc-150 dark:border-white/5 font-sans">
                            <span className="text-xs font-black text-zinc-900 dark:text-white flex items-center gap-1.5">
                              <Filter className="w-3.5 h-3.5 text-blue-500" />
                              Seat & Class Filter
                            </span>
                            {colFilterSeat !== 'all' && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); setColFilterSeat('all'); }} 
                                className="text-[10px] text-zinc-400 hover:text-rose-500 font-bold cursor-pointer uppercase tracking-wider font-sans"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                          <select
                            value={colFilterSeat}
                            onChange={(e) => setColFilterSeat(e.target.value)}
                            className="w-full text-xs bg-zinc-50 dark:bg-black/30 border border-zinc-200 dark:border-white/5 rounded-xl px-2.5 py-2 focus:outline-none focus:border-blue-500/50 transition-colors text-zinc-850 dark:text-zinc-100 font-sans cursor-pointer mb-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="all">All Seats/Classes</option>
                            <option value="assigned">Assigned Seat Only</option>
                            <option value="unassigned">Unassigned Seat Only</option>
                            <option value="class-economy">Economy Class</option>
                            <option value="class-premium">Premium Economy</option>
                            <option value="class-business">Business Class</option>
                            <option value="class-first">First Class</option>
                          </select>

                          <div className="border-t border-zinc-100 dark:border-white/5 pt-2.5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1.5 font-mono">Sort Seat Column By</span>
                            <div className="space-y-1">
                              {[
                                { key: 'seatNumber', label: 'Seat Code Alphanumeric' },
                                { key: 'cabinTier', label: 'Cabin Class Tier (H-L)' },
                                { key: 'cost', label: 'Ticket cost Price' }
                              ].map(opt => (
                                <button
                                  key={opt.key}
                                  onClick={(e) => { e.stopPropagation(); setSortField('seat'); setSortSubOption(opt.key); setActiveFilterPopup(null); }}
                                  className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg font-bold flex items-center justify-between transition-colors font-sans ${
                                    sortField === 'seat' && sortSubOption === opt.key
                                      ? 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400'
                                      : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-650 dark:text-zinc-400'
                                  }`}
                                >
                                  <span>{opt.label}</span>
                                  {sortField === 'seat' && sortSubOption === opt.key && <span className="text-[9px]">● Selected</span>}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </th>
                <th className="sticky top-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md z-30 pb-3 text-right pr-4 w-[2%] border-b border-zinc-200/50 dark:border-white/10"></th>
              </tr>
            </thead>
          </table>

          {/* Grouped Years & Flights List with Custom Panels Container */}
          {groupedByYear.map(({ year, groups }) => (
            <div key={year} className="space-y-6">
              {/* Year Header Banner */}
              <div className="flex items-center gap-2 pb-2 border-b border-zinc-250 dark:border-white/10 ml-2">
                <Calendar className="w-5 h-5 text-blue-500" />
                <h3 className="text-sm font-black uppercase tracking-widest text-zinc-900 dark:text-white">Year {year}</h3>
              </div>

              {/* List of Trip Group cards with rounded border containers */}
              <div className="space-y-6">
                {groups.map(({ trip, outbound, returnLegs }) => {
                  const isIndependent = trip.id.startsWith('unassigned');
                  return (
                    <div
                      key={trip.id}
                      className={isIndependent
                        ? "p-1 min-w-0 md:min-w-[950px] w-full"
                        : "p-4 md:p-6 transition-all duration-300 rounded-[2rem] md:rounded-[2.5rem] bg-gradient-to-br from-blue-50/45 via-white/50 to-blue-50/10 dark:from-blue-950/10 dark:via-zinc-900/40 dark:to-blue-950/5 border-2 border-blue-500/20 dark:border-blue-400/15 shadow-md shadow-blue-500/5 min-w-0 md:min-w-[950px] w-full"
                      }
                    >
                      {/* Sub-header block for trip groups inside container (Only for actual bundles) */}
                      {!isIndependent && (
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5 pb-4 border-b border-zinc-200/40 dark:border-white/5 ml-1">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-2xl border bg-blue-500/10 text-blue-500 border-blue-500/15 animate-none">
                              <Compass className="w-5 h-5 animate-spin-slow" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-base font-black text-zinc-850 dark:text-zinc-200 uppercase tracking-widest leading-none">
                                  {trip.name}
                                </span>
                              </div>
                              {trip.location && (
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-bold mt-1 flex items-center gap-1">
                                  <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                                  {trip.location}
                                </p>
                              )}
                            </div>
                          </div>
                          {(trip.startDate || trip.endDate) && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/60 dark:bg-white/5 rounded-2xl text-[10px] font-mono font-bold text-zinc-500 dark:text-zinc-400 border border-zinc-200/40 dark:border-transparent">
                              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                              {trip.startDate} {trip.endDate && trip.endDate !== trip.startDate ? `→ ${trip.endDate}` : ''}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Desktop Flight leg rows */}
                      <table className="hidden md:table w-full text-left border-separate border-spacing-y-2.5 min-w-[900px] table-fixed">
                        <colgroup>
                          {isMultiEditing && <col style={{ width: '4%' }} />}
                          <col style={{ width: '18%' }} />
                          <col style={{ width: '24%' }} />
                          <col style={{ width: '20%' }} />
                          <col style={{ width: '24%' }} />
                          <col style={{ width: '14%' }} />
                          <col style={{ width: '2%' }} />
                        </colgroup>
                        <tbody>
                          {outbound && outbound.length > 0 && outbound.map((flight, idx) => renderTableRow(flight, idx, outbound, trip))}
                          {returnLegs && returnLegs.length > 0 && returnLegs.map((flight, idx) => renderTableRow(flight, idx, returnLegs, trip))}
                        </tbody>
                      </table>

                      {/* Mobile Flight cards stack */}
                      <div className="flex flex-col gap-5 md:hidden">
                        {outbound && outbound.length > 0 && renderMobileTripContainer(outbound, 'Outbound', trip)}
                        {returnLegs && returnLegs.length > 0 && renderMobileTripContainer(returnLegs, 'Return', trip)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Multi-Selection Bottom Action Bar */}
      {isMultiEditing && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/95 dark:bg-zinc-900/95 border border-zinc-200/50 dark:border-white/10 px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-6 backdrop-blur-md z-40 animate-scale-up">
          <span className="text-xs font-black font-mono text-zinc-650 dark:text-zinc-300">
            Selected: <span className="text-blue-500 font-extrabold">{selectedFlightIds.size}</span>
          </span>
          
          <div className="h-4 w-[1px] bg-zinc-200 dark:bg-white/10" />
          
          <button
            onClick={() => {
              const allIds = new Set(filteredFlights.map(f => f.flight.id));
              setSelectedFlightIds(allIds);
            }}
            className="text-xs font-bold text-zinc-650 dark:text-zinc-400 hover:text-blue-500 cursor-pointer transition-colors"
          >
            Select All
          </button>
          <button
            onClick={() => {
              setSelectedFlightIds(new Set());
            }}
            className="text-xs font-bold text-zinc-650 dark:text-zinc-400 hover:text-blue-500 cursor-pointer transition-colors"
          >
            Deselect All
          </button>
          
          <div className="h-4 w-[1px] bg-zinc-200 dark:bg-white/10" />
          
          <button
            disabled={selectedFlightIds.size === 0}
            onClick={() => {
              setIsBundling(true);
            }}
            className={`text-xs font-black uppercase text-blue-500 hover:text-blue-650 flex items-center gap-1.5 cursor-pointer transition-colors ${selectedFlightIds.size === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <FolderPlus className="w-4 h-4" />
            Bundle ({selectedFlightIds.size})
          </button>

          {/* Calculate bundled flights selected for Unbundle action */}
          {(() => {
            const selectedBundledCount = Array.from(selectedFlightIds).filter(id => {
              const flightRec = flights.find(f => f.flight.id === id);
              return flightRec && flightRec.trip.id !== 'unassigned' && !flightRec.trip.id.startsWith('unassigned');
            }).length;

            return (
              <>
                <div className="h-4 w-[1px] bg-zinc-200 dark:bg-white/10" />

                <button
                  disabled={selectedBundledCount === 0}
                  onClick={() => {
                    setUnbundleConfirmTarget(selectedBundledCount);
                  }}
                  className={`text-xs font-black uppercase text-amber-500 hover:text-amber-650 flex items-center gap-1.5 cursor-pointer transition-colors ${selectedBundledCount === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <FolderMinus className="w-4 h-4" />
                  Unbundle ({selectedBundledCount})
                </button>
              </>
            );
          })()}

          <div className="h-4 w-[1px] bg-zinc-200 dark:bg-white/10" />
          
          <button
            disabled={selectedFlightIds.size === 0}
            onClick={() => {
              setDeleteConfirmTarget({
                type: 'multi',
                multiCount: selectedFlightIds.size
              });
            }}
            className={`text-xs font-black uppercase text-red-500 hover:text-red-650 flex items-center gap-1.5 cursor-pointer transition-colors ${selectedFlightIds.size === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <Trash2 className="w-4 h-4" />
            Delete Selected ({selectedFlightIds.size})
          </button>
        </div>
      )}

      {/* Unbundle Confirmation Modal */}
      {unbundleConfirmTarget !== null && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-[60] animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-zinc-200 dark:border-white/5 animate-scale-up">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-amber-500/10 dark:bg-amber-500/20 rounded-full flex items-center justify-center text-amber-500 mb-5 border border-amber-500/20">
                <FolderMinus className="w-8 h-8" />
              </div>
              
              <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-wider mb-2">
                Unbundle Flights
              </h3>
              
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
                Are you sure you want to unbundle the <span className="font-extrabold text-blue-500">{unbundleConfirmTarget}</span> selected flights?
                This will separate them from their respective trip itinerary bundles and return them to independent flights.
              </p>

              <div className="flex items-center gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setUnbundleConfirmTarget(null)}
                  className="flex-1 py-3.5 px-5 rounded-2xl text-sm font-bold bg-zinc-100 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-250 dark:hover:bg-white/10 transition-all cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeUnbundle}
                  className="flex-1 py-3.5 px-5 rounded-2xl text-sm font-black uppercase tracking-wider bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20 transition-all cursor-pointer text-center"
                >
                  Unbundle
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-[60] animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-zinc-200 dark:border-white/5 animate-scale-up">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-500/10 dark:bg-red-500/20 rounded-full flex items-center justify-center text-red-500 mb-5 border border-red-500/20 animate-pulse">
                <Trash2 className="w-8 h-8" />
              </div>
              
              <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-wider mb-2">
                Confirm Deletion
              </h3>
              
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
                {deleteConfirmTarget.type === 'single' ? (
                  <>
                    Are you sure you want to permanently delete flight{" "}
                    <span className="font-extrabold text-blue-500">
                      {deleteConfirmTarget.singleRecord?.flight.provider}{" "}
                      {deleteConfirmTarget.singleRecord?.flight.identifier}
                    </span>
                    ? This travel leg will be permanently removed.
                  </>
                ) : (
                  <>
                    Are you sure you want to permanently delete the{" "}
                    <span className="font-extrabold text-blue-500">
                      {deleteConfirmTarget.multiCount}
                    </span>{" "}
                    selected flights? This will remove these travel legs from all itineraries and cannot be undone.
                  </>
                )}
              </p>

              <div className="flex items-center gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmTarget(null)}
                  className="flex-1 py-3.5 px-5 rounded-2xl text-sm font-bold bg-zinc-100 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-250 dark:hover:bg-white/10 transition-all cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (deleteConfirmTarget.type === 'single' && deleteConfirmTarget.singleRecord) {
                      await executeSingleDelete(deleteConfirmTarget.singleRecord);
                    } else if (deleteConfirmTarget.type === 'multi') {
                      await executeMultiDelete();
                    }
                  }}
                  className="flex-1 py-3.5 px-5 rounded-2xl text-sm font-black uppercase tracking-wider bg-red-500 hover:bg-red-650 text-white shadow-lg shadow-red-500/20 transition-all cursor-pointer text-center"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bundling Modal */}
      {isBundling && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-[60] animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-zinc-200 dark:border-white/5 animate-scale-up">
            <div className="flex flex-col">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 bg-blue-500/10 dark:bg-blue-500/20 rounded-full flex items-center justify-center text-blue-500 border border-blue-500/20">
                  <FolderPlus className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-wider">
                    Bundle Flights
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Group {selectedFlightIds.size} selected flights into a single trip itinerary.
                  </p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-450 dark:text-zinc-500 mb-1.5">
                    Trip / Bundle Name
                  </label>
                  <input
                    type="text"
                    value={bundleName}
                    onChange={(e) => setBundleName(e.target.value)}
                    placeholder="e.g. Paris Getaway"
                    className="w-full px-4 py-3 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/5 rounded-2xl text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 text-gray-900 dark:text-white"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-450 dark:text-zinc-500 mb-1.5">
                    Destination / Location
                  </label>
                  <input
                    type="text"
                    value={bundleLocation}
                    onChange={(e) => setBundleLocation(e.target.value)}
                    placeholder="e.g. Paris, France"
                    className="w-full px-4 py-3 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/5 rounded-2xl text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 text-gray-900 dark:text-white"
                  />
                </div>

                <div className="flex items-start gap-3 mt-4 p-3 bg-zinc-50 dark:bg-black/10 rounded-2xl border border-zinc-200/50 dark:border-white/5">
                  <input
                    type="checkbox"
                    id="createTripInPlanner"
                    checked={createTripInPlanner}
                    onChange={(e) => setCreateTripInPlanner(e.target.checked)}
                    className="mt-1 h-4 w-4 text-blue-500 rounded border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="createTripInPlanner" className="text-xs text-zinc-650 dark:text-zinc-400 leading-relaxed cursor-pointer select-none">
                    <span className="font-extrabold text-zinc-800 dark:text-zinc-250 block">Create Trip in Planner</span>
                    If checked, this bundle will also appear as a structured vacation itinerary in the Planner view.
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setIsBundling(false)}
                  className="flex-1 py-3.5 px-5 rounded-2xl text-sm font-bold bg-zinc-100 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-250 dark:hover:bg-white/10 transition-all cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!bundleName.trim()}
                  onClick={executeBundle}
                  className="flex-1 py-3.5 px-5 rounded-2xl text-sm font-black uppercase tracking-wider bg-blue-500 hover:bg-blue-650 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-lg shadow-blue-500/20 transition-all cursor-pointer text-center"
                >
                  Create Bundle
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Form Modal */}
      {isEditing && (
        <div 
          className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in"
          onBlurCapture={() => {
            if (!editingFlight) {
              const draft = {
                formTripId, formNewTripName, formAirline, formFlightNum,
                formConfirmation, formOrigin, formDestination,
                formDepartureDate, formDepartureTime, formArrivalDate,
                formArrivalTime, formDuration, formClass,
                formSeatNumber, formSeatType, formCost,
                formActualDepartureTime, formActualArrivalTime
              };
              localStorage.setItem('flightFormDraft', JSON.stringify(draft));
            }
          }}
        >
          <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-6 max-w-lg w-full shadow-2xl border border-gray-200/20 dark:border-white/5 animate-scale-up max-h-[90vh] overflow-y-auto custom-scrollbar">
            
            <div className="flex items-center justify-between border-b border-gray-150/50 dark:border-white/5 pb-4 mb-6">
              <h3 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                <Plane className="w-6 h-6 rotate-45 text-blue-500" />
                {editingFlight ? 'Edit Flights' : 'New Flight Record'}
              </h3>
              <button 
                onClick={() => setIsEditing(false)}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-white text-sm font-bold cursor-pointer"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSaveFlight} className="space-y-6">
              {/* Trip Association Section */}
              <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-3xl border border-gray-100 dark:border-white/5 space-y-4">
                <Select
                  label="Link to Expedition"
                  value={formTripId}
                  onChange={e => setFormTripId(e.target.value)}
                  options={[
                    { label: "Independent Flight (Not attached to Expedition)", value: "unassigned" },
                    ...trips.map(t => ({ label: `Add to Trip: ${t.name}`, value: t.id }))
                  ]}
                />
              </div>

              {/* Legs Setup */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <Input 
                    label="Airline / Operator"
                    placeholder="e.g. DL, Delta Air Lines, Emirates"
                    value={formAirline}
                    onChange={e => setFormAirline(e.target.value)}
                  />
                  {formAirline && formAirline.trim().toUpperCase() !== getCarrierName(formAirline).toUpperCase() && (
                    <span className="text-[10px] text-emerald-500 font-bold mt-1 ml-1 flex items-center gap-1">
                       <Sparkles className="w-3 h-3 text-emerald-500 animate-pulse" /> {getCarrierName(formAirline)}
                    </span>
                  )}
                </div>
                <Input 
                  label="Flight Number"
                  placeholder="e.g. DL104, EK201"
                  value={formFlightNum}
                  onChange={e => setFormFlightNum(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <Input 
                    label="Origin Airport Code"
                    placeholder="e.g. JFK, SFO"
                    value={formOrigin}
                    onChange={e => setFormOrigin(e.target.value)}
                    maxLength={10}
                  />
                  {formOrigin && (
                    formOrigin.trim().toUpperCase() === getCityName(formOrigin).toUpperCase() ? (
                      <span className="text-[10px] text-amber-500 font-bold mt-1 ml-1 flex items-center gap-1">
                         <HelpCircle className="w-3 h-3" /> Unrecognized code
                      </span>
                    ) : (
                      <span className="text-[10px] text-emerald-500 font-bold mt-1 ml-1 flex items-center gap-1 animate-fadeIn">
                         <Sparkles className="w-3 h-3 text-emerald-500 animate-pulse" /> {getCityName(formOrigin)}
                      </span>
                    )
                  )}
                </div>
                <div className="flex flex-col">
                  <Input 
                    label="Destination Airport Code"
                    placeholder="e.g. LHR, DXB"
                    value={formDestination}
                    onChange={e => setFormDestination(e.target.value)}
                    maxLength={10}
                  />
                  {formDestination && (
                    formDestination.trim().toUpperCase() === getCityName(formDestination).toUpperCase() ? (
                      <span className="text-[10px] text-amber-500 font-bold mt-1 ml-1 flex items-center gap-1">
                         <HelpCircle className="w-3 h-3" /> Unrecognized code
                      </span>
                    ) : (
                      <span className="text-[10px] text-emerald-500 font-bold mt-1 ml-1 flex items-center gap-1 animate-fadeIn">
                         <Sparkles className="w-3 h-3 text-emerald-500 animate-pulse" /> {getCityName(formDestination)}
                      </span>
                    )
                  )}
                </div>
              </div>

              {/* Timestamp Config */}
              <div className="grid grid-cols-2 gap-4 border-t border-dashed border-gray-150 dark:border-white/5 pt-4">
                <Input 
                  label="Departure Date"
                  type="date"
                  value={formDepartureDate}
                  onChange={e => setFormDepartureDate(e.target.value)}
                />
                <Input 
                  label="Departure Time"
                  placeholder="e.g. 10:30, 22:15"
                  value={formDepartureTime}
                  onChange={e => setFormDepartureTime(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input 
                  label="Arrival Date"
                  type="date"
                  value={formArrivalDate}
                  onChange={e => setFormArrivalDate(e.target.value)}
                />
                <Input 
                  label="Arrival Time"
                  placeholder="e.g. 14:15, 06:45"
                  value={formArrivalTime}
                  onChange={e => setFormArrivalTime(e.target.value)}
                />
              </div>

              {/* Actual/Real-Time Tracking (Optional) */}
              <div className="p-4 bg-emerald-500/5 dark:bg-emerald-500/5 rounded-3xl border border-emerald-500/20 dark:border-emerald-500/15 space-y-4">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 animate-pulse" />
                  <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest leading-none">
                    Actual/Delay Live Tracking (Optional)
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input 
                    label="Actual Departure Time"
                    placeholder="e.g. 10:45"
                    value={formActualDepartureTime}
                    onChange={e => setFormActualDepartureTime(e.target.value)}
                  />
                  <Input 
                    label="Actual Arrival Time"
                    placeholder="e.g. 14:30"
                    value={formActualArrivalTime}
                    onChange={e => setFormActualArrivalTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Select 
                  label="Cabin Class"
                  value={formClass}
                  onChange={e => setFormClass(e.target.value as any)}
                  options={[
                    { label: "Economy", value: "Economy" },
                    { label: "Premium Econ", value: "Premium Economy" },
                    { label: "Business", value: "Business" },
                    { label: "First Class", value: "First" }
                  ]}
                />
                <Input 
                  label="Seat Code"
                  placeholder="e.g. 17C, 12A"
                  value={formSeatNumber}
                  onChange={e => setFormSeatNumber(e.target.value)}
                />
                <Select 
                  label="Seat Position"
                  value={formSeatType}
                  onChange={e => setFormSeatType(e.target.value as any)}
                  options={[
                    { label: "Window", value: "Window" },
                    { label: "Aisle", value: "Aisle" },
                    { label: "Middle", value: "Middle" }
                  ]}
                />
                <SeatLayoutOverlay cabinClass={formClass} seatNumber={formSeatNumber} />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-dashed border-gray-150 dark:border-white/5">
                <Input 
                  label="Booking Locator (PNR)"
                  placeholder="e.g. XG7HK9"
                  value={formConfirmation}
                  onChange={e => setFormConfirmation(e.target.value)}
                />
                <Input 
                  label="Cost Estimate ($)"
                  placeholder="e.g. 450"
                  type="number"
                  value={formCost}
                  onChange={e => setFormCost(e.target.value)}
                />
              </div>

              <div className="flex gap-3 pt-6">
                <Button 
                  type="button" 
                  variant="ghost" 
                  className="flex-1 rounded-2xl cursor-pointer"
                  onClick={() => {
                    setIsEditing(false);
                    setEditingFlight(null);
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  variant="primary" 
                  className="flex-1 rounded-2xl cursor-pointer"
                >
                  Save Boarding Stub
                </Button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
};
