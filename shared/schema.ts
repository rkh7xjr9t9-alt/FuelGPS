import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  real,
  integer,
  timestamp,
  boolean,
  index,
  doublePrecision,
  jsonb,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ──────────────────────────────────────────────
//  Users
// ──────────────────────────────────────────────
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ──────────────────────────────────────────────
//  Fuel Types
// ──────────────────────────────────────────────
export const fuelTypes = [
  "benzina",
  "gasolio",
  "gpl",
  "metano",
  "elettrico",
] as const;
export type FuelType = (typeof fuelTypes)[number];

// ──────────────────────────────────────────────
//  EV Connector Types
// ──────────────────────────────────────────────
export interface EVConnector {
  type: string; // Type2, CCS, CHAdeMO, etc.
  powerKw?: number;
  quantity?: number;
}

// ──────────────────────────────────────────────
//  Fuel Stations
// ──────────────────────────────────────────────
export const stations = pgTable(
  "fuel_stations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    mimitId: varchar("mimit_id", { length: 20 }).unique(),
    osmId: varchar("osm_id", { length: 30 }).unique(),
    name: varchar("name", { length: 255 }).notNull(),
    brand: varchar("brand", { length: 100 }),
    operator: varchar("operator", { length: 255 }),
    address: text("address"),
    municipality: varchar("municipality", { length: 100 }),
    province: varchar("province", { length: 5 }),
    region: varchar("region", { length: 50 }),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    // Fuel types available
    hasBenzina: boolean("has_benzina").default(false),
    hasGasolio: boolean("has_gasolio").default(false),
    hasGpl: boolean("has_gpl").default(false),
    hasMetano: boolean("has_metano").default(false),
    hasElettrico: boolean("has_elettrico").default(false),
    // EV details
    evConnectors: jsonb("ev_connectors").$type<EVConnector[]>(),
    // Amenities & features
    openingHours: text("opening_hours"),
    is24h: boolean("is_24h").default(false),
    hasSelfService: boolean("has_self_service").default(true),
    hasAttendant: boolean("has_attendant").default(false),
    hasCarWash: boolean("has_car_wash").default(false),
    hasShop: boolean("has_shop").default(false),
    hasAdBlue: boolean("has_adblue").default(false),
    hasTruck: boolean("has_truck").default(false),
    // Source tracking
    source: varchar("source", { length: 10 }).default("mimit"),
    lastSynced: timestamp("last_synced").defaultNow(),
    isActive: boolean("is_active").default(true),
  },
  (t) => [
    index("stations_lat_lon_idx").on(t.lat, t.lon),
    index("stations_municipality_idx").on(t.municipality),
    index("stations_province_idx").on(t.province),
    index("stations_brand_idx").on(t.brand),
    index("stations_mimit_id_idx").on(t.mimitId),
  ]
);

export const insertStationSchema = createInsertSchema(stations).omit({
  id: true,
  lastSynced: true,
});
export type InsertStation = z.infer<typeof insertStationSchema>;
export type Station = typeof stations.$inferSelect;

// ──────────────────────────────────────────────
//  Fuel Prices
// ──────────────────────────────────────────────
export const prices = pgTable(
  "fuel_prices",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    stationId: varchar("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    userId: varchar("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    fuelType: text("fuel_type").$type<FuelType>().notNull(),
    price: doublePrecision("price").notNull(),
    isSelfService: boolean("is_self_service").default(true),
    source: varchar("source", { length: 10 }).default("user"), // "mimit" | "user"
    reportedAt: timestamp("reported_at").defaultNow().notNull(),
    validUntil: timestamp("valid_until"),
  },
  (t) => [
    index("prices_station_id_idx").on(t.stationId),
    index("prices_fuel_type_idx").on(t.fuelType),
    index("prices_reported_at_idx").on(t.reportedAt),
  ]
);

export const insertPriceSchema = createInsertSchema(prices).omit({
  id: true,
  reportedAt: true,
  userId: true,
});
export type InsertPrice = z.infer<typeof insertPriceSchema>;
export type Price = typeof prices.$inferSelect;

// ──────────────────────────────────────────────
//  Vehicle Profiles
// ──────────────────────────────────────────────
export const vehicleTypes = [
  "car",
  "motorcycle",
  "van",
  "truck",
  "bus",
  "ev",
] as const;
export type VehicleType = (typeof vehicleTypes)[number];

export const vehicleProfiles = pgTable("vehicle_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  name: varchar("name", { length: 100 }).notNull(),
  type: varchar("type", { length: 20 }).$type<VehicleType>().notNull(),
  fuelType: varchar("fuel_type", { length: 20 }).$type<FuelType>(),
  heightM: doublePrecision("height_m"),
  widthM: doublePrecision("width_m"),
  lengthM: doublePrecision("length_m"),
  weightKg: doublePrecision("weight_kg"),
  axleWeightKg: doublePrecision("axle_weight_kg"),
  isHazmat: boolean("is_hazmat").default(false),
  tankCapacityL: doublePrecision("tank_capacity_l"),
  consumptionLper100km: doublePrecision("consumption_l_per_100km"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVehicleProfileSchema = createInsertSchema(
  vehicleProfiles
).omit({
  id: true,
  createdAt: true,
});
export type InsertVehicleProfile = z.infer<typeof insertVehicleProfileSchema>;
export type VehicleProfile = typeof vehicleProfiles.$inferSelect;

// ──────────────────────────────────────────────
//  Derived / View types
// ──────────────────────────────────────────────
export type LatestPriceMap = Partial<
  Record<FuelType, { price: number; isSelfService: boolean; reportedAt: string; source: string }>
>;

export interface StationWithPrices extends Station {
  latestPrices: LatestPriceMap;
  distanceKm?: number;
}

export interface RoutePlanRequest {
  origin: string;
  destination: string;
  vehicleType: VehicleType;
  fuelType: FuelType;
  tankSizeLiters: number;
  currentFuelPercent: number;
  consumptionLper100km?: number;
  optimizeFor?: "fastest" | "cheapest_fuel" | "avoid_tolls";
  maxDetourKm?: number;
}

export interface FuelStop {
  station: StationWithPrices;
  distanceFromRoute: number;
  estimatedCost: number;
  fillLiters: number;
  reachable: boolean;
  progressKm: number;
}

export interface RoutePlanResult {
  route: {
    distance: number;
    duration: number;
    geometry: GeoJSON.LineString;
  };
  stops: FuelStop[];
  summary: {
    totalDistance: number;
    estimatedTotalCost: number;
    numberOfStops: number;
    fuelConsumptionLper100km: number;
  };
}

// ──────────────────────────────────────────────
//  Italian Regions
// ──────────────────────────────────────────────
export const ITALIAN_REGIONS = [
  "Abruzzo",
  "Basilicata",
  "Calabria",
  "Campania",
  "Emilia-Romagna",
  "Friuli-Venezia Giulia",
  "Lazio",
  "Liguria",
  "Lombardia",
  "Marche",
  "Molise",
  "Piemonte",
  "Puglia",
  "Sardegna",
  "Sicilia",
  "Toscana",
  "Trentino-Alto Adige",
  "Umbria",
  "Valle d'Aosta",
  "Veneto",
] as const;

// ──────────────────────────────────────────────
//  Province to Region mapping (for MIMIT)
// ──────────────────────────────────────────────
export const PROVINCE_TO_REGION: Record<string, string> = {
  AG: "Sicilia", AL: "Piemonte", AN: "Marche", AO: "Valle d'Aosta",
  AP: "Marche", AQ: "Abruzzo", AR: "Toscana", AT: "Piemonte",
  AV: "Campania", BA: "Puglia", BG: "Lombardia", BI: "Piemonte",
  BL: "Veneto", BN: "Campania", BO: "Emilia-Romagna", BR: "Puglia",
  BS: "Lombardia", BT: "Puglia", BZ: "Trentino-Alto Adige", CA: "Sardegna",
  CB: "Molise", CE: "Campania", CH: "Abruzzo", CI: "Sardegna",
  CL: "Sicilia", CN: "Piemonte", CO: "Lombardia", CR: "Lombardia",
  CS: "Calabria", CT: "Sicilia", CZ: "Calabria", EN: "Sicilia",
  FC: "Emilia-Romagna", FE: "Emilia-Romagna", FG: "Puglia", FI: "Toscana",
  FM: "Marche", FR: "Lazio", GE: "Liguria", GO: "Friuli-Venezia Giulia",
  GR: "Toscana", IM: "Liguria", IS: "Molise", KR: "Calabria",
  LC: "Lombardia", LE: "Puglia", LI: "Toscana", LO: "Lombardia",
  LT: "Lazio", LU: "Toscana", MB: "Lombardia", MC: "Marche",
  ME: "Sicilia", MI: "Lombardia", MN: "Lombardia", MO: "Emilia-Romagna",
  MS: "Toscana", MT: "Basilicata", NA: "Campania", NO: "Piemonte",
  NU: "Sardegna", OG: "Sardegna", OR: "Sardegna", OT: "Sardegna",
  PA: "Sicilia", PC: "Emilia-Romagna", PD: "Veneto", PE: "Abruzzo",
  PG: "Umbria", PI: "Toscana", PN: "Friuli-Venezia Giulia", PO: "Toscana",
  PR: "Emilia-Romagna", PT: "Toscana", PU: "Marche", PV: "Lombardia",
  PZ: "Basilicata", RA: "Emilia-Romagna", RC: "Calabria", RE: "Emilia-Romagna",
  RG: "Sicilia", RI: "Lazio", RM: "Lazio", RN: "Emilia-Romagna",
  RO: "Veneto", SA: "Campania", SI: "Toscana", SO: "Lombardia",
  SP: "Liguria", SR: "Sicilia", SS: "Sardegna", SU: "Sardegna",
  SV: "Liguria", TA: "Puglia", TE: "Abruzzo", TN: "Trentino-Alto Adige",
  TO: "Piemonte", TP: "Sicilia", TR: "Umbria", TS: "Friuli-Venezia Giulia",
  TV: "Veneto", UD: "Friuli-Venezia Giulia", VA: "Lombardia", VB: "Piemonte",
  VC: "Piemonte", VE: "Veneto", VI: "Veneto", VR: "Veneto",
  VS: "Sardegna", VT: "Lazio", VV: "Calabria",
};

// ──────────────────────────────────────────────
//  Default vehicle consumption (L/100km)
// ──────────────────────────────────────────────
export const DEFAULT_CONSUMPTION: Record<VehicleType, number> = {
  motorcycle: 4,
  car: 7,
  van: 11,
  truck: 28,
  bus: 35,
  ev: 18, // kWh/100km equivalent
};

// ──────────────────────────────────────────────
//  Fuel type display config
// ──────────────────────────────────────────────
export const FUEL_DISPLAY: Record<
  FuelType,
  { label: string; color: string; darkColor: string }
> = {
  benzina: { label: "Benzina", color: "#ef4444", darkColor: "#f87171" },
  gasolio: { label: "Diesel", color: "#3b82f6", darkColor: "#60a5fa" },
  gpl: { label: "GPL", color: "#22c55e", darkColor: "#4ade80" },
  metano: { label: "Metano", color: "#8b5cf6", darkColor: "#a78bfa" },
  elettrico: { label: "Elettrico", color: "#06b6d4", darkColor: "#22d3ee" },
};
