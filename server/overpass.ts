/**
 * Fetches fuel stations in Italy from the OpenStreetMap Overpass API
 * and upserts them into storage. Intended to run once on startup and
 * weekly via a cron job.
 */
import axios from "axios";
import type { IStorage } from "./storage";
import type { InsertStation } from "@shared/schema";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

interface OverpassNode {
  type: string;
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export async function fetchAndCacheStations(
  storage: IStorage,
  limit = 500
): Promise<number> {
  const query = `
    [out:json][timeout:60];
    area["ISO3166-1"="IT"]->.italy;
    node["amenity"="fuel"](area.italy);
    out body ${limit};
  `;

  const res = await axios.post<{ elements: OverpassNode[] }>(
    OVERPASS_URL,
    `data=${encodeURIComponent(query)}`,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 90000,
    }
  );

  const nodes = res.data.elements ?? [];
  let count = 0;

  for (const node of nodes) {
    if (node.type !== "node") continue;
    const tags = node.tags ?? {};

    const fuelTags = tags["fuel:octane_95"] || tags["fuel:diesel"] || tags["fuel:lpg"] || tags["fuel:electric"];
    const name = tags["name"] || tags["brand"] || "Stazione Carburante";

    const station: InsertStation = {
      osmId: `node/${node.id}`,
      name,
      address: [tags["addr:street"], tags["addr:housenumber"]]
        .filter(Boolean)
        .join(" ") || null,
      city: tags["addr:city"] || tags["addr:town"] || null,
      lat: node.lat,
      lon: node.lon,
      brand: tags["brand"] || null,
      hasBenzina:
        !!tags["fuel:octane_95"] ||
        !!tags["fuel:octane_98"] ||
        !!tags["fuel:gasoline"],
      hasGasolio:
        !!tags["fuel:diesel"] || !!tags["fuel:diesel:class2"],
      hasGpl: !!tags["fuel:lpg"],
      hasElettrico:
        !!tags["fuel:electric"] || !!tags["amenity_electric_vehicle_charging"],
    };

    try {
      await storage.upsertStationByOsmId(station);
      count++;
    } catch (_e) {
      // skip malformed entries
    }
  }

  console.log(`[Overpass] Upserted ${count} stations from OSM`);
  return count;
}
