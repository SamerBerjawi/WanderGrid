'use strict';
// Creates the tables and indexes that are missing (CREATE ... IF NOT EXISTS), then runs the numbered migrations
// (D-06). Retries while the database starts. Moved out of server.js unchanged (decision D-07).
const { runMigrations } = require('./migrations');

module.exports = function createInitDb({ pool, onReady }) {
  // Initialize Database Schema with automatic retry mechanism
  const initDb = async (retries = 10, delayMs = 3000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`Connecting to database (attempt ${attempt}/${retries})...`);
        const client = await pool.connect();
        try {
          // We use a generic structure where 'data' contains the JSON object
          // and 'id' is extracted for easier lookups.
          const tables = ['users', 'trips', 'events', 'entitlements', 'configs', 'flights', 'visited'];
          
          for (const table of tables) {
            await client.query(`
              CREATE TABLE IF NOT EXISTS ${table} (
                id TEXT PRIMARY KEY CHECK (id <> ''),
                data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object')
              );
            `);
          }

          // Settings is a singleton, key-value store
          await client.query(`
              CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY CHECK (key <> ''),
                data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object')
              );
          `);

          // Global airports database table
          await client.query(`
              CREATE TABLE IF NOT EXISTS global_airports (
                id SERIAL PRIMARY KEY,
                iata VARCHAR(10) CHECK (iata <> ''),
                city_name TEXT,
                airport_name TEXT
              );
          `);
          
          // Global carriers database table
          await client.query(`
              CREATE TABLE IF NOT EXISTS global_carriers (
                id SERIAL PRIMARY KEY,
                iata VARCHAR(10) CHECK (iata <> ''),
                company_name TEXT,
                country_or_territory TEXT
              );
          `);

          // Global geocoding cache table
          await client.query(`
              CREATE TABLE IF NOT EXISTS geocoding_cache (
                query TEXT PRIMARY KEY CHECK (query <> ''),
                results JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
              );
          `);

          // Global route-flights cache table
          await client.query(`
              CREATE TABLE IF NOT EXISTS cached_routes (
                id SERIAL PRIMARY KEY,
                route_key VARCHAR(255) UNIQUE CHECK (route_key <> ''),
                payload JSONB NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
              );
          `);

          // Public trip links: one row per trip that is shared; the token is the only key (sharedTrip.js)
          await client.query(`
              CREATE TABLE IF NOT EXISTS trip_shares (
                token TEXT PRIMARY KEY CHECK (token <> ''),
                trip_id TEXT NOT NULL UNIQUE,
                created_by TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
              );
          `);

          // Whole-document GIN indexes were never used by any query but were rewritten on every save, and the
          // dataset tables had duplicate iata indexes; drop them on existing databases (PERF-012).
          console.log('Creating database indexes on core tables...');
          for (const unused of ['idx_trips_data', 'idx_users_data', 'idx_flights_data', 'idx_events_data', 'idx_configs_data', 'idx_airports_iata', 'idx_carriers_iata']) {
              await client.query(`DROP INDEX IF EXISTS ${unused}`);
          }
          
          // Strict Unique Functional User Email Index (Unique user email index)
          await client.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users ((LOWER(data->>'email'))) WHERE (data->>'email' IS NOT NULL)");
          
          // Trip Field Performance Indexes
          await client.query("CREATE INDEX IF NOT EXISTS idx_trips_status ON trips ((data->>'status'))");
          await client.query("CREATE INDEX IF NOT EXISTS idx_trips_start_date ON trips ((data->>'startDate'))");
          await client.query("CREATE INDEX IF NOT EXISTS idx_trips_end_date ON trips ((data->>'endDate'))");
          await client.query("CREATE INDEX IF NOT EXISTS idx_trips_privacy ON trips ((data->>'privacy'))");

          // Flight Field Performance Indexes
          await client.query("CREATE INDEX IF NOT EXISTS idx_flights_departure_date ON flights ((data->>'departureDate'))");
          await client.query("CREATE INDEX IF NOT EXISTS idx_flights_provider_identifier ON flights ((data->>'provider'), (data->>'identifier'))");

          // Global Airport/Carrier Lookup Indexes
          await client.query("CREATE INDEX IF NOT EXISTS idx_global_airports_iata ON global_airports (iata)");
          await client.query("CREATE INDEX IF NOT EXISTS idx_global_carriers_iata ON global_carriers (iata)");

          // Geocode Cache Indexes
          await client.query("CREATE INDEX IF NOT EXISTS idx_geocoding_cache_created_at ON geocoding_cache (created_at)");

          // Route Cache Indexes
          await client.query("CREATE INDEX IF NOT EXISTS idx_cached_routes_route_key ON cached_routes (route_key)");
          
          console.log('Database schema initialized successfully!');

          // Shape changes to stored JSON (D-06). Runs after the tables exist and before the server reports ready.
          const appliedMigrations = await runMigrations(pool);
          if (appliedMigrations.length) console.log(`Applied ${appliedMigrations.length} migration(s): ${appliedMigrations.join(', ')}`);

          // Startup db confirmation
          console.log('Database initialization check completed: Users table ready for enrollment.');
          onReady();

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

  return initDb;
};
