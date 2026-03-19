# ⛽ Fuel GPS

Real-time fuel price map and smart routing tool for Italy.

Built with: **Node.js + Express** · **PostgreSQL** · **React + Vite** · **Leaflet.js** · **OSRM**

---

## Features

- 🗺️ Interactive map with real-time fuel prices across Italy
- ⛽ Prices for Benzina, Gasolio, GPL, and Elettrico
- 🔍 Search by city + filter by fuel type and price range
- 📝 Authenticated users can submit/update prices
- 🚗 Smart routing: input origin/destination, vehicle, tank size → optimal fuel stops
- 🔄 Weekly automatic refresh from OpenStreetMap Overpass API
- 🐳 Fully Docker-composable, no paid external services

---

## Quick Start (Docker — Recommended)

### Prerequisites
- Docker ≥ 24 and Docker Compose plugin
- Git

### 1. Clone the repository
```bash
git clone https://github.com/rkh7xjr9t9-alt/FuelGPS.git
cd FuelGPS
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env and set:
#   POSTGRES_PASSWORD=<strong-password>
#   JWT_SECRET=$(openssl rand -base64 48)
nano .env
```

### 3. Start all services
```bash
docker compose up -d --build
```

The app is now available at **http://localhost** (port 80).

### 4. Check logs
```bash
docker compose logs -f app
```

### 5. Stop
```bash
docker compose down
```

---

## Development (Local, No Docker)

### Prerequisites
- Node.js ≥ 20
- PostgreSQL 15+ running locally (or use `docker compose up db -d`)

### Setup
```bash
npm install
cp .env.example .env
# Set DATABASE_URL to your local Postgres, e.g.:
# DATABASE_URL=postgres://fuel:password@localhost:5432/fueldgps
npm run dev
```

The dev server starts on **http://localhost:5000** with HMR.

---

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | – | Create account |
| POST | `/api/auth/login` | – | Login, returns JWT |
| GET | `/api/auth/me` | ✅ | Get current user |
| GET | `/api/stations` | – | List stations (paginated) |
| GET | `/api/stations/:id` | – | Station detail + latest prices |
| POST | `/api/stations/:id/price` | ✅ | Submit price |
| GET | `/api/stations/nearby?lat=&lon=&radius=` | – | Stations within radius (km) |
| POST | `/api/route/plan` | – | Smart route planner |

### Route Planner Payload
```json
{
  "origin": "Milano",
  "destination": "Roma",
  "vehicleType": "car",
  "fuelType": "benzina",
  "tankSizeLiters": 50,
  "currentFuelPercent": 80
}
```

---

## Vehicle Fuel Consumption

| Vehicle | L/100km |
|---------|---------|
| Motorcycle | 4 |
| Car | 7 |
| Van | 11 |
| Truck | 28 |
| Bus | 35 |

---

## Self-Hosting on Ubuntu 22.04

```bash
# 1. Install Docker
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker

# 2. Clone & configure
git clone https://github.com/rkh7xjr9t9-alt/FuelGPS.git
cd FuelGPS
cp .env.example .env
nano .env  # Set POSTGRES_PASSWORD and JWT_SECRET

# 3. Start
docker compose up -d --build

# 4. (Optional) open firewall
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

To enable HTTPS, place `cert.pem` and `key.pem` in the `certs/` directory and update `nginx.conf` to enable the SSL server block.

---

## Data Sources

- Station locations: [OpenStreetMap Overpass API](https://overpass-api.de/) (refreshed weekly)
- Routing: [OSRM Public API](https://router.project-osrm.org/) (free, no key needed)
- Map tiles: [OpenStreetMap](https://openstreetmap.org)
- Geocoding: [Nominatim](https://nominatim.openstreetmap.org/)

---

## Project Structure

```
FuelGPS/
├── client/              # React + Vite frontend
│   └── src/
│       ├── components/  # Layout, PriceSubmitDialog, etc.
│       ├── lib/         # queryClient, auth state (zustand)
│       └── pages/       # MapPage, RoutePlanPage, AuthPage
├── server/              # Express backend
│   ├── index.ts         # Entry point + cron setup
│   ├── routes.ts        # All API routes
│   ├── storage.ts       # IStorage interface + MemStorage
│   ├── auth.ts          # JWT helpers
│   ├── routing.ts       # OSRM + route planning logic
│   ├── overpass.ts      # OSM Overpass fetcher
│   └── seed.ts          # 50 sample Italian stations
├── shared/
│   └── schema.ts        # Drizzle schema + shared types
├── docker-compose.yml
├── Dockerfile
├── nginx.conf
├── .env.example
└── README.md
```

---

## License

MIT — Created with [Perplexity Computer](https://www.perplexity.ai/computer)
