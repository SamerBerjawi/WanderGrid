
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const FLIGHT_CACHE_TTL_MS = 5 * 60 * 1000;
const flightCache = new Map();

// Global memory caches as robust fail-safe fallbacks
const memoryAirports = new Map();
const memoryCarriers = new Map();

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'client_build')));

// Initialize Database Schema with automatic retry mechanism
const initDb = async (retries = 10, delayMs = 3000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Connecting to database (attempt ${attempt}/${retries})...`);
      const client = await pool.connect();
      try {
        // We use a generic structure where 'data' contains the JSON object
        // and 'id' is extracted for easier lookups.
        const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights'];
        
        for (const table of tables) {
          await client.query(`
            CREATE TABLE IF NOT EXISTS ${table} (
              id TEXT PRIMARY KEY,
              data JSONB NOT NULL
            );
          `);
        }

        // Settings is a singleton, key-value store
        await client.query(`
            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              data JSONB NOT NULL
            );
        `);

        // Global airports database table
        await client.query(`
            CREATE TABLE IF NOT EXISTS global_airports (
              id SERIAL PRIMARY KEY,
              iata VARCHAR(10),
              city_name TEXT,
              airport_name TEXT
            );
        `);
        
        // Global carriers database table
        await client.query(`
            CREATE TABLE IF NOT EXISTS global_carriers (
              id SERIAL PRIMARY KEY,
              iata VARCHAR(10),
              company_name TEXT,
              country_or_territory TEXT
            );
        `);
        
        console.log('Database schema initialized successfully!');
        return; // Connection and schema setup succeeded
      } finally {
        client.release();
      }
    } catch (err) {
      console.error(`Database connection attempt ${attempt} failed:`, err.message);
      if (attempt === retries) {
        console.error('All database connection attempts exhausted. Starting server in fallback mode (or container will restart).');
        throw err; // Re-throw to allow process/container to restart if all retries fail
      }
      console.log(`Waiting ${delayMs / 1000}s before retrying database connection...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
};

const loadGlobalData = async () => {
  // Always load memory lists from GitHub first as a fail-safe fallback
  try {
    console.log('Fetching & parsing global carriers dataset in server memory from GitHub...');
    const carrierResponse = await fetch('https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/carrier_data_full_processed.jsonl');
    if (carrierResponse.ok) {
      const text = await carrierResponse.text();
      const lines = text.split('\n').filter(Boolean);
      let count = 0;
      for (const line of lines) {
        try {
          const item = JSON.parse(line);
          const iata = (item.iata || '').trim().toUpperCase();
          if (iata) {
            memoryCarriers.set(iata, {
              iata,
              company_name: item.company_name || '',
              country_or_territory: item.country_or_territory || ''
            });
            count++;
          }
        } catch (e) {}
      }
      console.log(`Successfully parsed ${count} carriers into in-memory fallback cache.`);
    }

    console.log('Fetching & parsing global airports dataset in server memory from GitHub...');
    const airResponse = await fetch('https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/airport_data_full_processed.jsonl');
    if (airResponse.ok) {
      const text = await airResponse.text();
      const lines = text.split('\n').filter(Boolean);
      let count = 0;
      for (const line of lines) {
        try {
          const item = JSON.parse(line);
          const iata = (item.iata || '').trim().toUpperCase();
          if (iata) {
            memoryAirports.set(iata, {
              iata,
              city_name: item.city_name || '',
              airport_name: item.airport_name || ''
            });
            count++;
          }
        } catch (e) {}
      }
      console.log(`Successfully parsed ${count} airports into in-memory fallback cache.`);
    }
  } catch (err) {
    console.warn('Failed to pre-load global datasets to server memory:', err.message);
  }

  let client;
  try {
    client = await pool.connect();
    
    // Check if airports table is empty
    const airportsCount = await client.query('SELECT COUNT(*) FROM global_airports');
    const countAirports = parseInt(airportsCount.rows[0].count, 10);
    
    if (countAirports === 0) {
      console.log('Prepopulating global_airports from GitHub...');
      const response = await fetch('https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/airport_data_full_processed.jsonl');
      if (response.ok) {
        const text = await response.text();
        const lines = text.split('\n').filter(Boolean);
        console.log(`Downloaded ${lines.length} airports; parsing & inserting chunks...`);
        
        await client.query('BEGIN');
        const chunkSize = 500;
        for (let i = 0; i < lines.length; i += chunkSize) {
          const chunk = lines.slice(i, i + chunkSize);
          const values = [];
          const params = [];
          
          chunk.forEach((line, idx) => {
            try {
              const item = JSON.parse(line);
              if (item.iata) {
                const iata = item.iata.trim().toUpperCase();
                const city = item.city_name || '';
                const airport = item.airport_name || '';
                values.push(`($${idx * 3 + 1}, $${idx * 3 + 2}, $${idx * 3 + 3})`);
                params.push(iata, city, airport);
              }
            } catch (err) {}
          });
          
          if (values.length > 0) {
            await client.query(`
              INSERT INTO global_airports (iata, city_name, airport_name)
              VALUES ${values.join(', ')}
            `, params);
          }
        }
        await client.query('COMMIT');
        
        console.log('Creating database indexes on global_airports...');
        await client.query('CREATE INDEX IF NOT EXISTS idx_airports_iata ON global_airports(iata)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_airports_city_name ON global_airports(city_name)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_airports_airport_name ON global_airports(airport_name)');
        console.log('Successfully pre-populated global_airports!');
      } else {
        console.error('Failed to download airports file from GitHub. Status:', response.status);
      }
    } else {
      console.log(`global_airports already pre-populated with ${countAirports} records.`);
    }
    
    // Check if carriers table is empty
    const carriersCount = await client.query('SELECT COUNT(*) FROM global_carriers');
    const countCarriers = parseInt(carriersCount.rows[0].count, 10);
    
    if (countCarriers === 0) {
      console.log('Prepopulating global_carriers from GitHub...');
      const response = await fetch('https://raw.githubusercontent.com/dlubom/iata_code_fetcher/main/carrier_data_full_processed.jsonl');
      if (response.ok) {
        const text = await response.text();
        const lines = text.split('\n').filter(Boolean);
        console.log(`Downloaded ${lines.length} carriers; parsing & inserting chunks...`);
        
        await client.query('BEGIN');
        const chunkSize = 500;
        for (let i = 0; i < lines.length; i += chunkSize) {
          const chunk = lines.slice(i, i + chunkSize);
          const values = [];
          const params = [];
          
          chunk.forEach((line, idx) => {
            try {
              const item = JSON.parse(line);
              const iata = (item.iata || '').trim().toUpperCase();
              const name = item.company_name || '';
              const country = item.country_or_territory || '';
              if (iata || name) {
                values.push(`($${idx * 3 + 1}, $${idx * 3 + 2}, $${idx * 3 + 3})`);
                params.push(iata, name, country);
              }
            } catch (err) {}
          });
          
          if (values.length > 0) {
            await client.query(`
              INSERT INTO global_carriers (iata, company_name, country_or_territory)
              VALUES ${values.join(', ')}
            `, params);
          }
        }
        await client.query('COMMIT');
        
        console.log('Creating database indexes on global_carriers...');
        await client.query('CREATE INDEX IF NOT EXISTS idx_carriers_iata ON global_carriers(iata)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_carriers_company_name ON global_carriers(company_name)');
        console.log('Successfully pre-populated global_carriers!');
      } else {
        console.error('Failed to download carriers file from GitHub. Status:', response.status);
      }
    } else {
      console.log(`global_carriers already pre-populated with ${countCarriers} records.`);
    }
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (e) {}
    }
    console.error('Error pre-populating global databases:', err);
  } finally {
    if (client) client.release();
  }
};

initDb().then(() => {
  loadGlobalData().catch(err => console.error('Error in background data load:', err));
}).catch(err => {
  console.error('Failed to initialize database after multiple retries. Server can still start, but database operations will fail:', err.message);
});

// --- Generic CRUD Handlers ---

const getResources = (table) => async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT data FROM ${table}`);
    res.json(rows.map(r => r.data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createResource = (table) => async (req, res) => {
  const resource = req.body;
  if (!resource.id) return res.status(400).json({ error: 'ID is required' });
  
  try {
    await pool.query(
      `INSERT INTO ${table} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
      [resource.id, JSON.stringify(resource)]
    );
    res.status(201).json(resource);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateResource = (table) => async (req, res) => {
  const { id } = req.params;
  const resource = req.body;
  
  try {
    await pool.query(
      `INSERT INTO ${table} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
      [id, JSON.stringify(resource)]
    );
    res.json(resource);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const deleteResource = (table) => async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// --- Routes ---

// Proxy for AviationStack (Fixes CORS issues)
app.get('/api/proxy/flight-status', async (req, res) => {
    const { access_key, flight_iata, flight_date } = req.query;
    if (!access_key || !flight_iata) {
        return res.status(400).json({ error: 'Missing access_key or flight_iata' });
    }

    const cacheKey = `${flight_iata}:${flight_date || 'latest'}`;
    const cached = flightCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        res.set('X-Cache', 'HIT');
        res.set('Cache-Control', `public, max-age=${Math.floor(FLIGHT_CACHE_TTL_MS / 1000)}`);
        return res.json(cached.data);
    }
    
    try {
        const dateParam = flight_date ? `&flight_date=${flight_date}` : '';
        const url = `http://api.aviationstack.com/v1/flights?access_key=${access_key}&flight_iata=${flight_iata}${dateParam}`;
        // Using built-in fetch (Node 18+)
        const response = await fetch(url);
        const data = await response.json();
        flightCache.set(cacheKey, { data, expiresAt: Date.now() + FLIGHT_CACHE_TTL_MS });
        res.set('X-Cache', 'MISS');
        res.set('Cache-Control', `public, max-age=${Math.floor(FLIGHT_CACHE_TTL_MS / 1000)}`);
        res.json(data);
    } catch (err) {
        console.error("Proxy error:", err);
        res.status(500).json({ error: 'Failed to fetch flight data' });
    }
});

// Proxy for AviationStack Airports (Bypasses CORS & mixed content)
app.get('/api/proxy/airports', async (req, res) => {
    const { access_key, iata_code, search } = req.query;
    if (!access_key) {
        return res.status(400).json({ error: 'Missing access_key' });
    }
    try {
        let url = `http://api.aviationstack.com/v1/airports?access_key=${access_key}`;
        if (iata_code) url += `&iata_code=${iata_code}`;
        if (search) url += `&search=${search}`;
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (err) {
         console.error("Airports proxy error:", err);
         res.status(500).json({ error: 'Failed to fetch airport metadata' });
    }
});

// Proxy for AviationStack Airlines (Bypasses CORS & mixed content)
app.get('/api/proxy/airlines', async (req, res) => {
    const { access_key, iata_code, search } = req.query;
    if (!access_key) {
        return res.status(400).json({ error: 'Missing access_key' });
    }
    try {
        let url = `http://api.aviationstack.com/v1/airlines?access_key=${access_key}`;
        if (iata_code) url += `&iata_code=${iata_code}`;
        if (search) url += `&search=${search}`;
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (err) {
         console.error("Airlines proxy error:", err);
         res.status(500).json({ error: 'Failed to fetch airline metadata' });
    }
});

// --- Global Search & Lookup Endpoints (External DB / PostgreSQL) ---

// Lookup single airport by IATA code
app.get('/api/airports/lookup/:iata', async (req, res) => {
    const { iata } = req.params;
    if (!iata) return res.status(400).json({ error: 'Missing IATA code' });
    const lookupCode = iata.trim().toUpperCase();
    
    // 1. Try DB first
    try {
        const { rows } = await pool.query(
            `SELECT iata, city_name, airport_name FROM global_airports WHERE UPPER(iata) = $1 LIMIT 1`,
            [lookupCode]
        );
        if (rows.length > 0) {
            return res.json(rows[0]);
        }
    } catch (err) {
        console.warn('Database lookup failed, falling back to in-memory store:', err.message);
    }

    // 2. Try In-Memory Fallback Map
    const cached = memoryAirports.get(lookupCode);
    if (cached) {
        return res.json(cached);
    }

    res.status(404).json({ error: 'Airport code not found in database or memory cache' });
});

// Lookup single carrier by IATA code
app.get('/api/carriers/lookup/:iata', async (req, res) => {
    const { iata } = req.params;
    if (!iata) return res.status(400).json({ error: 'Missing IATA code' });
    const lookupCode = iata.trim().toUpperCase();
    
    // 1. Try DB first
    try {
        const { rows } = await pool.query(
            `SELECT iata, company_name, country_or_territory FROM global_carriers WHERE UPPER(iata) = $1 LIMIT 1`,
            [lookupCode]
        );
        if (rows.length > 0) {
            return res.json(rows[0]);
        }
    } catch (err) {
        console.warn('Database carrier lookup failed, falling back to in-memory store:', err.message);
    }

    // 2. Try In-Memory Fallback Map
    const cached = memoryCarriers.get(lookupCode);
    if (cached) {
        return res.json(cached);
    }

    res.status(404).json({ error: 'Carrier code not found in database or memory cache' });
});

// Search airports by query term
app.get('/api/airports/search', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
        return res.json([]);
    }
    
    // 1. Try DB first
    try {
        const searchPattern = `%${q.toLowerCase()}%`;
        const { rows } = await pool.query(
            `SELECT iata, city_name, airport_name 
             FROM global_airports 
             WHERE LOWER(iata) = LOWER($1)
                OR LOWER(iata) LIKE $2
                OR LOWER(city_name) LIKE $2
                OR LOWER(airport_name) LIKE $2
             ORDER BY 
                CASE WHEN LOWER(iata) = LOWER($1) THEN 1
                     WHEN LOWER(iata) LIKE $2 THEN 2
                     WHEN LOWER(city_name) LIKE $2 THEN 3
                     ELSE 4
                END
             LIMIT 15`,
            [q, searchPattern]
        );
        return res.json(rows);
    } catch (err) {
        console.warn('Database airport search failed, searching in-memory cache:', err.message);
    }

    // 2. Try In-Memory Fallback Search
    const lowerQuery = q.toLowerCase();
    const results = [];
    for (const [iata, details] of memoryAirports.entries()) {
        const isIataMatch = iata.toLowerCase() === lowerQuery;
        const isIataPartial = iata.toLowerCase().includes(lowerQuery);
        const isCityMatch = (details.city_name || '').toLowerCase().includes(lowerQuery);
        const isAirportMatch = (details.airport_name || '').toLowerCase().includes(lowerQuery);

        if (isIataMatch || isIataPartial || isCityMatch || isAirportMatch) {
            results.push({
                iata: details.iata,
                city_name: details.city_name,
                airport_name: details.airport_name,
                score: isIataMatch ? 1 : isIataPartial ? 2 : isCityMatch ? 3 : 4
            });
        }
    }
    results.sort((a,b) => a.score - b.score);
    res.json(results.slice(0, 15).map(({score, ...rest}) => rest));
});

// Search carriers by query term
app.get('/api/carriers/search', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 1) {
        return res.json([]);
    }
    
    // 1. Try DB first
    try {
        const searchPattern = `%${q.toLowerCase()}%`;
        const { rows } = await pool.query(
            `SELECT iata, company_name, country_or_territory 
             FROM global_carriers 
             WHERE (LOWER(iata) = LOWER($1) AND iata <> '')
                OR LOWER(iata) LIKE $2
                OR LOWER(company_name) LIKE $2
             ORDER BY 
                CASE WHEN LOWER(iata) = LOWER($1) THEN 1
                     WHEN LOWER(company_name) LIKE $2 THEN 2
                     ELSE 3
                END
             LIMIT 15`,
            [q, searchPattern]
        );
        return res.json(rows);
    } catch (err) {
        console.warn('Database carrier search failed, searching in-memory cache:', err.message);
    }

    // 2. Try In-Memory Fallback Search
    const lowerQuery = q.toLowerCase();
    const results = [];
    for (const [iata, details] of memoryCarriers.entries()) {
        const isIataMatch = iata.toLowerCase() === lowerQuery;
        const isIataPartial = iata.toLowerCase().includes(lowerQuery);
        const isCompanyMatch = (details.company_name || '').toLowerCase().includes(lowerQuery);

        if ((isIataMatch && iata !== '') || isIataPartial || isCompanyMatch) {
            results.push({
                iata: details.iata,
                company_name: details.company_name,
                country_or_territory: details.country_or_territory,
                score: isIataMatch ? 1 : isCompanyMatch ? 2 : 3
            });
        }
    }
    results.sort((a,b) => a.score - b.score);
    res.json(results.slice(0, 15).map(({score, ...rest}) => rest));
});

// Calendar Sync Endpoint (iCal Feed)
app.get('/api/calendar/:userId/feed.ics', async (req, res) => {
    const { userId } = req.params;
    try {
        // Query trips where userId is in the participants array
        const { rows } = await pool.query(`
            SELECT data FROM trips 
            WHERE data->'participants' ? $1
            AND (data->>'status' = 'Upcoming' OR data->>'status' = 'Past')
        `, [userId]);
        
        const trips = rows.map(r => r.data);
        
        // --- ICS Generation Logic (Backend Version) ---
        const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        const formatDate = (dateStr) => dateStr.replace(/-/g, '');
        const getExclusiveEndDate = (dateStr) => {
            const date = new Date(dateStr);
            date.setDate(date.getDate() + 1);
            return date.toISOString().split('T')[0].replace(/-/g, '');
        };

        const events = trips.map(trip => {
            const start = formatDate(trip.startDate);
            const end = getExclusiveEndDate(trip.endDate);
            const summary = `${trip.icon || '✈️'} ${trip.name}`;
            const location = trip.location || '';
            const uid = `${trip.id}@wandergrid.app`;
            
            let description = `Status: ${trip.status}\\n`;
            if (trip.transports && trip.transports.length > 0) {
                description += `\\nTransports:${trip.transports.map(t => `\\n- ${t.mode}: ${t.provider} (${t.departureTime})`).join('')}`;
            }

            return [
                'BEGIN:VEVENT',
                `UID:${uid}`,
                `DTSTAMP:${now}`,
                `DTSTART;VALUE=DATE:${start}`,
                `DTEND;VALUE=DATE:${end}`,
                `SUMMARY:${summary}`,
                `LOCATION:${location}`,
                `DESCRIPTION:${description}`,
                'END:VEVENT'
            ].join('\r\n');
        });

        const icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//WanderGrid//Travel Calendar//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:WanderGrid Trips',
            ...events,
            'END:VCALENDAR'
        ].join('\r\n');

        res.set('Content-Type', 'text/calendar;charset=utf-8');
        res.set('Content-Disposition', 'inline; filename="wandergrid.ics"');
        res.send(icsContent);

    } catch (err) {
        console.error("Calendar Feed Error", err);
        res.status(500).send("Error generating calendar");
    }
});

// Health Check
app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'connected' });
    } catch (err) {
        res.status(500).json({ status: 'error', database: 'disconnected', message: err.message });
    }
});

// Authentication
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    try {
        const { rows } = await pool.query(
            `SELECT data FROM users WHERE LOWER(data->>'email') = LOWER($1) LIMIT 1`,
            [email.trim()]
        );
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = rows[0].data;
        if (user.password !== password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        res.json(user);
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    const user = req.body;
    if (!user.email || !user.password || !user.id) {
        return res.status(400).json({ error: 'User ID, Email, and Password are required' });
    }
    try {
        const { rows } = await pool.query(
            `SELECT 1 FROM users WHERE LOWER(data->>'email') = LOWER($1) LIMIT 1`,
            [user.email.trim()]
        );
        if (rows.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        await pool.query(
            `INSERT INTO users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
            [user.id, JSON.stringify(user)]
        );
        res.status(201).json(user);
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Users
app.get('/api/users', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT data FROM users`);
        const users = rows.map(r => {
            const u = { ...r.data };
            delete u.password; // Strip passwords to prevent credential leaks over API
            return u;
        });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', createResource('users'));

app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const updatedUser = req.body;
    try {
        const { rows } = await pool.query(`SELECT data FROM users WHERE id = $1`, [id]);
        if (rows.length > 0) {
            const prevUser = rows[0].data;
            if (!updatedUser.password || updatedUser.password.trim() === '') {
                updatedUser.password = prevUser.password;
            }
        }
        await pool.query(
            `INSERT INTO users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
            [id, JSON.stringify(updatedUser)]
        );
        res.json(updatedUser);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', deleteResource('users'));

// Trips
app.get('/api/trips', getResources('trips'));
app.post('/api/trips', createResource('trips'));
app.put('/api/trips/:id', updateResource('trips'));
app.delete('/api/trips/:id', deleteResource('trips'));

// Events (Custom Events)
app.get('/api/events', getResources('events'));
app.post('/api/events', createResource('events'));
app.put('/api/events/:id', updateResource('events'));
app.delete('/api/events/:id', deleteResource('events'));

// Entitlements
app.get('/api/entitlements', getResources('entitlements'));
app.post('/api/entitlements', createResource('entitlements'));
app.put('/api/entitlements/:id', updateResource('entitlements'));
app.delete('/api/entitlements/:id', deleteResource('entitlements'));

// Configs (Saved Holiday Configs)
app.get('/api/configs', getResources('configs'));
app.post('/api/configs', createResource('configs'));
app.put('/api/configs/:id', updateResource('configs'));
app.delete('/api/configs/:id', deleteResource('configs'));

// Flights
app.get('/api/flights', getResources('flights'));
app.post('/api/flights', createResource('flights'));
app.put('/api/flights/:id', updateResource('flights'));
app.delete('/api/flights/:id', deleteResource('flights'));

// Settings (Singleton)
app.get('/api/settings', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT data FROM settings WHERE key = 'workspace'`);
        res.json(rows.length > 0 ? rows[0].data : {});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/settings', async (req, res) => {
    try {
        const settings = req.body;
        await pool.query(
            `INSERT INTO settings (key, data) VALUES ('workspace', $1) ON CONFLICT (key) DO UPDATE SET data = $1`,
            [JSON.stringify(settings)]
        );
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Import/Export Full State
app.get('/api/backup', async (req, res) => {
    try {
        const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights'];
        const backup = {};
        
        for (const table of tables) {
            const { rows } = await pool.query(`SELECT data FROM ${table}`);
            backup[table] = rows.map(r => r.data);
        }
        
        const settingsRes = await pool.query(`SELECT data FROM settings WHERE key = 'workspace'`);
        backup.workspaceSettings = settingsRes.rows.length > 0 ? settingsRes.rows[0].data : {};
        
        res.json(backup);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/restore', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const data = req.body;
        
        // Clear existing
        const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights'];
        for (const table of tables) {
            await client.query(`TRUNCATE TABLE ${table}`);
            if (data[table] && Array.isArray(data[table])) {
                for (const item of data[table]) {
                    await client.query(`INSERT INTO ${table} (id, data) VALUES ($1, $2)`, [item.id, JSON.stringify(item)]);
                }
            }
        }
        
        if (data.workspaceSettings) {
            await client.query(
                `INSERT INTO settings (key, data) VALUES ('workspace', $1) ON CONFLICT (key) DO UPDATE SET data = $1`,
                [JSON.stringify(data.workspaceSettings)]
            );
        }
        
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Serve React App
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client_build', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
