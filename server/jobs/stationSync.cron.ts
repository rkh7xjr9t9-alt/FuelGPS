/**
 * Scheduled Station & Price Sync Jobs
 * - Daily 03:00 AM: Full station + price sync from MIMIT + OSM enrichment
 * - Every 6 hours: Price-only sync from MIMIT
 */
import cron from "node-cron";
import type { IStorage } from "../storage";
import { ingestMimitStations, ingestMimitPrices } from "../services/mimitService";
import { syncAllRegions } from "../services/overpassSync";

export function setupSyncJobs(storage: IStorage) {
  // Full sync: daily at 03:00 AM
  cron.schedule("0 3 * * *", async () => {
    console.log("[Cron] Starting daily full sync...");
    const start = Date.now();

    try {
      // 1. Download & upsert all MIMIT stations
      const stationResult = await ingestMimitStations(storage);
      console.log("[Cron] MIMIT stations:", stationResult);

      // 2. Download & upsert all MIMIT prices
      const priceResult = await ingestMimitPrices(storage);
      console.log("[Cron] MIMIT prices:", priceResult);

      // 3. Enrich with OSM data (batch by region)
      const osmResult = await syncAllRegions(storage, { delayMs: 3000 });
      console.log("[Cron] OSM enrichment:", {
        total: osmResult.total,
        errors: osmResult.errors.length,
      });

      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(`[Cron] Full sync completed in ${elapsed}s`);
    } catch (e: any) {
      console.error("[Cron] Full sync failed:", e.message);
    }
  });

  // Price-only sync: every 6 hours
  cron.schedule("0 */6 * * *", async () => {
    console.log("[Cron] Starting price-only sync...");
    try {
      const result = await ingestMimitPrices(storage);
      console.log("[Cron] Price sync:", result);
    } catch (e: any) {
      console.error("[Cron] Price sync failed:", e.message);
    }
  });

  console.log("[Cron] Sync jobs scheduled: daily@03:00, prices@every6h");
}
