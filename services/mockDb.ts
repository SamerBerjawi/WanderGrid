
import { User, Trip, PublicHoliday, EntitlementType, SavedConfig, WorkspaceSettings, CustomEvent as TripCustomEvent, PackingItem, Carrier } from '../types';
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
  dateFormat: 'MM/DD/YYYY',
  autoSync: false,
  theme: 'dark',
  workingDays: [1, 2, 3, 4, 5],
  aviationStackApiKey: '',
  brandfetchApiKey: '',
  googleGeminiApiKey: '',
  masterPackingList: DEFAULT_MASTER_LIST,
  carriers: []
};

export interface ImportState {
    status: string;
    progress: number;
    isActive: boolean;
}

// --- Browser Security Hashing helpers (SHA-256 with Salt fallback) ---
function sha256Fallback(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';
  const words: number[] = [];
  const asciiLength = ascii.length * 8;
  
  const rK: number[] = [];
  const rH: number[] = [];
  
  const isPrime = (n: number) => {
    for (let i = 2; i <= Math.sqrt(n); i++) {
      if (n % i === 0) return false;
    }
    return true;
  };
  
  let candidate = 2;
  while (rH.length < 8) {
    if (isPrime(candidate)) {
      rH.push((mathPow(candidate, 1/2) * maxWord) | 0);
      rK.push((mathPow(candidate, 1/3) * maxWord) | 0);
    }
    candidate++;
  }
  while (rK.length < 64) {
    if (isPrime(candidate)) {
      rK.push((mathPow(candidate, 1/3) * maxWord) | 0);
    }
    candidate++;
  }

  const asciiBytes: number[] = [];
  for (let i = 0; i < ascii.length; i++) {
    asciiBytes.push(ascii.charCodeAt(i));
  }
  
  asciiBytes.push(0x80); 
  while ((asciiBytes.length * 8 + 64) % 512 !== 0) {
    asciiBytes.push(0);
  }
  
  const lenBits = asciiLength;
  const lenBytes = [
    (lenBits >>> 56) & 0xFF,
    (lenBits >>> 48) & 0xFF,
    (lenBits >>> 40) & 0xFF,
    (lenBits >>> 32) & 0xFF,
    (lenBits >>> 24) & 0xFF,
    (lenBits >>> 16) & 0xFF,
    (lenBits >>> 8) & 0xFF,
    lenBits & 0xFF
  ];
  asciiBytes.push(...lenBytes);
  
  for (let i = 0; i < asciiBytes.length; i += 4) {
    words.push((asciiBytes[i] << 24) | (asciiBytes[i+1] << 16) | (asciiBytes[i+2] << 8) | asciiBytes[i+3]);
  }
  
  for (let i = 0; i < words.length; i += 16) {
    const w = words.slice(i, i + 16);
    let [a, b, c, d, e, f, g, h] = rH;
    
    for (let j = 0; j < 64; j++) {
      if (j >= 16) {
        const s0 = rightRotate(w[j-15], 7) ^ rightRotate(w[j-15], 18) ^ (w[j-15] >>> 3);
        const s1 = rightRotate(w[j-2], 17) ^ rightRotate(w[j-2], 19) ^ (w[j-2] >>> 10);
        w[j] = (w[j-16] + s0 + w[j-7] + s1) | 0;
      }
      
      const S1 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const ch = (a & b) ^ (~a & c);
      const temp1 = (h + S1 + ch + rK[j] + w[j]) | 0;
      const S0 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const maj = (e & f) ^ (e & g) ^ (f & g);
      const temp2 = (S0 + maj) | 0;
      
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    
    rH[0] = (rH[0] + a) | 0;
    rH[1] = (rH[1] + b) | 0;
    rH[2] = (rH[2] + c) | 0;
    rH[3] = (rH[3] + d) | 0;
    rH[4] = (rH[4] + e) | 0;
    rH[5] = (rH[5] + f) | 0;
    rH[6] = (rH[6] + g) | 0;
    rH[7] = (rH[7] + h) | 0;
  }
  
  for (let i = 0; i < 8; i++) {
    let hexValue = (rH[i] >>> 0).toString(16);
    while (hexValue.length < 8) hexValue = '0' + hexValue;
    result += hexValue;
  }
  
  return result;
}

export async function hashPasswordInBrowser(password: string, saltHex?: string): Promise<string> {
  const isSecureContextAvailable = typeof window !== 'undefined' && 
                                   window.crypto && 
                                   window.crypto.subtle && 
                                   typeof window.crypto.subtle.digest === 'function';

  if (!isSecureContextAvailable) {
    console.warn("[SECURITY] Crypto subtle digest API is unavailable. Falling back to safe pure-JS SHA-256 implementation.");
    const fallbackSalt = saltHex || Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    const hashHex = sha256Fallback(fallbackSalt + password);
    return `${fallbackSalt}:${hashHex}`;
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
    if (
      lowerKey === 'password' || 
      lowerKey.includes('apikey') || 
      lowerKey.includes('api_key') || 
      lowerKey.includes('token') || 
      lowerKey.includes('secret')
    ) {
      continue;
    }
    cleaned[key] = removeSensitiveData(val);
  }
  return cleaned;
}

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
              const s = localStorage.getItem(key('settings'));
              return s ? { ...DEFAULT_WORKSPACE_SETTINGS, ...JSON.parse(s) } : { ...DEFAULT_WORKSPACE_SETTINGS };
          }
          if (method === 'PUT') {
              localStorage.setItem(key('settings'), JSON.stringify(body));
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
              const list = JSON.parse(localStorage.getItem(key(col.storage)) || '[]');
              if (method === 'GET') return list as T;
              if (method === 'POST') {
                  list.push(body);
                  localStorage.setItem(key(col.storage), JSON.stringify(list));
                  try { window.dispatchEvent(new CustomEvent('wandergrid_db_updated')); } catch (e) {}
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
                  try { window.dispatchEvent(new CustomEvent('wandergrid_db_updated')); } catch (e) {}
                  return body as T;
              }
              if (method === 'DELETE') {
                  const newList = list.filter((i: any) => i.id !== id);
                  localStorage.setItem(key(col.storage), JSON.stringify(newList));
                  try { window.dispatchEvent(new CustomEvent('wandergrid_db_updated')); } catch (e) {}
                  return { success: true } as unknown as T;
              }
          }
      }

      if (endpoint === '/trips/bulk') {
          if (method === 'POST') {
              const list = JSON.parse(localStorage.getItem(key('trips')) || '[]');
              const payload = body as any[];
              for (const trip of payload) {
                  const idx = list.findIndex((i: any) => i.id === trip.id);
                  if (idx >= 0) list[idx] = trip;
                  else list.push(trip);
              }
              localStorage.setItem(key('trips'), JSON.stringify(list));
              try { window.dispatchEvent(new CustomEvent('wandergrid_db_updated')); } catch (e) {}
              return { success: true, count: payload.length } as unknown as T;
          }
      }

      if (endpoint === '/flights/bulk') {
          if (method === 'POST') {
              const list = JSON.parse(localStorage.getItem(key('flights')) || '[]');
              const payload = body as any[];
              for (const flight of payload) {
                  const idx = list.findIndex((i: any) => i.id === flight.id);
                  if (idx >= 0) list[idx] = flight;
                  else list.push(flight);
              }
              localStorage.setItem(key('flights'), JSON.stringify(list));
              try { window.dispatchEvent(new CustomEvent('wandergrid_db_updated')); } catch (e) {}
              return { success: true, count: payload.length } as unknown as T;
          }
      }

      if (endpoint === '/visited/bulk') {
          if (method === 'POST') {
              const list = JSON.parse(localStorage.getItem(key('visited')) || '[]');
              const payload = body as any[];
              for (const item of payload) {
                  const idx = list.findIndex((i: any) => i.id === item.id);
                  if (idx >= 0) list[idx] = item;
                  else list.push(item);
              }
              localStorage.setItem(key('visited'), JSON.stringify(list));
              try { window.dispatchEvent(new CustomEvent('wandergrid_db_updated')); } catch (e) {}
              return { success: true, count: payload.length } as unknown as T;
          }
      }

      if (endpoint === '/backup') {
          const backup: any = { workspaceSettings: {} };
          collections.forEach(c => backup[c.storage] = JSON.parse(localStorage.getItem(key(c.storage)) || '[]'));
          const s = localStorage.getItem(key('settings'));
          backup.workspaceSettings = s ? JSON.parse(s) : DEFAULT_WORKSPACE_SETTINGS;
          const cleanBackup = removeSensitiveData(backup);
          return cleanBackup as T;
      }

      if (endpoint === '/restore') {
          const data = body;
          collections.forEach(c => {
              if (data[c.storage] && Array.isArray(data[c.storage])) {
                  const keyName = key(c.storage);
                  const existingList = JSON.parse(localStorage.getItem(keyName) || '[]');
                  const existingMap = new Map(existingList.map((item: any) => [item.id, item]));

                  const newList = data[c.storage].map((item: any) => {
                      if (c.storage === 'users') {
                          const existingUser = existingMap.get(item.id);
                          if (!item.password) {
                              if (existingUser && existingUser.password) {
                                  return { ...item, password: existingUser.password };
                              } else {
                                  return { ...item, password: 'password' };
                              }
                          }
                      }
                      return item;
                  });
                  localStorage.setItem(keyName, JSON.stringify(newList));
              }
          });
          if (data.workspaceSettings) {
              const currentSettings = JSON.parse(localStorage.getItem(key('settings')) || '{}');
              const restoredSettings = { ...DEFAULT_WORKSPACE_SETTINGS, ...data.workspaceSettings };
              const keysToCheck = ['aviationStackApiKey', 'brandfetchApiKey', 'googleGeminiApiKey'];
              keysToCheck.forEach(k => {
                  if (!restoredSettings[k] && currentSettings[k]) {
                      restoredSettings[k] = currentSettings[k];
                  }
              });
              localStorage.setItem(key('settings'), JSON.stringify(restoredSettings));
          }
          try { window.dispatchEvent(new CustomEvent('wandergrid_db_updated')); } catch (e) {}
          return { success: true } as unknown as T;
      }

      throw new Error(`Local Mock: Route not found ${endpoint}`);
  }

  async getUsers(): Promise<User[]> {
      const list = await this.fetch<User[]>('/users');
      try {
          localStorage.setItem('wandergrid_users', JSON.stringify(list));
      } catch (e) {}
      return list;
  }

  async updateUser(user: User): Promise<void> {
      const userCopy = { ...user };
      try {
          const storedUsers = localStorage.getItem('wandergrid_users');
          if (storedUsers) {
              const list = JSON.parse(storedUsers);
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
          }
      } catch (e) {}

      await this.fetch(`/users/${user.id}`, { method: 'PUT', body: JSON.stringify(userCopy) });
      try {
          const stored = localStorage.getItem('wandergrid_users');
          if (stored) {
              const list = JSON.parse(stored);
              const idx = list.findIndex((u: any) => u.id === user.id);
              if (idx >= 0) {
                  list[idx] = userCopy;
                  localStorage.setItem('wandergrid_users', JSON.stringify(list));
              }
          }
      } catch (e) {}
  }

  async addUser(user: User): Promise<void> {
      const userCopy = { ...user };
      if (userCopy.password && !userCopy.password.includes(':')) {
          userCopy.password = await hashPasswordInBrowser(userCopy.password);
      }
      await this.fetch('/users', { method: 'POST', body: JSON.stringify(userCopy) });
      try {
          const stored = localStorage.getItem('wandergrid_users');
          const list = stored ? JSON.parse(stored) : [];
          list.push(userCopy);
          localStorage.setItem('wandergrid_users', JSON.stringify(list));
      } catch (e) {}
  }

  async deleteUser(id: string): Promise<void> {
      await this.fetch(`/users/${id}`, { method: 'DELETE' });
      try {
          const stored = localStorage.getItem('wandergrid_users');
          if (stored) {
              const list = JSON.parse(stored);
              const newList = list.filter((u: any) => u.id !== id);
              localStorage.setItem('wandergrid_users', JSON.stringify(newList));
          }
      } catch (e) {}
  }

  private async processGeocoding(trip: Trip): Promise<Trip> {
      const updatedTrip = { ...trip };
      if (updatedTrip.location && !updatedTrip.coordinates) {
          const coords = await getCoordinates(updatedTrip.location);
          if (coords) updatedTrip.coordinates = coords;
      }
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
              if (u.waypoints && u.waypoints.length > 0) {
                  const updatedWaypoints = await Promise.all(u.waypoints.map(async (wp) => {
                      if (!wp.coordinates && wp.name) {
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

    if (!loggedInUser) {
      return allTrips.filter(t => t.privacy === 'Public');
    }

    if (loggedInUser.role === 'Admin') {
      return allTrips;
    }

    return allTrips.filter(t => 
      t.participants.includes(loggedInUser.id) || 
      t.privacy === 'Public'
    );
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
    (independentFlights || []).forEach(f => {
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
  async updateWorkspaceSettings(settings: WorkspaceSettings): Promise<void> { await this.fetch('/settings', { method: 'PUT', body: JSON.stringify(settings) }); }
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
  }
  async exportFullState(): Promise<string> {
      let geoCache: any[] = [];
      try {
          const storedGeo = localStorage.getItem(GEO_CACHE_KEY);
          if (storedGeo) geoCache = JSON.parse(storedGeo);
      } catch (e) {}
      const dbState = await this.fetch<any>('/backup');
      const cleanDbState = removeSensitiveData(dbState);
      const state = { version: '3.7', timestamp: new Date().toISOString(), ...cleanDbState, caches: { geo: geoCache } };
      return JSON.stringify(state, null, 2);
  }
  async importFullState(jsonString: string): Promise<void> {
      try {
          const state = JSON.parse(jsonString.trim().replace(/^\uFEFF/, ''));
          await this.fetch('/restore', { method: 'POST', body: JSON.stringify(state) });
          if (state.caches?.geo && Array.isArray(state.caches.geo)) {
              localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(state.caches.geo));
          }
          // Clear dashboard cached stats on import to avoid stale states
          localStorage.removeItem('wandergrid_dashboard_cache_v1');
          return Promise.resolve();
      } catch (e) { return Promise.reject(e); }
  }
}

export const dataService = new DataService();
