/**
 * OSRM Routing Service Wrapper
 * Wraps the Open Source Routing Machine with vehicle-aware processing.
 * Uses public OSRM API in dev, self-hosted in production.
 */
import axios from "axios";
import type { FuelType, StationWithPrices, FuelStop, RoutePlanResult, VehicleType } from "@shared/schema";
import { DEFAULT_CONSUMPTION } from "@shared/schema";
import { geocode } from "./geocodingService";

// Use self-hosted OSRM if available, fallback to public
const OSRM_BASE = process.env.OSRM_URL || "https://router.project-osrm.org";

interface OSRMRouteResponse {
  code: string;
  routes: Array<{
    distance: number;
    duration: number;
    geometry: GeoJSON.LineString;
    legs: Array<{
      distance: number;
      duration: number;
      steps: Array<{
        distance: number;
        duration: number;
        maneuver: { location: [number, number] };
      }>;
    }>;
  }>;
  waypoints: Array<{ location: [number, number]; name: string }>;
}

// Haversine distance in km
function haversineKm(
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

// Point-to-segment distance in km
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

/**
 * Get OSRM route between multiple [lon,lat] waypoints
 */
export async function getRoute(
  ...waypoints: Array<[number, number]>
): Promise<OSRMRouteResponse["routes"][0]> {
  if (waypoints.length < 2) throw new Error("Need at least 2 waypoints");
  const coords = waypoints.map((w) => `${w[0]},${w[1]}`).join(";");
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`;

  const res = await axios.get<OSRMRouteResponse>(url, { timeout: 30000 });
  if (res.data.code !== "Ok" || !res.data.routes.length) {
    throw new Error("OSRM could not compute route");
  }
  return res.data.routes[0];
}

/**
 * Find stations within corridorKm of the route polyline.
 * Also computes approximate progress along the route.
 */
function findStationsAlongRoute(
  routeCoords: Array<[number, number]>,
  candidates: StationWithPrices[],
  corridorKm: number
): Array<{ station: StationWithPrices; distanceFromRoute: number; progressKm: number }> {
  // Precompute cumulative distances along route
  const cumulDist: number[] = [0];
  for (let i = 1; i < routeCoords.length; i++) {
    const [ax, ay] = routeCoords[i - 1];
    const [bx, by] = routeCoords[i];
    cumulDist.push(cumulDist[i - 1] + haversineKm(ay, ax, by, bx));
  }

  const results: Array<{
    station: StationWithPrices;
    distanceFromRoute: number;
    progressKm: number;
  }> = [];

  for (const station of candidates) {
    let minDist = Infinity;
    let bestSegIdx = 0;

    for (let i = 0; i < routeCoords.length - 1; i++) {
      const [ax, ay] = routeCoords[i];
      const [bx, by] = routeCoords[i + 1];
      const d = pointToSegmentDist(station.lon, station.lat, ax, ay, bx, by);
      if (d < minDist) {
        minDist = d;
        bestSegIdx = i;
      }
    }

    if (minDist <= corridorKm) {
      // Approximate progress along route
      const segStart = cumulDist[bestSegIdx];
      const [ax, ay] = routeCoords[bestSegIdx];
      const extraDist = haversineKm(ay, ax, station.lat, station.lon);
      const progressKm = segStart + extraDist;

      results.push({ station, distanceFromRoute: minDist, progressKm });
    }
  }

  // Sort by progress along route
  results.sort((a, b) => a.progressKm - b.progressKm);
  return results;
}

/**
 * Fuel stop optimization — greedy algorithm
 * When remaining range drops below safety threshold, find cheapest reachable station.
 */
function optimizeFuelStops(
  corridorStations: Array<{
    station: StationWithPrices;
    distanceFromRoute: number;
    progressKm: number;
  }>,
  fuelType: FuelType,
  initialRangeKm: number,
  tankSizeLiters: number,
  consumptionLper100km: number,
  maxDetourKm: number
): FuelStop[] {
  const stops: FuelStop[] = [];
  const maxRangeKm = (tankSizeLiters / consumptionLper100km) * 100;
  const safetyThreshold = maxRangeKm * 0.2; // Refuel when 20% range remaining
  let remainingRangeKm = initialRangeKm;
  let lastStopProgressKm = 0;

  // Walk along the route
  for (let i = 0; i < corridorStations.length; i++) {
    const current = corridorStations[i];
    const distFromLastStop = current.progressKm - lastStopProgressKm;

    // Check if we need to refuel before reaching this point
    if (remainingRangeKm - distFromLastStop <= safetyThreshold) {
      // Find all stations we can still reach
      const reachable = corridorStations.filter(
        (s) =>
          s.progressKm > lastStopProgressKm &&
          s.progressKm <= lastStopProgressKm + remainingRangeKm - 5 && // 5km safety margin
          s.distanceFromRoute <= maxDetourKm
      );

      if (reachable.length === 0) continue;

      // Score by price * (1 + detour penalty)
      const scored = reachable.map((s) => {
        const priceInfo = s.station.latestPrices[fuelType];
        const price = priceInfo?.price ?? 999;
        const score = price * (1 + s.distanceFromRoute * 0.02);
        return { ...s, price, score };
      });

      scored.sort((a, b) => a.score - b.score);
      const pick = scored[0];

      const fillLiters = tankSizeLiters * 0.8; // Fill to 80%
      const estimatedCost = pick.price < 900 ? fillLiters * pick.price : 0;

      stops.push({
        station: pick.station,
        distanceFromRoute: pick.distanceFromRoute,
        estimatedCost,
        fillLiters,
        reachable: true,
        progressKm: pick.progressKm,
      });

      remainingRangeKm = (fillLiters / consumptionLper100km) * 100;
      lastStopProgressKm = pick.progressKm;
    }
  }

  return stops;
}

/**
 * Full route planning with fuel stop optimization
 */
export async function planRoute(
  originAddress: string,
  destAddress: string,
  vehicleType: VehicleType,
  fuelType: FuelType,
  tankSizeLiters: number,
  currentFuelPercent: number,
  allStations: StationWithPrices[],
  options?: {
    consumptionLper100km?: number;
    optimizeFor?: "fastest" | "cheapest_fuel";
    maxDetourKm?: number;
  }
): Promise<RoutePlanResult> {
  const consumption =
    options?.consumptionLper100km ?? DEFAULT_CONSUMPTION[vehicleType] ?? 7;
  const maxDetourKm = options?.maxDetourKm ?? 5;
  const corridorKm = maxDetourKm + 2; // Search slightly beyond max detour

  // Geocode addresses
  const [originCoord, destCoord] = await Promise.all([
    geocode(originAddress),
    geocode(destAddress),
  ]);

  // Step 1: Get direct OSRM route (to find corridor stations)
  const directRoute = await getRoute(originCoord, destCoord);
  const coords = directRoute.geometry.coordinates as Array<[number, number]>;

  // Current fuel state
  const currentLiters = (currentFuelPercent / 100) * tankSizeLiters;
  const initialRangeKm = (currentLiters / consumption) * 100;

  // Filter stations by fuel type
  const fuelStations = allStations.filter((s) => {
    if (fuelType === "benzina") return s.hasBenzina;
    if (fuelType === "gasolio") return s.hasGasolio;
    if (fuelType === "gpl") return s.hasGpl;
    if (fuelType === "metano") return s.hasMetano;
    if (fuelType === "elettrico") return s.hasElettrico;
    return true;
  });

  // Find stations along direct route corridor
  const corridorStations = findStationsAlongRoute(
    coords,
    fuelStations,
    corridorKm
  );

  // Optimize fuel stops
  const stops = optimizeFuelStops(
    corridorStations,
    fuelType,
    initialRangeKm,
    tankSizeLiters,
    consumption,
    maxDetourKm
  );

  // Step 2: If there are fuel stops, re-route through them
  let finalRoute = directRoute;
  if (stops.length > 0) {
    try {
      const waypoints: Array<[number, number]> = [
        originCoord,
        ...stops.map((s) => [s.station.lon, s.station.lat] as [number, number]),
        destCoord,
      ];
      finalRoute = await getRoute(...waypoints);
      console.log(`[Route] Re-routed through ${stops.length} fuel stop(s)`);
    } catch (e: any) {
      console.warn("[Route] Multi-waypoint route failed, using direct route:", e.message);
      // Fall back to direct route
    }
  }

  const totalCost = stops.reduce((acc, s) => acc + s.estimatedCost, 0);
  const routeDistKm = finalRoute.distance / 1000;

  return {
    route: {
      distance: finalRoute.distance,
      duration: finalRoute.duration,
      geometry: finalRoute.geometry,
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
