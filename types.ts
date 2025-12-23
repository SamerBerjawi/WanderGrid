
export interface User {
  id: string;
  name: string;
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

export interface Flight {
  id: string;
  itineraryId: string; // Grouping ID for round trips/multi-city
  type: 'One-Way' | 'Round Trip' | 'Multi-City';
  airline: string;
  flightNumber: string;
  confirmationCode: string;
  origin: string; // Airport Code or City
  destination: string;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  travelClass: 'Economy' | 'Economy+' | 'Business' | 'First';
  seatNumber: string;
  seatType: 'Window' | 'Aisle' | 'Middle';
  isExitRow: boolean;
  reason: 'Personal' | 'Business';
  cost?: number; // New
  currency?: string; // New
  website?: string; // New
}

export interface Accommodation {
  id: string;
  name: string; // e.g., "Hilton Garden Inn"
  address: string;
  type: 'Hotel' | 'Airbnb' | 'Resort' | 'Villa' | 'Apartment' | 'Hostel' | 'Campground' | 'Friends/Family';
  checkInDate: string;
  checkOutDate: string;
  checkInTime?: string;
  checkOutTime?: string;
  confirmationCode?: string;
  website?: string;
  cost?: number;
  currency?: string;
  notes?: string;
}

export interface Activity {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  description?: string;
  time?: string; // HH:MM
  location?: string;
  cost?: number;
  link?: string;
  isBooked?: boolean;
}

export interface Trip {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  location: string;
  status: 'Upcoming' | 'Past' | 'Planning'; // Planning = Planned, Upcoming = Confirmed
  participants: string[]; // user IDs
  icon?: string; // User selected emoji/icon
  durationMode?: 'all_full' | 'all_am' | 'all_pm' | 'single_am' | 'single_pm' | 'custom';
  startPortion?: 'full' | 'pm'; // Precision for custom start
  endPortion?: 'full' | 'am';   // Precision for custom end
  entitlementId?: string; // Primary entitlement (legacy or main color)
  allocations?: TripAllocation[]; // Support for split categories
  excludedDates?: string[]; // New: Persist specific days toggled off by user
  flights?: Flight[]; // New: Flight itinerary
  accommodations?: Accommodation[]; // New: Accommodation list
  activities?: Activity[]; // New: Daily activities
}

export interface PlaceResult {
  title: string;
  address?: string;
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  googleMapsUri?: string;
  snippet?: string;
}

export interface PublicHoliday {
  id: string;
  name: string;
  date: string;
  countryCode: string;
  isIncluded: boolean;
  // Rule Engine props
  isWeekend?: boolean;
  ruleAction?: 'monday' | 'lieu' | 'none'; 
  configId?: string; // Track which config this holiday belongs to
}

export interface CustomEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  description?: string;
  color: 'blue' | 'green' | 'amber' | 'purple' | 'red' | 'gray';
}

export type AccrualPeriod = 'lump_sum' | 'yearly' | 'monthly';
export type CarryOverExpiryType = 'none' | 'months' | 'fixed_date';

export interface EntitlementType {
  id: string;
  name: string;
  category: string; 
  color: 'blue' | 'green' | 'amber' | 'gray' | 'purple' | 'red' | 'indigo' | 'pink' | 'teal' | 'cyan'; 
  // Legacy props kept optional to prevent breakage during migration, but logic moves to UserPolicy
  defaultAllowance?: number; 
  isUnlimited?: boolean;
  
  // Default configuration for this entitlement type
  accrual: {
    period: AccrualPeriod;
    amount: number;
  };
  carryOver: {
    enabled: boolean;
    maxDays: number;
    targetEntitlementId?: string; 
    expiryType: CarryOverExpiryType;
    expiryValue?: number | string; 
  };
}

export interface EntitlementRule {
  id: string;
  entitlementId: string; // Links to EntitlementType.id
  name: string;
  type: 'accrual' | 'carry_over' | 'expiry' | 'transfer';
  value: number;
  unit: 'days' | 'months' | 'percent' | 'days_per_month' | 'lump_sum' | 'years_service';
  targetEntitlementId?: string; // For transfer rules
  description: string;
}

export interface SavedConfig {
  id: string;
  countryCode: string;
  countryName: string;
  year: number;
  holidays: PublicHoliday[];
  updatedAt: string;
}

export interface WorkspaceSettings {
  orgName: string;
  currency: string;
  dateFormat: string;
  autoSync: boolean;
  theme: 'light' | 'dark' | 'auto';
  workingDays: number[]; // 0=Sun, 1=Mon, ... 6=Sat
  aviationStackApiKey?: string; // Key for Flight Data Provider
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  SETTINGS = 'SETTINGS',
  TIME_OFF = 'TIME_OFF',
  USER_DETAIL = 'USER_DETAIL',
  PLANNER = 'PLANNER',
  TRIP_DETAIL = 'TRIP_DETAIL'
}
