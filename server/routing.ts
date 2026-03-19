import axios from "axios";
import type { StationWithPrices, FuelType, RoutePlanResult } from "@shared/schema";

const OSRM_BASE = "https://router.project-osrm.org";

// L/100km consumption by vehicle type
export const CONSUMPTION: Record<string, number> = {
  motorcycle: 4,
  car: 7,
  van: 11,
  truck: 28,
  bus: 35,
};

interface OSRMRouteResponse {
  code: string;
  routes: Array<{
    distance: number;
    duration: number;
    geometry: GeoJSON.LineString;
    legs: Array<{ steps: Array<{ maneuver: { location: [number, number] } }> }>;
  }>;
  waypoints: Array<{ location: [number, number]; name: string }>;
}

// Geocode a free-text address to [lon, lat] using Nominatim
export async function geocode(address: string): Promise<[number, number]> {
  const res = await axios.get("https://nominatim.openstreetmap.org/search", {
    params: {
      q: `${address}, Italy`,
      format: "json",
      limit: 1,
    },
    headers: { "User-Agent": "FuelGPS/1.0" },
  });
  if (!res.data?.length) throw new Error(`Cannot geocode: "${address}"`);
  const { lon, lat } = res.data[0];
  return [parseFloat(lon), parseFloat(lat)];
}

// Get OSRM route between two [lon,lat] points
export async function getOsrmRoute(
  originLonLat: [number, number],
  destLonLat: [number, number]
): Promise<OSRMRouteResponse["routes"][0]> {
  const coords = `${originLonLat[0]},${originLonLat[1]};${destLonLat[0]},${destLonLat[1]}`;
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`;
  const res = await axios.get<OSRMRouteResponse>(url, { timeout: 15000 });
  if (res.data.code !== "Ok" || !res.data.routes.length) {
    throw new Error("OSRM could not compute route");
  }
  return res.data.routes[0];
}

// Point-to-segment distance in km (for route corridor detection)
function pointToSegmentDist(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): number {
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return haversineKm(py, px, ay, ax);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return haversineKm(py, px, ay + t * dy, ax + t * dx);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

// Find stations within `corridorKm` of any point on the route polyline
function stationsAlongRoute(
  routeCoords: Array<[number, number]>, // [lon, lat]
  candidates: StationWithPrices[],
  corridorKm: number
): Array<{ station: StationWithPrices; distanceFromRoute: number }> {
  const results: Array<{ station: StationWithPrices; distanceFromRoute: number }> = [];

  for (const station of candidates) {
    let minDist = Infinity;
    for (let i = 0; i < routeCoords.length - 1; i++) {
      const [ax, ay] = routeCoords[i];
      const [bx, by] = routeCoords[i + 1];
      const d = pointToSegmentDist(station.lon, station.lat, ax, ay, bx, by);
      if (d < minDist) minDist = d;
    }
    if (minDist <= corridorKm) {
      results.push({ station, distanceFromRoute: minDist });
    }
  }
  return results;
}

// Select optimal refuel stops along the route
export async function planRoute(
  originAddress: string,
  destAddress: string,
  vehicleType: string,
  fuelType: FuelType,
  tankSizeLiters: number,
  currentFuelPercent: number,
  allStations: StationWithPrices[]
): Promise<RoutePlanResult> {
  const consumption = CONSUMPTION[vehicleType] ?? 7;

  const [originCoord, destCoord] = await Promise.all([
    geocode(originAddress),
    geocode(destAddress),
  ]);

  const route = await getOsrmRoute(originCoord, destCoord);
  const routeDistKm = route.distance / 1000;
  const coords = route.geometry.coordinates as Array<[number, number]>;

  // Current fuel in liters & max range
  const currentLiters = (currentFuelPercent / 100) * tankSizeLiters;
  const maxRangeKm = (currentLiters / consumption) * 100;

  // Filter stations that sell the requested fuel type and lie within 3km corridor
  const fuelStations = allStations.filter((s) => {
    if (fuelType === "benzina") return s.hasBenzina;
    if (fuelType === "gasolio") return s.hasGasolio;
    if (fuelType === "gpl") return s.hasGpl;
    if (fuelType === "elettrico") return s.hasElettrico;
    return true;
  });

  const near = stationsAlongRoute(coords, fuelStations, 3);

  // For each corridor station compute approx distance from origin along route
  // (simplified: use straight-line dist from origin as progress proxy)
  const originLatLng: [number, number] = [originCoord[1], originCoord[0]];

  const annotated = near.map(({ station, distanceFromRoute }) => {
    const progressKm = haversineKm(
      originLatLng[0], originLatLng[1],
      station.lat, station.lon
    );
    const priceInfo = station.latestPrices[fuelType];
    const price = priceInfo?.price ?? null;
    const fillLiters = tankSizeLiters * 0.8; // fill to 80%
    const estimatedCost = price !== null ? fillLiters * price : 0;
    const reachable = progressKm <= maxRangeKm;
    return { station, distanceFromRoute, progressKm, price, fillLiters, estimatedCost, reachable };
  });

  // Sort by progress along route, then by price (cheapest first among reachable)
  annotated.sort((a, b) => a.progressKm - b.progressKm);

  // Greedy selection: pick stops that keep user from running dry
  const stops: RoutePlanResult["stops"] = [];
  let remainingRangeKm = maxRangeKm;
  let lastStopDistKm = 0;

  for (const s of annotated) {
    if (!s.reachable) continue;
    const distFromLast = s.progressKm - lastStopDistKm;
    if (distFromLast >= remainingRangeKm * 0.85) {
      // Need to refuel before this point
      // Find cheapest station we can reach before running dry
      const reachableCandidates = annotated.filter(
        (c) =>
          c.progressKm > lastStopDistKm &&
          c.progressKm <= lastStopDistKm + remainingRangeKm &&
          c.price !== null
      );
      if (reachableCandidates.length) {
        reachableCandidates.sort((a, b) => (a.price ?? 9999) - (b.price ?? 9999));
        const pick = reachableCandidates[0];
        stops.push({
          station: pick.station,
          distanceFromRoute: pick.distanceFromRoute,
          estimatedCost: pick.estimatedCost,
          fillLiters: pick.fillLiters,
          reachable: true,
        });
        remainingRangeKm = (pick.fillLiters / consumption) * 100;
        lastStopDistKm = pick.progressKm;
      }
    }
  }

  const totalCost = stops.reduce((acc, s) => acc + s.estimatedCost, 0);

  return {
    route: {
      distance: route.distance,
      duration: route.duration,
      geometry: route.geometry,
    },
    stops,
    summary: {
      totalDistance: routeDistKm,
      estimatedTotalCost: totalCost,
      numberOfStops: stops.length,
      fuelConsumptionLper100km: consumption,
    },
  };
}
