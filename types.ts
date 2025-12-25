
export interface User {
  id: string;
  name: string;
  email?: string; // New: Auth identifier
  password?: string; // New: Mock password
  role: 'Admin' | 'Partner' | 'Child';
  leaveBalance: number; // in days
  takenLeave: number;
  allowance: number; // Keep for backward compatibility / aggregate view
  lieuBalance?: number; // Added for Lieu Rule
  policies?: UserPolicy[]; // New: Granular policy configuration
  holidayConfigIds?: string[]; // Updated: Links to multiple SavedConfig.id
  holidayWeekendRule?: 'monday' | 'lieu' | 'none'; // Per-user rule for how to handle weekend holidays
  activeYears?: number[]; // New: Explicitly tracked years for UI persistence
}

export interface UserPolicy {
  entitlementId: string;
  year: number; // Year-specific configuration
  isActive: boolean;
  isUnlimited?: boolean; // New: Per-user override for unlimited allowance
  // Configuration moved from Global to User/Year specific
  accrual: {
    period: AccrualPeriod;
    amount: number;
  };
  carryOver: {
    enabled: boolean;
    maxDays: number;
    targetEntitlementId?: string; // "Existing category" or "Self"
    expiryType: CarryOverExpiryType;
    expiryValue?: number | string; // e.g., 3 (months) or "06-30" (fixed date)
  };
}

export interface TripAllocation {
  entitlementId: string;
  days: number;
  targetYear?: number; // New: specific year this allocation applies to
}

export type TransportMode = 'Flight' | 'Train' | 'Bus' | 'Car Rental' | 'Personal Car' | 'Cruise';

export interface GeoCoordinates {
  lat: number;
  lng: number;
  tz?: string; // Timezone ID (e.g. "America/New_York")
}

export interface Transport {
  id: string;
  itineraryId: string; // Grouping ID for round trips/multi-city
  type: 'One-Way' | 'Round Trip' | 'Multi-City';
  mode: TransportMode; // New: Transport Type
  provider: string; // airline, train operator, rental company
  identifier: string; // flightNumber, train number, plate number
  confirmationCode: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string; // HH:mm
  arrivalDate: string;
  arrivalTime: string;
  travelClass?: 'Economy' | 'Premium Economy' | 'Business' | 'First';
  seatNumber?: string;
  seatType?: 'Window' | 'Aisle' | 'Middle';
  isExitRow?: boolean;
  cost?: number;
  
  // Car Rental Specifics
  pickupLocation?: string;
  dropoffLocation?: string;
  vehicleModel?: string;
  
  website?: string;
  reason?: string; // Business/Personal
  
  // Metadata
  duration?: number; // in minutes (timezone corrected)
  distance?: number; // km
  logoUrl?: string; // URL to carrier logo

  // Coordinates for Map
  originLat?: number;
  originLng?: number;
  destLat?: number;
  destLng?: number;
}

export interface Accommodation {
  id: string;
  name: string;
  address: string;
  type: 'Hotel' | 'Airbnb' | 'Resort' | 'Villa' | 'Apartment' | 'Hostel' | 'Campground' | 'Friends/Family';
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  confirmationCode?: string;
  notes?: string;
  website?: string;
  cost?: number;
  logoUrl?: string; // URL to brand logo
  coordinates?: GeoCoordinates;
}

export interface Activity {
  id: string;
  date: string;
  time: string;
  title: string;
  cost?: number;
  location?: string;
  description?: string;
  type?: 'Reservation' | 'Activity' | 'Tour';
  coordinates?: GeoCoordinates;
}

export interface LocationEntry {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    description?: string;
    coordinates?: GeoCoordinates;
}

export interface Trip {
  id: string;
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  status: 'Planning' | 'Upcoming' | 'Past' | 'Cancelled';
  participants: string[];
  icon?: string;
  
  // Basic Leave Request Fields (Legacy/Simple)
  entitlementId?: string; // If null, counts as 'General Event' (no balance impact)
  durationMode?: 'all_full' | 'all_am' | 'all_pm' | 'single_am' | 'single_pm' | 'custom';
  startPortion?: 'full' | 'pm'; // for custom mode
  endPortion?: 'full' | 'am'; // for custom mode
  
  // Advanced Allocation (Multi-Category / Cross-Year)
  allocations?: TripAllocation[];
  excludedDates?: string[]; // specific dates to NOT count (e.g. working during vacay)

  // Logistics
  transports?: Transport[];
  accommodations?: Accommodation[];
  activities?: Activity[];
  locations?: LocationEntry[]; // Visual route planner entries

  // Map Data
  coordinates?: GeoCoordinates;
}

export interface PublicHoliday {
  id: string;
  name: string;
  date: string;
  countryCode: string;
  isIncluded: boolean; // Toggle to include in calculation
  isWeekend?: boolean; // Helper from API
  configId?: string; // Link to SavedConfig
}

export interface SavedConfig {
    id: string; // countryCode-Year
    countryCode: string;
    countryName: string;
    year: number;
    holidays: PublicHoliday[];
    updatedAt: string;
}

export interface CustomEvent {
  id: string;
  name: string;
  date: string;
  isWorkingDay: boolean; // Does this count as a working day? (e.g., Company Offsite vs Work Saturday)
}

export interface EntitlementRule {
    accrualPeriod: 'monthly' | 'yearly' | 'lump_sum';
    accrualAmount: number;
    carryOver: boolean;
    carryOverLimit?: number;
    carryOverExpiry?: number; // months
}

export type AccrualPeriod = 'monthly' | 'yearly' | 'lump_sum';
export type CarryOverExpiryType = 'none' | 'months' | 'fixed_date';

export interface EntitlementType {
  id: string;
  name: string;
  category: 'Annual' | 'Sick' | 'Unpaid' | 'Lieu' | 'Seniority' | 'Custom';
  color: 'blue' | 'green' | 'amber' | 'gray' | 'purple' | 'red' | 'indigo' | 'pink' | 'teal' | 'cyan';
  isUnlimited?: boolean; // New: If true, balance check is skipped
  
  // Default Policy Configuration
  accrual: {
    period: AccrualPeriod;
    amount: number;
  };
  carryOver: {
    enabled: boolean;
    maxDays: number;
    targetEntitlementId?: string; // "Existing category" or "Self"
    expiryType: CarryOverExpiryType;
    expiryValue?: number | string; // e.g., 3 (months) or "06-30" (fixed date)
  };
}

export interface WorkspaceSettings {
    orgName: string;
    currency: string;
    dateFormat: string;
    autoSync: boolean; // Sync with Google Calendar?
    theme: 'light' | 'dark' | 'auto';
    workingDays: number[]; // 0=Sun, 1=Mon...
    aviationStackApiKey?: string;
    brandfetchApiKey?: string;
}

export enum ViewState {
  DASHBOARD = 'dashboard',
  SETTINGS = 'settings',
  TIME_OFF = 'time_off',
  USER_DETAIL = 'user_detail',
  PLANNER = 'planner',
  TRIP_DETAIL = 'trip_detail',
  MAP = 'map'
}