
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Card, Button, Badge, Tabs, Modal, Input, Autocomplete, TimeInput, Select } from '../components/ui';
import { TransportConfigurator } from '../components/FlightConfigurator';
import { AccommodationConfigurator } from '../components/AccommodationConfigurator';
import { LocationManager } from '../components/LocationManager';
import { TripModal } from '../components/TripModal';
import { LeaveRequestModal } from '../components/LeaveRequestModal';
import { PackingList } from '../components/PackingList';
import { dataService } from '../services/mockDb';
import { flightImporter } from '../services/flightImportExport';
import { calendarService } from '../services/calendarExport';
import { Trip, User, Transport, Accommodation, WorkspaceSettings, Activity, TransportMode, LocationEntry, EntitlementType, PublicHoliday, SavedConfig, PackingItem } from '../types';
import { searchLocations, resolvePlaceName, getCoordinates } from '../services/geocoding';
import { GoogleGenAI } from "@google/genai";
import { ExpeditionMap3D } from '../components/ExpeditionMap3D';

interface TripDetailProps {
    tripId: string;
    onBack: () => void;
}

interface ImportCandidate {
    trip: Trip;
    confidence: number;
    selected: boolean;
}

interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

const WeatherWidget: React.FC<{ location: string, coordinates?: { lat: number, lng: number } }> = ({ location, coordinates }) => {
    const [weather, setWeather] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchWeather = async () => {
            let lat = coordinates?.lat;
            let lng = coordinates?.lng;

            if (!lat || !lng) {
                const coords = await getCoordinates(location);
                if (coords) {
                    lat = coords.lat;
                    lng = coords.lng;
                }
            }

            if (lat && lng) {
                try {
                    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto`);
                    const data = await res.json();
                    setWeather(data);
                } catch (e) {
                    console.error("Weather fetch failed", e);
                }
            }
            setLoading(false);
        };
        fetchWeather();
    }, [location, coordinates]);

    const getWeatherIcon = (code: number) => {
        if (code <= 1) return 'wb_sunny';
        if (code <= 3) return 'partly_cloudy_day';
        if (code <= 48) return 'foggy';
        if (code <= 67) return 'rainy';
        if (code <= 77) return 'ac_unit';
        if (code <= 82) return 'rainy';
        if (code <= 99) return 'thunderstorm';
        return 'cloud';
    };

    if (loading) return <div className="animate-pulse h-20 w-32 bg-gray-100 dark:bg-white/5 rounded-2xl"></div>;
    if (!weather || !weather.current_weather) return null;

    return (
        <div className="p-4 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-blue-500/20 border border-white/10 flex items-center gap-4">
            <div className="flex flex-col items-center">
                <span className="material-icons-outlined text-3xl drop-shadow-md">{getWeatherIcon(weather.current_weather.weathercode)}</span>
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-80 mt-1">Now</span>
            </div>
            <div>
                <div className="text-3xl font-black leading-none">{Math.round(weather.current_weather.temperature)}°</div>
                <div className="text-xs font-medium opacity-90 flex gap-2 mt-1">
                    <span>H: {Math.round(weather.daily.temperature_2m_max[0])}°</span>
                    <span>L: {Math.round(weather.daily.temperature_2m_min[0])}°</span>
                </div>
            </div>
        </div>
    );
};

const NomadGuide: React.FC<{ trip: Trip }> = ({ trip }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (messages.length === 0) {
            setMessages([{ role: 'model', text: `Hi! I'm your NomadGuide for **${trip.name}**. I know your itinerary for ${trip.location}. Ask me about local food, hidden gems, or packing tips!` }]);
        }
    }, [trip]);

    const handleSend = async () => {
        if (!input.trim()) return;
        const userMsg = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setLoading(true);

        try {
            const settings = await dataService.getWorkspaceSettings();
            const apiKey = settings.googleGeminiApiKey || process.env.API_KEY;
            
            if (!apiKey) {
                setMessages(prev => [...prev, { role: 'model', text: "Please configure Google Gemini API Key in Settings." }]);
                setLoading(false);
                return;
            }

            const ai = new GoogleGenAI({ apiKey });
            
            const context = `
                You are NomadGuide, an expert travel assistant.
                Current Trip Context:
                - Destination: ${trip.location}
                - Dates: ${trip.startDate} to ${trip.endDate}
                - Travelers: ${trip.participants.length}
                - Itinerary Items: ${trip.transports?.length || 0} flights, ${trip.activities?.length || 0} activities.
                
                Answer the user's question concisely and helpfully. Focus on travel advice, logistics, and local recommendations.
                Format with Markdown.
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: [
                    { role: 'user', parts: [{ text: context }] },
                    ...messages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
                    { role: 'user', parts: [{ text: userMsg }] }
                ]
            });

            const text = response.text || "I couldn't retrieve that info right now.";
            setMessages(prev => [...prev, { role: 'model', text }]);
        } catch (e) {
            setMessages(prev => [...prev, { role: 'model', text: "Connection error. Please check your API key." }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[600px] bg-white dark:bg-gray-900 rounded-[2.5rem] border border-gray-100 dark:border-white/5 shadow-xl overflow-hidden">
            <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white shadow-lg">
                    <span className="material-icons-outlined text-2xl">auto_awesome</span>
                </div>
                <div>
                    <h3 className="text-lg font-black text-gray-900 dark:text-white">NomadGuide AI</h3>
                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Real-time Intelligence</p>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-dots-pattern">
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                            m.role === 'user' 
                            ? 'bg-blue-600 text-white rounded-tr-sm' 
                            : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-white/10 text-gray-800 dark:text-gray-200 rounded-tl-sm'
                        }`}>
                            <div dangerouslySetInnerHTML={{ __html: m.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl rounded-tl-sm border border-gray-100 dark:border-white/10 shadow-sm flex gap-2">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75" />
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150" />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-white/5">
                <div className="relative">
                    <input 
                        type="text" 
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                        placeholder="Ask about local weather, food, or packing..."
                        className="w-full pl-6 pr-14 py-4 rounded-2xl bg-gray-100 dark:bg-black/30 border-transparent focus:bg-white dark:focus:bg-black/50 border focus:border-purple-500 outline-none transition-all text-gray-900 dark:text-white placeholder-gray-500"
                    />
                    <button 
                        onClick={handleSend}
                        disabled={!input.trim() || loading}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-purple-600 hover:bg-purple-700 text-white rounded-xl flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span className="material-icons-outlined text-lg">send</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export const TripDetail: React.FC<TripDetailProps> = ({ tripId, onBack }) => {
    const [trip, setTrip] = useState<Trip | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
    const [entitlements, setEntitlements] = useState<EntitlementType[]>([]);
    const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
    const [allTrips, setAllTrips] = useState<Trip[]>([]);
    
    // View State
    const [activeTab, setActiveTab] = useState('planner'); 
    const [plannerView, setPlannerView] = useState<'list' | 'table' | 'calendar'>('list'); 
    const [calendarDate, setCalendarDate] = useState(new Date());
    const [loading, setLoading] = useState(true);

    // Modal States
    const [isTransportModalOpen, setIsTransportModalOpen] = useState(false);
    const [isAccommodationModalOpen, setIsAccommodationModalOpen] = useState(false);
    const [isEditTripOpen, setIsEditTripOpen] = useState(false);
    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
    const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
    const [isCinematicOpen, setIsCinematicOpen] = useState(false);
    
    // Import State
    const [importPreview, setImportPreview] = useState<{ open: boolean, candidates: ImportCandidate[] }>({ open: false, candidates: [] });
    const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null);
    const [importFilters, setImportFilters] = useState({ 
        search: '', 
        minDate: '', 
        maxDate: '', 
        minConfidence: '0',
        airline: ''
    });
    const importInputRef = useRef<HTMLInputElement>(null);

    // Editing State
    const [activityForm, setActivityForm] = useState<Partial<Activity>>({});
    const [currentDayForActivity, setCurrentDayForActivity] = useState<string>('');
    const [selectedDateForModal, setSelectedDateForModal] = useState<string | null>(null);
    const [editingTransports, setEditingTransports] = useState<Transport[] | null>(null);
    const [editingAccommodations, setEditingAccommodations] = useState<Accommodation[] | null>(null);
    
    useEffect(() => {
        loadData();
    }, [tripId]);

    const loadData = () => {
        setLoading(true);
        Promise.all([
            dataService.getTrips(), 
            dataService.getUsers(),
            dataService.getWorkspaceSettings(),
            dataService.getEntitlementTypes(),
            dataService.getSavedConfigs()
        ]).then(([tripsList, allUsers, s, ents, configs]) => {
            const t = tripsList.find(t => t.id === tripId);
            setTrip(t || null);
            if (t) setCalendarDate(new Date(t.startDate));
            setUsers(allUsers);
            setSettings(s);
            setAllTrips(tripsList);
            setEntitlements(ents);
            const flatHolidays = configs.flatMap(c => c.holidays.map(h => ({ ...h, configId: c.id })));
            setHolidays(flatHolidays);
            setLoading(false);
        });
    };

    const calculateRelevance = (currentTrip: Trip, candidateTrip: Trip): number => {
        let points = 0;
        const cStartDate = new Date(currentTrip.startDate).getTime();
        const cEndDate = new Date(currentTrip.endDate).getTime();
        const candStartDate = new Date(candidateTrip.startDate).getTime();
        const candEndDate = new Date(candidateTrip.endDate).getTime();

        const overlapStart = Math.max(cStartDate, candStartDate);
        const overlapEnd = Math.min(cEndDate, candEndDate);
        
        if (overlapEnd >= overlapStart) {
            points += 60;
            if (cStartDate === candStartDate) points += 10;
            if (cEndDate === candEndDate) points += 10;
        } else {
            const dist = Math.min(Math.abs(cStartDate - candEndDate), Math.abs(candStartDate - cEndDate));
            const daysOff = dist / (1000 * 60 * 60 * 24);
            if (daysOff < 2) points += 40; 
            else if (daysOff < 7) points += 20; 
        }

        if (currentTrip.location && candidateTrip.location) {
            const currLoc = currentTrip.location.toLowerCase();
            const candLoc = candidateTrip.location.toLowerCase();
            if (currLoc.includes(candLoc) || candLoc.includes(currLoc)) {
                points += 20;
            }
        }
        return Math.min(100, points);
    };

    const handleUpdateTrip = async (updatedTrip: Trip) => {
        if (!trip) return;
        const finalTrip = { ...trip, ...updatedTrip };
        await dataService.updateTrip(finalTrip);
        setTrip(finalTrip);
        setIsEditTripOpen(false);
    };

    const handleUpdatePackingList = async (items: PackingItem[]) => {
        if (!trip) return;
        const updatedTrip = { ...trip, packingList: items };
        await dataService.updateTrip(updatedTrip);
        setTrip(updatedTrip);
    };

    const handleDeleteTrip = async (id: string) => {
        await dataService.deleteTrip(id);
        onBack();
    };

    const handleSaveTransports = async (newTransports: Transport[]) => {
        if (!trip) return;
        let updatedTransports = [...(trip.transports || [])];
        if (editingTransports && editingTransports.length > 0) {
             const oldIds = new Set(editingTransports.map(f => f.id));
             updatedTransports = updatedTransports.filter(f => !oldIds.has(f.id));
        }
        updatedTransports = [...updatedTransports, ...newTransports];
        const updatedTrip = { ...trip, transports: updatedTransports };
        await dataService.updateTrip(updatedTrip);
        setTrip(updatedTrip);
        setIsTransportModalOpen(false);
        setEditingTransports(null);
    };

    const handleImportFlights = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !trip) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const content = evt.target?.result as string;
            let rawTransports: Transport[] = [];
            if (file.name.endsWith('.json')) {
                rawTransports = flightImporter.parseTransportsJson(content);
            } else if (file.name.endsWith('.csv')) {
                rawTransports = flightImporter.parseTransportsCsv(content);
            }
            if (rawTransports.length > 0) {
                const groupedTrips = flightImporter.groupTransports(rawTransports, trip.participants[0] || 'temp');
                const candidates: ImportCandidate[] = groupedTrips.map(gt => ({
                    trip: gt,
                    confidence: calculateRelevance(trip, gt),
                    selected: false
                })).sort((a, b) => b.confidence - a.confidence);
                if (candidates.length > 0 && candidates[0].confidence > 80) candidates[0].selected = true;
                
                setImportFilters({ search: '', minDate: '', maxDate: '', minConfidence: '0', airline: '' });
                setImportPreview({ open: true, candidates });
            } else {
                alert("No valid flights found in file.");
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const confirmImportFlights = async () => {
        if (!trip) return;
        const selectedTransports: Transport[] = [];
        importPreview.candidates.forEach(c => {
            if (c.selected && c.trip.transports) {
                const newTransports = c.trip.transports.map(t => ({
                    ...t,
                    id: Math.random().toString(36).substr(2, 9),
                    itineraryId: t.itineraryId || Math.random().toString(36).substr(2, 9)
                }));
                selectedTransports.push(...newTransports);
            }
        });
        if (selectedTransports.length === 0) return;
        const updatedTrip = { ...trip, transports: [...(trip.transports || []), ...selectedTransports] };
        await dataService.updateTrip(updatedTrip);
        setTrip(updatedTrip);
        setImportPreview({ open: false, candidates: [] });
    };

    const toggleCandidateSelection = (tripId: string) => {
        setImportPreview(prev => ({
            ...prev,
            candidates: prev.candidates.map(c => c.trip.id === tripId ? { ...c, selected: !c.selected } : c)
        }));
    };

    const filteredCandidates = useMemo(() => {
        return importPreview.candidates.filter(c => {
            const t = c.trip;
            const searchLower = importFilters.search.toLowerCase();
            const airlineLower = importFilters.airline.toLowerCase();
            
            const matchesSearch = !searchLower || 
                t.name.toLowerCase().includes(searchLower) ||
                t.location.toLowerCase().includes(searchLower);

            const matchesAirline = !airlineLower ||
                t.transports?.some(tr => tr.provider.toLowerCase().includes(airlineLower));

            const start = new Date(t.startDate);
            const end = new Date(t.endDate);
            const matchesMin = !importFilters.minDate || end >= new Date(importFilters.minDate);
            const matchesMax = !importFilters.maxDate || start <= new Date(importFilters.maxDate);
            const matchesConf = c.confidence >= parseInt(importFilters.minConfidence);

            return matchesSearch && matchesAirline && matchesMin && matchesMax && matchesConf;
        });
    }, [importPreview.candidates, importFilters]);

    const toggleAllFiltered = () => {
        const allSelected = filteredCandidates.every(c => c.selected);
        const idsToToggle = new Set(filteredCandidates.map(c => c.trip.id));
        
        setImportPreview(prev => ({
            ...prev,
            candidates: prev.candidates.map(c => {
                if (idsToToggle.has(c.trip.id)) {
                    return { ...c, selected: !allSelected };
                }
                return c;
            })
        }));
    };

    const handleDeleteTransports = async (ids: string[]) => {
        if (!trip) return;
        const updatedTransports = (trip.transports || []).filter(f => !ids.includes(f.id));
        const updatedTrip = { ...trip, transports: updatedTransports };
        await dataService.updateTrip(updatedTrip);
        setTrip(updatedTrip);
        setIsTransportModalOpen(false);
        setEditingTransports(null);
    };

    const handleSaveAccommodations = async (items: Accommodation[]) => {
        if (!trip) return;
        const updatedTrip = { ...trip, accommodations: items };
        await dataService.updateTrip(updatedTrip);
        setTrip(updatedTrip);
        setIsAccommodationModalOpen(false);
    };

    const handleDeleteAccommodations = async (ids: string[]) => {
        if (!trip) return;
        const updatedTrip = { ...trip, accommodations: [] };
        await dataService.updateTrip(updatedTrip);
        setTrip(updatedTrip);
        setIsAccommodationModalOpen(false);
    };

    const handleSaveRoute = async (items: LocationEntry[], generatedTransports: Transport[]) => {
        if (!trip) return;
        
        const existingTicketedTransports = (trip.transports || []).filter(t => 
            t.mode === 'Flight' || t.mode === 'Train' || t.mode === 'Cruise' || t.mode === 'Bus'
        );
        
        const finalTransports = [...existingTicketedTransports, ...generatedTransports];

        const updatedTrip = { ...trip, locations: items, transports: finalTransports };
        await dataService.updateTrip(updatedTrip);
        setTrip(updatedTrip);
    };

    const handleOpenActivityModal = (dateStr: string, existingActivity?: Activity) => {
        setCurrentDayForActivity(dateStr);
        if (existingActivity) setActivityForm({ ...existingActivity });
        else setActivityForm({ id: Math.random().toString(36).substr(2, 9), date: dateStr, time: '12:00', cost: 0, location: '', description: '', type: 'Activity' });
        setIsActivityModalOpen(true);
    };

    const handleSaveActivity = async () => {
        if (!trip || !activityForm.title || !activityForm.date) return;
        const newActivity = activityForm as Activity;
        if (!newActivity.type) newActivity.type = 'Activity';
        let updatedActivities = [...(trip.activities || [])];
        const existingIndex = updatedActivities.findIndex(a => a.id === newActivity.id);
        if (existingIndex >= 0) updatedActivities[existingIndex] = newActivity;
        else updatedActivities.push(newActivity);
        const updatedTrip = { ...trip, activities: updatedActivities };
        await dataService.updateTrip(updatedTrip);
        setTrip(updatedTrip);
        setIsActivityModalOpen(false);
        setActivityForm({});
    };

    const handleDeleteActivity = async (activityId: string) => {
        if (!trip) return;
        const updatedActivities = (trip.activities || []).filter(a => a.id !== activityId);
        const updatedTrip = { ...trip, activities: updatedActivities };
        await dataService.updateTrip(updatedTrip);
        setTrip(updatedTrip);
        setIsActivityModalOpen(false);
        setActivityForm({});
    };

    const handleBookTimeOff = () => setIsLeaveModalOpen(true);

    const handleTimeOffSubmit = async (tripData: Trip) => {
        if (!trip) return;
        const mergedTrip: Trip = { ...trip, ...tripData, id: trip.id, status: 'Upcoming' };
        await dataService.updateTrip(mergedTrip);
        setTrip(mergedTrip);
        const newTrips = allTrips.map(t => t.id === mergedTrip.id ? mergedTrip : t);
        setAllTrips(newTrips);
        setIsLeaveModalOpen(false);
    };

    const handleAddToCalendar = () => {
        if (!trip) return;
        const icsContent = calendarService.generateIcsContent([trip], 'WanderGrid');
        calendarService.downloadIcs(icsContent, `trip-${trip.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.ics`);
    };

    const openTransportModal = (transportSet?: Transport[], date?: string) => {
        setEditingTransports(transportSet || null);
        setSelectedDateForModal(date || null);
        setIsTransportModalOpen(true);
    };

    const openAccommodationModal = (date?: string) => {
        setEditingAccommodations(trip?.accommodations || []);
        setSelectedDateForModal(date || null);
        setIsAccommodationModalOpen(true);
    };

    const handleCalendarNavigate = (dir: number) => {
        const newDate = new Date(calendarDate);
        newDate.setMonth(newDate.getMonth() + dir);
        setCalendarDate(newDate);
    };

    const getCurrencySymbol = (code: string) => {
        const symbols: Record<string, string> = { 'USD': '$', 'EUR': '€', 'GBP': '£', 'AUD': 'A$', 'JPY': '¥' };
        return symbols[code] || code || '$';
    };
    const formatCurrency = (amount: number) => {
        if (!settings) return `$${amount}`;
        try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: settings.currency }).format(amount); } catch (e) { return `${settings.currency} ${amount}`; }
    };
    const formatTime = (time24?: string) => {
        if (!time24) return '';
        const [h, m] = time24.split(':');
        const hour = parseInt(h);
        if (isNaN(hour)) return time24;
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${m} ${ampm}`;
    };
    const getTransportIcon = (mode: TransportMode) => {
        switch(mode) {
            case 'Train': return 'train';
            case 'Bus': return 'directions_bus';
            case 'Car Rental': return 'key';
            case 'Personal Car': return 'directions_car';
            case 'Cruise': return 'directions_boat';
            default: return 'flight_takeoff';
        }
    };
    const getLocationForDate = (dateStr: string) => {
        if (!trip?.locations) return null;
        return trip.locations.find(l => dateStr >= l.startDate && dateStr <= l.endDate);
    };
    const calculateDuration = (t: Transport) => {
        if (t.duration) {
            const h = Math.floor(t.duration / 60);
            const m = Math.round(t.duration % 60);
            return `${h}h ${m}m`;
        }
        if (!t.departureTime || !t.arrivalTime) return '';
        const [dh, dm] = t.departureTime.split(':').map(Number);
        const [ah, am] = t.arrivalTime.split(':').map(Number);
        let diff = (ah * 60 + am) - (dh * 60 + dm);
        if (diff < 0) diff += 24 * 60; 
        if (t.departureDate && t.arrivalDate) {
             const start = new Date(`${t.departureDate}T${t.departureTime}`);
             const end = new Date(`${t.arrivalDate}T${t.arrivalTime}`);
             if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                 diff = (end.getTime() - start.getTime()) / (1000 * 60);
             }
        }
        const h = Math.floor(diff / 60);
        const m = Math.round(diff % 60);
        return `${h}h ${m}m`;
    };
    const calculateNights = (start: string, end: string) => {
        const d1 = new Date(start);
        const d2 = new Date(end);
        if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
        const diff = d2.getTime() - d1.getTime();
        return Math.ceil(diff / (1000 * 3600 * 24));
    }
    const sortActivities = (acts: Activity[]) => {
        return acts.sort((a, b) => {
            const timeA = a.time || '23:59';
            const timeB = b.time || '23:59';
            return timeA.localeCompare(timeB);
        });
    };
    const getTypeStyles = (type: string) => {
        switch(type) {
            case 'Transport': return 'bg-blue-50 dark:bg-blue-900/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
            case 'Accommodation': return 'bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-border-800';
            case 'Reservation': return 'bg-orange-50 dark:bg-orange-900/10 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800';
            case 'Tour': return 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
            case 'Activity': 
            default: return 'bg-indigo-50 dark:bg-indigo-900/10 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
        }
    };
    const fetchLocationSuggestions = async (query: string): Promise<string[]> => {
        return searchLocations(query);
    };
    const getDayEvents = (dateStr: string) => {
        if (!trip?.transports) return [];
        const events: (Transport & { isDropoff?: boolean })[] = [];
        trip.transports.forEach(t => {
            if (t.departureDate === dateStr) events.push(t);
            if (t.arrivalDate === dateStr && t.departureDate !== dateStr && (t.mode === 'Car Rental' || t.mode === 'Personal Car')) events.push({ ...t, isDropoff: true });
        });
        return events;
    };

    if (loading || !trip) return <div className="p-8 text-gray-400 animate-pulse">Loading Trip Data...</div>;

    const activityCost = trip.activities?.reduce((sum, a) => sum + (a.cost || 0), 0) || 0;
    const transportCost = trip.transports?.reduce((sum, f) => sum + (f.cost || 0), 0) || 0;
    const stayCost = trip.accommodations?.reduce((sum, a) => sum + (a.cost || 0), 0) || 0;
    const totalCost = transportCost + stayCost + activityCost;
    const duration = Math.ceil((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const costPerPerson = trip.participants.length > 0 ? totalCost / trip.participants.length : 0;
    const costPerDay = duration > 0 ? totalCost / duration : 0;

    // Group by Itinerary ID
    const transportGroups = (trip.transports || []).reduce((groups, t) => {
        const key = t.itineraryId || 'misc';
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
        return groups;
    }, {} as Record<string, Transport[]>);

    const getTripDates = () => {
        const dates: string[] = [];
        const [sy, sm, sd] = trip.startDate.split('-').map(Number);
        const [ey, em, ed] = trip.endDate.split('-').map(Number);
        const curr = new Date(Date.UTC(sy, sm - 1, sd));
        const last = new Date(Date.UTC(ey, em - 1, ed));
        while (curr <= last) {
            dates.push(curr.toISOString().split('T')[0]);
            curr.setUTCDate(curr.getUTCDate() + 1);
        }
        return dates;
    };
    const tripDates = getTripDates();
    const selectedCount = importPreview.candidates.filter(c => c.selected).length;
    
    const getAllItemsForTable = (dateStr: string) => {
        const items: any[] = [];
        getDayEvents(dateStr).forEach(t => {
            const dur = !t.isDropoff ? calculateDuration(t) : '';
            const dist = t.distance ? `${t.distance} km` : '';
            items.push({
                id: t.id,
                type: 'Transport',
                subType: t.mode,
                time: t.isDropoff ? t.arrivalTime : t.departureTime,
                name: t.provider + (t.identifier ? ` ${t.identifier}` : ''),
                location: t.isDropoff ? t.dropoffLocation || t.destination : t.pickupLocation || t.origin,
                cost: (t.cost || 0) > 0 ? t.cost : null,
                icon: getTransportIcon(t.mode),
                ref: t,
                meta: !t.isDropoff ? `${dur}${dist ? ` • ${dist}` : ''}` : 'Arrival',
                isDropoff: t.isDropoff
            });
        });
        trip.accommodations?.forEach(a => {
            if (a.checkInDate === dateStr) {
                const nights = calculateNights(a.checkInDate, a.checkOutDate);
                items.push({
                    id: a.id,
                    type: 'Accommodation',
                    subType: a.type,
                    time: a.checkInTime,
                    name: a.name,
                    location: a.address,
                    cost: a.cost,
                    icon: 'hotel',
                    ref: a,
                    meta: `${nights} Night${nights > 1 ? 's' : ''}`
                });
            }
        });
        trip.activities?.forEach(a => {
            if (a.date === dateStr) {
                items.push({
                    id: a.id,
                    type: a.type || 'Activity',
                    subType: a.type,
                    time: a.time,
                    name: a.title,
                    location: a.location,
                    cost: a.cost,
                    icon: a.type === 'Reservation' ? 'restaurant' : a.type === 'Tour' ? 'tour' : 'local_activity',
                    ref: a,
                    meta: a.description
                });
            }
        });
        return items.sort((a,b) => (a.time || '23:59').localeCompare(b.time || '23:59'));
    };

    const renderPlannerCalendar = () => {
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; 
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const grid: React.ReactNode[] = [];
        for (let i = 0; i < startDay; i++) grid.push(<div key={`empty-${i}`} className="min-h-[8rem] bg-gray-50/20 dark:bg-white/5 rounded-xl" />);
        
        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(year, month, d);
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isToday = new Date().toDateString() === dateObj.toDateString();
            const items = getAllItemsForTable(dateStr);
            const isInTrip = dateStr >= trip.startDate && dateStr <= trip.endDate;
            
            grid.push(
                <div key={d} className={`min-h-[8rem] p-2 rounded-xl border flex flex-col relative group ${
                    isToday ? 'bg-white ring-2 ring-blue-400 dark:bg-gray-800 dark:ring-blue-600' : 
                    isInTrip ? 'bg-white dark:bg-gray-900 border-gray-200 dark:border-white/10' : 
                    'bg-gray-50/50 dark:bg-black/20 border-gray-100 dark:border-white/5 opacity-70'
                }`}>
                    <div className="flex justify-between items-start mb-1">
                        <span className={`text-sm font-bold ${isToday ? 'text-blue-600' : isInTrip ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>{d}</span>
                        {isInTrip && (
                            <button onClick={() => handleOpenActivityModal(dateStr)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500 transition-opacity">
                                <span className="material-icons-outlined text-sm">add_circle</span>
                            </button>
                        )}
                    </div>
                    
                    <div className="flex-1 flex flex-col gap-1 overflow-y-auto custom-scrollbar max-h-[120px]">
                        {items.map((item, idx) => {
                            const styleClasses = getTypeStyles(item.type);
                            return (
                                <div key={idx} 
                                    className={`text-[9px] font-bold px-1.5 py-1 rounded border flex items-center gap-1 cursor-pointer truncate ${styleClasses}`}
                                    onClick={() => {
                                        if (item.type === 'Transport') openTransportModal([item.ref]);
                                        if (item.type === 'Accommodation') openAccommodationModal();
                                        if (['Activity', 'Reservation', 'Tour'].includes(item.type)) handleOpenActivityModal(dateStr, item.ref);
                                    }}
                                    title={`${item.time ? formatTime(item.time) + ' - ' : ''}${item.name}`}
                                >
                                    <span className="material-icons-outlined text-[10px]">{item.icon}</span>
                                    <span className="truncate">{item.time ? formatTime(item.time) : ''} {item.name}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }

        return (
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-white/5 shadow-xl overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-gray-50/50 dark:bg-white/5">
                    <div className="flex items-center gap-4">
                        <button onClick={() => handleCalendarNavigate(-1)} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
                            <span className="material-icons-outlined text-sm">chevron_left</span>
                        </button>
                        <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight w-32 text-center">
                            {calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </h3>
                        <button onClick={() => handleCalendarNavigate(1)} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
                            <span className="material-icons-outlined text-sm">chevron_right</span>
                        </button>
                    </div>
                    <button onClick={() => setCalendarDate(new Date(trip.startDate))} className="text-xs font-bold text-blue-500 hover:underline">Reset to Start</button>
                </div>
                <div className="p-4">
                    <div className="grid grid-cols-7 gap-3 mb-2">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                            <div key={d} className="text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">{d}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                        {grid}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-8 animate-fade-in max-w-[1400px] mx-auto pb-12">
            <div className="relative w-full rounded-[2.5rem] bg-white dark:bg-gray-900 shadow-2xl border border-gray-100 dark:border-white/5 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 pointer-events-none" />
                <div className="relative p-8 lg:p-10 flex flex-col gap-8">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                        <div className="flex items-start gap-6">
                            <button onClick={onBack} className="w-12 h-12 rounded-xl bg-white dark:bg-gray-800 shadow-md border border-gray-100 dark:border-white/10 flex items-center justify-center text-gray-400 hover:text-blue-500 transition-colors">
                                <span className="material-icons-outlined text-lg">arrow_back</span>
                            </button>
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="text-4xl">{trip.icon || '✈️'}</span>
                                    <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white tracking-tight">{trip.name}</h1>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-gray-500 dark:text-gray-400">
                                    <span className="flex items-center gap-1"><span className="material-icons-outlined text-xs">location_on</span> {trip.location}</span>
                                    <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                    <span>{new Date(trip.startDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})} - {new Date(trip.endDate).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'})}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <WeatherWidget location={trip.location} coordinates={trip.coordinates} />
                            <div className="flex gap-2">
                                <Button variant="secondary" onClick={() => setIsCinematicOpen(true)} icon={<span className="material-icons-outlined">movie_filter</span>}>Cinematic View</Button>
                                <Button variant="secondary" onClick={() => {
                                    const ics = calendarService.generateIcsContent([trip], 'WanderGrid');
                                    calendarService.downloadIcs(ics, `trip-${trip.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.ics`);
                                }} icon={<span className="material-icons-outlined">event</span>}>Add to Calendar</Button>
                                {(!trip.entitlementId && trip.status === 'Planning') && (
                                    <Button variant="primary" onClick={handleBookTimeOff} className="bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20" icon={<span className="material-icons-outlined">event_available</span>}>Book Time Off</Button>
                                )}
                                <Button variant="secondary" onClick={() => setIsEditTripOpen(true)} icon={<span className="material-icons-outlined">edit</span>}>Edit Details</Button>
                            </div>
                        </div>
                    </div>
                    {/* ... (Existing Stat Cards Layout) ... */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 flex flex-col items-center justify-center text-center">
                            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(totalCost)}</span>
                            <span className="text-[9px] font-bold text-emerald-500/70 uppercase tracking-widest">Total Cost</span>
                        </div>
                        <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 flex flex-col items-center justify-center text-center">
                            <span className="text-2xl font-black text-blue-600 dark:text-blue-400">{duration}</span>
                            <span className="text-[9px] font-bold text-blue-500/70 uppercase tracking-widest">Days Duration</span>
                        </div>
                        <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/30 flex flex-col items-center justify-center text-center">
                            <div className="flex -space-x-2 mb-1">
                                {trip.participants.map((pid, idx) => {
                                    const u = users.find(u => u.id === pid);
                                    return u ? <div key={idx} className="w-6 h-6 rounded-full bg-purple-200 border-2 border-white flex items-center justify-center text-[8px] font-bold text-purple-800" title={u.name}>{u.name.charAt(0)}</div> : null;
                                })}
                            </div>
                            <span className="text-[9px] font-bold text-purple-500/70 uppercase tracking-widest">{trip.participants.length} Travelers</span>
                        </div>
                        <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-white/5 flex flex-col items-center justify-center text-center">
                            <span className="text-2xl font-black text-gray-700 dark:text-gray-300">{(trip.transports?.length || 0) + (trip.accommodations?.length || 0) + (trip.activities?.length || 0)}</span>
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Planned Items</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ... (Tabs and Content Switcher - keep existing structure) ... */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <Tabs 
                    tabs={[
                        { id: 'planner', label: 'Daily Planner', icon: <span className="material-icons-outlined">calendar_view_day</span> }, 
                        { id: 'route', label: 'Route', icon: <span className="material-icons-outlined">alt_route</span> },
                        { id: 'itinerary', label: 'Bookings', icon: <span className="material-icons-outlined">commute</span> }, 
                        { id: 'budget', label: 'Cost Breakdown', icon: <span className="material-icons-outlined">receipt_long</span> },
                        { id: 'packing', label: 'Gear', icon: <span className="material-icons-outlined">backpack</span> },
                        { id: 'intel', label: 'AI Guide', icon: <span className="material-icons-outlined">auto_awesome</span> }
                    ]} 
                    activeTab={activeTab} 
                    onChange={setActiveTab} 
                />
                {activeTab === 'planner' && (
                    <div className="flex gap-2">
                        <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
                            <button onClick={() => setPlannerView('list')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${plannerView === 'list' ? 'bg-white shadow text-blue-600 dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}><span className="material-icons-outlined text-sm align-middle mr-1">view_agenda</span> List</button>
                            <button onClick={() => setPlannerView('table')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${plannerView === 'table' ? 'bg-white shadow text-blue-600 dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}><span className="material-icons-outlined text-sm align-middle mr-1">table_chart</span> Table</button>
                            <button onClick={() => setPlannerView('calendar')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${plannerView === 'calendar' ? 'bg-white shadow text-blue-600 dark:bg-gray-700 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}><span className="material-icons-outlined text-sm align-middle mr-1">calendar_month</span> Calendar</button>
                        </div>
                    </div>
                )}
            </div>

            {activeTab === 'intel' && (
                <div className="animate-fade-in">
                    <NomadGuide trip={trip} />
                </div>
            )}

            {activeTab === 'packing' && (
                <div className="animate-fade-in">
                    <PackingList 
                        trip={trip} 
                        onUpdate={handleUpdatePackingList}
                    />
                </div>
            )}

            {activeTab === 'route' && (
                <LocationManager 
                    key={trip.id + trip.locations?.length}
                    locations={trip.locations || []}
                    transports={trip.transports || []}
                    onSave={handleSaveRoute}
                    onCancel={() => loadData()}
                    defaultStartDate={trip.startDate}
                    defaultEndDate={trip.endDate}
                />
            )}

            {activeTab === 'planner' && (
                <>
                    {plannerView === 'calendar' ? renderPlannerCalendar() : plannerView === 'list' ? (
                        <div className="space-y-6 relative">
                            {/* ... (Existing List View Render - Keep exact same structure) ... */}
                            <div className="absolute left-8 top-4 bottom-4 w-0.5 bg-gray-200 dark:bg-gray-800 hidden md:block" />
                            {tripDates.map((dateStr, index) => {
                                const dateObj = new Date(dateStr); 
                                const dayEvents = getDayEvents(dateStr);
                                const dayStay = trip.accommodations?.find(a => dateStr >= a.checkInDate && dateStr < a.checkOutDate);
                                const location = getLocationForDate(dateStr);
                                const dayActivities = sortActivities(trip.activities?.filter(a => a.date === dateStr) || []);

                                return (
                                    <div key={dateStr} className="relative md:pl-20 group">
                                        <div className="hidden md:flex absolute left-0 top-0 w-16 h-16 bg-white dark:bg-gray-900 border-4 border-gray-100 dark:border-border-800 rounded-2xl items-center justify-center flex-col z-10 shadow-sm">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{dateObj.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</span>
                                            <span className="text-xl font-black text-gray-800 dark:text-white leading-none">{dateObj.getUTCDate()}</span>
                                            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter mt-0.5">Day {index + 1}</span>
                                        </div>
                                        <div className="md:hidden mb-2 flex items-center gap-3">
                                            <div className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-bold">Day {index + 1}</div>
                                            <span className="text-lg font-black text-gray-800 dark:text-white">{dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>
                                        </div>
                                        <div className="space-y-3 pb-8">
                                            {location && (
                                                <div className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
                                                    <span className="material-icons-outlined text-xs">place</span> {location.name}
                                                </div>
                                            )}
                                            {dayEvents.map(t => (
                                                <div key={t.id + (t.isDropoff ? '_drop' : '')} className="bg-blue-50 dark:bg-gray-800 border border-blue-100 dark:border-gray-700 p-4 rounded-2xl flex items-center gap-4 hover:shadow-md transition-all">
                                                    <div className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/30">
                                                        <span className="material-icons-outlined">{getTransportIcon(t.mode)}</span>
                                                    </div>
                                                    <div className="flex-1">
                                                        <h4 className="font-bold text-gray-900 dark:text-white text-sm">
                                                            {t.isDropoff ? `Dropoff ${t.mode}` : (t.mode === 'Car Rental' || t.mode === 'Personal Car' ? `Pickup ${t.mode}` : `${t.mode} to ${t.destination}`)}
                                                        </h4>
                                                        <div className="flex gap-4 mt-1">
                                                            <p className="text-[10px] text-blue-600 dark:text-blue-300 font-bold uppercase tracking-wider">
                                                                {t.provider} {t.identifier} • {formatTime(t.isDropoff ? t.arrivalTime : t.departureTime)}
                                                            </p>
                                                            {!t.isDropoff && t.mode !== 'Car Rental' && t.mode !== 'Personal Car' && (
                                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                                                                    {calculateDuration(t)} Duration
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button onClick={() => openTransportModal([t])} className="text-gray-400 hover:text-blue-500"><span className="material-icons-outlined text-sm">edit</span></button>
                                                </div>
                                            ))}
                                            {dayStay && (
                                                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 p-4 rounded-2xl flex items-center gap-4 hover:shadow-md transition-all"><div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/30"><span className="material-icons-outlined">hotel</span></div><div className="flex-1"><h4 className="font-bold text-gray-900 dark:text-white text-sm">{dayStay.name}</h4><p className="text-[10px] text-amber-600 dark:text-amber-300 font-bold uppercase tracking-wider">{dayStay.checkInDate === dateStr ? 'Check-In' : 'Overnight Stay'}</p></div><button onClick={() => openAccommodationModal()} className="text-gray-400 hover:text-amber-500"><span className="material-icons-outlined text-sm">edit</span></button></div>
                                            )}
                                            {dayActivities.length > 0 && dayActivities.map(item => {
                                                const isRes = item.type === 'Reservation';
                                                return (
                                                    <div key={item.id} className={`p-4 rounded-2xl flex items-center gap-4 hover:shadow-md transition-all group/act border ${
                                                        isRes 
                                                        ? 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900/30' 
                                                        : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-white/10'
                                                    }`}>
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                                            isRes 
                                                            ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' 
                                                            : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
                                                        }`}>
                                                            <span className="material-icons-outlined">{isRes ? 'restaurant' : item.type === 'Tour' ? 'tour' : 'local_activity'}</span>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-xs font-black whitespace-nowrap ${isRes ? 'text-orange-400' : 'text-gray-400'}`}>{formatTime(item.time)}</span>
                                                                <h4 className="font-bold text-gray-900 dark:text-white text-sm truncate">{item.title}</h4>
                                                            </div>
                                                            {item.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{item.description}</p>}
                                                            {item.location && <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1 truncate"><span className="material-icons-outlined text-[10px]">place</span> {item.location}</p>}
                                                        </div>
                                                        {item.cost && <div className={`text-xs font-bold whitespace-nowrap ${isRes ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-300'}`}>{formatCurrency(item.cost)}</div>}
                                                        
                                                        <div className="flex items-center gap-1 opacity-0 group-hover/act:opacity-100 transition-opacity">
                                                            <button onClick={() => handleOpenActivityModal(dateStr, item)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"><span className="material-icons-outlined text-sm">edit</span></button>
                                                            <button onClick={() => handleDeleteActivity(item.id)} className="p-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"><span className="material-icons-outlined text-sm">delete</span></button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            <button onClick={() => handleOpenActivityModal(dateStr)} className="w-full py-3 border-2 border-dashed border-gray-200 dark:border-white/10 rounded-2xl text-xs font-bold text-gray-400 uppercase tracking-widest hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 focus:opacity-100">
                                                <span className="material-icons-outlined text-sm">add</span> Add Schedule Item
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        // Table View - Keep exact same structure
                        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-white/5 shadow-xl overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-50/80 dark:bg-white/5 backdrop-blur border-b border-gray-100 dark:border-white/5 text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 sticky top-0 z-20">
                                    <tr>
                                        <th className="p-6 w-32">Time</th>
                                        <th className="p-6 w-48">Category</th>
                                        <th className="p-6">Description</th>
                                        <th className="p-6 w-48">Location</th>
                                        <th className="p-6 w-32 text-right">Cost</th>
                                        <th className="p-6 w-16"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tripDates.map((dateStr) => {
                                        const items = getAllItemsForTable(dateStr);
                                        const dateObj = new Date(dateStr);
                                        const isToday = new Date().toDateString() === dateObj.toDateString();
                                        return (
                                            <React.Fragment key={dateStr}>
                                                <tr className={`border-b border-gray-50 dark:border-white/5 ${isToday ? 'bg-blue-50/50 dark:bg-blue-900/10' : 'bg-gray-50/30 dark:bg-black/20'}`}>
                                                    <td colSpan={6} className="px-6 py-3">
                                                        <div className="flex items-center gap-3">
                                                            <span className={`text-xs font-black uppercase tracking-wider ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                                                {dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                                                            </span>
                                                            {isToday && <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 uppercase tracking-widest">Today</span>}
                                                        </div>
                                                    </td>
                                                </tr>
                                                {items.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={6} className="px-6 py-8 text-center text-xs text-gray-400 dark:text-gray-600 italic font-medium">No scheduled items for this day</td>
                                                    </tr>
                                                ) : items.map((item, idx) => {
                                                    const styleClasses = getTypeStyles(item.type);
                                                    return (
                                                        <tr key={`${dateStr}-${idx}`} className="group hover:bg-blue-50/30 dark:hover:bg-white/5 transition-all duration-200 border-b border-gray-50 dark:border-white/5 last:border-0">
                                                            <td className="px-6 py-4"><div className="flex flex-col"><span className="text-sm font-bold text-gray-800 dark:text-gray-200 font-mono tracking-tight">{formatTime(item.time)}</span>{item.isDropoff && <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">Arrive</span>}</div></td>
                                                            <td className="px-6 py-4"><div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${styleClasses}`}><span className="material-icons-outlined text-sm">{item.icon}</span><span>{item.subType || item.type}</span></div></td>
                                                            <td className="px-6 py-4"><div><p className="font-bold text-gray-900 dark:text-white text-sm leading-snug">{item.name}</p>{item.meta && (<p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1.5 font-medium opacity-80">{item.type === 'Transport' && !item.isDropoff && <span className="material-icons-outlined text-[10px]">schedule</span>}{item.meta}</p>)}</div></td>
                                                            <td className="px-6 py-4"><div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 font-medium max-w-[180px]">{item.location ? (<><span className="material-icons-outlined text-sm opacity-60 shrink-0">place</span><span className="truncate" title={item.location}>{item.location}</span></>) : (<span className="opacity-30">-</span>)}</div></td>
                                                            <td className="px-6 py-4 text-right">{item.cost ? (<span className="font-bold text-gray-900 dark:text-white text-sm tabular-nums tracking-tight">{formatCurrency(item.cost)}</span>) : (<span className="text-gray-300 dark:text-gray-600 text-xs font-mono">-</span>)}</td>
                                                            <td className="px-6 py-4 text-right"><button onClick={() => { if (item.type === 'Transport') openTransportModal([item.ref]); if (item.type === 'Accommodation') openAccommodationModal(); if (item.type === 'Activity' || item.type === 'Reservation' || item.type === 'Tour') handleOpenActivityModal(dateStr, item.ref); }} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all opacity-0 group-hover:opacity-100"><span className="material-icons-outlined text-lg">edit_note</span></button></td>
                                                        </tr>
                                                    );
                                                })}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {/* ITINERARY (BOOKINGS) TAB - NEW DESIGN */}
            {activeTab === 'itinerary' && (
                <div className="space-y-12 animate-fade-in">
                    {/* Transport Section */}
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                                    <span className="material-icons-outlined text-xl">commute</span>
                                </div>
                                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Transportation</h3>
                            </div>
                            <div className="flex gap-2">
                                <div className="relative">
                                    <input 
                                        type="file" 
                                        ref={importInputRef} 
                                        className="hidden" 
                                        accept=".json,.csv"
                                        onChange={handleImportFlights}
                                    />
                                    <Button 
                                        size="sm" 
                                        variant="ghost" 
                                        className="border-dashed border-2 text-gray-400 hover:text-white hover:border-gray-500" 
                                        onClick={() => importInputRef.current?.click()}
                                    >
                                        <span className="material-icons-outlined text-sm mr-2">upload_file</span> 
                                        Import
                                    </Button>
                                </div>
                                <Button size="sm" variant="secondary" onClick={() => openTransportModal()}>
                                    + Add Booking
                                </Button>
                            </div>
                        </div>

                        {Object.keys(transportGroups).length === 0 ? (
                            <div className="p-12 text-center border-2 border-dashed border-gray-800 rounded-3xl">
                                <span className="material-icons-outlined text-4xl text-gray-600 mb-2">flight</span>
                                <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">No transport bookings yet</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-6">
                                {/* Fix: Explicitly type group as Transport[] to resolve reduce, map, and function call errors */}
                                {Object.entries(transportGroups).map(([id, group]: [string, Transport[]]) => {
                                    const first = group[0];
                                    return (
                                        <div key={id} className="bg-[#1c1c1e] rounded-3xl overflow-hidden border border-white/5 shadow-lg">
                                            {/* Header */}
                                            <div className="p-5 flex justify-between items-start border-b border-white/5">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center overflow-hidden">
                                                        {first.logoUrl ? (
                                                            <img src={first.logoUrl} className="w-full h-full object-contain p-1" />
                                                        ) : (
                                                            <span className="material-icons-outlined text-black">{getTransportIcon(first.mode)}</span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-white text-lg">{first.provider}</h4>
                                                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                                            <span>{first.identifier}</span>
                                                            <span className="w-1 h-1 rounded-full bg-gray-600"></span>
                                                            <span>{first.type}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-xl font-bold text-white">{formatCurrency(group.reduce((acc, t) => acc + (t.cost || 0), 0))}</div>
                                                    <button onClick={() => openTransportModal(group)} className="text-[10px] font-bold text-blue-400 hover:text-blue-300 uppercase tracking-widest mt-1">
                                                        Edit Details
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Legs */}
                                            <div className="p-6 space-y-8">
                                                {group.map((t, idx) => {
                                                    const isReturn = idx > 0 && t.origin === group[idx-1].destination; 
                                                    return (
                                                        <React.Fragment key={t.id}>
                                                            {/* Divider if return */}
                                                            {idx > 0 && (
                                                                <div className="flex items-center gap-4 py-2">
                                                                    <div className="h-px bg-white/10 flex-1"></div>
                                                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Return Journey • {Math.ceil((new Date(t.departureDate).getTime() - new Date(group[idx-1].arrivalDate).getTime()) / (86400000))} Days Later</span>
                                                                    <div className="h-px bg-white/10 flex-1"></div>
                                                                </div>
                                                            )}

                                                            <div className="flex items-center gap-6">
                                                                {/* Time Col */}
                                                                <div className="w-24 text-right">
                                                                    <div className="text-xl font-bold text-white">{formatTime(t.departureTime)}</div>
                                                                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-1">{calculateDuration(t)}</div>
                                                                    <div className="text-lg font-bold text-gray-400 mt-2">{formatTime(t.arrivalTime)}</div>
                                                                </div>

                                                                {/* Timeline Graphic */}
                                                                <div className="flex flex-col items-center self-stretch py-1">
                                                                    <div className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                                                                    <div className="w-0.5 flex-1 bg-gradient-to-b from-blue-500/50 to-gray-700/50 my-1"></div>
                                                                    <div className="w-2 h-2 rounded-full border-2 border-gray-600 bg-[#1c1c1e]"></div>
                                                                </div>

                                                                {/* Route Info */}
                                                                <div className="flex-1 space-y-4">
                                                                    <div>
                                                                        <div className="flex items-baseline gap-2">
                                                                            <span className="text-2xl font-bold text-white">{t.origin}</span>
                                                                            <span className="text-xs font-bold text-gray-500">{new Date(t.departureDate).toLocaleDateString()}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        <div className="flex items-baseline gap-2">
                                                                            <span className="text-2xl font-bold text-white">{t.destination}</span>
                                                                            <span className="text-xs font-bold text-gray-500">{new Date(t.arrivalDate).toLocaleDateString()}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Badges */}
                                                                <div className="flex flex-col gap-2 items-end">
                                                                    <div className="px-2 py-1 rounded bg-[#2c2c2e] border border-white/5 text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                                                                        {t.travelClass || 'Economy'}
                                                                    </div>
                                                                    {t.seatNumber && (
                                                                        <div className="px-2 py-1 rounded bg-[#2c2c2e] border border-white/5 text-[10px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1">
                                                                            <span className="material-icons-outlined text-[10px]">event_seat</span> {t.seatNumber}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Accommodation Section */}
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                                    <span className="material-icons-outlined text-xl">hotel</span>
                                </div>
                                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Accommodation</h3>
                            </div>
                            <Button size="sm" variant="secondary" onClick={() => openAccommodationModal()}>
                                + Add Stay
                            </Button>
                        </div>

                        {(!trip.accommodations || trip.accommodations.length === 0) ? (
                            <div className="p-12 text-center border-2 border-dashed border-gray-800 rounded-3xl">
                                <span className="material-icons-outlined text-4xl text-gray-600 mb-2">apartment</span>
                                <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">No accommodations booked</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                {trip.accommodations.map(stay => (
                                    <div key={stay.id} className="bg-[#1c1c1e] rounded-2xl p-5 border border-white/5 shadow-lg flex justify-between items-center group hover:bg-[#252528] transition-colors">
                                        <div className="flex items-center gap-5">
                                            <div className="w-16 h-16 rounded-xl bg-blue-900/30 flex items-center justify-center text-blue-400 text-2xl font-bold overflow-hidden">
                                                {stay.logoUrl ? <img src={stay.logoUrl} className="w-full h-full object-cover" /> : stay.name.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-white text-lg">{stay.name}</h4>
                                                <p className="text-xs text-gray-500 mt-1">{stay.address}</p>
                                                <div className="flex gap-2 mt-3">
                                                    <span className="bg-[#3a3a3c] text-gray-300 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                                                        {calculateNights(stay.checkInDate, stay.checkOutDate)} Nights
                                                    </span>
                                                    <span className="bg-[#3a3a3c] text-gray-300 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                                                        {new Date(stay.checkInDate).toLocaleDateString(undefined, {day:'numeric', month:'short'}).toUpperCase()} - {new Date(stay.checkOutDate).toLocaleDateString(undefined, {day:'numeric', month:'short'}).toUpperCase()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            {stay.cost && <div className="text-lg font-bold text-emerald-400">{formatCurrency(stay.cost)}</div>}
                                            <button onClick={() => openAccommodationModal()} className="text-gray-500 hover:text-white transition-colors">
                                                <span className="material-icons-outlined">edit</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* BUDGET TAB - NEW DESIGN */}
            {activeTab === 'budget' && (
                <div className="space-y-8 animate-fade-in">
                    
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Total Cost Card (Emerald Gradient) */}
                        <div className="p-8 rounded-[2rem] bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-2xl relative overflow-hidden group">
                            <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/20 rounded-full blur-3xl group-hover:scale-110 transition-transform"></div>
                            <p className="text-xs font-bold text-emerald-100 uppercase tracking-widest mb-2">Total Trip Cost</p>
                            <h2 className="text-5xl font-black tracking-tight">{formatCurrency(totalCost)}</h2>
                        </div>

                        {/* Cost Per Person */}
                        <div className="p-8 rounded-[2rem] bg-[#1c1c1e] border border-white/5 shadow-xl relative">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Cost Per Person</p>
                            <h2 className="text-4xl font-black text-white">{formatCurrency(costPerPerson)}</h2>
                            <p className="text-xs text-gray-500 mt-2">{trip.participants.length} Travelers</p>
                        </div>

                        {/* Daily Average */}
                        <div className="p-8 rounded-[2rem] bg-[#1c1c1e] border border-white/5 shadow-xl relative">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Daily Average</p>
                            <h2 className="text-4xl font-black text-white">{formatCurrency(costPerDay)}</h2>
                            <p className="text-xs text-gray-500 mt-2">{duration} Days</p>
                        </div>
                    </div>

                    {/* Lower Section Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Donut Chart Section */}
                        <div className="lg:col-span-1 bg-[#1c1c1e] rounded-[2.5rem] p-8 border border-white/5 shadow-xl flex flex-col items-center justify-center relative">
                            <h4 className="absolute top-8 left-8 text-xs font-black text-gray-500 uppercase tracking-widest">Expense Distribution</h4>
                            
                            <div className="relative w-64 h-64 mt-4">
                                <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                                    {/* Background Circle */}
                                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="#2c2c2e" strokeWidth="12" />
                                    
                                    {/* Segments - Simplified visualization logic */}
                                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="#3b82f6" strokeWidth="12" 
                                        strokeDasharray={`${(transportCost/totalCost)*251} 251`} className="transition-all duration-1000" />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-3xl font-black text-white">100%</span>
                                </div>
                            </div>

                            <div className="flex gap-4 mt-8">
                                <div className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                                    <span className="text-xs font-bold text-gray-400">Transport</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                                    <span className="text-xs font-bold text-gray-400">Stays</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-full bg-purple-500"></span>
                                    <span className="text-xs font-bold text-gray-400">Activities</span>
                                </div>
                            </div>
                        </div>

                        {/* Itemized List Section */}
                        <div className="lg:col-span-2 space-y-4">
                            <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">Itemized Expenses</h4>
                            
                            {/* Transportation Row */}
                            <div className="bg-[#1c1c1e] p-6 rounded-3xl border border-white/5 flex items-center justify-between group hover:border-white/10 transition-all">
                                <div className="flex items-center gap-5">
                                    <div className="w-12 h-12 rounded-2xl bg-blue-900/30 text-blue-500 flex items-center justify-center">
                                        <span className="material-icons-outlined text-2xl">flight</span>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-white text-lg">Transportation</h4>
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{trip.transports?.length || 0} Bookings</p>
                                    </div>
                                </div>
                                <div className="text-xl font-bold text-white">{formatCurrency(transportCost)}</div>
                            </div>

                            {/* Accommodation Row */}
                            <div className="bg-[#1c1c1e] p-6 rounded-3xl border border-white/5 flex items-center justify-between group hover:border-white/10 transition-all">
                                <div className="flex items-center gap-5">
                                    <div className="w-12 h-12 rounded-2xl bg-amber-900/30 text-amber-500 flex items-center justify-center">
                                        <span className="material-icons-outlined text-2xl">hotel</span>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-white text-lg">Accommodation</h4>
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{trip.accommodations?.length || 0} Properties</p>
                                    </div>
                                </div>
                                <div className="text-xl font-bold text-white">{formatCurrency(stayCost)}</div>
                            </div>

                            {/* Activities Row */}
                            <div className="bg-[#1c1c1e] p-6 rounded-3xl border border-white/5 flex items-center justify-between group hover:border-white/10 transition-all">
                                <div className="flex items-center gap-5">
                                    <div className="w-12 h-12 rounded-2xl bg-purple-900/30 text-purple-500 flex items-center justify-center">
                                        <span className="material-icons-outlined text-2xl">local_activity</span>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-white text-lg">Activities & Tours</h4>
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{trip.activities?.length || 0} Items</p>
                                    </div>
                                </div>
                                <div className="text-xl font-bold text-white">{formatCurrency(activityCost)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modals */}
            <Modal isOpen={isTransportModalOpen} onClose={() => setIsTransportModalOpen(false)} title="Manage Transport" maxWidth="max-w-4xl">
                <TransportConfigurator 
                    initialData={editingTransports || []}
                    onSave={handleSaveTransports}
                    onDelete={handleDeleteTransports}
                    onCancel={() => setIsTransportModalOpen(false)}
                    defaultStartDate={selectedDateForModal || trip.startDate}
                    defaultEndDate={selectedDateForModal || trip.endDate}
                />
            </Modal>
            
            <Modal isOpen={isAccommodationModalOpen} onClose={() => setIsAccommodationModalOpen(false)} title="Manage Accommodation" maxWidth="max-w-3xl">
                <AccommodationConfigurator 
                    initialData={editingAccommodations || []}
                    onSave={handleSaveAccommodations}
                    onDelete={handleDeleteAccommodations}
                    onCancel={() => setIsAccommodationModalOpen(false)}
                    defaultStartDate={selectedDateForModal || trip.startDate}
                    defaultEndDate={selectedDateForModal || trip.endDate}
                />
            </Modal>

            <TripModal 
                isOpen={isEditTripOpen} 
                onClose={() => setIsEditTripOpen(false)} 
                onSubmit={handleUpdateTrip}
                onDelete={handleDeleteTrip}
                users={users}
                initialData={trip}
            />

            <LeaveRequestModal 
                isOpen={isLeaveModalOpen}
                onClose={() => setIsLeaveModalOpen(false)}
                onSubmit={handleTimeOffSubmit}
                initialData={trip}
                users={users}
                entitlements={entitlements}
                trips={allTrips}
                holidays={holidays}
                workspaceConfig={settings}
            />

            <Modal isOpen={isActivityModalOpen} onClose={() => setIsActivityModalOpen(false)} title={activityForm.id ? "Edit Item" : "Add Schedule Item"}>
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input label="Title" placeholder="e.g. Louvre Museum" value={activityForm.title || ''} onChange={e => setActivityForm({...activityForm, title: e.target.value})} className="!font-bold" />
                        <Select label="Type" options={[{label: 'Activity', value: 'Activity'}, {label: 'Reservation', value: 'Reservation'}, {label: 'Tour', value: 'Tour'}]} value={activityForm.type || 'Activity'} onChange={e => setActivityForm({...activityForm, type: e.target.value as any})} />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                        <Input label="Date" type="date" value={activityForm.date || currentDayForActivity || ''} onChange={e => setActivityForm({...activityForm, date: e.target.value})} />
                        <TimeInput label="Time" value={activityForm.time || '12:00'} onChange={val => setActivityForm({...activityForm, time: val})} />
                    </div>
                    <Autocomplete label="Location" placeholder="e.g. Rue de Rivoli, Paris" value={activityForm.location || ''} onChange={val => setActivityForm({...activityForm, location: val})} fetchSuggestions={fetchLocationSuggestions} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="relative">
                            <Input label="Cost" type="number" placeholder="0.00" value={activityForm.cost || ''} onChange={e => setActivityForm({...activityForm, cost: parseFloat(e.target.value)})} className="pl-8" />
                            <span className="absolute left-3 top-9 text-gray-400 font-bold">{getCurrencySymbol(settings?.currency || 'USD')}</span>
                        </div>
                    </div>
                    <Input label="Notes / Description" placeholder="Booking ref, instructions..." value={activityForm.description || ''} onChange={e => setActivityForm({...activityForm, description: e.target.value})} />
                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-white/5">
                        <Button variant="ghost" onClick={() => setIsActivityModalOpen(false)}>Cancel</Button>
                        <Button variant="primary" onClick={handleSaveActivity} disabled={!activityForm.title || !activityForm.date}>Save Item</Button>
                    </div>
                </div>
            </Modal>

            {/* Cinematic Modal */}
            {isCinematicOpen && (
                <div className="fixed inset-0 z-[100] bg-black">
                    <div className="absolute top-6 right-6 z-[110]">
                        <button onClick={() => setIsCinematicOpen(false)} className="bg-black/50 hover:bg-black/80 text-white rounded-full p-3 backdrop-blur-md transition-colors border border-white/20">
                            <span className="material-icons-outlined text-2xl">close</span>
                        </button>
                    </div>
                    <ExpeditionMap3D 
                        trips={[trip]} 
                        animateRoutes={true} 
                        showFrequencyWeight={true}
                        autoPlay={true}
                    />
                </div>
            )}

            {/* Import Modal */}
            <Modal isOpen={importPreview.open} onClose={() => setImportPreview({ open: false, candidates: [] })} title="AI Flight Analysis" maxWidth="max-w-4xl">
               <div className="space-y-6">
                   <div className="flex flex-col md:flex-row gap-4 bg-gray-50 dark:bg-white/5 p-4 rounded-2xl border border-gray-100 dark:border-white/5">
                       <Input placeholder="Filter by flight or location..." value={importFilters.search} onChange={e => setImportFilters({...importFilters, search: e.target.value})} className="!bg-white dark:!bg-black/20" />
                       <div className="flex gap-2">
                           <Input type="date" value={importFilters.minDate} onChange={e => setImportFilters({...importFilters, minDate: e.target.value})} className="!bg-white dark:!bg-black/20" />
                           <Input type="date" value={importFilters.maxDate} onChange={e => setImportFilters({...importFilters, maxDate: e.target.value})} className="!bg-white dark:!bg-black/20" />
                       </div>
                   </div>
                   <div className="flex justify-between items-center px-2">
                       <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{selectedCount} Selected</span>
                       <Button size="sm" variant="ghost" onClick={toggleAllFiltered}>{filteredCandidates.every(c => c.selected) ? 'Deselect All' : 'Select All'}</Button>
                   </div>
                   <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar p-1">
                       {filteredCandidates.map(candidate => {
                           const t = candidate.trip;
                           const isSelected = candidate.selected;
                           const isExpanded = expandedCandidateId === t.id;
                           return (
                               <div key={t.id} className={`border rounded-2xl transition-all ${isSelected ? 'border-blue-500 bg-blue-50/20 dark:bg-blue-900/10' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-gray-800'}`}>
                                   <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => toggleCandidateSelection(t.id)}>
                                       <div className={`w-6 h-6 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'}`}>
                                           {isSelected && <span className="material-icons-outlined text-white text-xs">check</span>}
                                       </div>
                                       <div className="flex-1">
                                           <div className="flex justify-between items-center"><h4 className="font-bold text-gray-900 dark:text-white">{t.name}</h4><Badge color={candidate.confidence > 80 ? 'green' : candidate.confidence > 50 ? 'amber' : 'gray'}>{candidate.confidence}% Match</Badge></div>
                                           <div className="text-xs text-gray-500 mt-1 flex gap-3"><span>{new Date(t.startDate).toLocaleDateString()}</span><span>•</span><span>{t.transports?.length} Flights</span></div>
                                       </div>
                                       <button onClick={(e) => { e.stopPropagation(); setExpandedCandidateId(isExpanded ? null : t.id); }} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full text-gray-400"><span className="material-icons-outlined">{isExpanded ? 'expand_less' : 'expand_more'}</span></button>
                                   </div>
                                   {isExpanded && t.transports && (
                                       <div className="border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-black/20 p-4 space-y-2">
                                           {t.transports.map((tr, idx) => (
                                               <div key={idx} className="flex items-center gap-3 text-xs p-2 bg-white dark:bg-white/5 rounded-lg border border-gray-100 dark:border-white/5">
                                                   <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{tr.departureTime}</span>
                                                   <span className="font-bold">{tr.origin} &rarr; {tr.destination}</span>
                                                   <span className="text-gray-500">{tr.provider} {tr.identifier}</span>
                                               </div>
                                           ))}
                                       </div>
                                   )}
                               </div>
                           );
                       })}
                       {filteredCandidates.length === 0 && <div className="text-center py-10 text-gray-400">No flights match your filters.</div>}
                   </div>
                   <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-white/5">
                       <Button variant="ghost" onClick={() => setImportPreview({ open: false, candidates: [] })}>Cancel</Button>
                       <Button variant="primary" onClick={confirmImportFlights} disabled={selectedCount === 0}>Import {selectedCount} Trips</Button>
                   </div>
               </div>
            </Modal>

        </div>
    );
};
