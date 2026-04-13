import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import {
  hashPassword,
  comparePassword,
  signToken,
  requireAuth,
  optionalAuth,
} from "./auth";
import { planRoute } from "./services/osrmService";
import { autocomplete, reverseGeocode } from "./services/geocodingService";
import { validatePriceReport } from "./services/priceService";
import { fuelTypes, vehicleTypes } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ═══════════════════════════════════════════
  //  AUTH
  // ═══════════════════════════════════════════

  app.post("/api/auth/register", async (req, res) => {
    try {
      const schema = z.object({
        username: z.string().min(3).max(40),
        email: z.string().email(),
        password: z.string().min(8),
      });
      const { username, email, password } = schema.parse(req.body);

      const exists =
        (await storage.getUserByUsername(username)) ||
        (await storage.getUserByEmail(email));
      if (exists) {
        res.status(409).json({ error: "Username or email already in use" });
        return;
      }

      const hashed = await hashPassword(password);
      const user = await storage.createUser({
        username,
        email,
        password: hashed,
      });
      const token = signToken(user.id);

      res.status(201).json({
        token,
        user: { id: user.id, username: user.username, email: user.email },
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const schema = z.object({
        username: z.string(),
        password: z.string(),
      });
      const { username, password } = schema.parse(req.body);

      const user = await storage.getUserByUsername(username);
      if (!user || !(await comparePassword(password, user.password))) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }
      const token = signToken(user.id);
      res.json({
        token,
        user: { id: user.id, username: user.username, email: user.email },
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    const user = await storage.getUser((req as any).userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ id: user.id, username: user.username, email: user.email });
  });

  // ═══════════════════════════════════════════
  //  STATIONS
  // ═══════════════════════════════════════════

  // GET /api/stations — paginated list with filters
  app.get("/api/stations", async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 500);
      const offset = parseInt(String(req.query.offset ?? "0"));
      const fuelType = fuelTypes.includes(req.query.fuelType as any)
        ? (req.query.fuelType as any)
        : undefined;
      const city = req.query.city
        ? String(
            Array.isArray(req.query.city)
              ? req.query.city[0]
              : req.query.city
          )
        : undefined;
      const brand = req.query.brand
        ? String(
            Array.isArray(req.query.brand)
              ? req.query.brand[0]
              : req.query.brand
          )
        : undefined;
      const maxPrice = req.query.maxPrice
        ? parseFloat(String(req.query.maxPrice))
        : undefined;
      const minPrice = req.query.minPrice
        ? parseFloat(String(req.query.minPrice))
        : undefined;

      // Bbox filter for viewport queries
      let bbox: any;
      if (
        req.query.minLat &&
        req.query.maxLat &&
        req.query.minLon &&
        req.query.maxLon
      ) {
        bbox = {
          minLat: parseFloat(String(req.query.minLat)),
          maxLat: parseFloat(String(req.query.maxLat)),
          minLon: parseFloat(String(req.query.minLon)),
          maxLon: parseFloat(String(req.query.maxLon)),
        };
      }

      const { stations, total } = await storage.listStations({
        limit,
        offset,
        fuelType,
        city,
        brand,
        bbox,
        maxPrice,
        minPrice,
      });
      res.json({ stations, total, limit, offset });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/stations/nearby — stations within radius
  app.get("/api/stations/nearby", async (req, res) => {
    try {
      const schema = z.object({
        lat: z.coerce.number().min(-90).max(90),
        lon: z.coerce.number().min(-180).max(180),
        radius: z.coerce.number().min(0.1).max(50).default(5),
        fuelType: z.enum(fuelTypes).optional(),
        limit: z.coerce.number().min(1).max(100).default(50),
      });
      const params = schema.parse(req.query);
      const stations = await storage.getNearbyStations(
        params.lat,
        params.lon,
        params.radius,
        params.fuelType,
        params.limit
      );
      res.json({ stations });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/stations/:id — full station details
  app.get("/api/stations/:id", async (req, res) => {
    try {
      const station = await storage.getStation(String(req.params.id));
      if (!station) {
        res.status(404).json({ error: "Station not found" });
        return;
      }
      res.json(station);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════
  //  PRICES
  // ═══════════════════════════════════════════

  // GET /api/prices/:stationId — all current prices
  app.get("/api/prices/:stationId", async (req, res) => {
    try {
      const prices = await storage.getLatestPrices(
        String(req.params.stationId)
      );
      res.json({ prices });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/prices/report — user price submission
  app.post("/api/prices/report", optionalAuth, async (req, res) => {
    try {
      const schema = z.object({
        stationId: z.string(),
        fuelType: z.enum(fuelTypes),
        price: z.number().positive(),
        isSelfService: z.boolean().default(true),
      });
      const body = schema.parse(req.body);

      // Validate price
      const validation = validatePriceReport(body.fuelType, body.price);
      if (!validation.valid) {
        res.status(400).json({ error: validation.reason });
        return;
      }

      const station = await storage.getStation(body.stationId);
      if (!station) {
        res.status(404).json({ error: "Station not found" });
        return;
      }

      const price = await storage.reportPrice(
        body.stationId,
        (req as any).userId || null,
        body.fuelType,
        body.price,
        body.isSelfService,
        "user"
      );

      res.status(201).json({
        price,
        flagged: validation.flagged,
        message: validation.flagged
          ? "Prezzo segnalato — in revisione per deviazione significativa"
          : "Prezzo registrato",
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/prices/stats — regional averages
  app.get("/api/prices/stats", async (_req, res) => {
    try {
      const stats = await storage.getRegionalAveragePrices();
      res.json({ stats });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════
  //  ROUTE PLANNER
  // ═══════════════════════════════════════════

  app.post("/api/routes/calculate", optionalAuth, async (req, res) => {
    try {
      const schema = z.object({
        origin: z.string().min(2),
        destination: z.string().min(2),
        vehicleType: z.enum(vehicleTypes),
        fuelType: z.enum(fuelTypes),
        tankSizeLiters: z.number().positive().max(1000),
        currentFuelPercent: z.number().min(0).max(100),
        consumptionLper100km: z.number().positive().optional(),
        optimizeFor: z
          .enum(["fastest", "cheapest_fuel", "avoid_tolls"])
          .optional(),
        maxDetourKm: z.number().positive().max(50).optional(),
      });
      const body = schema.parse(req.body);

      const { stations: allStations } = await storage.listStations({
        limit: 10000,
      });

      const result = await planRoute(
        body.origin,
        body.destination,
        body.vehicleType,
        body.fuelType,
        body.tankSizeLiters,
        body.currentFuelPercent,
        allStations,
        {
          consumptionLper100km: body.consumptionLper100km,
          optimizeFor: body.optimizeFor as any,
          maxDetourKm: body.maxDetourKm,
        }
      );

      res.json(result);
    } catch (err: any) {
      console.error("[routes/calculate]", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Legacy route endpoint for backward compatibility
  app.post("/api/route/plan", optionalAuth, async (req, res) => {
    try {
      const schema = z.object({
        origin: z.string().min(2),
        destination: z.string().min(2),
        vehicleType: z.enum(vehicleTypes),
        fuelType: z.enum(fuelTypes),
        tankSizeLiters: z.number().positive().max(1000),
        currentFuelPercent: z.number().min(0).max(100),
      });
      const body = schema.parse(req.body);

      const { stations: allStations } = await storage.listStations({
        limit: 10000,
      });

      const result = await planRoute(
        body.origin,
        body.destination,
        body.vehicleType,
        body.fuelType,
        body.tankSizeLiters,
        body.currentFuelPercent,
        allStations
      );

      res.json(result);
    } catch (err: any) {
      console.error("[route/plan]", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════
  //  GEOCODING
  // ═══════════════════════════════════════════

  app.get("/api/geocode/search", async (req, res) => {
    try {
      const q = String(req.query.q || "");
      if (q.length < 2) {
        res.json({ results: [] });
        return;
      }
      const results = await autocomplete(q, 5);
      res.json({ results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/geocode/reverse", async (req, res) => {
    try {
      const lat = parseFloat(String(req.query.lat));
      const lon = parseFloat(String(req.query.lon));
      const name = await reverseGeocode(lat, lon);
      res.json({ displayName: name });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════
  //  VEHICLE PROFILES
  // ═══════════════════════════════════════════

  app.get("/api/vehicles", requireAuth, async (req, res) => {
    try {
      const profiles = await storage.getVehicleProfiles(
        (req as any).userId
      );
      res.json({ profiles });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/vehicles", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(100),
        type: z.enum(vehicleTypes),
        fuelType: z.enum(fuelTypes).optional(),
        heightM: z.number().positive().optional(),
        widthM: z.number().positive().optional(),
        lengthM: z.number().positive().optional(),
        weightKg: z.number().positive().optional(),
        tankCapacityL: z.number().positive().optional(),
        consumptionLper100km: z.number().positive().optional(),
        isDefault: z.boolean().optional(),
      });
      const body = schema.parse(req.body);

      const profile = await storage.createVehicleProfile({
        ...body,
        userId: (req as any).userId,
      });
      res.status(201).json(profile);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/vehicles/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteVehicleProfile(String(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════
  //  STATS / HEALTH
  // ═══════════════════════════════════════════

  app.get("/api/stats", async (_req, res) => {
    const stationCount = await storage.getStationCount();
    res.json({ stations: stationCount, version: "2.0.0" });
  });

  return httpServer;
}
