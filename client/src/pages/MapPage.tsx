import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import type { StationWithPrices, FuelType } from "@shared/schema";
import { fuelTypes } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import PriceSubmitDialog from "@/components/PriceSubmitDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Filter, X, MapPin, Fuel, Clock, Plus } from "lucide-react";
import "leaflet/dist/leaflet.css";

const FUEL_LABELS: Record<string, string> = {
  benzina: "Benzina",
  gasolio: "Gasolio",
  gpl: "GPL",
  elettrico: "Elettrico",
};

const FUEL_COLORS: Record<string, string> = {
  benzina: "#f97316",
  gasolio: "#3b82f6",
  gpl: "#22c55e",
  elettrico: "#a855f7",
};

function formatPrice(price: number): string {
  return `€ ${price.toFixed(3)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function MapPage() {
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<any[]>([]);
  const leafletRef = useRef<any>(null);
  const [selectedStation, setSelectedStation] = useState<StationWithPrices | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchCity, setSearchCity] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [fuelFilter, setFuelFilter] = useState<FuelType | "all">("all");
  const [maxPrice, setMaxPrice] = useState<number>(3.0);
  const [filterOpen, setFilterOpen] = useState(false);
  const { user } = useAuth();

  const { data, isLoading } = useQuery<{ stations: StationWithPrices[]; total: number }>({
    queryKey: ["/api/stations", { city: searchCity || undefined, fuelType: fuelFilter !== "all" ? fuelFilter : undefined, maxPrice: maxPrice < 3.0 ? String(maxPrice) : undefined, limit: "200" }],
    staleTime: 60_000,
  });

  const stations = data?.stations ?? [];

  // Init Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    import("leaflet").then((L) => {
      leafletRef.current = L;

      // Fix default marker icons
      (L.Icon.Default.prototype as any)._getIconUrl = undefined;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      if (mapRef.current) return; // already initialised

      const map = L.map(mapContainerRef.current!, {
        center: [41.9028, 12.4964], // Italy
        zoom: 6,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Create SVG marker icon
  const createMarkerIcon = useCallback((station: StationWithPrices, active: boolean = false) => {
    const L = leafletRef.current;
    if (!L) return undefined;

    const ft = fuelFilter !== "all" ? fuelFilter : "benzina";
    const price = station.latestPrices[ft]?.price;
    const priceText = price ? `€${price.toFixed(2)}` : "?";
    const color = FUEL_COLORS[ft] ?? "#6b7280";
    const size = active ? 52 : 44;

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 8}" viewBox="0 0 ${size} ${size + 8}">
        <filter id="shadow">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/>
        </filter>
        <g filter="url(#shadow)">
          <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${active ? color : "white"}" stroke="${color}" stroke-width="${active ? 3 : 2}"/>
          <text x="${size / 2}" y="${size / 2 + 1}" text-anchor="middle" dominant-baseline="middle"
            font-size="${price ? 9 : 11}" font-weight="bold" fill="${active ? "white" : color}" font-family="system-ui,sans-serif">${priceText}</text>
          <polygon points="${size / 2},${size - 2} ${size / 2 - 5},${size + 6} ${size / 2 + 5},${size + 6}" fill="${color}"/>
        </g>
      </svg>`;

    return L.divIcon({
      html: svg,
      className: "",
      iconSize: [size, size + 8],
      iconAnchor: [size / 2, size + 8],
      popupAnchor: [0, -size],
    });
  }, [fuelFilter]);

  // Sync markers to map
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    // Remove old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    stations.forEach((station) => {
      const icon = createMarkerIcon(station);
      const marker = L.marker([station.lat, station.lon], { icon })
        .addTo(map)
        .on("click", () => {
          setSelectedStation(station);
          setSheetOpen(true);
          // Update active icon
          markersRef.current.forEach((m) => {
            const s: StationWithPrices = (m as any)._fuelStation;
            if (s) m.setIcon(createMarkerIcon(s, s.id === station.id));
          });
        });

      (marker as any)._fuelStation = station;
      markersRef.current.push(marker);
    });
  }, [stations, createMarkerIcon]);

  const handleSearch = () => setSearchCity(cityInput);
  const clearFilters = () => {
    setCityInput("");
    setSearchCity("");
    setFuelFilter("all");
    setMaxPrice(3.0);
  };

  const activeFilters = (searchCity ? 1 : 0) + (fuelFilter !== "all" ? 1 : 0) + (maxPrice < 3.0 ? 1 : 0);

  return (
    <div className="flex-1 flex flex-col relative">
      {/* Search & filter bar */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex gap-2">
        <div className="flex-1 flex gap-2 bg-card/95 backdrop-blur rounded-lg border border-border shadow-md p-2">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-8 h-8 text-sm border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
              placeholder="Cerca per città..."
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              data-testid="input-search-city"
            />
          </div>
          <Button size="sm" className="h-8 px-3" onClick={handleSearch} data-testid="button-search">
            Cerca
          </Button>
        </div>
        <Button
          size="sm"
          variant={filterOpen ? "default" : "outline"}
          className="h-full px-3 shadow-md bg-card/95 backdrop-blur border-border relative"
          onClick={() => setFilterOpen((v) => !v)}
          data-testid="button-filter"
        >
          <Filter size={16} />
          {activeFilters > 0 && (
            <Badge className="absolute -top-1.5 -right-1.5 h-4 w-4 p-0 flex items-center justify-center text-xs">
              {activeFilters}
            </Badge>
          )}
        </Button>
      </div>

      {/* Filter dropdown */}
      {filterOpen && (
        <div className="absolute top-20 right-3 z-[1001] w-72 bg-card border border-border rounded-lg shadow-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">Filtri</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setFilterOpen(false)}>
              <X size={14} />
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tipo carburante</label>
            <Select value={fuelFilter} onValueChange={(v) => setFuelFilter(v as any)} >
              <SelectTrigger className="h-8" data-testid="select-filter-fuel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                {fuelTypes.map((ft) => (
                  <SelectItem key={ft} value={ft}>{FUEL_LABELS[ft]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {fuelFilter !== "all" && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Prezzo massimo: {maxPrice.toFixed(2)} €/L
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
            <Button variant="outline" size="sm" className="w-full" onClick={clearFilters}>
              <X size={12} className="mr-1" /> Rimuovi filtri
            </Button>
          )}
        </div>
      )}

      {/* Loading badge */}
      {isLoading && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1001] bg-card border border-border rounded-full px-4 py-1.5 text-sm shadow-lg flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
          Caricamento stazioni...
        </div>
      )}

      {/* Station count badge */}
      {!isLoading && (
        <div className="absolute bottom-6 left-3 z-[1000]">
          <Badge variant="secondary" className="shadow-md">
            <MapPin size={12} className="mr-1" />
            {stations.length} stazioni
          </Badge>
        </div>
      )}

      {/* Map container */}
      <div ref={mapContainerRef} className="flex-1" style={{ minHeight: "calc(100vh - 112px)" }} />

      {/* Station detail sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
          {selectedStation && (
            <>
              <SheetHeader className="pb-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <SheetTitle className="text-base leading-tight" data-testid="text-station-name">
                      {selectedStation.name}
                    </SheetTitle>
                    <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
                      <MapPin size={12} />
                      {[selectedStation.address, selectedStation.city].filter(Boolean).join(", ") || "Italia"}
                    </p>
                  </div>
                  {selectedStation.brand && (
                    <Badge variant="outline">{selectedStation.brand}</Badge>
                  )}
                </div>
              </SheetHeader>

              {/* Prices */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                {fuelTypes.map((ft) => {
                  const priceInfo = selectedStation.latestPrices[ft];
                  if (!priceInfo) return null;
                  return (
                    <Card key={ft} className="border-border/60">
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                            style={{ background: FUEL_COLORS[ft] }}
                          />
                          <span className="text-xs font-medium text-muted-foreground">{FUEL_LABELS[ft]}</span>
                        </div>
                        <p className="text-lg font-bold" data-testid={`price-${ft}`}>
                          {formatPrice(priceInfo.price)}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock size={10} />
                          {formatDate(priceInfo.reportedAt)}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Available fuels */}
              <div className="flex flex-wrap gap-2 mb-4">
                {selectedStation.hasBenzina && <Badge style={{ background: FUEL_COLORS.benzina, color: "white" }}>Benzina</Badge>}
                {selectedStation.hasGasolio && <Badge style={{ background: FUEL_COLORS.gasolio, color: "white" }}>Gasolio</Badge>}
                {selectedStation.hasGpl && <Badge style={{ background: FUEL_COLORS.gpl, color: "white" }}>GPL</Badge>}
                {selectedStation.hasElettrico && <Badge style={{ background: FUEL_COLORS.elettrico, color: "white" }}>Elettrico</Badge>}
              </div>

              {/* Submit price */}
              {user ? (
                <PriceSubmitDialog station={selectedStation}>
                  <Button className="w-full gap-2" variant="outline" data-testid="button-report-price">
                    <Plus size={15} />
                    Segnala Prezzo Aggiornato
                  </Button>
                </PriceSubmitDialog>
              ) : (
                <p className="text-sm text-center text-muted-foreground">
                  <a href="#/auth" className="text-primary hover:underline">Accedi</a> per segnalare i prezzi
                </p>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
