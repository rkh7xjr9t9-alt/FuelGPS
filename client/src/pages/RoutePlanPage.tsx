import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { fuelTypes, vehicleTypes, FUEL_DISPLAY, DEFAULT_CONSUMPTION } from "@shared/schema";
import type { RoutePlanResult, FuelType, VehicleType } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Navigation,
  MapPin,
  Fuel,
  Clock,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  ArrowRight,
  Gauge,
  CircleDollarSign,
} from "lucide-react";
import "leaflet/dist/leaflet.css";

const VEHICLE_CONFIG: Record<
  string,
  { label: string; icon: string; defaultConsumption: number }
> = {
  motorcycle: { label: "Moto", icon: "🏍️", defaultConsumption: 4 },
  car: { label: "Auto", icon: "🚗", defaultConsumption: 7 },
  van: { label: "Furgone", icon: "🚐", defaultConsumption: 11 },
  truck: { label: "Camion", icon: "🚛", defaultConsumption: 28 },
  bus: { label: "Autobus", icon: "🚌", defaultConsumption: 35 },
  ev: { label: "Elettrico", icon: "⚡", defaultConsumption: 18 },
};

const schema = z.object({
  origin: z.string().min(2, "Inserisci partenza"),
  destination: z.string().min(2, "Inserisci destinazione"),
  vehicleType: z.enum(vehicleTypes),
  fuelType: z.enum(fuelTypes),
  tankSizeLiters: z.coerce.number().positive().max(1000),
  currentFuelPercent: z.coerce.number().min(0).max(100),
  consumptionLper100km: z.coerce.number().positive().optional(),
  maxDetourKm: z.coerce.number().positive().max(50).optional(),
});

type FormData = z.infer<typeof schema>;

export default function RoutePlanPage() {
  const [result, setResult] = useState<RoutePlanResult | null>(null);
  const [removedStops, setRemovedStops] = useState<Set<string>>(new Set());
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      origin: "",
      destination: "",
      vehicleType: "car",
      fuelType: "benzina",
      tankSizeLiters: 50,
      currentFuelPercent: 80,
      maxDetourKm: 5,
    },
  });

  const fuelPercent = form.watch("currentFuelPercent");
  const tankSize = form.watch("tankSizeLiters");
  const vehicleType = form.watch("vehicleType");
  const currentLiters = ((fuelPercent / 100) * tankSize).toFixed(1);

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      apiRequest<RoutePlanResult>("POST", "/api/routes/calculate", data),
    onSuccess: (data) => {
      setResult(data);
      setRemovedStops(new Set());
    },
  });

  // Init result map
  useEffect(() => {
    if (!result || !mapContainerRef.current) return;

    import("leaflet").then((L) => {
      leafletRef.current = L;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(mapContainerRef.current!, {
        zoomControl: true,
      });

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://openstreetmap.org">OSM</a> &copy; <a href="https://carto.com">CARTO</a>',
          subdomains: "abcd",
        }
      ).addTo(map);

      // Route polyline
      const routeLayer = L.geoJSON(result.route.geometry, {
        style: {
          color: "hsl(183, 98%, 22%)",
          weight: 5,
          opacity: 0.8,
          lineCap: "round",
          lineJoin: "round",
        },
      }).addTo(map);

      // Fuel stop markers
      const visibleStops = result.stops.filter(
        (s) => !removedStops.has(s.station.id)
      );

      visibleStops.forEach((stop, i) => {
        const icon = L.divIcon({
          html: `<div style="background:#01696f;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,.25);font-family:'Satoshi','Inter',system-ui">${i + 1}</div>`,
          className: "",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        L.marker([stop.station.lat, stop.station.lon], { icon })
          .bindPopup(
            `<b>${stop.station.name}</b><br/>€${stop.estimatedCost.toFixed(2)} · +${stop.distanceFromRoute.toFixed(1)}km detour`
          )
          .addTo(map);
      });

      // Origin/destination markers
      const coords = result.route.geometry.coordinates;
      if (coords.length >= 2) {
        const originIcon = L.divIcon({
          html: `<div style="background:#22c55e;color:white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.25)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/></svg></div>`,
          className: "",
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        const destIcon = L.divIcon({
          html: `<div style="background:#ef4444;color:white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.25)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/></svg></div>`,
          className: "",
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        const first = coords[0] as [number, number];
        const last = coords[coords.length - 1] as [number, number];
        L.marker([first[1], first[0]], { icon: originIcon }).addTo(map);
        L.marker([last[1], last[0]], { icon: destIcon }).addTo(map);
      }

      map.fitBounds(routeLayer.getBounds(), { padding: [30, 30] });
      mapRef.current = map;
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [result, removedStops]);

  const toggleStop = (stationId: string) => {
    setRemovedStops((prev) => {
      const next = new Set(prev);
      if (next.has(stationId)) next.delete(stationId);
      else next.add(stationId);
      return next;
    });
  };

  const visibleStops =
    result?.stops.filter((s) => !removedStops.has(s.station.id)) ?? [];
  const recalcCost = visibleStops.reduce(
    (acc, s) => acc + s.estimatedCost,
    0
  );

  const formatDist = (m: number) =>
    m >= 1000 ? `${(m / 1000).toFixed(0)} km` : `${m.toFixed(0)} m`;
  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m} min`;
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden">
      {/* Form panel */}
      <div className="w-full lg:w-96 flex-shrink-0 overflow-y-auto border-b lg:border-b-0 lg:border-r border-border bg-card">
        <div className="p-4 space-y-5">
          <div>
            <h1 className="text-lg font-bold">Pianifica Percorso</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Trova le fermate ottimali per il rifornimento
            </p>
          </div>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((d) => mutation.mutate(d))}
              className="space-y-4"
            >
              {/* Origin & Destination */}
              <div className="space-y-3">
                <FormField
                  control={form.control}
                  name="origin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5 text-xs">
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                        Partenza
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="es. Torino"
                          data-testid="input-origin"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="destination"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5 text-xs">
                        <div className="h-2 w-2 rounded-full bg-red-500" />
                        Destinazione
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="es. Roma"
                          data-testid="input-destination"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Vehicle type selector */}
              <FormField
                control={form.control}
                name="vehicleType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Veicolo</FormLabel>
                    <div className="grid grid-cols-3 gap-1.5">
                      {Object.entries(VEHICLE_CONFIG).map(
                        ([value, config]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() =>
                              field.onChange(value as VehicleType)
                            }
                            className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border text-center transition-all text-xs ${
                              field.value === value
                                ? "border-primary bg-primary/10 text-primary shadow-sm"
                                : "border-border hover:border-primary/40"
                            }`}
                            data-testid={`vehicle-${value}`}
                          >
                            <span className="text-lg leading-none">
                              {config.icon}
                            </span>
                            <span className="font-medium">
                              {config.label}
                            </span>
                          </button>
                        )
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Fuel type */}
              <FormField
                control={form.control}
                name="fuelType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1 text-xs">
                      <Fuel size={12} /> Carburante
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-route-fuel">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {fuelTypes.map((ft) => (
                          <SelectItem key={ft} value={ft}>
                            {FUEL_DISPLAY[ft].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Tank & fuel level */}
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="tankSizeLiters"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Serbatoio (L)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={5}
                          max={1000}
                          {...field}
                          data-testid="input-tank-size"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maxDetourKm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Max detour (km)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={50}
                          {...field}
                          data-testid="input-max-detour"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="currentFuelPercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Gauge size={12} /> Livello attuale
                      </span>
                      <span className="text-primary font-semibold tabular-nums">
                        {fuelPercent}% ({currentLiters}L)
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Slider
                        min={5}
                        max={100}
                        step={5}
                        value={[field.value]}
                        onValueChange={([v]) => field.onChange(v)}
                        data-testid="slider-fuel-percent"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full gap-2"
                disabled={mutation.isPending}
                data-testid="button-plan-route"
              >
                <Navigation size={15} />
                {mutation.isPending ? "Calcolo..." : "Calcola Percorso"}
              </Button>

              {mutation.error && (
                <Alert variant="destructive">
                  <AlertCircle size={14} />
                  <AlertDescription>
                    {(mutation.error as Error).message}
                  </AlertDescription>
                </Alert>
              )}
            </form>
          </Form>
        </div>
      </div>

      {/* Results panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {result ? (
          <>
            {/* Route map */}
            <div
              ref={mapContainerRef}
              className="w-full flex-shrink-0"
              style={{ height: "40vh", minHeight: 220 }}
            />

            {/* Summary */}
            <div className="p-3 border-b border-border bg-card/50">
              <div className="grid grid-cols-3 gap-2">
                <Card className="border-border/60">
                  <CardContent className="p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wide">
                      Distanza
                    </p>
                    <p
                      className="font-bold text-sm tabular-nums"
                      data-testid="text-total-distance"
                    >
                      {formatDist(result.route.distance)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border/60">
                  <CardContent className="p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wide">
                      Tempo
                    </p>
                    <p className="font-bold text-sm tabular-nums">
                      {formatDuration(result.route.duration)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border/60">
                  <CardContent className="p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wide">
                      Costo stim.
                    </p>
                    <p
                      className="font-bold text-sm text-primary tabular-nums"
                      data-testid="text-estimated-cost"
                    >
                      €{recalcCost.toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Stops list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-xs flex items-center gap-1.5">
                  <Fuel size={13} className="text-primary" />
                  Fermate ({visibleStops.length}/{result.stops.length})
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => setRemovedStops(new Set())}
                  data-testid="button-reset-stops"
                >
                  <RotateCcw size={10} className="mr-1" /> Ripristina
                </Button>
              </div>

              {result.stops.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2
                    size={32}
                    className="mx-auto mb-2 text-green-500"
                  />
                  <p className="font-medium text-sm">
                    Nessuna fermata necessaria
                  </p>
                  <p className="text-xs mt-1">
                    Carburante sufficiente per l'intero percorso.
                  </p>
                </div>
              )}

              {result.stops.map((stop, i) => {
                const removed = removedStops.has(stop.station.id);
                return (
                  <Card
                    key={stop.station.id}
                    className={`border-border/60 transition-opacity cursor-pointer ${
                      removed ? "opacity-40" : ""
                    }`}
                    onClick={() => toggleStop(stop.station.id)}
                    data-testid={`stop-card-${i}`}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            removed
                              ? "bg-muted text-muted-foreground"
                              : "bg-primary text-primary-foreground"
                          }`}
                        >
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">
                            {stop.station.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {stop.station.municipality}
                            {stop.station.province
                              ? ` (${stop.station.province})`
                              : ""}
                          </p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <CircleDollarSign size={11} />
                              <span className="font-semibold text-foreground tabular-nums">
                                €{stop.estimatedCost.toFixed(2)}
                              </span>
                            </span>
                            <span className="text-xs text-muted-foreground">
                              +{stop.distanceFromRoute.toFixed(1)}km detour
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-xs">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Navigation size={28} className="text-primary" />
              </div>
              <h2 className="font-semibold text-sm mb-1">
                Pianifica il tuo viaggio
              </h2>
              <p className="text-xs text-muted-foreground">
                Inserisci partenza e destinazione per trovare le fermate
                ottimali e risparmiare sul carburante.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
