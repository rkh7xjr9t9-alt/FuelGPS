import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { StationWithPrices, FuelType } from "@shared/schema";
import { fuelTypes, FUEL_DISPLAY } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import PriceSubmitDialog from "@/components/PriceSubmitDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Search,
  Filter,
  X,
  MapPin,
  Fuel,
  Clock,
  Plus,
  Navigation,
  Zap,
  Droplets,
  Flame,
  Car,
  Truck,
  Store,
  Sparkles,
  LocateFixed,
  User,
  LogIn,
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

// Fix default icon paths for bundled Leaflet
(L.Icon.Default.prototype as any)._getIconUrl = undefined;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function formatPrice(price: number): string {
  return `€${price.toFixed(3)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffH = Math.floor(
    (now.getTime() - d.getTime()) / (1000 * 60 * 60)
  );
  if (diffH < 1) return "< 1h fa";
  if (diffH < 24) return `${diffH}h fa`;
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Brand color mapping
const BRAND_COLORS: Record<string, string> = {
  ENI: "#fbbf24",
  Shell: "#ef4444",
  Q8: "#f97316",
  IP: "#3b82f6",
  Esso: "#1d4ed8",
  Tamoil: "#059669",
  "Enel X": "#7c3aed",
  Tesla: "#dc2626",
  default: "#01696f",
};

function getBrandColor(brand: string | null): string {
  if (!brand) return BRAND_COLORS.default;
  for (const [key, color] of Object.entries(BRAND_COLORS)) {
    if (brand.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return BRAND_COLORS.default;
}

export default function MapPage() {
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<any>(null); // MarkerClusterGroup
  const leafletRef = useRef<any>(null);
  const markerClusterRef = useRef<any>(null);

  const [selectedStation, setSelectedStation] =
    useState<StationWithPrices | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchCity, setSearchCity] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [fuelFilter, setFuelFilter] = useState<FuelType | "all">("all");
  const [maxPrice, setMaxPrice] = useState<number>(3.0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [bbox, setBbox] = useState<{ minLat: number; maxLat: number; minLon: number; maxLon: number } | null>(null);
  const { user } = useAuth();

  const queryParams: Record<string, string> = { limit: "500" };
  if (searchCity) queryParams.city = searchCity;
  if (fuelFilter !== "all") queryParams.fuelType = fuelFilter;
  if (maxPrice < 3.0) queryParams.maxPrice = String(maxPrice);
  // Add bbox for viewport-based loading
  if (bbox && !searchCity) {
    queryParams.minLat = String(bbox.minLat);
    queryParams.maxLat = String(bbox.maxLat);
    queryParams.minLon = String(bbox.minLon);
    queryParams.maxLon = String(bbox.maxLon);
  }

  const { data, isLoading } = useQuery<{
    stations: StationWithPrices[];
    total: number;
  }>({
    queryKey: ["/api/stations", queryParams],
    staleTime: 60_000,
  });

  const stations = data?.stations ?? [];

  // Update bbox when map moves
  const updateBbox = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    setBbox({
      minLat: bounds.getSouth(),
      maxLat: bounds.getNorth(),
      minLon: bounds.getWest(),
      maxLon: bounds.getEast(),
    });
  }, []);

  // Init Leaflet + MarkerCluster
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    leafletRef.current = L;

    const map = L.map(mapContainerRef.current, {
      center: [41.9028, 12.4964],
      zoom: 6,
      zoomControl: false,
    });

    // CartoDB Positron for clean aesthetic (light mode)
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> &copy; <a href="https://carto.com">CARTO</a>',
        maxZoom: 19,
        subdomains: "abcd",
      }
    ).addTo(map);

    // Zoom control bottom-right
    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Init marker cluster group
    const clusterGroup = (L as any).markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 14,
      iconCreateFunction: (cluster: any) => {
        const count = cluster.getChildCount();
        let size = "small";
        if (count > 50) size = "large";
        else if (count > 10) size = "medium";
        return L.divIcon({
          html: `<div><span>${count}</span></div>`,
          className: `marker-cluster marker-cluster-${size}`,
          iconSize: L.point(40, 40),
        });
      },
    });

    map.addLayer(clusterGroup);
    markersRef.current = clusterGroup;
    mapRef.current = map;

    // Load stations for initial viewport + on every pan/zoom
    map.on("moveend", updateBbox);
    // Trigger initial load
    updateBbox();

    return () => {
      if (mapRef.current) {
        mapRef.current.off("moveend", updateBbox);
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [updateBbox]);

  // Create station marker icon
  const createMarkerIcon = useCallback(
    (station: StationWithPrices, active = false) => {
      const L = leafletRef.current;
      if (!L) return undefined;

      const ft = fuelFilter !== "all" ? fuelFilter : "benzina";
      const price = station.latestPrices[ft]?.price;
      const priceText = price ? `€${price.toFixed(2)}` : "";
      const brandColor = getBrandColor(station.brand);
      const size = active ? 48 : 40;
      const isEV = station.hasElettrico && !station.hasBenzina && !station.hasGasolio;

      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 10}" viewBox="0 0 ${size} ${size + 10}">
          <defs>
            <filter id="ds${station.id?.slice(0, 4)}" x="-20%" y="-10%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="2" flood-opacity="0.25"/>
            </filter>
          </defs>
          <g filter="url(#ds${station.id?.slice(0, 4)})">
            <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 3}" 
              fill="${active ? brandColor : 'white'}" 
              stroke="${brandColor}" 
              stroke-width="${active ? 3 : 2}"/>
            ${isEV
              ? `<text x="${size / 2}" y="${size / 2 - 2}" text-anchor="middle" dominant-baseline="middle" font-size="14" fill="${active ? 'white' : brandColor}">⚡</text>`
              : priceText
                ? `<text x="${size / 2}" y="${size / 2 + 1}" text-anchor="middle" dominant-baseline="middle" font-size="9" font-weight="600" fill="${active ? 'white' : brandColor}" font-family="'Satoshi','Inter',system-ui">${priceText}</text>`
                : `<circle cx="${size / 2}" cy="${size / 2}" r="4" fill="${brandColor}" opacity="0.6"/>`
            }
            <polygon points="${size / 2},${size + 2} ${size / 2 - 4},${size - 2} ${size / 2 + 4},${size - 2}" fill="${brandColor}"/>
          </g>
        </svg>`;

      return L.divIcon({
        html: svg,
        className: "",
        iconSize: [size, size + 10],
        iconAnchor: [size / 2, size + 10],
        popupAnchor: [0, -size],
      });
    },
    [fuelFilter]
  );

  // Sync markers
  useEffect(() => {
    const L = leafletRef.current;
    const clusterGroup = markersRef.current;
    if (!L || !clusterGroup) return;

    clusterGroup.clearLayers();

    stations.forEach((station) => {
      const icon = createMarkerIcon(station);
      const marker = L.marker([station.lat, station.lon], { icon }).on(
        "click",
        () => {
          setSelectedStation(station);
          setSheetOpen(true);
        }
      );
      clusterGroup.addLayer(marker);
    });
  }, [stations, createMarkerIcon]);

  const handleSearch = () => setSearchCity(cityInput);
  const clearFilters = () => {
    setCityInput("");
    setSearchCity("");
    setFuelFilter("all");
    setMaxPrice(3.0);
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current.setView(
          [pos.coords.latitude, pos.coords.longitude],
          13
        );
      },
      () => {},
      { enableHighAccuracy: true }
    );
  };

  const activeFilters =
    (searchCity ? 1 : 0) +
    (fuelFilter !== "all" ? 1 : 0) +
    (maxPrice < 3.0 ? 1 : 0);

  return (
    <div className="flex-1 flex flex-col relative h-full">
      {/* Search & filter bar */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex gap-2">
        <div className="flex-1 flex gap-2 bg-card/95 backdrop-blur-md rounded-xl border border-border shadow-md p-1.5">
          <div className="flex-1 relative">
            <Search
              size={15}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <Input
              className="pl-8 h-8 text-sm border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
              placeholder="Cerca città o provincia..."
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              data-testid="input-search-city"
            />
          </div>
          <Button
            size="sm"
            className="h-8 px-3 rounded-lg"
            onClick={handleSearch}
            data-testid="button-search"
          >
            Cerca
          </Button>
        </div>

        <Button
          size="icon"
          variant="outline"
          className="h-[42px] w-[42px] shadow-md bg-card/95 backdrop-blur-md border-border rounded-xl"
          onClick={handleLocateMe}
          data-testid="button-locate"
        >
          <LocateFixed size={16} />
        </Button>

        <Button
          size="icon"
          variant={filterOpen ? "default" : "outline"}
          className="h-[42px] w-[42px] shadow-md bg-card/95 backdrop-blur-md border-border rounded-xl relative"
          onClick={() => setFilterOpen((v) => !v)}
          data-testid="button-filter"
        >
          <Filter size={16} />
          {activeFilters > 0 && (
            <Badge className="absolute -top-1.5 -right-1.5 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
              {activeFilters}
            </Badge>
          )}
        </Button>
      </div>

      {/* Filter panel */}
      {filterOpen && (
        <div className="absolute top-16 right-3 z-[1001] w-72 bg-card border border-border rounded-xl shadow-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">Filtri</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setFilterOpen(false)}
            >
              <X size={14} />
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Tipo carburante
            </label>
            <Select
              value={fuelFilter}
              onValueChange={(v) => setFuelFilter(v as any)}
            >
              <SelectTrigger
                className="h-8"
                data-testid="select-filter-fuel"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                {fuelTypes.map((ft) => (
                  <SelectItem key={ft} value={ft}>
                    {FUEL_DISPLAY[ft].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {fuelFilter !== "all" && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Prezzo max: {maxPrice.toFixed(2)} €/L
              </label>
              <Slider
                min={0.5}
                max={3.0}
                step={0.05}
                value={[maxPrice]}
                onValueChange={([v]) => setMaxPrice(v)}
                data-testid="slider-max-price"
              />
            </div>
          )}

          {activeFilters > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={clearFilters}
            >
              <X size={12} className="mr-1" /> Rimuovi filtri
            </Button>
          )}
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1001] bg-card border border-border rounded-full px-4 py-1.5 text-sm shadow-lg flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
          Caricamento stazioni...
        </div>
      )}

      {/* Station count */}
      {!isLoading && (
        <div className="absolute bottom-20 sm:bottom-6 left-3 z-[1000]">
          <Badge
            variant="secondary"
            className="shadow-md backdrop-blur-sm bg-card/90 border border-border"
          >
            <MapPin size={12} className="mr-1" />
            {stations.length} stazioni
          </Badge>
        </div>
      )}

      {/* Map */}
      <div
        ref={mapContainerRef}
        className="flex-1 w-full"
        style={{ minHeight: "100%" }}
      />

      {/* Station detail sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[75vh] overflow-y-auto rounded-t-2xl"
        >
          {selectedStation && (
            <>
              <SheetHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <SheetTitle
                      className="text-base leading-tight"
                      data-testid="text-station-name"
                    >
                      {selectedStation.name}
                    </SheetTitle>
                    <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
                      <MapPin size={12} />
                      {[
                        selectedStation.address,
                        selectedStation.municipality,
                        selectedStation.province
                          ? `(${selectedStation.province})`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "Italia"}
                    </p>
                  </div>
                  {selectedStation.brand && (
                    <Badge
                      variant="outline"
                      className="flex-shrink-0"
                      style={{
                        borderColor: getBrandColor(selectedStation.brand),
                        color: getBrandColor(selectedStation.brand),
                      }}
                    >
                      {selectedStation.brand}
                    </Badge>
                  )}
                </div>
              </SheetHeader>

              {/* Prices grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                {fuelTypes.map((ft) => {
                  const priceInfo = selectedStation.latestPrices[ft];
                  if (!priceInfo) return null;
                  const display = FUEL_DISPLAY[ft];
                  return (
                    <Card key={ft} className="border-border/60">
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                            style={{ background: display.color }}
                          />
                          <span className="text-xs font-medium text-muted-foreground">
                            {display.label}
                          </span>
                        </div>
                        <p
                          className="text-lg font-bold tabular-nums"
                          data-testid={`price-${ft}`}
                        >
                          {formatPrice(priceInfo.price)}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-4 px-1"
                          >
                            {priceInfo.source}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDate(priceInfo.reportedAt)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Amenities */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {selectedStation.is24h && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Clock size={10} /> 24/7
                  </Badge>
                )}
                {selectedStation.hasSelfService && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Fuel size={10} /> Self
                  </Badge>
                )}
                {selectedStation.hasAttendant && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <User size={10} /> Servito
                  </Badge>
                )}
                {selectedStation.hasTruck && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Truck size={10} /> Camion
                  </Badge>
                )}
                {selectedStation.hasCarWash && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Droplets size={10} /> Autolavaggio
                  </Badge>
                )}
                {selectedStation.hasShop && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Store size={10} /> Shop
                  </Badge>
                )}
                {selectedStation.hasAdBlue && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Sparkles size={10} /> AdBlue
                  </Badge>
                )}
              </div>

              {/* Fuel type badges */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {fuelTypes.map((ft) => {
                  const has =
                    ft === "benzina"
                      ? selectedStation.hasBenzina
                      : ft === "gasolio"
                        ? selectedStation.hasGasolio
                        : ft === "gpl"
                          ? selectedStation.hasGpl
                          : ft === "metano"
                            ? selectedStation.hasMetano
                            : selectedStation.hasElettrico;
                  if (!has) return null;
                  return (
                    <Badge
                      key={ft}
                      className="text-xs"
                      style={{
                        background: FUEL_DISPLAY[ft].color,
                        color: "white",
                      }}
                    >
                      {FUEL_DISPLAY[ft].label}
                    </Badge>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-2"
                  variant="default"
                  onClick={() => {
                    const url = `https://www.google.com/maps/dir/?api=1&destination=${selectedStation.lat},${selectedStation.lon}`;
                    window.open(url, "_blank");
                  }}
                  data-testid="button-navigate"
                >
                  <Navigation size={14} />
                  Come arrivare
                </Button>

                {user ? (
                  <PriceSubmitDialog station={selectedStation}>
                    <Button
                      className="flex-1 gap-2"
                      variant="outline"
                      data-testid="button-report-price"
                    >
                      <Plus size={14} />
                      Segnala prezzo
                    </Button>
                  </PriceSubmitDialog>
                ) : (
                  <Button
                    className="flex-1 gap-2"
                    variant="outline"
                    onClick={() => (window.location.hash = "/auth")}
                  >
                    <LogIn size={14} />
                    Accedi per segnalare
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

