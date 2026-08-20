
import React, { useEffect, useState, useRef, useMemo, Suspense } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Card, Button, Badge, Tabs, Modal, Input, Autocomplete, TimeInput, Select } from '../components/ui';
import { TransportConfigurator } from '../components/FlightConfigurator';
import { AccommodationConfigurator } from '../components/AccommodationConfigurator';
import { LocationManager } from '../components/LocationManager';
import { TripModal } from '../components/TripModal';
import { PackingList } from '../components/PackingList';
import { dataService } from '../services/mockDb';
import { flightImporter } from '../services/flightImportExport';
import { calendarService } from '../services/calendarExport';
import { Trip, User, Transport, Accommodation, WorkspaceSettings, Activity, TransportMode, LocationEntry, EntitlementType, PublicHoliday, SavedConfig, PackingItem, Carrier } from '../types';
import { searchLocations, resolvePlaceName, getCoordinates } from '../services/geocoding';
import { GoogleGenAI } from "@google/genai";
const DeckFlightMap = React.lazy(() => import('../components/DeckFlightMap').then(m => ({ default: m.DeckFlightMap || m.default })));
const FlightImportWizard = React.lazy(() => import('../components/FlightImportWizard').then(m => ({ default: m.FlightImportWizard })));
import { getMerchantLogoUrl } from '../utils/brandfetch';

interface AirlineLogoProps {
    provider?: string;
    brandfetchApiKey?: string;
    carriers?: Carrier[];
    fallback: React.ReactNode;
}

const AirlineLogo: React.FC<AirlineLogoProps> = ({ provider, brandfetchApiKey, carriers = [], fallback }) => {
    const [logoUrl, setLogoUrl] = useState<string>('');
    const [attempt, setAttempt] = useState(0);

    const getAirlineLogoUrl = (nameStr: string, currentAttempt: number): string => {
        let domain = '';
        const airlineName = nameStr.trim();

        if (carriers.length > 0) {
            const custom = carriers.find(
                (c: any) => c.code?.toLowerCase().trim() === airlineName.toLowerCase().trim() ||
                            c.name?.toLowerCase().trim() === airlineName.toLowerCase().trim()
            );
            if (custom && custom.domain) {
                domain = custom.domain.trim();
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

        const overrides: Record<string, string> = {};
        carriers.forEach(c => {
            if (c.code) overrides[c.code.toLowerCase().trim()] = c.domain;
            if (c.name) overrides[c.name.toLowerCase().trim()] = c.domain;
        });

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
            setLogoUrl(getAirlineLogoUrl(provider, 0));
            setAttempt(0);
        }
    }, [provider, carriers, brandfetchApiKey]);

    const handleError = () => {
        if (provider && attempt < 3) {
            const nextAttempt = attempt + 1;
            setAttempt(nextAttempt);
            setLogoUrl(getAirlineLogoUrl(provider, nextAttempt));
        } else {
            setLogoUrl('__failed__');
        }
    };

    if (!provider || logoUrl === '__failed__') return <>{fallback}</>;

    return (
        <img 
            src={logoUrl || getAirlineLogoUrl(provider, 0)} 
            alt={provider} 
            className="w-full h-full object-contain animate-fade-in" 
            referrerPolicy="no-referrer"
            onError={handleError}
        />
    );
};

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

const getWeatherDescription = (code: number): string => {
    if (code === 0) return "Clear sky";
    if (code === 1) return "Mainly clear";
    if (code === 2) return "Partly cloudy";
    if (code === 3) return "Overcast";
    if (code === 45 || code === 48) return "Foggy";
    if (code === 51 || code === 53 || code === 55) return "Drizzle";
    if (code === 56 || code === 57) return "Freezing drizzle";
    if (code === 61 || code === 63 || code === 65) return "Rainy";
    if (code === 66 || code === 67) return "Freezing rain";
    if (code === 71 || code === 73 || code === 75) return "Snowy";
    if (code === 77) return "Snow grains";
    if (code === 80 || code === 81 || code === 82) return "Rain showers";
    if (code === 85 || code === 86) return "Snow showers";
    if (code === 95) return "Thunderstorm";
    if (code === 96 || code === 99) return "Thunderstorm with hail";
    return "Cloudy";
};

interface WeatherVibe {
    bg: string;
    border: string;
    icon: string;
    label: string;
    pillBg: string;
}

const getWeatherVibeStyle = (code: number | undefined): WeatherVibe => {
    if (code === undefined) return {
        bg: "from-blue-500/[0.08] to-purple-500/[0.08] dark:from-blue-500/[0.04] dark:to-purple-500/[0.04]",
        border: "border-gray-200/50 dark:border-white/5",
        icon: "cloud",
        label: "Weather loading...",
        pillBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-250 dark:border-blue-500/10"
    };

    if (code <= 1) return { // Clear/Sunny
        bg: "from-amber-400/25 via-amber-300/[0.08] to-transparent dark:from-amber-500/10 dark:via-orange-500/[0.03] dark:to-transparent",
        border: "border-amber-200/60 dark:border-amber-500/10",
        icon: "wb_sunny",
        label: "Clear Sky",
        pillBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/65 dark:border-amber-500/10"
    };
    if (code <= 3) return { // Cloudy/Overcast
        bg: "from-slate-400/20 via-sky-300/[0.06] to-transparent dark:from-slate-700/15 dark:via-sky-900/[0.03] dark:to-transparent",
        border: "border-slate-200/60 dark:border-slate-500/10",
        icon: "cloud",
        label: code === 2 ? "Partly Cloudy" : "Overcast",
        pillBg: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-200/60 dark:border-slate-500/10"
    };
    if (code <= 48) return { // Foggy
        bg: "from-zinc-400/15 via-teal-300/[0.06] to-transparent dark:from-zinc-700/10 dark:via-teal-950/[0.03] dark:to-transparent",
        border: "border-zinc-300/50 dark:border-zinc-650/10",
        icon: "foggy",
        label: "Foggy",
        pillBg: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-300/50 dark:border-zinc-650/10"
    };
    if (code <= 67 || (code >= 80 && code <= 82)) return { // Rainy/Showers
        bg: "from-sky-500/20 via-indigo-400/[0.08] to-transparent dark:from-sky-950/25 dark:via-indigo-950/[0.05] dark:to-transparent",
        border: "border-sky-200/60 dark:border-sky-500/10",
        icon: "umbrella",
        label: "Rainy",
        pillBg: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-200/60 dark:border-sky-500/10"
    };
    if (code <= 77 || (code >= 85 && code <= 86)) return { // Snowy
        bg: "from-cyan-300/20 via-slate-100/10 to-transparent dark:from-sky-900/15 dark:via-slate-800/10 dark:to-transparent",
        border: "border-cyan-200/60 dark:border-cyan-500/10",
        icon: "ac_unit",
        label: "Snowy",
        pillBg: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-200/60 dark:border-cyan-500/10"
    };
    if (code <= 99) return { // Thunderstorm
        bg: "from-purple-500/20 via-fuchsia-400/[0.06] to-transparent dark:from-purple-950/25 dark:via-fuchsia-950/[0.04] dark:to-transparent",
        border: "border-purple-200/60 dark:border-purple-550/10",
        icon: "thunderstorm",
        label: "Thunderstorm",
        pillBg: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200/60 dark:border-purple-550/10"
    };

    return {
        bg: "from-blue-500/[0.08] to-purple-500/[0.08] dark:from-blue-500/[0.04] dark:to-purple-500/[0.04]",
        border: "border-gray-200/50 dark:border-white/5",
        icon: "cloud",
        label: "Cloudy",
        pillBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-gray-200/50 dark:border-white/5"
    };
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
                - Travelers: ${(trip.participants || []).length}
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
    const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
    const [isCinematicOpen, setIsCinematicOpen] = useState(false);
    
    // Import State
    const [isImportWizardOpen, setIsImportWizardOpen] = useState(false);
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

    const [weather, setWeather] = useState<any>(null);
    const [weatherLoading, setWeatherLoading] = useState<boolean>(false);

    useEffect(() => {
        if (!trip) return;
        const fetchTripWeather = async () => {
            setWeatherLoading(true);
            let lat = trip.coordinates?.lat;
            let lng = trip.coordinates?.lng;

            if (!lat || !lng) {
                const coords = await getCoordinates(trip.location);
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
                    console.error("Trip weather fetch failed", e);
                }
            }
            setWeatherLoading(false);
        };
        fetchTripWeather();
    }, [trip?.location, trip?.coordinates]);

    const loadData = () => {
        setLoading(true);
        Promise.all([
            dataService.getTrips(), 
            dataService.getUsers(),
            dataService.getWorkspaceSettings(),
            dataService.getEntitlementTypes(),
            dataService.getSavedConfigs(),
            dataService.getFlights()
        ]).then(([tripsList, allUsers, s, ents, configs, independentFlights]) => {
            const runAutoAssignment = async () => {
                let hasChanges = false;
                const updatedTrips = [...tripsList];
                const flightsToDelete: string[] = [];

                for (const flight of (independentFlights || [])) {
                    // Only auto-assign flights that are truly independent (unassigned)
                    if (flight.tripId && flight.tripId !== 'unassigned') continue;
                    if (!flight.departureDate) continue;
                    const fDate = new Date(flight.departureDate);
                    if (isNaN(fDate.getTime())) continue;

                    // Match with a trip
                    const matchingTripIndex = updatedTrips.findIndex(tripItem => {
                        if (!tripItem.startDate || !tripItem.endDate) return false;
                        const sDate = new Date(tripItem.startDate);
                        const eDate = new Date(tripItem.endDate);
                        return fDate >= sDate && fDate <= eDate;
                    });

                    if (matchingTripIndex >= 0) {
                        const trip = updatedTrips[matchingTripIndex];
                        if (!trip.transports) trip.transports = [];

                        if (!trip.transports.some(item => item.id === flight.id)) {
                            trip.transports.push({ ...flight, mode: 'Flight' });
                            flightsToDelete.push(flight.id);
                            hasChanges = true;
                        }
                    }
                }

                if (hasChanges) {
                    for (const trip of updatedTrips) {
                        const gotAdded = trip.transports?.some(item => flightsToDelete.includes(item.id));
                        if (gotAdded) {
                            await dataService.updateTrip(trip);
                        }
                    }
                    for (const fId of flightsToDelete) {
                        await dataService.deleteFlight(fId);
                    }
                    // Fetch latest trips to synchronize state
                    const freshTrips = await dataService.getTrips();
                    return freshTrips;
                }
                return tripsList;
            };

            runAutoAssignment().then(finalTrips => {
                const t = finalTrips.find(x => x.id === tripId);
                setTrip(t || null);
                if (t) setCalendarDate(new Date(t.startDate));
                setUsers(allUsers);
                setSettings(s);
                setAllTrips(finalTrips);
                setEntitlements(ents);
                const flatHolidays = configs.flatMap(c => c.holidays.map(h => ({ ...h, configId: c.id })));
                setHolidays(flatHolidays);
                setLoading(false);
            });
        }).catch(err => {
            console.error("Failed to load trip details:", err);
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
        const savedTrip = await dataService.updateTrip(updatedTrip);
        setTrip(savedTrip);
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
                const groupedTrips = flightImporter.groupTransports(rawTransports, trip.participants?.[0] || 'temp');
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

    const handleSaveRoute = async (items: LocationEntry[], finalTransports: Transport[]) => {
        if (!trip) return;

        console.log("handleSaveRoute CALLED with:", { itemsLength: items.length, finalTransports });

        // Preserve any transports that the route manager did NOT manage/touch
        const finalTransportIds = new Set(finalTransports.map(t => t.id));
        const originalTransports = trip.transports || [];

        const preservedTransports = originalTransports.filter(t => {
            // If the route manager explicitly outputted a transport with this ID, we use the new version
            if (finalTransportIds.has(t.id)) {
                return false;
            }
            // If the transport is a route-managed transport (itineraryId is 'route-gen' or 'route-booked'), 
            // but it is NOT in the new finalTransports, it means it was deleted by the user in the route manager!
            if (t.itineraryId === 'route-gen' || t.itineraryId === 'route-booked') {
                return false;
            }
            // Keep all other manually entered bookings, independent flights, cruises, etc.
            return true;
        });

        const mergedTransports = [...preservedTransports, ...finalTransports];
        console.log("handleSaveRoute: preservedTransports count:", preservedTransports.length, "mergedTransports count:", mergedTransports.length);

        const updatedTrip = { ...trip, locations: items, transports: mergedTransports };
        const savedTrip = await dataService.updateTrip(updatedTrip);
        console.log("handleSaveRoute: savedTrip returned with transports count:", savedTrip.transports?.length);
        setTrip(savedTrip);
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
    const costPerPerson = (trip.participants || []).length > 0 ? totalCost / (trip.participants || []).length : 0;
    const costPerDay = duration > 0 ? totalCost / duration : 0;

    const compareTransports = (a: Transport, b: Transport) => {
        const dateA = a.departureDate || '1970-01-01';
        const timeA = a.departureTime || '00:00';
        const dateB = b.departureDate || '1970-01-01';
        const timeB = b.departureTime || '00:00';
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return timeA.localeCompare(timeB);
    };

    // Group by Itinerary ID
    const transportGroups = [...(trip.transports || [])].sort(compareTransports).reduce((groups, t) => {
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

    interface UnifiedDayItem {
        id: string;
        type: 'Transport' | 'Accommodation' | 'Activity' | 'Reservation' | 'Tour';
        subType?: string;
        time: string;
        title: string;
        location?: string;
        cost?: number;
        icon: string;
        ref: any;
        meta?: string;
        isDropoff?: boolean;
        isCheckOut?: boolean;
        isOvernight?: boolean;
    }

    const getDayItems = (dateStr: string): UnifiedDayItem[] => {
        const items: UnifiedDayItem[] = [];

        // 1. Transports
        const transports = getDayEvents(dateStr);
        transports.forEach(t => {
            const dur = !t.isDropoff ? calculateDuration(t) : '';
            const dist = t.distance ? `${t.distance} km` : '';
            items.push({
                id: t.id + (t.isDropoff ? '_drop' : ''),
                type: 'Transport',
                subType: t.mode,
                time: t.isDropoff ? t.arrivalTime || '00:00' : t.departureTime || '00:00',
                title: t.isDropoff ? `Dropoff ${t.mode}` : (t.mode === 'Car Rental' || t.mode === 'Personal Car' ? `Pickup ${t.mode}` : `${t.mode} to ${t.destination}`),
                location: t.isDropoff ? t.dropoffLocation || t.destination : t.pickupLocation || t.origin,
                cost: (t.cost || 0) > 0 ? t.cost : undefined,
                icon: getTransportIcon(t.mode),
                ref: t,
                meta: !t.isDropoff ? `${dur}${dist ? ` • ${dist}` : ''}` : 'Arrival',
                isDropoff: t.isDropoff
            });
        });

        // 2. Accommodations
        trip.accommodations?.forEach(a => {
            // Check-In
            if (a.checkInDate === dateStr) {
                const nights = calculateNights(a.checkInDate, a.checkOutDate);
                items.push({
                    id: a.id + '_checkin',
                    type: 'Accommodation',
                    subType: a.type,
                    time: a.checkInTime || '15:00',
                    title: `${a.name} (Check-In)`,
                    location: a.address,
                    cost: a.cost,
                    icon: 'hotel',
                    ref: a,
                    meta: `${nights} Night${nights > 1 ? 's' : ''}`
                });
            }
            // Check-Out
            if (a.checkOutDate === dateStr) {
                items.push({
                    id: a.id + '_checkout',
                    type: 'Accommodation',
                    subType: a.type,
                    time: a.checkOutTime || '11:00',
                    title: `${a.name} (Check-Out)`,
                    location: a.address,
                    icon: 'hotel',
                    ref: a,
                    isCheckOut: true
                });
            }
            // Overnight Stay
            if (dateStr > a.checkInDate && dateStr < a.checkOutDate) {
                items.push({
                    id: a.id + '_overnight',
                    type: 'Accommodation',
                    subType: a.type,
                    time: '08:00', // start morning stay
                    title: `${a.name} (Overnight Stay)`,
                    location: a.address,
                    icon: 'hotel',
                    ref: a,
                    isOvernight: true
                });
            }
        });

        // 3. Activities
        trip.activities?.forEach(a => {
            if (a.date === dateStr) {
                items.push({
                    id: a.id,
                    type: (a.type as any) || 'Activity',
                    subType: a.type,
                    time: a.time || '12:00',
                    title: a.title,
                    location: a.location,
                    cost: a.cost,
                    icon: a.type === 'Reservation' ? 'restaurant' : a.type === 'Tour' ? 'tour' : 'local_activity',
                    ref: a,
                    meta: a.description
                });
            }
        });

        // Sort by time starting from earliest to latest
        return items.sort((a, b) => {
            const timeA = a.time || '23:59';
            const timeB = b.time || '23:59';
            return timeA.localeCompare(timeB);
        });
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
        <div className="space-y-8 animate-fade-in max-w-[1400px] mx-auto pb-12 px-4 md:px-0">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                {/* Left Card: Trip Header Info, Stats, Actions */}
                {(() => {
                    const vibe = getWeatherVibeStyle(weather?.current_weather?.weathercode);
                    return (
                        <div className={`lg:col-span-8 relative rounded-[2.5rem] bg-white dark:bg-gray-900 shadow-2xl border ${vibe.border} overflow-hidden flex flex-col justify-between transition-all duration-500`}>
                            <div className={`absolute inset-0 bg-gradient-to-br ${vibe.bg} pointer-events-none transition-all duration-500`} />
                            <div className="relative p-6 lg:p-8 flex flex-col gap-6 h-full justify-between">
                                <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                                    <div className="flex items-start gap-4">
                                        <button onClick={onBack} className="w-12 h-12 rounded-xl bg-white dark:bg-gray-800 shadow-md border border-gray-100 dark:border-white/10 flex items-center justify-center text-gray-400 hover:text-blue-500 transition-colors shrink-0">
                                            <span className="material-icons-outlined text-lg">arrow_back</span>
                                        </button>
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-3xl md:text-4xl">{trip.icon || '✈️'}</span>
                                                <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white tracking-tight">{trip.name}</h1>
                                            </div>
                                            <div className="flex flex-wrap gap-3 mt-4 items-center">
                                                {/* Address Info block with customized address icon */}
                                                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50/60 dark:bg-gray-800/20 border border-gray-150 dark:border-white/5 rounded-full text-xs md:text-sm font-bold text-gray-600 dark:text-gray-350 shadow-sm">
                                                    <span className="material-icons-outlined text-base text-blue-500">fmd_good</span>
                                                    <span>{trip.location}</span>
                                                </div>

                                                {/* Date Info block with customized calendar icon */}
                                                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50/60 dark:bg-gray-800/20 border border-gray-150 dark:border-white/5 rounded-full text-xs md:text-sm font-bold text-gray-600 dark:text-gray-350 shadow-sm">
                                                    <span className="material-icons-outlined text-base text-purple-500">calendar_today</span>
                                                    <span>{new Date(trip.startDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})} - {new Date(trip.endDate).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'})}</span>
                                                </div>

                                                {/* Weather Condition Info block with customized dynamic weather icon */}
                                                {weather && weather.current_weather && (
                                                    <div className={`flex items-center gap-2 px-3 py-1.5 border rounded-full text-xs md:text-sm font-bold shadow-sm transition-all duration-300 ${vibe.pillBg}`}>
                                                        <span className="material-icons-outlined text-base">{vibe.icon}</span>
                                                        <span>
                                                            {Math.round(weather.current_weather.temperature)}°C · {getWeatherDescription(weather.current_weather.weathercode)}
                                                            {weather.daily && (
                                                                <span className="opacity-80 ml-1.5 text-[11px] font-normal">
                                                                    (H: {Math.round(weather.daily.temperature_2m_max[0])}° L: {Math.round(weather.daily.temperature_2m_min[0])}°)
                                                                </span>
                                                            )}
                                                        </span>
                                                    </div>
                                                )}
                                                {weatherLoading && (
                                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50/60 dark:bg-gray-800/20 border border-gray-150 dark:border-white/5 rounded-full text-xs md:text-sm font-bold text-gray-400 animate-pulse">
                                                        <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 border-t-purple-600 animate-spin" />
                                                        <span>Syncing weather...</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="flex flex-wrap gap-1.5 md:flex-col">
                                            <Button size="sm" variant="secondary" onClick={() => setIsCinematicOpen(true)} icon={<span className="material-icons-outlined">movie_filter</span>}>Cinematic View</Button>
                                            <Button size="sm" variant="secondary" onClick={() => {
                                                const ics = calendarService.generateIcsContent([trip], 'WanderGrid');
                                                calendarService.downloadIcs(ics, `trip-${trip.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.ics`);
                                            }} icon={<span className="material-icons-outlined">event</span>}>ICS Calendar</Button>
                                            <Button size="sm" variant="secondary" onClick={() => setIsEditTripOpen(true)} icon={<span className="material-icons-outlined">edit</span>}>Edit Settings</Button>
                                        </div>
                                    </div>
                                </div>

                                {/* Stat Cards */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                                    <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl text-center flex flex-col justify-center">
                                        <span className="text-lg md:text-xl font-black text-emerald-600 dark:text-emerald-450">{formatCurrency(totalCost)}</span>
                                        <span className="text-[9px] font-black text-emerald-500/70 uppercase tracking-wider mt-0.5">Total Cost</span>
                                    </div>
                                    <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-2xl text-center flex flex-col justify-center">
                                        <span className="text-lg md:text-xl font-black text-blue-600 dark:text-blue-450">{duration}</span>
                                        <span className="text-[9px] font-black text-blue-500/70 uppercase tracking-wider mt-0.5">Days Duration</span>
                                    </div>
                                    <div className="p-3 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30 rounded-2xl text-center flex flex-col justify-center items-center">
                                        <div className="flex -space-x-1.5 mb-0.5 justify-center">
                                            {(trip.participants || []).map((pid, idx) => {
                                                const u = users.find(u => u.id === pid);
                                                return u ? <div key={idx} className="w-5 h-5 rounded-full bg-purple-100 border-2 border-white flex items-center justify-center text-[8px] font-bold text-purple-800" title={u.name}>{u.name.charAt(0)}</div> : null;
                                            })}
                                        </div>
                                        <span className="text-[9px] font-black text-purple-500/70 uppercase tracking-wider">Travelers</span>
                                    </div>
                                    <div className="p-3 bg-gray-50/50 dark:bg-gray-800/40 border border-gray-100 dark:border-white/5 rounded-2xl text-center flex flex-col justify-center">
                                        <span className="text-lg md:text-xl font-black text-gray-700 dark:text-gray-300">{(trip.transports?.length || 0) + (trip.accommodations?.length || 0) + (trip.activities?.length || 0)}</span>
                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider mt-0.5 font-sans">Active Items</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Right Card: Beautiful interactive 2D Map Overview card of the configured routes */}
                <div className="lg:col-span-4 relative rounded-[2.5rem] bg-white/35 dark:bg-zinc-950/15 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-[0_24px_64px_rgba(0,0,0,0.08)] dark:shadow-[0_24px_64px_rgba(0,0,0,0.45)] overflow-hidden min-h-[300px]">
                    <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 bg-white/95 dark:bg-black/40 backdrop-blur px-3 py-1.5 rounded-full border border-white/50 dark:border-white/10 shadow-sm pointer-events-none">
                        <span className="material-icons-outlined text-blue-500 text-sm">explore</span>
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-700 dark:text-gray-300">Route Map Overview 2D</span>
                    </div>
                    <div className="absolute inset-0 bg-transparent">
                        <Suspense fallback={
                            <div className="w-full h-full flex flex-col items-center justify-center bg-transparent text-zinc-400 space-y-3">
                                <span className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin"></span>
                                <span className="text-[9px] font-bold uppercase tracking-wider">Rasterizing Route Vector...</span>
                            </div>
                        }>
                            <DeckFlightMap 
                                trips={[trip]} 
                                animateRoutes={true} 
                                showFrequencyWeight={true}
                                showCityMarkers={true}
                                viewMode="network"
                            />
                        </Suspense>
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
                            {/* Unified Chronological Timeline per Day */}
                            <div className="absolute left-8 top-4 bottom-4 w-0.5 bg-gray-200 dark:bg-gray-800 hidden md:block" />
                            {tripDates.map((dateStr, index) => {
                                const dateObj = new Date(dateStr); 
                                const location = getLocationForDate(dateStr);
                                const dayItems = getDayItems(dateStr);

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

                                            {dayItems.length > 0 ? (
                                                dayItems.map(item => {
                                                    if (item.type === 'Transport') {
                                                        const t = item.ref;
                                                        return (
                                                            <div key={item.id} className="bg-blue-50 dark:bg-gray-800 border border-blue-100 dark:border-gray-700 p-4 rounded-2xl flex items-center gap-4 hover:shadow-md transition-all">
                                                                <div className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/30">
                                                                    <span className="material-icons-outlined">{item.icon}</span>
                                                                </div>
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs font-black text-blue-600 dark:text-blue-400 whitespace-nowrap">{formatTime(item.time)}</span>
                                                                        <h4 className="font-bold text-gray-900 dark:text-white text-sm">
                                                                            {item.title}
                                                                        </h4>
                                                                    </div>
                                                                    <div className="flex gap-4 mt-1">
                                                                        <p className="text-[10px] text-blue-600 dark:text-blue-300 font-bold uppercase tracking-wider">
                                                                            {t.provider} {t.identifier}
                                                                        </p>
                                                                        {item.meta && (
                                                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                                                                                {item.meta}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <button onClick={() => openTransportModal([t])} className="text-gray-400 hover:text-blue-500">
                                                                    <span className="material-icons-outlined text-sm">edit</span>
                                                                </button>
                                                            </div>
                                                        );
                                                    } else if (item.type === 'Accommodation') {
                                                        const a = item.ref;
                                                        const isCheckIn = !item.isCheckOut && !item.isOvernight;
                                                        const statusLabel = isCheckIn ? 'Check-In' : (item.isCheckOut ? 'Check-Out' : 'Overnight Stay');
                                                        return (
                                                            <div key={item.id} className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 p-4 rounded-2xl flex items-center gap-4 hover:shadow-md transition-all">
                                                                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/30">
                                                                    <span className="material-icons-outlined">{item.icon}</span>
                                                                </div>
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2">
                                                                        {!item.isOvernight && (
                                                                            <span className="text-xs font-black text-amber-600 dark:text-amber-400 whitespace-nowrap">{formatTime(item.time)}</span>
                                                                        )}
                                                                        <h4 className="font-bold text-gray-900 dark:text-white text-sm">
                                                                            {item.title}
                                                                        </h4>
                                                                    </div>
                                                                    <div className="flex gap-4 mt-1">
                                                                        <p className="text-[10px] text-amber-600 dark:text-amber-300 font-bold uppercase tracking-wider">
                                                                            {statusLabel}
                                                                        </p>
                                                                        {item.meta && (
                                                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                                                                                {item.meta}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <button onClick={() => openAccommodationModal()} className="text-gray-400 hover:text-amber-500">
                                                                    <span className="material-icons-outlined text-sm">edit</span>
                                                                </button>
                                                            </div>
                                                        );
                                                    } else {
                                                        const isRes = item.type === 'Reservation';
                                                        const act = item.ref;
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
                                                                    <span className="material-icons-outlined">{item.icon}</span>
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className={`text-xs font-black whitespace-nowrap ${isRes ? 'text-orange-400' : 'text-gray-400'}`}>{formatTime(item.time)}</span>
                                                                        <h4 className="font-bold text-gray-900 dark:text-white text-sm truncate">{item.title}</h4>
                                                                    </div>
                                                                    {item.meta && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{item.meta}</p>}
                                                                    {item.location && <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1 truncate"><span className="material-icons-outlined text-[10px]">place</span> {item.location}</p>}
                                                                </div>
                                                                {item.cost && <div className={`text-xs font-bold whitespace-nowrap ${isRes ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-300'}`}>{formatCurrency(item.cost)}</div>}
                                                                
                                                                <div className="flex items-center gap-1 opacity-0 group-hover/act:opacity-100 transition-opacity">
                                                                    <button onClick={() => handleOpenActivityModal(dateStr, act)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"><span className="material-icons-outlined text-sm">edit</span></button>
                                                                    <button onClick={() => handleDeleteActivity(act.id)} className="p-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"><span className="material-icons-outlined text-sm">delete</span></button>
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                })
                                            ) : (
                                                <p className="text-xs text-gray-400 dark:text-gray-500 italic py-2 pl-4">No schedule items planned for today yet.</p>
                                            )}

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
                <div className="space-y-12 animate-fade-in text-zinc-900 dark:text-zinc-100">
                    {/* Transport Section */}
                    <div className="space-y-6">
                        <div className="flex justify-between items-center bg-white/20 dark:bg-white/[0.02] p-4 rounded-3xl border border-zinc-200/40 dark:border-white/5 backdrop-blur-xl">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-505/10 dark:bg-indigo-500/10 text-indigo-500 flex items-center justify-center border border-indigo-500/20 shadow-sm">
                                    <span className="material-icons-outlined text-xl">commute</span>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-tight">Transportation</h3>
                                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">Flights, trains, and rental vehicles</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    className="border-dashed border-2 border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-zinc-200 hover:border-indigo-300 dark:hover:border-zinc-700 font-bold transition-all" 
                                    onClick={() => setIsImportWizardOpen(true)}
                                >
                                    <span className="material-icons-outlined text-sm mr-1.5">upload_file</span> 
                                    Import
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => openTransportModal()} className="font-bold">
                                    + Add Booking
                                </Button>
                            </div>
                        </div>

                        {Object.keys(transportGroups).length === 0 ? (
                            <div className="p-16 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl">
                                <span className="material-icons-outlined text-4xl text-zinc-300 dark:text-zinc-700 mb-3 block">flight</span>
                                <p className="text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-widest text-xs">No transport bookings yet</p>
                                <button className="text-xs text-indigo-500 font-bold mt-2 hover:underline cursor-pointer" onClick={() => openTransportModal()}>Add your first transport</button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-6">
                                {Object.entries(transportGroups).sort((a, b) => {
                                    const firstA = a[1][0];
                                    const firstB = b[1][0];
                                    if (!firstA) return 1;
                                    if (!firstB) return -1;
                                    return compareTransports(firstA, firstB);
                                }).map(([id, group]: [string, Transport[]]) => {
                                    const first = group[0];
                                    return (
                                        <div key={id} className="bg-white dark:bg-zinc-900/30 rounded-[2rem] overflow-hidden border border-zinc-200/50 dark:border-white/5 shadow-sm hover:shadow-md transition-all duration-300">
                                            {/* Header */}
                                            <div className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-zinc-50/50 dark:bg-white/[0.01] border-b border-zinc-150/50 dark:border-white/5">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 flex items-center justify-center overflow-hidden shadow-inner shrink-0">
                                                        {first.mode === 'Flight' ? (
                                                            <AirlineLogo 
                                                                provider={first.provider} 
                                                                brandfetchApiKey={settings?.brandfetchApiKey} 
                                                                carriers={settings?.carriers} 
                                                                fallback={<span className="material-icons-outlined text-zinc-600 dark:text-zinc-300 text-2xl">flight_takeoff</span>} 
                                                            />
                                                        ) : first.logoUrl ? (
                                                            <img referrerPolicy="no-referrer" src={first.logoUrl} className="w-full h-full object-contain" />
                                                        ) : (
                                                            <span className="material-icons-outlined text-zinc-600 dark:text-zinc-300 text-2xl">{getTransportIcon(first.mode)}</span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-zinc-800 dark:text-zinc-150 text-base leading-tight">{first.provider}</h4>
                                                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                                            <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/5 text-[10px] font-mono font-bold text-zinc-500 dark:text-zinc-400">
                                                                {first.identifier || 'No ID'}
                                                            </span>
                                                            <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700"></span>
                                                            <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{first.type}</span>
                                                            {first.confirmationCode && (
                                                                <>
                                                                    <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700"></span>
                                                                    <span className="text-[10px] font-mono tracking-widest text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950/30 px-1.5 py-0.5 rounded border border-indigo-100 dark:border-indigo-900/20 select-all" title="Confirmation Code">
                                                                        CONF: {first.confirmationCode}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto border-t sm:border-0 border-zinc-150 dark:border-white/5 pt-3 sm:pt-0">
                                                    <div className="text-xl font-bold text-zinc-900 dark:text-white leading-none">
                                                        {formatCurrency(group.reduce((acc, t) => acc + (t.cost || 0), 0))}
                                                    </div>
                                                    <button 
                                                        onClick={() => openTransportModal(group)} 
                                                        className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 uppercase tracking-widest mt-1 cursor-pointer flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/20 px-2.5 py-1 rounded-lg border border-indigo-100 dark:border-indigo-900/10 hover:shadow-sm transition-all"
                                                    >
                                                        <span className="material-icons-outlined text-xs">edit_note</span> Edit Details
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Legs */}
                                            <div className="p-6 md:p-8 space-y-8 relative">
                                                {group.map((t, idx) => {
                                                    const isReturn = idx > 0;
                                                    return (
                                                        <React.Fragment key={t.id}>
                                                            {/* Divider if return */}
                                                            {isReturn && (
                                                                <div className="flex items-center gap-4 py-4">
                                                                    <div className="h-px bg-zinc-100 dark:bg-white/5 flex-1"></div>
                                                                    <div className="px-3 py-1 rounded-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/40 dark:border-zinc-800 text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                                                                        <span className="material-icons-outlined text-xs">repeat</span> 
                                                                        Return Journey • {Math.ceil((new Date(t.departureDate).getTime() - new Date(group[idx-1].arrivalDate).getTime()) / 86400000)} Days Later
                                                                    </div>
                                                                    <div className="h-px bg-zinc-100 dark:bg-white/5 flex-1"></div>
                                                                </div>
                                                            )}

                                                            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-6 relative">
                                                                
                                                                {/* Left: Origin Info */}
                                                                <div className="flex-1 flex items-center gap-4 min-w-[200px]">
                                                                    <div className="w-10 h-10 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-150/50 dark:border-white/5 flex items-center justify-center shrink-0 shadow-sm text-zinc-400 dark:text-zinc-500">
                                                                        <span className="material-icons-outlined text-lg">flight_takeoff</span>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500 tracking-wider">Departure</p>
                                                                        <div className="flex items-baseline gap-2 mt-0.5">
                                                                            <span className="text-xl font-black text-zinc-800 dark:text-white tracking-tight uppercase">{t.origin}</span>
                                                                            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 font-mono">{formatTime(t.departureTime)}</span>
                                                                        </div>
                                                                        <p className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 mt-1">
                                                                            {new Date(t.departureDate).toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric'})}
                                                                            {t.departureTerminal && ` · Term ${t.departureTerminal}`}
                                                                            {t.departureGate && ` · Gate ${t.departureGate}`}
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                {/* Center: Progress & Duration Vector */}
                                                                <div className="flex flex-col items-center justify-center min-w-[120px] shrink-0 pointer-events-none select-none relative py-1 md:py-0">
                                                                    <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 tracking-tight mb-1.5">{calculateDuration(t)}</span>
                                                                    <div className="w-full flex items-center gap-1.5 relative px-2">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 border border-indigo-400 shrink-0"></div>
                                                                        <div className="flex-1 h-[2px] border-t-2 border-dashed border-zinc-200 dark:border-zinc-800 relative flex items-center justify-center">
                                                                            <span className="material-icons-outlined text-zinc-400 dark:text-zinc-600 text-sm absolute -top-1.5 scale-90 rotate-90">{getTransportIcon(t.mode) === 'flight_takeoff' ? 'flight' : 'arrow_forward'}</span>
                                                                        </div>
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500 border border-purple-400 shrink-0"></div>
                                                                    </div>
                                                                    <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-350 dark:text-zinc-600 mt-1.5">Nonstop</span>
                                                                </div>

                                                                {/* Right: Arrival Info */}
                                                                <div className="flex-1 flex items-center justify-start md:justify-end gap-4 min-w-[200px]">
                                                                    <div className="md:text-right">
                                                                        <p className="text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500 tracking-wider">Arrival</p>
                                                                        <div className="flex items-baseline md:justify-end gap-2 mt-0.5">
                                                                            <span className="text-xl font-black text-zinc-800 dark:text-white tracking-tight uppercase">{t.destination}</span>
                                                                            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 font-mono">{formatTime(t.arrivalTime)}</span>
                                                                        </div>
                                                                        <p className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 mt-1">
                                                                            {new Date(t.arrivalDate).toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric'})}
                                                                            {t.arrivalTerminal && ` · Term ${t.arrivalTerminal}`}
                                                                            {t.arrivalGate && ` · Gate ${t.arrivalGate}`}
                                                                        </p>
                                                                    </div>
                                                                    <div className="w-10 h-10 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-150/50 dark:border-white/5 flex items-center justify-center shrink-0 order-first md:order-last shadow-sm text-zinc-400 dark:text-zinc-500">
                                                                        <span className="material-icons-outlined text-lg">flight_land</span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Additional Amenities/Seats row if present */}
                                                            {(t.travelClass || t.seatNumber || t.vehicleModel || t.pickupLocation) && (
                                                                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-zinc-150/40 dark:border-white/5">
                                                                    {t.travelClass && (
                                                                        <div className="px-2.5 py-1 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-white/5 text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                                                                            <span className="material-icons-outlined text-xs text-zinc-400">workspace_premium</span> 
                                                                            {t.travelClass}
                                                                        </div>
                                                                    )}
                                                                    {t.seatNumber && (
                                                                        <div className="px-2.5 py-1 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/30 dark:border-indigo-900/15 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                                                                            <span className="material-icons-outlined text-xs">airline_seat_recline_extra</span>
                                                                            Seat {t.seatNumber} {t.seatType && `(${t.seatType})`}
                                                                            {t.isExitRow && <span className="text-[9px] font-semibold text-rose-500 dark:text-rose-400 font-sans tracking-normal">Exit Row</span>}
                                                                        </div>
                                                                    )}
                                                                    {t.vehicleModel && (
                                                                        <div className="px-2.5 py-1 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100/30 dark:border-emerald-900/15 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                                                                            <span className="material-icons-outlined text-xs">directions_car</span> 
                                                                            {t.vehicleModel}
                                                                        </div>
                                                                    )}
                                                                    {t.pickupLocation && (
                                                                        <div className="px-2.5 py-1 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-white/5 text-[10px] font-bold text-zinc-550 dark:text-zinc-400 flex items-center gap-1">
                                                                            <span className="material-icons-outlined text-xs text-zinc-400">pin_drop</span>
                                                                            Pickup: {t.pickupLocation}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
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
                        <div className="flex justify-between items-center bg-white/20 dark:bg-white/[0.02] p-4 rounded-3xl border border-zinc-200/40 dark:border-white/5 backdrop-blur-xl">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20 shadow-sm">
                                    <span className="material-icons-outlined text-xl">hotel</span>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-tight">Accommodation</h3>
                                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">Hotel stays, resorts, and vacation rentals</p>
                                </div>
                            </div>
                            <Button size="sm" variant="secondary" onClick={() => openAccommodationModal()} className="font-bold">
                                + Add Stay
                            </Button>
                        </div>

                        {(!trip.accommodations || trip.accommodations.length === 0) ? (
                            <div className="p-16 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl">
                                <span className="material-icons-outlined text-4xl text-zinc-300 dark:text-zinc-700 mb-3 block">apartment</span>
                                <p className="text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-widest text-xs">No accommodations booked yet</p>
                                <button className="text-xs text-indigo-500 font-bold mt-2 hover:underline cursor-pointer" onClick={() => openAccommodationModal()}>Book your stay</button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-6">
                                {[...(trip.accommodations || [])].sort((a, b) => {
                                    const dateA = a.checkInDate || '1970-01-01';
                                    const timeA = a.checkInTime || '00:00';
                                    const dateB = b.checkInDate || '1970-01-01';
                                    const timeB = b.checkInTime || '00:00';
                                    if (dateA !== dateB) return dateA.localeCompare(dateB);
                                    return timeA.localeCompare(timeB);
                                }).map(stay => (
                                    <div key={stay.id} className="bg-white dark:bg-zinc-900/30 rounded-[2rem] p-6 sm:p-8 border border-zinc-200/50 dark:border-white/5 shadow-sm hover:shadow-md hover:border-zinc-350 dark:hover:border-white/10 transition-all duration-350 flex flex-col md:flex-row justify-between items-stretch gap-6 group relative">
                                        
                                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-5 flex-1">
                                            {/* Brand Logo or Visual Accent */}
                                            <div className="w-16 h-16 rounded-[1.25rem] bg-gradient-to-tr from-indigo-50 to-indigo-100 dark:from-indigo-950/20 dark:to-indigo-900/30 border border-indigo-100 dark:border-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-black text-2xl overflow-hidden shrink-0 shadow-sm">
                                                {stay.logoUrl ? (
                                                    <img referrerPolicy="no-referrer" src={stay.logoUrl} className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="material-icons-outlined text-2xl">{stay.type === 'Airbnb' ? 'home_work' : stay.type === 'Resort' ? 'spa' : 'apartment'}</span>
                                                )}
                                            </div>
                                            
                                            <div className="space-y-1.5 flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h4 className="font-bold text-zinc-800 dark:text-zinc-150 text-lg truncate leading-tight">{stay.name}</h4>
                                                    <span className="px-2 py-0.5 rounded-md bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-white/5 text-[10px] font-bold text-zinc-550 dark:text-zinc-400 uppercase tracking-widest">
                                                        {stay.type}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium flex items-center gap-1 max-w-full">
                                                    <span className="material-icons-outlined text-sm shrink-0">place</span>
                                                    <span className="truncate select-all" title={stay.address}>{stay.address}</span>
                                                </p>
                                                
                                                <div className="flex flex-wrap gap-2 pt-1.5">
                                                    <span className="bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100/30 dark:border-indigo-900/10 text-indigo-600 dark:text-indigo-400 px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                                        <span className="material-icons-outlined text-xs">nights_stay</span>
                                                        {calculateNights(stay.checkInDate, stay.checkOutDate)} Nights
                                                    </span>
                                                    <span className="bg-zinc-50 dark:bg-zinc-850/55 border border-zinc-150/40 dark:border-white/5 text-zinc-500 dark:text-zinc-400 px-2.5 py-0.5 rounded-lg text-[10px] font-bold tracking-tight">
                                                        {new Date(stay.checkInDate).toLocaleDateString(undefined, {day:'numeric', month:'short'}).toUpperCase()} - {new Date(stay.checkOutDate).toLocaleDateString(undefined, {day:'numeric', month:'short'}).toUpperCase()}
                                                    </span>
                                                    {stay.confirmationCode && (
                                                        <span className="bg-zinc-100 dark:bg-zinc-850 border border-zinc-200 dark:border-white/5 text-zinc-400 dark:text-zinc-500 font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded-lg select-all">
                                                            CONF: {stay.confirmationCode}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right: Stay Details / Pricing */}
                                        <div className="flex sm:flex-row md:flex-col items-center justify-between md:justify-center md:items-end gap-3 shrink-0 border-t md:border-t-0 md:border-l border-zinc-150 dark:border-white/5 pt-4 md:pt-0 md:pl-6">
                                            {stay.cost ? (
                                                <div className="md:text-right">
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Total Cost</p>
                                                    <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{formatCurrency(stay.cost)}</div>
                                                    <p className="text-[9px] font-semibold text-zinc-400 dark:text-zinc-500">
                                                        {formatCurrency(Math.round(stay.cost / calculateNights(stay.checkInDate, stay.checkOutDate)))} / night
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="text-zinc-300 dark:text-zinc-600 font-mono text-xs italic">Unpriced</div>
                                            )}
                                            
                                            <div className="flex gap-2">
                                                {stay.website && (
                                                    <a 
                                                        href={stay.website} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer" 
                                                        className="w-8 h-8 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-white/5 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-all cursor-pointer"
                                                        title="Visit Website"
                                                    >
                                                        <span className="material-icons-outlined text-base">language</span>
                                                    </a>
                                                )}
                                                <button 
                                                    onClick={() => openAccommodationModal()} 
                                                    className="w-8 h-8 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-white/5 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-all cursor-pointer"
                                                    title="Edit Stay Details"
                                                >
                                                    <span className="material-icons-outlined text-base">edit</span>
                                                </button>
                                            </div>
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
                            <p className="text-xs text-gray-500 mt-2">{(trip.participants || []).length} Travelers</p>
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
            <Modal 
                isOpen={isTransportModalOpen} 
                onClose={() => setIsTransportModalOpen(false)} 
                title="Manage Transport" 
                subtitle="Voyage Logistics & Road Trips"
                icon="directions_car"
                maxWidth="max-w-4xl"
            >
                <TransportConfigurator 
                    initialData={editingTransports || []}
                    onSave={handleSaveTransports}
                    onDelete={handleDeleteTransports}
                    onCancel={() => setIsTransportModalOpen(false)}
                    defaultStartDate={selectedDateForModal || trip.startDate}
                    defaultEndDate={selectedDateForModal || trip.endDate}
                />
            </Modal>
            
            <Modal 
                isOpen={isAccommodationModalOpen} 
                onClose={() => setIsAccommodationModalOpen(false)} 
                title="Manage Accommodation" 
                subtitle="Stays, Lodging & Overnights"
                icon="hotel"
                maxWidth="max-w-3xl"
            >
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

            <Modal 
                isOpen={isActivityModalOpen} 
                onClose={() => setIsActivityModalOpen(false)} 
                title={activityForm.id ? "Edit Activity Item" : "Add Activity Item"}
                subtitle="Itinerary Schedule & Reservations"
                icon="event_note"
            >
                <div className="space-y-6 font-sans">
                    <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                            Activity Title <span className="text-rose-500">*</span>
                        </label>
                        <Input 
                            placeholder="e.g. Louvre Museum" 
                            value={activityForm.title || ''} 
                            onChange={e => setActivityForm({...activityForm, title: e.target.value})} 
                            className="h-14 !text-xl font-bold"
                            autoFocus
                        />
                    </div>

                    <div className="p-5 rounded-3xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-4">
                        <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                            Schedule & Location
                        </span>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Select 
                                label="Type" 
                                options={[{label: 'Activity', value: 'Activity'}, {label: 'Reservation', value: 'Reservation'}, {label: 'Tour', value: 'Tour'}]} 
                                value={activityForm.type || 'Activity'} 
                                onChange={e => setActivityForm({...activityForm, type: e.target.value as any})} 
                            />
                            <Autocomplete 
                                label="Location" 
                                placeholder="e.g. Rue de Rivoli, Paris" 
                                value={activityForm.location || ''} 
                                onChange={val => setActivityForm({...activityForm, location: val})} 
                                fetchSuggestions={fetchLocationSuggestions} 
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <Input label="Date" type="date" value={activityForm.date || currentDayForActivity || ''} onChange={e => setActivityForm({...activityForm, date: e.target.value})} />
                            <TimeInput label="Time" value={activityForm.time || '12:00'} onChange={val => setActivityForm({...activityForm, time: val})} />
                        </div>
                    </div>

                    <div className="p-5 rounded-3xl bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/5 space-y-4">
                        <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                            Details & Pricing
                        </span>
                        <div className="relative">
                            <Input label="Cost" type="number" placeholder="0.00" value={activityForm.cost || ''} onChange={e => setActivityForm({...activityForm, cost: parseFloat(e.target.value)})} className="pl-8" />
                            <span className="absolute left-3 top-9 text-light-text-secondary dark:text-dark-text-secondary font-bold text-xs">{getCurrencySymbol(settings?.currency || 'USD')}</span>
                        </div>
                        <Input label="Notes / Description" placeholder="Booking ref, instructions..." value={activityForm.description || ''} onChange={e => setActivityForm({...activityForm, description: e.target.value})} />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-black/5 dark:border-white/5">
                        <Button variant="secondary" onClick={() => setIsActivityModalOpen(false)}>Cancel</Button>
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
                    <Suspense fallback={
                        <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white space-y-4">
                            <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Engaging Cinematic Orbit Simulation...</span>
                        </div>
                    }>
                        <DeckFlightMap 
                            trips={[trip]} 
                            animateRoutes={true} 
                            showFrequencyWeight={true}
                            initialProjection="globe"
                            initialElevated={true}
                        />
                    </Suspense>
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
                                       <button onClick={(e) => { e.stopPropagation(); setExpandedCandidateId(isExpanded ? null : t.id); }} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full text-gray-400">{isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}</button>
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
                        {trip && isImportWizardOpen && (
                            <React.Suspense fallback={null}>
                                <FlightImportWizard 
                                    isOpen={isImportWizardOpen}
                                    onClose={() => setIsImportWizardOpen(false)}
                                    onImportComplete={loadData}
                                    users={users}
                                    existingTripId={trip.id}
                                />
                            </React.Suspense>
                        )}
                        <Button variant="primary" onClick={confirmImportFlights} disabled={selectedCount === 0}>Import {selectedCount} Trips</Button>
                   </div>
               </div>
            </Modal>

        </div>
    );
};
