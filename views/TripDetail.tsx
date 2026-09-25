
import React, { useEffect, useState, useRef, useMemo, Suspense } from 'react';
import { 
    CaretUp as ChevronUp, 
    CaretDown as ChevronDown,
    CaretLeft,
    CaretRight,
    ArrowLeft,
    ArrowRight,
    ArrowsClockwise,
    AirplaneTilt,
    AirplaneTakeoff,
    AirplaneLanding,
    Train,
    Bus,
    Key,
    Car,
    Boat,
    Buildings,
    Bed,
    Sparkle,
    House,
    ForkKnife,
    Compass,
    Ticket,
    Moon,
    Crown,
    Armchair,
    MapPin,
    Clock,
    Sun,
    CloudSun,
    Cloud,
    CloudFog,
    CloudRain,
    Snowflake,
    CloudLightning,
    CalendarBlank,
    CalendarCheck,
    Path,
    Receipt,
    Backpack,
    List,
    Table,
    FilmStrip,
    Globe,
    UploadSimple,
    PencilSimple,
    Trash,
    Plus,
    Check,
    X,
    PaperPlaneTilt,
    SquaresFour
} from '@phosphor-icons/react';
import { Card, Button, Badge, Tabs, Modal, Input, Autocomplete, TimeInput, Select } from '../components/ui';
import GlassPanel from '../components/glass/GlassPanel';
import { CARD_ELEVATED_STYLE } from '../constants';
import { VirtualListItem } from '../components/ui/VirtualListItem';
import { TransportConfigurator } from '../components/FlightConfigurator';
import { AccommodationConfigurator } from '../components/AccommodationConfigurator';
import { ExcursionConfigurator } from '../components/ExcursionConfigurator';
import { LocationManager } from '../components/LocationManager';
import { TripModal } from '../components/TripModal';
import { PackingList } from '../components/PackingList';
import { dataService } from '../services/mockDb';
import { flightImporter } from '../services/flightImportExport';
import { calendarService } from '../services/calendarExport';
import { Trip, User, Transport, Accommodation, WorkspaceSettings, Activity, TransportMode, LocationEntry, EntitlementType, PublicHoliday, SavedConfig, PackingItem, Carrier } from '../types';
import { searchLocations, resolvePlaceName, getCoordinates, formatProperLocationName } from '../services/geocoding';
import { GoogleGenAI } from "@google/genai";
const DeckFlightMap = React.lazy(() => import('../components/DeckFlightMap').then(m => ({ default: m.DeckFlightMap || m.default })));
const FlightImportWizard = React.lazy(() => import('../components/FlightImportWizard').then(m => ({ default: m.FlightImportWizard })));
import { getMerchantLogoUrl } from '../utils/brandfetch';
import { formatDate, formatDateRange, formatCurrency, getCurrencySymbol } from '../utils/formatters';
import { EmptyState } from '../components/EmptyState';
import { DailyPlannerBoard } from '../components/DailyPlannerBoard';
import { invalidateGlobalWanderCache } from '../hooks/useWanderSync';
import { isCarRentalBooking, getTransportScheduleTitle, getTransportScheduleLocation, getTransportScheduleEventsForDate } from '../utils/transportSchedule';

export const TripItemIcon: React.FC<{ name: string; className?: string }> = React.memo(({ name, className = "w-4 h-4" }) => {
    switch (name) {
        case 'wb_sunny': return <Sun className={className} weight="duotone" />;
        case 'partly_cloudy_day': return <CloudSun className={className} weight="duotone" />;
        case 'cloud': return <Cloud className={className} weight="duotone" />;
        case 'foggy': return <CloudFog className={className} weight="duotone" />;
        case 'umbrella':
        case 'rainy': return <CloudRain className={className} weight="duotone" />;
        case 'ac_unit': return <Snowflake className={className} weight="duotone" />;
        case 'thunderstorm': return <CloudLightning className={className} weight="duotone" />;
        case 'flight_takeoff':
        case 'flight':
        case 'Flight': return <AirplaneTakeoff className={className} weight="duotone" />;
        case 'flight_land': return <AirplaneLanding className={className} weight="duotone" />;
        case 'train':
        case 'Train': return <Train className={className} weight="duotone" />;
        case 'directions_bus':
        case 'Bus': return <Bus className={className} weight="duotone" />;
        case 'key':
        case 'Car Rental': return <Key className={className} weight="duotone" />;
        case 'directions_car':
        case 'Personal Car': return <Car className={className} weight="duotone" />;
        case 'directions_boat':
        case 'Cruise': return <Boat className={className} weight="duotone" />;
        case 'hotel':
        case 'Hotel':
        case 'apartment':
        case 'Apartment': return <Buildings className={className} weight="duotone" />;
        case 'spa':
        case 'Resort': return <Sparkle className={className} weight="duotone" />;
        case 'home_work':
        case 'Airbnb': return <House className={className} weight="duotone" />;
        case 'restaurant': return <ForkKnife className={className} weight="duotone" />;
        case 'tour': return <Compass className={className} weight="duotone" />;
        case 'local_activity': return <Ticket className={className} weight="duotone" />;
        case 'nights_stay': return <Moon className={className} weight="duotone" />;
        case 'workspace_premium': return <Crown className={className} weight="duotone" />;
        case 'airline_seat_recline_extra': return <Armchair className={className} weight="duotone" />;
        case 'pin_drop':
        case 'place':
        case 'fmd_good': return <MapPin className={className} weight="duotone" />;
        case 'schedule': return <Clock className={className} weight="duotone" />;
        case 'repeat': return <ArrowsClockwise className={className} />;
        default: return <Ticket className={className} weight="duotone" />;
    }
});

interface AirlineLogoProps {
    provider?: string;
    brandfetchApiKey?: string;
    carriers?: Carrier[];
    fallback: React.ReactNode;
}

const AirlineLogo: React.FC<AirlineLogoProps> = React.memo(({ provider, brandfetchApiKey, carriers = [], fallback }) => {
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
});

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

const WeatherWidget: React.FC<{ location: string, coordinates?: { lat: number, lng: number } }> = React.memo(({ location, coordinates }) => {
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
                <TripItemIcon name={getWeatherIcon(weather.current_weather.weathercode)} className="w-8 h-8 drop-shadow-md text-white" />
                <span className="text-2xs font-bold uppercase tracking-widest opacity-80 mt-1">Now</span>
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
});

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
        <GlassPanel className="flex flex-col h-[600px] wg-glass-card rounded-[28px] overflow-hidden">
            <div className="p-6 border-b border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white shadow-lg">
                    <Sparkle className="w-6 h-6 text-white" weight="duotone" />
                </div>
                <div>
                    <h3 className="text-lg font-black text-light-text dark:text-dark-text">NomadGuide AI</h3>
                    <p className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest">Real-time Intelligence</p>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-dots-pattern">
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                            m.role === 'user' 
                            ? 'bg-primary-500 text-white rounded-tr-sm' 
                            : 'bg-light-fill dark:bg-dark-fill/50 border border-black/5 dark:border-white/10 text-light-text dark:text-dark-text rounded-tl-sm'
                        }`}>
                            <div dangerouslySetInnerHTML={{ __html: m.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-light-fill dark:bg-dark-fill/50 p-4 rounded-2xl rounded-tl-sm border border-black/5 dark:border-white/10 shadow-sm flex gap-2">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75" />
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150" />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-black/5 dark:bg-white/5 border-t border-black/5 dark:border-white/10">
                <div className="relative">
                    <input 
                        type="text" 
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                        placeholder="Ask about local weather, food, or packing..."
                        className="w-full pl-6 pr-14 py-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 focus:bg-white dark:focus:bg-black/40 focus:border-purple-500 outline-none transition-all text-light-text dark:text-dark-text placeholder-light-text-secondary dark:placeholder-dark-text-secondary text-sm font-semibold"
                    />
                    <button 
                        onClick={handleSend}
                        disabled={!input.trim() || loading}
                        aria-label="Send message to NomadGuide"
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-purple-600 hover:bg-purple-700 text-white rounded-xl flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                        <PaperPlaneTilt className="w-5 h-5 text-white" weight="bold" />
                    </button>
                </div>
            </div>
        </GlassPanel>
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
    const [plannerView, setPlannerView] = useState<'board' | 'list' | 'table' | 'calendar'>('board'); 
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
    const [selectedActivityForModal, setSelectedActivityForModal] = useState<Activity | null>(null);
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
        invalidateGlobalWanderCache();
        window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
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
        invalidateGlobalWanderCache();
        window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
        setTrip(updatedTrip);
        setIsTransportModalOpen(false);
        setEditingTransports(null);
    };

    const handleSaveAccommodations = async (items: Accommodation[]) => {
        if (!trip) return;
        const updatedTrip = { ...trip, accommodations: items };
        await dataService.updateTrip(updatedTrip);
        invalidateGlobalWanderCache();
        window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
        setTrip(updatedTrip);
        setIsAccommodationModalOpen(false);
    };

    const handleDeleteAccommodations = async (ids: string[]) => {
        if (!trip) return;
        const updatedTrip = { ...trip, accommodations: [] };
        await dataService.updateTrip(updatedTrip);
        invalidateGlobalWanderCache();
        window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
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
            if (finalTransportIds.has(t.id)) {
                return false;
            }
            if (t.itineraryId === 'route-gen' || t.itineraryId === 'route-booked') {
                return false;
            }
            return true;
        });

        const mergedTransports = [...preservedTransports, ...finalTransports];
        const updatedTrip = { ...trip, locations: items, transports: mergedTransports };
        const savedTrip = await dataService.updateTrip(updatedTrip);
        invalidateGlobalWanderCache();
        window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
        setTrip(savedTrip);
    };

    const handleOpenActivityModal = (dateStr: string, existingActivity?: Activity) => {
        setCurrentDayForActivity(dateStr);
        setSelectedActivityForModal(existingActivity || null);
        setIsActivityModalOpen(true);
    };

    const handleSaveActivity = async (newActivity: Activity) => {
        if (!trip || !newActivity.title || !newActivity.date) return;
        let updatedActivities = [...(trip.activities || [])];
        const existingIndex = updatedActivities.findIndex(a => a.id === newActivity.id);
        if (existingIndex >= 0) updatedActivities[existingIndex] = newActivity;
        else updatedActivities.push(newActivity);
        const updatedTrip = { ...trip, activities: updatedActivities };
        await dataService.updateTrip(updatedTrip);
        invalidateGlobalWanderCache();
        window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
        setTrip(updatedTrip);
        setIsActivityModalOpen(false);
        setSelectedActivityForModal(null);
    };

    const handleDeleteActivity = async (activityId: string) => {
        if (!trip) return;
        const updatedActivities = (trip.activities || []).filter(a => a.id !== activityId);
        const updatedTrip = { ...trip, activities: updatedActivities };
        await dataService.updateTrip(updatedTrip);
        invalidateGlobalWanderCache();
        window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
        setTrip(updatedTrip);
        setIsActivityModalOpen(false);
        setSelectedActivityForModal(null);
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
        return getTransportScheduleEventsForDate(trip?.transports, dateStr);
    };

    if (loading || !trip) return <div className="p-8 text-gray-400 animate-pulse">Loading Trip Data...</div>;

    const activityCost = trip.activities?.reduce((sum, a) => sum + (a.cost || 0), 0) || 0;
    const transportCost = trip.transports?.reduce((sum, f) => sum + (f.cost || 0), 0) || 0;
    const stayCost = trip.accommodations?.reduce((sum, a) => sum + (a.cost || 0), 0) || 0;
    const totalCost = transportCost + stayCost + activityCost;
    const duration = Math.ceil((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const costPerPerson = (trip.participants || []).length > 0 ? totalCost / (trip.participants || []).length : 0;
    const costPerDay = duration > 0 ? totalCost / duration : 0;

    const totalDistance = trip.transports?.reduce((sum, t) => sum + (t.distance || 0), 0) || 0;
    const totalTransportLegs = trip.transports?.length || 0;
    const totalNightsBooked = trip.accommodations?.reduce((sum, a) => {
        if (a.checkInDate && a.checkOutDate) {
            const inD = new Date(a.checkInDate).getTime();
            const outD = new Date(a.checkOutDate).getTime();
            const nights = Math.max(0, Math.round((outD - inD) / (1000 * 60 * 60 * 24)));
            return sum + nights;
        }
        return sum;
    }, 0) || 0;
    const excursionsCount = trip.activities?.length || 0;

    const destinationCoordinates: [number, number] | undefined = (() => {
        if (trip?.location?.coordinates && trip.location.coordinates.length === 2) {
            return [trip.location.coordinates[0], trip.location.coordinates[1]];
        }
        if (trip?.transports && trip.transports.length > 0) {
            const lastT = trip.transports[trip.transports.length - 1];
            if (lastT.destinationCoordinates && lastT.destinationCoordinates.length === 2) {
                return [lastT.destinationCoordinates[0], lastT.destinationCoordinates[1]];
            }
        }
        if (trip?.accommodations && trip.accommodations.length > 0) {
            const firstA = trip.accommodations[0];
            if (firstA.coordinates && firstA.coordinates.length === 2) {
                return [firstA.coordinates[0], firstA.coordinates[1]];
            }
        }
        return undefined;
    })();

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
        if (!trip?.startDate || !trip?.endDate) return [];
        const dates: string[] = [];
        try {
            const startParts = (trip.startDate || '').split('-').map(Number);
            const endParts = (trip.endDate || '').split('-').map(Number);
            if (startParts.length === 3 && endParts.length === 3) {
                const curr = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2]));
                const last = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]));
                if (!isNaN(curr.getTime()) && !isNaN(last.getTime())) {
                    while (curr <= last) {
                        dates.push(curr.toISOString().split('T')[0]);
                        curr.setUTCDate(curr.getUTCDate() + 1);
                    }
                }
            }
        } catch {
            return trip.startDate ? [trip.startDate] : [];
        }
        return dates.length > 0 ? dates : (trip.startDate ? [trip.startDate] : []);
    };
    const tripDates = getTripDates() || [];
    const selectedCount = importPreview.candidates.filter(c => c.selected).length;
    
    const getAllItemsForTable = (dateStr: string) => {
        const items: any[] = [];
        getDayEvents(dateStr).forEach(t => {
            const dur = !t.isDropoff ? calculateDuration(t) : '';
            const dist = t.distance ? `${t.distance} km` : '';
            items.push({
                id: t.id + (t.isDropoff ? '_drop' : ''),
                type: 'Transport',
                subType: t.mode,
                time: t.isDropoff ? t.arrivalTime || '00:00' : t.departureTime || '00:00',
                name: getTransportScheduleTitle(t, t.isDropoff),
                location: getTransportScheduleLocation(t, t.isDropoff),
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
        return items.sort((a,b) => {
            const timeDiff = (a.time || '23:59').localeCompare(b.time || '23:59');
            if (timeDiff !== 0) return timeDiff;
            if (a.isDropoff !== b.isDropoff) return a.isDropoff ? 1 : -1;
            return 0;
        });
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
                title: getTransportScheduleTitle(t, t.isDropoff),
                location: getTransportScheduleLocation(t, t.isDropoff),
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
            const timeDiff = (a.time || '23:59').localeCompare(b.time || '23:59');
            if (timeDiff !== 0) return timeDiff;
            if (a.isDropoff !== b.isDropoff) return a.isDropoff ? 1 : -1;
            return 0;
        });
    };

    const renderPlannerCalendar = () => {
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; 
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const grid: React.ReactNode[] = [];
        for (let i = 0; i < startDay; i++) grid.push(<div key={`empty-${i}`} className="min-h-[8rem] bg-black/5 dark:bg-white/5 rounded-xl" />);
        
        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(year, month, d);
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isToday = new Date().toDateString() === dateObj.toDateString();
            const items = getAllItemsForTable(dateStr);
            const isInTrip = dateStr >= trip.startDate && dateStr <= trip.endDate;
            
            grid.push(
                <div key={d} className={`min-h-[8rem] p-2 rounded-xl border flex flex-col relative group ${
                    isToday ? 'bg-light-card ring-2 ring-primary-400 dark:bg-dark-card dark:ring-primary-600' : 
                    isInTrip ? 'bg-light-card dark:bg-dark-card border-black/10 dark:border-white/10' : 
                    'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5 opacity-70'
                }`}>
                    <div className="flex justify-between items-start mb-1">
                        <span className={`text-sm font-bold ${isToday ? 'text-primary-600 dark:text-primary-400' : isInTrip ? 'text-light-text dark:text-dark-text' : 'text-light-text-secondary dark:text-dark-text-secondary'}`}>{d}</span>
                        {isInTrip && (
                            <button onClick={() => handleOpenActivityModal(dateStr)} aria-label="Add item to date" className="opacity-0 group-hover:opacity-100 text-light-text-secondary dark:text-dark-text-secondary hover:text-primary-500 transition-opacity p-1 min-w-[28px] min-h-[28px] flex items-center justify-center">
                                <Plus className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    
                    <div className="flex-1 flex flex-col gap-1 overflow-y-auto custom-scrollbar max-h-[120px]">
                        {items.map((item, idx) => {
                            const styleClasses = getTypeStyles(item.type);
                            const itemKey = item.ref?.id || item.id || `${item.type}-${item.name}-${dateStr}-${idx}`;
                            return (
                                <div key={itemKey} 
                                    className={`text-2xs font-bold px-1.5 py-1 rounded border flex items-center gap-1 cursor-pointer truncate ${styleClasses}`}
                                    onClick={() => {
                                        if (item.type === 'Transport') openTransportModal([item.ref]);
                                        if (item.type === 'Accommodation') openAccommodationModal();
                                        if (['Activity', 'Reservation', 'Tour'].includes(item.type)) handleOpenActivityModal(dateStr, item.ref);
                                    }}
                                    title={`${item.time ? formatTime(item.time) + ' - ' : ''}${item.name}`}
                                >
                                    <TripItemIcon name={item.icon} className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate">{item.time ? formatTime(item.time) : ''} {item.name}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }

        return (
            <GlassPanel className="wg-glass-card rounded-[28px] overflow-hidden">
                <div className="p-4 border-b border-black/5 dark:border-white/10 flex justify-between items-center bg-black/5 dark:bg-white/5">
                    <div className="flex items-center gap-4">
                        <button onClick={() => handleCalendarNavigate(-1)} aria-label="Previous month" className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center">
                            <CaretLeft className="w-4 h-4" />
                        </button>
                        <h3 className="text-lg font-black text-light-text dark:text-dark-text uppercase tracking-tight w-32 text-center">
                            {calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </h3>
                        <button onClick={() => handleCalendarNavigate(1)} aria-label="Next month" className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center">
                            <CaretRight className="w-4 h-4" />
                        </button>
                    </div>
                    <button onClick={() => setCalendarDate(new Date(trip.startDate))} className="text-xs font-bold text-primary-500 hover:underline">Reset to Start</button>
                </div>
                <div className="p-4">
                    <div className="grid grid-cols-7 gap-3 mb-2">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                            <div key={d} className="text-center text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest">{d}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                        {grid}
                    </div>
                </div>
            </GlassPanel>
        );
    };

    return (
        <div className="w-full max-w-[1680px] mx-auto pt-2 sm:pt-4 px-1 sm:px-4 md:px-6 lg:px-8 flex flex-col gap-5 sm:gap-6 animate-fadeIn pb-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                {/* Left Card: Trip Header Info, Stats, Actions */}
                {(() => {
                    const vibe = getWeatherVibeStyle(weather?.current_weather?.weathercode);
                    return (
                        <GlassPanel className="lg:col-span-8 wg-glass-card rounded-[28px] overflow-hidden p-6 lg:p-8 flex flex-col justify-between relative transition-all duration-500">
                            <div className={`absolute inset-0 bg-gradient-to-br ${vibe.bg} pointer-events-none transition-all duration-500`} />
                            <div className="relative flex flex-col gap-6 h-full justify-between z-10">
                                <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                                    <div className="flex items-start gap-4">
                                        <button 
                                            onClick={onBack} 
                                            aria-label="Back to planner" 
                                            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-primary-500 hover:bg-black/10 dark:hover:bg-white/10 transition-all shrink-0 cursor-pointer"
                                        >
                                            <ArrowLeft className="w-5 h-5" />
                                        </button>
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-3xl md:text-4xl">{trip.icon || '✈️'}</span>
                                                <h1 className="text-2xl md:text-4xl font-black text-light-text dark:text-dark-text tracking-tight">{trip.name}</h1>
                                            </div>
                                            <div className="flex flex-wrap gap-3 mt-4 items-center">
                                                {/* Address Info block with customized address icon */}
                                                <div className="flex items-center gap-2 px-3 py-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-full text-xs md:text-sm font-bold text-light-text dark:text-dark-text shadow-sm">
                                                    <MapPin className="w-4 h-4 text-primary-500" weight="duotone" />
                                                    <span>{trip.location}</span>
                                                </div>

                                                {/* Date Info block with customized calendar icon */}
                                                <div className="flex items-center gap-2 px-3 py-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-full text-xs md:text-sm font-bold text-light-text dark:text-dark-text shadow-sm">
                                                    <CalendarBlank className="w-4 h-4 text-purple-500" weight="duotone" />
                                                    <span>{formatDateRange(trip.startDate, trip.endDate, settings)}</span>
                                                </div>

                                                {/* Weather Condition Info block with customized dynamic weather icon */}
                                                {weather && weather.current_weather && (
                                                    <div className={`flex items-center gap-2 px-3 py-1.5 border rounded-full text-xs md:text-sm font-bold shadow-sm transition-all duration-300 ${vibe.pillBg}`}>
                                                        <TripItemIcon name={vibe.icon} className="w-4 h-4" />
                                                        <span>
                                                            {Math.round(weather.current_weather.temperature)}°C · {getWeatherDescription(weather.current_weather.weathercode)}
                                                            {weather.daily && (
                                                                <span className="opacity-80 ml-1.5 text-xs font-normal">
                                                                    (H: {Math.round(weather.daily.temperature_2m_max[0])}° L: {Math.round(weather.daily.temperature_2m_min[0])}°)
                                                                </span>
                                                            )}
                                                        </span>
                                                    </div>
                                                )}
                                                {weatherLoading && (
                                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-full text-xs md:text-sm font-bold text-light-text-secondary animate-pulse">
                                                        <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 border-t-purple-600 animate-spin" />
                                                        <span>Syncing weather...</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="flex flex-wrap gap-1.5 md:flex-col">
                                            <Button size="sm" variant="secondary" onClick={() => setIsCinematicOpen(true)} icon={<FilmStrip className="w-4 h-4" weight="duotone" />}>Cinematic View</Button>
                                            <Button size="sm" variant="secondary" onClick={() => {
                                                const ics = calendarService.generateIcsContent([trip], 'WanderGrid');
                                                calendarService.downloadIcs(ics, `trip-${trip.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.ics`);
                                            }} icon={<CalendarBlank className="w-4 h-4" weight="duotone" />}>ICS Calendar</Button>
                                            <Button size="sm" variant="secondary" onClick={() => setIsEditTripOpen(true)} icon={<PencilSimple className="w-4 h-4" weight="duotone" />}>Edit Settings</Button>
                                        </div>
                                    </div>
                                </div>

                                {/* Stat Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
                                    <div className={`p-4 ${CARD_ELEVATED_STYLE} text-center flex flex-col justify-center`}>
                                        <span className="text-xl md:text-2xl font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(totalCost)}</span>
                                        <span className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider mt-0.5">Total Cost</span>
                                    </div>
                                    <div className={`p-4 ${CARD_ELEVATED_STYLE} text-center flex flex-col justify-center`}>
                                        <span className="text-xl md:text-2xl font-black text-semantic-blue">{totalTransportLegs}</span>
                                        <span className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider mt-0.5">Transport Legs</span>
                                    </div>
                                    <div className={`p-4 ${CARD_ELEVATED_STYLE} text-center flex flex-col justify-center`}>
                                        <span className="text-xl md:text-2xl font-black text-amber-500">{totalNightsBooked}</span>
                                        <span className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider mt-0.5">Nights Booked</span>
                                    </div>
                                    <div className={`p-4 ${CARD_ELEVATED_STYLE} text-center flex flex-col justify-center`}>
                                        <span className="text-xl md:text-2xl font-black text-purple-600 dark:text-purple-400">{excursionsCount}</span>
                                        <span className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider mt-0.5">Excursions</span>
                                    </div>
                                    <div className={`p-4 ${CARD_ELEVATED_STYLE} text-center flex flex-col justify-center col-span-2 sm:col-span-1`}>
                                        <span className="text-xl md:text-2xl font-black text-light-text dark:text-dark-text">{totalDistance > 0 ? `${Math.round(totalDistance).toLocaleString()} km` : '0 km'}</span>
                                        <span className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider mt-0.5">Total Distance</span>
                                    </div>
                                </div>
                            </div>
                        </GlassPanel>
                    );
                })()}

                {/* Right Card: Beautiful interactive 2D Map Overview card of the configured routes */}
                <GlassPanel className="lg:col-span-4 wg-glass-card rounded-[28px] overflow-hidden min-h-[300px] h-full relative flex flex-col">
                    <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 bg-black/40 text-white backdrop-blur px-3 py-1.5 rounded-full border border-white/10 shadow-sm pointer-events-none">
                        <Compass className="w-4 h-4 text-primary-500" weight="duotone" />
                        <span className="text-2xs font-bold uppercase tracking-wider">Route Map Overview 2D</span>
                    </div>
                    <div className="w-full h-full min-h-[300px] flex-1 relative">
                        <Suspense fallback={
                            <div className="w-full h-full flex flex-col items-center justify-center bg-transparent text-zinc-400 space-y-3">
                                <span className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin"></span>
                                <span className="text-2xs font-bold uppercase tracking-wider">Rasterizing Route Vector...</span>
                            </div>
                        }>
                            <DeckFlightMap 
                                trips={[trip]} 
                                focusTransportCoordinates={destinationCoordinates}
                                animateRoutes={true} 
                                showFrequencyWeight={true}
                                showCityMarkers={true}
                                viewMode="network"
                                embedded={true}
                            />
                        </Suspense>
                    </div>
                </GlassPanel>
            </div>

            {/* Tabs and Content Switcher */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <Tabs 
                    tabs={[
                        { id: 'planner', label: 'Daily Planner', icon: <CalendarBlank className="w-4 h-4 text-amber-500" weight="duotone" />, color: 'amber' }, 
                        { id: 'route', label: 'Route', icon: <Path className="w-4 h-4 text-blue-500" weight="duotone" />, color: 'blue' },
                        { id: 'itinerary', label: 'Bookings', icon: <Ticket className="w-4 h-4 text-emerald-500" weight="duotone" />, color: 'emerald' }, 
                        { id: 'budget', label: 'Cost Breakdown', icon: <Receipt className="w-4 h-4 text-purple-500" weight="duotone" />, color: 'purple' },
                        { id: 'packing', label: 'Gear', icon: <Backpack className="w-4 h-4 text-teal-500" weight="duotone" />, color: 'teal' },
                        { id: 'intel', label: 'AI Guide', icon: <Sparkle className="w-4 h-4 text-rose-500" weight="duotone" />, color: 'rose' }
                    ]} 
                    activeTab={activeTab} 
                    onChange={setActiveTab} 
                />
                {activeTab === 'planner' && (
                    <Tabs
                        tabs={[
                            { id: 'board', label: 'Canvas', icon: <SquaresFour className="w-4 h-4 text-amber-500" weight="duotone" />, color: 'amber' },
                            { id: 'list', label: 'List', icon: <List className="w-4 h-4 text-blue-500" weight="duotone" />, color: 'blue' },
                            { id: 'table', label: 'Table', icon: <Table className="w-4 h-4 text-emerald-500" weight="duotone" />, color: 'emerald' },
                            { id: 'calendar', label: 'Calendar', icon: <CalendarBlank className="w-4 h-4 text-purple-500" weight="duotone" />, color: 'purple' },
                        ]}
                        activeTab={plannerView}
                        onChange={(id) => setPlannerView(id as 'board' | 'list' | 'table' | 'calendar')}
                    />
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
                    {plannerView === 'board' ? (
                        <DailyPlannerBoard
                            trip={trip}
                            tripDates={tripDates}
                            settings={settings}
                            onEditTransport={(transports, date) => openTransportModal(transports, date)}
                            onEditAccommodation={(accommodation, date) => openAccommodationModal()}
                            onEditActivity={(dateStr, activity) => handleOpenActivityModal(dateStr, activity)}
                            onDeleteActivity={handleDeleteActivity}
                        />
                    ) : plannerView === 'calendar' ? renderPlannerCalendar() : plannerView === 'list' ? (
                        <div className="space-y-6">
                            {tripDates.map((dateStr, index) => {
                                const dateObj = new Date(dateStr); 
                                const location = getLocationForDate(dateStr);
                                const dayItems = getDayItems(dateStr);
                                const isToday = new Date().toDateString() === dateObj.toDateString();

                                return (
                                    <VirtualListItem key={dateStr} minHeight={140}>
                                        <GlassPanel 
                                            className={`wg-glass-card rounded-[28px] overflow-hidden ${
                                                isToday ? 'ring-2 ring-primary-500/50 shadow-md shadow-primary-500/10' : ''
                                            }`}
                                            overrides={{ borderRadius: 28 }}
                                            padding="0px"
                                        >
                                            {/* Day Header Banner */}
                                            <div className={`px-5 sm:px-6 py-4 border-b border-black/5 dark:border-white/5 flex flex-wrap items-center justify-between gap-3 ${
                                                isToday ? 'bg-gradient-to-r from-primary-500/10 via-transparent to-transparent' : 'bg-black/[0.015] dark:bg-white/[0.015]'
                                            }`}>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex flex-col items-center justify-center w-12 h-12 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 shrink-0">
                                                        <span className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest leading-none">
                                                            {formatDate(dateObj, 'month-short', settings)}
                                                        </span>
                                                        <span className="text-lg font-black text-light-text dark:text-dark-text leading-none mt-0.5">
                                                            {dateObj.getUTCDate()}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`px-2.5 py-0.5 rounded-full text-2xs font-black uppercase tracking-wider ${
                                                                isToday ? 'bg-primary-500 text-white shadow-xs' : 'bg-primary-500/10 text-primary-600 dark:text-primary-400'
                                                            }`}>
                                                                Day {index + 1}
                                                            </span>
                                                            <h3 className="text-sm sm:text-base font-bold text-light-text dark:text-dark-text tracking-tight">
                                                                {formatDate(dateObj, 'weekday-long', settings)}
                                                            </h3>
                                                            {isToday && (
                                                                <span className="text-2xs font-bold text-primary-500 uppercase tracking-widest flex items-center gap-1">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" />
                                                                    Today
                                                                </span>
                                                            )}
                                                        </div>
                                                        {location && (
                                                            <div className="inline-flex items-center gap-1 text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary mt-1">
                                                                <MapPin className="w-3.5 h-3.5 text-primary-500 shrink-0" weight="duotone" />
                                                                <span>{location.name}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <span className="text-2xs font-mono font-bold px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/5 text-light-text-secondary">
                                                        {dayItems.length} {dayItems.length === 1 ? 'event' : 'events'}
                                                    </span>
                                                    <button 
                                                        type="button"
                                                        onClick={() => handleOpenActivityModal(dateStr)}
                                                        className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400 bg-primary-500/10 hover:bg-primary-500/20 border border-primary-500/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                                                        aria-label={`Add item to Day ${index + 1}`}
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                        <span>Add Item</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Day Schedule Content */}
                                            <div className="p-4 sm:p-6 space-y-3">
                                                {dayItems.length > 0 ? (
                                                    dayItems.map(item => {
                                                        if (item.type === 'Transport') {
                                                            const t = item.ref;
                                                            return (
                                                                <GlassPanel 
                                                                    key={item.id} 
                                                                    className="wg-glass-card rounded-2xl p-4 flex items-center gap-4 hover:shadow-md transition-all cursor-pointer group"
                                                                    overrides={{ borderRadius: 16 }}
                                                                    padding="0px"
                                                                    onClick={() => openTransportModal([t])}
                                                                >
                                                                    <div className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0">
                                                                        <TripItemIcon name={item.icon} className="w-5 h-5 text-white" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-xs font-black text-blue-600 dark:text-blue-400 whitespace-nowrap">{formatTime(item.time)}</span>
                                                                            <h4 className="font-bold text-light-text dark:text-dark-text text-sm truncate">
                                                                                {item.title}
                                                                            </h4>
                                                                        </div>
                                                                        <div className="flex gap-4 mt-1">
                                                                            <p className="text-2xs text-blue-600 dark:text-blue-300 font-bold uppercase tracking-wider">
                                                                                {t.provider} {t.identifier}
                                                                            </p>
                                                                            {item.meta && (
                                                                                <p className="text-2xs text-light-text-secondary font-bold uppercase tracking-wider truncate">
                                                                                    {item.meta}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <button onClick={(e) => { e.stopPropagation(); openTransportModal([t]); }} aria-label="Edit transport booking" className="text-light-text-secondary hover:text-blue-500 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer">
                                                                        <PencilSimple className="w-4 h-4" />
                                                                    </button>
                                                                </GlassPanel>
                                                            );
                                                        } else if (item.type === 'Accommodation') {
                                                            const a = item.ref;
                                                            const isCheckIn = !item.isCheckOut && !item.isOvernight;
                                                            const statusLabel = isCheckIn ? 'Check-In' : (item.isCheckOut ? 'Check-Out' : 'Overnight Stay');
                                                            return (
                                                                <GlassPanel 
                                                                    key={item.id} 
                                                                    className="wg-glass-card rounded-2xl p-4 flex items-center gap-4 hover:shadow-md transition-all cursor-pointer group"
                                                                    overrides={{ borderRadius: 16 }}
                                                                    padding="0px"
                                                                    onClick={() => openAccommodationModal()}
                                                                >
                                                                    <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/30 shrink-0">
                                                                        <TripItemIcon name={item.icon} className="w-5 h-5 text-white" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-2">
                                                                            {!item.isOvernight && (
                                                                                <span className="text-xs font-black text-amber-600 dark:text-amber-400 whitespace-nowrap">{formatTime(item.time)}</span>
                                                                            )}
                                                                            <h4 className="font-bold text-light-text dark:text-dark-text text-sm truncate">
                                                                                {item.title}
                                                                            </h4>
                                                                        </div>
                                                                        <div className="flex gap-4 mt-1">
                                                                            <p className="text-2xs text-amber-600 dark:text-amber-300 font-bold uppercase tracking-wider">
                                                                                {statusLabel}
                                                                            </p>
                                                                            {item.meta && (
                                                                                <p className="text-2xs text-light-text-secondary font-bold uppercase tracking-wider truncate">
                                                                                    {item.meta}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <button onClick={(e) => { e.stopPropagation(); openAccommodationModal(); }} aria-label="Edit accommodation booking" className="text-light-text-secondary hover:text-amber-500 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer">
                                                                        <PencilSimple className="w-4 h-4" />
                                                                    </button>
                                                                </GlassPanel>
                                                            );
                                                        } else {
                                                            const isRes = item.type === 'Reservation';
                                                            const act = item.ref;
                                                            return (
                                                                <GlassPanel 
                                                                    key={item.id} 
                                                                    className="wg-glass-card rounded-2xl p-4 flex items-center gap-4 hover:shadow-md transition-all group/act cursor-pointer"
                                                                    overrides={{ borderRadius: 16 }}
                                                                    padding="0px"
                                                                    onClick={() => handleOpenActivityModal(dateStr, act)}
                                                                >
                                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                                                        isRes 
                                                                        ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' 
                                                                        : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
                                                                    }`}>
                                                                        <TripItemIcon name={item.icon} className="w-5 h-5" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className={`text-xs font-black whitespace-nowrap ${isRes ? 'text-orange-400' : 'text-light-text-secondary'}`}>{formatTime(item.time)}</span>
                                                                            <h4 className="font-bold text-light-text dark:text-dark-text text-sm truncate">{item.title}</h4>
                                                                        </div>
                                                                        {item.meta && <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-0.5 line-clamp-1">{item.meta}</p>}
                                                                        {item.location && <p className="text-xs text-light-text-secondary mt-0.5 flex items-center gap-1 truncate"><MapPin className="w-3 h-3 shrink-0" weight="duotone" /> {item.location}</p>}
                                                                    </div>
                                                                    {item.cost && <div className={`text-xs font-bold whitespace-nowrap ${isRes ? 'text-orange-600 dark:text-orange-400' : 'text-light-text dark:text-dark-text'}`}>{formatCurrency(item.cost)}</div>}
                                                                    
                                                                    <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover/act:opacity-100 transition-opacity">
                                                                        <button onClick={(e) => { e.stopPropagation(); handleOpenActivityModal(dateStr, act); }} aria-label="Edit activity" className="p-1.5 text-light-text-secondary hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"><PencilSimple className="w-4 h-4" /></button>
                                                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteActivity(act.id); }} aria-label="Delete activity" className="p-1.5 text-light-text-secondary hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"><Trash className="w-4 h-4" /></button>
                                                                    </div>
                                                                </GlassPanel>
                                                            );
                                                        }
                                                    })
                                                ) : (
                                                    <div className="py-6 px-4 text-center rounded-2xl bg-black/[0.01] dark:bg-white/[0.01] border border-dashed border-black/10 dark:border-white/10 space-y-2">
                                                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary italic">
                                                            No schedule items planned for today yet.
                                                        </p>
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleOpenActivityModal(dateStr)} 
                                                            aria-label="Add schedule item" 
                                                            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-primary-600 dark:text-primary-400 hover:bg-primary-500/10 transition-all cursor-pointer"
                                                        >
                                                            <Plus className="w-4 h-4" />
                                                            <span>Add Schedule Item</span>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </GlassPanel>
                                    </VirtualListItem>
                                );
                            })}
                        </div>
                    ) : (
                        // Table View - Keep exact same structure with GlassPanel
                        <GlassPanel className="wg-glass-card rounded-[28px] overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-light-fill dark:bg-dark-fill/50 border-b border-black/5 dark:border-white/5 text-2xs font-bold uppercase tracking-widest text-light-text-secondary dark:text-dark-text-secondary sticky top-0 z-20">
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
                                                <tr className={`border-b border-black/5 dark:border-white/5 ${isToday ? 'bg-primary-500/10' : 'bg-black/[0.02] dark:bg-white/[0.02]'}`}>
                                                    <td colSpan={6} className="px-6 py-3">
                                                        <div className="flex items-center gap-3">
                                                            <span className={`text-xs font-black uppercase tracking-wider ${isToday ? 'text-primary-600 dark:text-primary-400' : 'text-light-text-secondary dark:text-dark-text-secondary'}`}>
                                                                {formatDate(dateObj, 'weekday-long', settings)}
                                                            </span>
                                                            {isToday && <span className="px-2 py-0.5 rounded text-2xs font-bold bg-primary-100 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400 uppercase tracking-widest">Today</span>}
                                                        </div>
                                                    </td>
                                                </tr>
                                                {items.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={6} className="px-6 py-8 text-center text-xs text-light-text-secondary dark:text-dark-text-secondary italic font-medium">No scheduled items for this day</td>
                                                    </tr>
                                                ) : items.map((item, idx) => {
                                                    const styleClasses = getTypeStyles(item.type);
                                                    return (
                                                        <tr key={`${dateStr}-${idx}`} className="group hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200 border-b border-black/5 dark:border-white/5 last:border-0">
                                                            <td className="px-6 py-4"><div className="flex flex-col"><span className="text-sm font-bold text-light-text dark:text-dark-text font-mono tracking-tight">{formatTime(item.time)}</span>{item.isDropoff && <span className="text-2xs font-bold text-light-text-secondary uppercase tracking-wider mt-0.5">Arrive</span>}</div></td>
                                                            <td className="px-6 py-4"><div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-2xs font-bold uppercase tracking-wide ${styleClasses}`}><TripItemIcon name={item.icon} className="w-3.5 h-3.5" /><span>{item.subType || item.type}</span></div></td>
                                                            <td className="px-6 py-4"><div><p className="font-bold text-light-text dark:text-dark-text text-sm leading-snug">{item.name}</p>{item.meta && (<p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1 flex items-center gap-1.5 font-medium opacity-80">{item.type === 'Transport' && !item.isDropoff && <Clock className="w-3 h-3 text-light-text-secondary" />}{item.meta}</p>)}</div></td>
                                                            <td className="px-6 py-4"><div className="flex items-center gap-1.5 text-xs text-light-text dark:text-dark-text font-medium max-w-[180px]">{item.location ? (<><MapPin className="w-3.5 h-3.5 opacity-60 shrink-0" /><span className="truncate" title={item.location}>{item.location}</span></>) : (<span className="opacity-30">-</span>)}</div></td>
                                                            <td className="px-6 py-4 text-right">{item.cost ? (<span className="font-bold text-light-text dark:text-dark-text text-sm tabular-nums tracking-tight">{formatCurrency(item.cost)}</span>) : (<span className="text-light-text-secondary text-xs font-mono">-</span>)}</td>
                                                            <td className="px-6 py-4 text-right"><button onClick={() => { if (item.type === 'Transport') openTransportModal([item.ref]); if (item.type === 'Accommodation') openAccommodationModal(); if (item.type === 'Activity' || item.type === 'Reservation' || item.type === 'Tour') handleOpenActivityModal(dateStr, item.ref); }} aria-label="Edit schedule entry" className="w-8 h-8 rounded-full flex items-center justify-center text-light-text-secondary hover:text-primary-600 hover:bg-black/5 dark:hover:bg-white/5 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"><PencilSimple className="w-4 h-4" /></button></td>
                                                        </tr>
                                                    );
                                                })}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </GlassPanel>
                    )}
                </>
            )}

            {/* ITINERARY (BOOKINGS) TAB - LIQUID GLASS */}
            {activeTab === 'itinerary' && (
                <div className="space-y-12 animate-fade-in text-light-text dark:text-dark-text">
                    {/* Transport Section */}
                    <div className="space-y-6">
                        <GlassPanel 
                            className="wg-glass-card rounded-2xl p-4 flex flex-row justify-between items-center"
                            overrides={{ borderRadius: 16 }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center border border-indigo-500/20 shadow-sm">
                                    <Car className="w-5 h-5 text-indigo-500" weight="duotone" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-light-text dark:text-dark-text tracking-tight leading-tight">Transportation</h3>
                                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium">Flights, trains, and rental vehicles</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    className="border-dashed border-2 border-black/10 dark:border-white/10 text-light-text-secondary hover:text-primary-600 font-bold transition-all" 
                                    onClick={() => setIsImportWizardOpen(true)}
                                >
                                    <UploadSimple className="w-4 h-4 mr-1.5" />
                                    Import
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => openTransportModal()} className="font-bold">
                                    + Add Booking
                                </Button>
                            </div>
                        </GlassPanel>

                        {Object.keys(transportGroups).length === 0 ? (
                            <EmptyState
                                icon={<AirplaneTilt className="w-10 h-10 text-primary-500" weight="duotone" />}
                                title="No Transport Bookings Yet"
                                description="Log your flight, train, or drive segments to coordinate departure times and seat assignments."
                                action={{
                                    label: "Add Booking",
                                    onClick: () => openTransportModal(),
                                    icon: "add"
                                }}
                            />
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
                                        <VirtualListItem key={id} minHeight={180}>
                                            <GlassPanel className="wg-glass-card rounded-[28px] overflow-hidden transition-all duration-300">
                                                {/* Header */}
                                                <div className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-black/[0.02] dark:bg-white/[0.01] border-b border-black/5 dark:border-white/5">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center overflow-hidden shadow-inner shrink-0">
                                                            {first.mode === 'Flight' ? (
                                                                <AirlineLogo 
                                                                    provider={first.provider} 
                                                                    brandfetchApiKey={settings?.brandfetchApiKey} 
                                                                    carriers={settings?.carriers} 
                                                                    fallback={<AirplaneTakeoff className="w-6 h-6 text-zinc-600 dark:text-zinc-300" weight="duotone" />} 
                                                                />
                                                            ) : first.logoUrl ? (
                                                                <img referrerPolicy="no-referrer" src={first.logoUrl} className="w-full h-full object-contain" />
                                                            ) : (
                                                                <TripItemIcon name={first.mode} className="w-6 h-6 text-zinc-600 dark:text-zinc-300" />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-bold text-light-text dark:text-dark-text text-base leading-tight">{first.provider}</h4>
                                                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                                            <span className="px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-2xs font-mono font-bold text-light-text-secondary dark:text-dark-text-secondary">
                                                                {first.identifier || 'No ID'}
                                                            </span>
                                                            <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700"></span>
                                                            <span className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider">{first.type}</span>
                                                            {first.confirmationCode && (
                                                                <>
                                                                    <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700"></span>
                                                                    <span className="text-2xs font-mono tracking-widest text-primary-600 dark:text-primary-400 font-bold bg-primary-500/10 px-1.5 py-0.5 rounded border border-primary-500/20 select-all" title="Confirmation Code">
                                                                        CONF: {first.confirmationCode}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto border-t sm:border-0 border-black/5 dark:border-white/5 pt-3 sm:pt-0">
                                                    <div className="text-xl font-bold text-light-text dark:text-dark-text leading-none">
                                                        {formatCurrency(group.reduce((acc, t) => acc + (t.cost || 0), 0))}
                                                    </div>
                                                    <button 
                                                        onClick={() => openTransportModal(group)} 
                                                        aria-label="Edit transport details"
                                                        className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:text-primary-500 uppercase tracking-widest mt-1 cursor-pointer flex items-center gap-1 bg-primary-500/10 px-2.5 py-1 rounded-lg border border-primary-500/20 hover:shadow-sm transition-all"
                                                    >
                                                        <PencilSimple className="w-3.5 h-3.5" /> Edit Details
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
                                                                    <div className="h-px bg-black/5 dark:bg-white/5 flex-1"></div>
                                                                    <div className="px-3 py-1 rounded-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest flex items-center gap-1.5">
                                                                        <ArrowsClockwise className="w-3.5 h-3.5" /> 
                                                                        Return Journey • {Math.ceil((new Date(t.departureDate).getTime() - new Date(group[idx-1].arrivalDate).getTime()) / 86400000)} Days Later
                                                                    </div>
                                                                    <div className="h-px bg-black/5 dark:bg-white/5 flex-1"></div>
                                                                </div>
                                                            )}

                                                            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-6 relative">
                                                                
                                                                {/* Left: Origin Info */}
                                                                <div className="flex-1 flex items-center gap-4 min-w-[200px]">
                                                                    <div className="w-10 h-10 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center shrink-0 shadow-sm text-zinc-400 dark:text-zinc-500">
                                                                        <AirplaneTakeoff className="w-5 h-5" weight="duotone" />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-2xs uppercase font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider">Departure</p>
                                                                        <div className="flex items-baseline gap-2 mt-0.5">
                                                                            <span className="text-xl font-black text-light-text dark:text-dark-text tracking-tight">{formatProperLocationName(t.origin)}</span>
                                                                            <span className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary font-mono">{formatTime(t.departureTime)}</span>
                                                                        </div>
                                                                        <p className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary mt-1">
                                                                            {formatDate(t.departureDate, 'weekday-short', settings)}
                                                                            {t.departureTerminal && ` · Term ${t.departureTerminal}`}
                                                                            {t.departureGate && ` · Gate ${t.departureGate}`}
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                {/* Center: Progress & Duration Vector */}
                                                                <div className="flex flex-col items-center justify-center min-w-[120px] shrink-0 pointer-events-none select-none relative py-1 md:py-0">
                                                                    <span className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-tight mb-1.5">{calculateDuration(t)}</span>
                                                                    <div className="w-full flex items-center gap-1.5 relative px-2">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 border border-indigo-400 shrink-0"></div>
                                                                        <div className="flex-1 h-[2px] border-t-2 border-dashed border-black/10 dark:border-white/10 relative flex items-center justify-center">
                                                                            <AirplaneTilt className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 absolute -top-2 rotate-90" weight="duotone" />
                                                                        </div>
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500 border border-purple-400 shrink-0"></div>
                                                                    </div>
                                                                    <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary mt-1.5">Nonstop</span>
                                                                </div>

                                                                {/* Right: Arrival Info */}
                                                                <div className="flex-1 flex items-center justify-start md:justify-end gap-4 min-w-[200px]">
                                                                    <div className="md:text-right">
                                                                        <p className="text-2xs uppercase font-bold text-light-text-secondary dark:text-dark-text-secondary tracking-wider">Arrival</p>
                                                                        <div className="flex items-baseline md:justify-end gap-2 mt-0.5">
                                                                            <span className="text-xl font-black text-light-text dark:text-dark-text tracking-tight">{formatProperLocationName(t.destination)}</span>
                                                                            <span className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary font-mono">{formatTime(t.arrivalTime)}</span>
                                                                        </div>
                                                                        <p className="text-xs font-semibold text-light-text-secondary dark:text-dark-text-secondary mt-1">
                                                                            {formatDate(t.arrivalDate, 'weekday-short', settings)}
                                                                            {t.arrivalTerminal && ` · Term ${t.arrivalTerminal}`}
                                                                            {t.arrivalGate && ` · Gate ${t.arrivalGate}`}
                                                                        </p>
                                                                    </div>
                                                                    <div className="w-10 h-10 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center shrink-0 order-first md:order-last shadow-sm text-zinc-400 dark:text-zinc-500">
                                                                        <AirplaneLanding className="w-5 h-5" weight="duotone" />
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Additional Amenities/Seats row if present */}
                                                            {(t.travelClass || t.seatNumber || t.vehicleModel || t.pickupLocation) && (
                                                                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-black/5 dark:border-white/5">
                                                                    {t.travelClass && (
                                                                        <div className="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                                                                            <Crown className="w-3.5 h-3.5 text-zinc-400" /> 
                                                                            {t.travelClass}
                                                                        </div>
                                                                    )}
                                                                    {t.seatNumber && (
                                                                        <div className="px-2.5 py-1 rounded-lg bg-primary-500/10 border border-primary-500/20 text-2xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-widest flex items-center gap-1.5">
                                                                            <Armchair className="w-3.5 h-3.5" />
                                                                            Seat {t.seatNumber} {t.seatType && `(${t.seatType})`}
                                                                            {t.isExitRow && <span className="text-2xs font-bold text-rose-500 dark:text-rose-400 font-sans tracking-normal">Exit Row</span>}
                                                                        </div>
                                                                    )}
                                                                    {t.vehicleModel && (
                                                                        <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-2xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                                                                            <Car className="w-3.5 h-3.5" /> 
                                                                            {t.vehicleModel}
                                                                        </div>
                                                                    )}
                                                                    {t.pickupLocation && (
                                                                        <div className="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1">
                                                                            <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                                                                            Pickup: {formatProperLocationName(t.pickupLocation)}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </div>
                                        </GlassPanel>
                                    </VirtualListItem>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Accommodation Section */}
                    <div className="space-y-6">
                        <GlassPanel 
                            className="wg-glass-card rounded-2xl p-4 flex flex-row justify-between items-center"
                            overrides={{ borderRadius: 16 }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20 shadow-sm">
                                    <Buildings className="w-5 h-5 text-amber-600" weight="duotone" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-light-text dark:text-dark-text tracking-tight leading-tight">Accommodation</h3>
                                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium">Hotel stays, resorts, and vacation rentals</p>
                                </div>
                            </div>
                            <Button size="sm" variant="secondary" onClick={() => openAccommodationModal()} className="font-bold">
                                + Add Stay
                            </Button>
                        </GlassPanel>

                        {(!trip.accommodations || trip.accommodations.length === 0) ? (
                            <EmptyState
                                icon={<Buildings className="w-10 h-10 text-primary-500" weight="duotone" />}
                                title="No Accommodations Booked Yet"
                                description="Track your hotels, rentals, or host stays to verify check-in windows and address details."
                                action={{
                                    label: "Book Stay",
                                    onClick: () => openAccommodationModal(),
                                    icon: "add"
                                }}
                            />
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
                                    <VirtualListItem key={stay.id} minHeight={140}>
                                        <GlassPanel className="wg-glass-card rounded-[28px] p-6 sm:p-8 flex flex-col md:flex-row justify-between items-stretch gap-6 group relative">
                                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-5 flex-1">
                                                {/* Brand Logo or Visual Accent */}
                                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-50 to-indigo-100 dark:from-indigo-950/20 dark:to-indigo-900/30 border border-indigo-100 dark:border-indigo-900/20 flex items-center justify-center text-primary-600 dark:text-primary-400 font-black text-2xl overflow-hidden shrink-0 shadow-sm">
                                                    {stay.logoUrl ? (
                                                        <img referrerPolicy="no-referrer" src={stay.logoUrl} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <TripItemIcon name={stay.type} className="w-7 h-7" />
                                                    )}
                                                </div>
                                                
                                                <div className="space-y-1.5 flex-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h4 className="font-bold text-light-text dark:text-dark-text text-lg truncate leading-tight">{stay.name}</h4>
                                                        <span className="px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest">
                                                            {stay.type}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium flex items-center gap-1 max-w-full">
                                                        <MapPin className="w-3.5 h-3.5 shrink-0" weight="duotone" />
                                                        <span className="truncate select-all" title={stay.address}>{formatProperLocationName(stay.address)}</span>
                                                    </p>
                                                    
                                                    <div className="flex flex-wrap gap-2 pt-1.5">
                                                        <span className="bg-primary-500/10 border border-primary-500/20 text-primary-600 dark:text-primary-400 px-2.5 py-0.5 rounded-lg text-2xs font-bold uppercase tracking-wider flex items-center gap-1">
                                                            <Moon className="w-3 h-3" />
                                                            {calculateNights(stay.checkInDate, stay.checkOutDate)} Nights
                                                        </span>
                                                        <span className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary px-2.5 py-0.5 rounded-lg text-2xs font-bold tracking-tight">
                                                            {formatDateRange(stay.checkInDate, stay.checkOutDate, settings).toUpperCase()}
                                                        </span>
                                                        {stay.confirmationCode && (
                                                            <span className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary font-mono text-2xs uppercase font-bold px-2 py-0.5 rounded-lg select-all">
                                                                CONF: {stay.confirmationCode}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Right: Stay Details / Pricing */}
                                            <div className="flex sm:flex-row md:flex-col items-center justify-between md:justify-center md:items-end gap-3 shrink-0 border-t md:border-t-0 md:border-l border-black/5 dark:border-white/5 pt-4 md:pt-0 md:pl-6">
                                                <div className="md:text-right">
                                                    <p className="text-2xs font-bold uppercase tracking-widest text-light-text-secondary dark:text-dark-text-secondary">Total Cost</p>
                                                    {stay.cost ? (
                                                        <>
                                                            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{formatCurrency(stay.cost, settings?.currency)}</div>
                                                            <p className="text-2xs font-semibold text-light-text-secondary dark:text-dark-text-secondary">
                                                                {formatCurrency(Math.round(stay.cost / calculateNights(stay.checkInDate, stay.checkOutDate)), settings?.currency)} / night
                                                            </p>
                                                        </>
                                                    ) : (
                                                        <div className="text-light-text-secondary font-mono text-xs italic">Unpriced</div>
                                                    )}
                                                </div>
                                                
                                                <div className="flex gap-2">
                                                    {stay.website && (
                                                        <a 
                                                            href={stay.website} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer" 
                                                            className="w-8 h-8 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center text-light-text-secondary hover:text-primary-600 transition-all cursor-pointer"
                                                            aria-label="Visit stay website"
                                                            title="Visit Website"
                                                        >
                                                            <Globe className="w-4 h-4" />
                                                        </a>
                                                    )}
                                                    <button 
                                                        onClick={() => openAccommodationModal()} 
                                                        className="w-8 h-8 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center text-light-text-secondary hover:text-primary-600 transition-all cursor-pointer"
                                                        aria-label="Edit stay details"
                                                        title="Edit Stay Details"
                                                    >
                                                        <PencilSimple className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>

                                        </GlassPanel>
                                    </VirtualListItem>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* BUDGET TAB - LIQUID GLASS */}
            {activeTab === 'budget' && (
                <div className="space-y-8 animate-fade-in">
                    
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Total Cost Card (Emerald Gradient) */}
                        <GlassPanel className="p-8 rounded-[28px] wg-glass-card bg-gradient-to-br from-emerald-500/80 to-teal-600/80 text-white shadow-2xl relative overflow-hidden group">
                            <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/20 rounded-full blur-3xl group-hover:scale-110 transition-transform"></div>
                            <p className="text-xs font-bold text-emerald-100 uppercase tracking-widest mb-2">Total Trip Cost</p>
                            <h2 className="text-5xl font-black tracking-tight">{formatCurrency(totalCost)}</h2>
                        </GlassPanel>

                        {/* Cost Per Person */}
                        <GlassPanel className="p-8 rounded-[28px] wg-glass-card relative">
                            <p className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest mb-2">Cost Per Person</p>
                            <h2 className="text-4xl font-black text-light-text dark:text-dark-text">{formatCurrency(costPerPerson)}</h2>
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-2">{(trip.participants || []).length} Travelers</p>
                        </GlassPanel>

                        {/* Daily Average */}
                        <GlassPanel className="p-8 rounded-[28px] wg-glass-card relative">
                            <p className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest mb-2">Daily Average</p>
                            <h2 className="text-4xl font-black text-light-text dark:text-dark-text">{formatCurrency(costPerDay)}</h2>
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-2">{duration} Days</p>
                        </GlassPanel>
                    </div>

                    {/* Lower Section Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Donut Chart Section */}
                        <GlassPanel className="lg:col-span-1 wg-glass-card rounded-[28px] p-8 flex flex-col items-center justify-center relative">
                            <h4 className="absolute top-8 left-8 text-xs font-black text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest">Expense Distribution</h4>
                            
                            <div className="relative w-64 h-64 mt-4">
                                <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                                    {/* Background Circle */}
                                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="12" className="text-black/10 dark:text-white/10" />
                                    
                                    {/* Segments - Simplified visualization logic */}
                                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="#3b82f6" strokeWidth="12" 
                                        strokeDasharray={`${(transportCost/totalCost)*251} 251`} className="transition-all duration-1000" />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-3xl font-black text-light-text dark:text-dark-text">100%</span>
                                </div>
                            </div>

                            <div className="flex gap-4 mt-8">
                                <div className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                                    <span className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary">Transport</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                                    <span className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary">Stays</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-full bg-purple-500"></span>
                                    <span className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary">Activities</span>
                                </div>
                            </div>
                        </GlassPanel>

                        {/* Itemized List Section */}
                        <div className="lg:col-span-2 space-y-4">
                            <h4 className="text-xs font-black text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest mb-4">Itemized Expenses</h4>
                            
                            {/* Transportation Row */}
                            <GlassPanel className="wg-glass-card rounded-2xl p-6 flex items-center justify-between group">
                                <div className="flex items-center gap-5">
                                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                                        <AirplaneTilt className="w-6 h-6" weight="duotone" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-light-text dark:text-dark-text text-lg">Transportation</h4>
                                        <p className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider">{trip.transports?.length || 0} Bookings</p>
                                    </div>
                                </div>
                                <div className="text-xl font-bold text-light-text dark:text-dark-text">{formatCurrency(transportCost)}</div>
                            </GlassPanel>

                            {/* Accommodation Row */}
                            <GlassPanel className="wg-glass-card rounded-2xl p-6 flex items-center justify-between group">
                                <div className="flex items-center gap-5">
                                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                                        <Buildings className="w-6 h-6" weight="duotone" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-light-text dark:text-dark-text text-lg">Accommodation</h4>
                                        <p className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider">{trip.accommodations?.length || 0} Properties</p>
                                    </div>
                                </div>
                                <div className="text-xl font-bold text-light-text dark:text-dark-text">{formatCurrency(stayCost)}</div>
                            </GlassPanel>

                            {/* Activities Row */}
                            <GlassPanel className="wg-glass-card rounded-2xl p-6 flex items-center justify-between group">
                                <div className="flex items-center gap-5">
                                    <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                                        <Ticket className="w-6 h-6" weight="duotone" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-light-text dark:text-dark-text text-lg">Activities & Tours</h4>
                                        <p className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-wider">{trip.activities?.length || 0} Items</p>
                                    </div>
                                </div>
                                <div className="text-xl font-bold text-light-text dark:text-dark-text">{formatCurrency(activityCost)}</div>
                            </GlassPanel>
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
                iconBg="bg-primary-500"
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
                iconBg="bg-amber-500"
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

            <ExcursionConfigurator 
                isOpen={isActivityModalOpen} 
                onClose={() => {
                    setIsActivityModalOpen(false);
                    setSelectedActivityForModal(null);
                }} 
                onSave={handleSaveActivity}
                onDelete={(activityId) => {
                    handleDeleteActivity(activityId);
                    setIsActivityModalOpen(false);
                    setSelectedActivityForModal(null);
                }}
                initialData={selectedActivityForModal}
                defaultDate={currentDayForActivity}
                tripStartDate={trip.startDate}
                tripEndDate={trip.endDate}
            />

            {/* Cinematic Modal */}
            {isCinematicOpen && (
                <div className="fixed inset-0 z-modal bg-black">
                    <div className="absolute top-6 right-6 z-popover">
                        <button 
                            onClick={() => setIsCinematicOpen(false)} 
                            className="min-w-[44px] min-h-[44px] bg-black/60 hover:bg-black/80 text-white rounded-full p-2.5 backdrop-blur-md transition-colors border border-white/20 flex items-center justify-center cursor-pointer"
                            aria-label="Close cinematic view"
                        >
                            <X className="w-6 h-6 text-white" />
                        </button>
                    </div>
                    <Suspense fallback={
                        <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white space-y-4">
                            <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-2xs font-bold uppercase tracking-[0.2em]">Engaging Cinematic Orbit Simulation...</span>
                        </div>
                    }>
                        <DeckFlightMap 
                            trips={[trip]} 
                            animateRoutes={true} 
                            showFrequencyWeight={true}
                            initialProjection="globe"
                            initialElevated={true}
                            embedded={true}
                        />
                    </Suspense>
                </div>
            )}

            {/* Import Modal */}
            <Modal isOpen={importPreview.open} onClose={() => setImportPreview({ open: false, candidates: [] })} title="AI Flight Analysis" maxWidth="max-w-4xl">
               <div className="space-y-6">
                   <div className="flex flex-col md:flex-row gap-4 bg-black/5 dark:bg-white/5 p-4 rounded-2xl border border-black/10 dark:border-white/10">
                       <Input placeholder="Filter by flight or location..." value={importFilters.search} onChange={e => setImportFilters({...importFilters, search: e.target.value})} className="!bg-white dark:!bg-black/20" />
                       <div className="flex gap-2">
                           <Input type="date" value={importFilters.minDate} onChange={e => setImportFilters({...importFilters, minDate: e.target.value})} className="!bg-white dark:!bg-black/20" />
                           <Input type="date" value={importFilters.maxDate} onChange={e => setImportFilters({...importFilters, maxDate: e.target.value})} className="!bg-white dark:!bg-black/20" />
                       </div>
                   </div>
                   <div className="flex justify-between items-center px-2">
                       <span className="text-xs font-bold text-light-text-secondary dark:text-dark-text-secondary uppercase tracking-widest">{selectedCount} Selected</span>
                       <Button size="sm" variant="ghost" onClick={toggleAllFiltered}>{filteredCandidates.every(c => c.selected) ? 'Deselect All' : 'Select All'}</Button>
                   </div>
                   <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar p-1">
                       {filteredCandidates.map(candidate => {
                           const t = candidate.trip;
                           const isSelected = candidate.selected;
                           const isExpanded = expandedCandidateId === t.id;
                           return (
                               <VirtualListItem key={t.id} minHeight={72}>
                                   <div className={`border rounded-2xl transition-all ${isSelected ? 'border-primary-500 bg-primary-500/10' : 'border-black/10 dark:border-white/10 bg-light-card dark:bg-dark-card'}`}>
                                       <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => toggleCandidateSelection(t.id)}>
                                           <div className={`w-6 h-6 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-primary-500 border-primary-500' : 'bg-white dark:bg-dark-fill border-gray-300 dark:border-gray-600'}`}>
                                               {isSelected && <Check className="w-3.5 h-3.5 text-white" weight="bold" />}
                                           </div>
                                           <div className="flex-1">
                                                <div className="flex justify-between items-center"><h4 className="font-bold text-light-text dark:text-dark-text">{t.name}</h4><Badge color={candidate.confidence > 80 ? 'green' : candidate.confidence > 50 ? 'amber' : 'gray'}>{candidate.confidence}% Match</Badge></div>
                                                <div className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1 flex gap-3"><span>{formatDate(t.startDate, 'short-with-year', settings)}</span><span>•</span><span>{t.transports?.length} Flights</span></div>
                                           </div>
                                           <button onClick={(e) => { e.stopPropagation(); setExpandedCandidateId(isExpanded ? null : t.id); }} aria-label="Toggle flight details" className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full text-light-text-secondary min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer">{isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}</button>
                                       </div>
                                       {isExpanded && t.transports && (
                                           <div className="border-t border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] p-4 space-y-2">
                                               {t.transports.map((tr, idx) => (
                                                   <div key={tr.id || `${tr.identifier}-${tr.departureDate}-${idx}`} className="flex items-center gap-3 text-xs p-2 bg-light-card dark:bg-dark-card rounded-lg border border-black/5 dark:border-white/5">
                                                       <span className="font-mono font-bold text-primary-600 dark:text-primary-400">{tr.departureTime}</span>
                                                       <span className="font-bold">{formatProperLocationName(tr.origin)} &rarr; {formatProperLocationName(tr.destination)}</span>
                                                       <span className="text-light-text-secondary">{tr.provider} {tr.identifier}</span>
                                                   </div>
                                               ))}
                                           </div>
                                       )}
                                   </div>
                               </VirtualListItem>
                           );
                       })}
                       {filteredCandidates.length === 0 && <div className="text-center py-10 text-light-text-secondary">No flights match your filters.</div>}
                   </div>
                   <div className="flex justify-end gap-3 pt-4 border-t border-black/5 dark:border-white/5">
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
