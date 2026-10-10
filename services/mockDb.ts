
import { User, Trip, PublicHoliday, EntitlementType, SavedConfig, WorkspaceSettings, CustomEvent as TripCustomEvent, PackingItem, Carrier, BackupSelectionOptions, RestoreOptions } from '../types';
import { getCoordinates } from './geocoding';

const GEO_CACHE_KEY = 'wandergrid_geo_cache_v2';

const DEFAULT_MASTER_LIST: PackingItem[] = [
    { id: 'm1', text: 'Passport / ID', category: 'Documents', isChecked: false },
    { id: 'm2', text: 'Boarding Passes', category: 'Documents', isChecked: false },
    { id: 'm3', text: 'Wallet & Cash', category: 'Misc', isChecked: false },
    { id: 'm4', text: 'Phone Charger', category: 'Electronics', isChecked: false },
    { id: 'm5', text: 'Power Bank', category: 'Electronics', isChecked: false },
    { id: 'm6', text: 'Travel Adapter', category: 'Electronics', isChecked: false },
    { id: 'm7', text: 'Headphones', category: 'Electronics', isChecked: false },
    { id: 'm8', text: 'Toothbrush & Paste', category: 'Toiletries', isChecked: false },
    { id: 'm9', text: 'Deodorant', category: 'Toiletries', isChecked: false },
    { id: 'm10', text: 'Sunscreen', category: 'Health', isChecked: false },
    { id: 'm11', text: 'Medication', category: 'Health', isChecked: false },
    { id: 'm12', text: 'Underwear', category: 'Clothing', isChecked: false },
    { id: 'm13', text: 'Socks', category: 'Clothing', isChecked: false },
    { id: 'm14', text: 'T-Shirts', category: 'Clothing', isChecked: false },
    { id: 'm15', text: 'Pajamas', category: 'Clothing', isChecked: false },
    { id: 'm16', text: 'Jacket / Hoodie', category: 'Clothing', isChecked: false },
    { id: 'm17', text: 'Sunglasses', category: 'Misc', isChecked: false },
];

const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  orgName: 'WanderGrid Workspace',
  currency: 'USD',
  dateFormat: 'ddd D MMM, YYYY',
  autoSync: false,
  theme: 'dark',
  workingDays: [1, 2, 3, 4, 5],
  aviationStackApiKey: '',
  aeroDataBoxApiKey: '',
  aeroDataBoxEndpoint: 'rapidapi',
  openAipApiKey: '',
  brandfetchApiKey: '',
  googleGeminiApiKey: '',
  cartoApiKey: '',
  masterPackingList: DEFAULT_MASTER_LIST,
  carriers: [],
  defaultTravelClass: 'Economy',
  defaultStartingAirport: '',
  defaultBasemapLight: 'liberty',
  defaultBasemapDark: 'citylights'
};

export interface ImportState {
    status: string;
    progress: number;
    isActive: boolean;
}

// --- Resilient Client Storage Helper ---
export const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch (e) {
      console.warn(`[STORAGE] Failed to read ${key}:`, e);
      return null;
    }
  },
  setItem: (key: string, value: string): boolean => {
    try {
      if (typeof localStorage === 'undefined') return false;
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      console.warn(`[STORAGE] Failed to write ${key} (possible quota exceeded):`, e);
      try {
        // Evict every regenerable cache (geo, routing, dashboard) — never primary data collections
        const REGENERABLE = /^wandergrid_(dashboard_cache|geo_cache|overland_routes|multimodal_routes|coord)/;
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k !== key && REGENERABLE.test(k)) localStorage.removeItem(k);
        }
        localStorage.setItem(key, value);
        return true;
      } catch (retryErr) {
        console.error(`[STORAGE] Critical storage quota failure for ${key}:`, retryErr);
        return false;
      }
    }
  },
  removeItem: (key: string): void => {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch (e) {}
  }
};

// --- In-Memory Document Cache with Debounced Disk Sync (Performance Optimization) ---
const memoryCache: Record<string, any> = {};
const pendingWrites: Map<string, any> = new Map();
let writeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function flushPendingStorageWrites() {
  if (pendingWrites.size === 0) return;
  pendingWrites.forEach((value, storageKey) => {
    try {
      safeStorage.setItem(storageKey, JSON.stringify(value));
    } catch (e) {
      console.warn(`[STORAGE] Cache flush failure for ${storageKey}:`, e);
    }
  });
  pendingWrites.clear();
}

export function clearMemoryCache() {
  if (writeDebounceTimer) {
    clearTimeout(writeDebounceTimer);
    writeDebounceTimer = null;
  }
  pendingWrites.clear();
  Object.keys(memoryCache).forEach(k => delete memoryCache[k]);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPendingStorageWrites);
  window.addEventListener('pagehide', flushPendingStorageWrites);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPendingStorageWrites();
    }
  });
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith('wandergrid_')) {
      delete memoryCache[e.key];
      try {
        window.dispatchEvent(new CustomEvent('wandergrid_db_updated', { detail: { key: e.key } }));
      } catch (err) {}
    }
  });
}

function getCachedStorage<T>(storageKey: string, defaultValue: T): T {
  if (storageKey in memoryCache) {
    const cached = memoryCache[storageKey];
    if (cached !== null && cached !== undefined) {
      return cached as T;
    }
  }
  const raw = safeStorage.getItem(storageKey);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed !== null && parsed !== undefined) {
        memoryCache[storageKey] = parsed;
        return parsed as T;
      }
    } catch (e) {
      console.warn(`[STORAGE] Parse error for ${storageKey}, resetting:`, e);
    }
  }
  memoryCache[storageKey] = defaultValue;
  return defaultValue;
}

function setCachedStorage<T>(storageKey: string, value: T, immediate = false) {
  memoryCache[storageKey] = value;
  pendingWrites.set(storageKey, value);

  if (immediate) {
    flushPendingStorageWrites();
    return;
  }

  if (writeDebounceTimer) {
    clearTimeout(writeDebounceTimer);
  }
  writeDebounceTimer = setTimeout(() => {
    flushPendingStorageWrites();
    writeDebounceTimer = null;
  }, 100);
}

// --- Browser Security Hashing helpers (Standard Web Crypto API) ---
export async function hashPasswordInBrowser(password: string, saltHex?: string): Promise<string> {
  const isSecureContextAvailable = typeof window !== 'undefined' && 
                                   window.crypto && 
                                   window.crypto.subtle && 
                                   typeof window.crypto.subtle.digest === 'function';

  if (!isSecureContextAvailable) {
    throw new Error("[SECURITY] Web Crypto subtle digest API is unavailable in this environment.");
  }

  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  
  let salt: Uint8Array;
  if (saltHex) {
    const hex = saltHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || [];
    salt = new Uint8Array(hex);
  } else {
    salt = window.crypto.getRandomValues(new Uint8Array(16));
  }
  
  const currentSaltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');

  const combined = new Uint8Array(salt.length + passwordBuffer.length);
  combined.set(salt);
  combined.set(passwordBuffer, salt.length);
  
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', combined);
  const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `${currentSaltHex}:${hashHex}`;
}

export async function verifyPasswordInBrowser(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash) return false;
  if (!storedHash.includes(':')) {
    // Backwards compatibility for plain text fallback
    return password === storedHash;
  }
  const [saltHex, originalHash] = storedHash.split(':');
  const newHashAndSalt = await hashPasswordInBrowser(password, saltHex);
  const [, newHash] = newHashAndSalt.split(':');
  return originalHash === newHash;
}

// --- Recursive Sensitive Credential Redaction for Backup Exports ---
// Redacts ONLY user authentication passwords, preserving all API keys, tokens, settings, and configs
export function removeSensitiveData(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(removeSensitiveData);
  }
  
  const cleaned: any = {};
  for (const [key, val] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'password') {
      continue;
    }
    cleaned[key] = removeSensitiveData(val);
  }
  return cleaned;
}

// Helpers for categorizing trips in backup and restore
export const isTripRoad = (t: any): boolean => {
  if (!t) return false;
  if (t.icon === '🚗') return true;
  if (t.locations && t.locations.length > 1) return true;
  const transports = t.transports || [];
  return transports.some((tr: any) => tr.mode && tr.mode !== 'Flight');
};

export const isTripAir = (t: any): boolean => {
  if (!t) return false;
  if (t.isBundleOnly || t.icon === '✈️') return true;
  const transports = t.transports || [];
  if (transports.length === 0) return true;
  return transports.some((tr: any) => !tr.mode || tr.mode === 'Flight');
};

class DataService {
  private _importState: ImportState = { status: '', progress: 0, isActive: false };
  private _importListeners: ((state: ImportState) => void)[] = [];
  private _useApi: boolean = true; 
  private _isSynced: boolean = false;

  constructor() {
      try {
          localStorage.removeItem('wandergrid_api_status');
      } catch (e) {}
  }

  async login(email: string, pass: string): Promise<User | null> {
    const isProd = import.meta.env.PROD;
    if (this._useApi || isProd) {
        try {
            const response = await this.fetch<any>('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password: pass })
            });
            if (response && response.token) {
                localStorage.setItem('wandergrid_session_token', response.token);
                return response.user;
            }
            return response;
        } catch (err: any) {
            if (err && err.status === 401) {
                return null;
            }
            if (isProd) {
                throw err;
            }
            console.warn("Server auth failed, falling back to local fallback in development:", err);
        }
    }
    const users = await this.localFetch<User[]>('/users');
    for (const u of users) {
        if (u.email === email && u.password) {
            const matches = await verifyPasswordInBrowser(pass, u.password);
            if (matches) {
                return u;
            }
        }
    }
    return null;
  }

  async register(name: string, email: string, pass: string, role: 'Partner' | 'Admin' = 'Partner'): Promise<User> {
    const cleanEmail = email.trim().toLowerCase();
    const isSetupAdmin = role === 'Admin';
    
    const isProd = import.meta.env.PROD;
    if (this._useApi || isProd) {
        try {
            const userToSend = {
                id: cleanEmail,
                name,
                email: cleanEmail,
                password: pass,
                role: role,
                leaveBalance: isSetupAdmin ? 30 : 25,
                takenLeave: 0,
                allowance: isSetupAdmin ? 30 : 25,
                lieuBalance: 0,
                activeYears: [new Date().getFullYear(), new Date().getFullYear() + 1, new Date().getFullYear() + 2],
                policies: [],
                holidayConfigIds: []
            };
            const response = await this.fetch<any>('/auth/register', {
                method: 'POST',
                body: JSON.stringify(userToSend)
            });
            if (response && response.token) {
                localStorage.setItem('wandergrid_session_token', response.token);
                return response.user;
            }
            return response;
        } catch (err) {
            if (isProd) {
                throw err;
            }
            console.warn("Server register failed, falling back to local registration in development:", err);
        }
    }

    const hashedPassword = await hashPasswordInBrowser(pass);
    const newUser: User = {
        id: cleanEmail,
        name,
        email: cleanEmail,
        password: hashedPassword,
        role: role,
        leaveBalance: isSetupAdmin ? 30 : 25,
        takenLeave: 0,
        allowance: isSetupAdmin ? 30 : 25,
        lieuBalance: 0,
        activeYears: [new Date().getFullYear(), new Date().getFullYear() + 1, new Date().getFullYear() + 2],
        policies: [],
        holidayConfigIds: []
    };

    const users = await this.localFetch<User[]>('/users');
    const exists = users.find(u => u.email?.toLowerCase().trim() === cleanEmail);
    if (exists) throw new Error("User already exists");

    users.push(newUser);
    localStorage.setItem(`wandergrid_users`, JSON.stringify(users));
    return newUser;
  }

  public getImportState(): ImportState {
      return { ...this._importState };
  }

  public isDatabaseMode(): boolean {
      return this._useApi;
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

  private async syncLocalDataToServer() {
      if (!this._useApi) return;
      
      const key = (k: string) => `wandergrid_${k}`;
      
      try {
          console.log('[Sync] Checking for local data to migrate to database...');
          
          // 1. Sync settings
          const localSettingsStr = localStorage.getItem(key('settings'));
          if (localSettingsStr) {
               const localSettings = JSON.parse(localSettingsStr);
               const remoteSettings = await this.getWorkspaceSettings();
               if (!remoteSettings.aviationStackApiKey && localSettings.aviationStackApiKey) {
                   await this.updateWorkspaceSettings({ ...remoteSettings, ...localSettings });
                   console.log('[Sync] Migrated workspace settings to server.');
               }
          }

          // 2. Collections to sync
          const collections = [
              { route: '/users', storage: 'users' },
              { route: '/trips', storage: 'trips' },
              { route: '/events', storage: 'events' },
              { route: '/entitlements', storage: 'entitlements' },
              { route: '/configs', storage: 'configs' },
              { route: '/flights', storage: 'flights' },
              { route: '/visited', storage: 'visited' }
          ];

          for (const col of collections) {
              const localItemsStr = localStorage.getItem(key(col.storage));
              if (localItemsStr) {
                  const localItems = JSON.parse(localItemsStr);
                  if (Array.isArray(localItems) && localItems.length > 0) {
                      console.log(`[Sync] Found ${localItems.length} local ${col.storage} items. Checking server...`);
                      const remoteItems = await this.fetch<any[]>(col.route);
                      const remoteIds = new Set(remoteItems.map(item => item.id));

                      let migratedCount = 0;
                      for (const item of localItems) {
                          if (item && item.id && !remoteIds.has(item.id)) {
                              await this.fetch(col.route, {
                                  method: 'POST',
                                  body: JSON.stringify(item)
                              });
                              migratedCount++;
                          }
                      }
                      
                      if (migratedCount > 0) {
                          console.log(`[Sync] Successfully migrated ${migratedCount} ${col.storage} to server database.`);
                      }
                  }
              }
          }
          console.log('[Sync] Local-to-server data migration completed.');
      } catch (err) {
          console.error('[Sync] Error migrating local-only data to database:', err);
      }
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
      const isProd = import.meta.env.PROD;
      
      if (isProd) {
          this._useApi = true;
      }

      if (!this._useApi) {
          return this.localFetch<T>(endpoint, options);
      }

      const maxRetries = 3;
      let attempt = 0;
      let delay = 1000; // Initial delay of 1 second

      while (true) {
          attempt++;
          try {
              // Generous timeout (10 seconds) to tolerate database query latencies or cold starts on Cloud Run
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 10000);

              const token = localStorage.getItem('wandergrid_session_token');
              const customHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
              if (token) {
                  customHeaders['Authorization'] = `Bearer ${token}`;
              }

              const res = await window.fetch(`/api${endpoint}`, {
                  signal: controller.signal,
                  ...options,
                  headers: {
                      ...customHeaders,
                      ...(options?.headers || {})
                  }
              });
              
              clearTimeout(timeoutId);
              
              if (!res.ok) {
                  if (res.status === 404) throw new Error("API Route Not Found");
                  if (res.status === 401 || res.status === 403) {
                      try {
                          window.dispatchEvent(new CustomEvent('wandergrid-unauthorized'));
                          window.dispatchEvent(new CustomEvent('wandergrid:unauthorized'));
                      } catch (evErr) {
                          console.warn("Could not dispatch unauthorized event:", evErr);
                      }
                      const errObj = new Error("Unauthorized");
                      (errObj as any).status = res.status;
                      throw errObj;
                  }
                  
                  // For 5xx server issues, retry unless we hit maxRetries
                  if (res.status >= 500 && attempt < maxRetries) {
                      console.warn(`Attempt ${attempt} failed with status ${res.status}. Retrying in ${delay}ms...`);
                      await new Promise(resolve => setTimeout(resolve, delay));
                      delay *= 2; // exponential backoff
                      continue;
                  }
                  
                  throw new Error(`API Error: ${res.statusText}`);
              }

              const contentType = res.headers.get('content-type') || '';
              if (contentType.includes('text/html')) {
                  throw new Error("API Route Not Found (HTML fallback)");
              }

              const result = await res.json();
              const isMutation = options?.method && ['POST', 'PUT', 'DELETE'].includes(options.method.toUpperCase());
              if (isMutation) {
                  try {
                      window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
                  } catch (evErr) {}
              }
              return result;
          } catch (e: any) {
              const isAbortError = e.name === 'AbortError';
              const isNetworkError = e instanceof TypeError || e.message === 'Failed to fetch';
              
              // Only retry on network errors, timeout aborts, or server 5xx errors
              if ((isAbortError || isNetworkError) && attempt < maxRetries) {
                  console.warn(`Attempt ${attempt} network/timeout failed. Retrying in ${delay}ms...`, e);
                  await new Promise(resolve => setTimeout(resolve, delay));
                  delay *= 2; // exponential backoff
                  continue;
              }
              
              console.warn(`Backend unavailable (${endpoint}).`, e);
              if (isProd) {
                  // In production, NEVER fall back to local storage. Throw the error so the user is aware of backend issues.
                  throw e;
              } else {
                  // In development, fallback to LocalStorage is still allowed
                  console.warn(`Fallback to LocalStorage active for development request: ${endpoint}`);
                  this._useApi = false;
                  return this.localFetch<T>(endpoint, options);
              }
          }
      }
  }

  private async localFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
      const method = options?.method || 'GET';
      const body = options?.body ? JSON.parse(options.body as string) : null;
      const key = (k: string) => `wandergrid_${k}`;
      
      if (endpoint === '/settings') {
          if (method === 'GET') {
              const s = getCachedStorage<any>(key('settings'), null);
              return (s ? { ...DEFAULT_WORKSPACE_SETTINGS, ...s } : { ...DEFAULT_WORKSPACE_SETTINGS }) as T;
          }
          if (method === 'PUT') {
              setCachedStorage(key('settings'), body, true);
              try { window.dispatchEvent(new CustomEvent('wandergrid_db_updated')); } catch (e) {}
              return body as T;
          }
      }

      const collections = [
          { route: '/users', storage: 'users' },
          { route: '/trips', storage: 'trips' },
          { route: '/events', storage: 'events' },
          { route: '/entitlements', storage: 'entitlements' },
          { route: '/configs', storage: 'configs' },
          { route: '/flights', storage: 'flights' },
          { route: '/visited', storage: 'visited' }
      ];

       for (const col of collections) {
          if (endpoint === col.route) {
              const list = getCachedStorage<any[]>(key(col.storage), []);
              if (method === 'GET') return list as T;
              if (method === 'POST') {
                  const updated = [...list, body];
                  setCachedStorage(key(col.storage), updated);
                  try { window.dispatchEvent(new CustomEvent('wandergrid_db_updated')); } catch (e) {}
                  return body as T;
              }
          }
          if (endpoint.startsWith(`${col.route}/`)) {
              const id = endpoint.split('/')[2];
              const list = getCachedStorage<any[]>(key(col.storage), []);
              if (method === 'PUT') {
                  const idx = list.findIndex((i: any) => i.id === id);
                  const updated = [...list];
                  if (idx >= 0) updated[idx] = body;
                  else updated.push(body); 
                  setCachedStorage(key(col.storage), updated);
                  try { window.dispatchEvent(new CustomEvent('wandergrid_db_updated')); } catch (e) {}
                  return body as T;
              }
              if (method === 'DELETE') {
                  const newList = list.filter((i: any) => i.id !== id);
                  setCachedStorage(key(col.storage), newList);
                  try { window.dispatchEvent(new CustomEvent('wandergrid_db_updated')); } catch (e) {}
                  return { success: true } as unknown as T;
              }
          }
      }

      if (endpoint === '/trips/bulk') {
          if (method === 'POST') {
              const list = getCachedStorage<any[]>(key('trips'), []);
              const updated = [...list];
              const payload = body as any[];
              for (const trip of payload) {
                  const idx = updated.findIndex((i: any) => i.id === trip.id);
                  if (idx >= 0) updated[idx] = trip;
                  else updated.push(trip);
              }
              setCachedStorage(key('trips'), updated);
              try { window.dispatchEvent(new CustomEvent('wandergrid_db_updated')); } catch (e) {}
              return { success: true, count: payload.length } as unknown as T;
          }
      }

      if (endpoint === '/flights/bulk') {
          if (method === 'POST') {
              const list = getCachedStorage<any[]>(key('flights'), []);
              const updated = [...list];
              const payload = body as any[];
              for (const flight of payload) {
                  const idx = updated.findIndex((i: any) => i.id === flight.id);
                  if (idx >= 0) updated[idx] = flight;
                  else updated.push(flight);
              }
              setCachedStorage(key('flights'), updated);
              try { window.dispatchEvent(new CustomEvent('wandergrid_db_updated')); } catch (e) {}
              return { success: true, count: payload.length } as unknown as T;
          }
      }

      if (endpoint === '/visited/bulk') {
          if (method === 'POST') {
              const list = getCachedStorage<any[]>(key('visited'), []);
              const updated = [...list];
              const payload = body as any[];
              for (const item of payload) {
                  const idx = updated.findIndex((i: any) => i.id === item.id);
                  if (idx >= 0) updated[idx] = item;
                  else updated.push(item);
              }
              setCachedStorage(key('visited'), updated);
              try { window.dispatchEvent(new CustomEvent('wandergrid_db_updated')); } catch (e) {}
              return { success: true, count: payload.length } as unknown as T;
          }
      }

      if (endpoint === '/backup') {
          const backup: any = { workspaceSettings: {} };
          collections.forEach(c => backup[c.storage] = getCachedStorage<any[]>(key(c.storage), []));
          const s = getCachedStorage<any>(key('settings'), DEFAULT_WORKSPACE_SETTINGS);
          backup.workspaceSettings = s || DEFAULT_WORKSPACE_SETTINGS;
          const cleanBackup = removeSensitiveData(backup);
          return cleanBackup as T;
      }

      if (endpoint === '/restore' && method === 'POST') {
          const rawBody = (body || {}) as any;
          const data = (rawBody.data && typeof rawBody.data === 'object') ? rawBody.data : rawBody;
          const restoreOptions = rawBody.restoreOptions || data.restoreOptions || {};
          const mode = restoreOptions.mode === 'merge' ? 'merge' : 'replace';
          const selected = restoreOptions.selectedCategories || {
              flights: true,
              roadTrips: true,
              visited: true,
              settings: true,
              users: true,
              calendar: true
          };

          const currentUserId = restoreOptions.currentUserId;
          const currentUserEmail = (restoreOptions.currentUserEmail || '').toLowerCase().trim();
          const sessionUserObj = restoreOptions.currentUser || null;

          // 1. Users
          if (selected.users !== false && data.users && Array.isArray(data.users)) {
              const keyName = key('users');
              const existingList = getCachedStorage<any[]>(keyName, []);
              const existingMap = new Map((Array.isArray(existingList) ? existingList : []).map((item: any) => [item.id, item]));
              
              let activeUserRecord: any = null;
              for (const u of existingList) {
                  if (u.id === currentUserId || (u.email && u.email.toLowerCase().trim() === currentUserEmail)) {
                      activeUserRecord = u;
                      break;
                  }
              }
              if (!activeUserRecord && sessionUserObj) {
                  activeUserRecord = sessionUserObj;
              }

              if (mode === 'replace') {
                  let sessionUserInserted = false;
                  const newList = data.users.map((item: any) => {
                      const existingUser: any = existingMap.get(item.id);
                      if (!item.password) {
                          item = { ...item, password: (existingUser && existingUser.password) ? existingUser.password : 'password' };
                      }
                      if (item.id === currentUserId || (item.email && item.email.toLowerCase().trim() === currentUserEmail)) {
                          sessionUserInserted = true;
                      }
                      return item;
                  });
                  const isDemoUser = (currentUserEmail === 'admin@wandergrid.app');
                  if (!sessionUserInserted && activeUserRecord && !isDemoUser) {
                      newList.push(activeUserRecord);
                  }
                  setCachedStorage(keyName, newList, true);

                  const primaryUser = newList.find((u: any) => (u.role || '').toLowerCase() === 'admin') || newList[0];
                  if (primaryUser) {
                      safeStorage.setItem('wandergrid_session_user', JSON.stringify(primaryUser));
                      safeStorage.removeItem('wandergrid_session_token');
                  }
              } else {
                  const mergedMap = new Map(existingMap);
                  for (const item of data.users) {
                      const existingUser: any = existingMap.get(item.id);
                      const merged = existingUser ? { ...existingUser, ...item } : item;
                      if (!merged.password) {
                          merged.password = (existingUser && existingUser.password) ? existingUser.password : 'password';
                      }
                      mergedMap.set(item.id, merged);
                  }
                  if (activeUserRecord && !mergedMap.has(activeUserRecord.id)) {
                      mergedMap.set(activeUserRecord.id, activeUserRecord);
                  }
                  setCachedStorage(keyName, Array.from(mergedMap.values()), true);
              }
          }

          // 2. Trips
          if ((selected.flights !== false || selected.roadTrips !== false) && data.trips && Array.isArray(data.trips)) {
              const keyName = key('trips');
              const existingTrips = getCachedStorage<any[]>(keyName, []);
              const existingTripsMap = new Map((Array.isArray(existingTrips) ? existingTrips : []).map((t: any) => [t.id, t]));

              const incomingTrips = data.trips.filter((t: any) => {
                  const road = isTripRoad(t);
                  const air = isTripAir(t);
                  if (selected.roadTrips && selected.flights) return true;
                  if (selected.roadTrips && road) return true;
                  if (selected.flights && air) return true;
                  return false;
              });

              if (mode === 'replace') {
                  const tripsToKeep = new Map<string, any>();
                  if (!selected.roadTrips) {
                      existingTrips.forEach((t: any) => { if (isTripRoad(t)) tripsToKeep.set(t.id, t); });
                  }
                  if (!selected.flights) {
                      existingTrips.forEach((t: any) => { if (isTripAir(t) && !isTripRoad(t)) tripsToKeep.set(t.id, t); });
                  }
                  incomingTrips.forEach((t: any) => tripsToKeep.set(t.id, t));
                  setCachedStorage(keyName, Array.from(tripsToKeep.values()), true);
              } else {
                  const mergedMap = new Map(existingTripsMap);
                  for (const t of incomingTrips) {
                      const existing = existingTripsMap.get(t.id);
                      mergedMap.set(t.id, existing ? { ...existing, ...t } : t);
                  }
                  setCachedStorage(keyName, Array.from(mergedMap.values()), true);
              }
          }

          // 3. Flights (Independent transports)
          if ((selected.flights !== false || selected.roadTrips !== false) && data.flights && Array.isArray(data.flights)) {
              const keyName = key('flights');
              const existingFlights = getCachedStorage<any[]>(keyName, []);
              const existingFlightsMap = new Map((Array.isArray(existingFlights) ? existingFlights : []).map((f: any) => [f.id, f]));

              const incomingFlights = data.flights.filter((f: any) => {
                  const isAir = !f.mode || f.mode === 'Flight';
                  if (selected.flights && isAir) return true;
                  if (selected.roadTrips && !isAir) return true;
                  return false;
              });

              if (mode === 'replace') {
                  const flightsToKeep = new Map<string, any>();
                  if (!selected.flights) {
                      existingFlights.forEach((f: any) => { if (!f.mode || f.mode === 'Flight') flightsToKeep.set(f.id, f); });
                  }
                  if (!selected.roadTrips) {
                      existingFlights.forEach((f: any) => { if (f.mode && f.mode !== 'Flight') flightsToKeep.set(f.id, f); });
                  }
                  incomingFlights.forEach((f: any) => flightsToKeep.set(f.id, f));
                  setCachedStorage(keyName, Array.from(flightsToKeep.values()), true);
              } else {
                  const mergedMap = new Map(existingFlightsMap);
                  for (const f of incomingFlights) {
                      const existing = existingFlightsMap.get(f.id);
                      mergedMap.set(f.id, existing ? { ...existing, ...f } : f);
                  }
                  setCachedStorage(keyName, Array.from(mergedMap.values()), true);
              }
          }

          // 4. Visited
          if (selected.visited !== false && data.visited && Array.isArray(data.visited)) {
              const keyName = key('visited');
              if (mode === 'replace') {
                  setCachedStorage(keyName, data.visited, true);
              } else {
                  const existingVisited = getCachedStorage<any[]>(keyName, []);
                  const map = new Map(existingVisited.map((v: any) => [v.id, v]));
                  data.visited.forEach((v: any) => map.set(v.id, v));
                  setCachedStorage(keyName, Array.from(map.values()), true);
              }
          }

          // 5. Calendar (events, entitlements, configs)
          if (selected.calendar !== false) {
              ['events', 'entitlements', 'configs'].forEach(col => {
                  if (data[col] && Array.isArray(data[col])) {
                      const keyName = key(col);
                      if (mode === 'replace') {
                          setCachedStorage(keyName, data[col], true);
                      } else {
                          const existing = getCachedStorage<any[]>(keyName, []);
                          const map = new Map(existing.map((e: any) => [e.id, e]));
                          data[col].forEach((e: any) => map.set(e.id, e));
                          setCachedStorage(keyName, Array.from(map.values()), true);
                      }
                  }
              });
          }

          // 6. Settings
          if (selected.settings !== false && data.workspaceSettings && typeof data.workspaceSettings === 'object') {
              const currentSettings = (getCachedStorage<any>(key('settings'), {}) || {}) as any;
              const mergedSettings = mode === 'merge'
                  ? { ...DEFAULT_WORKSPACE_SETTINGS, ...currentSettings, ...data.workspaceSettings }
                  : { ...DEFAULT_WORKSPACE_SETTINGS, ...data.workspaceSettings };
              const keysToCheck = ['aviationStackApiKey', 'aeroDataBoxApiKey', 'aeroDataBoxEndpoint', 'openAipApiKey', 'brandfetchApiKey', 'googleGeminiApiKey', 'cartoApiKey'];
              keysToCheck.forEach(k => {
                  if (!mergedSettings[k] && currentSettings && currentSettings[k]) {
                      mergedSettings[k] = currentSettings[k];
                  }
              });
              setCachedStorage(key('settings'), mergedSettings, true);
          }

          // Verify primary collections actually persisted — otherwise they vanish on reload
          for (const col of ['trips', 'flights', 'users']) {
              const expected = memoryCache[key(col)];
              if (Array.isArray(expected) && expected.length > 0) {
                  const raw = safeStorage.getItem(key(col));
                  let persistedCount = -1;
                  try { persistedCount = raw ? (JSON.parse(raw) as any[]).length : -1; } catch (e) {}
                  if (persistedCount !== expected.length) {
                      throw new Error(`Browser storage is full: restored ${col} could not be saved. Clear site data for localhost and retry.`);
                  }
              }
          }

          try { window.dispatchEvent(new CustomEvent('wandergrid_db_updated')); } catch (e) {}
          return { success: true, mode, selected } as unknown as T;
      }

      throw new Error(`Local Mock: Route not found ${endpoint}`);
  }

  async getUsers(): Promise<User[]> {
      return this.fetch<User[]>('/users');
  }

  async updateUser(user: User): Promise<void> {
      const userCopy = { ...user };
      try {
          const list = getCachedStorage<any[]>('wandergrid_users', []);
          const prev = list.find((u: any) => u.id === user.id);
          if (prev && userCopy.password) {
              if (userCopy.password !== prev.password) {
                  if (!userCopy.password.includes(':')) {
                      userCopy.password = await hashPasswordInBrowser(userCopy.password);
                  }
              }
          } else if (userCopy.password && !userCopy.password.includes(':')) {
              userCopy.password = await hashPasswordInBrowser(userCopy.password);
          }
      } catch (e) {}

      await this.fetch(`/users/${user.id}`, { method: 'PUT', body: JSON.stringify(userCopy) });
  }

  async addUser(user: User): Promise<void> {
      const userCopy = { ...user };
      if (userCopy.password && !userCopy.password.includes(':')) {
          userCopy.password = await hashPasswordInBrowser(userCopy.password);
      }
      await this.fetch('/users', { method: 'POST', body: JSON.stringify(userCopy) });
  }

  async deleteUser(id: string): Promise<void> {
      await this.fetch(`/users/${id}`, { method: 'DELETE' });
  }

  private async processGeocoding(trip: Trip): Promise<Trip> {
      const updatedTrip = { ...trip };
      if (updatedTrip.location) {
          // Ranked resolution wins (a picked suggestion resolves to its exact coordinates, typed text is ranked by
          // relevance/population/country); previously stored coordinates are only a fallback when nothing resolves.
          const coords = await getCoordinates(updatedTrip.location);
          if (coords) updatedTrip.coordinates = coords;
      }
      if (updatedTrip.locations && Array.isArray(updatedTrip.locations)) {
          updatedTrip.locations = await Promise.all(updatedTrip.locations.map(async (loc) => {
              if (loc.name) {
                  if (loc.coordinates?.lat && loc.coordinates?.lng && !isNaN(loc.coordinates.lat) && !isNaN(loc.coordinates.lng)) {
                      // Keep coordinates the user already confirmed for this stop
                      return loc;
                  }
                  const c = await getCoordinates(loc.name);
                  if (c) return { ...loc, coordinates: { lat: c.lat, lng: c.lng } };
              }
              return loc;
          }));
      }
      if (updatedTrip.transports) {
          const updatedTransports = await Promise.all(updatedTrip.transports.map(async (t) => {
              const u = { ...t };
              if (u.origin) {
                  const c = await getCoordinates(u.origin);
                  if (c) { u.originLat = c.lat; u.originLng = c.lng; }
              }
              if (u.destination) {
                  const c = await getCoordinates(u.destination);
                  if (c) { u.destLat = c.lat; u.destLng = c.lng; }
              }
              if (u.waypoints && u.waypoints.length > 0) {
                  const updatedWaypoints = await Promise.all(u.waypoints.map(async (wp) => {
                      if (wp.name) {
                          const c = await getCoordinates(wp.name);
                          if (c) return { ...wp, coordinates: { lat: c.lat, lng: c.lng } };
                      }
                      return wp;
                  }));
                  u.waypoints = updatedWaypoints;
              }
              return u;
          }));

          // Automatically detect itinerary types: 'One-Way' | 'Round Trip' | 'Multi-City'
          const flights = updatedTransports.filter(t => t.mode === 'Flight');
          if (flights.length > 0) {
              // Sort flights chronologically to look at itinerary flow
              const sortedFlights = [...flights].sort((a, b) => {
                  const da = new Date(`${a.departureDate}T${a.departureTime || '00:00'}`).getTime();
                  const db = new Date(`${b.departureDate}T${b.departureTime || '00:00'}`).getTime();
                  return da - db;
              });

              let itineraryType: 'One-Way' | 'Round Trip' | 'Multi-City' = 'One-Way';
              if (sortedFlights.length > 1) {
                  const firstOrigin = sortedFlights[0].origin.trim().toUpperCase();
                  const lastDest = sortedFlights[sortedFlights.length - 1].destination.trim().toUpperCase();
                  const returnsHome = lastDest === firstOrigin;

                  if (returnsHome) {
                      itineraryType = 'Round Trip';
                  } else {
                      itineraryType = 'Multi-City';
                  }
              }

              // Update flight type and ensure a single consistent itineraryId for all flights in this trip
              const customItineraryId = flights[0].itineraryId || `itinerary-${updatedTrip.id}`;
              updatedTransports.forEach(t => {
                  if (t.mode === 'Flight') {
                      t.type = itineraryType;
                      t.itineraryId = customItineraryId;
                  }
              });
          }

          updatedTrip.transports = updatedTransports;
      }
      if (updatedTrip.locations) {
          const updatedLocations = await Promise.all(updatedTrip.locations.map(async (l) => {
              if (l.name && !l.coordinates) {
                  const c = await getCoordinates(l.name);
                  if (c) return { ...l, coordinates: { lat: c.lat, lng: c.lng } };
              }
              return l;
          }));
          updatedTrip.locations = updatedLocations;
      }
      return updatedTrip;
  }

  async getTrips(): Promise<Trip[]> { 
    const allTrips = await this.fetch<Trip[]>('/trips'); 
    
    let loggedInUser: any = null;
    try {
      const stored = localStorage.getItem('wandergrid_session_user');
      if (stored) loggedInUser = JSON.parse(stored);
    } catch (e) {}

    const rawList = Array.isArray(allTrips) ? allTrips : [];
    const list = rawList.map(t => {
      let changed = false;
      let tripCoords = t.coordinates;
      const isMalmoTrip = (t.location && /malm[öo]/i.test(t.location)) || (t.name && /malm[öo]/i.test(t.name));
      if (isMalmoTrip && (!tripCoords || tripCoords.lat > 57 || isNaN(tripCoords.lat))) {
        tripCoords = { lat: 55.6059, lng: 13.0007 };
        changed = true;
      }
      let locs = t.locations;
      if (locs && Array.isArray(locs)) {
        locs = locs.map(l => {
          if (l.name && /malm[öo]/i.test(l.name) && (!l.coordinates || l.coordinates.lat > 57 || isNaN(l.coordinates.lat))) {
            changed = true;
            return { ...l, coordinates: { lat: 55.6059, lng: 13.0007 } };
          }
          return l;
        });
      }
      return changed ? { ...t, coordinates: tripCoords, locations: locs } : t;
    });

    if (!loggedInUser) {
      return list.filter(t => t.privacy === 'Public');
    }

    if (String(loggedInUser.role || '').toLowerCase() === 'admin') {
      return list;
    }

    // Match on id OR email (case-insensitive) — backups may key participants by either
    const userKeys = new Set(
      [loggedInUser.id, loggedInUser.email]
        .filter(Boolean)
        .map((v: any) => String(v).toLowerCase().trim())
    );

    return list.filter(t =>
      t.privacy === 'Public' ||
      (Array.isArray(t.participants) &&
        t.participants.some(p => userKeys.has(String(p).toLowerCase().trim())))
    );
  }

  async getTrip(tripId: string): Promise<Trip | undefined> {
    const trips = await this.getTrips();
    return trips.find(t => t.id === tripId);
  }

  async getTripById(tripId: string): Promise<Trip | undefined> {
    return this.getTrip(tripId);
  }

  async addTrip(trip: Trip): Promise<Trip> {
    const intelligentTrip = await this.processGeocoding(trip);
    
    let loggedInUser: any = null;
    try {
      const stored = localStorage.getItem('wandergrid_session_user');
      if (stored) loggedInUser = JSON.parse(stored);
    } catch (e) {}

    if (loggedInUser) {
      if (!intelligentTrip.participants) {
        intelligentTrip.participants = [];
      }
      if (!intelligentTrip.participants.includes(loggedInUser.id)) {
        intelligentTrip.participants.push(loggedInUser.id);
      }
    }

    if (!intelligentTrip.privacy) {
      intelligentTrip.privacy = 'Private'; // Default to maximum privacy
    }

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
    
    let loggedInUser: any = null;
    try {
      const stored = localStorage.getItem('wandergrid_session_user');
      if (stored) loggedInUser = JSON.parse(stored);
    } catch (e) {}

    const tripsToUpsert: Trip[] = [];
    for (let i = 0; i < total; i++) {
        const trip = newTrips[i];
        const sig = getTripSignature(trip);
        const percent = Math.round(((i + 1) / total) * 100);
        if (existingSignatures.has(sig)) continue;
        this.updateImportState(`Processing ${i + 1}/${total}: ${trip.name}`, percent, true);
        
        let candidate: Trip;
        try {
            candidate = await this.processGeocoding(trip);
        } catch (e) {
            candidate = { ...trip };
        }

        if (loggedInUser) {
            if (!candidate.participants) {
                candidate.participants = [];
            }
            if (!candidate.participants.includes(loggedInUser.id)) {
                candidate.participants.push(loggedInUser.id);
            }
        }
        if (!candidate.privacy) {
            candidate.privacy = 'Private';
        }

        tripsToUpsert.push(candidate);
        existingSignatures.add(sig);
    }

    if (tripsToUpsert.length > 0) {
        this.updateImportState(`Persisting ${tripsToUpsert.length} trips...`, 99, true);
        await this.fetch('/trips/bulk', { method: 'POST', body: JSON.stringify(tripsToUpsert) });
    }

    this.updateImportState(`Successfully imported ${tripsToUpsert.length} trips.`, 100, false);
    setTimeout(() => { if (!this._importState.isActive) this.updateImportState('', 0, false); }, 3000);
  }

  async updateTrip(trip: Trip): Promise<Trip> {
    const intelligentTrip = await this.processGeocoding(trip);
    return this.fetch<Trip>(`/trips/${trip.id}`, { method: 'PUT', body: JSON.stringify(intelligentTrip) });
  }

  async deleteTrip(id: string): Promise<void> { await this.fetch(`/trips/${id}`, { method: 'DELETE' }); }
  async getCustomEvents(): Promise<TripCustomEvent[]> { return this.fetch<TripCustomEvent[]>('/events'); }
  async addCustomEvent(event: TripCustomEvent): Promise<void> { await this.fetch('/events', { method: 'POST', body: JSON.stringify(event) }); }
  async deleteCustomEvent(id: string): Promise<void> { await this.fetch(`/events/${id}`, { method: 'DELETE' }); }
  async getPublicHolidays(countryCode: string): Promise<PublicHoliday[]> {
    const configs = await this.getSavedConfigs();
    return configs.filter(c => c.countryCode === countryCode).flatMap(c => c.holidays);
  }
  async getEntitlementTypes(): Promise<EntitlementType[]> { return this.fetch<EntitlementType[]>('/entitlements'); }
  async saveEntitlementType(entitlement: EntitlementType): Promise<void> { await this.fetch(`/entitlements/${entitlement.id}`, { method: 'PUT', body: JSON.stringify(entitlement) }); }
  async deleteEntitlementType(id: string): Promise<void> { await this.fetch(`/entitlements/${id}`, { method: 'DELETE' }); }
  async getSavedConfigs(): Promise<SavedConfig[]> { return this.fetch<SavedConfig[]>('/configs'); }
  async saveConfig(config: SavedConfig): Promise<void> { await this.fetch(`/configs/${config.id}`, { method: 'PUT', body: JSON.stringify(config) }); }
  async deleteConfig(id: string): Promise<void> { await this.fetch(`/configs/${id}`, { method: 'DELETE' }); }
  async getFlights(): Promise<any[]> {
    const independentFlights = await this.fetch<any[]>('/flights');
    let trips: Trip[] = [];
    try {
      trips = await this.getTrips();
    } catch (e) {
      console.warn("Failed to retrieve trips in getFlights", e);
    }
    const tripFlights: any[] = [];
    trips.forEach(trip => {
      if (trip.transports) {
        trip.transports.forEach(tr => {
          if (tr.mode === 'Flight') {
            tripFlights.push({
              ...tr,
              tripId: trip.id,
              tripName: trip.name
            });
          }
        });
      }
    });

    const mergedMap = new Map<string, any>();
    (independentFlights || []).filter(f => !f.mode || f.mode === 'Flight').forEach(f => {
      mergedMap.set(f.id, {
        ...f,
        tripId: f.tripId || 'unassigned'
      });
    });

    tripFlights.forEach(f => {
      if (!mergedMap.has(f.id)) {
        mergedMap.set(f.id, f);
      } else {
        const existing = mergedMap.get(f.id)!;
        mergedMap.set(f.id, {
          ...f,
          ...existing,
          tripId: f.tripId || existing.tripId
        });
      }
    });

    return Array.from(mergedMap.values());
  }
  async getRoadTrips(): Promise<any[]> {
    const independentTransports = await this.fetch<any[]>('/flights');
    let trips: Trip[] = [];
    try {
      trips = await this.getTrips();
    } catch (e) {
      console.warn("Failed to retrieve trips in getRoadTrips", e);
    }
    const tripRoadTrips: any[] = [];
    trips.forEach(trip => {
      if (trip.transports) {
        trip.transports.forEach(tr => {
          if (tr.mode && tr.mode !== 'Flight') {
            tripRoadTrips.push({
              ...tr,
              tripId: trip.id,
              tripName: trip.name
            });
          }
        });
      }
    });

    const mergedMap = new Map<string, any>();
    (independentTransports || []).filter(f => f.mode && f.mode !== 'Flight').forEach(f => {
      mergedMap.set(f.id, {
        ...f,
        tripId: f.tripId || 'unassigned'
      });
    });

    tripRoadTrips.forEach(f => {
      if (!mergedMap.has(f.id)) {
        mergedMap.set(f.id, f);
      } else {
        const existing = mergedMap.get(f.id)!;
        mergedMap.set(f.id, {
          ...f,
          ...existing,
          tripId: f.tripId || existing.tripId
        });
      }
    });

    return Array.from(mergedMap.values());
  }
  async detectAndImportRouteSegments(tripId: string, defaultMode: any): Promise<any[]> {
    const trip = await this.getTrip(tripId);
    if (!trip) throw new Error("Trip not found");

    const locations = [...(trip.locations || [])];
    if (locations.length < 2) {
      throw new Error("Trip must have at least 2 locations in the Visual Route Planner to auto-detect and import route segments.");
    }

    // Sort locations chronologically
    locations.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    const importedSegments: any[] = [];
    const currentTransports = [...(trip.transports || [])];

    for (let i = 0; i < locations.length - 1; i++) {
      const locA = locations[i];
      const locB = locations[i + 1];

      // Check for existing transport between consecutive locations to avoid duplicating
      const alreadyExists = currentTransports.some(tr => 
        tr.origin.toLowerCase().trim() === locA.name.toLowerCase().trim() &&
        tr.destination.toLowerCase().trim() === locB.name.toLowerCase().trim()
      );

      if (!alreadyExists) {
        // Estimate distance based on speed
        const speeds: Record<string, number> = {
          'Train': 120,
          'Bus': 70,
          'Car Rental': 90,
          'Personal Car': 95,
          'Cruise': 30,
          'Ferry': 40
        };
        const avgSpeed = speeds[defaultMode] || 80;
        
        // Calculate duration based on time between locations, capped to a reasonable duration
        const dateA = new Date(locA.endDate || locA.startDate);
        const dateB = new Date(locB.startDate);
        let diffHours = Math.abs(dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60);
        if (isNaN(diffHours) || diffHours <= 0) diffHours = 4; // default 4 hours
        if (diffHours > 24) diffHours = 6; // cap to 6 hours for a single transit segment

        const durationMinutes = Math.round(diffHours * 60);
        const calculatedDistance = Math.round(diffHours * avgSpeed);

        const newSegment: any = {
          id: `land-trip-${Math.random().toString(36).substring(2, 11)}`,
          itineraryId: 'route-gen',
          type: 'One-Way',
          mode: defaultMode,
          origin: locA.name,
          destination: locB.name,
          departureDate: locA.endDate || locA.startDate,
          departureTime: '10:00',
          arrivalDate: locB.startDate,
          arrivalTime: '14:00',
          provider: defaultMode === 'Train' ? 'National Rail' : (defaultMode === 'Bus' ? 'Coach Express' : 'Road Link'),
          identifier: `${defaultMode.toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`,
          confirmationCode: `AUTO-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          cost: 45, // reasonable guess
          notes: `Automatically imported from trip visual route segment.`,
          waypoints: [],
          duration: durationMinutes,
          distance: calculatedDistance,
          tripId: trip.id
        };

        currentTransports.push(newSegment);
        importedSegments.push(newSegment);
      }
    }

    if (importedSegments.length > 0) {
      await this.updateTrip({
        ...trip,
        transports: currentTransports
      });
    }

    return importedSegments;
  }
  async addFlight(flight: any): Promise<void> { await this.fetch('/flights', { method: 'POST', body: JSON.stringify(flight) }); }
  async addFlights(flights: any[]): Promise<void> { await this.fetch('/flights/bulk', { method: 'POST', body: JSON.stringify(flights) }); }
  async updateFlight(flight: any): Promise<void> { await this.fetch(`/flights/${flight.id}`, { method: 'PUT', body: JSON.stringify(flight) }); }
  async deleteFlight(id: string): Promise<void> { await this.fetch(`/flights/${id}`, { method: 'DELETE' }); }

  async getVisited(): Promise<any[]> { return this.fetch<any[]>('/visited'); }
  async addVisited(item: any): Promise<void> { await this.fetch('/visited', { method: 'POST', body: JSON.stringify(item) }); }
  async addVisitedBulk(items: any[]): Promise<void> { await this.fetch('/visited/bulk', { method: 'POST', body: JSON.stringify(items) }); }
  async updateVisited(item: any): Promise<void> { await this.fetch(`/visited/${item.id}`, { method: 'PUT', body: JSON.stringify(item) }); }
  async deleteVisited(id: string): Promise<void> { await this.fetch(`/visited/${id}`, { method: 'DELETE' }); }
  async getWorkspaceSettings(): Promise<WorkspaceSettings> {
    const settings = await this.fetch<WorkspaceSettings>('/settings');
    return { ...DEFAULT_WORKSPACE_SETTINGS, ...settings };
  }
  async updateWorkspaceSettings(settings: WorkspaceSettings): Promise<void> { 
    safeStorage.setItem('wandergrid_workspace_settings', JSON.stringify(settings));
    safeStorage.setItem('wandergrid_settings', JSON.stringify(settings));
    try {
      window.dispatchEvent(new CustomEvent('wandergrid_settings_updated', { detail: settings }));
      window.dispatchEvent(new CustomEvent('wandergrid_db_updated', { detail: { key: 'settings' } }));
    } catch (e) {}
    await this.fetch('/settings', { method: 'PUT', body: JSON.stringify(settings) }); 
  }
  async wipeDatabase(): Promise<void> {
      const isProd = import.meta.env.PROD;
      if (this._useApi || isProd) {
          try {
              await this.fetch('/wipe', { method: 'POST' });
          } catch (e) {
              console.warn("Wipe database endpoint failed or not found", e);
              if (isProd) throw e;
          }
      }
      
      // Clear localStorage keys
      const key = (k: string) => `wandergrid_${k}`;
      const collections = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights', 'settings', 'session_user', 'dashboard_cache_v1'];
      collections.forEach(c => {
          localStorage.removeItem(key(c));
      });
      localStorage.removeItem('flightFormDraft');
      localStorage.removeItem('wandergrid_users');
      
      // Clear in-memory document cache and pending writes immediately
      clearMemoryCache();
      try {
        window.dispatchEvent(new CustomEvent('wandergrid_db_updated'));
      } catch (e) {}
  }
  async exportFullState(options?: BackupSelectionOptions): Promise<string> {
      const selected: BackupSelectionOptions = {
          flights: true,
          roadTrips: true,
          visited: true,
          settings: true,
          users: true,
          calendar: true,
          ...(options || {})
      };

      let geoCache: any[] = [];
      if (selected.visited !== false) {
          try {
              const storedGeo = localStorage.getItem(GEO_CACHE_KEY);
              if (storedGeo) geoCache = JSON.parse(storedGeo);
          } catch (e) {}
      }

      const dbState = await this.fetch<any>('/backup');
      const cleanDbState = removeSensitiveData(dbState) || {};

      // Filter trips according to granularity
      let trips = Array.isArray(cleanDbState.trips) ? cleanDbState.trips : [];
      if (selected.flights === false && selected.roadTrips === false) {
          trips = [];
      } else if (selected.flights === false && selected.roadTrips === true) {
          trips = trips.filter(isTripRoad);
      } else if (selected.flights === true && selected.roadTrips === false) {
          trips = trips.filter((t: any) => isTripAir(t) && !isTripRoad(t));
      }

      // Filter independent flights/transports according to granularity
      let flights = Array.isArray(cleanDbState.flights) ? cleanDbState.flights : [];
      if (selected.flights === false && selected.roadTrips === false) {
          flights = [];
      } else if (selected.flights === false && selected.roadTrips === true) {
          flights = flights.filter((f: any) => f.mode && f.mode !== 'Flight');
      } else if (selected.flights === true && selected.roadTrips === false) {
          flights = flights.filter((f: any) => !f.mode || f.mode === 'Flight');
      }

      // Always maintain the exact canonical JSON schema
      const state = {
          version: '3.7',
          timestamp: new Date().toISOString(),
          users: selected.users !== false && Array.isArray(cleanDbState.users) ? cleanDbState.users : [],
          trips,
          events: selected.calendar !== false && Array.isArray(cleanDbState.events) ? cleanDbState.events : [],
          entitlements: selected.calendar !== false && Array.isArray(cleanDbState.entitlements) ? cleanDbState.entitlements : [],
          configs: selected.calendar !== false && Array.isArray(cleanDbState.configs) ? cleanDbState.configs : [],
          flights,
          visited: selected.visited !== false && Array.isArray(cleanDbState.visited) ? cleanDbState.visited : [],
          workspaceSettings: selected.settings !== false && cleanDbState.workspaceSettings && typeof cleanDbState.workspaceSettings === 'object' ? cleanDbState.workspaceSettings : {},
          caches: { geo: geoCache }
      };

      return JSON.stringify(state, null, 2);
  }

  async importFullState(jsonString: string, options?: RestoreOptions): Promise<void> {
      try {
          const state = JSON.parse(jsonString.trim().replace(/^\uFEFF/, ''));

          // Retain current session identity so restore NEVER logs the user out
          let currentUserId = options?.currentUserId;
          let currentUserEmail = options?.currentUserEmail;
          let currentUser = options?.currentUser;
          if (!currentUserId || !currentUserEmail || !currentUser) {
              try {
                  const sessionUserStr = localStorage.getItem('wandergrid_session_user');
                  if (sessionUserStr) {
                      const sessionUser = JSON.parse(sessionUserStr);
                      currentUser = currentUser || sessionUser;
                      if (sessionUser?.id) currentUserId = currentUserId || sessionUser.id;
                      if (sessionUser?.email) currentUserEmail = currentUserEmail || sessionUser.email;
                  }
              } catch (e) {}
          }

          const payload = {
              data: state,
              restoreOptions: {
                  mode: options?.mode || 'replace',
                  selectedCategories: options?.selectedCategories || {
                      flights: true,
                      roadTrips: true,
                      visited: true,
                      settings: true,
                      users: true,
                      calendar: true
                  },
                  currentUserId,
                  currentUserEmail,
                  currentUser
              }
          };

          await this.fetch('/restore', { method: 'POST', body: JSON.stringify(payload) });

          const selectedCats = payload.restoreOptions.selectedCategories;
          if (selectedCats.visited !== false && state.caches?.geo && Array.isArray(state.caches.geo)) {
              // Non-fatal: a quota failure on the geo cache must not abort an otherwise successful restore
              safeStorage.setItem(GEO_CACHE_KEY, JSON.stringify(state.caches.geo));
          }

          // Clear dashboard cached stats on import to avoid stale states
          localStorage.removeItem('wandergrid_dashboard_cache_v1');
          return Promise.resolve();
      } catch (e) {
          return Promise.reject(e);
      }
  }
}

export const dataService = new DataService();
