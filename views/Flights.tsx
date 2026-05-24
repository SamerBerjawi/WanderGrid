import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Filter, Plus, Calendar, MapPin, Trash2, Edit2, 
  ArrowRight, Plane, Landmark, Award, Clock, DollarSign, BarChart2, Briefcase, FileText, Compass, Heart, HelpCircle, RefreshCw, Upload, Download, Tag, UserCheck, Star, Sparkles, Grid, List
} from 'lucide-react';
import { Card, Button, Input, Select, Badge, TimeInput } from '../components/ui';
import { Trip, Transport, User } from '../types';
import { dataService } from '../services/mockDb';
import { FlightyPassport } from '../components/FlightyPassport';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { getCityName, getCarrierName } from '../utils/flightData';

const AirlineLogo: React.FC<{ provider?: string, fallback: React.ReactNode }> = ({ provider, fallback }) => {
  const [error, setError] = useState(false);

  if (!provider) return <>{fallback}</>;

  const getAirlineLogoUrl = (airlineName: string): string => {
    const cleaned = airlineName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const mappings: Record<string, string> = {
      'deltaairlines': 'delta.com', 'delta': 'delta.com', 'americanairlines': 'aa.com', 'american': 'aa.com',
      'unitedairlines': 'united.com', 'united': 'united.com', 'southwestairlines': 'southwest.com', 'southwest': 'southwest.com',
      'britishairways': 'britishairways.com', 'emirates': 'emirates.com', 'qatarairways': 'qatarairways.com', 'qatar': 'qatarairways.com',
      'lufthansa': 'lufthansa.com', 'airfrance': 'airfrance.com', 'klm': 'klm.com', 'singaporeairlines': 'singaporeair.com',
      'cathaypacific': 'cathaypacific.com', 'ana': 'ana.co.jp', 'japanairlines': 'jal.com', 'jal': 'jal.com',
      'ryanair': 'ryanair.com', 'easyjet': 'easyjet.com'
    };
    const domain = mappings[cleaned] || `${cleaned}.com`;
    return `https://asset.brandfetch.io/${domain}/logo?theme=light`;
  };

  if (error) return <>{fallback}</>;

  return (
    <img 
      src={getAirlineLogoUrl(provider)} 
      alt={provider} 
      className="w-6 h-6 object-contain rounded" 
      referrerPolicy="no-referrer"
      onError={() => setError(true)}
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

  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = () => {
    Promise.all([
      dataService.getTrips(),
      dataService.getUsers()
    ]).then(([t, u]) => {
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
      // Sort by departureDate ascending
      extracted.sort((a, b) => {
        const dateA = new Date(`${a.flight.departureDate}T${a.flight.departureTime || '00:00'}`);
        const dateB = new Date(`${b.flight.departureDate}T${b.flight.departureTime || '00:00'}`);
        return dateB.getTime() - dateA.getTime(); // Newest first
      });
      setFlights(extracted);
    });
  };

  // Set up form state for edit or new
  const openFlightForm = (record?: { flight: Transport; trip: Trip }) => {
    if (record) {
      setEditingFlight({ flight: record.flight, tripId: record.trip.id });
      setFormTripId(record.trip.id);
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
    } else {
      setEditingFlight(null);
      setFormTripId(trips.length > 0 ? trips[0].id : 'new');
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
      let targetTrip: Trip;

      if (formTripId === 'new') {
        // Create a new trip for this flight automatically
        const tripName = formNewTripName.trim() || `Flight: ${formOrigin} to ${formDestination}`;
        const newTrip: Trip = {
          id: Math.random().toString(36).substr(2, 9),
          name: tripName,
          location: formDestination,
          startDate: formDepartureDate,
          endDate: formArrivalDate || formDepartureDate,
          status: new Date(formDepartureDate) > new Date() ? 'Upcoming' : 'Past',
          participants: users.length > 0 ? [users[0].id] : [],
          privacy: 'Private',
          transports: []
        };
        targetTrip = await dataService.addTrip(newTrip);
      } else {
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
        duration: formDuration,
        travelClass: formClass,
        seatNumber: formSeatNumber,
        seatType: formSeatType,
        cost: isNaN(costNum as number) ? undefined : costNum
      };

      if (editingFlight) {
        // We might be changing the trip as well as the flight leg
        if (editingFlight.tripId !== formTripId) {
          // Remove from old trip
          const oldTrip = trips.find(t => t.id === editingFlight.tripId);
          if (oldTrip && oldTrip.transports) {
            oldTrip.transports = oldTrip.transports.filter(t => t.id !== editingFlight.flight.id);
            await dataService.updateTrip(oldTrip);
          }
          // Add to new trip
          if (!targetTrip.transports) targetTrip.transports = [];
          targetTrip.transports.push(flightPayload);
          await dataService.updateTrip(targetTrip);
        } else {
          // Editing in place
          if (!targetTrip.transports) targetTrip.transports = [];
          const idx = targetTrip.transports.findIndex(t => t.id === editingFlight.flight.id);
          if (idx >= 0) {
            targetTrip.transports[idx] = flightPayload;
          } else {
            targetTrip.transports.push(flightPayload);
          }
          await dataService.updateTrip(targetTrip);
        }
      } else {
        // Create new flight payload
        if (!targetTrip.transports) targetTrip.transports = [];
        targetTrip.transports.push(flightPayload);
        await dataService.updateTrip(targetTrip);
      }

      setIsEditing(false);
      setEditingFlight(null);
      refreshData();
    } catch (e) {
      console.error(e);
      alert("Failed to save flight records.");
    }
  };

  const handleDeleteFlight = async (flightRecord: { flight: Transport; trip: Trip }) => {
    if (!confirm(`Are you sure you want to delete flight ${flightRecord.flight.provider} ${flightRecord.flight.identifier}?`)) {
      return;
    }
    const targetTrip = { ...flightRecord.trip };
    if (targetTrip.transports) {
      targetTrip.transports = targetTrip.transports.filter(t => t.id !== flightRecord.flight.id);
      await dataService.updateTrip(targetTrip);
      refreshData();
    }
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
      const deptDate = new Date(`${item.flight.departureDate}T${item.flight.departureTime || '00:00'}`);
      if (timeFilter === 'upcoming' && deptDate < today) return false;
      if (timeFilter === 'past' && deptDate >= today) return false;

      // Cabin filter
      if (classFilter !== 'all' && item.flight.travelClass !== classFilter) return false;

      // Year filter
      if (yearFilter !== 'all') {
        const yr = new Date(item.flight.departureDate).getFullYear().toString();
        if (yr !== yearFilter) return false;
      }

      return true;
    });
  }, [flights, searchQuery, timeFilter, classFilter, yearFilter]);

  const groupedFlights = useMemo(() => {
    const groups: { [tripId: string]: { trip: Trip, flights: Transport[] } } = {};
    filteredFlights.forEach(item => {
      if (!groups[item.trip.id]) {
        groups[item.trip.id] = { trip: item.trip, flights: [] };
      }
      groups[item.trip.id].flights.push(item.flight);
    });
    
    // Sort flights inside each group by departure date/time
    Object.values(groups).forEach(g => {
      g.flights.sort((a, b) => {
        const da = new Date(`${a.departureDate}T${a.departureTime || '00:00'}`);
        const db = new Date(`${b.departureDate}T${b.departureTime || '00:00'}`);
        return da.getTime() - db.getTime();
      });
    });

    // Sort groups themselves by the first flight's departure date/time (most recent upcoming, or past descending)
    const sortedGroups = Object.values(groups).sort((a, b) => {
      const da = new Date(`${a.flights[0].departureDate}T${a.flights[0].departureTime || '00:00'}`);
      const db = new Date(`${b.flights[0].departureDate}T${b.flights[0].departureTime || '00:00'}`);
      
      // If timeFilter is 'past' we might want descending
      if (timeFilter === 'past') {
        return db.getTime() - da.getTime();
      }
      return da.getTime() - db.getTime(); // default ascending
    });

    return sortedGroups;
  }, [filteredFlights, timeFilter]);

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
      const deptDate = new Date(`${item.flight.departureDate}T${item.flight.departureTime || '00:00'}`);
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
            Add Boarding Pass
          </Button>
        </div>
      </div>

      {/* Passport Panel & Filters Unified */}
      <div className="flex flex-col gap-6">
        <FlightyPassport flights={filteredFlights.map(f => f.flight)} yearFilter={yearFilter}>
          {/* Dynamic Search Board and Filters */}
          <div className="space-y-5">
            {/* Search and Dropdowns */}
            <div className="flex flex-col xl:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#141b6c]/50 dark:text-blue-200/50 w-[18px] h-[18px] pointer-events-none" />
                <input 
                  type="text"
                  placeholder="Search by airline, code, city, booking locator..."
                  className="w-full pl-[2.6rem] pr-5 py-2.5 rounded-2xl bg-white/50 border border-white/40 focus:border-white/80 focus:bg-white outline-none font-medium text-sm text-[#141b6c] dark:bg-black/20 dark:border-white/10 dark:text-blue-50 dark:placeholder-blue-200/50 dark:focus:bg-black/30 shadow-sm transition-all placeholder:text-[#141b6c]/50"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                {/* Travel Timeline Indicator */}
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setTimeFilter('all')}
                    className={`px-5 py-2.5 text-sm rounded-2xl font-bold transition-all cursor-pointer ${timeFilter === 'all' ? 'bg-[#141b6c] text-white shadow-lg shadow-[#141b6c]/20' : 'bg-white/40 text-[#141b6c] hover:bg-white/60 dark:bg-black/20 dark:text-blue-100 dark:hover:bg-black/40 border border-white/30 dark:border-white/10'}`}
                  >
                    All
                  </button>
                  <button 
                    onClick={() => setTimeFilter('upcoming')}
                    className={`px-5 py-2.5 text-sm rounded-2xl font-bold transition-all cursor-pointer ${timeFilter === 'upcoming' ? 'bg-[#141b6c] text-white shadow-lg shadow-[#141b6c]/20' : 'bg-white/40 text-[#141b6c] hover:bg-white/60 dark:bg-black/20 dark:text-blue-100 dark:hover:bg-black/40 border border-white/30 dark:border-white/10'}`}
                  >
                    Upcoming
                  </button>
                  <button 
                    onClick={() => setTimeFilter('past')}
                    className={`px-5 py-2.5 text-sm rounded-2xl font-bold transition-all cursor-pointer ${timeFilter === 'past' ? 'bg-[#141b6c] text-white shadow-lg shadow-[#141b6c]/20' : 'bg-white/40 text-[#141b6c] hover:bg-white/60 dark:bg-black/20 dark:text-blue-100 dark:hover:bg-black/40 border border-white/30 dark:border-white/10'}`}
                  >
                    Past
                  </button>
                </div>

                {/* Cabin Class Select filter */}
                <select
                  className="px-5 py-2.5 text-sm rounded-2xl font-bold bg-white/40 text-[#141b6c] border border-white/30 hover:bg-white/60 shadow-sm dark:bg-black/20 dark:text-blue-100 dark:border-white/10 dark:hover:bg-black/40 outline-none cursor-pointer transition-all appearance-none pr-8"
                  value={classFilter}
                  onChange={e => setClassFilter(e.target.value)}
                >
                  <option value="all" className="text-black">Any Cabin</option>
                  <option value="Economy" className="text-black">Economy</option>
                  <option value="Premium Economy" className="text-black">Premium Economy</option>
                  <option value="Business" className="text-black">Business</option>
                  <option value="First" className="text-black">First Only</option>
                </select>
              </div>
            </div>

            {/* Year Filter Horizontal Scroll Bar */}
            <div className="flex overflow-x-auto gap-3 pb-1 custom-scrollbar items-center">
              <button
                onClick={() => setYearFilter('all')}
                className={`shrink-0 px-5 py-2.5 text-sm rounded-2xl font-bold transition-all whitespace-nowrap cursor-pointer ${yearFilter === 'all' ? 'bg-[#141b6c] text-white shadow-lg shadow-[#141b6c]/20' : 'bg-white/40 text-[#141b6c] border border-white/30 hover:bg-white/60 shadow-sm dark:bg-black/20 dark:text-blue-100 dark:border-white/10 dark:hover:bg-black/40'}`}
              >
                All Time
              </button>
              
              <div className="w-[1px] h-6 bg-[#141b6c]/20 dark:bg-white/10 shrink-0 mx-1"></div>
              
              {uniqueYears.map(yr => (
                <button
                  key={yr}
                  onClick={() => setYearFilter(yr)}
                  className={`shrink-0 px-5 py-2.5 text-sm rounded-2xl font-bold transition-all whitespace-nowrap cursor-pointer ${yearFilter === yr ? 'bg-[#141b6c] text-white shadow-lg shadow-[#141b6c]/20' : 'bg-white/40 text-[#141b6c] border border-white/30 hover:bg-white/60 shadow-sm dark:bg-black/20 dark:text-blue-100 dark:border-white/10 dark:hover:bg-black/40'}`}
                >
                  {yr}
                </button>
              ))}
            </div>
          </div>
        </FlightyPassport>
      </div>

      {/* Aggregate metrics bento panel */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {/* Dynamic Flight Total Stats */}
        <div className="bg-white/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-white/5 shadow-md rounded-3xl p-5 relative overflow-hidden group hover:border-blue-500/20 transition-all duration-300">
          <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/5 rounded-full blur-xl pointer-events-none group-hover:scale-125 transition-transform" />
          <span className="block text-[10px] font-black uppercase text-gray-400 dark:text-zinc-500 tracking-wider">Altogether</span>
          <div className="text-3xl font-black text-gray-900 dark:text-white mt-2 flex items-baseline gap-2">
            {metrics.total}
            <span className="text-xs font-mono font-black text-blue-500 uppercase">Flights</span>
          </div>
        </div>

        <div className="bg-white/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-white/5 shadow-md rounded-3xl p-5 relative overflow-hidden group hover:border-emerald-500/20 transition-all duration-300">
          <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-full blur-xl pointer-events-none group-hover:scale-125 transition-transform" />
          <span className="block text-[10px] font-black uppercase text-gray-400 dark:text-zinc-500 tracking-wider">Upcoming</span>
          <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-2 flex items-baseline gap-2">
            {metrics.upcoming}
            <span className="text-[10px] font-bold uppercase text-zinc-450 dark:text-zinc-500">Left</span>
          </div>
        </div>

        <div className="bg-white/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-white/5 shadow-md rounded-3xl p-5 relative overflow-hidden group hover:border-purple-500/20 transition-all duration-300">
          <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/5 rounded-full blur-xl pointer-events-none group-hover:scale-125 transition-transform" />
          <span className="block text-[10px] font-black uppercase text-gray-400 dark:text-zinc-500 tracking-wider">Landed / Past</span>
          <div className="text-3xl font-black text-purple-600 dark:text-purple-400 mt-2">
            {metrics.past}
          </div>
        </div>

        <div className="bg-white/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-white/5 shadow-md rounded-3xl p-5 relative overflow-hidden group hover:border-amber-500/20 transition-all duration-300">
          <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/5 rounded-full blur-xl pointer-events-none group-hover:scale-125 transition-transform" />
          <span className="block text-[10px] font-black uppercase text-gray-400 dark:text-zinc-500 tracking-wider">Estimated Cost</span>
          <div className="text-3xl font-black text-amber-500 dark:text-amber-400 mt-2">
            ${metrics.spend.toLocaleString()}
          </div>
        </div>

        <div className="bg-white/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-white/5 shadow-md rounded-3xl p-5 relative overflow-hidden group hover:border-sky-500/20 transition-all duration-300">
          <div className="absolute top-0 right-0 w-20 h-20 bg-sky-500/5 rounded-full blur-xl pointer-events-none group-hover:scale-125 transition-transform" />
          <span className="block text-[10px] font-black uppercase text-gray-400 dark:text-zinc-500 tracking-wider">Air Time</span>
          <div className="text-3xl font-black text-sky-500 dark:text-sky-450 mt-2 flex items-baseline gap-1">
            {metrics.hours}
            <span className="text-xs font-bold text-gray-400">hours</span>
          </div>
        </div>

        <div className="col-span-2 lg:col-span-1 bg-white/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-white/5 shadow-md rounded-3xl p-5 relative overflow-hidden group hover:border-rose-500/20 transition-all duration-300">
          <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/5 rounded-full blur-xl pointer-events-none group-hover:scale-125 transition-transform" />
          <span className="block text-[10px] font-black uppercase text-gray-400 dark:text-zinc-500 tracking-wider">Top Airline</span>
          <div className="text-lg font-black text-gray-850 dark:text-gray-100 mt-2.5 truncate" title={metrics.topAirline}>
            {metrics.topAirline}
          </div>
        </div>
      </div>

      {/* Recharts Monthly Flight Frequency Chart */}
      <div className="bg-white/40 dark:bg-zinc-900/30 border border-zinc-200/40 dark:border-white/5 shadow-md rounded-[2.5rem] p-6 backdrop-blur-xl">
        <h3 className="text-lg font-black text-gray-900 dark:text-white mb-6 flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-blue-500" />
          Flights per Month
        </h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#888888" strokeOpacity={0.2} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888888', fontWeight: 600 }} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888888', fontWeight: 600 }} />
              <Tooltip 
                cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', background: 'rgba(255, 255, 255, 0.95)' }}
                itemStyle={{ color: '#111827', fontWeight: 'bold' }}
              />
              <Bar dataKey="flights" name="Flights" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex justify-between items-center bg-white/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-white/5 shadow-md rounded-[2rem] p-4 backdrop-blur-xl">
        <h3 className="text-xl font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100 pl-4">
          <Plane className="w-5 h-5 text-blue-500" />
          Flight Board ({filteredFlights.length})
        </h3>
        
        {/* View Mode Toggle */}
        <div className="flex items-center bg-white dark:bg-black/20 rounded-xl p-1 border border-zinc-200 dark:border-white/10 shadow-sm">
          <button 
            onClick={() => setViewMode('table')}
            className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-blue-500 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
          >
            <List className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-blue-500 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
          >
            <Grid className="w-4 h-4" />
          </button>
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
        <div className="flex flex-col gap-8">
          <AnimatePresence mode="popLayout">
            {groupedFlights.map(({ trip, flights: tripFlights }) => (
              <motion.div
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                key={trip.id}
                className="bg-white/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-white/5 shadow-md rounded-[2.5rem] p-6 backdrop-blur-xl"
              >
                <div className="flex items-center gap-2 mb-6 ml-2">
                  <Compass className="w-5 h-5 text-blue-500" />
                  <h4 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-wider">{trip.name}</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {tripFlights.map((flight, idx) => {
                  const isFuture = new Date(`${flight.departureDate}T${flight.departureTime || '00:00'}`) >= new Date();
                  
                  // Calculate days remaining
                  let daysRemaining = null;
                  if (isFuture) {
                     const depDate = new Date(`${flight.departureDate}T${flight.departureTime || '00:00'}`);
                     const today = new Date();
                     const diffTime = Math.abs(depDate.getTime() - today.getTime());
                     daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  }

                  // Check if there is a layover to the next flight
                  let layoverStr = null;
                  if (idx < tripFlights.length - 1) {
                    const nextFlight = tripFlights[idx + 1];
                    const arrDate = new Date(`${flight.arrivalDate || flight.departureDate}T${flight.arrivalTime || '00:00'}`);
                    const nextDep = new Date(`${nextFlight.departureDate}T${nextFlight.departureTime || '00:00'}`);
                    const diffMs = nextDep.getTime() - arrDate.getTime();
                    if (diffMs > 0 && diffMs < 24 * 60 * 60 * 1000) {
                      const hrs = Math.floor(diffMs / (1000 * 60 * 60));
                      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                      layoverStr = `${hrs}h ${mins}m layover at ${getCityName(flight.destination)}`;
                    }
                  }

                  return (
                    <div key={flight.id} className="relative group transition-transform duration-300 hover:scale-[1.01]">
                      {/* Boarding Pass Container */}
                      <div className="relative overflow-hidden bg-white/70 dark:bg-zinc-900/70 border border-zinc-200/40 dark:border-white/5 rounded-[2.2rem] flex flex-col justify-between shadow-xl h-full">
                        <div className="flex h-full">
                          {/* Left Column for Days (like Flighty) */}
                          <div className="w-24 bg-zinc-900 dark:bg-black/40 flex flex-col items-center justify-center text-white p-4 shrink-0 border-r border-zinc-800 dark:border-white/5">
                            {isFuture && daysRemaining !== null ? (
                              <>
                                <span className="text-4xl font-black leading-none tracking-tighter">{daysRemaining}</span>
                                <span className="text-[10px] font-black uppercase tracking-widest mt-1 opacity-60">DAYS</span>
                              </>
                            ) : (
                                <span className="text-xs font-black uppercase tracking-widest opacity-60">PAST</span>
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
                                    <span className="block font-black text-sm text-gray-800 dark:text-white tracking-wide truncate max-w-[150px]">{getCarrierName(flight.provider) || 'UNKNOWN'}</span>
                                    <span className="block font-mono text-[10px] text-gray-450 dark:text-gray-500 font-extrabold tracking-widest">{flight.provider} {flight.identifier}</span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className="block font-black text-xs text-zinc-900 dark:text-zinc-100">{flight.departureDate}</span>
                                </div>
                              </div>
        
                              {/* Cities & Times */}
                              <div className="flex items-center justify-between pt-1">
                                <div className="text-left w-1/3">
                                  <span className="block font-black text-xl text-gray-900 dark:text-white tracking-tight leading-6 mb-1">{getCityName(flight.origin)}</span>
                                  <span className="block font-mono text-sm text-zinc-500 font-bold tracking-widest">{flight.origin}</span>
                                  <span className="block font-mono text-sm text-blue-600 dark:text-blue-400 font-bold tracking-widest mt-1">
                                    ↗ {flight.departureTime || '00:00'}
                                  </span>
                                </div>
        
                                <div className="flex-1 flex flex-col items-center justify-center px-2">
                                  <div className="w-full h-[1px] bg-zinc-300 dark:bg-zinc-700 relative flex justify-center mt-3">
                                     <Plane className="w-4 h-4 text-zinc-400 absolute top-1/2 -translate-y-1/2 rotate-90" />
                                  </div>
                                  <span className="text-[10px] font-black uppercase text-zinc-400 mt-2">
                                    {flight.duration ? `${Math.floor(flight.duration / 60)}h ${flight.duration % 60}m` : 'Direct'}
                                  </span>
                                </div>
        
                                <div className="text-right w-1/3">
                                  <span className="block font-black text-xl text-gray-900 dark:text-white tracking-tight leading-6 mb-1">{getCityName(flight.destination)}</span>
                                  <span className="block font-mono text-sm text-zinc-500 font-bold tracking-widest">{flight.destination}</span>
                                  <span className="block font-mono text-sm text-blue-600 dark:text-blue-400 font-bold tracking-widest mt-1">
                                    ↘ {flight.arrivalTime || '00:00'}
                                  </span>
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
                              <div className="flex items-center gap-1.5">
                                <button 
                                  onClick={() => openFlightForm({ flight, trip })}
                                  className="p-2 rounded-lg bg-white dark:bg-zinc-800 text-zinc-500 hover:text-blue-500 border border-zinc-200 dark:border-white/10 shadow-sm transition-all"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteFlight({ flight, trip })}
                                  className="p-2 rounded-lg bg-white dark:bg-zinc-800 text-zinc-500 hover:text-red-500 border border-zinc-200 dark:border-white/10 shadow-sm transition-all"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
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
                })}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="bg-white/40 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-white/5 shadow-md rounded-[2.5rem] p-6 backdrop-blur-xl overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-zinc-200/50 dark:border-zinc-800">
                <th className="pb-4 font-black uppercase text-[10px] tracking-wider text-zinc-500 pl-2">Carrier</th>
                <th className="pb-4 font-black uppercase text-[10px] tracking-wider text-zinc-500">Date & Time</th>
                <th className="pb-4 font-black uppercase text-[10px] tracking-wider text-zinc-500">Route</th>
                <th className="pb-4 font-black uppercase text-[10px] tracking-wider text-zinc-500">Class & Seat</th>
                <th className="pb-4 font-black uppercase text-[10px] tracking-wider text-zinc-500 text-right pr-2">Actions</th>
              </tr>
            </thead>
            <tbody>
            {groupedFlights.map(({ trip, flights: tripFlights }) => (
              <React.Fragment key={trip.id}>
                {/* Trip Header Row */}
                <tr className="bg-zinc-50/50 dark:bg-zinc-800/20 border-b border-zinc-200/50 dark:border-zinc-800">
                  <td colSpan={5} className="py-3 pl-2">
                    <div className="flex items-center gap-2">
                      <Compass className="w-4 h-4 text-blue-500" />
                      <span className="text-xs font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-widest">{trip.name}</span>
                    </div>
                  </td>
                </tr>
                {/* Flight Rows */}
                {tripFlights.map((flight, idx) => {
                  let layoverStr = null;
                  if (idx < tripFlights.length - 1) {
                    const nextFlight = tripFlights[idx + 1];
                    const arrDate = new Date(`${flight.arrivalDate || flight.departureDate}T${flight.arrivalTime || '00:00'}`);
                    const nextDep = new Date(`${nextFlight.departureDate}T${nextFlight.departureTime || '00:00'}`);
                    const diffMs = nextDep.getTime() - arrDate.getTime();
                    if (diffMs > 0 && diffMs < 24 * 60 * 60 * 1000) {
                      const hrs = Math.floor(diffMs / (1000 * 60 * 60));
                      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                      layoverStr = `${hrs}h ${mins}m layover`;
                    }
                  }

                  return (
                    <React.Fragment key={flight.id}>
                      <tr className="border-b border-zinc-200/50 dark:border-zinc-800/50 last:border-0 hover:bg-white/60 dark:hover:bg-white/5 transition-colors group">
                        <td className="py-4 pl-2">
                          <div className="flex flex-col gap-1">
                            {flight.departureDate && new Date(`${flight.departureDate}T${flight.departureTime || '00:00'}`) >= new Date() ? (
                               <Badge variant="success" className="w-fit text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5">
                                 {Math.ceil(Math.abs(new Date(`${flight.departureDate}T${flight.departureTime || '00:00'}`).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} Days
                               </Badge>
                            ) : null}
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-800 flex items-center justify-center border border-zinc-200 dark:border-zinc-700/50 overflow-hidden shrink-0 shadow-sm">
                                <AirlineLogo provider={flight.provider} fallback={<Plane className="w-5 h-5 text-zinc-400" />} />
                              </div>
                              <div>
                                <div className="font-bold text-zinc-900 dark:text-zinc-100">{getCarrierName(flight.provider)}</div>
                                <div className="text-[10px] font-black uppercase text-zinc-500">{flight.provider} {flight.identifier} &bull; PNR: {flight.confirmationCode || 'UNREGIST'}</div>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4">
                          <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-blue-500" />
                            {flight.departureDate}
                          </div>
                          <div className="text-[10px] font-black uppercase text-zinc-500 mt-1 pl-4.5">
                            {flight.departureTime || '00:00'} - {flight.arrivalTime || '00:00'}
                          </div>
                        </td>
                        <td className="py-4">
                          <div className="flex items-center gap-2">
                             <div className="flex flex-col items-start gap-1">
                               <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100 leading-none">{getCityName(flight.origin)}</span>
                               <span className="font-mono text-[10px] text-zinc-500 font-bold uppercase">{flight.origin}</span>
                             </div>
                             <ArrowRight className="w-4 h-4 text-zinc-400" />
                             <div className="flex flex-col items-start gap-1">
                               <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100 leading-none">{getCityName(flight.destination)}</span>
                               <span className="font-mono text-[10px] text-zinc-500 font-bold uppercase">{flight.destination}</span>
                             </div>
                          </div>
                        </td>
                        <td className="py-4">
                          <div className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                            {flight.travelClass || 'Economy'}
                          </div>
                          <div className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-500 mt-1">
                            Seat: {flight.seatNumber ? `${flight.seatNumber} (${flight.seatType})` : 'UNASSIGNED'}
                          </div>
                        </td>
                        <td className="py-4 text-right pr-2">
                          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openFlightForm({ flight, trip })} className="p-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:text-blue-500 transition-colors shadow-sm cursor-pointer" title="Edit">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteFlight({ flight, trip })} className="p-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:text-red-500 transition-colors shadow-sm cursor-pointer" title="Delete">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {layoverStr && (
                        <tr className="bg-amber-50/30 dark:bg-amber-900/10 border-b border-zinc-200/50 dark:border-zinc-800/50">
                          <td colSpan={5} className="py-2 pl-2">
                             <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500 pl-[3.25rem]">
                               <Clock className="w-3.5 h-3.5" />
                               <span className="text-[10px] font-black uppercase tracking-wider">{layoverStr} at {getCityName(flight.destination)}</span>
                             </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Form Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-6 max-w-lg w-full shadow-2xl border border-gray-200/20 dark:border-white/5 animate-scale-up max-h-[90vh] overflow-y-auto custom-scrollbar">
            
            <div className="flex items-center justify-between border-b border-gray-150/50 dark:border-white/5 pb-4 mb-6">
              <h3 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                <Plane className="w-6 h-6 rotate-45 text-blue-500" />
                {editingFlight ? 'Edit Boarding Pass' : 'New Flight Record'}
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
                    ...trips.map(t => ({ label: `Add to Trip: ${t.name}`, value: t.id })),
                    { label: "Create a Brand New Trip Container", value: "new" }
                  ]}
                />

                {formTripId === 'new' && (
                  <Input 
                    label="Expedition Name (Auto-Generated if Banked)"
                    placeholder="e.g. Summer Escape in Maldives"
                    value={formNewTripName}
                    onChange={e => setFormNewTripName(e.target.value)}
                  />
                )}
              </div>

              {/* Legs Setup */}
              <div className="grid grid-cols-2 gap-4">
                <Input 
                  label="Airline / Operator"
                  placeholder="e.g. Delta Air Lines, Emirates"
                  value={formAirline}
                  onChange={e => setFormAirline(e.target.value)}
                />
                <Input 
                  label="Flight Number"
                  placeholder="e.g. DL104, EK201"
                  value={formFlightNum}
                  onChange={e => setFormFlightNum(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input 
                  label="Origin Airport Code"
                  placeholder="e.g. JFK, SFO"
                  value={formOrigin}
                  onChange={e => setFormOrigin(e.target.value)}
                  maxLength={10}
                />
                <Input 
                  label="Destination Airport Code"
                  placeholder="e.g. LHR, DXB"
                  value={formDestination}
                  onChange={e => setFormDestination(e.target.value)}
                  maxLength={10}
                />
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
