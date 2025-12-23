
import { User, Trip, PublicHoliday, EntitlementType, SavedConfig, EntitlementRule, WorkspaceSettings, CustomEvent, Transport } from '../types';

const STORAGE_KEY = 'wandergrid_app_data';

// --- Default Data (Clean Slate) ---
const DEFAULT_USERS: User[] = [
  { 
    id: '1', 
    name: 'Admin User', 
    email: 'admin@wandergrid.app',
    password: 'password', // Default mock password
    role: 'Admin', 
    leaveBalance: 0, 
    takenLeave: 0, 
    allowance: 0, 
    lieuBalance: 0, 
    holidayConfigIds: [],
    policies: [],
    activeYears: [new Date().getFullYear()]
  }
];

const DEFAULT_TRIPS: Trip[] = [];
const DEFAULT_CUSTOM_EVENTS: CustomEvent[] = [];

// Entitlements are now just Categories (Definitions)
const DEFAULT_ENTITLEMENTS: EntitlementType[] = [
  { 
    id: 'e1', 
    name: 'Annual Holiday', 
    category: 'Annual', 
    color: 'blue',
    accrual: { period: 'yearly', amount: 20 },
    carryOver: { enabled: true, maxDays: 5, expiryType: 'months', expiryValue: 3 }
  },
  { 
    id: 'e2', 
    name: 'Days in Lieu', 
    category: 'Lieu', 
    color: 'green',
    accrual: { period: 'lump_sum', amount: 0 },
    carryOver: { enabled: false, maxDays: 0, expiryType: 'none' }
  },
  { 
    id: 'e3', 
    name: 'Seniority Days', 
    category: 'Seniority', 
    color: 'purple',
    accrual: { period: 'yearly', amount: 1 },
    carryOver: { enabled: false, maxDays: 0, expiryType: 'none' }
  },
  { 
    id: 'e4', 
    name: 'Sick Leave', 
    category: 'Sick', 
    isUnlimited: true, 
    color: 'amber',
    accrual: { period: 'lump_sum', amount: 0 },
    carryOver: { enabled: false, maxDays: 0, expiryType: 'none' }
  },
];

const DEFAULT_SAVED_CONFIGS: SavedConfig[] = [];

const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  orgName: 'WanderGrid Workspace',
  currency: 'USD',
  dateFormat: 'MM/DD/YYYY',
  autoSync: false,
  theme: 'dark', // Changed default to dark
  workingDays: [1, 2, 3, 4, 5],
  aviationStackApiKey: '',
  brandfetchApiKey: ''
};

// --- State Management ---
class DataService {
  private users: User[] = [];
  private trips: Trip[] = [];
  private customEvents: CustomEvent[] = [];
  private entitlements: EntitlementType[] = [];
  private savedConfigs: SavedConfig[] = [];
  private workspaceSettings: WorkspaceSettings = DEFAULT_WORKSPACE_SETTINGS;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        this.users = Array.isArray(data.users) ? data.users : DEFAULT_USERS;
        
        // Migration logic for trips
        this.trips = (Array.isArray(data.trips) ? data.trips : DEFAULT_TRIPS).map((t: any) => {
            // Migrate legacy flights to transports
            let transports: Transport[] = t.transports || [];
            if (!transports.length && t.flights && t.flights.length > 0) {
                transports = t.flights.map((f: any) => ({
                    ...f,
                    mode: 'Flight',
                    provider: f.airline || '',
                    identifier: f.flightNumber || '',
                }));
            }

            return {
                ...t,
                transports: transports,
                accommodations: t.accommodations || [],
                activities: t.activities || [],
                locations: t.locations || [] // Initialize locations
            };
        });

        this.customEvents = Array.isArray(data.customEvents) ? data.customEvents : DEFAULT_CUSTOM_EVENTS;
        this.entitlements = Array.isArray(data.entitlements) ? data.entitlements : DEFAULT_ENTITLEMENTS;
        this.savedConfigs = Array.isArray(data.savedConfigs) ? data.savedConfigs : DEFAULT_SAVED_CONFIGS;
        
        // Robust merge for settings
        this.workspaceSettings = { ...DEFAULT_WORKSPACE_SETTINGS, ...(data.workspaceSettings || {}) };

        // Ensure activeYears exists on users loaded from old backups
        this.users = this.users.map(u => ({
            ...u,
            activeYears: u.activeYears || [new Date().getFullYear()]
        }));

      } else {
        this.resetToDefaults();
      }
    } catch (e) {
      console.error("Failed to load app data from storage", e);
      this.resetToDefaults();
    }
  }

  private saveToStorage() {
    try {
      const data = {
        users: this.users,
        trips: this.trips,
        customEvents: this.customEvents,
        entitlements: this.entitlements,
        savedConfigs: this.savedConfigs,
        workspaceSettings: this.workspaceSettings,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error("Failed to save app data to storage", e);
      throw new Error("Failed to save data to local storage. Quota may be exceeded.");
    }
  }

  private resetToDefaults() {
    this.users = [...DEFAULT_USERS];
    this.trips = [...DEFAULT_TRIPS];
    this.customEvents = [...DEFAULT_CUSTOM_EVENTS];
    this.entitlements = [...DEFAULT_ENTITLEMENTS];
    this.savedConfigs = [...DEFAULT_SAVED_CONFIGS];
    this.workspaceSettings = { ...DEFAULT_WORKSPACE_SETTINGS };
    this.saveToStorage();
  }

  // --- Auth ---
  async login(email: string, pass: string): Promise<User | null> {
    // Check against users. If password matches (simple check for mock)
    // For default admin, password is 'password'.
    const user = this.users.find(u => u.email === email && u.password === pass);
    return Promise.resolve(user || null);
  }

  async register(name: string, email: string, pass: string): Promise<User> {
    const exists = this.users.find(u => u.email === email);
    if (exists) throw new Error("User already exists");

    const newUser: User = {
        id: Math.random().toString(36).substr(2, 9),
        name,
        email,
        password: pass,
        role: 'Partner',
        leaveBalance: 0,
        takenLeave: 0,
        allowance: 0,
        lieuBalance: 0,
        activeYears: [new Date().getFullYear()],
        policies: [],
        holidayConfigIds: []
    };
    await this.addUser(newUser);
    return newUser;
  }

  // --- Users ---
  async getUsers(): Promise<User[]> {
    return Promise.resolve([...this.users]);
  }

  async updateUser(user: User): Promise<void> {
    const index = this.users.findIndex(u => u.id === user.id);
    if (index !== -1) {
      this.users[index] = { ...user };
      this.saveToStorage();
    }
    return Promise.resolve();
  }
  
  async addUser(user: User): Promise<void> {
    this.users.push({ ...user });
    this.saveToStorage();
    return Promise.resolve();
  }
  
  async deleteUser(id: string): Promise<void> {
    this.users = this.users.filter(u => u.id !== id);
    this.trips = this.trips.map(trip => ({
        ...trip,
        participants: trip.participants.filter(pId => pId !== id)
    })).filter(trip => trip.participants.length > 0);
    this.saveToStorage();
    return Promise.resolve();
  }

  // --- Trips ---
  async getTrips(): Promise<Trip[]> {
    return Promise.resolve([...this.trips]);
  }

  async addTrip(trip: Trip): Promise<void> {
    this.trips.push({ ...trip });
    this.saveToStorage();
    return Promise.resolve();
  }

  async updateTrip(trip: Trip): Promise<void> {
    const index = this.trips.findIndex(t => t.id === trip.id);
    if (index !== -1) {
        this.trips[index] = { ...trip };
        this.saveToStorage();
    }
    return Promise.resolve();
  }

  async deleteTrip(id: string): Promise<void> {
    this.trips = this.trips.filter(t => t.id !== id);
    this.saveToStorage();
    return Promise.resolve();
  }

  // --- Events ---
  async getCustomEvents(): Promise<CustomEvent[]> {
    return Promise.resolve([...this.customEvents]);
  }

  async addCustomEvent(event: CustomEvent): Promise<void> {
    this.customEvents.push({ ...event });
    this.saveToStorage();
    return Promise.resolve();
  }

  async deleteCustomEvent(id: string): Promise<void> {
    this.customEvents = this.customEvents.filter(e => e.id !== id);
    this.saveToStorage();
    return Promise.resolve();
  }

  // --- Public Holidays ---
  async getPublicHolidays(countryCode: string): Promise<PublicHoliday[]> {
    const configHolidays = this.savedConfigs
        .filter(c => c.countryCode === countryCode)
        .flatMap(c => c.holidays);
    return Promise.resolve(configHolidays);
  }

  // --- Entitlements ---
  async getEntitlementTypes(): Promise<EntitlementType[]> {
    return Promise.resolve([...this.entitlements]);
  }

  async saveEntitlementType(entitlement: EntitlementType): Promise<void> {
    const index = this.entitlements.findIndex(e => e.id === entitlement.id);
    if (index >= 0) {
        this.entitlements[index] = { ...entitlement };
    } else {
        this.entitlements.push({ ...entitlement });
    }
    this.saveToStorage();
    return Promise.resolve();
  }

  async deleteEntitlementType(id: string): Promise<void> {
    this.entitlements = this.entitlements.filter(e => e.id !== id);
    this.users = this.users.map(user => ({
        ...user,
        policies: (user.policies || []).filter(p => p.entitlementId !== id)
    }));
    this.trips = this.trips.map(trip => {
        const updatedAllocations = (trip.allocations || []).filter(a => a.entitlementId !== id);
        return {
            ...trip,
            entitlementId: trip.entitlementId === id ? undefined : trip.entitlementId,
            allocations: updatedAllocations.length > 0 ? updatedAllocations : undefined
        };
    });
    this.saveToStorage();
    return Promise.resolve();
  }

  // --- Configs ---
  async getSavedConfigs(): Promise<SavedConfig[]> {
      return Promise.resolve([...this.savedConfigs]);
  }

  async saveConfig(config: SavedConfig): Promise<void> {
      const index = this.savedConfigs.findIndex(c => c.id === config.id);
      if (index >= 0) {
          this.savedConfigs[index] = { ...config };
      } else {
          this.savedConfigs.push({ ...config });
      }
      this.saveToStorage();
      return Promise.resolve();
  }

  async deleteConfig(id: string): Promise<void> {
      this.savedConfigs = this.savedConfigs.filter(c => c.id !== id);
      this.saveToStorage();
      return Promise.resolve();
  }

  // --- Settings ---
  async getWorkspaceSettings(): Promise<WorkspaceSettings> {
    return Promise.resolve({ ...this.workspaceSettings });
  }

  async updateWorkspaceSettings(settings: WorkspaceSettings): Promise<void> {
    this.workspaceSettings = { ...settings };
    this.saveToStorage();
    return Promise.resolve();
  }

  // --- Export/Import ---
  async exportFullState(): Promise<string> {
      const state = {
          version: '3.2', // Updated schema version
          timestamp: new Date().toISOString(),
          users: this.users,
          trips: this.trips,
          customEvents: this.customEvents,
          entitlements: this.entitlements,
          savedConfigs: this.savedConfigs,
          workspaceSettings: this.workspaceSettings 
      };
      return JSON.stringify(state, null, 2);
  }

  async importFullState(jsonString: string): Promise<void> {
      try {
          const cleanString = jsonString.trim().replace(/^\uFEFF/, '');
          if (!cleanString) throw new Error("File is empty");

          const state = JSON.parse(cleanString);
          
          if (!state || typeof state !== 'object') {
             throw new Error("Invalid backup file format: Root must be an object");
          }

          this.users = (Array.isArray(state.users) ? state.users : []).map((u: any) => ({
            ...u,
            activeYears: u.activeYears || [new Date().getFullYear()], 
            policies: u.policies || []
          }));

          this.trips = (Array.isArray(state.trips) ? state.trips : []).map((t: any) => ({
              ...t,
              transports: t.transports || t.flights?.map((f:any) => ({...f, mode: 'Flight', provider: f.airline, identifier: f.flightNumber})) || [],
              accommodations: t.accommodations || [], 
              activities: t.activities || [],
              locations: t.locations || []
          }));

          this.customEvents = Array.isArray(state.customEvents) ? state.customEvents : [];
          this.entitlements = Array.isArray(state.entitlements) ? state.entitlements : [];
          this.savedConfigs = Array.isArray(state.savedConfigs) ? state.savedConfigs : [];
          
          this.workspaceSettings = { ...DEFAULT_WORKSPACE_SETTINGS, ...(state.workspaceSettings || {}) };

          this.saveToStorage();
          
          return Promise.resolve();
      } catch (e) {
          console.error("Import failed details:", e);
          const msg = e instanceof Error ? e.message : "Unknown error during parsing";
          return Promise.reject(new Error(msg));
      }
  }
}

export const dataService = new DataService();
