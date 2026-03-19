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
//  Fuel Stations
// ──────────────────────────────────────────────
export const stations = pgTable(
  "stations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    osmId: text("osm_id").unique(), // OpenStreetMap node/way id
    name: text("name").notNull(),
    address: text("address"),
    city: text("city"),
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    // Fuel types available (stored as booleans for quick filtering)
    hasBenzina: boolean("has_benzina").default(false),
    hasGasolio: boolean("has_gasolio").default(false),
    hasGpl: boolean("has_gpl").default(false),
    hasElettrico: boolean("has_elettrico").default(false),
    brand: text("brand"),
    lastRefreshed: timestamp("last_refreshed").defaultNow(),
  },
  (t) => [
    index("stations_lat_lon_idx").on(t.lat, t.lon),
    index("stations_city_idx").on(t.city),
  ]
);

export const insertStationSchema = createInsertSchema(stations).omit({
  id: true,
  lastRefreshed: true,
});
export type InsertStation = z.infer<typeof insertStationSchema>;
export type Station = typeof stations.$inferSelect;

// ──────────────────────────────────────────────
//  Fuel Prices
// ──────────────────────────────────────────────
export const fuelTypes = ["benzina", "gasolio", "gpl", "elettrico"] as const;
export type FuelType = (typeof fuelTypes)[number];

export const prices = pgTable("prices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stationId: varchar("station_id")
    .notNull()
    .references(() => stations.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  fuelType: text("fuel_type").$type<FuelType>().notNull(),
  pricePerLiter: real("price_per_liter").notNull(),
  reportedAt: timestamp("reported_at").defaultNow().notNull(),
});

export const insertPriceSchema = createInsertSchema(prices).omit({
  id: true,
  reportedAt: true,
  userId: true,
});
export type InsertPrice = z.infer<typeof insertPriceSchema>;
export type Price = typeof prices.$inferSelect;

// ──────────────────────────────────────────────
//  Derived / View types
// ──────────────────────────────────────────────
export type LatestPriceMap = Partial<Record<FuelType, { price: number; reportedAt: string }>>;

export interface StationWithPrices extends Station {
  latestPrices: LatestPriceMap;
}

export interface RoutePlanRequest {
  origin: string;          // free-text address
  destination: string;
  vehicleType: "motorcycle" | "car" | "van" | "truck" | "bus";
  fuelType: FuelType;
  tankSizeLiters: number;
  currentFuelPercent: number; // 0-100
}

export interface RoutePlanResult {
  route: {
    distance: number;       // metres
    duration: number;       // seconds
    geometry: GeoJSON.LineString;
  };
  stops: Array<{
    station: StationWithPrices;
    distanceFromRoute: number;  // metres
    estimatedCost: number;      // EUR
    fillLiters: number;
    reachable: boolean;
  }>;
  summary: {
    totalDistance: number;
    estimatedTotalCost: number;
    numberOfStops: number;
    fuelConsumptionLper100km: number;
  };
}
