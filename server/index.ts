import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";
import { fetchLimitedStations } from "./services/overpassSync";
import { seedStations } from "./seed";
import { ingestMimitStations, ingestMimitPrices } from "./services/mimitService";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse).slice(0, 200)}`;
      }
      log(logLine);
    }
  });

  next();
});

(async () => {
  // Load real MIMIT data (all Italian stations + prices)
  // Falls back to seed data if MIMIT download fails
  try {
    console.log("[Startup] Fetching MIMIT station data...");
    await ingestMimitStations(storage);
    await ingestMimitPrices(storage);
    const count = await storage.getStationCount();
    console.log(`[Startup] Loaded ${count} stations from MIMIT`);
  } catch (e: any) {
    console.warn("[Startup] MIMIT fetch failed, using seed data:", e.message);
    await seedStations(storage);
  }

  // Optionally enrich with Overpass OSM data (amenities, EV connectors, etc.)
  if (process.env.FETCH_OSM === "true") {
    fetchLimitedStations(storage, 300).catch((e) =>
      console.warn("[Overpass] skipping live fetch:", e.message)
    );
  }

  // Production: setup cron jobs
  if (process.env.NODE_ENV === "production") {
    try {
      const { setupSyncJobs } = await import("./jobs/stationSync.cron");
      setupSyncJobs(storage);
    } catch (e: any) {
      console.warn("[Cron] Failed to setup sync jobs:", e.message);
    }
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "3000", 10);
  httpServer.listen(port, () => {
    log(`serving on port ${port}`);
  });
})();
