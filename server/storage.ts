import {
  type User,
  type InsertUser,
  type Station,
  type InsertStation,
  type Price,
  type InsertPrice,
  type StationWithPrices,
  type FuelType,
  fuelTypes,
} from "@shared/schema";
import { randomUUID } from "crypto";

// ──────────────────────────────────────────────
//  Storage Interface
// ──────────────────────────────────────────────
export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Stations
  getStation(id: string): Promise<StationWithPrices | undefined>;
  getStationByOsmId(osmId: string): Promise<Station | undefined>;
  listStations(opts?: {
    limit?: number;
    offset?: number;
    fuelType?: FuelType;
    city?: string;
    maxPrice?: number;
    minPrice?: number;
  }): Promise<{ stations: StationWithPrices[]; total: number }>;
  getNearbyStations(
    lat: number,
    lon: number,
    radiusKm: number,
    fuelType?: FuelType
  ): Promise<StationWithPrices[]>;
  createStation(station: InsertStation): Promise<Station>;
  upsertStationByOsmId(station: InsertStation): Promise<Station>;

  // Prices
  reportPrice(
    stationId: string,
    userId: string | null,
    fuelType: FuelType,
    pricePerLiter: number
  ): Promise<Price>;
  getLatestPrices(stationId: string): Promise<Price[]>;
}

// ──────────────────────────────────────────────
//  In-Memory Implementation
// ──────────────────────────────────────────────
export class MemStorage implements IStorage {
  private users = new Map<string, User>();
  private stations = new Map<string, Station>();
  private prices = new Map<string, Price[]>(); // stationId → prices[]

  // ── helpers ─────────────────────────────────
  private buildWithPrices(station: Station): StationWithPrices {
    const raw = this.prices.get(station.id) ?? [];
    const latestPrices: StationWithPrices["latestPrices"] = {};
    for (const ft of fuelTypes) {
      const match = raw
        .filter((p) => p.fuelType === ft)
        .sort(
          (a, b) =>
            new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime()
        )[0];
      if (match) {
        latestPrices[ft] = {
          price: match.pricePerLiter,
          reportedAt: match.reportedAt.toISOString(),
        };
      }
    }
    return { ...station, latestPrices };
  }

  // ── Users ───────────────────────────────────
  async getUser(id: string) {
    return this.users.get(id);
  }
  async getUserByUsername(username: string) {
    return Array.from(this.users.values()).find((u) => u.username === username);
  }
  async getUserByEmail(email: string) {
    return Array.from(this.users.values()).find((u) => u.email === email);
  }
  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id, createdAt: new Date() };
    this.users.set(id, user);
    return user;
  }

  // ── Stations ────────────────────────────────
  async getStation(id: string) {
    const s = this.stations.get(id);
    return s ? this.buildWithPrices(s) : undefined;
  }
  async getStationByOsmId(osmId: string) {
    return Array.from(this.stations.values()).find((s) => s.osmId === osmId);
  }

  async listStations(opts: {
    limit?: number;
    offset?: number;
    fuelType?: FuelType;
    city?: string;
    maxPrice?: number;
    minPrice?: number;
  } = {}) {
    const { limit = 50, offset = 0, fuelType, city, maxPrice, minPrice } = opts;
    let all = Array.from(this.stations.values());

    if (city) {
      const q = city.toLowerCase();
      all = all.filter((s) => s.city?.toLowerCase().includes(q));
    }
    if (fuelType) {
      all = all.filter((s) => {
        if (fuelType === "benzina") return s.hasBenzina;
        if (fuelType === "gasolio") return s.hasGasolio;
        if (fuelType === "gpl") return s.hasGpl;
        if (fuelType === "elettrico") return s.hasElettrico;
        return true;
      });
    }

    const withPrices = all.map((s) => this.buildWithPrices(s));

    // price range filter
    let filtered = withPrices;
    if ((minPrice !== undefined || maxPrice !== undefined) && fuelType) {
      filtered = withPrices.filter((s) => {
        const p = s.latestPrices[fuelType]?.price;
        if (p === undefined) return false;
        if (minPrice !== undefined && p < minPrice) return false;
        if (maxPrice !== undefined && p > maxPrice) return false;
        return true;
      });
    }

    return {
      stations: filtered.slice(offset, offset + limit),
      total: filtered.length,
    };
  }

  async getNearbyStations(
    lat: number,
    lon: number,
    radiusKm: number,
    fuelType?: FuelType
  ): Promise<StationWithPrices[]> {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const haversine = (a: Station) => {
      const R = 6371;
      const dLat = toRad(a.lat - lat);
      const dLon = toRad(a.lon - lon);
      const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat)) *
          Math.cos(toRad(a.lat)) *
          Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.asin(Math.sqrt(h));
    };

    let all = Array.from(this.stations.values()).filter(
      (s) => haversine(s) <= radiusKm
    );

    if (fuelType) {
      all = all.filter((s) => {
        if (fuelType === "benzina") return s.hasBenzina;
        if (fuelType === "gasolio") return s.hasGasolio;
        if (fuelType === "gpl") return s.hasGpl;
        if (fuelType === "elettrico") return s.hasElettrico;
        return true;
      });
    }

    return all.map((s) => this.buildWithPrices(s));
  }

  async createStation(insertStation: InsertStation): Promise<Station> {
    const id = randomUUID();
    const station: Station = {
      osmId: insertStation.osmId ?? null,
      address: insertStation.address ?? null,
      city: insertStation.city ?? null,
      brand: insertStation.brand ?? null,
      hasBenzina: insertStation.hasBenzina ?? false,
      hasGasolio: insertStation.hasGasolio ?? false,
      hasGpl: insertStation.hasGpl ?? false,
      hasElettrico: insertStation.hasElettrico ?? false,
      name: insertStation.name,
      lat: insertStation.lat,
      lon: insertStation.lon,
      id,
      lastRefreshed: new Date(),
    };
    this.stations.set(id, station);
    return station;
  }

  async upsertStationByOsmId(insertStation: InsertStation): Promise<Station> {
    const existing = insertStation.osmId
      ? await this.getStationByOsmId(insertStation.osmId)
      : undefined;
    if (existing) {
      const updated: Station = {
        ...existing,
        ...insertStation,
        id: existing.id,
        lastRefreshed: new Date(),
      };
      this.stations.set(existing.id, updated);
      return updated;
    }
    return this.createStation(insertStation);
  }

  // ── Prices ──────────────────────────────────
  async reportPrice(
    stationId: string,
    userId: string | null,
    fuelType: FuelType,
    pricePerLiter: number
  ): Promise<Price> {
    const price: Price = {
      id: randomUUID(),
      stationId,
      userId: userId ?? null,
      fuelType,
      pricePerLiter,
      reportedAt: new Date(),
    };
    const existing = this.prices.get(stationId) ?? [];
    this.prices.set(stationId, [price, ...existing]);

    // Update the boolean flag on the station
    const station = this.stations.get(stationId);
    if (station) {
      if (fuelType === "benzina") station.hasBenzina = true;
      if (fuelType === "gasolio") station.hasGasolio = true;
      if (fuelType === "gpl") station.hasGpl = true;
      if (fuelType === "elettrico") station.hasElettrico = true;
      this.stations.set(stationId, station);
    }

    return price;
  }

  async getLatestPrices(stationId: string): Promise<Price[]> {
    return this.prices.get(stationId) ?? [];
  }
}

export const storage = new MemStorage();
