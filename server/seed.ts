/**
 * Seed 50 realistic fuel stations spread across Italy for testing.
 * Called at startup if SEED_DB !== "false".
 */
import type { IStorage } from "./storage";

interface SeedStation {
  name: string;
  city: string;
  lat: number;
  lon: number;
  brand?: string;
  hasBenzina?: boolean;
  hasGasolio?: boolean;
  hasGpl?: boolean;
  hasElettrico?: boolean;
  benzina?: number;
  gasolio?: number;
  gpl?: number;
  elettrico?: number;
}

const SEED_DATA: SeedStation[] = [
  { name: "ENI Roma Centro", city: "Roma", lat: 41.9028, lon: 12.4964, brand: "ENI", hasBenzina: true, hasGasolio: true, hasGpl: true, benzina: 1.789, gasolio: 1.699, gpl: 0.789 },
  { name: "IP Roma Trastevere", city: "Roma", lat: 41.8895, lon: 12.4707, brand: "IP", hasBenzina: true, hasGasolio: true, benzina: 1.769, gasolio: 1.689 },
  { name: "Q8 Roma Prati", city: "Roma", lat: 41.9031, lon: 12.4663, brand: "Q8", hasBenzina: true, hasGasolio: true, hasElettrico: true, benzina: 1.779, gasolio: 1.695, elettrico: 0.55 },
  { name: "Tamoil Milano Duomo", city: "Milano", lat: 45.4654, lon: 9.1886, brand: "Tamoil", hasBenzina: true, hasGasolio: true, benzina: 1.759, gasolio: 1.675 },
  { name: "ENI Milano Navigli", city: "Milano", lat: 45.4470, lon: 9.1793, brand: "ENI", hasBenzina: true, hasGasolio: true, hasGpl: true, benzina: 1.765, gasolio: 1.682, gpl: 0.795 },
  { name: "IP Milano Centrale", city: "Milano", lat: 45.4863, lon: 9.2046, brand: "IP", hasBenzina: true, hasGasolio: true, hasElettrico: true, benzina: 1.749, gasolio: 1.669, elettrico: 0.52 },
  { name: "Q8 Torino Crocetta", city: "Torino", lat: 45.0534, lon: 7.6665, brand: "Q8", hasBenzina: true, hasGasolio: true, benzina: 1.772, gasolio: 1.688 },
  { name: "ENI Torino Lingotto", city: "Torino", lat: 45.0259, lon: 7.6758, brand: "ENI", hasBenzina: true, hasGasolio: true, hasGpl: true, benzina: 1.768, gasolio: 1.684, gpl: 0.782 },
  { name: "Shell Torino Piazza Statuto", city: "Torino", lat: 45.0705, lon: 7.6742, brand: "Shell", hasBenzina: true, hasGasolio: true, hasElettrico: true, benzina: 1.785, gasolio: 1.699, elettrico: 0.58 },
  { name: "Agip Napoli Posillipo", city: "Napoli", lat: 40.8195, lon: 14.1959, brand: "Agip", hasBenzina: true, hasGasolio: true, benzina: 1.798, gasolio: 1.712 },
  { name: "IP Napoli Vomero", city: "Napoli", lat: 40.8471, lon: 14.2210, brand: "IP", hasBenzina: true, hasGasolio: true, hasGpl: true, benzina: 1.789, gasolio: 1.705, gpl: 0.799 },
  { name: "ENI Napoli Centro", city: "Napoli", lat: 40.8359, lon: 14.2488, brand: "ENI", hasBenzina: true, hasGasolio: true, benzina: 1.795, gasolio: 1.709 },
  { name: "Q8 Palermo Mondello", city: "Palermo", lat: 38.2153, lon: 13.3217, brand: "Q8", hasBenzina: true, hasGasolio: true, benzina: 1.809, gasolio: 1.725 },
  { name: "IP Palermo Centro", city: "Palermo", lat: 38.1157, lon: 13.3615, brand: "IP", hasBenzina: true, hasGasolio: true, hasGpl: true, benzina: 1.799, gasolio: 1.715, gpl: 0.805 },
  { name: "Tamoil Genova Porto", city: "Genova", lat: 44.4056, lon: 8.9463, brand: "Tamoil", hasBenzina: true, hasGasolio: true, benzina: 1.775, gasolio: 1.691 },
  { name: "ENI Genova Brignole", city: "Genova", lat: 44.4081, lon: 8.9458, brand: "ENI", hasBenzina: true, hasGasolio: true, hasElettrico: true, benzina: 1.769, gasolio: 1.685, elettrico: 0.54 },
  { name: "Shell Bologna Autosole", city: "Bologna", lat: 44.4949, lon: 11.3426, brand: "Shell", hasBenzina: true, hasGasolio: true, benzina: 1.762, gasolio: 1.679 },
  { name: "IP Bologna Centro", city: "Bologna", lat: 44.4945, lon: 11.3426, brand: "IP", hasBenzina: true, hasGasolio: true, hasGpl: true, benzina: 1.758, gasolio: 1.674, gpl: 0.788 },
  { name: "ENI Firenze Oltrarno", city: "Firenze", lat: 43.7652, lon: 11.2483, brand: "ENI", hasBenzina: true, hasGasolio: true, benzina: 1.782, gasolio: 1.698 },
  { name: "Q8 Firenze Viali", city: "Firenze", lat: 43.7696, lon: 11.2558, brand: "Q8", hasBenzina: true, hasGasolio: true, hasElettrico: true, benzina: 1.779, gasolio: 1.695, elettrico: 0.56 },
  { name: "IP Bari Murattiano", city: "Bari", lat: 41.1177, lon: 16.8719, brand: "IP", hasBenzina: true, hasGasolio: true, benzina: 1.791, gasolio: 1.707 },
  { name: "ENI Bari Poggiofranco", city: "Bari", lat: 41.1082, lon: 16.8640, brand: "ENI", hasBenzina: true, hasGasolio: true, hasGpl: true, benzina: 1.785, gasolio: 1.701, gpl: 0.797 },
  { name: "Shell Catania Etnea", city: "Catania", lat: 37.5023, lon: 15.0873, brand: "Shell", hasBenzina: true, hasGasolio: true, benzina: 1.812, gasolio: 1.728 },
  { name: "Agip Venezia Mestre", city: "Venezia", lat: 45.4964, lon: 12.2424, brand: "Agip", hasBenzina: true, hasGasolio: true, hasElettrico: true, benzina: 1.776, gasolio: 1.692, elettrico: 0.57 },
  { name: "IP Venezia Marghera", city: "Venezia", lat: 45.4707, lon: 12.2238, brand: "IP", hasBenzina: true, hasGasolio: true, benzina: 1.772, gasolio: 1.688 },
  { name: "ENI Verona Centro", city: "Verona", lat: 45.4384, lon: 10.9916, brand: "ENI", hasBenzina: true, hasGasolio: true, hasGpl: true, benzina: 1.764, gasolio: 1.680, gpl: 0.784 },
  { name: "Q8 Padova Arcella", city: "Padova", lat: 45.4210, lon: 11.8747, brand: "Q8", hasBenzina: true, hasGasolio: true, benzina: 1.767, gasolio: 1.683 },
  { name: "IP Trieste Roiano", city: "Trieste", lat: 45.6495, lon: 13.7768, brand: "IP", hasBenzina: true, hasGasolio: true, hasElettrico: true, benzina: 1.755, gasolio: 1.671, elettrico: 0.53 },
  { name: "ENI Trento Gardolo", city: "Trento", lat: 46.0959, lon: 11.1218, brand: "ENI", hasBenzina: true, hasGasolio: true, hasGpl: true, benzina: 1.748, gasolio: 1.664, gpl: 0.778 },
  { name: "Shell Bolzano Bozen Centro", city: "Bolzano", lat: 46.4983, lon: 11.3548, brand: "Shell", hasBenzina: true, hasGasolio: true, benzina: 1.745, gasolio: 1.661 },
  { name: "IP Perugia Fontivegge", city: "Perugia", lat: 43.1107, lon: 12.3908, brand: "IP", hasBenzina: true, hasGasolio: true, benzina: 1.784, gasolio: 1.700 },
  { name: "ENI Ancona Vallemiano", city: "Ancona", lat: 43.6158, lon: 13.5189, brand: "ENI", hasBenzina: true, hasGasolio: true, hasGpl: true, benzina: 1.780, gasolio: 1.696, gpl: 0.790 },
  { name: "Q8 Pescara Portanuova", city: "Pescara", lat: 42.4584, lon: 14.2158, brand: "Q8", hasBenzina: true, hasGasolio: true, benzina: 1.793, gasolio: 1.709 },
  { name: "Tamoil L'Aquila Centro", city: "L'Aquila", lat: 42.3498, lon: 13.3995, brand: "Tamoil", hasBenzina: true, hasGasolio: true, benzina: 1.788, gasolio: 1.704 },
  { name: "IP Potenza Macchia Romana", city: "Potenza", lat: 40.6394, lon: 15.8085, brand: "IP", hasBenzina: true, hasGasolio: true, hasGpl: true, benzina: 1.796, gasolio: 1.712, gpl: 0.802 },
  { name: "ENI Catanzaro Centro", city: "Catanzaro", lat: 38.9098, lon: 16.5872, brand: "ENI", hasBenzina: true, hasGasolio: true, benzina: 1.801, gasolio: 1.717 },
  { name: "Shell Reggio Calabria Sbarre", city: "Reggio Calabria", lat: 38.1157, lon: 15.6475, brand: "Shell", hasBenzina: true, hasGasolio: true, hasElettrico: true, benzina: 1.805, gasolio: 1.721, elettrico: 0.59 },
  { name: "IP Messina Gazzi", city: "Messina", lat: 38.1938, lon: 15.5542, brand: "IP", hasBenzina: true, hasGasolio: true, benzina: 1.808, gasolio: 1.724 },
  { name: "ENI Cagliari Pirri", city: "Cagliari", lat: 39.2238, lon: 9.1217, brand: "ENI", hasBenzina: true, hasGasolio: true, hasGpl: true, benzina: 1.802, gasolio: 1.718, gpl: 0.808 },
  { name: "Q8 Sassari Monte Rosello", city: "Sassari", lat: 40.7259, lon: 8.5594, brand: "Q8", hasBenzina: true, hasGasolio: true, benzina: 1.799, gasolio: 1.715 },
  { name: "IP Brescia Brescia2", city: "Brescia", lat: 45.5416, lon: 10.2118, brand: "IP", hasBenzina: true, hasGasolio: true, hasElettrico: true, benzina: 1.761, gasolio: 1.677, elettrico: 0.54 },
  { name: "ENI Bergamo Longuelo", city: "Bergamo", lat: 45.6983, lon: 9.6773, brand: "ENI", hasBenzina: true, hasGasolio: true, benzina: 1.763, gasolio: 1.679 },
  { name: "Shell Modena Centro", city: "Modena", lat: 44.6458, lon: 10.9254, brand: "Shell", hasBenzina: true, hasGasolio: true, hasGpl: true, benzina: 1.756, gasolio: 1.672, gpl: 0.786 },
  { name: "IP Parma Cittadella", city: "Parma", lat: 44.8015, lon: 10.3279, brand: "IP", hasBenzina: true, hasGasolio: true, benzina: 1.754, gasolio: 1.670 },
  { name: "ENI Reggio Emilia", city: "Reggio Emilia", lat: 44.6989, lon: 10.6297, brand: "ENI", hasBenzina: true, hasGasolio: true, hasGpl: true, benzina: 1.757, gasolio: 1.673, gpl: 0.787 },
  { name: "Q8 Ravenna Darsena", city: "Ravenna", lat: 44.4184, lon: 12.2035, brand: "Q8", hasBenzina: true, hasGasolio: true, benzina: 1.760, gasolio: 1.676 },
  { name: "Tamoil Pisa San Giusto", city: "Pisa", lat: 43.7228, lon: 10.4017, brand: "Tamoil", hasBenzina: true, hasGasolio: true, benzina: 1.781, gasolio: 1.697 },
  { name: "IP Livorno Shangai", city: "Livorno", lat: 43.5485, lon: 10.3106, brand: "IP", hasBenzina: true, hasGasolio: true, hasElettrico: true, benzina: 1.777, gasolio: 1.693, elettrico: 0.55 },
  { name: "ENI Siena Acquacalda", city: "Siena", lat: 43.3188, lon: 11.3307, brand: "ENI", hasBenzina: true, hasGasolio: true, benzina: 1.783, gasolio: 1.699 },
  { name: "Shell Lucca Arancio", city: "Lucca", lat: 43.8430, lon: 10.5008, brand: "Shell", hasBenzina: true, hasGasolio: true, hasGpl: true, benzina: 1.779, gasolio: 1.695, gpl: 0.789 },
];

let seeded = false;

export async function seedStations(storage: IStorage): Promise<void> {
  if (seeded) return;
  seeded = true;

  if (process.env.SEED_DB === "false") return;

  console.log("[Seed] Inserting sample stations...");
  let count = 0;

  for (const s of SEED_DATA) {
    const station = await storage.upsertStationByOsmId({
      osmId: `seed-${s.name.replace(/\s+/g, "-").toLowerCase()}`,
      name: s.name,
      address: null,
      city: s.city,
      lat: s.lat,
      lon: s.lon,
      brand: s.brand ?? null,
      hasBenzina: s.hasBenzina ?? false,
      hasGasolio: s.hasGasolio ?? false,
      hasGpl: s.hasGpl ?? false,
      hasElettrico: s.hasElettrico ?? false,
    });

    // Report prices
    if (s.benzina) await storage.reportPrice(station.id, null, "benzina", s.benzina);
    if (s.gasolio) await storage.reportPrice(station.id, null, "gasolio", s.gasolio);
    if (s.gpl) await storage.reportPrice(station.id, null, "gpl", s.gpl);
    if (s.elettrico) await storage.reportPrice(station.id, null, "elettrico", s.elettrico);
    count++;
  }

  console.log(`[Seed] Inserted ${count} stations with prices.`);
}
