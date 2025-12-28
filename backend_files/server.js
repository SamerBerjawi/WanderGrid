const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'client_build')));

// Initialize Database Schema
const initDb = async () => {
  const client = await pool.connect();
  try {
    // We use a generic structure where 'data' contains the JSON object
    // and 'id' is extracted for easier lookups.
    const tables = ['users', 'trips', 'events', 'entitlements', 'configs'];
    
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
    
    console.log('Database schema initialized');
  } catch (err) {
    console.error('Error initializing database', err);
  } finally {
    client.release();
  }
};

initDb();

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
    const { access_key, flight_iata } = req.query;
    if (!access_key || !flight_iata) {
        return res.status(400).json({ error: 'Missing access_key or flight_iata' });
    }
    
    try {
        const url = `http://api.aviationstack.com/v1/flights?access_key=${access_key}&flight_iata=${flight_iata}`;
        // Using built-in fetch (Node 18+)
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error("Proxy error:", err);
        res.status(500).json({ error: 'Failed to fetch flight data' });
    }
});

// Users
app.get('/api/users', getResources('users'));
app.post('/api/users', createResource('users'));
app.put('/api/users/:id', updateResource('users'));
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
        const tables = ['users', 'trips', 'events', 'entitlements', 'configs'];
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
        const tables = ['users', 'trips', 'events', 'entitlements', 'configs'];
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