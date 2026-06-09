-- WanderGrid Production Database Schema
-- Optimized for high-performance indexing, PostgreSQL connection pooling, and strict consistency

-- 1. Core tables with JSON object constraints and non-empty ID constraints
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

-- Settings singleton standard config table
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY CHECK (key <> ''),
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object')
);

-- 2. Global Static Datasets Tables
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

-- 3. Geocode Cache Table
CREATE TABLE IF NOT EXISTS geocoding_cache (
  query TEXT PRIMARY KEY CHECK (query <> ''),
  results JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Global Route-Flights Cache Table
CREATE TABLE IF NOT EXISTS cached_routes (
  id SERIAL PRIMARY KEY,
  route_key VARCHAR(255) UNIQUE CHECK (route_key <> ''),
  payload JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Database Core Performance & Search GIN Indexes
CREATE INDEX IF NOT EXISTS idx_trips_data ON trips USING gin (data);
CREATE INDEX IF NOT EXISTS idx_users_data ON users USING gin (data);
CREATE INDEX IF NOT EXISTS idx_flights_data ON flights USING gin (data);
CREATE INDEX IF NOT EXISTS idx_events_data ON events USING gin (data);
CREATE INDEX IF NOT EXISTS idx_configs_data ON configs USING gin (data);

-- 5. Strict Unique Functional User Email Index (Unique user email index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users ((LOWER(data->>'email'))) WHERE (data->>'email' IS NOT NULL);

-- 6. Trip Field Performance Indexes
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_trips_start_date ON trips ((data->>'startDate'));
CREATE INDEX IF NOT EXISTS idx_trips_end_date ON trips ((data->>'endDate'));
CREATE INDEX IF NOT EXISTS idx_trips_privacy ON trips ((data->>'privacy'));

-- 7. Flight Field Performance Indexes
CREATE INDEX IF NOT EXISTS idx_flights_departure_date ON flights ((data->>'departureDate'));
CREATE INDEX IF NOT EXISTS idx_flights_provider_identifier ON flights ((data->>'provider'), (data->>'identifier'));

-- 8. Global Airport/Carrier Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_global_airports_iata ON global_airports (iata);
CREATE INDEX IF NOT EXISTS idx_global_carriers_iata ON global_carriers (iata);

-- 9. Geocode Cache Indexes
CREATE INDEX IF NOT EXISTS idx_geocoding_cache_created_at ON geocoding_cache (created_at);

-- 10. Route Cache Indexes
CREATE INDEX IF NOT EXISTS idx_cached_routes_route_key ON cached_routes (route_key);
