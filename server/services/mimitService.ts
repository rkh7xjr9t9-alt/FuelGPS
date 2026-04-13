/**
 * MIMIT (Ministero delle Imprese e del Made in Italy) Data Ingestion Service
 * Downloads and parses the official Italian fuel station dataset + prices.
 * Primary authoritative data source — ~22,000 stations.
 *
 * Data format: pipe-delimited CSV, ISO-8859-1 encoded
 * Stations: https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv
 * Prices:   https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv
 */
import axios from "axios";
import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";
import type { IStorage } from "../storage";
import type { InsertStation, FuelType } from "@shared/schema";
import { PROVINCE_TO_REGION } from "@shared/schema";

const MIMIT_STATIONS_URL =
  "https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv";
const MIMIT_PRICES_URL =
  "https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv";

// Map MIMIT fuel names to our FuelType
function mapFuelType(desc: string): FuelType | null {
  const d = desc.toLowerCase().trim();
  if (d.includes("benzina") || d === "super") return "benzina";
  if (d.includes("gasolio") || d.includes("diesel")) return "gasolio";
  if (d.includes("gpl")) return "gpl";
  if (d.includes("metano") || d.includes("gnc") || d.includes("gnl"))
    return "metano";
  if (
    d.includes("elettric") ||
    d.includes("ricarica") ||
    d.includes("e-charge")
  )
    return "elettrico";
  return null;
}

async function downloadCSV(url: string): Promise<string> {
  console.log(`[MIMIT] Downloading ${url} ...`);
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 120_000,
    headers: {
      "User-Agent": "FuelGPS/2.0 (fuel station aggregator)",
    },
  });

  // MIMIT CSVs are typically ISO-8859-1 encoded
  const buffer = Buffer.from(response.data);
  try {
    const utf8 = buffer.toString("utf-8");
    // If there are replacement characters, it's not valid UTF-8
    if (utf8.includes("\uFFFD")) throw new Error("Not UTF-8");
    return utf8;
  } catch {
    return iconv.decode(buffer, "ISO-8859-1");
  }
}

export async function ingestMimitStations(
  storage: IStorage
): Promise<{ inserted: number; updated: number; skipped: number }> {
  console.log("[MIMIT] Starting station ingestion...");

  const csvText = await downloadCSV(MIMIT_STATIONS_URL);

  // The first line is a header like "Estrazione del 2026-04-12", skip it
  const lines = csvText.split("\n");
  const dataText = lines.slice(1).join("\n");

  // Parse CSV — MIMIT uses pipe separator, some fields contain unescaped quotes
  const records = parse(dataText, {
    delimiter: "|",
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
    quote: false, // disable quote handling — MIMIT data has unescaped quotes in fields
  });

  console.log(`[MIMIT] Parsed ${records.length} station rows`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    try {
      const mimitId = row["idImpianto"];
      const lat = parseFloat(
        (row["Latitudine"] || "0").replace(",", ".")
      );
      const lon = parseFloat(
        (row["Longitudine"] || "0").replace(",", ".")
      );

      if (!mimitId || isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) {
        skipped++;
        continue;
      }

      // Validate coordinates are within Italy bounds
      if (lat < 35.5 || lat > 47.5 || lon < 6.5 || lon > 18.6) {
        skipped++;
        continue;
      }

      const provincia = (row["Provincia"] || "").trim().toUpperCase();
      const region = PROVINCE_TO_REGION[provincia] || null;

      const brand = (row["Bandiera"] || "").trim();
      const operator = (row["Gestore"] || "").trim();
      const address = (row["Indirizzo"] || row["Nome Impianto"] || "").trim();
      const municipality = (row["Comune"] || "").trim();
      const tipoImpianto = (row["Tipo Impianto"] || "").toLowerCase().trim();

      const stationData: InsertStation = {
        mimitId: String(mimitId),
        name: brand
          ? `${brand} ${municipality}`
          : `Stazione ${municipality}`,
        brand: brand || null,
        operator: operator || null,
        address: address || null,
        municipality: municipality || null,
        province: provincia || null,
        region: region,
        lat,
        lon,
        source: "mimit",
        isActive: true,
        hasBenzina: false,
        hasGasolio: false,
        hasGpl: false,
        hasMetano: false,
        hasElettrico: false,
        hasSelfService: tipoImpianto.includes("self") || true,
        hasAttendant: tipoImpianto.includes("servito") || false,
      };

      const result = await storage.upsertStationByMimitId(stationData);
      if (result.isNew) inserted++;
      else updated++;
    } catch (e: any) {
      skipped++;
    }

    if (i > 0 && i % 5000 === 0) {
      console.log(`[MIMIT] Processed ${i}/${records.length} stations...`);
    }
  }

  console.log(
    `[MIMIT] Stations done: Inserted=${inserted}, Updated=${updated}, Skipped=${skipped}`
  );
  return { inserted, updated, skipped };
}

export async function ingestMimitPrices(
  storage: IStorage
): Promise<{ processed: number; skipped: number }> {
  console.log("[MIMIT] Starting price ingestion...");

  const csvText = await downloadCSV(MIMIT_PRICES_URL);

  // Skip the first line ("Estrazione del ...")
  const lines = csvText.split("\n");
  const dataText = lines.slice(1).join("\n");

  const records = parse(dataText, {
    delimiter: "|",
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
    quote: false,
  });

  console.log(`[MIMIT] Parsed ${records.length} price rows`);

  let processed = 0;
  let skipped = 0;

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    try {
      const mimitId = row["idImpianto"];
      const fuelDesc = row["descCarburante"] || "";
      const priceStr = (row["prezzo"] || "0").replace(",", ".");
      const isSelf = (row["isSelf"] || "1").trim();

      const price = parseFloat(priceStr);
      const fuelType = mapFuelType(fuelDesc);

      if (
        !mimitId ||
        !fuelType ||
        isNaN(price) ||
        price < 0.1 ||
        price > 10.0
      ) {
        skipped++;
        continue;
      }

      // Update station fuel type flags
      await storage.updateStationFuelFlag(String(mimitId), fuelType);

      // Insert price record
      await storage.reportPriceByMimitId(
        String(mimitId),
        fuelType,
        price,
        isSelf === "1" || isSelf.toLowerCase() === "true",
        "mimit"
      );
      processed++;
    } catch (e: any) {
      skipped++;
    }

    if (i > 0 && i % 20000 === 0) {
      console.log(`[MIMIT] Processed ${i}/${records.length} prices...`);
    }
  }

  console.log(
    `[MIMIT] Prices done: Processed=${processed}, Skipped=${skipped}`
  );
  return { processed, skipped };
}
