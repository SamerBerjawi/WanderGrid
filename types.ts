import type { LoyaltyProgram } from './utils/loyalty';

export interface User {
  id: string;
  name: string;
  email?: string; // New: Auth identifier
  password?: string; // Write-only: sent when setting a password, never returned by the API
  passwordResetRequired?: boolean; // Set by the API when the account has no usable password
  version?: number; // Server-managed edit counter for conflict detection
  role: 'Admin' | 'Partner' | 'Child';
  leaveBalance: number; // in days
  takenLeave: number;
  allowance: number; // Keep for backward compatibility / aggregate view
  lieuBalance?: number; // Added for Lieu Rule
  policies?: UserPolicy[]; // New: Granular policy configuration
  holidayConfigIds?: string[]; // Legacy: saved calendars followed one year at a time (SavedConfig.id); read when `holidayCalendars` is unset
  /** The holiday calendars followed, every year: a country ("BE") or a region ("DE-BY"). */
  holidayCalendars?: string[];
  holidayWeekendRule?: 'monday' | 'lieu' | 'none'; // Per-user rule for how to handle weekend holidays
  /** Track requests and approvals for this member's leave (Requested / Approved / Rejected) instead of Planned / Confirmed. */
  leaveApproval?: boolean;
  /** The member's own working week (0=Sun … 6=Sat); the workspace's when unset. Part-timers set theirs. */
  workingDays?: number[];
  /** Manual changes to a balance (days given or taken back), per leave type and leave year. */
  leaveAdjustments?: LeaveAdjustment[];
  /** Set once the old yearly fields (`allowance`, `takenLeave`) were turned into allowances (migration 0005). */
  legacyLeaveConverted?: boolean;
  /** Which leave reminders this member sees in the app (each on unless set to false). */
  leaveReminders?: Partial<Record<LeaveReminderKind, boolean>>;
  activeYears?: number[]; // New: Explicitly tracked years for UI persistence
  profilePicture?: string;
  nationality?: string;
  dateOfBirth?: string;
  passportNumber?: string;
  passportIssuingEntity?: string;
  passportIssueDate?: string;
  passportExpiryDate?: string;
  /** Frequent-flyer and hotel numbers, matched to the carrier or hotel they are for. */
  loyalty?: LoyaltyProgram[];
}

/** In-app leave reminders a member can turn off. */
export type LeaveReminderKind = 'upcoming' | 'expiring' | 'unused' | 'requests' | 'trips';

/** A manual change to a member's balance: + days given (a bonus day), − days taken back (days recorded elsewhere). */
export interface LeaveAdjustment {
  id: string;
  entitlementId: string;
  /** The leave year it applies to. */
  year: number;
  days: number;
  /** When it was made (YYYY-MM-DD). */
  date?: string;
  note?: string;
}

export interface UserPolicy {
  entitlementId: string;
  year: number; // Year-specific configuration
  isActive: boolean;
  /** Days already there when the year starts, before anything WanderGrid counts (a first year, or a balance from elsewhere). */
  openingBalance?: number;
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

export type TransportMode = 'Flight' | 'Train' | 'Bus' | 'Car Rental' | 'Personal Car' | 'Cruise' | 'Ferry';

export interface GeoCoordinates {
  lat: number;
  lng: number;
  tz?: string; // Timezone ID (e.g. "America/New_York")
  country?: string;
  countryCode?: string;
  displayName?: string;
  city?: string;
}

export interface RoadTripWaypoint {
  id: string;
  name: string; // Location name
  type: 'Stop' | 'Food' | 'Lodging' | 'Sightseeing' | 'Fuel';
  notes?: string;
  coordinates?: GeoCoordinates;
  addToVisited?: boolean;
  visitDate?: string;
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
  actualDepartureTime?: string; // HH:mm (Actual)
  arrivalDate: string;
  arrivalTime: string;
  actualArrivalTime?: string; // HH:mm (Actual)
  travelClass?: 'Economy' | 'Premium Economy' | 'Business' | 'First';
  seatNumber?: string;
  seatType?: 'Window' | 'Aisle' | 'Middle';
  isExitRow?: boolean;
  /** New pages: which of the trip's members flew this leg. Absent means everyone on the trip. */
  passengers?: string[];
  /** Who paid for this leg (account user id or trip companion id). */
  paidBy?: string;
  /** Exclude this leg's cost from personal cost analytics (for example employer-paid travel). */
  excludeFromAnalytics?: boolean;
  /** New pages: overrides how the Flights page groups this leg. `alone` keeps it out of any journey; `j:<id>` joins every leg with the same key. */
  journeyKey?: string;
  /** New pages: the route actually flown, saved from the live transponder track: [longitude, latitude] pairs, about 80 points. */
  track?: [number, number][];
  cost?: number;
  
  // Car Rental Specifics
  pickupLocation?: string;
  dropoffLocation?: string;
  vehicleModel?: string;
  waypoints?: RoadTripWaypoint[]; // New: For road trips
  
  isLayover?: boolean; // True if this transport leg was a transit/layover
  isExcursion?: boolean; // True if this transport is an excursion or route journey
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
  /** The origin / destination text the coordinates above were found for; they are looked up again only when the text changes. */
  originGeoKey?: string;
  destGeoKey?: string;
  
  // Helper for flight tracking
  providerCode?: string; // IATA code for airline (e.g. AA)
  /** New pages: set when the leg was filled in from a live-data lookup (AeroDataBox), so its row shows the antenna. */
  liveDataSource?: 'aerodatabox';

  // AirTrail Explicit Fields
  departureTerminal?: string;
  departureGate?: string;
  arrivalTerminal?: string;
  arrivalGate?: string;
  tailNumber?: string;
  isApproximate?: boolean;
  approximateYear?: number;
  customFields?: Array<{ key: string; value: string }>;
  notes?: string;
  // Associated Trip (for flattened/query contexts)
  tripId?: string;
  tripName?: string;
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
  /** Which trip travellers stay here. Absent means everyone travelling on the trip. */
  participants?: string[];
  /** Who paid for this stay (account user id or trip companion id). */
  paidBy?: string;
  /** Exclude this stay's cost from personal cost analytics. */
  excludeFromAnalytics?: boolean;
  logoUrl?: string; // URL to brand logo
  coordinates?: GeoCoordinates;
}

export type ActivityType = 
  | 'Activity' 
  | 'Reservation' 
  | 'Dining' 
  | 'Tour' 
  | 'Sightseeing' 
  | 'Museum' 
  | 'Outdoor' 
  | 'Entertainment' 
  | 'Shopping' 
  | 'Wellness' 
  | 'Nightlife'
  | string;

export interface Activity {
  id: string;
  date: string;
  time: string;
  title: string;
  cost?: number;
  /** Which trip travellers join this activity. Absent means everyone travelling on the trip. */
  participants?: string[];
  /** Who paid for this activity (account user id or trip companion id). */
  paidBy?: string;
  /** Exclude this activity's cost from personal cost analytics. */
  excludeFromAnalytics?: boolean;
  location?: string;
  description?: string;
  type?: ActivityType;
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

export interface PackingItem {
    id: string;
    text: string;
    category: string;
    isChecked: boolean;
}

/** How an expense is shared: equally among some travellers, or by amounts (in the expense's own currency). */
export interface ExpenseSplit {
  mode: 'equal' | 'custom';
  /** The travellers who share it (user ids). */
  among: string[];
  /** Custom mode: each person's share, in the expense's own currency. */
  shares?: Record<string, number>;
}

/** Spending logged on a trip, in the currency it was paid in, with the rate that turned it into the trip's ledger currency. */
export interface Expense {
  id: string;
  date: string;
  title: string;
  category: 'Food' | 'Transport' | 'Stay' | 'Activities' | 'Shopping' | 'Other';
  amount: number;
  currency: string;
  /** Ledger currency per one unit of `currency`, as of `date`. */
  rate: number;
  /** The traveller who paid (account user id or trip companion id). */
  paidBy: string;
  split: ExpenseSplit;
  /** Exclude this expense from personal cost analytics. */
  excludeFromAnalytics?: boolean;
  note?: string;
}

export type TripClassification = 'Personal' | 'Business' | 'Family' | 'Bleisure' | 'Other';
export type CompanionRole = 'Partner' | 'Family' | 'Friend' | 'Employer' | 'Colleague' | 'Other';

/** A person or payer without a WanderGrid account, attached to a trip for planning, Paid by, and cost analytics. */
export interface TripCompanion {
  id: string;
  name: string;
  role: CompanionRole;
  /** Non-travelling payer (such as an Employer): selectable in Paid by, omitted from traveller headcounts and passenger lists. */
  isPayerOnly?: boolean;
  /** Costs paid by this companion default to excluded from personal cost analytics. */
  excludeFromAnalytics?: boolean;
}

export interface Trip {
  id: string;
  name: string;
  archived?: boolean; // Hidden from planning boards until restored (Archive is not Delete)
  version?: number; // Server-managed edit counter for conflict detection
  originalName?: string;
  subtitle?: string;
  description?: string;
  notes?: string;
  location: string;
  startDate: string;
  endDate: string;
  status: 'Planning' | 'Upcoming' | 'Past' | 'Cancelled';
  /** What was decided before the trip happened. `status` loses this once a trip is Past, so it is kept here. */
  intent?: 'planned' | 'confirmed' | 'cancelled';
  /** Trip classification (Personal, Business, Family, Bleisure, Other). Defaults to Personal when unset. */
  classification?: TripClassification;
  /** When true, booked costs on this trip default to excluded from personal cost analytics unless overridden on an item. */
  excludeCostsFromAnalytics?: boolean;
  participants: string[];
  /** Non-account members and external payers (family, partner, friend, employer) on this trip. */
  companions?: TripCompanion[];
  icon?: string;
  /** New pages: the name of a Hugeicons free icon (e.g. 'Airplane01Icon') chosen for this trip. Kept apart from `icon`, which older pages render as an emoji. */
  hugeicon?: string;
  /** The drawing of the chosen icon, saved with the trip so showing it never has to load the 6 MB icon set (audit F-09). */
  hugeiconData?: readonly (readonly [string, Record<string, string | number>])[];
  privacy?: 'Private' | 'Public' | 'Shared'; // 'Shared' is accepted by the server for old data; nothing sets it and it reads as Private
  /** What the trip is meant to cost, in the workspace currency (New trip page). */
  targetBudget?: number;
  
  // Legacy: leave stored on trips before leave Phase 1. Migration 0004 (and restores) move it into `LeaveEntry` records;
  // nothing writes these any more and only the conversion (utils/leaveEntry.ts, backend_files/leaveEntries.js) reads them.
  entitlementId?: string;
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
  packingList?: PackingItem[]; // Smart Gear List
  /** Spending logged on the trip (the ledger behind "who owes whom"), and the currency it is totalled in. */
  expenses?: Expense[];
  ledgerCurrency?: string;

  // Map Data
  coordinates?: GeoCoordinates;

  /**
   * What this record is (D-04): a planned `trip`, calendar `timeoff`, or a flight `bundle` with no planner trip.
   * Read it through `tripKind()` (utils/tripKind.ts), which also understands records saved before it existed.
   */
  kind?: TripKind;
  /** Set by the server when the trip is created. Only the creator or an admin may change who is on it or its privacy. */
  createdBy?: string;
  /** Legacy flags, still written next to `kind` so older readers and the calendar feed keep working. */
  isBundleOnly?: boolean;
  hideInPlanner?: boolean;
}

export type TripKind = 'trip' | 'timeoff' | 'bundle';

/**
 * Where a leave entry stands. `draft` is an idea, `planned` is booked in your own plans, `requested` waits for an
 * answer, `approved` is confirmed; `rejected` and `cancelled` are kept for the record. Planned, requested and approved
 * leave counts against the balance (requested as pending); the others never do. Whether it is taken follows from the date.
 */
export type LeaveState = 'draft' | 'planned' | 'requested' | 'approved' | 'rejected' | 'cancelled';

/** The day-by-day shape shared by leave entries (and, before leave Phase 1, trips that carried leave). */
export interface LeaveSpan {
  startDate: string;
  endDate?: string;
  durationMode?: 'all_full' | 'all_am' | 'all_pm' | 'single_am' | 'single_pm' | 'custom';
  startPortion?: 'full' | 'pm';
  endPortion?: 'full' | 'am';
  excludedDates?: string[];
}

/**
 * Time off for one member (leave Phase 1): its own record in the `leave` collection, optionally linked to a trip.
 * The days it costs are counted by utils/calendarModel.ts against the member's working week and public holidays.
 */
export interface LeaveEntry extends LeaveSpan {
  id: string;
  memberId: string;
  /** A label ("Ski week"); time off with no label shows its leave type. */
  name?: string;
  endDate: string;
  /** One leave type, or `allocations` to split the days across types and years. */
  entitlementId?: string;
  allocations?: TripAllocation[];
  state: LeaveState;
  /** The trip this leave is for, when there is one. Travel dates and leave dates may differ. */
  tripId?: string;
  note?: string;
  createdBy?: string;
  version?: number;
  updatedAt?: string;
}

export interface PublicHoliday {
  id: string;
  name: string;
  date: string;
  countryCode: string;
  isIncluded: boolean; // Toggle to include in calculation
  isWeekend?: boolean; // Helper from API
  configId?: string; // Link to SavedConfig
  /** Only a region's holiday (the calendar's `region`), not the whole country's. */
  regional?: boolean;
  /** Added by hand, not by the holiday service (kept when the calendar is refreshed). */
  custom?: boolean;
}

export interface SavedConfig {
    id: string; // countryCode-Year, or countryCode-REGION-Year for a region (e.g. DE-BY-2026)
    countryCode: string;
    countryName: string;
    /** An ISO 3166-2 region (e.g. "DE-BY") whose own holidays the calendar adds to the country's. */
    region?: string;
    regionName?: string;
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
  /** The month (1–12) its leave year starts; January when unset. A June start makes "2026" run June 2026 – May 2027. */
  yearStartMonth?: number;
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

export interface Carrier {
  id: string;
  name: string;
  code: string; // Used as the "provider" (e.g., "delta", "DL")
  domain: string; // Brandfetch domain (e.g., "delta.com")
}

export interface WorkspaceSettings {
    orgName: string;
    currency: string;
    dateFormat: string;
    autoSync: boolean; // Sync with Google Calendar?
    theme: 'light' | 'dark' | 'auto';
    workingDays: number[]; // 0=Sun, 1=Mon...
    aviationStackApiKey?: string;
    aeroDataBoxApiKey?: string;
    aeroDataBoxEndpoint?: 'rapidapi' | 'direct';
    openAipApiKey?: string;
    brandfetchApiKey?: string;
    masterPackingList?: PackingItem[]; // Global packing list template
    carriers?: Carrier[]; // Manageable custom carriers list
    defaultTravelClass?: 'Economy' | 'Premium Economy' | 'Business' | 'First';
    defaultStartingAirport?: string;
    defaultLandTransportMethod?: 'Train' | 'Bus' | 'Car Rental' | 'Personal Car';
    defaultBasemapLight?: 'liberty' | 'bright' | 'positron' | 'satellite' | 'snow' | 'vibrant' | 'ocean';
    defaultBasemapDark?: 'citylights' | 'ocean' | 'satellite' | 'onyx';
    allowSelfRegistration?: boolean; // Public "Sign Up" after the first admin exists (default off; ALLOW_SIGNUP=true on the server flips the default)
    savedCompanions?: TripCompanion[]; // Workspace-wide people/payers without accounts (family, partner, friend, employer)
    configuredKeys?: Partial<Record<'aviationStackApiKey' | 'aeroDataBoxApiKey' | 'openAipApiKey', boolean>>; // Read-only, from the server
    /** Read-only, from the server: where each key comes from (saved in the workspace, or the host's environment). */
    keySources?: Partial<Record<'aviationStackApiKey' | 'aeroDataBoxApiKey' | 'openAipApiKey', 'workspace' | 'env' | 'none'>>;
}

export type CountryResidenceStatus = 'lived_past' | 'lived_current' | 'visited' | 'layover' | 'wishlist';

export interface VisitedItem {
  id: string;
  /** Set by the server on create; a record without one is managed by an admin. */
  ownerId?: string;
  type: 'country' | 'city';
  code: string;
  name: string;
  countryCode?: string;
  countryName?: string;
  lat?: number;
  lng?: number;
  visitDate?: string;
  isManual?: boolean;
  notes?: string;
  isTransit?: boolean;
  residenceStatus?: CountryResidenceStatus;
  residenceStatuses?: CountryResidenceStatus[];
  /** Country the user explicitly cleared on the map: kept as a marker so trips don't re-mark it as visited. */
  excluded?: boolean;
}

export const getResidenceStatuses = (item?: {
  residenceStatus?: CountryResidenceStatus;
  residenceStatuses?: CountryResidenceStatus[];
  isTransit?: boolean;
} | null): CountryResidenceStatus[] => {
  if (!item) return [];
  if (item.residenceStatuses && Array.isArray(item.residenceStatuses) && item.residenceStatuses.length > 0) {
    return item.residenceStatuses;
  }
  const result: CountryResidenceStatus[] = [];
  if (item.residenceStatus) {
    result.push(item.residenceStatus);
  }
  if (item.isTransit && !result.includes('layover')) {
    result.push('layover');
  }
  if (result.length === 0) {
    result.push('visited');
  }
  return result;
};

export const toggleCountryResidenceStatus = (
  currentStatuses: CountryResidenceStatus[],
  targetStatus: CountryResidenceStatus
): CountryResidenceStatus[] => {
  const isCurrentlySelected = currentStatuses.includes(targetStatus);
  if (isCurrentlySelected) {
    return currentStatuses.filter(s => s !== targetStatus);
  } else {
    // Group A (pre-exploration): 'wishlist', 'layover'
    // Group B (stay / explored): 'visited', 'lived_past', 'lived_current'
    // Wishlist & layover can be selected together.
    // Visited & lived can be selected together.
    // But Group A and Group B cannot be mixed (cannot select wishlist & lived, or layover & visited).
    if (targetStatus === 'wishlist' || targetStatus === 'layover') {
      const filtered = currentStatuses.filter(s => s !== 'visited' && s !== 'lived_past' && s !== 'lived_current');
      return [...filtered, targetStatus];
    } else {
      const filtered = currentStatuses.filter(s => s !== 'wishlist' && s !== 'layover');
      return [...filtered, targetStatus];
    }
  }
};

export type PredefinedMapMode = 'flights' | 'land_sea' | 'scratch' | 'all' | 'none';

// --- Live Flight Tracking Types ---
export interface FlightStatusResponse {
    source?: 'adsbdb-route' | 'aviationstack' | 'aerodatabox' | 'mock' | 'ai_guessing' | string;
    flight_date?: string;
    flight_status?: 'scheduled' | 'active' | 'landed' | 'cancelled' | 'incident' | 'diverted' | 'route-verified' | string;
    departure: {
        airport: string;
        timezone?: string;
        iata: string;
        icao: string;
        terminal?: string;
        gate?: string;
        delay?: number;
        scheduled?: string;
        estimated?: string;
        actual?: string;
        estimated_runway?: string;
        actual_runway?: string;
    };
    arrival: {
        airport: string;
        timezone?: string;
        iata: string;
        icao: string;
        terminal?: string;
        gate?: string;
        baggage?: string;
        delay?: number;
        scheduled?: string;
        estimated?: string;
        actual?: string;
        estimated_runway?: string;
        actual_runway?: string;
    };
    airline: {
        name: string;
        iata: string;
        icao: string;
    };
    flight: {
        number: string;
        iata: string;
        icao: string;
        codeshared?: any;
    };
    aircraft?: {
       registration?: string;
       iata?: string;
       model?: string;
       country?: string;
    };

    live?: {
        updated: string;
        latitude: number;
        longitude: number;
        altitude: number;
        direction: number;
        speed_horizontal: number;
        speed_vertical: number;
        is_ground: boolean;
    };
}

export interface BackupSelectionOptions {
  flights?: boolean;
  roadTrips?: boolean;
  visited?: boolean;
  settings?: boolean;
  users?: boolean;
  calendar?: boolean;
}

export interface RestoreOptions {
  mode?: 'merge' | 'replace';
  selectedCategories?: {
    flights?: boolean;
    roadTrips?: boolean;
    visited?: boolean;
    settings?: boolean;
    users?: boolean;
    calendar?: boolean;
  };
  currentUserId?: string;
  currentUserEmail?: string;
  currentUser?: any;
}
