/**
 * Geocoding Service — Nominatim with Photon fallback
 * Free, self-hostable geocoding for Italian addresses.
 */
import axios from "axios";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org";
const PHOTON_URL = "https://photon.komoot.io/api";

interface GeoResult {
  lat: number;
  lon: number;
  displayName: string;
}

/**
 * Geocode a free-text address to [lon, lat] — Nominatim primary, Photon fallback
 */
export async function geocode(address: string): Promise<[number, number]> {
  try {
    return await geocodeNominatim(address);
  } catch (e: any) {
    console.warn(`[Geocode] Nominatim failed for "${address}", trying Photon:`, e.message);
    return await geocodePhoton(address);
  }
}

async function geocodeNominatim(address: string): Promise<[number, number]> {
  const res = await axios.get(`${NOMINATIM_URL}/search`, {
    params: {
      q: `${address}, Italy`,
      format: "json",
      limit: 1,
      countrycodes: "it",
    },
    headers: { "User-Agent": "FuelGPS/2.0 (fuel-station-app)" },
    timeout: 10000,
  });

  if (!res.data?.length) {
    throw new Error(`Cannot geocode: "${address}"`);
  }

  const { lon, lat } = res.data[0];
  return [parseFloat(lon), parseFloat(lat)];
}

async function geocodePhoton(address: string): Promise<[number, number]> {
  const res = await axios.get(PHOTON_URL, {
    params: {
      q: `${address} Italy`,
      limit: 1,
      lang: "it",
    },
    timeout: 10000,
  });

  const features = res.data?.features;
  if (!features?.length) {
    throw new Error(`Cannot geocode: "${address}"`);
  }

  const [lon, lat] = features[0].geometry.coordinates;
  return [lon, lat];
}

/**
 * Reverse geocode [lat, lon] to a display name
 */
export async function reverseGeocode(
  lat: number,
  lon: number
): Promise<string> {
  try {
    const res = await axios.get(`${NOMINATIM_URL}/reverse`, {
      params: { lat, lon, format: "json", zoom: 18 },
      headers: { "User-Agent": "FuelGPS/2.0" },
      timeout: 10000,
    });
    return res.data?.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
}

/**
 * Autocomplete search for Italian addresses
 */
export async function autocomplete(
  query: string,
  limit = 5
): Promise<GeoResult[]> {
  try {
    const res = await axios.get(`${NOMINATIM_URL}/search`, {
      params: {
        q: query,
        format: "json",
        limit,
        countrycodes: "it",
        addressdetails: 1,
      },
      headers: { "User-Agent": "FuelGPS/2.0" },
      timeout: 8000,
    });

    return (res.data || []).map((r: any) => ({
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      displayName: r.display_name,
    }));
  } catch {
    return [];
  }
}
