/**
 * OpenStreetMap Overpass API Sync — Batch by Italian Region
 * Fetches ALL fuel stations + EV chargers across Italy.
 * No artificial query limit — batches by the 20 Italian regions.
 */
import axios from "axios";
import type { IStorage } from "../storage";
import type { InsertStation, EVConnector } from "@shared/schema";
import { ITALIAN_REGIONS } from "@shared/schema";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRegionQuery(regionName: string): string {
  return `
    [out:json][timeout:180];
    area["name"="${regionName}"]["admin_level"="4"]->.region;
    (
      node["amenity"="fuel"](area.region);
      way["amenity"="fuel"](area.region);
      node["amenity"="charging_station"](area.region);
      way["amenity"="charging_station"](area.region);
    );
    out body center;
  `;
}

function parseEVConnectors(tags: Record<string, string>): EVConnector[] {
  const connectors: EVConnector[] = [];
  const connectorTypes = [
    "Type2",
    "CCS",
    "CHAdeMO",
    "Type1",
    "Schuko",
    "Tesla",
  ];

  for (const ct of connectorTypes) {
    const key = `socket:${ct.toLowerCase()}`;
    if (tags[key]) {
      const powerKey = `socket:${ct.toLowerCase()}:output`;
      connectors.push({
        type: ct,
        quantity: parseInt(tags[key]) || 1,
        powerKw: tags[powerKey] ? parseFloat(tags[powerKey]) : undefined,
      });
    }
  }

  // Generic charging capacity
  if (connectors.length === 0 && tags["capacity"]) {
    connectors.push({
      type: "Unknown",
      quantity: parseInt(tags["capacity"]) || 1,
      powerKw: tags["charging_station:output"]
        ? parseFloat(tags["charging_station:output"])
        : undefined,
    });
  }

  return connectors;
}

function elementToStation(el: OverpassElement): InsertStation | null {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!lat || !lon) return null;

  const tags = el.tags ?? {};
  const isEV = tags["amenity"] === "charging_station";

  const name =
    tags["name"] || tags["brand"] || (isEV ? "Colonnina EV" : "Stazione Carburante");

  const station: InsertStation = {
    osmId: `${el.type}/${el.id}`,
    name,
    brand: tags["brand"] || tags["operator"] || null,
    operator: tags["operator"] || null,
    address: [tags["addr:street"], tags["addr:housenumber"]]
      .filter(Boolean)
      .join(" ") || null,
    municipality: tags["addr:city"] || tags["addr:town"] || tags["addr:village"] || null,
    province: tags["addr:province"] || null,
    lat,
    lon,
    source: "osm",
    isActive: true,
    hasBenzina:
      !!tags["fuel:octane_95"] ||
      !!tags["fuel:octane_98"] ||
      !!tags["fuel:gasoline"],
    hasGasolio:
      !!tags["fuel:diesel"] || !!tags["fuel:HGV_diesel"],
    hasGpl: !!tags["fuel:lpg"],
    hasMetano: !!tags["fuel:cng"] || !!tags["fuel:lng"],
    hasElettrico: isEV || !!tags["fuel:electricity"],
    evConnectors: isEV ? parseEVConnectors(tags) : null,
    openingHours: tags["opening_hours"] || null,
    is24h: tags["opening_hours"] === "24/7",
    hasSelfService:
      tags["self_service"] === "yes" || tags["automated"] === "yes",
    hasAttendant: tags["self_service"] === "no",
    hasCarWash:
      tags["car_wash"] === "yes" || tags["amenity:car_wash"] === "yes",
    hasShop:
      tags["shop"] !== undefined || tags["convenience"] === "yes",
    hasAdBlue: !!tags["fuel:adblue"],
    hasTruck:
      tags["hgv"] === "yes" || !!tags["fuel:HGV_diesel"],
  };

  return station;
}

async function fetchRegion(
  regionName: string
): Promise<OverpassElement[]> {
  const query = buildRegionQuery(regionName);

  const response = await axios.post<{ elements: OverpassElement[] }>(
    OVERPASS_URL,
    `data=${encodeURIComponent(query)}`,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 200000,
    }
  );

  return response.data.elements ?? [];
}

export async function syncAllRegions(
  storage: IStorage,
  options?: { regionsFilter?: string[]; delayMs?: number }
): Promise<{
  total: number;
  byRegion: Record<string, number>;
  errors: string[];
}> {
  const regions = options?.regionsFilter ?? [...ITALIAN_REGIONS];
  const delayMs = options?.delayMs ?? 2000;
  const byRegion: Record<string, number> = {};
  const errors: string[] = [];
  let total = 0;

  console.log(
    `[Overpass] Starting sync for ${regions.length} Italian regions...`
  );

  for (const region of regions) {
    try {
      console.log(`[Overpass] Fetching ${region}...`);
      const elements = await fetchRegion(region);
      let regionCount = 0;

      for (const el of elements) {
        const station = elementToStation(el);
        if (!station) continue;

        station.region = region;

        try {
          await storage.upsertStationByOsmId(station);
          regionCount++;
        } catch (e: any) {
          // Skip individual station errors
        }
      }

      byRegion[region] = regionCount;
      total += regionCount;
      console.log(
        `[Overpass] ${region}: ${regionCount} stations (${elements.length} raw elements)`
      );

      // Delay between region queries to be respectful
      if (regions.indexOf(region) < regions.length - 1) {
        await delay(delayMs);
      }
    } catch (e: any) {
      const msg = `${region}: ${e.message}`;
      errors.push(msg);
      console.error(`[Overpass] Error fetching ${region}:`, e.message);
      // Continue with next region
      await delay(delayMs * 2);
    }
  }

  console.log(
    `[Overpass] Sync complete: ${total} stations across ${
      Object.keys(byRegion).length
    } regions, ${errors.length} errors`
  );

  return { total, byRegion, errors };
}

/**
 * Lightweight fetch for development — grabs a limited set from one query
 */
export async function fetchLimitedStations(
  storage: IStorage,
  limit = 500
): Promise<number> {
  const query = `
    [out:json][timeout:60];
    area["ISO3166-1"="IT"][admin_level=2]->.italy;
    (
      node["amenity"="fuel"](area.italy);
      node["amenity"="charging_station"](area.italy);
    );
    out body ${limit};
  `;

  const res = await axios.post<{ elements: OverpassElement[] }>(
    OVERPASS_URL,
    `data=${encodeURIComponent(query)}`,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 90000,
    }
  );

  const elements = res.data.elements ?? [];
  let count = 0;

  for (const el of elements) {
    const station = elementToStation(el);
    if (!station) continue;

    try {
      await storage.upsertStationByOsmId(station);
      count++;
    } catch (_e) {
      // skip malformed entries
    }
  }

  console.log(`[Overpass] Quick fetch: Upserted ${count} stations`);
  return count;
}
