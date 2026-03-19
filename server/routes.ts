import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import { hashPassword, comparePassword, signToken, requireAuth, optionalAuth } from "./auth";
import { planRoute } from "./routing";
import { fuelTypes } from "@shared/schema";

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
      const user = await storage.createUser({ username, email, password: hashed });
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

  // GET /api/stations — paginated list with optional filters
  app.get("/api/stations", async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
      const offset = parseInt(String(req.query.offset ?? "0"));
      const fuelType = fuelTypes.includes(req.query.fuelType as any)
        ? (req.query.fuelType as any)
        : undefined;
      const city = req.query.city ? String(Array.isArray(req.query.city) ? req.query.city[0] : req.query.city) : undefined;
      const maxPrice = req.query.maxPrice
        ? parseFloat(String(Array.isArray(req.query.maxPrice) ? req.query.maxPrice[0] : req.query.maxPrice))
        : undefined;
      const minPrice = req.query.minPrice
        ? parseFloat(String(Array.isArray(req.query.minPrice) ? req.query.minPrice[0] : req.query.minPrice))
        : undefined;

      const { stations, total } = await storage.listStations({
        limit,
        offset,
        fuelType,
        city,
        maxPrice,
        minPrice,
      });
      res.json({ stations, total, limit, offset });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/stations/nearby — stations within radius (km)
  app.get("/api/stations/nearby", async (req, res) => {
    try {
      const schema = z.object({
        lat: z.coerce.number(),
        lon: z.coerce.number(),
        radius: z.coerce.number().default(5),
        fuelType: z.enum(fuelTypes).optional(),
      });
      const { lat, lon, radius, fuelType } = schema.parse({
        lat: String(Array.isArray(req.query.lat) ? req.query.lat[0] : req.query.lat),
        lon: String(Array.isArray(req.query.lon) ? req.query.lon[0] : req.query.lon),
        radius: req.query.radius ? String(Array.isArray(req.query.radius) ? req.query.radius[0] : req.query.radius) : undefined,
        fuelType: req.query.fuelType ? String(Array.isArray(req.query.fuelType) ? req.query.fuelType[0] : req.query.fuelType) : undefined,
      });
      const stations = await storage.getNearbyStations(lat, lon, radius, fuelType);
      res.json({ stations });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/stations/:id
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

  // POST /api/stations/:id/price — submit a price (auth required)
  app.post("/api/stations/:id/price", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        fuelType: z.enum(fuelTypes),
        pricePerLiter: z.number().positive().max(10),
      });
      const { fuelType, pricePerLiter } = schema.parse(req.body);

      const station = await storage.getStation(String(req.params.id));
      if (!station) {
        res.status(404).json({ error: "Station not found" });
        return;
      }

      const price = await storage.reportPrice(
        String(req.params.id),
        (req as any).userId,
        fuelType,
        pricePerLiter
      );
      res.status(201).json(price);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════
  //  ROUTE PLANNER
  // ═══════════════════════════════════════════

  app.post("/api/route/plan", optionalAuth, async (req, res) => {
    try {
      const schema = z.object({
        origin: z.string().min(2),
        destination: z.string().min(2),
        vehicleType: z.enum(["motorcycle", "car", "van", "truck", "bus"]),
        fuelType: z.enum(fuelTypes),
        tankSizeLiters: z.number().positive().max(1000),
        currentFuelPercent: z.number().min(0).max(100),
      });
      const body = schema.parse(req.body);

      // Get all stations for corridor matching
      const { stations: allStations } = await storage.listStations({ limit: 5000 });

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

  return httpServer;
}
