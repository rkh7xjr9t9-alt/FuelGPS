import {
  type User,
  type InsertUser,
  type Station,
  type InsertStation,
  type Price,
  type InsertPrice,
  type StationWithPrices,
  type FuelType,
  type VehicleProfile,
  type InsertVehicleProfile,
  fuelTypes,
} from "@shared/schema";
import { computeBestPrices } from "./services/priceService";
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
  getStationByMimitId(mimitId: string): Promise<Station | undefined>;
  listStations(opts?: {
    limit?: number;
    offset?: number;
    fuelType?: FuelType;
    city?: string;
    brand?: string;
    bbox?: { minLat: number; maxLat: number; minLon: number; maxLon: number };
    maxPrice?: number;
    minPrice?: number;
    isOpen?: boolean;
  }): Promise<{ stations: StationWithPrices[]; total: number }>;
  getNearbyStations(
    lat: number,
    lon: number,
    radiusKm: number,
    fuelType?: FuelType,
    limit?: number
  ): Promise<StationWithPrices[]>;
  createStation(station: InsertStation): Promise<Station>;
  upsertStationByOsmId(station: InsertStation): Promise<Station>;
  upsertStationByMimitId(
    station: InsertStation
  ): Promise<{ station: Station; isNew: boolean }>;
  updateStationFuelFlag(
    mimitId: string,
    fuelType: FuelType
  ): Promise<void>;

  // Prices
  reportPrice(
    stationId: string,
    userId: string | null,
    fuelType: FuelType,
    price: number,
    isSelfService?: boolean,
    source?: string
  ): Promise<Price>;
  reportPriceByMimitId(
    mimitId: string,
    fuelType: FuelType,
    price: number,
    isSelfService: boolean,
    source: string
  ): Promise<void>;
  getLatestPrices(stationId: string): Promise<Price[]>;
  getRegionalAveragePrices(): Promise<
    Record<string, Partial<Record<FuelType, number>>>
  >;

  // Vehicle Profiles
  getVehicleProfiles(userId: string): Promise<VehicleProfile[]>;
  createVehicleProfile(profile: InsertVehicleProfile): Promise<VehicleProfile>;
  updateVehicleProfile(
    id: string,
    profile: Partial<InsertVehicleProfile>
  ): Promise<VehicleProfile | undefined>;
  deleteVehicleProfile(id: string): Promise<void>;

  // Stats
  getStationCount(): Promise<number>;
}

// ──────────────────────────────────────────────
//  In-Memory Implementation
// ──────────────────────────────────────────────
export class MemStorage implements IStorage {
  private users = new Map<string, User>();
  private stationsMap = new Map<string, Station>();
  private mimitIndex = new Map<string, string>(); // mimitId → stationId
  private osmIndex = new Map<string, string>(); // osmId → stationId
  private pricesMap = new Map<string, Price[]>(); // stationId → prices[]
  private vehicleProfilesMap = new Map<string, VehicleProfile>();

  // ── helpers ─────────────────────────────────
  private buildWithPrices(station: Station): StationWithPrices {
    const raw = this.pricesMap.get(station.id) ?? [];
    const latestPrices = computeBestPrices(raw);
    return { ...station, latestPrices };
  }

  private haversineKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
  }

  // ── Users ───────────────────────────────────
  async getUser(id: string) {
    return this.users.get(id);
  }
  async getUserByUsername(username: string) {
    return Array.from(this.users.values()).find(
      (u) => u.username === username
    );
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
    const s = this.stationsMap.get(id);
    return s ? this.buildWithPrices(s) : undefined;
  }
  async getStationByOsmId(osmId: string) {
    const stationId = this.osmIndex.get(osmId);
    return stationId ? this.stationsMap.get(stationId) : undefined;
  }
  async getStationByMimitId(mimitId: string) {
    const stationId = this.mimitIndex.get(mimitId);
    return stationId ? this.stationsMap.get(stationId) : undefined;
  }

  async listStations(
    opts: {
      limit?: number;
      offset?: number;
      fuelType?: FuelType;
      city?: string;
      brand?: string;
      bbox?: {
        minLat: number;
        maxLat: number;
        minLon: number;
        maxLon: number;
      };
      maxPrice?: number;
      minPrice?: number;
      isOpen?: boolean;
    } = {}
  ) {
    const {
      limit = 50,
      offset = 0,
      fuelType,
      city,
      brand,
      bbox,
      maxPrice,
      minPrice,
    } = opts;
    let all = Array.from(this.stationsMap.values()).filter(
      (s) => s.isActive !== false
    );

    // Bbox filter
    if (bbox) {
      all = all.filter(
        (s) =>
          s.lat >= bbox.minLat &&
          s.lat <= bbox.maxLat &&
          s.lon >= bbox.minLon &&
          s.lon <= bbox.maxLon
      );
    }

    if (city) {
      const q = city.toLowerCase();
      all = all.filter(
        (s) =>
          s.municipality?.toLowerCase().includes(q) ||
          s.province?.toLowerCase().includes(q)
      );
    }

    if (brand) {
      const q = brand.toLowerCase();
      all = all.filter((s) => s.brand?.toLowerCase().includes(q));
    }

    if (fuelType) {
      all = all.filter((s) => {
        if (fuelType === "benzina") return s.hasBenzina;
        if (fuelType === "gasolio") return s.hasGasolio;
        if (fuelType === "gpl") return s.hasGpl;
        if (fuelType === "metano") return s.hasMetano;
        if (fuelType === "elettrico") return s.hasElettrico;
        return true;
      });
    }

    const withPrices = all.map((s) => this.buildWithPrices(s));

    // Price filter
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
    fuelType?: FuelType,
    limit = 50
  ): Promise<StationWithPrices[]> {
    let all = Array.from(this.stationsMap.values())
      .filter((s) => s.isActive !== false)
      .map((s) => ({
        station: s,
        dist: this.haversineKm(lat, lon, s.lat, s.lon),
      }))
      .filter((x) => x.dist <= radiusKm)
      .sort((a, b) => a.dist - b.dist);

    if (fuelType) {
      all = all.filter((x) => {
        const s = x.station;
        if (fuelType === "benzina") return s.hasBenzina;
        if (fuelType === "gasolio") return s.hasGasolio;
        if (fuelType === "gpl") return s.hasGpl;
        if (fuelType === "metano") return s.hasMetano;
        if (fuelType === "elettrico") return s.hasElettrico;
        return true;
      });
    }

    return all
      .slice(0, limit)
      .map((x) => ({
        ...this.buildWithPrices(x.station),
        distanceKm: Math.round(x.dist * 100) / 100,
      }));
  }

  async createStation(insertStation: InsertStation): Promise<Station> {
    const id = randomUUID();
    const station: Station = {
      id,
      mimitId: insertStation.mimitId ?? null,
      osmId: insertStation.osmId ?? null,
      name: insertStation.name,
      brand: insertStation.brand ?? null,
      operator: insertStation.operator ?? null,
      address: insertStation.address ?? null,
      municipality: insertStation.municipality ?? null,
      province: insertStation.province ?? null,
      region: insertStation.region ?? null,
      lat: insertStation.lat,
      lon: insertStation.lon,
      hasBenzina: insertStation.hasBenzina ?? false,
      hasGasolio: insertStation.hasGasolio ?? false,
      hasGpl: insertStation.hasGpl ?? false,
      hasMetano: insertStation.hasMetano ?? false,
      hasElettrico: insertStation.hasElettrico ?? false,
      evConnectors: insertStation.evConnectors ?? null,
      openingHours: insertStation.openingHours ?? null,
      is24h: insertStation.is24h ?? false,
      hasSelfService: insertStation.hasSelfService ?? true,
      hasAttendant: insertStation.hasAttendant ?? false,
      hasCarWash: insertStation.hasCarWash ?? false,
      hasShop: insertStation.hasShop ?? false,
      hasAdBlue: insertStation.hasAdBlue ?? false,
      hasTruck: insertStation.hasTruck ?? false,
      source: insertStation.source ?? "osm",
      lastSynced: new Date(),
      isActive: insertStation.isActive ?? true,
    };
    this.stationsMap.set(id, station);
    if (station.mimitId) this.mimitIndex.set(station.mimitId, id);
    if (station.osmId) this.osmIndex.set(station.osmId, id);
    return station;
  }

  async upsertStationByOsmId(insertStation: InsertStation): Promise<Station> {
    const existingId = insertStation.osmId
      ? this.osmIndex.get(insertStation.osmId)
      : undefined;

    if (existingId) {
      const existing = this.stationsMap.get(existingId)!;
      // Merge: keep MIMIT data if present, enrich with OSM
      const updated: Station = {
        ...existing,
        osmId: insertStation.osmId ?? existing.osmId,
        // Don't overwrite MIMIT name/brand with OSM
        name:
          existing.source === "mimit" ? existing.name : insertStation.name,
        brand:
          existing.brand || insertStation.brand || null,
        operator:
          existing.operator || insertStation.operator || null,
        address: existing.address || insertStation.address || null,
        municipality:
          existing.municipality || insertStation.municipality || null,
        region: insertStation.region || existing.region || null,
        // Merge fuel types (OR)
        hasBenzina: existing.hasBenzina || insertStation.hasBenzina || false,
        hasGasolio: existing.hasGasolio || insertStation.hasGasolio || false,
        hasGpl: existing.hasGpl || insertStation.hasGpl || false,
        hasMetano: existing.hasMetano || insertStation.hasMetano || false,
        hasElettrico:
          existing.hasElettrico || insertStation.hasElettrico || false,
        // OSM-specific enrichment
        evConnectors: insertStation.evConnectors || existing.evConnectors,
        openingHours: insertStation.openingHours || existing.openingHours,
        is24h: insertStation.is24h || existing.is24h || false,
        hasSelfService:
          insertStation.hasSelfService ?? existing.hasSelfService,
        hasAttendant: insertStation.hasAttendant ?? existing.hasAttendant,
        hasCarWash: insertStation.hasCarWash || existing.hasCarWash || false,
        hasShop: insertStation.hasShop || existing.hasShop || false,
        hasAdBlue: insertStation.hasAdBlue || existing.hasAdBlue || false,
        hasTruck: insertStation.hasTruck || existing.hasTruck || false,
        source:
          existing.source === "mimit" ? "mimit" : insertStation.source || "osm",
        lastSynced: new Date(),
      };
      this.stationsMap.set(existingId, updated);
      return updated;
    }

    return this.createStation(insertStation);
  }

  async upsertStationByMimitId(
    insertStation: InsertStation
  ): Promise<{ station: Station; isNew: boolean }> {
    const mimitId = insertStation.mimitId;
    if (!mimitId) throw new Error("mimitId required");

    const existingId = this.mimitIndex.get(mimitId);
    if (existingId) {
      const existing = this.stationsMap.get(existingId)!;
      const updated: Station = {
        ...existing,
        ...insertStation,
        id: existing.id,
        osmId: existing.osmId, // preserve OSM link
        // Preserve enriched data from OSM
        evConnectors: existing.evConnectors,
        openingHours: existing.openingHours,
        lastSynced: new Date(),
      };
      this.stationsMap.set(existingId, updated);
      return { station: updated, isNew: false };
    }

    const station = await this.createStation(insertStation);
    return { station, isNew: true };
  }

  async updateStationFuelFlag(
    mimitId: string,
    fuelType: FuelType
  ): Promise<void> {
    const stationId = this.mimitIndex.get(mimitId);
    if (!stationId) return;
    const station = this.stationsMap.get(stationId);
    if (!station) return;

    if (fuelType === "benzina") station.hasBenzina = true;
    if (fuelType === "gasolio") station.hasGasolio = true;
    if (fuelType === "gpl") station.hasGpl = true;
    if (fuelType === "metano") station.hasMetano = true;
    if (fuelType === "elettrico") station.hasElettrico = true;

    this.stationsMap.set(stationId, station);
  }

  // ── Prices ──────────────────────────────────
  async reportPrice(
    stationId: string,
    userId: string | null,
    fuelType: FuelType,
    price: number,
    isSelfService = true,
    source = "user"
  ): Promise<Price> {
    const priceRecord: Price = {
      id: randomUUID(),
      stationId,
      userId: userId ?? null,
      fuelType,
      price,
      isSelfService,
      source,
      reportedAt: new Date(),
      validUntil: null,
    };
    const existing = this.pricesMap.get(stationId) ?? [];
    this.pricesMap.set(stationId, [priceRecord, ...existing]);

    // Update fuel flag
    const station = this.stationsMap.get(stationId);
    if (station) {
      if (fuelType === "benzina") station.hasBenzina = true;
      if (fuelType === "gasolio") station.hasGasolio = true;
      if (fuelType === "gpl") station.hasGpl = true;
      if (fuelType === "metano") station.hasMetano = true;
      if (fuelType === "elettrico") station.hasElettrico = true;
      this.stationsMap.set(stationId, station);
    }

    return priceRecord;
  }

  async reportPriceByMimitId(
    mimitId: string,
    fuelType: FuelType,
    price: number,
    isSelfService: boolean,
    source: string
  ): Promise<void> {
    const stationId = this.mimitIndex.get(mimitId);
    if (!stationId) return;
    await this.reportPrice(stationId, null, fuelType, price, isSelfService, source);
  }

  async getLatestPrices(stationId: string): Promise<Price[]> {
    return this.pricesMap.get(stationId) ?? [];
  }

  async getRegionalAveragePrices(): Promise<
    Record<string, Partial<Record<FuelType, number>>>
  > {
    const regionPrices: Record<
      string,
      Record<FuelType, number[]>
    > = {};

    for (const station of this.stationsMap.values()) {
      if (!station.region) continue;
      const prices = this.pricesMap.get(station.id) ?? [];
      if (!regionPrices[station.region]) {
        regionPrices[station.region] = {} as any;
      }

      for (const ft of fuelTypes) {
        const ftPrice = prices.find((p) => p.fuelType === ft);
        if (ftPrice) {
          if (!regionPrices[station.region][ft]) {
            regionPrices[station.region][ft] = [];
          }
          regionPrices[station.region][ft].push(ftPrice.price);
        }
      }
    }

    const result: Record<string, Partial<Record<FuelType, number>>> = {};
    for (const [region, ftPrices] of Object.entries(regionPrices)) {
      result[region] = {};
      for (const [ft, prices] of Object.entries(ftPrices)) {
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
        result[region][ft as FuelType] = Math.round(avg * 1000) / 1000;
      }
    }
    return result;
  }

  // ── Vehicle Profiles ────────────────────────
  async getVehicleProfiles(userId: string): Promise<VehicleProfile[]> {
    return Array.from(this.vehicleProfilesMap.values()).filter(
      (p) => p.userId === userId
    );
  }

  async createVehicleProfile(
    profile: InsertVehicleProfile
  ): Promise<VehicleProfile> {
    const id = randomUUID();
    const vp: VehicleProfile = {
      id,
      userId: profile.userId ?? null,
      name: profile.name,
      type: profile.type,
      fuelType: profile.fuelType ?? null,
      heightM: profile.heightM ?? null,
      widthM: profile.widthM ?? null,
      lengthM: profile.lengthM ?? null,
      weightKg: profile.weightKg ?? null,
      axleWeightKg: profile.axleWeightKg ?? null,
      isHazmat: profile.isHazmat ?? false,
      tankCapacityL: profile.tankCapacityL ?? null,
      consumptionLper100km: profile.consumptionLper100km ?? null,
      isDefault: profile.isDefault ?? false,
      createdAt: new Date(),
    };
    this.vehicleProfilesMap.set(id, vp);
    return vp;
  }

  async updateVehicleProfile(
    id: string,
    updates: Partial<InsertVehicleProfile>
  ): Promise<VehicleProfile | undefined> {
    const existing = this.vehicleProfilesMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.vehicleProfilesMap.set(id, updated);
    return updated;
  }

  async deleteVehicleProfile(id: string): Promise<void> {
    this.vehicleProfilesMap.delete(id);
  }

  async getStationCount(): Promise<number> {
    return this.stationsMap.size;
  }
}

export const storage = new MemStorage();
