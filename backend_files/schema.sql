-- WanderGrid database schema.
-- GENERATED from dbSchema.js by `npm run schema` in backend_files/. Do not edit by hand: change dbSchema.js and
-- regenerate. The server creates all of this itself at startup; this file is for reading and for manual setups.
-- Changes to the shape of stored JSON are numbered migrations in migrations/ and are not part of this file.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY CHECK (id <> ''),
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object')
);

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY CHECK (id <> ''),
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object')
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY CHECK (id <> ''),
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object')
);

CREATE TABLE IF NOT EXISTS entitlements (
  id TEXT PRIMARY KEY CHECK (id <> ''),
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object')
);

CREATE TABLE IF NOT EXISTS configs (
  id TEXT PRIMARY KEY CHECK (id <> ''),
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object')
);

CREATE TABLE IF NOT EXISTS flights (
  id TEXT PRIMARY KEY CHECK (id <> ''),
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object')
);

CREATE TABLE IF NOT EXISTS visited (
  id TEXT PRIMARY KEY CHECK (id <> ''),
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object')
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY CHECK (key <> ''),
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object')
);

CREATE TABLE IF NOT EXISTS global_airports (
  id SERIAL PRIMARY KEY,
  iata VARCHAR(10) CHECK (iata <> ''),
  city_name TEXT,
  airport_name TEXT
);

CREATE TABLE IF NOT EXISTS global_carriers (
  id SERIAL PRIMARY KEY,
  iata VARCHAR(10) CHECK (iata <> ''),
  company_name TEXT,
  country_or_territory TEXT
);

CREATE TABLE IF NOT EXISTS geocoding_cache (
  query TEXT PRIMARY KEY CHECK (query <> ''),
  results JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cached_routes (
  id SERIAL PRIMARY KEY,
  route_key VARCHAR(255) UNIQUE CHECK (route_key <> ''),
  payload JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trip_shares (
  token TEXT PRIMARY KEY CHECK (token <> ''),
  trip_id TEXT NOT NULL UNIQUE,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users ((LOWER(data->>'email'))) WHERE (data->>'email' IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_users_calendar_token ON users ((data->>'calendarToken')) WHERE (data->>'calendarToken' IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_trips_start_date ON trips ((data->>'startDate'));
CREATE INDEX IF NOT EXISTS idx_trips_end_date ON trips ((data->>'endDate'));
CREATE INDEX IF NOT EXISTS idx_trips_privacy ON trips ((data->>'privacy'));
CREATE INDEX IF NOT EXISTS idx_flights_departure_date ON flights ((data->>'departureDate'));
CREATE INDEX IF NOT EXISTS idx_flights_provider_identifier ON flights ((data->>'provider'), (data->>'identifier'));
CREATE INDEX IF NOT EXISTS idx_global_airports_iata ON global_airports (iata);
CREATE INDEX IF NOT EXISTS idx_global_carriers_iata ON global_carriers (iata);
CREATE INDEX IF NOT EXISTS idx_geocoding_cache_created_at ON geocoding_cache (created_at);
CREATE INDEX IF NOT EXISTS idx_cached_routes_route_key ON cached_routes (route_key);

-- Dropped on existing databases (never used by a query)
DROP INDEX IF EXISTS idx_trips_data;
DROP INDEX IF EXISTS idx_users_data;
DROP INDEX IF EXISTS idx_flights_data;
DROP INDEX IF EXISTS idx_events_data;
DROP INDEX IF EXISTS idx_configs_data;
DROP INDEX IF EXISTS idx_airports_iata;
DROP INDEX IF EXISTS idx_carriers_iata;
