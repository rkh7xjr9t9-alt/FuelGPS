/**
 * Price Aggregation Service
 * Determines "best available price" from MIMIT + crowd-sourced reports.
 */
import type { Price, FuelType, LatestPriceMap } from "@shared/schema";
import { fuelTypes } from "@shared/schema";

interface PriceDisplay {
  price: number;
  isSelfService: boolean;
  reportedAt: string;
  source: string;
  label: string; // "Ufficiale" | "Segnalato" | "Aggiornato Xh fa"
  isStale: boolean;
}

/**
 * Given all prices for a station, compute the best display price per fuel type.
 * Logic:
 *   1. MIMIT price < 24h old → show as "Ufficiale"
 *   2. User report < 4h old, not flagged → show as "Segnalato"
 *   3. Else → show last known with staleness indicator
 */
export function computeBestPrices(
  allPrices: Price[]
): LatestPriceMap {
  const now = Date.now();
  const result: LatestPriceMap = {};

  for (const ft of fuelTypes) {
    const ftPrices = allPrices
      .filter((p) => p.fuelType === ft)
      .sort(
        (a, b) =>
          new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime()
      );

    if (ftPrices.length === 0) continue;

    // Check for recent MIMIT price (< 24h)
    const mimitPrice = ftPrices.find((p) => p.source === "mimit");
    if (mimitPrice) {
      const ageH =
        (now - new Date(mimitPrice.reportedAt).getTime()) / (1000 * 60 * 60);
      if (ageH < 24) {
        result[ft] = {
          price: mimitPrice.price,
          isSelfService: mimitPrice.isSelfService ?? true,
          reportedAt: mimitPrice.reportedAt.toISOString
            ? mimitPrice.reportedAt.toISOString()
            : String(mimitPrice.reportedAt),
          source: "Ufficiale",
        };
        continue;
      }
    }

    // Check for recent user report (< 4h)
    const userPrice = ftPrices.find((p) => p.source === "user");
    if (userPrice) {
      const ageH =
        (now - new Date(userPrice.reportedAt).getTime()) / (1000 * 60 * 60);
      if (ageH < 4) {
        result[ft] = {
          price: userPrice.price,
          isSelfService: userPrice.isSelfService ?? true,
          reportedAt: userPrice.reportedAt.toISOString
            ? userPrice.reportedAt.toISOString()
            : String(userPrice.reportedAt),
          source: "Segnalato",
        };
        continue;
      }
    }

    // Fallback to most recent price of any source
    const latest = ftPrices[0];
    const ageH =
      (now - new Date(latest.reportedAt).getTime()) / (1000 * 60 * 60);
    const ageLabel =
      ageH < 1
        ? "< 1h fa"
        : ageH < 24
          ? `${Math.floor(ageH)}h fa`
          : `${Math.floor(ageH / 24)}g fa`;

    result[ft] = {
      price: latest.price,
      isSelfService: latest.isSelfService ?? true,
      reportedAt: latest.reportedAt.toISOString
        ? latest.reportedAt.toISOString()
        : String(latest.reportedAt),
      source: `Aggiornato ${ageLabel}`,
    };
  }

  return result;
}

/**
 * Validate a user-submitted price report
 */
export function validatePriceReport(
  fuelType: FuelType,
  price: number,
  officialPrice?: number
): { valid: boolean; flagged: boolean; reason?: string } {
  // Price range check
  if (price < 0.5 || price > 5.0) {
    return {
      valid: false,
      flagged: false,
      reason: "Prezzo fuori range (€0.50 - €5.00)",
    };
  }

  // Deviation from official price
  if (officialPrice && Math.abs(price - officialPrice) / officialPrice > 0.15) {
    return {
      valid: true,
      flagged: true,
      reason: "Deviazione > 15% dal prezzo ufficiale",
    };
  }

  return { valid: true, flagged: false };
}
