# FuelGPS — AI Development Prompt (Claude / Cursor / Copilot)
> Crafted by a professional GPS industry developer (Apple Maps / ex-Google Maps background).  
> This prompt is the single source of truth for building FuelGPS v2 end-to-end.

---

## 0. CONTEXT & IDENTITY

You are building **FuelGPS**, a production-grade, Italy-focused web and mobile-ready application for locating fuel stations (benzina, diesel, GPL, metano, EV charging) and planning smart routes based on vehicle type, fuel needs, and real-world road constraints. Think of it as the intersection of Waze, GasBuddy, and Apple Maps — engineered specifically for the Italian market and expanding to all of Europe.

The target users are:
- **Private motorists** (cars, motorcycles) looking for the cheapest or nearest fuel
- **Commercial operators** (vans, light trucks, HGVs) needing route planning that respects vehicle restrictions (height, weight, width, length, hazmat)
- **Fleet managers** needing multi-stop optimization and cost reporting

The app is self-hosted on a personal Ubuntu server. Revenue model: freemium (basic free, Pro tier at ~€3.99/month). Target: first paying user by October 2026.

The existing codebase is TypeScript (React + Vite frontend, Express backend, Drizzle ORM, PostgreSQL, Docker, Nginx). Do not break existing infrastructure. Build on top of it.

---

## 1. PROJECT ARCHITECTURE

### 1.1 Stack (Confirmed, Do Not Change)
- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS v3 + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL 15 via Drizzle ORM
- **Cache**: Redis (add if not present) for station data TTL (24h) and route caching (1h)
- **Infrastructure**: Docker + Docker Compose + Nginx reverse proxy
- **Maps**: Leaflet.js (free) + OpenStreetMap tiles via Stamen/CartoDB (free tier)
- **Routing Engine**: OSRM (Open Source Routing Machine) — self-hosted or public API
- **Station Data**: OpenStreetMap Overpass API + MIT's official Italian MISE/MIMIT fuel station dataset
- **EV Data**: OCPI protocol feeds + OpenChargeMap API (free tier, 1000 req/day)
- **Geocoding**: Nominatim (free, self-hostable) with Photon as fallback

### 1.2 Repository Structure (Extend, Don't Rebuild)
```
FuelGPS/
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── map/           # Map components (NEW)
│   │   │   ├── routing/       # Vehicle routing UI (NEW)
│   │   │   ├── stations/      # Station card, details, filter (NEW)
│   │   │   └── ui/            # shadcn/ui base components
│   │   ├── hooks/
│   │   │   ├── useStations.ts      # NEW
│   │   │   ├── useRouting.ts       # NEW
│   │   │   └── useVehicleProfile.ts # NEW
│   │   ├── lib/
│   │   │   ├── overpass.ts    # Overpass API client (NEW)
│   │   │   ├── osrm.ts        # OSRM routing client (NEW)
│   │   │   └── priceUtils.ts  # Price parsing + comparison (NEW)
│   │   ├── pages/
│   │   │   ├── Map.tsx        # Main map view (EXTEND/CREATE)
│   │   │   ├── Route.tsx      # Route planning view (NEW)
│   │   │   └── Settings.tsx   # Vehicle profiles + preferences (NEW)
│   │   └── types/
│   │       └── index.ts       # Shared types for vehicles, stations (EXTEND)
├── server/
│   ├── routes/
│   │   ├── stations.ts        # Station CRUD + sync from Overpass (EXTEND)
│   │   ├── routing.ts         # Route calculation endpoint (NEW)
│   │   └── prices.ts          # Price submission + aggregation (NEW)
│   ├── services/
│   │   ├── overpassSync.ts    # Full Italy station ingest, no query limit (NEW)
│   │   ├── osrmService.ts     # OSRM wrapper with vehicle profiles (NEW)
│   │   ├── priceService.ts    # Price aggregation + crowd-sourcing (NEW)
│   │   └── geocodingService.ts # Nominatim wrapper (NEW)
│   └── jobs/
│       └── stationSync.cron.ts # Scheduled sync every 24h (NEW)
├── shared/
│   └── schema.ts              # Drizzle schema extensions (EXTEND)
├── scripts/
│   └── ingestAllItaly.ts      # One-time full Italy ingestion script (NEW)
└── docker-compose.yml         # Add Redis, OSRM containers (EXTEND)
```

---

## 2. DATA LAYER — ALL ITALIAN FUEL STATIONS (NO QUERY LIMIT)

This is the most critical section. You MUST ingest ALL fuel stations across Italy. Do not limit by query size.

### 2.1 Primary Data Source — MIMIT (Ministero delle Imprese e del Made in Italy)
The Italian government publishes a **free, open dataset** of all authorized fuel stations via the MIMIT transparency portal:
- Dataset URL: `https://dgsaie.mise.gov.it/open-data` (search "impianti carburante")
- Direct CSV download endpoint (as of 2025): `https://dgsaie.mise.gov.it/open-data-file?type=IMPIANTI_STAZIONI_SERVIZIO`
- This dataset contains **~22,000 active stations** with: IDIMPIANTO, GESTORE, BANDIERA, TIPO IMPIANTO, NOME VIA, NUMERO, COMUNE, PROVINCIA, LATITUDINE, LONGITUDINE
- Prices dataset (updated twice daily): `https://dgsaie.mise.gov.it/open-data-file?type=PREZZO_DI_PRODOTTO_STAZIONE`
- **Both are completely free, no API key required, no rate limit.**

### 2.2 Secondary Source — OpenStreetMap Overpass API
Use Overpass for additional metadata (opening hours, amenities, EV chargers):
```
[out:json][timeout:300];
area["ISO3166-1"="IT"][admin_level=2]->.italy;
(
  node["amenity"="fuel"](area.italy);
  way["amenity"="fuel"](area.italy);
  relation["amenity"="fuel"](area.italy);
  node["amenity"="charging_station"](area.italy);
  way["amenity"="charging_station"](area.italy);
);
out body center;
```

**CRITICAL — Remove the query limit:**
The Overpass public endpoint (`https://overpass-api.de/api/interpreter`) allows queries with `[timeout:300]`. Do NOT paginate artificially. Use a single large query or batch by Italian region (20 regions) to stay under the 512MB RAM limit per query. Implement this batching in `server/services/overpassSync.ts`:

```typescript
const ITALIAN_REGIONS = [
  "Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna",
  "Friuli-Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche",
  "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana",
  "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto"
];

// Query each region with 1s delay between calls — no artificial record limit
async function ingestRegion(regionName: string): Promise<OSMStation[]> {
  const query = `
    [out:json][timeout:180];
    area["name"="${regionName}"]["admin_level"="4"]->.region;
    (
      node["amenity"="fuel"](area.region);
      way["amenity"="fuel"](area.region);
      node["amenity"="charging_station"](area.region);
    );
    out body center;
  `;
  // fetch + parse + return
}
```

### 2.3 Data Merge Strategy
1. **Primary source = MIMIT CSV** (authoritative, government-licensed, always preferred)
2. **Enrich with OSM data** by matching on (lat/lon within 50m radius OR name similarity > 0.85)
3. **Store merged record** in PostgreSQL with `source: "mimit" | "osm" | "merged"`
4. **Upsert on IDIMPIANTO** for MIMIT records; on OSM node ID for OSM-only records

### 2.4 Database Schema Extensions (Drizzle)
Add to `shared/schema.ts`:

```typescript
export const fuelStations = pgTable("fuel_stations", {
  id: uuid("id").defaultRandom().primaryKey(),
  mimitId: varchar("mimit_id", { length: 20 }).unique(),
  osmId: varchar("osm_id", { length: 20 }),
  name: varchar("name", { length: 255 }).notNull(),
  brand: varchar("brand", { length: 100 }),         // e.g. ENI, Shell, Q8, IP, Esso, Tamoil
  operator: varchar("operator", { length: 255 }),
  address: text("address"),
  municipality: varchar("municipality", { length: 100 }),
  province: varchar("province", { length: 5 }),      // e.g. TO, MI, RM
  region: varchar("region", { length: 50 }),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  location: geometry("location", { type: "point", srid: 4326 }),  // PostGIS
  fuelTypes: jsonb("fuel_types").$type<FuelType[]>(),   // ["benzina","diesel","gpl","metano","adblue"]
  hasEV: boolean("has_ev").default(false),
  evConnectors: jsonb("ev_connectors").$type<EVConnector[]>(),
  openingHours: text("opening_hours"),               // OSM hours format
  is24h: boolean("is_24h").default(false),
  hasCar: boolean("has_car").default(true),
  hasTruck: boolean("has_truck").default(false),     // high-clearance pump, separate lane
  hasAdBlue: boolean("has_adblue").default(false),
  hasSelfService: boolean("has_self_service").default(true),
  hasAttendant: boolean("has_attendant").default(false),
  hasCarWash: boolean("has_car_wash").default(false),
  hasShop: boolean("has_shop").default(false),
  source: varchar("source", { length: 10 }).default("mimit"),
  lastSynced: timestamp("last_synced").defaultNow(),
  isActive: boolean("is_active").default(true),
});

export const fuelPrices = pgTable("fuel_prices", {
  id: uuid("id").defaultRandom().primaryKey(),
  stationId: uuid("station_id").references(() => fuelStations.id),
  fuelType: varchar("fuel_type", { length: 20 }).notNull(),
  price: doublePrecision("price").notNull(),          // EUR/liter
  isSelfService: boolean("is_self_service").default(true),
  source: varchar("source", { length: 10 }),          // "mimit" | "user"
  reportedAt: timestamp("reported_at").defaultNow(),
  validUntil: timestamp("valid_until"),
});

export const vehicleProfiles = pgTable("vehicle_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: varchar("user_id", { length: 255 }),        // null = guest, stored in localStorage
  name: varchar("name", { length: 100 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(),    // "car" | "van" | "truck" | "motorcycle" | "ev"
  fuelType: varchar("fuel_type", { length: 20 }),     // "benzina" | "diesel" | "gpl" | "metano" | "electric"
  heightM: doublePrecision("height_m"),               // meters — for truck routing
  widthM: doublePrecision("width_m"),
  lengthM: doublePrecision("length_m"),
  weightKg: doublePrecision("weight_kg"),             // gross vehicle weight
  axleWeightKg: doublePrecision("axle_weight_kg"),
  isHazmat: boolean("is_hazmat").default(false),
  tankCapacityL: doublePrecision("tank_capacity_l"),
  consumptionLper100km: doublePrecision("consumption_l_per_100km"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});
```

Also add PostGIS extension initialization in your migration:
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE INDEX CONCURRENTLY IF NOT EXISTS fuel_stations_location_idx 
  ON fuel_stations USING GIST(location);
```

---

## 3. SMART ROUTING ENGINE

### 3.1 Architecture
The routing engine must consider vehicle type at every step. It wraps OSRM with a custom pre/post processing layer.

**OSRM Profiles to use (or request via public API with profile param):**
| Vehicle Type | OSRM Profile | Notes |
|---|---|---|
| Car | `car` | Default |
| Motorcycle | `car` | Same road access |
| Van (<3.5t) | `car` | May need height filter |
| Light truck (3.5–7.5t) | `car` with weight overlay | Filter low bridges |
| HGV (>7.5t) | `truck` | Mandatory: OpenStreetMap has truck restrictions |
| EV | `car` | Override with EV charging waypoints |

**Self-hosted OSRM** (add to docker-compose.yml):
```yaml
osrm-backend:
  image: osrm/osrm-backend:latest
  volumes:
    - ./osrm-data:/data
  command: >
    osrm-routed --algorithm mld
    /data/italy-latest.osrm
    --max-table-size 10000
  ports:
    - "5000:5000"
```

Download + preprocess:
```bash
wget https://download.geofabrik.de/europe/italy-latest.osm.pbf -P ./osrm-data/
docker run -t -v "${PWD}/osrm-data:/data" osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/italy-latest.osm.pbf
docker run -t -v "${PWD}/osrm-data:/data" osrm/osrm-backend \
  osrm-partition /data/italy-latest.osrm
docker run -t -v "${PWD}/osrm-data:/data" osrm/osrm-backend \
  osrm-customize /data/italy-latest.osrm
```

### 3.2 Vehicle-Aware Route Planning (`server/services/osrmService.ts`)

```typescript
interface RoutingRequest {
  origin: [number, number];       // [lat, lon]
  destination: [number, number];
  vehicleProfile: VehicleProfile;
  optimizeFor: "fastest" | "cheapest_fuel" | "avoid_tolls" | "ev_range";
  includeRefuelStops: boolean;
  currentFuelLiters?: number;
  maxDetourKm?: number;            // max detour to reach a fuel stop (default: 5km)
}

interface RouteResult {
  legs: RouteLeg[];
  totalDistanceKm: number;
  totalDurationMin: number;
  tollCostEur?: number;
  fuelStopsRecommended: FuelStop[];  // calculated from tank + consumption
  estimatedFuelCostEur: number;
  warnings: RouteWarning[];         // low bridge, weight limit, etc.
}
```

### 3.3 Fuel Stop Optimization Algorithm
Implement the following greedy algorithm in `server/services/routingOptimizer.ts`:

1. **Calculate range**: `rangeKm = (currentFuelL / 100) * (100 / consumptionLper100km)`
2. **Project route**: Walk the OSRM polyline, tracking distance from last fill
3. **Trigger stop search**: When `remainingRangeKm < safetyThreshold` (default: 20% of max range), search for stations:
   - Within `maxDetourKm` of the current polyline position
   - Matching the vehicle's fuel type
   - If truck: `hasTruck = true`, or within a truck-accessible route
4. **Price optimization**: Among candidate stations, rank by: `price * (1 + detourKm * 0.02)` — balance cheapness vs. detour cost
5. **Insert waypoint**: Re-route through selected station, update remaining fuel, continue
6. **EV variant**: Replace "fuel level" with "battery %" and search for `hasEV = true` stations with compatible connectors

### 3.4 Vehicle Restriction Overlay
For trucks and large vans, apply pre-filters before routing:
- Query OSM for edges tagged `maxheight`, `maxweight`, `maxwidth`, `hgv=no`, `access=no` along the route corridor
- If the vehicle's dimensions exceed any tag, flag the route with a `RouteWarning` and offer an alternative
- Use the `/table` OSRM endpoint for efficient multi-point calculations when comparing fuel stop candidates

---

## 4. FRONTEND — MAP & ROUTING UI

### 4.1 Main Map Page (`client/src/pages/Map.tsx`)

Build a full-viewport interactive map with the following layers and UI:

**Map initialization:**
```typescript
// Use Leaflet + OpenStreetMap (CartoDB Positron tiles for clean aesthetic)
const tileUrl = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
// Attribution required: © OpenStreetMap contributors, © CARTO
```

**Station markers:**
- Cluster markers at zoom < 10 using `leaflet.markercluster`
- At zoom >= 12: individual icons color-coded by fuel brand (ENI=yellow, Shell=red, Q8=orange, IP=blue, generic=gray)
- On click: slide-up bottom sheet with station details (name, address, prices, hours, amenities, distance)
- Price badge on marker: show cheapest available fuel price in €/L

**Filter panel (slide-in sidebar, desktop: left panel):**
```
[ Fuel Type ]   ○ Benzina  ○ Diesel  ○ GPL  ○ Metano  ○ EV
[ Open Now  ]   ☐ Only open stations
[ Vehicle   ]   ○ Car  ○ Van  ○ Truck  ○ Motorcycle  ○ EV
[ Features  ]   ☐ Self-service  ☐ Attendant  ☐ Car wash  ☐ Shop  ☐ AdBlue
[ Brand     ]   Multi-select dropdown: ENI, Shell, Q8, IP, Esso, Tamoil, other
[ Max price ]   Slider: €0 — €3.00/L
```

**Search bar (top of map):**
- Geocode via Nominatim, autocomplete Italian addresses and POIs
- "Near me" button using browser Geolocation API
- Show trip planner: origin → destination fields, vehicle selector dropdown

**Performance:**
- Only fetch stations in current viewport + 20% buffer
- Use PostGIS `ST_DWithin` for spatial queries; never scan full table
- Cache viewport queries in Redis with bbox as key (TTL: 5 minutes)
- Virtual rendering: use `leaflet.markercluster` for any cluster > 100 items

### 4.2 Station Detail Bottom Sheet
Show on marker click:
```
[ Brand Logo ]  Station Name
[ Address    ]  Via Roma 12, Torino (TO)
──────────────────────────────
Prezzi aggiornati: 2h fa
  Benzina SS    €1.789
  Benzina Serv  €1.859
  Diesel SS     €1.699
  GPL           €0.789
──────────────────────────────
⏰ Aperto 24/7
🚛 Adatto camion  🧼 Autolavaggio  🛍️ Shop
──────────────────────────────
[ 📍 Come arrivare ]  [ 💰 Segnala prezzo ]
```

### 4.3 Route Planning View (`client/src/pages/Route.tsx`)

Split layout (desktop: map left 65%, panel right 35%; mobile: stacked):

**Input panel:**
```
Origin    [__________________________] 📍
Destination [________________________] 📍

Vehicle Profile
  [ + New Profile ]
  ▼ My Car (Benzina, 6.5L/100km)

Options
  Optimize for:  ○ Fastest  ○ Cheapest fuel  ○ Avoid tolls
  ○ Include fuel stops  (if checked:)
    Current fuel: [====|    ] 45L / 60L
    Max detour to station: [5 km]

[ 🔍 Calculate Route ]
```

**Results panel (after calculation):**
```
🛣️  387 km  |  ⏱️ 4h 12min  |  ⛽ €52.40

── Leg 1: Torino → A1 (142km) ──────────
── ⛽ Fuel stop: ENI Novara Nord (A26) ──
    Diesel: €1.699 | +3.2 km detour
    [ View on map ]
── Leg 2: A1 → Bologna (245km) ──────────

⚠️  Attenzione: Limite altezza 3.8m a Bologna
    La tua direttiva: 4.2m

[ 📤 Condividi percorso ]  [ 🗺️ Avvia navigazione ]
```

### 4.4 Vehicle Profile Manager (`client/src/pages/Settings.tsx`)

Allow users to save multiple vehicle profiles locally (localStorage) and optionally to account:

```
Profile Name:    [ La mia Ducato          ]
Tipo veicolo:    ○ Auto  ○ Moto  ● Furgone  ○ Camion  ○ EV
Carburante:      ● Diesel  ○ Benzina  ○ GPL  ○ Metano  ○ Elettrico

Dimensioni (per camion/furgoni)
  Altezza:  [2.8] m    Larghezza: [2.1] m
  Lunghezza:[5.9] m    Peso:      [3200] kg

Serbatoio:       [70] L
Consumo medio:   [8.5] L/100km

[ 💾 Salva profilo ]
```

---

## 5. PRICE CROWD-SOURCING SYSTEM

### 5.1 User Price Reports
Allow any user (anonymous or registered) to submit a fuel price:

```typescript
// POST /api/prices/report
interface PriceReport {
  stationId: string;
  fuelType: FuelType;
  price: number;
  isSelfService: boolean;
  reportedAt: Date;          // client timestamp
  userIp?: string;           // for basic deduplication
}
```

Validation rules:
- Price must be between €0.50/L and €5.00/L
- One report per IP per station per hour
- If price deviates > 15% from MIMIT official price, flag for review

### 5.2 Price Aggregation
Display to user the "best available price" logic:
1. If MIMIT price updated < 24h ago → show MIMIT price (labeled "Ufficiale")
2. If user report < 4h old and not flagged → show user price (labeled "Segnalato")
3. Else → show last known price with staleness indicator ("Aggiornato Xh fa")

---

## 6. BACKEND API ROUTES

### 6.1 Station Endpoints
```
GET  /api/stations              Query params: bbox, fuelType, vehicleType, brand, isOpen
GET  /api/stations/:id          Full station details with latest prices
GET  /api/stations/nearby       Query params: lat, lon, radiusKm, limit
POST /api/stations/sync         Admin: trigger full re-sync from MIMIT + OSM (protected)
```

### 6.2 Routing Endpoints
```
POST /api/routes/calculate      Body: RoutingRequest → RouteResult
GET  /api/routes/fuel-stops     Query: lat, lon, vehicleProfileId, rangeKm → FuelStop[]
```

### 6.3 Price Endpoints
```
GET  /api/prices/:stationId     All current prices for a station
POST /api/prices/report         User price report submission
GET  /api/prices/stats          Regional average prices (for dashboard/heatmap)
```

---

## 7. SCHEDULED SYNC JOB

Implement in `server/jobs/stationSync.cron.ts` using `node-cron`:

```typescript
// Run every day at 03:00 AM (low traffic)
cron.schedule("0 3 * * *", async () => {
  // 1. Download fresh MIMIT CSV
  // 2. Parse and upsert all ~22,000 stations
  // 3. For each station with OSM match, enrich metadata
  // 4. Download fresh MIMIT price file (contains prices for all stations)
  // 5. Upsert all prices
  // 6. Log sync stats to DB
  // 7. Invalidate Redis cache
});

// Price sync runs every 6 hours (MIMIT updates twice daily)
cron.schedule("0 */6 * * *", async () => {
  // Only download + upsert prices file
});
```

The **one-time full ingestion script** (`scripts/ingestAllItaly.ts`) must:
1. Download MIMIT CSV (~22,000 rows) — no pagination needed, it's one file
2. Parse CSV (encoding: ISO-8859-1, separator: `;`)
3. Batch insert in chunks of 500 using Drizzle `onConflictDoUpdate`
4. Then query all 20 Italian regions via Overpass, 1s delay between regions
5. Match + merge with MIMIT data
6. Print summary: `Inserted: X, Updated: Y, OSM-enriched: Z, Skipped: W`

---

## 8. PERFORMANCE & SCALABILITY

- **PostGIS spatial index** on `location` column — mandatory for all geo queries
- **Redis cache** with bbox-based keys for viewport queries (TTL 5min)
- **Materialized view** for regional price averages (refresh every 6h with sync job)
- **Pagination**: all list endpoints use cursor-based pagination (no `OFFSET`)
- **Rate limiting**: `express-rate-limit` on public endpoints (100 req/min per IP)
- **Compression**: `gzip` on all API responses via Nginx (already in nginx.conf)
- **Database connections**: `pg` pool size 10 (development), 25 (production)
- **OSRM caching**: Cache route results in Redis by `hash(origin+dest+vehicleProfile)` (TTL 1h)

---

## 9. SECURITY

- **Helmet.js** middleware on all Express routes
- **CORS**: restrict to your domain in production
- **Input sanitization**: validate all coordinates (lat ∈ [-90,90], lon ∈ [-180,180])
- **Price submissions**: rate limit + basic anomaly detection
- **Environment variables**: all secrets in `.env` (already in `.env.example`)
- **Admin routes**: protect `/api/stations/sync` with `ADMIN_SECRET` header check

---

## 10. UI DESIGN SYSTEM

Follow these design principles (consistent with the existing Tailwind config):

**Color palette:**
- Primary: `#01696f` (teal) — used for CTAs, active states, selected stations
- Surface: warm off-white `#f7f6f2` (light), dark `#171614` (dark)
- Fuel type colors: Benzina=`#ef4444`, Diesel=`#3b82f6`, GPL=`#22c55e`, Metano=`#8b5cf6`, EV=`#06b6d4`

**Typography:**
- Display/headings: Satoshi (Fontshare)
- Body: Inter (Google Fonts)
- Numeric data (prices): `font-variant-numeric: tabular-nums` for alignment

**Mobile-first:** The app must be fully functional on a 375px viewport. The map takes 100dvh. Bottom sheets use `safe-area-inset-bottom`. Touch targets minimum 44×44px.

**Dark mode:** Full dark mode support via `prefers-color-scheme` and manual toggle in settings.

**Maps aesthetic:** Use CartoDB Positron (light) / CartoDB Dark Matter (dark mode) tiles. Station icons should be crisp SVG, 32×32px, with drop shadow. Brand logos in markers only at zoom ≥ 14.

---

## 11. MONETIZATION HOOKS (Future-Ready)

Include these stubs for the Pro tier (don't implement fully yet, just scaffold):

```typescript
// Features to gate behind Pro:
// - Saving more than 1 vehicle profile
// - Route history
// - Price alerts (notify when station drops below threshold)
// - Export route to GPX/KMZ
// - Ad-free experience
// - Priority price updates (real-time vs 6h delay)

// Implement feature gate:
function requirePro(userId: string, feature: ProFeature): boolean {
  // TODO: check subscription status from DB
  return false; // everyone is free for now
}
```

---

## 12. DEPLOYMENT CHECKLIST

Before considering the feature complete:

- [ ] `scripts/ingestAllItaly.ts` runs successfully and populates `fuel_stations` with ≥ 20,000 rows
- [ ] PostGIS spatial index verified: `EXPLAIN ANALYZE SELECT * FROM fuel_stations WHERE ST_DWithin(location, ST_Point(7.6868, 45.0703), 5000);` uses index scan
- [ ] OSRM container starts and returns a valid route for Turin → Rome
- [ ] Vehicle profile "Truck 3.8m tall" triggers height warning on routes with low bridges
- [ ] Fuel stop optimization inserts correct waypoint when simulated fuel = 15% remaining
- [ ] Price crowd-sourcing: report endpoint validates, deduplicates, stores
- [ ] Viewport query for Rome center (zoom 12) returns in < 200ms
- [ ] Full sync job completes without errors in < 10 minutes
- [ ] Mobile 375px: map full screen, bottom sheet slides up, filters accessible
- [ ] Dark mode: all components render correctly
- [ ] Docker Compose `up -d` brings up all services (postgres, redis, osrm, app, nginx)

---

## 13. GIT WORKFLOW

Use feature branches. Commit messages follow Conventional Commits:
```
feat(routing): add vehicle-aware fuel stop optimization
feat(data): full Italy ingestion from MIMIT + OSM enrichment
feat(map): vehicle filter panel and price markers
fix(overpass): remove query limit, batch by region
chore(docker): add OSRM and Redis services to compose
```

Push all feature branches to `origin`. Open PRs to `main`. Never force-push `main`.

---

## 14. OPEN SOURCE & FREE DATA LICENSES

All data sources used are free and open:
| Source | License | Usage |
|---|---|---|
| MIMIT fuel station dataset | Italian Open Data License 2.0 (IODL 2.0) | Free for any use with attribution |
| OpenStreetMap | ODbL 1.0 | Free with attribution: "© OpenStreetMap contributors" |
| OSRM routing | BSD 2-Clause | Free, self-hostable |
| Leaflet.js | BSD 2-Clause | Free |
| CartoDB tiles | CC BY 3.0 | Free tier, attribution required |
| Nominatim | ODbL 1.0 | Free, self-hostable |
| OpenChargeMap | CC BY-SA 4.0 | Free API, 1000 req/day |

Attribution must appear in the app footer and in a `/credits` page.

---

*This prompt was generated by Perplexity AI acting as a senior GPS industry developer (Apple Maps / ex-Google Maps background), tailored specifically for the FuelGPS project by its owner. Last updated: April 2026.*
