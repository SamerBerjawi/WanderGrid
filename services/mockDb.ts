
import { User, Trip, PublicHoliday, EntitlementType, SavedConfig, WorkspaceSettings, CustomEvent } from '../types';
import { getCoordinates } from './geocoding';

const GEO_CACHE_KEY = 'wandergrid_geo_cache_v2';

const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  orgName: 'WanderGrid Workspace',
  currency: 'USD',
  dateFormat: 'MM/DD/YYYY',
  autoSync: false,
  theme: 'dark',
  workingDays: [1, 2, 3, 4, 5],
  aviationStackApiKey: '',
  brandfetchApiKey: ''
};

export interface ImportState {
    status: string;
    progress: number;
    isActive: boolean;
}

// --- API Service with LocalStorage Fallback ---
class DataService {
  private _importState: ImportState = { status: '', progress: 0, isActive: false };
  private _importListeners: ((state: ImportState) => void)[] = [];
  private _useApi: boolean = true; 

  constructor() {}

  // --- Auth ---
  async login(email: string, pass: string): Promise<User | null> {
    const users = await this.getUsers();
    const user = users.find(u => u.email === email && u.password === pass);
    return user || null;
  }

  async register(name: string, email: string, pass: string): Promise<User> {
    const users = await this.getUsers();
    const exists = users.find(u => u.email === email);
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

  // --- Import State Management ---
  public getImportState(): ImportState {
      return { ...this._importState };
  }

  public subscribeToImport(listener: (state: ImportState) => void): () => void {
      this._importListeners.push(listener);
      listener(this._importState); 
      return () => {
          this._importListeners = this._importListeners.filter(l => l !== listener);
      };
  }

  private updateImportState(status: string, progress: number, isActive: boolean) {
      this._importState = { status, progress, isActive };
      this._importListeners.forEach(listener => listener(this._importState));
  }

  // --- Generic Fetch with Fallback ---
  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
      if (!this._useApi) {
          return this.localFetch<T>(endpoint, options);
      }

      try {
          const res = await fetch(`/api${endpoint}`, {
              headers: { 'Content-Type': 'application/json' },
              ...options
          });
          
          if (!res.ok) {
              if (res.status === 404) throw new Error("API Route Not Found");
              throw new Error(`API Error: ${res.statusText}`);
          }
          return await res.json();
      } catch (e) {
          console.warn(`Backend unavailable (${endpoint}). Switching to LocalStorage mode.`);
          this._useApi = false; 
          return this.localFetch<T>(endpoint, options);
      }
  }

  // --- LocalStorage Implementation ---
  private async localFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
      const method = options?.method || 'GET';
      const body = options?.body ? JSON.parse(options.body as string) : null;
      const key = (k: string) => `wandergrid_${k}`;
      
      await new Promise(r => setTimeout(r, 20)); // Reduced latency

      // 1. Settings
      if (endpoint === '/settings') {
          if (method === 'GET') {
              const s = localStorage.getItem(key('settings'));
              return (s ? JSON.parse(s) : {}) as T;
          }
          if (method === 'PUT') {
              localStorage.setItem(key('settings'), JSON.stringify(body));
              return body as T;
          }
      }

      // 2. Collections
      const collections = [
          { route: '/users', storage: 'users' },
          { route: '/trips', storage: 'trips' },
          { route: '/events', storage: 'events' },
          { route: '/entitlements', storage: 'entitlements' },
          { route: '/configs', storage: 'configs' }
      ];

      for (const col of collections) {
          if (endpoint === col.route) {
              const list = JSON.parse(localStorage.getItem(key(col.storage)) || '[]');
              if (method === 'GET') {
                  return list as T;
              }
              if (method === 'POST') {
                  list.push(body);
                  localStorage.setItem(key(col.storage), JSON.stringify(list));
                  return body as T;
              }
          }
          if (endpoint.startsWith(`${col.route}/`)) {
              const id = endpoint.split('/')[2];
              const list = JSON.parse(localStorage.getItem(key(col.storage)) || '[]');
              
              if (method === 'PUT') {
                  const idx = list.findIndex((i: any) => i.id === id);
                  if (idx >= 0) list[idx] = body;
                  else list.push(body); 
                  localStorage.setItem(key(col.storage), JSON.stringify(list));
                  return body as T;
              }
              
              if (method === 'DELETE') {
                  const newList = list.filter((i: any) => i.id !== id);
                  localStorage.setItem(key(col.storage), JSON.stringify(newList));
                  return { success: true } as unknown as T;
              }
          }
      }

      // 3. Backup/Restore
      if (endpoint === '/backup') {
          const backup: any = { workspaceSettings: {} };
          collections.forEach(c => {
              backup[c.storage] = JSON.parse(localStorage.getItem(key(c.storage)) || '[]');
          });
          const s = localStorage.getItem(key('settings'));
          if (s) backup.workspaceSettings = JSON.parse(s);
          return backup as T;
      }

      if (endpoint === '/restore') {
          const data = body;
          collections.forEach(c => {
              if (data[c.storage]) localStorage.setItem(key(c.storage), JSON.stringify(data[c.storage]));
          });
          if (data.workspaceSettings) localStorage.setItem(key('settings'), JSON.stringify(data.workspaceSettings));
          return { success: true } as unknown as T;
      }

      throw new Error(`Local Mock: Route not found ${endpoint}`);
  }

  // --- Users ---
  async getUsers(): Promise<User[]> {
    return this.fetch<User[]>('/users');
  }

  async updateUser(user: User): Promise<void> {
    await this.fetch(`/users/${user.id}`, { method: 'PUT', body: JSON.stringify(user) });
  }
  
  async addUser(user: User): Promise<void> {
    await this.fetch('/users', { method: 'POST', body: JSON.stringify(user) });
  }
  
  async deleteUser(id: string): Promise<void> {
    await this.fetch(`/users/${id}`, { method: 'DELETE' });
  }

  // --- Trips (Optimized) ---
  
  private async processGeocoding(trip: Trip): Promise<Trip> {
      const updatedTrip = { ...trip };
      
      // Use the cached getCoordinates which handles local storage internally
      // 1. Trip Main Location
      if (updatedTrip.location && !updatedTrip.coordinates) {
          const coords = await getCoordinates(updatedTrip.location);
          if (coords) updatedTrip.coordinates = coords;
      }

      // 2. Transports
      if (updatedTrip.transports) {
          const updatedTransports = await Promise.all(updatedTrip.transports.map(async (t) => {
              const u = { ...t };
              if (u.origin && (!u.originLat || !u.originLng)) {
                  const c = await getCoordinates(u.origin);
                  if (c) { u.originLat = c.lat; u.originLng = c.lng; }
              }
              if (u.destination && (!u.destLat || !u.destLng)) {
                  const c = await getCoordinates(u.destination);
                  if (c) { u.destLat = c.lat; u.destLng = c.lng; }
              }
              return u;
          }));
          updatedTrip.transports = updatedTransports;
      }

      return updatedTrip;
  }

  async getTrips(): Promise<Trip[]> {
    return this.fetch<Trip[]>('/trips');
  }

  async addTrip(trip: Trip): Promise<Trip> {
    const intelligentTrip = await this.processGeocoding(trip);
    return this.fetch<Trip>('/trips', { method: 'POST', body: JSON.stringify(intelligentTrip) });
  }

  async addTrips(newTrips: Trip[]): Promise<void> {
    if (this._importState.isActive) return;

    const total = newTrips.length;
    this.updateImportState(`Analyzing ${total} trips...`, 0, true);

    const existingTrips = await this.getTrips();
    const getTripSignature = (trip: Trip) => {
        if (trip.transports && trip.transports.length > 0) {
            return trip.transports.map(t => `${t.mode}|${t.provider}|${t.identifier}|${t.departureDate}`).join('||');
        }
        return `${trip.name}|${trip.startDate}|${trip.endDate}`;
    };

    const existingSignatures = new Set(existingTrips.map(t => getTripSignature(t)));
    let addedCount = 0;

    for (let i = 0; i < total; i++) {
        const trip = newTrips[i];
        const sig = getTripSignature(trip);
        const percent = Math.round(((i + 1) / total) * 100);
        
        if (existingSignatures.has(sig)) {
            this.updateImportState(`Skipping duplicate: ${trip.name}`, percent, true);
            continue;
        }

        this.updateImportState(`Importing ${i + 1}/${total}: ${trip.name}`, percent, true);

        try {
            // Processing sequentially to avoid overwhelming the API if cache misses
            const intelligentTrip = await this.processGeocoding(trip);
            await this.addTrip(intelligentTrip);
            existingSignatures.add(sig); 
            addedCount++;
        } catch (e) {
            console.error(`Import error for ${trip.name}`, e);
            await this.addTrip(trip); 
            addedCount++;
        }
    }
    
    this.updateImportState(`Successfully imported ${addedCount} trips.`, 100, false);
    setTimeout(() => {
        if (!this._importState.isActive) {
            this.updateImportState('', 0, false);
        }
    }, 3000);
  }

  async updateTrip(trip: Trip): Promise<Trip> {
    const intelligentTrip = await this.processGeocoding(trip);
    return this.fetch<Trip>(`/trips/${trip.id}`, { method: 'PUT', body: JSON.stringify(intelligentTrip) });
  }

  async deleteTrip(id: string): Promise<void> {
    await this.fetch(`/trips/${id}`, { method: 'DELETE' });
  }

  // --- Events ---
  async getCustomEvents(): Promise<CustomEvent[]> {
    return this.fetch<CustomEvent[]>('/events');
  }

  async addCustomEvent(event: CustomEvent): Promise<void> {
    await this.fetch('/events', { method: 'POST', body: JSON.stringify(event) });
  }

  async deleteCustomEvent(id: string): Promise<void> {
    await this.fetch(`/events/${id}`, { method: 'DELETE' });
  }

  // --- Public Holidays ---
  async getPublicHolidays(countryCode: string): Promise<PublicHoliday[]> {
    const configs = await this.getSavedConfigs();
    const configHolidays = configs
        .filter(c => c.countryCode === countryCode)
        .flatMap(c => c.holidays);
    return configHolidays;
  }

  // --- Entitlements ---
  async getEntitlementTypes(): Promise<EntitlementType[]> {
    return this.fetch<EntitlementType[]>('/entitlements');
  }

  async saveEntitlementType(entitlement: EntitlementType): Promise<void> {
    await this.fetch(`/entitlements/${entitlement.id}`, { method: 'PUT', body: JSON.stringify(entitlement) });
  }

  async deleteEntitlementType(id: string): Promise<void> {
    await this.fetch(`/entitlements/${id}`, { method: 'DELETE' });
  }

  // --- Configs ---
  async getSavedConfigs(): Promise<SavedConfig[]> {
      return this.fetch<SavedConfig[]>('/configs');
  }

  async saveConfig(config: SavedConfig): Promise<void> {
      await this.fetch(`/configs/${config.id}`, { method: 'PUT', body: JSON.stringify(config) });
  }

  async deleteConfig(id: string): Promise<void> {
      await this.fetch(`/configs/${id}`, { method: 'DELETE' });
  }

  // --- Settings ---
  async getWorkspaceSettings(): Promise<WorkspaceSettings> {
    const settings = await this.fetch<WorkspaceSettings>('/settings');
    return { ...DEFAULT_WORKSPACE_SETTINGS, ...settings };
  }

  async updateWorkspaceSettings(settings: WorkspaceSettings): Promise<void> {
    await this.fetch('/settings', { method: 'PUT', body: JSON.stringify(settings) });
  }

  // --- Export/Import (Includes Geocache) ---
  async exportFullState(): Promise<string> {
      // 1. Fetch persistent cache from LocalStorage
      let geoCache: any[] = [];
      try {
          const storedGeo = localStorage.getItem(GEO_CACHE_KEY);
          if (storedGeo) geoCache = JSON.parse(storedGeo);
      } catch (e) {}

      // 2. Get DB State
      const dbState = await this.fetch<any>('/backup');

      const state = {
          version: '3.7',
          timestamp: new Date().toISOString(),
          ...dbState,
          caches: {
              geo: geoCache
          }
      };
      return JSON.stringify(state, null, 2);
  }

  async importFullState(jsonString: string): Promise<void> {
      try {
          const cleanString = jsonString.trim().replace(/^\uFEFF/, '');
          if (!cleanString) throw new Error("File is empty");

          const state = JSON.parse(cleanString);
          
          if (!state || typeof state !== 'object') {
             throw new Error("Invalid backup file format");
          }

          // 1. Restore DB
          await this.fetch('/restore', { method: 'POST', body: JSON.stringify(state) });

          // 2. Restore Cache locally
          if (state.caches && state.caches.geo && Array.isArray(state.caches.geo)) {
              try { 
                  // Merge with existing to avoid data loss on partial restore
                  const existing = JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || '[]');
                  const combined = new Map([...existing, ...state.caches.geo]); // New overrides old if dupes
                  localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(Array.from(combined.entries()))); 
              } catch (e) {
                  // Fallback overwrite if merge fails
                  localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(state.caches.geo));
              }
          }
          
          return Promise.resolve();
      } catch (e) {
          console.error("Import failed details:", e);
          const msg = e instanceof Error ? e.message : "Unknown error during parsing";
          return Promise.reject(new Error(msg));
      }
  }
}

export const dataService = new DataService();
