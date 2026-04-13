-- Enable PostGIS extension for spatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create spatial index on fuel_stations (run after Drizzle migration)
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS fuel_stations_location_idx
--   ON fuel_stations USING GIST(ST_SetSRID(ST_MakePoint(lon, lat), 4326));
