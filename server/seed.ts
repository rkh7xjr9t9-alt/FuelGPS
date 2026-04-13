/**
 * Seed data for development — realistic Italian fuel stations around major cities.
 * Used when MIMIT/OSM data isn't available (e.g., demo/development).
 */
import type { IStorage } from "./storage";
import type { FuelType } from "@shared/schema";

interface SeedStation {
  name: string;
  brand: string;
  lat: number;
  lon: number;
  municipality: string;
  province: string;
  region: string;
  fuels: FuelType[];
  prices: Partial<Record<FuelType, number>>;
  is24h?: boolean;
  hasSelfService?: boolean;
  hasCarWash?: boolean;
  hasShop?: boolean;
}

const SEED_DATA: SeedStation[] = [
  // Torino area
  { name: "ENI Torino Centro", brand: "ENI", lat: 45.0703, lon: 7.6869, municipality: "Torino", province: "TO", region: "Piemonte", fuels: ["benzina", "gasolio", "gpl"], prices: { benzina: 1.789, gasolio: 1.699, gpl: 0.789 }, is24h: true, hasSelfService: true, hasShop: true },
  { name: "Q8 Torino Nord", brand: "Q8", lat: 45.0981, lon: 7.6624, municipality: "Torino", province: "TO", region: "Piemonte", fuels: ["benzina", "gasolio"], prices: { benzina: 1.809, gasolio: 1.719 }, hasSelfService: true },
  { name: "IP Chivasso", brand: "IP", lat: 45.1886, lon: 7.8873, municipality: "Chivasso", province: "TO", region: "Piemonte", fuels: ["benzina", "gasolio", "gpl", "metano"], prices: { benzina: 1.769, gasolio: 1.679, gpl: 0.769, metano: 1.399 }, is24h: true, hasSelfService: true, hasCarWash: true },
  { name: "Shell Settimo Torinese", brand: "Shell", lat: 45.1356, lon: 7.7696, municipality: "Settimo Torinese", province: "TO", region: "Piemonte", fuels: ["benzina", "gasolio"], prices: { benzina: 1.829, gasolio: 1.739 }, hasShop: true },
  { name: "Tamoil Moncalieri", brand: "Tamoil", lat: 44.9997, lon: 7.6828, municipality: "Moncalieri", province: "TO", region: "Piemonte", fuels: ["benzina", "gasolio", "gpl"], prices: { benzina: 1.779, gasolio: 1.689, gpl: 0.799 } },
  // Milano area
  { name: "ENI Milano Centrale", brand: "ENI", lat: 45.4842, lon: 9.2029, municipality: "Milano", province: "MI", region: "Lombardia", fuels: ["benzina", "gasolio"], prices: { benzina: 1.839, gasolio: 1.749 }, is24h: true, hasSelfService: true, hasShop: true },
  { name: "Q8 Milano Linate", brand: "Q8", lat: 45.4540, lon: 9.2769, municipality: "Milano", province: "MI", region: "Lombardia", fuels: ["benzina", "gasolio", "gpl"], prices: { benzina: 1.819, gasolio: 1.729, gpl: 0.809 }, hasSelfService: true },
  { name: "Esso Monza", brand: "Esso", lat: 45.5845, lon: 9.2744, municipality: "Monza", province: "MB", region: "Lombardia", fuels: ["benzina", "gasolio"], prices: { benzina: 1.799, gasolio: 1.709 }, is24h: true },
  { name: "IP Bergamo", brand: "IP", lat: 45.6983, lon: 9.6773, municipality: "Bergamo", province: "BG", region: "Lombardia", fuels: ["benzina", "gasolio", "metano"], prices: { benzina: 1.779, gasolio: 1.689, metano: 1.379 }, hasCarWash: true },
  // Roma area
  { name: "ENI Roma EUR", brand: "ENI", lat: 41.8264, lon: 12.4677, municipality: "Roma", province: "RM", region: "Lazio", fuels: ["benzina", "gasolio", "gpl"], prices: { benzina: 1.849, gasolio: 1.759, gpl: 0.829 }, is24h: true, hasSelfService: true },
  { name: "Q8 Roma Tiburtina", brand: "Q8", lat: 41.9109, lon: 12.5283, municipality: "Roma", province: "RM", region: "Lazio", fuels: ["benzina", "gasolio"], prices: { benzina: 1.859, gasolio: 1.769 }, hasShop: true },
  { name: "Shell Roma GRA", brand: "Shell", lat: 41.8815, lon: 12.5891, municipality: "Roma", province: "RM", region: "Lazio", fuels: ["benzina", "gasolio", "gpl", "metano"], prices: { benzina: 1.829, gasolio: 1.739, gpl: 0.819, metano: 1.419 }, is24h: true, hasSelfService: true, hasCarWash: true },
  { name: "Tamoil Fiumicino", brand: "Tamoil", lat: 41.7934, lon: 12.2514, municipality: "Fiumicino", province: "RM", region: "Lazio", fuels: ["benzina", "gasolio"], prices: { benzina: 1.819, gasolio: 1.729 } },
  // Napoli area
  { name: "ENI Napoli Centro", brand: "ENI", lat: 40.8518, lon: 14.2681, municipality: "Napoli", province: "NA", region: "Campania", fuels: ["benzina", "gasolio", "gpl"], prices: { benzina: 1.819, gasolio: 1.729, gpl: 0.799 }, hasSelfService: true },
  { name: "IP Caserta", brand: "IP", lat: 41.0742, lon: 14.3331, municipality: "Caserta", province: "CE", region: "Campania", fuels: ["benzina", "gasolio", "metano"], prices: { benzina: 1.789, gasolio: 1.699, metano: 1.389 }, is24h: true },
  // Bologna area
  { name: "ENI Bologna A1", brand: "ENI", lat: 44.4949, lon: 11.3426, municipality: "Bologna", province: "BO", region: "Emilia-Romagna", fuels: ["benzina", "gasolio", "gpl"], prices: { benzina: 1.809, gasolio: 1.719, gpl: 0.809 }, is24h: true, hasSelfService: true, hasShop: true },
  { name: "Q8 Modena", brand: "Q8", lat: 44.6471, lon: 10.9252, municipality: "Modena", province: "MO", region: "Emilia-Romagna", fuels: ["benzina", "gasolio"], prices: { benzina: 1.799, gasolio: 1.709 } },
  // Firenze area
  { name: "Shell Firenze Nord", brand: "Shell", lat: 43.7942, lon: 11.2462, municipality: "Firenze", province: "FI", region: "Toscana", fuels: ["benzina", "gasolio", "gpl"], prices: { benzina: 1.839, gasolio: 1.749, gpl: 0.819 }, is24h: true, hasSelfService: true },
  { name: "Esso Prato", brand: "Esso", lat: 43.8777, lon: 11.0966, municipality: "Prato", province: "PO", region: "Toscana", fuels: ["benzina", "gasolio"], prices: { benzina: 1.799, gasolio: 1.709 }, hasCarWash: true },
  // Venezia area
  { name: "ENI Mestre", brand: "ENI", lat: 45.4896, lon: 12.2381, municipality: "Venezia", province: "VE", region: "Veneto", fuels: ["benzina", "gasolio", "metano"], prices: { benzina: 1.819, gasolio: 1.729, metano: 1.399 }, hasSelfService: true },
  { name: "IP Padova", brand: "IP", lat: 45.4064, lon: 11.8768, municipality: "Padova", province: "PD", region: "Veneto", fuels: ["benzina", "gasolio", "gpl"], prices: { benzina: 1.789, gasolio: 1.699, gpl: 0.789 }, is24h: true },
  // Genova area
  { name: "Q8 Genova Porto", brand: "Q8", lat: 44.4056, lon: 8.9463, municipality: "Genova", province: "GE", region: "Liguria", fuels: ["benzina", "gasolio"], prices: { benzina: 1.849, gasolio: 1.759 }, hasShop: true },
  // Palermo area
  { name: "ENI Palermo", brand: "ENI", lat: 38.1157, lon: 13.3615, municipality: "Palermo", province: "PA", region: "Sicilia", fuels: ["benzina", "gasolio", "gpl"], prices: { benzina: 1.829, gasolio: 1.739, gpl: 0.829 }, is24h: true },
  // Bari area
  { name: "IP Bari Sud", brand: "IP", lat: 41.1171, lon: 16.8719, municipality: "Bari", province: "BA", region: "Puglia", fuels: ["benzina", "gasolio", "gpl", "metano"], prices: { benzina: 1.799, gasolio: 1.709, gpl: 0.799, metano: 1.409 }, hasSelfService: true, hasCarWash: true },
  // EV Charging stations
  { name: "Enel X Torino", brand: "Enel X", lat: 45.0627, lon: 7.6784, municipality: "Torino", province: "TO", region: "Piemonte", fuels: ["elettrico"], prices: { elettrico: 0.59 }, is24h: true },
  { name: "Tesla Supercharger Milano", brand: "Tesla", lat: 45.4672, lon: 9.1904, municipality: "Milano", province: "MI", region: "Lombardia", fuels: ["elettrico"], prices: { elettrico: 0.45 }, is24h: true },
  { name: "Enel X Roma", brand: "Enel X", lat: 41.9028, lon: 12.4964, municipality: "Roma", province: "RM", region: "Lazio", fuels: ["elettrico"], prices: { elettrico: 0.55 }, is24h: true },
  // Highway stations (autostrada)
  { name: "ENI Area Novara Nord A26", brand: "ENI", lat: 45.4501, lon: 8.6221, municipality: "Novara", province: "NO", region: "Piemonte", fuels: ["benzina", "gasolio", "gpl"], prices: { benzina: 1.899, gasolio: 1.809, gpl: 0.869 }, is24h: true, hasSelfService: true, hasShop: true, hasCarWash: true },
  { name: "IP Area Piacenza A1", brand: "IP", lat: 45.0526, lon: 9.6932, municipality: "Piacenza", province: "PC", region: "Emilia-Romagna", fuels: ["benzina", "gasolio", "gpl", "metano"], prices: { benzina: 1.879, gasolio: 1.789, gpl: 0.849, metano: 1.459 }, is24h: true, hasShop: true },
  { name: "Shell Area Arezzo A1", brand: "Shell", lat: 43.4636, lon: 11.8786, municipality: "Arezzo", province: "AR", region: "Toscana", fuels: ["benzina", "gasolio"], prices: { benzina: 1.869, gasolio: 1.779 }, is24h: true, hasSelfService: true },
  { name: "Q8 Area Orvieto A1", brand: "Q8", lat: 42.7184, lon: 12.1109, municipality: "Orvieto", province: "TR", region: "Umbria", fuels: ["benzina", "gasolio", "gpl"], prices: { benzina: 1.859, gasolio: 1.769, gpl: 0.849 }, is24h: true, hasShop: true },
];

export async function seedStations(storage: IStorage): Promise<void> {
  const count = await storage.getStationCount();
  if (count > 0) {
    console.log(`[Seed] Skipping — ${count} stations already in database`);
    return;
  }

  console.log(`[Seed] Inserting ${SEED_DATA.length} sample stations...`);

  for (const s of SEED_DATA) {
    const station = await storage.createStation({
      name: s.name,
      brand: s.brand,
      lat: s.lat,
      lon: s.lon,
      municipality: s.municipality,
      province: s.province,
      region: s.region,
      hasBenzina: s.fuels.includes("benzina"),
      hasGasolio: s.fuels.includes("gasolio"),
      hasGpl: s.fuels.includes("gpl"),
      hasMetano: s.fuels.includes("metano"),
      hasElettrico: s.fuels.includes("elettrico"),
      is24h: s.is24h || false,
      hasSelfService: s.hasSelfService || false,
      hasCarWash: s.hasCarWash || false,
      hasShop: s.hasShop || false,
      source: "seed",
      isActive: true,
    });

    // Add prices
    for (const [fuel, price] of Object.entries(s.prices)) {
      await storage.reportPrice(
        station.id,
        null,
        fuel as FuelType,
        price,
        true,
        "seed"
      );
    }
  }

  console.log(`[Seed] Inserted ${SEED_DATA.length} stations with prices`);
}
