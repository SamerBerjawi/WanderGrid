-- WanderGrid PostgreSQL schema baseline.
-- server.js also applies this schema at boot for self-healing container deploys.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  CONSTRAINT users_id_not_blank CHECK (length(trim(id)) > 0),
  CONSTRAINT users_data_is_object CHECK (jsonb_typeof(data) = 'object')
);

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  CONSTRAINT trips_id_not_blank CHECK (length(trim(id)) > 0),
  CONSTRAINT trips_data_is_object CHECK (jsonb_typeof(data) = 'object')
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  CONSTRAINT events_id_not_blank CHECK (length(trim(id)) > 0),
  CONSTRAINT events_data_is_object CHECK (jsonb_typeof(data) = 'object')
);

CREATE TABLE IF NOT EXISTS entitlements (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  CONSTRAINT entitlements_id_not_blank CHECK (length(trim(id)) > 0),
  CONSTRAINT entitlements_data_is_object CHECK (jsonb_typeof(data) = 'object')
);

CREATE TABLE IF NOT EXISTS configs (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  CONSTRAINT configs_id_not_blank CHECK (length(trim(id)) > 0),
  CONSTRAINT configs_data_is_object CHECK (jsonb_typeof(data) = 'object')
);

CREATE TABLE IF NOT EXISTS flights (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  CONSTRAINT flights_id_not_blank CHECK (length(trim(id)) > 0),
  CONSTRAINT flights_data_is_object CHECK (jsonb_typeof(data) = 'object')
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  CONSTRAINT settings_key_not_blank CHECK (length(trim(key)) > 0),
  CONSTRAINT settings_data_is_object CHECK (jsonb_typeof(data) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (LOWER(data->>'email')) WHERE data ? 'email';
CREATE INDEX IF NOT EXISTS idx_users_data_gin ON users USING GIN (data jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_trips_data_gin ON trips USING GIN (data jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_trips_start_date ON trips ((data->>'startDate'));
CREATE INDEX IF NOT EXISTS idx_trips_end_date ON trips ((data->>'endDate'));
CREATE INDEX IF NOT EXISTS idx_trips_privacy ON trips ((data->>'privacy'));
CREATE INDEX IF NOT EXISTS idx_events_data_gin ON events USING GIN (data jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_entitlements_data_gin ON entitlements USING GIN (data jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_configs_data_gin ON configs USING GIN (data jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_flights_data_gin ON flights USING GIN (data jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_flights_departure_date ON flights ((data->>'departureDate'));
CREATE INDEX IF NOT EXISTS idx_flights_provider_identifier ON flights ((data->>'provider'), (data->>'identifier'));

CREATE TABLE IF NOT EXISTS geocode_cache (
  query TEXT PRIMARY KEY,
  result JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT geocode_cache_query_not_blank CHECK (length(trim(query)) > 0),
  CONSTRAINT geocode_cache_result_is_object CHECK (jsonb_typeof(result) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_geocode_cache_updated_at ON geocode_cache(updated_at);

CREATE TABLE IF NOT EXISTS global_airports (
  id SERIAL PRIMARY KEY,
  iata VARCHAR(10),
  city_name TEXT,
  airport_name TEXT,
  CONSTRAINT global_airports_iata_not_blank CHECK (iata IS NULL OR length(trim(iata)) > 0)
);

CREATE TABLE IF NOT EXISTS global_carriers (
  id SERIAL PRIMARY KEY,
  iata VARCHAR(10),
  company_name TEXT,
  country_or_territory TEXT,
  CONSTRAINT global_carriers_identity_not_blank CHECK (
    (iata IS NOT NULL AND length(trim(iata)) > 0)
    OR (company_name IS NOT NULL AND length(trim(company_name)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_airports_iata ON global_airports(iata);
CREATE INDEX IF NOT EXISTS idx_airports_city_name ON global_airports(city_name);
CREATE INDEX IF NOT EXISTS idx_airports_airport_name ON global_airports(airport_name);
CREATE INDEX IF NOT EXISTS idx_carriers_iata ON global_carriers(iata);
CREATE INDEX IF NOT EXISTS idx_carriers_company_name ON global_carriers(company_name);
