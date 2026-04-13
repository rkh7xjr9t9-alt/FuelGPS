#!/usr/bin/env tsx
/**
 * One-time full Italy ingestion script.
 * Downloads all MIMIT stations + prices, then enriches with OSM data.
 *
 * Usage: npx tsx scripts/ingestAllItaly.ts
 */
import { MemStorage } from "../server/storage";
import { ingestMimitStations, ingestMimitPrices } from "../server/services/mimitService";
import { syncAllRegions } from "../server/services/overpassSync";

async function main() {
  console.log("╔═══════════════════════════════════════╗");
  console.log("║  FuelGPS — Full Italy Data Ingestion  ║");
  console.log("╚═══════════════════════════════════════╝\n");

  const storage = new MemStorage();
  const startTime = Date.now();

  // Step 1: MIMIT Stations
  console.log("━━━ Step 1/3: MIMIT Stations ━━━");
  try {
    const stationResult = await ingestMimitStations(storage);
    console.log(`✓ Stations: ${stationResult.inserted} inserted, ${stationResult.updated} updated, ${stationResult.skipped} skipped\n`);
  } catch (e: any) {
    console.error(`✗ MIMIT stations failed: ${e.message}\n`);
  }

  // Step 2: MIMIT Prices
  console.log("━━━ Step 2/3: MIMIT Prices ━━━");
  try {
    const priceResult = await ingestMimitPrices(storage);
    console.log(`✓ Prices: ${priceResult.processed} processed, ${priceResult.skipped} skipped\n`);
  } catch (e: any) {
    console.error(`✗ MIMIT prices failed: ${e.message}\n`);
  }

  // Step 3: OSM Enrichment
  console.log("━━━ Step 3/3: OSM Enrichment (20 regions) ━━━");
  try {
    const osmResult = await syncAllRegions(storage, { delayMs: 2000 });
    console.log(`✓ OSM: ${osmResult.total} stations enriched`);
    if (osmResult.errors.length > 0) {
      console.log(`  Errors: ${osmResult.errors.join(", ")}`);
    }
    console.log();
  } catch (e: any) {
    console.error(`✗ OSM enrichment failed: ${e.message}\n`);
  }

  // Summary
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const totalStations = await storage.getStationCount();
  console.log("━━━ Summary ━━━");
  console.log(`Total stations: ${totalStations}`);
  console.log(`Elapsed time: ${elapsed}s`);
  console.log("Done.");
}

main().catch(console.error);
