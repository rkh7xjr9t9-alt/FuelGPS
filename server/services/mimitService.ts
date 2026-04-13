/**
 * MIMIT (Ministero delle Imprese e del Made in Italy) Data Ingestion Service
 * Downloads and parses the official Italian fuel station dataset + prices.
 * Primary authoritative data source — ~22,000 stations.
 */
import axios from "axios";
import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";
import type { IStorage } from "../storage";
import type { InsertStation, FuelType } from "@shared/schema";
import { PROVINCE_TO_REGION } from "@shared/schema";

const MIMIT_STATIONS_URL =
  "https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv";
const MIMIT_PRICES_URL =
  "https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv";

// Alternative DGSAIE endpoints
const DGSAIE_STATIONS_URL =
  "https://dgsaie.mise.gov.it/open_data_export.php?type=1";
const DGSAIE_PRICES_URL =
  "https://dgsaie.mise.gov.it/open_data_export.php?type=2";

interface MimitStationRow {
  idImpianto: string;
  Gestore: string;
  Bandiera: string;
  TipoImpianto: string;
  NomeVia: string;
  Comune: string;
  Provincia: string;
  Latitudine: string;
  Longitudine: string;
}

interface MimitPriceRow {
  idImpianto: string;
  descCarburante: string;
  prezzo: string;
  isSelf: string;
  dtComu: string;
}

// Map MIMIT fuel names to our FuelType
function mapFuelType(desc: string): FuelType | null {
  const d = desc.toLowerCase().trim();
  if (d.includes("benzina") || d.includes("super")) return "benzina";
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
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 120000,
    headers: {
      "User-Agent": "FuelGPS/2.0 (fuel station aggregator)",
    },
  });

  // MIMIT CSVs are typically ISO-8859-1 encoded
  const buffer = Buffer.from(response.data);
  // Try to detect encoding — if UTF-8 works, use it; otherwise ISO-8859-1
  try {
    const utf8 = buffer.toString("utf-8");
    if (utf8.includes("�")) throw new Error("Not UTF-8");
    return utf8;
  } catch {
    return iconv.decode(buffer, "ISO-8859-1");
  }
}

export async function ingestMimitStations(
  storage: IStorage
): Promise<{ inserted: number; updated: number; skipped: number }> {
  console.log("[MIMIT] Downloading stations dataset...");

  let csvText: string;
  try {
    csvText = await downloadCSV(DGSAIE_STATIONS_URL);
  } catch (e: any) {
    console.warn("[MIMIT] DGSAIE failed, trying fallback URL:", e.message);
    csvText = await downloadCSV(MIMIT_STATIONS_URL);
  }

  // Parse CSV — MIMIT uses semicolon separator
  const records = parse(csvText, {
    delimiter: ";",
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });

  console.log(`[MIMIT] Parsed ${records.length} station rows`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  // Process in chunks of 500
  const CHUNK_SIZE = 500;
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);

    for (const row of chunk) {
      try {
        const mimitId =
          row.idImpianto || row["idImpianto"] || row["IDIMPIANTO"];
        const lat = parseFloat(
          (row.Latitudine || row["Latitudine"] || "0").replace(",", ".")
        );
        const lon = parseFloat(
          (row.Longitudine || row["Longitudine"] || "0").replace(",", ".")
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

        const provincia = (
          row.Provincia ||
          row["Provincia"] ||
          ""
        )
          .trim()
          .toUpperCase();
        const region = PROVINCE_TO_REGION[provincia] || null;

        const brand = (
          row.Bandiera ||
          row["Bandiera"] ||
          ""
        ).trim();
        const operator = (
          row.Gestore ||
          row["Gestore"] ||
          ""
        ).trim();
        const address = (
          row["Nome Impianto"] ||
          row.NomeVia ||
          row["NomeVia"] ||
          row["INDIRIZZO"] ||
          ""
        ).trim();
        const municipality = (
          row.Comune ||
          row["Comune"] ||
          ""
        ).trim();
        const tipoImpianto = (
          row["Tipo Impianto"] ||
          row.TipoImpianto ||
          ""
        )
          .toLowerCase()
          .trim();

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
          // We'll set fuel types from the prices dataset
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
    }

    if (i % 5000 === 0 && i > 0) {
      console.log(
        `[MIMIT] Processed ${i}/${records.length} stations...`
      );
    }
  }

  console.log(
    `[MIMIT] Stations: Inserted=${inserted}, Updated=${updated}, Skipped=${skipped}`
  );
  return { inserted, updated, skipped };
}

export async function ingestMimitPrices(
  storage: IStorage
): Promise<{ processed: number; skipped: number }> {
  console.log("[MIMIT] Downloading prices dataset...");

  let csvText: string;
  try {
    csvText = await downloadCSV(DGSAIE_PRICES_URL);
  } catch (e: any) {
    console.warn("[MIMIT] DGSAIE prices failed, trying fallback:", e.message);
    csvText = await downloadCSV(MIMIT_PRICES_URL);
  }

  const records = parse(csvText, {
    delimiter: ";",
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });

  console.log(`[MIMIT] Parsed ${records.length} price rows`);

  let processed = 0;
  let skipped = 0;

  for (const row of records) {
    try {
      const mimitId =
        row.idImpianto || row["idImpianto"] || row["IDIMPIANTO"];
      const fuelDesc =
        row.descCarburante ||
        row["descCarburante"] ||
        row["DESCRIZIONE"] ||
        "";
      const priceStr = (
        row.prezzo ||
        row["prezzo"] ||
        row["PREZZO"] ||
        "0"
      ).replace(",", ".");
      const isSelf = (
        row.isSelf ||
        row["isSelf"] ||
        row["TIPO_SERVIZIO"] ||
        "1"
      )
        .trim();

      const price = parseFloat(priceStr);
      const fuelType = mapFuelType(fuelDesc);

      if (!mimitId || !fuelType || isNaN(price) || price < 0.3 || price > 5.0) {
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
  }

  console.log(
    `[MIMIT] Prices: Processed=${processed}, Skipped=${skipped}`
  );
  return { processed, skipped };
}
